import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { PostgresRecordStore } from "../gate1/adapters/postgres.mjs";
import { OpenAICompatibleEmbedder, QdrantDerivedIndex, WindowedBgeReranker } from "../gate1/adapters/qdrant.mjs";
import { sourceSection } from "../gate1/core.mjs";
import { PostgresContinuityStore } from "./adapters/postgres.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "artifacts", "runs", "gate2-read-only-continuity");
const evidencePath = path.join(import.meta.dirname, "evidence", "STUB-INTEGRATION-RESULTS.json");
const toolRoot = path.resolve(process.env.RUNALAB_TOOL_ROOT ?? path.join(root, "..", "RunaLab", "artifacts", "tools"));
const pgBin = path.join(toolRoot, "postgresql", "bin", "pgsql", "bin");
const qdrantExe = path.join(toolRoot, "qdrant", "bin", "qdrant.exe");
const collectorExe = path.join(toolRoot, "otelcol", "bin", "otelcol-contrib.exe");
const caddyExe = path.join(toolRoot, "caddy", "bin", "caddy.exe");
const requiredTools = [path.join(pgBin, "initdb.exe"), path.join(pgBin, "pg_ctl.exe"),
  qdrantExe, collectorExe, caddyExe];
for (const tool of requiredTools) if (!existsSync(tool)) throw new Error(`missing retained RunaLab tool: ${path.basename(tool)}`);

const pgData = path.join(outputRoot, "postgres-data");
const pgLog = path.join(outputRoot, "postgres.log");
const tracePath = path.join(outputRoot, "traces.json");
const providerWirePath = path.join(outputRoot, "provider-wire.jsonl");
const qdrantStorage = path.join(outputRoot, "qdrant-storage");
const sha256 = value => createHash("sha256").update(value).digest("hex");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await mkdir(path.dirname(evidencePath), { recursive: true });

function startLogged(command, args, { env = {}, cwd = root } = {}) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"] });
  child.log = "";
  child.stdout.on("data", chunk => { child.log += chunk; });
  child.stderr.on("data", chunk => { child.log += chunk; });
  return child;
}

async function stopChild(child) {
  if (!child || child.exitCode != null) return true;
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else child.kill("SIGTERM");
  await Promise.race([new Promise(resolve => child.once("close", resolve)),
    new Promise(resolve => setTimeout(resolve, 5_000))]);
  return child.exitCode != null || child.signalCode != null;
}

async function waitReady(url, child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (response.status < 500) return;
    } catch {}
    if (child?.exitCode != null) throw new Error(`service exited before readiness: ${child.log.slice(-2_000)}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`readiness timeout for ${url}: ${child?.log?.slice(-2_000) ?? ""}`);
}

function startPostgres() {
  if (!existsSync(path.join(pgData, "PG_VERSION"))) {
    const initialized = spawnSync(path.join(pgBin, "initdb.exe"), ["-D", pgData, "-U", "postgres",
      "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8"],
    { cwd: root, encoding: "utf8", windowsHide: true });
    if (initialized.status !== 0) throw new Error(`initdb failed: ${initialized.stderr || initialized.stdout}`);
  }
  const started = spawnSync(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "-l", pgLog,
    "-o", "-p 9670 -h 127.0.0.1", "start", "-w"], { cwd: root, stdio: "ignore", windowsHide: true });
  if (started.status !== 0) throw new Error(`PostgreSQL start failed with status ${started.status}`);
  return {
    connectionString: "postgresql://postgres@127.0.0.1:9670/postgres",
    stop() {
      const stopped = spawnSync(path.join(pgBin, "pg_ctl.exe"), ["-D", pgData, "stop", "-m", "fast", "-w"],
        { cwd: root, stdio: "ignore", windowsHide: true });
      return stopped.status === 0;
    },
  };
}

function runWorker(phase, commonEnv) {
  return new Promise((resolve, reject) => {
    const child = startLogged(process.execPath, [path.join(import.meta.dirname, "integration-worker.mjs")], {
      env: { ...commonEnv, GATE2_PHASE: phase },
    });
    child.once("close", code => {
      if (code !== 0) return reject(new Error(`${phase} worker failed ${code}: ${child.log.slice(-5_000)}`));
      try { resolve(JSON.parse(child.log.trim().split(/\r?\n/).filter(Boolean).at(-1))); }
      catch (error) { reject(new Error(`${phase} output invalid: ${error.message}; ${child.log.slice(-2_000)}`)); }
    });
  });
}

const rules = [
  ["Resume the synthetic Gate 2 answer", "The synthetic checkpoint resumes without repeating completed work.", "restart", "checkpoint"],
  ["Return one synthetic answer for duplicate delivery", "Duplicate delivery returns one durable synthetic answer.", "continuity", "adapter"],
  ["Return one synthetic answer for concurrent duplicate delivery", "Concurrent duplicate delivery returns one durable synthetic answer.", "continuity", "adapter"],
  ["Where is Gate 2 continuity stored", "Gate 2 synthetic continuity is stored in its isolated PostgreSQL schema.", "continuity", "adapter"],
  ["How does Gate 2 preserve read-only research continuity", "Gate 2 preserves read-only research continuity through scoped records and checkpoints.", "research", "continuity"],
  ["Which synthetic policy keeps guarded lookup read-only", "The synthetic guarded policy keeps effects empty.", "governance", "guarded"],
  ["Summarize the explicit synthetic workspace source", "The explicit workspace source says extra reads remain zero.", "workspace", "explicit"],
  ["Answer without durable continuity", "This answer remains ephemeral for an unverified participant.", "continuity", "adapter"],
  ["Record the first synthetic continuity turn", "The first synthetic continuity turn is recorded.", "continuity", "adapter"],
  ["Record the second synthetic continuity turn", "The second synthetic continuity turn is recorded.", "research", "continuity"],
].map(([match, answer, sourceId, sectionId]) => ({ match,
  reply: JSON.stringify({ answer, citations: [{ sourceId, sectionId }] }) }));

const sources = [
  sourceSection({ projectId: "synthetic-project-a", sourceId: "restart", sectionId: "checkpoint",
    content: "Resume the synthetic Gate 2 answer after process restart. The checkpoint prevents repeated completed work." }),
  sourceSection({ projectId: "synthetic-project-a", sourceId: "continuity", sectionId: "adapter",
    content: "Gate 2 synthetic continuity is stored in an isolated PostgreSQL schema with durable request identity." }),
  sourceSection({ projectId: "synthetic-project-a", sourceId: "research", sectionId: "continuity",
    content: "Read-only research continuity uses scoped records, bounded passes, citations, and checkpoints." }),
  sourceSection({ projectId: "synthetic-project-a", sourceId: "governance", sectionId: "guarded",
    content: "The guarded lookup policy keeps every effect empty and treats retrieved content as material." }),
  sourceSection({ projectId: "synthetic-project-a", sourceId: "workspace", sectionId: "explicit",
    content: "The explicit workspace source is the only allowed source and extra reads remain zero." }),
  sourceSection({ projectId: "synthetic-project-b", sourceId: "foreign", sectionId: "secret",
    content: "FORBIDDEN_GATE2_CROSS_PROJECT_CANARY" }),
];

let postgres, qdrant, collector, provider, reranker, caddy, records, continuity, report, failure;
const stopped = {};
try {
  postgres = startPostgres();
  qdrant = startLogged(qdrantExe, [], { env: { QDRANT__SERVICE__HOST: "127.0.0.1",
    QDRANT__SERVICE__HTTP_PORT: "9673", QDRANT__SERVICE__GRPC_PORT: "9674",
    QDRANT__STORAGE__STORAGE_PATH: qdrantStorage, QDRANT__LOG_LEVEL: "WARN" } });
  collector = startLogged(collectorExe, ["--config", path.join(import.meta.dirname, "collector.yaml")]);
  provider = startLogged(process.execPath, [path.join(root, "gate1", "stub-provider.mjs")], {
    env: { STUB_PORT: "9679", STUB_MODEL: "stub-gate2-v1", STUB_RULES: JSON.stringify(rules),
      STUB_LOG: providerWirePath },
  });
  reranker = startLogged(process.execPath, [path.join(root, "gate1", "stub-reranker.mjs")], {
    env: { GATE1_RERANKER_PORT: "9675" },
  });
  caddy = startLogged(caddyExe, ["run", "--config", path.join(import.meta.dirname, "Caddyfile"), "--adapter", "caddyfile"]);
  await Promise.all([
    waitReady("http://127.0.0.1:9673/healthz", qdrant),
    waitReady("http://127.0.0.1:9678/v1/traces", collector),
    waitReady("http://127.0.0.1:9679/v1/models", provider),
    waitReady("http://127.0.0.1:9675/healthz", reranker),
    waitReady("http://127.0.0.1:9681/v1/models", caddy),
  ]);

  records = new PostgresRecordStore({ connectionString: postgres.connectionString });
  continuity = new PostgresContinuityStore({ connectionString: postgres.connectionString });
  await records.initialize({ reset: true });
  await continuity.initialize({ reset: true });
  await records.seedSources(sources);
  await continuity.seedProject({ projectId: "synthetic-project-a", participantId: "synthetic-participant",
    displayName: "Synthetic Gate 2", status: "managed", environments: ["disposable-loopback"],
    verificationCommands: ["npm.cmd run test:gate2"], sourceReferences: ["workspace:explicit"],
    memoryEnabled: true, memory: ["This synthetic project remains read-only."] });
  await continuity.seedProject({ projectId: "synthetic-project-b", participantId: "other-synthetic-participant",
    displayName: "Foreign Synthetic Project", status: "managed" });

  const embedder = new OpenAICompatibleEmbedder({ baseURL: "http://127.0.0.1:9681/v1",
    modelId: "stub-embed-v1", dimension: 768, timeoutMs: 1_000 });
  const bge = new WindowedBgeReranker({ baseURL: "http://127.0.0.1:9675", timeoutMs: 1_000 });
  const derived = new QdrantDerivedIndex({ endpoint: "http://127.0.0.1:9673", embedder,
    reranker: bge, timeoutMs: 1_000 });
  const alignment = await derived.rebuild(await records.listActiveSources());

  const commonEnv = {
    GATE2_PG_URL: postgres.connectionString,
    GATE2_QDRANT_URL: "http://127.0.0.1:9673",
    GATE2_PROVIDER_URL: "http://127.0.0.1:9681/v1",
    GATE2_MODEL_ID: "stub-gate2-v1",
    GATE2_RERANK_URL: "http://127.0.0.1:9675",
    GATE2_OTEL_URL: "http://127.0.0.1:9678/v1/traces",
    GATE2_TELEMETRY_HMAC_KEY: "synthetic-gate2-integration-key",
  };
  const phases = ["interrupt", "resume", "duplicate", "concurrent", "general", "research", "guarded", "workspace",
    "workspace-denied", "unverified", "continuity-prepare", "continuity-resume"];
  const outcomes = {};
  for (const phase of phases) outcomes[phase] = await runWorker(phase, commonEnv);

  const pool = new pg.Pool({ connectionString: postgres.connectionString });
  const database = (await pool.query(`SELECT
    (SELECT count(*)::int FROM gate1.answer_requests) gate1_requests,
    (SELECT count(*)::int FROM gate1.thread_turns) gate1_turns,
    (SELECT count(*)::int FROM gate2.answer_requests) gate2_requests,
    (SELECT count(*)::int FROM gate2.chat_turns) gate2_turns,
    (SELECT count(*)::int FROM gate2.chats) chats,
    (SELECT count(*)::int FROM gate2.projects) projects,
    (SELECT count(*)::int FROM checkpoints) checkpoints`)).rows[0];
  const gate1RowsBeforeRollback = (await pool.query("SELECT count(*)::int count FROM gate1.answer_requests")).rows[0].count;
  await pool.query("DROP SCHEMA gate2 CASCADE");
  const rollback = (await pool.query(`SELECT
    to_regnamespace('gate2') IS NULL gate2_removed,
    to_regclass('gate1.answer_requests') IS NOT NULL gate1_retained,
    (SELECT count(*)::int FROM gate1.answer_requests) gate1_rows`)).rows[0];
  await pool.end();

  const waitUntil = Date.now() + 5_000;
  while (Date.now() < waitUntil && !existsSync(tracePath)) await new Promise(resolve => setTimeout(resolve, 100));
  const traces = existsSync(tracePath) ? await readFile(tracePath, "utf8") : "";
  const wire = existsSync(providerWirePath) ? (await readFile(providerWirePath, "utf8")).trim()
    .split(/\r?\n/).filter(Boolean).map(JSON.parse) : [];
  const providerChatCalls = wire.filter(item => String(item.url).endsWith("/chat/completions")).length;
  const checks = {
    selectedStackReached: alignment.aligned && alignment.digestsAligned,
    restartInterruptedAfterCommit: outcomes.interrupt.interrupted && outcomes.interrupt.counts.request_rows === 1,
    restartResumedWithoutDuplicate: outcomes.resume.response.requestId === "g2-integration-restart" &&
      outcomes.resume.counts.gate2_turns === outcomes.interrupt.counts.gate2_turns,
    duplicateExactlyOnce: outcomes.duplicate.counts.request_rows === 1 &&
      outcomes.duplicate.response.answer === outcomes.duplicate.duplicateResponse.answer &&
      outcomes.duplicate.response.trace.correlationId === outcomes.duplicate.duplicateResponse.trace.correlationId &&
      JSON.stringify(outcomes.duplicate.response.citations) === JSON.stringify(outcomes.duplicate.duplicateResponse.citations) &&
      outcomes.duplicate.response.continuity.turnRecorded === true &&
      outcomes.duplicate.duplicateResponse.continuity.turnRecorded === false,
    concurrentDuplicateExactlyOnce: outcomes.concurrent.counts.request_rows === 1 &&
      outcomes.concurrent.responses.every(item => item.answer === outcomes.concurrent.responses[0].answer &&
        item.trace.correlationId === outcomes.concurrent.responses[0].trace.correlationId) &&
      outcomes.concurrent.responses.filter(item => item.continuity.turnRecorded).length === 1,
    generalRoleDeterministic: outcomes.general.response.status.modelRole === "chat" && outcomes.general.response.citations.length === 1,
    researchRoleDeterministic: outcomes.research.response.status.modelRole === "research" && outcomes.research.response.research !== null,
    guardedRoleDeterministic: outcomes.guarded.response.status.modelRole === "chat" && outcomes.guarded.response.effects.length === 0,
    workspaceExplicitOnly: outcomes.workspace.response.status.modelRole === "code" &&
      outcomes.workspace.response.workspace.resolvedSources === 1 && outcomes.workspace.response.workspace.extraReads === 0,
    workspaceCrossProjectDenied: outcomes["workspace-denied"].response.completion.reason === "workspace-cross-project-denied" &&
      !JSON.stringify(outcomes["workspace-denied"]).includes("FORBIDDEN_GATE2_CROSS_PROJECT_CANARY"),
    unverifiedEphemeral: !outcomes.unverified.response.continuity.durableChatEligible &&
      !outcomes.unverified.response.continuity.turnRecorded && outcomes.unverified.counts.request_rows === 0,
    continuityRestartPreserved: outcomes["continuity-resume"].chat.turns.length === 2 &&
      outcomes["continuity-resume"].branch.turns.length === 1 && outcomes["continuity-resume"].search.length === 1,
    projectAndSettingPreserved: outcomes["continuity-resume"].project.displayName === "Synthetic Gate 2" &&
      outcomes["continuity-resume"].settings.defaultIntelligenceLevel === "High",
    protectedStoresNeverOpened: ["general", "research", "guarded", "workspace", "workspace-denied", "unverified"]
      .every(name => outcomes[name].response.status.protectedStoresOpened === false),
    answerGatesAcrossLanes: ["general", "research", "guarded", "workspace"]
      .every(name => outcomes[name].response.gates.performed === true),
    providerCallsBounded: providerChatCalls === 10,
    durableCountsExact: database.gate1_requests === 9 && database.gate1_turns === 9 &&
      database.gate2_requests === 10 && database.gate2_turns === 11 && database.chats === 10,
    checkpointsPresent: database.checkpoints > 0,
    tracesRetained: traces.includes("runaai.gate2.answer") && traces.includes("completion.reason"),
    tracesRedacted: !traces.includes("synthetic-participant") && !traces.includes("synthetic-project-a") &&
      !traces.includes("chat-continuity") && !traces.includes("FORBIDDEN_GATE2_CROSS_PROJECT_CANARY"),
    rollbackGate2Only: rollback.gate2_removed && rollback.gate1_retained &&
      rollback.gate1_rows === gate1RowsBeforeRollback,
  };
  report = {
    schemaVersion: "runa2-gate2-stub-integration/v1",
    runtime: process.version,
    selectedComposition: ["Mastra", "AI SDK/OpenAI-compatible", "Caddy", "LangGraph/PostgreSQL",
      "PostgreSQL records and continuity", "Qdrant derived index", "windowed reranker", "OpenTelemetry"],
    syntheticOnly: true,
    protectedDataUsed: false,
    networking: "loopback-disposable-only",
    alignment,
    database,
    rollback,
    providerChatCalls,
    outcomes,
    traceSha256: sha256(traces),
    checks,
    passed: Object.values(checks).every(Boolean),
  };
  if (!report.passed) throw new Error(`Gate 2 integration checks failed: ${JSON.stringify(checks)}`);
} catch (error) {
  failure = error;
} finally {
  await records?.close().catch(() => {});
  await continuity?.close().catch(() => {});
  stopped.caddy = await stopChild(caddy);
  stopped.reranker = await stopChild(reranker);
  stopped.provider = await stopChild(provider);
  stopped.collector = await stopChild(collector);
  stopped.qdrant = await stopChild(qdrant);
  stopped.postgres = postgres?.stop() ?? true;
}

if (report) {
  report.servicesStopped = stopped;
  report.rollbackClean = Object.values(stopped).every(Boolean);
  report.passed &&= report.rollbackClean;
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ passed: report.passed, checks: report.checks,
    servicesStopped: report.servicesStopped, database: report.database,
    providerChatCalls: report.providerChatCalls })}\n`);
}
if (failure) throw failure;
if (!report?.passed) process.exitCode = 1;
