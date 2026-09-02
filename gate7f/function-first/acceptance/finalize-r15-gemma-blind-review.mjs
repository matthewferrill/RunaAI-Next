import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual as same } from "node:util";

import { closePinned, openContainedPinned, writeContainedNew } from "./r15-owned-pinned-files.mjs";
import { gradeR15GemmaEligibility } from "./r15-gemma-review-contract.mjs";
import { r15GemmaEligibilityManifestSha256, validateR15GemmaBatchResult,
  validateR15GemmaEligibilityManifest } from "./r15-gemma-eligibility-contract.mjs";
import { validateR15GemmaBrowserProof } from "./prepare-r15-gemma-eligibility-arm.mjs";
import { assertOwnedStage, fail, sha256, validateRuntimeSeal } from "./runner-contract.mjs";
import { qualifiedControlSuite, validateHomeReady } from "./run-model-campaign.mjs";
import { validateR15GemmaCompletionChain } from "./verify-r15-gemma-home-completion.mjs";
import { verifyCompletedCampaignV2 } from "../readiness/verify-completed-campaign-v2.mjs";

const HEX = /^[a-f0-9]{64}$/u;
const FILES = ["eligibility-manifest", "batch-result", "completion-validation", "runtime-seal", "source-tree-manifest",
  "hardware-plan", "controls", "browser-proof", "home-ready", "home-completion-preflight", "home-completion-receipt",
  "home-terminal-status", "home-before-state", "home-final-state", "home-export", "home-completion-publication",
  "home-completion-verification", "review-manifest", "worksheet", "decisions"];
const HASH_KEY = Object.fromEntries(FILES.map(key => [key, key === "eligibility-manifest"
  ? "eligibility-manifest-file-sha256" : `${key}-sha256`]));
const KEYS = ["owned-root", ...FILES.flatMap(key => [key, HASH_KEY[key]]), "eligibility-manifest-sha256", "output"];
const safeCode = error => /^[a-z0-9-]{1,100}$/u.test(error?.code ?? "") ? error.code : "r15-gemma-blind-review-finalization-failed";

export function parseR15GemmaBlindReviewFinalizationArguments(argv) {
  const result = {}, seen = new Set();
  for (let index = 0; index < argv.length; index += 2) {
    const raw = argv[index], key = raw?.slice(2), value = argv[index + 1];
    if (!raw?.startsWith("--") || !KEYS.includes(key) || !value || value.startsWith("--") || seen.has(key))
      throw fail("r15-gemma-review-finalize-argument-invalid");
    seen.add(key); result[key] = value;
  }
  const prefix = result["runtime-seal-sha256"]?.slice(0, 16), campaign = `acceptance-evidence/campaign-gemma4-26b-a4b-${prefix}`;
  const exact = {
    "eligibility-manifest": "acceptance-evidence/r15-gemma-eligibility-arm.json",
    "batch-result": `${campaign}/result.json`, "completion-validation": `${campaign}/eligibility-validation.json`,
    "runtime-seal": "runtime-seal.json", "source-tree-manifest": "SOURCE-TREE-MANIFEST.json",
    "hardware-plan": "campaign-hardware-plan.json", "home-completion-preflight": `${campaign}/home-completion-preflight.json`,
    "home-completion-receipt": `${campaign}/home-completion-receipt.json`,
    "home-terminal-status": `${campaign}/home-terminal-status.json`,
    "home-before-state": `${campaign}/home-before-cleanup-state.json`, "home-final-state": `${campaign}/home-final-state.json`,
    "home-export": `${campaign}/home-export.json`, "home-completion-publication": `${campaign}/home-completion-publication.json`,
    "home-completion-verification": `${campaign}/home-completion-verification.json`,
    "review-manifest": "acceptance-evidence/operator-review-binding/review-manifest.json",
    worksheet: "acceptance-evidence/candidate-blind-review/review-worksheet.json",
    decisions: "acceptance-evidence/candidate-blind-review/review-decisions.json"
  };
  if (seen.size !== KEYS.length || KEYS.filter(key => key.endsWith("sha256")).some(key => !HEX.test(result[key] ?? ""))
      || Object.entries(exact).some(([key, value]) => result[key] !== value)
      || !/^acceptance-evidence\/controls-[0-9]+\.json$/u.test(result.controls ?? "")
      || !/^acceptance-evidence\/r15-browser-publication-control-[0-9]+\.json$/u.test(result["browser-proof"] ?? "")
      || !/^acceptance-evidence\/home-ready-[a-z0-9-]+\.json$/u.test(result["home-ready"] ?? "")
      || result.output !== "acceptance-evidence/operator-review-binding/candidate-eligibility.json")
    throw fail("r15-gemma-review-finalize-argument-invalid");
  return result;
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join() !== [...keys].sort().join()) throw fail(code);
}

function validateObservation(value, { arm, hardware, phase }) {
  exactKeys(value, ["gpus", "host", "listeners", "models", "ownedTaskRegistrations", "protectedDataIncluded", "readOnly",
    "schemaVersion", "time"], "r15-gemma-final-home-observation-shape");
  if (value.schemaVersion !== "runa-m1-campaign-final-observation/v2" || value.host !== "RUNA-HOME"
      || value.readOnly !== true || value.protectedDataIncluded !== false || !Number.isFinite(Date.parse(value.time))
      || !Array.isArray(value.models) || value.models.length < 2 || value.models.some(model => !Array.isArray(model.loadedInstances)
        || model.loadedInstances.length !== 0) || !value.models.some(model => model.key === arm.modelId)
      || !value.models.some(model => model.key === arm.auxiliaryEmbedding.modelId)
      || !Array.isArray(value.gpus) || value.gpus.length !== hardware.policy.gpuUuids.length
      || !Array.isArray(value.listeners) || !Array.isArray(value.ownedTaskRegistrations))
    throw fail("r15-gemma-final-home-observation-binding");
  const gpus = value.gpus.map(line => {
    if (typeof line !== "string") throw fail("r15-gemma-final-home-gpu-binding");
    const fields = line.split(",").map(field => field.trim());
    if (fields.length !== 6 || !Number.isInteger(Number(fields[0])) || !Number.isFinite(Number(fields[2])))
      throw fail("r15-gemma-final-home-gpu-binding");
    return { uuid: fields[1], powerWatts: Number(fields[2]) };
  });
  if (new Set(gpus.map(gpu => gpu.uuid)).size !== gpus.length
      || !same(gpus.map(gpu => gpu.uuid).sort(), [...hardware.policy.gpuUuids].sort())
      || gpus.some(gpu => gpu.powerWatts !== hardware.policy.originalPowerWatts))
    throw fail("r15-gemma-final-home-gpu-binding");
  const taskName = `Runa-M1-${arm.homeLeaseId}`, matching = value.ownedTaskRegistrations.filter(task => task.TaskName === taskName);
  if (phase === "before" ? matching.length !== 1 : matching.length !== 0)
    throw fail("r15-gemma-final-home-task-binding");
  return value;
}

export function validateR15GemmaHomeLifecycle({ receipt, terminal, before, after, arm, hardware }) {
  exactKeys(receipt, ["leaseId", "lifecycleCalled", "markerSha256", "privateValuesIncluded", "published", "reason",
    "schemaVersion", "sealSha256", "time"], "r15-gemma-final-home-receipt-shape");
  if (receipt.schemaVersion !== "runaai-atomic-completion-publication/v2" || receipt.leaseId !== arm.homeLeaseId
      || receipt.sealSha256 !== arm.homeLeaseSealSha256 || !HEX.test(receipt.markerSha256 ?? "") || receipt.reason !== "completed"
      || receipt.published !== true || receipt.lifecycleCalled !== false || receipt.privateValuesIncluded !== false
      || !Number.isFinite(Date.parse(receipt.time))) throw fail("r15-gemma-final-home-receipt-binding");
  exactKeys(terminal, ["lastEvent", "ready", "result", "supervisor", "taskExit", "taskState"], "r15-gemma-final-home-terminal-shape");
  if (terminal.taskState !== "Ready" || terminal.taskExit !== 0
      || terminal.ready?.leaseId !== arm.homeLeaseId || terminal.ready?.sealSha256 !== arm.homeLeaseSealSha256
      || terminal.result?.leaseId !== arm.homeLeaseId || terminal.result?.sealSha256 !== arm.homeLeaseSealSha256
      || terminal.result?.completion !== "completed" || terminal.result?.cleanupVerified !== true || terminal.result?.powerRestored !== true
      || terminal.result?.failure !== null || terminal.result?.ambiguousLoad !== null
      || terminal.result?.productionRoutingChanged !== false || terminal.result?.protectedDataIncluded !== false
      || terminal.supervisor?.exitCode !== 0 || terminal.supervisor?.failure !== null
      || terminal.supervisor?.zeroResidencyAndPowerRestored !== true || terminal.supervisor?.productionRoutingChanged !== false)
    throw fail("r15-gemma-final-home-terminal-binding");
  validateObservation(before, { arm, hardware, phase: "before" });
  validateObservation(after, { arm, hardware, phase: "after" });
  if (!same(before.listeners, after.listeners) || !same(before.models.map(model => model.key), after.models.map(model => model.key))
      || Date.parse(before.time) < Date.parse(receipt.time) || Date.parse(after.time) < Date.parse(before.time))
    throw fail("r15-gemma-final-home-lifecycle-binding");
  return true;
}

export async function finalizeR15GemmaBlindReview(args) {
  const root = assertOwnedStage(args["owned-root"]), pinned = [], values = {};
  try {
    const maximum = { "batch-result": 16, "home-export": 32, worksheet: 64, decisions: 64 };
    for (const name of FILES) {
      const input = await openContainedPinned(root, args[name], { expectedSha256: args[HASH_KEY[name]],
        maximumBytes: (maximum[name] ?? 2) * 1024 * 1024, code: `r15-gemma-review-finalize-${name}` });
      pinned.push(input); values[name] = input;
    }
    const arm = validateR15GemmaEligibilityManifest(values["eligibility-manifest"].json());
    if (r15GemmaEligibilityManifestSha256(arm) !== args["eligibility-manifest-sha256"])
      throw fail("r15-gemma-review-finalize-manifest-pin");
    const runtimeSeal = validateRuntimeSeal(values["runtime-seal"].json(), { sourceCommit: arm.sourceCommit, candidateId: arm.candidateId });
    const hardware = values["hardware-plan"].json();
    if (values["runtime-seal"].sha256 !== arm.runtimeSealSha256 || values["source-tree-manifest"].sha256 !== arm.sourceTreeManifestSha256
        || values["hardware-plan"].sha256 !== arm.hardwarePlanSha256 || runtimeSeal.runtime.sourceArchiveSha256 !== arm.sourceArchiveSha256
        || runtimeSeal.residency.telemetryPolicySha256 !== arm.hardwarePlanSha256) throw fail("r15-gemma-review-finalize-runtime-binding");
    qualifiedControlSuite(values.controls.json(), { sourceCommit: arm.sourceCommit, runtimeSealSha256: arm.runtimeSealSha256 });
    if (values.controls.sha256 !== arm.controlsSha256) throw fail("r15-gemma-review-finalize-controls-binding");
    validateR15GemmaBrowserProof(values["browser-proof"].json(), { sourceCommit: arm.sourceCommit, runtimeSealSha256: arm.runtimeSealSha256 });
    if (values["browser-proof"].sha256 !== arm.browserProofSha256) throw fail("r15-gemma-review-finalize-browser-binding");
    validateHomeReady(values["home-ready"].json(), hardware, { seal: runtimeSeal, candidateId: arm.candidateId,
      hardwarePlanSha256: arm.hardwarePlanSha256, now: Date.parse(arm.createdAt) });
    if (values["home-ready"].sha256 !== arm.homeReadySha256) throw fail("r15-gemma-review-finalize-home-ready-binding");

    const batch = values["batch-result"].json(); validateR15GemmaBatchResult(batch, arm);
    const completion = validateR15GemmaCompletionChain({ armValue: arm, armFileSha256: values["eligibility-manifest"].sha256,
      armManifestSha256: args["eligibility-manifest-sha256"], resultValue: batch, resultSha256: values["batch-result"].sha256,
      validationValue: values["completion-validation"].json(), validationSha256: values["completion-validation"].sha256,
      runtimeSealValue: runtimeSeal, runtimeSealSha256: values["runtime-seal"].sha256,
      sourceTreeManifestSha256: values["source-tree-manifest"].sha256, runtimeSealPrefix: arm.runtimeSealSha256.slice(0, 16),
      leaseId: arm.homeLeaseId, leaseSealSha256: arm.homeLeaseSealSha256 });
    if (!same(values["home-completion-preflight"].json(), completion)) throw fail("r15-gemma-review-finalize-completion-preflight-binding");
    validateR15GemmaHomeLifecycle({ receipt: values["home-completion-receipt"].json(), terminal: values["home-terminal-status"].json(),
      before: values["home-before-state"].json(), after: values["home-final-state"].json(), arm, hardware });
    const retained = verifyCompletedCampaignV2({ leaseId: arm.homeLeaseId, expectedLeaseSealSha256: arm.homeLeaseSealSha256,
      expectedRuntimeSealSha256: arm.runtimeSealSha256, expectedResultSha256: values["batch-result"].sha256,
      expectedSourceCommit: arm.sourceCommit, resultBytes: values["batch-result"].bytes,
      exportPacketBytes: values["home-export"].bytes, completionPublicationBytes: values["home-completion-publication"].bytes,
      beforeFinalObservationBytes: values["home-before-state"].bytes, afterFinalObservationBytes: values["home-final-state"].bytes });
    if (!same(values["home-completion-verification"].json(), retained))
      throw fail("r15-gemma-review-finalize-completion-verification-binding");

    const directory = path.dirname(values["batch-result"].absolute), packets = [];
    for (const attempt of batch.attempts) {
      const raw = await openContainedPinned(root, path.relative(root, path.join(directory, attempt.file)), {
        expectedSha256: attempt.sha256, maximumBytes: 64 * 1024 * 1024, code: "r15-gemma-review-finalize-packet" });
      const record = await openContainedPinned(root, path.relative(root, path.join(directory, `${attempt.attemptId}.record.json`)), {
        maximumBytes: 2 * 1024 * 1024, code: "r15-gemma-review-finalize-record" });
      pinned.push(raw, record);
      if (raw.bytes.length !== attempt.bytes) throw fail("r15-gemma-review-finalize-packet-pin");
      packets.push({ attemptId: attempt.attemptId, observation: raw.json(), rawBytes: raw.bytes, recordBytes: record.bytes });
    }
    const postArm = { schemaVersion: "runaai-m1-r15-gemma-post-arm-provenance/v1", armId: arm.armId,
      sourceCommit: arm.sourceCommit, eligibilityManifestFileSha256: values["eligibility-manifest"].sha256,
      eligibilityManifestSha256: args["eligibility-manifest-sha256"], batchResultSha256: values["batch-result"].sha256,
      completionValidationSha256: values["completion-validation"].sha256, runtimeSealSha256: values["runtime-seal"].sha256,
      sourceTreeManifestSha256: values["source-tree-manifest"].sha256, hardwarePlanSha256: values["hardware-plan"].sha256,
      controlsSha256: values.controls.sha256, browserProofSha256: values["browser-proof"].sha256,
      homeReadySha256: values["home-ready"].sha256, homeCompletionPreflightSha256: values["home-completion-preflight"].sha256,
      homeCompletionReceiptSha256: values["home-completion-receipt"].sha256,
      homeTerminalStatusSha256: values["home-terminal-status"].sha256, homeBeforeStateSha256: values["home-before-state"].sha256,
      homeFinalStateSha256: values["home-final-state"].sha256, reviewManifestSha256: values["review-manifest"].sha256,
      homeExportSha256: values["home-export"].sha256,
      homeCompletionPublicationSha256: values["home-completion-publication"].sha256,
      homeCompletionVerificationSha256: values["home-completion-verification"].sha256,
      worksheetFileSha256: values.worksheet.sha256, decisionsSha256: values.decisions.sha256,
      comparativeCampaign: false, productQualificationPassed: false, productionRoutingChanged: false };
    await Promise.all(pinned.map(input => input.verifyUnchanged()));
    const postArmProvenanceSha256 = sha256(Buffer.from(`${JSON.stringify(postArm, null, 2)}\n`));
    const provenance = { eligibilityManifestFileSha256: postArm.eligibilityManifestFileSha256,
      eligibilityManifestSha256: postArm.eligibilityManifestSha256, batchResultSha256: postArm.batchResultSha256,
      completionValidationSha256: postArm.completionValidationSha256, runtimeSealSha256: postArm.runtimeSealSha256,
      sourceTreeManifestSha256: postArm.sourceTreeManifestSha256, hardwarePlanSha256: postArm.hardwarePlanSha256,
      controlsSha256: postArm.controlsSha256, browserProofSha256: postArm.browserProofSha256, homeReadySha256: postArm.homeReadySha256,
      homeCompletionPreflightSha256: postArm.homeCompletionPreflightSha256,
      homeCompletionReceiptSha256: postArm.homeCompletionReceiptSha256, homeTerminalStatusSha256: postArm.homeTerminalStatusSha256,
      homeBeforeStateSha256: postArm.homeBeforeStateSha256, homeFinalStateSha256: postArm.homeFinalStateSha256,
      homeExportSha256: postArm.homeExportSha256, homeCompletionPublicationSha256: postArm.homeCompletionPublicationSha256,
      homeCompletionVerificationSha256: postArm.homeCompletionVerificationSha256,
      reviewManifestSha256: postArm.reviewManifestSha256, worksheetFileSha256: postArm.worksheetFileSha256,
      decisionsSha256: postArm.decisionsSha256, postArmProvenanceSha256 };
    const grade = gradeR15GemmaEligibility({ eligibilityManifest: arm,
      eligibilityManifestSha256: args["eligibility-manifest-sha256"], reviewManifest: values["review-manifest"].json(),
      worksheet: values.worksheet.json(), bundle: values.decisions.json(), packets, provenance });
    await Promise.all(pinned.map(input => input.verifyUnchanged()));
    const publication = await writeContainedNew(root, args.output, grade, "r15-gemma-review-grade-publication");
    return Object.freeze({ schemaVersion: "runaai-m1-r15-gemma-blind-review-finalization/v2",
      candidateEligibleAllFiveRoles: grade.candidateEligibleAllFiveRoles, reviewedAttempts: grade.reviewedAttempts,
      comparativeEvaluationPerformed: false, productQualificationPassed: false, customerTrialReady: false,
      recommendedCandidateId: null, productionRoutingChanged: false, humanTrialStillRequired: true,
      postArmProvenanceSha256, outputSha256: publication.sha256 });
  } finally { await closePinned(pinned); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(await finalizeR15GemmaBlindReview(parseR15GemmaBlindReviewFinalizationArguments(process.argv.slice(2))))}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ schemaVersion: "runaai-m1-r15-gemma-blind-review-finalization-error/v1",
    errorCode: safeCode(error), comparativeEvaluationPerformed: false, productQualificationPassed: false,
    productionChanged: false })}\n`); process.exitCode = 1; }
}
