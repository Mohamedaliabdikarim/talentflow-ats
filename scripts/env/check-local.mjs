/**
 * Prints which variables .env.local defines, without their values, and whether the
 * prerequisites of an operation are present.
 *   pnpm env:check             -> hosted migration tooling (link, list-remote, dry-run, push)
 *   pnpm env:check bootstrap   -> first platform admin (pnpm bootstrap:admin)
 */
import { existsSync, readFileSync } from "node:fs";

const ENV_FILE = ".env.local";
const PROFILES = {
  "dry-run": [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
  ],
  bootstrap: [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_APP_URL",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY",
  ],
};

const profile = process.argv[2] ?? "dry-run";
if (!(profile in PROFILES)) {
  console.log(`Unknown profile "${profile}". Use one of: ${Object.keys(PROFILES).join(", ")}`);
  process.exit(2);
}

if (!existsSync(ENV_FILE)) {
  console.log(`${ENV_FILE} does not exist`);
  process.exit(1);
}

const defined = new Map();
for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match && match[2].trim().length > 0) defined.set(match[1], match[2].trim().length);
}

for (const [name, length] of defined) {
  console.log(`set      ${name} (${length} characters)`);
}
let ready = true;
for (const name of PROFILES[profile]) {
  if (!defined.has(name)) {
    console.log(`missing  ${name}`);
    ready = false;
  }
}
console.log(`${profile} prerequisites: ${ready ? "all present." : "incomplete."}`);
process.exit(ready ? 0 : 1);
