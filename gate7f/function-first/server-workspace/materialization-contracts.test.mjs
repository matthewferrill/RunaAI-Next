import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CAPABILITY_SET_VERSION, canonicalSha256, materializationRequestSchema, materializationReceiptSchema, sourceSelectionSchema, workspaceManifestSchema } from "./materialization-contracts.mjs";

const d = "a".repeat(64);
const t0 = "2026-09-03T12:00:00.000Z";
const t1 = "2026-09-03T12:01:00.000Z";

test("capability set has the frozen canonical digest and closed operation set", () => {
  const value = JSON.parse(readFileSync(new URL("./m1-s2b1-capability-set.json", import.meta.url), "utf8"));
  assert.equal(value.capabilitySetVersion, CAPABILITY_SET_VERSION);
  assert.equal(canonicalSha256(value), "268da8ecb04683cb8f82fd4a98ac04a4ed6c5ffaa590b4fca31c8407664b62cb");
  assert.deepEqual(value.operations.participant, ["source.connect-public-git", "source.connect-folder-snapshot", "workspace.materialize", "workspace.list-files", "workspace.read-text", "source.disconnect"]);
  assert.deepEqual(value.operations.internal, ["workspace.reconcile", "workspace.cleanup"]);
  assert.deepEqual(value.effects, []);
});

test("request contract rejects mixed Git and snapshot authority", () => {
  const base = { schemaVersion: "runa-workspace-materialization-request/v1", requestId: "request_0001", idempotencyKey: d,
    sourceId: "source_0001", taskId: "task_0000001", bindingDigest: d, expectedSourceRevision: 1,
    capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: d, limitsProfileId: "m1-s2b1-materialization-limits/v1",
    deadlineAt: t1, createdAt: t0 };
  assert.equal(materializationRequestSchema.safeParse({ ...base, requestedRef: "main", uploadSessionId: null, uploadManifestDigest: null }).success, true);
  assert.equal(materializationRequestSchema.safeParse({ ...base, requestedRef: "main", uploadSessionId: "upload_0001", uploadManifestDigest: d }).success, false);
});

test("source selection requires canonical HTTPS and closed fields", () => {
  const base = { schemaVersion: "runa-workspace-source-selection/v1", sourceId: "source_0001", projectId: "project_0001",
    participantId: "person_00001", environmentId: "control_0001", displayName: "Public fixture", lifecycle: "known",
    capabilitySetVersion: CAPABILITY_SET_VERSION, revision: 1, createdAt: t0, updatedAt: t0, revokedAt: null,
    sourceKind: "git-public-https", repositoryHttpsUrl: "https://example.com/fixture.git", requestedRef: "main",
    endpointPolicyId: "endpoint_0001", uploadSessionId: null };
  assert.equal(sourceSelectionSchema.safeParse(base).success, true);
  assert.equal(sourceSelectionSchema.safeParse({ ...base, repositoryHttpsUrl: "http://example.com/fixture.git" }).success, false);
  assert.equal(sourceSelectionSchema.safeParse({ ...base, clientParticipantId: "person_00002" }).success, false);
});

test("manifest contract enforces sorted unique paths and source/version agreement", () => {
  const base = { schemaVersion: "runa-workspace-manifest/v1", workspaceId: "workspace_01", sourceId: "source_0001", bindingDigest: d,
    sourceKind: "git-public-https", nativeVersionKind: "git-commit-sha1", nativeVersion: "b".repeat(40),
    entries: [{ path: "a.txt", bytes: 1, sha256: d, mediaClass: "utf8-text" }], fileSetDigest: d, excludedCount: 0,
    rejectedCount: 0, complete: true, adapterReleaseSha256: d, runtimeReleaseSha256: d, brokerReleaseSha256: d,
    capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: d, lifecycle: "ready", createdAt: t0, expiresAt: t1 };
  assert.equal(workspaceManifestSchema.safeParse(base).success, true);
  assert.equal(workspaceManifestSchema.safeParse({ ...base, sourceKind: "browser-folder-snapshot" }).success, false);
  assert.equal(workspaceManifestSchema.safeParse({ ...base, entries: [base.entries[0], base.entries[0]] }).success, false);
});

test("ready and uncertain receipt outcomes have closed invariants", () => {
  const base = { schemaVersion: "runa-workspace-materialization-receipt/v1", requestId: "request_0001", sourceId: "source_0001", sourceKind: "git-public-https",
    workspaceId: "workspace_01", taskId: "task_0000001", bindingDigest: d, capabilitySetVersion: CAPABILITY_SET_VERSION,
    capabilitySetDigest: d, outcome: "ready", nativeVersion: "b".repeat(40), beforeManifestDigest: null, stagingManifestDigest: d,
    finalManifestDigest: d, networkState: "bounded-complete", processState: "stopped", publicationState: "published-acknowledged",
    databaseState: "ready-recorded", cleanupState: "complete", filesObserved: 1, bytesObserved: 1, durationMs: 1, limitCode: "none",
    errorCode: null, retryableAfterReconciliation: false, workerReleaseSha256: d, startedAt: t0, finishedAt: t1,
    credentialsPresent: false, privateValuesIncluded: false, modelInvoked: false, effects: [] };
  assert.equal(materializationReceiptSchema.safeParse(base).success, true);
  assert.equal(materializationReceiptSchema.safeParse({ ...base, outcome: "unknown", errorCode: "broker-lost", retryableAfterReconciliation: true }).success, false);
  assert.equal(materializationReceiptSchema.safeParse({ ...base, processState: "stop-unconfirmed" }).success, false);
});

test("canonical digest is stable across nested object key order", () => {
  assert.equal(canonicalSha256({ z: { b: 2, a: 1 }, a: [2, { y: 1, x: 0 }] }), canonicalSha256({ a: [2, { x: 0, y: 1 }], z: { a: 1, b: 2 } }));
});
