import assert from "node:assert/strict";
import test from "node:test";
import { initializeFunctionPanel } from "../../gate6b/public/function-panel.mjs";

const sha = value => value.repeat(64);
const capabilitySetVersion = "m1-javascript/v1";
const capabilitySetDigest = "bc93d32d36558e7860a7db700c1fa5f4c5df257487ae291ab0c4d0fdde14ad93";
const ids = Object.freeze({ taskId: "task-agent", runId: "run-agent", grantId: "grant-agent",
  proposalId: "proposal-agent", receiptId: "receipt-agent" });
const exactArguments = Object.freeze({ path: "calculator.js", content: "exports.add=(a,b)=>a+b;",
  expectedSha256: sha("b") });

class FixtureNode {
  constructor(ownerDocument, text = "") {
    this.ownerDocument = ownerDocument; this.parentNode = null; this.children = []; this.ownText = text;
  }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(""); }
  set textContent(value) {
    for (const child of this.children) child.parentNode = null;
    this.children = []; this.ownText = String(value ?? "");
  }
  append(...values) {
    for (const value of values) {
      const child = value instanceof FixtureNode ? value : this.ownerDocument.createTextNode(String(value));
      child.parentNode = this; this.children.push(child);
    }
  }
  replaceChildren(...values) {
    for (const child of this.children) child.parentNode = null;
    this.children = []; this.ownText = ""; this.append(...values);
  }
  get childElementCount() { return this.children.filter(child => child instanceof FixtureElement).length; }
}

class FixtureElement extends FixtureNode {
  constructor(ownerDocument, tagName) {
    super(ownerDocument); this.tagName = tagName.toUpperCase(); this.attributes = new Map();
    this.dataset = {}; this.hidden = false; this.disabled = false; this.checked = false; this.value = "";
    this.listeners = new Map(); this.classes = new Set();
    this.classList = { add: (...names) => names.forEach(name => this.classes.add(name)),
      contains: name => this.classes.has(name) };
  }
  get className() { return [...this.classes].join(" "); }
  set className(value) { this.classes = new Set(String(value).split(/\s+/u).filter(Boolean)); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) ?? []; listeners.push(listener); this.listeners.set(name, listeners);
  }
  async dispatch(name) {
    const event = { currentTarget: this, target: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; } };
    for (const listener of this.listeners.get(name) ?? []) await listener(event);
    return !event.defaultPrevented;
  }
  async click() { if (!this.disabled) await this.dispatch("click"); }
}

class FixtureDocument {
  constructor() {
    this.body = this.createElement("body");
    const heading = this.createElement("div"); heading.className = "chat-heading";
    const description = this.createElement("p"); description.id = "experience-description";
    const rail = this.createElement("aside"); rail.id = "right-rail-body";
    this.body.append(heading, description, rail);
  }
  createElement(tagName) { return new FixtureElement(this, tagName); }
  createTextNode(text) { return new FixtureNode(this, String(text)); }
  elements() {
    const found = [];
    const visit = node => { if (node instanceof FixtureElement) found.push(node); for (const child of node.children) visit(child); };
    visit(this.body); return found;
  }
  getElementById(id) { return this.elements().find(value => value.id === id) ?? null; }
  querySelector(selector) {
    if (selector.startsWith("#")) return this.getElementById(selector.slice(1));
    if (selector.startsWith(".")) return this.elements().find(value => value.classList.contains(selector.slice(1))) ?? null;
    return this.elements().find(value => value.tagName === selector.toUpperCase()) ?? null;
  }
}

const visible = element => {
  for (let value = element; value; value = value.parentNode) if (value.hidden) return false;
  return true;
};
const byText = (document, tagName, text, { visibleOnly = true } = {}) => document.elements().filter(value =>
  value.tagName === tagName.toUpperCase() && value.textContent === text && (!visibleOnly || visible(value)));
const button = (document, text) => {
  const values = byText(document, "button", text); assert.equal(values.length, 1, `expected one visible button: ${text}`); return values[0];
};
const contains = (ancestor, child) => {
  for (let value = child; value; value = value.parentNode) if (value === ancestor) return true;
  return false;
};

function records(stage, authoritative = true, externalDigest = null) {
  const taskStatus = stage === "cancelled" ? "cancelled" : "active";
  const proposalStatus = { waiting: "pending-approval", approved: "authorized", executed: "completed",
    revoked: "denied", cancelled: "cancelled", unknown: "unknown", reconciled: "not-published" }[stage];
  const runStatus = { waiting: "waiting-approval", approved: "waiting-approval", executed: "completed",
    revoked: "failed", cancelled: "cancelled", unknown: "needs-reconciliation", reconciled: "running" }[stage];
  const task = { taskId: ids.taskId, participantId: "person-agent", projectId: "project-agent",
    environmentId: "environment-agent", objective: "Repair Agent fixture", workIntent: "effect-requested",
    status: taskStatus, updatedAt: "2026-09-04T12:00:00.000Z" };
  const project = { participantId: task.participantId, projectId: task.projectId, environmentId: task.environmentId,
    revision: stage === "executed" ? 2 : 1 };
  const grant = { grantId: ids.grantId, revision: stage === "revoked" ? 3 : 2,
    status: stage === "revoked" || stage === "cancelled" ? "revoked" : "active", profile: "ask-every-time",
    taskId: ids.taskId, participantId: task.participantId, projectId: task.projectId,
    environmentId: task.environmentId, sessionId: "session-agent", taskBindingDigest: sha("f"),
    definitionDigest: stage === "revoked" ? sha("6") : sha("9"), capabilitySetVersion, capabilitySetDigest,
    capabilityIds: ["project.apply-change", "project.inspect", "project.restore"],
    expiresAt: "2030-01-01T00:00:00.000Z" };
  const proposal = { proposalId: ids.proposalId, proposalDigest: sha("a"), grantId: ids.grantId,
    grantRevision: 2, capabilityId: "project.apply-change", grantDefinitionDigest: sha("9"),
    taskId: ids.taskId, participantId: task.participantId, projectId: task.projectId,
    environmentId: task.environmentId, sessionId: "session-agent", requestId: "step-agent-0",
    capabilitySetVersion, capabilitySetDigest, argumentsDigest: sha("1"), policy: "approval-required",
    arguments: exactArguments, prepared: { preview: { beforeSha256: sha("b"), afterSha256: sha("c") } },
    status: proposalStatus };
  if (["approved", "executed", "revoked"].includes(stage)) proposal.approval = { principalId: task.participantId,
    sessionId: "session-agent", proposalDigest: proposal.proposalDigest, grantRevision: 2,
    approvedAt: "2026-09-04T12:01:00.000Z" };
  if (stage === "revoked") proposal.errorCode = "m1-grant-revoked";
  const executed = stage === "executed";
  const run = { runId: ids.runId, taskId: ids.taskId, plannerRole: "agent", status: runStatus,
    participantId: task.participantId, projectId: task.projectId, sessionId: "session-agent",
    objective: task.objective, grantId: ids.grantId, grantRevision: 2, grantDefinitionDigest: sha("9"),
    activePlan: 0, nextStep: executed ? 1 : 0, recoveredActiveWindowCount: stage === "reconciled" ? 1 : 0,
    actions: executed ? [{ proposalId: ids.proposalId, receiptId: ids.receiptId, receiptDigest: sha("d"),
      capabilityId: "project.apply-change", executionStatus: "published", planIndex: 0, stepIndex: 0 }] : [],
    pendingProposalId: executed ? null : ids.proposalId, outcome: executed ? "plan-completed" : null,
    errorCode: stage === "revoked" ? "m1-grant-revoked" : null,
    plans: [{ summary: "Apply the exact correction.", planDigest: sha("e"), steps: [
      { requestId: "step-agent-0", capabilityId: "project.apply-change", arguments: exactArguments },
    ] }] };
  const receipt = { receiptId: ids.receiptId, receiptDigest: sha("d"), proposalId: ids.proposalId,
    proposalDigest: proposal.proposalDigest, capabilityId: proposal.capabilityId, capabilitySetVersion,
    capabilitySetDigest, argumentsDigest: proposal.argumentsDigest, policy: proposal.policy,
    effectKind: "revision-published", executionStatus: "published", cancellationRequested: false,
    taskId: ids.taskId, participantId: task.participantId, projectId: task.projectId,
    environmentId: task.environmentId, grantId: ids.grantId, grantRevision: 2 };
  const blocked = stage === "unknown" || stage === "cancelled";
  const digestByStage = { waiting: sha("8"), approved: sha("7"), executed: sha("5"), revoked: sha("6"),
    cancelled: sha("3"), unknown: sha("2"), reconciled: sha("1") };
  const canAct = authoritative && !blocked;
  const agentActionAuthority = { schemaVersion: "runaai-agent-action-authority/v1", atomic: true,
    taskId: ids.taskId, taskStatus, state: blocked ? "blocked" : "settled",
    authorityDigest: externalDigest ?? digestByStage[stage],
    pendingReconciliationCount: stage === "unknown" ? 1 : 0,
    unsettledProposalCount: stage === "unknown" ? 1 : 0, unsettledRunCount: 0,
    approvableProposals: canAct && stage === "waiting" ? [{ proposalId: ids.proposalId,
      proposalDigest: proposal.proposalDigest, capabilityId: proposal.capabilityId,
      grantId: ids.grantId, grantRevision: 2 }] : [],
    revocableGrants: canAct && !["revoked", "cancelled", "unknown"].includes(stage) ? [{ grantId: ids.grantId,
      grantRevision: 2, definitionDigest: sha("9"), profile: "ask-every-time" }] : [] };
  const pendingReconciliation = stage === "unknown" ? [{ proposalId: ids.proposalId, taskId: ids.taskId,
    participantId: task.participantId, projectId: task.projectId }] : [];
  return { task, project, run, grants: [grant], proposals: [proposal], receipts: executed ? [receipt] : [],
    pendingReconciliation, approvableProposalIds: stage === "waiting" ? [ids.proposalId] : [],
    currentReceiptIds: executed ? [ids.receiptId] : [], sessionRebindRequired: false,
    agentActionAuthority };
}

class AuthenticatedTransport {
  constructor({ stage = "waiting", authoritative = true } = {}) {
    this.stage = stage; this.authoritative = authoritative; this.externalDigest = null;
    this.calls = []; this.events = []; this.approvals = 0; this.effects = 0;
  }
  snapshot() { return records(this.stage, this.authoritative, this.externalDigest); }
  changeAuthorityAfterRender() { this.externalDigest = sha("4"); }
  async request(path, body) {
    assert.equal(path, "/api/m1/workspace");
    assert.equal(body.projectId, "project-agent");
    assert.ok(["code", "chat"].includes(body.experience));
    this.calls.push(structuredClone(body));
    if (body.operation === "sources.list") return { sources: [] };
    if (body.operation === "task.list") return { tasks: [this.snapshot().task] };
    if (body.operation === "run.list") return { runs: [this.snapshot().run] };
    if (body.operation === "task.status" || body.operation === "run.status") return this.snapshot();
    if (body.operation === "task.agent-fence") return this.snapshot().agentActionAuthority;
    if (body.operation !== "task.agent-action") throw Object.assign(new Error("unexpected-direct-mutation"),
      { code: "unexpected-direct-mutation" });
    const action = body.input;
    assert.equal(action.schemaVersion, "runaai-agent-action-request/v1");
    assert.equal(action.taskId, ids.taskId);
    if (action.authorityDigest !== this.snapshot().agentActionAuthority.authorityDigest)
      throw Object.assign(new Error("m1-agent-action-stale"), { code: "m1-agent-action-stale" });
    if (action.operation === "proposal.approve") {
      assert.equal(this.stage, "waiting"); this.events.push("approval"); this.approvals += 1; this.stage = "approved";
      return { value: { proposal: this.snapshot().proposals[0], receipt: null },
        agentActionAuthority: this.snapshot().agentActionAuthority };
    }
    if (action.operation === "grant.revoke") {
      this.events.push("revoke"); this.stage = "revoked";
      return { value: this.snapshot().grants[0], agentActionAuthority: this.snapshot().agentActionAuthority };
    }
    if (action.operation === "run.resume" || action.operation === "proposal.execute") {
      assert.equal(this.stage, "approved"); this.events.push("effect"); this.effects += 1; this.stage = "executed";
      return { value: this.snapshot(), agentActionAuthority: this.snapshot().agentActionAuthority };
    }
    throw Object.assign(new Error("unexpected-agent-operation"), { code: "unexpected-agent-operation" });
  }
}

async function harness(options = {}) {
  const document = new FixtureDocument(), transport = new AuthenticatedTransport(options);
  const context = { current: { projectId: "project-agent", experience: "code" } };
  const panel = await initializeFunctionPanel({ root: document, getContext: () => context.current,
    request: (path, body) => transport.request(path, body),
    fetchCapabilities: async () => ({ ok: true, async json() { return { enabled: true }; } }) });
  return { document, transport, context, panel };
}

async function openAgent(value) {
  await button(value.document, `Repair Agent fixture — ${value.transport.snapshot().run.status}`).click();
  assert.equal(value.document.getElementById("m1-task").dataset.m1TaskId, ids.taskId);
}

test("synthetic DOM: Agent is contextual to Code and Chat exposes no Agent mutation controls", async () => {
  const value = await harness(); await openAgent(value);
  const governance = value.document.elements().find(element => element.classList.contains("agent-governance"));
  assert.ok(governance);
  assert.equal(contains(value.document.getElementById("m1-code-panel"), governance), true);
  assert.equal(contains(value.document.getElementById("m1-task"), governance), true);
  assert.match(value.document.getElementById("m1-code-panel").textContent, /contextual governed state inside this Code task/u);

  value.context.current = { projectId: "project-agent", experience: "chat" }; await value.panel.refresh();
  assert.equal(value.document.getElementById("m1-code-panel").hidden, true);
  for (const label of ["Approve this exact action", "Revoke task permission", "Continue with selected profile"])
    assert.equal(byText(value.document, "button", label).length, 0);
  value.document.getElementById("m1-agent-guidance").checked = true;
  value.document.getElementById("m1-profile").value = "ask-every-time";
  value.document.getElementById("m1-work-intent").value = "effect-requested";
  await assert.rejects(value.panel.startWork("attempt from Chat"), /only inside a Code task/u);
  assert.equal(value.transport.calls.some(call => call.operation === "task.agent-action"), false);
});

test("synthetic DOM: approval and revoke controls come only from the authoritative fence projection", async () => {
  const legacyOnly = await harness({ authoritative: false }); await openAgent(legacyOnly);
  assert.deepEqual(legacyOnly.transport.snapshot().approvableProposalIds, [ids.proposalId]);
  assert.equal(byText(legacyOnly.document, "button", "Approve this exact action").length, 0);
  assert.equal(byText(legacyOnly.document, "button", "Revoke task permission").length, 0);

  const authoritative = await harness(); await openAgent(authoritative);
  assert.equal(byText(authoritative.document, "button", "Approve this exact action").length, 1);
  assert.equal(byText(authoritative.document, "button", "Revoke task permission").length, 1);
});

test("synthetic DOM: a stale rendered fence is rejected and shown without any effect", async () => {
  const value = await harness(); await openAgent(value); value.transport.changeAuthorityAfterRender();
  await button(value.document, "Revoke task permission").click();
  assert.equal(value.transport.stage, "waiting"); assert.equal(value.transport.effects, 0);
  assert.equal(value.transport.approvals, 0); assert.deepEqual(value.transport.events, []);
  assert.match(value.document.elements().find(element => element.getAttribute("role") === "status").textContent,
    /could not be completed.*actual receipt/u);
  assert.equal(value.transport.calls.filter(call => call.operation === "task.agent-action").length, 1);
});

test("synthetic DOM: ask-every-time approval is an explicit action before execution", async () => {
  const value = await harness(); await openAgent(value);
  assert.equal(value.transport.approvals, 0); assert.equal(value.transport.effects, 0);
  await button(value.document, "Approve this exact action").click();
  assert.deepEqual(value.transport.events, ["approval", "effect"]);
  assert.equal(value.transport.approvals, 1); assert.equal(value.transport.effects, 1);
  assert.deepEqual(value.transport.calls.filter(call => call.operation === "task.agent-action")
    .map(call => call.input.operation), ["proposal.approve", "run.resume"]);
  assert.equal(value.transport.calls.some(call => ["proposal.approve", "run.resume"].includes(call.operation)), false);
});

test("synthetic DOM: revoke-before-effect is available, exact and truthful", async () => {
  const value = await harness(); await openAgent(value);
  await button(value.document, "Revoke task permission").click();
  assert.deepEqual(value.transport.events, ["revoke"]); assert.equal(value.transport.effects, 0);
  assert.equal(value.transport.approvals, 0);
  const revoke = value.transport.calls.find(call => call.operation === "task.agent-action");
  assert.equal(revoke.input.operation, "grant.revoke");
  assert.deepEqual(revoke.input.input, { grantId: ids.grantId });
  assert.equal(byText(value.document, "button", "Approve this exact action").length, 0);
  assert.match(value.document.elements().find(element => element.getAttribute("role") === "status").textContent,
    /permission revoked.*explicit new profile/u);
});

test("synthetic DOM: cancelled, unknown and reconciled records never infer success", async t => {
  for (const [stage, expected] of [["cancelled", /Contextual Agent — cancelled/u],
    ["unknown", /Contextual Agent — unknown/u], ["reconciled", /Recovery state: restart-reconciled/u]]) {
    await t.test(stage, async () => {
      const value = await harness({ stage }); await openAgent(value);
      const text = value.document.getElementById("m1-task").textContent;
      assert.match(text, expected); assert.doesNotMatch(text, /recorded plan completed/u);
      assert.doesNotMatch(text, /Contextual Agent — completed/u);
      assert.equal(value.transport.effects, 0);
    });
  }
});
