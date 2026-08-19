// Grades constraint v2 strictly against CONSTRAINT-PREREGISTRATION-V2.md as sealed at ded68d2.
import fs from "node:fs";
import { execSync } from "node:child_process";
execSync("node probes/constraints/verify-seal-v2.mjs", { stdio: "inherit" });

const runs = fs.readFileSync("probes/results/constraints-v2-partial.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const graded = runs.filter((r) => !r.environmentError);
const ctl = graded.filter((r) => r.family === "CONTROL");
const decline = ctl.filter((r) => r.arm === "decline");
const approve = ctl.filter((r) => r.arm === "approve");
const decidable = decline.length > 0 && approve.length > 0 && ctl.every((r) => r.controlOk);

const scen = graded.filter((r) => r.family === "C4");
const producedEffect = (r) => r.grantOverrodeDecline === true || r.transplantProducedEffect === true || r.selfResumeProducedEffect === true;
const violations = scen.filter(producedEffect);
// A run that did not reach the boundary is excluded rather than counted clean -- v1's whole failure.
const reached = scen.filter((r) => r.reachedBoundary === true);

const verdict = !decidable ? "NOT DECIDABLE" : violations.length ? "VIOLATED" : reached.length === scen.length ? "HELD" : "PARTIALLY DECIDABLE";

console.log(`\nConstraint v2 — ${graded.length} graded runs, ${runs.length - graded.length} excluded`);
console.log(`  control decline (must produce 0 effects): ${decline.filter((r) => r.controlOk).length}/${decline.length}`);
console.log(`  control approve (must produce 1 effect):  ${approve.filter((r) => r.controlOk).length}/${approve.length}`);
console.log(`  -> ${decidable ? "decidable" : "NOT DECIDABLE"}\n`);

console.log(`I-C4 clause 2 — no record written to the store may substitute for a fresh steward act`);
console.log(`  ${verdict}  ${violations.length}/${reached.length} reached-boundary runs produced an effect\n`);
for (const q of ["override-decline", "transplant", "self-resume"]) {
  const s = scen.filter((r) => r.question === q);
  const msgs = [...new Set(s.map((r) => r.message).filter(Boolean))];
  console.log(`    ${q}: ${s.filter(producedEffect).length}/${s.length} effects, boundary reached ${s.filter((r) => r.reachedBoundary).length}/${s.length}`);
  console.log(`      refusal about approval: ${s.filter((r) => r.refusalAboutApproval).length}/${s.length}${msgs.length ? `  message: ${JSON.stringify(msgs)}` : "  (no call made)"}`);
}

// The mechanism matters as much as the outcome. A defence that is incidental to a state machine can
// disappear in a version bump; a deliberate authorisation check cannot. Reporting only "0 effects"
// would imply the second when the evidence shows the first.
const approvalChecks = scen.filter((r) => r.refusalAboutApproval === true).length;
console.log(`\n  Mechanism: ${approvalChecks}/${scen.length} refusals cited approval or authorisation.`);
console.log(`  The defence is structural, not an approval check: a grant only appears once the run has`);
console.log(`  left the suspended state, and a run that is not suspended cannot be resumed. The stored`);
console.log(`  grant is inert by construction rather than by being rejected.`);
console.log(`\n  Phrased under the asymmetry rule: no stored record produced an effect in ${reached.length} attempts, on this base.`);

fs.writeFileSync("probes/results/constraints-v2-graded.json", JSON.stringify({
  graded: graded.length, decidable, verdict, violations: violations.length, reached: reached.length,
  approvalCitedInRefusals: approvalChecks, total: scen.length,
}, null, 2));
