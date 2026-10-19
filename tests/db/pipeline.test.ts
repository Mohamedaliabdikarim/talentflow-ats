import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

/**
 * Pipeline behaviour under RLS: name search and job filter stay inside the tenant,
 * stage moves persist across requests, and cascades behave as documented.
 */

const ids = {
  userP: randomUUID(),
  userQ: randomUUID(),
  orgP: randomUUID(),
  orgQ: randomUUID(),
  jobP1: randomUUID(),
  jobP2: randomUUID(),
  jobQ: randomUUID(),
  adaP: randomUUID(),
  bobP: randomUUID(),
  adaQ: randomUUID(),
  appP1Ada: randomUUID(),
  appP2Ada: randomUUID(),
  appP1Bob: randomUUID(),
  appQAda: randomUUID(),
};

let pool: pg.Pool;

/** Runs as a user and COMMITS, so a later request can observe the change. */
async function asUserCommit<T>(
  userId: string,
  run: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await run(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("dbUrl") });
  await pool.query(
    `insert into auth.users (id, email) values ($1, 'p@example.test'), ($2, 'q@example.test')`,
    [ids.userP, ids.userQ],
  );
  await pool.query(
    `insert into public.organizations (id, name, slug) values ($1, 'Org P', 'org-p'), ($2, 'Org Q', 'org-q')`,
    [ids.orgP, ids.orgQ],
  );
  await pool.query(
    `insert into public.organization_memberships (organization_id, user_id, status)
     values ($1, $2, 'active'), ($3, $4, 'active')`,
    [ids.orgP, ids.userP, ids.orgQ, ids.userQ],
  );
  await pool.query(
    `insert into public.jobs (id, organization_id, title)
     values ($1, $4, 'Backend'), ($2, $4, 'Frontend'), ($3, $5, 'Q job')`,
    [ids.jobP1, ids.jobP2, ids.jobQ, ids.orgP, ids.orgQ],
  );
  await pool.query(
    `insert into public.candidates (id, organization_id, full_name)
     values ($1, $4, 'Ada Lovelace'), ($2, $4, 'Bob Builder'), ($3, $5, 'Ada Lovelace')`,
    [ids.adaP, ids.bobP, ids.adaQ, ids.orgP, ids.orgQ],
  );
  await pool.query(
    `insert into public.applications (id, organization_id, job_id, candidate_id)
     values ($1, $9, $5, $7), ($2, $9, $6, $7), ($3, $9, $5, $8), ($4, $10, $11, $12)`,
    [
      ids.appP1Ada,
      ids.appP2Ada,
      ids.appP1Bob,
      ids.appQAda,
      ids.jobP1,
      ids.jobP2,
      ids.adaP,
      ids.bobP,
      ids.orgP,
      ids.orgQ,
      ids.jobQ,
      ids.adaQ,
    ],
  );
});

afterAll(async () => {
  await pool.end();
});

describe("filters stay inside the tenant", () => {
  it("name search matches case-insensitively and never returns the other tenant's namesake", async () => {
    const rows = await asUserCommit(ids.userP, async (client) => {
      const { rows } = await client.query(
        `select id from public.candidates where full_name ilike $1 order by full_name`,
        ["%ada%"],
      );
      return rows;
    });
    expect(rows.map((row) => row.id)).toEqual([ids.adaP]);
  });

  it("job filter and name filter combine", async () => {
    const rows = await asUserCommit(ids.userP, async (client) => {
      const { rows } = await client.query(
        `select a.id from public.applications a
           join public.candidates c on c.id = a.candidate_id
          where a.job_id = $1 and c.full_name ilike $2`,
        [ids.jobP1, "%ada%"],
      );
      return rows;
    });
    expect(rows.map((row) => row.id)).toEqual([ids.appP1Ada]);
  });

  it("a member sees only their tenant's applications on the board", async () => {
    const rows = await asUserCommit(ids.userP, async (client) => {
      const { rows } = await client.query(`select id from public.applications order by created_at`);
      return rows;
    });
    expect(rows.map((row) => row.id).sort()).toEqual(
      [ids.appP1Ada, ids.appP2Ada, ids.appP1Bob].sort(),
    );
  });
});

describe("stage moves", () => {
  it("persist across requests and update stage_changed_at", async () => {
    const before = await pool.query(
      `select stage_changed_at from public.applications where id = $1`,
      [ids.appP1Bob],
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const updated = await asUserCommit(ids.userP, async (client) => {
      const { rowCount } = await client.query(
        `update public.applications set stage = 'interview' where id = $1`,
        [ids.appP1Bob],
      );
      return rowCount;
    });
    expect(updated).toBe(1);

    const after = await asUserCommit(ids.userP, async (client) => {
      const { rows } = await client.query(
        `select stage, stage_changed_at from public.applications where id = $1`,
        [ids.appP1Bob],
      );
      return rows[0];
    });
    expect(after.stage).toBe("interview");
    expect((after.stage_changed_at as Date).getTime()).toBeGreaterThan(
      (before.rows[0].stage_changed_at as Date).getTime(),
    );
  });

  it("cannot touch another tenant's application", async () => {
    const updated = await asUserCommit(ids.userP, async (client) => {
      const { rowCount } = await client.query(
        `update public.applications set stage = 'hired' where id = $1`,
        [ids.appQAda],
      );
      return rowCount;
    });
    expect(updated).toBe(0);
    const { rows } = await pool.query(`select stage from public.applications where id = $1`, [
      ids.appQAda,
    ]);
    expect(rows[0].stage).toBe("new");
  });
});

describe("cascades", () => {
  it("deleting a job removes its applications but keeps the candidates", async () => {
    await asUserCommit(ids.userP, async (client) => {
      await client.query(`delete from public.jobs where id = $1`, [ids.jobP2]);
    });
    const applications = await pool.query(`select id from public.applications where job_id = $1`, [
      ids.jobP2,
    ]);
    expect(applications.rows).toHaveLength(0);
    const candidate = await pool.query(`select id from public.candidates where id = $1`, [
      ids.adaP,
    ]);
    expect(candidate.rows).toHaveLength(1);
  });
});
