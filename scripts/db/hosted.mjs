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

/**
 * IPv4-only networks cannot reach the direct database host (IPv6). The CLI normally stores
 * the Supavisor pooler route during `link`, which needs the token permission
 * "Connection Pooling (Read)". As a fallback, SUPABASE_POOLER_HOST (the pooler host from the
 * dashboard's Connect dialog, not a secret) makes the database commands use an explicit
 * session-mode pooler URL. The URL carries the password and is passed to the CLI process
 * only; it is never printed.
 */
const poolerHost = process.env.SUPABASE_POOLER_HOST;
const target = poolerHost
  ? [
      "--db-url",
      `postgresql://postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "")}@${poolerHost}:5432/postgres`,
    ]
  : ["--linked"];

const commands = {
  link: ["link", "--project-ref", ref ?? ""],
  "list-remote": ["migration", "list", ...target],
  "dry-run": ["db", "push", "--dry-run", ...target],
  push: ["db", "push", ...target],
  unlink: ["unlink"],
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

// Print the command without the connection URL (it embeds the password).
const shown = commands[command].map((arg, index, all) =>
  all[index - 1] === "--db-url" ? "<pooler-url>" : arg,
);
console.log(`[hosted] project ${ref}: supabase ${shown.join(" ")}`);
const result = spawnSync("pnpm", ["exec", "supabase", ...commands[command]], {
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 1);
