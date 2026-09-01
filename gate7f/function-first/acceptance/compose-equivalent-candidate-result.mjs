import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { classifyCampaignFailure } from "./campaign-failure.mjs";

export const COMPOSED_RESULT_SCHEMA_VERSION = "runaai-m1-equivalence-audited-candidate-result/v1";
export const EQUIVALENCE_AUDIT_SCHEMA_VERSION = "runaai-m1-candidate-equivalence-audit/v1";

const SHA256 = /^[a-f0-9]{64}$/u;
const EXPECTED_SEAL_DIFFERENCES = Object.freeze([
  "residency.telemetryPolicySha256",
  "runtime.sourceArchiveSha256",
  "sourceCommit",
]);

const sha256 = value => createHash("sha256").update(value).digest("hex");
const parse = bytes => JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));

function fail(code, detail = "") {
  throw new Error(`${code}${detail ? `:${detail}` : ""}`);
}

function exactAttemptIds(rows, label) {
  if (!Array.isArray(rows)) fail("attempt-list-invalid", label);
  const ids = rows.map(row => row?.attemptId);
  if (ids.some(id => typeof id !== "string" || !id.length)) fail("attempt-id-invalid", label);
  if (new Set(ids).size !== ids.length) fail("attempt-id-duplicate", label);
  return ids;
}

export function differencePaths(left, right, prefix = "") {
  if (isDeepStrictEqual(left, right)) return [];
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object"
      || Array.isArray(left) || Array.isArray(right)) return [prefix];
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.flatMap(key => differencePaths(left[key], right[key], prefix ? `${prefix}.${key}` : key));
}

function candidate(seal, candidateId) {
  const matches = (seal?.candidates ?? []).filter(entry => entry?.candidateId === candidateId);
  if (matches.length !== 1) fail("candidate-seal-entry-invalid", candidateId);
  return matches[0];
}

export function modelFacingView(seal, candidateId) {
  return {
    candidate: candidate(seal, candidateId),
    caseBundleSha256: seal.caseBundleSha256,
    embedding: seal.embedding,
    evaluatorId: seal.evaluatorId,
    maximumBatchMs: seal.maximumBatchMs,
    productionRoutingChanged: seal.productionRoutingChanged,
    providerBaseUrl: seal.providerBaseUrl,
    qualificationCriteria: seal.qualificationCriteria,
    reranker: seal.reranker,
    residency: {
      effectiveReasoningEvidenceSha256: seal.residency?.effectiveReasoningEvidenceSha256,
      oneLargeModelAtATime: seal.residency?.oneLargeModelAtATime,
      readinessEvidenceSha256: seal.residency?.readinessEvidenceSha256,
    },
    roles: seal.roles,
    runtime: {
      modelRuntimeSha256: seal.runtime?.modelRuntimeSha256,
      modelRuntimeVersion: seal.runtime?.modelRuntimeVersion,
      nodeSha256: seal.runtime?.nodeSha256,
      packageLockSha256: seal.runtime?.packageLockSha256,
      qdrantSha256: seal.runtime?.qdrantSha256,
    },
    schemaVersion: seal.schemaVersion,
    suites: seal.suites,
  };
}

export function assertModelFacingSealEquivalence(priorSeal, supplementalSeal, candidateId) {
  const sealDifferences = differencePaths(priorSeal, supplementalSeal).sort();
  if (!isDeepStrictEqual(sealDifferences, [...EXPECTED_SEAL_DIFFERENCES]))
    fail("unexpected-runtime-seal-difference", sealDifferences.join(","));
  const priorModelFacing = modelFacingView(priorSeal, candidateId);
  const supplementalModelFacing = modelFacingView(supplementalSeal, candidateId);
  if (!isDeepStrictEqual(priorModelFacing, supplementalModelFacing)) fail("model-facing-seal-mismatch");
  return { sealDifferences, modelFacingView: priorModelFacing };
}

function identity(row) {
  return { attemptId: row?.attemptId, candidateId: row?.candidateId, caseId: row?.caseId,
    role: row?.role, repetition: row?.repetition };
}

export function composeEquivalentCandidateHistoryResult({ history, windows, basePlan, finalResult,
  continuationPlan, currentSeal, bindings }) {
  const candidateId = "qwen36-27b-mtp", expectedWindows = [
    { index: 1, kind: "original", retainedAttempts: 68, startOrdinal: 1, endOrdinal: 68 },
    { index: 2, kind: "continuation", retainedAttempts: 1, startOrdinal: 69, endOrdinal: 69 },
  ];
  for (const [label, value] of Object.entries(bindings ?? {})) if (label.endsWith("Sha256")) requireSha(value, label);
  const baseIds = exactAttemptIds(basePlan?.attempts, "base-plan");
  const currentCandidate = candidate(currentSeal, candidateId);
  if (history?.schemaVersion !== "runaai-m1-campaign-continuation-history/v1" || history.candidateId !== candidateId
      || history.basePlanSha256 !== bindings.basePlanSha256 || bindings.historyManifestSha256 !== continuationPlan?.historyManifestSha256
      || history.retainedPrefixAttempts !== 69 || history.resumeAttemptId !== baseIds[69]
      || basePlan?.candidateId !== candidateId || basePlan.modelId !== currentCandidate.modelId
      || basePlan.sourceCommit !== currentSeal.sourceCommit || basePlan.caseBundleSha256 !== currentSeal.caseBundleSha256
      || basePlan.runtimeSealSha256 !== bindings.currentRuntimeSealSha256
      || baseIds.length !== 120 || history.windows?.length !== 2
      || windows?.length !== 2) fail("history-composition-binding-invalid");

  const attempts = [], executionWindows = [], invariantDigests = [];
  for (let index = 0; index < windows.length; index++) {
    const definition = history.windows[index], expected = expectedWindows[index], loaded = windows[index],
      result = loaded?.result, sourcePlan = loaded?.plan, seal = loaded?.seal;
    if (loaded?.definition !== definition || definition.index !== expected.index || definition.kind !== expected.kind
        || definition.retainedAttempts !== expected.retainedAttempts || definition.startOrdinal !== expected.startOrdinal
        || definition.endOrdinal !== expected.endOrdinal || definition.resultSha256 !== loaded.resultSha256
        || definition.planSha256 !== loaded.planSha256 || definition.runtimeSealSha256 !== loaded.runtimeSealSha256
        || result?.candidateId !== candidateId || result.runtimeSealSha256 !== definition.runtimeSealSha256
        || result.sourceCommit !== seal?.sourceCommit || result.caseBundleSha256 !== seal?.caseBundleSha256
        || sourcePlan?.candidateId !== candidateId || sourcePlan.sourceCommit !== seal.sourceCommit
        || sourcePlan.runtimeSealSha256 !== definition.runtimeSealSha256 || sourcePlan.caseBundleSha256 !== seal.caseBundleSha256
        || sourcePlan.modelId !== basePlan.modelId || !isDeepStrictEqual(sourcePlan.roster, basePlan.roster)
        || result.recordedAttempts !== expected.retainedAttempts || result.plannedCandidateAttempts !== sourcePlan.attempts?.length
        || !result.stopCode || classifyCampaignFailure(result.stopCode, { phase: "runner" }).attribution !== "non-model") {
      fail("history-composition-window-invalid", String(index + 1));
    }
    const expectedRows = basePlan.attempts.slice(expected.startOrdinal - 1, expected.endOrdinal);
    const expectedSourceIds = baseIds.slice(expected.startOrdinal - 1);
    if (!isDeepStrictEqual(result.attempts?.map(identity), expectedRows.map(identity))
        || !isDeepStrictEqual(sourcePlan.attempts?.map(identity), basePlan.attempts.slice(expected.startOrdinal - 1).map(identity))
        || !isDeepStrictEqual(result.notExecuted, expectedSourceIds.slice(expected.retainedAttempts))) {
      fail("history-composition-window-identities-invalid", String(index + 1));
    }
    const equivalence = assertModelFacingSealEquivalence(seal, currentSeal, candidateId);
    const invariantModelFacingViewSha256 = sha256(Buffer.from(JSON.stringify(equivalence.modelFacingView)));
    invariantDigests.push(invariantModelFacingViewSha256); attempts.push(...result.attempts);
    executionWindows.push({ index: index + 1, kind: definition.kind, startOrdinal: definition.startOrdinal,
      endOrdinal: definition.endOrdinal, sourceCommit: result.sourceCommit,
      runtimeSealSha256: definition.runtimeSealSha256, resultSha256: definition.resultSha256,
      planSha256: definition.planSha256, recordedAttempts: result.recordedAttempts, stopCode: result.stopCode,
      immutablePlanPrefix: true, observedSealDifferencePaths: equivalence.sealDifferences,
      invariantModelFacingViewSha256 });
  }
  const finalIds = exactAttemptIds(finalResult?.attempts, "final-result"), continuationIds = exactAttemptIds(continuationPlan?.attempts, "continuation-plan");
  const exactProvenance = { schemaVersion: "runaai-m1-campaign-continuation-provenance/v1",
    historyManifestSha256: bindings.historyManifestSha256, basePlanSha256: bindings.basePlanSha256,
    retainedPrefixAttempts: 69, resumeAttemptId: baseIds[69], priorWindows: history.windows.map((definition, index) => ({
      index: definition.index, kind: definition.kind, startOrdinal: definition.startOrdinal, endOrdinal: definition.endOrdinal,
      resultSha256: definition.resultSha256, planSha256: definition.planSha256,
      runtimeSealSha256: definition.runtimeSealSha256, retainedAttempts: definition.retainedAttempts,
      sourceCommit: windows[index].result.sourceCommit })), singleUninterruptedArmClaimed: false };
  const expectedContinuationPlan = { ...basePlan, schemaVersion: "runaai-m1-campaign-continuation-plan/v2",
    historyManifestSha256: bindings.historyManifestSha256, basePlanSha256: bindings.basePlanSha256,
    retainedPrefixAttempts: 69, resumeAttemptId: baseIds[69], plannedCampaignAttempts: 51,
    plannedCandidateAttempts: 51, attempts: basePlan.attempts.slice(69), continuation: true, supplemental: true,
    continuationHistory: exactProvenance, qualificationCompositionPermitted: false };
  const normalizedContinuationPlan = { ...continuationPlan, createdAt: expectedContinuationPlan.createdAt };
  if (continuationPlan?.schemaVersion !== "runaai-m1-campaign-continuation-plan/v2"
      || continuationPlan.basePlanSha256 !== bindings.basePlanSha256
      || continuationPlan.runtimeSealSha256 !== bindings.currentRuntimeSealSha256
      || continuationPlan.resumeAttemptId !== baseIds[69] || continuationPlan.retainedPrefixAttempts !== 69
      || continuationPlan.continuation !== true || continuationPlan.supplemental !== true
      || continuationPlan.plannedCandidateAttempts !== 51 || continuationPlan.plannedCampaignAttempts !== 51
      || !isDeepStrictEqual(continuationPlan.continuationHistory, exactProvenance)
      || !isDeepStrictEqual(normalizedContinuationPlan, expectedContinuationPlan)
      || !isDeepStrictEqual(continuationIds, baseIds.slice(69)) || !isDeepStrictEqual(finalIds, continuationIds)
      || finalResult?.candidateId !== candidateId || finalResult.runtimeSealSha256 !== bindings.currentRuntimeSealSha256
      || finalResult.sourceCommit !== currentSeal?.sourceCommit || finalResult.caseBundleSha256 !== currentSeal?.caseBundleSha256
      || finalResult.recordedAttempts !== 51 || finalResult.plannedCandidateAttempts !== 51
      || finalResult.stopCode !== null || (finalResult.notExecuted ?? []).length !== 0) fail("history-composition-final-invalid");
  if (bindings.finalResultSha256 !== bindings.loadedFinalResultSha256
      || bindings.finalPlanSha256 !== bindings.loadedFinalPlanSha256) fail("history-composition-final-binding-invalid");
  attempts.push(...finalResult.attempts);
  if (!isDeepStrictEqual(attempts.map(identity), basePlan.attempts.map(identity))) fail("history-composition-denominator-invalid");
  const currentViewSha256 = sha256(Buffer.from(JSON.stringify(modelFacingView(currentSeal, candidateId))));
  if (invariantDigests.some(value => value !== currentViewSha256)) fail("history-composition-invariant-digest-mismatch");
  executionWindows.push({ index: 3, kind: "continuation", startOrdinal: 70, endOrdinal: 120,
    sourceCommit: finalResult.sourceCommit, runtimeSealSha256: bindings.currentRuntimeSealSha256,
    resultSha256: bindings.finalResultSha256, planSha256: bindings.finalPlanSha256,
    recordedAttempts: 51, stopCode: null, invariantModelFacingViewSha256: currentViewSha256 });
  const equivalenceAudit = { schemaVersion: "runaai-m1-candidate-history-equivalence-audit/v1", candidateId,
    caseBundleSha256: currentSeal.caseBundleSha256, historyManifestSha256: bindings.historyManifestSha256,
    basePlanSha256: bindings.basePlanSha256, modelFacingEquivalent: true,
    invariantModelFacingViewSha256: currentViewSha256, expectedSealDifferencePaths: [...EXPECTED_SEAL_DIFFERENCES],
    executionWindows, completedPrefixImmutable: true, singleUninterruptedArmClaimed: false,
    qualificationCompositionPermitted: true, independentSemanticReviewPending: true };
  const auditSha256 = sha256(Buffer.from(`${JSON.stringify(equivalenceAudit, null, 2)}\n`, "utf8"));
  return { audit: equivalenceAudit, auditSha256, result: { schemaVersion: COMPOSED_RESULT_SCHEMA_VERSION,
    candidateId, caseBundleSha256: currentSeal.caseBundleSha256, plannedCampaignAttempts: 360,
    plannedCandidateAttempts: 120, recordedAttempts: 120, attempts, notExecuted: [], stopCode: null,
    denominatorChanged: false, supplemental: false, equivalenceCompositionPermitted: true,
    equivalenceAuditSha256: auditSha256, executionWindows, independentSemanticReviewPending: true,
    humanTrialRequired: true, productQualificationPassed: false, productionChanged: false, protectedDataRead: false } };
}

function requireSha(value, label) {
  if (!SHA256.test(value ?? "")) fail("sha256-invalid", label);
}

export function composeEquivalentCandidateResult({
  priorResult,
  supplementalResult,
  priorPlan,
  supplementalPlan,
  priorSeal,
  supplementalSeal,
  bindings,
}) {
  const candidateId = priorResult?.candidateId;
  if (typeof candidateId !== "string" || candidateId !== supplementalResult?.candidateId
      || candidateId !== priorPlan?.candidateId || candidateId !== supplementalPlan?.candidateId)
    fail("candidate-binding-mismatch");
  if (priorResult.caseBundleSha256 !== supplementalResult.caseBundleSha256
      || priorResult.caseBundleSha256 !== priorSeal.caseBundleSha256
      || priorResult.caseBundleSha256 !== supplementalSeal.caseBundleSha256)
    fail("case-bundle-mismatch");
  if (priorResult.runtimeSealSha256 !== bindings.priorRuntimeSealSha256
      || supplementalResult.runtimeSealSha256 !== bindings.supplementalRuntimeSealSha256)
    fail("runtime-seal-binding-mismatch");
  for (const [label, value] of Object.entries(bindings)) if (label.endsWith("Sha256")) requireSha(value, label);

  const priorIds = exactAttemptIds(priorResult.attempts, "prior-result");
  const supplementalIds = exactAttemptIds(supplementalResult.attempts, "supplemental-result");
  const missingIds = exactAttemptIds((priorResult.notExecuted ?? []).map(attemptId => ({ attemptId })), "prior-not-executed");
  const planIds = exactAttemptIds(priorPlan.attempts, "prior-plan");
  const supplementalPlanIds = exactAttemptIds(supplementalPlan.attempts, "supplemental-plan");
  if (priorResult.recordedAttempts !== priorIds.length || priorResult.plannedCandidateAttempts !== planIds.length)
    fail("prior-count-mismatch");
  if (supplementalResult.recordedAttempts !== supplementalIds.length
      || supplementalResult.plannedCandidateAttempts !== supplementalIds.length
      || supplementalResult.stopCode !== null || (supplementalResult.notExecuted ?? []).length !== 0)
    fail("supplemental-incomplete");
  if (!isDeepStrictEqual(priorIds, planIds.slice(0, priorIds.length))
      || !isDeepStrictEqual(missingIds, planIds.slice(priorIds.length))
      || !isDeepStrictEqual(missingIds, supplementalIds) || !isDeepStrictEqual(supplementalPlanIds, supplementalIds))
    fail("supplemental-identity-mismatch");
  if (!priorResult.stopCode || classifyCampaignFailure(priorResult.stopCode, { phase: "runner" }).attribution !== "non-model")
    fail("prior-stop-not-non-model");
  if (priorIds.some(id => supplementalIds.includes(id))) fail("execution-window-overlap");
  if (priorIds.length + supplementalIds.length !== planIds.length) fail("composed-denominator-mismatch");

  const rowById = new Map([...priorResult.attempts, ...supplementalResult.attempts].map(row => [row.attemptId, row]));
  const attempts = planIds.map(id => rowById.get(id));
  if (attempts.some(row => !row)) fail("composed-attempt-missing");

  const { sealDifferences, modelFacingView: priorModelFacing } =
    assertModelFacingSealEquivalence(priorSeal, supplementalSeal, candidateId);

  const executionWindows = [
    {
      kind: "original",
      sourceCommit: priorResult.sourceCommit,
      runtimeSealSha256: bindings.priorRuntimeSealSha256,
      resultSha256: bindings.priorResultSha256,
      recordedAttempts: priorIds.length,
      stopCode: priorResult.stopCode,
      immutablePlanPrefix: true,
    },
    {
      kind: "continuation",
      sourceCommit: supplementalResult.sourceCommit,
      runtimeSealSha256: bindings.supplementalRuntimeSealSha256,
      resultSha256: bindings.supplementalResultSha256,
      recordedAttempts: supplementalIds.length,
      stopCode: supplementalResult.stopCode,
    },
  ];
  const equivalenceAudit = {
    schemaVersion: EQUIVALENCE_AUDIT_SCHEMA_VERSION,
    candidateId,
    caseBundleSha256: priorResult.caseBundleSha256,
    modelFacingEquivalent: true,
    expectedSealDifferencePaths: [...EXPECTED_SEAL_DIFFERENCES],
    observedSealDifferencePaths: sealDifferences,
    invariantModelFacingView: priorModelFacing,
    executionWindows,
    compositionReason: `The first window ended for a non-model operational reason; the continuation executed exactly the ${supplementalIds.length} identities in the audited resume set.`,
    singleUninterruptedArmClaimed: false,
  };
  const auditSha256 = sha256(Buffer.from(`${JSON.stringify(equivalenceAudit, null, 2)}\n`, "utf8"));
  return {
    audit: equivalenceAudit,
    auditSha256,
    result: {
      schemaVersion: COMPOSED_RESULT_SCHEMA_VERSION,
      candidateId,
      caseBundleSha256: priorResult.caseBundleSha256,
      plannedCampaignAttempts: 360,
      plannedCandidateAttempts: planIds.length,
      recordedAttempts: attempts.length,
      attempts,
      notExecuted: [],
      stopCode: null,
      denominatorChanged: false,
      supplemental: false,
      equivalenceCompositionPermitted: true,
      equivalenceAuditSha256: auditSha256,
      executionWindows,
      independentSemanticReviewPending: true,
      humanTrialRequired: true,
      productQualificationPassed: false,
      productionChanged: false,
      protectedDataRead: false,
    },
  };
}

async function loadBoundJson(file, expectedSha256, label) {
  const bytes = await readFile(file);
  if (sha256(bytes) !== expectedSha256) fail("input-hash-mismatch", label);
  return parse(bytes);
}

function args(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail("argument-invalid", key ?? "missing");
    values[key.slice(2)] = value;
  }
  return values;
}

export async function runCompositionCli(argv) {
  const input = args(argv);
  for (const key of ["prior-directory", "supplemental-directory", "output-directory",
    "prior-result-sha256", "prior-plan-sha256", "prior-runtime-seal-sha256",
    "supplemental-result-sha256", "supplemental-plan-sha256", "supplemental-runtime-seal-sha256"])
    if (!input[key]) fail("argument-missing", key);
  const priorDirectory = path.resolve(input["prior-directory"]);
  const supplementalDirectory = path.resolve(input["supplemental-directory"]);
  const outputDirectory = path.resolve(input["output-directory"]);
  const priorResult = await loadBoundJson(path.join(priorDirectory, "result.json"), input["prior-result-sha256"], "prior-result");
  const priorPlan = await loadBoundJson(path.join(priorDirectory, "plan.json"), input["prior-plan-sha256"], "prior-plan");
  const priorSeal = await loadBoundJson(path.join(priorDirectory, "runtimeSeal.json"), input["prior-runtime-seal-sha256"], "prior-runtime-seal");
  const supplementalResult = await loadBoundJson(path.join(supplementalDirectory, "result.json"), input["supplemental-result-sha256"], "supplemental-result");
  const supplementalPlan = await loadBoundJson(path.join(supplementalDirectory, "plan.json"), input["supplemental-plan-sha256"], "supplemental-plan");
  const supplementalSeal = await loadBoundJson(path.join(supplementalDirectory, "runtimeSeal.json"), input["supplemental-runtime-seal-sha256"], "supplemental-runtime-seal");
  const composed = composeEquivalentCandidateResult({
    priorResult, supplementalResult, priorPlan, supplementalPlan, priorSeal, supplementalSeal,
    bindings: {
      priorResultSha256: input["prior-result-sha256"],
      supplementalResultSha256: input["supplemental-result-sha256"],
      priorRuntimeSealSha256: input["prior-runtime-seal-sha256"],
      supplementalRuntimeSealSha256: input["supplemental-runtime-seal-sha256"],
    },
  });
  await mkdir(outputDirectory, { recursive: false });
  const auditBytes = Buffer.from(`${JSON.stringify(composed.audit, null, 2)}\n`, "utf8");
  const resultBytes = Buffer.from(`${JSON.stringify(composed.result, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDirectory, "equivalence-audit.json"), auditBytes, { flag: "wx" });
  await writeFile(path.join(outputDirectory, "qwen-composed-result.json"), resultBytes, { flag: "wx" });
  return {
    outputDirectory,
    auditSha256: sha256(auditBytes),
    resultSha256: sha256(resultBytes),
    recordedAttempts: composed.result.recordedAttempts,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, value => value.slice(1)))) {
  runCompositionCli(process.argv.slice(2)).then(value => console.log(JSON.stringify(value))).catch(error => {
    console.error(error.message); process.exitCode = 1;
  });
}
