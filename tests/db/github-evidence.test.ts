import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

/**
 * GitHub evidence in the database (migration 0008, ADR-038): the separate authorization and its
 * constraints, evidence provenance columns and their checks, GitHub-only invalidation scoped by
 * evidence_sources and tenant, and the stale-result guard with planned sources. Scoped to this
 * file's own seed ids.
 */

const CHECK_VIOLATION = "23514";

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

async function asUser<T>(userId: string, run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return await run(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

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
  (organization_id, candidate_id, job_id, application_id, analysis_type, status, evidence_sources, result, summary)
  values ($1, $2, $3, $4, 'job_match', $5, $6, $7, $8) returning id`;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("dbUrl") });
  await pool.query(
    `insert into auth.users (id, email) values ($1, 'p-gh@example.test'), ($2, 'q-gh@example.test')`,
    [ids.userP, ids.userQ],
  );
  await pool.query(
    `insert into public.organizations (id, name, slug) values ($1, 'P GitHub', 'p-gh'), ($2, 'Q GitHub', 'q-gh')`,
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
      `insert into public.jobs (id, organization_id, title, description) values ($1, $2, 'Backend Developer', 'Go and PostgreSQL.')`,
      [job, org],
    );
    await pool.query(
      `insert into public.candidates (id, organization_id, full_name, github_url, cv_object_key, cv_filename, cv_size_bytes,
         cv_uploaded_at, cv_source, cv_ai_authorized, cv_ai_authorized_at, cv_ai_authorized_by, cv_ai_authorization_basis,
         github_ai_authorized, github_ai_authorized_at, github_ai_authorized_by, github_ai_authorization_basis)
       values ($1, $2, 'GitHub Candidate', 'https://github.com/octocat', $3, 'cv.pdf', 2048, now(),
         'candidate_provided_recruiter_upload', true, now(), $4, 'Written consent',
         true, now(), $4, 'Candidate listed the profile and agreed')`,
      [cand, org, `${org}/${cand}/${randomUUID()}.pdf`, user],
    );
    await pool.query(
      `insert into public.applications (id, organization_id, job_id, candidate_id) values ($1, $2, $3, $4)`,
      [app, org, job, cand],
    );
  }
});

afterAll(async () => {
  await pool.query(`delete from public.organizations where id = any($1::uuid[])`, [
    [ids.orgP, ids.orgQ],
  ]);
  await pool.query(`delete from auth.users where id = any($1::uuid[])`, [[ids.userP, ids.userQ]]);
  await pool.end();
});

describe("schema (migration 0008)", () => {
  it("adds the GitHub authorization and evidence-provenance columns, checks and index", async () => {
    const { rows: columns } = await pool.query(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' and column_name in
         ('github_ai_authorized','github_ai_authorized_at','github_ai_authorized_by','github_ai_authorization_basis',
          'evidence_sources','github_login','github_status','github_fetched_at')`,
    );
    expect(columns).toHaveLength(8);
    const { rows: constraints } = await pool.query(
      `select conname from pg_constraint where conname in
         ('candidates_github_ai_requires_url','candidates_github_ai_authorization_consistent','candidates_github_ai_basis_length',
          'candidate_ai_insights_evidence_sources_allowed','candidate_ai_insights_github_status_allowed','candidate_ai_insights_github_login_length')`,
    );
    expect(constraints).toHaveLength(6);
    const { rows: indexes } = await pool.query(
      `select 1 from pg_indexes where indexname = 'candidate_ai_insights_github_evidence_idx'`,
    );
    expect(indexes).toHaveLength(1);
  });
});

describe("GitHub authorization constraints", () => {
  it("cannot be authorized without a profile URL", async () => {
    await asUser(ids.userP, async (client) => {
      await expectError(
        client,
        `insert into public.candidates (organization_id, full_name, github_ai_authorized, github_ai_authorized_at)
         values ($1, 'No URL', true, now())`,
        [ids.orgP],
        CHECK_VIOLATION,
      );
    });
  });

  it("removing the URL while authorized is refused unless the authorization is reset", async () => {
    await asUser(ids.userP, async (client) => {
      await expectError(
        client,
        `update public.candidates set github_url = null where id = $1`,
        [ids.candP],
        CHECK_VIOLATION,
      );
      const { rowCount } = await client.query(
        `update public.candidates
         set github_url = null, github_ai_authorized = false, github_ai_authorized_at = null,
             github_ai_authorized_by = null, github_ai_authorization_basis = null
         where id = $1`,
        [ids.candP],
      );
      expect(rowCount).toBe(1);
    });
  });

  it("keeps who/when/basis consistent with the flag", async () => {
    await asUser(ids.userP, async (client) => {
      await expectError(
        client,
        `update public.candidates set github_ai_authorized = false where id = $1`,
        [ids.candP],
        CHECK_VIOLATION,
      );
    });
  });
});

describe("evidence provenance columns", () => {
  it("accepts only cv/github sources and known GitHub statuses", async () => {
    await asUser(ids.userP, async (client) => {
      await expectError(
        client,
        INSERT_INSIGHT,
        [ids.orgP, ids.candP, ids.jobP, ids.appP, "pending", ["cv", "linkedin"], null, null],
        CHECK_VIOLATION,
      );
      await expectError(
        client,
        `insert into public.candidate_ai_insights (organization_id, candidate_id, job_id, application_id, github_status)
         values ($1, $2, $3, $4, 'guessed')`,
        [ids.orgP, ids.candP, ids.jobP, ids.appP],
        CHECK_VIOLATION,
      );
      const { rowCount } = await client.query(INSERT_INSIGHT, [
        ids.orgP,
        ids.candP,
        ids.jobP,
        ids.appP,
        "pending",
        ["cv", "github"],
        null,
        null,
      ]);
      expect(rowCount).toBe(1);
    });
  });
});

describe("GitHub-only invalidation", () => {
  it("clears only GitHub-sourced insights of the candidate, in the caller's tenant only", async () => {
    // Seed as superuser: P has a CV-only ready row and a GitHub-sourced ready row; Q has a
    // GitHub-sourced ready row. (Distinct applications are not needed: ready rows are not covered
    // by the one-active-run index.)
    const seeded = await pool.query(
      `insert into public.candidate_ai_insights (organization_id, candidate_id, job_id, application_id, status, evidence_sources, result, summary)
       values
         ($1, $2, $3, $4, 'ready', '{cv}', '{"v":1}'::jsonb, 'cv only'),
         ($1, $2, $3, $4, 'ready', '{cv,github}', '{"v":2}'::jsonb, 'with github'),
         ($5, $6, $7, $8, 'ready', '{cv,github}', '{"v":3}'::jsonb, 'q with github')
       returning id, summary`,
      [ids.orgP, ids.candP, ids.jobP, ids.appP, ids.orgQ, ids.candQ, ids.jobQ, ids.appQ],
    );
    try {
      const affected = await asUser(ids.userP, async (client) => {
        const { rowCount } = await client.query(
          `update public.candidate_ai_insights
           set status = 'revoked', result = null, summary = null, error_message = 'github revoked'
           where candidate_id = $1 and organization_id = $2 and status <> 'revoked'
             and evidence_sources @> '{github}'`,
          [ids.candP, ids.orgP],
        );
        const { rows } = await client.query(
          `select summary, status from public.candidate_ai_insights where candidate_id = $1 order by created_at`,
          [ids.candP],
        );
        return { rowCount, rows };
      });
      expect(affected.rowCount).toBe(1);
      expect(affected.rows).toEqual([
        { summary: "cv only", status: "ready" },
        { summary: null, status: "revoked" },
      ]);
      // Q's row is untouched (and invisible to P anyway).
      const { rows } = await pool.query(
        `select status, summary from public.candidate_ai_insights where organization_id = $1`,
        [ids.orgQ],
      );
      expect(rows).toEqual([{ status: "ready", summary: "q with github" }]);
    } finally {
      await pool.query(`delete from public.candidate_ai_insights where id = any($1::uuid[])`, [
        seeded.rows.map((row) => row.id),
      ]);
    }
  });

  it("catches a run in flight whose planned sources include github (guarded completion then writes nothing)", async () => {
    await asUser(ids.userP, async (client) => {
      const { rows } = await client.query(INSERT_INSIGHT, [
        ids.orgP,
        ids.candP,
        ids.jobP,
        ids.appP,
        "analyzing",
        ["cv", "github"],
        null,
        null,
      ]);
      const revoke = await client.query(
        `update public.candidate_ai_insights set status = 'revoked', result = null, summary = null
         where candidate_id = $1 and organization_id = $2 and status <> 'revoked' and evidence_sources @> '{github}'`,
        [ids.candP, ids.orgP],
      );
      expect(revoke.rowCount).toBe(1);
      const complete = await client.query(
        `update public.candidate_ai_insights set status = 'ready', result = '{"late":true}'::jsonb
         where id = $1 and organization_id = $2 and status = 'analyzing'`,
        [rows[0].id, ids.orgP],
      );
      expect(complete.rowCount).toBe(0);
    });
  });
});
