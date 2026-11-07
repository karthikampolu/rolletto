#!/usr/bin/env node
// Run the backend virtualenv's Python with the given arguments, on Windows, macOS and Linux.
// Usage: node scripts/py.mjs -m pytest
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const backend = join(dirname(fileURLToPath(import.meta.url)), "..", "backend");
const python = [join(backend, ".venv", "Scripts", "python.exe"), join(backend, ".venv", "bin", "python")].find(existsSync);
if (!python) {
  console.error("Backend virtualenv not found. Run `npm run setup` first.");
  process.exit(1);
}
const { status } = spawnSync(python, process.argv.slice(2), { cwd: backend, stdio: "inherit" });
process.exit(status ?? 1);
