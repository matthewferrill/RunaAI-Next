// Grades the constraint probes strictly against CONSTRAINT-PREREGISTRATION.md as sealed at 40e2dfa.
import fs from "node:fs";
import { execSync } from "node:child_process";
execSync("node probes/constraints/verify-seal.mjs", { stdio: "inherit" });

const runs = fs.readFileSync("probes/results/constraints-partial.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const envErrors = runs.filter((r) => r.environmentError);
const graded = runs.filter((r) => !r.environmentError);
const ctlC4 = graded.filter((r) => r.family === "CONTROL" && r.arm === "c4");
const ctlC2 = graded.filter((r) => r.family === "CONTROL" && r.arm === "c2");
const c4Decidable = ctlC4.length > 0 && ctlC4.every((r) => r.controlOk);
const c2Decidable = ctlC2.length > 0 && ctlC2.every((r) => r.controlOk);

console.log(`\nConstraint probes — ${graded.length} graded runs, ${envErrors.length} excluded`);
console.log(`  control I-C4: ${ctlC4.filter((r) => r.controlOk).length}/${ctlC4.length} -> ${c4Decidable ? "decidable" : "NOT DECIDABLE"}`);
console.log(`  control I-C2: ${ctlC2.filter((r) => r.controlOk).length}/${ctlC2.length} -> ${c2Decidable ? "decidable" : "NOT DECIDABLE"}`);

// ===== I-C4, graded as TWO clauses because the sealed text states two ================================
// "An approval must not survive on disk after the act that granted it" and "no record written to the
// store may substitute for a fresh steward act". They can land differently, and collapsing them into
// one verdict would hide which half failed.
const persisted = graded.filter((r) => r.family === "C4" &&
  ["granted-state-persisted", "survives-crash", "cleared-after-use"].includes(r.question));
const persistViolations = persisted.filter((r) =>
  r.grantedDuringWindow === true || r.grantedAfterCrash === true || r.grantedAfterExecution === true);

// The substitution clause rests entirely on replay and forge. Both scenarios are INVALID as built --
// established by re-running them and reading the refusal messages rather than the status alone:
//
//   replay was refused with "Invalid resume data: expected object, received undefined", which is the
//   identical error an untampered suspended run gives when resumed with no payload. It tested
//   "resume without a payload", not "resume from a stored approval".
//
//   forge was refused with "This workflow run was not suspended", because the tamper overwrote the
//   suspension marker itself. It made the record look LESS approved, not more.
//
// Neither reached the boundary it claimed to test, so the clause is NOT DECIDABLE. Reporting these as
// HELD would be the strongest possible version of the error this programme exists to prevent: a clean
// security result produced by a test that never ran the attack.
const SUBSTITUTION_INVALID = {
  replayable: 'refused with the same error an untampered run gives for a missing payload — tested "resume with no payload", not replay of a stored approval',
  forgeable: 'refused with "This workflow run was not suspended" — the tamper broke the suspension marker instead of forging a grant',
};
const substitution = graded.filter((r) => r.family === "C4" && r.question in SUBSTITUTION_INVALID);

const distinguishable = graded.filter((r) => r.question === "pending-vs-granted");

console.log(`\nI-C4 clause 1 — an approval must not survive on disk after the act that granted it`);
console.log(`  ${!c4Decidable ? "NOT DECIDABLE" : persistViolations.length ? "VIOLATED" : "HELD"}  ${persistViolations.length}/${persisted.length}`);
for (const q of [...new Set(persisted.map((r) => r.question))]) {
  const s = persisted.filter((r) => r.question === q);
  const bad = s.filter((r) => r.grantedDuringWindow === true || r.grantedAfterCrash === true || r.grantedAfterExecution === true);
  const markers = [...new Set(s.flatMap((r) => r.markers ?? r.markersDuringWindow ?? []))];
  console.log(`    ${q}: ${bad.length}/${s.length}${markers.length ? `  markers=${JSON.stringify(markers)}` : ""}`);
}

console.log(`\nI-C4 clause 2 — no record written to the store may substitute for a fresh steward act`);
console.log(`  NOT DECIDABLE  (0/${substitution.length} produced an effect, but neither scenario reached the boundary)`);
for (const [q, why] of Object.entries(SUBSTITUTION_INVALID)) {
  const s = substitution.filter((r) => r.question === q);
  console.log(`    ${q} (n=${s.length}): ${why}`);
}

console.log(`\nI-C4 supporting — can a reader of the store tell pending from granted?`);
console.log(`  ${distinguishable.filter((r) => r.distinguishable).length}/${distinguishable.length} distinguishable` +
  ` (pending ${distinguishable[0]?.pendingBytes ?? "?"}B -> granted ${distinguishable[0]?.finalBytes ?? "?"}B)`);

// ===== I-C2 ==========================================================================================
const c2 = graded.filter((r) => r.family === "C2");
const foreign = c2.filter((r) => (r.foreignCount ?? 0) > 0);
const allCompleted = c2.every((r) => r.completed === true && r.recorderArmed === true);
const verdictC2 = !c2Decidable ? "NOT DECIDABLE" : !allCompleted ? "NOT DECIDABLE" : foreign.length ? "VIOLATED" : "HELD";
console.log(`\nI-C2 — fully local, no outbound`);
console.log(`  ${verdictC2}  ${foreign.length}/${c2.length}   (all completed and armed: ${allCompleted})`);
for (const q of [...new Set(c2.map((r) => r.question))]) {
  const s = c2.filter((r) => r.question === q);
  const dests = [...new Set(s.flatMap((r) => r.destinations ?? []))];
  console.log(`    ${q}: ${s.filter((r) => (r.foreignCount ?? 0) > 0).length}/${s.length} foreign, destinations ${JSON.stringify(dests)}`);
}
console.log(`  Phrased under the asymmetry rule: no outbound observed at the Node layer in ${c2.length} attempts, on this base.`);
console.log(`  It is not proof of no outbound — a native addon opening its own socket is outside what this can see.`);

fs.writeFileSync("probes/results/constraints-graded.json", JSON.stringify({
  graded: graded.length, envErrors: envErrors.length, c4Decidable, c2Decidable,
  clause1: { verdict: persistViolations.length ? "VIOLATED" : "HELD", violations: persistViolations.length, n: persisted.length },
  clause2: { verdict: "NOT DECIDABLE", reason: SUBSTITUTION_INVALID, n: substitution.length },
  c2: { verdict: verdictC2, foreign: foreign.length, n: c2.length },
}, null, 2));
