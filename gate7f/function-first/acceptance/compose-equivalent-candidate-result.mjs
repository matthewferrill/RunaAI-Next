import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

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

function differencePaths(left, right, prefix = "") {
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

function modelFacingView(seal, candidateId) {
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
  if (!isDeepStrictEqual(missingIds, supplementalIds) || !isDeepStrictEqual(supplementalPlanIds, supplementalIds))
    fail("supplemental-identity-mismatch");
  if (priorIds.some(id => supplementalIds.includes(id))) fail("execution-window-overlap");
  if (priorIds.length + supplementalIds.length !== planIds.length) fail("composed-denominator-mismatch");

  const rowById = new Map([...priorResult.attempts, ...supplementalResult.attempts].map(row => [row.attemptId, row]));
  const attempts = planIds.map(id => rowById.get(id));
  if (attempts.some(row => !row)) fail("composed-attempt-missing");

  const sealDifferences = differencePaths(priorSeal, supplementalSeal).sort();
  if (!isDeepStrictEqual(sealDifferences, [...EXPECTED_SEAL_DIFFERENCES]))
    fail("unexpected-runtime-seal-difference", sealDifferences.join(","));
  const priorModelFacing = modelFacingView(priorSeal, candidateId);
  const supplementalModelFacing = modelFacingView(supplementalSeal, candidateId);
  if (!isDeepStrictEqual(priorModelFacing, supplementalModelFacing)) fail("model-facing-seal-mismatch");

  const executionWindows = [
    {
      kind: "original",
      sourceCommit: priorResult.sourceCommit,
      runtimeSealSha256: bindings.priorRuntimeSealSha256,
      resultSha256: bindings.priorResultSha256,
      recordedAttempts: priorIds.length,
      stopCode: priorResult.stopCode,
    },
    {
      kind: "timing-completion",
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
    compositionReason: "The first window ended at its batch hard stop; the second executed exactly the 13 identities that had not started.",
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
