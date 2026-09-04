import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CAPABILITY_SET_DIGEST, CAPABILITY_SET_VERSION, MATERIALIZATION_POLICY_DIGEST, MATERIALIZATION_POLICY_ID,
  NETWORK_POLICY_DIGEST, NETWORK_POLICY_ID, admitGitOpenRequest, admitMaterializationReceipt, admitMaterializationRequest, admitPipeFrame,
  admitUploadManifest, admitWorkspaceCancelRequest, admitWorkspaceManifest, bindingDigestFor, canonicalSha256, canonicalStringify,
  controlPipeFrameSchema, createControlPipeAdmission, fileSetDigest, parseCanonicalWire, validateControlPipeTranscript,
  gitStreamFrameSchema, materializationReceiptSchema, sourceSelectionSchema, uploadManifestSchema,
  uploadSessionCreateResponseSchema, validateGitStreamTranscript, workspaceManifestSchema, workspaceReconciliationRequestSchema
} from "./materialization-contracts.mjs";

const d = "a".repeat(64);
const t0 = "2026-09-03T12:00:00.000Z";
const t1 = "2026-09-03T12:01:00.000Z";
const t2 = "2026-09-03T12:02:00.000Z";
const t30 = "2026-09-03T12:30:00.000Z";
const readJson = name => JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
const bindingRecord = { schemaVersion: "runa-workspace-binding/v1", participantId: "person_00001",
  projectId: "project_0001", environmentId: "control_0001", sourceId: "source_0001", taskId: "task_0000001",
  sourceRevision: 1, capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST };
const binding = bindingDigestFor(bindingRecord);

test("all three frozen policy artifacts have their exact canonical digests", () => {
  const capability = readJson("./m1-s2b1-capability-set.json");
  assert.equal(capability.capabilitySetVersion, CAPABILITY_SET_VERSION);
  assert.equal(canonicalSha256(capability), CAPABILITY_SET_DIGEST);
  assert.deepEqual(capability.operations.participant, ["source.connect-public-git", "source.connect-folder-snapshot", "workspace.materialize", "workspace.list-files", "workspace.read-text", "workspace.cancel", "source.disconnect"]);
  assert.deepEqual(capability.effects, ["source-record-create", "upload-session-create", "workspace-materialize", "workspace-cancel", "workspace-cleanup", "source-disconnect"]);
  assert.equal(canonicalSha256(readJson("./m1-s2b1-network-policy.json")), NETWORK_POLICY_DIGEST);
  const materializationPolicy = readJson("./m1-s2b1-materialization-policy.json");
  assert.equal(canonicalSha256(materializationPolicy), MATERIALIZATION_POLICY_DIGEST);
  assert.deepEqual({ deadline: materializationPolicy.materializationDeadlineMs,
    cleanup: materializationPolicy.cleanupReconciliationDeadlineMs,
    perSourceProject: materializationPolicy.maximumInFlightPerSourceProject,
    perParticipant: materializationPolicy.maximumInFlightPerParticipant,
    pathProfile: materializationPolicy.pathCharacterProfile },
  { deadline: 120000, cleanup: 30000, perSourceProject: 1, perParticipant: 2,
    pathProfile: "printable-ascii-v1" });
});

const request = () => ({ schemaVersion: "runa-workspace-materialization-request/v1", requestId: "request_0001",
  idempotencyKey: d, sourceId: "source_0001", taskId: "task_0000001", bindingDigest: binding,
  expectedSourceRevision: 1, capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
  requestedRef: "main", uploadSessionId: null, uploadManifestDigest: null, limitsProfileId: MATERIALIZATION_POLICY_ID,
  limitsProfileDigest: MATERIALIZATION_POLICY_DIGEST, deadlineAt: t2, createdAt: t0 });

test("wire admission rejects wrong capability, binding, duplicate keys, whitespace and impossible UTC", () => {
  assert.equal(admitMaterializationRequest(canonicalStringify(request()), bindingRecord).sourceId, "source_0001");
  assert.throws(() => admitMaterializationRequest(canonicalStringify({ ...request(), capabilitySetDigest: d }), bindingRecord));
  assert.throws(() => admitMaterializationRequest(canonicalStringify(request()), { ...bindingRecord, projectId: "project_0002" }));
  assert.throws(() => admitMaterializationRequest(` ${canonicalStringify(request())}`, bindingRecord), /non-canonical-wire/u);
  assert.throws(() => admitMaterializationRequest(canonicalStringify(request()).replace('"requestId":"request_0001"', '"requestId":"request_0001","requestId":"request_0001"'), bindingRecord), /non-canonical-wire/u);
  assert.throws(() => admitMaterializationRequest(canonicalStringify({ ...request(), createdAt: "2026-02-30T12:00:00.000Z" }), bindingRecord));
  assert.throws(() => admitMaterializationRequest(canonicalStringify({ ...request(), deadlineAt: t1 }), bindingRecord));
});

test("cancel is a closed binding-checked participant operation", () => {
  const value = { schemaVersion: "runa-workspace-cancel-request/v1", requestId: "request_0002", idempotencyKey: d,
    sourceId: bindingRecord.sourceId, taskId: bindingRecord.taskId, bindingDigest: binding,
    expectedSourceRevision: bindingRecord.sourceRevision, capabilitySetVersion: CAPABILITY_SET_VERSION,
    capabilitySetDigest: CAPABILITY_SET_DIGEST, requestedAt: t0 };
  assert.equal(admitWorkspaceCancelRequest(canonicalStringify(value), bindingRecord).requestId, "request_0002");
  assert.throws(() => admitWorkspaceCancelRequest(canonicalStringify({ ...value, sourceId: "source_0002" }), bindingRecord));
});

test("server-issued reconciliation deadline is the exact hashed-policy duration", () => {
  const value = { schemaVersion: "runa-workspace-reconciliation-request/v1", workspaceId: "workspace_01",
    taskId: bindingRecord.taskId, bindingDigest: binding, operation: "workspace.reconcile",
    capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
    requestedAt: t0, deadlineAt: "2026-09-03T12:00:30.000Z" };
  assert.equal(workspaceReconciliationRequestSchema.safeParse(value).success, true);
  assert.equal(workspaceReconciliationRequestSchema.safeParse({ ...value, deadlineAt: t1 }).success, false);
});

test("source selection enforces literal policies and rejects normalized IDN or encoded URLs", () => {
  const base = { schemaVersion: "runa-workspace-source-selection/v1", sourceId: "source_0001", projectId: "project_0001",
    participantId: "person_00001", environmentId: "control_0001", displayName: "Public fixture", lifecycle: "known",
    cleanupState: "not-required", capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
    revision: 1, createdAt: t0, updatedAt: t0, revokedAt: null, sourceKind: "git-public-https",
    repositoryHttpsUrl: "https://example.com/fixture.git", requestedRef: "main", endpointPolicyId: NETWORK_POLICY_ID,
    endpointPolicyDigest: NETWORK_POLICY_DIGEST };
  assert.equal(sourceSelectionSchema.safeParse(base).success, true);
  for (const repositoryHttpsUrl of ["http://example.com/fixture.git", "https://éxample.com/fixture.git", "https://xn--xample-9ua.com/fixture.git", "https://example.com/%66ixture.git", "https://example.com/a/../fixture.git"]) {
    assert.equal(sourceSelectionSchema.safeParse({ ...base, repositoryHttpsUrl }).success, false, repositoryHttpsUrl);
  }
  const invalidUtf8 = Buffer.from(canonicalStringify(base));
  invalidUtf8[invalidUtf8.indexOf(Buffer.from("Public fixture"))] = 0xff;
  assert.throws(() => parseCanonicalWire(sourceSelectionSchema, invalidUtf8), /non-canonical-wire/u);
  assert.equal(sourceSelectionSchema.safeParse({ ...base, lifecycle: "disconnected", cleanupState: "pending" }).success, true);
  assert.equal(sourceSelectionSchema.safeParse({ ...base, lifecycle: "disconnected", cleanupState: "indeterminate" }).success, false);
});

const manifest = () => {
  const entries = [{ path: "a.txt", bytes: 1, sha256: d, mediaClass: "utf8-text" }];
  return { schemaVersion: "runa-workspace-manifest/v1", workspaceId: "workspace_01", sourceId: "source_0001",
    bindingDigest: binding, sourceKind: "git-public-https", nativeVersionKind: "git-commit-sha1",
    nativeVersion: "c".repeat(40), entries, fileSetDigest: fileSetDigest(entries), excludedCount: 0, rejectedCount: 0,
    complete: true, adapterReleaseSha256: d, runtimeReleaseSha256: d, brokerReleaseSha256: d,
    capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
    limitsProfileId: MATERIALIZATION_POLICY_ID, limitsProfileDigest: MATERIALIZATION_POLICY_DIGEST,
    lifecycle: "ready", createdAt: t0, expiresAt: t30 };
};

test("manifest admission recomputes file-set integrity and forbids incomplete ready state", () => {
  assert.equal(admitWorkspaceManifest(canonicalStringify(manifest()), bindingRecord).complete, true);
  assert.throws(() => admitWorkspaceManifest(canonicalStringify({ ...manifest(), fileSetDigest: d }), bindingRecord), /file-set-digest-mismatch/u);
  assert.equal(workspaceManifestSchema.safeParse({ ...manifest(), complete: false, rejectedCount: 1 }).success, false);
  assert.equal(workspaceManifestSchema.safeParse({ ...manifest(), expiresAt: t1 }).success, false);
});

const receipt = () => ({ schemaVersion: "runa-workspace-materialization-receipt/v1", requestId: "request_0001",
  sourceId: "source_0001", sourceKind: "git-public-https", workspaceId: "workspace_01", taskId: "task_0000001",
  bindingDigest: binding, capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
  limitsProfileId: MATERIALIZATION_POLICY_ID, limitsProfileDigest: MATERIALIZATION_POLICY_DIGEST, outcome: "ready",
  nativeVersion: "c".repeat(40), beforeManifestDigest: null, stagingManifestDigest: d, finalManifestDigest: d,
  networkState: "bounded-complete", processState: "stopped", publicationState: "published-acknowledged",
  databaseState: "ready-recorded", cleanupState: "complete", filesObserved: 1, bytesObserved: 1, durationMs: 1,
  limitCode: "none", errorCode: null, retryableAfterReconciliation: false, workerReleaseSha256: d,
  startedAt: t0, finishedAt: t1, credentialsPresent: false, privateValuesIncluded: false, modelInvoked: false,
  effects: ["workspace-materialize"] });

test("ready receipt rejects indeterminate network, absent versions/digests and limit failures", () => {
  assert.equal(admitMaterializationReceipt(canonicalStringify(receipt()), bindingRecord).outcome, "ready");
  for (const patch of [{ networkState: "indeterminate" }, { nativeVersion: null }, { stagingManifestDigest: null }, { limitCode: "time" }]) {
    assert.equal(materializationReceiptSchema.safeParse({ ...receipt(), ...patch }).success, false, JSON.stringify(patch));
  }
  assert.equal(materializationReceiptSchema.safeParse({ ...receipt(), sourceKind: "browser-folder-snapshot",
    networkState: "not-required", nativeVersion: "c".repeat(40) }).success, false);
  assert.equal(materializationReceiptSchema.safeParse({ ...receipt(), outcome: "failed", errorCode: "made-up-error",
    publicationState: "staging", databaseState: "terminal-recorded", retryableAfterReconciliation: true,
    effects: [] }).success, false);
  const timedOut = { ...receipt(), sourceKind: "browser-folder-snapshot", outcome: "timed-out", nativeVersion: null,
    finalManifestDigest: null, networkState: "not-required", publicationState: "staging",
    databaseState: "terminal-recorded", cleanupState: "complete", durationMs: 120000, limitCode: "time",
    errorCode: "materialization-timeout", retryableAfterReconciliation: true, effects: [], finishedAt: t2 };
  assert.equal(materializationReceiptSchema.safeParse(timedOut).success, true);
  assert.equal(materializationReceiptSchema.safeParse({ ...timedOut, retryableAfterReconciliation: false }).success, false);
  assert.equal(materializationReceiptSchema.safeParse({ ...timedOut, durationMs: 0, processState: "not-started",
    publicationState: "not-started" }).success, false);
});

test("browser manifest has server-computed digest and rejects overlaps, duplicates and chunk mismatch", () => {
  const value = { schemaVersion: "runa-browser-folder-upload-manifest/v1",
    entries: [{ path: "a.txt", bytes: 1, sha256: d, chunks: 1 }], excludedPaths: ["secret.key"], totalBytes: 1 };
  const admitted = admitUploadManifest(canonicalStringify(value));
  assert.equal(admitted.manifestDigest, canonicalSha256(value));
  assert.equal(uploadManifestSchema.safeParse({ ...value, excludedPaths: ["secret.key", "secret.key"] }).success, false);
  assert.equal(uploadManifestSchema.safeParse({ ...value, excludedPaths: ["a.txt"] }).success, false);
  assert.equal(uploadManifestSchema.safeParse({ ...value, entries: [{ ...value.entries[0], chunks: 2 }] }).success, false);
  assert.equal(uploadManifestSchema.safeParse({ ...value, entries: [{ ...value.entries[0], path: "COM¹.txt" }] }).success, false);
  assert.equal(uploadManifestSchema.safeParse({ ...value, entries: [{ ...value.entries[0], path: "Résumé.txt" }] }).success, false);
  for (const path of ["CONIN$", "CONOUT$", "conin$.txt", "conout$.log"]) {
    assert.equal(uploadManifestSchema.safeParse({ ...value, entries: [{ ...value.entries[0], path }] }).success, false, path);
  }
  const session = { schemaVersion: "runa-browser-folder-upload-session/v1", uploadSessionId: "upload_00001",
    sourceId: bindingRecord.sourceId, limitsProfileId: MATERIALIZATION_POLICY_ID,
    limitsProfileDigest: MATERIALIZATION_POLICY_DIGEST, issuedAt: t0, expiresAt: t2 };
  assert.equal(uploadSessionCreateResponseSchema.safeParse(session).success, true);
  assert.equal(uploadSessionCreateResponseSchema.safeParse({ ...session, expiresAt: t1 }).success, false);
});

const streamKey = Buffer.alloc(32, 3);
const streamExpectation = { channelId: "channel_0001", requestId: "request_0001", nonce: d,
  repositoryPath: "/org/fixture.git" };
const streamRecord = (direction, sequence, requestOrdinal, frameType, payload = Buffer.alloc(0), patch = {}) => {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const base = { schemaVersion: "runa-materialization-pipe-frame/v2", channelId: "channel_0001", sequence,
    requestId: "request_0001", nonce: d, payloadSha256: createHash("sha256").update(bytes).digest("hex"),
    payloadBytes: bytes.length, direction, requestOrdinal, frameType, ...patch };
  const hmacSha256 = createHmac("sha256", streamKey).update(canonicalStringify(base)).update(bytes).digest("hex");
  return { rawHeader: canonicalStringify({ ...base, hmacSha256 }), payload: bytes };
};

const controlRecord = (direction, sequence, frameType, payload = "x", patch = {}) => {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const base = { schemaVersion: "runa-materialization-pipe-frame/v2", channelId: "channel_0001", sequence,
    requestId: "request_0001", nonce: d, payloadSha256: createHash("sha256").update(bytes).digest("hex"),
    payloadBytes: bytes.length, direction, frameType, ...patch };
  const hmacSha256 = createHmac("sha256", streamKey).update(canonicalStringify(base)).update(bytes).digest("hex");
  return { rawHeader: canonicalStringify({ ...base, hmacSha256 }), payload: bytes };
};

const eof = direction => ({ direction, eof: true });
const controlExpectation = { relationship: "control-coordinator", channelId: "channel_0001", requestId: "request_0001", nonce: d };
const controlPairs = [
  ["control-coordinator", "control-to-coordinator", "coordinator-to-control"],
  ["coordinator-materializer", "coordinator-to-materializer", "materializer-to-coordinator"],
  ["coordinator-broker", "coordinator-to-broker", "broker-to-coordinator"]
];
const finalizedEvents = (requestDirection, responseDirection, decision = "finalize") => [
  controlRecord(requestDirection, 1, "operation-request"),
  controlRecord(responseDirection, 1, "operation-proposal"),
  controlRecord(requestDirection, 2, decision),
  eof(requestDirection),
  controlRecord(responseDirection, 2, "terminal"),
  eof(responseDirection)
];

test("incremental control admission enforces the proposal barrier for all three exact relationships", () => {
  for (const [relationship, requestDirection, responseDirection] of controlPairs) {
    const expectation = { ...controlExpectation, relationship };
    assert.deepEqual(validateControlPipeTranscript(finalizedEvents(requestDirection, responseDirection), expectation, streamKey),
      { outcome: "finalized", requestFrames: 2, responseFrames: 2, terminal: true, eof: true });
    assert.equal(validateControlPipeTranscript(finalizedEvents(requestDirection, responseDirection, "cancel-request"), expectation, streamKey).outcome,
      "cancelled-after-proposal");
    const admission = createControlPipeAdmission(expectation, streamKey);
    admission.admit(controlRecord(requestDirection, 1, "operation-request"));
    assert.throws(() => admission.admit(controlRecord(requestDirection, 2, "finalize")), /control-transition-invalid/u);
    assert.throws(() => admission.admit(controlRecord(responseDirection, 1, "operation-proposal")), /control-admission-poisoned/u);
  }
});

test("control transcript admits only the sealed one-phase terminal variants", () => {
  const preCancel = [controlRecord("control-to-coordinator", 1, "cancel-request"), eof("control-to-coordinator"),
    controlRecord("coordinator-to-control", 1, "terminal"), eof("coordinator-to-control")];
  assert.equal(validateControlPipeTranscript(preCancel, controlExpectation, streamKey).outcome, "cancelled-before-operation");
  const earlyFailure = [controlRecord("control-to-coordinator", 1, "operation-request"),
    controlRecord("coordinator-to-control", 1, "terminal"), eof("coordinator-to-control"), eof("control-to-coordinator")];
  assert.equal(validateControlPipeTranscript(earlyFailure, controlExpectation, streamKey).outcome, "failed-before-proposal");
});

test("control admission rejects role confusion, chronology violations, third frames and EOF violations", () => {
  const allDirections = controlPairs.flatMap(([, requestDirection, responseDirection]) => [requestDirection, responseDirection]);
  for (const [relationship, requestDirection, responseDirection] of controlPairs) {
    const expectation = { ...controlExpectation, relationship };
    for (const direction of allDirections.filter(value => value !== requestDirection)) {
      assert.throws(() => validateControlPipeTranscript([controlRecord(direction, 1, "operation-request")], expectation, streamKey));
    }
    for (const direction of allDirections.filter(value => value !== responseDirection)) {
      assert.throws(() => validateControlPipeTranscript([controlRecord(requestDirection, 1, "operation-request"),
        controlRecord(direction, 1, "operation-proposal")], expectation, streamKey));
    }
  }
  assert.throws(() => validateControlPipeTranscript([controlRecord("coordinator-to-control", 1, "operation-proposal")], controlExpectation, streamKey), /control-transition-invalid/u);
  assert.throws(() => validateControlPipeTranscript([controlRecord("control-to-coordinator", 1, "operation-request"),
    eof("control-to-coordinator")], controlExpectation, streamKey), /control-eof-invalid/u);
  const complete = finalizedEvents("control-to-coordinator", "coordinator-to-control");
  assert.throws(() => validateControlPipeTranscript([...complete, controlRecord("coordinator-to-control", 3, "terminal")], controlExpectation, streamKey), /control-channel-complete/u);
  assert.throws(() => validateControlPipeTranscript(complete.slice(0, -1), controlExpectation, streamKey), /control-eof-required/u);
  assert.throws(() => validateControlPipeTranscript([...complete.slice(0, 4), controlRecord("control-to-coordinator", 3, "cancel-request")], controlExpectation, streamKey));
});

test("control admission enforces exact key, binding and payload boundaries", () => {
  const directions = ["control-to-coordinator", "coordinator-to-control"];
  const normal = finalizedEvents(...directions);
  assert.throws(() => createControlPipeAdmission(controlExpectation, Buffer.alloc(31)), /pipe-key-invalid/u);
  assert.throws(() => createControlPipeAdmission(controlExpectation, Buffer.alloc(33)), /pipe-key-invalid/u);
  assert.throws(() => validateControlPipeTranscript(normal, { ...controlExpectation, requestId: "request_0002" }, streamKey), /pipe-channel-binding-invalid/u);
  assert.throws(() => validateControlPipeTranscript([controlRecord(directions[0], 1, "operation-request", "x", { channelId: "channel_0002" })], controlExpectation, streamKey), /pipe-channel-binding-invalid/u);
  assert.throws(() => validateControlPipeTranscript([controlRecord(directions[0], 1, "operation-request", "x", { nonce: "b".repeat(64) })], controlExpectation, streamKey), /pipe-channel-binding-invalid/u);
  assert.throws(() => validateControlPipeTranscript(normal, controlExpectation, Buffer.alloc(32, 9)), /pipe-hmac-mismatch/u);
  assert.throws(() => validateControlPipeTranscript([controlRecord(directions[0], 1, "operation-request", Buffer.alloc(0))], controlExpectation, streamKey), /control-payload-empty/u);
  const boundary = createControlPipeAdmission(controlExpectation, streamKey);
  assert.equal(boundary.admit(controlRecord(directions[0], 1, "operation-request", Buffer.alloc(1_048_576))).frame.payloadBytes, 1_048_576);
  assert.throws(() => createControlPipeAdmission(controlExpectation, streamKey)
    .admit(controlRecord(directions[0], 1, "operation-request", Buffer.alloc(1_048_577))));
  assert.equal(controlPipeFrameSchema.safeParse({ ...JSON.parse(normal[0].rawHeader), frameType: "operation-proposal" }).success, false);
});

test("stream schema and transcript permit bounded multi-frame two-request Git exchange only", () => {
  const request0 = canonicalStringify({ schemaVersion: "runa-public-git-http-request/v1", requestOrdinal: 0,
    method: "GET", pathAndQuery: "/org/fixture.git/info/refs?service=git-upload-pack",
    accept: "application/x-git-upload-pack-advertisement", contentType: null, contentLength: 0 });
  const request1 = canonicalStringify({ schemaVersion: "runa-public-git-http-request/v1", requestOrdinal: 1,
    method: "POST", pathAndQuery: "/org/fixture.git/git-upload-pack",
    accept: "application/x-git-upload-pack-result", contentType: "application/x-git-upload-pack-request", contentLength: 10 });
  const response0 = canonicalStringify({ schemaVersion: "runa-public-git-http-response/v1", requestOrdinal: 0,
    status: 200, contentType: "application/x-git-upload-pack-advertisement", contentLength: 10, headerBytes: 120 });
  const response1 = canonicalStringify({ schemaVersion: "runa-public-git-http-response/v1", requestOrdinal: 1,
    status: 200, contentType: "application/x-git-upload-pack-result", contentLength: 0, headerBytes: 120 });
  const records = [
    streamRecord("materializer-to-broker", 1, 0, "open-request", request0), streamRecord("materializer-to-broker", 2, 0, "end-request"),
    streamRecord("broker-to-materializer", 1, 0, "open-response", response0), streamRecord("broker-to-materializer", 2, 0, "response-body", Buffer.alloc(10)),
    streamRecord("broker-to-materializer", 3, 0, "end-response"), streamRecord("materializer-to-broker", 3, 1, "open-request", request1),
    streamRecord("materializer-to-broker", 4, 1, "request-body", Buffer.alloc(10)), streamRecord("materializer-to-broker", 5, 1, "end-request"),
    streamRecord("broker-to-materializer", 4, 1, "open-response", response1), streamRecord("broker-to-materializer", 5, 1, "end-response"),
    streamRecord("broker-to-materializer", 6, 1, "terminal")
  ];
  for (const item of records) assert.equal(gitStreamFrameSchema.safeParse(JSON.parse(item.rawHeader)).success, true);
  assert.deepEqual(validateGitStreamTranscript(records, streamExpectation, streamKey), { requestBytes: 10, responseBytes: 10, terminal: true });
  assert.throws(() => validateGitStreamTranscript(records.slice(0, -1), streamExpectation, streamKey), /pipe-terminal-pattern-invalid/u);
  assert.throws(() => validateGitStreamTranscript([streamRecord("materializer-to-broker", 1, 0, "open-request", request0,
    { channelId: "channel_0002" }), ...records.slice(1)], streamExpectation, streamKey), /pipe-channel-binding-invalid/u);
  assert.throws(() => validateGitStreamTranscript([streamRecord("materializer-to-broker", 1, 0, "open-request", Buffer.alloc(1_048_576)),
    ...records.slice(1)], streamExpectation, streamKey));
});

test("Git request heads admit only the two sealed smart HTTP shapes", () => {
  const advertised = { schemaVersion: "runa-public-git-http-request/v1", requestOrdinal: 0, method: "GET",
    pathAndQuery: "/org/fixture.git/info/refs?service=git-upload-pack",
    accept: "application/x-git-upload-pack-advertisement", contentType: null, contentLength: 0 };
  assert.equal(admitGitOpenRequest(canonicalStringify(advertised), "/org/fixture.git").requestOrdinal, 0);
  assert.throws(() => admitGitOpenRequest(canonicalStringify({ ...advertised, pathAndQuery: "/other.git/info/refs?service=git-upload-pack" }), "/org/fixture.git"), /git-request-path-mismatch/u);
  assert.throws(() => admitGitOpenRequest(canonicalStringify({ ...advertised, method: "POST" }), "/org/fixture.git"));
});

test("pipe admission recomputes HMAC and rejects arbitrary header fields or wrong key", () => {
  const base = { schemaVersion: "runa-materialization-pipe-frame/v2", channelId: "channel_0001", sequence: 1,
    requestId: "request_0001", nonce: d, payloadSha256: createHash("sha256").update("x").digest("hex"), payloadBytes: 1,
    direction: "control-to-coordinator", frameType: "operation-request" };
  const hmacSha256 = createHmac("sha256", Buffer.alloc(32, 1)).update(canonicalStringify(base)).update("x").digest("hex");
  const signed = { ...base, hmacSha256 };
  assert.equal(admitPipeFrame(controlPipeFrameSchema, canonicalStringify(signed), "x", Buffer.alloc(32, 1)).frameType, "operation-request");
  assert.throws(() => admitPipeFrame(controlPipeFrameSchema, canonicalStringify(signed), "x", Buffer.alloc(32, 2)), /pipe-hmac-mismatch/u);
  assert.equal(controlPipeFrameSchema.safeParse({ ...base, hmacSha256, extra: true }).success, false);
});
