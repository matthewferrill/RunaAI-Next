import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import pg from "pg";
import { startSyntheticPostgres } from "../synthetic-postgres.mjs";
import { testCipher } from "../../../gate4/fixtures.mjs";
import { canonicalStringify } from "./materialization-contracts.mjs";
import { PostgresServerWorkspaceStore } from "./postgres.mjs";
import { ServerWorkspaceService } from "./service.mjs";

const SYNTHETIC_POSTGRES_BOUNDS = Object.freeze({ statementTimeoutMs: 30_000, lockTimeoutMs: 5_000,
  idleInTransactionSessionTimeoutMs: 30_000, processExitTimeoutMs: 30_000, includeProcessEvidence: true });

test("real PostgreSQL retains encrypted scoped source authority and idempotent intent", async t => {
  const root = path.resolve(import.meta.dirname, "../../..");
  let database;
  let pool;
  t.after(async () => {
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
  database = await startSyntheticPostgres({
    toolRoot: process.env.RUNALAB_TOOL_ROOT ?? "D:/Projects/Runalab/artifacts/tools",
    artifactRoot: path.join(root, "artifacts/runs/m1-s2b1-postgres"),
    ...SYNTHETIC_POSTGRES_BOUNDS,
  });
  assert.equal(Number.isSafeInteger(database.postgresProcessId) && database.postgresProcessId > 0, true);
  pool = new pg.Pool({ connectionString: database.connectionString,
    connectionTimeoutMillis: 15_000, query_timeout: 20_000 });
  const context = { principalId: "alice", projectId: "project-alice", sessionId: "session-1" };
  const definition = { environmentId: "environment-control-01", displayName: "Sealed public fixture",
    repositoryHttpsUrl: "https://example.com/org/fixture.git", requestedRef: "main",
    expectedCommitOid: "a".repeat(40) };

  let store = new PostgresServerWorkspaceStore({ pool, cipher: testCipher() });
  await store.initialize();
  const operations = [];
  const service = new ServerWorkspaceService({ store, sourceDefinition: definition,
    authorizeContext: async (_context, operation) => { operations.push(operation); return true; } });
  await assert.rejects(service.connectPublicGit(context, { repositoryHttpsUrl: definition.repositoryHttpsUrl }));
  const connected = await service.connectPublicGit(context, {});
  assert.equal(connected.created, true);
  assert.equal(connected.source.lifecycle, "configured");
  assert.equal((await service.connectPublicGit(context, {})).created, false);
  assert.equal((await store.listSources(context)).length, 1);

  const beforeUnavailable = Number((await pool.query("SELECT count(*) AS count FROM runa_m1_server_workspaces.workspaces")).rows[0].count);
  await assert.rejects(service.materialize(context, { sourceId: connected.source.sourceId }),
    error => error.code === "server-workspace-materializer-unavailable");
  const afterUnavailable = Number((await pool.query("SELECT count(*) AS count FROM runa_m1_server_workspaces.workspaces")).rows[0].count);
  assert.equal(afterUnavailable, beforeUnavailable);
  assert.deepEqual(operations, ["source.connect-public-git", "source.connect-public-git", "workspace.materialize"]);

  const first = await store.beginMaterialization(context, { sourceId: connected.source.sourceId });
  assert.equal(first.created, true);
  assert.equal(first.lifecycle, "intent-recorded");
  assert.equal(first.expectedCommitOid, definition.expectedCommitOid);
  const repeat = await store.beginMaterialization(context, { sourceId: connected.source.sourceId });
  assert.equal(repeat.created, false);
  assert.equal(repeat.workspaceId, first.workspaceId);

  const otherContexts = ["project-bravo", "project-charlie"].map(projectId => ({ ...context, projectId }));
  const otherSources = [];
  for (const [index, otherContext] of otherContexts.entries()) {
    otherSources.push((await store.connectPublicGit(otherContext, { ...definition,
      displayName: `Sealed fixture ${index + 2}` })).source);
  }
  const raced = await Promise.allSettled(otherContexts.map((otherContext, index) =>
    store.beginMaterialization(otherContext, { sourceId: otherSources[index].sourceId })));
  assert.equal(raced.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(raced.filter(result => result.status === "rejected"
    && result.reason.code === "workspace-participant-concurrency-limit").length, 1);

  store = new PostgresServerWorkspaceStore({ pool, cipher: testCipher() });
  assert.equal((await store.getWorkspace(context, first.workspaceId)).request.idempotencyKey,
    first.request.idempotencyKey);
  await assert.rejects(store.getWorkspace({ ...context, principalId: "mallory" }, first.workspaceId),
    error => error.code === "workspace-selection-denied");
  await assert.rejects(store.beginMaterialization({ ...context, projectId: "project-other" },
    { sourceId: connected.source.sourceId }), error => error.code === "workspace-source-selection-denied");

  await pool.query("UPDATE runa_m1_server_workspaces.sources SET lifecycle='connected' WHERE source_id=$1",
    [connected.source.sourceId]);
  await assert.rejects(store.listSources(context), error => error.code === "workspace-authority-integrity-failed");
  await pool.query("UPDATE runa_m1_server_workspaces.sources SET lifecycle='configured' WHERE source_id=$1",
    [connected.source.sourceId]);
  await pool.query("UPDATE runa_m1_server_workspaces.workspaces SET binding_digest=$1 WHERE workspace_id=$2",
    ["f".repeat(64), first.workspaceId]);
  await assert.rejects(store.getWorkspace(context, first.workspaceId),
    error => error.code === "workspace-authority-integrity-failed");

  const stored = JSON.stringify((await pool.query("SELECT payload FROM runa_m1_server_workspaces.sources")).rows);
  assert.equal(stored.includes(definition.repositoryHttpsUrl), false);
  assert.equal(stored.includes(definition.expectedCommitOid), false);
  const outbox = (await pool.query("SELECT event_type FROM runa_m1_server_workspaces.outbox ORDER BY sequence")).rows;
  assert.deepEqual(outbox.map(row => row.event_type), ["source-known", "source-configured", "workspace-intent-recorded",
    "source-known", "source-configured", "source-known", "source-configured", "workspace-intent-recorded"]);
});
