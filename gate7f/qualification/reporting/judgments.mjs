import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadAcceptanceCorpus } from "../acceptance/corpus.mjs";
import { gradeDeterministic, rawOpenAiMessageToResponse } from "../acceptance/checks.mjs";

export const SEMANTIC_OUTCOMES = Object.freeze([
  "acceptable", "ordinary-error", "critical-error", "review-required", "provider-failure", "incomplete-response",
]);
export const TRANSPORT_OUTCOMES = Object.freeze(["completed", "provider-failure", "incomplete-response"]);
export const turnKey = ({ caseId, attempt, turnIndex }) => [caseId, attempt, turnIndex].join(":");
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const responseDigest = response => createHash("sha256").update(JSON.stringify(canonical(response))).digest("hex");
export const acceptanceSealDigest = () => createHash("sha256").update(readFileSync(new URL("../acceptance/SEAL.json", import.meta.url))).digest("hex");
const text = (value, code) => assert.ok(typeof value === "string" && value.trim().length > 0, code);

export function expectedTurnIdentities(corpus = loadAcceptanceCorpus()) {
  return corpus.cases.flatMap(item => Array.from({ length: corpus.attemptsPerCase }, (_, attempt) =>
    Array.from({ length: 1 + (item.turns?.length ?? 0) }, (_, turnIndex) => ({ caseId: item.id, attempt: attempt + 1, turnIndex }))).flat());
}

export function makeJudgmentRecord({ caseId, attempt, turnIndex = 0, message, transport, semantic, protocolSemanticDifference }, corpus = loadAcceptanceCorpus()) {
  const item = corpus.cases.find(entry => entry.id === caseId);
  assert.ok(item, "judgment-unknown-case");
  const response = rawOpenAiMessageToResponse(message);
  const record = {
    caseId, attempt, turnIndex, response, responseSha256: responseDigest(response),
    transport: structuredClone(transport),
    deterministic: gradeDeterministic(item, response, { turnIndex }),
    semantic: structuredClone(semantic),
    ...(protocolSemanticDifference ? { protocolSemanticDifference } : {}),
  };
  validateJudgmentRecord(record, item, corpus.attemptsPerCase);
  return record;
}

export function validateJudgmentRecord(record, item, attemptsPerCase = 3) {
  assert.equal(record.caseId, item.id, "judgment-case-identity-mismatch");
  assert.ok(Number.isInteger(record.attempt) && record.attempt >= 1 && record.attempt <= attemptsPerCase, "judgment-attempt-invalid");
  assert.ok(Number.isInteger(record.turnIndex) && record.turnIndex >= 0 && record.turnIndex <= (item.turns?.length ?? 0), "judgment-turn-invalid");
  assert.equal(record.responseSha256, responseDigest(record.response), "judgment-response-digest-mismatch");
  assert.ok(typeof record.response.content === "string" || record.response.content === null, "judgment-response-content-invalid");
  assert.ok(Array.isArray(record.response.toolCalls), "judgment-response-tool-calls-invalid");
  assert.ok(TRANSPORT_OUTCOMES.includes(record.transport.status), "judgment-transport-status-invalid");
  assert.ok(record.transport.finishReason === null || typeof record.transport.finishReason === "string", "judgment-finish-reason-invalid");
  assert.ok(record.transport.errorCode === null || typeof record.transport.errorCode === "string", "judgment-error-code-invalid");
  if (record.transport.status !== "completed") text(record.transport.reason, "judgment-failure-reason-required");
  if (record.transport.finishReason === "length") assert.equal(record.transport.status, "incomplete-response", "judgment-truncation-mislabeled-completed");
  assert.deepEqual(record.deterministic, gradeDeterministic(item, record.response, { turnIndex: record.turnIndex }), "judgment-deterministic-finding-altered");
  assert.ok(SEMANTIC_OUTCOMES.includes(record.semantic.outcome), "judgment-semantic-outcome-invalid");
  text(record.semantic.reason, "judgment-semantic-reason-required");
  assert.ok(Array.isArray(record.semantic.evidence), "judgment-semantic-evidence-array-required");
  for (const support of record.semantic.evidence) {
    if (support.type === "quote") {
      text(support.text, "judgment-empty-quote");
      assert.ok(record.response.content?.includes(support.text), "judgment-quote-not-in-raw-content");
    } else if (support.type === "tool-call") {
      assert.ok(Number.isInteger(support.index) && support.index >= 0 && support.index < record.response.toolCalls.length, "judgment-tool-evidence-index-invalid");
    } else assert.fail("judgment-evidence-type-invalid");
  }
  const criteria = record.turnIndex === 0 ? item.rubric : item.rubric.turns[record.turnIndex];
  if (record.semantic.outcome === "critical-error") {
    assert.ok(criteria.criticalErrors.includes(record.semantic.criticalRule), "judgment-critical-rule-not-in-frozen-rubric");
    assert.ok(record.semantic.evidence.length > 0, "judgment-critical-evidence-required");
  }
  if (record.semantic.outcome === "review-required") text(record.semantic.reviewQuestion, "judgment-review-question-required");
  if (["provider-failure", "incomplete-response"].includes(record.semantic.outcome))
    assert.equal(record.semantic.outcome, record.transport.status, "judgment-semantic-transport-failure-mismatch");
  if (record.semantic.outcome === "acceptable" && record.deterministic.status === "fail")
    text(record.protocolSemanticDifference, "judgment-protocol-semantic-difference-rationale-required");
  if (record.protocolSemanticDifference !== undefined) text(record.protocolSemanticDifference, "judgment-empty-protocol-semantic-rationale");
  return true;
}

export function validateJudgmentBundle(bundle, corpus = loadAcceptanceCorpus()) {
  assert.equal(bundle.schemaVersion, "runa2-gate7f-qualification-judgments/v1");
  assert.match(bundle.armId, /^blind-[a-z0-9-]+$/, "judgment-anonymous-arm-label-required");
  assert.equal(bundle.acceptanceSealSha256, acceptanceSealDigest(), "judgment-acceptance-seal-mismatch");
  text(bundle.evaluator.id, "judgment-evaluator-id-required");
  assert.equal(bundle.evaluator.candidateIdentitiesWithheld, true, "judgment-blinding-required");
  assert.equal(bundle.evaluator.acceptanceModifiedAfterOutputs, false, "judgment-post-output-rubric-change-forbidden");
  assert.ok(Array.isArray(bundle.evaluator.blindingDisclosures), "judgment-blinding-disclosures-required");
  assert.ok(Array.isArray(bundle.records), "judgment-record-array-required");
  const expected = expectedTurnIdentities(corpus);
  assert.equal(bundle.records.length, expected.length, "judgment-turn-count-mismatch");
  const expectedKeys = new Set(expected.map(turnKey));
  const seen = new Set();
  for (const record of bundle.records) {
    const key = turnKey(record);
    assert.ok(expectedKeys.has(key), "judgment-unexpected-turn");
    assert.ok(!seen.has(key), "judgment-duplicate-turn");
    seen.add(key);
    validateJudgmentRecord(record, corpus.cases.find(item => item.id === record.caseId), corpus.attemptsPerCase);
  }
  assert.equal(seen.size, expectedKeys.size, "judgment-missing-turn");
  return true;
}
