// Constraint probe runner. I-C4 reads the snapshot store on disk; I-C2 reads the egress log.
// Neither verdict is taken from what the framework reports about itself.
// SMOKE=1 caps every cell to n=1. ONLY=C2,C4 restricts.
import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, cpSync, existsSync } from "node:fs";
import { loadEntries, appendEntry } from "../checkpoint.mjs";
import { writeRun } from "../wave5/w5-lib.mjs";
import { egressEntries, foreignDestinations, recorderArmed, grantedStateOnDisk, snapshotOf,
         replaceSnapshotBytes, writeSnapshot, ledgerEntries, freshLedger, cleanDb } from "./c-lib.mjs";

execSync("node probes/constraints/verify-seal.mjs", { stdio: "inherit" });

const SMOKE = process.env.SMOKE === "1";
const nDet = SMOKE ? 1 : 3;
const nCrash = SMOKE ? 1 : 5;

const CKPT = "probes/results/constraints-partial.jsonl";
mkdirSync("probes/results", { recursive: true }); mkdirSync("storage", { recursive: true });
const done = new Set(loadEntries(CKPT).map((e) => e.runKey));
const skip = (k) => { if (done.has(k)) { process.stdout.write(`${k}(skip) `); return true; } return false; };
const record = (runKey, rec) => { writeRun(`C-${rec.family}`, runKey.replace(/[^\w.-]/g, "_"), rec); appendEntry(CKPT, { runKey, ...rec }); process.stdout.write(`${runKey} `); };

let seq = 0;
const bed = () => {
  const id = `c-${process.pid}-${++seq}`;
  const DB = `storage/${id}.db`, LED = `probes/results/${id}.ledger`;
  cleanDb(DB); freshLedger(LED);
  const env = (o = {}) => ({ ...process.env, W3_DB: DB, W3_LEDGER: LED, ...o });
  const start = (runId, o = {}) => spawnSync(process.execPath, ["probes/wave3/w3-start.mjs", runId, "subject", "1"], { encoding: "utf8", timeout: 60000, env: env(o) });
  const resume = (runId, o = {}) => spawnSync(process.execPath, ["probes/wave3/w3-resume.mjs", runId], { encoding: "utf8", timeout: 60000, env: env(o) });
  const status = (r) => String(r?.stdout ?? "").match(/STATUS::(\w+)/)?.[1] ?? null;
  const clean = () => { cleanDb(DB); rmSync(LED, { force: true }); rmSync(`${DB}.bak`, { force: true }); };
  return { id, DB, LED, env, start, resume, status, clean };
};

// ===== I-C4 — approval is never a stored bit =========================================================
async function c4() {
  // C4-1: is a granted state readable on disk between the steward's act and the effect?
  // The window is created by the workflow's own gap knob, so the read happens while resume is still
  // in flight rather than after it returns.
  for (let rep = 1; rep <= nCrash; rep++) {
    const runKey = `C4-1.granted-state-persisted#${rep}`; if (skip(runKey)) continue;
    const b = bed();
    try {
      b.start("r1");
      const child = spawnSync(process.execPath, ["-e", `
        const { spawn } = require("node:child_process");
        const c = spawn(process.execPath, ["probes/wave3/w3-resume.mjs", "r1"],
          { env: { ...process.env, W3_DB: ${JSON.stringify(b.DB)}, W3_LEDGER: ${JSON.stringify(b.LED)}, W3_GAP_MS: "2500" }, stdio: "ignore" });
        setTimeout(() => { console.log("SAMPLED::1"); process.exit(0); }, 1200);
      `], { encoding: "utf8", timeout: 30000 });
      // Sample the store while the effect is mid-flight.
      const midSnap = await snapshotOf(b.DB, "r1");
      const mid = grantedStateOnDisk(midSnap);
      await new Promise((r) => setTimeout(r, 2500));
      const after = grantedStateOnDisk(await snapshotOf(b.DB, "r1"));
      record(runKey, { family: "C4", question: "granted-state-persisted", invariant: "I-C4",
        grantedDuringWindow: mid.granted, markersDuringWindow: mid.markers, bytesDuringWindow: mid.bytes ?? null,
        grantedAfter: after.granted, effects: ledgerEntries(b.LED).length,
        sampled: /SAMPLED::1/.test(String(child.stdout ?? "")) });
    } catch (e) { record(runKey, { family: "C4", question: "granted-state-persisted", environmentError: true, error: String(e.message).slice(0, 160) }); }
    finally { b.clean(); }
  }

  // C4-2: killed inside the window, does a granted state remain on disk?
  for (let rep = 1; rep <= nCrash; rep++) {
    const runKey = `C4-2.survives-crash#${rep}`; if (skip(runKey)) continue;
    const b = bed();
    try {
      b.start("r1");
      const r = b.resume("r1", { W3_GAP_MS: "800", W3_KILL_IN_GAP: "1" });
      const snap = await snapshotOf(b.DB, "r1");
      const s = grantedStateOnDisk(snap);
      record(runKey, { family: "C4", question: "survives-crash", invariant: "I-C4",
        killedInGap: true, grantedAfterCrash: s.granted, markers: s.markers, bytes: s.bytes ?? null,
        effects: ledgerEntries(b.LED).length, status: b.status(r) });
    } catch (e) { record(runKey, { family: "C4", question: "survives-crash", environmentError: true, error: String(e.message).slice(0, 160) }); }
    finally { b.clean(); }
  }

  // C4-3: REPLAY. Copy the store as it stood immediately after approval, restore it, resume again.
  // If the effect fires a second time with no new steward act, a stored bit became an unauthorised
  // effect. This is one of the two decisive scenarios.
  for (let rep = 1; rep <= nCrash; rep++) {
    const runKey = `C4-3.replayable#${rep}`; if (skip(runKey)) continue;
    const b = bed();
    try {
      b.start("r1");
      // Capture the store mid-resume, while any granted state would be at its most present.
      const capture = `${b.DB}.bak`;
      const c = spawnSync(process.execPath, ["-e", `
        const { spawn } = require("node:child_process");
        spawn(process.execPath, ["probes/wave3/w3-resume.mjs", "r1"],
          { env: { ...process.env, W3_DB: ${JSON.stringify(b.DB)}, W3_LEDGER: ${JSON.stringify(b.LED)}, W3_GAP_MS: "3000" }, stdio: "ignore" });
        setTimeout(() => process.exit(0), 1200);
      `], { encoding: "utf8", timeout: 30000 });
      if (existsSync(b.DB)) cpSync(b.DB, capture);
      await new Promise((r) => setTimeout(r, 3200));
      const effectsAfterFirst = ledgerEntries(b.LED).length;
      // Restore the captured store and resume again with NO new approval payload.
      cleanDb(b.DB); cpSync(capture, b.DB);
      const replay = b.resume("r1", { W3_ABSENT: "1" });
      const effectsAfterReplay = ledgerEntries(b.LED).length;
      record(runKey, { family: "C4", question: "replayable", invariant: "I-C4",
        effectsAfterFirst, effectsAfterReplay, replayStatus: b.status(replay),
        // The violation: an effect produced by restoring a record, with no fresh steward act.
        replayProducedEffect: effectsAfterReplay > effectsAfterFirst,
        captured: existsSync(capture), sampled: c.status === 0 });
    } catch (e) { record(runKey, { family: "C4", question: "replayable", environmentError: true, error: String(e.message).slice(0, 160) }); }
    finally { b.clean(); }
  }

  // C4-4: FORGE. Write a granted state directly into the snapshot and resume with no approval.
  // The second decisive scenario: can a tampered record claim an approval that was never granted?
  for (let rep = 1; rep <= nDet; rep++) {
    const runKey = `C4-4.forgeable#${rep}`; if (skip(runKey)) continue;
    const b = bed();
    try {
      b.start("r1");
      const snap = await snapshotOf(b.DB, "r1");
      // Turn the suspended marker into something that reads as granted, without changing length --
      // Wave 1 established that a different-length edit corrupts the container and crashes instead of
      // testing the property.
      const forged = snap ? replaceSnapshotBytes(snap, "suspended", "resumedXX") : null;
      let applied = false;
      if (forged && forged.length === snap.length) { await writeSnapshot(b.DB, "r1", forged); applied = true; }
      const r = b.resume("r1", { W3_ABSENT: "1" });
      record(runKey, { family: "C4", question: "forgeable", invariant: "I-C4",
        tamperApplied: applied, sameLength: forged ? forged.length === snap.length : null,
        effects: ledgerEntries(b.LED).length, status: b.status(r),
        // The violation: an effect executed on a forged record with no approval payload.
        forgeProducedEffect: applied && ledgerEntries(b.LED).length > 0 });
    } catch (e) { record(runKey, { family: "C4", question: "forgeable", environmentError: true, error: String(e.message).slice(0, 160) }); }
    finally { b.clean(); }
  }

  // C4-5: after execution, is a granted state still readable on disk?
  for (let rep = 1; rep <= nDet; rep++) {
    const runKey = `C4-5.cleared-after-use#${rep}`; if (skip(runKey)) continue;
    const b = bed();
    try {
      b.start("r1");
      const r = b.resume("r1");
      const s = grantedStateOnDisk(await snapshotOf(b.DB, "r1"));
      record(runKey, { family: "C4", question: "cleared-after-use", invariant: "I-C4",
        grantedAfterExecution: s.granted, markers: s.markers, bytes: s.bytes ?? null,
        effects: ledgerEntries(b.LED).length, status: b.status(r) });
    } catch (e) { record(runKey, { family: "C4", question: "cleared-after-use", environmentError: true, error: String(e.message).slice(0, 160) }); }
    finally { b.clean(); }
  }

  // C4-6: can a reader of the store tell awaiting-approval from approved?
  for (let rep = 1; rep <= nDet; rep++) {
    const runKey = `C4-6.pending-vs-granted#${rep}`; if (skip(runKey)) continue;
    const b = bed();
    try {
      b.start("r1");
      const pending = grantedStateOnDisk(await snapshotOf(b.DB, "r1"));
      b.resume("r1");
      const granted = grantedStateOnDisk(await snapshotOf(b.DB, "r1"));
      record(runKey, { family: "C4", question: "pending-vs-granted", invariant: "I-C4",
        pendingGranted: pending.granted, pendingMarkers: pending.markers, pendingBytes: pending.bytes ?? null,
        finalGranted: granted.granted, finalMarkers: granted.markers, finalBytes: granted.bytes ?? null,
        distinguishable: JSON.stringify(pending.markers) !== JSON.stringify(granted.markers) || pending.bytes !== granted.bytes,
        effects: ledgerEntries(b.LED).length });
    } catch (e) { record(runKey, { family: "C4", question: "pending-vs-granted", environmentError: true, error: String(e.message).slice(0, 160) }); }
    finally { b.clean(); }
  }
}

// ===== I-C2 — fully local, no outbound ==============================================================
const C2_SCRIPTS = {
  "import-only": `import "@mastra/core"; import "@mastra/memory"; import "@mastra/libsql"; import "@mastra/mcp"; console.log("DONE::1");`,
  "first-init": `import { Mastra } from "@mastra/core"; import { LibSQLStore } from "@mastra/libsql";
     const m = new Mastra({ storage: new LibSQLStore({ id: "c2", url: "file:__DB__" }) });
     await m.getStorage?.()?.init?.().catch(() => {}); console.log("DONE::1");`,
  "agent-turn": `import { agentFor } from "./probes/stack2.mjs";
     const a = agentFor("default", "file:__DB__");
     await a.generate("Reply with exactly: READY", { memory: { thread: "t", resource: "r" } }).catch(() => {});
     console.log("DONE::1");`,
  "memory-write": `import { agentFor } from "./probes/stack2.mjs";
     const a = agentFor("semantic", "file:__DB__");
     await a.generate("Remember this: canary ORCHID-9001.", { memory: { thread: "t", resource: "r" } }).catch(() => {});
     console.log("DONE::1");`,
  "workflow-run": `import { mastra } from "./probes/wave3/w3-flow.mjs";
     const run = await mastra.getWorkflow("flow").createRun({ runId: "c2run" });
     await run.start({ inputData: { subject: "s", amount: 1 } }).catch(() => {});
     await run.resume({ step: "effect", resumeData: { approved: true } }).catch(() => {});
     console.log("DONE::1");`,
  "mcp-client": `import { MCPClient } from "@mastra/mcp";
     const c = new MCPClient({ id: "c2mcp", servers: { notes: { command: "node", args: ["probes/wave4/w4-server.mjs"],
       env: { ...process.env, W4_ROOT: "__ROOT__", W4_MODE: "ok" } } } });
     await c.listTools().catch(() => {}); await c.disconnect().catch(() => {});
     console.log("DONE::1");`,
};

async function c2() {
  for (const [q, src] of Object.entries(C2_SCRIPTS)) {
    for (let rep = 1; rep <= nDet; rep++) {
      const runKey = `C2.${q}#${rep}`; if (skip(runKey)) continue;
      const id = `c2-${process.pid}-${++seq}`;
      const DB = `storage/${id}.db`; cleanDb(DB);
      const ROOT = `sandbox-c2/${id}`; mkdirSync(ROOT, { recursive: true });
      const script = `_c2-${id}.mjs`;   // repo root: ESM resolves relative imports from the file
      const log = freshLedger(`probes/results/egress-${id}.jsonl`);
      try {
        writeFileSync(script, src.replaceAll("__DB__", DB).replaceAll("__ROOT__", ROOT));
        const r = spawnSync(process.execPath, ["--import", "./probes/constraints/egress.mjs", script],
          { encoding: "utf8", timeout: 180000, env: { ...process.env, EGRESS_LOG: log } });
        const out = String(r.stdout ?? "");
        const foreign = foreignDestinations(log);
        const completed = /DONE::1/.test(out);
        record(runKey, { family: "C2", question: q, invariant: "I-C2",
          // A run that did not complete produced no evidence, and must never read as clean. Four runs
          // in the smoke did exactly this and would have been counted as "no egress observed".
          environmentError: !completed || !recorderArmed(log),
          recorderArmed: recorderArmed(log), completed,
          destinations: [...new Set(egressEntries(log).filter((e) => e.kind !== "armed").map((e) => e.target))],
          foreign: [...new Set(foreign.map((e) => `${e.kind}:${e.target}`))],
          foreignCount: foreign.length,
          stderr: String(r.stderr ?? "").slice(0, 200) });
      } catch (e) { record(runKey, { family: "C2", question: q, environmentError: true, error: String(e.message).slice(0, 160) }); }
      finally { rmSync(script, { force: true }); cleanDb(DB); rmSync(ROOT, { recursive: true, force: true }); }
    }
  }
}

// ===== control arms =================================================================================
async function control() {
  // I-C4 control: an ordinary approve-and-execute produces exactly one effect.
  for (let rep = 1; rep <= nCrash; rep++) {
    const runKey = `C.control.c4#${rep}`; if (skip(runKey)) continue;
    const b = bed();
    try {
      b.start("r1");
      const r = b.resume("r1");
      const n = ledgerEntries(b.LED).length;
      record(runKey, { family: "CONTROL", arm: "c4", invariant: "I-C4", effects: n, status: b.status(r), controlOk: n === 1 });
    } catch (e) { record(runKey, { family: "CONTROL", arm: "c4", environmentError: true, error: String(e.message).slice(0, 160) }); }
    finally { b.clean(); }
  }
  // I-C2 control: a deliberate foreign connection must be detected. Without it, a clean result and a
  // detector that never fires are the same reading.
  for (let rep = 1; rep <= nDet; rep++) {
    const runKey = `C.control.c2#${rep}`; if (skip(runKey)) continue;
    const script = `probes/results/_c2ctl-${rep}.mjs`;
    const log = freshLedger(`probes/results/egress-ctl-${rep}.jsonl`);
    try {
      writeFileSync(script, `await fetch("http://telemetry.example.com/v1/collect").catch(()=>{}); console.log("DONE::1");`);
      const r = spawnSync(process.execPath, ["--import", "./probes/constraints/egress.mjs", script],
        { encoding: "utf8", timeout: 60000, env: { ...process.env, EGRESS_LOG: log } });
      const foreign = foreignDestinations(log);
      record(runKey, { family: "CONTROL", arm: "c2", invariant: "I-C2",
        recorderArmed: recorderArmed(log), foreignCount: foreign.length,
        foreign: [...new Set(foreign.map((e) => `${e.kind}:${e.target}`))],
        completed: /DONE::1/.test(String(r.stdout ?? "")),
        controlOk: foreign.length > 0 });
    } catch (e) { record(runKey, { family: "CONTROL", arm: "c2", environmentError: true, error: String(e.message).slice(0, 160) }); }
    finally { rmSync(script, { force: true }); }
  }
}

const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const families = { CONTROL: control, C4: c4, C2: c2 };
for (const [k, fn] of Object.entries(families)) {
  if (only && !only.has(k)) continue;
  console.log(`\n--- ${k} ---`);
  try { await fn(); } catch (e) { console.log(`\n!!! ${k} threw: ${String(e.message).slice(0, 200)}`); }
}
console.log(`\n\nConstraint probes: ${loadEntries(CKPT).length} runs recorded${SMOKE ? " (SMOKE)" : ""}`);
