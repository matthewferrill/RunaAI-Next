import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ACCEPTANCE_POLICY, MODEL_CASES } from "./cases.mjs";
import { assertModelFacingSealEquivalence } from "./compose-equivalent-candidate-result.mjs";
import { classifyCampaignFailure } from "./campaign-failure.mjs";
import { parseCampaignArguments, runModelCampaign, validateCampaignInputs } from "./run-model-campaign.mjs";

const HEX = /^[a-f0-9]{64}$/u;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = code => Object.assign(new Error(code), { code });
const safeCode = error => /^m1-[a-z0-9-]+$/u.test(error?.code ?? error?.message ?? "")
  ? error.code ?? error.message : "m1-campaign-continuation-failed";
const R14_HISTORY = Object.freeze({ candidateId: "qwen36-27b-mtp", retained: 69,
  resumeAttemptId: "qwen36-27b-mtp--agent-06-crash-reconcile--2", remaining: 51,
  windows: Object.freeze([{ kind: "original", retainedAttempts: 68, startOrdinal: 1, endOrdinal: 68 },
    { kind: "continuation", retainedAttempts: 1, startOrdinal: 69, endOrdinal: 69 }]) });

const fullAttemptIds = candidateId => Array.from(
  { length: ACCEPTANCE_POLICY.repetitionsPerCandidateCase },
  (_, index) => MODEL_CASES.map(item => `${candidateId}--${item.id}--${index + 1}`),
).flat();

export function parseContinuationArguments(argv) {
  const retained = [], continuation = {}, names = new Set([
    "continuation-plan", "continuation-plan-sha256", "prior-result", "prior-result-sha256",
    "prior-runtime-seal", "prior-runtime-seal-sha256", "history-manifest", "history-manifest-sha256",
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const raw = argv[index], value = argv[index + 1], key = raw?.slice(2);
    if (!raw?.startsWith("--") || !value || value.startsWith("--")) throw fail("m1-campaign-argument-invalid");
    if (names.has(key)) {
      if (continuation[key]) throw fail("m1-campaign-duplicate-argument");
      continuation[key] = value;
    } else retained.push(raw, value);
  }
  if (!continuation["continuation-plan"] || !HEX.test(continuation["continuation-plan-sha256"] ?? ""))
    throw fail("m1-campaign-required-input-missing");
  const legacy = ["prior-result", "prior-result-sha256", "prior-runtime-seal", "prior-runtime-seal-sha256"];
  const history = ["history-manifest", "history-manifest-sha256"];
  const legacyPresent = legacy.some(name => continuation[name]), historyPresent = history.some(name => continuation[name]);
  if (legacyPresent === historyPresent || legacyPresent && (legacy.some(name => !continuation[name])
      || ["prior-result-sha256", "prior-runtime-seal-sha256"].some(name => !HEX.test(continuation[name] ?? "")))
      || historyPresent && (history.some(name => !continuation[name]) || !HEX.test(continuation["history-manifest-sha256"])))
    throw fail("m1-campaign-required-input-missing");
  return { campaign: parseCampaignArguments(retained), continuation };
}

export function validateContinuationContract({ campaign, plan, priorResult, priorSeal, currentSeal, bindings }) {
  const candidateId = campaign["candidate-id"], expected = fullAttemptIds(candidateId);
  const retained = plan?.retainedPrefixAttempts;
  const planIds = plan?.attempts?.map(value => value?.attemptId);
  const priorIds = priorResult?.attempts?.map(value => value?.attemptId);
  if (plan?.schemaVersion !== "runaai-m1-campaign-continuation-plan/v1" || plan.continuation !== true
      || plan.supplemental !== true || plan.candidateId !== candidateId || !Number.isSafeInteger(retained)
      || retained < 0 || retained >= expected.length || plan.resumeAttemptId !== expected[retained]
      || plan.plannedCandidateAttempts !== expected.length - retained
      || plan.plannedCampaignAttempts !== expected.length - retained
      || JSON.stringify(planIds) !== JSON.stringify(expected.slice(retained))) throw fail("m1-campaign-continuation-plan-invalid");
  if (plan.priorResultSha256 !== bindings.priorResultSha256
      || plan.priorRuntimeSealSha256 !== bindings.priorRuntimeSealSha256) throw fail("m1-campaign-continuation-binding-invalid");
  if (!Array.isArray(priorIds) || priorResult.candidateId !== candidateId || priorResult.recordedAttempts !== priorIds.length
      || priorIds.length < retained || JSON.stringify(priorIds.slice(0, retained)) !== JSON.stringify(expected.slice(0, retained))
      || JSON.stringify(priorIds.slice(retained)) !== JSON.stringify(plan.discardedHistoricalAttempts ?? []))
    throw fail("m1-campaign-continuation-prior-invalid");
  if (priorResult.runtimeSealSha256 !== bindings.priorRuntimeSealSha256) throw fail("m1-campaign-continuation-prior-seal-invalid");
  const equivalence = assertModelFacingSealEquivalence(priorSeal, currentSeal, candidateId);
  return { attemptIds: planIds, prior: { kind: "result", sha256: bindings.priorResultSha256, recordedAttempts: retained,
    notExecuted: planIds, formalQualificationCompositionPermitted: false }, equivalence };
}

export function validateContinuationHistoryContract({ campaign, plan, history, windows, currentSeal, bindings }) {
  const candidateId = campaign["candidate-id"], expected = fullAttemptIds(candidateId), basePlan = bindings?.basePlan;
  if (history?.schemaVersion !== "runaai-m1-campaign-continuation-history/v1" || history.candidateId !== candidateId
      || candidateId !== R14_HISTORY.candidateId || history.basePlanSha256 !== bindings?.basePlanSha256
      || !HEX.test(history.basePlanSha256 ?? "") || history.retainedPrefixAttempts !== R14_HISTORY.retained
      || history.resumeAttemptId !== R14_HISTORY.resumeAttemptId || basePlan?.candidateId !== candidateId
      || JSON.stringify(basePlan?.attempts?.map(value => value?.attemptId)) !== JSON.stringify(expected)
      || !Array.isArray(history.windows) || history.windows.length !== R14_HISTORY.windows.length
      || !Array.isArray(windows) || windows.length !== history.windows.length
      || !HEX.test(bindings?.historyManifestSha256 ?? "") || plan?.historyManifestSha256 !== bindings.historyManifestSha256
      || plan?.basePlanSha256 !== bindings.basePlanSha256) throw fail("m1-campaign-continuation-history-invalid");

  const identities = rows => rows.map(value => ({ attemptId: value?.attemptId, candidateId: value?.candidateId,
    caseId: value?.caseId, role: value?.role, repetition: value?.repetition }));
  let retained = 0; const windowEvidence = [], seen = new Set();
  for (let index = 0; index < windows.length; index++) {
    const definition = history.windows[index], loaded = windows[index], result = loaded?.result, seal = loaded?.seal,
      sourcePlan = loaded?.plan, expectedWindow = R14_HISTORY.windows[index];
    if (loaded?.definition !== definition || definition?.index !== index + 1
        || definition.kind !== expectedWindow.kind || definition.retainedAttempts !== expectedWindow.retainedAttempts
        || definition.startOrdinal !== expectedWindow.startOrdinal || definition.endOrdinal !== expectedWindow.endOrdinal
        || typeof definition.result !== "string" || typeof definition.sourcePlan !== "string" || typeof definition.runtimeSeal !== "string"
        || !HEX.test(definition.resultSha256 ?? "") || !HEX.test(definition.planSha256 ?? "")
        || !HEX.test(definition.runtimeSealSha256 ?? "") || result?.candidateId !== candidateId
        || result.runtimeSealSha256 !== definition.runtimeSealSha256 || result.sourceCommit !== seal?.sourceCommit
        || result.caseBundleSha256 !== seal?.caseBundleSha256 || result.recordedAttempts !== definition.retainedAttempts
        || result.attempts?.length !== definition.retainedAttempts || sourcePlan?.candidateId !== candidateId
        || sourcePlan.sourceCommit !== seal.sourceCommit || sourcePlan.runtimeSealSha256 !== definition.runtimeSealSha256
        || sourcePlan.caseBundleSha256 !== seal.caseBundleSha256 || result.plannedCandidateAttempts !== sourcePlan.attempts?.length
        || !result.stopCode || classifyCampaignFailure(result.stopCode, { phase: "runner" }).attribution !== "non-model") {
      throw fail("m1-campaign-continuation-history-window-invalid");
    }
    const expectedRows = basePlan.attempts.slice(expectedWindow.startOrdinal - 1, expectedWindow.endOrdinal);
    const ids = result.attempts.map(value => value?.attemptId), expectedIds = expectedRows.map(value => value.attemptId);
    const sourcePlanIds = sourcePlan.attempts.map(value => value?.attemptId), expectedSourcePlanIds = expected.slice(expectedWindow.startOrdinal - 1);
    const expectedNotExecuted = expectedSourcePlanIds.slice(definition.retainedAttempts);
    if (ids.some(id => typeof id !== "string" || seen.has(id)) || JSON.stringify(ids) !== JSON.stringify(expectedIds)
        || JSON.stringify(identities(result.attempts)) !== JSON.stringify(identities(expectedRows))
        || JSON.stringify(sourcePlanIds) !== JSON.stringify(expectedSourcePlanIds)
        || JSON.stringify(result.notExecuted) !== JSON.stringify(expectedNotExecuted)) {
      throw fail("m1-campaign-continuation-history-prefix-invalid");
    }
    ids.forEach(id => seen.add(id)); retained += ids.length;
    const equivalence = assertModelFacingSealEquivalence(seal, currentSeal, candidateId);
    windowEvidence.push({ index: index + 1, kind: definition.kind, startOrdinal: definition.startOrdinal,
      endOrdinal: definition.endOrdinal, resultSha256: definition.resultSha256, planSha256: definition.planSha256,
      runtimeSealSha256: definition.runtimeSealSha256, retainedAttempts: definition.retainedAttempts,
      sourceCommit: result.sourceCommit, sealDifferences: equivalence.sealDifferences,
      invariantModelFacingViewSha256: sha256(Buffer.from(JSON.stringify(equivalence.modelFacingView))) });
  }
  const planIds = plan?.attempts?.map(value => value?.attemptId);
  if (plan?.schemaVersion !== "runaai-m1-campaign-continuation-plan/v2" || plan.continuation !== true
      || plan.supplemental !== true || plan.candidateId !== candidateId || plan.retainedPrefixAttempts !== retained
      || retained !== R14_HISTORY.retained || plan.resumeAttemptId !== R14_HISTORY.resumeAttemptId
      || plan.plannedCandidateAttempts !== R14_HISTORY.remaining || plan.plannedCampaignAttempts !== R14_HISTORY.remaining
      || JSON.stringify(planIds) !== JSON.stringify(expected.slice(retained))) throw fail("m1-campaign-continuation-plan-invalid");
  const provenance = { schemaVersion: "runaai-m1-campaign-continuation-provenance/v1",
    historyManifestSha256: bindings.historyManifestSha256, basePlanSha256: bindings.basePlanSha256,
    retainedPrefixAttempts: retained, resumeAttemptId: plan.resumeAttemptId,
    priorWindows: windowEvidence.map(({ index, kind, startOrdinal, endOrdinal, resultSha256, planSha256,
      runtimeSealSha256, retainedAttempts, sourceCommit }) => ({ index, kind, startOrdinal, endOrdinal,
      resultSha256, planSha256, runtimeSealSha256, retainedAttempts, sourceCommit })),
    singleUninterruptedArmClaimed: false };
  if (JSON.stringify(plan.continuationHistory) !== JSON.stringify(provenance))
    throw fail("m1-campaign-continuation-binding-invalid");
  return { attemptIds: planIds, plan, priorHistory: provenance,
    equivalence: { modelFacingEquivalentBeforeExecution: true, priorWindows: windowEvidence,
      finalExecutionWindowIndex: windows.length + 1, singleUninterruptedArmClaimed: false } };
}

export function createContinuationHistoryPlan({ campaign, fullPlan, history, windows, currentSeal, bindings }) {
  const candidateId = campaign["candidate-id"], expected = fullAttemptIds(candidateId);
  const fullIds = fullPlan?.attempts?.map(value => value?.attemptId);
  if (fullPlan?.candidateId !== candidateId || fullPlan.attempts?.length !== expected.length
      || JSON.stringify(fullIds) !== JSON.stringify(expected)) throw fail("m1-campaign-continuation-full-plan-invalid");
  const retained = history?.windows?.reduce((total, value) => total + (value?.retainedAttempts ?? 0), 0);
  if (retained !== R14_HISTORY.retained || !HEX.test(bindings?.basePlanSha256 ?? "")
      || history?.basePlanSha256 !== bindings.basePlanSha256)
    throw fail("m1-campaign-continuation-history-invalid");
  const priorWindows = history.windows.map(value => ({ index: value.index, kind: value.kind,
    startOrdinal: value.startOrdinal, endOrdinal: value.endOrdinal, resultSha256: value.resultSha256,
    planSha256: value.planSha256, runtimeSealSha256: value.runtimeSealSha256,
    retainedAttempts: value.retainedAttempts, sourceCommit: windows[value.index - 1]?.result?.sourceCommit }));
  const continuationHistory = { schemaVersion: "runaai-m1-campaign-continuation-provenance/v1",
    historyManifestSha256: bindings.historyManifestSha256, basePlanSha256: bindings.basePlanSha256,
    retainedPrefixAttempts: retained, resumeAttemptId: expected[retained], priorWindows,
    singleUninterruptedArmClaimed: false };
  const plan = { ...fullPlan, schemaVersion: "runaai-m1-campaign-continuation-plan/v2", continuation: true, supplemental: true,
    historyManifestSha256: bindings.historyManifestSha256, basePlanSha256: bindings.basePlanSha256, retainedPrefixAttempts: retained,
    resumeAttemptId: expected[retained], plannedCandidateAttempts: expected.length - retained,
    plannedCampaignAttempts: expected.length - retained, attempts: fullPlan.attempts.slice(retained),
    continuationHistory, qualificationCompositionPermitted: false };
  const validated = validateContinuationHistoryContract({ campaign, plan, history, windows, currentSeal, bindings });
  const audit = { schemaVersion: "runaai-m1-campaign-continuation-history-audit/v1", candidateId,
    historyManifestSha256: bindings.historyManifestSha256, retainedPrefixAttempts: retained,
    continuationAttempts: plan.attempts.length, resumeAttemptId: plan.resumeAttemptId,
    priorWindows: validated.equivalence.priorWindows, finalExecutionWindowIndex: validated.equivalence.finalExecutionWindowIndex,
    modelFacingEquivalentBeforeExecution: true, completedPrefixImmutable: true, singleUninterruptedArmClaimed: false };
  return { plan, audit };
}

export async function loadBoundFile(root, relative, expectedSha256, label) {
  const requested = path.resolve(root, relative), requestedStat = await lstat(requested);
  if (!requestedStat.isFile() || requestedStat.isSymbolicLink()) throw fail(`m1-campaign-continuation-${label}-file`);
  const [actual, evidenceRoot] = await Promise.all([
    realpath(requested),
    realpath(path.join(root, "acceptance-evidence")),
  ]);
  const evidenceRelative = path.relative(evidenceRoot, actual);
  if (!evidenceRelative || path.isAbsolute(evidenceRelative) || evidenceRelative === ".."
      || evidenceRelative.startsWith(`..${path.sep}`)) throw fail(`m1-campaign-continuation-${label}-path`);
  const stat = await lstat(actual);
  if (!stat.isFile() || stat.size < 1 || stat.size > 4 * 1024 * 1024)
    throw fail(`m1-campaign-continuation-${label}-file`);
  const bytes = await readFile(actual);
  if (sha256(bytes) !== expectedSha256) throw fail(`m1-campaign-continuation-${label}-digest`);
  return JSON.parse(bytes);
}

export async function validateContinuationInputs({ campaign, continuation }) {
  const root = await realpath(path.resolve(campaign["owned-root"]));
  const campaignInputs = await validateCampaignInputs(campaign);
  const plan = await loadBoundFile(root, continuation["continuation-plan"], continuation["continuation-plan-sha256"], "plan");
  const currentSeal = campaignInputs.seal;
  if (continuation["history-manifest"]) {
    const history = await loadBoundFile(root, continuation["history-manifest"], continuation["history-manifest-sha256"], "history");
    if (history?.schemaVersion !== "runaai-m1-campaign-continuation-history/v1" || history?.windows?.length !== 2
        || !HEX.test(history?.basePlanSha256 ?? "") || typeof history?.basePlan !== "string"
        || history.windows.some((definition, index) => definition?.index !== index + 1
          || typeof definition.result !== "string" || typeof definition.sourcePlan !== "string"
          || typeof definition.runtimeSeal !== "string" || !HEX.test(definition.resultSha256 ?? "")
          || !HEX.test(definition.planSha256 ?? "") || !HEX.test(definition.runtimeSealSha256 ?? ""))) {
      throw fail("m1-campaign-continuation-history-invalid");
    }
    const basePlan = await loadBoundFile(root, history.basePlan, history.basePlanSha256, "history-base-plan");
    const windows = await Promise.all((history.windows ?? []).map(async definition => ({ definition,
      result: await loadBoundFile(root, definition.result, definition.resultSha256, `history-result-${definition.index}`),
      plan: await loadBoundFile(root, definition.sourcePlan, definition.planSha256, `history-plan-${definition.index}`),
      seal: await loadBoundFile(root, definition.runtimeSeal, definition.runtimeSealSha256, `history-seal-${definition.index}`),
    })));
    return validateContinuationHistoryContract({ campaign, plan, history, windows, currentSeal,
      bindings: { historyManifestSha256: continuation["history-manifest-sha256"],
        basePlanSha256: history.basePlanSha256, basePlan } });
  }
  const [priorResult, priorSeal] = await Promise.all([
    loadBoundFile(root, continuation["prior-result"], continuation["prior-result-sha256"], "prior-result"),
    loadBoundFile(root, continuation["prior-runtime-seal"], continuation["prior-runtime-seal-sha256"], "prior-seal"),
  ]);
  return validateContinuationContract({ campaign, plan, priorResult, priorSeal,
    currentSeal, bindings: {
      priorResultSha256: continuation["prior-result-sha256"],
      priorRuntimeSealSha256: continuation["prior-runtime-seal-sha256"],
    } });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseContinuationArguments(process.argv.slice(2));
    const validated = await validateContinuationInputs(args);
    const result = await runModelCampaign(args.campaign, { supplementalAttemptIds: validated.attemptIds,
      supplementalPriorResult: validated.prior, supplementalPriorHistory: validated.priorHistory,
      supplementalPlan: validated.plan, announce: value => process.stdout.write(`${JSON.stringify(value)}\n`) });
    process.stdout.write(`${JSON.stringify({ schemaVersion: result.schemaVersion, candidateId: result.candidateId,
      recordedAttempts: result.recordedAttempts ?? null, plannedCandidateAttempts: validated.attemptIds.length,
      notExecuted: result.notExecuted?.length ?? null, stopCode: result.stopCode ?? result.errorCode ?? null,
      continuation: true, modelFacingEquivalentBeforeExecution: true, qualificationCompositionPermitted: false,
      productQualificationPassed: false, evidenceDirectory: result.evidenceDirectory, productionChanged: false })}\n`);
    if (result.errorCode || result.stopCode || result.cleanupError) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: "runaai-m1-continuation-error/v1",
      errorCode: safeCode(error), continuation: true, qualificationCompositionPermitted: false,
      productQualificationPassed: false, productionChanged: false })}\n`);
    process.exitCode = 1;
  }
}
