import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonicalJson, sha256 } from "../../../gate4/canonical.mjs";
import { ACCEPTANCE_POLICY, CASE_BUNDLE_SHA256, MODEL_CASES } from "./cases.mjs";
import { QDRANT_PIN, validateRuntimeSeal } from "./runner-contract.mjs";
import { createR7RuntimeSeal, deriveR7RuntimeSeal, R7_SEAL_AUTHORITIES, validateR7Manifest } from "./r7-runtime-seal.mjs";
import { CAMPAIGN_V2_POLICY } from "../readiness/lease-v2-contract.mjs";

const hex = "a".repeat(64), sourceCommit = "f".repeat(40);
const stableSuites = () => Object.fromEntries(MODEL_CASES.flatMap(item => (item.setup.suites ?? [])
  .map(suite => [suite.suiteId, sha256(canonicalJson(suite))])));
const normalize = bytes => Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"));
const copy = value => structuredClone(value);

test("shared v2 hardware builder accepts an explicit truthful R7 classification while retaining its historical default", async () => {
  const source = await readFile(path.resolve("gate7f/function-first/readiness/build-campaign-hardware-v2.mjs"), "utf8");
  assert.match(source, /process\.argv\[3\].*prospective-r6-hardware-only-not-functional-qualification/u);
  assert.match(source, /prospective-r7-hardware-only-not-functional-qualification/u);
  assert.match(source, /classification,policy:CAMPAIGN_V2_POLICY/u);
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "m1-r7-seal-"));
  const readiness = await readFile(path.resolve("gate7f/function-first/readiness/evidence/20260828-functional-prerequisites.json"));
  const candidates = ACCEPTANCE_POLICY.roster.map((item, index) => ({ candidateId: item.candidateId, modelId: `r7-model-${index}`,
    artifactSha256: String(index + 1).repeat(64), artifactBytes: index + 1,
    requestControls: Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role => [role, { reasoningEffort: index === 1 ? null : "none" }])) }));
  const telemetry = { schemaVersion: "runa-m1-campaign-hardware-plan/v2", createdBeforeLoads: true, sourceCommit,
    classification: "prospective-r7-hardware-only-not-functional-qualification", policy: CAMPAIGN_V2_POLICY,
    maximumConcurrentPrimaries: 1, productionRoutingChanged: false, protectedDataIncluded: false,
    existingReranker: { url: "http://192.168.50.165:8412", changed: false },
    auxiliary: { artifact: { key: "text-embedding-nomic-embed-text-v1.5", sha256: hex },
      loadRequest: { model: "text-embedding-nomic-embed-text-v1.5", context_length: 2048 } },
    runtimeFiles: [{ sha256: hex }], candidates: candidates.map(item => ({ candidateId: item.candidateId,
      artifact: { key: item.modelId, sha256: item.artifactSha256, bytes: item.artifactBytes },
      requestReasoningEffort: item.requestControls.chat.reasoningEffort,
      loadRequest: { model: item.modelId, context_length: 32768 } })) };
  const values = {
    sourceArchive: Buffer.from("prospective-r7-source-archive"), packageLock: Buffer.from('{"lockfileVersion":3}\n'),
    criteria: await readFile(R7_SEAL_AUTHORITIES.criteriaPath), readiness, effectiveReasoning: readiness,
    telemetry: Buffer.from(`${canonicalJson(telemetry)}\n`),
  };
  const files = {
    sourceArchivePath: path.join(root, "source.tar"), packageLockPath: path.join(root, "package-lock.json"),
    criteriaPath: R7_SEAL_AUTHORITIES.criteriaPath, readinessPath: path.join(root, "readiness.json"),
    effectiveReasoningPath: path.join(root, "reasoning.json"), telemetryPath: path.join(root, "telemetry.json"),
  };
  await Promise.all([writeFile(files.sourceArchivePath, values.sourceArchive), writeFile(files.packageLockPath, values.packageLock),
    writeFile(files.readinessPath, values.readiness), writeFile(files.effectiveReasoningPath, values.effectiveReasoning),
    writeFile(files.telemetryPath, values.telemetry)]);
  const seal = { schemaVersion: "runaai-m1-functional-runtime-seal/v3", sourceCommit, caseBundleSha256: CASE_BUNDLE_SHA256,
    runtime: { nodeSha256: hex, sourceArchiveSha256: sha256(values.sourceArchive), packageLockSha256: sha256(values.packageLock),
      qdrantSha256: QDRANT_PIN.sha256, modelRuntimeSha256: hex, modelRuntimeVersion: "synthetic-r7-runtime" },
    candidates,
    roles: Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role => [role, { maximumOutputTokens: ["code", "agent"].includes(role) ? 1536 : 512,
      maximumContextTokens: 32768, deadlineMs: ["code", "agent"].includes(role) ? 30000 : 60000 }])),
    providerBaseUrl: "http://127.0.0.1:9770/v1",
    embedding: { baseUrl: "http://127.0.0.1:9770/v1", modelId: "text-embedding-nomic-embed-text-v1.5", artifactSha256: hex },
    reranker: { baseUrl: "http://192.168.50.165:8412", artifactSha256: hex, windowCharacters: 2000, overlapCharacters: 300, batchSize: 32 },
    residency: { oneLargeModelAtATime: true, readinessEvidenceSha256: sha256(values.readiness),
      effectiveReasoningEvidenceSha256: sha256(values.effectiveReasoning), telemetryPolicySha256: sha256(values.telemetry) },
    suites: stableSuites(), qualificationCriteria: { schemaVersion: "runaai-m1-r7-qualification-criteria/v1",
      path: R7_SEAL_AUTHORITIES.criteriaRelativePath, sha256: sha256(values.criteria), normalizedSha256: sha256(normalize(values.criteria)),
      rubricVersion: R7_SEAL_AUTHORITIES.rubricVersion },
    evaluatorId: "independent-r7-evaluator", maximumBatchMs: 3600000, productionRoutingChanged: false };
  const manifest = { schemaVersion: "runaai-m1-r7-runtime-seal-input/v1", campaignId: R7_SEAL_AUTHORITIES.campaignId,
    seal, files, declaration: { createdBeforeInference: true, sourceArchiveCreatedBeforeInference: true, observedR7Attempts: 0,
      importedAttemptCount: 0, selectiveReplacement: false, expectedAnswerTuning: false, partialRoster: false,
      inheritedRuntimeSealSha256: null, productionRoutingChanged: false, protectedDataIncluded: false }, privateValuesIncluded: false };
  const manifestPath = path.join(root, "manifest.json"); await writeFile(manifestPath, `${canonicalJson(manifest)}\n`);
  return { root, values, files, seal, manifest, manifestPath, async close() { await rm(root, { recursive: true, force: true }); } };
}
const derive = value => deriveR7RuntimeSeal({ manifest: value.manifest, sourceArchiveBytes: value.values.sourceArchive,
  packageLockBytes: value.values.packageLock, criteriaBytes: value.values.criteria, readinessBytes: value.values.readiness,
  effectiveReasoningBytes: value.values.effectiveReasoning, telemetryBytes: value.values.telemetry });

test("R7 deterministically binds the prospective case rubric suites roster and source", async () => {
  const value = await fixture(); try {
    const first = await derive(value), second = await derive(value);
    assert.deepEqual(first.bytes, second.bytes); assert.equal(first.seal.schemaVersion, "runaai-m1-functional-runtime-seal/v3");
    assert.equal(first.seal.caseBundleSha256, CASE_BUNDLE_SHA256); assert.deepEqual(first.seal.suites, stableSuites());
    assert.equal(first.seal.qualificationCriteria.rubricVersion, R7_SEAL_AUTHORITIES.rubricVersion);
    assert.equal(validateRuntimeSeal(JSON.parse(first.bytes)).sourceCommit, sourceCommit);
  } finally { await value.close(); }
});

test("R7 refuses retrospective tuning partial roster inherited evidence and authority drift", async () => {
  const value = await fixture(); try {
    const mutations = [item => { item.declaration.observedR7Attempts = 1; }, item => { item.declaration.importedAttemptCount = 1; },
      item => { item.declaration.expectedAnswerTuning = true; }, item => { item.declaration.partialRoster = true; },
      item => { item.declaration.inheritedRuntimeSealSha256 = hex; }, item => { item.seal.candidates.pop(); },
      item => { item.seal.suites = {}; }, item => { item.seal.sourceCommit = ACCEPTANCE_POLICY.acceptanceCommit; },
      item => { item.seal.qualificationCriteria.rubricVersion = "changed"; }, item => { item.files.criteriaPath = value.files.readinessPath; }];
    for (const mutate of mutations) { const changed = copy(value.manifest); mutate(changed); assert.throws(() => validateR7Manifest(changed)); }
  } finally { await value.close(); }
});

test("R7 publication checks every pinned file and is canonical create-only", async () => {
  const value = await fixture(); try {
    const outputDirectory = path.join(value.root, "output"); await mkdir(outputDirectory);
    const outputPath = path.join(outputDirectory, "runtime-seal.json");
    const result = await createR7RuntimeSeal({ manifestPath: value.manifestPath, outputPath });
    assert.equal(result.schemaVersion, "runaai-m1-r7-runtime-seal-publication/v1");
    assert.deepEqual(await readFile(outputPath), Buffer.from(`${canonicalJson(value.seal)}\n`));
    await assert.rejects(createR7RuntimeSeal({ manifestPath: value.manifestPath, outputPath }), /output-exists/u);
    await assert.rejects(readFile(`${outputPath}.pending`));
  } finally { await value.close(); }
});

test("R7 file drift fails before an output is created", async () => {
  const value = await fixture(); try {
    const outputDirectory = path.join(value.root, "output"); await mkdir(outputDirectory);
    const outputPath = path.join(outputDirectory, "runtime-seal.json");
    await writeFile(value.files.sourceArchivePath, "changed");
    await assert.rejects(createR7RuntimeSeal({ manifestPath: value.manifestPath, outputPath }), /source-archive-drift/u);
    await assert.rejects(readFile(outputPath));
  } finally { await value.close(); }
});
