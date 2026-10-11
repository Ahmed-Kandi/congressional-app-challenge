// Runs `node --check` on every .js and .mjs file we wrote (skips node_modules),
// so a typo anywhere fails fast before the slower tests run.

import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIP_DIRS = new Set(["node_modules", ".git", "test-results", "playwright-report"]);

function findScripts(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...findScripts(path));
    } else if (/\.(m?js)$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

let failures = 0;
const files = findScripts(ROOT);
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failures += 1;
    console.error(`Syntax error in ${relative(ROOT, file)}:\n${result.stderr}`);
  }
}

console.log(`node --check: ${files.length - failures}/${files.length} files OK`);
process.exit(failures === 0 ? 0 : 1);
