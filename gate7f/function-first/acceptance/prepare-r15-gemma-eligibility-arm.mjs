import { randomBytes } from "node:crypto";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { CASE_BUNDLE_SHA256 } from "./cases.mjs";
import { createR15GemmaEligibilityManifest, r15GemmaEligibilityManifestSha256,
  R15_GEMMA_CANDIDATE_ID } from "./r15-gemma-eligibility-contract.mjs";
import { assertOwnedStage, fail, sha256, validateRuntimeSeal } from "./runner-contract.mjs";
import { fileSha256 } from "./owned-control-resources.mjs";
import { qualifiedControlSuite, validateHomeReady } from "./run-model-campaign.mjs";

const HEX = /^[a-f0-9]{64}$/u;
const allowed = new Set(["owned-root", "controls", "controls-sha256", "browser-proof", "browser-proof-sha256",
  "home-ready", "home-ready-sha256", "output"]);
const safeCode = error => /^[a-z0-9-]{1,100}$/u.test(error?.code ?? "") ? error.code : "r15-gemma-arm-preparation-failed";

export function parseR15GemmaArmArguments(argv) {
  const result = {}, seen = new Set();
  for (let index = 0; index < argv.length; index += 2) {
    const raw = argv[index], key = raw?.slice(2), value = argv[index + 1];
    if (!raw?.startsWith("--") || !allowed.has(key) || !value || value.startsWith("--") || seen.has(key))
      throw fail("r15-gemma-arm-argument-invalid");
    seen.add(key); result[key] = value;
  }
  if (seen.size !== allowed.size || !HEX.test(result["controls-sha256"] ?? "")
      || !HEX.test(result["browser-proof-sha256"] ?? "") || !HEX.test(result["home-ready-sha256"] ?? "")
      || result.output !== "acceptance-evidence/r15-gemma-eligibility-arm.json") throw fail("r15-gemma-arm-argument-invalid");
  return result;
}

async function ownedFile(root, relative, maximumBytes) {
  const absolute = path.resolve(root, relative), rel = path.relative(root, absolute);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel) || path.relative(await realpath(root), await realpath(absolute)) !== rel)
    throw fail("r15-gemma-arm-path-invalid");
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximumBytes) throw fail("r15-gemma-arm-file-invalid");
  return absolute;
}

async function pinnedJson(root, relative, expectedSha256, maximumBytes = 64 * 1024 * 1024) {
  const file = await ownedFile(root, relative, maximumBytes), bytes = await readFile(file);
  if (sha256(bytes) !== expectedSha256) throw fail("r15-gemma-arm-input-pin");
  return { file, bytes, value: JSON.parse(bytes.toString("utf8")) };
}

export function validateR15GemmaBrowserProof(value, { sourceCommit, runtimeSealSha256 }) {
  if (value?.schemaVersion !== "runaai-m1-r15-browser-publication-control/v1" || value.sourceCommit !== sourceCommit
      || value.runtimeSealSha256 !== runtimeSealSha256 || value.caseBundleSha256 !== CASE_BUNDLE_SHA256
      || value.passed !== true || value.modelsInvoked !== false || value.actualBrowserExercised !== true
      || value.witnessOnTime !== true || value.acknowledgementOnTime !== true || value.witnessBeforeAcknowledgement !== true
      || value.acknowledgementConsumed !== true || value.nativeReleaseWithinCeiling !== true
      || value.productionChanged !== false || value.protectedDataRead !== false || value.privateValuesIncluded !== false
      || value.errorCode !== undefined && value.errorCode !== null || value.cleanupError !== undefined && value.cleanupError !== null)
    throw fail("r15-gemma-arm-browser-proof-invalid");
  return value;
}

export async function prepareR15GemmaEligibilityArm(args, { now = () => new Date(), random = randomBytes } = {}) {
  const root = assertOwnedStage(args["owned-root"]), sealPath = await ownedFile(root, "runtime-seal.json", 1048576);
  const sealBytes = await readFile(sealPath), runtimeSealSha256 = sha256(sealBytes);
  const seal = validateRuntimeSeal(JSON.parse(sealBytes), { candidateId: R15_GEMMA_CANDIDATE_ID });
  const hardwarePath = await ownedFile(root, "campaign-hardware-plan.json", 1048576);
  const hardwareBytes = await readFile(hardwarePath), hardwarePlanSha256 = sha256(hardwareBytes), hardware = JSON.parse(hardwareBytes);
  if (hardwarePlanSha256 !== seal.residency.telemetryPolicySha256) throw fail("r15-gemma-arm-hardware-pin");
  const controls = await pinnedJson(root, args.controls, args["controls-sha256"]);
  qualifiedControlSuite(controls.value, { sourceCommit: seal.sourceCommit, runtimeSealSha256 });
  const browser = await pinnedJson(root, args["browser-proof"], args["browser-proof-sha256"], 2 * 1024 * 1024);
  validateR15GemmaBrowserProof(browser.value, { sourceCommit: seal.sourceCommit, runtimeSealSha256 });
  const ready = await pinnedJson(root, args["home-ready"], args["home-ready-sha256"], 65536);
  validateHomeReady(ready.value, hardware, { seal, candidateId: R15_GEMMA_CANDIDATE_ID, hardwarePlanSha256 });
  const campaignDirectory = path.join(root, "acceptance-evidence", `campaign-${R15_GEMMA_CANDIDATE_ID}-${runtimeSealSha256.slice(0, 16)}`);
  try { await lstat(campaignDirectory); throw fail("r15-gemma-arm-scored-attempts-preexisting"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const candidate = seal.candidates.find(value => value.candidateId === R15_GEMMA_CANDIDATE_ID);
  const arm = createR15GemmaEligibilityManifest({
    armId: `r15-gemma-eligibility-${random(8).toString("hex")}`,
    createdAt: now().toISOString(), candidateArtifactSha256: candidate.artifactSha256,
    candidateArtifactBytes: candidate.artifactBytes, embeddingArtifactSha256: seal.embedding.artifactSha256,
    sourceCommit: seal.sourceCommit, sourceArchiveSha256: seal.runtime.sourceArchiveSha256,
    sourceTreeManifestSha256: await fileSha256(await ownedFile(root, "SOURCE-TREE-MANIFEST.json", 32 * 1024 * 1024)),
    runtimeSealSha256, hardwarePlanSha256, qualificationCriteriaSha256: seal.qualificationCriteria.sha256,
    controlsSha256: args["controls-sha256"], browserProofSha256: args["browser-proof-sha256"],
    homeReadySha256: args["home-ready-sha256"], homeLeaseId: ready.value.leaseId,
    homeLeaseSealSha256: ready.value.sealSha256
  });
  const bytes = Buffer.from(`${JSON.stringify(arm, null, 2)}\n`), output = path.resolve(root, args.output);
  if (!output.startsWith(root + path.sep)) throw fail("r15-gemma-arm-output-path");
  const file = await open(output, "wx");
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  return Object.freeze({ schemaVersion: "runaai-m1-r15-gemma-arm-preparation/v1", file: args.output.replaceAll("\\", "/"),
    fileSha256: sha256(bytes), eligibilityManifestSha256: r15GemmaEligibilityManifestSha256(arm),
    candidateId: arm.candidateId, requiredAttempts: arm.attempts.length, scoredAttemptsAtCreation: 0,
    modelsInvokedByPreparation: false, productionChanged: false, protectedDataRead: false });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(await prepareR15GemmaEligibilityArm(parseR15GemmaArmArguments(process.argv.slice(2))))}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ schemaVersion: "runaai-m1-r15-gemma-arm-preparation-error/v1",
    errorCode: safeCode(error), modelsInvokedByPreparation: false, productionChanged: false })}\n`); process.exitCode = 1; }
}
