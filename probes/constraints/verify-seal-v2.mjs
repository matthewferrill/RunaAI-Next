import { readFileSync } from "node:fs"; import { sha256CanonicalText } from "../seal-file.mjs";
const want = readFileSync("probes/SEAL-CONSTRAINTS-V2.md", "utf8").match(/([0-9a-f]{64})/)[1];
const got = sha256CanonicalText("CONSTRAINT-PREREGISTRATION-V2.md");
if (want !== got) { console.error(`SEAL BROKEN\n want ${want}\n got  ${got}`); process.exit(1); }
console.log("seal intact: CONSTRAINT-PREREGISTRATION-V2.md unchanged since sealing");
