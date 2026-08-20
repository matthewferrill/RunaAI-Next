// Refuses to run or grade Wave 1 against an edited preregistration. Same discipline as the corpus
// seal: the scenarios, invariants, sample sizes and completion rules were fixed before the
// implementation existed, and a preregistration edited afterwards preregisters nothing.
import { readFileSync } from "node:fs";
import { sha256CanonicalText } from "../seal-file.mjs";

const SEAL = "probes/SEAL-WAVE1.md";
const FILE = "WAVE1-PREREGISTRATION.md";
const seal = readFileSync(SEAL, "utf8");
const sealed = seal.match(/sha256:\s*([0-9a-f]{64})/)?.[1];
const actual = sha256CanonicalText(FILE);

if (sealed === actual) {
  console.log(`${FILE}: seal intact`);
} else {
  console.log(`${FILE}: SEAL BROKEN — sealed ${String(sealed).slice(0, 12)}…, actual ${actual.slice(0, 12)}…`);
  console.log("Refusing to proceed. Anything learned that suggests a scenario is wrong goes into a new");
  console.log("sealed version; this one stands as committed.");
  process.exit(1);
}
