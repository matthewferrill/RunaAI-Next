import { readFileSync } from "node:fs";
import { sha256CanonicalText } from "./seal-file.mjs";

const seal = readFileSync("probes/SEAL-CONTENT-BOUNDARY.md", "utf8");
const hashes = [...seal.matchAll(/\b[0-9a-f]{64}\b/gi)].map(match => match[0].toLowerCase());
const checks = [
  ["CONTENT-BOUNDARY-PREREGISTRATION.md", hashes[0]],
  ["bakeoffs/security/run-content-boundary.mjs", hashes[1]],
];
let failed = false;
for (const [path, expected] of checks) {
  const actual = sha256CanonicalText(path);
  if (!expected || actual !== expected) {
    console.error(`CONTENT BOUNDARY SEAL BROKEN: ${path} expected=${expected ?? "missing"} actual=${actual}`);
    failed = true;
  } else {
    console.log(`CONTENT BOUNDARY SEALED: ${path} ${actual}`);
  }
}
if (failed) process.exit(1);
