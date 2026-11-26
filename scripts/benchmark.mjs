// Runs the matching benchmark. With --backup <file> it also scores the profile in that exported backup,
// writing to the git-ignored benchmark-output/ folder. Nothing is sent anywhere.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const at = args.indexOf("--backup");
const env = { ...process.env, CMH_BENCH_REPORT: "docs/benchmark-report.md" };

if (at >= 0) {
  const file = args[at + 1] && resolve(args[at + 1]);
  if (!file || !existsSync(file)) {
    console.error("Give the path of a backup exported from Settings: npm run benchmark -- --backup <file.json>");
    process.exit(1);
  }
  env.CMH_BENCH_BACKUP = file;
  // A run on your own data must not rewrite the committed report.
  delete env.CMH_BENCH_REPORT;
}

const run = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/benchmark.test.ts"], { stdio: "inherit", env });
process.exit(run.status ?? 1);
