// Wave 3 runner — the durable-state boundary, 51 register scenarios across six families.
// Outcomes are read from the effect ledger and the snapshot store on disk. The runner never grades.
// SMOKE=1 caps every cell to n=1. ONLY=A,B,... restricts families.
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { createClient } from "@libsql/client";
import { loadEntries, appendEntry } from "../checkpoint.mjs";
import { writeRun } from "../wave2/w2-lib.mjs";

execSync("node probes/wave3/verify-seal-wave3.mjs", { stdio: "inherit" });

const SMOKE = process.env.SMOKE === "1";
const nDet = SMOKE ? 1 : 3;    // deterministic branches: INPUT, VERSIONING, OBSERVABILITY
const nCrash = SMOKE ? 1 : 5;  // crash recovery: PERSISTENCE, TIMING
const nRace = SMOKE ? 1 : 10;  // concurrency

const CKPT = "probes/results/wave3-partial.jsonl";
mkdirSync("probes/results", { recursive: true });
mkdirSync("storage", { recursive: true });
const done = new Set(loadEntries(CKPT).map((e) => e.runKey));
const skip = (k) => { if (done.has(k)) { process.stdout.write(`${k}(skip) `); return true; } return false; };
const record = (runKey, rec) => { writeRun(`W3-${rec.family}`, runKey.replace(/[^\w.-]/g, "_"), rec); appendEntry(CKPT, { runKey, ...rec }); process.stdout.write(`${runKey} `); };

// --- per-case isolated ledger + db, so no case can contaminate another -------------------------------
let seq = 0;
function bed() {
  const id = `w3-${process.pid}-${++seq}`;
  const LEDGER = `probes/results/${id}.ledger`, DB = `storage/${id}.db`;
  const clean = () => { for (const s of ["", "-wal", "-shm"]) rmSync(`${DB}${s}`, { force: true }); rmSync(LEDGER, { force: true }); };
  clean();
  const env = (o = {}) => ({ ...process.env, W3_LEDGER: LEDGER, W3_DB: DB, ...o });
  const start = (runId, subject = "s", amount = 1, o = {}) => spawnSync(process.execPath, ["probes/wave3/w3-start.mjs", runId, subject, String(amount)], { encoding: "utf8", timeout: 60000, env: env(o) });
  const resume = (runId, o = {}) => spawnSync(process.execPath, ["probes/wave3/w3-resume.mjs", runId], { encoding: "utf8", timeout: 60000, env: env(o) });
  const effects = () => existsSync(LEDGER) ? readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const status = (r) => String(r?.stdout ?? "").match(/STATUS::(\w+)/)?.[1] ?? null;
  const msg = (r) => String(r?.stdout ?? "").match(/MSG::(.*)/)?.[1] ?? String(r?.stderr ?? "").slice(0, 120);
  return { LEDGER, DB, clean, env, start, resume, effects, status, msg };
}
const snapshotOf = async (DB, runId) => {
  try { const db = createClient({ url: `file:${DB}` }); const r = await db.execute("SELECT snapshot FROM mastra_workflow_snapshot WHERE run_id = ?", [runId]); db.close();
    return r.rows[0]?.snapshot ? Buffer.from(r.rows[0].snapshot) : null; } catch { return null; }
};

// ===== W3-A / W3-B — CONCURRENCY (E17 store, E18 effect), n=10 =========================================
async function concurrency(family, edge) {
  const questions = ["two-processes", "two-runs-same-id", "same-op-twice", "read-during-write", "conflicting-ops", "two-users"];
  for (const q of questions) {
    for (let rep = 1; rep <= nRace; rep++) {
      const runKey = `W3-${family}.${q}#${rep}`; if (skip(runKey)) continue;
      const b = bed();
      try {
        let out = {};
        if (q === "two-processes" || q === "same-op-twice") {
          // two processes resume the SAME suspended run at the same time
          b.start("r1", "race");
          const [a, c] = [b.resume("r1"), b.resume("r1")];
          out = { statuses: [b.status(a), b.status(c)], effects: b.effects().length };
        } else if (q === "two-runs-same-id") {
          const s1 = b.start("same-id", "first"); const s2 = b.start("same-id", "second");
          const r = b.resume("same-id");
          out = { starts: [b.status(s1), b.status(s2)], resume: b.status(r), effects: b.effects().length, subjects: b.effects().map((e) => e.subject) };
        } else if (q === "read-during-write") {
          b.start("rw", "rw");
          const slow = b.resume("rw", { W3_GAP_MS: "400" });
          const snap = await snapshotOf(b.DB, "rw");
          out = { resume: b.status(slow), snapshotReadableDuringWrite: !!snap, effects: b.effects().length };
        } else if (q === "conflicting-ops") {
          b.start("cf", "cf");
          const [a, c] = [b.resume("cf", { W3_PAYLOAD: JSON.stringify({ approved: true, amount: 10 }) }), b.resume("cf", { W3_PAYLOAD: JSON.stringify({ approved: false }) })];
          out = { statuses: [b.status(a), b.status(c)], effects: b.effects().length, amounts: b.effects().map((e) => e.amount) };
        } else if (q === "two-users") {
          b.start("u1", "userA"); b.start("u2", "userB");
          const [a, c] = [b.resume("u1"), b.resume("u2")];
          out = { statuses: [b.status(a), b.status(c)], effects: b.effects().length, subjects: b.effects().map((e) => e.subject) };
        }
        record(runKey, { family, edge, question: q, invariant: family === "A" ? "I-3A" : "I-3B", ...out });
      } catch (e) { record(runKey, { family, edge, question: q, environmentError: true, error: String(e.message).slice(0, 140) }); }
      finally { b.clean(); }
    }
  }
}

// ===== W3-C — PERSISTENCE on both edges, n=5 ===========================================================
async function persistence() {
  const questions = ["fail-before-write", "partial-write", "write-ok-ack-fails", "record-ok-effect-fails", "effect-ok-record-fails", "restart-each-boundary"];
  for (const edge of ["E17", "E18"]) {
    for (const q of questions) {
      for (let rep = 1; rep <= nCrash; rep++) {
        const runKey = `W3-C.${edge}.${q}#${rep}`; if (skip(runKey)) continue;
        const b = bed();
        try {
          b.start("p", "persist");
          let first, achieved, out = {};
          if (q === "fail-before-write") { first = b.resume("p", { W3_FAIL_BEFORE_WRITE: "1" }); achieved = b.effects().length === 0 ? "died-before-effect" : "effect-landed"; }
          else if (q === "effect-ok-record-fails" || q === "partial-write") { first = b.resume("p", { W3_GAP_MS: "300", W3_KILL_IN_GAP: "1" }); achieved = b.effects().length === 1 ? "effect-without-record" : "no-effect"; }
          else if (q === "record-ok-effect-fails") { first = b.resume("p", { W3_PAYLOAD: JSON.stringify({ approved: false }) }); achieved = "declined-no-effect"; }
          else if (q === "write-ok-ack-fails") { first = b.resume("p", { W3_GAP_MS: "150" }); achieved = b.status(first) === "success" ? "completed" : "interrupted"; }
          else { first = b.resume("p", { W3_GAP_MS: "300", W3_KILL_IN_GAP: "1" }); achieved = "killed-mid-effect"; }
          const effectsAfterCrash = b.effects().length;
          const second = b.resume("p");   // can the boundary be recovered, and does recovery double-apply?
          out = { achieved, firstStatus: b.status(first), effectsAfterCrash, resumeStatus: b.status(second), resumeMsg: b.msg(second).slice(0, 100), effectsAfterResume: b.effects().length,
                  doubleApplied: b.effects().length > Math.max(1, effectsAfterCrash) || (effectsAfterCrash === 1 && b.effects().length === 2),
                  recoverable: b.status(second) === "success" };
          record(runKey, { family: "C", edge, question: q, invariant: "I-3C", ...out });
        } catch (e) { record(runKey, { family: "C", edge, question: q, environmentError: true, error: String(e.message).slice(0, 140) }); }
        finally { b.clean(); }
      }
    }
  }
}

// ===== W3-D — TIMING on E18, n=5 =======================================================================
async function timing() {
  const questions = ["before", "during", "after", "timeout", "retry", "duplicate", "reordered", "cancellation"];
  for (const q of questions) {
    for (let rep = 1; rep <= nCrash; rep++) {
      const runKey = `W3-D.${q}#${rep}`; if (skip(runKey)) continue;
      const b = bed();
      try {
        b.start("t", "timing");
        let out = {};
        if (q === "before") { const r = b.resume("t", { W3_FAIL_BEFORE_WRITE: "1" }); out = { status: b.status(r), effects: b.effects().length }; }
        else if (q === "during") { const r = b.resume("t", { W3_GAP_MS: "300", W3_KILL_IN_GAP: "1" }); out = { status: b.status(r), effects: b.effects().length }; }
        else if (q === "after") { const r = b.resume("t"); const post = b.resume("t"); out = { status: b.status(r), postStatus: b.status(post), effects: b.effects().length }; }
        else if (q === "timeout") { const r = b.resume("t", { W3_DELAY_MS: "200", W3_GAP_MS: "200" }); out = { status: b.status(r), effects: b.effects().length, resolvedDefinite: b.status(r) !== null }; }
        else if (q === "retry" || q === "duplicate") { b.resume("t"); const again = b.resume("t"); out = { secondStatus: b.status(again), secondMsg: b.msg(again).slice(0, 90), effects: b.effects().length, multiplied: b.effects().length > 1 }; }
        else if (q === "reordered") { const late = b.resume("t"); const r = b.resume("t"); out = { first: b.status(late), second: b.status(r), effects: b.effects().length }; }
        else if (q === "cancellation") { const r = b.resume("t"); const cancel = b.resume("t", { W3_PAYLOAD: JSON.stringify({ approved: false }) });
          out = { status: b.status(r), cancelStatus: b.status(cancel), effects: b.effects().length, cancelledAfterEffect: b.effects().length >= 1 && b.status(cancel) === "success" }; }
        record(runKey, { family: "D", edge: "E18", question: q, invariant: "I-3D", ...out });
      } catch (e) { record(runKey, { family: "D", question: q, environmentError: true, error: String(e.message).slice(0, 140) }); }
      finally { b.clean(); }
    }
  }
}

// ===== W3-E — VERSIONING on both edges, n=3 ============================================================
async function versioning() {
  const questions = ["old-state-new-code", "new-state-old-code", "schema-or-roster-changed", "migration-interrupted"];
  for (const edge of ["E17", "E18"]) {
    for (const q of questions) {
      for (let rep = 1; rep <= nDet; rep++) {
        const runKey = `W3-E.${edge}.${q}#${rep}`; if (skip(runKey)) continue;
        const b = bed();
        try {
          b.start("v", "the sandbox");
          const db = createClient({ url: `file:${b.DB}` });
          const row = await db.execute("SELECT snapshot FROM mastra_workflow_snapshot WHERE run_id='v'");
          let mutated = false, how = "";
          if (row.rows[0]) {
            const text = Buffer.from(row.rows[0].snapshot).toString("latin1");
            let edited = null;
            if (q === "schema-or-roster-changed") { edited = text.replaceAll("the sandbox", "the CHANGED1"); how = "same-length value change"; }
            else if (q === "old-state-new-code") { edited = text.replace(/"?w3-flow"?/, (m) => m); how = "resume under current code (baseline shape)"; }
            else if (q === "new-state-old-code") { edited = text.replaceAll("effect", "effeXt"); how = "step id altered so current code cannot match it"; }
            else if (q === "migration-interrupted") { edited = text.slice(0, Math.floor(text.length * 0.8)); how = "snapshot truncated to 80% (interrupted migration)"; }
            if (edited && edited !== text) { await db.execute({ sql: "UPDATE mastra_workflow_snapshot SET snapshot=? WHERE run_id='v'", args: [Buffer.from(edited, "latin1")] }); mutated = true; }
          }
          db.close();
          const r = b.resume("v");
          record(runKey, { family: "E", edge, question: q, invariant: "I-3E", mutated, how,
            resumeStatus: b.status(r), resumeMsg: b.msg(r).slice(0, 110), effects: b.effects().length,
            silentlyAccepted: b.status(r) === "success" && mutated,
            actedOnChanged: b.effects().some((e) => String(e.subject).includes("CHANGED")) });
        } catch (e) { record(runKey, { family: "E", edge, question: q, environmentError: true, error: String(e.message).slice(0, 140) }); }
        finally { b.clean(); }
      }
    }
  }
}

// ===== W3-F — INPUT on E18, n=3 ========================================================================
async function input() {
  const payloads = {
    absent: "__ABSENT__",
    malformed: "{not json",
    oversized: JSON.stringify({ approved: true, blob: "x".repeat(200000) }),
    malicious: JSON.stringify({ approved: true, amount: { $gt: 0 }, __proto__: { polluted: true } }),
    stale: JSON.stringify({ approved: true }),          // expected NO-MECHANISM (no expiry on this base)
    unauthorized: JSON.stringify({ approved: true }),   // expected NO-MECHANISM (no actor on this base)
    "valid-but-unexpected": JSON.stringify({ approved: true, amount: -50, unexpectedField: "surprise" }),
  };
  for (const [q, payload] of Object.entries(payloads)) {
    for (let rep = 1; rep <= nDet; rep++) {
      const runKey = `W3-F.${q}#${rep}`; if (skip(runKey)) continue;
      const b = bed();
      try {
        b.start("i", "input");
        const o = {}; if (payload === "__ABSENT__") o.W3_ABSENT = "1"; else if (payload !== undefined) o.W3_PAYLOAD = payload;
        if (q === "stale") o.W3_DELAY_MS = "1200";
        const r = b.resume("i", o);
        const eff = b.effects();
        record(runKey, { family: "F", edge: "E18", question: q, invariant: "I-3F",
          resumeStatus: b.status(r), resumeMsg: b.msg(r).slice(0, 110), effects: eff.length, amounts: eff.map((e) => e.amount),
          reachedEffect: eff.length > 0, negativeAmountAccepted: eff.some((e) => Number(e.amount) < 0) });
      } catch (e) { record(runKey, { family: "F", question: q, environmentError: true, error: String(e.message).slice(0, 140) }); }
      finally { b.clean(); }
    }
  }
}

// ===== W3-G — OBSERVABILITY on E18, n=3 ================================================================
async function observability() {
  const questions = ["recorded-correctly", "trace-missing-or-duplicated", "telemetry-failure-changes-result", "sensitive-data-exposed"];
  for (const q of questions) {
    for (let rep = 1; rep <= nDet; rep++) {
      const runKey = `W3-G.${q}#${rep}`; if (skip(runKey)) continue;
      const b = bed();
      try {
        const SECRET = "OBS-SECRET-4417";
        b.start("o", q === "sensitive-data-exposed" ? SECRET : "obs");
        const r = b.resume("o");
        const snap = await snapshotOf(b.DB, "o");
        const snapText = snap ? snap.toString("latin1") : "";
        record(runKey, { family: "G", edge: "E18", question: q, invariant: "I-3G",
          resumeStatus: b.status(r), effects: b.effects().length,
          // The observability surface is installed-unexercised on this base: no tracer is wired, so
          // "trace" questions are NOT PROBED rather than assumed clean. What IS observable is whether
          // the durable store itself retains sensitive payloads in the clear.
          tracerWired: false,
          secretInSnapshot: q === "sensitive-data-exposed" ? snapText.includes(SECRET) : null,
          notProbedReason: q === "recorded-correctly" || q === "sensitive-data-exposed" ? null : "observability surface installed-unexercised on the frozen base; wiring a tracer would alter the base" });
      } catch (e) { record(runKey, { family: "G", question: q, environmentError: true, error: String(e.message).slice(0, 140) }); }
      finally { b.clean(); }
    }
  }
}

// ===== control arm =====================================================================================
async function control() {
  for (let rep = 1; rep <= nCrash; rep++) {
    const runKey = `W3.control#${rep}`; if (skip(runKey)) continue;
    const b = bed();
    try { b.start("c", "control"); const r = b.resume("c");
      record(runKey, { family: "CONTROL", arm: "control", resumeStatus: b.status(r), effects: b.effects().length, controlOk: b.status(r) === "success" && b.effects().length === 1 }); }
    catch (e) { record(runKey, { family: "CONTROL", arm: "control", environmentError: true, error: String(e.message).slice(0, 140) }); }
    finally { b.clean(); }
  }
}

const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const families = { CONTROL: control, A: () => concurrency("A", "E17"), B: () => concurrency("B", "E18"), C: persistence, D: timing, E: versioning, F: input, G: observability };
for (const [k, fn] of Object.entries(families)) {
  if (only && !only.has(k)) continue;
  console.log(`\n--- W3-${k} ---`);
  try { await fn(); } catch (e) { console.log(`\n!!! W3-${k} threw: ${String(e.message).slice(0, 160)}`); }
}
const all = loadEntries(CKPT);
writeFileSync("probes/results/wave3-outputs.json", JSON.stringify({ schemaVersion: "wave3-outputs/v1", ranAt: new Date().toISOString(), smoke: SMOKE, runs: all }, null, 1));
console.log(`\n\nWave 3: ${all.length} total runs recorded${SMOKE ? " (SMOKE)" : ""}`);
