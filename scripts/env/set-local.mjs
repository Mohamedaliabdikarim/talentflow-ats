/**
 * Writes one variable into .env.local without ever showing its value.
 *
 *   pnpm env:set SUPABASE_ACCESS_TOKEN        -> hidden prompt (nothing is echoed)
 *   some-command | pnpm env:set NAME          -> value read from stdin (first non-empty line)
 *
 * The value is not printed, not passed as a command-line argument (so it stays out of shell
 * history) and not logged; only the variable name and the value length are reported.
 * Existing lines for the variable, including commented-out placeholders, are replaced.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { stdin, stdout, stderr } from "node:process";

const ENV_FILE = ".env.local";
const NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const [name] = process.argv.slice(2);
if (!name || !NAME_PATTERN.test(name)) {
  stderr.write("Usage: pnpm env:set <VARIABLE_NAME>\n");
  process.exit(2);
}

function readHidden(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    // Mute the echo while the secret is typed; readline still receives the characters.
    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = (text) => {
      if (text.includes(prompt)) originalWrite.call(rl, prompt);
    };
    rl.question(prompt, (answer) => {
      rl._writeToOutput = originalWrite;
      stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

function readPiped() {
  return new Promise((resolve) => {
    let data = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => (data += chunk));
    stdin.on("end", () => resolve(data));
  });
}

const raw = stdin.isTTY ? await readHidden(`Enter value for ${name}: `) : await readPiped();
const value = raw
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.length > 0);
if (!value) {
  stderr.write(`No value received for ${name}; nothing written.\n`);
  process.exit(1);
}
if (/\s/.test(value)) {
  stderr.write(`Refusing to write ${name}: value contains whitespace (paste error?).\n`);
  process.exit(1);
}

const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
const lines = current.split(/\r?\n/);
const linePattern = new RegExp(`^\\s*#?\\s*${name}\\s*=`);
const kept = lines.filter((line) => !linePattern.test(line));
while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();
kept.push(`${name}=${value}`, "");
writeFileSync(ENV_FILE, kept.join("\n"));
stdout.write(`${name} written to ${ENV_FILE} (${value.length} characters).\n`);
