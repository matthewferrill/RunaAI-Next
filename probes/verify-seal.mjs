// Refuses to grade against a touched key. Run by the grader before anything else.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const seal = readFileSync("probes/SEAL.md", "utf8");
let ok = true;
for (const file of ["labels.json", "questions.json"]) {
  const digest = createHash("sha256").update(readFileSync(`probes/corpus/${file}`)).digest("hex");
  const sealed = seal.match(new RegExp(`${file.replace(".", "\\.")}\\s+sha256 ([0-9a-f]{64})`))?.[1];
  const match = digest === sealed;
  console.log(`${file}: ${match ? "seal intact" : `SEAL BROKEN — sealed ${sealed?.slice(0, 12)}…, actual ${digest.slice(0, 12)}…`}`);
  if (!match) ok = false;
}
if (!ok) { console.log("\nRefusing to grade. A touched key grades the toucher, not the system."); process.exit(1); }
