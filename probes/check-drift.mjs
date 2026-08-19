// Compares two base-drift snapshots and refuses silence on anything that moved.
//
// Written after finding that the original comparison -- embedding digests and short generations --
// is insensitive to context length and quantization, the two things most likely to change without
// anyone touching a model. A wave could have run partly at 65536 and partly at another context and
// this file's predecessor would have reported the base unchanged.
import { readFileSync } from "node:fs";
const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error("usage: node probes/check-drift.mjs <before-label> <after-label>"); process.exit(2); }
const load = (l) => JSON.parse(readFileSync(`probes/results/base-drift-${l}.json`, "utf8"));
const A = load(a), B = load(b);
let moved = 0;

console.log(`drift: ${a} -> ${b}\n`);
for (let i = 0; i < A.embeddings.length; i++) {
  const x = A.embeddings[i], y = B.embeddings[i];
  const same = x.digest === y.digest && x.dim === y.dim;
  if (!same) moved++;
  console.log(`  ${same ? "MATCH  " : "CHANGED"}  embedding "${x.text}"  ${x.digest} -> ${y.digest}`);
}
for (let i = 0; i < A.generations.length; i++) {
  if (A.generations[i].text !== B.generations[i].text) { moved++; console.log(`  CHANGED  generation "${A.generations[i].prompt.slice(0, 34)}"`); }
}
const map = (r) => Object.fromEntries((Array.isArray(r) ? r : []).map((m) => [m.id, m]));
const ra = map(A.runtime), rb = map(B.runtime);
// A snapshot that cannot be compared must not read as a snapshot that matched. Printing
// "BASE UNCHANGED" under "NOT COMPARABLE" is the false-clean shape this programme keeps finding.
let comparable = true;
if (!A.runtime || !B.runtime) { comparable = false; console.log(`  NOT COMPARABLE  one snapshot predates runtime capture — context and quantization drift cannot be ruled out`); }
else for (const id of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
  const x = ra[id], y = rb[id];
  if (!x || !y) { console.log(`  ${x ? "REMOVED" : "ADDED  "}  ${id}`); continue; }
  for (const f of ["quantization", "loadedContext", "maxContext"]) {
    if (x[f] !== y[f] && !(f === "loadedContext" && (x[f] == null || y[f] == null))) {
      moved++; console.log(`  CHANGED  ${id} ${f}: ${x[f]} -> ${y[f]}`);
    }
  }
}
const verdict = moved > 0 ? `BASE MOVED — ${moved} difference(s)`
  : comparable ? "BASE UNCHANGED"
  : "PARTIALLY VERIFIED — embeddings and generations match, runtime state could not be compared";
console.log(`\n${verdict}`);
process.exit(moved > 0 ? 1 : comparable ? 0 : 2);
