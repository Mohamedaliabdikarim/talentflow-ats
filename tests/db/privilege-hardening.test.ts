import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

/**
 * Validates the PROPOSED migration supabase/proposed/20261019140000_privilege_hardening.sql
 * in an isolated database that first reproduces the hosted starting state: Supabase's
 * default privileges (ALL on public tables, functions and sequences for anon, authenticated
 * and service_role) in force while the migrations run, which left `authenticated` with
 * TRUNCATE, REFERENCES and TRIGGER on the hosted project on 2026-10-19.
 */

const DB_NAME = "talentflow_hardening";
const PRIVS = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];

let admin: pg.Client;
let db: pg.Client;

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

async function privilegesFor(role: string): Promise<Record<string, string[]>> {
  const { rows } = await db.query<{ table: string; privilege: string; held: boolean }>(
    `select t.relname as "table", p as privilege, has_table_privilege($1, t.oid, p) as held
       from pg_class t join pg_namespace n on n.oid = t.relnamespace, unnest($2::text[]) p
      where n.nspname = 'public' and t.relkind = 'r'
      order by 1, 2`,
    [role, PRIVS],
  );
  const result: Record<string, string[]> = {};
  for (const row of rows) {
    result[row.table] ??= [];
    if (row.held) result[row.table].push(row.privilege);
  }
  return result;
}

async function canExecute(role: string, fn: string): Promise<boolean> {
  const { rows } = await db.query(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [
    role,
    fn,
  ]);
  return rows[0].ok;
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
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  await db.query(await readFile(path.resolve("scripts/db/local-auth-shim.sql"), "utf8"));
  // Hosted starting state. Supabase projects define default privileges for the migration
  // role in schema public, so every table and function created by migration 0001 received
  // ALL privileges for anon, authenticated and service_role before migration 0002 revoked
  // what it knew about. Emulated here before the migrations run, as on the hosted project.
  for (const kind of ["tables", "functions", "sequences"]) {
    await db.query(
      `alter default privileges in schema public grant all on ${kind} to anon, authenticated, service_role`,
    );
  }
  for (const file of files) {
    await db.query(await readFile(path.join(migrationsDir, file), "utf8"));
  }
});

afterAll(async () => {
  await db?.end();
  await admin.query(`drop database if exists ${DB_NAME}`);
  await admin.end();
});

describe("state after migrations 0001-0003 on a Supabase-like project", () => {
  it("reproduces the hosted finding: authenticated still holds TRUNCATE, REFERENCES and TRIGGER", async () => {
    const authenticated = await privilegesFor("authenticated");
    expect(authenticated.jobs).toEqual(
      expect.arrayContaining(["TRUNCATE", "REFERENCES", "TRIGGER"]),
    );
    expect(authenticated.platform_admins).toEqual(["REFERENCES", "SELECT", "TRIGGER", "TRUNCATE"]);
    const anon = await privilegesFor("anon");
    expect(Object.values(anon).every((privs) => privs.length === 0)).toBe(true);
    expect(await canExecute("anon", "public.sync_profile_from_auth_user()")).toBe(true);
  });
});

describe("proposed migration 0004", () => {
  beforeAll(async () => {
    await db.query(
      await readFile(
        path.resolve("supabase/proposed/20261019140000_privilege_hardening.sql"),
        "utf8",
      ),
    );
  });

  it("leaves authenticated with only the intended DML privileges", async () => {
    const authenticated = await privilegesFor("authenticated");
    expect(authenticated.jobs).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
    expect(authenticated.applications).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
    expect(authenticated.platform_admins).toEqual(["SELECT"]);
    expect(authenticated.audit_events).toEqual(["SELECT"]);
    expect(authenticated.profiles).toEqual(["SELECT", "UPDATE"]);
    for (const privs of Object.values(authenticated)) {
      expect(privs).not.toEqual(expect.arrayContaining(["TRUNCATE"]));
    }
    const anon = await privilegesFor("anon");
    expect(Object.values(anon).every((privs) => privs.length === 0)).toBe(true);
  });

  it("keeps service_role unchanged (it bypasses RLS and is server-only)", async () => {
    const service = await privilegesFor("service_role");
    expect(service.jobs).toEqual(expect.arrayContaining(["SELECT", "INSERT", "UPDATE", "DELETE"]));
  });

  it("restricts the profile-sync trigger function to the Auth service role and keeps it working", async () => {
    expect(await canExecute("anon", "public.sync_profile_from_auth_user()")).toBe(false);
    expect(await canExecute("authenticated", "public.sync_profile_from_auth_user()")).toBe(false);
    expect(await canExecute("supabase_auth_admin", "public.sync_profile_from_auth_user()")).toBe(
      true,
    );

    const userId = randomUUID();
    await db.query("begin");
    try {
      await db.query("set local role supabase_auth_admin");
      await db.query(`insert into auth.users (id, email) values ($1, 'hardened@example.test')`, [
        userId,
      ]);
      await db.query("reset role");
      const { rows } = await db.query(`select email from public.profiles where id = $1`, [userId]);
      expect(rows[0].email).toBe("hardened@example.test");
    } finally {
      await db.query("rollback");
    }
  });

  it("stops future tables from receiving TRUNCATE for authenticated or anything for anon", async () => {
    await db.query(`create table public.future_table (id int primary key)`);
    try {
      const authenticated = await privilegesFor("authenticated");
      expect(authenticated.future_table ?? []).not.toEqual(expect.arrayContaining(["TRUNCATE"]));
      const anon = await privilegesFor("anon");
      expect(anon.future_table ?? []).toEqual([]);
    } finally {
      await db.query(`drop table public.future_table`);
    }
  });
});
