import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, sha256 } from "../../../gate4/canonical.mjs";
import { ACCEPTANCE_POLICY, CASE_BUNDLE_SHA256 } from "./cases.mjs";
import { validateRuntimeSeal } from "./runner-contract.mjs";
import { CAMPAIGN_V2_EXTENDED_POLICY } from "../readiness/lease-v2-contract.mjs";
import { decodeRuntimeSealJson, expectedRuntimeSealSuites, normalizedRuntimeSealBytes, publishRuntimeSeal,
  validateRuntimeSealReadiness, validateRuntimeSealTelemetry } from "./r7-runtime-seal.mjs";

const HERE=path.dirname(fileURLToPath(import.meta.url)),COMMIT=/^[a-f0-9]{40}$/u;
const fail=code=>Object.assign(new Error(`m1-r9-seal-${code}`),{code:`m1-r9-seal-${code}`});
const need=(value,code)=>{if(!value)throw fail(code);};
const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===[...keys].sort().join();

export const R9_SEAL_AUTHORITIES=Object.freeze({
  campaignId:"m1-r9-extended-campaign-window",
  caseBundleSha256:CASE_BUNDLE_SHA256,
  rubricVersion:"2026-08-30.r9-extended-campaign-window",
  criteriaRelativePath:"gate7f/function-first/M1-S2-R9-EXTENDED-CAMPAIGN-WINDOW-CRITERIA-2026-08-30.md",
  criteriaPath:path.resolve(HERE,"../M1-S2-R9-EXTENDED-CAMPAIGN-WINDOW-CRITERIA-2026-08-30.md"),
  telemetryClassification:"prospective-r9-hardware-only-not-functional-qualification",
});

export function validateR9Manifest(value){
  need(exact(value,["schemaVersion","campaignId","seal","files","declaration","privateValuesIncluded"])
    &&value.schemaVersion==="runaai-m1-r9-runtime-seal-input/v1"&&value.campaignId===R9_SEAL_AUTHORITIES.campaignId
    &&value.privateValuesIncluded===false,"manifest");
  const seal=validateRuntimeSeal(value.seal);
  need(seal.schemaVersion==="runaai-m1-functional-runtime-seal/v5"
    &&seal.caseBundleSha256===R9_SEAL_AUTHORITIES.caseBundleSha256
    &&seal.sourceCommit!==ACCEPTANCE_POLICY.acceptanceCommit&&COMMIT.test(seal.sourceCommit)
    &&seal.qualificationCriteria.path===R9_SEAL_AUTHORITIES.criteriaRelativePath
    &&seal.qualificationCriteria.rubricVersion===R9_SEAL_AUTHORITIES.rubricVersion
    &&canonicalJson(seal.suites)===canonicalJson(expectedRuntimeSealSuites())
    &&seal.candidates.map(item=>item.candidateId).join()===ACCEPTANCE_POLICY.roster.map(item=>item.candidateId).join()
    &&seal.maximumBatchMs===CAMPAIGN_V2_EXTENDED_POLICY.maximumBatchMs&&seal.productionRoutingChanged===false,"seal-contract");
  need(exact(value.files,["sourceArchivePath","packageLockPath","criteriaPath","readinessPath","effectiveReasoningPath","telemetryPath"])
    &&Object.values(value.files).every(item=>typeof item==="string"&&path.isAbsolute(item))
    &&path.resolve(value.files.criteriaPath).toLowerCase()===R9_SEAL_AUTHORITIES.criteriaPath.toLowerCase(),"files");
  need(exact(value.declaration,["createdBeforeInference","sourceArchiveCreatedBeforeInference","observedR9Attempts",
    "importedAttemptCount","selectiveReplacement","expectedAnswerTuning","partialRoster","inheritedRuntimeSealSha256",
    "productionRoutingChanged","protectedDataIncluded"])
    &&value.declaration.createdBeforeInference===true&&value.declaration.sourceArchiveCreatedBeforeInference===true
    &&value.declaration.observedR9Attempts===0&&value.declaration.importedAttemptCount===0
    &&value.declaration.selectiveReplacement===false&&value.declaration.expectedAnswerTuning===false
    &&value.declaration.partialRoster===false&&value.declaration.inheritedRuntimeSealSha256===null
    &&value.declaration.productionRoutingChanged===false&&value.declaration.protectedDataIncluded===false,"declaration");
  return structuredClone({...value,seal});
}

export async function deriveR9RuntimeSeal({manifest:input,sourceArchiveBytes,packageLockBytes,criteriaBytes,
  readinessBytes,effectiveReasoningBytes,telemetryBytes}){
  const manifest=validateR9Manifest(input),seal=manifest.seal;
  need(sha256(sourceArchiveBytes)===seal.runtime.sourceArchiveSha256,"source-archive-drift");
  need(sha256(packageLockBytes)===seal.runtime.packageLockSha256,"package-lock-drift");
  need(sha256(criteriaBytes)===seal.qualificationCriteria.sha256
    &&sha256(normalizedRuntimeSealBytes(criteriaBytes))===seal.qualificationCriteria.normalizedSha256,"criteria-drift");
  need(sha256(readinessBytes)===seal.residency.readinessEvidenceSha256
    &&sha256(effectiveReasoningBytes)===seal.residency.effectiveReasoningEvidenceSha256
    &&sha256(telemetryBytes)===seal.residency.telemetryPolicySha256,"evidence-drift");
  validateRuntimeSealReadiness(decodeRuntimeSealJson(readinessBytes));
  validateRuntimeSealReadiness(decodeRuntimeSealJson(effectiveReasoningBytes));
  validateRuntimeSealTelemetry(decodeRuntimeSealJson(telemetryBytes),seal,R9_SEAL_AUTHORITIES.telemetryClassification,
    CAMPAIGN_V2_EXTENDED_POLICY);
  const bytes=Buffer.from(`${canonicalJson(seal)}\n`);
  return Object.freeze({seal:Object.freeze(seal),bytes,runtimeSealSha256:sha256(bytes)});
}

export async function createR9RuntimeSeal({manifestPath,outputPath}){
  return publishRuntimeSeal({manifestPath,outputPath,validateManifest:validateR9Manifest,derive:deriveR9RuntimeSeal,
    publicationSchema:"runaai-m1-r9-runtime-seal-publication/v1"});
}
