import { readFileSync } from "node:fs";
import { sha256CanonicalText } from "./seal-file.mjs";

const seal = readFileSync("probes/SEAL-FRAY4-CAPABILITY.md", "utf8");
const expected = seal.match(/\b[0-9a-f]{64}\b/i)?.[0]?.toLowerCase();
const actual = sha256CanonicalText("FRAY4-CAPABILITY-PREREGISTRATION.md");
if (!expected || expected !== actual) {
  console.error(`FRAY 4 CAPABILITY SEAL BROKEN: expected=${expected ?? "missing"} actual=${actual}`);
  process.exit(1);
}
console.log(`FRAY 4 CAPABILITY SEAL INTACT: ${actual}`);
