import { readFileSync } from "node:fs";
import { sha256CanonicalText } from "./seal-file.mjs";

const seal = readFileSync("probes/SEAL-STACK-BAKEOFF.md", "utf8");
const expected = seal.match(/\b[0-9a-f]{64}\b/i)?.[0]?.toLowerCase();
const actual = sha256CanonicalText("STACK-BAKEOFF-PREREGISTRATION.md");
if (!expected || expected !== actual) {
  console.error(`STACK BAKE-OFF SEAL BROKEN: expected=${expected ?? "missing"} actual=${actual}`);
  process.exit(1);
}
console.log(`STACK BAKE-OFF SEAL INTACT: ${actual}`);
