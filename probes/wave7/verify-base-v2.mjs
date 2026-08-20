import fs from "node:fs";
import { createHash } from "node:crypto";

const file = "artifacts/runs/wave7-v2-base/base-manifest.json";
const want = fs.readFileSync("probes/SEAL-WAVE7-V2-BASE.md", "utf8").match(/([0-9a-f]{64})/)[1];
const got = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (want !== got) {
  console.error(`WAVE 7 v2 BASE SEAL BROKEN\n want ${want}\n got  ${got}`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
for (const [path, expected] of Object.entries(manifest.sourceFiles)) {
  const actual = createHash("sha256").update(fs.readFileSync(path)).digest("hex");
  if (actual !== expected.sha256) {
    console.error(`WAVE 7 v2 SOURCE DRIFT ${path}\n want ${expected.sha256}\n got  ${actual}`);
    process.exit(1);
  }
}
console.log(`Wave 7 v2 base intact: ${Object.keys(manifest.sourceFiles).length} source files`);
