import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

/**
 * Database-level rehearsal of the first-admin bootstrap against the current schema
 * (migrations 0001-0004), in an isolated database. It reproduces exactly what the hosted
 * project will see: GoTrue inserts the auth user as `supabase_auth_admin` (the trigger fills
 * `profiles`), the script upserts `platform_admins` and writes the audit row as
 * `service_role`, and the new admin then acts as `authenticated`. Also covers the rollback
 * path (deleting the auth user cascades). T31 in docs/TEST_PLAN.md.
 */

const DB_NAME = "talentflow_bootstrap";
const PRIVILEGE_ERROR = "42501";

const adminId = randomUUID();
const otherId = randomUUID();

let admin: pg.Client;
let db: pg.Client;

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

/** Runs `fn` as the given database role inside one transaction (committed unless it throws). */
async function asRole<T>(role: string, fn: () => Promise<T>, userId?: string): Promise<T> {
  await db.query("begin");
  try {
    await db.query(`set local role ${role}`);
    if (userId) await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await fn();
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

beforeAll(async () => {
  const baseUrl = inject("dbUrl");
  admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  await admin.query(`drop database if exists ${DB_NAME}`);
  await admin.query(`create database ${DB_NAME}`);

  db = new pg.Client({ connectionString: withDatabase(baseUrl, DB_NAME) });
  await db.connect();

  const migrationsDir = path.resolve("supabase/migrations");
  await db.query(await readFile(path.resolve("scripts/db/local-auth-shim.sql"), "utf8"));
  for (const file of (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort()) {
    await db.query(await readFile(path.join(migrationsDir, file), "utf8"));
  }
});

afterAll(async () => {
  await db?.end();
  await admin.query(`drop database if exists ${DB_NAME}`);
  await admin.end();
});

describe("step 1: GoTrue creates the auth user (invitation) as supabase_auth_admin", () => {
  it("fills profiles with the email and the full_name from the invitation metadata", async () => {
    await asRole("supabase_auth_admin", async () => {
      await db.query(
        `insert into auth.users (id, email, raw_user_meta_data) values ($1, 'first.admin@example.test', '{"full_name":"Demo Admin"}'::jsonb)`,
        [adminId],
      );
    });
    const { rows } = await db.query(`select email, full_name from public.profiles where id = $1`, [
      adminId,
    ]);
    expect(rows).toEqual([{ email: "first.admin@example.test", full_name: "Demo Admin" }]);
  });
});

describe("step 2: the script writes platform_admins and the audit row as service_role", () => {
  it("upserts the admin row with granted_by null and keeps a single row on re-run", async () => {
    for (let i = 0; i < 2; i += 1) {
      await asRole("service_role", async () => {
        await db.query(
          `insert into public.platform_admins (user_id, note) values ($1, 'bootstrap script')
             on conflict (user_id) do update set note = excluded.note`,
          [adminId],
        );
      });
    }
    const { rows } = await db.query(
      `select user_id, granted_by, note from public.platform_admins where user_id = $1`,
      [adminId],
    );
    expect(rows).toEqual([{ user_id: adminId, granted_by: null, note: "bootstrap script" }]);
  });

  it("writes an admin.bootstrapped audit row whose metadata carries ids only", async () => {
    const id = await asRole("service_role", async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.audit_events (actor_user_id, action, target_type, target_id, metadata)
           values ($1::uuid, 'admin.bootstrapped', 'user', $1::text, $2::jsonb) returning id`,
        [
          adminId,
          JSON.stringify({
            source: "scripts/bootstrap-admin.ts",
            project_ref: "abcdefghijklmnopqrst",
            link_type: "invite",
          }),
        ],
      );
      return rows[0].id;
    });
    const { rows } = await db.query(
      `select actor_user_id, organization_id, action, target_type, target_id, metadata::text as metadata from public.audit_events where id = $1`,
      [id],
    );
    expect(rows[0]).toMatchObject({
      actor_user_id: adminId,
      organization_id: null,
      action: "admin.bootstrapped",
      target_type: "user",
      target_id: adminId,
    });
    expect(rows[0].metadata).not.toMatch(/example\.test|Demo Admin/);
  });
});

describe("step 3: the new admin signs in (authenticated with their JWT subject)", () => {
  it("is recognised by is_platform_admin(), sees their own profile and activates zero memberships", async () => {
    await asRole(
      "authenticated",
      async () => {
        const admin = await db.query(`select public.is_platform_admin() as ok`);
        expect(admin.rows[0].ok).toBe(true);
        const profile = await db.query(`select email from public.profiles where id = $1`, [
          adminId,
        ]);
        expect(profile.rows[0].email).toBe("first.admin@example.test");
        const activated = await db.query(`select public.activate_my_memberships() as n`);
        expect(activated.rows[0].n).toBe(0);
        const admins = await db.query(`select user_id from public.platform_admins`);
        expect(admins.rows.map((row) => row.user_id)).toEqual([adminId]);
      },
      adminId,
    );
  });

  it("another signed-in user is not an admin, cannot see or create platform_admins rows", async () => {
    await asRole("supabase_auth_admin", async () => {
      await db.query(`insert into auth.users (id, email) values ($1, 'other@example.test')`, [
        otherId,
      ]);
    });
    await asRole(
      "authenticated",
      async () => {
        const admin = await db.query(`select public.is_platform_admin() as ok`);
        expect(admin.rows[0].ok).toBe(false);
        const visible = await db.query(`select user_id from public.platform_admins`);
        expect(visible.rows).toEqual([]);
      },
      otherId,
    );
    await expect(
      asRole(
        "authenticated",
        async () => {
          await db.query(`insert into public.platform_admins (user_id) values ($1)`, [otherId]);
        },
        otherId,
      ),
    ).rejects.toMatchObject({ code: PRIVILEGE_ERROR });
  });
});

describe("step 4: later changes and rollback", () => {
  it("an email change in auth.users propagates to profiles and keeps the name", async () => {
    await asRole("supabase_auth_admin", async () => {
      await db.query(`update auth.users set email = 'renamed.admin@example.test' where id = $1`, [
        adminId,
      ]);
    });
    const { rows } = await db.query(`select email, full_name from public.profiles where id = $1`, [
      adminId,
    ]);
    expect(rows).toEqual([{ email: "renamed.admin@example.test", full_name: "Demo Admin" }]);
  });

  it("deleting the auth user (rollback) removes the profile and the admin row and keeps the audit row with a null actor", async () => {
    await asRole("supabase_auth_admin", async () => {
      await db.query(`delete from auth.users where id = $1`, [adminId]);
    });
    const profiles = await db.query(`select 1 from public.profiles where id = $1`, [adminId]);
    const admins = await db.query(`select 1 from public.platform_admins where user_id = $1`, [
      adminId,
    ]);
    const audit = await db.query(
      `select actor_user_id, target_id from public.audit_events where action = 'admin.bootstrapped' and target_id = $1`,
      [adminId],
    );
    expect(profiles.rows).toEqual([]);
    expect(admins.rows).toEqual([]);
    expect(audit.rows).toEqual([{ actor_user_id: null, target_id: adminId }]);
  });
});
