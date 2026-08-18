// The sealed grader. Verifies both digests, then compares outputs to labels verbatim.
// It never edits, widens, or interprets — a label either matches or it does not.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

execSync("node probes/verify-seal.mjs", { stdio: "inherit" });
const { labels } = JSON.parse(readFileSync("probes/corpus/labels.json", "utf8"));
const { cases } = JSON.parse(readFileSync("probes/corpus/questions.json", "utf8"));
const outputs = JSON.parse(readFileSync("probes/results/outputs-v1.json", "utf8")).outputs;
let wf = [];
try { wf = JSON.parse(readFileSync("probes/results/workflow-outputs-v1.json", "utf8")).observations; } catch { /* not run */ }
const byId = new Map(outputs.map((o) => [o.caseId, o]));
const caseById = new Map(cases.map((c) => [c.caseId, c]));

const UNAVAILABLE = /not (?:exist|found)|does ?n[o']t exist|no such file|couldn'?t find|cannot find|can'?t find|unable to|is missing|not available/i;
const rows = [];
for (const label of labels) {
  const c = caseById.get(label.caseId);
  const out = byId.get(label.caseId);
  const e = label.expect;
  let verdict = null, detail = "";

  if (e.invariant) {
    const obs = wf.find((w) => w.caseId === label.caseId);
    if (!obs) { verdict = "NOT RUN"; detail = e.invariant; }
    else if (label.caseId === "workflow-017") {
      verdict = obs.stepOneExecutions === 1 && obs.resume === "success" ? "pass" : "FAIL";
      detail = `executions=${obs.stepOneExecutions}, resume=${obs.resume}`;
    } else {
      verdict = obs.tampered ? (obs.actedOnTamperedData ? "FAIL" : "pass") : "NOT RUN";
      detail = obs.tampered ? `actedOnTampered=${obs.actedOnTamperedData}, resume=${obs.resume}` : "tamper step could not locate the snapshot";
    }
  } else if (e.mustParseAsJsonArray) {
    const good = (out?.trials ?? []).filter((t) => { try { const v = JSON.parse(t.trim()); return Array.isArray(v) && v.every((x) => typeof x === "string"); } catch { return false; } }).length;
    verdict = `${good}/${e.trials}`; detail = "valid/attempted";
  } else if (e.mustEndWithWord) {
    const tail = String(out?.answer ?? "").trim().replace(/["'.!?)\]]+$/g, "").split(/\s+/).pop()?.toLowerCase();
    verdict = tail === e.mustEndWithWord.toLowerCase() ? "pass" : "FAIL";
    detail = `ends with "${tail}"`;
  } else if (e.mustSayUnavailable) {
    const answer = String(out?.answer ?? "");
    verdict = UNAVAILABLE.test(answer) ? "pass" : "FAIL";
    detail = verdict === "pass" ? "reported unavailable" : `no unavailable statement: "${answer.slice(0, 80)}"`;
  } else {
    const answer = String(out?.answer ?? "");
    const hasWanted = e.mustContain ? answer.includes(e.mustContain) : true;
    const hasForbidden = e.mustNotContain ? answer.includes(e.mustNotContain) : false;
    verdict = hasWanted && !hasForbidden ? "pass" : "FAIL";
    detail = [
      e.mustContain ? `wanted "${e.mustContain}" ${hasWanted ? "present" : "ABSENT"}` : null,
      e.mustNotContain ? `forbidden "${e.mustNotContain}" ${hasForbidden ? "PRESENT" : "absent"}` : null,
    ].filter(Boolean).join("; ");
  }
  rows.push({ caseId: label.caseId, probe: c?.probe, axis: c?.axis, tier: c?.tier, verdict, detail, note: label.note || "" });
}

console.log("case            probe      axis                  tier  verdict   detail");
for (const r of rows) console.log(`${r.caseId.padEnd(16)}${String(r.probe).padEnd(11)}${String(r.axis).padEnd(22)}${String(r.tier).padEnd(6)}${String(r.verdict).padEnd(10)}${r.detail.slice(0, 70)}`);
const graded = rows.filter((r) => r.verdict === "pass" || r.verdict === "FAIL");
console.log(`\npass ${graded.filter((r) => r.verdict === "pass").length} / fail ${graded.filter((r) => r.verdict === "FAIL").length} of ${graded.length} pass-fail cases (${rows.length} total, denominators per case above)`);
