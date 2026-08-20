import { readFileSync } from "node:fs"; import { sha256CanonicalText } from "../seal-file.mjs";
const want = readFileSync("probes/SEAL-MODEL-ARM.md", "utf8").match(/([0-9a-f]{64})/)[1];
const got = sha256CanonicalText("MODEL-ARM-PREREGISTRATION.md");
if (want !== got) { console.error(`SEAL BROKEN\n want ${want}\n got  ${got}`); process.exit(1); }
console.log("seal intact: MODEL-ARM-PREREGISTRATION.md unchanged since sealing");
