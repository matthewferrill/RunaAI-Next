import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { PostgresGate4aStore } from "../../../gate4/adapters/postgres.mjs";
import { SelectedCoreApplication } from "../../../gate6b/application.mjs";
import { PostgresSelectedContinuityStore, PostgresWorkspaceStore, PostgresRequestCoordinator } from "../../../gate6b/adapters/postgres-continuity.mjs";
import { createCandidateHttpServer } from "../../../gate6b/http-server.mjs";
import { createReleaseAnswerProviders } from "../../../gate6b/model-role-providers.mjs";
import { Gate2ReadOnlyService } from "../../../gate2/core.mjs";
import { composeM1Functions } from "../composition.mjs";
import { MODEL_CASES } from "./cases.mjs";
import { fail, sha256 } from "./runner-contract.mjs";
import { withSyntheticBootstrap } from "./browser-bootstrap.mjs";
import { captureTaskCheckpoints } from "./checkpoint-probes.mjs";

export function acceptancePublicStatus({ application, sourceIdentity, dependencyHealth }) {
  if (!/^[a-f0-9]{40}$/.test(sourceIdentity.sourceCommit ?? "") || !/^[a-f0-9]{64}$/.test(sourceIdentity.sourceArchiveSha256 ?? "")) throw fail("m1-public-status-source-invalid");
  return {
    async runtimeStatus() {
      const cutover = await application.cutoverStatus();
      return { schemaVersion: "runa2-gate6-runtime-status/v2", synthetic: true,
        running: { releaseId: "m1-isolated-acceptance", commit: sourceIdentity.sourceCommit,
          artifactDigest: sourceIdentity.sourceArchiveSha256, applicationEntryPoint: "gate7f/function-first/acceptance/control-functional.mjs" },
        selectedScopeVersion: "m1-supplied-text-and-disposable-javascript", authorityGeneration: cutover.authorityGeneration,
        cutover: { phase: cutover.phase, revision: cutover.revision ?? 0 }, privateValuesIncluded: false };
    },
    async readinessStatus() {
      const [authority, dependencies] = await Promise.all([application.authority().then(() => "active", () => "unavailable"), dependencyHealth()]);
      return { schemaVersion: "runa2-gate6b-shadow-readiness/v1", authority, dependencies, synthetic: true,
        protectedDataImported: false, ownerCredentialEnrolled: false, productionTrafficChanged: false, privateValuesIncluded: false };
    },
  };
}

// Synthetic account issuer is an explicit harness seam. All downstream cookie,
// current-session, ownership, continuity, grant and effect checks are shipped code.
// This never loads owner identities, private credentials or production session rows.
export class SyntheticBrowserIdentity {
  constructor(pool, getLedger) { this.pool = pool; this.getLedger = getLedger; this.publicBaseUrl = "http://127.0.0.1"; }
  async initialize() { await this.pool.query(`CREATE SCHEMA IF NOT EXISTS runa_acceptance;
    CREATE TABLE IF NOT EXISTS runa_acceptance.sessions (
      session_hash text PRIMARY KEY, principal_id text NOT NULL, revoked boolean NOT NULL DEFAULT false,
      expires_at timestamptz NOT NULL);`); }
  async issue(principalId) {
    if (!/^m1-test-[a-f0-9]{24,64}$/.test(principalId)) throw fail("m1-synthetic-principal-invalid");
    const sessionId = randomBytes(32).toString("hex");
    await this.pool.query("INSERT INTO runa_acceptance.sessions(session_hash,principal_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [sha256(sessionId), principalId]);
    this.getLedger()?.observation.authority.sessionEvents.push({ type: "issued", sessionHash: sha256(sessionId), principalId });
    return { sessionId, principalId };
  }
  async participant(sessionId) {
    if (!/^[a-f0-9]{64}$/.test(sessionId ?? "")) throw fail("identity-synthetic-session-invalid");
    const row = (await this.pool.query("SELECT principal_id FROM runa_acceptance.sessions WHERE session_hash=$1 AND NOT revoked AND expires_at>now()",
      [sha256(sessionId)])).rows[0];
    if (!row) throw fail("identity-synthetic-session-invalid");
    return { principalId: row.principal_id, verified: true, methods: ["password"], synthetic: true };
  }
  async credentialForSession(sessionId) { await this.participant(sessionId); return `synthetic-acceptance:${sessionId}`; }
  async authenticate(credential) {
    if (!credential?.startsWith("synthetic-acceptance:")) throw fail("identity-synthetic-credential-invalid");
    return this.participant(credential.slice("synthetic-acceptance:".length));
  }
  async profileForSession(sessionId) { const person = await this.participant(sessionId);
    return { displayName: "Synthetic ordinary tester", initials: "ST", principalId: person.principalId }; }
  async revoke(sessionId) { await this.pool.query("UPDATE runa_acceptance.sessions SET revoked=true WHERE session_hash=$1", [sha256(sessionId)]);
    this.getLedger()?.observation.authority.sessionEvents.push({ type: "revoked", sessionHash: sha256(sessionId) }); }
}

export async function createFunctionalHost({ pool, cipher, configuration, provider, javascriptExecutor,
  dataDirectory, sourceRoot, getLedger, extraSuites = {}, faults = null, taskHooks = undefined }) {
  await new PostgresGate4aStore({ pool }).initialize();
  const continuity = new PostgresSelectedContinuityStore({ pool, cipher }); await continuity.initialize();
  const workspace = new PostgresWorkspaceStore({ pool, cipher }); await workspace.initialize();
  const identities = new SyntheticBrowserIdentity(pool, getLedger); await identities.initialize();
  const fixtures = new Map();
  const suites = { ...Object.fromEntries(MODEL_CASES.flatMap(item => (item.setup.suites ?? []).map(value => [value.suiteId, value]))), ...extraSuites };
  const observingExecutor = { async execute(request) {
    const ledger = getLedger(), startedAt = new Date().toISOString();
    const call = { requestId: request.requestId, participantId: request.participant.principalId, projectId: request.project.projectId,
      threadId: request.thread.threadId, source: request.source, sourceSha256: sha256(request.source),
      phase: ledger?.phase ?? "control", startedAt };
    ledger?.observation.native.calls.push(call);
    try { const receipt = await javascriptExecutor.execute(request);
      call.finishedAt = new Date().toISOString(); call.receiptId = receipt.receiptId;
      call.isolation = receipt.isolation; call.status = receipt.status;
      ledger?.observation.native.receipts.push(receipt);
      ledger?.evidence("host-runtime", "native-receipt", receipt);
      ledger?.evidence("host-runtime", "actual-native-execution", { request, receipt, startedAt, finishedAt: call.finishedAt });
      await faults?.afterNativeReceipt?.({ request, receipt });
      return receipt;
    } catch (error) { call.finishedAt = new Date().toISOString(); call.errorCode = error.code ?? "native-execution-failed"; throw error; }
  } };
  const m1 = await composeM1Functions({ configuration, provider, pool, cipher, javascriptExecutor: observingExecutor, taskHooks,
    dataDirectory, projectFixtures: { suites, prepare: async context => {
      const registered = fixtures.get(JSON.stringify([context.principalId, context.projectId]));
      if (!registered) throw fail("m1-synthetic-fixture-unregistered");
      return structuredClone(registered);
    } } });
  const providers = { ...createReleaseAnswerProviders(provider, { requestControls: configuration.requestControls }), review: m1.review };
  const answerService = new Gate2ReadOnlyService({ records: workspace, index: m1.index, providers,
    continuity, workspaceResolver: workspace,
    statusProvider: () => ({ provider: "private-openai-compatible", retrieval: "qdrant-nomic-selected-sources", reranker: "explicit-window-bge" }) });
  const application = new SelectedCoreApplication({ mode: "active", targetGeneration: "m1-isolated-synthetic",
    cutoverStatus: async () => ({ phase: "closed", authorityGeneration: "m1-isolated-synthetic" }),
    answerService, actionService: {}, continuity, requestCoordinator: new PostgresRequestCoordinator({ pool, cipher }),
    authenticator: identities, authorizer: { async authorize({ participant, action, resource }) {
      return { allowed: participant?.verified === true && action === "chat-ephemeral" && resource === "project:runa:personal" };
    } }, totalDeadlineMs: 60000 });
  const surface = m1.attach(application);
  const sourceIdentity = JSON.parse(await readFile(resolve(sourceRoot, "SOURCE-IDENTITY.json"), "utf8"));
  const publicStatus = acceptancePublicStatus({ application, sourceIdentity, dependencyHealth: () => m1.health() });
  const shippedServer = createCandidateHttpServer({ application, ordinarySessions: identities, m1Functions: surface,
    staticRoot: resolve(sourceRoot, "gate6b/public"), ...publicStatus, dependencyHealth: () => m1.health() });
  const { server, createBootstrap, createBrowserObservation, readBrowserObservation,
    consumeBrowserObservation } = withSyntheticBootstrap(shippedServer, { identities, getLedger });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`; identities.publicBaseUrl = baseUrl;
  return { application, m1, surface, workspace, continuity, identities, pool, baseUrl, faults, createBootstrap,
    createBrowserObservation, readBrowserObservation, consumeBrowserObservation,
    bindFixture(context, item) {
      if (!item.setup.files) throw fail("m1-fixture-has-no-files");
      fixtures.set(JSON.stringify([context.principalId, context.projectId]), {
        environmentId: `acceptance-${sha256(`${context.principalId}:${context.projectId}`).slice(0,24)}`,
        files: structuredClone(item.setup.files) });
    },
    async snapshot(context) {
      const project = await m1.tasks.currentProject(context);
      const snapshot = await m1.tasks.adapter.inspectRevision({ binding: { participantId: context.principalId,
        projectId: context.projectId, environmentId: project.environmentId }, reference: project.reference });
      return { ...snapshot, projectRevision: project.revision };
    },
    async captureFinalProof(context, { threadId, experience, taskId = null, runId = null }) {
      if (!/^m1-test-[a-f0-9]{24,64}$/.test(context.principalId)) throw fail("m1-proof-scope-invalid");
      const scope = { participantId: context.principalId, projectId: context.projectId, threadId, experience };
      const continuityState = await continuity.prepareAnswerContext(scope);
      const records = await m1.tasks.store.transaction(context, async tx => ({
        project: await tx.project(), intents: await tx.list("intent", taskId), receipts: await tx.list("receipt", taskId),
      }));
      let durable = { scope, ...records, task: null, run: null, grants: [], proposals: [], checkpoint: null }, retained = [];
      if (taskId) {
        const status = await m1.tasks.status(context, { taskId });
        const run = runId ? (await m1.orchestrator.status(context, { runId })).run : null;
        const checkpointProof = await captureTaskCheckpoints({ workflow: m1.orchestrator.agent.workflow, context, status });
        durable = { scope, ...records, task: status.task, run, grants: status.grants, proposals: status.proposals, ...checkpointProof };
        const references = new Map([status.project.reference, ...status.receipts.flatMap(value => [value.beforeReference, value.afterReference])]
          .filter(Boolean).map(value => [value.revisionId, value]));
        if (references.size > 30) throw fail("m1-proof-revision-limit");
        for (const reference of references.values()) {
          const snapshot = await m1.tasks.adapter.inspectRevision({ binding: { participantId: context.principalId,
            projectId: context.projectId, environmentId: status.project.environmentId }, reference });
          retained.push({ snapshot, reference, inspectedAt: new Date().toISOString() });
        }
      }
      return { continuity: { scope, after: continuityState }, durable, retained };
    },
    async close() { await new Promise(done => { server.close(done); server.closeAllConnections(); }); },
  };
}
