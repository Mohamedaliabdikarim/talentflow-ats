import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

/**
 * Candidate Insights lifecycle in the database (migrations 0006/0007, ADR-035/036/037):
 * tenant isolation through RLS and composite foreign keys, the one-active-run index, the
 * atomic claim, the status-guarded completion, revocation, cascade on application delete, and
 * the privileges the service-role runner relies on. Scoped to this file's own seed ids.
 */

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const RLS_OR_PRIVILEGE_ERROR = "42501";

const ids = {
  userP: randomUUID(),
  userQ: randomUUID(),
  orgP: randomUUID(),
  orgQ: randomUUID(),
  jobP: randomUUID(),
  jobQ: randomUUID(),
  candP: randomUUID(),
  candQ: randomUUID(),
  appP: randomUUID(),
  appQ: randomUUID(),
};

let pool: pg.Pool;

async function asRole<T>(
  role: "authenticated" | "service_role",
  userId: string | null,
  run: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    if (userId)
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return await run(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

const asUser = <T>(userId: string, run: (client: pg.PoolClient) => Promise<T>) =>
  asRole("authenticated", userId, run);
const asService = <T>(run: (client: pg.PoolClient) => Promise<T>) =>
  asRole("service_role", null, run);

/** Runs a statement expected to fail inside a savepoint so the surrounding transaction survives. */
async function expectError(client: pg.PoolClient, sql: string, params: unknown[], code: string) {
  await client.query("savepoint expect_error");
  try {
    await client.query(sql, params);
    expect.unreachable(`expected error ${code}`);
  } catch (error) {
    expect(error).toMatchObject({ code });
  } finally {
    await client.query("rollback to savepoint expect_error");
  }
}

const INSERT_INSIGHT = `insert into public.candidate_ai_insights
  (organization_id, candidate_id, job_id, application_id, analysis_type, status, cv_consent_at)
  values ($1, $2, $3, $4, 'job_match', 'pending', now()) returning id`;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("dbUrl") });
  await pool.query(
    `insert into auth.users (id, email) values ($1, 'p-ins@example.test'), ($2, 'q-ins@example.test')`,
    [ids.userP, ids.userQ],
  );
  await pool.query(
    `insert into public.organizations (id, name, slug) values ($1, 'P Insights', 'p-ins'), ($2, 'Q Insights', 'q-ins')`,
    [ids.orgP, ids.orgQ],
  );
  await pool.query(
    `insert into public.organization_memberships (organization_id, user_id, status)
     values ($1, $2, 'active'), ($3, $4, 'active')`,
    [ids.orgP, ids.userP, ids.orgQ, ids.userQ],
  );
  for (const [org, job, cand, app, user] of [
    [ids.orgP, ids.jobP, ids.candP, ids.appP, ids.userP],
    [ids.orgQ, ids.jobQ, ids.candQ, ids.appQ, ids.userQ],
  ]) {
    await pool.query(
      `insert into public.jobs (id, organization_id, title, description) values ($1, $2, 'Fullstack Developer', 'TypeScript and Azure.')`,
      [job, org],
    );
    await pool.query(
      `insert into public.candidates (id, organization_id, full_name, cv_object_key, cv_filename, cv_size_bytes,
         cv_uploaded_at, cv_source, cv_ai_authorized, cv_ai_authorized_at, cv_ai_authorized_by, cv_ai_authorization_basis)
       values ($1, $2, 'Authorized Candidate', $3, 'cv.pdf', 2048, now(), 'candidate_provided_recruiter_upload',
         true, now(), $4, 'Written consent on file')`,
      [cand, org, `${org}/${cand}/${randomUUID()}.pdf`, user],
    );
    await pool.query(
      `insert into public.applications (id, organization_id, job_id, candidate_id) values ($1, $2, $3, $4)`,
      [app, org, job, cand],
    );
  }
});

afterAll(async () => {
  // Cascades remove jobs, candidates, applications and insights; users go with their profiles.
  await pool.query(`delete from public.organizations where id = any($1::uuid[])`, [
    [ids.orgP, ids.orgQ],
  ]);
  await pool.query(`delete from auth.users where id = any($1::uuid[])`, [[ids.userP, ids.userQ]]);
  await pool.end();
});

describe("schema (migrations 0006 + 0007)", () => {
  it("adds the lifecycle values to insight_status", async () => {
    const { rows } = await pool.query(
      `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
       where t.typname = 'insight_status' order by e.enumsortorder`,
    );
    const labels = rows.map((row) => row.enumlabel);
    for (const value of ["pending", "analyzing", "ready", "failed", "revoked", "superseded"]) {
      expect(labels).toContain(value);
    }
  });

  it("adds the lifecycle columns, the tenant-safe application key and the one-active-run index", async () => {
    const { rows: columns } = await pool.query(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'candidate_ai_insights'`,
    );
    const names = columns.map((row) => row.column_name);
    for (const column of [
      "application_id",
      "analysis_type",
      "input_hash",
      "cv_consent_at",
      "started_at",
      "attempt_count",
      "contract_version",
    ]) {
      expect(names).toContain(column);
    }
    const { rows: constraints } = await pool.query(
      `select conname from pg_constraint where conname in
         ('applications_id_organization_unique', 'candidate_ai_insights_application_same_tenant',
          'candidate_ai_insights_analysis_type_check')`,
    );
    expect(constraints).toHaveLength(3);
    const { rows: indexes } = await pool.query(
      `select indexdef from pg_indexes where indexname = 'candidate_ai_insights_one_active_per_application'`,
    );
    expect(indexes).toHaveLength(1);
    expect(indexes[0].indexdef).toMatch(/UNIQUE/);
    expect(indexes[0].indexdef).toMatch(/pending.*analyzing|analyzing.*pending/);
  });
});

describe("tenant isolation", () => {
  it("a member can queue an insight for their own application", async () => {
    const count = await asUser(ids.userP, async (client) => {
      await client.query(INSERT_INSIGHT, [ids.orgP, ids.candP, ids.jobP, ids.appP]);
      const { rows } = await client.query(
        `select count(*)::int as n from public.candidate_ai_insights where application_id = $1`,
        [ids.appP],
      );
      return rows[0].n as number;
    });
    expect(count).toBe(1);
  });

  it("the composite key refuses an insight that points at another tenant's application", async () => {
    await asUser(ids.userP, async (client) => {
      await expectError(
        client,
        INSERT_INSIGHT,
        [ids.orgP, ids.candP, ids.jobP, ids.appQ],
        FOREIGN_KEY_VIOLATION,
      );
    });
  });

  it("RLS refuses writing a row into another tenant", async () => {
    await asUser(ids.userP, async (client) => {
      await expectError(
        client,
        INSERT_INSIGHT,
        [ids.orgQ, ids.candQ, ids.jobQ, ids.appQ],
        RLS_OR_PRIVILEGE_ERROR,
      );
    });
  });

  it("a member cannot read or revoke another tenant's insights", async () => {
    const { rows: seeded } = await pool.query(
      `insert into public.candidate_ai_insights (organization_id, candidate_id, job_id, application_id, status, result, summary)
       values ($1, $2, $3, $4, 'ready', '{"schema_version":"job-match-v1"}'::jsonb, 'Q summary') returning id`,
      [ids.orgQ, ids.candQ, ids.jobQ, ids.appQ],
    );
    try {
      const { visible, revoked } = await asUser(ids.userP, async (client) => {
        const { rows } = await client.query(
          `select organization_id from public.candidate_ai_insights where id = $1`,
          [seeded[0].id],
        );
        const { rowCount } = await client.query(
          `update public.candidate_ai_insights set status = 'revoked', result = null where id = $1`,
          [seeded[0].id],
        );
        return { visible: rows.length, revoked: rowCount };
      });
      expect(visible).toBe(0);
      expect(revoked).toBe(0);
      const { rows } = await pool.query(
        `select status, summary from public.candidate_ai_insights where id = $1`,
        [seeded[0].id],
      );
      expect(rows[0]).toEqual({ status: "ready", summary: "Q summary" });
    } finally {
      await pool.query(`delete from public.candidate_ai_insights where id = $1`, [seeded[0].id]);
    }
  });
});

describe("lifecycle invariants", () => {
  it("allows one active run per application and a new run once the previous one is terminal", async () => {
    await asUser(ids.userP, async (client) => {
      const { rows } = await client.query(INSERT_INSIGHT, [
        ids.orgP,
        ids.candP,
        ids.jobP,
        ids.appP,
      ]);
      await expectError(
        client,
        INSERT_INSIGHT,
        [ids.orgP, ids.candP, ids.jobP, ids.appP],
        UNIQUE_VIOLATION,
      );
      await client.query(
        `update public.candidate_ai_insights set status = 'analyzing' where id = $1`,
        [rows[0].id],
      );
      await expectError(
        client,
        INSERT_INSIGHT,
        [ids.orgP, ids.candP, ids.jobP, ids.appP],
        UNIQUE_VIOLATION,
      );
      await client.query(
        `update public.candidate_ai_insights set status = 'failed' where id = $1`,
        [rows[0].id],
      );
      const { rowCount } = await client.query(INSERT_INSIGHT, [
        ids.orgP,
        ids.candP,
        ids.jobP,
        ids.appP,
      ]);
      expect(rowCount).toBe(1);
    });
  });

  it("claims atomically: only the first conditional update wins", async () => {
    await asUser(ids.userP, async (client) => {
      const { rows } = await client.query(INSERT_INSIGHT, [
        ids.orgP,
        ids.candP,
        ids.jobP,
        ids.appP,
      ]);
      const claim = `update public.candidate_ai_insights
        set status = 'analyzing', started_at = now(), attempt_count = attempt_count + 1
        where id = $1 and organization_id = $2 and status = 'pending'`;
      const first = await client.query(claim, [rows[0].id, ids.orgP]);
      const second = await client.query(claim, [rows[0].id, ids.orgP]);
      expect(first.rowCount).toBe(1);
      expect(second.rowCount).toBe(0);
      const { rows: after } = await client.query(
        `select status, attempt_count from public.candidate_ai_insights where id = $1`,
        [rows[0].id],
      );
      expect(after[0]).toEqual({ status: "analyzing", attempt_count: 1 });
    });
  });

  it("a status-guarded completion affects zero rows once the run was revoked (no stale overwrite)", async () => {
    await asUser(ids.userP, async (client) => {
      const { rows } = await client.query(INSERT_INSIGHT, [
        ids.orgP,
        ids.candP,
        ids.jobP,
        ids.appP,
      ]);
      await client.query(
        `update public.candidate_ai_insights set status = 'analyzing' where id = $1`,
        [rows[0].id],
      );
      // Revocation lands while the model is running.
      await client.query(
        `update public.candidate_ai_insights set status = 'revoked', result = null, summary = null where id = $1`,
        [rows[0].id],
      );
      const { rowCount } = await client.query(
        `update public.candidate_ai_insights set status = 'ready', result = '{"late":true}'::jsonb
         where id = $1 and organization_id = $2 and status = 'analyzing'`,
        [rows[0].id, ids.orgP],
      );
      expect(rowCount).toBe(0);
      const { rows: final } = await client.query(
        `select status, result from public.candidate_ai_insights where id = $1`,
        [rows[0].id],
      );
      expect(final[0]).toEqual({ status: "revoked", result: null });
    });
  });

  it("revocation clears derived content for all of the candidate's non-revoked rows", async () => {
    await asUser(ids.userP, async (client) => {
      const { rows } = await client.query(INSERT_INSIGHT, [
        ids.orgP,
        ids.candP,
        ids.jobP,
        ids.appP,
      ]);
      await client.query(
        `update public.candidate_ai_insights set status = 'ready', result = '{"x":1}'::jsonb, summary = 's' where id = $1`,
        [rows[0].id],
      );
      const { rowCount } = await client.query(
        `update public.candidate_ai_insights
         set status = 'revoked', result = null, summary = null, error_message = 'revoked'
         where candidate_id = $1 and organization_id = $2 and status <> 'revoked'`,
        [ids.candP, ids.orgP],
      );
      expect(rowCount).toBe(1);
      const { rows: final } = await client.query(
        `select status, result, summary from public.candidate_ai_insights where id = $1`,
        [rows[0].id],
      );
      expect(final[0]).toEqual({ status: "revoked", result: null, summary: null });
    });
  });

  it("deleting the application removes its insights", async () => {
    const jobId = randomUUID();
    const appId = randomUUID();
    await pool.query(
      `insert into public.jobs (id, organization_id, title) values ($1, $2, 'Temporary role')`,
      [jobId, ids.orgP],
    );
    await pool.query(
      `insert into public.applications (id, organization_id, job_id, candidate_id) values ($1, $2, $3, $4)`,
      [appId, ids.orgP, jobId, ids.candP],
    );
    await pool.query(INSERT_INSIGHT, [ids.orgP, ids.candP, jobId, appId]);
    await pool.query(`delete from public.applications where id = $1`, [appId]);
    const { rows } = await pool.query(
      `select count(*)::int as n from public.candidate_ai_insights where application_id = $1`,
      [appId],
    );
    expect(rows[0].n).toBe(0);
    await pool.query(`delete from public.jobs where id = $1`, [jobId]);
  });
});

describe("runner privileges (service_role, no user session)", () => {
  it("service_role can claim and complete rows and record an audit event without an actor", async () => {
    const { rows: seeded } = await pool.query(INSERT_INSIGHT, [
      ids.orgP,
      ids.candP,
      ids.jobP,
      ids.appP,
    ]);
    try {
      await asService(async (client) => {
        const claim = await client.query(
          `update public.candidate_ai_insights set status = 'analyzing', started_at = now(), attempt_count = attempt_count + 1
           where id = $1 and organization_id = $2 and status = 'pending'`,
          [seeded[0].id, ids.orgP],
        );
        expect(claim.rowCount).toBe(1);
        const done = await client.query(
          `update public.candidate_ai_insights set status = 'ready', result = '{"schema_version":"job-match-v1"}'::jsonb,
             summary = 'ok', model_version = 'gpt-5-mini', contract_version = 'job-match-v1', generated_at = now()
           where id = $1 and organization_id = $2 and status = 'analyzing'`,
          [seeded[0].id, ids.orgP],
        );
        expect(done.rowCount).toBe(1);
        const audit = await client.query(
          `insert into public.audit_events (actor_user_id, organization_id, action, target_type, target_id, metadata)
           values (null, $1, 'candidate.ai_insight_ready', 'candidate_ai_insight', $2, '{"candidate_id": "x"}'::jsonb)
           returning id`,
          [ids.orgP, seeded[0].id],
        );
        expect(audit.rowCount).toBe(1);
      });
    } finally {
      await pool.query(`delete from public.candidate_ai_insights where id = $1`, [seeded[0].id]);
    }
  });

  it("authenticated users cannot insert audit events directly (only through log_audit_event)", async () => {
    await asUser(ids.userP, async (client) => {
      await expectError(
        client,
        `insert into public.audit_events (actor_user_id, organization_id, action) values ($1, $2, 'candidate.ai_insight_ready')`,
        [ids.userP, ids.orgP],
        RLS_OR_PRIVILEGE_ERROR,
      );
    });
  });
});
