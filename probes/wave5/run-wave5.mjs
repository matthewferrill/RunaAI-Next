// Wave 5 runner -- memory durability, 36 register scenarios across three edges.
// Outcomes are read from the store on disk. The runner never grades.
// SMOKE=1 caps every cell to n=1. ONLY=A,B,... restricts families.
import { execSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { loadEntries, appendEntry } from "../checkpoint.mjs";
import { storeState, storeReadable, cleanDb, openDb, writeRun } from "./w5-lib.mjs";

execSync("node probes/wave5/verify-seal-wave5.mjs", { stdio: "inherit" });

const SMOKE = process.env.SMOKE === "1";
const nRace = SMOKE ? 1 : 10;   // CONCURRENCY, rule=concurrency
const nCrash = SMOKE ? 1 : 5;   // PERSISTENCE, rule=crash-recovery
const QS_RACE = ["two-processes", "two-runs-same-id", "same-op-twice", "read-during-write", "conflicting-ops", "two-users"];
const QS_PERS = ["fail-before-write", "partial-write", "write-ok-ack-fails", "record-ok-effect-fails", "effect-ok-record-fails", "restart-each-boundary"];

const CKPT = "probes/results/wave5-partial.jsonl";
mkdirSync("probes/results", { recursive: true }); mkdirSync("storage", { recursive: true });
const done = new Set(loadEntries(CKPT).map((e) => e.runKey));
const skip = (k) => { if (done.has(k)) { process.stdout.write(`${k}(skip) `); return true; } return false; };
const record = (runKey, rec) => { writeRun(`W5-${rec.family}`, runKey.replace(/[^\w.-]/g, "_"), rec); appendEntry(CKPT, { runKey, ...rec }); process.stdout.write(`${runKey} `); };

let seq = 0;
const newDb = () => { const p = `storage/w5-${process.pid}-${++seq}.db`; cleanDb(p); return p; };

const writeSync_ = (DB, env, timeout = 120000) =>
  spawnSync(process.execPath, ["probes/wave5/w5-write.mjs"], { encoding: "utf8", timeout, env: { ...process.env, W5_DB: DB, ...env } });
const ack = (r) => /ACK::ok/.test(String(r?.stdout ?? "")) ? "ok" : (/ACK::fail/.test(String(r?.stdout ?? "")) ? "fail" : null);
const answerOf = (r) => (String(r?.stdout ?? "").match(/TEXT::(.*)/)?.[1] ?? "").slice(0, 1200);

// Kill on observed progress, never on a fixed sleep: child startup is ~1.1s, so a timed kill lands
// before any work and would grade every crash run as fail-before-write regardless of where it landed.
function killAfterProgress(script, env, wantLines, cap = 60000) {
  return new Promise((res) => {
    const c = spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "ignore"] });
    let seen = 0, killed = false, out = "";
    c.stdout.on("data", (d) => {
      out += String(d);
      seen += String(d).split("\n").filter((l) => l.startsWith("UP::") || l.startsWith("ACK::")).length;
      if (!killed && seen >= wantLines) { killed = true; c.kill("SIGKILL"); }
    });
    const t = setTimeout(() => { if (!killed) { killed = true; c.kill("SIGKILL"); } }, cap);
    c.on("exit", () => { clearTimeout(t); res({ seen, killed, out }); });
  });
}
const spawnAsync = (script, env, timeout = 120000) => new Promise((res) => {
  const c = spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "ignore"] });
  let out = ""; c.stdout.on("data", (d) => { out += String(d); });
  const t = setTimeout(() => c.kill("SIGKILL"), timeout);
  c.on("exit", (code) => { clearTimeout(t); res({ out, code }); });
});

// ===== W5-A / W5-B — CONCURRENCY on E04 (store) and E05 (vector), n=10 ================================
// Both edges are exercised by the same contention; they differ in what is read as the deed. E04 asks
// whether a message was lost or the store corrupted; E05 asks whether an embedding was orphaned.
async function concurrency(family, edge) {
  for (const q of QS_RACE) {
    for (let rep = 1; rep <= nRace; rep++) {
      const runKey = `W5-${family}.${q}#${rep}`; if (skip(runKey)) continue;
      const DB = newDb();
      try {
        const sameThread = q !== "two-users";
        const A = { W5_DB: DB, W5_PATH: "agent", W5_THREAD: "t1", W5_RESOURCE: "r1", W5_TEXT: "alpha ORCHID-A100", W5_MSGID: "ma" };
        const B = { W5_DB: DB, W5_PATH: "agent", W5_THREAD: sameThread ? "t1" : "t2", W5_RESOURCE: sameThread ? "r1" : "r2",
                    W5_TEXT: q === "same-op-twice" ? "alpha ORCHID-A100" : "beta ORCHID-B200", W5_MSGID: q === "same-op-twice" ? "ma" : "mb" };
        let rs;
        if (q === "read-during-write") {
          // one writer, one concurrent reader of the same store
          const w = spawnAsync("probes/wave5/w5-write.mjs", A);
          const rd = (async () => { await new Promise((r) => setTimeout(r, 400)); return storeState(DB); })();
          const [wr, mid] = await Promise.all([w, rd]);
          rs = [wr]; var midRead = mid;
        } else {
          rs = await Promise.all([spawnAsync("probes/wave5/w5-write.mjs", A), spawnAsync("probes/wave5/w5-write.mjs", B)]);
        }
        const st = await storeState(DB);
        record(runKey, { family, edge, question: q, invariant: family === "A" ? "I-5A" : "I-5B",
          acks: rs.map((r) => /ACK::ok/.test(r.out) ? "ok" : /ACK::fail/.test(r.out) ? "fail" : null),
          writers: rs.length, readable: await storeReadable(DB), ...st,
          midRead: typeof midRead === "undefined" ? null : midRead,
          // E04 reads message loss; E05 reads orphaned embeddings. Both come from disk.
          lostMessage: st.messages < rs.filter((r) => /ACK::ok/.test(r.out)).length,
          orphaned: (st.orphans ?? 0) > 0 });
      } catch (e) { record(runKey, { family, edge, question: q, environmentError: true, error: String(e.message).slice(0, 160) }); }
      finally { cleanDb(DB); }
    }
  }
}

// ===== W5-C — CONCURRENCY on E07 (harness -> vector-index), n=10 =====================================
async function concurrencyIndex() {
  for (const q of QS_RACE) {
    for (let rep = 1; rep <= nRace; rep++) {
      const runKey = `W5-C.${q}#${rep}`; if (skip(runKey)) continue;
      const DB = newDb();
      try {
        const idxA = "w5idx", idxB = q === "two-users" ? "w5idx2" : "w5idx";
        const A = { W5_DB: DB, W5_INDEX: idxA, W5_N: "25", W5_TAG: "a", W5_PER_MS: "5" };
        const B = { W5_DB: DB, W5_INDEX: idxB, W5_N: "25", W5_TAG: q === "same-op-twice" ? "a" : "b", W5_PER_MS: "5" };
        let rs, midRead = null;
        if (q === "read-during-write") {
          const w = spawnAsync("probes/wave5/w5-vec.mjs", A);
          const rd = (async () => { await new Promise((r) => setTimeout(r, 1300));
            const db = openDb(DB); let n = null; try { n = Number((await db.execute(`SELECT COUNT(*) n FROM "${idxA}"`)).rows[0].n); } catch {} db.close(); return n; })();
          const [wr, mid] = await Promise.all([w, rd]); rs = [wr]; midRead = mid;
        } else {
          rs = await Promise.all([spawnAsync("probes/wave5/w5-vec.mjs", A), spawnAsync("probes/wave5/w5-vec.mjs", B)]);
        }
        const db = openDb(DB);
        const cnt = async (n) => { try { return Number((await db.execute(`SELECT COUNT(*) n FROM "${n}"`)).rows[0].n); } catch { return null; } };
        const rowsA = await cnt(idxA), rowsB = idxB === idxA ? null : await cnt(idxB);
        // vector_id is the identity column; the declared "id SERIAL PRIMARY KEY" is NULL on every
        // row because SQLite has no SERIAL, so counting distinct on it returns 0 always.
        let distinct = null;
        try { distinct = Number((await db.execute(`SELECT COUNT(DISTINCT vector_id) n FROM "${idxA}"`)).rows[0].n); } catch {}
        db.close();
        const acked = rs.filter((r) => /ACK::ok/.test(r.out)).length;
        // Expected rows for the achieved acks. same-op-twice deliberately reuses ids, so its upper
        // bound is 25, not 50 -- an idempotent upsert is correct there, a duplicate is the defect.
        // Per-index expectation. same-op-twice deliberately reuses ids, so its ceiling is 25 and an
        // idempotent upsert is correct there. two-users writes two separate indexes, 25 each.
        const expectedA = q === "same-op-twice" ? 25 : (idxB === idxA ? acked * 25 : 25);
        const expectedB = idxB === idxA ? null : 25;
        record(runKey, { family: "C", edge: "E07", question: q, invariant: "I-5C",
          acks: rs.map((r) => /ACK::ok/.test(r.out) ? "ok" : null), writers: rs.length,
          rowsA, rowsB, distinctA: distinct, expectedA, expectedB, midRead, readable: await storeReadable(DB),
          failedWriters: rs.length - acked,
          lostRows: rowsA !== null && acked > 0 && rowsA < expectedA,
          // A writer that fails under contention can leave rows behind with nothing recording that
          // its build was incomplete. Those rows are indistinguishable from a completed writer's.
          orphanRowsFromFailedWriter: rowsA !== null && acked < rs.length && rowsA > expectedA,
          duplicated: distinct !== null && rowsA !== null && rowsA > distinct });
      } catch (e) { record(runKey, { family: "C", edge: "E07", question: q, environmentError: true, error: String(e.message).slice(0, 160) }); }
      finally { cleanDb(DB); }
    }
  }
}

// ===== W5-D / W5-E — PERSISTENCE on E04 and E05, n=5 =================================================
// The three write paths are not equivalent on this base, and that inequality IS the E05 question:
// api-v1 acknowledges success and writes no embedding; api-v2 throws having already written the
// message; the agent path writes both. Each scenario selects the path that produces its boundary.
async function persistence(family, edge) {
  for (const q of QS_PERS) {
    for (let rep = 1; rep <= nCrash; rep++) {
      const runKey = `W5-${family}.${q}#${rep}`; if (skip(runKey)) continue;
      const DB = newDb();
      try {
        let rec = {};
        if (q === "record-ok-effect-fails") {
          // the record (message) lands, the effect (embedding) does not -- and success is reported
          const r = writeSync_(DB, { W5_PATH: "api-v1", W5_TEXT: "ORCHID-R100", W5_MSGID: "mr" });
          rec = { path: "api-v1", ack: ack(r), achieved: "message-written-embedding-skipped" };
        } else if (q === "effect-ok-record-fails") {
          // the call reports failure -- did anything land anyway?
          const r = writeSync_(DB, { W5_PATH: "api-v2", W5_TEXT: "ORCHID-E100", W5_MSGID: "me" });
          rec = { path: "api-v2", ack: ack(r), achieved: "call-reported-failure" };
        } else if (q === "fail-before-write") {
          const k = await killAfterProgress("probes/wave5/w5-write.mjs", { W5_DB: DB, W5_PATH: "agent", W5_TEXT: "ORCHID-F100", W5_DELAY_MS: "0" }, 0, 900);
          rec = { path: "agent", ack: null, killed: k.killed, achieved: "killed-at-startup" };
        } else if (q === "partial-write" || q === "restart-each-boundary") {
          // kill the vector build mid-stream, then read what survived
          const k = await killAfterProgress("probes/wave5/w5-vec.mjs", { W5_DB: DB, W5_INDEX: "w5idx", W5_N: "60", W5_PER_MS: "20", W5_TAG: "p" }, 8);
          const db = openDb(DB); let rows = null; try { rows = Number((await db.execute('SELECT COUNT(*) n FROM "w5idx"')).rows[0].n); } catch {} db.close();
          rec = { path: "vec", killed: k.killed, indexRows: rows, emitted: k.seen, achieved: rows === null ? "no-index" : (rows < 60 ? "partial-index" : "complete") };
          if (q === "restart-each-boundary") {
            // restart the same build and see whether the index converges or duplicates
            const r2 = await spawnAsync("probes/wave5/w5-vec.mjs", { W5_DB: DB, W5_INDEX: "w5idx", W5_N: "60", W5_TAG: "p" });
            const db2 = openDb(DB); let rows2 = null, dist2 = null;
            try { rows2 = Number((await db2.execute('SELECT COUNT(*) n FROM "w5idx"')).rows[0].n);
                  dist2 = Number((await db2.execute('SELECT COUNT(DISTINCT vector_id) n FROM "w5idx"')).rows[0].n); } catch {}
            db2.close();
            rec = { ...rec, restartAck: /ACK::ok/.test(r2.out) ? "ok" : null, rowsAfterRestart: rows2, distinctAfterRestart: dist2,
                    duplicatedOnRestart: rows2 !== null && dist2 !== null && rows2 > dist2 };
          }
        } else { // write-ok-ack-fails: the write completes, the acknowledgement never reaches the caller
          const k = await killAfterProgress("probes/wave5/w5-write.mjs", { W5_DB: DB, W5_PATH: "agent", W5_TEXT: "ORCHID-W100" }, 1, 120000);
          rec = { path: "agent", killed: k.killed, ack: /ACK::ok/.test(k.out) ? "ok" : null, achieved: "killed-after-ack" };
        }
        const st = await storeState(DB);
        record(runKey, { family, edge, question: q, invariant: family === "D" ? "I-5D" : "I-5E",
          ...rec, ...st, readable: await storeReadable(DB),
          // I-5D: does the store's content agree with what the caller was told?
          agrees: rec.ack === null ? null : (rec.ack === "ok" ? st.messages > 0 : st.messages === 0),
          // I-5E: a stored message with no embedding is silently unrecallable
          silentlyUnrecallable: st.messages > 0 && (st.vectors === null || st.orphans > 0) && rec.ack === "ok" });
      } catch (e) { record(runKey, { family, edge, question: q, environmentError: true, error: String(e.message).slice(0, 160) }); }
      finally { cleanDb(DB); }
    }
  }
}

// ===== W5-F — PERSISTENCE on E07, n=5 ================================================================
async function persistenceIndex() {
  for (const q of QS_PERS) {
    for (let rep = 1; rep <= nCrash; rep++) {
      const runKey = `W5-F.${q}#${rep}`; if (skip(runKey)) continue;
      const DB = newDb();
      try {
        const want = q === "fail-before-write" ? 0 : 8;
        const k = await killAfterProgress("probes/wave5/w5-vec.mjs",
          { W5_DB: DB, W5_INDEX: "w5idx", W5_N: "60", W5_PER_MS: "20", W5_TAG: "f" }, want, q === "fail-before-write" ? 900 : 60000);
        const db = openDb(DB); let rows = null, dist = null;
        try { rows = Number((await db.execute('SELECT COUNT(*) n FROM "w5idx"')).rows[0].n);
              dist = Number((await db.execute('SELECT COUNT(DISTINCT vector_id) n FROM "w5idx"')).rows[0].n); } catch {}
        db.close();
        // A query against a half-built index that answers without signalling incompleteness is the
        // violation this family is looking for; the index cannot report its own build state.
        record(runKey, { family: "F", edge: "E07", question: q, invariant: "I-5F",
          killed: k.killed, emitted: k.seen, indexRows: rows, distinct: dist, expected: 60,
          achieved: rows === null ? "no-index" : rows === 0 ? "empty" : rows < 60 ? "partial-index" : "complete",
          readable: await storeReadable(DB),
          queryableWhilePartial: rows !== null && rows > 0 && rows < 60,
          reportsIncompleteness: false, duplicated: rows !== null && dist !== null && rows > dist });
      } catch (e) { record(runKey, { family: "F", edge: "E07", question: q, environmentError: true, error: String(e.message).slice(0, 160) }); }
      finally { cleanDb(DB); }
    }
  }
}

// ===== control arms — one per edge, n=5 ==============================================================
// A recall failure has an innocent explanation: the model may simply not recall well on this base.
// Only an uninterrupted store-and-recall can rule that out, so without these the wave is unreadable.
async function control() {
  const { agentFor } = await import("../stack2.mjs");
  for (const edge of ["E04", "E05", "E07"]) {
    for (let rep = 1; rep <= nCrash; rep++) {
      const runKey = `W5.control.${edge}#${rep}`; if (skip(runKey)) continue;
      const DB = newDb();
      try {
        if (edge === "E07") {
          const r = await spawnAsync("probes/wave5/w5-vec.mjs", { W5_DB: DB, W5_INDEX: "w5idx", W5_N: "20", W5_TAG: "c" });
          const db = openDb(DB); let rows = null; try { rows = Number((await db.execute('SELECT COUNT(*) n FROM "w5idx"')).rows[0].n); } catch {} db.close();
          record(runKey, { family: "CONTROL", edge, arm: "control", indexRows: rows, expected: 20, controlOk: rows === 20 });
        } else {
          const a = agentFor("semantic", `file:${DB}`);
          await a.generate("Remember this exactly: my canary phrase is ORCHID-5501.", { memory: { thread: "t", resource: "r" } });
          const r = await a.generate("What is my canary phrase? Answer with the phrase only.", { memory: { thread: "t", resource: "r" } });
          const st = await storeState(DB);
          const recalled = /ORCHID-5501/.test(String(r.text));
          record(runKey, { family: "CONTROL", edge, arm: "control", ...st, claimRecalled: recalled,
            answer: String(r.text).slice(0, 1200),
            controlOk: edge === "E04" ? (st.messages > 0 && recalled) : (st.vectors > 0 && st.orphans === 0 && recalled) });
        }
      } catch (e) { record(runKey, { family: "CONTROL", edge, environmentError: true, error: String(e.message).slice(0, 160) }); }
      finally { cleanDb(DB); }
    }
  }
}

const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const families = { CONTROL: control, A: () => concurrency("A", "E04"), B: () => concurrency("B", "E05"),
  C: concurrencyIndex, D: () => persistence("D", "E04"), E: () => persistence("E", "E05"), F: persistenceIndex };
for (const [k, fn] of Object.entries(families)) {
  if (only && !only.has(k)) continue;
  console.log(`\n--- W5-${k} ---`);
  try { await fn(); } catch (e) { console.log(`\n!!! W5-${k} threw: ${String(e.message).slice(0, 200)}`); }
}
console.log(`\n\nWave 5: ${loadEntries(CKPT).length} total runs recorded${SMOKE ? " (SMOKE)" : ""}`);
