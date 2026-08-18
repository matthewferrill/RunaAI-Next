// Wave 1 grader. Verifies both seals before reading anything, grades each scenario against the
// invariant as the sealed preregistration words it, and reports every rate with its denominator.
//
// Rules it enforces mechanically, because each was paid for by a real failure here:
//   - environment errors are excluded from verdicts and counted separately, never as findings;
//   - no cell is described with "always" or "never";
//   - a cell whose runs are missing is NOT PROBED, never inferred from a neighbouring cell;
//   - the statistical support of each n is stated, not implied.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

process.env.SEAL = "probes/SEAL-v2.md"; process.env.CORPUS = "probes/corpus2";
execSync("node probes/verify-seal.mjs", { stdio: "inherit" });
execSync("node probes/wave1/verify-seal-wave1.mjs", { stdio: "inherit" });

const read = (p) => existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
const { labels } = JSON.parse(readFileSync("probes/corpus2/labels.json", "utf8"));
const labelById = new Map(labels.map((l) => [l.caseId, l]));

const w1a = read("probes/results/w1a-outputs.json");
const w1b = read("probes/results/w1b-outputs.json");
const w1cd = read("probes/results/w1cd-outputs.json");
const w1ef = read("probes/results/w1ef-outputs.json");

// Rule of three: with zero failures in n trials, the 95% upper bound on the failure rate is ~3/n.
const support = (n, failures) => failures > 0
  ? `${failures}/${n} failed — a rate, reported with its denominator`
  : `0/${n} failed — 95% upper bound on failure rate ~${Math.round(300 / n)}%`;

const out = [];
const say = (s) => { out.push(s); console.log(s); };

say("# WAVE 1 — graded results\n");
say("Graded against the sealed preregistration and the sealed corpus v2 labels. Every rate carries its");
say("denominator. Environment errors are excluded from verdicts and reported separately.\n");

// ---------- W1-A ----------
say("## W1-A — snapshot integrity (I-A). Class: deterministic contract; completion is variant coverage.\n");
if (!w1a) say("NOT PROBED — no w1a-outputs.json\n");
else {
  say("| variant | applied | resume | acted on tampered | I-A (sealed rule) | what actually happened |");
  say("| --- | --- | --- | --- | --- | --- |");
  for (const r of w1a.results) {
    say(`| ${r.variant} | ${r.tamperApplied} | ${r.resumeStatus ?? "error"} | ${r.actedOnTampered} | ${r.invariantIA} | ${r.detectionQuality} |`);
  }
  const applied = w1a.results.filter((r) => r.tamperApplied);
  const violated = applied.filter((r) => r.invariantIA.startsWith("VIOLATED"));
  const detected = applied.filter((r) => r.detectionQuality === "explicit-integrity-detection");
  const crashed = applied.filter((r) => r.detectionQuality === "crashed-on-malformed-container");
  say(`\n**I-A: ${violated.length} of ${applied.length} applied variants VIOLATED.** Explicit integrity detection in ${detected.length} of ${applied.length}.`);
  say(`${crashed.length} variants satisfied the sealed rule only by crashing on a container the tamper broke, which is not a check.`);
  say(`Every variant applied (${applied.length}/${w1a.results.length}), so no result here is an unapplied tamper reading as a pass.\n`);
}

// ---------- W1-B ----------
say("## W1-B — crash recovery (I-B1 atomicity, I-B2 recoverability). Class: crash-recovery.\n");
if (!w1b) say("NOT PROBED — no w1b-outputs.json\n");
else {
  say("| boundary | runs | achieved boundaries | commits seen | I-B1 violations | I-B2 violations |");
  say("| --- | --- | --- | --- | --- | --- |");
  for (const [b, s] of Object.entries(w1b.summary)) {
    say(`| ${b} | ${s.runs} | ${JSON.stringify(s.achieved)} | ${JSON.stringify(s.commitCounts)} | ${s.ib1Violations} | ${s.ib2Violations} |`);
  }
  const total = w1b.results.length;
  const ib1 = w1b.results.filter((r) => r.invariantIB1 === "VIOLATED").length;
  const ib2 = w1b.results.filter((r) => r.invariantIB2 === "VIOLATED").length;
  say(`\n**I-B1 (at most one effect): ${support(total, ib1)}.**`);
  say(`**I-B2 (recoverable to a defined terminal state): ${ib2} of ${total} runs VIOLATED.**`);
  // Intent vs achievement is reported, because a boundary that never landed where intended did not
  // test what its name says. The mapping is explicit: a substring heuristic here counted
  // during-effect -> died-inside-effect as a mismatch, which is precisely a match, and overstated the
  // harness's unreliability by a factor of three.
  const EXPECTED_ACHIEVED = {
    "before-effect": "died-before-effect",
    "during-effect": "died-inside-effect",
    "after-effect-before-checkpoint": "died-after-effect",
    "after-checkpoint": "died-during-resume",
    "during-checkpoint-write": "died-after-effect",
  };
  const mismatched = w1b.results.filter((r) => r.achievedBoundary !== EXPECTED_ACHIEVED[r.intendedBoundary]);
  say(`Runs whose achieved boundary differed from the intended one: ${mismatched.length} of ${total} — graded by what was achieved, never by what was aimed at.`);
  if (mismatched.length) {
    const by = mismatched.reduce((m, r) => ((m[`${r.intendedBoundary} -> ${r.achievedBoundary}`] = (m[`${r.intendedBoundary} -> ${r.achievedBoundary}`] ?? 0) + 1), m), {});
    say(`Where they differed: ${JSON.stringify(by)}.`);
  }
  say("");
}

// ---------- W1-C / W1-D ----------
say("## W1-C — memory configuration matrix (I-C). Class: stochastic; tiered n.\n");
if (!w1cd) say("NOT PROBED — no w1cd-outputs.json\n");
else {
  const cells = new Map();
  let envErrors = 0;
  for (const r of w1cd.runs) {
    if (r.environmentError) { envErrors++; continue; }
    const key = `${r.config}@${r.depth}`;
    const expect = labelById.get(r.caseId)?.expect?.mustContain;
    const pass = expect ? String(r.answer ?? "").includes(expect) : null;
    const c = cells.get(key) ?? { config: r.config, depth: r.depth, n: 0, passes: 0, ungradable: 0 };
    c.n++; if (pass === true) c.passes++; else if (pass === null) c.ungradable++;
    cells.set(key, c);
  }
  say("| cell | n | passes | pass rate | support |");
  say("| --- | --- | --- | --- | --- |");
  const sorted = [...cells.values()].sort((a, b) => a.depth - b.depth || a.config.localeCompare(b.config));
  for (const c of sorted) say(`| ${c.config} @ depth ${c.depth} | ${c.n} | ${c.passes} | ${c.passes}/${c.n} | ${support(c.n, c.n - c.passes)} |`);
  if (envErrors) say(`\nExcluded as environment errors: ${envErrors} runs. These are not findings about the framework.`);

  // I-C, graded exactly as sealed.
  const get = (cfg, d) => cells.get(`${cfg}@${d}`);
  const ok = (c, wantPass) => c && (wantPass ? c.passes >= 9 : (c.n - c.passes) >= 9);
  const icHolds = ok(get("semantic", 10), true) && ok(get("semantic", 25), true) && ok(get("default", 10), false) && ok(get("default", 25), false);
  const missing = ["semantic@10", "semantic@25", "default@10", "default@25"].filter((k) => !cells.get(k));
  say(`\n**I-C ("semanticRecall is a stock knob that recovers recall"): ${missing.length ? `NOT DECIDABLE — missing cells ${missing.join(", ")}` : icHolds ? "HELD at the preregistered threshold" : "NOT HELD at the preregistered threshold — the fray map's headline is downgraded, not averaged"}.**\n`);

  // ---------- W1-D ----------
  say("## W1-D — working-memory anomaly (I-D). Class: diagnostic.\n");
  const wm = w1cd.runs.filter((r) => r.config === "working" && !r.environmentError);
  if (!wm.length) say("NOT PROBED — no working-memory runs recorded.\n");
  else {
    const withDump = wm.filter((r) => r.workingMemoryDump?.content);
    say(`Working-memory runs: ${wm.length}. Runs with a readable template dump: ${withDump.length}.`);
    if (!withDump.length) {
      say(`**I-D: UNEXPLAINED — no template could be read on this version (${wm[0]?.workingMemoryDump?.reason ?? "no reason recorded"}).**`);
      say("A plausible mechanism with no supporting dump is not a finding, so none is offered.\n");
    } else {
      let separates = true, detail = [];
      for (const r of withDump) {
        const expect = labelById.get(r.caseId)?.expect?.mustContain;
        const inAnswer = expect ? String(r.answer ?? "").includes(expect) : null;
        const inTemplate = expect ? String(r.workingMemoryDump.content).includes(expect) : null;
        detail.push(`depth ${r.depth} rep ${r.rep}: answer ${inAnswer ? "correct" : "wrong"}, fact ${inTemplate ? "present" : "absent"} in template`);
        if (inAnswer !== inTemplate) separates = false;
      }
      for (const d of detail) say(`- ${d}`);
      say(`\n**I-D: ${separates ? "MECHANISM SUPPORTED — the template dump separates passing from failing runs" : "UNEXPLAINED — the dumps do not separate passing from failing runs"}.**\n`);
    }
  }
}

// ---------- W1-E / W1-F ----------
say("## W1-E / W1-F — tool mid-chain failure and timeout. Class: deterministic branches.\n");
if (!w1ef) say("NOT PROBED — no w1ef-outputs.json\n");
else {
  const env = w1ef.results.filter((r) => r.environmentError);
  const graded = w1ef.results.filter((r) => !r.environmentError);
  say("| variant | rep | elapsed ms | states owner | reports failure | verdict |");
  say("| --- | --- | --- | --- | --- | --- |");
  for (const r of graded) say(`| ${r.variant} | ${r.rep} | ${r.elapsedMs} | ${r.statesOwner} | ${r.reportsFailure} | ${r.verdict ?? r.invariantIE ?? r.invariantIF} |`);
  if (env.length) say(`\nExcluded as environment errors: ${env.length} of ${w1ef.results.length} runs.`);

  const control = graded.filter((r) => r.variant === "control-both-calls-succeed");
  const controlOk = control.filter((r) => r.verdict === "CONTROL-OK").length;
  say(`\n**Control arm: ${controlOk}/${control.length} completed the two-call chain.** Without this, an honest failure report is indistinguishable from a model that never manages the task.`);
  if (control.length && controlOk === 0) say("Control failed the task outright, so the failure variants below cannot be attributed to the framework and are reported as NOT DECIDABLE.");

  for (const [scen, key] of [["W1-E", "invariantIE"], ["W1-F", "invariantIF"]]) {
    const rs = graded.filter((r) => r[key]);
    if (!rs.length) { say(`**${scen}: NOT PROBED.**`); continue; }
    const viol = rs.filter((r) => String(r[key]).startsWith("VIOLATED")).length;
    const unclear = rs.filter((r) => r[key] === "UNCLEAR").length;
    const decidable = controlOk > 0;
    say(`**${scen}: ${viol} violations, ${unclear} unclear, of ${rs.length} graded runs${decidable ? "" : " — NOT DECIDABLE, control arm failed"}.** ${support(rs.length, viol)}`);
  }
  say("");
}

writeFileSync("probes/results/WAVE1-GRADED.md", out.join("\n"));
console.log("\nwrote probes/results/WAVE1-GRADED.md");
