import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import pg from "pg";
import { startSyntheticPostgres } from "../synthetic-postgres.mjs";
import { testCipher } from "../../../gate4/fixtures.mjs";
import {
  CAPABILITY_SET_DIGEST,
  CAPABILITY_SET_VERSION,
  MATERIALIZATION_DEADLINE_MS,
  MATERIALIZATION_POLICY_DIGEST,
  MATERIALIZATION_POLICY_ID,
  canonicalSha256,
  canonicalStringify,
  fileSetDigest,
} from "./materialization-contracts.mjs";
import { PostgresServerWorkspaceStore } from "./postgres.mjs";

const sha = character => character.repeat(64);
const WORKSPACE_LIFETIME_MS = 1_800_000;
const root = path.resolve(import.meta.dirname, "../../..");
let database;
let pool;

test.before(async () => {
  database = await startSyntheticPostgres({
    toolRoot: process.env.RUNALAB_TOOL_ROOT ?? "D:/Projects/Runalab/artifacts/tools",
    artifactRoot: path.join(root, "artifacts/runs/m1-s2b1-postgres-lifecycle"),
  });
  pool = new pg.Pool({ connectionString: database.connectionString });
});

test.after(async () => {
  try { await pool?.end(); } finally { await database?.stop(); }
});

async function fixture(t, name) {
  const schema = `runa_m1_pg_${name.replaceAll("-", "_")}`;
  const sqlSchema = `"${schema}"`;
  let clock = Date.parse("2026-09-03T12:00:00.000Z");
  const createStore = () => new PostgresServerWorkspaceStore({
    pool, schema, cipher: testCipher(), now: () => clock++,
  });
  let store = createStore();
  await store.initialize();
  const context = { principalId: `alice-${name}`, projectId: `project-${name}`, sessionId: `session-${name}` };
  t.after(async () => { await pool.query(`DROP SCHEMA IF EXISTS ${sqlSchema} CASCADE`); });

  const definition = (sourceName, commitCharacter = "a") => ({
    environmentId: `environment-${name}-${sourceName}-01`, displayName: `Fixture ${name} ${sourceName}`,
    repositoryHttpsUrl: `https://example.com/org/${name}-${sourceName}.git`, requestedRef: "main",
    expectedCommitOid: commitCharacter.repeat(40),
  });
  const connect = async (sourceName, commitCharacter = "a") => {
    const sourceDefinition = definition(sourceName, commitCharacter);
    return { sourceDefinition, result: await store.connectPublicGit(context, sourceDefinition) };
  };
  const attempt = async (sourceName, commitCharacter = "a") => {
    const connected = await connect(sourceName, commitCharacter);
    return { sourceDefinition: connected.sourceDefinition,
      workspace: await store.beginMaterialization(context, { sourceId: connected.result.source.sourceId }) };
  };
  const identity = (workspace, expectedRevision = workspace.revision) => ({
    workspaceId: workspace.workspaceId, expectedRevision,
    idempotencyKey: workspace.request.idempotencyKey,
    bindingDigest: workspace.request.bindingDigest,
    capabilitySetDigest: CAPABILITY_SET_DIGEST,
  });
  const sourceIdentity = (source, expectedRevision = source.revision) => ({
    sourceId: source.sourceId, expectedRevision, capabilitySetDigest: CAPABILITY_SET_DIGEST,
  });
  const manifest = (workspace, overrides = {}) => {
    const entries = [{ path: "calculator.js", bytes: 1, sha256: sha("4"), mediaClass: "utf8-text" }];
    return { schemaVersion: "runa-workspace-manifest/v1", workspaceId: workspace.workspaceId,
      sourceId: workspace.source.sourceId, bindingDigest: workspace.request.bindingDigest,
      sourceKind: workspace.source.sourceKind, nativeVersionKind: "git-commit-sha1",
      nativeVersion: workspace.expectedCommitOid, entries, fileSetDigest: fileSetDigest(entries),
      excludedCount: 0, rejectedCount: 0, complete: true,
      adapterReleaseSha256: sha("5"), runtimeReleaseSha256: sha("6"), brokerReleaseSha256: sha("7"),
      capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
      limitsProfileId: MATERIALIZATION_POLICY_ID, limitsProfileDigest: MATERIALIZATION_POLICY_DIGEST,
      lifecycle: "ready", createdAt: workspace.request.createdAt,
      expiresAt: new Date(Date.parse(workspace.request.createdAt) + WORKSPACE_LIFETIME_MS).toISOString(),
      ...overrides };
  };
  const receipt = (workspace, outcome, overrides = {}) => {
    const durationMs = outcome === "timed-out" ? MATERIALIZATION_DEADLINE_MS : 1;
    const ready = outcome === "ready", cancelled = outcome === "cancelled";
    const cleanupPending = outcome === "cleanup-pending", unknown = outcome === "unknown";
    const timedOut = outcome === "timed-out";
    return {
      schemaVersion: "runa-workspace-materialization-receipt/v1",
      requestId: workspace.request.requestId, sourceId: workspace.source.sourceId,
      sourceKind: workspace.source.sourceKind, workspaceId: workspace.workspaceId,
      taskId: workspace.binding.taskId, bindingDigest: workspace.request.bindingDigest,
      capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
      limitsProfileId: workspace.request.limitsProfileId,
      limitsProfileDigest: workspace.request.limitsProfileDigest,
      outcome, nativeVersion: ready ? workspace.expectedCommitOid : null, beforeManifestDigest: null,
      stagingManifestDigest: ready ? sha("1") : null,
      finalManifestDigest: ready ? canonicalSha256(manifest(workspace)) : null,
      networkState: ready || timedOut ? "bounded-complete" : unknown ? "indeterminate" : "not-required",
      processState: unknown ? "stop-unconfirmed" : outcome === "failed" ? "stopped"
        : ready || timedOut ? "stopped" : "not-started",
      publicationState: ready ? "published-acknowledged" : timedOut ? "staging"
        : unknown ? "indeterminate" : "not-started",
      databaseState: ready ? "ready-recorded" : unknown ? "indeterminate" : "terminal-recorded",
      cleanupState: unknown ? "indeterminate" : cleanupPending ? "pending" : "complete",
      filesObserved: ready || timedOut ? 1 : 0, bytesObserved: ready || timedOut ? 1 : 0,
      durationMs, limitCode: timedOut ? "time" : "none",
      errorCode: ready ? null : cancelled ? "cancellation-accepted" : cleanupPending ? "cleanup-failed"
        : timedOut ? "materialization-timeout" : unknown ? "state-indeterminate" : "process-failed",
      retryableAfterReconciliation: ["failed", "timed-out", "cancelled"].includes(outcome),
      workerReleaseSha256: sha("3"), startedAt: workspace.request.createdAt,
      finishedAt: new Date(Date.parse(workspace.request.createdAt) + durationMs).toISOString(),
      credentialsPresent: false, privateValuesIncluded: false, modelInvoked: false,
      effects: cancelled ? ["workspace-cancel"] : cleanupPending ? ["workspace-cleanup"]
        : ready ? ["workspace-materialize"] : [],
      ...overrides,
    };
  };
  const operationReceipt = (workspace, workspaceReceipt, workspaceRevision = 4, overrides = {}) => ({
    schemaVersion: "runa-workspace-external-operation-terminal-receipt/v1",
    operationId: workspace.binding.taskId,
    requestId: workspace.request.requestId,
    sourceId: workspace.source.sourceId,
    sourceRevision: workspace.source.revision,
    sourceKind: workspace.source.sourceKind,
    workspaceId: workspace.workspaceId,
    workspaceRevision,
    taskId: workspace.binding.taskId,
    idempotencyKey: workspace.request.idempotencyKey,
    bindingDigest: workspace.request.bindingDigest,
    capabilitySetVersion: CAPABILITY_SET_VERSION,
    capabilitySetDigest: CAPABILITY_SET_DIGEST,
    outcome: "terminal-success",
    workspaceReceiptSha256: canonicalSha256(workspaceReceipt),
    finalManifestDigest: workspaceReceipt.finalManifestDigest,
    nativeVersion: workspace.expectedCommitOid,
    processState: "stopped",
    activeProcesses: 0,
    publicationState: "published-reobserved",
    cleanupState: "complete",
    privateValuesIncluded: false,
    modelInvoked: false,
    recordedAt: workspaceReceipt.finishedAt,
    ...overrides,
  });
  const publication = workspace => ({ stagingManifestDigest: sha("1"),
    finalManifestDigest: canonicalSha256(manifest(workspace)) });
  const makeReady = async workspace => {
    await store.recordStaging(context, identity(workspace, 1));
    await store.recordPublishedPendingDb(context, { ...identity(workspace, 2), ...publication(workspace) });
    const readyReceipt = receipt(workspace, "ready");
    return store.recordReady(context, { ...identity(workspace, 3), receipt: readyReceipt,
      operationReceipt: operationReceipt(workspace, readyReceipt),
      workspaceManifestRaw: canonicalStringify(manifest(workspace)) });
  };
  const authoritySnapshot = async () => JSON.stringify({
    sources: (await pool.query(`SELECT * FROM ${sqlSchema}.sources ORDER BY source_id`)).rows,
    workspaces: (await pool.query(`SELECT * FROM ${sqlSchema}.workspaces ORDER BY workspace_id`)).rows,
    receipts: (await pool.query(`SELECT * FROM ${sqlSchema}.workspace_receipts
      ORDER BY workspace_id,workspace_revision`)).rows,
    operationReceipts: (await pool.query(`SELECT * FROM ${sqlSchema}.operation_receipts
      ORDER BY workspace_id,workspace_revision`)).rows,
    outbox: (await pool.query(`SELECT * FROM ${sqlSchema}.outbox ORDER BY sequence`)).rows,
  });
  return { schema, sqlSchema, context, createStore, get store() { return store; },
    set store(value) { store = value; }, definition, connect, attempt, identity, sourceIdentity,
    manifest, receipt, operationReceipt, publication, makeReady, authoritySnapshot };
}

test("PostgreSQL lifecycle migration preserves only publication-and-receipt-proved legacy readiness", async t => {
  const h = await fixture(t, "legacy");
  const proved = (await h.attempt("proved", "a")).workspace;
  await h.makeReady(proved);
  const unproved = (await h.attempt("unproved", "b")).workspace;
  await h.makeReady(unproved);
  const unprovedCleanup = (await h.attempt("cleanup", "c")).workspace;
  await h.store.recordFailed(h.context, {
    ...h.identity(unprovedCleanup, 1), receipt: h.receipt(unprovedCleanup, "failed"),
  });

  for (const [workspace, retainPublication] of [[proved, true], [unproved, false], [unprovedCleanup, false]]) {
    const value = structuredClone(await h.store.getWorkspace(h.context, workspace.workspaceId));
    delete value.revision;
    delete value.cleanupState;
    if (!retainPublication) {
      delete value.workspaceManifest;
      delete value.stagingManifestDigest;
      delete value.finalManifestDigest;
    }
    const payload = h.store.encode("workspace", h.context, workspace.workspaceId, value);
    await pool.query(`UPDATE ${h.sqlSchema}.workspaces SET payload=$2::jsonb,payload_sha256=$3
      WHERE workspace_id=$1`, [workspace.workspaceId, JSON.stringify(payload), canonicalSha256(payload)]);
  }
  await pool.query(`ALTER TABLE ${h.sqlSchema}.workspaces
    DROP COLUMN cleanup_state, DROP COLUMN revision, DROP COLUMN capability_digest,
    DROP COLUMN last_transition_digest, DROP COLUMN manifest_digest, DROP COLUMN operation_receipt_sha256`);

  h.store = h.createStore();
  await h.store.initialize();
  const provedMigrated = await h.store.getWorkspace(h.context, proved.workspaceId);
  assert.equal(provedMigrated.lifecycle, "ready");
  assert.equal(provedMigrated.cleanupState, "complete");
  assert.equal(provedMigrated.finalManifestDigest, canonicalSha256(provedMigrated.workspaceManifest));
  const provedRow = (await pool.query(`SELECT manifest_digest FROM ${h.sqlSchema}.workspaces
    WHERE workspace_id=$1`, [proved.workspaceId])).rows[0];
  assert.equal(provedRow.manifest_digest, provedMigrated.finalManifestDigest);

  for (const workspaceId of [unproved.workspaceId, unprovedCleanup.workspaceId]) {
    const migrated = await h.store.getWorkspace(h.context, workspaceId);
    assert.equal(migrated.lifecycle, "unknown");
    assert.equal(migrated.cleanupState, "indeterminate");
    assert.equal(migrated.workspaceManifest, null);
    assert.equal(migrated.finalManifestDigest, null);
    const row = (await pool.query(`SELECT lifecycle,cleanup_state,manifest_digest FROM ${h.sqlSchema}.workspaces
      WHERE workspace_id=$1`, [workspaceId])).rows[0];
    assert.deepEqual(row, { lifecycle: "unknown", cleanup_state: "indeterminate", manifest_digest: null });
  }

  const receiptless = await fixture(t, "legacy-receiptless");
  const receiptlessReady = (await receiptless.attempt("ready", "d")).workspace;
  await receiptless.makeReady(receiptlessReady);
  const receiptlessValue = structuredClone(await receiptless.store.getWorkspace(receiptless.context,
    receiptlessReady.workspaceId));
  delete receiptlessValue.revision;
  delete receiptlessValue.cleanupState;
  delete receiptlessValue.terminalOperationReceiptSha256;
  const receiptlessPayload = receiptless.store.encode("workspace", receiptless.context,
    receiptlessReady.workspaceId, receiptlessValue);
  await pool.query(`UPDATE ${receiptless.sqlSchema}.workspaces SET payload=$2::jsonb,payload_sha256=$3
    WHERE workspace_id=$1`, [receiptlessReady.workspaceId, JSON.stringify(receiptlessPayload),
    canonicalSha256(receiptlessPayload)]);
  await pool.query(`DROP TABLE ${receiptless.sqlSchema}.operation_receipts,
    ${receiptless.sqlSchema}.workspace_receipts`);
  await pool.query(`ALTER TABLE ${receiptless.sqlSchema}.workspaces
    DROP COLUMN cleanup_state, DROP COLUMN revision, DROP COLUMN capability_digest,
    DROP COLUMN last_transition_digest, DROP COLUMN manifest_digest, DROP COLUMN operation_receipt_sha256`);
  receiptless.store = receiptless.createStore();
  await receiptless.store.initialize();
  const migratedReceiptless = await receiptless.store.getWorkspace(receiptless.context,
    receiptlessReady.workspaceId);
  assert.equal(migratedReceiptless.lifecycle, "unknown");
  assert.equal(migratedReceiptless.cleanupState, "indeterminate");
  assert.equal(migratedReceiptless.workspaceManifest, null);
  assert.equal(migratedReceiptless.finalManifestDigest, null);
});

test("PostgreSQL source invalidation, cleanup, and unknown reconciliation are atomic and evidence-bound", async t => {
  const h = await fixture(t, "source");
  const readySetup = await h.attempt("cascade", "d");
  await h.makeReady(readySetup.workspace);
  const connected = (await h.store.recordSourceConnected(h.context,
    h.sourceIdentity(readySetup.workspace.source))).source;
  await assert.rejects(h.store.getWorkspace(h.context, readySetup.workspace.workspaceId),
    error => error.code === "workspace-source-authority-stale");
  const nonterminal = await h.store.beginMaterialization(h.context, { sourceId: connected.sourceId });

  const disconnected = (await h.store.recordSourceDisconnected(h.context, h.sourceIdentity(connected))).source;
  assert.equal(disconnected.cleanupState, "pending");
  const expired = await h.store.getWorkspace(h.context, readySetup.workspace.workspaceId);
  const reconciled = await h.store.getWorkspace(h.context, nonterminal.workspaceId);
  assert.equal(expired.lifecycle, "expired");
  assert.equal(expired.cleanupState, "pending");
  assert.equal(reconciled.lifecycle, "unknown");
  assert.equal(reconciled.cleanupState, "indeterminate");
  assert.equal(expired.sourceInvalidationDigest, reconciled.sourceInvalidationDigest);

  const beforeReplacement = await h.authoritySnapshot();
  await assert.rejects(h.store.connectPublicGit(h.context, readySetup.sourceDefinition),
    error => error.code === "workspace-source-reconciliation-required");
  assert.equal(await h.authoritySnapshot(), beforeReplacement);
  await assert.rejects(h.store.recordSourceCleanupComplete(h.context, {
    ...h.sourceIdentity(disconnected), successor: "disconnected", evidenceDigest: "malformed",
  }));
  assert.equal(await h.authoritySnapshot(), beforeReplacement);
  const cleaned = (await h.store.recordSourceCleanupComplete(h.context, {
    ...h.sourceIdentity(disconnected), successor: "disconnected", evidenceDigest: sha("e"),
  })).source;
  assert.equal(cleaned.cleanupState, "complete");
  const replacement = await h.store.connectPublicGit(h.context, readySetup.sourceDefinition);
  assert.equal(replacement.created, true);
  assert.notEqual(replacement.source.sourceId, disconnected.sourceId);

  const unknownReadySetup = await h.attempt("unknown-ready", "1");
  await h.makeReady(unknownReadySetup.workspace);
  const indeterminateReadySource = (await h.store.recordSourceUnknown(h.context,
    h.sourceIdentity(unknownReadySetup.workspace.source))).source;
  const indeterminateReadyWorkspace = await h.store.getWorkspace(h.context,
    unknownReadySetup.workspace.workspaceId);
  assert.equal(indeterminateReadySource.lifecycle, "unknown");
  assert.equal(indeterminateReadySource.cleanupState, "indeterminate");
  assert.equal(indeterminateReadyWorkspace.lifecycle, "unknown");
  assert.equal(indeterminateReadyWorkspace.cleanupState, "indeterminate");

  const unknownSetup = await h.attempt("unknown-source", "e");
  await h.store.recordStaging(h.context, h.identity(unknownSetup.workspace, 1));
  const unknownSource = (await h.store.recordSourceUnknown(h.context,
    h.sourceIdentity(unknownSetup.workspace.source))).source;
  assert.equal((await h.store.getWorkspace(h.context, unknownSetup.workspace.workspaceId)).lifecycle, "unknown");
  await assert.rejects(h.store.connectPublicGit(h.context, unknownSetup.sourceDefinition),
    error => error.code === "workspace-source-reconciliation-required");
  const beforeMalformedReconciliation = await h.authoritySnapshot();
  await assert.rejects(h.store.reconcileSourceUnknown(h.context, {
    ...h.sourceIdentity(unknownSource), successor: "failed", evidenceDigest: "malformed",
  }));
  assert.equal(await h.authoritySnapshot(), beforeMalformedReconciliation);
  const reconciliationEvidenceDigest = sha("9");
  const determined = (await h.store.reconcileSourceUnknown(h.context, {
    ...h.sourceIdentity(unknownSource), successor: "failed", evidenceDigest: reconciliationEvidenceDigest,
  })).source;
  assert.equal(determined.lifecycle, "failed");
  assert.equal(determined.cleanupState, "pending");
  assert.equal((await h.store.reconcileSourceUnknown(h.context, {
    ...h.sourceIdentity(unknownSource), successor: "failed", evidenceDigest: reconciliationEvidenceDigest,
  })).changed, false);
  const beforeConflictingReplay = await h.authoritySnapshot();
  await assert.rejects(h.store.reconcileSourceUnknown(h.context, {
    ...h.sourceIdentity(unknownSource), successor: "failed", evidenceDigest: sha("8"),
  }), error => error.code === "workspace-source-transition-conflict");
  assert.equal(await h.authoritySnapshot(), beforeConflictingReplay);
  const determinedRow = (await pool.query(`SELECT * FROM ${h.sqlSchema}.sources WHERE source_id=$1`,
    [determined.sourceId])).rows[0];
  assert.equal(h.store.sourceRecord(h.context, determinedRow).reconciliationEvidenceDigest,
    reconciliationEvidenceDigest);
  const unknownClean = (await h.store.recordSourceCleanupComplete(h.context, {
    ...h.sourceIdentity(determined), successor: "failed", evidenceDigest: sha("7"),
  })).source;
  assert.equal(unknownClean.cleanupState, "complete");
  assert.equal((await h.store.connectPublicGit(h.context, unknownSetup.sourceDefinition)).created, true);

  const failedSetup = await h.attempt("failed-source", "6");
  const failedSource = (await h.store.recordSourceFailed(h.context,
    h.sourceIdentity(failedSetup.workspace.source))).source;
  assert.equal(failedSource.lifecycle, "failed");
  assert.equal(failedSource.cleanupState, "pending");
  assert.equal((await h.store.getWorkspace(h.context, failedSetup.workspace.workspaceId)).lifecycle, "unknown");
  const failedUsableCount = (await pool.query(`SELECT count(*) AS count FROM ${h.sqlSchema}.workspaces
    WHERE source_id=$1 AND lifecycle IN ('intent-recorded','staging','published-pending-db','ready')`,
  [failedSource.sourceId])).rows[0].count;
  assert.equal(failedUsableCount, "0");

  const rollbackSetup = await h.attempt("rollback", "f");
  await h.makeReady(rollbackSetup.workspace);
  await pool.query(`ALTER TABLE ${h.sqlSchema}.outbox ADD CONSTRAINT test_source_rollback
    CHECK (event_type <> 'source-disconnected') NOT VALID`);
  const beforeRollback = await h.authoritySnapshot();
  await assert.rejects(h.store.recordSourceDisconnected(h.context,
    h.sourceIdentity(rollbackSetup.workspace.source)));
  assert.equal(await h.authoritySnapshot(), beforeRollback);
  assert.equal((await h.store.getWorkspace(h.context, rollbackSetup.workspace.workspaceId)).lifecycle, "ready");
  await pool.query(`ALTER TABLE ${h.sqlSchema}.outbox DROP CONSTRAINT test_source_rollback`);
});

test("PostgreSQL workspace publication, lifecycle admission, receipts, and retry remain fail-closed", async t => {
  const h = await fixture(t, "workspace");
  const readyAttempt = (await h.attempt("ready", "1")).workspace;
  await h.store.recordStaging(h.context, h.identity(readyAttempt, 1));
  const published = await h.store.recordPublishedPendingDb(h.context,
    { ...h.identity(readyAttempt, 2), ...h.publication(readyAttempt) });
  const divergentEntries = [{ path: "calculator.js", bytes: 1, sha256: sha("d"), mediaClass: "utf8-text" }];
  const beforeMismatch = await h.authoritySnapshot();
  const mismatchReceipt = h.receipt(readyAttempt, "ready");
  await assert.rejects(h.store.recordReady(h.context, {
    ...h.identity(readyAttempt, 3), receipt: mismatchReceipt,
    operationReceipt: h.operationReceipt(readyAttempt, mismatchReceipt),
    workspaceManifestRaw: canonicalStringify(h.manifest(readyAttempt,
      { entries: divergentEntries, fileSetDigest: fileSetDigest(divergentEntries) })),
  }), error => error.code === "workspace-manifest-publication-mismatch");
  assert.equal(await h.authoritySnapshot(), beforeMismatch);
  const readyReceipt = h.receipt(readyAttempt, "ready");
  const terminalOperationReceipt = h.operationReceipt(readyAttempt, readyReceipt);
  const beforeOperationMismatch = await h.authoritySnapshot();
  await assert.rejects(h.store.recordReady(h.context, {
    ...h.identity(readyAttempt, 3), receipt: readyReceipt,
    operationReceipt: { ...terminalOperationReceipt,
      operationId: "task-00000000-0000-4000-8000-000000000000" },
    workspaceManifestRaw: canonicalStringify(h.manifest(readyAttempt)),
  }), error => error.code === "workspace-operation-receipt-binding-mismatch");
  assert.equal(await h.authoritySnapshot(), beforeOperationMismatch);
  await pool.query(`ALTER TABLE ${h.sqlSchema}.operation_receipts ADD CONSTRAINT test_ready_atomic
    CHECK (operation_id <> task_id)`);
  const beforeAtomicFailure = await h.authoritySnapshot();
  await assert.rejects(h.store.recordReady(h.context, {
    ...h.identity(readyAttempt, 3), receipt: readyReceipt,
    operationReceipt: terminalOperationReceipt,
    workspaceManifestRaw: canonicalStringify(h.manifest(readyAttempt)),
  }));
  assert.equal(await h.authoritySnapshot(), beforeAtomicFailure);
  await pool.query(`ALTER TABLE ${h.sqlSchema}.operation_receipts DROP CONSTRAINT test_ready_atomic`);
  const ready = await h.store.recordReady(h.context, {
    ...h.identity(readyAttempt, 3), receipt: readyReceipt,
    operationReceipt: terminalOperationReceipt,
    workspaceManifestRaw: canonicalStringify(h.manifest(readyAttempt)),
  });
  assert.equal(ready.lifecycle, "ready");
  assert.equal(ready.finalManifestDigest, published.finalManifestDigest);
  assert.equal(Object.isFrozen(ready.receipt), true);
  assert.equal(Object.isFrozen(ready.operationReceipt), true);
  const receipts = await h.store.getReceipts(h.context, readyAttempt.workspaceId);
  assert.equal(Object.isFrozen(receipts), true);
  assert.equal(Object.isFrozen(receipts[0]), true);
  const operationReceipts = await h.store.getOperationReceipts(h.context, readyAttempt.workspaceId);
  assert.equal(Object.isFrozen(operationReceipts), true);
  assert.equal(Object.isFrozen(operationReceipts[0]), true);
  assert.equal(operationReceipts[0].workspaceReceiptSha256, canonicalSha256(receipts[0]));
  const readyOutbox = (await pool.query(`SELECT payload_sha256 FROM ${h.sqlSchema}.outbox
    WHERE event_type='workspace-ready' AND record_id=$1`, [readyAttempt.workspaceId])).rows[0];
  assert.equal(readyOutbox.payload_sha256, canonicalSha256(operationReceipts[0]));
  await assert.rejects(pool.query(`UPDATE ${h.sqlSchema}.workspace_receipts SET receipt_sha256=$1
    WHERE workspace_id=$2`, [sha("f"), readyAttempt.workspaceId]), /workspace receipts are immutable/u);
  await assert.rejects(pool.query(`UPDATE ${h.sqlSchema}.operation_receipts SET receipt_sha256=$1
    WHERE workspace_id=$2`, [sha("f"), readyAttempt.workspaceId]), /operation receipts are immutable/u);

  const unknownAttempt = (await h.attempt("unknown", "2")).workspace;
  await h.store.recordStaging(h.context, h.identity(unknownAttempt, 1));
  await h.store.recordUnknown(h.context, {
    ...h.identity(unknownAttempt, 2), receipt: h.receipt(unknownAttempt, "unknown"),
  });
  const beforeUnprovedReady = await h.authoritySnapshot();
  const reconciledReadyReceipt = h.receipt(unknownAttempt, "ready");
  await assert.rejects(h.store.reconcileUnknownReady(h.context, {
    ...h.identity(unknownAttempt, 3), receipt: reconciledReadyReceipt,
    operationReceipt: h.operationReceipt(unknownAttempt, reconciledReadyReceipt),
    workspaceManifestRaw: canonicalStringify(h.manifest(unknownAttempt)),
  }), error => error.code === "workspace-manifest-publication-mismatch");
  assert.equal(await h.authoritySnapshot(), beforeUnprovedReady);
  await h.store.recordCleanupPending(h.context, {
    ...h.identity(unknownAttempt, 3), evidenceDigest: sha("6"),
    receipt: h.receipt(unknownAttempt, "cleanup-pending"),
  });
  const removed = await h.store.recordRemoved(h.context,
    { ...h.identity(unknownAttempt, 4), evidenceDigest: sha("7") });
  assert.equal(removed.lifecycle, "removed");
  const retryEvidence = sha("8");
  assert.equal((await h.store.authorizeMaterializationRetry(h.context,
    { ...h.identity(unknownAttempt, 5), evidenceDigest: retryEvidence })).changed, true);
  assert.equal((await h.store.authorizeMaterializationRetry(h.context,
    { ...h.identity(unknownAttempt, 5), evidenceDigest: retryEvidence })).changed, false);

  const bindingAttempt = (await h.attempt("request-binding", "4")).workspace;
  const bindingRow = (await pool.query(`SELECT payload,payload_sha256,request_digest
    FROM ${h.sqlSchema}.workspaces WHERE workspace_id=$1`, [bindingAttempt.workspaceId])).rows[0];
  const requestMutations = [
    { sourceId: "source-00000000-0000-4000-8000-000000000000" },
    { taskId: "task-00000000-0000-4000-8000-000000000000" },
    { expectedSourceRevision: bindingAttempt.request.expectedSourceRevision + 1 },
    { requestedRef: "refs/heads/not-the-selected-ref" },
  ];
  for (const mutation of requestMutations) {
    const value = structuredClone(bindingAttempt);
    value.request = { ...value.request, ...mutation };
    const payload = h.store.encode("workspace", h.context, bindingAttempt.workspaceId, value);
    await pool.query(`UPDATE ${h.sqlSchema}.workspaces SET payload=$2::jsonb,payload_sha256=$3,request_digest=$4
      WHERE workspace_id=$1`, [bindingAttempt.workspaceId, JSON.stringify(payload), canonicalSha256(payload),
      canonicalSha256(value.request)]);
    await assert.rejects(h.store.getWorkspace(h.context, bindingAttempt.workspaceId),
      error => error.code === "workspace-authority-integrity-failed");
    await pool.query(`UPDATE ${h.sqlSchema}.workspaces SET payload=$2::jsonb,payload_sha256=$3,request_digest=$4
      WHERE workspace_id=$1`, [bindingAttempt.workspaceId, JSON.stringify(bindingRow.payload),
      bindingRow.payload_sha256, bindingRow.request_digest]);
  }

  const removedIdentity = h.identity(unknownAttempt, 6);
  const malformedCalls = [
    () => h.store.recordStaging(h.context, removedIdentity),
    () => h.store.recordPublishedPendingDb(h.context,
      { ...removedIdentity, stagingManifestDigest: "malformed", finalManifestDigest: "malformed" }),
    () => h.store.recordReady(h.context, { ...removedIdentity, receipt: {}, workspaceManifestRaw: "{" }),
    () => h.store.recordCancelled(h.context, { ...removedIdentity, receipt: {} }),
    () => h.store.recordFailed(h.context, { ...removedIdentity, receipt: {} }),
    () => h.store.recordTimedOut(h.context, { ...removedIdentity, receipt: {} }),
    () => h.store.recordUnknown(h.context, { ...removedIdentity, receipt: {} }),
    () => h.store.reconcileUnknownReady(h.context, { ...removedIdentity, receipt: {}, workspaceManifestRaw: "{" }),
    () => h.store.recordExpired(h.context, { ...removedIdentity, evidenceDigest: "malformed" }),
    () => h.store.recordCleanupPending(h.context, { ...removedIdentity, evidenceDigest: "malformed", receipt: {} }),
    () => h.store.recordRemoved(h.context, { ...removedIdentity, evidenceDigest: "malformed" }),
    () => h.store.reconcileUnknownRemoved(h.context, { ...removedIdentity, evidenceDigest: "malformed" }),
  ];
  for (const invoke of malformedCalls) {
    const before = await h.authoritySnapshot();
    await assert.rejects(invoke(), error => error.code === "workspace-transition-conflict");
    assert.equal(await h.authoritySnapshot(), before);
  }
  const beforeMalformedRetry = await h.authoritySnapshot();
  await assert.rejects(h.store.authorizeMaterializationRetry(h.context,
    { ...h.identity(readyAttempt, 4), evidenceDigest: "malformed" }),
  error => error.code === "workspace-retry-reconciliation-required");
  assert.equal(await h.authoritySnapshot(), beforeMalformedRetry);
});

test("PostgreSQL source-ready races cannot leave usable stale workspaces and outbox stays digest-only", async t => {
  const h = await fixture(t, "concurrency");
  const raceAttempt = (await h.attempt("race", "3")).workspace;
  await h.store.recordStaging(h.context, h.identity(raceAttempt, 1));
  await h.store.recordPublishedPendingDb(h.context,
    { ...h.identity(raceAttempt, 2), ...h.publication(raceAttempt) });
  const [readyResult, revokeResult] = await Promise.allSettled([
    h.store.recordReady(h.context, {
      ...h.identity(raceAttempt, 3), receipt: h.receipt(raceAttempt, "ready"),
      operationReceipt: h.operationReceipt(raceAttempt, h.receipt(raceAttempt, "ready")),
      workspaceManifestRaw: canonicalStringify(h.manifest(raceAttempt)),
    }),
    h.store.recordSourceRevoked(h.context, h.sourceIdentity(raceAttempt.source)),
  ]);
  assert.equal(revokeResult.status, "fulfilled");
  if (readyResult.status === "rejected") {
    assert.equal(readyResult.reason.code, "workspace-transition-conflict");
  }
  const finalWorkspace = await h.store.getWorkspace(h.context, raceAttempt.workspaceId);
  assert.equal(["expired", "unknown"].includes(finalWorkspace.lifecycle), true);
  assert.equal((await pool.query(`SELECT count(*) AS count FROM ${h.sqlSchema}.workspaces
    WHERE source_id=$1 AND lifecycle IN ('intent-recorded','staging','published-pending-db','ready')`,
  [raceAttempt.source.sourceId])).rows[0].count, "0");

  const outboxColumns = (await pool.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema=$1 AND table_name='outbox' ORDER BY ordinal_position`, [h.schema])).rows
    .map(row => row.column_name);
  assert.deepEqual(outboxColumns,
    ["sequence", "principal_id", "project_id", "event_type", "record_id", "payload_sha256", "recorded_at"]);
  const outbox = (await pool.query(`SELECT * FROM ${h.sqlSchema}.outbox ORDER BY sequence`)).rows;
  assert.equal(outbox.every(row => /^[a-f0-9]{64}$/u.test(row.payload_sha256)), true);
  assert.equal(JSON.stringify(outbox).includes("repositoryHttpsUrl"), false);
  const eventTypes = new Set(outbox.map(row => row.event_type));
  assert.equal(eventTypes.has("source-revoked"), true);
  assert.equal(eventTypes.has("workspace-source-invalidated"), true);
});
