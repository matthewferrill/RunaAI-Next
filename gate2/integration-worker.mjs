import pg from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { PostgresRecordStore } from "../gate1/adapters/postgres.mjs";
import { MastraAnswerProvider } from "../gate1/adapters/mastra-provider.mjs";
import { OpenAICompatibleEmbedder, QdrantDerivedIndex, WindowedBgeReranker } from "../gate1/adapters/qdrant.mjs";
import { PostgresContinuityStore } from "./adapters/postgres.mjs";
import { Gate2ReadOnlyService } from "./core.mjs";
import { createGate2Telemetry } from "./telemetry.mjs";
import { createGate2Workflow } from "./workflow.mjs";

const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
};

const phase = required("GATE2_PHASE");
const pgUrl = required("GATE2_PG_URL");
const modelId = required("GATE2_MODEL_ID");
const participantId = "synthetic-participant";
const projectId = "synthetic-project-a";

const request = ({ requestId, message, lane = "general", threadId = `chat-${requestId}`,
  verified = true, selectedProject = projectId, sources = null }) => ({
  schemaVersion: "runa2-answer-request/v2",
  requestId,
  lane,
  participant: { principalId: participantId, verified },
  project: { projectId: selectedProject },
  thread: { threadId },
  message,
  history: [],
  workspace: sources ? { sources } : null,
  budgets: { deadlineMs: 2_000, maximumPasses: 6, maximumPassages: 8,
    maximumEvidenceCharacters: 8_000 },
});

const restartRequest = request({ requestId: "g2-integration-restart", lane: "research",
  message: "Resume the synthetic Gate 2 answer after process restart." });
const phaseRequests = {
  interrupt: restartRequest,
  resume: restartRequest,
  duplicate: request({ requestId: "g2-integration-duplicate",
    message: "Return one synthetic answer for duplicate delivery." }),
  concurrent: request({ requestId: "g2-integration-concurrent",
    message: "Return one synthetic answer for concurrent duplicate delivery." }),
  general: request({ requestId: "g2-integration-general",
    message: "Where is Gate 2 continuity stored?" }),
  research: request({ requestId: "g2-integration-research", lane: "research",
    message: "How does Gate 2 preserve read-only research continuity?" }),
  guarded: request({ requestId: "g2-integration-guarded", lane: "guarded",
    message: "Which synthetic policy keeps guarded lookup read-only?" }),
  workspace: request({ requestId: "g2-integration-workspace", lane: "workspace",
    message: "Summarize the explicit synthetic workspace source.",
    sources: [{ sourceId: "workspace", sectionId: "explicit" }] }),
  "workspace-denied": request({ requestId: "g2-integration-workspace-denied", lane: "workspace",
    message: "Read the explicit foreign workspace source.",
    sources: [{ sourceId: "foreign", sectionId: "secret" }] }),
  unverified: request({ requestId: "g2-integration-unverified", verified: false,
    message: "Answer without durable continuity for an unverified participant." }),
};

const sdk = new NodeSDK({ autoDetectResources: false,
  traceExporter: new OTLPTraceExporter({ url: required("GATE2_OTEL_URL") }) });
sdk.start();
const records = new PostgresRecordStore({ connectionString: pgUrl });
const continuity = new PostgresContinuityStore({ connectionString: pgUrl });
const checkpointer = PostgresSaver.fromConnString(pgUrl, { schema: "public" });
const countState = async requestId => {
  const pool = new pg.Pool({ connectionString: pgUrl });
  try {
    return (await pool.query(`SELECT
      (SELECT count(*)::int FROM gate1.answer_requests) gate1_requests,
      (SELECT count(*)::int FROM gate1.thread_turns) gate1_turns,
      (SELECT count(*)::int FROM gate2.answer_requests) gate2_requests,
      (SELECT count(*)::int FROM gate2.chat_turns) gate2_turns,
      (SELECT count(*)::int FROM gate2.answer_requests WHERE request_id=$1) request_rows`, [requestId])).rows[0];
  } finally { await pool.end(); }
};

let output;
try {
  await records.initialize();
  await continuity.initialize();
  await checkpointer.setup();
  const embedder = new OpenAICompatibleEmbedder({ baseURL: required("GATE2_PROVIDER_URL"),
    modelId: "stub-embed-v1", dimension: 768, timeoutMs: 500 });
  const reranker = new WindowedBgeReranker({ baseURL: required("GATE2_RERANK_URL"), timeoutMs: 500 });
  const index = new QdrantDerivedIndex({ endpoint: required("GATE2_QDRANT_URL"), embedder,
    reranker, timeoutMs: 500 });
  const provider = role => new MastraAnswerProvider({ baseURL: required("GATE2_PROVIDER_URL"),
    modelId, role, providerName: `gate2-${role}-adapter` });
  const service = new Gate2ReadOnlyService({ records, index,
    providers: { chat: provider("chat"), research: provider("research"), code: provider("code") },
    continuity, workspaceResolver: continuity,
    statusProvider: () => ({ provider: "available", retrieval: "available", reranker: "available" }),
    telemetry: createGate2Telemetry({ hmacKey: required("GATE2_TELEMETRY_HMAC_KEY") }) });
  const workflow = createGate2Workflow({ service, checkpointer });

  if (phase === "continuity-prepare") {
    const first = request({ requestId: "g2-continuity-one", threadId: "chat-continuity",
      message: "Record the first synthetic continuity turn." });
    const second = request({ requestId: "g2-continuity-two", threadId: "chat-continuity", lane: "research",
      message: "Record the second synthetic continuity turn." });
    const responses = [await workflow.answer(first), await workflow.answer(second)];
    await continuity.setSetting(participantId, "defaultIntelligenceLevel", "High");
    await continuity.setChatState(participantId, projectId, "chat-continuity",
      { unread: true, title: "Synthetic continuity chat" });
    const branch = await continuity.branchChat(participantId, projectId, "chat-continuity",
      { atTurn: 0, newChatId: "chat-continuity-branch", title: "Synthetic branch" });
    output = { phase, responses, branch };
  } else if (phase === "continuity-resume") {
    output = {
      phase,
      chat: await continuity.readChat(participantId, projectId, "chat-continuity"),
      branch: await continuity.readChat(participantId, projectId, "chat-continuity-branch"),
      chats: await continuity.listChats(participantId, projectId, { includeArchived: true }),
      search: await continuity.searchChats(participantId, projectId, "second"),
      settings: await continuity.settingValues(participantId),
      project: await continuity.readProject(participantId, projectId),
    };
  } else {
    const envelope = phaseRequests[phase];
    if (!envelope) throw new Error(`unknown phase ${phase}`);
    const started = Date.now();
    try {
      if (phase === "concurrent") {
        const responses = await Promise.all([workflow.answer(envelope), workflow.answer(envelope)]);
        output = { phase, interrupted: false, responses };
      } else {
        const response = await workflow.answer(envelope, {
          interruptAfterCheckpoint: phase === "interrupt",
          resume: phase === "resume",
        });
        output = { phase, interrupted: false, response };
        if (phase === "duplicate") output.duplicateResponse = await workflow.answer(envelope);
      }
    } catch (error) {
      if (phase !== "interrupt" || error?.code !== "response-delivery-interrupted") throw error;
      output = { phase, interrupted: true, code: error.code };
    }
    output.elapsedMs = Date.now() - started;
    output.counts = await countState(envelope.requestId);
  }
} finally {
  await records.close().catch(() => {});
  await continuity.close().catch(() => {});
  await checkpointer.end?.().catch(() => {});
  await sdk.shutdown().catch(() => {});
}

process.stdout.write(`${JSON.stringify(output)}\n`);
