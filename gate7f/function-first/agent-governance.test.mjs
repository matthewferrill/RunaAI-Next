import test from "node:test";
import assert from "node:assert/strict";
import { agentGovernancePresentation, agentGovernanceResultProjection,
  contextualAgentWorkflow } from "../../gate6b/public/agent-governance.mjs";
import { agentActionFenceIsSettled, agentContinuationIsBlocked, agentMutationWithFreshFence,
  approvalIsAvailable, receiptUndoIsAvailable, repairContinuationIsAvailable,
  runContinuationWithNewGrant } from "../../gate6b/public/function-panel.mjs";
import { M1TaskService } from "./tasks/service.mjs";
import { M1TaskOrchestrator } from "./tasks/orchestrator.mjs";
import { digest, proposalDigest } from "./tasks/contracts.mjs";

const sha = value => value.repeat(64);
const capabilitySetVersion = "m1-javascript/v1";
const capabilitySetDigest = "bc93d32d36558e7860a7db700c1fa5f4c5df257487ae291ab0c4d0fdde14ad93";
const grant = (overrides = {}) => ({ grantId: "grant-1", revision: 2, status: "active",
  profile: "ask-every-time", taskId: "task-1", participantId: "person-1", projectId: "project-1",
  environmentId: "environment-1", sessionId: "session-1", taskBindingDigest: sha("f"),
  definitionDigest: sha("9"), capabilitySetVersion, capabilitySetDigest,
  capabilityIds: ["project.apply-change", "project.inspect", "project.restore"],
  expiresAt: "2030-01-01T00:00:00.000Z", ...overrides });
const proposal = (overrides = {}) => ({ proposalId: "proposal-1", proposalDigest: sha("a"),
  grantId: "grant-1", grantRevision: 2, capabilityId: "project.apply-change",
  grantDefinitionDigest: sha("9"), taskId: "task-1", participantId: "person-1", projectId: "project-1",
  environmentId: "environment-1", sessionId: "session-1", requestId: "step-0-0",
  capabilitySetVersion, capabilitySetDigest,
  argumentsDigest: sha("1"), policy: "approval-required",
  arguments: { path: "calculator.js", content: "exports.add=(a,b)=>a+b;", expectedSha256: sha("b") },
  prepared: { preview: { beforeSha256: sha("b"), afterSha256: sha("c") } },
  status: "pending-approval", ...overrides });
const receipt = (overrides = {}) => ({ receiptId: "receipt-1", receiptDigest: sha("d"),
  proposalId: "proposal-1", proposalDigest: sha("a"), capabilityId: "project.apply-change",
  capabilitySetVersion, capabilitySetDigest, argumentsDigest: sha("1"), policy: "approval-required",
  effectKind: "revision-published",
  executionStatus: "published", cancellationRequested: false, taskId: "task-1", participantId: "person-1",
  projectId: "project-1", environmentId: "environment-1", grantId: "grant-1", grantRevision: 2,
  ...overrides });
const reconciliation = (overrides = {}) => ({ proposalId: "proposal-1", taskId: "task-1",
  participantId: "person-1", projectId: "project-1", ...overrides });
const result = (overrides = {}) => ({
  task: { taskId: "task-1", participantId: "person-1", projectId: "project-1",
    environmentId: "environment-1", objective: "Repair fixture", status: "active" },
  project: { participantId: "person-1", projectId: "project-1", environmentId: "environment-1" },
  run: { runId: "run-1", taskId: "task-1", plannerRole: "agent", status: "waiting-approval",
    participantId: "person-1", projectId: "project-1", sessionId: "session-1", objective: "Repair fixture",
    grantId: "grant-1", grantRevision: 2, grantDefinitionDigest: sha("9"), activePlan: 0, nextStep: 0,
    recoveredActiveWindowCount: 0, actions: [], pendingProposalId: "proposal-1",
    plans: [{ summary: "Apply the exact correction.", planDigest: sha("e"), steps: [
      { requestId: "step-0-0", capabilityId: "project.apply-change",
        arguments: { path: "calculator.js", content: "exports.add=(a,b)=>a+b;", expectedSha256: sha("b") } },
    ] }] },
  grants: [grant()], proposals: [proposal()], receipts: [], pendingReconciliation: [],
  approvableProposalIds: ["proposal-1"], currentReceiptIds: [], sessionRebindRequired: false,
  ...overrides,
});
const actionAuthority = (overrides = {}) => ({ schemaVersion: "runaai-agent-action-authority/v1",
  atomic: true, taskId: "task-1", taskStatus: "active", state: "settled", authorityDigest: sha("8"),
  pendingReconciliationCount: 0, unsettledProposalCount: 0, unsettledRunCount: 0,
  approvableProposals: [], revocableGrants: [], ...overrides });
const authorityInput = value => ({ schemaVersion: value.schemaVersion, taskId: value.taskId,
  authorityDigest: value.authorityDigest });

class MemoryStore {
  constructor() {
    this.projectValue = null;
    this.records = new Map(["task", "grant", "proposal", "intent", "receipt", "run"]
      .map(kind => [kind, new Map()]));
    this.requests = new Map(); this.audits = []; this.outbox = [];
  }
  async operation(_id, work) { return work(); }
  async transaction(_context, work) {
    const before = structuredClone({ projectValue: this.projectValue, records: this.records,
      requests: this.requests, audits: this.audits, outbox: this.outbox });
    const tx = {
      project: async () => structuredClone(this.projectValue),
      saveProject: async value => { this.projectValue = structuredClone(value); },
      get: async (kind, id) => structuredClone(this.records.get(kind)?.get(id) ?? null),
      list: async (kind, taskId) => [...(this.records.get(kind)?.values() ?? [])]
        .filter(value => taskId == null || value.taskId === taskId).map(value => structuredClone(value)),
      recent: async kind => [...(this.records.get(kind)?.values() ?? [])].map(value => structuredClone(value)),
      byRequest: async (kind, key) => {
        const id = this.requests.get(`${kind}:${key}`); return id ? structuredClone(this.records.get(kind).get(id)) : null;
      },
      save: async (kind, id, value, options = {}) => {
        const bucket = this.records.get(kind);
        if (options.insertOnly && bucket.has(id)) throw new Error("duplicate");
        bucket.set(id, structuredClone(value));
        if (options.requestKey) this.requests.set(`${kind}:${options.requestKey}`, id);
      },
      audit: async (...value) => { this.audits.push(structuredClone(value)); },
      outbox: async value => { this.outbox.push(structuredClone(value)); },
    };
    try { return await work(tx); }
    catch (error) {
      this.projectValue = before.projectValue; this.records = before.records;
      this.requests = before.requests; this.audits = before.audits; this.outbox = before.outbox;
      throw error;
    }
  }
}

class AuthorityAdapter {
  constructor() { this.prepares = 0; this.effects = 0; }
  reference(files) { return { environmentId: "environment-1", revisionId: digest(files), workspaceSha256: digest(files),
    files: files.map(file => ({ path: file.path, sha256: digest(file.content), bytes: Buffer.byteLength(file.content) })) }; }
  async createEnvironment({ files }) { return this.reference(files); }
  async verifyMaterialized() { return true; }
  async prepare({ reference, capabilityId, args }) {
    this.prepares += 1;
    return { capabilityId, arguments: args, beforeReference: reference, beforeSha256: reference.workspaceSha256,
      preview: { beforeSha256: args.expectedSha256 ?? reference.workspaceSha256, afterSha256: digest(args) } };
  }
  async materialize() { this.effects += 1; throw new Error("unexpected-effect"); }
  async inspectRevision() { throw new Error("unexpected-inspection"); }
  async executeTests() { this.effects += 1; throw new Error("unexpected-effect"); }
}

async function authorityFixture() {
  const context = { principalId: "person-1", projectId: "project-1", sessionId: "session-1" };
  const store = new MemoryStore(), adapter = new AuthorityAdapter();
  const now = () => new Date("2026-09-03T12:00:00.000Z");
  const service = new M1TaskService({ store, adapter, now, authorizeContext: async () => true });
  const project = await service.registerProject(context, { environmentId: "environment-1",
    files: { "calculator.js": "exports.add=(a,b)=>a-b;" } });
  const task = await service.createTask(context, { requestId: "task-request", objective: "Repair fixture",
    workIntent: "effect-requested" });
  const grantValue = await service.createGrant(context, { taskId: task.taskId, profile: "ask-every-time",
    allowedPaths: ["calculator.js"], allowedSuites: ["calculator-add-v1"],
    expiresAt: "2026-09-03T13:00:00.000Z" });
  const expectedSha256 = digest("exports.add=(a,b)=>a-b;");
  const proposalValue = await service.propose(context, { taskId: task.taskId, grantId: grantValue.grantId,
    grantRevision: grantValue.revision, requestId: "proposal-request", capabilityId: "project.apply-change",
    arguments: { path: "calculator.js", content: "exports.add=(a,b)=>a+b;", expectedSha256 } });
  return { context, store, adapter, service, project, task, grant: grantValue, proposal: proposalValue };
}

test("Agent is selected only as contextual Code task coordination", () => {
  assert.equal(contextualAgentWorkflow(true, "code"), "agent");
  assert.equal(contextualAgentWorkflow(false, "code"), "code");
  assert.throws(() => contextualAgentWorkflow(true, "chat"), /only inside a Code task/u);
  assert.equal(agentGovernancePresentation({ run: { plannerRole: "code" } }), null);
});

test("non-atomic application state presents evidence but never active authority", () => {
  const shown = agentGovernancePresentation(result({ run: { ...result().run, profile: "safe-autopilot",
    promptApproval: true } }), Date.parse("2026-09-03T00:00:00.000Z"));
  assert.equal(shown.state, "pending");
  assert.equal(shown.authority, null);
  assert.deepEqual(shown.plans[0].steps.map(step => step.status), ["current"]);
  const shownProposal = shown.proposals.find(value => value.proposalId === "proposal-1");
  assert.equal(shownProposal.profile, "ask-every-time");
  assert.equal(shownProposal.canApprove, false);
  assert.equal(shown.actions.canRevoke, false);
  assert.deepEqual(shown.actions.canApproveProposalIds, []);
  assert.deepEqual(shownProposal.exactEffect, proposal().arguments);
  assert.deepEqual(shownProposal.preview, proposal().prepared.preview);
  assert.equal(Object.isFrozen(shown), true);
  assert.equal(Object.isFrozen(shownProposal.exactEffect), true);
});

test("authoritative task controls expose exact approval and revocation without presenting union authority", () => {
  const source = result({ agentActionAuthority: actionAuthority({
    approvableProposals: [{ proposalId: "proposal-1", proposalDigest: sha("a"),
      capabilityId: "project.apply-change", grantId: "grant-1", grantRevision: 2 }],
    revocableGrants: [{ grantId: "grant-1", grantRevision: 2, definitionDigest: sha("9"),
      profile: "ask-every-time" }],
  }) });
  const shown = agentGovernancePresentation(source);
  assert.equal(shown.authority, null);
  assert.equal(shown.proposals[0].canApprove, true);
  assert.equal(shown.actions.canRevoke, true);
  assert.deepEqual(shown.actions.canApproveProposalIds, ["proposal-1"]);
  const projected = agentGovernanceResultProjection(source, shown);
  assert.deepEqual(projected.grants, []);
  assert.equal(approvalIsAvailable(projected, projected.proposals[0]), true);
  for (const changed of [
    { proposalDigest: sha("0") }, { capabilityId: "project.inspect" },
    { grantId: "grant-other" }, { grantRevision: 3 },
  ]) {
    const mismatched = structuredClone(source);
    Object.assign(mismatched.agentActionAuthority.approvableProposals[0], changed);
    assert.equal(agentGovernancePresentation(mismatched).proposals[0].canApprove, false);
  }
});

test("non-atomic task and run snapshots cannot create authority even when rows appear current", () => {
  const at = Date.parse("2026-09-03T00:00:00.000Z");
  const apparentlyCurrent = agentGovernancePresentation(result(), at);
  assert.equal(apparentlyCurrent.authority, null);
  assert.equal(apparentlyCurrent.proposals[0].canApprove, false);
  assert.deepEqual(apparentlyCurrent.actions.canApproveProposalIds, []);
  const changes = [
    value => { value.grants[0].status = "revoked"; },
    value => { value.grants[0].grantId = "grant-other"; },
    value => { value.grants[0].revision = 3; },
    value => { value.grants[0].expiresAt = "2026-09-02T00:00:00.000Z"; },
    value => { value.grants[0].definitionDigest = sha("8"); },
    value => { value.grants[0].taskId = "task-other"; },
    value => { value.grants[0].participantId = "person-other"; },
    value => { value.grants[0].projectId = "project-other"; },
    value => { value.grants[0].environmentId = "environment-other"; },
    value => { value.grants[0].sessionId = "session-other"; },
    value => { value.grants[0].taskBindingDigest = "invalid"; },
    value => { value.grants[0].capabilitySetVersion = "future"; },
    value => { value.grants[0].capabilitySetDigest = sha("7"); },
    value => { value.grants[0].capabilityIds = ["unavailable-capability"]; },
    value => { value.grants[0].capabilityIds = ["project.inspect"]; },
    value => { value.grants[0].capabilityIds = ["project.inspect", "project.apply-change"]; },
    value => { value.proposals[0].policy = "automatic"; },
    value => { value.approvableProposalIds = []; },
    value => { value.task.status = "cancelled"; },
    value => { value.sessionRebindRequired = true; },
  ];
  for (const change of changes) {
    const value = structuredClone(result()); change(value);
    const shown = agentGovernancePresentation(value, at);
    assert.equal(shown.authority, null);
    assert.deepEqual(shown.actions.canApproveProposalIds, []);
  }
});

test("projection excludes unrelated display records but preserves every same-task reconciliation", () => {
  const crossRunProposal = proposal({ proposalId: "proposal-other-run", requestId: "other-run-step", status: "unknown" });
  const standaloneProposal = proposal({ proposalId: "proposal-standalone", requestId: "standalone", status: "dispatching" });
  const standaloneReceipt = receipt({ receiptId: "receipt-standalone", proposalId: "proposal-standalone",
    capabilityId: "project.restore" });
  const source = result({ proposals: [proposal(), crossRunProposal, standaloneProposal],
    receipts: [standaloneReceipt], pendingReconciliation: [
      reconciliation({ proposalId: "proposal-other-run" }), reconciliation({ proposalId: "proposal-standalone" })],
    currentReceiptIds: ["receipt-standalone"], grants: [grant(), grant({ grantId: "grant-other" })] });
  const shown = agentGovernancePresentation(source);
  assert.equal(shown.state, "unknown");
  assert.deepEqual(shown.proposals.map(value => value.proposalId), ["proposal-1"]);
  assert.deepEqual(shown.receipts, []);
  assert.deepEqual(shown.records, { proposalIds: ["proposal-1"], receiptIds: [],
    reconciliationProposalIds: ["proposal-other-run", "proposal-standalone"] });
  assert.equal(shown.recovery, "reconciliation-required");
  const projected = agentGovernanceResultProjection(source, shown);
  assert.deepEqual(projected.proposals.map(value => value.proposalId), ["proposal-1"]);
  assert.deepEqual(projected.receipts, []);
  assert.deepEqual(projected.pendingReconciliation.map(value => value.proposalId),
    ["proposal-other-run", "proposal-standalone"]);
  assert.deepEqual(projected.currentReceiptIds, []);
  assert.deepEqual(projected.grants, []);
  assert.equal(agentContinuationIsBlocked(projected, shown), true);
  const taskReconciliation = projected.pendingReconciliation;
  assert.equal(approvalIsAvailable({ ...projected, grants: [grant()],
    approvableProposalIds: ["proposal-1"], pendingReconciliation: taskReconciliation }, proposal()), false);
  assert.equal(repairContinuationIsAvailable({ ...projected,
    run: { ...projected.run, status: "repair-required", pendingProposalId: null },
    grants: [grant()], sessionRebindRequired: false, pendingReconciliation: taskReconciliation }), false);
  assert.equal(receiptUndoIsAvailable({ ...projected, currentReceiptIds: ["receipt-current"],
    pendingReconciliation: taskReconciliation },
  receipt({ receiptId: "receipt-current" }), shown), false);
  const foreignCollision = result({ proposals: [proposal(), proposal({ taskId: "task-other" })],
    pendingReconciliation: [reconciliation(), reconciliation({ taskId: "task-other" })] });
  const collisionView = agentGovernancePresentation(foreignCollision);
  assert.deepEqual(agentGovernanceResultProjection(foreignCollision, collisionView).proposals.map(value => value.taskId), ["task-1"]);

  const completedProposal = proposal({ status: "completed" });
  const completedReceipt = receipt();
  const completedRun = { ...result().run, status: "completed", nextStep: 1, pendingProposalId: null,
    actions: [{ proposalId: "proposal-1", receiptId: "receipt-1", receiptDigest: sha("d"),
      capabilityId: "project.apply-change", executionStatus: "published", planIndex: 0, stepIndex: 0 }] };
  const bound = result({ run: completedRun, proposals: [completedProposal], receipts: [completedReceipt],
    approvableProposalIds: [], currentReceiptIds: ["receipt-1"] });
  assert.equal(agentGovernancePresentation(bound).state, "completed");
  for (const change of [
    value => { value.receipts[0].proposalId = "proposal-other"; },
    value => { value.receipts[0].receiptDigest = sha("0"); },
    value => { value.receipts[0].grantRevision = 9; },
    value => { value.proposals[0].requestId = "unowned-plan-step"; },
    value => { value.proposals[0].arguments.content = "not-the-recorded-step"; },
    value => { value.proposals[0].capabilitySetDigest = sha("7"); },
  ]) {
    const value = structuredClone(bound); change(value);
    assert.equal(agentGovernancePresentation(value), null);
    const failedClosed = agentGovernanceResultProjection(value, null);
    assert.deepEqual({ proposals: failedClosed.proposals, receipts: failedClosed.receipts,
      grants: failedClosed.grants, approvableProposalIds: failedClosed.approvableProposalIds,
      agentPresentationInvalid: failedClosed.agentPresentationInvalid },
    { proposals: [], receipts: [], grants: [], approvableProposalIds: [], agentPresentationInvalid: true });
  }
});

test("historical steps are observed only when a bound action and receipt prove them", () => {
  const firstProposal = proposal({ status: "completed" });
  const firstReceipt = receipt();
  const value = result({
    run: { ...result().run, activePlan: 1, nextStep: 0, pendingProposalId: "proposal-2",
      actions: [{ proposalId: "proposal-1", receiptId: "receipt-1", receiptDigest: sha("d"),
        capabilityId: "project.apply-change", executionStatus: "published", planIndex: 0, stepIndex: 0 }],
      plans: [{ summary: "Partly used plan", planDigest: sha("e"), steps: [
        { requestId: "step-0-0", capabilityId: "project.apply-change",
          arguments: { path: "calculator.js", content: "exports.add=(a,b)=>a+b;", expectedSha256: sha("b") } },
        { requestId: "step-0-1", capabilityId: "project.run-tests", arguments: { suiteId: "calculator-add-v1" } },
      ] }, { summary: "Replacement plan", planDigest: sha("6"), steps: [
        { requestId: "step-1-0", capabilityId: "project.apply-change",
          arguments: { path: "calculator.js", content: "second", expectedSha256: sha("c") } },
      ] }] },
    proposals: [firstProposal, proposal({ proposalId: "proposal-2", requestId: "step-1-0",
      arguments: { path: "calculator.js", content: "second", expectedSha256: sha("c") } })], receipts: [firstReceipt],
    approvableProposalIds: ["proposal-2"] });
  const shown = agentGovernancePresentation(value);
  assert.deepEqual(shown.plans[0].steps.map(step => step.status), ["observed", "pending"]);
  assert.deepEqual(shown.plans[1].steps.map(step => step.status), ["current"]);
  for (const change of [
    action => { action.planIndex = 1; action.stepIndex = 0; },
    action => { action.planIndex = 2; },
    action => { action.stepIndex = 2; },
    action => { action.planIndex = -1; },
    action => { action.stepIndex = 0.5; },
    action => { delete action.planIndex; },
    action => { delete action.stepIndex; },
  ]) {
    const mismatched = structuredClone(value); change(mismatched.run.actions[0]);
    assert.equal(agentGovernancePresentation(mismatched), null);
  }
});

test("unsettled Agent state blocks generic new grants and run resume until settled", async () => {
  const cases = [
    result({ proposals: [proposal({ status: "unknown" })] }),
    result({ pendingReconciliation: [reconciliation()] }),
    result({ run: { ...result().run, status: "needs-reconciliation" },
      proposals: [proposal({ status: "not-published" })], approvableProposalIds: [] }),
  ];
  for (const value of cases) {
    const presentation = agentGovernancePresentation(value);
    const projected = agentGovernanceResultProjection(value, presentation);
    const blocked = agentContinuationIsBlocked(projected, presentation);
    let grantCalls = 0, resumeCalls = 0;
    const continued = await runContinuationWithNewGrant({ result: projected, agentView: presentation,
      createGrant: async () => { grantCalls += 1; return grant(); },
      resumeRun: async () => { resumeCalls += 1; } });
    assert.equal(blocked, true);
    assert.equal(continued, false);
    assert.equal(grantCalls, 0);
    assert.equal(resumeCalls, 0);
  }

  const settled = result();
  const presentation = agentGovernancePresentation(settled);
  const projected = agentGovernanceResultProjection(settled, presentation);
  let grantCalls = 0, resumeCalls = 0;
  const continued = await runContinuationWithNewGrant({
    result: projected, agentView: presentation,
    createGrant: async () => { grantCalls += 1; return grant({ grantId: "grant-new", revision: 1 }); },
    resumeRun: async value => { resumeCalls += 1; assert.equal(value.grantId, "grant-new"); },
  });
  assert.equal(continued, true);
  assert.equal(grantCalls, 1);
  assert.equal(resumeCalls, 1);
});

test("Agent mutation helper requires a valid server CAS authority", async () => {
  const rendered = result(), presentation = agentGovernancePresentation(rendered);
  const projected = agentGovernanceResultProjection(rendered, presentation);
  assert.equal(agentContinuationIsBlocked(projected, presentation), false);
  const settledFence = actionAuthority();
  assert.equal(agentActionFenceIsSettled(settledFence, "task-1"), true);

  // The authoritative state changes after the settled render but before the click.
  const changedFence = { ...settledFence, state: "blocked", pendingReconciliationCount: 1,
    approvableProposals: [], revocableGrants: [] };
  const calls = { grant: 0, revoke: 0, proposal: 0, execute: 0, resume: 0 };
  for (const operation of Object.keys(calls)) {
    const outcome = await agentMutationWithFreshFence({ agentTask: true, taskId: "task-1",
      readFence: async () => changedFence,
      mutate: async () => { calls[operation] += 1; return operation; } });
    assert.deepEqual(outcome, { executed: false, reason: "fence-blocked" });
  }
  assert.deepEqual(calls, { grant: 0, revoke: 0, proposal: 0, execute: 0, resume: 0 });

  for (const readFence of [async () => { throw new Error("unavailable"); },
    async () => ({ ...settledFence, atomic: false })]) {
    let mutations = 0;
    const outcome = await agentMutationWithFreshFence({ agentTask: true, taskId: "task-1", readFence,
      mutate: async () => { mutations += 1; } });
    assert.equal(outcome.executed, false);
    assert.equal(mutations, 0);
  }
  let mutations = 0;
  const allowed = await agentMutationWithFreshFence({ agentTask: true, taskId: "task-1",
    readFence: async () => settledFence, mutate: async () => { mutations += 1; return "done"; } });
  assert.deepEqual(allowed, { executed: true, value: "done" });
  assert.equal(mutations, 1);
});

test("task service computes the Agent action fence from all task records in one transaction", async () => {
  const context = { principalId: "person-1", projectId: "project-1", sessionId: "session-1" };
  const task = { taskId: "task-1", participantId: "person-1", projectId: "project-1",
    environmentId: "environment-1", status: "active" };
  const proposals = [proposal(), proposal({ proposalId: "proposal-standalone", status: "dispatched" })];
  const intents = [{ proposalId: "proposal-standalone", taskId: "task-1", participantId: "person-1",
    projectId: "project-1", status: "dispatching" }];
  let transactions = 0;
  const store = { async transaction(_context, work) {
    transactions += 1;
    return work({ get: async (kind, id) => kind === "task" && id === task.taskId ? task : null,
      project: async () => ({ participantId: "person-1", projectId: "project-1", environmentId: "environment-1" }),
      list: async kind => kind === "proposal" ? proposals : kind === "intent" ? intents : [] });
  } };
  const service = new M1TaskService({ store, adapter: {}, authorizeContext: async () => true });
  service.verifyProposal = () => {};
  const blocked = await service.agentActionFence(context, { taskId: "task-1" });
  assert.equal(blocked.schemaVersion, "runaai-agent-action-authority/v1");
  assert.equal(blocked.atomic, true); assert.equal(blocked.taskId, "task-1");
  assert.equal(blocked.state, "blocked"); assert.equal(blocked.pendingReconciliationCount, 1);
  assert.equal(blocked.unsettledProposalCount, 1); assert.equal(blocked.unsettledRunCount, 0);
  assert.match(blocked.authorityDigest, /^[a-f0-9]{64}$/u);
  assert.deepEqual(blocked.approvableProposals, []); assert.deepEqual(blocked.revocableGrants, []);
  assert.equal(transactions, 1);
  proposals[1].status = "not-published"; intents[0].status = "not-published";
  assert.equal((await service.agentActionFence(context, { taskId: "task-1" })).state, "settled");
  assert.equal(transactions, 2);
});

test("CAS-consumed Agent authority rejects every interleaved consequential action with zero effect", async () => {
  const h = await authorityFixture();
  const runId = "run-agent-cas";
  const run = { schemaVersion: "runa-m1-conversational-run/v1", runId, taskId: h.task.taskId,
    grantId: h.grant.grantId, grantRevision: h.grant.revision, grantDefinitionDigest: h.grant.definitionDigest,
    plannerRole: "agent", participantId: h.context.principalId, projectId: h.context.projectId,
    sessionId: h.context.sessionId, requestDigest: sha("1"), objective: h.task.objective,
    status: "ready-to-plan", planAttempts: 0, protocolCorrectionCount: 0, plans: [], activePlan: 0,
    nextStep: 0, actions: [], pendingProposalId: null, outcome: null, errorCode: null, consumedMs: 0,
    activeWindow: null, recoveredActiveWindowCount: 0,
    budgets: { maxPlans: 2, maxActions: 12, planningTimeoutMs: 120000,
      maximumRequestActiveMs: 300000, maximumRunActiveMs: 300000, maximumAgeMs: 3600000 },
    createdAtMs: 1, updatedAtMs: 1 };
  await h.store.transaction(h.context, tx => tx.save("run", runId, run, { insertOnly: true }));
  const renderedAuthority = await h.service.agentActionFence(h.context, { taskId: h.task.taskId });
  assert.equal(renderedAuthority.state, "settled");

  // This independently owned task proposal appears after render and is already dispatching.
  const interleaved = { ...structuredClone(h.proposal), proposalId: "proposal-interleaved",
    requestId: "interleaved-request", status: "dispatching" };
  interleaved.proposalDigest = proposalDigest(interleaved);
  await h.store.transaction(h.context, async tx => {
    await tx.save("proposal", interleaved.proposalId, interleaved, { insertOnly: true });
    await tx.save("intent", interleaved.proposalId, { schemaVersion: "runa-m1-effect-intent/v1",
      effectId: "effect-interleaved", proposalId: interleaved.proposalId, taskId: h.task.taskId,
      participantId: h.context.principalId, projectId: h.context.projectId,
      proposalDigest: interleaved.proposalDigest, status: "dispatching",
      createdAt: "2026-09-03T12:00:00.000Z", updatedAt: "2026-09-03T12:00:00.000Z" }, { insertOnly: true });
  });
  const guard = { agentActionAuthority: authorityInput(renderedAuthority) };
  const before = digest({ records: [...h.store.records].map(([kind, values]) => [kind, [...values]]),
    project: h.store.projectValue, audits: h.store.audits, outbox: h.store.outbox });
  const beforeAdapter = { prepares: h.adapter.prepares, effects: h.adapter.effects };
  const planner = { role: "agent", calls: 0, async plan() { this.calls += 1; throw new Error("unexpected-plan"); } };
  const workflow = { calls: 0, async run() { this.calls += 1; throw new Error("unexpected-run"); } };
  const orchestrator = new M1TaskOrchestrator({ service: h.service, planner, workflow, now: () => 2 });
  const calls = [
    () => h.service.createGrant(h.context, { taskId: h.task.taskId, profile: "read-only",
      allowedPaths: ["calculator.js"], allowedSuites: [], expiresAt: "2026-09-03T13:00:00.000Z" }, guard),
    () => h.service.revokeGrant(h.context, { grantId: h.grant.grantId }, guard),
    () => h.service.propose(h.context, { taskId: h.task.taskId, grantId: h.grant.grantId,
      grantRevision: h.grant.revision, requestId: "late-proposal", capabilityId: "project.inspect",
      arguments: { path: "calculator.js" } }, guard),
    () => h.service.approve(h.context, { proposalId: h.proposal.proposalId,
      proposalDigest: h.proposal.proposalDigest }, guard),
    () => h.service.execute(h.context, { proposalId: h.proposal.proposalId }, guard),
    () => orchestrator.resume(h.context, { runId }, guard),
  ];
  for (const invoke of calls) await assert.rejects(invoke,
    error => error.code === "m1-agent-action-stale");
  assert.equal(digest({ records: [...h.store.records].map(([kind, values]) => [kind, [...values]]),
    project: h.store.projectValue, audits: h.store.audits, outbox: h.store.outbox }), before);
  assert.deepEqual({ prepares: h.adapter.prepares, effects: h.adapter.effects }, beforeAdapter);
  assert.equal(planner.calls, 0); assert.equal(workflow.calls, 0);
  assert.equal(h.store.records.get("run").get(runId).activeWindow, null);
});

test("ask-every-time approval and explicit revoke-before-effect remain authoritative end to end", async () => {
  const h = await authorityFixture();
  await h.store.transaction(h.context, tx => tx.save("run", "run-approval", {
    runId: "run-approval", taskId: h.task.taskId, plannerRole: "agent", status: "waiting-approval",
    participantId: h.context.principalId, projectId: h.context.projectId, sessionId: h.context.sessionId,
    pendingProposalId: h.proposal.proposalId, activeWindow: null,
  }, { insertOnly: true }));
  const beforeApproval = await h.service.status(h.context, { taskId: h.task.taskId });
  assert.deepEqual(beforeApproval.agentActionAuthority.approvableProposals, [{
    proposalId: h.proposal.proposalId, proposalDigest: h.proposal.proposalDigest,
    capabilityId: "project.apply-change", grantId: h.grant.grantId, grantRevision: h.grant.revision,
  }]);
  assert.deepEqual(beforeApproval.agentActionAuthority.revocableGrants.map(value => value.grantId),
    [h.grant.grantId]);
  await assert.rejects(h.service.approve(h.context, { proposalId: h.proposal.proposalId,
    proposalDigest: h.proposal.proposalDigest }), error => error.code === "m1-agent-action-authority-required");
  const approved = await h.service.approve(h.context, { proposalId: h.proposal.proposalId,
    proposalDigest: h.proposal.proposalDigest },
  { agentActionAuthority: authorityInput(beforeApproval.agentActionAuthority) });
  assert.equal(approved.proposal.status, "authorized");
  assert.equal(approved.proposal.approval.proposalDigest, h.proposal.proposalDigest);

  const beforeRevoke = await h.service.agentActionFence(h.context, { taskId: h.task.taskId });
  const revoked = await h.service.revokeGrant(h.context, { grantId: h.grant.grantId },
    { agentActionAuthority: authorityInput(beforeRevoke) });
  assert.equal(revoked.status, "revoked"); assert.equal(revoked.revision, h.grant.revision + 1);
  const afterRevoke = await h.service.agentActionFence(h.context, { taskId: h.task.taskId });
  assert.deepEqual(afterRevoke.approvableProposals, []); assert.deepEqual(afterRevoke.revocableGrants, []);
  await assert.rejects(h.service.execute(h.context, { proposalId: h.proposal.proposalId },
    { agentActionAuthority: authorityInput(afterRevoke) }), error => error.code === "m1-grant-revoked");
  assert.equal(h.adapter.effects, 0); assert.equal(h.store.records.get("intent").size, 0);
  const denied = h.store.records.get("proposal").get(h.proposal.proposalId);
  assert.equal(denied.status, "denied"); assert.equal(denied.errorCode, "m1-grant-revoked");
  assert.equal(denied.approval.proposalDigest, h.proposal.proposalDigest);
});

test("revocation before effect removes approval and continuation authority", () => {
  const stopped = result({ run: { ...result().run, status: "failed", errorCode: "m1-grant-revoked" },
    grants: [grant({ status: "revoked", revision: 3 })], approvableProposalIds: ["proposal-1"] });
  const shown = agentGovernancePresentation(stopped);
  assert.equal(shown.state, "failed");
  assert.equal(shown.authority, null);
  assert.equal(shown.actions.canRevoke, false);
  assert.deepEqual(shown.actions.canApproveProposalIds, []);
  assert.equal(shown.receipts.length, 0);
});

test("cancel stops successors while preserving an unsettled action for reconciliation", () => {
  const cancelled = result({ task: { ...result().task, status: "cancelled" },
    run: { ...result().run, status: "cancelled" },
    proposals: [proposal({ status: "dispatching" })], pendingReconciliation: [reconciliation()],
    approvableProposalIds: [] });
  const shown = agentGovernancePresentation(cancelled);
  assert.equal(shown.state, "cancelled");
  assert.equal(shown.recovery, "reconciliation-required");
  assert.equal(shown.actions.canCancel, false);
  assert.equal(shown.actions.canReconcile, true);
  assert.match(shown.notice, /without repetition/u);
});

test("restart and duplicate uncertainty stays unknown until application reconciliation", () => {
  const uncertain = result({ run: { ...result().run, status: "needs-reconciliation", recoveredActiveWindowCount: 1 },
    proposals: [proposal({ status: "unknown" })], pendingReconciliation: [reconciliation()],
    approvableProposalIds: ["proposal-1"] });
  const shown = agentGovernancePresentation(uncertain);
  assert.equal(shown.state, "unknown");
  assert.equal(shown.recovery, "reconciliation-required");
  assert.deepEqual(shown.actions.canApproveProposalIds, []);
  assert.match(shown.notice, /must not repeat/u);
  const reconciled = agentGovernancePresentation(result({
    run: { ...result().run, status: "running", recoveredActiveWindowCount: 1 },
    proposals: [proposal({ status: "not-published" })], approvableProposalIds: [] }));
  assert.equal(reconciled.recovery, "restart-reconciled");
});

test("receipt projections distinguish completed, failed, and current rolled-back outcomes", () => {
  const argumentsFor = capabilityId => capabilityId === "project.restore" ? { receiptId: "prior" }
    : capabilityId === "project.run-tests" ? { suiteId: "calculator-add-v1" }
      : { path: "calculator.js", content: "fixed", expectedSha256: sha("b") };
  const completedRun = (capabilityId, executionStatus) => ({ ...result().run, status: "completed", nextStep: 1,
    pendingProposalId: null, plans: [{ summary: "Completed plan", planDigest: sha("e"),
      steps: [{ requestId: "step-0-0", capabilityId, arguments: argumentsFor(capabilityId) }] }],
    actions: [{ proposalId: "proposal-1", receiptId: "receipt-1", receiptDigest: sha("d"), capabilityId,
      executionStatus, planIndex: 0, stepIndex: 0 }] });
  const completed = agentGovernancePresentation(result({
    run: completedRun("project.apply-change", "published"), proposals: [proposal({ status: "completed",
      arguments: argumentsFor("project.apply-change") })],
    receipts: [receipt()], currentReceiptIds: ["receipt-1"], approvableProposalIds: [] }));
  assert.equal(completed.state, "completed");
  assert.equal(completed.receipts[0].outcome, "completed");

  const failedTest = agentGovernancePresentation(result({
    run: { ...completedRun("project.run-tests", "ran"), status: "failed" },
    proposals: [proposal({ status: "completed", capabilityId: "project.run-tests",
      arguments: argumentsFor("project.run-tests") })],
    receipts: [receipt({ capabilityId: "project.run-tests", effectKind: "sandbox-tested",
      executionStatus: "ran", output: { passed: false } })], approvableProposalIds: [] }));
  assert.equal(failedTest.state, "failed");
  assert.equal(failedTest.receipts[0].outcome, "failed");

  const rolledBack = agentGovernancePresentation(result({
    run: completedRun("project.restore", "published"),
    proposals: [proposal({ status: "completed", capabilityId: "project.restore",
      arguments: argumentsFor("project.restore") })],
    receipts: [receipt({ capabilityId: "project.restore" })], currentReceiptIds: ["receipt-1"],
    approvableProposalIds: [] }));
  assert.equal(rolledBack.state, "rolled-back");
  assert.equal(rolledBack.receipts[0].outcome, "rolled-back");
  assert.match(rolledBack.notice, /Earlier successful receipts remain history/u);
});
