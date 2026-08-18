// Wave 1 W1-B — mid-effect crash recovery: 5 boundaries x 5 repetitions (WAVE1-PREREGISTRATION.md).
// I-B1 atomicity: the effect happens at most once across the original run and every resume.
// I-B2 recoverability: after any crash the run reaches a defined terminal state without manual repair.
//
// The intended boundary is produced by sleep placement, but the ACHIEVED boundary is derived from the
// ledger afterwards (BEGIN without COMMIT = died inside the effect). Where they disagree, the achieved
// one is authoritative — trusting a sleep to have landed where intended is how timing harnesses lie.
import { spawnSync } from "node:child_process";
import { rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const DB = "file:storage/w1b-workflows.db";
const LEDGER = "probes/results/w1b-ledger.txt";
const base = { W1_DB: DB, W1_LEDGER: LEDGER };
const clean = () => { for (const s of ["", "-wal", "-shm"]) rmSync(`storage/w1b-workflows.db${s}`, { force: true }); rmSync(LEDGER, { force: true }); };
const ledger = () => existsSync(LEDGER) ? readFileSync(LEDGER, "utf8").split("\n").filter(Boolean) : [];
const countOf = (kind) => ledger().filter((l) => l.startsWith(kind)).length;
const node = (script, args, extra = {}, timeout = 120000) =>
  spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout, env: { ...process.env, ...base, ...extra } });
const statusOf = (o) => String(o.stdout).match(/STATUS::(\w+)/)?.[1] ?? null;

// Each boundary: env that positions the sleep, and the kill timeout that lands the SIGKILL in it.
const BOUNDARIES = [
  { id: "before-effect", env: { W1_SLEEP_BEFORE_EFFECT: "4000" }, killAt: 1500, phase: "start" },
  { id: "during-effect", env: { W1_SLEEP_IN_EFFECT: "4000" }, killAt: 1500, phase: "start" },
  { id: "after-effect-before-checkpoint", env: { W1_SLEEP_AFTER_EFFECT: "4000" }, killAt: 1500, phase: "start" },
  { id: "after-checkpoint", env: {}, killAt: 300, phase: "resume" },
  { id: "during-checkpoint-write", env: { W1_SLEEP_AFTER_EFFECT: "150" }, killAt: 900, phase: "start",
    approximate: "kill timing targets the snapshot write; the achieved boundary is read from the ledger and snapshot state, never assumed" },
];
const REPS = Number(process.env.W1B_REPS ?? 5);

const results = [];
mkdirSync("probes/results", { recursive: true });

for (const b of BOUNDARIES) {
  for (let rep = 1; rep <= REPS; rep++) {
    clean();
    const runId = `w1b-${b.id}-${rep}`;
    let killed = null, startStatus = null;

    if (b.phase === "start") {
      // SIGKILL by timeout: no cleanup handlers run, which is the point.
      killed = node("probes/wave1/w1-start.mjs", [runId, "subject"], b.env, b.killAt);
      startStatus = statusOf(killed);
    } else {
      const s = node("probes/wave1/w1-start.mjs", [runId, "subject"], {});
      startStatus = statusOf(s);
      killed = node("probes/wave1/w1-resume.mjs", [runId], { W1_SLEEP_IN_RESUME: "4000" }, b.killAt);
    }

    const beganAfterKill = countOf("BEGIN:");
    const committedAfterKill = countOf("COMMIT:");
    // Achieved boundary, derived from evidence rather than from the sleep that was intended.
    const achieved = beganAfterKill === 0 ? "died-before-effect"
      : committedAfterKill < beganAfterKill ? "died-inside-effect"
      : b.phase === "resume" ? "died-during-resume" : "died-after-effect";

    const resume = node("probes/wave1/w1-resume.mjs", [runId], {});
    const resumeStatus = statusOf(resume);
    const stderr = String(resume.stderr);
    const totalCommits = countOf("COMMIT:");

    results.push({
      scenario: "W1-B", boundary: b.id, rep, runId,
      intendedBoundary: b.id, achievedBoundary: achieved, approximateNote: b.approximate ?? null,
      killedBySignal: killed.signal ?? null, killTimeoutMs: b.killAt, startStatus,
      beginsAfterKill: beganAfterKill, commitsAfterKill: committedAfterKill,
      resumeStatus, resumeExitCode: resume.status,
      resumeError: stderr ? (stderr.split("\n").find((l) => /Error/.test(l)) ?? stderr.split("\n")[0] ?? "").slice(0, 160) : null,
      totalCommits,
      // I-B1: the effect must not have completed more than once in total.
      invariantIB1: totalCommits <= 1 ? "HELD" : "VIOLATED",
      // I-B2: a defined terminal state without hand-repairing the store. A resume that neither
      // succeeds nor cleanly reports failure leaves the run stranded.
      invariantIB2: resumeStatus === "success" || resumeStatus === "failed" ? "HELD" : "VIOLATED",
    });
    process.stdout.write(`${b.id}#${rep} achieved=${achieved} commits=${totalCommits} resume=${resumeStatus}  `);
  }
  console.log();
}

const summary = {};
for (const r of results) {
  const k = r.boundary;
  summary[k] ??= { runs: 0, ib1Violations: 0, ib2Violations: 0, commitCounts: {}, achieved: {} };
  summary[k].runs++;
  if (r.invariantIB1 === "VIOLATED") summary[k].ib1Violations++;
  if (r.invariantIB2 === "VIOLATED") summary[k].ib2Violations++;
  summary[k].commitCounts[r.totalCommits] = (summary[k].commitCounts[r.totalCommits] ?? 0) + 1;
  summary[k].achieved[r.achievedBoundary] = (summary[k].achieved[r.achievedBoundary] ?? 0) + 1;
}
writeFileSync("probes/results/w1b-outputs.json", JSON.stringify({ scenario: "W1-B", reps: REPS, ranAt: new Date().toISOString(), summary, results }, null, 1));
console.log(`\nwrote ${results.length} W1-B runs (${REPS} per boundary)`);
console.log(JSON.stringify(summary, null, 1));
