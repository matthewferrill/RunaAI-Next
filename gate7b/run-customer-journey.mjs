import { once } from "node:events";
import { resolve } from "node:path";

import { MemoryIndex, MemoryRecordStore, ScriptedProvider } from "../gate1/adapters/memory.mjs";
import { sourceSection } from "../gate1/core.mjs";
import { MemoryContinuityStore, MemoryWorkspaceResolver } from "../gate2/continuity.mjs";
import { Gate2ReadOnlyService } from "../gate2/core.mjs";
import { SelectedCoreApplication } from "../gate6b/application.mjs";
import { createCandidateHttpServer } from "../gate6b/http-server.mjs";

const principalId = "synthetic-ordinary-member";
const projectId = "runa:personal";

class ControllableProvider extends ScriptedProvider {
  constructor(options) { super(options); this.nextFailure = null; }
  failOnce(code) { this.nextFailure = code; }
  async answer(input, options) {
    if (this.nextFailure) {
      const code = this.nextFailure;
      this.nextFailure = null;
      throw Object.assign(new Error("synthetic provider failure"), { code });
    }
    return super.answer(input, options);
  }
}

const request = (id, lane, message, history = [], workspace = null) => ({
  requestId: id, lane, threadId: `thread-${lane}`, projectId, message, history, workspace,
});

export async function runCustomerJourney() {
  const source = sourceSection({ projectId, sourceId: "customer-source", sectionId: "selected",
    content: "The synthetic customer source is explicit, same-project, and read-only." });
  const records = new MemoryRecordStore([source]);
  const index = new MemoryIndex({ references: [{ ...source }] });
  const continuity = new MemoryContinuityStore();
  continuity.seedProject({ participantId: principalId, projectId, displayName: "Personal" });
  const reply = ({ request: modelRequest, evidence }) => ({
    answer: evidence.length ? "The supplied synthetic source answers the question."
      : `Synthetic conversational reply after ${modelRequest.history.length} prior messages.`,
    citations: evidence.length ? [{ sourceId: evidence[0].sourceId, sectionId: evidence[0].sectionId }] : [],
  });
  const providers = Object.fromEntries(["chat", "research", "code", "review"].map(role => [role,
    new ControllableProvider({ role, reply })]));
  const answerService = new Gate2ReadOnlyService({ records, index, providers, continuity,
    workspaceResolver: new MemoryWorkspaceResolver([source]), statusProvider: () => ({
      provider: "scripted", retrieval: "memory", reranker: "not-required" }) });
  const application = new SelectedCoreApplication({ mode: "active", targetGeneration: "synthetic-next",
    cutoverStatus: async () => ({ phase: "closed", authorityGeneration: "synthetic-next" }),
    answerService, actionService: {},
    authenticator: { async authenticate() { return { principalId, verified: true, methods: ["password"],
      authenticatedAt: new Date().toISOString() }; } },
    authorizer: { async authorize() { return { allowed: true, reason: "synthetic-allowed" }; } },
    totalDeadlineMs: 60_000 });
  const revoked = [];
  const ordinarySessions = { publicBaseUrl: null,
    async credentialForSession() { return "synthetic-opaque-credential"; },
    async revoke(value) { revoked.push(value); } };
  const server = createCandidateHttpServer({ application,
    runtimeStatus: async () => ({ running: { releaseId: "synthetic-gate7b", commit: "a".repeat(40) },
      cutover: { phase: "closed" }, selectedScopeVersion: "synthetic" }),
    readinessStatus: async () => ({ authority: "active" }),
    dependencyHealth: async () => ({ ready: true }), ordinarySessions,
    staticRoot: resolve(import.meta.dirname, "..", "gate6b", "public") });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  ordinarySessions.publicBaseUrl = base;
  const cookie = "__Host-runa_user_session=synthetic-session";
  const post = async value => {
    const response = await fetch(`${base}/api/selected/answer`, { method: "POST",
      headers: { origin: base, cookie, "content-type": "application/json" }, body: JSON.stringify(value) });
    return { status: response.status, body: await response.json() };
  };
  try {
    const anonymous = await fetch(`${base}/api/session/status`).then(value => value.json());
    const signedIn = await fetch(`${base}/api/session/status`, { headers: { cookie } }).then(value => value.json());
    const history = [];
    const general = [];
    for (let turn = 0; turn < 6; turn += 1) {
      const result = await post(request(`general-${turn}`, "general", `Synthetic message ${turn}`, history));
      general.push(result);
      history.push({ role: "user", content: `Synthetic message ${turn}` },
        { role: "assistant", content: result.body.answer });
    }
    const research = await post(request("research", "research", "What does the project record say?"));
    const review = await post(request("review", "review", "Review the supplied source.", [],
      { sources: [{ sourceId: source.sourceId, sectionId: source.sectionId }] }));
    const code = await post({ ...request("code", "code", "Draft a harmless JavaScript function."), experience: "code" });
    providers.chat.failOnce("provider-transport-failed");
    const failed = await post(request("failed", "general", "Synthetic recoverable message"));
    const recovered = await post(request("recovered", "general", "Synthetic recovered message"));
    const logoutResponse = await fetch(`${base}/session/user/logout`, { method: "POST",
      headers: { origin: base, cookie } });
    const logout = await logoutResponse.json();
    const checks = {
      anonymousSignedOut: anonymous.authenticated === false,
      ordinarySignedIn: signedIn.authenticated === true && signedIn.sessionType === "ordinary",
      sixTurnConversation: general.length === 6 && general.every(item => item.status === 200
        && item.body.completion.reason === "complete" && item.body.continuity.turnRecorded === true),
      boundedHistoryReachedProvider: providers.chat.calls.some(call => call.request.history.length === 10),
      generalRole: general.every(item => item.body.status.modelRole === "chat"),
      researchRole: research.body.status.modelRole === "research" && research.body.citations.length === 1,
      reviewRole: review.body.status.modelRole === "review" && review.body.citations.length === 1,
      codeRole: code.body.status.modelRole === "code" && code.body.execution.status === "not-executed",
      failedTurnNotRecorded: failed.body.completion.reason === "provider-transport-failed"
        && failed.body.continuity.turnRecorded === false,
      nextTurnRecovered: recovered.body.completion.reason === "complete"
        && recovered.body.continuity.turnRecorded === true,
      logoutRevoked: logout.loggedOut === true && revoked.length === 1,
    };
    return { schemaVersion: "runa2-gate7b-customer-journey/v1", passed: Object.values(checks).every(Boolean),
      checks, providerCalls: { chat: providers.chat.calls.length, research: providers.research.calls.length,
        review: providers.review.calls.length, code: providers.code.calls.length }, privateValuesIncluded: false };
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runCustomerJourney().then(value => process.stdout.write(`${JSON.stringify(value)}\n`), error => {
    process.stderr.write(`${JSON.stringify({ schemaVersion: "runa2-gate7b-customer-journey-error/v1",
      errorCode: error?.code ?? "gate7b-customer-journey-failed", privateValuesIncluded: false })}\n`);
    process.exitCode = 1;
  });
}

