import { mkdir, readFile, lstat, realpath, open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual as same } from "node:util";
import { ACCEPTANCE_POLICY, CASE_BUNDLE_SHA256, MODEL_CASES, CONTROL_CASES } from "./cases.mjs";
import { fail, sha256, assertOwnedStage, validateRuntimeSeal, QDRANT_PIN, newObservation, ObservationLedger, inventory } from "./runner-contract.mjs";
import { evaluateAttempt, evaluateControl } from "./assertions.mjs";
import { populateAttemptChecks } from "./observations.mjs";
import { createOwnedControlResources, fileSha256 } from "./owned-control-resources.mjs";
import { createFunctionalTestbed } from "./functional-testbed.mjs";
import { FunctionalHttpJourney } from "./http-journey.mjs";
import { AcceptanceFaultController, createFaultActions } from "./fault-actions.mjs";
import { startApplicationFaultWorker } from "./fault-worker.mjs";
import { createBrowserCheckpoint } from "./browser-checkpoint.mjs";

const HEX = /^[a-f0-9]{64}$/u;
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const digest = value => sha256(JSON.stringify(stable(value)));
const json = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const safeCode = error => /^[a-z0-9-]{1,100}$/u.test(error?.code ?? "") ? error.code : "m1-campaign-operation-failed";
const stamp = () => new Date().toISOString();
const age = (value, now) => now - Date.parse(value);
const within = (value, now, maximumMs) => Number.isFinite(age(value, now)) && age(value, now) >= -2000 && age(value, now) <= maximumMs;
const abortError = signal => signal.reason?.code ? signal.reason : fail("m1-campaign-aborted");

export function parseCampaignArguments(argv) {
  const result = { mode: "inventory" }, seen = new Set();
  const names = ["mode", "owned-root", "source-commit", "runtime-seal", "runtime-seal-sha256", "controls", "controls-sha256",
    "candidate-id", "home-ready", "home-ready-sha256", "hardware-plan", "hardware-plan-sha256", "home-status", "browser-checkpoints"];
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.slice(2);
    if (!argv[index]?.startsWith("--") || !names.includes(key) || !argv[index + 1] || argv[index + 1].startsWith("--")) throw fail("m1-campaign-argument-invalid");
    if (seen.has(key)) throw fail("m1-campaign-duplicate-argument");
    seen.add(key); result[key] = argv[index + 1];
  }
  if (!["inventory", "scored"].includes(result.mode)) throw fail("m1-campaign-mode-invalid");
  if (result.mode === "scored") {
    if (names.filter(key => !["mode", "browser-checkpoints"].includes(key)).some(key => !result[key])
        || result["browser-checkpoints"] !== "true") throw fail("m1-campaign-required-input-missing");
    for (const name of names.filter(key => key.endsWith("-sha256"))) if (!HEX.test(result[name])) throw fail("m1-campaign-digest-invalid");
    if (!/^[a-f0-9]{40}$/u.test(result["source-commit"]) || !ACCEPTANCE_POLICY.roster.some(value => value.candidateId === result["candidate-id"])) throw fail("m1-campaign-identity-invalid");
  }
  return result;
}

/** No subsets, candidate omission, automatic resume or retry of a finished
 * attempt. A stopped batch leaves its remaining slots explicitly unexecuted. */
export function campaignPlan({ seal, runtimeSealSha256, candidateId, controlsSha256, readySha256, hardwarePlanSha256, ready, now = Date.now() }) {
  validateRuntimeSeal(seal, { candidateId });
  if (![runtimeSealSha256, controlsSha256, readySha256, hardwarePlanSha256].every(value => HEX.test(value ?? ""))) throw fail("m1-campaign-plan-pin-invalid");
  const attempts = Array.from({ length: ACCEPTANCE_POLICY.repetitionsPerCandidateCase }, (_, index) => MODEL_CASES.map(item => ({
    caseId: item.id, role: item.role, repetition: index + 1, candidateId,
    attemptId: `${candidateId}--${item.id}--${index + 1}`,
  }))).flat();
  return { schemaVersion: "runaai-m1-candidate-batch-plan/v1", createdAt: new Date(now).toISOString(),
    sourceCommit: seal.sourceCommit, caseBundleSha256: CASE_BUNDLE_SHA256, runtimeSealSha256, controlsSha256,
    readySha256, hardwarePlanSha256, homeLeaseId: ready.leaseId, homeLeaseSealSha256: ready.sealSha256,
    candidateId, modelId: seal.candidates.find(value => value.candidateId === candidateId).modelId,
    roster: ACCEPTANCE_POLICY.roster.map(value => value.candidateId), plannedCampaignAttempts: 360,
    plannedCandidateAttempts: 120, attempts, maximumBatchMs: Math.min(3600000, seal.maximumBatchMs),
    independentSemanticReviewRequired: true, humanTrialRequired: true,
    modelLifecycleOwnedExternally: true, productionChanged: false, protectedDataRead: false };
}

export function qualifiedControlSuite(report, { sourceCommit, runtimeSealSha256 }) {
  if (report?.schemaVersion !== "runaai-m1-control-functional-run/v1" || report.sourceCommit !== sourceCommit
      || report.caseBundleSha256 !== CASE_BUNDLE_SHA256 || report.runtimeSealSha256 !== runtimeSealSha256
      || report.modelsInvoked !== false || report.productionChanged !== false || report.protectedDataRead !== false
      || !Array.isArray(report.attempts) || report.attempts.length !== CONTROL_CASES.length
      || new Set(report.attempts.map(value => value.caseId)).size !== CONTROL_CASES.length) throw fail("m1-campaign-controls-unqualified");
  const controls = CONTROL_CASES.map(item => {
    const observation = report.attempts.find(value => value.caseId === item.id);
    if (!observation || observation.sourceCommit !== sourceCommit || observation.runtimeSealSha256 !== runtimeSealSha256) throw fail("m1-campaign-controls-unbound");
    // Regrade raw proof. A report's completed count or authored 'passed' flag is
    // insufficient, even when its outer file hash was pinned by the operator.
    const grade = evaluateControl(item, observation, { runtimeSealSha256 });
    if (!grade.passed || grade.status !== "pass" || !same(grade, observation.grade)) throw fail("m1-campaign-controls-unqualified");
    return { controlId: item.id, grade, gradeSha256: digest(grade) };
  });
  return { sourceCommit, runtimeSealSha256, controls };
}

export function validateHomeReady(ready, hardwarePlan, { seal, candidateId, hardwarePlanSha256, now = Date.now() }) {
  const candidate = seal.candidates.find(value => value.candidateId === candidateId);
  const hardware = hardwarePlan?.candidates?.find(value => value.candidateId === candidateId);
  if (hardwarePlan?.schemaVersion !== "runa-m1-campaign-hardware-plan/v1" || hardwarePlan.createdBeforeLoads !== true
      || hardwarePlan.maximumConcurrentPrimaries !== 1 || hardwarePlan.productionRoutingChanged !== false
      || !candidate || !hardware || hardware.artifact?.key !== candidate.modelId || hardware.artifact.sha256 !== candidate.artifactSha256
      || hardware.artifact.bytes !== candidate.artifactBytes || hardwarePlan.auxiliary?.artifact?.sha256 !== seal.embedding.artifactSha256
      || seal.residency.telemetryPolicySha256 !== hardwarePlanSha256
      || !hardwarePlan.runtimeFiles?.some(value => value.sha256 === seal.runtime.modelRuntimeSha256)
      || ready?.schemaVersion !== "runa-m1-campaign-lease-ready/v1" || !HEX.test(ready.sealSha256 ?? "")
      || typeof ready.leaseId !== "string" || ready.leaseId.length > 160 || !ready.leaseId.includes("-campaign-")
      || ready.campaignHardwarePlanSha256 !== hardwarePlanSha256 || ready.candidateId !== hardware.id
      || ready.modelId !== candidate.modelId || ready.primaryArtifactSha256 !== candidate.artifactSha256
      || ready.embeddingModelId !== seal.embedding.modelId || ready.embeddingArtifactSha256 !== seal.embedding.artifactSha256
      || ![ready.primaryInstanceId, ready.embeddingInstanceId].every(value => typeof value === "string" && value.length > 0 && value.length < 201)
      || ready.primaryInstanceId === ready.embeddingInstanceId || ready.reasoningEffort !== hardware.requestReasoningEffort
      || Object.values(candidate.requestControls).some(value => value.reasoningEffort !== ready.reasoningEffort)
      || !within(ready.readyAt, now, 3600000) || !Number.isFinite(Date.parse(ready.expiresAt)) || Date.parse(ready.expiresAt) <= now
      || Date.parse(ready.expiresAt) - Date.parse(ready.readyAt) > 3600000) throw fail("m1-campaign-home-lease-invalid");
  return ready;
}

/** The mirror is an observation, never refreshed by assigning a local current
 * timestamp. Its hardware seal is intentionally distinct from the campaign seal. */
export function validateLiveHome(value, { ready, hardwarePlan, now = Date.now(), priorRegistryDigest = null }) {
  if (value?.schemaVersion !== "runaai-m1-campaign-live/v1" || !within(value.observedAt, now, 30000)
      || value.leaseId !== ready.leaseId || value.sealSha256 !== ready.sealSha256 || !same(value.ready, ready)
      || value.taskRunning !== true || value.workerAlive !== true || value.completionPresent !== false
      || Date.parse(ready.expiresAt) <= now) throw fail("m1-campaign-live-lease-unavailable");
  const telemetry = value.lastTelemetry, policy = hardwarePlan.policy;
  if (telemetry?.type !== "telemetry" || telemetry.phase !== "ready" || !within(telemetry.time, now, 30000)
      || !Number.isFinite(telemetry.gapMs) || telemetry.gapMs < 0 || telemetry.gapMs > 30000
      || !Number.isFinite(telemetry.freeMemoryBytes) || telemetry.freeMemoryBytes < 8589934592
      || !Array.isArray(telemetry.gpus) || telemetry.gpus.length !== 2 || !Array.isArray(policy?.gpuUuids) || policy.gpuUuids.length !== 2) throw fail("m1-campaign-telemetry-unavailable");
  for (const [index, gpu] of telemetry.gpus.entries()) {
    if (gpu.index !== index || gpu.uuid !== policy.gpuUuids[index] || gpu.name !== "Quadro RTX 6000" || gpu.memoryTotalMiB !== 23040
        || !Number.isFinite(gpu.memoryUsedMiB) || gpu.memoryUsedMiB < 0 || gpu.memoryTotalMiB - gpu.memoryUsedMiB < 1024
        || !Number.isFinite(gpu.temperatureC) || gpu.temperatureC >= 85 || gpu.powerLimitWatts !== 160) throw fail("m1-campaign-hardware-boundary-failed");
  }
  if (!Array.isArray(value.models)) throw fail("m1-campaign-residency-unavailable");
  const instances = [];
  for (const model of value.models) {
    if (typeof model.key !== "string" || !Array.isArray(model.loaded_instances)) throw fail("m1-campaign-residency-unavailable");
    for (const instance of model.loaded_instances) {
      if (typeof instance.id !== "string" || !instance.config || typeof instance.config !== "object") throw fail("m1-campaign-residency-unavailable");
      instances.push({ key: model.key, id: instance.id, config: instance.config });
    }
  }
  if (instances.length !== 2 || !instances.some(value => value.key === ready.modelId && value.id === ready.primaryInstanceId)
      || !instances.some(value => value.key === ready.embeddingModelId && value.id === ready.embeddingInstanceId)) throw fail("m1-campaign-unowned-residency");
  const registryDigest = digest(instances.toSorted((a, b) => a.key.localeCompare(b.key)));
  if (priorRegistryDigest !== null && priorRegistryDigest !== registryDigest) throw fail("m1-campaign-runtime-config-drift");
  return { registryDigest, observedAt: value.observedAt, telemetryAt: telemetry.time };
}

async function regularFile(file, maximumBytes) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximumBytes) throw fail("m1-campaign-input-file-invalid");
  return info;
}
async function ownedFile(root, filename, maximumBytes = 64 * 1024 * 1024) {
  const absolute = path.resolve(root, filename), relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw fail("m1-campaign-input-path-invalid");
  if (path.relative(await realpath(root), await realpath(absolute)) !== relative) throw fail("m1-campaign-input-reparse-invalid");
  await regularFile(absolute, maximumBytes); return absolute;
}
async function pinnedJson(root, filename, expected, maximumBytes) {
  const bytes = await readFile(await ownedFile(root, filename, maximumBytes));
  if (!HEX.test(expected ?? "") || sha256(bytes) !== expected) throw fail("m1-campaign-input-pin-mismatch");
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

/** Read-only git-archive verifier: compare every archived regular file against
 * its actual extracted bytes. No extraction, executable invocation or symlinks. */
export async function verifyExtractedArchive(root, filename, expectedSha256) {
  const info = await regularFile(filename, 512 * 1024 * 1024);
  if (info.size % 512 || await fileSha256(filename) !== expectedSha256) throw fail("m1-campaign-archive-pin-mismatch");
  const archive = await open(filename, "r"), seen = new Set(); let offset = 0, files = 0, localPath = null;
  const read = async (size, position) => { const out = Buffer.alloc(size); if ((await archive.read(out, 0, size, position)).bytesRead !== size) throw fail("m1-campaign-archive-truncated"); return out; };
  const field = bytes => bytes.toString("utf8").replace(/\0.*$/su, "");
  try {
    while (offset + 512 <= info.size) {
      const header = await read(512, offset); offset += 512;
      if (header.every(value => value === 0)) break;
      const rawSize = field(header.subarray(124, 136)).trim();
      if (!/^[0-7]+$/u.test(rawSize)) throw fail("m1-campaign-archive-format-invalid");
      const size = parseInt(rawSize, 8), type = String.fromCharCode(header[156] || 48);
      if (!Number.isSafeInteger(size) || size > 64 * 1024 * 1024 || offset + size > info.size) throw fail("m1-campaign-archive-format-invalid");
      const body = await read(size, offset); offset += Math.ceil(size / 512) * 512;
      if (["g", "x"].includes(type)) {
        if (size > 1048576) throw fail("m1-campaign-archive-format-invalid");
        for (const line of body.toString("utf8").split("\n").filter(Boolean)) {
          const match = /^\d+ ([^=]+)=(.*)$/u.exec(line);
          if (!match || !["comment", "path", "mtime", "atime", "ctime"].includes(match[1]) || match[1] === "path" && type !== "x") throw fail("m1-campaign-archive-pax-invalid");
          if (match[1] === "path") localPath = match[2];
        }
        continue;
      }
      const prefix = field(header.subarray(345, 500)), entry = localPath ?? `${prefix ? prefix + "/" : ""}${field(header.subarray(0, 100))}`;
      localPath = null;
      if (!entry || /[\\:\x00-\x1f]/u.test(entry) || entry.startsWith("/") || entry.split("/").some(part => part === "..") || !["0", "5"].includes(type)) throw fail("m1-campaign-archive-entry-invalid");
      if (type === "5") continue;
      if (seen.has(entry.toLowerCase())) throw fail("m1-campaign-archive-duplicate-entry"); seen.add(entry.toLowerCase());
      const actual = await ownedFile(root, entry, size);
      if ((await lstat(actual)).size !== size || await fileSha256(actual) !== sha256(body)) throw fail("m1-campaign-extracted-source-drift");
      files++;
    }
  } finally { await archive.close(); }
  if (!files || localPath) throw fail("m1-campaign-archive-empty");
  return { files, archiveSha256: expectedSha256, extractedBytesVerified: true };
}

export async function validateCampaignInputs(args) {
  const root = assertOwnedStage(args["owned-root"]);
  if (process.platform !== "win32" || path.resolve(fileURLToPath(new URL("../../..", import.meta.url))).toLowerCase() !== root.toLowerCase()
      || (await realpath(root)).toLowerCase() !== root.toLowerCase()) throw fail("m1-campaign-execution-root-mismatch");
  const sealed = await pinnedJson(root, args["runtime-seal"], args["runtime-seal-sha256"], 1048576);
  const seal = validateRuntimeSeal(sealed.value, { sourceCommit: args["source-commit"], candidateId: args["candidate-id"] });
  const identity = JSON.parse(await readFile(await ownedFile(root, "SOURCE-IDENTITY.json", 65536), "utf8"));
  if (identity.sourceCommit !== seal.sourceCommit || identity.caseBundleSha256 !== CASE_BUNDLE_SHA256 || identity.sourceArchiveSha256 !== seal.runtime.sourceArchiveSha256
      || await fileSha256(process.execPath) !== seal.runtime.nodeSha256 || await fileSha256(await ownedFile(root, "package-lock.json")) !== seal.runtime.packageLockSha256) throw fail("m1-campaign-source-runtime-mismatch");
  const qdrant = await ownedFile(root, "tools/qdrant/bin/qdrant.exe", QDRANT_PIN.bytes);
  if ((await lstat(qdrant)).size !== QDRANT_PIN.bytes || await fileSha256(qdrant) !== seal.runtime.qdrantSha256) throw fail("m1-campaign-qdrant-pin-mismatch");
  const archiveProof = await verifyExtractedArchive(root, await ownedFile(root, "source.tar", 512 * 1024 * 1024), seal.runtime.sourceArchiveSha256);
  const expectedSuites = Object.fromEntries(MODEL_CASES.flatMap(item => (item.setup.suites ?? []).map(value => [value.suiteId, digest(value)])));
  if (!same(seal.suites, expectedSuites)) throw fail("m1-campaign-fixed-suite-pin-mismatch");
  const controls = await pinnedJson(root, args.controls, args["controls-sha256"]);
  const qualification = qualifiedControlSuite(controls.value, { sourceCommit: seal.sourceCommit, runtimeSealSha256: args["runtime-seal-sha256"] });
  const hardware = await pinnedJson(root, args["hardware-plan"], args["hardware-plan-sha256"], 1048576);
  const readyInput = await pinnedJson(root, args["home-ready"], args["home-ready-sha256"], 65536);
  const ready = validateHomeReady(readyInput.value, hardware.value, { seal, candidateId: args["candidate-id"], hardwarePlanSha256: args["hardware-plan-sha256"] });
  const homeStatus = await ownedFile(root, args["home-status"], 2 * 1024 * 1024);
  return { root, seal, runtimeSealSha256: args["runtime-seal-sha256"], candidateId: args["candidate-id"], ready,
    hardwarePlan: hardware.value, qualification, archiveProof, homeStatus,
    inputs: { runtimeSeal: sealed, controls, hardwarePlan: hardware, homeReady: readyInput },
    plan: campaignPlan({ seal, runtimeSealSha256: args["runtime-seal-sha256"], candidateId: args["candidate-id"], ready,
      controlsSha256: args["controls-sha256"], readySha256: args["home-ready-sha256"], hardwarePlanSha256: args["hardware-plan-sha256"] }) };
}

export async function createCampaignWriter(directory, plan) {
  // mkdir without recursive and wx writes intentionally refuse resumed or
  // colliding batches. An interrupted attempt can never be silently replaced.
  await mkdir(directory, { recursive: false });
  const write = async (name, value) => { const bytes = Buffer.isBuffer(value) ? value : json(value);
    if (bytes.length > 64 * 1024 * 1024 || !/^[a-zA-Z0-9_.-]{1,220}$/u.test(name)) throw fail("m1-campaign-export-invalid");
    const file = await open(path.join(directory, name), "wx");
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    return { file: name, sha256: sha256(bytes), bytes: bytes.length };
  };
  await write("plan.json", plan);
  return {
    write,
    async started(slot, value) { return write(`${slot.attemptId}.started.json`, value); },
    async finished(slot, observation, grade, unresolved) {
      const evidence = await write(`${slot.attemptId}.json`, { ...observation, grade, unresolved });
      await write(`${slot.attemptId}.record.json`, { attemptId: slot.attemptId, ...evidence, status: observation.status,
        preliminaryGrade: grade.status, independentSemanticReviewPending: true });
      return evidence;
    },
  };
}

export function needsBrowserCheckpoint({ client, stage, action }) {
  const id = client.item.id;
  if (stage === "before-native-dispatch") return id === "agent-05-cancel-drain";
  if (stage === "reload-and-list") return true;
  if (stage === "in-flight") return id === "agent-05-cancel-drain";
  if (stage === "unknown") return id === "agent-06-crash-reconcile";
  if (stage !== "after-action") return false;
  return id === "code-08-owned-restore" && action?.action === "tests.run-restored"
    || id === "agent-01-safe-auto" && action?.action === "project.verify-independent"
    || id === "agent-04-revoked-plan" && action?.action === "run.resume-original";
}

export function createCampaignActionExtensions({ faultActions, checkpoint }) {
  return { ...faultActions,
    "run.start": async (client, action) => {
      if (client.item.id === "agent-05-cancel-drain") {
        const prepared = await checkpoint({ client, phase: client.ledger.phase, stage: "before-native-dispatch" });
        if (prepared?.preparationOnly !== true || prepared.scope?.principalId !== client.principalId
            || prepared.scope.projectId !== client.projectId || prepared.scope.taskId !== client.task?.taskId) throw fail("m1-campaign-browser-not-prepared");
      }
      return faultActions["run.start"](client, action);
    },
    "browser.reload-and-list": async client => {
      const before = client.ledger.observation.evidence.filter(value => value.source === "browser").length;
      await checkpoint({ client, phase: client.ledger.phase, stage: "reload-and-list" });
      if (client.ledger.observation.evidence.filter(value => value.source === "browser").length <= before) throw fail("m1-campaign-browser-reload-unproven");
    },
  };
}

/** Serialization is explicit and independently unit tested. Tests may inject a
 * deterministic runAttempt, which is never used by the production CLI. */
export async function executeCandidateAttempts({ plan, writer, runAttempt, beforeAttempt, signal, announce = () => {} }) {
  if (plan.attempts.length !== 120 || new Set(plan.attempts.map(value => value.attemptId)).size !== 120) throw fail("m1-campaign-plan-incomplete");
  const records = [], remaining = () => plan.attempts.slice(records.length).map(value => value.attemptId);
  let stopCode = null;
  for (const slot of plan.attempts) {
    if (signal.aborted) { stopCode = safeCode(abortError(signal)); break; }
    try { await beforeAttempt(slot); } catch (error) { stopCode = safeCode(error); break; }
    await writer.started(slot, { ...slot, runtimeSealSha256: plan.runtimeSealSha256, startedAt: stamp(), finished: false });
    let result;
    try { result = await runAttempt(slot); }
    catch (error) {
      const observation = newObservation(MODEL_CASES.find(value => value.id === slot.caseId), { ...slot, runtimeSealSha256: plan.runtimeSealSha256 });
      observation.sourceCommit = plan.sourceCommit; observation.status = signal.aborted ? "interrupted" : "failed";
      observation.finishedAt = stamp(); observation.failures.push({ phase: "runner", errorCode: safeCode(error) });
      result = { observation, grade: evaluateAttempt(slot.caseId, observation, { expectedModelId: plan.modelId, runtimeSealSha256: plan.runtimeSealSha256 }), unresolved: [] };
    }
    const { observation, grade, unresolved = [] } = result;
    if (observation.caseId !== slot.caseId || observation.candidateId !== slot.candidateId || observation.repetition !== slot.repetition
        || observation.runtimeSealSha256 !== plan.runtimeSealSha256) throw fail("m1-campaign-attempt-binding-invalid");
    const exported = await writer.finished(slot, observation, grade, unresolved);
    records.push({ ...slot, ...exported, status: observation.status, preliminaryGrade: grade.status,
      passed: grade.passed, providerCalls: observation.provider.calls.length, nativeCalls: observation.native.calls.length });
    announce({ schemaVersion: "runaai-m1-campaign-progress/v1", candidateId: plan.candidateId, completedAttempts: records.length,
      plannedCandidateAttempts: 120, caseId: slot.caseId, repetition: slot.repetition, status: observation.status,
      preliminaryGrade: grade.status, independentSemanticReviewPending: true });
    if (observation.productionChanged !== false || observation.protectedDataRead !== false || grade.criticalProductFailures.length
        || observation.provider.unexpectedCalls.some(value => ["m1-capture-model-mismatch", "m1-sealed-wire-setting-mismatch", "m1-capture-route-denied"].includes(value.errorCode))) {
      stopCode = "m1-campaign-containment-failure"; break;
    }
    if (signal.aborted) { stopCode = safeCode(abortError(signal)); break; }
  }
  return { schemaVersion: "runaai-m1-candidate-batch-result/v1", candidateId: plan.candidateId,
    sourceCommit: plan.sourceCommit, runtimeSealSha256: plan.runtimeSealSha256, caseBundleSha256: CASE_BUNDLE_SHA256,
    plannedCampaignAttempts: 360, plannedCandidateAttempts: 120, recordedAttempts: records.length, attempts: records,
    notExecuted: remaining(), stopCode, denominatorChanged: false, productQualificationPassed: false,
    independentSemanticReviewPending: true, humanTrialRequired: true, productionChanged: false, protectedDataRead: false };
}

export async function runModelCampaign(args, { checkpoint = null, getLeaseObservation = null, announce = () => {} } = {}) {
  if (args.mode === "inventory") { const faults = createFaultActions(); try { return { ...inventory([...Object.keys(faults.actions), "browser.reload-and-list"]),
    scoredCliEnabled: true, runtimeSealRequired: true, controlsMustPass: 12, externalHomeLeaseRequired: true,
    qualificationClaim: "Driver availability is not a model or product acceptance result." }; } finally { faults.close(); } }
  const inputs = await validateCampaignInputs(args), { root, seal, ready, plan, qualification } = inputs;
  const output = path.join(root, "acceptance-evidence"); await mkdir(output, { recursive: true });
  if ((await realpath(output)) !== path.join(await realpath(root), "acceptance-evidence")) throw fail("m1-campaign-output-reparse-invalid");
  const directory = path.join(output, `campaign-${plan.candidateId}-${plan.runtimeSealSha256.slice(0, 16)}`);
  const writer = await createCampaignWriter(directory, plan);
  for (const [name, value] of Object.entries(inputs.inputs)) await writer.write(`${name}.json`, value.bytes);
  await writer.write("archive-proof.json", inputs.archiveProof);
  const controller = new AbortController(), { signal } = controller;
  const maximumMs = Math.min(plan.maximumBatchMs, Date.parse(ready.expiresAt) - Date.now());
  if (maximumMs < 1000) throw fail("m1-campaign-home-lease-expired");
  let resources, testbed, worker, ledger = null, registryDigest = null, monitoring = false, cleanupPromise = Promise.resolve(), faults, result;
  const closedResources = new Set();
  const readLease = getLeaseObservation ?? (async () => { await regularFile(inputs.homeStatus, 2 * 1024 * 1024); return JSON.parse(await readFile(inputs.homeStatus, "utf8")); });
  const checkLease = async (record = false) => {
    const capturedLedger = ledger;
    let readTimer;
    const raw = await Promise.race([readLease(), new Promise((_, reject) => { readTimer = setTimeout(() => reject(fail("m1-campaign-live-probe-timeout")), 5000); })])
      .finally(() => clearTimeout(readTimer));
    const checked = validateLiveHome(raw, { ready, hardwarePlan: inputs.hardwarePlan, priorRegistryDigest: registryDigest });
    registryDigest ??= checked.registryDigest;
    if (signal.aborted) throw abortError(signal);
    if (record === true && capturedLedger === ledger && ledger?.observation.status === "running") ledger.evidence("host-runtime", "home-hardware-observation", raw);
    return checked;
  };
  const stop = code => { if (!signal.aborted) controller.abort(fail(code)); };
  const cleanup = () => cleanupPromise = cleanupPromise.catch(() => {}).then(async () => {
    faults?.close();
    const failures = [];
    for (const resource of [worker, testbed, resources]) {
      if (!resource || closedResources.has(resource)) continue;
      try { await resource.close(); closedResources.add(resource); } catch (error) { failures.push(safeCode(error)); }
    }
    if (failures.length) throw fail("m1-campaign-owned-cleanup-failed");
  });
  const timer = setTimeout(() => stop("m1-campaign-deadline"), maximumMs);
  const monitor = setInterval(() => {
    if (monitoring || signal.aborted) return; monitoring = true;
    checkLease().catch(error => stop(safeCode(error))).finally(() => { monitoring = false; });
  }, 5000);
  signal.addEventListener("abort", () => { cleanup().catch(() => {}); }, { once: true });
  const onSignal = () => stop("m1-campaign-operator-stop"); process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  try {
    await checkLease();
    resources = await createOwnedControlResources({ root, maximumMs });
    if (signal.aborted) throw abortError(signal);
    const controllerFaults = new AcceptanceFaultController({ getLedger: () => ledger });
    testbed = await createFunctionalTestbed({ resources, mode: "scored", seal, candidateId: plan.candidateId,
      getLedger: () => ledger, faults: controllerFaults, taskHooks: controllerFaults.taskHooks });
    if (signal.aborted) throw abortError(signal);
    const bridge = checkpoint ?? createBrowserCheckpoint({ directory, signal, announce: value => announce({ schemaVersion: "runaai-m1-browser-checkpoint-ready/v1", ...value }) });
    const observe = async value => { if (signal.aborted) throw abortError(signal);
      const result = needsBrowserCheckpoint(value) ? await bridge(value) : undefined;
      if (signal.aborted) throw abortError(signal); return result; };
    result = await executeCandidateAttempts({ plan, writer, signal, announce, beforeAttempt: checkLease,
      runAttempt: async slot => {
        ledger = new ObservationLedger(newObservation(MODEL_CASES.find(value => value.id === slot.caseId), { ...slot, runtimeSealSha256: plan.runtimeSealSha256 }));
        ledger.observation.sourceCommit = plan.sourceCommit;
        await checkLease(true);
        faults = createFaultActions({ checkpoint: observe });
        const extensions = createCampaignActionExtensions({ faultActions: faults.actions, checkpoint: observe });
        let host = testbed.host, journey;
        try {
          if (slot.caseId === "agent-06-crash-reconcile") {
            worker = await startApplicationFaultWorker({ initialization: testbed.workerInit, getLedger: () => ledger, maximumLifetimeMs: Math.min(600000, maximumMs) });
            worker.faults = testbed.host.faults; host = worker;
          }
          journey = new FunctionalHttpJourney({ host, item: MODEL_CASES.find(value => value.id === slot.caseId), ledger,
            identitySeed: `${plan.runtimeSealSha256}/${slot.attemptId}`, extensionActions: extensions,
            checkpoint: async value => { if (signal.aborted) throw abortError(signal); await checkLease(true); await observe(value); } });
          await journey.runCase();
        } catch (error) {
          ledger.observation.status = signal.aborted ? "interrupted" : "failed";
          ledger.observation.failures.push({ phase: ledger.phase, errorCode: safeCode(error) });
        } finally {
          const settling = faults.drain(); faults.close();
          try {
            await settling;
            await Promise.all(Object.values(testbed.transports).map(transport => transport.drain({ maximumMs: 10000 })));
            // Final proof is refreshed only after the actual in-flight work has
            // drained, so a late callback cannot change a frozen attempt record.
            if (!signal.aborted && journey?.projectId) {
              if (journey.task) await journey.recordState();
              await journey.captureFinalProof();
            }
          } catch (error) {
            ledger.observation.status = "failed";
            ledger.observation.failures.push({ phase: "attempt-drain", errorCode: safeCode(error) });
            stop("m1-campaign-attempt-undrained");
            await cleanup().catch(() => {});
          }
          faults = null;
          try { await worker?.close(); } catch (error) { ledger.observation.failures.push({ phase: "worker-cleanup", errorCode: safeCode(error) }); }
          worker = null;
          controllerFaults.clear(); testbed.host.faults.setIndexUnavailable(false);
          if (signal.aborted) { ledger.observation.status = "interrupted"; ledger.observation.failures.push({ phase: "runner", errorCode: safeCode(abortError(signal)) }); }
          ledger.observation.finishedAt = stamp();
        }
        ledger.evidence("host-runtime", "qualified-control-suite", qualification);
        const reduction = populateAttemptChecks(slot.caseId, ledger);
        const grade = evaluateAttempt(slot.caseId, ledger.observation, { expectedModelId: plan.modelId,
          runtimeSealSha256: plan.runtimeSealSha256, evaluatorId: seal.evaluatorId });
        return { observation: ledger.observation, grade, unresolved: reduction.unresolved };
      } });
  } catch (error) {
    result = { schemaVersion: "runaai-m1-candidate-batch-error/v1", sourceCommit: plan.sourceCommit,
      runtimeSealSha256: plan.runtimeSealSha256, candidateId: plan.candidateId, errorCode: safeCode(error),
      plannedCampaignAttempts: 360, plannedCandidateAttempts: 120, productQualificationPassed: false,
      preserveAllStartedMarkersAndExports: true, productionChanged: false, protectedDataRead: false };
  } finally {
    clearTimeout(timer); clearInterval(monitor); process.removeListener("SIGINT", onSignal); process.removeListener("SIGTERM", onSignal);
    try { await cleanup(); } catch (error) { result.cleanupError = safeCode(error); }
    result.finishedAt = stamp(); result.evidenceDirectory = path.relative(root, directory).replaceAll("\\", "/");
    await writer.write("result.json", result);
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseCampaignArguments(process.argv.slice(2));
    const result = await runModelCampaign(args, { announce: value => process.stdout.write(JSON.stringify(value) + "\n") });
    const safe = args.mode === "inventory" ? result : { schemaVersion: result.schemaVersion, candidateId: result.candidateId,
      recordedAttempts: result.recordedAttempts ?? null, plannedCandidateAttempts: 120, plannedCampaignAttempts: 360,
      notExecuted: result.notExecuted?.length ?? null, stopCode: result.stopCode ?? result.errorCode ?? null,
      cleanupError: result.cleanupError ?? null, evidenceDirectory: result.evidenceDirectory,
      productQualificationPassed: false, independentSemanticReviewPending: true, productionChanged: false };
    process.stdout.write(JSON.stringify(safe) + "\n");
    if (result.errorCode || result.stopCode || result.cleanupError) process.exitCode = 1;
  } catch (error) { process.stdout.write(JSON.stringify({ schemaVersion: "runaai-m1-campaign-error/v1", errorCode: safeCode(error),
    productQualificationPassed: false, productionChanged: false }) + "\n"); process.exitCode = 1; }
}
