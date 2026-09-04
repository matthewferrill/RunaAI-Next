import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { createEnvelopeCipher } from "../../gate4/envelope.mjs";
import { PostgresSelectedContinuityStore } from "../../gate6b/adapters/postgres-continuity.mjs";
import { createCandidateHttpServer } from "../../gate6b/http-server.mjs";
import { createPostgresArtifactResultSourcePorts } from "./artifact-result-postgres.mjs";
import { DisposableJavascriptProjectAdapter } from "./project/adapter.mjs";
import { M1FunctionSurface } from "./surface.mjs";
import { PostgresTaskStore } from "./tasks/postgres.mjs";
import { M1TaskService } from "./tasks/service.mjs";

export const INTEGRATION_PUBLIC_ORIGIN = "https://runa.example.invalid";
export const INTEGRATION_CANARIES = Object.freeze({
  user: "runa-artifact-user-canary-v1",
  assistant: "runa-artifact-assistant-canary-v1",
  source: "runa-artifact-source-canary-v1",
  objective: "runa-artifact-objective-canary-v1",
  content: "runa-artifact-content-canary-v1",
});

export const AUTHORITATIVE_TABLES = Object.freeze([
  ["runa_core", "chat_turns"], ["runa_core", "chats"],
  ["runa_core", "participant_settings"], ["runa_core", "project_memory"],
  ["runa_core", "projects"],
  ["runa_m1", "audit"], ["runa_m1", "outbox"], ["runa_m1", "projects"],
  ["runa_m1", "records"], ["runa_m1", "runs"],
  ["runa_migration", "domain_state"], ["runa_migration", "items"],
  ["runa_migration", "runs"], ["runa_migration", "tombstones"],
  ["runa_runtime", "answer_requests"], ["runa_runtime", "route_responses"],
  ["runa_runtime", "route_responses_v2"],
].map(value => Object.freeze(value)));

const tableInventory = Object.freeze(AUTHORITATIVE_TABLES.map(([schemaName, tableName]) =>
  Object.freeze({ schemaName, tableName })));
const schemaInventory = Object.freeze(["public", "runa_core", "runa_m1", "runa_migration", "runa_runtime"]
  .map(schemaName => Object.freeze({ schemaName })));
const sha256 = value => createHash("sha256").update(value).digest("hex");

export function createIntegrationCipher() {
  const encryptionKey = createHash("sha256").update("runaai-artifact-result-integration:encryption").digest();
  const hmacKey = createHash("sha256").update("runaai-artifact-result-integration:hmac").digest();
  try {
    return createEnvelopeCipher({ encryptionKey, hmacKey, keyId: "artifact-result-integration" });
  } finally {
    encryptionKey.fill(0);
    hmacKey.fill(0);
  }
}

export async function authoritativeSnapshot(pool) {
  const schemas = (await pool.query(`SELECT schema_name AS "schemaName" FROM information_schema.schemata
    WHERE schema_name<>'information_schema' AND left(schema_name,3)<>'pg_' ORDER BY schema_name`)).rows;
  assert.deepEqual(schemas, schemaInventory);
  const inventory = (await pool.query(`SELECT table_schema AS "schemaName",table_name AS "tableName"
    FROM information_schema.tables WHERE table_type='BASE TABLE'
      AND table_schema<>'information_schema' AND left(table_schema,3)<>'pg_'
    ORDER BY table_schema,table_name`)).rows;
  assert.deepEqual(inventory, tableInventory);
  assert.equal(inventory.some(({ tableName }) => /artifact|result|locator|retained|byte/iu.test(tableName)), false,
    "No Artifact/result/locator/retained-byte persistence table may exist.");

  const union = AUTHORITATIVE_TABLES.map(([schemaName, tableName]) =>
    `SELECT '${schemaName}.${tableName}' AS table_key,row_to_json(t)::text AS row_text FROM ${schemaName}.${tableName} AS t`)
    .join(" UNION ALL ");
  const rows = (await pool.query(union)).rows;
  const byTable = new Map(AUTHORITATIVE_TABLES.map(([schemaName, tableName]) =>
    [`${schemaName}.${tableName}`, []]));
  for (const row of rows) {
    assert.equal(byTable.has(row.table_key), true);
    assert.equal(typeof row.row_text, "string");
    for (const canary of Object.values(INTEGRATION_CANARIES)) {
      assert.equal(row.row_text.includes(canary), false, `Persisted cleartext canary: ${canary}`);
    }
    byTable.get(row.table_key).push(row.row_text);
  }
  const tables = AUTHORITATIVE_TABLES.map(([schemaName, tableName]) => {
    const values = byTable.get(`${schemaName}.${tableName}`).sort();
    const framedRows = values.map(value => `${Buffer.byteLength(value, "utf8")}:${value}`).join("");
    return { schemaName, tableName, rowCount: values.length, contentSha256: sha256(framedRows) };
  });
  return { schemaVersion: "runaai-artifact-result-authority-snapshot/v1", schemas, inventory, tables };
}

export function assertCompletedInvariant({ before, after, requestError = null, snapshotError = null }) {
  let invariantError = null;
  if (!snapshotError) {
    try { assert.deepEqual(after, before); } catch (error) { invariantError = error; }
  }
  const failures = [requestError, snapshotError, invariantError].filter(Boolean);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "artifact-result request and authority invariant failed");
  }
}

function applicationFixture({ participantId, credential }, continuity) {
  return {
    async authority() { return { enabled: true }; },
    authenticator: { async authenticate(candidate, options) {
      assert.deepEqual(options, { requireOnline: true });
      if (candidate !== credential) throw Object.assign(new Error("private child credential rejection"),
        { code: "m1-authentication-required" });
      return { verified: true, principalId: participantId };
    } },
    authorizer: { async authorize() { return { allowed: true, reason: "integration-child-owned" }; } },
    continuity,
  };
}

function ordinarySessionsFixture({ sessionId, credential }) {
  const calls = [];
  return { publicBaseUrl: INTEGRATION_PUBLIC_ORIGIN, calls,
    async credentialForSession(candidate) {
      calls.push(candidate);
      if (candidate === sessionId) return credential;
      throw Object.assign(new Error("private child session rejection"), { code: "m1-authentication-required" });
    } };
}

async function startHttp({ application, ordinarySessions, pool, cipher, taskService }) {
  const { conversationResults, taskResults } = createPostgresArtifactResultSourcePorts({ pool, cipher });
  const m1Functions = new M1FunctionSurface({ application, sources: {}, tasks: taskService,
    conversationResults, taskResults });
  const server = createCandidateHttpServer({ application, ordinarySessions, m1Functions,
    staticRoot: import.meta.dirname, runtimeStatus: async () => ({}), readinessStatus: async () => ({}),
    dependencyHealth: async () => ({ ready: true }) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}

async function closeHttp(server) {
  if (!server) return;
  await new Promise((resolveClose, rejectClose) => {
    server.close(error => error ? rejectClose(error) : resolveClose());
    server.closeAllConnections();
  });
}

async function post(server, sessionId, body) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/m1/workspace`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: INTEGRATION_PUBLIC_ORIGIN,
      "x-runa-workspace": "1", cookie: `__Host-runa_user_session=${sessionId}` },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  return { status: response.status,
    headers: { cacheControl: response.headers.get("cache-control"),
      contentType: response.headers.get("content-type"),
      xContentTypeOptions: response.headers.get("x-content-type-options") },
    raw, value: JSON.parse(raw) };
}

async function invariantPost(pool, baseline, server, sessionId, body) {
  const before = await authoritativeSnapshot(pool);
  assert.deepEqual(before, baseline);
  let response = null, requestError = null, after = null, snapshotError = null;
  try { response = await post(server, sessionId, body); } catch (error) { requestError = error; }
  try { after = await authoritativeSnapshot(pool); } catch (error) { snapshotError = error; }
  assertCompletedInvariant({ before, after, requestError, snapshotError });
  return response;
}

async function readInput() {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 131_072) throw new Error("artifact-result-child-input-too-large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks, length).toString("utf8"));
}

function validateConfig(config) {
  assert.deepEqual(Object.keys(config).sort(), ["baseline", "connectionString", "credential", "participantId",
    "projectDirectory", "projectId", "requests", "sessionId"]);
  for (const key of ["connectionString", "credential", "participantId", "projectDirectory", "projectId", "sessionId"]) {
    assert.equal(typeof config[key], "string");
    assert.ok(config[key].length > 0);
  }
  assert.match(config.connectionString, /^postgresql:\/\/m1_synthetic@127\.0\.0\.1:\d+\/postgres$/u);
  assert.equal(isAbsolute(config.projectDirectory), true);
  assert.deepEqual(Object.keys(config.requests).sort(), ["chatList", "chatRead", "taskList", "taskRead"]);
  assert.equal(config.baseline?.schemaVersion, "runaai-artifact-result-authority-snapshot/v1");
  return config;
}

async function runChild() {
  const config = validateConfig(await readInput());
  let pool = null, cipher = null, server = null, runError = null, responses = null, ordinarySessions = null;
  let finalSnapshot = null;
  const cleanup = { httpClosed: false, poolEnded: false, cipherDestroyed: false };
  try {
    pool = new pg.Pool({ connectionString: config.connectionString, connectionTimeoutMillis: 2_000,
      query_timeout: 8_000 });
    cipher = createIntegrationCipher();
    const taskStore = new PostgresTaskStore({ pool, cipher });
    const continuity = new PostgresSelectedContinuityStore({ pool, cipher });
    const adapter = new DisposableJavascriptProjectAdapter({ baseDirectory: config.projectDirectory });
    const taskService = new M1TaskService({ store: taskStore, adapter,
      authorizeContext: async context => context.principalId === config.participantId
        && context.projectId === config.projectId });
    const application = applicationFixture(config, continuity);
    ordinarySessions = ordinarySessionsFixture(config);
    assert.deepEqual(await authoritativeSnapshot(pool), config.baseline);
    server = await startHttp({ application, ordinarySessions, pool, cipher, taskService });
    responses = {
      chatList: await invariantPost(pool, config.baseline, server, config.sessionId, config.requests.chatList),
      chatRead: await invariantPost(pool, config.baseline, server, config.sessionId, config.requests.chatRead),
      taskList: await invariantPost(pool, config.baseline, server, config.sessionId, config.requests.taskList),
      taskRead: await invariantPost(pool, config.baseline, server, config.sessionId, config.requests.taskRead),
    };
    assert.ok(ordinarySessions.calls.length === 4 && ordinarySessions.calls.every(value => value === config.sessionId));
    finalSnapshot = await authoritativeSnapshot(pool);
    assert.deepEqual(finalSnapshot, config.baseline);
  } catch (error) { runError = error; }

  const cleanupErrors = [];
  try { await closeHttp(server); cleanup.httpClosed = true; } catch (error) { cleanupErrors.push(error); }
  try { await pool?.end(); cleanup.poolEnded = true; } catch (error) { cleanupErrors.push(error); }
  try {
    if (cipher) assert.deepEqual(cipher.destroy(), { destroyed: true });
    cleanup.cipherDestroyed = true;
  } catch (error) { cleanupErrors.push(error); }
  const failures = [runError, ...cleanupErrors].filter(Boolean);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "artifact-result child and cleanup failed");
  return { schemaVersion: "runaai-artifact-result-child-restart/v1", responses,
    authoritySnapshot: finalSnapshot, cleanup };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runChild().then(result => process.stdout.write(`${JSON.stringify(result)}\n`), error => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
