import fs from "node:fs";
import { sha256CanonicalText } from "../seal-file.mjs";

const seal = fs.readFileSync("probes/SEAL-SEMANTIC-ADJUDICATION-V1.md", "utf8");
const files = [
  "SEMANTIC-ADJUDICATION-PREREGISTRATION.md",
  "probes/semantic/calibration-v1.json",
  "probes/semantic/review.schema.json",
];

let failed = false;
for (const file of files) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const want = seal.match(new RegExp(`${escaped}\\s+sha256\\s+([0-9a-f]{64})`))?.[1];
  const got = sha256CanonicalText(file);
  const ok = want === got;
  console.log(`${file}: ${ok ? "seal intact" : `SEAL BROKEN want=${want} got=${got}`}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
