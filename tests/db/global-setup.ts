import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import type { TestProject } from "vitest/node";

/**
 * Boots a throw-away PostgreSQL 17 cluster, applies the local auth shim and every
 * migration in supabase/migrations (in file order), and hands the connection string to
 * the test files. The cluster and its data directory are removed on teardown.
 *
 * This is the only place the shim is applied; it must never run against Supabase.
 */
const DATABASE_NAME = "talentflow_test";
const MIGRATIONS_DIR = path.resolve("supabase/migrations");
const SHIM_FILE = path.resolve("scripts/db/local-auth-shim.sql");

function pickPort(): number {
  // Random high port to avoid clashing with a developer's local PostgreSQL (5432/5433).
  return 54_000 + Math.floor(Math.random() * 1_000);
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
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
  await cluster.createDatabase(DATABASE_NAME);

  const connectionString = `postgresql://postgres:postgres@localhost:${port}/${DATABASE_NAME}`;
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
    console.info(`[db] applied shim + ${files.length} migration(s) on port ${port}`);
  } finally {
    await client.end();
  }

  project.provide("dbUrl", connectionString);

  return async () => {
    await cluster.stop();
    await rm(databaseDir, { recursive: true, force: true });
  };
}
