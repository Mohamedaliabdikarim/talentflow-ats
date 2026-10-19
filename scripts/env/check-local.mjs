/**
 * Prints which variables .env.local defines, without their values.
 *   pnpm env:check
 */
import { existsSync, readFileSync } from "node:fs";

const ENV_FILE = ".env.local";
const REQUIRED_FOR_DRY_RUN = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
];

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
for (const name of REQUIRED_FOR_DRY_RUN) {
  if (!defined.has(name)) {
    console.log(`missing  ${name}`);
    ready = false;
  }
}
console.log(ready ? "Dry-run prerequisites: all present." : "Dry-run prerequisites: incomplete.");
process.exit(ready ? 0 : 1);
