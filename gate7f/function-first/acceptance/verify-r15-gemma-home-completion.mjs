import { open } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual as same } from "node:util";

import { closePinned, openContainedPinned } from "./r15-owned-pinned-files.mjs";
import { r15GemmaEligibilityManifestSha256, validateR15GemmaBatchResult,
  validateR15GemmaEligibilityManifest } from "./r15-gemma-eligibility-contract.mjs";
import { assertOwnedStage, fail, sha256, validateRuntimeSeal } from "./runner-contract.mjs";

const HEX = /^[a-f0-9]{64}$/u, PREFIX = /^[a-f0-9]{16}$/u;
const KEYS = ["owned-root", "eligibility-manifest", "eligibility-manifest-file-sha256", "eligibility-manifest-sha256",
  "batch-result", "batch-result-sha256", "eligibility-validation", "eligibility-validation-sha256", "runtime-seal",
  "runtime-seal-sha256", "source-tree-manifest", "source-tree-manifest-sha256", "runtime-seal-prefix", "lease-id",
  "lease-seal-sha256", "output"];
const safeCode = error => /^[a-z0-9-]{1,100}$/u.test(error?.code ?? "") ? error.code : "r15-gemma-home-completion-preflight-failed";

export function parseR15GemmaHomeCompletionArguments(argv) {
  const result = {}, seen = new Set();
  for (let index = 0; index < argv.length; index += 2) {
    const raw = argv[index], key = raw?.slice(2), value = argv[index + 1];
    if (!raw?.startsWith("--") || !KEYS.includes(key) || !value || value.startsWith("--") || seen.has(key))
      throw fail("r15-gemma-home-completion-argument-invalid");
    seen.add(key); result[key] = value;
  }
  const digests = KEYS.filter(key => key.endsWith("sha256"));
  if (seen.size !== KEYS.length || digests.some(key => !HEX.test(result[key] ?? ""))
      || !PREFIX.test(result["runtime-seal-prefix"] ?? "")
      || !/^20260829-campaign-gemma-r[1-9][0-9]*$/u.test(result["lease-id"] ?? ""))
    throw fail("r15-gemma-home-completion-argument-invalid");
  const expectedDirectory = `acceptance-evidence/campaign-gemma4-26b-a4b-${result["runtime-seal-prefix"]}`;
  if (result["eligibility-manifest"] !== "acceptance-evidence/r15-gemma-eligibility-arm.json"
      || result["batch-result"] !== `${expectedDirectory}/result.json`
      || result["eligibility-validation"] !== `${expectedDirectory}/eligibility-validation.json`
      || result["runtime-seal"] !== "runtime-seal.json" || result["source-tree-manifest"] !== "SOURCE-TREE-MANIFEST.json"
      || result.output !== `${expectedDirectory}/home-completion-preflight.json`)
    throw fail("r15-gemma-home-completion-argument-invalid");
  return result;
}

export function validateR15GemmaCompletionChain({ armValue, armFileSha256, armManifestSha256, resultValue, resultSha256,
  validationValue, validationSha256, runtimeSealValue, runtimeSealSha256, sourceTreeManifestSha256,
  runtimeSealPrefix, leaseId, leaseSealSha256 }) {
  const arm = validateR15GemmaEligibilityManifest(armValue);
  if (r15GemmaEligibilityManifestSha256(arm) !== armManifestSha256
      || arm.runtimeSealSha256 !== runtimeSealSha256 || runtimeSealPrefix !== runtimeSealSha256.slice(0, 16)
      || arm.sourceTreeManifestSha256 !== sourceTreeManifestSha256 || arm.homeLeaseId !== leaseId
      || arm.homeLeaseSealSha256 !== leaseSealSha256) throw fail("r15-gemma-home-completion-arm-binding");
  const seal = validateRuntimeSeal(runtimeSealValue, { sourceCommit: arm.sourceCommit, candidateId: arm.candidateId });
  if (seal.runtime.sourceArchiveSha256 !== arm.sourceArchiveSha256
      || seal.residency.telemetryPolicySha256 !== arm.hardwarePlanSha256
      || seal.qualificationCriteria.sha256 !== arm.qualificationCriteriaSha256)
    throw fail("r15-gemma-home-completion-runtime-binding");
  const batchValidation = validateR15GemmaBatchResult(resultValue, arm);
  const expectedValidation = { ...batchValidation,
    schemaVersion: "runaai-m1-r15-gemma-candidate-completion-validation/v1",
    eligibilityManifestSha256: armManifestSha256, batchResultSha256: resultSha256,
    independentSemanticReviewPending: true, humanTrialStillRequired: true };
  if (!same(validationValue, expectedValidation)) throw fail("r15-gemma-home-completion-validation-binding");
  return Object.freeze({ schemaVersion: "runaai-m1-r15-gemma-home-completion-preflight/v2", passed: true,
    candidateId: arm.candidateId, armId: arm.armId, eligibilityManifestFileSha256: armFileSha256,
    eligibilityManifestSha256: armManifestSha256, batchResultSha256: resultSha256,
    eligibilityValidationSha256: validationSha256, runtimeSealSha256, sourceTreeManifestSha256,
    runtimeSealPrefix, leaseId, leaseSealSha256, reviewedAttempts: batchValidation.reviewedAttempts,
    comparativeCampaign: false, productQualificationPassed: false, productionChanged: false,
    protectedDataIncluded: false });
}

export async function verifyR15GemmaHomeCompletion(args) {
  const root = assertOwnedStage(args["owned-root"]), pinned = [];
  try {
    const specs = [
      ["arm", "eligibility-manifest", "eligibility-manifest-file-sha256", 2 * 1024 * 1024],
      ["result", "batch-result", "batch-result-sha256", 16 * 1024 * 1024],
      ["validation", "eligibility-validation", "eligibility-validation-sha256", 2 * 1024 * 1024],
      ["seal", "runtime-seal", "runtime-seal-sha256", 2 * 1024 * 1024],
      ["sourceTree", "source-tree-manifest", "source-tree-manifest-sha256", 32 * 1024 * 1024]
    ], values = {};
    for (const [name, fileKey, hashKey, maximumBytes] of specs) {
      const input = await openContainedPinned(root, args[fileKey], { expectedSha256: args[hashKey], maximumBytes,
        code: `r15-gemma-home-completion-${name}` });
      pinned.push(input); values[name] = input;
    }
    const receipt = validateR15GemmaCompletionChain({ armValue: values.arm.json(), armFileSha256: values.arm.sha256,
      armManifestSha256: args["eligibility-manifest-sha256"], resultValue: values.result.json(),
      resultSha256: values.result.sha256, validationValue: values.validation.json(), validationSha256: values.validation.sha256,
      runtimeSealValue: values.seal.json(), runtimeSealSha256: values.seal.sha256,
      sourceTreeManifestSha256: values.sourceTree.sha256, runtimeSealPrefix: args["runtime-seal-prefix"],
      leaseId: args["lease-id"], leaseSealSha256: args["lease-seal-sha256"] });
    await Promise.all(pinned.map(input => input.verifyUnchanged()));
    const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`), output = path.resolve(root, args.output);
    const file = await open(output, "wx"); try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    return Object.freeze({ ...receipt, output: args.output, outputSha256: sha256(bytes) });
  } finally { await closePinned(pinned); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(await verifyR15GemmaHomeCompletion(parseR15GemmaHomeCompletionArguments(process.argv.slice(2))))}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ schemaVersion: "runaai-m1-r15-gemma-home-completion-preflight-error/v1",
    errorCode: safeCode(error), passed: false, productionChanged: false })}\n`); process.exitCode = 1; }
}
