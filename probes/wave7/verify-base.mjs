import fs from "node:fs";
import { createHash } from "node:crypto";

const runId = process.env.W7_RUN_ID || "wave7-v2";
const version = runId.endsWith("v3") ? "V3" : "V2";
const file = `artifacts/runs/${runId}-base/base-manifest.json`;
const sealFile = `probes/SEAL-WAVE7-${version}-BASE.md`;
const want = fs.readFileSync(sealFile, "utf8").match(/([0-9a-f]{64})/)[1];
const got = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (want !== got) {
  console.error(`${runId} BASE SEAL BROKEN\n want ${want}\n got  ${got}`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
for (const [path, expected] of Object.entries(manifest.sourceFiles)) {
  const actual = createHash("sha256").update(fs.readFileSync(path)).digest("hex");
  if (actual !== expected.sha256) {
    console.error(`${runId} SOURCE DRIFT ${path}\n want ${expected.sha256}\n got  ${actual}`);
    process.exit(1);
  }
}
console.log(`${runId} base intact: ${Object.keys(manifest.sourceFiles).length} source files`);
