import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { applyLocalSchema, startLocalCluster } from "./local-schema";

/**
 * Prints the schema fingerprint (scripts/db/schema-fingerprint.sql) of the migrations as
 * applied to an embedded PostgreSQL, so it can be compared with the same query run
 * read-only against the hosted project. Usage: pnpm db:fingerprint
 */
async function main(): Promise<void> {
  const sql = await readFile(path.resolve("scripts/db/schema-fingerprint.sql"), "utf8");
  const cluster = await startLocalCluster();
  try {
    await cluster.createDatabase("talentflow_fingerprint");
    const url = cluster.urlFor("talentflow_fingerprint");
    await applyLocalSchema(url);
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const { rows } = await client.query(sql);
      console.log(JSON.stringify(rows[0]));
    } finally {
      await client.end();
    }
  } finally {
    await cluster.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
