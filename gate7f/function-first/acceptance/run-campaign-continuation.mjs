import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ACCEPTANCE_POLICY, MODEL_CASES } from "./cases.mjs";
import { assertModelFacingSealEquivalence } from "./compose-equivalent-candidate-result.mjs";
import { parseCampaignArguments, runModelCampaign } from "./run-model-campaign.mjs";

const HEX = /^[a-f0-9]{64}$/u;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = code => Object.assign(new Error(code), { code });
const safeCode = error => /^m1-[a-z0-9-]+$/u.test(error?.code ?? error?.message ?? "")
  ? error.code ?? error.message : "m1-campaign-continuation-failed";

const fullAttemptIds = candidateId => Array.from(
  { length: ACCEPTANCE_POLICY.repetitionsPerCandidateCase },
  (_, index) => MODEL_CASES.map(item => `${candidateId}--${item.id}--${index + 1}`),
).flat();

export function parseContinuationArguments(argv) {
  const retained = [], continuation = {}, names = new Set([
    "continuation-plan", "continuation-plan-sha256", "prior-result", "prior-result-sha256",
    "prior-runtime-seal", "prior-runtime-seal-sha256",
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const raw = argv[index], value = argv[index + 1], key = raw?.slice(2);
    if (!raw?.startsWith("--") || !value || value.startsWith("--")) throw fail("m1-campaign-argument-invalid");
    if (names.has(key)) {
      if (continuation[key]) throw fail("m1-campaign-duplicate-argument");
      continuation[key] = value;
    } else retained.push(raw, value);
  }
  if (["continuation-plan", "prior-result", "prior-runtime-seal"].some(name => !continuation[name])
      || ["continuation-plan-sha256", "prior-result-sha256", "prior-runtime-seal-sha256"]
        .some(name => !HEX.test(continuation[name] ?? ""))) throw fail("m1-campaign-required-input-missing");
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
  return { attemptIds: planIds, prior: { sha256: bindings.priorResultSha256, recordedAttempts: retained,
    notExecuted: planIds, formalQualificationCompositionPermitted: false }, equivalence };
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
  const [plan, priorResult, priorSeal] = await Promise.all([
    loadBoundFile(root, continuation["continuation-plan"], continuation["continuation-plan-sha256"], "plan"),
    loadBoundFile(root, continuation["prior-result"], continuation["prior-result-sha256"], "prior-result"),
    loadBoundFile(root, continuation["prior-runtime-seal"], continuation["prior-runtime-seal-sha256"], "prior-seal"),
  ]);
  const currentSealBytes = await readFile(path.resolve(root, campaign["runtime-seal"]));
  if (sha256(currentSealBytes) !== campaign["runtime-seal-sha256"])
    throw fail("m1-campaign-continuation-current-seal-digest");
  return validateContinuationContract({ campaign, plan, priorResult, priorSeal,
    currentSeal: JSON.parse(currentSealBytes), bindings: {
      priorResultSha256: continuation["prior-result-sha256"],
      priorRuntimeSealSha256: continuation["prior-runtime-seal-sha256"],
    } });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseContinuationArguments(process.argv.slice(2));
    const validated = await validateContinuationInputs(args);
    const result = await runModelCampaign(args.campaign, { supplementalAttemptIds: validated.attemptIds,
      supplementalPriorResult: validated.prior, announce: value => process.stdout.write(`${JSON.stringify(value)}\n`) });
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
