import { open } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual as same } from "node:util";

import { R15_GEMMA_CANDIDATE_ID, r15GemmaEligibilityManifestSha256,
  validateR15GemmaBatchResult, validateR15GemmaEligibilityManifest } from "./r15-gemma-eligibility-contract.mjs";
import { parseCampaignArguments, runModelCampaign } from "./run-model-campaign.mjs";
import { assertOwnedStage, fail, sha256, validateRuntimeSeal } from "./runner-contract.mjs";
import { closePinned, openContainedPinned } from "./r15-owned-pinned-files.mjs";

const HEX = /^[a-f0-9]{64}$/u;
const safeCode = error => /^[a-z0-9-]{1,100}$/u.test(error?.code ?? "") ? error.code : "r15-gemma-eligibility-campaign-failed";

export function parseR15GemmaCampaignArguments(argv) {
  const delegate = [], extra = {}, seen = new Set();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.slice(2), value = argv[index + 1];
    if (["eligibility-manifest", "eligibility-manifest-sha256"].includes(key)) {
      if (!value || value.startsWith("--") || seen.has(key)) throw fail("r15-gemma-campaign-argument-invalid");
      seen.add(key); extra[key] = value;
    } else delegate.push(argv[index], value);
  }
  const campaign = parseCampaignArguments(delegate);
  if (campaign.mode !== "scored" || campaign["candidate-id"] !== R15_GEMMA_CANDIDATE_ID || seen.size !== 2
      || extra["eligibility-manifest"] !== "acceptance-evidence/r15-gemma-eligibility-arm.json"
      || !HEX.test(extra["eligibility-manifest-sha256"] ?? "")) throw fail("r15-gemma-campaign-argument-invalid");
  return { campaign, ...extra };
}

export function validateR15GemmaLaunchBinding({ manifest, manifestSha256, campaign, seal, sourceTreeManifestSha256 }) {
  const arm = validateR15GemmaEligibilityManifest(manifest), candidate = seal.candidates.find(value => value.candidateId === R15_GEMMA_CANDIDATE_ID);
  if (r15GemmaEligibilityManifestSha256(arm) !== manifestSha256 || campaign["candidate-id"] !== arm.candidateId
      || campaign["source-commit"] !== arm.sourceCommit || campaign["runtime-seal-sha256"] !== arm.runtimeSealSha256
      || campaign["controls-sha256"] !== arm.controlsSha256 || campaign["home-ready-sha256"] !== arm.homeReadySha256
      || campaign["hardware-plan-sha256"] !== arm.hardwarePlanSha256 || candidate?.modelId !== arm.modelId
      || candidate?.artifactSha256 !== arm.candidateArtifactSha256 || candidate?.artifactBytes !== arm.candidateArtifactBytes
      || seal.embedding.modelId !== arm.auxiliaryEmbedding.modelId
      || seal.embedding.artifactSha256 !== arm.auxiliaryEmbedding.artifactSha256
      || seal.qualificationCriteria.sha256 !== arm.qualificationCriteriaSha256
      || seal.runtime.sourceArchiveSha256 !== arm.sourceArchiveSha256
      || sourceTreeManifestSha256 !== arm.sourceTreeManifestSha256)
    throw fail("r15-gemma-campaign-launch-binding");
  return arm;
}

export function validateDurableR15GemmaResult({ returnedResult, resultBytes, manifest }) {
  let durableResult;
  try { durableResult = JSON.parse(resultBytes.toString("utf8")); } catch { throw fail("r15-gemma-campaign-result-json"); }
  if (!same(durableResult, returnedResult)) throw fail("r15-gemma-campaign-result-durable-mismatch");
  return { durableResult, validation: validateR15GemmaBatchResult(durableResult, manifest), resultSha256: sha256(resultBytes) };
}

export async function runR15GemmaEligibilityCampaign(args, options = {}) {
  const root = assertOwnedStage(args.campaign["owned-root"]), pinned = [];
  try {
    const armInput = await openContainedPinned(root, args["eligibility-manifest"], { maximumBytes: 2 * 1024 * 1024,
      code: "r15-gemma-campaign-manifest" }); pinned.push(armInput);
    const manifest = validateR15GemmaEligibilityManifest(armInput.json());
    const sealInput = await openContainedPinned(root, args.campaign["runtime-seal"], {
      expectedSha256: args.campaign["runtime-seal-sha256"], maximumBytes: 2 * 1024 * 1024,
      code: "r15-gemma-campaign-runtime-seal" }); pinned.push(sealInput);
    const seal = validateRuntimeSeal(sealInput.json(), { candidateId: R15_GEMMA_CANDIDATE_ID,
      sourceCommit: args.campaign["source-commit"] });
    const sourceTree = await openContainedPinned(root, "SOURCE-TREE-MANIFEST.json", { maximumBytes: 32 * 1024 * 1024,
      code: "r15-gemma-campaign-source-tree" }); pinned.push(sourceTree);
    validateR15GemmaLaunchBinding({ manifest, manifestSha256: args["eligibility-manifest-sha256"],
      campaign: args.campaign, seal, sourceTreeManifestSha256: sourceTree.sha256 });
    const result = await runModelCampaign(args.campaign, options);
    const resultInput = await openContainedPinned(root, path.join(result.evidenceDirectory, "result.json"), {
      maximumBytes: 16 * 1024 * 1024, code: "r15-gemma-campaign-result" }); pinned.push(resultInput);
    const durable = validateDurableR15GemmaResult({ returnedResult: result, resultBytes: resultInput.bytes, manifest });
    const validation = durable.validation;
    const publication = { ...validation, schemaVersion: "runaai-m1-r15-gemma-candidate-completion-validation/v1",
      eligibilityManifestSha256: args["eligibility-manifest-sha256"], batchResultSha256: durable.resultSha256,
      independentSemanticReviewPending: true, humanTrialStillRequired: true };
    await Promise.all(pinned.map(input => input.verifyUnchanged()));
    const output = path.join(root, result.evidenceDirectory, "eligibility-validation.json"), bytes = Buffer.from(`${JSON.stringify(publication, null, 2)}\n`);
    const file = await open(output, "wx"); try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    return Object.freeze({ result, validation: publication, validationFileSha256: sha256(bytes) });
  } finally { await closePinned(pinned); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const output = await runR15GemmaEligibilityCampaign(parseR15GemmaCampaignArguments(process.argv.slice(2)), {
      announce: value => process.stdout.write(`${JSON.stringify(value)}\n`) });
    process.stdout.write(`${JSON.stringify({ schemaVersion: output.validation.schemaVersion,
      candidateId: output.validation.candidateId, reviewedAttempts: output.validation.reviewedAttempts,
      candidateSemanticReviewPending: true, comparativeCampaign: false, productQualificationPassed: false,
      productionChanged: false, validationFileSha256: output.validationFileSha256 })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: "runaai-m1-r15-gemma-eligibility-campaign-error/v1",
      errorCode: safeCode(error), comparativeCampaign: false, productQualificationPassed: false,
      productionChanged: false })}\n`); process.exitCode = 1;
  }
}
