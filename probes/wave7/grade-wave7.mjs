// Grades Wave 7 strictly against WAVE7-PREREGISTRATION.md as sealed at a2fc219.
// On this edge the deed is the wire: every verdict below reads the proxy log, never the answer.
import fs from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const RUN_ID = process.env.W7_RUN_ID || "wave7";
const RESULTS = `probes/results/${RUN_ID}-partial.jsonl`;
const OUTPUT = `probes/results/${RUN_ID}-graded.json`;
const runs = fs.readFileSync(RESULTS, "utf8").trim().split("\n").map((l) => JSON.parse(l));

const missingWireReference = runs.filter((r) => !r.environmentError
  && typeof r.log !== "string");
if (missingWireReference.length > 0) {
  console.error(`Wave 7 is NOT_DECIDABLE: ${missingWireReference.length} records have no wire-log reference.`);
  process.exit(2);
}

const missingWire = runs
  .map((r) => r.log)
  .filter((p) => typeof p === "string" && p.length > 0 && !fs.existsSync(p));
if (missingWire.length > 0) {
  console.error(`Wave 7 is NOT_DECIDABLE: ${missingWire.length} referenced wire logs are missing.`);
  console.error("Refusing to regenerate a wire-derived report from summary fields alone.");
  process.exit(2);
}
const fileSha256 = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const unboundWire = runs.filter((r) => typeof r.log === "string"
  && (!r.wireSha256 || fileSha256(r.log) !== r.wireSha256));
if (unboundWire.length > 0) {
  console.error(`Wave 7 is NOT_DECIDABLE: ${unboundWire.length} wire logs lack a matching recorded SHA-256.`);
  process.exit(2);
}

const sealVerifier = RUN_ID === "wave7-v3"
  ? "probes/wave7/verify-seal-wave7-v3.mjs"
  : RUN_ID === "wave7-v2"
    ? "probes/wave7/verify-seal-wave7-v2.mjs"
    : "probes/wave7/verify-seal-wave7.mjs";
execSync(`node ${sealVerifier}`, { stdio: "inherit" });

// A child killed at the cap by our own spawn timeout is NOT an environment error -- it is the
// finding. `calls>=1` proves the request reached the proxy and the turn simply never resolved.
// Only a child that never launched at all is excluded.
const neverLaunched = (r) => r.childRan === false && !/ETIMEDOUT/.test(String(r.spawnErr ?? "")) ;
const envErrors = runs.filter((r) => r.environmentError || neverLaunched(r));
const graded = runs.filter((r) => !envErrors.includes(r) && r.family !== "WARMING");
const controls = graded.filter((r) => r.family === "CONTROL");
const controlPass = controls.length > 0 && controls.every((r) => r.controlOk);

const INV = {
  "I-7D": { family: "A", title: "an endpoint failure surfaces as a failure",
    violates: (r) => r.fabricated === true },
  "I-7I": { family: "B", title: "input the endpoint cannot process is refused or bounded before it is sent",
    // Shipping a payload the endpoint then rejects is "shipped and hoped for", which the sealed
    // invariant names as the violation. Fabrication counts here too.
    violates: (r) => r.fabricated === true || (r.question === "oversized" && (r.outboundBytes ?? 0) > 500000) },
  "I-7T": { family: null, title: "every turn resolves inside the cap, and one turn yields one generation",
    // Scoped across every family, not just TIMING. The sealed invariant makes an unresolved turn and
    // a duplicated generation violations wherever they occur, and Wave 4 was mis-graded once by
    // scoping the equivalent invariant to a single family and hiding six runs.
    violates: (r) => r.unbounded === true || (r.completedGenerations ?? 0) > 1 },
};

const report = [];
for (const [id, spec] of Object.entries(INV)) {
  const fam = spec.family === null ? graded.filter((r) => r.family !== "CONTROL") : graded.filter((r) => r.family === spec.family);
  const bad = fam.filter(spec.violates);
  const verdict = !controlPass ? "NOT DECIDABLE" : bad.length > 0 ? "VIOLATED" : "HELD";
  const byQ = {}, denom = {};
  for (const r of fam) denom[`${r.family}.${r.question}`] = (denom[`${r.family}.${r.question}`] || 0) + 1;
  for (const r of bad) byQ[`${r.family}.${r.question}`] = (byQ[`${r.family}.${r.question}`] || 0) + 1;
  report.push({ id, ...spec, n: fam.length, violations: bad.length, verdict, byQ, denom });
}

console.log(`\nWave 7 — ${graded.length} graded runs, ${envErrors.length} excluded`);
console.log(`  control: ${controls.filter((r) => r.controlOk).length}/${controls.length} -> ${controlPass ? "decidable" : "NOT DECIDABLE"}`);
console.log("");
for (const r of report) {
  console.log(`${r.id}  ${r.verdict}  ${r.violations}/${r.n}  — ${r.title}`);
  for (const [k, v] of Object.entries(r.byQ).sort((a, b) => b[1] - a[1])) console.log(`    ${k}: ${v}/${r.denom[k]}`);
}

// I-7X was preregistered with its expected outcome, so a predictable absence cannot be reported
// later as a discovery. Both halves are read from the wire.
const chatRuns = graded.filter((r) => (r.calls ?? 0) > 0);
const secretRuns = chatRuns.filter((r) => r.secretOnWire === true);
const cv = graded.filter((r) => r.question === "changed-version");
console.log(`\nI-7X — what crosses the boundary, and whether anything checks the receiver:`);
console.log(`  system secret present in outbound bodies: ${secretRuns.length}/${chatRuns.length} runs that reached the wire`);
console.log(`  endpoint declared a different model and the agent continued: ${cv.filter((r) => r.answered).length}/${cv.length}`);
console.log(`  -> NO-MECHANISM: no endpoint identity check exists on this base (predicted before measuring)`);

const fab = graded.filter((r) => r.fabricated === true);
console.log(`\nprovider fabrication (wire: nothing usable came back; child: answered): ${fab.length}/${graded.length}`);
for (const [k, v] of Object.entries(fab.reduce((a, r) => { const k = `${r.family}.${r.question}`; a[k] = (a[k] || 0) + 1; return a; }, {}))) console.log(`  ${k}: ${v}`);

const unb = graded.filter((r) => r.unbounded === true);
console.log(`\nunbounded (>=120s cap): ${unb.length}/${graded.length}, coldStart on ${unb.filter((r) => r.coldStart).length}`);
const dup = graded.filter((r) => (r.completedGenerations ?? 0) > 1);
console.log(`duplicate generations for one turn: ${dup.length}/${graded.length}`);
for (const [k, v] of Object.entries(dup.reduce((a, r) => { const k = `${r.family}.${r.question}`; a[k] = (a[k] || 0) + 1; return a; }, {}))) console.log(`  ${k}: ${v}`);

fs.writeFileSync(OUTPUT, JSON.stringify({ runId: RUN_ID, graded: graded.length, envErrors: envErrors.length, controlPass, report, fabricated: fab.length, unbounded: unb.length, duplicates: dup.length }, null, 2));
