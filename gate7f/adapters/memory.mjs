import { canonicalDigest, parseAgentProposal, parseAgentReceipt, parseAgentTask, sha256 } from "../contracts.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const clone = value => structuredClone(value);
const mapEntries = map => [...map.entries()].map(([key, value]) => [key, clone(value)]);
const fromEntries = entries => new Map((entries ?? []).map(([key, value]) => [key, clone(value)]));
const workspaceKey = (participantId, projectId) => `${participantId}\u0000${projectId}`;
const taskRequestKey = (participantId, requestId) => `${participantId}\u0000${requestId}`;
const proposalRequestKey = (taskId, requestId) => `${taskId}\u0000${requestId}`;

export class MemoryAgentFoundationRepository {
  constructor({ now = () => new Date(), proposalTtlMs = 30 * 60_000, snapshot = null } = {}) {
    this.now = now;
    this.proposalTtlMs = proposalTtlMs;
    this.projects = snapshot ? fromEntries(snapshot.projects) : new Map();
    this.workspaces = snapshot ? fromEntries(snapshot.workspaces) : new Map();
    this.tasks = snapshot ? fromEntries(snapshot.tasks) : new Map();
    this.taskRequests = snapshot ? fromEntries(snapshot.taskRequests) : new Map();
    this.taskPayloads = snapshot ? fromEntries(snapshot.taskPayloads) : new Map();
    this.proposals = snapshot ? fromEntries(snapshot.proposals) : new Map();
    this.proposalRequests = snapshot ? fromEntries(snapshot.proposalRequests) : new Map();
    this.proposalPayloads = snapshot ? fromEntries(snapshot.proposalPayloads) : new Map();
    this.receipts = snapshot ? fromEntries(snapshot.receipts) : new Map();
    this.rollbackStates = snapshot ? fromEntries(snapshot.rollbackStates) : new Map();
    this.preferences = snapshot ? fromEntries(snapshot.preferences) : new Map();
    this.events = snapshot ? clone(snapshot.events ?? []) : [];
  }

  seedProject({ projectId, participantId, files = {} }) {
    const key = workspaceKey(participantId, projectId);
    this.projects.set(projectId, participantId);
    this.workspaces.set(key, { revision: 1, files: clone(files) });
  }

  ownsProject(participantId, projectId) {
    return this.projects.get(projectId) === participantId;
  }

  createTask(request) {
    if (!this.ownsProject(request.participant.principalId, request.project.projectId)) {
      throw coded("agent-project-not-authorized", "The project is outside this participant scope.");
    }
    const key = taskRequestKey(request.participant.principalId, request.requestId);
    const requestSha256 = canonicalDigest(request);
    const existing = this.taskRequests.get(key);
    if (existing) {
      if (existing.requestSha256 !== requestSha256) {
        throw coded("agent-task-request-conflict", "The task request id is bound to different arguments.");
      }
      return clone(this.tasks.get(existing.taskId));
    }
    const createdAt = this.now().toISOString();
    const taskId = `g7ft-${canonicalDigest({ key, requestSha256 }).slice(0, 36)}`;
    const task = parseAgentTask({
      schemaVersion: "runa2-agent-task/v1",
      taskId,
      requestId: request.requestId,
      participantId: request.participant.principalId,
      projectId: request.project.projectId,
      sessionId: request.session.sessionId,
      environment: request.environment,
      profile: request.profile,
      objectiveSha256: sha256(request.objective),
      status: "active",
      createdAt,
      updatedAt: createdAt,
    });
    this.tasks.set(taskId, task);
    this.taskRequests.set(key, { taskId, requestSha256 });
    this.taskPayloads.set(taskId, { objective: request.objective });
    this.#event("task-created", task, null, null);
    return clone(task);
  }

  task(taskId) { return clone(this.tasks.get(taskId) ?? null); }
  taskPayload(taskId) { return clone(this.taskPayloads.get(taskId) ?? null); }

  updateTask(taskId, update) {
    const task = this.tasks.get(taskId);
    if (!task) throw coded("agent-task-not-found", "The task does not exist.");
    const next = parseAgentTask({ ...task, ...clone(update), updatedAt: this.now().toISOString() });
    this.tasks.set(taskId, next);
    this.#event(`task-${next.status}`, next, null, null);
    return clone(next);
  }

  proposalByRequest(taskId, requestId, requestSha256) {
    const existing = this.proposalRequests.get(proposalRequestKey(taskId, requestId));
    if (!existing) return null;
    if (existing.requestSha256 !== requestSha256) {
      throw coded("agent-capability-request-conflict", "The capability request id is bound to different arguments.");
    }
    return clone(this.proposals.get(existing.proposalId));
  }

  storeProposal({ proposal, requestSha256, payload }) {
    const parsed = parseAgentProposal(proposal);
    this.proposals.set(parsed.proposalId, parsed);
    this.proposalRequests.set(proposalRequestKey(parsed.taskId, parsed.requestId), {
      proposalId: parsed.proposalId,
      requestSha256,
    });
    this.proposalPayloads.set(parsed.proposalId, clone(payload));
    this.#event("proposal-staged", this.tasks.get(parsed.taskId), parsed, null);
    return clone(parsed);
  }

  proposal(proposalId) { return clone(this.proposals.get(proposalId) ?? null); }
  proposalPayload(proposalId) { return clone(this.proposalPayloads.get(proposalId) ?? null); }

  updateProposal(proposalId, update) {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw coded("agent-proposal-not-found", "The proposal does not exist.");
    const next = parseAgentProposal({ ...proposal, ...clone(update) });
    this.proposals.set(proposalId, next);
    this.#event(`proposal-${next.status}`, this.tasks.get(next.taskId), next, null);
    return clone(next);
  }

  receiptForProposal(proposalId) {
    return clone([...this.receipts.values()].find(receipt => receipt.proposalId === proposalId) ?? null);
  }

  receipt(receiptId) { return clone(this.receipts.get(receiptId) ?? null); }
  rollbackState(receiptId) { return clone(this.rollbackStates.get(receiptId) ?? null); }

  recordExecution({ proposalId, receipt, rollbackState = null, preference = null }) {
    const parsed = parseAgentReceipt(receipt);
    const existing = this.receiptForProposal(proposalId);
    if (existing) return existing;
    this.receipts.set(parsed.receiptId, parsed);
    if (rollbackState) this.rollbackStates.set(parsed.receiptId, clone(rollbackState));
    const proposal = this.proposals.get(proposalId);
    this.proposals.set(proposalId, parseAgentProposal({ ...proposal, status: "executed", terminalCode: null }));
    if (preference) this.recordPreference(preference);
    this.#event("proposal-executed", this.tasks.get(parsed.taskId), proposal, parsed);
    return clone(parsed);
  }

  recordPreference({ task, capabilityId, decision, scope }) {
    if (scope === "once") return null;
    const preference = {
      preferenceId: `g7fpref-${canonicalDigest({ participantId: task.participantId, projectId: task.projectId,
        sessionId: scope === "session" ? task.sessionId : null, environmentId: task.environment.environmentId,
        capabilityId, decision, scope }).slice(0, 36)}`,
      participantId: task.participantId,
      projectId: task.projectId,
      sessionId: scope === "session" ? task.sessionId : null,
      environmentId: task.environment.environmentId,
      capabilityId,
      decision,
      scope,
      createdAt: this.now().toISOString(),
    };
    this.preferences.set(preference.preferenceId, preference);
    this.#event(`preference-${decision}`, task, { capabilityId, policy: { result: decision, basis: scope } }, null);
    return clone(preference);
  }

  preferencesForTask(task) {
    return clone([...this.preferences.values()].filter(item => item.participantId === task.participantId
      && item.projectId === task.projectId && item.environmentId === task.environment.environmentId
      && (item.scope === "project" || item.sessionId === task.sessionId)));
  }

  revokePreference({ task, capabilityId, scope, decision }) {
    let removed = 0;
    for (const [key, item] of this.preferences) {
      if (item.participantId === task.participantId && item.projectId === task.projectId
        && item.environmentId === task.environment.environmentId && item.capabilityId === capabilityId
        && item.scope === scope && item.decision === decision
        && (scope === "project" || item.sessionId === task.sessionId)) {
        this.preferences.delete(key);
        removed += 1;
      }
    }
    this.#event("preference-revoked", task, { capabilityId, policy: { result: decision, basis: scope } }, null);
    return { removed };
  }

  workspace(participantId, projectId) {
    if (!this.ownsProject(participantId, projectId)) {
      throw coded("agent-project-not-authorized", "The project is outside this participant scope.");
    }
    const state = this.workspaces.get(workspaceKey(participantId, projectId));
    if (!state) throw coded("agent-workspace-not-found", "The synthetic workspace does not exist.");
    return clone(state);
  }

  replaceWorkspace(participantId, projectId, state) {
    if (!this.ownsProject(participantId, projectId)) {
      throw coded("agent-project-not-authorized", "The project is outside this participant scope.");
    }
    this.workspaces.set(workspaceKey(participantId, projectId), clone(state));
    return this.workspace(participantId, projectId);
  }

  auditSummary({ participantId = null, taskId = null } = {}) {
    const byType = {};
    const byCapability = {};
    const byPolicyResult = {};
    const participants = new Set();
    const scopedEvents = this.events.filter(item => (!participantId || item.participantId === participantId)
      && (!taskId || item.taskId === taskId));
    for (const event of scopedEvents) {
      byType[event.type] = (byType[event.type] ?? 0) + 1;
      if (event.capabilityId) byCapability[event.capabilityId] = (byCapability[event.capabilityId] ?? 0) + 1;
      if (event.policyResult) byPolicyResult[event.policyResult] = (byPolicyResult[event.policyResult] ?? 0) + 1;
      if (event.participantSha256) participants.add(event.participantSha256);
    }
    return { schemaVersion: "runa2-agent-audit-summary/v1", eventCount: scopedEvents.length,
      byType, byCapability, byPolicyResult, participantDigests: [...participants].sort(),
      privateValuesIncluded: false };
  }

  exportSyntheticSnapshot() {
    return clone({ schemaVersion: "runa2-agent-synthetic-snapshot/v1",
      projects: mapEntries(this.projects), workspaces: mapEntries(this.workspaces), tasks: mapEntries(this.tasks),
      taskRequests: mapEntries(this.taskRequests), taskPayloads: mapEntries(this.taskPayloads),
      proposals: mapEntries(this.proposals),
      proposalRequests: mapEntries(this.proposalRequests), proposalPayloads: mapEntries(this.proposalPayloads),
      receipts: mapEntries(this.receipts), rollbackStates: mapEntries(this.rollbackStates),
      preferences: mapEntries(this.preferences), events: this.events });
  }

  #event(type, task, proposal, receipt) {
    this.events.push({
      type,
      participantId: task?.participantId ?? null,
      projectId: task?.projectId ?? null,
      taskId: task?.taskId ?? null,
      participantSha256: task?.participantId ? sha256(task.participantId) : null,
      projectSha256: task?.projectId ? sha256(task.projectId) : null,
      taskSha256: task?.taskId ? sha256(task.taskId) : null,
      capabilityId: proposal?.capabilityId ?? receipt?.capabilityId ?? null,
      riskClass: proposal?.riskClass ?? receipt?.riskClass ?? null,
      policyResult: proposal?.policy?.result ?? null,
      at: this.now().toISOString(),
    });
  }
}
