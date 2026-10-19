/**
 * `output: "standalone"` deliberately leaves out static assets and the public folder so
 * they can be served from a CDN. We serve them from the same process on Azure App Service,
 * so copy them next to the standalone server after every build (docs/DEPLOYMENT.md).
 */
import { access, cp } from "node:fs/promises";

const copies = [
  [".next/static", ".next/standalone/.next/static"],
  ["public", ".next/standalone/public"],
];

for (const [from, to] of copies) {
  try {
    await access(from);
  } catch {
    console.warn(`skip: ${from} does not exist`);
    continue;
  }
  await cp(from, to, { recursive: true });
  console.log(`copied ${from} -> ${to}`);
}
