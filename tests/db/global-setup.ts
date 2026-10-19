import type { TestProject } from "vitest/node";
import { applyLocalSchema, startLocalCluster } from "../../scripts/db/local-schema";

/**
 * Boots a throw-away PostgreSQL 17 cluster, applies the local auth shim and every
 * migration, and hands the connection string to the test files. The cluster and its
 * data directory are removed on teardown.
 */
const DATABASE_NAME = "talentflow_test";

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const cluster = await startLocalCluster();
  await cluster.createDatabase(DATABASE_NAME);
  const connectionString = cluster.urlFor(DATABASE_NAME);
  const files = await applyLocalSchema(connectionString);
  console.info(`[db] applied shim + ${files.length} migration(s) on port ${cluster.port}`);

  project.provide("dbUrl", connectionString);

  return () => cluster.stop();
}
