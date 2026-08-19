// Constraint v2 runner — can a stored grant be spent?
//
// v1's error was testing the ABSENCE of a steward act: resume requires a payload by schema, so
// withholding one fails validation before any approval logic runs. v2 supplies a payload that is
// present and valid and says NO. If a stored grant overrides a fresh decline, the record substituted
// for the act.
//
// Every non-executing run records the framework's refusal MESSAGE, not just its status. v1 trusted a
// status code to mean a boundary held, and it did not.
import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, cpSync, existsSync, writeFileSync } from "node:fs";
import { loadEntries, appendEntry } from "../checkpoint.mjs";
import { writeRun } from "../wave5/w5-lib.mjs";
import { snapshotOf, writeSnapshot, grantedStateOnDisk, ledgerEntries, freshLedger, cleanDb } from "./c-lib.mjs";
import { gate } from "../instrument.mjs";

execSync("node probes/constraints/verify-seal-v2.mjs", { stdio: "inherit" });

const SMOKE = process.env.SMOKE === "1";
const nCrash = SMOKE ? 1 : 5;
const nDet = SMOKE ? 1 : 3;
const CKPT = "probes/results/constraints-v2-partial.jsonl";
mkdirSync("probes/results", { recursive: true }); mkdirSync("storage", { recursive: true });
const done = new Set(loadEntries(CKPT).map((e) => e.runKey));
const skip = (k) => { if (done.has(k)) { process.stdout.write(`${k}(skip) `); return true; } return false; };
const record = (runKey, rec) => { writeRun(`CV2-${rec.family}`, runKey.replace(/[^\w.-]/g, "_"), rec); appendEntry(CKPT, { runKey, ...rec }); process.stdout.write(`${runKey} `); };

let seq = 0;
const bed = () => {
  const id = `cv2-${process.pid}-${++seq}`;
  const DB = `storage/${id}.db`, LED = `probes/results/${id}.ledger`;
  cleanDb(DB); freshLedger(LED);
  const env = (o = {}) => ({ ...process.env, W3_DB: DB, W3_LEDGER: LED, ...o });
  return {
    id, DB, LED, env,
    start: (runId) => spawnSync(process.execPath, ["probes/wave3/w3-start.mjs", runId, "subject", "1"], { encoding: "utf8", timeout: 60000, env: env() }),
    resume: (runId, payload, o = {}) => spawnSync(process.execPath, ["probes/wave3/w3-resume.mjs", runId],
      { encoding: "utf8", timeout: 60000, env: env({ W3_PAYLOAD: JSON.stringify(payload), ...o }) }),
    effects: () => ledgerEntries(LED).length,
    clean: () => { for (const p of ["", "-wal", "-shm"]) { rmSync(`${DB}${p}`, { force: true }); rmSync(`${DB}.bak${p}`, { force: true }); } rmSync(LED, { force: true }); },
  };
};
const status = (r) => String(r?.stdout ?? "").match(/STATUS::(\w+)/)?.[1] ?? null;
// The refusal message is the evidence. A refusal is only proof of a boundary if you know what it
// refused -- v1 was defeated by exactly this.
const message = (r) => String(r?.stdout ?? "").match(/MSG::(.*)/)?.[1]?.trim().slice(0, 200) ?? null;
// A refusal that mentions approval or authorisation is about the boundary. Anything else -- schema
// validation, "not suspended", a missing run -- means the scenario did not reach it.
const refusalIsAboutApproval = (m) => m != null && /approv|authoris|authoriz|declin|permission|consent/i.test(m);

// SQLite runs in WAL mode, so a write that has not been checkpointed lives in the -wal file and not
// in the main .db at all. Copying only the .db captured a 502-byte pending snapshot while the live
// store held the 611-byte granted one -- the gate caught it before a single scenario ran. The whole
// file set moves together, in both directions.
const DB_PARTS = ["", "-wal", "-shm"];
const copyDbSet = (from, to) => { for (const p of DB_PARTS) if (existsSync(`${from}${p}`)) cpSync(`${from}${p}`, `${to}${p}`); };
const dropDbSet = (p) => { for (const s of DB_PARTS) rmSync(`${p}${s}`, { force: true }); };

// Capture the store while a grant is live: resume with a long gap in a detached child, copy the file
// set mid-flight, then let it finish. This is the only moment a granted state is guaranteed present.
function captureWhileGranted(b, runId, gapMs = 3000, sampleAt = 1200) {
  spawnSync(process.execPath, ["-e", `const {spawn}=require("node:child_process");
    spawn(process.execPath,["probes/wave3/w3-resume.mjs",${JSON.stringify(runId)}],
      {env:{...process.env,W3_DB:${JSON.stringify(b.DB)},W3_LEDGER:${JSON.stringify(b.LED)},W3_PAYLOAD:'{"approved":true}',W3_GAP_MS:${JSON.stringify(String(gapMs))}},stdio:"ignore"});
    setTimeout(()=>process.exit(0),${sampleAt});`], { encoding: "utf8", timeout: 30000 });
  const capture = `${b.DB}.bak`;
  const ok = existsSync(b.DB);
  if (ok) copyDbSet(b.DB, capture);
  return { capture, ok };
}

// ===== controls, both directions ====================================================================
async function control() {
  for (let rep = 1; rep <= nDet; rep++) {
    const runKey = `CTL-decline#${rep}`; if (skip(runKey)) continue;
    const b = bed();
    try {
      b.start("r1");
      const r = b.resume("r1", { approved: false });
      record(runKey, { family: "CONTROL", arm: "decline", effects: b.effects(), status: status(r), message: message(r),
        controlOk: b.effects() === 0 });
    } catch (e) { record(runKey, { family: "CONTROL", arm: "decline", environmentError: true, error: String(e.message).slice(0, 160) }); }
    finally { b.clean(); }
  }
  for (let rep = 1; rep <= nDet; rep++) {
    const runKey = `CTL-approve#${rep}`; if (skip(runKey)) continue;
    const b = bed();
    try {
      b.start("r1");
      const r = b.resume("r1", { approved: true });
      record(runKey, { family: "CONTROL", arm: "approve", effects: b.effects(), status: status(r), message: message(r),
        controlOk: b.effects() === 1 });
    } catch (e) { record(runKey, { family: "CONTROL", arm: "approve", environmentError: true, error: String(e.message).slice(0, 160) }); }
    finally { b.clean(); }
  }
}

// ===== C4-7 — a stored grant against a fresh decline =================================================
async function overrideDecline() {
  for (let rep = 1; rep <= nCrash; rep++) {
    const runKey = `C4-7.override-decline#${rep}`; if (skip(runKey)) continue;
    const b = bed();
    try {
      b.start("r1");
      const { capture, ok } = captureWhileGranted(b, "r1");
      const capturedGrant = ok ? grantedStateOnDisk(await snapshotOf(capture, "r1")) : { granted: false };
      await new Promise((r) => setTimeout(r, 3200));
      const effectsFirst = b.effects();
      // Restore the store as it stood while the grant was live, then say NO.
      dropDbSet(b.DB); if (ok) copyDbSet(capture, b.DB);
      freshLedger(b.LED);
      const r = b.resume("r1", { approved: false });
      const effectsAfter = b.effects();
      record(runKey, { family: "C4", question: "override-decline", invariant: "I-C4-clause2",
        capturedGranted: capturedGrant.granted, effectsFirst, effectsAfterDecline: effectsAfter,
        status: status(r), message: message(r), refusalAboutApproval: refusalIsAboutApproval(message(r)),
        // The violation: an effect produced while the fresh act said no.
        grantOverrodeDecline: effectsAfter > 0,
        reachedBoundary: capturedGrant.granted === true });
    } catch (e) { record(runKey, { family: "C4", question: "override-decline", environmentError: true, error: String(e.message).slice(0, 160) }); }
    finally { b.clean(); }
  }
}

// ===== C4-8 — a granted snapshot transplanted onto another suspended run =============================
async function transplant() {
  for (let rep = 1; rep <= nCrash; rep++) {
    const runKey = `C4-8.transplant#${rep}`; if (skip(runKey)) continue;
    const b = bed();
    try {
      b.start("donor");
      const { capture, ok } = captureWhileGranted(b, "donor");
      const donorSnap = ok ? await snapshotOf(capture, "donor") : null;
      const donorGranted = donorSnap ? grantedStateOnDisk(donorSnap).granted : false;
      await new Promise((r) => setTimeout(r, 3200));
      // A second, still-suspended run receives the donor's granted bytes.
      b.start("target");
      const targetBefore = await snapshotOf(b.DB, "target");
      let applied = false;
      if (donorSnap && targetBefore) { await writeSnapshot(b.DB, "target", donorSnap); applied = true; }
      freshLedger(b.LED);
      const r = b.resume("target", { approved: false });
      record(runKey, { family: "C4", question: "transplant", invariant: "I-C4-clause2",
        donorGranted, transplantApplied: applied,
        donorBytes: donorSnap?.length ?? null, targetBytes: targetBefore?.length ?? null,
        effectsAfterDecline: b.effects(), status: status(r), message: message(r),
        refusalAboutApproval: refusalIsAboutApproval(message(r)),
        transplantProducedEffect: b.effects() > 0,
        reachedBoundary: donorGranted === true && applied === true });
    } catch (e) { record(runKey, { family: "C4", question: "transplant", environmentError: true, error: String(e.message).slice(0, 160) }); }
    finally { b.clean(); }
  }
}

// ===== C4-9 — a record on disk, and nobody asking for anything =======================================
// The purest form of the constraint. If an effect appears, the record alone caused it.
async function selfResume() {
  for (let rep = 1; rep <= nCrash; rep++) {
    const runKey = `C4-9.self-resume#${rep}`; if (skip(runKey)) continue;
    const b = bed();
    try {
      b.start("r1");
      const { capture, ok } = captureWhileGranted(b, "r1");
      const capturedGrant = ok ? grantedStateOnDisk(await snapshotOf(capture, "r1")) : { granted: false };
      await new Promise((r) => setTimeout(r, 3200));
      dropDbSet(b.DB); if (ok) copyDbSet(capture, b.DB);
      freshLedger(b.LED);
      // Instantiate the framework against the restored store and ask for nothing at all.
      const script = `_cv2-self-${b.id}.mjs`;
      writeFileSync(script, `import { mastra } from "./probes/wave3/w3-flow.mjs";
        const wf = mastra.getWorkflow("flow");
        try { await wf.getWorkflowRuns?.(); } catch {}
        await new Promise((r) => setTimeout(r, 3000));
        console.log("IDLE::1");`);
      const r = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 60000, env: b.env() });
      rmSync(script, { force: true });
      record(runKey, { family: "C4", question: "self-resume", invariant: "I-C4-clause2",
        capturedGranted: capturedGrant.granted, idled: /IDLE::1/.test(String(r.stdout ?? "")),
        effectsWithoutAnyCall: b.effects(),
        selfResumeProducedEffect: b.effects() > 0,
        stderr: String(r.stderr ?? "").slice(0, 200),
        reachedBoundary: capturedGrant.granted === true });
    } catch (e) { record(runKey, { family: "C4", question: "self-resume", environmentError: true, error: String(e.message).slice(0, 160) }); }
    finally { b.clean(); }
  }
}

// ===== instrument gate, before anything is graded ====================================================
if (!process.env.ONLY) {
  const g = gate("constraint v2");
  const b = bed();
  b.start("g1");
  const pending = grantedStateOnDisk(await snapshotOf(b.DB, "g1"));
  const { capture, ok } = captureWhileGranted(b, "g1");
  const live = ok ? grantedStateOnDisk(await snapshotOf(capture, "g1")) : { granted: false };
  await new Promise((r) => setTimeout(r, 3200));
  g.bothDirections("granted-state reader on real snapshots", (s) => s.granted, live, pending);
  g.check("capture lands while the grant is live", ok && live.granted === true,
    `captured=${ok} granted=${live.granted} bytes=${live.bytes ?? 0}`);
  g.check("the effect counter reads the ledger, not the workflow", b.effects() === 1, `effects=${b.effects()}`);
  g.bothDirections("refusal-message classifier", refusalIsAboutApproval,
    "Approval was declined for this run", "Invalid resume data: expected object, received undefined");
  b.clean();
  const { failed } = g.report();
  if (failed) process.exit(1);
}

const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const families = { CONTROL: control, C7: overrideDecline, C8: transplant, C9: selfResume };
for (const [k, fn] of Object.entries(families)) {
  if (only && !only.has(k)) continue;
  console.log(`\n--- ${k} ---`);
  try { await fn(); } catch (e) { console.log(`\n!!! ${k} threw: ${String(e.message).slice(0, 200)}`); }
}
console.log(`\n\nConstraint v2: ${loadEntries(CKPT).length} runs recorded${SMOKE ? " (SMOKE)" : ""}`);
