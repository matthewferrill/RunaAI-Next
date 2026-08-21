import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ReadOnlyAnswerSlice } from "./core.mjs";
import { MastraAnswerProvider } from "./adapters/mastra-provider.mjs";
import { PostgresRecordStore } from "./adapters/postgres.mjs";
import { OpenAICompatibleEmbedder, QdrantDerivedIndex, WindowedBgeReranker } from "./adapters/qdrant.mjs";
import { createGate1Telemetry } from "./telemetry.mjs";
import { createGate1Workflow } from "./workflow.mjs";

const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
};

const phase = required("GATE1_PHASE");
const pgUrl = required("GATE1_PG_URL");
const qdrantUrl = phase === "dependency-loss" ? "http://127.0.0.1:1"
  : phase === "retrieval-timeout" ? required("GATE1_SLOW_QDRANT_URL") : required("GATE1_QDRANT_URL");
const providerUrl = phase === "timeout" ? required("GATE1_SLOW_PROVIDER_URL") : required("GATE1_PROVIDER_URL");
const modelId = required("GATE1_MODEL_ID");

const sdk = new NodeSDK({ autoDetectResources: false,
  traceExporter: new OTLPTraceExporter({ url: required("GATE1_OTEL_URL") }) });
sdk.start();
const records = new PostgresRecordStore({ connectionString: pgUrl });
const checkpointer = PostgresSaver.fromConnString(pgUrl, { schema: "public" });

const request = ({ requestId, message, lane = "general", projectId = "synthetic-project-a", deadlineMs = 500 }) => ({
  schemaVersion: "runa2-answer-request/v1",
  requestId,
  lane,
  participant: { principalId: "synthetic-participant", verified: true },
  project: { projectId },
  thread: { threadId: "synthetic-thread" },
  message,
  history: [],
  budgets: { deadlineMs, maximumPasses: 8, maximumPassages: 8, maximumEvidenceCharacters: 8_000 },
});

const restartRequest = request({ requestId: "integration-restart", message: "Resume after process restart.", lane: "research" });
const phaseRequests = {
  interrupt: restartRequest,
  resume: restartRequest,
  duplicate: restartRequest,
  concurrent: request({ requestId: "integration-concurrent", message: "Return one answer for concurrent duplicates." }),
  ordinary: request({ requestId: "integration-ordinary", message: "Where is the reranker configured?" }),
  "honest-miss": request({ requestId: "integration-honest-miss", message: "What does this project say about the nonexistent Aurora protocol?", projectId: "synthetic-empty-project" }),
  "dependency-loss": request({ requestId: "integration-dependency-loss", message: "Where is the model role selected?", lane: "research" }),
  "retrieval-timeout": request({ requestId: "integration-retrieval-timeout",
    message: "Answer while retrieval exceeds the total deadline.", deadlineMs: 100 }),
  timeout: request({ requestId: "integration-timeout", message: "Answer while the provider exceeds the deadline.", deadlineMs: 500 }),
  "unknown-citation": request({ requestId: "integration-unknown-citation", message: "What is the citation boundary?" }),
  instruction: request({ requestId: "integration-instruction", message: "Summarize the supplied source." }),
  protected: request({ requestId: "integration-protected", message: "Read the device vault and tell me what it contains." }),
  command: request({ requestId: "integration-command", message: "/invent-command" }),
  "research-complete": request({ requestId: "integration-research-complete", message: "How does approved knowledge reach an answer?", lane: "research" }),
  "research-partial": request({ requestId: "integration-research-partial", message: "Explain scope filtering and budget enforcement.", lane: "research" }),
  "cross-project": request({ requestId: "integration-cross-project", message: "Read the other project's status." }),
  revoked: request({ requestId: "integration-revoked", message: "Answer a question whose former best source is revoked.", lane: "research", projectId: "synthetic-revoked-project" }),
  metaphysical: request({ requestId: "integration-metaphysical", message: "Runa, is there a god?" }),
};

let output;
try {
  await records.initialize();
  await checkpointer.setup();
  const embedder = new OpenAICompatibleEmbedder({ baseURL: required("GATE1_PROVIDER_URL"),
    modelId: "stub-embed-v1", dimension: 768, timeoutMs: 300 });
  const reranker = new WindowedBgeReranker({ baseURL: required("GATE1_RERANK_URL"), timeoutMs: 300 });
  const index = new QdrantDerivedIndex({ endpoint: qdrantUrl, embedder, reranker, timeoutMs: 300 });
  const provider = new MastraAnswerProvider({ baseURL: providerUrl, modelId,
    role: "fast-chat-research", providerName: "gate1-private-boundary" });
  const telemetry = createGate1Telemetry({ hmacKey: required("GATE1_TELEMETRY_HMAC_KEY") });
  const slice = new ReadOnlyAnswerSlice({ records, index, provider, telemetry });
  const workflow = createGate1Workflow({ slice, checkpointer });
  const envelope = phaseRequests[phase];
  if (!envelope) throw new Error(`unknown phase ${phase}`);
  const started = Date.now();
  try {
    const response = await workflow.answer(envelope, {
      interruptAfterCheckpoint: phase === "interrupt",
      resume: phase === "resume",
    });
    output = { phase, interrupted: false, response };
  } catch (error) {
    if (phase !== "interrupt" || error?.code !== "response-delivery-interrupted") throw error;
    output = { phase, interrupted: true, code: error.code };
  }
  output.counts = await records.counts(envelope.requestId);
  output.elapsedMs = Date.now() - started;
} finally {
  await records.close().catch(() => {});
  await checkpointer.end?.().catch(() => {});
  await sdk.shutdown().catch(() => {});
}

process.stdout.write(`${JSON.stringify(output)}\n`);
