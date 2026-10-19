/**
 * Runs Supabase CLI commands against the HOSTED project with credentials loaded from
 * .env.local (`node --env-file`). Every subcommand is explicit and nothing is applied
 * unless the owner runs `push` after approving the plan in docs/SUPABASE_INTEGRATION.md.
 *
 * Required .env.local entries (never committed):
 *   SUPABASE_PROJECT_REF   the project ref, must match NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_ACCESS_TOKEN  a scoped personal access token (not the browser-login token)
 *   SUPABASE_DB_PASSWORD   database password, used by `link` and `push`
 */
import { spawnSync } from "node:child_process";

const ref = process.env.SUPABASE_PROJECT_REF;
const [command] = process.argv.slice(2);

const commands = {
  link: ["link", "--project-ref", ref ?? ""],
  "list-remote": ["migration", "list"],
  "dry-run": ["db", "push", "--dry-run"],
  push: ["db", "push"],
};

function fail(message) {
  console.error(message);
  process.exit(2);
}

if (!command || !(command in commands)) {
  fail(`Usage: pnpm supabase:hosted <${Object.keys(commands).join("|")}>`);
}
if (!ref) fail("SUPABASE_PROJECT_REF is not set in .env.local");
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  fail("SUPABASE_ACCESS_TOKEN is not set in .env.local (create a scoped personal access token)");
}
const expectedHost = `${ref}.supabase.co`;
if (!(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes(expectedHost)) {
  fail(`NEXT_PUBLIC_SUPABASE_URL does not point at ${expectedHost}; refusing to continue`);
}

console.log(`[hosted] project ${ref}: supabase ${commands[command].join(" ")}`);
const result = spawnSync("pnpm", ["exec", "supabase", ...commands[command]], {
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 1);
