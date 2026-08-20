import { readFileSync } from "node:fs";
import { sha256CanonicalText } from "../seal-file.mjs";
const SEAL = "probes/SEAL-WAVE3.md", FILE = "WAVE3-PREREGISTRATION.md";
const seal = readFileSync(SEAL, "utf8");
const want = seal.match(/sha256:\s*([0-9a-f]{64})/)?.[1];
const got = sha256CanonicalText(FILE);
if (got !== want) { console.error(`SEAL BROKEN — ${FILE} sha ${got.slice(0,12)}… != sealed ${String(want).slice(0,12)}…\nRefusing: a runner built against an edited preregistration measures the edit.`); process.exit(1); }
console.log(`${FILE}: seal intact`);
