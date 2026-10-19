import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

/**
 * Row level security and tenant-invariant tests.
 *
 * The embedded database is seeded once as the superuser (which bypasses RLS). Each
 * scenario then runs inside a transaction that switches to the `authenticated` or
 * `anon` role and sets `request.jwt.claim.sub`, exactly as Supabase does per request,
 * and rolls back afterwards so scenarios stay independent.
 */

const RLS_OR_PRIVILEGE_ERROR = "42501";
const FOREIGN_KEY_ERROR = "23503";

const ids = {
  adminUser: randomUUID(),
  userA: randomUUID(),
  userB: randomUUID(),
  orgA: randomUUID(),
  orgB: randomUUID(),
  jobA: randomUUID(),
  jobB: randomUUID(),
  candidateA: randomUUID(),
  candidateB: randomUUID(),
};

let pool: pg.Pool;

type Scenario = (client: pg.PoolClient) => Promise<void>;

/** Runs `scenario` as the given Supabase user (null = anon) inside a rolled-back transaction. */
async function asUser(userId: string | null, scenario: Scenario): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${userId ? "authenticated" : "anon"}`);
    if (userId) {
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    }
    await scenario(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

async function expectSqlError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("dbUrl") });
  const client = await pool.connect();
  try {
    await client.query(
      `insert into auth.users (id, email) values ($1, 'admin@example.test'), ($2, 'a@example.test'), ($3, 'b@example.test')`,
      [ids.adminUser, ids.userA, ids.userB],
    );
    await client.query(`insert into public.platform_admins (user_id) values ($1)`, [ids.adminUser]);
    await client.query(
      `insert into public.organizations (id, name, slug) values ($1, 'Org A', 'org-a'), ($2, 'Org B', 'org-b')`,
      [ids.orgA, ids.orgB],
    );
    await client.query(
      `insert into public.organization_memberships (organization_id, user_id, status)
       values ($1, $2, 'active'), ($3, $4, 'active')`,
      [ids.orgA, ids.userA, ids.orgB, ids.userB],
    );
    await client.query(
      `insert into public.jobs (id, organization_id, title) values ($1, $2, 'Job A'), ($3, $4, 'Job B')`,
      [ids.jobA, ids.orgA, ids.jobB, ids.orgB],
    );
    await client.query(
      `insert into public.candidates (id, organization_id, full_name)
       values ($1, $2, 'Candidate A'), ($3, $4, 'Candidate B')`,
      [ids.candidateA, ids.orgA, ids.candidateB, ids.orgB],
    );
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await pool.end();
});

describe("profiles", () => {
  it("are created for every auth user by trigger", async () => {
    const { rows } = await pool.query(
      `select count(*)::int as count from public.profiles where id = any($1::uuid[])`,
      [[ids.adminUser, ids.userA, ids.userB]],
    );
    expect(rows[0].count).toBe(3);
  });

  it("a member sees themself but not a user from another tenant", async () => {
    await asUser(ids.userA, async (client) => {
      const { rows } = await pool.query("select 1"); // keep the pool warm; no-op
      expect(rows).toHaveLength(1);
      const visible = await client.query(`select id from public.profiles order by email`);
      const visibleIds = visible.rows.map((row) => row.id);
      expect(visibleIds).toContain(ids.userA);
      expect(visibleIds).not.toContain(ids.userB);
    });
  });
});

describe("tenant read isolation", () => {
  it("a member only reads their own organization", async () => {
    await asUser(ids.userA, async (client) => {
      const { rows } = await client.query(`select slug from public.organizations`);
      expect(rows.map((row) => row.slug)).toEqual(["org-a"]);
    });
  });

  it("a member only reads jobs and candidates of their organization", async () => {
    await asUser(ids.userA, async (client) => {
      const jobs = await client.query(`select title from public.jobs`);
      expect(jobs.rows.map((row) => row.title)).toEqual(["Job A"]);
      const candidates = await client.query(`select full_name from public.candidates`);
      expect(candidates.rows.map((row) => row.full_name)).toEqual(["Candidate A"]);
    });
  });

  it("a member cannot read a specific foreign job by id", async () => {
    await asUser(ids.userA, async (client) => {
      const { rows } = await client.query(`select id from public.jobs where id = $1`, [ids.jobB]);
      expect(rows).toHaveLength(0);
    });
  });

  it("anon has no access at all", async () => {
    await asUser(null, async (client) => {
      await expectSqlError(client.query(`select id from public.jobs`), RLS_OR_PRIVILEGE_ERROR);
    });
  });
});

describe("tenant write isolation", () => {
  it("a member can create a job in their own organization", async () => {
    await asUser(ids.userA, async (client) => {
      const { rows } = await client.query(
        `insert into public.jobs (organization_id, title) values ($1, 'New job') returning id`,
        [ids.orgA],
      );
      expect(rows).toHaveLength(1);
    });
  });

  it("a member cannot insert a job into another organization", async () => {
    await asUser(ids.userA, async (client) => {
      await expectSqlError(
        client.query(`insert into public.jobs (organization_id, title) values ($1, 'Intruder')`, [
          ids.orgB,
        ]),
        RLS_OR_PRIVILEGE_ERROR,
      );
    });
  });

  it("a member cannot update or delete another organization's job", async () => {
    await asUser(ids.userA, async (client) => {
      const update = await client.query(`update public.jobs set title = 'Hacked' where id = $1`, [
        ids.jobB,
      ]);
      expect(update.rowCount).toBe(0);
      const remove = await client.query(`delete from public.jobs where id = $1`, [ids.jobB]);
      expect(remove.rowCount).toBe(0);
    });
  });

  it("a member cannot create an organization", async () => {
    await asUser(ids.userA, async (client) => {
      await expectSqlError(
        client.query(`insert into public.organizations (name, slug) values ('Rogue', 'rogue')`),
        RLS_OR_PRIVILEGE_ERROR,
      );
    });
  });

  it("a member cannot grant themselves platform admin or read the admin list", async () => {
    await asUser(ids.userA, async (client) => {
      const list = await client.query(`select user_id from public.platform_admins`);
      expect(list.rows).toHaveLength(0);
      await expectSqlError(
        client.query(`insert into public.platform_admins (user_id) values ($1)`, [ids.userA]),
        RLS_OR_PRIVILEGE_ERROR,
      );
    });
  });
});

describe("cross-tenant links are impossible at the database level", () => {
  it("rejects an application that links a job and a candidate from different tenants", async () => {
    // Even the superuser (no RLS) is stopped by the composite foreign keys.
    await expectSqlError(
      pool.query(
        `insert into public.applications (organization_id, job_id, candidate_id) values ($1, $2, $3)`,
        [ids.orgA, ids.jobA, ids.candidateB],
      ),
      FOREIGN_KEY_ERROR,
    );
  });

  it("rejects moving a row to another organization", async () => {
    await expectSqlError(
      pool.query(`update public.jobs set organization_id = $1 where id = $2`, [ids.orgB, ids.jobA]),
      RLS_OR_PRIVILEGE_ERROR,
    );
  });

  it("a member cannot link their candidate to a foreign job", async () => {
    await asUser(ids.userA, async (client) => {
      await expectSqlError(
        client.query(
          `insert into public.applications (organization_id, job_id, candidate_id) values ($1, $2, $3)`,
          [ids.orgA, ids.jobB, ids.candidateA],
        ),
        FOREIGN_KEY_ERROR,
      );
    });
  });
});

describe("platform admin", () => {
  it("reads every organization and every job", async () => {
    await asUser(ids.adminUser, async (client) => {
      // Scoped to this file's seed rows: other test files share the database.
      const orgs = await client.query(
        `select slug from public.organizations where id = any($1::uuid[]) order by slug`,
        [[ids.orgA, ids.orgB]],
      );
      expect(orgs.rows.map((row) => row.slug)).toEqual(["org-a", "org-b"]);
      const jobs = await client.query(
        `select title from public.jobs where id = any($1::uuid[]) order by title`,
        [[ids.jobA, ids.jobB]],
      );
      expect(jobs.rows.map((row) => row.title)).toEqual(["Job A", "Job B"]);
    });
  });

  it("can create an organization and work inside any tenant", async () => {
    await asUser(ids.adminUser, async (client) => {
      const org = await client.query(
        `insert into public.organizations (name, slug) values ('Org C', 'org-c') returning id`,
      );
      expect(org.rows).toHaveLength(1);
      const job = await client.query(
        `insert into public.jobs (organization_id, title) values ($1, 'Admin-created job') returning id`,
        [ids.orgB],
      );
      expect(job.rows).toHaveLength(1);
    });
  });

  it("can read the admin list", async () => {
    await asUser(ids.adminUser, async (client) => {
      const { rows } = await client.query(`select user_id from public.platform_admins`);
      expect(rows.map((row) => row.user_id)).toContain(ids.adminUser);
    });
  });
});

describe("audit events", () => {
  it("record the actor from auth.uid(), never from the caller", async () => {
    await asUser(ids.userA, async (client) => {
      const logged = await client.query(
        `select public.log_audit_event('job.created', $1, 'job', $2, '{"source":"test"}'::jsonb) as id`,
        [ids.orgA, ids.jobA],
      );
      const auditId = logged.rows[0].id;
      // Members cannot read audit rows; verify as superuser inside the same transaction.
      await client.query("reset role");
      const { rows } = await client.query(
        `select actor_user_id, action from public.audit_events where id = $1`,
        [auditId],
      );
      expect(rows[0]).toEqual({ actor_user_id: ids.userA, action: "job.created" });
    });
  });

  it("cannot be written directly by members", async () => {
    await asUser(ids.userA, async (client) => {
      await expectSqlError(
        client.query(`insert into public.audit_events (action) values ('x.y')`),
        RLS_OR_PRIVILEGE_ERROR,
      );
    });
  });

  it("cannot be read by members", async () => {
    await asUser(ids.userA, async (client) => {
      const { rows } = await client.query(`select id from public.audit_events`);
      expect(rows).toHaveLength(0);
    });
  });
});

describe("application stage tracking", () => {
  it("updates stage_changed_at only when the stage changes", async () => {
    const inserted = await pool.query(
      `insert into public.applications (organization_id, job_id, candidate_id)
       values ($1, $2, $3) returning id, stage_changed_at`,
      [ids.orgA, ids.jobA, ids.candidateA],
    );
    const applicationId = inserted.rows[0].id;
    const initial = inserted.rows[0].stage_changed_at as Date;

    await new Promise((resolve) => setTimeout(resolve, 20));
    await pool.query(`update public.applications set created_by = null where id = $1`, [
      applicationId,
    ]);
    const unchanged = await pool.query(
      `select stage_changed_at from public.applications where id = $1`,
      [applicationId],
    );
    expect((unchanged.rows[0].stage_changed_at as Date).getTime()).toBe(initial.getTime());

    await pool.query(`update public.applications set stage = 'screening' where id = $1`, [
      applicationId,
    ]);
    const changed = await pool.query(
      `select stage, stage_changed_at from public.applications where id = $1`,
      [applicationId],
    );
    expect(changed.rows[0].stage).toBe("screening");
    expect((changed.rows[0].stage_changed_at as Date).getTime()).toBeGreaterThan(initial.getTime());
  });

  it("rejects a duplicate application for the same job and candidate", async () => {
    await expectSqlError(
      pool.query(
        `insert into public.applications (organization_id, job_id, candidate_id) values ($1, $2, $3)`,
        [ids.orgA, ids.jobA, ids.candidateA],
      ),
      "23505",
    );
  });
});
