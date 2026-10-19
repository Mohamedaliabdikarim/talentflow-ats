import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

/**
 * Shared helpers for local verification: boot a throw-away PostgreSQL 17 cluster and
 * apply the auth shim plus every migration in supabase/migrations, in file order.
 * Used by the Vitest `db` project and by `pnpm db:types`. Never points at Supabase.
 */

const MIGRATIONS_DIR = path.resolve("supabase/migrations");
const SHIM_FILE = path.resolve("scripts/db/local-auth-shim.sql");

export type LocalCluster = {
  port: number;
  /** Connection string for the given database. */
  urlFor: (database: string) => string;
  createDatabase: (name: string) => Promise<void>;
  stop: () => Promise<void>;
};

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

/** Applies the local auth shim and all migrations. Returns the migration file names applied. */
export async function applyLocalSchema(connectionString: string): Promise<string[]> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(await readFile(SHIM_FILE, "utf8"));
    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
    if (files.length === 0) {
      throw new Error(`No migrations found in ${MIGRATIONS_DIR}`);
    }
    for (const file of files) {
      await client.query(await readFile(path.join(MIGRATIONS_DIR, file), "utf8"));
    }
    return files;
  } finally {
    await client.end();
  }
}
