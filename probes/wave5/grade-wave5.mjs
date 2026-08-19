// Grades Wave 5 strictly against WAVE5-PREREGISTRATION.md as sealed at cbec168.
// Checks against the sealed invariants and never widens them (PROVING.md lock rule).
import fs from "node:fs";
import { execSync } from "node:child_process";
execSync("node probes/wave5/verify-seal-wave5.mjs", { stdio: "inherit" });

const runs = fs.readFileSync("probes/results/wave5-partial.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const envErrors = runs.filter((r) => r.environmentError);
const graded = runs.filter((r) => !r.environmentError);
const controls = graded.filter((r) => r.family === "CONTROL");
const controlByEdge = {};
for (const e of ["E04", "E05", "E07"]) {
  const c = controls.filter((r) => r.edge === e);
  controlByEdge[e] = { n: c.length, ok: c.filter((r) => r.controlOk).length, pass: c.length > 0 && c.every((r) => r.controlOk) };
}

const INV = {
  "I-5A": { family: "A", edge: "E04", title: "concurrent access does not corrupt the store or lose a message",
    violates: (r) => r.readable === false || r.lostMessage === true },
  "I-5B": { family: "B", edge: "E05", title: "concurrent writes leave no stored message without its embedding",
    violates: (r) => r.readable === false || r.orphaned === true },
  "I-5C": { family: "C", edge: "E07", title: "concurrent upsert and query do not corrupt the index",
    // Rows left behind by a writer that failed under contention are indistinguishable from a
    // completed writer's, so a later query presents a partial build as complete. Whether the index
    // can EVER report incompleteness is I-5F's question, kept separate to avoid double-counting.
    violates: (r) => r.readable === false || r.lostRows === true || r.duplicated === true || r.orphanRowsFromFailedWriter === true },
  "I-5D": { family: "D", edge: "E04", title: "after a crash the store agrees with what the caller was told",
    violates: (r) => r.readable === false || r.agrees === false },
  "I-5E": { family: "E", edge: "E05", title: "a message and its embedding agree, or the divergence is visible",
    violates: (r) => r.silentlyUnrecallable === true || (r.ack === "ok" && (r.orphans ?? 0) > 0) },
  "I-5F": { family: "F", edge: "E07", title: "an index interrupted mid-build does not present itself as complete",
    // Verified, not assumed: describeIndex returns {dimension, count, metric} with no build-state
    // marker, and a query against a partial index returns scored results indistinguishable from a
    // complete one. A caller cannot tell 8-of-8 from 8-of-60.
    violates: (r) => r.readable === false || r.queryableWhilePartial === true || r.duplicated === true },
};

const report = [];
for (const [id, spec] of Object.entries(INV)) {
  const fam = graded.filter((r) => r.family === spec.family);
  const bad = fam.filter(spec.violates);
  const verdict = !controlByEdge[spec.edge].pass ? "NOT DECIDABLE" : bad.length > 0 ? "VIOLATED" : "HELD";
  const byQ = {}, denom = {};
  for (const r of fam) denom[r.question] = (denom[r.question] || 0) + 1;
  for (const r of bad) byQ[r.question] = (byQ[r.question] || 0) + 1;
  report.push({ id, ...spec, n: fam.length, violations: bad.length, verdict, byQ, denom });
}

console.log(`\nWave 5 — ${graded.length} graded runs, ${envErrors.length} environment errors excluded`);
for (const e of ["E04", "E05", "E07"]) console.log(`  control ${e}: ${controlByEdge[e].ok}/${controlByEdge[e].n} -> ${controlByEdge[e].pass ? "decidable" : "NOT DECIDABLE"}`);
console.log("");
for (const r of report) {
  console.log(`${r.id}  ${r.verdict}  ${r.violations}/${r.n}  — ${r.title}`);
  for (const [k, v] of Object.entries(r.byQ).sort((a, b) => b[1] - a[1])) console.log(`    ${k}: ${v}/${r.denom[k]}`);
}

// The wave's named target, reported on its own terms rather than folded into an invariant count.
const unrecallable = graded.filter((r) => r.silentlyUnrecallable === true);
console.log(`\nsilent unrecallability (acknowledged, stored, no embedding): ${unrecallable.length}/${graded.length}`);
for (const [k, v] of Object.entries(unrecallable.reduce((a, r) => { const k = `${r.family}.${r.question}`; a[k] = (a[k] || 0) + 1; return a; }, {}))) console.log(`  ${k}: ${v}`);
const achieved = graded.filter((r) => r.achieved).reduce((a, r) => { const k = `${r.family}.${r.question} -> ${r.achieved}`; a[k] = (a[k] || 0) + 1; return a; }, {});
console.log("\nachieved boundaries (graded by what was reached, not intended):");
for (const [k, v] of Object.entries(achieved).sort()) console.log(`  ${k}: ${v}`);

fs.writeFileSync("probes/results/wave5-graded.json", JSON.stringify({ graded: graded.length, envErrors: envErrors.length, controlByEdge, report, unrecallable: unrecallable.length, achieved }, null, 2));
