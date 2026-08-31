import { randomBytes } from "node:crypto";
import { caseCoverage, fail, sha256 } from "./runner-contract.mjs";
import { CAPABILITY_SET_DIGEST } from "../tasks/contracts.mjs";

export class FunctionalHttpJourney {
  constructor({ host, item, ledger, identitySeed, extensionActions = {}, checkpoint = null }) {
    Object.assign(this, { host, item, ledger, extensionActions, checkpoint });
    this.principalId = `m1-test-${sha256(identitySeed).slice(0,32)}`;
    this.experience = item.setup.experience; this.sources = new Map(); this.phaseNumber = 0;
    this.threadId = `acceptance-chat-${randomBytes(16).toString("hex")}`;
    this.originalThreadId = this.threadId; this.originalProjectId = null; this.contextRevision = 0;
  }
  id(label) { return `acceptance-${label}-${randomBytes(12).toString("hex")}`; }
  context() { return { principalId: this.principalId, projectId: this.projectId, sessionId: `browser-${sha256(this.session.sessionId)}` }; }
  async http(operation, path, input, { method = "POST", allowFailure = false } = {}) {
    this.ledger.requestScope = { participantId: this.principalId, projectId: this.projectId, threadId: this.threadId };
    await this.host.syncPhase?.(this.ledger.phase, this.ledger.requestScope);
    const request = { sequence: this.ledger.observation.application.requests.length + 1, phase: this.ledger.phase,
      operation, requestId: input?.requestId ?? input?.input?.requestId ?? null, input: structuredClone(input), startedAt: new Date().toISOString() };
    try {
      const response = await fetch(`${this.host.baseUrl}${path}`, { method, redirect: "error", signal: AbortSignal.timeout(120000),
        headers: { "content-type": "application/json", origin: this.host.baseUrl, "x-runa-workspace": "1",
          ...(this.session ? { cookie: `__Host-runa_user_session=${this.session.sessionId}` } : {}) },
        ...(method === "GET" ? {} : { body: JSON.stringify(input) }) });
      request.status = response.status; request.response = await response.json(); request.finishedAt = new Date().toISOString();
      this.ledger.observation.application.requests.push(request);
      this.ledger.evidence("application", "http-response", request);
      if (!response.ok && !allowFailure) throw Object.assign(fail(request.response.errorCode ?? "m1-journey-http-failed"), { response: request.response });
      return request.response;
    } catch (error) {
      if (!request.finishedAt) { request.finishedAt = new Date().toISOString(); request.errorCode = error.code ?? "m1-http-transport-failed";
        this.ledger.observation.application.requests.push(request); this.ledger.evidence("application", "http-error", request); }
      throw error;
    }
  }
  m1(operation, input = {}, options = {}) { return this.http(operation, "/api/m1/workspace", {
    projectId: this.projectId, experience: this.experience, operation, input }, options); }
  async login() {
    this.session = await this.host.identities.issue(this.principalId);
    await this.http("session.status", "/api/session/status", undefined, { method: "GET" });
    this.ledger.evidence("postgresql", "synthetic-session-issued", { principalId: this.principalId, sessionHash: sha256(this.session.sessionId) });
  }
  async createProject(name) {
    const result = await this.http("project.create", "/api/selected/projects", { experience: this.experience,
      displayName: name, requestId: this.id("project") });
    this.projectId = result.projectId; this.originalProjectId ??= result.projectId;
    return result;
  }
  async initialize() {
    await this.login(); await this.createProject(this.item.setup.project);
    this.continuityBefore = await this.host.continuity.prepareAnswerContext({ participantId: this.principalId,
      projectId: this.projectId, threadId: this.threadId, experience: this.experience });
  }
  async captureFinalProof() {
    const proof = await this.host.captureFinalProof(this.context(), { threadId: this.threadId,
      experience: this.experience, taskId: this.task?.taskId, runId: this.run?.runId });
    this.ledger.evidence("postgresql", "continuity-snapshot", { ...proof.continuity, before: this.continuityBefore });
    this.ledger.evidence("postgresql", "durable-task-state", proof.durable);
    if (!this.task) this.ledger.evidence("postgresql", "read-only-effect-audit", { scope: proof.durable.scope,
      intents: proof.durable.intents, receipts: proof.durable.receipts });
    for (const retained of proof.retained) this.ledger.evidence("host-filesystem", "retained-project-revision", retained);
    this.ledger.evidence("host-runtime", "attempt-capture-complete", {
      requestCount: this.ledger.observation.application.requests.length, providerCallCount: this.ledger.observation.provider.calls.length,
      nativeCallCount: this.ledger.observation.native.calls.length, scope: { participantId: this.principalId, projectId: this.projectId,
        threadId: this.threadId, experience: this.experience },
      sourceCommit: this.ledger.observation.sourceCommit, runtimeSealSha256: this.ledger.observation.runtimeSealSha256, capabilitySetDigest: CAPABILITY_SET_DIGEST });
  }
  async navigation() { return this.http("navigation", "/api/selected/navigation/query", { experience: this.experience }); }
  async readChat() { return this.http("chat.read", "/api/selected/chat/read", { chatId: this.threadId, experience: this.experience }); }
  async answer(action) {
    const sources = [...this.sources.values()].filter(source => this.item.setup.selected?.includes(source.alias));
    const request = { requestId: this.id("answer"), projectId: this.projectId, threadId: this.threadId,
      experience: this.experience, lane: this.item.role === "research" || this.item.role === "review" ? this.item.role : this.experience === "code" ? "code" : "general",
      message: action.message, history: [], contextRevision: this.contextRevision,
      ...(sources.length ? { workspace: { sources: sources.map(({ sourceId, sectionId }) => ({ sourceId, sectionId })) } } : {}) };
    const response = await this.http("answer", "/api/selected/answer", request);
    this.contextRevision = response.contextRevision ?? this.contextRevision;
    this.ledger.observation.application.final = response;
    return response;
  }
  async attachSources({ select = true } = {}) {
    for (const value of this.item.setup.sources ?? []) {
      if (this.sources.has(value.alias)) continue;
      const response = await this.m1("sources.attach", { requestId: this.id("source"), label: value.label, content: value.content });
      const binding = { alias: value.alias, ...response }; this.sources.set(value.alias, binding);
      this.ledger.observation.sources.bindings.push(binding);
    }
    if (select) {
      const selected = this.item.setup.selected.map(alias => this.sources.get(alias));
      if (selected.some(value => !value?.indexed)) throw fail("m1-source-not-indexed");
      await this.m1("sources.select", { sourceIds: selected.map(value => value.sourceId) });
      this.ledger.observation.sources.selectedAliases = [...this.item.setup.selected];
      const canonical = await this.host.m1.sources.selected(this.context(), selected.map(value => value.sourceId));
      this.ledger.observation.sources.canonicalBefore = canonical;
      this.ledger.evidence("postgresql", "selected-canonical-sources", { sources: canonical });
    }
  }
  async prepareProject() {
    await this.host.bindFixture(this.context(), this.item);
    await this.m1("project.prepare", {});
    const initial = await this.host.snapshot(this.context());
    const actual = Object.fromEntries(initial.files.map(value => [value.path, value.content]));
    if (JSON.stringify(Object.entries(actual).sort()) !== JSON.stringify(Object.entries(this.item.setup.files).sort())) throw fail("m1-fixture-composition-not-bound");
    this.ledger.observation.project.initial = initial;
    this.ledger.evidence("host-filesystem", "project-snapshot", initial);
    this.task = await this.m1("task.create", { requestId: this.id("task"), objective: this.item.objective,
      workIntent: this.item.setup.workIntent ?? (this.item.setup.profile === "read-only" ? "analysis-only" : "effect-requested") });
    this.grant = await this.m1("grant.create", { taskId: this.task.taskId, profile: this.item.setup.profile,
      allowedPaths: this.item.setup.allowedPaths, allowedSuites: this.item.setup.allowedSuites,
      expiresAt: new Date(Date.now() + 900000).toISOString() });
    this.ledger.observation.authority.grants.push(this.grant);
    this.ledger.evidence("postgresql", "capability-grant", this.grant);
  }
  async recordState(state = null) {
    if (!this.task) return;
    const status = await this.m1("task.status", { taskId: this.task.taskId });
    if (state?.run) this.run = state.run;
    Object.assign(this.ledger.observation.workflow, { task: status.task, run: this.run ?? null,
      proposals: status.proposals, receipts: status.receipts, intents: status.pendingReconciliation });
    this.ledger.evidence("postgresql", "task-status", status);
    const seen = new Set(this.ledger.observation.native.suites.map(value => value.authorityReceiptId));
    for (const receipt of status.receipts.filter(value => value.capabilityId === "project.run-tests")) {
      if (seen.has(receipt.receiptId)) continue;
      const output = receipt.output;
      const nativeCall = this.ledger.observation.native.calls.find(value => value.requestId === output.executionReceipt?.requestId);
      const nonces = [...(nativeCall?.source ?? "").matchAll(/RUNA2_PROJECT_TEST:([a-f0-9]{48}):/g)].map(value => value[1]);
      const suite = { suiteId: output.suiteId, suiteSha256: output.suiteSha256, workspaceSha256: output.workspaceSha256,
        sourceSha256: output.executionReceipt?.sourceSha256, nativeRequestId: output.executionReceipt?.requestId,
        receiptId: output.executionReceipt?.receiptId, authorityReceiptId: receipt.receiptId, phase: this.ledger.phase,
        nonce: nonces.length === 1 ? nonces[0] : null,
        checks: output.checks.map(value => ({ testId: value.testId, actual: value.actual, errorCode: value.errorCode })) };
      this.ledger.observation.native.suites.push(suite); this.ledger.evidence("host-runtime", "fixed-suite", suite);
    }
    const snapshot = await this.host.snapshot(this.context());
    this.ledger.observation.project.final = snapshot; this.ledger.observation.project.snapshots.push(snapshot);
    this.ledger.evidence("host-filesystem", "project-snapshot", snapshot);
    this.lastState = state ?? (this.run ? await this.m1("run.status", { runId: this.run.runId }) : status);
    if (this.lastState.run) this.ledger.observation.workflow.run = this.lastState.run;
    if (this.lastState.runEvidence) {
      this.ledger.observation.workflow.runEvidence = this.lastState.runEvidence;
      this.ledger.evidence("application", "run-evidence", this.lastState.runEvidence);
    }
    return this.lastState;
  }
  async startRun() {
    this.startInput = { requestId: this.id("run"), taskId: this.task.taskId, grantId: this.grant.grantId,
      grantRevision: this.grant.revision, workflow: this.item.role };
    const started = await this.recordState(await this.m1("run.start", this.startInput));
    if (started?.run?.status !== "repair-required") return started;
    this.ledger.evidence("application", "repair-continuation-boundary", {
      runId: started.run.runId, taskId: started.run.taskId, status: started.run.status,
      planAttempts: started.run.planAttempts, pendingProposalId: started.run.pendingProposalId,
    });
    return this.recordState(await this.m1("run.resume", { runId: started.run.runId }));
  }
  async approveEach() {
    for (let count = 0; count < 12; count++) {
      const state = await this.m1("run.status", { runId: this.run.runId });
      if (!state.pendingProposal) return this.recordState(state);
      const proposal = state.pendingProposal;
      this.ledger.observation.authority.approvals.push({ proposalId: proposal.proposalId,
        proposalDigest: proposal.proposalDigest, occurredAt: new Date().toISOString() });
      await this.m1("proposal.approve", { proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest });
      await this.recordState(await this.m1("run.resume", { runId: this.run.runId }));
    }
    throw fail("m1-harness-approval-loop-limited");
  }
  async executeCapability(capabilityId, args) {
    const proposal = await this.m1("proposal.create", { requestId: this.id("manual-action"), taskId: this.task.taskId,
      grantId: this.grant.grantId, grantRevision: this.grant.revision, capabilityId, arguments: args });
    if (proposal.status === "pending-approval") {
      await this.m1("proposal.approve", { proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest });
      this.ledger.observation.authority.approvals.push({ proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest, occurredAt: new Date().toISOString() });
    }
    return this.m1("proposal.execute", { proposalId: proposal.proposalId });
  }
  async perform(action) {
    if (this.extensionActions[action.action]) return this.extensionActions[action.action](this, action);
    switch (action.action) {
      case "login.fresh": return this.login();
      case "chat.create": return this.navigation();
      case "answer": return this.answer(action);
      case "session.logout": return this.http("session.logout", "/session/user/logout", {});
      case "chat.navigate-away": this.threadId = this.id("other-chat"); this.contextRevision = 0; return this.navigation();
      case "chat.reopen": this.threadId = this.originalThreadId; this.projectId = this.originalProjectId;
        await this.navigation(); { const chat = await this.readChat(); this.contextRevision = chat.turnCount; return chat; }
      case "fixture.foreign-session": {
        const prior = { principalId: this.principalId, session: this.session, projectId: this.projectId, threadId: this.threadId, contextRevision: this.contextRevision };
        this.principalId = `m1-test-${randomBytes(16).toString("hex")}`; await this.login(); await this.createProject("Foreign synthetic project");
        this.threadId = this.id("foreign-chat"); this.contextRevision = 0;
        await this.answer({ message: `Our mascot is a heron. ${this.item.setup.foreignCanary}. Acknowledge this.` });
        Object.assign(this, prior); return;
      }
      case "chat.switch-project": await this.createProject("Another own synthetic project"); this.threadId = this.id("other-project-chat"); this.contextRevision = 0;
        return this.answer({ message: "Our mascot is a tortoise. Acknowledge this." });
      case "sources.attach-and-select": return this.attachSources();
      case "sources.attach": return this.attachSources({ select: false });
      case "fault.index-unavailable": {
        if (!this.host.faults?.setIndexUnavailable) throw fail("m1-real-index-fault-unavailable");
        this.host.faults.setIndexUnavailable(true);
        return this.ledger.evidence("host-runtime", "owned-index-fault", { active: true });
      }
      case "fault.clear": this.host.faults?.setIndexUnavailable(false);
        return this.ledger.evidence("host-runtime", "owned-index-fault", { active: false });
      case "source.retry-index":
        for (const [alias, value] of this.sources) this.sources.set(alias, { alias, ...await this.m1("sources.retry", {
          sourceId: value.sourceId, contentSha256: value.contentSha256 }) });
        this.ledger.observation.sources.bindings = [...this.sources.values()];
        return this.attachSources();
      case "source.request-foreign": {
        const own = { principalId: this.principalId, session: this.session, projectId: this.projectId };
        this.principalId = `m1-test-${randomBytes(16).toString("hex")}`; await this.login(); await this.createProject("Foreign source fixture");
        const source = this.item.setup.foreignSource;
        const foreign = await this.m1("sources.attach", { requestId: this.id("foreign-source"), label: source.label, content: source.content });
        Object.assign(this, own);
        return this.m1("sources.select", { sourceIds: [foreign.sourceId] }, { allowFailure: true });
      }
      case "project.prepare-fixture": return this.prepareProject();
      case "run.start": return this.startRun();
      case "run.observe": case "project.verify-independent": return this.recordState();
      case "user.approve-each-exact-effect": return this.approveEach();
      case "grant.revoke": {
        const result = await this.m1("grant.revoke", { grantId: this.grant.grantId });
        this.ledger.observation.authority.revocations.push(result); return this.ledger.evidence("postgresql", "grant-revocation", result);
      }
      case "run.resume-original": await this.m1("run.resume", { runId: this.run.runId }, { allowFailure: true }); return this.recordState();
      case "run.retry-same-request": return this.recordState(await this.m1("run.start", this.startInput));
      case "user.restore-owned-receipt": {
        await this.recordState(); const receipt = this.ledger.observation.workflow.receipts.findLast(value => value.capabilityId === "project.apply-change");
        if (!receipt) throw fail("m1-owned-restore-receipt-missing");
        await this.executeCapability("project.restore", { receiptId: receipt.receiptId }); return this.recordState();
      }
      case "tests.run-restored":
        for (const suiteId of this.item.setup.allowedSuites) await this.executeCapability("project.run-tests", { suiteId });
        return this.recordState();
      case "harness.concurrent-approved-change": {
        const task = this.task, grant = this.grant; this.task = await this.m1("task.create", { requestId: this.id("concurrent-task"), objective: "Publish the independently approved synthetic concurrent fixture." });
        this.grant = await this.m1("grant.create", { taskId: this.task.taskId, profile: "ask-every-time",
          allowedPaths: this.item.setup.allowedPaths, allowedSuites: [], expiresAt: new Date(Date.now() + 300000).toISOString() });
        const snapshot = await this.host.snapshot(this.context()), file = snapshot.files[0];
        await this.executeCapability("project.apply-change", { path: file.path, content: this.item.setup.concurrentApprovedContent, expectedSha256: file.sha256 });
        this.task = task; this.grant = grant; return this.recordState();
      }
      case "proposal.approve-original": {
        const proposal = this.lastState.pendingProposal;
        if (!proposal) throw fail("m1-original-pending-proposal-missing");
        await this.m1("proposal.approve", { proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest }, { allowFailure: true });
        await this.m1("run.resume", { runId: this.run.runId }, { allowFailure: true }); return this.recordState();
      }
      default: throw fail("m1-journey-action-not-implemented");
    }
  }
  async runCase() {
    const coverage = caseCoverage(this.item, Object.keys(this.extensionActions));
    if (!coverage.ready) { for (const action of coverage.unsupportedActions) this.ledger.unsupported(action, "No real application/browser/fault driver is installed for this action.");
      this.ledger.observation.finishedAt = new Date().toISOString();
      return this.ledger.observation; }
    try {
      await this.initialize();
      for (const [index, action] of this.item.journey.entries()) {
        this.ledger.phase = action.id ?? `${index}:${action.action}`;
        const result = await this.perform(action);
        this.ledger.evidence("application", "journey-action", { action: action.action, completed: true, result: result ?? null });
        await this.checkpoint?.({ client: this, phase: this.ledger.phase, stage: "after-action", action, result });
      }
      if (this.task) await this.recordState(); else if (this.contextRevision) await this.readChat();
      this.ledger.observation.status = "completed";
    } catch (error) {
      this.ledger.observation.status = "failed"; this.ledger.observation.failures.push({ phase: this.ledger.phase, errorCode: error.code ?? "m1-journey-failed" });
      if (this.task) await this.recordState().catch(() => {});
    } finally {
      this.host.faults?.setIndexUnavailable(false);
      if (this.projectId) await this.captureFinalProof().catch(error => {
        this.ledger.observation.failures.push({ phase: "final-proof", errorCode: error.code ?? "m1-final-proof-unavailable" });
        if (this.ledger.observation.status === "completed") this.ledger.observation.status = "failed";
      });
      this.ledger.observation.finishedAt = new Date().toISOString();
    }
    return this.ledger.observation;
  }
}
