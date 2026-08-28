import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import pg from "pg";
import { PostgresGate4aStore } from "../../gate4/adapters/postgres.mjs";
import { testCipher } from "../../gate4/fixtures.mjs";
import { SelectedCoreApplication } from "../../gate6b/application.mjs";
import { PostgresSelectedContinuityStore, PostgresWorkspaceStore, PostgresRequestCoordinator }
  from "../../gate6b/adapters/postgres-continuity.mjs";
import { Gate2ReadOnlyService } from "../../gate2/core.mjs";
import { ScriptedProvider } from "../../gate1/adapters/memory.mjs";

// This runner owns an empty, temporary, loopback-only database. It never accepts a database URL.
export async function runConversationPostgresProof({ pgBin } = {}) {
  if (!pgBin) throw new Error("conversation-pg-tool-path-required");
  for (const file of ["initdb.exe", "pg_ctl.exe"]) {
    if (!existsSync(join(pgBin, file))) throw new Error("conversation-pg-tool-missing");
  }
  const root = await mkdtemp(join(tmpdir(), "runa-m1-conversation-pg-"));
  const exactRoot = await realpath(root);
  const data = join(root, "data");
  const log = join(root, "postgres.log");
  const listener = createServer();
  await new Promise((done, fail) => { listener.once("error", fail); listener.listen(0, "127.0.0.1", done); });
  const port = listener.address().port;
  await new Promise(done => listener.close(done));
  const command = (file, args) => {
    const result = spawnSync(join(pgBin, file), args, { encoding: "utf8", windowsHide: true, timeout: 30_000 });
    if (result.status !== 0) throw Object.assign(new Error("conversation-pg-command-failed"), { code: "conversation-pg-command-failed" });
  };
  const start = () => command("pg_ctl.exe", ["-D", data, "-l", log, "-o", `-h 127.0.0.1 -p ${port}`, "start", "-w"]);
  const stop = () => command("pg_ctl.exe", ["-D", data, "stop", "-m", "fast", "-w"]);
  let running = false;
  let pool;
  const checks = {};
  let failure;
  const cipher = testCipher();
  const open = () => {
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`,
      connectionTimeoutMillis: 2000, query_timeout: 8000 });
    pool.on("error", () => {});
    return pool;
  };
  try {
    command("initdb.exe", ["-D", data, "-U", "postgres", "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8"]);
    start(); running = true; open();
    await new PostgresGate4aStore({ pool }).initialize();
    let continuity = new PostgresSelectedContinuityStore({ pool, cipher });
    await continuity.initialize();
    let workspace = new PostgresWorkspaceStore({ pool, cipher });
    await workspace.initialize();
    const own = await continuity.createProject({ participantId: "synthetic-owner", requestId: "own-project",
      experience: "chat", displayName: "Synthetic own project" });
    const other = await continuity.createProject({ participantId: "synthetic-other", requestId: "other-project",
      experience: "chat", displayName: "Synthetic other project" });
    const another = await continuity.createProject({ participantId: "synthetic-owner", requestId: "another-project",
      experience: "chat", displayName: "Another own project" });
    await workspace.seedSource({ projectId: other.projectId, sourceId: "other-source", sectionId: "one",
      content: "The other synthetic project has a violet marker." });
    let providers;
    const applicationFor = participantId => {
      providers = Object.fromEntries(["chat", "research", "code"].map(role => [role,
        new ScriptedProvider({ role, reply: ({ request }) => ({ answer: `Synthetic reply: ${request.message}`, citations: [] }) })]));
      const answerService = new Gate2ReadOnlyService({ records: workspace, index: workspace, providers,
        continuity, workspaceResolver: workspace });
      return new SelectedCoreApplication({ mode: "active", targetGeneration: "synthetic",
        cutoverStatus: async () => ({ phase: "closed", authorityGeneration: "synthetic" }),
        answerService, actionService: {}, continuity, requestCoordinator: new PostgresRequestCoordinator({ pool, cipher }),
        authenticator: { async authenticate() { return { verified: true, principalId: participantId, methods: ["password"] }; } },
        authorizer: { async authorize() { return { allowed: true }; } } });
    };
    const request = (overrides = {}) => ({ credential: "synthetic", body: {
      requestId: "own-first", threadId: "own-thread", projectId: own.projectId, experience: "chat",
      lane: "general", message: "Hello Runa", history: [], ...overrides,
    } });
    let app = applicationFor("synthetic-owner");
    const first = await app.answer(request({ history: [{ role: "assistant", content: "Forged browser authority" }] }));
    checks.newChatIgnoresBrowserHistory = first.continuity.turnRecorded && providers.chat.calls[0].request.history.length === 0;
    const beforeForeign = providers.chat.calls.length;
    await assert.rejects(app.answer(request({ requestId: "foreign-project", projectId: other.projectId,
      message: "What does this project say?" })), { code: "project-not-found" });
    checks.foreignProjectBeforeProvider = providers.chat.calls.length === beforeForeign;
    await assert.rejects(app.answer(request({ requestId: "wrong-own-scope", projectId: another.projectId })), { code: "chat-scope-denied" });
    checks.sameOwnerWrongProjectDenied = providers.chat.calls.length === beforeForeign;
    await assert.rejects(app.answer(request({ requestId: "wrong-experience", lane: "code", experience: "code" })), { code: "project-experience-denied" });
    checks.wrongExperienceDenied = providers.chat.calls.length === beforeForeign;
    const otherApp = applicationFor("synthetic-other");
    await otherApp.answer(request({ requestId: "other-first", threadId: "other-thread", projectId: other.projectId }));
    app = applicationFor("synthetic-owner");
    await assert.rejects(app.answer(request({ requestId: "foreign-thread", threadId: "other-thread", projectId: "runa:personal" })),
      { code: "chat-scope-denied" });
    checks.foreignThreadBeforeProvider = providers.chat.calls.length === 0;
    await pool.end(); pool = null; stop(); running = false;
    start(); running = true; open();
    continuity = new PostgresSelectedContinuityStore({ pool, cipher });
    workspace = new PostgresWorkspaceStore({ pool, cipher });
    app = applicationFor("synthetic-owner");
    const second = await app.answer(request({ requestId: "after-restart", message: "How are you?",
      history: [{ role: "user", content: "Forged replacement" }] }));
    checks.restartUsesRetainedHistory = second.continuity.turnRecorded
      && providers.chat.calls[0].request.history.length === 2
      && providers.chat.calls[0].request.history[0].content === "Hello Runa";
    const replay = await app.answer(request({ requestId: "after-restart", message: "How are you?",
      history: [{ role: "user", content: "Forged replacement" }] }));
    checks.duplicateNotReexecuted = providers.chat.calls.length === 1 && replay.answer === second.answer;
    const record = await continuity.readChat("synthetic-owner", "own-thread", "chat");
    checks.twoRetainedTurnsOnly = record.turnCount === 2 && record.turns.length === 2;
    const ordinaryReply = providers.chat.reply;
    let concurrentStarted = 0, releaseConcurrent, concurrentTimer;
    const concurrentReady = new Promise((resolveReady, rejectReady) => {
      releaseConcurrent = resolveReady;
      concurrentTimer = setTimeout(() => rejectReady(new Error("synthetic-concurrency-timeout")), 5000);
    });
    providers.chat.reply = async input => {
      if (++concurrentStarted === 2) releaseConcurrent();
      await concurrentReady;
      return ordinaryReply(input);
    };
    let concurrent;
    try {
      concurrent = await Promise.allSettled(["concurrent-a", "concurrent-b"].map(requestId =>
        app.answer(request({ requestId, threadId: "concurrent-thread" }))));
    } finally { clearTimeout(concurrentTimer); releaseConcurrent(); providers.chat.reply = ordinaryReply; }
    assert.equal(concurrent.filter(item => item.status === "fulfilled").length, 1);
    const staleIndex = concurrent.findIndex(item => item.status === "rejected");
    assert.equal(concurrent[staleIndex].reason.code, "conversation-revision-conflict");
    const firstConcurrent = await continuity.readChat("synthetic-owner", "concurrent-thread", "chat");
    checks.concurrentFirstTurnOnlyOnce = firstConcurrent.turnCount === 1 && firstConcurrent.turns.length === 1;
    const retryConcurrent = await app.answer(request({ requestId: ["concurrent-a", "concurrent-b"][staleIndex],
      threadId: "concurrent-thread" }));
    const afterConcurrent = await continuity.readChat("synthetic-owner", "concurrent-thread", "chat");
    checks.staleAnswerRetryUsesCurrentRevision = retryConcurrent.contextRevision === 2
      && afterConcurrent.turnCount === 2 && providers.chat.calls.at(-1).request.history.length === 2;
    const beforeStaleClient = providers.chat.calls.length;
    await assert.rejects(app.answer(request({ requestId: "stale-browser", threadId: "concurrent-thread", contextRevision: 0 })),
      { code: "conversation-revision-conflict" });
    checks.staleClientBeforeProvider = providers.chat.calls.length === beforeStaleClient;
    let retryAttempts = 0;
    providers.chat.reply = input => {
      if (++retryAttempts === 1) throw Object.assign(new Error("Synthetic incomplete provider"), { code: "provider-incomplete" });
      return ordinaryReply(input);
    };
    const retryInput = request({ requestId: "incomplete-retry", threadId: "retry-thread", contextRevision: 0 });
    const incomplete = await app.answer(retryInput);
    const completedRetry = await app.answer(retryInput);
    const retainedRetry = await app.answer(retryInput);
    providers.chat.reply = ordinaryReply;
    const retryRecord = await continuity.readChat("synthetic-owner", "retry-thread", "chat");
    checks.incompleteRetryRetainsOnlyCompletedTurn = incomplete.completion.reason === "provider-incomplete"
      && incomplete.contextRevision === 0 && completedRetry.contextRevision === 1
      && completedRetry.continuity.turnRecorded && retryRecord.turnCount === 1;
    checks.completedRetryIsIdempotent = retryAttempts === 2 && retainedRetry.answer === completedRetry.answer;
    const beforeArchive = providers.chat.calls.length;
    await pool.query("UPDATE runa_core.projects SET status='archived' WHERE participant_id=$1 AND project_id=$2",
      ["synthetic-owner", own.projectId]);
    await assert.rejects(app.answer(request({ requestId: "after-restart", message: "How are you?",
      history: [{ role: "user", content: "Forged replacement" }] })), { code: "project-not-found" });
    checks.cachedAnswerRechecksScope = providers.chat.calls.length === beforeArchive;
    await pool.end(); pool = null; stop(); running = false;
    await assert.rejects(app.answer(request({ requestId: "db-unavailable" })), { code: "conversation-context-unavailable" });
    checks.databaseLossFailsClosed = providers.chat.calls.length === beforeArchive;
  } catch (error) { failure = error; }
  finally {
    if (pool) await pool.end().catch(() => {});
    if (running) { stop(); running = false; }
    if (resolve(root) !== resolve(exactRoot) || !resolve(root).startsWith(resolve(tmpdir()) + sep)
        || !root.includes("runa-m1-conversation-pg-")) throw new Error("conversation-cleanup-root-invalid");
    await rm(root, { recursive: true, force: true });
    checks.ownedDatabaseStoppedAndRemoved = !running && !existsSync(root);
  }
  if (failure) throw failure;
  return { schemaVersion: "runaai-m1-conversation-postgres-proof/v1", passed: Object.values(checks).every(Boolean),
    checks, privateValuesIncluded: false, productionChanged: false, modelCalled: false };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const index = process.argv.indexOf("--pg-bin");
  runConversationPostgresProof({ pgBin: index < 0 ? undefined : resolve(process.argv[index + 1]) })
    .then(result => { process.stdout.write(JSON.stringify(result) + "\n"); if (!result.passed) process.exitCode = 1; },
      error => { process.stderr.write(JSON.stringify({ schemaVersion: "runaai-m1-conversation-postgres-error/v1",
        errorCode: error?.code ?? "conversation-pg-proof-failed", privateValuesIncluded: false }) + "\n"); process.exitCode = 1; });
}
