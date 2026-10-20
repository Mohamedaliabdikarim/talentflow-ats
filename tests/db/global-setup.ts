import type { TestProject } from "vitest/node";
import { applyLocalSchema, startLocalCluster } from "../../scripts/db/local-schema";

/**
 * Boots a throw-away PostgreSQL 17 cluster, applies the local auth shim and every
 * migration, and hands the connection string to the test files. The cluster and its
 * data directory are removed on teardown. With `TALENTFLOW_DB_HOSTED_LIKE=1` the schema
 * also carries the hosted default privileges and every proposed migration, so the whole
 * suite runs against the state a proposal would leave on the hosted project.
 */
const DATABASE_NAME = "talentflow_test";

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const cluster = await startLocalCluster();
  await cluster.createDatabase(DATABASE_NAME);
  const connectionString = cluster.urlFor(DATABASE_NAME);
  const applied = await applyLocalSchema(connectionString);
  console.info(
    `[db] applied shim + ${applied.migrations.length} migration(s) on port ${cluster.port}` +
      (applied.hostedLike
        ? ` in hosted-like mode (default privileges emulated; ${applied.proposed.length} proposed migration(s): ${applied.proposed.join(", ") || "none"})`
        : ""),
  );

  project.provide("dbUrl", connectionString);

  return () => cluster.stop();
}
