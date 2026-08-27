import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyReviewedSemantics, buildFinalAdjudications } from "./final-adjudication.mjs";
const initial = JSON.parse(readFileSync(new URL("../initial-judgments/Candidate-B-initial-judgments.json", import.meta.url)));
const report = JSON.parse(readFileSync(new URL("../results/BLIND-ADJUDICATION.json", import.meta.url)));
test("final bundles preserve both raw source sets and all frozen failures while resolving explicit reviews", () => {
  const before = structuredClone(initial), results = buildFinalAdjudications();
  assert.deepEqual(initial, before); assert.equal(results.length, 2);
  assert.deepEqual(results.map(result => result.aggregate.caseAttempts), [108, 108]);
  assert.deepEqual(results.map(result => result.aggregate.counts.acceptable), [93, 79]);
  assert.deepEqual(results.map(result => result.aggregate.counts["critical-error"]), [3, 3]);
  for (const result of results) {
    assert.equal(result.aggregate.semanticTurnCounts["review-required"], 0);
    assert.equal(result.sourceVerification.passed, true);
    assert.ok(Object.values(result.aggregate.roleResults).every(role => role.qualified === false));
  }
  const sourceRows = results[1].bundle.records.filter(row => row.caseId === "evidence-capacity-json");
  assert.ok(sourceRows.every(row => row.semantic.outcome === "acceptable" && row.deterministic.status === "fail" && row.protocolSemanticDifference));
});
test("missing, duplicate and misidentified reviewer decisions are rejected", () => {
  assert.throws(() => applyReviewedSemantics(initial, report.adjudications.filter(row => !(row.armId === initial.armId && row.caseId === "chat-meeting-move"))), /turn-count/);
  const rows = structuredClone(report.adjudications), selected = rows.filter(row => row.armId === initial.armId);
  Object.assign(selected[1], structuredClone(selected[0]));
  assert.throws(() => applyReviewedSemantics(initial, rows), /duplicate-turn/);
});
test("a reviewer cannot substitute prior response, protocol, semantic or transport records", () => {
  for (const field of ["response", "deterministic", "transport", "semantic"]) {
    const rows = structuredClone(report.adjudications), row = rows.find(value => value.armId === initial.armId);
    row.initialJudgment[field] = {};
    assert.throws(() => applyReviewedSemantics(initial, rows), /prior-record-changed/);
  }
  const rows = structuredClone(report.adjudications), row = rows.find(value => value.armId === initial.armId);
  row.initialSemantic = {};
  assert.throws(() => applyReviewedSemantics(initial, rows), /prior-semantic-changed/);
});
