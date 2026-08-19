// Validate the Wave 3 instruments before any scenario is trusted. Each check proves the harness can
// REACH a boundary; a harness that cannot reach it would report every violation as clean.
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { createClient } from "@libsql/client";

const LEDGER = "probes/results/w3v.ledger", DB = "storage/w3v.db";
const clean = () => { for (const s of ["", "-wal", "-shm"]) rmSync(`${DB}${s}`, { force: true }); rmSync(LEDGER, { force: true }); };
const env = (o = {}) => ({ ...process.env, W3_LEDGER: LEDGER, W3_DB: DB, ...o });
const run = (script, args, o = {}) => spawnSync(process.execPath, [`probes/wave3/${script}`, ...args], { encoding: "utf8", timeout: 60000, env: env(o) });
const effects = () => existsSync(LEDGER) ? readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).length : 0;
const status = (r) => String(r.stdout).match(/STATUS::(\w+)/)?.[1] ?? null;
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${n}${d ? "  — " + d : ""}`); ok ? pass++ : fail++; };

// 1. CONTROL: uninterrupted, the effect happens exactly once and the run reports success.
clean();
{ run("w3-start.mjs", ["v1", "ctrl"]); const r = run("w3-resume.mjs", ["v1"]);
  check("control: one approval -> exactly one effect, status success", effects() === 1 && status(r) === "success", `effects=${effects()} status=${status(r)}`); }

// 2. the ledger is per-run isolated (a stale ledger would fake double-apply everywhere)
clean();
{ run("w3-start.mjs", ["v2", "iso"]); run("w3-resume.mjs", ["v2"]);
  check("ledger isolation: a fresh ledger starts empty and counts only this run", effects() === 1, `effects=${effects()}`); }

// 3. SIGKILL in the gap is reachable: effect lands, process dies before returning.
clean();
{ run("w3-start.mjs", ["v3", "gap"]); const r = run("w3-resume.mjs", ["v3"], { W3_GAP_MS: "300", W3_KILL_IN_GAP: "1" });
  check("effect-ok-record-fails is REACHABLE (effect on disk, process killed mid-step)",
    effects() === 1 && status(r) === null, `effects=${effects()} status=${status(r)} signal=${r.signal}`); }

// 4. fail-before-write is reachable: no effect at all.
clean();
{ run("w3-start.mjs", ["v4", "pre"]); const r = run("w3-resume.mjs", ["v4"], { W3_FAIL_BEFORE_WRITE: "1" });
  check("fail-before-write is REACHABLE (no effect, process killed)", effects() === 0 && status(r) === null, `effects=${effects()} signal=${r.signal}`); }

// 5. after a kill in the gap, can the run be resumed again — and does that double-apply?
//    This is the measurement, not a pass/fail here; the check is that we can OBSERVE it.
clean();
{ run("w3-start.mjs", ["v5", "again"]); run("w3-resume.mjs", ["v5"], { W3_GAP_MS: "300", W3_KILL_IN_GAP: "1" });
  const before = effects(); const r2 = run("w3-resume.mjs", ["v5"]); const after = effects();
  check("post-crash resume is observable", typeof before === "number" && typeof after === "number",
    `effects before=${before} after=${after} status=${status(r2) ?? "error"} -> ${after > before ? "DOUBLE-APPLY observable" : "no re-execution"}`); }

// 6. the snapshot store is readable for versioning/tamper scenarios
clean();
{ run("w3-start.mjs", ["v6", "snap"]);
  const db = createClient({ url: `file:${DB}` });
  const rows = await db.execute("SELECT run_id, snapshot FROM mastra_workflow_snapshot WHERE run_id='v6'");
  const raw = rows.rows[0]?.snapshot;
  check("snapshot readable for versioning scenarios", !!raw, `bytes=${raw ? Buffer.from(raw).length : 0}`);
  db.close(); }

clean();
console.log(`\nWave 3 instrument validation: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
