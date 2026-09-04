import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import pg from "pg";

import { createEnvelopeCipher } from "../../gate4/envelope.mjs";
import { PostgresTaskStore } from "./tasks/postgres.mjs";
import { M1TaskService } from "./tasks/service.mjs";

export const AGENT_PG_CANARIES = Object.freeze([
  "runa-agent-pg-objective-canary-v1",
  "runa-agent-pg-source-canary-v1",
  "runa-agent-pg-change-canary-v1",
]);

const TABLES = Object.freeze(["audit", "outbox", "projects", "records", "runs"]);
const sha256 = value => createHash("sha256").update(value).digest("hex");

function sqlIdentifier(value) {
  assert.match(value, /^[a-z][a-z0-9_]{0,48}$/u);
  return `"${value}"`;
}

export function createAgentPgCipher() {
  const encryptionKey = createHash("sha256").update("runaai-agent-pg-integration:encryption").digest();
  const hmacKey = createHash("sha256").update("runaai-agent-pg-integration:hmac").digest();
  try {
    return createEnvelopeCipher({ encryptionKey, hmacKey, keyId: "agent-pg-integration" });
  } finally {
    encryptionKey.fill(0);
    hmacKey.fill(0);
  }
}

export async function agentAuthoritySnapshot(pool, schema, canaries = AGENT_PG_CANARIES) {
  const sqlSchema = sqlIdentifier(schema);
  const schemas = (await pool.query(`SELECT schema_name AS "schemaName" FROM information_schema.schemata
    WHERE schema_name<>'information_schema' AND left(schema_name,3)<>'pg_' ORDER BY schema_name`)).rows;
  assert.deepEqual(schemas, ["public", schema].sort().map(schemaName => ({ schemaName })));
  const inventory = (await pool.query(`SELECT table_schema AS "schemaName",table_name AS "tableName"
    FROM information_schema.tables WHERE table_type='BASE TABLE'
      AND table_schema<>'information_schema' AND left(table_schema,3)<>'pg_'
    ORDER BY table_schema,table_name`)).rows;
  assert.deepEqual(inventory, TABLES.map(tableName => ({ schemaName: schema, tableName })));

  const tables = [];
  for (const tableName of TABLES) {
    const rows = (await pool.query(`SELECT row_to_json(t)::text AS value FROM ${sqlSchema}.${sqlIdentifier(tableName)} AS t`))
      .rows.map(row => row.value).sort();
    for (const row of rows) {
      assert.equal(typeof row, "string");
      for (const canary of canaries) assert.equal(row.includes(canary), false,
        `Persisted cleartext Agent canary in ${tableName}`);
    }
    const framed = rows.map(row => `${Buffer.byteLength(row, "utf8")}:${row}`).join("");
    tables.push({ tableName, rowCount: rows.length, contentSha256: sha256(framed) });
  }
  return { schemaVersion: "runaai-agent-pg-authority-snapshot/v1", schemas, inventory, tables };
}

export async function agentTaskState(store, context, taskId) {
  return store.transaction(context, async tx => {
    const task = await tx.get("task", taskId);
    const grants = await tx.list("grant", taskId);
    const proposals = await tx.list("proposal", taskId);
    const intents = await tx.list("intent", taskId);
    const receipts = await tx.list("receipt", taskId);
    const runs = await tx.list("run", taskId);
    return {
      taskStatus: task?.status ?? null,
      grants: grants.map(value => ({ grantId: value.grantId, revision: value.revision, status: value.status })),
      proposals: proposals.map(value => ({ proposalId: value.proposalId, requestId: value.requestId,
        policy: value.policy, status: value.status, errorCode: value.errorCode ?? null })),
      intents: intents.map(value => ({ proposalId: value.proposalId, effectId: value.effectId,
        status: value.status, receiptId: value.receiptId ?? null })),
      receipts: receipts.map(value => ({ receiptId: value.receiptId, proposalId: value.proposalId,
        effectId: value.effectId })),
      runs: runs.map(value => ({ runId: value.runId, requestId: value.requestId, status: value.status,
        pendingProposalId: value.pendingProposalId, activeWindow: value.activeWindow ?? null,
        recoveredActiveWindowCount: value.recoveredActiveWindowCount ?? 0 })),
    };
  });
}

export function agentActionToken(state) {
  return { schemaVersion: state.schemaVersion, taskId: state.taskId, authorityDigest: state.authorityDigest };
}

function denyAdapter(calls) {
  const reject = name => async () => {
    calls[name] = (calls[name] ?? 0) + 1;
    throw new Error(`agent-pg-child-unexpected-${name}`);
  };
  return {
    createEnvironment: reject("createEnvironment"), inspectRevision: reject("inspectRevision"),
    verifyMaterialized: reject("verifyMaterialized"), prepare: reject("prepare"),
    materialize: reject("materialize"), observeMaterialized: reject("observeMaterialized"),
    executeTests: reject("executeTests"),
  };
}

async function readInput(maximumBytes = 65_536) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    assert.ok(bytes <= maximumBytes, "agent-pg-child-input-too-large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
}

function validateInput(value) {
  assert.deepEqual(Object.keys(value).sort(), ["connectionString", "context", "expectedSettledToken",
    "expectedUnknownToken", "reloadTaskId", "schema", "unknownGrant", "unknownProposalId", "unknownTaskId"]);
  assert.equal(typeof value.connectionString, "string");
  sqlIdentifier(value.schema);
  assert.deepEqual(Object.keys(value.context).sort(), ["principalId", "projectId", "sessionId"]);
  assert.deepEqual(Object.keys(value.unknownGrant).sort(), ["grantId", "grantRevision"]);
  return value;
}

async function main() {
  const input = validateInput(await readInput());
  const pool = new pg.Pool({ connectionString: input.connectionString, max: 1,
    connectionTimeoutMillis: 2_000, query_timeout: 8_000 });
  const cipher = createAgentPgCipher();
  const calls = {};
  let result = null;
  let runError = null;
  try {
    const store = new PostgresTaskStore({ pool, schema: input.schema, cipher });
    const service = new M1TaskService({ store, adapter: denyAdapter(calls),
      now: () => new Date("2026-09-04T18:00:00.000Z"),
      authorizeContext: async candidate => candidate.principalId === input.context.principalId
        && candidate.projectId === input.context.projectId && candidate.sessionId === input.context.sessionId });
    const before = await agentAuthoritySnapshot(pool, input.schema);
    const settled = await service.agentActionFence(input.context, { taskId: input.reloadTaskId });
    assert.deepEqual(agentActionToken(settled), input.expectedSettledToken);
    assert.equal(settled.atomic, true);
    assert.equal(settled.state, "settled");

    const unknownStatus = await service.status(input.context, { taskId: input.unknownTaskId });
    const unknownFence = await service.agentActionFence(input.context, { taskId: input.unknownTaskId });
    assert.deepEqual(agentActionToken(unknownFence), input.expectedUnknownToken);
    assert.equal(unknownFence.atomic, true);
    assert.equal(unknownFence.state, "blocked");
    assert.equal(unknownFence.pendingReconciliationCount, 1);
    assert.equal(unknownFence.unsettledProposalCount, 1);
    assert.equal(unknownFence.unsettledRunCount, 1);
    assert.deepEqual(unknownStatus.pendingReconciliation.map(value => value.status), ["unknown"]);
    assert.equal(unknownStatus.proposals.find(value => value.proposalId === input.unknownProposalId)?.status, "unknown");

    await assert.rejects(service.propose(input.context, {
      taskId: input.unknownTaskId,
      grantId: input.unknownGrant.grantId,
      grantRevision: input.unknownGrant.grantRevision,
      requestId: "unknown-restart-must-not-propose",
      capabilityId: "project.inspect",
      arguments: { path: "main.js" },
    }, { agentActionAuthority: input.expectedUnknownToken }), /m1-agent-action-blocked/u);
    const after = await agentAuthoritySnapshot(pool, input.schema);
    assert.deepEqual(after, before);
    assert.deepEqual(calls, {});
    result = { schemaVersion: "runaai-agent-pg-restart-child/v1", settledToken: agentActionToken(settled),
      unknownToken: agentActionToken(unknownFence), unknown: {
        proposalStatus: unknownStatus.proposals.find(value => value.proposalId === input.unknownProposalId)?.status,
        pendingReconciliationCount: unknownFence.pendingReconciliationCount,
        unsettledProposalCount: unknownFence.unsettledProposalCount,
        unsettledRunCount: unknownFence.unsettledRunCount,
      }, authorityUnchanged: true, adapterCalls: calls };
  } catch (error) {
    runError = error;
  }
  const cleanupErrors = [];
  try { await pool.end(); } catch (error) { cleanupErrors.push(error); }
  try { assert.deepEqual(cipher.destroy(), { destroyed: true }); } catch (error) { cleanupErrors.push(error); }
  const failures = [runError, ...cleanupErrors].filter(Boolean);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Agent PostgreSQL restart child and cleanup failed");
  process.stdout.write(JSON.stringify({ ...result, cleanup: { poolEnded: true, cipherDestroyed: true } }));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) main().catch(error => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
