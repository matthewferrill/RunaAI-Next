import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { CASE_BUNDLE_SHA256, MODEL_CASES } from "./cases.mjs";
import { EXPLICIT_SEMANTIC_RUBRIC_VERSION, REVIEWER_INDEPENDENCE_DECLARATION,
  semanticChecksForCase } from "./independent-semantic-review.mjs";
import { canonicalR15GemmaAttempts, createR15GemmaEligibilityManifest,
  r15GemmaEligibilityManifestSha256 } from "./r15-gemma-eligibility-contract.mjs";
import { R15_GEMMA_INDEPENDENT_EVALUATOR_ID, buildR15GemmaBlindWorksheet, gradeR15GemmaEligibility,
  validateR15GemmaSemanticDecisions } from "./r15-gemma-review-contract.mjs";

// Synthetic contract fixtures only. They do not load a model, contact a
// service, inspect production data, or decide semantic truth automatically.
const seal = "6".repeat(64);
const blindKey = Buffer.alloc(32, 23);
const evaluatorId = R15_GEMMA_INDEPENDENT_EVALUATOR_ID;
const sha = value => createHash("sha256").update(value).digest("hex");
const jsonSha = value => sha(JSON.stringify(value));
const itemFor = id => MODEL_CASES.find(item => item.id === id);
const phaseFor = (step, index) => step.id ?? `${index}:${step.action}`;

function manifest() {
  return createR15GemmaEligibilityManifest({
    armId: "r15-gemma-eligibility-1111111111111111", createdAt: "2026-09-02T06:00:00.000Z",
    candidateArtifactSha256: "1".repeat(64), candidateArtifactBytes: 123, embeddingArtifactSha256: "2".repeat(64),
    sourceCommit: "3".repeat(40), sourceArchiveSha256: "4".repeat(64), sourceTreeManifestSha256: "5".repeat(64),
    runtimeSealSha256: seal, hardwarePlanSha256: "7".repeat(64), qualificationCriteriaSha256: "8".repeat(64),
    controlsSha256: "9".repeat(64), browserProofSha256: "a".repeat(64), homeReadySha256: "b".repeat(64),
    homeLeaseId: "20260902-campaign-gemma-eligibility-r1", homeLeaseSealSha256: "c".repeat(64)
  });
}

function observation(slot) {
  const item = itemFor(slot.caseId);
  const value = {
    schemaVersion: "runaai-m1-functional-attempt/v1", ...slot, status: "completed",
    caseBundleSha256: CASE_BUNDLE_SHA256, runtimeSealSha256: seal,
    application: { requests: [], final: null }, provider: { calls: [], unexpectedCalls: [] },
    sources: { bindings: [], selectedAliases: [], indexOperations: [] }, project: {}, authority: {},
    workflow: { run: { plans: [] }, receipts: [], proposals: [] }, native: { calls: [], receipts: [], suites: [] },
    checks: [], evidence: item.journey.map((step, index) => ({ id: `phase-${index}`, source: "application",
      kind: "synthetic-journey-event", data: { phase: phaseFor(step, index) } })), failures: [], notImplemented: []
  };
  for (let index = 0; index < item.journey.length; index += 1) {
    const step = item.journey[index], phase = phaseFor(step, index);
    if (step.action !== "answer") continue;
    const answer = "Complete readable output.";
    value.application.requests.push({ operation: "answer", phase, requestId: `request-${index}`, status: 200,
      response: { answer, completion: { reason: "complete", timedOut: false, outputLimited: false }, citations: [] } });
    value.provider.calls.push({ phase, role: item.role, modelId: "gemma-4-26b-a4b-it-qat", response: { text: answer } });
  }
  if (["code", "agent"].includes(item.role)) {
    const summary = "Complete readable prospective plan summary.";
    value.workflow.run.plans.push({ summary });
    value.provider.calls.push({ phase: "1:run.start", role: item.role, modelId: "gemma-4-26b-a4b-it-qat",
      response: { text: JSON.stringify({ summary, steps: [] }) } });
  }
  return value;
}

function packet(slot) {
  const value = observation(slot), rawBytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`), rawSha256 = sha(rawBytes);
  const record = { attemptId: slot.attemptId, file: `${slot.attemptId}.json`, bytes: rawBytes.length,
    sha256: rawSha256, status: value.status };
  return { attemptId: slot.attemptId, observation: value, rawBytes,
    recordBytes: Buffer.from(`${JSON.stringify(record, null, 2)}\n`) };
}

function valueAt(item, observed, pointer) {
  const source = /^case#\/setup\/sources\/(\d+)\/content$/u.exec(pointer);
  if (source) return item.setup.sources[Number(source[1])].content;
  let value = observed;
  for (const key of pointer.slice(2).split("/").map(part => part.replaceAll("~1", "/").replaceAll("~0", "~"))) value = value[key];
  return value;
}

function binding(item, observed, pointer) {
  const value = valueAt(item, observed, pointer), rendered = typeof value === "string" ? value : JSON.stringify(value);
  return { pointer, valueSha256: jsonSha(value), excerpt: rendered.slice(0, Math.min(64, rendered.length)) };
}

function bindingsFor(check, item, observed) {
  if (check.kind === "policy.criticalModelBehaviors") return observed.provider.calls.map((call, index) =>
    binding(item, observed, `#/provider/calls/${index}/response`));
  if (check.kind === "summary.semanticFacts") return [binding(item, observed, "#/workflow/run/plans/0/summary")];
  const answers = observed.application.requests.map((request, index) => ({ request, index }))
    .filter(({ request }) => request.operation === "answer" && (check.phase === null || request.phase === check.phase))
    .map(({ index }) => binding(item, observed, `#/application/requests/${index}/response/answer`));
  if (check.kind !== "citations.claimSupport") return answers;
  return [...answers, ...(item.setup.sources ?? []).map((source, index) => ({ source, index }))
    .filter(({ source }) => (item.setup.selected ?? []).includes(source.alias))
    .map(({ index }) => binding(item, observed, `case#/setup/sources/${index}/content`))];
}

function expectedFacts(check) {
  if (check.kind === "policy.criticalModelBehaviors") return Object.keys(check.expected);
  if (check.kind === "answer.numericResult") return [check.expected];
  return check.kind.endsWith("semanticFacts") && Array.isArray(check.expected) ? check.expected : [];
}

function decisionFor(packetValue, blindId) {
  const observed = packetValue.observation, item = itemFor(observed.caseId);
  return {
    blindId, rawSha256: sha(packetValue.rawBytes), recordSha256: sha(packetValue.recordBytes),
    providerOutputs: observed.provider.calls.flatMap((call, index) => call.response === null || call.response === undefined ? [] : [{
      pointer: `#/provider/calls/${index}/response`, sha256: jsonSha(call.response)
    }]),
    checks: semanticChecksForCase(observed.caseId).map(check => ({
      checkId: check.checkId, verdict: "pass", reasonCode: "expected-assertion-satisfied",
      rationale: "The independent evaluator explicitly found this assertion satisfied in the complete bound output.",
      evidenceState: "readable", bindings: bindingsFor(check, item, observed),
      facts: expectedFacts(check).map((expectedFact, factIndex) => ({ factIndex, expectedFact, verdict: "pass",
        reasonCode: "expected-fact-present",
        rationale: "The independent evaluator explicitly found this expected fact in the complete bound output." }))
    }))
  };
}

function fixture() {
  const eligibilityManifest = manifest(), eligibilityManifestSha256 = r15GemmaEligibilityManifestSha256(eligibilityManifest);
  const packets = canonicalR15GemmaAttempts().map(packet);
  const { reviewManifest, worksheet } = buildR15GemmaBlindWorksheet({
    eligibilityManifest, eligibilityManifestSha256, packets, blindKey
  });
  const byId = new Map(packets.map(value => [value.attemptId, value]));
  const bundle = { schemaVersion: "runaai-m1-candidate-blind-semantic-decisions/v1", evaluatorId,
    rubricVersion: EXPLICIT_SEMANTIC_RUBRIC_VERSION, reviewerIndependence: REVIEWER_INDEPENDENCE_DECLARATION,
    candidateIdentityKnownDuringReview: false, worksheetSha256: reviewManifest.worksheetSha256,
    attempts: reviewManifest.mapping.map(entry => decisionFor(byId.get(entry.attemptId), entry.blindId)) };
  return { eligibilityManifest, eligibilityManifestSha256, packets, reviewManifest, worksheet, bundle,
    provenance: { eligibilityManifestFileSha256: "c".repeat(64), eligibilityManifestSha256,
      batchResultSha256: "d".repeat(64), completionValidationSha256: "e".repeat(64), runtimeSealSha256: "6".repeat(64),
      sourceTreeManifestSha256: "5".repeat(64), hardwarePlanSha256: "7".repeat(64), controlsSha256: "9".repeat(64),
      browserProofSha256: "a".repeat(64), homeReadySha256: "b".repeat(64), homeCompletionPreflightSha256: "4".repeat(64),
      homeCompletionReceiptSha256: "f".repeat(64), homeTerminalStatusSha256: "8".repeat(64),
      homeBeforeStateSha256: "0".repeat(64), homeFinalStateSha256: "0".repeat(64), reviewManifestSha256: "1".repeat(64),
      homeExportSha256: "5".repeat(64), homeCompletionPublicationSha256: "6".repeat(64),
      homeCompletionVerificationSha256: "7".repeat(64),
      worksheetFileSha256: "2".repeat(64), decisionsSha256: "3".repeat(64), postArmProvenanceSha256: "4".repeat(64) } };
}

test("candidate-local worksheet contains exactly 120 identity-free HMAC-blinded rows", () => {
  const value = fixture(), serialized = JSON.stringify(value.worksheet).toLocaleLowerCase("en-US");
  assert.equal(value.worksheet.attempts.length, 120);
  assert.equal(new Set(value.worksheet.attempts.map(row => row.blindId)).size, 120);
  assert.equal(serialized.includes("gemma"), false);
  assert.equal(serialized.includes("gemma4-26b-a4b"), false);
  assert.ok(value.worksheet.attempts.every(row => Array.isArray(row.applicationAnswers)
    && Array.isArray(row.planSummaries) && Array.isArray(row.selectedSources)));
  assert.ok(value.worksheet.attempts.some(row => row.applicationAnswers.length > 0));
  assert.ok(value.worksheet.attempts.some(row => row.planSummaries.length > 0));
  assert.ok(value.worksheet.attempts.some(row => row.selectedSources.length > 0));
  assert.equal(validateR15GemmaSemanticDecisions(value).attempts.length, 120);
});

test("worksheet exposes primary and corrected provider output plus the actually delivered answer", () => {
  const value = fixture(), packetValue = value.packets.find(item => item.observation.role === "review");
  packetValue.observation.provider.calls = [
    { phase: "answer", role: "review", modelId: "sealed-candidate", response: { text: "Initial incomplete draft." } },
    { phase: "answer-correction", role: "review", modelId: "sealed-candidate", response: { text: "Corrected complete draft." } }
  ];
  packetValue.observation.application.requests[0].response.answer = "Corrected complete draft.";
  packetValue.rawBytes = Buffer.from(`${JSON.stringify(packetValue.observation, null, 2)}\n`);
  packetValue.recordBytes = Buffer.from(`${JSON.stringify({ attemptId: packetValue.attemptId,
    file: `${packetValue.attemptId}.json`, bytes: packetValue.rawBytes.length, sha256: sha(packetValue.rawBytes),
    status: packetValue.observation.status }, null, 2)}\n`);
  const prepared = buildR15GemmaBlindWorksheet({ eligibilityManifest: value.eligibilityManifest,
    eligibilityManifestSha256: value.eligibilityManifestSha256, packets: value.packets, blindKey });
  const row = prepared.worksheet.attempts.find(item => item.caseId === packetValue.observation.caseId
    && item.repetition === packetValue.observation.repetition);
  assert.deepEqual(row.providerOutputs.map(item => item.response.text), ["Initial incomplete draft.", "Corrected complete draft."]);
  assert.equal(row.applicationAnswers[0].value, "Corrected complete draft.");
});

test("review binding rejects malformed keys, identity leakage, missing rows, reordering and hash drift", () => {
  let value = fixture(); value.reviewManifest = { ...value.reviewManifest, blindKeyBase64: "A".repeat(44) };
  assert.throws(() => validateR15GemmaSemanticDecisions(value), /r15-gemma-review-blind-key/u);
  value = fixture(); value.bundle.attempts.pop();
  assert.throws(() => validateR15GemmaSemanticDecisions(value), /r15-gemma-review-bundle-binding/u);
  value = fixture(); [value.bundle.attempts[0], value.bundle.attempts[1]] = [value.bundle.attempts[1], value.bundle.attempts[0]];
  assert.throws(() => validateR15GemmaSemanticDecisions(value), /blind-order-mismatch/u);
  value = fixture(); value.bundle.attempts[0].rawSha256 = "0".repeat(64);
  assert.throws(() => validateR15GemmaSemanticDecisions(value), /raw-hash-mismatch/u);
  value = fixture(); value.packets[0].observation.provider.calls[0].response = { text: "Gemma identifies itself." };
  value.packets[0].rawBytes = Buffer.from(`${JSON.stringify(value.packets[0].observation, null, 2)}\n`);
  value.packets[0].recordBytes = Buffer.from(`${JSON.stringify({ attemptId: value.packets[0].attemptId,
    file: `${value.packets[0].attemptId}.json`, bytes: value.packets[0].rawBytes.length,
    sha256: sha(value.packets[0].rawBytes), status: value.packets[0].observation.status }, null, 2)}\n`);
  assert.throws(() => buildR15GemmaBlindWorksheet({ eligibilityManifest: value.eligibilityManifest,
    eligibilityManifestSha256: value.eligibilityManifestSha256, packets: value.packets, blindKey }), /candidate-blind-review-impossible/u);
  value = fixture(); value.bundle.evaluatorId = "unplanned-reviewer";
  assert.throws(() => validateR15GemmaSemanticDecisions(value), /r15-gemma-review-bundle-binding/u);
  value = fixture();
  value.bundle.attempts[0].checks[0].bindings[0] = { pointer: "#/authority", valueSha256: jsonSha({}), excerpt: "{}" };
  assert.throws(() => validateR15GemmaSemanticDecisions(value), /r15-gemma-review-binding-not-visible/u);
});

test("candidate grade cannot claim comparative, product, trial, recommendation or routing completion", () => {
  const grade = gradeR15GemmaEligibility(fixture());
  assert.equal(grade.attempts.length, 120);
  assert.deepEqual(Object.fromEntries(Object.entries(grade.roleScorecards).map(([role, row]) => [role, row.reviewed])),
    { chat: 24, research: 24, code: 24, agent: 24, review: 24 });
  assert.equal(grade.comparativeEvaluationPerformed, false);
  assert.equal(grade.fullR15CampaignComplete, false);
  assert.equal(grade.productQualificationPassed, false);
  assert.equal(grade.customerTrialReady, false);
  assert.equal(grade.recommendedCandidateId, null);
  assert.equal(grade.productionRoutingChanged, false);
  assert.equal(grade.humanTrialStillRequired, true);
  assert.deepEqual(grade.provenance, fixture().provenance);
});
