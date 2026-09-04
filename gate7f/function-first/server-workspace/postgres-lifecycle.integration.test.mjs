import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signEd25519, verify as verifyEd25519 } from "node:crypto";
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
  publicGitOperationAuthoritySchema,
} from "./materialization-contracts.mjs";
import { PostgresServerWorkspaceStore } from "./postgres.mjs";

const sha = character => character.repeat(64);
const WORKSPACE_LIFETIME_MS = 1_800_000;
const SYNTHETIC_POSTGRES_BOUNDS = Object.freeze({ statementTimeoutMs: 30_000, lockTimeoutMs: 5_000,
  idleInTransactionSessionTimeoutMs: 30_000, processExitTimeoutMs: 30_000, includeProcessEvidence: true });
const root = path.resolve(import.meta.dirname, "../../..");
let database;
let pool;

test.after(async () => {
  const failures = [];
  try { await pool?.end(); } catch (error) { failures.push(error); }
  if (database) {
    try {
      const stopReceipt = await database.stop();
      assert.deepEqual(stopReceipt, {
        stopped: true,
        ownedSyntheticDataRemoved: true,
        productionChanged: false,
        schemaVersion: "runaai-synthetic-postgres-stop-receipt/v1",
        postgresProcessId: database.postgresProcessId,
        controlledStopRequested: true,
        terminalExitConfirmed: true,
        exitCode: 0,
        signal: null,
      });
      console.log(`RUNAAI_SYNTHETIC_POSTGRES_STOP_RECEIPT ${canonicalStringify(stopReceipt)}`);
    } catch (error) { failures.push(error); }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "synthetic-postgres-teardown-failed");
});

test.before(async () => {
  database = await startSyntheticPostgres({
    toolRoot: process.env.RUNALAB_TOOL_ROOT ?? "D:/Projects/Runalab/artifacts/tools",
    artifactRoot: path.join(root, "artifacts/runs/m1-s2b1-postgres-lifecycle"),
    ...SYNTHETIC_POSTGRES_BOUNDS,
  });
  assert.equal(Number.isSafeInteger(database.postgresProcessId) && database.postgresProcessId > 0, true);
  pool = new pg.Pool({ connectionString: database.connectionString,
    connectionTimeoutMillis: 15_000, query_timeout: 20_000 });
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

const CANDIDATE_TEST_PREFIX = "candidate PostgreSQL:";
const CANDIDATE_SIGNING_KEY_ID = "control-watchdog-authority-0001";
const CANDIDATE_SIGNING_KEY_VERSION = 1;
const CANDIDATE_WATCHDOG_IDENTITY = sha("8");
const CANDIDATE_WORKER_RELEASE = sha("9");
const CANDIDATE_TOPOLOGY = sha("a");
const candidateSigningKeys = generateKeyPairSync("ed25519");

const candidateAttestationBytes = authority => Buffer.from(canonicalStringify({
  domain: "runa-public-git-operation-authority-attestation/v1",
  authorityDigest: authority.authorityDigest,
  signingKeyId: authority.attestation.signingKeyId,
  signingKeyVersion: authority.attestation.signingKeyVersion,
  watchdogIdentitySha256: authority.attestation.watchdogIdentitySha256,
}));

const candidateAuthorityVerifier = Object.freeze(function verifyCandidateAuthority(rawAuthority) {
  let authority;
  let valid = false;
  try {
    authority = publicGitOperationAuthoritySchema.parse(rawAuthority);
    valid = authority.attestation.signingKeyId === CANDIDATE_SIGNING_KEY_ID
      && authority.attestation.signingKeyVersion === CANDIDATE_SIGNING_KEY_VERSION
      && authority.attestation.watchdogIdentitySha256 === CANDIDATE_WATCHDOG_IDENTITY
      && authority.workerReleaseSha256 === CANDIDATE_WORKER_RELEASE
      && verifyEd25519(null, candidateAttestationBytes(authority), candidateSigningKeys.publicKey,
        Buffer.from(authority.attestation.signatureBase64, "base64"));
  } catch { valid = false; }
  if (!valid) {
    throw Object.assign(new Error("watchdog-operation-authority-attestation-invalid"),
      { code: "watchdog-operation-authority-attestation-invalid" });
  }
  return true;
});

function signedCandidateAuthority(ordinal, overrides = {}) {
  const requestedAtMs = Date.parse("2026-09-04T13:09:00.000Z") + ordinal * 1_000;
  const operationId = `operation-candidate-${String(ordinal).padStart(8, "0")}`;
  const unsigned = {
    schemaVersion: "runa-public-git-operation-authority/v1",
    operationId,
    taskId: operationId,
    operationMode: "public-git",
    requestedAt: new Date(requestedAtMs).toISOString(),
    deadlineAt: new Date(requestedAtMs + MATERIALIZATION_DEADLINE_MS).toISOString(),
    topologyDigest: CANDIDATE_TOPOLOGY,
    capabilitySetVersion: CAPABILITY_SET_VERSION,
    capabilitySetDigest: CAPABILITY_SET_DIGEST,
    workerReleaseSha256: CANDIDATE_WORKER_RELEASE,
    ...overrides,
  };
  const authorityDigest = canonicalSha256(unsigned);
  const attestationBase = {
    schemaVersion: "runa-public-git-operation-authority-attestation/v1",
    algorithm: "ed25519",
    signingKeyId: CANDIDATE_SIGNING_KEY_ID,
    signingKeyVersion: CANDIDATE_SIGNING_KEY_VERSION,
    watchdogIdentitySha256: CANDIDATE_WATCHDOG_IDENTITY,
    authorityDigest,
  };
  const signatureBase64 = signEd25519(null, Buffer.from(canonicalStringify({
    domain: attestationBase.schemaVersion,
    authorityDigest,
    signingKeyId: attestationBase.signingKeyId,
    signingKeyVersion: attestationBase.signingKeyVersion,
    watchdogIdentitySha256: attestationBase.watchdogIdentitySha256,
  })), candidateSigningKeys.privateKey).toString("base64");
  return publicGitOperationAuthoritySchema.parse({ ...unsigned, authorityDigest,
    attestation: { ...attestationBase, signatureBase64 } });
}

function recomputedUnsignedCandidateAuthority(authority) {
  const requestedAt = new Date(Date.parse(authority.requestedAt) + 10_000).toISOString();
  const unsigned = {
    schemaVersion: authority.schemaVersion,
    operationId: `${authority.operationId}-attacker`,
    taskId: `${authority.operationId}-attacker`,
    operationMode: authority.operationMode,
    requestedAt,
    deadlineAt: new Date(Date.parse(requestedAt) + MATERIALIZATION_DEADLINE_MS).toISOString(),
    topologyDigest: sha("b"),
    capabilitySetVersion: authority.capabilitySetVersion,
    capabilitySetDigest: authority.capabilitySetDigest,
    workerReleaseSha256: authority.workerReleaseSha256,
  };
  const authorityDigest = canonicalSha256(unsigned);
  return publicGitOperationAuthoritySchema.parse({ ...unsigned, authorityDigest,
    attestation: { ...authority.attestation, authorityDigest } });
}

async function candidateFixture(t, name, { initialize = true } = {}) {
  const schema = `runa_m1_candidate_${canonicalSha256(name).slice(0, 16)}`;
  const sqlSchema = `"${schema}"`;
  let clock = Date.parse("2026-09-04T13:10:00.000Z");
  let authorityOrdinal = 0;
  const createStore = () => new PostgresServerWorkspaceStore({ pool, schema, cipher: testCipher(),
    now: () => clock++, verifyWatchdogAuthority: candidateAuthorityVerifier });
  const createLegacyStore = () => new PostgresServerWorkspaceStore({ pool, schema, cipher: testCipher(),
    now: () => clock++ });
  let store = createStore();
  if (initialize) await store.initialize();
  const baseContext = { principalId: `candidate-${name}`, projectId: `project-${name}`,
    sessionId: `session-${name}` };
  t.after(async () => { await pool.query(`DROP SCHEMA IF EXISTS ${sqlSchema} CASCADE`); });

  const context = label => label ? { principalId: `candidate-${name}-${label}`,
    projectId: `project-${name}-${label}`, sessionId: `session-${name}-${label}` } : baseContext;
  const definition = (sourceName, commitCharacter = "a") => ({
    environmentId: `environment-${canonicalSha256([name, sourceName]).slice(0, 24)}`,
    displayName: `Candidate ${name} ${sourceName}`,
    repositoryHttpsUrl: `https://example.com/candidate/${name}-${sourceName}.git`,
    requestedRef: "main",
    expectedCommitOid: commitCharacter.repeat(40),
  });
  const connect = async (sourceName, candidateContext = baseContext, commitCharacter = "a") => {
    const sourceDefinition = definition(sourceName, commitCharacter);
    return { sourceDefinition,
      result: await store.connectPublicGit(candidateContext, sourceDefinition) };
  };
  const issueAuthority = (overrides = {}) => signedCandidateAuthority(++authorityOrdinal, overrides);
  const identity = (workspace, expectedRevision = workspace.revision) => ({
    workspaceId: workspace.workspaceId,
    expectedRevision,
    idempotencyKey: workspace.request.idempotencyKey,
    bindingDigest: workspace.request.bindingDigest,
    capabilitySetDigest: CAPABILITY_SET_DIGEST,
  });
  const sourceIdentity = (source, expectedRevision = source.revision) => ({ sourceId: source.sourceId,
    expectedRevision, capabilitySetDigest: CAPABILITY_SET_DIGEST });
  const entries = () => [{ path: "calculator.js", bytes: 1, sha256: sha("4"), mediaClass: "utf8-text" }];
  const workspaceManifest = (workspace, lifecycle) => {
    const manifestEntries = entries();
    return { schemaVersion: "runa-workspace-manifest/v1", workspaceId: workspace.workspaceId,
      sourceId: workspace.source.sourceId, bindingDigest: workspace.request.bindingDigest,
      sourceKind: workspace.source.sourceKind, nativeVersionKind: "git-commit-sha1",
      nativeVersion: workspace.expectedCommitOid, entries: manifestEntries,
      fileSetDigest: fileSetDigest(manifestEntries), excludedCount: 0, rejectedCount: 0, complete: true,
      adapterReleaseSha256: sha("5"), runtimeReleaseSha256: sha("6"), brokerReleaseSha256: sha("7"),
      capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
      limitsProfileId: MATERIALIZATION_POLICY_ID, limitsProfileDigest: MATERIALIZATION_POLICY_DIGEST,
      lifecycle, createdAt: workspace.request.createdAt,
      expiresAt: new Date(Date.parse(workspace.request.createdAt) + WORKSPACE_LIFETIME_MS).toISOString() };
  };
  const publicationBundle = workspace => {
    const stagingManifest = workspaceManifest(workspace, "staging");
    const identityValue = { volumeSerial: "11111111", fileId: "2222222222222222" };
    const seed = canonicalSha256(workspace.workspaceId);
    return { stagingManifest,
      authorityManifest: {
        schemaVersion: "runa-workspace-publication-authority-manifest/v1",
        workspaceId: workspace.workspaceId,
        workspaceManifestDigest: canonicalSha256(stagingManifest),
        parentIdentity: { volumeSerial: "33333333", fileId: "4444444444444444" },
        staging: { name: `staging_${seed.slice(0, 32)}`, identity: identityValue },
        final: { name: `workspace_${seed.slice(0, 32)}`, expectedIdentity: identityValue },
        files: [{ path: "calculator.js", bytes: 1, sha256: sha("4"),
          identity: { volumeSerial: "55555555", fileId: "6666666666666666" } }],
      },
      resources: { parentResourceId: `parent_${seed.slice(0, 32)}`,
        ingressRootResourceId: `ingress_${seed.slice(0, 32)}`,
        stagingRootResourceId: `staging_${seed.slice(0, 32)}` },
    };
  };
  const receipt = (workspace, outcome) => {
    const ready = outcome === "ready";
    const unknown = outcome === "unknown";
    const cleanupPending = outcome === "cleanup-pending";
    const cancelled = outcome === "cancelled";
    const staged = workspace.stagingManifestDigest !== null;
    const published = workspace.finalManifestDigest !== null;
    return {
      schemaVersion: "runa-workspace-materialization-receipt/v1",
      requestId: workspace.request.requestId,
      sourceId: workspace.source.sourceId,
      sourceKind: workspace.source.sourceKind,
      workspaceId: workspace.workspaceId,
      taskId: workspace.binding.taskId,
      bindingDigest: workspace.request.bindingDigest,
      capabilitySetVersion: CAPABILITY_SET_VERSION,
      capabilitySetDigest: CAPABILITY_SET_DIGEST,
      limitsProfileId: workspace.request.limitsProfileId,
      limitsProfileDigest: workspace.request.limitsProfileDigest,
      outcome,
      nativeVersion: ready ? workspace.expectedCommitOid : null,
      beforeManifestDigest: null,
      stagingManifestDigest: ready ? workspace.stagingManifestDigest : null,
      finalManifestDigest: ready ? workspace.finalManifestDigest : null,
      networkState: ready || staged ? "bounded-complete" : unknown ? "indeterminate" : "not-required",
      processState: ready || staged || outcome === "failed" || cleanupPending ? "stopped"
        : unknown ? "stop-unconfirmed" : "not-started",
      publicationState: ready ? "published-acknowledged" : unknown ? "indeterminate"
        : published ? "published-unacknowledged" : staged ? "staging" : "not-started",
      databaseState: ready ? "ready-recorded" : unknown ? "indeterminate" : "terminal-recorded",
      cleanupState: unknown ? "indeterminate" : cleanupPending ? "pending" : "complete",
      filesObserved: ready ? 1 : 0,
      bytesObserved: ready ? 1 : 0,
      durationMs: 1,
      limitCode: "none",
      errorCode: ready ? null : cancelled ? "cancellation-accepted"
        : cleanupPending ? "cleanup-failed" : unknown ? "state-indeterminate" : "process-failed",
      retryableAfterReconciliation: ["failed", "cancelled"].includes(outcome),
      workerReleaseSha256: CANDIDATE_WORKER_RELEASE,
      startedAt: workspace.request.createdAt,
      finishedAt: new Date(Date.parse(workspace.request.createdAt) + 1).toISOString(),
      credentialsPresent: false,
      privateValuesIncluded: false,
      modelInvoked: false,
      effects: cancelled ? ["workspace-cancel"] : cleanupPending ? ["workspace-cleanup"]
        : ready ? ["workspace-materialize"] : [],
    };
  };
  const operationReceipt = (workspace, workspaceReceipt, workspaceRevision) => ({
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
  });
  const snapshot = async () => {
    const tableRows = {};
    for (const [table, order] of [
      ["sources", "source_id"],
      ["workspaces", "workspace_id"],
      ["workspace_receipts", "workspace_id,workspace_revision"],
      ["operation_receipts", "operation_id"],
      ["outbox", "sequence"],
      ["operation_authorities", "operation_id"],
      ["workspace_effect_claims", "operation_id,effect"],
      ["workspace_publication_authorities", "operation_id"],
    ]) {
      tableRows[table] = JSON.parse(JSON.stringify((await pool.query(
        `SELECT * FROM ${sqlSchema}.${table} ORDER BY ${order}`)).rows));
    }
    return canonicalStringify(tableRows);
  };
  const start = async (sourceName, candidateContext = baseContext, commitCharacter = "a") => {
    const connected = await connect(sourceName, candidateContext, commitCharacter);
    const admission = await store.admitMaterializationRequest(candidateContext,
      { sourceId: connected.result.source.sourceId, operationMode: "public-git" });
    assert.equal(admission.disposition, "absent");
    const operationAuthority = issueAuthority();
    const begun = await store.beginMaterialization(candidateContext, {
      sourceId: connected.result.source.sourceId,
      requestScopeDigest: admission.requestScopeDigest,
      operationAuthority,
    });
    return { context: candidateContext, sourceDefinition: connected.sourceDefinition,
      source: connected.result.source, admission, operationAuthority, begun, workspace: begun.workspace };
  };
  const stage = async setup => {
    const fetch = await store.claimEffect(setup.context, { operationId: setup.operationAuthority.operationId,
      authorityDigest: setup.operationAuthority.authorityDigest, effect: "git-fetch",
      expectedWorkspaceRevision: 1 });
    const bundle = publicationBundle(setup.workspace);
    const input = { ...identity(setup.workspace, 1),
      operationAuthorityDigest: setup.operationAuthority.authorityDigest,
      fetchClaim: fetch.claim,
      workspaceManifest: bundle.stagingManifest,
      publicationAuthorityManifest: bundle.authorityManifest,
      publicationResources: bundle.resources };
    const workspace = await store.recordStaging(setup.context, input);
    return { ...setup, fetch, bundle, stagingInput: input, workspace };
  };
  const publish = async setup => {
    const publication = await store.claimEffect(setup.context, {
      operationId: setup.operationAuthority.operationId,
      authorityDigest: setup.operationAuthority.authorityDigest,
      effect: "publication", expectedWorkspaceRevision: 2 });
    const finalManifest = workspaceManifest(setup.workspace, "ready");
    const finalManifestDigest = canonicalSha256(finalManifest);
    const input = { ...identity(setup.workspace, 2),
      operationAuthorityDigest: setup.operationAuthority.authorityDigest,
      publicationClaim: publication.claim,
      publicationObservation: {
        schemaVersion: "runa-workspace-publication-proposal/v1",
        classification: "published-verified",
        proposedAction: "record-published-pending-db",
        reason: "candidate actual PostgreSQL publication reobserved",
        databaseMutationPerformed: false,
        receiptAuthored: false,
        filesystemMutationAttempted: true,
        filesystemMutationConfirmed: true,
        deletionAuthorized: false,
        observedFinalIdentity: setup.bundle.authorityManifest.final.expectedIdentity,
        observedFinalDigest: finalManifestDigest,
        databaseTransitionProposal: { from: "staging", to: "published-pending-db", expectedRevision: 2 },
      },
      stagingManifestDigest: canonicalSha256(setup.bundle.stagingManifest),
      finalManifestDigest,
    };
    const workspace = await store.recordPublishedPendingDb(setup.context, input);
    return { ...setup, publication, finalManifest, publishedInput: input, workspace };
  };
  const makeReady = async setup => {
    const workspaceReceipt = receipt(setup.workspace, "ready");
    const terminalReceipt = operationReceipt(setup.workspace, workspaceReceipt, 4);
    const input = { ...identity(setup.workspace, 3),
      operationAuthorityDigest: setup.operationAuthority.authorityDigest,
      receipt: workspaceReceipt, operationReceipt: terminalReceipt,
      workspaceManifestRaw: canonicalStringify(setup.finalManifest) };
    const workspace = await store.recordReady(setup.context, input);
    return { ...setup, readyInput: input, workspaceReceipt, terminalReceipt, workspace };
  };

  return { schema, sqlSchema, baseContext, context, createStore, createLegacyStore,
    get store() { return store; }, set store(value) { store = value; }, definition, connect,
    issueAuthority, identity, sourceIdentity, workspaceManifest, publicationBundle, receipt,
    operationReceipt, snapshot, start, stage, publish, makeReady };
}

test(`${CANDIDATE_TEST_PREFIX} migration, signed admission, convergence, scope, and atomic begin`,
  { timeout: 180_000 }, async t => {
    const h = await candidateFixture(t, "authority", { initialize: false });
    const predecessor = h.createLegacyStore();
    await predecessor.initialize();
    const legacyConnection = await predecessor.connectPublicGit(h.baseContext, h.definition("predecessor", "d"));
    const legacyWorkspace = await predecessor.beginMaterialization(h.baseContext,
      { sourceId: legacyConnection.source.sourceId });
    await pool.query(`DROP TABLE ${h.sqlSchema}.workspace_publication_authorities,
      ${h.sqlSchema}.workspace_effect_claims,${h.sqlSchema}.operation_authorities`);

    h.store = h.createStore();
    await h.store.initialize();
    const migrated = await h.store.getWorkspace(h.baseContext, legacyWorkspace.workspaceId);
    assert.equal(migrated.lifecycle, "unknown");
    assert.equal(migrated.cleanupState, "indeterminate");
    const candidateTables = (await pool.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema=$1 AND table_name IN
        ('operation_authorities','workspace_effect_claims','workspace_publication_authorities')
      ORDER BY table_name`, [h.schema])).rows.map(row => row.table_name);
    assert.deepEqual(candidateTables,
      ["operation_authorities", "workspace_effect_claims", "workspace_publication_authorities"]);
    const constraints = (await pool.query(`SELECT table_name,constraint_type FROM information_schema.table_constraints
      WHERE table_schema=$1 AND table_name IN
        ('operation_authorities','workspace_effect_claims','workspace_publication_authorities')`,
    [h.schema])).rows;
    for (const table of candidateTables) {
      assert.equal(constraints.some(row => row.table_name === table && row.constraint_type === "PRIMARY KEY"), true);
      assert.equal(constraints.some(row => row.table_name === table && row.constraint_type === "FOREIGN KEY"), true);
      assert.equal(constraints.some(row => row.table_name === table && row.constraint_type === "CHECK"), true);
    }
    const unvalidatedConstraintCount = (await pool.query(`SELECT count(*) AS count
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS table_row ON table_row.oid=constraint_row.conrelid
      JOIN pg_namespace AS namespace_row ON namespace_row.oid=table_row.relnamespace
      WHERE namespace_row.nspname=$1 AND table_row.relname IN
        ('operation_authorities','workspace_effect_claims','workspace_publication_authorities')
        AND NOT constraint_row.convalidated`, [h.schema])).rows[0].count;
    assert.equal(unvalidatedConstraintCount, "0");
    const triggers = new Set((await pool.query(`SELECT event_object_table,trigger_name
      FROM information_schema.triggers WHERE trigger_schema=$1`, [h.schema])).rows
      .map(row => `${row.event_object_table}:${row.trigger_name}`));
    for (const trigger of [
      "operation_authorities:operation_authorities_immutable",
      "workspace_effect_claims:workspace_effect_claims_immutable",
      "workspace_effect_claims:workspace_effect_claim_no_delete",
      "workspace_publication_authorities:workspace_publication_authorities_immutable",
      "workspace_publication_authorities:workspace_publication_authority_no_delete",
    ]) assert.equal(triggers.has(trigger), true);
    const migrationEvents = (await pool.query(`SELECT event_type,payload_sha256 FROM ${h.sqlSchema}.outbox
      WHERE record_id=$1`, [legacyWorkspace.workspaceId])).rows;
    assert.equal(migrationEvents.some(row => row.event_type === "workspace-operation-authority-migration-unknown"), true);
    assert.equal(migrationEvents.every(row => /^[a-f0-9]{64}$/u.test(row.payload_sha256)), true);

    const connected = await h.connect("signed", h.baseContext, "1");
    const admission = await h.store.admitMaterializationRequest(h.baseContext,
      { sourceId: connected.result.source.sourceId, operationMode: "public-git" });
    assert.equal(admission.disposition, "absent");
    const authority = h.issueAuthority();
    const invalidAuthorities = [
      recomputedUnsignedCandidateAuthority(authority),
      publicGitOperationAuthoritySchema.parse({ ...authority,
        attestation: { ...authority.attestation, signingKeyVersion: 2 } }),
      publicGitOperationAuthoritySchema.parse({ ...authority,
        attestation: { ...authority.attestation, watchdogIdentitySha256: sha("d") } }),
    ];
    for (const invalidAuthority of invalidAuthorities) {
      const before = await h.snapshot();
      await assert.rejects(h.store.beginMaterialization(h.baseContext, {
        sourceId: connected.result.source.sourceId,
        requestScopeDigest: admission.requestScopeDigest,
        operationAuthority: invalidAuthority,
      }), error => error.code === "watchdog-operation-authority-attestation-invalid");
      assert.equal(await h.snapshot(), before);
    }
    const expiredAuthority = h.issueAuthority({
      requestedAt: "2026-09-04T13:00:00.000Z",
      deadlineAt: "2026-09-04T13:02:00.000Z",
    });
    const beforeExpired = await h.snapshot();
    await assert.rejects(h.store.beginMaterialization(h.baseContext, {
      sourceId: connected.result.source.sourceId,
      requestScopeDigest: admission.requestScopeDigest,
      operationAuthority: expiredAuthority,
    }), error => error.code === "workspace-operation-authority-invalid");
    assert.equal(await h.snapshot(), beforeExpired);
    const begun = await h.store.beginMaterialization(h.baseContext, {
      sourceId: connected.result.source.sourceId,
      requestScopeDigest: admission.requestScopeDigest,
      operationAuthority: authority,
    });
    assert.equal(begun.created, true);
    assert.equal(begun.disposition, "created");
    const afterCommit = await h.snapshot();
    const replay = await h.store.beginMaterialization(h.baseContext, {
      sourceId: connected.result.source.sourceId,
      requestScopeDigest: admission.requestScopeDigest,
      operationAuthority: authority,
    });
    assert.equal(replay.created, false);
    assert.equal(replay.disposition, "exact-replay");
    assert.equal(await h.snapshot(), afterCommit);
    const responseLossLookup = await h.createStore().lookupMaterializationByOperation(h.baseContext,
      { operationId: authority.operationId, authorityDigest: authority.authorityDigest });
    assert.equal(responseLossLookup.found, true);
    assert.equal(responseLossLookup.operationAuthority.authorityDigest, authority.authorityDigest);
    assert.equal(responseLossLookup.workspace.workspaceId, begun.workspace.workspaceId);

    const raceContext = h.context("race");
    const raceConnection = await h.connect("race", raceContext, "2");
    const raceAdmission = await h.store.admitMaterializationRequest(raceContext,
      { sourceId: raceConnection.result.source.sourceId, operationMode: "public-git" });
    const raceAuthorities = [h.issueAuthority(), h.issueAuthority()];
    const raceResults = await Promise.all(raceAuthorities.map(operationAuthority =>
      h.store.beginMaterialization(raceContext, { sourceId: raceConnection.result.source.sourceId,
        requestScopeDigest: raceAdmission.requestScopeDigest, operationAuthority })));
    assert.deepEqual(raceResults.map(result => result.disposition).sort(),
      ["converged-existing", "created"]);
    assert.equal((await pool.query(`SELECT count(*) AS count FROM ${h.sqlSchema}.operation_authorities
      WHERE principal_id=$1 AND project_id=$2 AND source_id=$3`,
    [raceContext.principalId, raceContext.projectId, raceConnection.result.source.sourceId])).rows[0].count, "1");

    const foreignContext = h.context("foreign");
    const beforeForeign = await h.snapshot();
    await assert.rejects(h.store.admitMaterializationRequest(foreignContext,
      { sourceId: connected.result.source.sourceId, operationMode: "public-git" }),
    error => error.code === "workspace-source-selection-denied");
    assert.deepEqual(await h.store.lookupMaterializationByOperation(foreignContext,
      { operationId: authority.operationId, authorityDigest: authority.authorityDigest }),
    { found: false, disposition: "absent" });
    assert.equal(await h.snapshot(), beforeForeign);
    const otherSource = await h.connect("cross-source", h.baseContext, "3");
    const beforeCrossSource = await h.snapshot();
    await assert.rejects(h.store.beginMaterialization(h.baseContext, {
      sourceId: otherSource.result.source.sourceId,
      requestScopeDigest: admission.requestScopeDigest,
      operationAuthority: h.issueAuthority(),
    }), error => error.code === "workspace-request-scope-stale");
    assert.equal(await h.snapshot(), beforeCrossSource);

    const retainedContext = h.context("retained");
    const retained = await h.start("retained", retainedContext, "4");
    const advancedSource = (await h.store.recordSourceConnected(retainedContext,
      h.sourceIdentity(retained.source))).source;
    const retainedAdmission = await h.store.admitMaterializationRequest(retainedContext,
      { sourceId: advancedSource.sourceId, operationMode: "public-git" });
    assert.equal(retainedAdmission.disposition, "reconciliation-required");
    assert.equal(retainedAdmission.operationId, retained.operationAuthority.operationId);
    assert.equal(retainedAdmission.authorityDigest, retained.operationAuthority.authorityDigest);
    await assert.rejects(h.store.admitMaterializationRequest(foreignContext,
      { sourceId: advancedSource.sourceId, operationMode: "public-git" }),
    error => error.code === "workspace-source-selection-denied");

    const rollbackContext = h.context("rollback");
    const rollbackConnection = await h.connect("rollback", rollbackContext, "5");
    const rollbackAdmission = await h.store.admitMaterializationRequest(rollbackContext,
      { sourceId: rollbackConnection.result.source.sourceId, operationMode: "public-git" });
    await pool.query(`ALTER TABLE ${h.sqlSchema}.outbox ADD CONSTRAINT candidate_begin_outbox_fault
      CHECK (event_type <> 'workspace-authority-intent-recorded') NOT VALID`);
    const beforeRollback = await h.snapshot();
    await assert.rejects(h.store.beginMaterialization(rollbackContext, {
      sourceId: rollbackConnection.result.source.sourceId,
      requestScopeDigest: rollbackAdmission.requestScopeDigest,
      operationAuthority: h.issueAuthority(),
    }));
    assert.equal(await h.snapshot(), beforeRollback);
    await pool.query(`ALTER TABLE ${h.sqlSchema}.outbox DROP CONSTRAINT candidate_begin_outbox_fault`);
  });

test(`${CANDIDATE_TEST_PREFIX} effect and publication CAS, ready atomicity, and durable tamper denial`,
  { timeout: 180_000 }, async t => {
    const h = await candidateFixture(t, "publication");

    const claimFault = await h.start("claim-fault", h.context("claim-fault"), "b");
    await pool.query(`ALTER TABLE ${h.sqlSchema}.outbox ADD CONSTRAINT candidate_claim_outbox_fault
      CHECK (event_type <> 'workspace-git-fetch-claimed') NOT VALID`);
    const beforeClaimFault = await h.snapshot();
    try {
      await assert.rejects(h.store.claimEffect(claimFault.context, {
        operationId: claimFault.operationAuthority.operationId,
        authorityDigest: claimFault.operationAuthority.authorityDigest,
        effect: "git-fetch", expectedWorkspaceRevision: 1,
      }), error => error.constraint === "candidate_claim_outbox_fault");
      assert.equal(await h.snapshot(), beforeClaimFault);
    } finally {
      await pool.query(`ALTER TABLE ${h.sqlSchema}.outbox DROP CONSTRAINT candidate_claim_outbox_fault`);
    }

    const stageFault = await h.start("stage-fault", h.context("stage-fault"), "c");
    const stageFaultFetch = await h.store.claimEffect(stageFault.context, {
      operationId: stageFault.operationAuthority.operationId,
      authorityDigest: stageFault.operationAuthority.authorityDigest,
      effect: "git-fetch", expectedWorkspaceRevision: 1,
    });
    const stageFaultBundle = h.publicationBundle(stageFault.workspace);
    const stageFaultInput = { ...h.identity(stageFault.workspace, 1),
      operationAuthorityDigest: stageFault.operationAuthority.authorityDigest,
      fetchClaim: stageFaultFetch.claim,
      workspaceManifest: stageFaultBundle.stagingManifest,
      publicationAuthorityManifest: stageFaultBundle.authorityManifest,
      publicationResources: stageFaultBundle.resources };
    await pool.query(`ALTER TABLE ${h.sqlSchema}.outbox ADD CONSTRAINT candidate_staging_outbox_fault
      CHECK (event_type <> 'workspace-staging-authorized') NOT VALID`);
    const beforeStageFault = await h.snapshot();
    try {
      await assert.rejects(h.store.recordStaging(stageFault.context, stageFaultInput),
        error => error.constraint === "candidate_staging_outbox_fault");
      assert.equal(await h.snapshot(), beforeStageFault);
    } finally {
      await pool.query(`ALTER TABLE ${h.sqlSchema}.outbox DROP CONSTRAINT candidate_staging_outbox_fault`);
    }

    const publicationClaimFault = await h.stage(
      await h.start("publication-claim-fault", h.context("publication-claim-fault"), "d"));
    await pool.query(`ALTER TABLE ${h.sqlSchema}.outbox ADD CONSTRAINT candidate_publication_claim_outbox_fault
      CHECK (event_type <> 'workspace-publication-claimed') NOT VALID`);
    const beforePublicationClaimFault = await h.snapshot();
    try {
      await assert.rejects(h.store.claimEffect(publicationClaimFault.context, {
        operationId: publicationClaimFault.operationAuthority.operationId,
        authorityDigest: publicationClaimFault.operationAuthority.authorityDigest,
        effect: "publication", expectedWorkspaceRevision: 2,
      }), error => error.constraint === "candidate_publication_claim_outbox_fault");
      assert.equal(await h.snapshot(), beforePublicationClaimFault);
    } finally {
      await pool.query(`ALTER TABLE ${h.sqlSchema}.outbox
        DROP CONSTRAINT candidate_publication_claim_outbox_fault`);
    }

    const publishFault = await h.stage(
      await h.start("publish-fault", h.context("publish-fault"), "e"));
    await h.store.claimEffect(publishFault.context, {
      operationId: publishFault.operationAuthority.operationId,
      authorityDigest: publishFault.operationAuthority.authorityDigest,
      effect: "publication", expectedWorkspaceRevision: 2,
    });
    await pool.query(`ALTER TABLE ${h.sqlSchema}.outbox ADD CONSTRAINT candidate_publish_outbox_fault
      CHECK (event_type <> 'workspace-published-pending-db') NOT VALID`);
    const beforePublishFault = await h.snapshot();
    try {
      await assert.rejects(h.publish(publishFault),
        error => error.constraint === "candidate_publish_outbox_fault");
      assert.equal(await h.snapshot(), beforePublishFault);
    } finally {
      await pool.query(`ALTER TABLE ${h.sqlSchema}.outbox DROP CONSTRAINT candidate_publish_outbox_fault`);
    }

    const setup = await h.start("ready", h.baseContext, "6");
    const fetchInput = { operationId: setup.operationAuthority.operationId,
      authorityDigest: setup.operationAuthority.authorityDigest, effect: "git-fetch",
      expectedWorkspaceRevision: 1 };
    const fetchResults = await Promise.all([
      h.store.claimEffect(setup.context, fetchInput),
      h.store.claimEffect(setup.context, fetchInput),
    ]);
    assert.deepEqual(fetchResults.map(result => result.created).sort(), [false, true]);
    assert.equal(fetchResults[0].claim.claimId, fetchResults[1].claim.claimId);

    const staged = await h.stage(setup);
    assert.equal(staged.workspace.publicationAuthority.state, "staging-authorized");
    assert.deepEqual(staged.workspace.publicationAuthority.authorityManifest, staged.bundle.authorityManifest);
    assert.deepEqual([
      staged.workspace.publicationAuthority.parentResourceId,
      staged.workspace.publicationAuthority.ingressRootResourceId,
      staged.workspace.publicationAuthority.stagingRootResourceId,
    ], [staged.bundle.resources.parentResourceId, staged.bundle.resources.ingressRootResourceId,
      staged.bundle.resources.stagingRootResourceId]);
    const afterStaging = await h.snapshot();
    const stagingReplay = await h.store.recordStaging(staged.context, staged.stagingInput);
    assert.equal(stagingReplay.changed, false);
    assert.equal(await h.snapshot(), afterStaging);
    const publicationInput = { operationId: staged.operationAuthority.operationId,
      authorityDigest: staged.operationAuthority.authorityDigest, effect: "publication",
      expectedWorkspaceRevision: 2 };
    const publicationClaims = await Promise.all([
      h.store.claimEffect(staged.context, publicationInput),
      h.store.claimEffect(staged.context, publicationInput),
    ]);
    assert.deepEqual(publicationClaims.map(result => result.created).sort(), [false, true]);
    assert.equal(publicationClaims[0].claim.claimId, publicationClaims[1].claim.claimId);

    const published = await h.publish(staged);
    assert.equal(published.workspace.publicationAuthority.state, "published-observed");
    assert.equal(published.workspace.publicationAuthority.publicationClaim.state, "observed");
    const afterPublished = await h.snapshot();
    const publishedReplay = await h.store.recordPublishedPendingDb(published.context, published.publishedInput);
    assert.equal(publishedReplay.changed, false);
    assert.equal(await h.snapshot(), afterPublished);

    const workspaceReceipt = h.receipt(published.workspace, "ready");
    const terminalReceipt = h.operationReceipt(published.workspace, workspaceReceipt, 4);
    const readyInput = { ...h.identity(published.workspace, 3),
      operationAuthorityDigest: published.operationAuthority.authorityDigest,
      receipt: workspaceReceipt, operationReceipt: terminalReceipt,
      workspaceManifestRaw: canonicalStringify(published.finalManifest) };
    await pool.query(`ALTER TABLE ${h.sqlSchema}.outbox ADD CONSTRAINT candidate_ready_outbox_fault
      CHECK (event_type <> 'workspace-ready') NOT VALID`);
    const beforeReadyFault = await h.snapshot();
    await assert.rejects(h.store.recordReady(published.context, readyInput));
    assert.equal(await h.snapshot(), beforeReadyFault);
    await pool.query(`ALTER TABLE ${h.sqlSchema}.outbox DROP CONSTRAINT candidate_ready_outbox_fault`);
    const readyWorkspace = await h.store.recordReady(published.context, readyInput);
    assert.equal(readyWorkspace.lifecycle, "ready");
    assert.equal(readyWorkspace.revision, 4);
    const afterReady = await h.snapshot();
    const readyReplay = await h.store.recordReady(published.context, readyInput);
    assert.equal(readyReplay.changed, false);
    assert.equal(await h.snapshot(), afterReady);

    const lookupInput = { operationId: setup.operationAuthority.operationId,
      authorityDigest: setup.operationAuthority.authorityDigest };
    const retained = await h.createStore().lookupMaterializationByOperation(setup.context, lookupInput);
    assert.equal(retained.found, true);
    assert.equal(retained.workspace.lifecycle, "ready");
    assert.deepEqual(retained.effectClaims.map(claim => [claim.effect, claim.state]),
      [["git-fetch", "observed"], ["publication", "observed"]]);
    assert.equal(retained.publicationAuthority.state, "published-observed");
    assert.equal(retained.publicationAuthority.workspaceRevision, 4);
    assert.equal(canonicalSha256(retained.workspaceReceipt), canonicalSha256(workspaceReceipt));
    assert.equal(canonicalSha256(retained.operationReceipt), canonicalSha256(terminalReceipt));
    const readyRows = (await pool.query(`SELECT
        (SELECT count(*) FROM ${h.sqlSchema}.workspace_receipts WHERE workspace_id=$1) AS workspace_receipts,
        (SELECT count(*) FROM ${h.sqlSchema}.operation_receipts WHERE workspace_id=$1) AS operation_receipts,
        (SELECT count(*) FROM ${h.sqlSchema}.workspace_effect_claims WHERE operation_id=$2) AS claims,
        (SELECT count(*) FROM ${h.sqlSchema}.workspace_publication_authorities WHERE operation_id=$2) AS publications`,
    [readyWorkspace.workspaceId, setup.operationAuthority.operationId])).rows[0];
    assert.deepEqual(readyRows,
      { workspace_receipts: "1", operation_receipts: "1", claims: "2", publications: "1" });
    const outbox = (await pool.query(`SELECT event_type,payload_sha256 FROM ${h.sqlSchema}.outbox
      WHERE record_id IN ($1,$2) ORDER BY sequence`,
    [readyWorkspace.workspaceId, setup.operationAuthority.operationId])).rows;
    assert.equal(outbox.every(row => /^[a-f0-9]{64}$/u.test(row.payload_sha256)), true);
    assert.equal(outbox.some(row => row.event_type === "workspace-ready"
      && row.payload_sha256 === canonicalSha256(terminalReceipt)), true);

    await assert.rejects(pool.query(`UPDATE ${h.sqlSchema}.operation_authorities
      SET topology_digest=$2 WHERE operation_id=$1`, [setup.operationAuthority.operationId, sha("e")]),
    /operation authorities are immutable/u);
    const authorityRow = (await pool.query(`SELECT authority_envelope,authority_envelope_sha256
      FROM ${h.sqlSchema}.operation_authorities WHERE operation_id=$1`,
    [setup.operationAuthority.operationId])).rows[0];
    await pool.query(`ALTER TABLE ${h.sqlSchema}.operation_authorities
      DISABLE TRIGGER operation_authorities_immutable`);
    try {
      await pool.query(`UPDATE ${h.sqlSchema}.operation_authorities SET authority_envelope='{}'::jsonb
        WHERE operation_id=$1`, [setup.operationAuthority.operationId]);
      await assert.rejects(h.createStore().lookupMaterializationByOperation(setup.context, lookupInput),
        error => error.code === "workspace-operation-authority-invalid");
      await pool.query(`UPDATE ${h.sqlSchema}.operation_authorities
        SET authority_envelope=$2::jsonb,authority_envelope_sha256=$3 WHERE operation_id=$1`,
      [setup.operationAuthority.operationId, JSON.stringify(authorityRow.authority_envelope),
        authorityRow.authority_envelope_sha256]);
    } finally {
      await pool.query(`ALTER TABLE ${h.sqlSchema}.operation_authorities
        ENABLE TRIGGER operation_authorities_immutable`);
    }
    assert.equal((await h.createStore().lookupMaterializationByOperation(setup.context, lookupInput)).found, true);

    const effectClaimRows = Object.fromEntries((await pool.query(`SELECT *
      FROM ${h.sqlSchema}.workspace_effect_claims WHERE operation_id=$1`,
    [setup.operationAuthority.operationId])).rows.map(row => [row.effect, row]));
    const effectClaimMutations = [
      ["git-fetch", "state", "claimed"],
      ["git-fetch", "claim_digest", sha("e")],
      ["publication", "state", "claimed"],
    ];
    await pool.query(`ALTER TABLE ${h.sqlSchema}.workspace_effect_claims
      DISABLE TRIGGER workspace_effect_claims_immutable`);
    try {
      for (const [effect, column, forgedValue] of effectClaimMutations) {
        try {
          await pool.query(`UPDATE ${h.sqlSchema}.workspace_effect_claims SET ${column}=$3
            WHERE operation_id=$1 AND effect=$2`,
          [setup.operationAuthority.operationId, effect, forgedValue]);
          await assert.rejects(h.createStore().lookupMaterializationByOperation(setup.context, lookupInput),
            error => ["workspace-effect-claim-authority-invalid", "workspace-publication-authority-invalid"]
              .includes(error.code));
        } finally {
          await pool.query(`UPDATE ${h.sqlSchema}.workspace_effect_claims SET ${column}=$3
            WHERE operation_id=$1 AND effect=$2`,
          [setup.operationAuthority.operationId, effect, effectClaimRows[effect][column]]);
        }
      }
    } finally {
      await pool.query(`ALTER TABLE ${h.sqlSchema}.workspace_effect_claims
        ENABLE TRIGGER workspace_effect_claims_immutable`);
    }
    assert.equal((await h.createStore().lookupMaterializationByOperation(setup.context, lookupInput)).found, true);

    const missingPublication = await h.stage(
      await h.start("missing-publication", h.context("missing-publication"), "e"));
    const missingPublicationLookup = { operationId: missingPublication.operationAuthority.operationId,
      authorityDigest: missingPublication.operationAuthority.authorityDigest };
    const backupClient = await pool.connect();
    try {
      await backupClient.query(`CREATE TEMP TABLE candidate_publication_backup ON COMMIT PRESERVE ROWS AS
        SELECT * FROM ${h.sqlSchema}.workspace_publication_authorities WHERE operation_id=$1`,
      [missingPublication.operationAuthority.operationId]);
      await backupClient.query(`ALTER TABLE ${h.sqlSchema}.workspace_publication_authorities
        DISABLE TRIGGER workspace_publication_authority_no_delete`);
      try {
        await backupClient.query(`DELETE FROM ${h.sqlSchema}.workspace_publication_authorities
          WHERE operation_id=$1`, [missingPublication.operationAuthority.operationId]);
        await assert.rejects(h.createStore().lookupMaterializationByOperation(
          missingPublication.context, missingPublicationLookup),
        error => error.code === "workspace-publication-authority-invalid");
      } finally {
        try {
          await backupClient.query(`INSERT INTO ${h.sqlSchema}.workspace_publication_authorities
            SELECT * FROM candidate_publication_backup ON CONFLICT DO NOTHING`);
        } finally {
          await backupClient.query(`ALTER TABLE ${h.sqlSchema}.workspace_publication_authorities
            ENABLE TRIGGER workspace_publication_authority_no_delete`);
        }
      }
    } finally { backupClient.release(); }
    assert.equal((await h.createStore().lookupMaterializationByOperation(
      missingPublication.context, missingPublicationLookup)).found, true);

    await assert.rejects(pool.query(`UPDATE ${h.sqlSchema}.workspace_effect_claims
      SET claim_id=$2 WHERE operation_id=$1 AND effect='git-fetch'`,
    [setup.operationAuthority.operationId, "claim_candidate_forged_0001"]),
    /workspace effect claim identity is immutable/u);
    await assert.rejects(pool.query(`UPDATE ${h.sqlSchema}.workspace_publication_authorities
      SET workspace_id=$2 WHERE operation_id=$1`,
    [setup.operationAuthority.operationId, "workspace-00000000-0000-4000-8000-000000000000"]),
    /workspace publication authority is immutable/u);
    for (const [column, value] of [
      ["operation_id", "operation-candidate-forged-0001"],
      ["parent_resource_id", "parent_candidate_forged_0001"],
      ["ingress_root_resource_id", "ingress_candidate_forged_0001"],
      ["staging_root_resource_id", "staging_candidate_forged_0001"],
    ]) {
      await assert.rejects(pool.query(`UPDATE ${h.sqlSchema}.workspace_publication_authorities
        SET ${column}=$2 WHERE operation_id=$1`, [setup.operationAuthority.operationId, value]),
      /workspace publication authority is immutable/u);
    }

    const publicationRow = (await pool.query(`SELECT * FROM ${h.sqlSchema}.workspace_publication_authorities
      WHERE operation_id=$1`, [setup.operationAuthority.operationId])).rows[0];
    const mutations = [
      ["principal_id", "candidate-forged-principal", "text"],
      ["project_id", "candidate-forged-project", "text"],
      ["workspace_revision", 5, "number"],
      ["operation_authority_digest", sha("e"), "text"],
      ["request_digest", sha("e"), "text"],
      ["binding_digest", sha("e"), "text"],
      ["authority_manifest", {}, "jsonb"],
      ["authority_envelope_sha256", sha("e"), "text"],
      ["authority_manifest_digest", sha("e"), "text"],
      ["parent_resource_id", "bad", "text"],
      ["ingress_root_resource_id", "bad", "text"],
      ["staging_root_resource_id", "bad", "text"],
      ["parent_resource_id", publicationRow.ingress_root_resource_id, "text"],
      ["parent_resource_id", "parent_candidate_alternate_0001", "text"],
      ["ingress_root_resource_id", "ingress_candidate_alternate_0001", "text"],
      ["staging_root_resource_id", "staging_candidate_alternate_0001", "text"],
      ["parent_volume_serial", "aaaaaaaa", "text"],
      ["parent_file_id", "aaaaaaaaaaaaaaaa", "text"],
      ["staging_name", `staging_${sha("e").slice(0, 32)}`, "text"],
      ["staging_volume_serial", "aaaaaaaa", "text"],
      ["staging_file_id", "aaaaaaaaaaaaaaaa", "text"],
      ["final_name", `workspace_${sha("e").slice(0, 32)}`, "text"],
      ["final_volume_serial", "aaaaaaaa", "text"],
      ["final_file_id", "aaaaaaaaaaaaaaaa", "text"],
      ["publication_claim_id", "claim_candidate_forged_0001", "text"],
      ["publication_claim_revision", 2, "number"],
      ["observed_final_identity", { volumeSerial: "aaaaaaaa", fileId: "aaaaaaaaaaaaaaaa" }, "jsonb"],
      ["observed_final_digest", sha("e"), "text"],
      ["state", "publication-claimed", "text"],
      ["state_revision", publicationRow.state_revision + 1, "number"],
    ];
    await pool.query(`ALTER TABLE ${h.sqlSchema}.workspace_publication_authorities
      DISABLE TRIGGER workspace_publication_authorities_immutable`);
    try {
      const forgedManifest = { ...staged.bundle.authorityManifest, workspaceManifestDigest: sha("e") };
      const forgedEnvelope = h.store.encode("publication-authority", setup.context,
        readyWorkspace.workspaceId, {
          schemaVersion: "runa-workspace-publication-authority-envelope/v1",
          authorityManifest: forgedManifest,
          publicationResources: staged.bundle.resources,
        });
      await pool.query(`UPDATE ${h.sqlSchema}.workspace_publication_authorities
        SET authority_manifest=$2::jsonb,authority_envelope_sha256=$3,authority_manifest_digest=$4
        WHERE operation_id=$1`, [setup.operationAuthority.operationId, JSON.stringify(forgedEnvelope),
        canonicalSha256(forgedEnvelope), canonicalSha256(forgedManifest)]);
      await assert.rejects(h.createStore().lookupMaterializationByOperation(setup.context, lookupInput),
        error => error.code === "workspace-publication-authority-invalid");
      await pool.query(`UPDATE ${h.sqlSchema}.workspace_publication_authorities
        SET authority_manifest=$2::jsonb,authority_envelope_sha256=$3,authority_manifest_digest=$4
        WHERE operation_id=$1`, [setup.operationAuthority.operationId,
        JSON.stringify(publicationRow.authority_manifest), publicationRow.authority_envelope_sha256,
        publicationRow.authority_manifest_digest]);
      for (const [column, forged, type] of mutations) {
        const cast = type === "jsonb" ? "::jsonb" : "";
        const forgedValue = type === "jsonb" ? JSON.stringify(forged) : forged;
        const originalValue = type === "jsonb" ? JSON.stringify(publicationRow[column]) : publicationRow[column];
        try {
          await pool.query(`UPDATE ${h.sqlSchema}.workspace_publication_authorities
            SET ${column}=$2${cast} WHERE operation_id=$1`,
          [setup.operationAuthority.operationId, forgedValue]);
          await assert.rejects(h.createStore().lookupMaterializationByOperation(setup.context, lookupInput),
            error => error.code === "workspace-publication-authority-invalid");
        } finally {
          await pool.query(`UPDATE ${h.sqlSchema}.workspace_publication_authorities
            SET ${column}=$2${cast} WHERE operation_id=$1`,
          [setup.operationAuthority.operationId, originalValue]);
        }
        assert.equal((await h.createStore().lookupMaterializationByOperation(setup.context, lookupInput)).found, true);
      }
    } finally {
      await pool.query(`ALTER TABLE ${h.sqlSchema}.workspace_publication_authorities
        ENABLE TRIGGER workspace_publication_authorities_immutable`);
    }
  });

test(`${CANDIDATE_TEST_PREFIX} restart lookup preserves every candidate lifecycle branch`,
  { timeout: 180_000 }, async t => {
    const h = await candidateFixture(t, "restart");
    const branches = [];
    const add = (name, setup, expected = {}) => branches.push({ name, setup,
      expectedPublicationState: null, expectedClaimStates: [], expectedWorkspaceReceipt: false,
      expectedOperationReceipt: false, expectedStoredPublicationState: null, ...expected });

    const intent = await h.start("intent", h.context("intent"), "1");
    add("intent-recorded", intent);

    const fetchClaimed = await h.start("fetch-claimed", h.context("fetch-claimed"), "1");
    const retainedFetchClaim = await h.store.claimEffect(fetchClaimed.context, {
      operationId: fetchClaimed.operationAuthority.operationId,
      authorityDigest: fetchClaimed.operationAuthority.authorityDigest,
      effect: "git-fetch", expectedWorkspaceRevision: 1 });
    add("intent-recorded", { ...fetchClaimed, fetch: retainedFetchClaim },
      { expectedClaimStates: [["git-fetch", "claimed"]] });

    const staged = await h.stage(await h.start("staging", h.context("staging"), "2"));
    add("staging", staged, { expectedPublicationState: "staging-authorized",
      expectedClaimStates: [["git-fetch", "observed"]] });

    const claimed = await h.stage(await h.start("claimed", h.context("claimed"), "3"));
    const claimedPublication = await h.store.claimEffect(claimed.context, {
      operationId: claimed.operationAuthority.operationId,
      authorityDigest: claimed.operationAuthority.authorityDigest,
      effect: "publication", expectedWorkspaceRevision: 2 });
    add("staging", { ...claimed, publication: claimedPublication },
      { expectedPublicationState: "publication-claimed",
        expectedClaimStates: [["git-fetch", "observed"], ["publication", "claimed"]] });

    const published = await h.publish(await h.stage(
      await h.start("published", h.context("published"), "4")));
    add("published-pending-db", published, { expectedPublicationState: "published-observed",
      expectedClaimStates: [["git-fetch", "observed"], ["publication", "observed"]] });

    const ready = await h.makeReady(await h.publish(await h.stage(
      await h.start("ready", h.context("ready"), "5"))));
    add("ready", ready, { expectedPublicationState: "published-observed",
      expectedClaimStates: [["git-fetch", "observed"], ["publication", "observed"]],
      expectedWorkspaceReceipt: true, expectedOperationReceipt: true });

    const failed = await h.stage(await h.start("failed", h.context("failed"), "6"));
    failed.workspace = await h.store.recordFailed(failed.context, { ...h.identity(failed.workspace, 2),
      operationAuthorityDigest: failed.operationAuthority.authorityDigest,
      receipt: h.receipt(failed.workspace, "failed") });
    add("failed", failed, { expectedPublicationState: "unknown",
      expectedStoredPublicationState: "unknown", expectedClaimStates: [["git-fetch", "observed"]],
      expectedWorkspaceReceipt: true });

    const cancelled = await h.stage(await h.start("cancelled", h.context("cancelled"), "7"));
    cancelled.workspace = await h.store.recordCancelled(cancelled.context,
      { ...h.identity(cancelled.workspace, 2),
        operationAuthorityDigest: cancelled.operationAuthority.authorityDigest,
        receipt: h.receipt(cancelled.workspace, "cancelled") });
    add("cancelled", cancelled, { expectedPublicationState: "unknown",
      expectedStoredPublicationState: "unknown", expectedClaimStates: [["git-fetch", "observed"]],
      expectedWorkspaceReceipt: true });

    const unknown = await h.start("unknown", h.context("unknown"), "8");
    unknown.workspace = await h.store.recordUnknown(unknown.context, { ...h.identity(unknown.workspace, 1),
      operationAuthorityDigest: unknown.operationAuthority.authorityDigest,
      receipt: h.receipt(unknown.workspace, "unknown") });
    add("unknown", unknown, { expectedWorkspaceReceipt: true });

    const unknownStaging = await h.stage(
      await h.start("unknown-staging", h.context("unknown-staging"), "8"));
    unknownStaging.workspace = await h.store.recordUnknown(unknownStaging.context,
      { ...h.identity(unknownStaging.workspace, 2),
        operationAuthorityDigest: unknownStaging.operationAuthority.authorityDigest,
        receipt: h.receipt(unknownStaging.workspace, "unknown") });
    add("unknown", unknownStaging, { expectedPublicationState: "unknown",
      expectedStoredPublicationState: "unknown", expectedClaimStates: [["git-fetch", "observed"]],
      expectedWorkspaceReceipt: true });

    const unknownClaimed = await h.stage(
      await h.start("unknown-claimed", h.context("unknown-claimed"), "8"));
    await h.store.claimEffect(unknownClaimed.context, {
      operationId: unknownClaimed.operationAuthority.operationId,
      authorityDigest: unknownClaimed.operationAuthority.authorityDigest,
      effect: "publication", expectedWorkspaceRevision: 2 });
    unknownClaimed.workspace = await h.store.recordUnknown(unknownClaimed.context,
      { ...h.identity(unknownClaimed.workspace, 2),
        operationAuthorityDigest: unknownClaimed.operationAuthority.authorityDigest,
        receipt: h.receipt(unknownClaimed.workspace, "unknown") });
    add("unknown", unknownClaimed, { expectedPublicationState: "unknown",
      expectedStoredPublicationState: "unknown",
      expectedClaimStates: [["git-fetch", "observed"], ["publication", "failed-unknown"]],
      expectedWorkspaceReceipt: true });

    const unknownPublished = await h.publish(await h.stage(
      await h.start("unknown-published", h.context("unknown-published"), "8")));
    unknownPublished.workspace = await h.store.recordUnknown(unknownPublished.context,
      { ...h.identity(unknownPublished.workspace, 3),
        operationAuthorityDigest: unknownPublished.operationAuthority.authorityDigest,
        receipt: h.receipt(unknownPublished.workspace, "unknown") });
    add("unknown", unknownPublished, { expectedPublicationState: "unknown",
      expectedStoredPublicationState: "unknown",
      expectedClaimStates: [["git-fetch", "observed"], ["publication", "observed"]],
      expectedWorkspaceReceipt: true });

    const cleanupPending = await h.publish(await h.stage(
      await h.start("cleanup", h.context("cleanup"), "9")));
    cleanupPending.workspace = await h.store.recordUnknown(cleanupPending.context,
      { ...h.identity(cleanupPending.workspace, 3),
        operationAuthorityDigest: cleanupPending.operationAuthority.authorityDigest,
        receipt: h.receipt(cleanupPending.workspace, "unknown") });
    cleanupPending.workspace = await h.store.recordCleanupPending(cleanupPending.context,
      { ...h.identity(cleanupPending.workspace, 4), evidenceDigest: sha("e"),
        receipt: h.receipt(cleanupPending.workspace, "cleanup-pending") });
    add("cleanup-pending", cleanupPending, { expectedPublicationState: "unknown",
      expectedStoredPublicationState: "unknown",
      expectedClaimStates: [["git-fetch", "observed"], ["publication", "observed"]],
      expectedWorkspaceReceipt: true });

    const expired = await h.makeReady(await h.publish(await h.stage(
      await h.start("expired", h.context("expired"), "a"))));
    expired.workspace = await h.store.recordExpired(expired.context,
      { ...h.identity(expired.workspace, 4), evidenceDigest: sha("f") });
    add("expired", expired, { expectedStoredPublicationState: "published-observed",
      expectedClaimStates: [["git-fetch", "observed"], ["publication", "observed"]] });

    const reconciledReady = await h.publish(await h.stage(
      await h.start("reconciled-ready", h.context("reconciled-ready"), "b")));
    reconciledReady.workspace = await h.store.recordUnknown(reconciledReady.context,
      { ...h.identity(reconciledReady.workspace, 3),
        operationAuthorityDigest: reconciledReady.operationAuthority.authorityDigest,
        receipt: h.receipt(reconciledReady.workspace, "unknown") });
    const reconciledReadyReceipt = h.receipt(reconciledReady.workspace, "ready");
    const reconciledOperationReceipt = h.operationReceipt(
      reconciledReady.workspace, reconciledReadyReceipt, 5);
    reconciledReady.workspace = await h.store.reconcileUnknownReady(reconciledReady.context,
      { ...h.identity(reconciledReady.workspace, 4), receipt: reconciledReadyReceipt,
        operationReceipt: reconciledOperationReceipt,
        workspaceManifestRaw: canonicalStringify(reconciledReady.finalManifest) });
    add("ready", reconciledReady, { expectedPublicationState: "published-observed",
      expectedStoredPublicationState: "published-observed",
      expectedClaimStates: [["git-fetch", "observed"], ["publication", "observed"]],
      expectedWorkspaceReceipt: true, expectedOperationReceipt: true });

    const reconciledRemoved = await h.publish(await h.stage(
      await h.start("reconciled-removed", h.context("reconciled-removed"), "c")));
    reconciledRemoved.workspace = await h.store.recordUnknown(reconciledRemoved.context,
      { ...h.identity(reconciledRemoved.workspace, 3),
        operationAuthorityDigest: reconciledRemoved.operationAuthority.authorityDigest,
        receipt: h.receipt(reconciledRemoved.workspace, "unknown") });
    reconciledRemoved.workspace = await h.store.reconcileUnknownRemoved(reconciledRemoved.context,
      { ...h.identity(reconciledRemoved.workspace, 4), evidenceDigest: sha("d") });
    add("removed", reconciledRemoved, { expectedStoredPublicationState: "unknown",
      expectedClaimStates: [["git-fetch", "observed"], ["publication", "observed"]] });

    const removed = await h.makeReady(await h.publish(await h.stage(
      await h.start("removed", h.context("removed"), "d"))));
    removed.workspace = await h.store.recordExpired(removed.context,
      { ...h.identity(removed.workspace, 4), evidenceDigest: sha("e") });
    removed.workspace = await h.store.recordCleanupPending(removed.context,
      { ...h.identity(removed.workspace, 5), evidenceDigest: sha("f"),
        receipt: h.receipt(removed.workspace, "cleanup-pending") });
    removed.workspace = await h.store.recordRemoved(removed.context,
      { ...h.identity(removed.workspace, 6), evidenceDigest: sha("a") });
    add("removed", removed, { expectedStoredPublicationState: "published-observed",
      expectedClaimStates: [["git-fetch", "observed"], ["publication", "observed"]] });

    const beforeRestartReads = await h.snapshot();
    const restarted = h.createStore();
    await restarted.initialize();
    for (const branch of branches) {
      const lookup = await restarted.lookupMaterializationByOperation(branch.setup.context, {
        operationId: branch.setup.operationAuthority.operationId,
        authorityDigest: branch.setup.operationAuthority.authorityDigest,
      });
      assert.equal(lookup.found, true, branch.name);
      assert.equal(lookup.disposition, "exact", branch.name);
      assert.equal(lookup.workspace.lifecycle, branch.name, branch.name);
      assert.equal(lookup.workspace.workspaceId, branch.setup.workspace.workspaceId, branch.name);
      assert.equal(lookup.requestScopeDigest, branch.setup.admission.requestScopeDigest, branch.name);
      assert.equal(lookup.operationAuthority.authorityDigest,
        branch.setup.operationAuthority.authorityDigest, branch.name);
      assert.deepEqual(lookup.effectClaims.map(claim => [claim.effect, claim.state]),
        branch.expectedClaimStates, branch.name);
      assert.equal(lookup.publicationAuthority?.state ?? null,
        branch.expectedPublicationState, branch.name);
      if (lookup.publicationAuthority) {
        assert.equal(lookup.publicationAuthority.workspaceRevision, lookup.workspace.revision, branch.name);
        assert.equal(lookup.publicationAuthority.operationId,
          branch.setup.operationAuthority.operationId, branch.name);
      }
      assert.equal(lookup.workspaceReceipt !== null, branch.expectedWorkspaceReceipt, branch.name);
      assert.equal(lookup.operationReceipt !== null, branch.expectedOperationReceipt, branch.name);
      const storedPublicationRows = (await pool.query(`SELECT workspace_revision,state
        FROM ${h.sqlSchema}.workspace_publication_authorities WHERE operation_id=$1`,
      [branch.setup.operationAuthority.operationId])).rows;
      assert.equal(storedPublicationRows[0]?.state ?? null,
        branch.expectedStoredPublicationState ?? branch.expectedPublicationState, branch.name);
      if (storedPublicationRows.length === 1) {
        assert.equal(storedPublicationRows[0].workspace_revision, lookup.workspace.revision, branch.name);
      }
      const admission = await restarted.admitMaterializationRequest(branch.setup.context,
        { sourceId: branch.setup.source.sourceId, operationMode: "public-git" });
      assert.equal(admission.disposition, "existing", branch.name);
      assert.equal(admission.operationId, branch.setup.operationAuthority.operationId, branch.name);
      assert.equal(admission.authorityDigest, branch.setup.operationAuthority.authorityDigest, branch.name);
    }
    assert.equal(await h.snapshot(), beforeRestartReads);
  });
