import { readFileSync } from "node:fs";
import { sha256CanonicalText } from "../seal-file.mjs";

const want = readFileSync("probes/SEAL-WAVE7-V3.md", "utf8").match(/([0-9a-f]{64})/)[1];
const got = sha256CanonicalText("WAVE7-V3-PREREGISTRATION.md");
if (want !== got) {
  console.error(`SEAL BROKEN\n want ${want}\n got  ${got}`);
  process.exit(1);
}
console.log("seal intact: WAVE7-V3-PREREGISTRATION.md unchanged since sealing");
