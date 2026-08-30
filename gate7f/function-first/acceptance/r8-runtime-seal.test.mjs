import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonicalJson, sha256 } from "../../../gate4/canonical.mjs";
import { ACCEPTANCE_POLICY, CASE_BUNDLE_SHA256 } from "./cases.mjs";
import { QDRANT_PIN, validateRuntimeSeal } from "./runner-contract.mjs";
import { expectedRuntimeSealSuites } from "./r7-runtime-seal.mjs";
import { createR8RuntimeSeal, deriveR8RuntimeSeal, R8_SEAL_AUTHORITIES, validateR8Manifest } from "./r8-runtime-seal.mjs";
import { CAMPAIGN_V2_POLICY } from "../readiness/lease-v2-contract.mjs";

const hex = "a".repeat(64), sourceCommit = "e".repeat(40);
const normalized = bytes => Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"));

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "m1-r8-seal-"));
  const readiness = await readFile(path.resolve("gate7f/function-first/readiness/evidence/20260828-functional-prerequisites.json"));
  const criteria = await readFile(R8_SEAL_AUTHORITIES.criteriaPath);
  const candidates = ACCEPTANCE_POLICY.roster.map((item, index) => ({ candidateId: item.candidateId,
    modelId: `r8-model-${index}`, artifactSha256: String(index + 1).repeat(64), artifactBytes: index + 1,
    requestControls: Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role => [role, { reasoningEffort: index === 1 ? null : "none" }])) }));
  const telemetryValue = { schemaVersion: "runa-m1-campaign-hardware-plan/v2", createdBeforeLoads: true, sourceCommit,
    classification: R8_SEAL_AUTHORITIES.telemetryClassification, policy: CAMPAIGN_V2_POLICY,
    maximumConcurrentPrimaries: 1, productionRoutingChanged: false, protectedDataIncluded: false,
    existingReranker: { url: "http://192.168.50.165:8412", changed: false },
    auxiliary: { artifact: { key: "text-embedding-nomic-embed-text-v1.5", sha256: hex },
      loadRequest: { model: "text-embedding-nomic-embed-text-v1.5", context_length: 2048 } },
    runtimeFiles: [{ sha256: hex }], candidates: candidates.map(item => ({ candidateId: item.candidateId,
      artifact: { key: item.modelId, sha256: item.artifactSha256, bytes: item.artifactBytes },
      requestReasoningEffort: item.requestControls.chat.reasoningEffort,
      loadRequest: { model: item.modelId, context_length: 32768 } })) };
  const values = { sourceArchive: Buffer.from("prospective-r8-source-archive"), packageLock: Buffer.from('{"lockfileVersion":3}\n'),
    criteria, readiness, telemetry: Buffer.from(`${canonicalJson(telemetryValue)}\n`) };
  const files = { sourceArchivePath: path.join(root, "source.tar"), packageLockPath: path.join(root, "package-lock.json"),
    criteriaPath: R8_SEAL_AUTHORITIES.criteriaPath, readinessPath: path.join(root, "readiness.json"),
    effectiveReasoningPath: path.join(root, "reasoning.json"), telemetryPath: path.join(root, "telemetry.json") };
  await Promise.all([writeFile(files.sourceArchivePath, values.sourceArchive), writeFile(files.packageLockPath, values.packageLock),
    writeFile(files.readinessPath, readiness), writeFile(files.effectiveReasoningPath, readiness), writeFile(files.telemetryPath, values.telemetry)]);
  const seal = { schemaVersion: "runaai-m1-functional-runtime-seal/v4", sourceCommit, caseBundleSha256: CASE_BUNDLE_SHA256,
    runtime: { nodeSha256: hex, sourceArchiveSha256: sha256(values.sourceArchive), packageLockSha256: sha256(values.packageLock),
      qdrantSha256: QDRANT_PIN.sha256, modelRuntimeSha256: hex, modelRuntimeVersion: "synthetic-r8-runtime" }, candidates,
    roles: Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role => [role, { maximumOutputTokens: ["code", "agent"].includes(role) ? 1536 : 512,
      maximumContextTokens: 32768, deadlineMs: ["code", "agent"].includes(role) ? 30000 : 60000 }])),
    providerBaseUrl: "http://127.0.0.1:9770/v1",
    embedding: { baseUrl: "http://127.0.0.1:9770/v1", modelId: "text-embedding-nomic-embed-text-v1.5", artifactSha256: hex },
    reranker: { baseUrl: "http://192.168.50.165:8412", artifactSha256: hex, windowCharacters: 2000, overlapCharacters: 300, batchSize: 32 },
    residency: { oneLargeModelAtATime: true, readinessEvidenceSha256: sha256(readiness),
      effectiveReasoningEvidenceSha256: sha256(readiness), telemetryPolicySha256: sha256(values.telemetry) },
    suites: expectedRuntimeSealSuites(), qualificationCriteria: { schemaVersion: "runaai-m1-r8-qualification-criteria/v1",
      path: R8_SEAL_AUTHORITIES.criteriaRelativePath, sha256: sha256(criteria), normalizedSha256: sha256(normalized(criteria)),
      rubricVersion: R8_SEAL_AUTHORITIES.rubricVersion }, evaluatorId: "independent-r8-evaluator",
    maximumBatchMs: 3600000, productionRoutingChanged: false };
  const manifest = { schemaVersion: "runaai-m1-r8-runtime-seal-input/v1", campaignId: R8_SEAL_AUTHORITIES.campaignId,
    seal, files, declaration: { createdBeforeInference: true, sourceArchiveCreatedBeforeInference: true, observedR8Attempts: 0,
      importedAttemptCount: 0, selectiveReplacement: false, expectedAnswerTuning: false, partialRoster: false,
      inheritedRuntimeSealSha256: null, productionRoutingChanged: false, protectedDataIncluded: false }, privateValuesIncluded: false };
  const manifestPath = path.join(root, "manifest.json"); await writeFile(manifestPath, `${canonicalJson(manifest)}\n`);
  return { root, values, seal, manifest, manifestPath, async close() { await rm(root, { recursive: true, force: true }); } };
}

const derive = value => deriveR8RuntimeSeal({ manifest: value.manifest, sourceArchiveBytes: value.values.sourceArchive,
  packageLockBytes: value.values.packageLock, criteriaBytes: value.values.criteria, readinessBytes: value.values.readiness,
  effectiveReasoningBytes: value.values.readiness, telemetryBytes: value.values.telemetry });

test("R8 binds the new criteria source archive unchanged cases and three-candidate roster", async () => {
  const value = await fixture(); try {
    const result = await derive(value);
    assert.equal(validateRuntimeSeal(JSON.parse(result.bytes)).schemaVersion, "runaai-m1-functional-runtime-seal/v4");
    assert.equal(result.seal.qualificationCriteria.rubricVersion, R8_SEAL_AUTHORITIES.rubricVersion);
    assert.equal(result.seal.candidates.length, 3); assert.equal(result.seal.caseBundleSha256, CASE_BUNDLE_SHA256);
  } finally { await value.close(); }
});

test("R8 refuses retrospective attempts inherited evidence and R7 authority substitution", async () => {
  const value = await fixture(); try {
    for (const mutate of [item => { item.declaration.observedR8Attempts = 1; },
      item => { item.declaration.inheritedRuntimeSealSha256 = hex; }, item => { item.seal.candidates.pop(); },
      item => { item.seal.qualificationCriteria.rubricVersion = "2026-08-30.r7-function-contract"; }]) {
      const changed = structuredClone(value.manifest); mutate(changed); assert.throws(() => validateR8Manifest(changed));
    }
  } finally { await value.close(); }
});

test("R8 publishes once and refuses pinned input drift", async () => {
  const value = await fixture(); try {
    const output = path.join(value.root, "output"); await mkdir(output); const target = path.join(output, "runtime-seal.json");
    const published = await createR8RuntimeSeal({ manifestPath: value.manifestPath, outputPath: target });
    assert.equal(published.schemaVersion, "runaai-m1-r8-runtime-seal-publication/v1");
    await assert.rejects(createR8RuntimeSeal({ manifestPath: value.manifestPath, outputPath: target }), /output-exists/u);
    const drifted = await fixture(); try {
      drifted.values.sourceArchive = Buffer.from("changed");
      await assert.rejects(derive(drifted), /source-archive-drift/u);
    } finally { await drifted.close(); }
  } finally { await value.close(); }
});
