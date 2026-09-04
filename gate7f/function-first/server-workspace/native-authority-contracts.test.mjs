import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  CAPABILITY_SET_DIGEST, CAPABILITY_SET_VERSION, MATERIALIZATION_DEADLINE_MS,
  canonicalSha256, materializationAdmissionResultSchema, publicGitOperationAuthoritySchema,
  rawHandleBatchSchema, watchdogRetainedOperationSchema, watchdogRetainedRecoveryEntrySchema,
} from "./materialization-contracts.mjs";

const sha = value => createHash("sha256").update(String(value)).digest("hex");
const START = "2026-09-04T12:00:00.000Z";

function authority(overrides = {}) {
  const unsigned = { schemaVersion: "runa-public-git-operation-authority/v1",
    operationId: "operation-00000000-0000-4000-8000-000000000001",
    taskId: "operation-00000000-0000-4000-8000-000000000001", operationMode: "public-git",
    requestedAt: START, deadlineAt: new Date(Date.parse(START) + MATERIALIZATION_DEADLINE_MS).toISOString(),
    topologyDigest: sha("topology"), capabilitySetVersion: CAPABILITY_SET_VERSION,
    capabilitySetDigest: CAPABILITY_SET_DIGEST, workerReleaseSha256: sha("release"), ...overrides };
  const authorityDigest = canonicalSha256(unsigned);
  return { ...unsigned, authorityDigest, attestation: {
    schemaVersion: "runa-public-git-operation-authority-attestation/v1", algorithm: "ed25519",
    signingKeyId: "control-watchdog-authority-0001", signingKeyVersion: 1,
    watchdogIdentitySha256: sha("watchdog"), authorityDigest,
    signatureBase64: Buffer.alloc(64, 3).toString("base64") } };
}

function handleBatch(resources) {
  const unsigned = { schemaVersion: "runa-public-git-raw-handle-batch/v1",
    operationId: "operation-00000000-0000-4000-8000-000000000001",
    batchId: "handle-batch-00000001", batchRevision: 1, phase: "setup", resources };
  return { ...unsigned, batchDigest: canonicalSha256(unsigned) };
}

const resource = (id, handle) => ({ internalResourceId: id, nativeObjectType: "pipe",
  role: "inherited-pipe", child: "coordinator", direction: "control-to-coordinator",
  sourceProcessId: 42, rawHandleHex: handle });

test("operation authority is closed, exactly timed and digest-bound to its attestation", () => {
  const value = authority();
  assert.deepEqual(publicGitOperationAuthoritySchema.parse(value), value);
  assert.equal(publicGitOperationAuthoritySchema.safeParse({ ...value, injected: true }).success, false);
  assert.equal(publicGitOperationAuthoritySchema.safeParse({ ...value,
    deadlineAt: new Date(Date.parse(value.deadlineAt) + 1).toISOString() }).success, false);
  assert.equal(publicGitOperationAuthoritySchema.safeParse({ ...value,
    attestation: { ...value.attestation, authorityDigest: sha("forged") } }).success, false);
  assert.equal(publicGitOperationAuthoritySchema.safeParse(authority({ taskId:
    "operation-00000000-0000-4000-8000-000000000002" })).success, false);
});

test("scoped retained locators and watchdog dispositions reject missing or additional fields", () => {
  const value = authority();
  const locator = { disposition: "reconciliation-required", requestScopeDigest: sha("scope"),
    operationId: value.operationId, authorityDigest: value.authorityDigest, attestation: value.attestation };
  assert.deepEqual(materializationAdmissionResultSchema.parse(locator), locator);
  assert.equal(materializationAdmissionResultSchema.safeParse({ ...locator, sourceId:
    "source-00000000-0000-4000-8000-000000000001" }).success, false);
  assert.equal(materializationAdmissionResultSchema.safeParse({ ...locator, attestation: undefined }).success, false);
  const retained = { disposition: "active-observe", operationId: value.operationId,
    authorityDigest: value.authorityDigest, ledgerRevision: 1,
    authorityTimerOpen: true, authorityWaitClosed: false };
  assert.deepEqual(watchdogRetainedOperationSchema.parse(retained), retained);
  assert.equal(watchdogRetainedOperationSchema.safeParse({ ...retained, authorityWaitClosed: true }).success, false);
  const recoveryCas = sha("recovery-cas");
  const resumable = { disposition: "recovery-resumable", operationId: value.operationId,
    authorityDigest: value.authorityDigest, ledgerRevision: 2, recoveryCas };
  assert.deepEqual(watchdogRetainedOperationSchema.parse(resumable), resumable);
  assert.equal(watchdogRetainedOperationSchema.safeParse({ ...resumable, recoveryCas: { opaque: true } }).success, false);
  const entered = { schemaVersion: "runa-watchdog-retained-recovery-entry/v1",
    disposition: "recovery-entered", operationId: value.operationId, authorityDigest: value.authorityDigest,
    sourceLedgerRevision: 2, recoveryCas, recoveryOwner: true };
  assert.deepEqual(watchdogRetainedRecoveryEntrySchema.parse(entered), entered);
  assert.equal(watchdogRetainedRecoveryEntrySchema.safeParse({ ...entered, recoveryOwner: false }).success, false);
});

test("raw handle transfer requires canonical 64-bit strings and rejects every alias", () => {
  const first = resource("native-resource-00000001", "00000000000001c8");
  const second = resource("native-resource-00000002", "00000000000001c9");
  const valid = handleBatch([first, second]);
  assert.deepEqual(rawHandleBatchSchema.parse(valid), valid);
  assert.equal(rawHandleBatchSchema.safeParse(handleBatch([first, { ...second,
    internalResourceId: first.internalResourceId }])).success, false);
  assert.equal(rawHandleBatchSchema.safeParse(handleBatch([first, { ...second,
    rawHandleHex: first.rawHandleHex }])).success, false);
  assert.equal(rawHandleBatchSchema.safeParse(handleBatch([{ ...first,
    rawHandleHex: "1c8" }])).success, false);
  assert.equal(rawHandleBatchSchema.safeParse({ ...valid, batchDigest: sha("changed") }).success, false);
});
