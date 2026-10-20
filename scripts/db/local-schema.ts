import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

/**
 * Shared helpers for local verification: boot a throw-away PostgreSQL 17 cluster and
 * apply the auth shim plus every migration in supabase/migrations, in file order.
 * Used by the Vitest `db` project and by `pnpm db:types`. Never points at Supabase.
 *
 * Hosted-like mode (`TALENTFLOW_DB_HOSTED_LIKE=1`): before the migrations, reproduce the
 * per-schema default privileges measured on the hosted project, and after them apply every
 * file in supabase/proposed/ (migrations drafted but not yet approved). This runs the whole
 * `tests/db` suite against the state the hosted database would be in after the proposal.
 */

const MIGRATIONS_DIR = path.resolve("supabase/migrations");
const PROPOSED_DIR = path.resolve("supabase/proposed");
const SHIM_FILE = path.resolve("scripts/db/local-auth-shim.sql");

/**
 * Supabase's per-schema default privileges for the migration role, as measured read-only on
 * project zcxmyaxpftzwpzvmhslm on 2026-10-20 (`pg_default_acl`, role `postgres`, schema
 * `public`): every new table gives anon, authenticated and service_role TRUNCATE, REFERENCES,
 * TRIGGER and MAINTAIN ("Dxtm"); functions and sequences carry nothing beyond PostgreSQL's
 * built-in defaults. A plain embedded PostgreSQL has none of this, which is why the hosted
 * project ended up with privileges the migrations never granted.
 */
export const HOSTED_DEFAULT_PRIVILEGES_SQL =
  "alter default privileges in schema public grant truncate, references, trigger, maintain on tables to anon, authenticated, service_role";

export type LocalCluster = {
  port: number;
  /** Connection string for the given database. */
  urlFor: (database: string) => string;
  createDatabase: (name: string) => Promise<void>;
  stop: () => Promise<void>;
};

export type ApplyLocalSchemaOptions = {
  /** Emulate the hosted default privileges and apply supabase/proposed/*.sql afterwards. */
  hostedLike?: boolean;
};

export type AppliedSchema = {
  migrations: string[];
  proposed: string[];
  hostedLike: boolean;
};

export function isHostedLikeRequested(): boolean {
  return process.env.TALENTFLOW_DB_HOSTED_LIKE === "1";
}

function pickPort(): number {
  // Random high port to avoid clashing with a developer's own PostgreSQL (5432/5433).
  return 54_000 + Math.floor(Math.random() * 1_000);
}

export async function startLocalCluster(): Promise<LocalCluster> {
  const port = pickPort();
  const databaseDir = await mkdtemp(path.join(os.tmpdir(), "talentflow-pg-"));

  const cluster = new EmbeddedPostgres({
    databaseDir,
    port,
    user: "postgres",
    password: "postgres",
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: (message) => console.error(String(message)),
  });

  await cluster.initialise();
  await cluster.start();

  return {
    port,
    urlFor: (database) => `postgresql://postgres:postgres@localhost:${port}/${database}`,
    createDatabase: (name) => cluster.createDatabase(name),
    stop: async () => {
      await cluster.stop();
      await rm(databaseDir, { recursive: true, force: true });
    },
  };
}

async function sqlFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Applies the local auth shim and all migrations. Returns the file names applied. */
export async function applyLocalSchema(
  connectionString: string,
  options: ApplyLocalSchemaOptions = {},
): Promise<AppliedSchema> {
  const hostedLike = options.hostedLike ?? isHostedLikeRequested();
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(await readFile(SHIM_FILE, "utf8"));
    if (hostedLike) {
      await client.query(HOSTED_DEFAULT_PRIVILEGES_SQL);
    }
    const migrations = await sqlFiles(MIGRATIONS_DIR);
    if (migrations.length === 0) {
      throw new Error(`No migrations found in ${MIGRATIONS_DIR}`);
    }
    for (const file of migrations) {
      await client.query(await readFile(path.join(MIGRATIONS_DIR, file), "utf8"));
    }
    const proposed = hostedLike ? await sqlFiles(PROPOSED_DIR) : [];
    for (const file of proposed) {
      await client.query(await readFile(path.join(PROPOSED_DIR, file), "utf8"));
    }
    return { migrations, proposed, hostedLike };
  } finally {
    await client.end();
  }
}
