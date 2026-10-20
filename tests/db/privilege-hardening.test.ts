import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { HOSTED_DEFAULT_PRIVILEGES_SQL } from "../../scripts/db/local-schema";

/**
 * Validates migration 0004 (supabase/migrations/20261019140000_privilege_hardening.sql) in an
 * isolated database that first reproduces the hosted starting state: Supabase's per-schema
 * default privileges (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on every new table for anon,
 * authenticated and service_role) in force while migrations 0001-0003 run, exactly as
 * measured on the hosted project on 2026-10-20; then applies 0004 and checks the result.
 * T30 in docs/TEST_PLAN.md. Reviewed in docs/PRIVILEGE_HARDENING_REVIEW.md.
 */

const DB_NAME = "talentflow_hardening";
const MIGRATIONS_DIR = path.resolve("supabase/migrations");
const HARDENING_FILE = "20261019140000_privilege_hardening.sql";
const PRIVS = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
  "MAINTAIN",
];
const DML = ["DELETE", "INSERT", "SELECT", "UPDATE"];
const NOT_GOVERNED_BY_RLS = ["MAINTAIN", "REFERENCES", "TRIGGER", "TRUNCATE"];
const RLS_HELPERS = [
  "public.is_platform_admin()",
  "public.is_org_member(uuid)",
  "public.can_access_org(uuid)",
  "public.shares_organization_with(uuid)",
  "public.log_audit_event(text, uuid, text, text, jsonb)",
  "public.activate_my_memberships()",
];
const TRIGGER_FUNCTIONS = [
  "public.set_updated_at()",
  "public.prevent_organization_change()",
  "public.touch_stage_changed_at()",
];

let admin: pg.Client;
let db: pg.Client;

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

async function applyMigration(file: string): Promise<void> {
  await db.query(await readFile(path.join(MIGRATIONS_DIR, file), "utf8"));
}

/** Privileges each public table grants to `role`, sorted, keyed by table name. */
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
  const { rows } = await db.query<{ ok: boolean }>(
    `select has_function_privilege($1, $2, 'EXECUTE') as ok`,
    [role, fn],
  );
  return rows[0].ok;
}

async function withTemporaryTable<T>(fn: () => Promise<T>): Promise<T> {
  await db.query(`create table public.future_table (id int primary key)`);
  try {
    return await fn();
  } finally {
    await db.query(`drop table public.future_table`);
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

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  if (!files.includes(HARDENING_FILE)) {
    throw new Error(`${HARDENING_FILE} not found in ${MIGRATIONS_DIR}`);
  }
  await db.query(await readFile(path.resolve("scripts/db/local-auth-shim.sql"), "utf8"));
  await db.query(HOSTED_DEFAULT_PRIVILEGES_SQL);
  for (const file of files.filter((f) => f < HARDENING_FILE)) {
    await applyMigration(file);
  }
});

afterAll(async () => {
  await db?.end();
  await admin.query(`drop database if exists ${DB_NAME}`);
  await admin.end();
});

describe("state after migrations 0001-0003 with Supabase's default privileges (hosted starting state)", () => {
  it("reproduces the measured hosted grants: authenticated holds all eight privileges on jobs", async () => {
    const authenticated = await privilegesFor("authenticated");
    expect(authenticated.jobs).toEqual([...DML, ...NOT_GOVERNED_BY_RLS].sort());
    expect(authenticated.platform_admins).toEqual([
      "MAINTAIN",
      "REFERENCES",
      "SELECT",
      "TRIGGER",
      "TRUNCATE",
    ]);
    const anon = await privilegesFor("anon");
    expect(Object.values(anon).every((privs) => privs.length === 0)).toBe(true);
    expect(await canExecute("anon", "public.sync_profile_from_auth_user()")).toBe(true);
    expect(await canExecute("authenticated", "public.sync_profile_from_auth_user()")).toBe(true);
  });

  it("reproduces the measured hosted default: a new table hands anon TRUNCATE, REFERENCES, TRIGGER, MAINTAIN", async () => {
    await withTemporaryTable(async () => {
      const anon = await privilegesFor("anon");
      expect(anon.future_table).toEqual(NOT_GOVERNED_BY_RLS);
    });
  });
});

describe("migration 0004 (privilege hardening)", () => {
  beforeAll(async () => {
    await applyMigration(HARDENING_FILE);
  });

  it("leaves authenticated with exactly the DML that migration 0002 granted", async () => {
    const authenticated = await privilegesFor("authenticated");
    for (const table of [
      "organizations",
      "organization_memberships",
      "jobs",
      "candidates",
      "applications",
      "candidate_ai_insights",
    ]) {
      expect(authenticated[table], table).toEqual(DML);
    }
    expect(authenticated.platform_admins).toEqual(["SELECT"]);
    expect(authenticated.audit_events).toEqual(["SELECT"]);
    expect(authenticated.profiles).toEqual(["SELECT", "UPDATE"]);
    for (const [table, privs] of Object.entries(authenticated)) {
      for (const priv of NOT_GOVERNED_BY_RLS) expect(privs, `${table} ${priv}`).not.toContain(priv);
    }
  });

  it("leaves anon with nothing", async () => {
    const anon = await privilegesFor("anon");
    expect(Object.keys(anon)).toHaveLength(9);
    expect(Object.values(anon).every((privs) => privs.length === 0)).toBe(true);
  });

  it("leaves service_role unchanged on existing tables (server-only, bypasses RLS)", async () => {
    const service = await privilegesFor("service_role");
    expect(service.jobs).toEqual(PRIVS.slice().sort());
  });

  it("keeps every RLS helper and RPC executable by authenticated and denied to anon", async () => {
    for (const fn of RLS_HELPERS) {
      expect(await canExecute("authenticated", fn), fn).toBe(true);
      expect(await canExecute("anon", fn), fn).toBe(false);
    }
  });

  it("does not touch the SECURITY INVOKER trigger functions", async () => {
    for (const fn of TRIGGER_FUNCTIONS) {
      expect(await canExecute("authenticated", fn), fn).toBe(true);
    }
  });

  it("restricts the profile-sync trigger function to the Auth service role and keeps the trigger working", async () => {
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

  it("gives future tables no API-role privileges by default, the same as local PostgreSQL", async () => {
    await withTemporaryTable(async () => {
      for (const role of ["anon", "authenticated", "service_role"]) {
        const privs = await privilegesFor(role);
        expect(privs.future_table, role).toEqual([]);
      }
    });
  });

  it("can be applied a second time without error or change", async () => {
    const before = await privilegesFor("authenticated");
    await applyMigration(HARDENING_FILE);
    expect(await privilegesFor("authenticated")).toEqual(before);
  });
});
