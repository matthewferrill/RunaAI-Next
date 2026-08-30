import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ACCEPTANCE_POLICY, MODEL_CASES, CONTROL_CASES, CASE_BUNDLE_SHA256 } from "./cases.mjs";
import { QDRANT_PIN, sha256, newObservation } from "./runner-contract.mjs";
import { enumerateCaseChecks, evaluateAttempt, evaluateControl } from "./assertions.mjs";
import { AGENT05_IN_FLIGHT_OBSERVATION_MS } from "./browser-checkpoint.mjs";
import { AGENT05_POST_RECEIPT_HOLD_MS } from "./fault-actions.mjs";
import { parseCampaignArguments, campaignPlan, qualifiedControlSuite, validateHomeReady, validateLiveHome,
  verifyExtractedArchive, createCampaignWriter, needsBrowserCheckpoint, createCampaignActionExtensions, executeCandidateAttempts, runModelCampaign } from "./run-model-campaign.mjs";

// These are deliberately model-free unit fixtures. They test the runner's
// serialization, immutable evidence and fail-closed contracts, not acceptance.
const hash = "a".repeat(64), hardwareHash = "d".repeat(64), runtimeHash = "e".repeat(64), sourceCommit = "b".repeat(40);

test("Control staging exports source with checkout conversion disabled", async () => {
  const source = await readFile(new URL("./Prepare-ControlFunctionalStage.ps1", import.meta.url), "utf8");
  assert.match(source, /git -c core\.autocrlf=false -C \$repo archive --format=tar --output=\$archive \$SourceCommit/u);
  assert.doesNotMatch(source, /\ngit -C \$repo archive/u);
});

const candidateId = "gemma4-26b-a4b";
const now = Date.parse("2026-08-28T18:00:00.000Z");
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const digest = value => sha256(JSON.stringify(stable(value)));
function sealFixture() {
  return { schemaVersion: "runaai-m1-functional-runtime-seal/v3", sourceCommit, caseBundleSha256: CASE_BUNDLE_SHA256,
    runtime: { nodeSha256: hash, sourceArchiveSha256: hash, packageLockSha256: hash, qdrantSha256: QDRANT_PIN.sha256,
      modelRuntimeSha256: runtimeHash, modelRuntimeVersion: "synthetic-unit-fixture" },
    candidates: ACCEPTANCE_POLICY.roster.map(value => ({ candidateId: value.candidateId, modelId: value.candidateId,
      artifactSha256: hash, artifactBytes: 123, requestControls: Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role => [role, { reasoningEffort: "none" }])) })),
    roles: Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role => [role, { maximumOutputTokens: ["code", "agent"].includes(role) ? 1536 : 512,
      maximumContextTokens: 32768, deadlineMs: ["code", "agent"].includes(role) ? 30000 : 60000 }])),
    providerBaseUrl: "http://127.0.0.1:9770/v1", embedding: { baseUrl: "http://127.0.0.1:9770/v1", modelId: "text-embedding-nomic-embed-text-v1.5", artifactSha256: hash },
    reranker: { baseUrl: "http://127.0.0.1:8412", artifactSha256: hash, windowCharacters: 2000, overlapCharacters: 300, batchSize: 32 },
    residency: { oneLargeModelAtATime: true, readinessEvidenceSha256: hash, effectiveReasoningEvidenceSha256: hash, telemetryPolicySha256: hardwareHash },
    suites: Object.fromEntries(MODEL_CASES.flatMap(value => (value.setup.suites ?? []).map(item => [item.suiteId, digest(item)]))),
    qualificationCriteria: { schemaVersion: "runaai-m1-r7-qualification-criteria/v1",
      path: "gate7f/function-first/M1-S2-R7-CORRECTIVE-CRITERIA-2026-08-30.md", sha256: hash, normalizedSha256: hash,
      rubricVersion: "2026-08-30.r7-function-contract" },
    evaluatorId: "independent-fixture", maximumBatchMs: 3600000, productionRoutingChanged: false };
}
function hardwareFixture() {
  return { schemaVersion: "runa-m1-campaign-hardware-plan/v1", createdBeforeLoads: true, maximumConcurrentPrimaries: 1,
    productionRoutingChanged: false, candidates: [{ candidateId, id: "gemma", artifact: { key: candidateId, sha256: hash, bytes: 123 }, requestReasoningEffort: "none" }],
    auxiliary: { artifact: { sha256: hash } }, runtimeFiles: [{ sha256: runtimeHash }], policy: { gpuUuids: ["gpu-zero", "gpu-one"] } };
}
function readyFixture() {
  return { schemaVersion: "runa-m1-campaign-lease-ready/v1", leaseId: "synthetic-campaign-gemma-r1", sealSha256: hash,
    campaignHardwarePlanSha256: hardwareHash, candidateId: "gemma", modelId: candidateId, primaryInstanceId: "instance-primary",
    primaryArtifactSha256: hash, embeddingModelId: "text-embedding-nomic-embed-text-v1.5", embeddingInstanceId: "instance-embedding",
    embeddingArtifactSha256: hash, readyAt: new Date(now - 5000).toISOString(), expiresAt: new Date(now + 3590000).toISOString(), reasoningEffort: "none" };
}
function liveFixture() {
  const ready = readyFixture();
  return { schemaVersion: "runaai-m1-campaign-live/v1", observedAt: new Date(now - 1000).toISOString(), leaseId: ready.leaseId,
    sealSha256: ready.sealSha256, ready, taskRunning: true, workerAlive: true, completionPresent: false,
    lastTelemetry: { type: "telemetry", phase: "ready", time: new Date(now - 2000).toISOString(), gapMs: 5000, freeMemoryBytes: 12 * 1024 ** 3,
      gpus: ["gpu-zero", "gpu-one"].map((uuid, index) => ({ index, uuid, name: "Quadro RTX 6000", memoryTotalMiB: 23040,
        memoryUsedMiB: 21000, temperatureC: 70, powerLimitWatts: 160 })) },
    models: [{ key: ready.modelId, loaded_instances: [{ id: ready.primaryInstanceId, config: { context_length: 32768 } }] },
      { key: ready.embeddingModelId, loaded_instances: [{ id: ready.embeddingInstanceId, config: { context_length: 2048 } }] }] };
}
const homeOptions = () => ({ seal: sealFixture(), candidateId, hardwarePlanSha256: hardwareHash, now });
const liveOptions = () => ({ ready: readyFixture(), hardwarePlan: hardwareFixture(), now });
const planFixture = () => campaignPlan({ seal: sealFixture(), runtimeSealSha256: hash, candidateId, controlsSha256: hash,
  readySha256: hash, hardwarePlanSha256: hardwareHash, ready: readyFixture(), now });
const argsFixture = () => ["--mode", "scored", "--owned-root", "C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-" + "a".repeat(32),
  "--source-commit", sourceCommit, "--runtime-seal", "seal.json", "--runtime-seal-sha256", hash, "--controls", "controls.json", "--controls-sha256", hash,
  "--candidate-id", candidateId, "--home-ready", "ready.json", "--home-ready-sha256", hash, "--hardware-plan", "hardware.json",
  "--hardware-plan-sha256", hardwareHash, "--home-status", "live.json", "--browser-checkpoints", "true"];
async function temporary(t) {
  const root = await mkdtemp(path.join(tmpdir(), "runa-m1-campaign-"));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(tmpdir())); assert.match(path.basename(root), /^runa-m1-campaign-/u); await rm(root, { recursive: true, force: true }); });
  return root;
}
function controlReport() {
  const sourceFor = prefix => ({ context: "application", continuity: "postgresql", rawRows: "postgresql", envelope: "postgresql",
    restart: "postgresql", outsideRoot: "host-filesystem", ui: "browser" })[prefix] ?? "host-runtime";
  const attempts = CONTROL_CASES.map(item => {
    const value = newObservation({ ...item, role: "control" }, { runtimeSealSha256: hash }); value.sourceCommit = sourceCommit; value.status = "completed";
    for (const [index, check] of enumerateCaseChecks(item).entries()) {
      const id = `unit-proof-${index}`;
      value.evidence.push({ id, source: sourceFor(check.kind.split(".")[0]), kind: check.kind, data: { actual: check.expected } });
      value.checks.push({ checkId: check.checkId, kind: check.kind, actual: check.expected, evidenceRefs: [{ id, pointer: "/actual" }] });
    }
    value.grade = evaluateControl(item, value, { runtimeSealSha256: hash }); assert.equal(value.grade.passed, true, item.id);
    return value;
  });
  return { schemaVersion: "runaai-m1-control-functional-run/v1", sourceCommit, caseBundleSha256: CASE_BUNDLE_SHA256,
    runtimeSealSha256: hash, modelsInvoked: false, productionChanged: false, protectedDataRead: false, attempts };
}

test("inventory names all40drivers and360slots without inferring qualification", async () => {
  const result = await runModelCampaign(parseCampaignArguments([]));
  assert.equal(result.readyCases, 40); assert.equal(result.plannedAttempts, 360); assert.equal(result.productQualificationPassed, false);
});
test("CLI requires exact pinned inputs and browser proof; no subset/resume/lifecycle switches", () => {
  assert.equal(parseCampaignArguments(argsFixture()).mode, "scored");
  for (const extra of [["--case-id", "chat-01"], ["--resume", "true"], ["--load-model", "true"], ["--mode", "scored"]]) {
    assert.throws(() => parseCampaignArguments([...argsFixture(), ...extra]));
  }
  assert.throws(() => parseCampaignArguments(["--mode", "scored"]), /required-input/u);
  const invalid = argsFixture(); invalid[invalid.indexOf("--controls-sha256") + 1] = "invalid"; assert.throws(() => parseCampaignArguments(invalid), /digest/u);
});
test("fixedplan retains threecandidate360denominator and120uniqueorderedslots", () => {
  const plan = planFixture(); assert.equal(plan.attempts.length, 120); assert.equal(plan.plannedCampaignAttempts, 360);
  assert.equal(plan.roster.length, 3); assert.equal(new Set(plan.attempts.map(value => value.attemptId)).size, 120);
  for (const role of ACCEPTANCE_POLICY.roles) assert.equal(plan.attempts.filter(value => value.role === role).length, 24);
  assert.deepEqual(plan.attempts.map(value => value.repetition), [...Array(40).fill(1), ...Array(40).fill(2), ...Array(40).fill(3)]);
});
test("actualrawcontrolproof is regraded, not drivercompleted or forgedpassed", () => {
  const report = controlReport(); const result = qualifiedControlSuite(report, { sourceCommit, runtimeSealSha256: hash }); assert.equal(result.controls.length, 12);
  const copy = structuredClone(report); copy.attempts[0].checks[0].actual = true;
  assert.throws(() => qualifiedControlSuite(copy, { sourceCommit, runtimeSealSha256: hash }), /unqualified/u);
  assert.throws(() => qualifiedControlSuite(report, { sourceCommit, runtimeSealSha256: runtimeHash }), /unqualified/u);
  const duplicate = structuredClone(report); duplicate.attempts[1] = duplicate.attempts[0]; assert.throws(() => qualifiedControlSuite(duplicate, { sourceCommit, runtimeSealSha256: hash }));
});
test("hardwareREADYbindsrealcandidateartifactcontrolsandhardwareplan, notcommonseal", () => {
  validateHomeReady(readyFixture(), hardwareFixture(), homeOptions());
  for (const mutate of [v => v.primaryArtifactSha256 = runtimeHash, v => v.reasoningEffort = null, v => v.modelId = "other",
    v => v.expiresAt = new Date(now).toISOString(), v => v.campaignHardwarePlanSha256 = runtimeHash]) {
    const ready = readyFixture(); mutate(ready); assert.throws(() => validateHomeReady(ready, hardwareFixture(), homeOptions()));
  }
  const option = homeOptions(); option.seal.candidates[0].requestControls.code.reasoningEffort = null;
  assert.throws(() => validateHomeReady(readyFixture(), hardwareFixture(), option));
});
test("livehardware mirror requiresactualfreshtelemetry andexacttwo ownedinstances", () => {
  const first = validateLiveHome(liveFixture(), liveOptions()); assert.match(first.registryDigest, /^[a-f0-9]{64}$/u);
  for (const mutate of [v => v.observedAt = new Date(now - 31000).toISOString(), v => v.lastTelemetry.time = new Date(now - 31000).toISOString(),
    v => v.lastTelemetry.time = new Date(now + 5000).toISOString(), v => v.lastTelemetry.phase = "cleanup", v => v.workerAlive = false,
    v => v.completionPresent = true, v => v.models[0].loaded_instances[0].id = "foreign",
    v => v.models.push({ key: "unowned", loaded_instances: [{ id: "third", config: {} }] })]) {
    const live = liveFixture(); mutate(live); assert.throws(() => validateLiveHome(live, liveOptions()));
  }
  const changed = liveFixture(); changed.models[0].loaded_instances[0].config.context_length = 8192;
  assert.throws(() => validateLiveHome(changed, { ...liveOptions(), priorRegistryDigest: first.registryDigest }), /config-drift/u);
});
test("hardware caps failclosed foreach GPU plus hostmemory andsamplegap", () => {
  for (const mutate of [v => v.lastTelemetry.freeMemoryBytes = 7 * 1024 ** 3, v => v.lastTelemetry.gapMs = 30001,
    v => v.lastTelemetry.gpus[1].temperatureC = 85, v => v.lastTelemetry.gpus[0].powerLimitWatts = 260,
    v => v.lastTelemetry.gpus[0].memoryUsedMiB = 22500, v => v.lastTelemetry.gpus[0].uuid = "wrong"] ) {
    const value = liveFixture(); mutate(value); assert.throws(() => validateLiveHome(value, liveOptions()));
  }
});
test("browser checkpoints select realpending/cancel/unknown/finalstates only", () => {
  const check = (id, stage, action) => needsBrowserCheckpoint({ client: { item: { id } }, stage, action: { action } });
  assert.equal(check("agent-03-ask-every-time", "after-action", "login.fresh"), false);
  assert.equal(check("agent-03-ask-every-time", "reload-and-list"), true);
  assert.equal(check("agent-05-cancel-drain", "in-flight"), true);
  assert.equal(check("agent-05-cancel-drain", "before-native-dispatch"), true);
  assert.equal(check("agent-06-crash-reconcile", "unknown"), true);
  assert.equal(check("agent-04-revoked-plan", "after-action", "run.resume-original"), true);
  assert.equal(check("code-08-owned-restore", "after-action", "tests.run-restored"), true);
});
test("Agent05 browser observation overlaps one finite post-receipt hold inside the application route", () => {
  const plannerDeadlineMs = sealFixture().roles.agent.deadlineMs, sandboxProcessCeilingMs = 2000, applicationRouteMs = 60000;
  assert.equal(AGENT05_IN_FLIGHT_OBSERVATION_MS, 20000); assert.equal(AGENT05_POST_RECEIPT_HOLD_MS, 25000);
  assert.ok(AGENT05_IN_FLIGHT_OBSERVATION_MS < AGENT05_POST_RECEIPT_HOLD_MS);
  assert.ok(plannerDeadlineMs + sandboxProcessCeilingMs + AGENT05_POST_RECEIPT_HOLD_MS < applicationRouteMs);
});
test("cancel run does not arm its native hold until ungraded browser preparation completes", async () => {
  const events = [], client = { item: { id: "agent-05-cancel-drain" }, principalId: "owner", projectId: "project", task: { taskId: "task" }, ledger: { phase: "run" } };
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const extensions = createCampaignActionExtensions({ faultActions: { async "run.start"() { events.push("native-hold-armed"); } },
    async checkpoint(value) { assert.equal(value.stage, "before-native-dispatch"); events.push("browser-preparing"); await gate;
      events.push("browser-ready"); return { preparationOnly: true, scope: { principalId: "owner", projectId: "project", taskId: "task" } }; } });
  const running = extensions["run.start"](client, {}); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ["browser-preparing"]); release(); await running;
  assert.deepEqual(events, ["browser-preparing", "browser-ready", "native-hold-armed"]);
});
test("failed or mismatched browser prep cannot dispatch; non-timed cases keep ordinary flow", async () => {
  let calls = 0, checkpoints = 0;
  const extensions = createCampaignActionExtensions({ faultActions: { async "run.start"() { calls++; } },
    async checkpoint() { checkpoints++; return { preparationOnly: false }; } });
  await assert.rejects(extensions["run.start"]({ item: { id: "agent-05-cancel-drain" }, ledger: { phase: "run" } }, {}), /not-prepared/u);
  assert.equal(calls, 0);
  await extensions["run.start"]({ item: { id: "agent-06-crash-reconcile" } }, {});
  assert.equal(calls, 1); assert.equal(checkpoints, 1);
});

function tar(entries) {
  const chunks = [];
  for (const [name, content, type = "0"] of entries) {
    const bytes = Buffer.from(content), header = Buffer.alloc(512);
    header.write(name); header.write("0000644\0", 100); header.write(bytes.length.toString(8).padStart(11, "0") + "\0", 124);
    header[156] = type.charCodeAt(0); chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return Buffer.concat([...chunks, Buffer.alloc(1024)]);
}
test("archiveverification hashesactualextractedbytes without extracting orrunningfiles", async t => {
  const root = await temporary(t), archive = tar([["file.mjs", "export const n=42;\n"]]);
  await writeFile(path.join(root, "source.tar"), archive); await writeFile(path.join(root, "file.mjs"), "export const n=42;\n");
  assert.equal((await verifyExtractedArchive(root, path.join(root, "source.tar"), sha256(archive))).files, 1);
  await writeFile(path.join(root, "file.mjs"), "export const n=43;\n");
  await assert.rejects(verifyExtractedArchive(root, path.join(root, "source.tar"), sha256(archive)), /source-drift/u);
});
test("archive rejects escapes andnonregularentries before filesystemread", async t => {
  const root = await temporary(t);
  for (const entry of [["../outside", "data"], ["C:/outside", "data"], ["link", "target", "2"]]) {
    const bytes = tar([entry]); await writeFile(path.join(root, "bad.tar"), bytes);
    await assert.rejects(verifyExtractedArchive(root, path.join(root, "bad.tar"), sha256(bytes)), /entry-invalid/u);
  }
});
test("durableexports arecreate-only andrefusetooverwrite completedorinterruptedbatch", async t => {
  const root = await temporary(t), directory = path.join(root, "evidence"), plan = planFixture();
  const writer = await createCampaignWriter(directory, plan), slot = plan.attempts[0];
  await writer.started(slot, { status: "started" }); const before = await readFile(path.join(directory, `${slot.attemptId}.started.json`));
  await assert.rejects(writer.started(slot, { status: "replacement" }), /EEXIST/u);
  assert.deepEqual(await readFile(path.join(directory, `${slot.attemptId}.started.json`)), before);
  await assert.rejects(createCampaignWriter(directory, plan), /EEXIST/u);
  await assert.rejects(writer.write("../escape", {}), /export-invalid/u);
});

function memoryWriter() { return { starts: [], results: [], async started(slot) { this.starts.push(slot); },
  async finished(slot, observation) { this.results.push(structuredClone(observation)); return { file: slot.attemptId + ".json", sha256: hash, bytes: 1 }; } }; }
function observed(slot, status = "completed") {
  const observation = newObservation(MODEL_CASES.find(value => value.id === slot.caseId), { ...slot, runtimeSealSha256: hash });
  observation.sourceCommit = sourceCommit; observation.status = status; observation.finishedAt = new Date(now).toISOString();
  return { observation, grade: evaluateAttempt(slot.caseId, observation, { expectedModelId: candidateId, runtimeSealSha256: hash }), unresolved: [] };
}
test("batchserializes all120attempts without claimingunitmodelacceptance", async () => {
  const writer = memoryWriter(), controller = new AbortController(); let active = 0, maximumActive = 0, before = 0;
  const result = await executeCandidateAttempts({ plan: planFixture(), writer, signal: controller.signal, beforeAttempt: async () => before++,
    runAttempt: async slot => { active++; maximumActive = Math.max(maximumActive, active); await new Promise(resolve => setImmediate(resolve)); active--; return observed(slot); } });
  assert.equal(maximumActive, 1); assert.equal(before, 120); assert.equal(result.recordedAttempts, 120); assert.equal(result.notExecuted.length, 0);
  assert.equal(result.productQualificationPassed, false); assert.equal(result.independentSemanticReviewPending, true);
});
test("partialstop retains interruptedattempt plus119unexecutedslots", async () => {
  const writer = memoryWriter(), controller = new AbortController();
  const result = await executeCandidateAttempts({ plan: planFixture(), writer, signal: controller.signal, beforeAttempt: async () => {},
    runAttempt: async slot => { controller.abort(Object.assign(new Error("deadline"), { code: "m1-campaign-deadline" })); return observed(slot, "interrupted"); } });
  assert.equal(result.recordedAttempts, 1); assert.equal(result.notExecuted.length, 119); assert.equal(result.plannedCampaignAttempts, 360);
  assert.equal(result.stopCode, "m1-campaign-deadline"); assert.equal(writer.results[0].status, "interrupted");
});
test("failedmodelattempts staycounted anddonot becomea skipped orrepairedsuccess", async () => {
  const writer = memoryWriter(); let calls = 0;
  const result = await executeCandidateAttempts({ plan: planFixture(), writer, signal: new AbortController().signal, beforeAttempt: async () => {},
    runAttempt: async slot => { calls++; if (calls === 1) throw Object.assign(new Error("synthetic"), { code: "m1-model-timeout" }); return observed(slot); } });
  assert.equal(result.recordedAttempts, 120); assert.equal(writer.starts.length, 120); assert.equal(writer.results[0].status, "failed");
  assert.equal(writer.results[0].failures[0].errorCode, "m1-model-timeout"); assert.equal(result.attempts[0].passed, false);
});
test("unreadyhardware stopsbeforenextstartwithoutchangingdenominator", async () => {
  const writer = memoryWriter(); const result = await executeCandidateAttempts({ plan: planFixture(), writer, signal: new AbortController().signal,
    beforeAttempt: async () => { throw Object.assign(new Error("unready"), { code: "m1-campaign-live-lease-unavailable" }); }, runAttempt: async () => assert.fail("must not call model") });
  assert.equal(writer.starts.length, 0); assert.equal(result.notExecuted.length, 120); assert.equal(result.denominatorChanged, false);
});
test("wrongmodelidentity oractualcontainmentfailure stops after retainedattempt", async () => {
  const writer = memoryWriter(); const result = await executeCandidateAttempts({ plan: planFixture(), writer, signal: new AbortController().signal, beforeAttempt: async () => {},
    runAttempt: async slot => { const value = observed(slot); value.observation.provider.unexpectedCalls.push({ errorCode: "m1-capture-model-mismatch" }); return value; } });
  assert.equal(result.stopCode, "m1-campaign-containment-failure"); assert.equal(writer.results.length, 1); assert.equal(result.notExecuted.length, 119);
});
