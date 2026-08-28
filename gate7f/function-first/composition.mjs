import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { MastraAnswerProvider } from "../../gate1/adapters/mastra-provider.mjs";
import { OpenAICompatibleEmbedder, WindowedBgeReranker } from "../../gate1/adapters/qdrant.mjs";
import { m1FunctionConfigSchema, assertM1Roles } from "./config.mjs";
import { resolveModelRole } from "./model-roles.mjs";
import { MastraM1Planner } from "./planner.mjs";
import { SelectedSourceIndex, PostgresSuppliedSourceStore } from "./sources.mjs";
import { DisposableJavascriptProjectAdapter } from "./project/adapter.mjs";
import { PostgresTaskStore } from "./tasks/postgres.mjs";
import { M1TaskService } from "./tasks/service.mjs";
import { createM1TaskWorkflow } from "./tasks/workflow.mjs";
import { M1TaskOrchestrator } from "./tasks/orchestrator.mjs";
import { M1RoleOrchestrator } from "./role-orchestrator.mjs";
import { M1FunctionSurface, M1SessionAuthority, M1_EXERCISE_SUITE } from "./surface.mjs";

export async function composeM1Functions({ configuration, provider, pool, cipher, javascriptExecutor, dataDirectory, projectFixtures }) {
  const config = m1FunctionConfigSchema.parse(configuration); assertM1Roles(provider);
  // Trusted construction only: the isolated acceptance host supplies fixed suites and
  // an authenticated-scope resolver. Neither release JSON nor a browser/model payload
  // can select filesystem roots, fixture bytes, suites or expected results.
  if (projectFixtures !== undefined && (!projectFixtures || typeof projectFixtures.prepare !== "function" ||
      !projectFixtures.suites || typeof projectFixtures.suites !== "object" || Array.isArray(projectFixtures.suites) ||
      Object.keys(projectFixtures).some(key => !["prepare", "suites"].includes(key)))) {
    throw new Error("m1-trusted-project-fixtures-invalid");
  }
  const privateFetch = (input, init) => fetch(input, { ...init, redirect: "error" });
  const embedder = new OpenAICompatibleEmbedder({ baseURL: config.embedding.baseUrl,
    modelId: config.embedding.modelId, dimension: config.embedding.dimension, timeoutMs: 10_000, fetchImpl: privateFetch });
  const reranker = new WindowedBgeReranker({ baseURL: config.reranker.baseUrl, batchSize: config.reranker.batchSize,
    timeoutMs: 10_000, fetchImpl: privateFetch });
  const index = new SelectedSourceIndex({ endpoint: config.qdrant.endpoint, collection: config.qdrant.collection, embedder, reranker });
  await index.initialize();
  const sources = new PostgresSuppliedSourceStore({ pool, cipher, index }); await sources.initialize();
  // Only a fixed application-owned sibling directory, never a browser/model-selected filesystem root.
  const baseDirectory = resolve(dataDirectory, "m1-projects"); await mkdir(baseDirectory, { recursive: true });
  const adapter = new DisposableJavascriptProjectAdapter({ baseDirectory, executor: javascriptExecutor,
    suites: projectFixtures?.suites ?? { [M1_EXERCISE_SUITE.suiteId]: M1_EXERCISE_SUITE } });
  const store = new PostgresTaskStore({ pool, cipher }); await store.initialize();
  const sessions = new M1SessionAuthority();
  const tasks = new M1TaskService({ store, adapter, authorizeContext: context => sessions.authorize(context) });
  const checkpointer = new PostgresSaver(pool, undefined, { schema: "runa_m1_checkpoints" }); await checkpointer.setup();
  const workflow = createM1TaskWorkflow({ service: tasks, checkpointer });
  const forRole = role => new M1TaskOrchestrator({ service: tasks,
    planner: new MastraM1Planner({ provider, role, reasoningEffort: config.requestControls[role].reasoningEffort }), workflow,
    // Narrowed planning/active budgets; an interrupted HTTP acknowledgement is recovered from the run, never blindly retried.
    budgets: { planningTimeoutMs: 30_000, maximumActiveMs: 55_000 } });
  const orchestrator = new M1RoleOrchestrator({ code: forRole("code"), agent: forRole("agent") });
  const review = new MastraAnswerProvider({ ...resolveModelRole(provider, "review"), providerName: "private-openai-compatible",
    reasoningEffort: config.requestControls.review.reasoningEffort, preventRedirects: true });
  async function health() {
    const probe = async url => { try { return (await privateFetch(url, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } };
    const [qdrant, embedding, reranker] = await Promise.all([
      probe(`${config.qdrant.endpoint.replace(/\/$/, "")}/readyz`),
      probe(`${config.embedding.baseUrl.replace(/\/$/, "")}/models`),
      probe(`${config.reranker.baseUrl.replace(/\/$/, "")}/health`),
    ]);
    return { qdrant, embedding, reranker, ready: qdrant && embedding && reranker };
  }
  return { index, sources, tasks, orchestrator, review, health,
    attach(application) { return new M1FunctionSurface({ application, sources, tasks, orchestrator, sessions,
      ...(projectFixtures ? { prepareProject: projectFixtures.prepare } : {}) }); } };
}
