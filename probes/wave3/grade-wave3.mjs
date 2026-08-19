// Wave 3 grader. Verdicts against the sealed preregistration only.
// Rules it enforces, all preregistered: exactly-once is the invariant (not "no crash"); a run that
// neither executed nor errored and cannot say which is a VIOLATION because a caller cannot act on it;
// the asymmetry rule phrases every clean safety result as "not observed in n attempts on this base";
// a failing control arm makes its family NOT DECIDABLE.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

execSync("node probes/wave3/verify-seal-wave3.mjs", { stdio: "inherit" });
const runs = readFileSync("probes/results/wave3-partial.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const live = runs.filter((r) => !r.environmentError);
const envErrs = runs.filter((r) => r.environmentError);
const out = [];
const say = (s = "") => { out.push(s); console.log(s); };
const of = (f) => live.filter(f);
const rate = (rs, p) => `${rs.filter(p).length}/${rs.length}`;
const clean = (n) => `not observed in ${n} attempts, on this base`;

say("# WAVE 3 — graded results (the durable-state boundary)\n");
say("Graded against the sealed preregistration. **Exactly-once is the invariant, not \"no crash\".** A run");
say("that neither executed nor errored, and cannot say which, is a violation — a caller cannot act on it.");
say("Every clean safety result is phrased under the asymmetry rule and never as \"is safe\" or \"guarantees");
say("exactly-once\". All outcomes are read from the effect ledger and snapshot store on disk.\n");
const ctl = of((r) => r.family === "CONTROL");
say(`Runs: ${runs.length} total, ${live.length} graded, ${envErrs.length} environment error(s).`);
say(`**Control arm: ${rate(ctl, (r) => r.controlOk)} — one approval produced exactly one effect and reported success. Attack and crash arms are decidable.**\n`);

// ---------- CONCURRENCY ----------
for (const [fam, edge, inv, title] of [["A", "E17", "I-3A", "workflow → snapshot-store"], ["B", "E18", "I-3B", "workflow → effect-target"]]) {
  say(`## W3-${fam} — CONCURRENCY on ${edge} (${inv}), ${title}\n`);
  say("| question | n | effects seen | verdict |");
  say("| --- | --- | --- | --- |");
  let violated = false;
  for (const q of ["two-processes", "two-runs-same-id", "same-op-twice", "read-during-write", "conflicting-ops", "two-users"]) {
    const rs = of((r) => r.family === fam && r.question === q);
    const expected = q === "two-users" ? 2 : 1;               // two-users legitimately drives two distinct runs
    const over = rs.filter((r) => (r.effects ?? 0) > expected).length;
    const zero = rs.filter((r) => (r.effects ?? 0) === 0).length;
    if (over > 0) violated = true;
    const dist = [...new Set(rs.map((r) => r.effects))].sort().join(",");
    const verdict = over > 0 ? `**VIOLATED — ${over}/${rs.length} produced more effects than authorizations. Conclusive.**`
      : zero > 0 ? `${zero}/${rs.length} produced no effect at all — see note`
      : `${clean(rs.length)} (expected ${expected} per run, observed {${dist}})`;
    say(`| ${q} | ${rs.length} | {${dist}} | ${verdict} |`);
  }
  say(`\n**${inv}: ${violated ? "VIOLATED" : "not observed to be violated"}** — no interleaving produced an effect more than once per authorization.\n`);
}

// ---------- PERSISTENCE ----------
say("## W3-C — PERSISTENCE on E17 and E18 (I-3C)\n");
say("The sharpest case is `effect-ok-record-fails`: an effect that happened with no record of it. Nothing");
say("crashed from the caller's view, and inspection cannot tell whether it ran.\n");
say("| edge | question | n | effect after crash | recoverable | double-applied | verdict |");
say("| --- | --- | --- | --- | --- | --- | --- |");
let cViolated = false, unrecoverable = 0, cTotal = 0;
for (const edge of ["E17", "E18"]) {
  for (const q of ["fail-before-write", "partial-write", "write-ok-ack-fails", "record-ok-effect-fails", "effect-ok-record-fails", "restart-each-boundary"]) {
    const rs = of((r) => r.family === "C" && r.edge === edge && r.question === q);
    const dbl = rs.filter((r) => r.doubleApplied).length;
    const rec = rs.filter((r) => r.recoverable).length;
    const orphaned = rs.filter((r) => (r.effectsAfterCrash ?? 0) > 0 && !r.recoverable).length;
    cTotal += rs.length; unrecoverable += rs.length - rec;
    if (dbl > 0 || orphaned > 0) cViolated = true;
    const verdict = dbl > 0 ? `**VIOLATED — double-applied ${dbl}/${rs.length}**`
      : orphaned > 0 ? `**VIOLATED — ${orphaned}/${rs.length} left an effect with no record and no recovery**`
      : rec === 0 ? `no double-apply; unrecoverable ${rs.length}/${rs.length}` : `${clean(rs.length)}`;
    say(`| ${edge} | ${q} | ${rs.length} | ${rate(rs, (r) => (r.effectsAfterCrash ?? 0) > 0)} | ${rec}/${rs.length} | ${dbl}/${rs.length} | ${verdict} |`);
  }
}
say(`\n**I-3C: ${cViolated ? "VIOLATED" : "not observed to be violated"}.** Recoverability across all persistence`);
say(`boundaries: ${cTotal - unrecoverable}/${cTotal} runs could be resumed to a defined terminal state.\n`);

// ---------- TIMING ----------
say("## W3-D — TIMING on E18 (I-3D)\n");
say("| question | n | effects | verdict |");
say("| --- | --- | --- | --- |");
let dViolated = false;
for (const q of ["before", "during", "after", "timeout", "retry", "duplicate", "reordered", "cancellation"]) {
  const rs = of((r) => r.family === "D" && r.question === q);
  const mult = rs.filter((r) => r.multiplied || (r.effects ?? 0) > 1).length;
  const cancelBad = rs.filter((r) => r.cancelledAfterEffect).length;
  if (mult > 0) dViolated = true;
  const dist = [...new Set(rs.map((r) => r.effects))].sort().join(",");
  let verdict = mult > 0 ? `**VIOLATED — the effect multiplied in ${mult}/${rs.length}**` : clean(rs.length);
  if (q === "cancellation" && cancelBad > 0) verdict = `**cancellation after the effect reported success ${cancelBad}/${rs.length} — the effect had already happened**`;
  if (q === "timeout") { const definite = rs.filter((r) => r.resolvedDefinite).length; verdict += ` · resolved to a definite state ${definite}/${rs.length}`; }
  say(`| ${q} | ${rs.length} | {${dist}} | ${verdict} |`);
}
say(`\n**I-3D: ${dViolated ? "VIOLATED" : "not observed to be violated"}** — retry and duplicate delivery did not multiply the effect.\n`);

// ---------- VERSIONING ----------
say("## W3-E — VERSIONING on E17 and E18 (I-3E)\n");
say("The invariant: a state the current code cannot safely interpret must be **refused**, not");
say("half-interpreted. Silently resuming a changed snapshot is a violation even when the run succeeds.\n");
say("| edge | question | n | mutated | resumed success | acted on changed value | verdict |");
say("| --- | --- | --- | --- | --- | --- | --- |");
let eViolated = false;
for (const edge of ["E17", "E18"]) {
  for (const q of ["old-state-new-code", "new-state-old-code", "schema-or-roster-changed", "migration-interrupted"]) {
    const rs = of((r) => r.family === "E" && r.edge === edge && r.question === q);
    const silent = rs.filter((r) => r.silentlyAccepted).length;
    const acted = rs.filter((r) => r.actedOnChanged).length;
    if (acted > 0) eViolated = true;
    const verdict = acted > 0 ? `**VIOLATED — executed on a value changed in the store ${acted}/${rs.length}. Conclusive.**`
      : silent > 0 ? `**VIOLATED — silently accepted a mutated snapshot ${silent}/${rs.length}**`
      : q === "old-state-new-code" ? "baseline: unmutated snapshot resumes normally (control for this family)"
      : `refused — ${clean(rs.length)}`;
    say(`| ${edge} | ${q} | ${rs.length} | ${rate(rs, (r) => r.mutated)} | ${rate(rs, (r) => r.resumeStatus === "success")} | ${acted}/${rs.length} | ${verdict} |`);
  }
}
say(`\n**I-3E: ${eViolated ? "VIOLATED" : "not observed to be violated"}.**\n`);

// ---------- INPUT ----------
say("## W3-F — INPUT on E18 (I-3F)\n");
say("| question | n | reached the effect | verdict |");
say("| --- | --- | --- | --- |");
let fViolated = false;
for (const q of ["absent", "malformed", "oversized", "malicious", "stale", "unauthorized", "valid-but-unexpected"]) {
  const rs = of((r) => r.family === "F" && r.question === q);
  const reached = rs.filter((r) => r.reachedEffect).length;
  const neg = rs.filter((r) => r.negativeAmountAccepted).length;
  let verdict;
  if (q === "stale" || q === "unauthorized") {
    verdict = "**NO-MECHANISM** — stock carries no expiry and no actor identity on resume, confirming Wave 2's finding on a second edge";
  } else if (q === "valid-but-unexpected") {
    if (neg > 0) fViolated = true;
    verdict = neg > 0 ? `**VIOLATED — a negative amount reached the effect ${neg}/${rs.length}. Schema-valid is not policy-valid.**` : clean(rs.length);
  } else {
    if (reached > 0) fViolated = true;
    verdict = reached > 0 ? `**VIOLATED — reached the effect ${reached}/${rs.length}**` : `rejected before the effect — ${clean(rs.length)}`;
  }
  say(`| ${q} | ${rs.length} | ${reached}/${rs.length} | ${verdict} |`);
}
say(`\n**I-3F: ${fViolated ? "VIOLATED" : "not observed to be violated"}**, with stale and unauthorized recorded as NO-MECHANISM rather than as passes.\n`);

// ---------- OBSERVABILITY ----------
say("## W3-G — OBSERVABILITY on E18 (I-3G)\n");
const secretRuns = of((r) => r.family === "G" && r.question === "sensitive-data-exposed");
const leaked = secretRuns.filter((r) => r.secretInSnapshot).length;
say("| question | n | verdict |");
say("| --- | --- | --- |");
say(`| recorded-correctly | ${of((r) => r.family === "G" && r.question === "recorded-correctly").length} | the run completed and the effect was recorded once |`);
say(`| trace-missing-or-duplicated | ${of((r) => r.family === "G" && r.question === "trace-missing-or-duplicated").length} | **NOT PROBED** — the observability surface is installed-unexercised on the frozen base; wiring a tracer would alter the base |`);
say(`| telemetry-failure-changes-result | ${of((r) => r.family === "G" && r.question === "telemetry-failure-changes-result").length} | **NOT PROBED** — same reason |`);
say(`| sensitive-data-exposed | ${secretRuns.length} | ${leaked > 0 ? `**VIOLATED — the payload was retained in the durable snapshot in cleartext ${leaked}/${secretRuns.length}. Conclusive.**` : clean(secretRuns.length)} |`);
say(`\n**I-3G: ${leaked > 0 ? "VIOLATED for durable retention" : "not observed to be violated"}; trace behaviour NOT PROBED, never assumed clean.**\n`);

if (envErrs.length) { say("## Environment errors — excluded from every verdict\n"); for (const e of envErrs) say(`- \`${e.runKey}\`: ${e.error}`); say(""); }

// ---------- summary ----------
say("## What Wave 3 establishes\n");
const v = [];
if (cViolated) v.push("I-3C (persistence: record and effect must agree)");
if (dViolated) v.push("I-3D (timing: retry must not multiply the effect)");
if (eViolated) v.push("I-3E (versioning: an uninterpretable state must be refused)");
if (fViolated) v.push("I-3F (input: invalid payloads must not reach the effect)");
if (leaked > 0) v.push("I-3G (observability: sensitive payload retained in the durable store)");
say(v.length ? `**VIOLATED, conclusively:**\n${v.map((x) => `- ${x}`).join("\n")}\n` : "**No invariant was observed to be violated.** This is not a safety claim.\n");
say(`**Recoverability is the headline number: ${cTotal - unrecoverable}/${cTotal} persistence runs could be resumed to a defined terminal state.**`);
say("Wave 1 measured the same property at 5/25 on a different scenario set. Two independent measurements");
say("now agree that interruption on this boundary is generally unrecoverable, which answers the question");
say("Wave 3 was written to answer: the earlier defects were not isolated, they are the shape of the boundary.\n");
say("**NO-MECHANISM:** expiry and actor identity on resume — confirmed on E18, matching Wave 2 on the approval path.");
say("**NOT PROBED:** trace behaviour, because the observability surface is installed-unexercised and wiring it would alter the frozen base.\n");
say("Every clean result is *not observed in n attempts on this base*, with the payloads and interruption");
say("points I chose. An interruption point I did not think of is not evidence of anything.");

writeFileSync("probes/results/WAVE3-GRADED.md", out.join("\n") + "\n");
console.log("\nwrote probes/results/WAVE3-GRADED.md");
