import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { qualificationEvidenceFixture } from "../review/evidence-fixture.mjs";
import { hash } from "../runtime.mjs";
import { buildRequest, ADAPTER_POLICY } from "../adapter.mjs";
import { runAcceptance, soakSchedule, SOAK_POLICY } from "../runner.mjs";
import { runModelIntegration, integrationScenarios } from "../model-integration.mjs";
import { completedFunctionalPrefix } from "../export-review-prefix.mjs";
import { anonymousResponses, expectedAcceptanceIds } from "../make-review-packets.mjs";
import { loadAcceptanceCorpus } from "../acceptance/corpus.mjs";
import { renderAcceptanceInputs } from "../acceptance/inputs.mjs";
import { makeJudgmentRecord, acceptanceSealDigest } from "./judgments.mjs";
import { bindJudgmentBundleSource } from "./source-binding.mjs";

// Fabricated transport, synthetic in-memory receipts, and deliberately unresolved fake judgments.
// No actual model response, live capture, packet, or grade is read. Public frozen inputs exercise the
// actual schedule builder; no expected answer is copied into a fabricated response.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const encode = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
export const save = (file, bytes) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes); return file; };
export const pin = file => ({ file, sha256: hash(readFileSync(file)) });
const jsonl = rows => Buffer.from(rows.map(row => JSON.stringify(row) + "\n").join(""));
const fixtureStart = Date.parse("2026-08-27T18:00:00.000Z");

async function fabricateCapture(bundle, packageManifest, candidate) {
  const base = qualificationEvidenceFixture(), events = [];
  const initial = fixtureStart + (candidate === "gemma26" ? 60000 : 0);
  let clock = 0;
  const record = (type, payload) => {
    events.push({ type, time: new Date(initial + clock).toISOString(), ...structuredClone(payload) }); clock += 10;
  };
  const telemetry = label => ({ ...structuredClone(base.events.find(row => row.type === "telemetry")), label,
    gpus: base.events.find(row => row.type === "telemetry").gpus.map(gpu => ({ ...gpu,
      uuid: bundle.policies.hardware.gpuUuids[gpu.index], powerLimitWatts: 160 })) });
  const sample = label => { const value = telemetry(label); delete value.type; delete value.time; record("telemetry", value); };
  const manifest = bundle.candidates[candidate], model = manifest.modelKey;
  for (const sourceRow of base.events.slice(0, 8)) {
    const row = structuredClone(sourceRow), type = row.type; delete row.type; delete row.time;
    if (type === "source") Object.assign(row, { source: bundle.source, manifest, phase: bundle.source.kind,
      armTimeoutMs: 7200000, packageVerification: { manifest: packageManifest, sha256: hash(encode(packageManifest)) } });
    if (type === "verified-files") row.artifact = { path: manifest.artifactPath, bytes: manifest.artifactBytes, sha256: manifest.artifactSha256 };
    if (type === "identity") row.identity.key = model;
    if (type === "load") row.request.model = model;
    if (type === "resident") row.resident.modelKey = model;
    if (type === "telemetry") { sample(row.label); continue; }
    record(type, row);
  }
  const invoke = async ({ id, endpoint, request }) => {
    sample(id);
    const started = clock;
    record("request", { id, endpoint, request: { ...request, model, temperature: 0, stream: false, reasoning_effort: "none" } });
    let content = "Fabricated fixture reply; this is not model evidence.";
    if (id.startsWith("integration:")) {
      const [, name, phase] = id.split(":"), scenario = integrationScenarios().find(row => row.id === name);
      const proposal = phase === "proposal" && scenario.expectProposal ? scenario.allowedProposal : null;
      content = JSON.stringify({ kind: proposal ? "propose" : "respond", message: "Fabricated integration reply.", plan: [], proposal });
    }
    const response = { model, choices: [{ finish_reason: "stop", message: { role: "assistant", content } }],
      usage: { prompt_tokens: 20, completion_tokens: 3 } };
    const normalized = { content, toolCalls: [], finishReason: "stop", promptTokens: 20, completionTokens: 3,
      firstTokenMs: null, tokensPerSecond: null };
    record("response", { id, endpoint, response, elapsedMs: clock - started });
    sample(id + ":after");
    record("observation", { id, endpoint, normalized, elapsedMs: clock - started });
    return { response, normalized };
  };
  await runAcceptance(bundle.inputs, { invoke, record });
  await runModelIntegration({ invoke, record, buildRequest });
  const soakStart = clock;
  record("soak-start", { policy: SOAK_POLICY, startedAt: new Date(initial + soakStart).toISOString() });
  for (const [slot, batch] of soakSchedule().entries()) {
    clock = Math.max(clock, soakStart + slot * SOAK_POLICY.slotIntervalMs);
    record("soak-slot", { slot, plannedOffsetMs: slot * SOAK_POLICY.slotIntervalMs,
      actualOffsetMs: clock - soakStart, concurrency: batch.length });
    for (const input of batch) await invoke({ id: input.id, ...buildRequest(input) });
  }
  clock = soakStart + SOAK_POLICY.durationMs;
  record("soak-complete", { requests: 131, expectedRequests: 131, elapsedMs: SOAK_POLICY.durationMs, completed: true });
  const cleanup = structuredClone(base.events.find(row => row.type === "cleanup")); delete cleanup.type; delete cleanup.time;
  record("cleanup", cleanup); sample("after-unload");
  const result = { ...base.result, candidate, phase: bundle.source.kind, modelKey: model,
    startedAt: new Date(initial).toISOString(), endedAt: new Date(initial + clock).toISOString(), observed: 256 };
  return { events, result, bytes: jsonl(events) };
}

export async function publicationFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "runa-publication-fixture-"));
  const fixture = { root, cleanup: () => {
    assert.equal(path.dirname(root), tmpdir()); assert.ok(path.basename(root).startsWith("runa-publication-fixture-"));
    rmSync(root, { recursive: true, force: true });
  } };
  try {
    const repositoryRoot = path.join(root, "frozen-bytes"), acceptanceSealFile = "gate7f/qualification/acceptance/SEAL.json";
    const sealBytes = readFileSync(path.join(repo, acceptanceSealFile)), acceptance = JSON.parse(sealBytes);
    save(path.join(repositoryRoot, acceptanceSealFile), sealBytes);
    for (const entry of acceptance.files) {
      const original = readFileSync(path.join(repo, entry.path));
      // Preserve historical mixed-EOL pins in a disposable copy, never rewrite frozen checkout files.
      const lf = original.toString("utf8").replace(/\r\n/g, "\n");
      const exact = [original, Buffer.from(lf), Buffer.from(lf.replace(/\n/g, "\r\n"))].find(bytes => hash(bytes) === entry.sha256);
      assert.ok(exact, "fixture-frozen-file-not-reconstructible"); save(path.join(repositoryRoot, entry.path), exact);
    }
    const base = qualificationEvidenceFixture(), packageDir = path.join(root, "package"), sourceFiles = {};
    for (const file of Object.keys(base.bundle.source.files)) {
      const bytes = Buffer.from("synthetic source: " + file); save(path.join(packageDir, file), bytes); sourceFiles[file] = hash(bytes);
    }
    const hardware = { gpuUuids: ["synthetic-gpu-a", "synthetic-gpu-b"], gpuPowerLimitWatts: 160, maximumStartTemperatureC: 50 };
    const bundle = { ...base.bundle, source: { ...base.bundle.source, kind: "acceptance-power-v2", files: sourceFiles },
      inputs: renderAcceptanceInputs(loadAcceptanceCorpus()),
      candidates: { incumbent: base.bundle.candidates.incumbent,
        gemma26: { ...base.bundle.candidates.incumbent, modelKey: "synthetic-gemma" } },
      policies: { adapter: ADAPTER_POLICY, soak: SOAK_POLICY, hardware } };
    const bundleBytes = encode(bundle); save(path.join(packageDir, "qualification/bundle.json"), bundleBytes);
    const packageManifest = { ...base.packageManifest, kind: bundle.source.kind,
      files: { ...sourceFiles, "qualification/bundle.json": hash(bundleBytes) } };
    save(path.join(packageDir, "package-manifest.json"), encode(packageManifest));
    const runSeal = { schemaVersion: "runa2-qualification-run-seal/v1", sourceCommit: bundle.source.commit,
      packageManifestSha256: hash(encode(packageManifest)), bundleSha256: hash(bundleBytes),
      acceptanceSealSha256: acceptanceSealDigest(), candidates: bundle.candidates, policies: bundle.policies,
      verificationFiles: Object.fromEntries(["gate7f/qualification/verify.mjs", "gate7f/qualification/runtime.mjs"]
        .map(file => [file, hash(readFileSync(path.join(repo, file)))])) };
    const runSealFile = save(path.join(root, "run-seal.json"), encode(runSeal));
    const mapping = { "blind-candidate-a": "incumbent", "blind-candidate-b": "gemma26" };
    const reviewRoot = path.join(root, "review"), reviewFiles = {}, sourceSnapshots = [], arms = [];
    const captures = {};
    for (const [armId, candidate] of Object.entries(mapping)) {
      const capture = await fabricateCapture(bundle, packageManifest, candidate); captures[armId] = capture;
      const transferRoot = path.join(root, candidate), relativeDir = "qualification/capture-" + candidate;
      const files = {};
      for (const [name, bytes] of [[relativeDir + "/events.jsonl", capture.bytes], [relativeDir + "/result.json", encode(capture.result)]]) {
        save(path.join(transferRoot, name), bytes); files[name] = { bytes: bytes.length, sha256: hash(bytes) };
      }
      const finalManifest = { schemaVersion: "runa2-qualification-home-export/v1", host: "RUNA-HOME", time: "2026-08-27T20:00:00.000Z", files };
      const manifestFile = save(path.join(transferRoot, "HOME-EXPORT.json"), encode(finalManifest));
      const prefixBytes = completedFunctionalPrefix(capture.bytes), prefixName = candidate + "-prefix.jsonl";
      save(path.join(reviewRoot, prefixName), prefixBytes); reviewFiles[prefixName] = { bytes: prefixBytes.length, sha256: hash(prefixBytes) };
      sourceSnapshots.push({ file: prefixName, sourceSnapshotSha256: hash(capture.bytes) });
      const acceptanceEnd = capture.events.findIndex(row => row.type === "acceptance-complete"), prefix = capture.events.slice(0, acceptanceEnd + 1);
      const responses = anonymousResponses(prefix, { expectedIds: expectedAcceptanceIds(bundle) });
      const packet = { schemaVersion: "runa2-qualification-blind-review-packet/v1", candidateLabel: armId === "blind-candidate-a" ? "Candidate-A" : "Candidate-B",
        responses, acceptancePrefixSha256: hash(JSON.stringify(prefix)), suppliedBundleSha256: hash(bundleBytes),
        providerMetadataOmitted: true, modelAnswerContentUnmodified: true, modelSelfIdentificationPossible: true,
        fullCaptureVerificationPending: true, modelQualityNotYetGraded: true };
      const packetFile = save(path.join(root, armId + "-packet.json"), encode(packet));
      const judgments = { schemaVersion: "runa2-gate7f-qualification-judgments/v1", armId, acceptanceSealSha256: acceptanceSealDigest(),
        evaluator: { id: "fabricated-unresolved-fixture", candidateIdentitiesWithheld: true, acceptanceModifiedAfterOutputs: false, blindingDisclosures: [] },
        records: responses.map(row => makeJudgmentRecord({ ...row,
          message: { content: row.content, tool_calls: row.toolCalls }, transport: { status: "completed", finishReason: row.finishReason, errorCode: null },
          semantic: { outcome: "review-required", reason: "Fabricated, not a model judgment.", evidence: [], reviewQuestion: "Independent semantic review is required." } })) };
      const bound = bindJudgmentBundleSource({ bundle: judgments, packetBytes: encode(packet), expectedPacketSha256: hash(encode(packet)),
        expectedIdentities: responses.map(({ caseId, attempt, turnIndex }) => ({ caseId, attempt, turnIndex })), expectedArmId: armId });
      const judgmentFile = save(path.join(root, armId + "-judgments.json"), encode(bound));
      arms.push({ armId, transfer: { root: transferRoot, manifest: pin(manifestFile), expectedFiles: Object.keys(files) },
        packet: pin(packetFile), judgments: pin(judgmentFile) });
    }
    const reviewManifest = { schemaVersion: "runa2-qualification-home-export/v1", host: "RUNA-HOME", time: "2026-08-27T20:00:00.000Z",
      files: reviewFiles, reviewSnapshotNotFinalCapture: true, sourceSnapshots };
    const reviewManifestFile = save(path.join(reviewRoot, "HOME-REVIEW-EXPORT.json"), encode(reviewManifest));
    return Object.assign(fixture, { bundle, captures, options: { packageDir, repositoryRoot, runSeal: pin(runSealFile), mapping, arms,
      reviewTransfer: { root: reviewRoot, manifest: pin(reviewManifestFile), expectedFiles: Object.keys(reviewFiles) } } });
  } catch (error) { fixture.cleanup(); throw error; }
}
