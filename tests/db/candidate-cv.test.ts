import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

/**
 * Candidate CV metadata isolation and consent constraints (ADR-033), plus a local emulation
 * of the Storage object policy to prove its tenant-isolation logic without a hosted project.
 */

const CHECK_VIOLATION = "23514";
const RLS_OR_PRIVILEGE_ERROR = "42501";

const ids = {
  userP: randomUUID(),
  userQ: randomUUID(),
  orgP: randomUUID(),
  orgQ: randomUUID(),
  candP: randomUUID(),
  candQ: randomUUID(),
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

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("dbUrl") });
  await pool.query(
    `insert into auth.users (id, email) values ($1, 'pcv@example.test'), ($2, 'qcv@example.test')`,
    [ids.userP, ids.userQ],
  );
  await pool.query(
    `insert into public.organizations (id, name, slug) values ($1, 'P CV', 'p-cv'), ($2, 'Q CV', 'q-cv')`,
    [ids.orgP, ids.orgQ],
  );
  await pool.query(
    `insert into public.organization_memberships (organization_id, user_id, status)
     values ($1, $2, 'active'), ($3, $4, 'active')`,
    [ids.orgP, ids.userP, ids.orgQ, ids.userQ],
  );
  // Each tenant has a candidate with a CV (seeded as superuser, bypassing RLS).
  for (const [cand, org] of [
    [ids.candP, ids.orgP],
    [ids.candQ, ids.orgQ],
  ]) {
    await pool.query(
      `insert into public.candidates (id, organization_id, full_name, cv_object_key, cv_filename, cv_size_bytes, cv_uploaded_at, cv_source)
       values ($1, $2, 'Has CV', $3, 'cv.pdf', 1024, now(), 'candidate_provided_recruiter_upload')`,
      [cand, org, `${org}/${cand}/${randomUUID()}.pdf`],
    );
  }

  // Minimal Storage emulation: a storage.objects table + foldername() + the same policies as
  // supabase/storage/candidate-cvs.sql, to prove the policy authorizes on the first path segment.
  await pool.query(`create schema if not exists storage`);
  await pool.query(`create table storage.objects (
     id uuid primary key default gen_random_uuid(),
     bucket_id text not null,
     name text not null,
     owner uuid
   )`);
  await pool.query(
    `create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$`,
  );
  await pool.query(`alter table storage.objects enable row level security`);
  await pool.query(`grant usage on schema storage to authenticated`);
  await pool.query(`grant select, insert, update, delete on storage.objects to authenticated`);
  for (const [op, clause] of [
    ["select", "using"],
    ["delete", "using"],
  ] as const) {
    await pool.query(
      `create policy candidate_cvs_${op} on storage.objects for ${op} to authenticated
         ${clause} (bucket_id = 'candidate-cvs' and public.can_access_org((storage.foldername(name))[1]::uuid))`,
    );
  }
  await pool.query(
    `create policy candidate_cvs_insert on storage.objects for insert to authenticated
       with check (bucket_id = 'candidate-cvs' and public.can_access_org((storage.foldername(name))[1]::uuid))`,
  );
  // Seed one object per tenant (as superuser).
  await pool.query(
    `insert into storage.objects (bucket_id, name) values
       ('candidate-cvs', $1), ('candidate-cvs', $2)`,
    [`${ids.orgP}/${ids.candP}/a.pdf`, `${ids.orgQ}/${ids.candQ}/b.pdf`],
  );
});

afterAll(async () => {
  await pool.end();
});

describe("candidate CV metadata isolation (RLS)", () => {
  it("a member reads only their own tenant's candidate and CV metadata", async () => {
    const rows = await asUser(ids.userP, async (client) => {
      const { rows } = await client.query(
        `select organization_id, cv_object_key from public.candidates order by created_at`,
      );
      return rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].organization_id).toBe(ids.orgP);
    expect(rows[0].cv_object_key).toContain(ids.orgP);
  });

  it("a member cannot update another tenant's CV metadata", async () => {
    const updated = await asUser(ids.userP, async (client) => {
      const { rowCount } = await client.query(
        `update public.candidates set cv_filename = 'stolen.pdf' where id = $1`,
        [ids.candQ],
      );
      return rowCount;
    });
    expect(updated).toBe(0);
  });
});

describe("consent and metadata check constraints", () => {
  it("rejects AI authorization without a CV present", async () => {
    await expect(
      pool.query(
        `insert into public.candidates (organization_id, full_name, cv_ai_authorized, cv_ai_authorized_at)
         values ($1, 'No CV', true, now())`,
        [ids.orgP],
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it("rejects half-written CV metadata (key without filename)", async () => {
    await expect(
      pool.query(
        `insert into public.candidates (organization_id, full_name, cv_object_key)
         values ($1, 'Partial', 'k')`,
        [ids.orgP],
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it("rejects AI authorization with no recorded timestamp", async () => {
    await expect(
      pool.query(
        `insert into public.candidates (organization_id, full_name, cv_object_key, cv_filename, cv_size_bytes, cv_uploaded_at, cv_source, cv_ai_authorized)
         values ($1, 'Bad', 'k', 'cv.pdf', 10, now(), 'candidate_provided_recruiter_upload', true)`,
        [ids.orgP],
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });
});

describe("Storage object policy isolation (emulated)", () => {
  it("a member lists only their tenant's CV objects", async () => {
    const names = await asUser(ids.userP, async (client) => {
      const { rows } = await client.query(`select name from storage.objects order by name`);
      return rows.map((row) => row.name as string);
    });
    expect(names).toHaveLength(1);
    expect(names[0].startsWith(ids.orgP)).toBe(true);
  });

  it("a member can insert an object under their own tenant path", async () => {
    await asUser(ids.userP, async (client) => {
      await client.query(
        `insert into storage.objects (bucket_id, name) values ('candidate-cvs', $1)`,
        [`${ids.orgP}/${ids.candP}/new.pdf`],
      );
    });
  });

  it("a member cannot insert an object under another tenant's path", async () => {
    await expect(
      asUser(ids.userP, async (client) => {
        await client.query(
          `insert into storage.objects (bucket_id, name) values ('candidate-cvs', $1)`,
          [`${ids.orgQ}/${ids.candQ}/evil.pdf`],
        );
      }),
    ).rejects.toMatchObject({ code: RLS_OR_PRIVILEGE_ERROR });
  });

  it("a member cannot delete another tenant's object", async () => {
    const deleted = await asUser(ids.userP, async (client) => {
      const { rowCount } = await client.query(`delete from storage.objects where name = $1`, [
        `${ids.orgQ}/${ids.candQ}/b.pdf`,
      ]);
      return rowCount;
    });
    expect(deleted).toBe(0);
  });
});
