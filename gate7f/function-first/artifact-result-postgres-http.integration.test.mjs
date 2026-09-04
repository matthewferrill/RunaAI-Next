import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pg from "pg";

import { PRIVATE_ENVELOPE_VERSION } from "../../gate4/envelope.mjs";
import { PostgresGate4aStore } from "../../gate4/adapters/postgres.mjs";
import { createCandidateHttpServer } from "../../gate6b/http-server.mjs";
import { PostgresSelectedContinuityStore } from "../../gate6b/adapters/postgres-continuity.mjs";
import { createConversationContext } from "./conversation-context.mjs";
import { decodeCanonicalBase64 } from "./artifact-result-contracts.mjs";
import { assertCompletedInvariant, authoritativeSnapshot, createIntegrationCipher, INTEGRATION_CANARIES,
  INTEGRATION_PUBLIC_ORIGIN } from "./artifact-result-postgres-http.integration-child.mjs";
import { createPostgresArtifactResultSourcePorts } from "./artifact-result-postgres.mjs";
import { DisposableJavascriptProjectAdapter } from "./project/adapter.mjs";
import { M1FunctionSurface } from "./surface.mjs";
import { startSyntheticPostgres } from "./synthetic-postgres.mjs";
import { PostgresTaskStore } from "./tasks/postgres.mjs";
import { M1TaskService } from "./tasks/service.mjs";

const PARTICIPANT = "artifact-alice";
const OTHER_PARTICIPANT = "artifact-bob";
const CHAT_ID = "artifact-chat-01";
const CHAT_TEXT = `${INTEGRATION_CANARIES.assistant}\n`;
const TASK_TEXT = `// ${INTEGRATION_CANARIES.source}\n`
  + `export const artifactResult = '${INTEGRATION_CANARIES.content}';\n`;
const PUBLIC_ORIGIN = INTEGRATION_PUBLIC_ORIGIN;
const FIXED_NOW = Date.parse("2026-09-04T16:00:00.000Z");

function answerResponse() {
  return { answer: CHAT_TEXT, citations: [], ground: "no-ground-needed",
    retrieval: { attempted: false, skipped: true, skipReason: "none", empty: true,
      degraded: false, evidenceCount: 0, unavailable: [], omissions: [] },
    workspace: null, completion: { reason: "complete", timedOut: false, outputLimited: false },
    execution: { status: "not-executed" }, review: null, researchWorkflow: null };
}

function applicationFixture() {
  return {
    async authority() { return { enabled: true }; },
    authenticator: { async authenticate(credential, options) {
      assert.deepEqual(options, { requireOnline: true });
      const principalId = credential === "alice-credential" ? PARTICIPANT
        : credential === "bob-credential" ? OTHER_PARTICIPANT : null;
      if (principalId === null) throw Object.assign(new Error("private credential rejection"),
        { code: "m1-authentication-required" });
      return { verified: true, principalId };
    } },
    authorizer: { async authorize() { return { allowed: true, reason: "integration-owned" }; } },
    continuity: { async prepareAnswerContext(scope) { return createConversationContext(scope); } },
  };
}

function ordinarySessionsFixture() {
  const calls = [];
  return { publicBaseUrl: PUBLIC_ORIGIN, calls,
    async credentialForSession(sessionId) {
      calls.push(sessionId);
      if (sessionId === "alice-session") return "alice-credential";
      if (sessionId === "bob-session") return "bob-credential";
      throw Object.assign(new Error("private session detail"), { code: "m1-authentication-required" });
    } };
}

function surfaceFor({ application, pool, cipher, taskService }) {
  const { conversationResults, taskResults } = createPostgresArtifactResultSourcePorts({ pool, cipher });
  // This is the same result-port attachment performed by production composition, without initializing
  // its model, vector, browser or Control lanes.
  return new M1FunctionSurface({ application, sources: {}, tasks: taskService,
    conversationResults, taskResults });
}

async function startHttp({ application, ordinarySessions, pool, cipher, taskService }) {
  const m1Functions = surfaceFor({ application, pool, cipher, taskService });
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
    headers: { "content-type": "application/json", origin: PUBLIC_ORIGIN, "x-runa-workspace": "1",
      cookie: `__Host-runa_user_session=${sessionId}` },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  return { status: response.status, headers: response.headers, raw, value: JSON.parse(raw) };
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

function comparableResponse(response) {
  return { status: response.status,
    headers: { cacheControl: response.headers.get("cache-control"),
      contentType: response.headers.get("content-type"),
      xContentTypeOptions: response.headers.get("x-content-type-options") },
    raw: response.raw, value: response.value };
}

function assertNoCanaries(value) {
  for (const canary of Object.values(INTEGRATION_CANARIES)) assert.equal(value.includes(canary), false);
}

async function runFreshChild(config) {
  const childPath = fileURLToPath(new URL("./artifact-result-postgres-http.integration-child.mjs", import.meta.url));
  const child = spawn(process.execPath, [childPath], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const maximumOutputBytes = 1_000_000;
  return new Promise((resolveChild, rejectChild) => {
    let stdoutLength = 0, stderrLength = 0, terminalError = null, settled = false, timer = null;
    const stdout = [], stderr = [];
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectChild(error); else resolveChild(result);
    };
    const capture = (target, chunk, stream) => {
      if (terminalError) return;
      if (stream === "stdout") stdoutLength += chunk.length; else stderrLength += chunk.length;
      if (stdoutLength > maximumOutputBytes || stderrLength > maximumOutputBytes) {
        terminalError = new Error("artifact-result-child-output-too-large");
        child.kill();
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", chunk => capture(stdout, chunk, "stdout"));
    child.stderr.on("data", chunk => capture(stderr, chunk, "stderr"));
    child.stdin.once("error", error => finish(error));
    child.once("error", error => finish(error));
    child.once("close", (code, signal) => {
      if (terminalError) return finish(terminalError);
      const diagnostic = Buffer.concat(stderr, stderrLength).toString("utf8").trim();
      if (code !== 0) return finish(new Error(`artifact-result-child-failed:${code}:${signal ?? "none"}:${diagnostic}`));
      try { return finish(null, JSON.parse(Buffer.concat(stdout, stdoutLength).toString("utf8"))); }
      catch (error) { return finish(error); }
    });
    timer = setTimeout(() => {
      terminalError = new Error("artifact-result-child-timeout");
      child.kill();
    }, 30_000);
    child.stdin.end(JSON.stringify(config));
  });
}

function request(projectId, experience, operation, input) {
  return { projectId, experience, operation, input };
}

async function expectPublicError(responsePromise, status, errorCode) {
  const response = await responsePromise;
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Object.keys(response.value).sort(),
    ["correlationId", "errorCode", "privateValuesIncluded", "schemaVersion"]);
  assert.equal(response.value.schemaVersion, "runa2-gate6b-error/v1");
  assert.equal(response.value.errorCode, errorCode);
  assert.match(response.value.correlationId, /^[a-f0-9]{24}$/u);
  assert.equal(response.value.privateValuesIncluded, false);
  assert.doesNotMatch(response.raw, /private (?:credential|session|database|envelope|internal)|content_hmac|stack/iu);
  assertNoCanaries(response.raw);
}

test("real disposable PostgreSQL plus authenticated loopback HTTP preserves exact Artifact result authority", {
  timeout: 120_000,
}, async () => {
  const toolRoot = resolve(process.env.RUNALAB_TOOL_ROOT ?? "D:/Projects/Runalab/artifacts/tools");
  const artifactRoot = resolve(process.env.RUNALAB_ARTIFACT_ROOT
    ?? "D:/Projects/Runalab/artifacts/artifact-result-postgres-http");
  assert.equal(isAbsolute(toolRoot) && isAbsolute(artifactRoot), true);
  let database = null, pool = null, projectDirectory = null, server = null, cipher = null;
  let runError = null;
  try {
    await mkdir(artifactRoot, { recursive: true });
    database = await startSyntheticPostgres({ toolRoot, artifactRoot });
    pool = new pg.Pool({ connectionString: database.connectionString, connectionTimeoutMillis: 2_000,
      query_timeout: 8_000 });
    cipher = createIntegrationCipher();

    const core = new PostgresGate4aStore({ pool });
    await core.initialize({ reset: true });
    const continuity = new PostgresSelectedContinuityStore({ pool, cipher,
      now: () => new Date(FIXED_NOW) });
    await continuity.initialize();
    const chatProject = await continuity.createProject({ participantId: PARTICIPANT,
      requestId: "artifact-chat-project", experience: "chat", displayName: "Artifact Chat" });
    const codeProject = await continuity.createProject({ participantId: PARTICIPANT,
      requestId: "artifact-code-project", experience: "code", displayName: "Artifact Code" });
    await continuity.recordAnswer({ participant: { verified: true, principalId: PARTICIPANT },
      project: { projectId: chatProject.projectId }, thread: { threadId: CHAT_ID },
      requestId: "artifact-chat-answer", contextRevision: 0, experience: "chat", lane: "general",
      message: INTEGRATION_CANARIES.user }, answerResponse());

    projectDirectory = await mkdtemp(join(artifactRoot, "m1-artifact-result-project-"));
    const taskStore = new PostgresTaskStore({ pool, cipher });
    await taskStore.initialize();
    const adapter = new DisposableJavascriptProjectAdapter({ baseDirectory: projectDirectory });
    const taskContext = { principalId: PARTICIPANT, projectId: codeProject.projectId,
      sessionId: "artifact-seed-session" };
    const taskService = new M1TaskService({ store: taskStore, adapter,
      now: () => new Date(FIXED_NOW), authorizeContext: async candidate =>
        candidate.principalId === PARTICIPANT && candidate.projectId === codeProject.projectId });
    await taskService.registerProject(taskContext, { environmentId: "artifact-environment",
      files: { "artifact-result.js": TASK_TEXT } });
    const task = await taskService.createTask(taskContext, { requestId: "artifact-task-create",
      objective: INTEGRATION_CANARIES.objective });
    const grant = await taskService.createGrant(taskContext, { taskId: task.taskId, profile: "safe-autopilot",
      allowedPaths: ["artifact-result.js"], allowedSuites: [],
      expiresAt: new Date(FIXED_NOW + 60_000).toISOString() });
    const inspected = await taskService.propose(taskContext, { taskId: task.taskId, grantId: grant.grantId,
      grantRevision: grant.revision, requestId: "artifact-inspect-ready", capabilityId: "project.inspect",
      arguments: { path: "artifact-result.js" } });
    await taskService.execute(taskContext, { proposalId: inspected.proposalId });
    const pending = await taskService.propose(taskContext, { taskId: task.taskId, grantId: grant.grantId,
      grantRevision: grant.revision, requestId: "artifact-inspect-pending", capabilityId: "project.inspect",
      arguments: { path: "artifact-result.js" } });

    const encryptedConversation = await pool.query(`SELECT chats.result_owner_hmac,chats.title_envelope,
      turns.content_envelope,turns.content_hmac FROM runa_core.chats chats JOIN runa_core.chat_turns turns
        ON turns.participant_id=chats.participant_id AND turns.chat_id=chats.chat_id
      WHERE chats.participant_id=$1 AND chats.chat_id=$2`, [PARTICIPANT, CHAT_ID]);
    assert.equal(encryptedConversation.rows.length, 1);
    assert.match(encryptedConversation.rows[0].result_owner_hmac, /^[a-f0-9]{64}$/u);
    assert.equal(encryptedConversation.rows[0].title_envelope.schemaVersion, PRIVATE_ENVELOPE_VERSION);
    assert.equal(encryptedConversation.rows[0].content_envelope.schemaVersion, PRIVATE_ENVELOPE_VERSION);
    assert.equal(JSON.stringify(encryptedConversation.rows[0]).includes(CHAT_TEXT.trim()), false);
    const encryptedTasks = await pool.query(`SELECT kind,payload FROM runa_m1.records
      WHERE participant_id=$1 AND project_id=$2 AND task_id=$3 ORDER BY kind,record_id`,
    [PARTICIPANT, codeProject.projectId, task.taskId]);
    assert.ok(encryptedTasks.rows.length >= 5);
    assert.equal(encryptedTasks.rows.every(row => row.payload?.schemaVersion === PRIVATE_ENVELOPE_VERSION), true);
    const encryptedTaskBytes = JSON.stringify(encryptedTasks.rows);
    assert.equal(encryptedTaskBytes.includes(TASK_TEXT.trim()), false);
    assert.equal(encryptedTaskBytes.includes(INTEGRATION_CANARIES.objective), false);
    const authorityBaseline = await authoritativeSnapshot(pool);

    const application = applicationFixture();
    const ordinarySessions = ordinarySessionsFixture();
    server = await startHttp({ application, ordinarySessions, pool, cipher, taskService });

    const chatListRequest = request(chatProject.projectId, "chat", "result.list",
      { owner: { kind: "conversation", chatId: CHAT_ID } });
    const chatList = await invariantPost(pool, authorityBaseline, server, "alice-session", chatListRequest);
    assert.equal(chatList.status, 200);
    const chatDescriptor = chatList.value.results.find(result => result.kind === "conversation-answer");
    assert.ok(chatDescriptor);
    assert.equal(chatDescriptor.readiness, "ready");
    assert.deepEqual(chatDescriptor.owner, { kind: "conversation", chatId: CHAT_ID });
    assert.deepEqual({ schemaVersion: chatDescriptor.provenance.schemaVersion,
      type: chatDescriptor.provenance.type, chatId: chatDescriptor.provenance.chatId,
      turnOrdinal: chatDescriptor.provenance.turnOrdinal, route: chatDescriptor.provenance.route,
      contentSha256: chatDescriptor.provenance.contentSha256 },
    { schemaVersion: "runaai-result-provenance/v1", type: "conversation-turn", chatId: CHAT_ID,
      turnOrdinal: 1, route: "general-chat", contentSha256: chatDescriptor.contentSha256 });
    assert.match(chatDescriptor.provenance.sourceRevision, /^[a-f0-9]{64}$/u);
    assert.match(chatDescriptor.provenance.evidenceSha256, /^[a-f0-9]{64}$/u);
    assertNoCanaries(chatList.raw);
    const chatReadRequest = request(chatProject.projectId, "chat", "result.read", { owner: chatDescriptor.owner,
      resultId: chatDescriptor.resultId, contentSha256: chatDescriptor.contentSha256 });
    const chatRead = await invariantPost(pool, authorityBaseline, server, "alice-session", chatReadRequest);
    assert.equal(chatRead.status, 200);
    assert.equal(decodeCanonicalBase64(chatRead.value.contentBase64, chatRead.value.descriptor).toString(), CHAT_TEXT);
    assert.deepEqual(chatRead.value.descriptor, chatDescriptor);

    const taskListRequest = request(codeProject.projectId, "code", "result.list",
      { owner: { kind: "task", taskId: task.taskId } });
    const taskList = await invariantPost(pool, authorityBaseline, server, "alice-session", taskListRequest);
    assert.equal(taskList.status, 200);
    const taskDescriptor = taskList.value.results.find(result => result.kind === "inspected-text"
      && result.sourceRecordId === inspected.proposalId);
    assert.ok(taskDescriptor);
    assert.equal(taskDescriptor.readiness, "ready");
    assert.deepEqual(taskDescriptor.owner, { kind: "task", taskId: task.taskId });
    assert.deepEqual({ schemaVersion: taskDescriptor.provenance.schemaVersion,
      type: taskDescriptor.provenance.type, taskId: taskDescriptor.provenance.taskId,
      proposalId: taskDescriptor.provenance.proposalId,
      proposalDigest: taskDescriptor.provenance.proposalDigest,
      expectedProjectRevision: taskDescriptor.provenance.expectedProjectRevision,
      beforeWorkspaceSha256: taskDescriptor.provenance.beforeWorkspaceSha256,
      afterWorkspaceSha256: taskDescriptor.provenance.afterWorkspaceSha256,
      contentSha256: taskDescriptor.provenance.contentSha256 },
    { schemaVersion: "runaai-result-provenance/v1", type: "task-proposal", taskId: task.taskId,
      proposalId: inspected.proposalId, proposalDigest: inspected.proposalDigest,
      expectedProjectRevision: inspected.expectedProjectRevision,
      beforeWorkspaceSha256: inspected.beforeReference.workspaceSha256, afterWorkspaceSha256: null,
      contentSha256: taskDescriptor.contentSha256 });
    assert.match(taskDescriptor.provenance.sourceRevision, /^[a-f0-9]{64}$/u);
    assertNoCanaries(taskList.raw);
    const taskReadRequest = request(codeProject.projectId, "code", "result.read", { owner: taskDescriptor.owner,
      resultId: taskDescriptor.resultId, contentSha256: taskDescriptor.contentSha256 });
    const taskRead = await invariantPost(pool, authorityBaseline, server, "alice-session", taskReadRequest);
    assert.equal(taskRead.status, 200);
    assert.equal(decodeCanonicalBase64(taskRead.value.contentBase64, taskRead.value.descriptor).toString(), TASK_TEXT);
    assert.deepEqual(taskRead.value.descriptor, taskDescriptor);

    const pendingDescriptor = taskList.value.results.find(result => result.sourceRecordId === pending.proposalId);
    assert.ok(pendingDescriptor);
    assert.deepEqual([pendingDescriptor.readiness, pendingDescriptor.errorCode, pendingDescriptor.contentSha256],
      ["pending", "source-pending", null]);
    // A non-ready descriptor intentionally publishes no content digest. The public read contract requires
    // a digest-bound locator, so every attempted read of this result is rejected as stale with HTTP 409.
    await expectPublicError(invariantPost(pool, authorityBaseline, server, "alice-session",
      request(codeProject.projectId, "code", "result.read",
      { owner: pendingDescriptor.owner, resultId: pendingDescriptor.resultId, contentSha256: "0".repeat(64) })),
    409, "result-stale");

    for (const [sessionId, body] of [
      ["bob-session", chatListRequest],
      ["alice-session", request(codeProject.projectId, "chat", "result.list",
        { owner: { kind: "conversation", chatId: CHAT_ID } })],
      ["alice-session", request(chatProject.projectId, "code", "result.list",
        { owner: { kind: "conversation", chatId: CHAT_ID } })],
      ["alice-session", request(chatProject.projectId, "chat", "result.list",
        { owner: { kind: "conversation", chatId: "artifact-chat-missing" } })],
      ["alice-session", request(codeProject.projectId, "chat", "result.list",
        { owner: { kind: "task", taskId: task.taskId } })],
      ["bob-session", request(codeProject.projectId, "code", "result.list",
        { owner: { kind: "task", taskId: task.taskId } })],
      ["alice-session", request(codeProject.projectId, "code", "result.list",
        { owner: { kind: "task", taskId: "task-missing-artifact" } })],
    ]) await expectPublicError(invariantPost(pool, authorityBaseline, server, sessionId, body),
      404, "result-owner-not-found");

    await closeHttp(server);
    server = null;
    const beforeChild = await authoritativeSnapshot(pool);
    assert.deepEqual(beforeChild, authorityBaseline);
    let restarted = null, childError = null, afterChild = null, childSnapshotError = null;
    try {
      restarted = await runFreshChild({ baseline: authorityBaseline,
        connectionString: database.connectionString, credential: "alice-credential",
        participantId: PARTICIPANT, projectDirectory, projectId: codeProject.projectId,
        requests: { chatList: chatListRequest, chatRead: chatReadRequest,
          taskList: taskListRequest, taskRead: taskReadRequest }, sessionId: "alice-session" });
    } catch (error) { childError = error; }
    try { afterChild = await authoritativeSnapshot(pool); }
    catch (error) { childSnapshotError = error; }
    assertCompletedInvariant({ before: beforeChild, after: afterChild,
      requestError: childError, snapshotError: childSnapshotError });
    assert.equal(restarted.schemaVersion, "runaai-artifact-result-child-restart/v1");
    assert.deepEqual(restarted.authoritySnapshot, authorityBaseline);
    assert.deepEqual(restarted.responses, {
      chatList: comparableResponse(chatList), chatRead: comparableResponse(chatRead),
      taskList: comparableResponse(taskList), taskRead: comparableResponse(taskRead),
    });
    assert.deepEqual(restarted.cleanup, { httpClosed: true, poolEnded: true, cipherDestroyed: true });

    server = await startHttp({ application, ordinarySessions, pool, cipher, taskService });

    const tamperedContentHmac = encryptedConversation.rows[0].content_hmac === "f".repeat(64)
      ? "e".repeat(64) : "f".repeat(64);
    await pool.query(`UPDATE runa_core.chat_turns SET content_hmac=$3
      WHERE participant_id=$1 AND chat_id=$2 AND turn_ordinal=0`, [PARTICIPANT, CHAT_ID, tamperedContentHmac]);
    const tamperedBaseline = await authoritativeSnapshot(pool);
    assert.notDeepEqual(tamperedBaseline, authorityBaseline);
    await expectPublicError(invariantPost(pool, tamperedBaseline, server, "alice-session", chatListRequest),
      503, "result-source-invalid");
    assert.ok(ordinarySessions.calls.includes("alice-session") && ordinarySessions.calls.includes("bob-session"));
  } catch (error) {
    runError = error;
  }

  const cleanupErrors = [];
  try { await closeHttp(server); } catch (error) { cleanupErrors.push(error); }
  try {
    if (projectDirectory) {
      const resolvedArtifactRoot = await realpath(artifactRoot);
      const resolvedProject = await realpath(projectDirectory);
      assert.equal(dirname(resolvedProject), resolvedArtifactRoot);
      assert.match(basename(resolvedProject), /^m1-artifact-result-project-/u);
      await rm(resolvedProject, { recursive: true, force: false });
    }
  } catch (error) { cleanupErrors.push(error); }
  try { await pool?.end(); } catch (error) { cleanupErrors.push(error); }
  try {
    if (database) assert.deepEqual(await database.stop(),
      { stopped: true, ownedSyntheticDataRemoved: true, productionChanged: false });
  } catch (error) { cleanupErrors.push(error); }
  try { if (cipher) assert.deepEqual(cipher.destroy(), { destroyed: true }); }
  catch (error) { cleanupErrors.push(error); }
  const failures = [runError, ...cleanupErrors].filter(Boolean);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "artifact-result integration and cleanup failed");
});
