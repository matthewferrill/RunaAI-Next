import { readFileSync } from "node:fs";
import { sha256CanonicalText } from "./seal-file.mjs";

const seal = readFileSync("probes/SEAL-EVALS-COVERAGE.md", "utf8");
const hashes = [...seal.matchAll(/\b[0-9a-f]{64}\b/gi)].map(match => match[0].toLowerCase());
const checks = [
  ["EVALS-COVERAGE-PREREGISTRATION.md", hashes[0]],
  ["probes/run-evals-coverage.mjs", hashes[1]],
];
let failed = false;
for (const [path, expected] of checks) {
  const actual = sha256CanonicalText(path);
  if (!expected || actual !== expected) {
    console.error(`EVALS COVERAGE SEAL BROKEN: ${path} expected=${expected ?? "missing"} actual=${actual}`);
    failed = true;
  } else {
    console.log(`EVALS COVERAGE SEALED: ${path} ${actual}`);
  }
}
if (failed) process.exit(1);
