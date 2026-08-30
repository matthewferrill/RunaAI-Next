import { link, lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, sha256 } from "../../../gate4/canonical.mjs";
import { ACCEPTANCE_POLICY, CASE_BUNDLE_SHA256, MODEL_CASES } from "./cases.mjs";
import { validateRuntimeSeal } from "./runner-contract.mjs";
import { CAMPAIGN_V2_POLICY, validateCampaignV2Policy } from "../readiness/lease-v2-contract.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HASH = /^[a-f0-9]{64}$/u, COMMIT = /^[a-f0-9]{40}$/u;
const fail = code => Object.assign(new Error(`m1-r7-seal-${code}`), { code: `m1-r7-seal-${code}` });
const need = (value, code) => { if (!value) throw fail(code); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join() === [...keys].sort().join();
const normalized = bytes => Buffer.from(new TextDecoder("utf8", { fatal: true }).decode(bytes).replaceAll("\r\n", "\n"));
const decode = bytes => { try { return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes)); } catch { throw fail("json"); } };

export const R7_SEAL_AUTHORITIES = Object.freeze({
  campaignId: "m1-r7-model-neutral-correction",
  caseBundleSha256: CASE_BUNDLE_SHA256,
  rubricVersion: "2026-08-30.r7-function-contract",
  criteriaRelativePath: "gate7f/function-first/M1-S2-R7-CORRECTIVE-CRITERIA-2026-08-30.md",
  criteriaPath: path.resolve(HERE, "../M1-S2-R7-CORRECTIVE-CRITERIA-2026-08-30.md"),
});

function expectedSuites() {
  const result = {};
  for (const item of MODEL_CASES) for (const suite of item.setup.suites ?? []) {
    const digest = sha256(canonicalJson(suite));
    need(!Object.hasOwn(result, suite.suiteId) || result[suite.suiteId] === digest, "suite-duplicate");
    result[suite.suiteId] = digest;
  }
  return result;
}

export function validateR7Manifest(value) {
  need(exact(value, ["schemaVersion", "campaignId", "seal", "files", "declaration", "privateValuesIncluded"])
    && value.schemaVersion === "runaai-m1-r7-runtime-seal-input/v1"
    && value.campaignId === R7_SEAL_AUTHORITIES.campaignId && value.privateValuesIncluded === false, "manifest");
  const seal = validateRuntimeSeal(value.seal);
  need(seal.schemaVersion === "runaai-m1-functional-runtime-seal/v3"
    && seal.caseBundleSha256 === R7_SEAL_AUTHORITIES.caseBundleSha256
    && seal.sourceCommit !== ACCEPTANCE_POLICY.acceptanceCommit && COMMIT.test(seal.sourceCommit)
    && seal.qualificationCriteria.path === R7_SEAL_AUTHORITIES.criteriaRelativePath
    && seal.qualificationCriteria.rubricVersion === R7_SEAL_AUTHORITIES.rubricVersion
    && canonicalJson(seal.suites) === canonicalJson(expectedSuites())
    && seal.candidates.map(item => item.candidateId).join() === ACCEPTANCE_POLICY.roster.map(item => item.candidateId).join()
    && seal.maximumBatchMs === 3600000 && seal.productionRoutingChanged === false, "seal-contract");
  need(exact(value.files, ["sourceArchivePath", "packageLockPath", "criteriaPath", "readinessPath", "effectiveReasoningPath", "telemetryPath"])
    && Object.values(value.files).every(item => typeof item === "string" && path.isAbsolute(item))
    && path.resolve(value.files.criteriaPath).toLowerCase() === R7_SEAL_AUTHORITIES.criteriaPath.toLowerCase(), "files");
  need(exact(value.declaration, ["createdBeforeInference", "sourceArchiveCreatedBeforeInference", "observedR7Attempts",
    "importedAttemptCount", "selectiveReplacement", "expectedAnswerTuning", "partialRoster", "inheritedRuntimeSealSha256",
    "productionRoutingChanged", "protectedDataIncluded"])
    && value.declaration.createdBeforeInference === true && value.declaration.sourceArchiveCreatedBeforeInference === true
    && value.declaration.observedR7Attempts === 0 && value.declaration.importedAttemptCount === 0
    && value.declaration.selectiveReplacement === false && value.declaration.expectedAnswerTuning === false
    && value.declaration.partialRoster === false && value.declaration.inheritedRuntimeSealSha256 === null
    && value.declaration.productionRoutingChanged === false && value.declaration.protectedDataIncluded === false, "declaration");
  return structuredClone({ ...value, seal });
}

function validateReadiness(value) {
  need(exact(value, ["schemaVersion", "createdBeforeScoredInference", "qualification", "scope", "files", "modelRuntime",
    "controls", "changedCompositionSinceSmoke", "productionRoutingChanged", "protectedDataIncluded"])
    && value.schemaVersion === "runaai-m1-functional-readiness-reference/v1" && value.createdBeforeScoredInference === true
    && value.qualification === false && typeof value.scope === "string" && value.scope.includes("Not a substitute for functional qualification")
    && Array.isArray(value.files) && value.files.length === 6
    && value.files.every(item => exact(item, ["path", "sha256"]) && typeof item.path === "string" && HASH.test(item.sha256))
    && exact(value.modelRuntime, ["path", "sha256"]) && typeof value.modelRuntime.path === "string" && HASH.test(value.modelRuntime.sha256)
    && exact(value.controls, ["gemma4", "qwen36", "qwen3Coder"])
    && value.controls.gemma4 === "reasoning_effort none" && value.controls.qwen36 === "reasoning_effort none"
    && value.controls.qwen3Coder === "reasoning_effort omitted" && value.productionRoutingChanged === false
    && value.protectedDataIncluded === false, "readiness");
}

function validateTelemetry(value, seal) {
  try { validateCampaignV2Policy(value?.policy); } catch { throw fail("telemetry"); }
  need(value?.schemaVersion === "runa-m1-campaign-hardware-plan/v2" && value.createdBeforeLoads === true
    && value.sourceCommit === seal.sourceCommit && value.classification === "prospective-r7-hardware-only-not-functional-qualification"
    && value.maximumConcurrentPrimaries === 1 && value.productionRoutingChanged === false && value.protectedDataIncluded === false
    && canonicalJson(value.policy) === canonicalJson(CAMPAIGN_V2_POLICY)
    && value.existingReranker?.url === seal.reranker.baseUrl && value.existingReranker.changed === false
    && value.auxiliary?.artifact?.key === seal.embedding.modelId && value.auxiliary.artifact.sha256 === seal.embedding.artifactSha256
    && value.auxiliary.loadRequest?.model === seal.embedding.modelId && value.auxiliary.loadRequest.context_length === 2048
    && Array.isArray(value.runtimeFiles) && value.runtimeFiles.some(item => item?.sha256 === seal.runtime.modelRuntimeSha256)
    && Array.isArray(value.candidates) && value.candidates.length === 3, "telemetry");
  const byId = new Map(value.candidates.map(item => [item.candidateId, item])); need(byId.size === 3, "telemetry-roster");
  for (const expected of seal.candidates) {
    const actual = byId.get(expected.candidateId), controls = Object.values(expected.requestControls).map(item => item.reasoningEffort);
    need(actual?.artifact?.key === expected.modelId && actual.artifact.sha256 === expected.artifactSha256
      && actual.artifact.bytes === expected.artifactBytes && new Set(controls).size === 1
      && actual.requestReasoningEffort === controls[0] && actual.loadRequest?.model === expected.modelId
      && actual.loadRequest.context_length === 32768, "telemetry-candidate");
  }
}

async function boundedFile(filename, maximum) {
  need(path.isAbsolute(filename), "path");
  const resolved = path.resolve(filename), actual = await realpath(resolved);
  need(actual.toLowerCase() === resolved.toLowerCase(), "resolved-path");
  const linked = await lstat(resolved);
  need(linked.isFile() && !linked.isSymbolicLink() && linked.nlink === 1, "file-boundary");
  const handle = await open(resolved, "r"); let bytes;
  try {
    const before = await handle.stat();
    need(before.isFile() && before.nlink === 1 && before.size > 0 && before.size <= maximum, "file-boundary");
    bytes = await handle.readFile(); const after = await handle.stat();
    need(before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs
      && after.nlink === 1 && bytes.length === before.size, "file-drift");
  } finally { await handle.close(); }
  return bytes;
}

export async function deriveR7RuntimeSeal({ manifest: input, sourceArchiveBytes, packageLockBytes, criteriaBytes,
  readinessBytes, effectiveReasoningBytes, telemetryBytes }) {
  const manifest = validateR7Manifest(input), seal = manifest.seal;
  need(sha256(sourceArchiveBytes) === seal.runtime.sourceArchiveSha256, "source-archive-drift");
  need(sha256(packageLockBytes) === seal.runtime.packageLockSha256, "package-lock-drift");
  need(sha256(criteriaBytes) === seal.qualificationCriteria.sha256
    && sha256(normalized(criteriaBytes)) === seal.qualificationCriteria.normalizedSha256, "criteria-drift");
  need(sha256(readinessBytes) === seal.residency.readinessEvidenceSha256
    && sha256(effectiveReasoningBytes) === seal.residency.effectiveReasoningEvidenceSha256
    && sha256(telemetryBytes) === seal.residency.telemetryPolicySha256, "evidence-drift");
  validateReadiness(decode(readinessBytes)); validateReadiness(decode(effectiveReasoningBytes));
  validateTelemetry(decode(telemetryBytes), seal);
  const bytes = Buffer.from(`${canonicalJson(seal)}\n`);
  return Object.freeze({ seal: Object.freeze(seal), bytes, runtimeSealSha256: sha256(bytes) });
}

export async function createR7RuntimeSeal({ manifestPath, outputPath }) {
  const manifestBytes = await boundedFile(manifestPath, 1024 * 1024), manifest = validateR7Manifest(decode(manifestBytes));
  const [sourceArchiveBytes, packageLockBytes, criteriaBytes, readinessBytes, effectiveReasoningBytes, telemetryBytes] = await Promise.all([
    boundedFile(manifest.files.sourceArchivePath, 512 * 1024 * 1024), boundedFile(manifest.files.packageLockPath, 16 * 1024 * 1024),
    boundedFile(manifest.files.criteriaPath, 1024 * 1024), boundedFile(manifest.files.readinessPath, 16 * 1024 * 1024),
    boundedFile(manifest.files.effectiveReasoningPath, 16 * 1024 * 1024), boundedFile(manifest.files.telemetryPath, 16 * 1024 * 1024),
  ]);
  const result = await deriveR7RuntimeSeal({ manifest, sourceArchiveBytes, packageLockBytes, criteriaBytes,
    readinessBytes, effectiveReasoningBytes, telemetryBytes });
  need(path.isAbsolute(outputPath) && path.basename(outputPath) === "runtime-seal.json", "output-path");
  const target = path.resolve(outputPath), parent = path.dirname(target), pending = `${target}.pending`;
  need((await realpath(parent)).toLowerCase() === parent.toLowerCase() && (await lstat(parent)).isDirectory(), "output-parent");
  let handle, ownedPending = false, linked = false;
  try {
    handle = await open(pending, "wx"); ownedPending = true; await handle.writeFile(result.bytes); await handle.sync(); await handle.close(); handle = null;
    await link(pending, target); linked = true; await unlink(pending);
  } catch (error) {
    try { await handle?.close(); } catch {}
    if (ownedPending && !linked) try { await unlink(pending); } catch {}
    throw error.code === "EEXIST" ? fail("output-exists") : error;
  }
  const info = await lstat(target), retained = await readFile(target);
  need(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && retained.equals(result.bytes), "output-drift");
  return Object.freeze({ schemaVersion: "runaai-m1-r7-runtime-seal-publication/v1", outputPath: target,
    runtimeSealSha256: result.runtimeSealSha256, bytes: retained.length, sourceCommit: result.seal.sourceCommit,
    caseBundleSha256: result.seal.caseBundleSha256, createdBeforeInference: true, productionRoutingChanged: false,
    protectedDataIncluded: false, privateValuesIncluded: false });
}
