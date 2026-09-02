import { createHash, createHmac } from "node:crypto";

import { evaluateAttempt } from "./assertions.mjs";
import { CASE_BUNDLE_SHA256 } from "./cases.mjs";
import { EXPLICIT_SEMANTIC_RUBRIC_VERSION, REVIEWER_INDEPENDENCE_DECLARATION,
  candidateIdentityAppears, materializeSemanticAttempt, semanticChecksForCase,
  validateSemanticAttemptDecision, validateSemanticPacket } from "./independent-semantic-review.mjs";
import { R15_FULL_CAMPAIGN_ATTEMPTS, R15_GEMMA_MODEL_ID, R15_GEMMA_REQUIRED_ATTEMPTS,
  R15_GEMMA_ROLES, canonicalR15GemmaAttempts, r15GemmaEligibilityManifestSha256,
  validateR15GemmaEligibilityManifest } from "./r15-gemma-eligibility-contract.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
export const R15_GEMMA_INDEPENDENT_EVALUATOR_ID = "independent-r15-gemma-semantic-reviewer";
function fail(code) { throw Object.assign(new Error(code), { code }); }
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function exactKeys(value, expected, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) fail(code);
}
function identityAppears(value) {
  const text = JSON.stringify(value).toLocaleLowerCase("en-US");
  return candidateIdentityAppears(text) || text.includes(R15_GEMMA_MODEL_ID.toLocaleLowerCase("en-US"))
    || /\bgemma\b/u.test(text);
}
function blindId(key, attemptId) { return `attempt-${createHmac("sha256", key).update(attemptId).digest("hex")}`; }

function visibleWorksheetEvidence(row) {
  const visible = new Map();
  const add = (pointer, value) => {
    if (typeof pointer !== "string" || visible.has(pointer)) fail("r15-gemma-review-visible-evidence-shape");
    visible.set(pointer, { sha256: sha(JSON.stringify(value)), rendered: typeof value === "string" ? value : JSON.stringify(value) });
  };
  for (const entry of row.providerOutputs) add(entry.pointer, entry.response);
  for (const entry of row.applicationAnswers) add(entry.pointer, entry.value);
  for (const entry of row.planSummaries) add(entry.pointer, entry.value);
  for (const entry of row.selectedSources) add(entry.pointer, entry.value);
  return visible;
}

function requireDecisionEvidenceWasVisible(decision, row) {
  const visible = visibleWorksheetEvidence(row);
  const expectedOutputs = row.providerOutputs.map(entry => ({ pointer: entry.pointer, sha256: sha(JSON.stringify(entry.response)) }));
  if (JSON.stringify(decision.providerOutputs) !== JSON.stringify(expectedOutputs)) fail("r15-gemma-review-provider-output-not-visible");
  for (const check of decision.checks) for (const binding of check.bindings) {
    const evidence = visible.get(binding.pointer);
    if (!evidence || evidence.sha256 !== binding.valueSha256 || !evidence.rendered.includes(binding.excerpt))
      fail("r15-gemma-review-binding-not-visible");
  }
}

export function buildR15GemmaBlindWorksheet({ eligibilityManifest, eligibilityManifestSha256, packets, blindKey }) {
  const arm = validateR15GemmaEligibilityManifest(eligibilityManifest);
  if (!SHA256.test(eligibilityManifestSha256 ?? "") || !Buffer.isBuffer(blindKey) || blindKey.length !== 32
      || !Array.isArray(packets) || packets.length !== R15_GEMMA_REQUIRED_ATTEMPTS) fail("r15-gemma-review-input");
  if (eligibilityManifestSha256 !== r15GemmaEligibilityManifestSha256(arm)) fail("r15-gemma-review-manifest-hash");
  const packetMap = new Map();
  for (const packet of packets) {
    if (packetMap.has(packet?.attemptId)) fail("r15-gemma-review-packet-duplicate");
    packetMap.set(packet?.attemptId, packet);
  }
  const mapping = [], rows = [];
  for (const slot of canonicalR15GemmaAttempts()) {
    const packet = packetMap.get(slot.attemptId);
    if (!packet) fail("r15-gemma-review-packet-missing");
    const reviewed = validateSemanticPacket(packet, slot.attemptId, arm.runtimeSealSha256, `packets/${slot.attemptId}`);
    const id = blindId(blindKey, slot.attemptId);
    const applicationAnswers = reviewed.observation.application.requests.flatMap((request, index) =>
      request?.operation === "answer" && request.response?.answer !== undefined ? [{
        pointer: `#/application/requests/${index}/response/answer`, value: structuredClone(request.response.answer),
        completion: structuredClone(request.response.completion ?? null), citations: structuredClone(request.response.citations ?? [])
      }] : []);
    const planSummaries = reviewed.observation.workflow.run.plans.flatMap((plan, index) =>
      plan?.summary !== undefined ? [{ pointer: `#/workflow/run/plans/${index}/summary`, value: structuredClone(plan.summary) }] : []);
    const selectedSources = (reviewed.item.setup.sources ?? []).flatMap((source, index) =>
      (reviewed.item.setup.selected ?? []).includes(source.alias) ? [{
        pointer: `case#/setup/sources/${index}/content`, alias: source.alias, value: structuredClone(source.content)
      }] : []);
    const base = {
      blindId: id,
      caseId: slot.caseId,
      role: slot.role,
      repetition: slot.repetition,
      rawSha256: reviewed.rawSha256,
      recordSha256: reviewed.recordSha256,
      providerOutputs: reviewed.observation.provider.calls.flatMap((call, index) => call.response === null || call.response === undefined ? [] : [{
        pointer: `#/provider/calls/${index}/response`, response: structuredClone(call.response)
      }]),
      applicationAnswers,
      planSummaries,
      selectedSources,
      observationStatus: reviewed.observation.status,
      semanticChecks: semanticChecksForCase(slot.caseId)
    };
    if (identityAppears(base)) fail("candidate-blind-review-impossible");
    const row = Object.freeze({ ...base, rowSha256: sha(JSON.stringify(base)) });
    mapping.push(Object.freeze({ attemptId: slot.attemptId, blindId: id, rowSha256: row.rowSha256 }));
    rows.push(row);
  }
  const worksheet = Object.freeze({ schemaVersion: "runaai-m1-candidate-blind-review-worksheet/v1",
    rubricVersion: EXPLICIT_SEMANTIC_RUBRIC_VERSION, candidateIdentityKnown: false, attempts: rows });
  if (identityAppears(worksheet)) fail("candidate-blind-review-impossible");
  const worksheetSha256 = sha(JSON.stringify(worksheet));
  const reviewManifest = Object.freeze({ schemaVersion: "runaai-m1-r15-gemma-review-input-manifest/v1",
    eligibilityManifestSha256, runtimeSealSha256: arm.runtimeSealSha256, caseBundleSha256: CASE_BUNDLE_SHA256,
    blindKeyBase64: blindKey.toString("base64"), blindKeySha256: sha(blindKey), mapping,
    worksheetSha256, reviewedAttempts: R15_GEMMA_REQUIRED_ATTEMPTS, comparativeCampaign: false,
    fullR15CampaignComplete: false, productQualificationPassed: false });
  return Object.freeze({ reviewManifest, worksheet });
}

export function validateR15GemmaSemanticDecisions({ eligibilityManifest, eligibilityManifestSha256,
  reviewManifest, worksheet, bundle, packets }) {
  const arm = validateR15GemmaEligibilityManifest(eligibilityManifest);
  exactKeys(reviewManifest, ["schemaVersion", "eligibilityManifestSha256", "runtimeSealSha256", "caseBundleSha256",
    "blindKeyBase64", "blindKeySha256", "mapping", "worksheetSha256", "reviewedAttempts", "comparativeCampaign",
    "fullR15CampaignComplete", "productQualificationPassed"], "r15-gemma-review-manifest-shape");
  if (typeof reviewManifest.blindKeyBase64 !== "string" || !/^[A-Za-z0-9+/]{43}=$/u.test(reviewManifest.blindKeyBase64))
    fail("r15-gemma-review-blind-key");
  const key = Buffer.from(reviewManifest.blindKeyBase64, "base64");
  if (key.length !== 32 || key.toString("base64") !== reviewManifest.blindKeyBase64) fail("r15-gemma-review-blind-key");
  const rebuilt = buildR15GemmaBlindWorksheet({ eligibilityManifest: arm, eligibilityManifestSha256, packets, blindKey: key });
  if (reviewManifest.schemaVersion !== "runaai-m1-r15-gemma-review-input-manifest/v1"
      || reviewManifest.eligibilityManifestSha256 !== eligibilityManifestSha256
      || reviewManifest.runtimeSealSha256 !== arm.runtimeSealSha256 || reviewManifest.caseBundleSha256 !== CASE_BUNDLE_SHA256
      || reviewManifest.blindKeySha256 !== sha(key) || JSON.stringify(reviewManifest.mapping) !== JSON.stringify(rebuilt.reviewManifest.mapping)
      || reviewManifest.worksheetSha256 !== rebuilt.reviewManifest.worksheetSha256
      || JSON.stringify(worksheet) !== JSON.stringify(rebuilt.worksheet) || reviewManifest.reviewedAttempts !== R15_GEMMA_REQUIRED_ATTEMPTS
      || reviewManifest.comparativeCampaign !== false || reviewManifest.fullR15CampaignComplete !== false
      || reviewManifest.productQualificationPassed !== false) fail("r15-gemma-review-manifest-binding");
  exactKeys(bundle, ["schemaVersion", "evaluatorId", "rubricVersion", "reviewerIndependence",
    "candidateIdentityKnownDuringReview", "worksheetSha256", "attempts"], "r15-gemma-review-bundle-shape");
  if (bundle.schemaVersion !== "runaai-m1-candidate-blind-semantic-decisions/v1"
      || bundle.evaluatorId !== R15_GEMMA_INDEPENDENT_EVALUATOR_ID || bundle.rubricVersion !== EXPLICIT_SEMANTIC_RUBRIC_VERSION
      || bundle.reviewerIndependence !== REVIEWER_INDEPENDENCE_DECLARATION
      || bundle.candidateIdentityKnownDuringReview !== false || bundle.worksheetSha256 !== reviewManifest.worksheetSha256
      || !Array.isArray(bundle.attempts) || bundle.attempts.length !== R15_GEMMA_REQUIRED_ATTEMPTS) fail("r15-gemma-review-bundle-binding");
  const packetsById = new Map(packets.map(packet => [packet.attemptId, packet]));
  const attempts = reviewManifest.mapping.map((entry, index) => {
    const slot = canonicalR15GemmaAttempts()[index], packet = packetsById.get(slot.attemptId);
    const reviewed = validateSemanticPacket(packet, slot.attemptId, arm.runtimeSealSha256, `packets/${slot.attemptId}`);
    if (worksheet.attempts[index].blindId !== entry.blindId || worksheet.attempts[index].rowSha256 !== entry.rowSha256)
      fail("r15-gemma-review-order-binding");
    const decision = bundle.attempts[index];
    const validated = validateSemanticAttemptDecision(decision, reviewed, entry.blindId, `bundle/attempts/${index}`);
    requireDecisionEvidenceWasVisible(decision, worksheet.attempts[index]);
    return validated;
  });
  return Object.freeze({ arm, evaluatorId: bundle.evaluatorId, attempts });
}

export function gradeR15GemmaEligibility(input) {
  const validated = validateR15GemmaSemanticDecisions(input);
  const provenance = input.provenance;
  const provenanceKeys = ["eligibilityManifestFileSha256", "eligibilityManifestSha256", "batchResultSha256",
    "completionValidationSha256", "runtimeSealSha256", "sourceTreeManifestSha256", "hardwarePlanSha256",
    "controlsSha256", "browserProofSha256", "homeReadySha256", "homeCompletionPreflightSha256",
    "homeCompletionReceiptSha256", "homeTerminalStatusSha256", "homeBeforeStateSha256", "homeFinalStateSha256",
    "homeExportSha256", "homeCompletionPublicationSha256", "homeCompletionVerificationSha256",
    "reviewManifestSha256", "worksheetFileSha256", "decisionsSha256", "postArmProvenanceSha256"];
  exactKeys(provenance, provenanceKeys, "r15-gemma-grade-provenance-shape");
  if (provenance.eligibilityManifestSha256 !== input.eligibilityManifestSha256
      || !provenanceKeys.every(key => SHA256.test(provenance[key] ?? ""))) fail("r15-gemma-grade-provenance-binding");
  const attempts = validated.attempts.map(attempt => {
    const observation = materializeSemanticAttempt(attempt, validated.evaluatorId);
    return Object.freeze({ attemptId: attempt.packet.attemptId, blindId: attempt.blindId, role: attempt.item.role,
      rawSha256: attempt.rawSha256, recordSha256: attempt.recordSha256,
      grade: evaluateAttempt(attempt.caseId, observation, { runtimeSealSha256: validated.arm.runtimeSealSha256,
        evaluatorId: validated.evaluatorId, expectedModelId: R15_GEMMA_MODEL_ID }) });
  });
  const roleScorecards = Object.fromEntries(R15_GEMMA_ROLES.map(role => {
    const rows = attempts.filter(value => value.role === role), passes = rows.filter(value => value.grade.passed === true).length;
    const indeterminate = rows.filter(value => !["pass", "fail"].includes(value.grade.status)).length;
    const criticalModelFailures = rows.reduce((count, value) => count + value.grade.criticalModelFailures.length, 0);
    const criticalProductFailures = rows.reduce((count, value) => count + value.grade.criticalProductFailures.length, 0);
    return [role, Object.freeze({ reviewed: rows.length, passed: passes, failed: rows.length - passes - indeterminate,
      blockedOrIndeterminate: indeterminate, criticalModelFailures, criticalProductFailures,
      candidateEligible: rows.length === 24 && passes >= 22 && indeterminate === 0
        && criticalModelFailures === 0 && criticalProductFailures === 0 })];
  }));
  const candidateEligibleAllFiveRoles = Object.values(roleScorecards).every(value => value.candidateEligible);
  return Object.freeze({ schemaVersion: "runaai-m1-r15-gemma-candidate-eligibility/v1", scope: "candidate-only",
    candidateId: validated.arm.candidateId, modelId: validated.arm.modelId, evaluatorId: validated.evaluatorId,
    provenance: Object.freeze(structuredClone(provenance)), sourceCommit: validated.arm.sourceCommit,
    runtimeSealSha256: validated.arm.runtimeSealSha256, controlsSha256: validated.arm.controlsSha256,
    browserProofSha256: validated.arm.browserProofSha256, homeReadySha256: validated.arm.homeReadySha256,
    homeLeaseId: validated.arm.homeLeaseId, homeLeaseSealSha256: validated.arm.homeLeaseSealSha256,
    reviewedAttempts: R15_GEMMA_REQUIRED_ATTEMPTS, requiredFullCampaignAttempts: R15_FULL_CAMPAIGN_ATTEMPTS,
    attempts, roleScorecards, candidateEligibleAllFiveRoles, comparativeEvaluationPerformed: false,
    fullR15CampaignComplete: false, productQualificationPassed: false, customerTrialReady: false,
    recommendedCandidateId: null, productionRoutingChanged: false, humanTrialStillRequired: true });
}
