import { readFileSync } from "node:fs"; import { createHash } from "node:crypto";
const want = readFileSync("probes/SEAL-PHASE-A2.md", "utf8").match(/([0-9a-f]{64})/)[1];
const got = createHash("sha256").update(readFileSync("PHASE-A2-PREREGISTRATION.md")).digest("hex");
if (want !== got) { console.error(`SEAL BROKEN\n want ${want}\n got  ${got}`); process.exit(1); }
console.log("seal intact: PHASE-A2-PREREGISTRATION.md unchanged since sealing");
