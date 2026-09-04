import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { MastraAnswerProvider } from "../../gate1/adapters/mastra-provider.mjs";
import { OpenAICompatibleEmbedder, WindowedBgeReranker } from "../../gate1/adapters/qdrant.mjs";
import { m1FunctionConfigSchema, assertM1Roles } from "./config.mjs";
import { resolveModelRole } from "./model-roles.mjs";
import { BoundedNomicEmbedder } from "./nomic-windowing.mjs";
import { MastraM1Planner } from "./planner.mjs";
import { SelectedSourceIndex, PostgresSuppliedSourceStore } from "./sources.mjs";
import { DisposableJavascriptProjectAdapter } from "./project/adapter.mjs";
import { PostgresTaskStore } from "./tasks/postgres.mjs";
import { M1TaskService } from "./tasks/service.mjs";
import { createM1TaskWorkflow } from "./tasks/workflow.mjs";
import { M1TaskOrchestrator } from "./tasks/orchestrator.mjs";
import { M1RoleOrchestrator } from "./role-orchestrator.mjs";
import { M1FunctionSurface, M1SessionAuthority, M1_EXERCISE_SUITE } from "./surface.mjs";
import { PostgresServerWorkspaceStore } from "./server-workspace/postgres.mjs";
import { ServerWorkspaceService } from "./server-workspace/service.mjs";
import { assertNativeCandidateConfig } from "./server-workspace/native-candidate-config.mjs";
import { createWatchdogAuthorityVerifier, createControlWatchdogClient } from "./server-workspace/control-watchdog-host.mjs";
import { createWindowsNativeWorkspaceHost } from "./server-workspace/windows-native-host.mjs";
import { createPublicGitControlWorkerComposition } from "./server-workspace/control-worker-composition.mjs";
import { createPostgresArtifactResultSourcePorts } from "./artifact-result-postgres.mjs";

const TRUSTED_TASK_HOOK_NAMES = new Set(["afterIntent", "beforeDispatch", "afterMaterialize", "afterTests", "afterCommit", "beforeCommit"]);
export function validateTrustedTaskHooks(value) {
  if (value === undefined) return Object.freeze({});
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).some(key => typeof key !== "string" || !TRUSTED_TASK_HOOK_NAMES.has(key) ||
        typeof Object.getOwnPropertyDescriptor(value, key)?.value !== "function")) {
    throw new Error("m1-trusted-task-hooks-invalid");
  }
  return Object.freeze({ ...value });
}

async function collectNativeCandidateCleanupFailures(resources) {
  const cleanupFailures = [];
  for (const resource of [...resources].reverse()) {
    try { await resource.close(); } catch (error) { cleanupFailures.push(error); }
  }
  return cleanupFailures;
}

export async function closeNativeCandidateResources(resources) {
  const cleanupFailures = await collectNativeCandidateCleanupFailures(resources);
  if (cleanupFailures.length === 1) throw cleanupFailures[0];
  if (cleanupFailures.length > 1) {
    throw new AggregateError(cleanupFailures, "m1-native-candidate-cleanup-failed");
  }
}

export async function rejectNativeCandidateConstruction(resources, cause) {
  const cleanupFailures = await collectNativeCandidateCleanupFailures(resources);
  if (cleanupFailures.length > 0) {
    throw new AggregateError([cause, ...cleanupFailures], "m1-native-candidate-construction-cleanup-failed");
  }
  throw cause;
}

export function createNativeCandidateAttachment(resources, createSurface) {
  if (resources !== null && (!Array.isArray(resources)
      || resources.some(resource => !resource || typeof resource.close !== "function"))) {
    throw new Error("m1-native-candidate-resource-ownership-invalid");
  }
  if (typeof createSurface !== "function") throw new Error("m1-native-candidate-surface-factory-invalid");
  let ownedResources = resources;
  let state = "pending";
  const takeOwnedResources = () => {
    const owned = ownedResources;
    ownedResources = null;
    return owned;
  };
  return Object.freeze({
    async attach(application) {
      if (state !== "pending") throw new Error("m1-native-candidate-attach-state-invalid");
      state = "attaching";
      try {
        const surface = await createSurface(application);
        state = "attached";
        return surface;
      } catch (error) {
        state = "failed";
        const owned = takeOwnedResources();
        if (owned !== null) await rejectNativeCandidateConstruction(owned, error);
        throw error;
      }
    },
    async close() {
      if (state === "attaching") throw new Error("m1-native-candidate-close-during-attach");
      const owned = takeOwnedResources();
      if (owned === null) return;
      state = "closed";
      await closeNativeCandidateResources(owned);
    },
  });
}

export async function composeM1Functions({ configuration, provider, pool, cipher, javascriptExecutor, dataDirectory,
  projectFixtures, taskHooks, serverWorkspace, nativeCandidateConfig }) {
  // Construction-time fault injection for the isolated acceptance host only. These
  // hooks never enter a release schema, request, task, model plan or capability.
  const hooks = validateTrustedTaskHooks(taskHooks);
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
  const embedder = new BoundedNomicEmbedder(new OpenAICompatibleEmbedder({ baseURL: config.embedding.baseUrl,
    modelId: config.embedding.modelId, dimension: config.embedding.dimension, timeoutMs: 10_000, fetchImpl: privateFetch }));
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
  const { conversationResults, taskResults } = createPostgresArtifactResultSourcePorts({ pool, cipher });
  const sessions = new M1SessionAuthority();
  let serverWorkspaces = null;
  let nativeCandidateResources = null;
  if (nativeCandidateConfig !== undefined && nativeCandidateConfig !== null && serverWorkspace === undefined) {
    throw new Error("m1-native-candidate-requires-server-workspace");
  }
  try {
    if (serverWorkspace !== undefined) {
    if (!serverWorkspace || Object.getPrototypeOf(serverWorkspace) !== Object.prototype
        || Object.keys(serverWorkspace).join(",") !== "sourceDefinition") {
      throw new Error("m1-trusted-server-workspace-invalid");
    }
      let workspaceStore = null, watchdog = null, nativeHost = null;
      let materializer = null;
      if (nativeCandidateConfig !== undefined && nativeCandidateConfig !== null) {
        nativeCandidateResources = [];
        const candidate = assertNativeCandidateConfig(nativeCandidateConfig);
        const verifyWatchdogAuthority = createWatchdogAuthorityVerifier(candidate);
        workspaceStore = new PostgresServerWorkspaceStore({ pool, cipher, verifyWatchdogAuthority });
        nativeCandidateResources.push(workspaceStore);
        await workspaceStore.initialize();
        watchdog = createControlWatchdogClient(candidate);
        nativeCandidateResources.push(watchdog);
        nativeHost = createWindowsNativeWorkspaceHost(candidate);
        nativeCandidateResources.push(nativeHost);
        materializer = createPublicGitControlWorkerComposition({ database: workspaceStore, watchdog, nativeHost,
          workerReleaseSha256: candidate.workerReleaseSha256 });
      } else {
        workspaceStore = new PostgresServerWorkspaceStore({ pool, cipher });
        await workspaceStore.initialize();
      }
      serverWorkspaces = new ServerWorkspaceService({ store: workspaceStore, materializer,
        sourceDefinition: serverWorkspace.sourceDefinition,
        authorizeContext: context => sessions.authorize(context) });
    }
    const tasks = new M1TaskService({ store, adapter, authorizeContext: context => sessions.authorize(context), hooks });
    const checkpointer = new PostgresSaver(pool, undefined, { schema: "runa_m1_checkpoints" }); await checkpointer.setup();
    const workflow = createM1TaskWorkflow({ service: tasks, checkpointer });
    const forRole = role => new M1TaskOrchestrator({ service: tasks,
      planner: new MastraM1Planner({ provider, role, reasoningEffort: config.requestControls[role].reasoningEffort }), workflow,
      // Narrowed planning/active budgets; an interrupted HTTP acknowledgement is recovered from the run, never blindly retried.
      budgets: { planningTimeoutMs: 30_000, maximumRequestActiveMs: 55_000, maximumRunActiveMs: 120_000 } });
    const orchestrator = new M1RoleOrchestrator({ code: forRole("code"), agent: forRole("agent") });
    const review = new MastraAnswerProvider({ ...resolveModelRole(provider, "review"), providerName: "private-openai-compatible",
      reasoningEffort: config.requestControls.review.reasoningEffort, preventRedirects: true, maxOutputTokens: 1024 });
    async function health() {
      const probe = async url => { try { return (await privateFetch(url, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } };
      const [qdrant, embedding, reranker] = await Promise.all([
        probe(`${config.qdrant.endpoint.replace(/\/$/, "")}/readyz`),
        probe(`${config.embedding.baseUrl.replace(/\/$/, "")}/models`),
        probe(`${config.reranker.baseUrl.replace(/\/$/, "")}/health`),
      ]);
      return { qdrant, embedding, reranker, ready: qdrant && embedding && reranker };
    }
    const candidateAttachment = createNativeCandidateAttachment(nativeCandidateResources,
      application => new M1FunctionSurface({ application, sources, tasks, orchestrator, sessions,
        serverWorkspaces, conversationResults, taskResults,
        ...(projectFixtures ? { prepareProject: projectFixtures.prepare } : {}) }));
    const composed = { index, sources, tasks, orchestrator, review, health, conversationResults, taskResults,
      attach: application => candidateAttachment.attach(application),
      close: () => candidateAttachment.close() };
    return composed;
  } catch (error) {
    if (nativeCandidateResources !== null) {
      await rejectNativeCandidateConstruction(nativeCandidateResources, error);
    }
    throw error;
  }
}
