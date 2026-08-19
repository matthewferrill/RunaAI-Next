// Shared instrument library.
//
// Nineteen instrument defects across seven waves were not nineteen different mistakes. They were five
// patterns, and the reason they recurred is that the lessons lived in prose -- in findings documents
// and in the head of whoever wrote the next harness -- rather than in code that runs. This file moves
// them into code.
//
//   A. A value that is silently stuck            -> gate.variance() and gate.bothDirections()
//   B. The harness did not run, and the non-run  -> payload() and stamp()
//      was recorded as data
//   C. A fixed sleep used as synchronisation     -> waitReady() and killOnProgress()
//   D. Grading scope narrower than the invariant -> scopeLint()
//   E. A tautological measurement                -> gate.targetAbsent()
//
// This library is itself an instrument, so it can have defects, and a defect here would appear in
// every wave at once. `instrument.test.mjs` proves each helper both catches a real defect and passes
// a real non-defect before anything is allowed to depend on it.

import { spawn } from "node:child_process";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";

const TMP = "probes/results/_payloads";

// ===== B — payloads never travel through the environment =============================================
// A prompt carrying control bytes is rejected by spawn outright, and a payload above the environment
// limit stops the child launching at all. Either one produces a run that recorded nothing, which reads
// exactly like the system under test refusing to act. That is how a safeguard gets reported from a
// harness that never started.
export function payload(text, name = `p-${process.pid}-${Math.abs(hash(String(text)))}`) {
  mkdirSync(TMP, { recursive: true });
  const path = `${TMP}/${String(name).replace(/[^\w.-]/g, "_")}.txt`;
  writeFileSync(path, String(text));
  return path;
}
export function dropPayload(path) { rmSync(path, { force: true }); }
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

// A run in which the instrument never executed is an environment error, never evidence. `spawnErr`
// distinguishes the two cases that look identical from outside: a child that failed to launch, and a
// child that was still running when we killed it at a cap. The second is usually the finding.
export function stamp(rec, { out = "", spawnErr = null, marker = "ANSWERED::" } = {}) {
  const ran = new RegExp(marker).test(String(out));
  const timedOut = /ETIMEDOUT/.test(String(spawnErr ?? ""));
  return { ...rec, instrumentRan: ran, spawnErr: spawnErr ? String(spawnErr).slice(0, 160) : null,
    // A cap-kill is a measurement, not a failure to measure.
    environmentError: !ran && !timedOut && spawnErr != null };
}

// ===== C — readiness and progress, never a fixed sleep ===============================================
// A 900ms sleep against a 1.1s startup killed before the first write and would have graded every
// crash-recovery run as "failed before writing" no matter where it truly landed.
export async function waitReady(check, { tries = 40, gapMs = 150, label = "service" } = {}) {
  const t0 = Date.now();
  for (let i = 0; i < tries; i++) {
    try { if (await check()) return { ready: true, waitedMs: Date.now() - t0, attempts: i + 1, label }; }
    catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, gapMs));
  }
  return { ready: false, waitedMs: Date.now() - t0, attempts: tries, label };
}

// Kill once the parent has SEEN progress. Deterministic, and honest about the boundary reached.
export function killOnProgress(script, env, { marker = "UP::", count = 1, capMs = 60000, args = [] } = {}) {
  return new Promise((res) => {
    const c = spawn(process.execPath, [script, ...args], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "ignore"] });
    let seen = 0, killed = false, out = "", cappedOut = false;
    c.stdout.on("data", (d) => {
      out += String(d);
      seen += String(d).split("\n").filter((l) => l.startsWith(marker)).length;
      if (!killed && seen >= count) { killed = true; c.kill("SIGKILL"); }
    });
    const t = setTimeout(() => { if (!killed) { killed = true; cappedOut = true; c.kill("SIGKILL"); } }, capMs);
    c.on("exit", () => { clearTimeout(t); res({ seen, killed, out, cappedOut, reachedTarget: seen >= count }); });
  });
}

// ===== D — a grader may not be narrower than the invariant it grades =================================
// I-4T was scoped to one family while its sealed text named no family, and six violations were hidden.
export function scopeLint(preregText, invariantId, { graderFiltersByFamily, family = null } = {}) {
  const line = String(preregText).split("\n").find((l) => l.includes(invariantId)) ?? "";
  const namesAFamily = /\bfamily\b|\bW\d-[A-G]\b/.test(line);
  const ok = namesAFamily ? true : graderFiltersByFamily === false;
  return { ok, invariantId, namesAFamily, graderFiltersByFamily, family,
    detail: ok ? "grader scope matches the sealed invariant"
      : `${invariantId} names no family in its sealed text, so the grader must not filter by family` };
}

// ===== The gate — the check harness that was hand-rolled in four separate validate files =============
export function gate(title) {
  const results = [];
  const add = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
    return ok;
  };

  return {
    check: (name, ok, detail = "") => add(name, Boolean(ok), detail),

    // A — a detector must be shown to FIRE, not only to stay quiet. A test of the negative alone
    // cannot distinguish "correctly false" from "always false", which is how a stuck-false detector
    // survived validation and would have reported no steering across 22 trust-boundary scenarios.
    bothDirections(name, fn, positive, negative) {
      let pos = null, neg = null, err = null;
      try { pos = fn(positive); neg = fn(negative); } catch (e) { err = String(e.message).slice(0, 120); }
      return add(`${name} — fires in both directions`, pos === true && neg === false,
        err ? `threw: ${err}` : `positive->${pos} (want true), negative->${neg} (want false)`);
    },

    // B — the injected fault must be visible ON THE INSTRUMENT before the outcome is graded. A proxy
    // that lost its port to a stale process served a different mode entirely and produced a
    // fabrication that was not there; the wire log was empty, which this catches immediately.
    faultLanded(name, evidence, predicate, detail = "") {
      let ok = false, err = null;
      try { ok = predicate(evidence) === true; } catch (e) { err = String(e.message).slice(0, 120); }
      return add(`${name} — the injected fault actually landed`, ok,
        err ? `threw: ${err}` : (detail || `evidence: ${JSON.stringify(evidence).slice(0, 160)}`));
    },

    // E — a measurement whose target is already present in its own input measures nothing. Wave 4
    // asked the agent to write the secret and then found the secret in the log, which is correct
    // behaviour reported as a leak.
    targetAbsent(name, target, inputs) {
      const t = String(target);
      const hits = inputs.map((i, n) => [n, String(i)]).filter(([, s]) => s.includes(t)).map(([n]) => n);
      return add(`${name} — target absent from the input`, hits.length === 0,
        hits.length ? `target appears in input index ${hits.join(", ")} — the measurement is a tautology`
                    : `"${t.slice(0, 24)}" appears in none of ${inputs.length} inputs`);
    },

    // A (generic) — after a smoke run, every recorded field that never varies is either trivially
    // constant or stuck, and you must say which. This is the one catcher that finds defects nobody
    // thought to look for: it would have caught the wrapped-argument write, the DISTINCT-on-NULL
    // count, the stuck-false detector and the unrecorded contentLen, without any of them being
    // anticipated.
    variance(name, runs, { allow = {}, ignore = [] } = {}) {
      const v = varianceReport(runs, { ignore });
      const unexplained = [...v.constant, ...v.neverRecorded].filter((f) => !(f in allow));
      const lines = [];
      if (v.neverRecorded.length) lines.push(`never recorded in any run: ${v.neverRecorded.join(", ")}`);
      if (v.constant.length) lines.push(`constant across all ${runs.length} runs: ${v.constant.map((f) => `${f}=${JSON.stringify(v.values[f])}`).join(", ")}`);
      if (unexplained.length) lines.push(`UNEXPLAINED: ${unexplained.join(", ")} — justify each in \`allow\` or fix the instrument`);
      return add(`${name} — every constant field is explained`, unexplained.length === 0,
        lines.join("\n        ") || `all fields vary across ${runs.length} runs`);
    },

    report() {
      const failed = results.filter((r) => !r.ok);
      console.log(`\n${results.length - failed.length}/${results.length} instrument checks passed${title ? ` — ${title}` : ""}`);
      if (failed.length) {
        console.log("This wave must not be graded until these are fixed.");
        process.exitCode = 1;
      }
      return { total: results.length, failed: failed.length, results };
    },
  };
}

// Fields whose value set has size one across every run, split from fields never recorded at all.
// `undefined` everywhere is the more damning case: the instrument wrote nothing, so nothing was
// measured, and a grader reading that field silently reads a default.
export function varianceReport(runs, { ignore = [] } = {}) {
  const skip = new Set(["runKey", "ms", "answer", "out", "log", ...ignore]);
  const keys = new Set();
  for (const r of runs) for (const k of Object.keys(r)) if (!skip.has(k)) keys.add(k);
  const constant = [], neverRecorded = [], values = {};
  for (const k of keys) {
    const present = runs.filter((r) => r[k] !== undefined);
    if (present.length === 0) { neverRecorded.push(k); continue; }
    const distinct = new Set(present.map((r) => JSON.stringify(r[k])));
    // A field recorded in only some runs still counts as constant if what was recorded never varied.
    if (distinct.size === 1 && runs.length > 1) { constant.push(k); values[k] = JSON.parse([...distinct][0]); }
  }
  return { constant, neverRecorded, values, n: runs.length };
}
