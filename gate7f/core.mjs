import {
  agentProposalDigest, agentReceiptDigest, canonicalDigest,
  parseAgentApprovalRequest, parseAgentCapabilityRequest, parseAgentDeclineRequest,
  parseAgentPreferenceRevokeRequest, parseAgentPreferenceSetRequest, parseAgentProposal, parseAgentReceipt,
  parseAgentTaskCreateRequest, parseAgentTaskLifecycleRequest,
} from "./contracts.mjs";
import { approvalBasisForPolicy, evaluateAgentPolicy } from "./policy.mjs";
import { agentCapability } from "./registry.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const clone = value => structuredClone(value);

export class Gate7fAgentFoundationService {
  constructor({ repository, executor, now = () => new Date(), proposalTtlMs = 30 * 60_000 }) {
    this.repository = repository;
    this.executor = executor;
    this.now = now;
    this.proposalTtlMs = proposalTtlMs;
    this.executionLocks = new Map();
  }

  createTask(rawRequest) {
    const request = parseAgentTaskCreateRequest(rawRequest);
    this.#verified(request.participant);
    return this.repository.createTask(request);
  }

  async stage(rawRequest, options = {}) {
    const request = parseAgentCapabilityRequest(rawRequest);
    this.#verified(request.participant);
    if (request.origin.type === "retrieved-content" || request.origin.type === "tool-output") {
      throw coded("agent-origin-denied", "Retrieved content and tool output are material, never authority.");
    }
    const task = this.#taskAuthority(request.participant, request.taskId);
    this.#active(task);
    const capability = agentCapability(request.capabilityId);
    if (!capability) throw coded("agent-capability-unknown", "The capability is not registered.");
    const requestSha256 = canonicalDigest(request);
    const existing = this.repository.proposalByRequest(task.taskId, request.requestId, requestSha256);
    if (existing) {
      const receipt = this.repository.receiptForProposal(existing.proposalId);
      return { proposal: existing, receipt: receipt ? parseAgentReceipt({ ...receipt, replayed: true }) : null,
        delivery: null, replayed: true };
    }
    const policy = evaluateAgentPolicy({ task, capability,
      preferences: this.repository.preferencesForTask(task) });
    const prepared = policy.result === "deny"
      ? { preconditionSha256: canonicalDigest({ denied: true, taskId: task.taskId,
        capabilityId: capability.capabilityId, policyBasis: policy.basis }),
      preview: `Capability denied by policy: ${capability.capabilityId}\nNothing has happened.`,
      rollbackOfReceiptId: null }
      : this.executor.prepare({ task, request });
    const createdAt = this.now();
    const proposal = {
      schemaVersion: "runa2-agent-proposal/v1",
      proposalId: "pending",
      requestId: request.requestId,
      taskId: task.taskId,
      participantId: task.participantId,
      projectId: task.projectId,
      sessionId: task.sessionId,
      environmentId: task.environment.environmentId,
      environmentKind: task.environment.environmentKind,
      capabilityId: capability.capabilityId,
      riskClass: capability.riskClass,
      argumentsSha256: canonicalDigest(request.arguments),
      preconditionSha256: prepared.preconditionSha256,
      preview: prepared.preview,
      proposalDigest: "0".repeat(64),
      policy,
      rollbackOfReceiptId: prepared.rollbackOfReceiptId,
      status: policy.result === "deny" ? "denied"
        : policy.result === "automatic" ? "authorized" : "pending-approval",
      terminalCode: policy.result === "deny" ? policy.basis : null,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + this.proposalTtlMs).toISOString(),
    };
    proposal.proposalId = `g7fp-${canonicalDigest({ taskId: task.taskId, requestSha256 }).slice(0, 36)}`;
    proposal.proposalDigest = agentProposalDigest(proposal);
    const stored = this.repository.storeProposal({ proposal: parseAgentProposal(proposal), requestSha256,
      payload: { request } });
    if (stored.status !== "authorized") return { proposal: stored, receipt: null, delivery: null, replayed: false };
    return this.#execute(stored, { approvalBasis: approvalBasisForPolicy(stored.policy.basis), ...options });
  }

  async approveAndExecute(rawRequest, options = {}) {
    const request = parseAgentApprovalRequest(rawRequest);
    this.#verified(request.participant);
    const proposal = this.#proposalAuthority(request.participant, request.proposalId, request.proposalDigest);
    const task = this.#taskAuthority(request.participant, proposal.taskId);
    this.#active(task);
    if (proposal.status !== "pending-approval") {
      const existing = this.repository.receiptForProposal(proposal.proposalId);
      if (existing) return { proposal, receipt: parseAgentReceipt({ ...existing, replayed: true }),
        delivery: null, replayed: true };
      throw coded("agent-proposal-not-pending", `The proposal is ${proposal.status}.`);
    }
    return this.#execute(proposal, { approvalBasis: `manual-${request.remember}`,
      rememberApproval: request.remember, ...options });
  }

  decline(rawRequest) {
    const request = parseAgentDeclineRequest(rawRequest);
    this.#verified(request.participant);
    const proposal = this.#proposalAuthority(request.participant, request.proposalId, request.proposalDigest);
    const task = this.#taskAuthority(request.participant, proposal.taskId);
    this.#active(task);
    if (proposal.status !== "pending-approval") throw coded("agent-proposal-not-pending", `The proposal is ${proposal.status}.`);
    if (request.remember !== "once") {
      this.repository.recordPreference({ task, capabilityId: proposal.capabilityId,
        decision: "deny", scope: request.remember });
    }
    return this.repository.updateProposal(proposal.proposalId,
      { status: "declined", terminalCode: "agent-declined" });
  }

  setPreference(rawRequest) {
    const request = parseAgentPreferenceSetRequest(rawRequest);
    this.#verified(request.participant);
    const task = this.#taskAuthority(request.participant, request.taskId);
    this.#active(task);
    return this.repository.recordPreference({ task, capabilityId: request.capabilityId,
      decision: request.decision, scope: request.scope });
  }

  revokePreference(rawRequest) {
    const request = parseAgentPreferenceRevokeRequest(rawRequest);
    this.#verified(request.participant);
    const task = this.#taskAuthority(request.participant, request.taskId);
    return this.repository.revokePreference({ task, capabilityId: request.capabilityId,
      scope: request.scope, decision: request.decision });
  }

  changeTaskLifecycle(rawRequest) {
    const request = parseAgentTaskLifecycleRequest(rawRequest);
    this.#verified(request.participant);
    const task = this.#taskAuthority(request.participant, request.taskId);
    this.#active(task);
    return this.repository.updateTask(task.taskId,
      { status: request.action === "complete" ? "completed" : "cancelled" });
  }

  readTask(participant, taskId) {
    this.#verified(participant);
    return this.#taskAuthority(participant, taskId);
  }

  readProposal(participant, proposalId) {
    this.#verified(participant);
    const proposal = this.repository.proposal(proposalId);
    if (!proposal || proposal.participantId !== participant.principalId) {
      throw coded("agent-proposal-not-found", "The proposal does not exist.");
    }
    return proposal;
  }

  readReceipt(participant, receiptId) {
    this.#verified(participant);
    const receipt = this.repository.receipt(receiptId);
    if (!receipt || receipt.participantId !== participant.principalId) {
      throw coded("agent-receipt-not-found", "The receipt does not exist.");
    }
    return parseAgentReceipt({ ...receipt, replayed: false });
  }

  auditSummary(participant, taskId) {
    this.#verified(participant);
    const task = this.#taskAuthority(participant, taskId);
    return this.repository.auditSummary({ participantId: task.participantId, taskId: task.taskId });
  }

  #execute(proposal, options) {
    const existing = this.executionLocks.get(proposal.proposalId);
    if (existing) return existing;
    const pending = this.#executeUnlocked(proposal, options)
      .finally(() => this.executionLocks.delete(proposal.proposalId));
    this.executionLocks.set(proposal.proposalId, pending);
    return pending;
  }

  async #executeUnlocked(proposal, { approvalBasis, rememberApproval = "once", failBeforeEffect = false,
    failAfterEffectBeforeRecord = false, interruptAfterRecord = false } = {}) {
    const existing = this.repository.receiptForProposal(proposal.proposalId);
    if (existing) return { proposal: this.repository.proposal(proposal.proposalId),
      receipt: parseAgentReceipt({ ...existing, replayed: true }), delivery: null, replayed: true };
    const current = this.repository.proposal(proposal.proposalId);
    if (!current || !["authorized", "pending-approval"].includes(current.status)) {
      throw coded("agent-proposal-not-executable", "The proposal is not executable.");
    }
    if (this.now().getTime() >= new Date(current.expiresAt).getTime()) {
      this.repository.updateProposal(current.proposalId, { status: "expired", terminalCode: "agent-proposal-expired" });
      throw coded("agent-proposal-expired", "The proposal expired before execution.");
    }
    if (failBeforeEffect) {
      this.repository.updateProposal(current.proposalId, { status: "failed", terminalCode: "agent-simulated-before-effect" });
      throw coded("agent-simulated-before-effect", "A simulated failure occurred before the effect.");
    }
    const task = this.repository.task(current.taskId);
    this.#active(task);
    const payload = this.repository.proposalPayload(current.proposalId);
    let execution;
    try {
      execution = this.executor.execute({ task, proposal: current, request: payload.request });
    } catch (error) {
      this.repository.updateProposal(current.proposalId, { status: "failed", terminalCode: error.code ?? "agent-execution-failed" });
      throw error;
    }
    if (failAfterEffectBeforeRecord) {
      execution.undo();
      this.repository.updateProposal(current.proposalId,
        { status: "failed", terminalCode: "agent-simulated-atomic-rollback" });
      throw coded("agent-simulated-atomic-rollback", "A simulated recording failure restored the prior synthetic state.");
    }
    const executedAt = this.now().toISOString();
    const receipt = {
      schemaVersion: "runa2-agent-execution-receipt/v1",
      receiptId: `g7fr-${canonicalDigest({ proposalId: current.proposalId,
        proposalDigest: current.proposalDigest }).slice(0, 36)}`,
      proposalId: current.proposalId,
      proposalDigest: current.proposalDigest,
      taskId: current.taskId,
      participantId: current.participantId,
      projectId: current.projectId,
      sessionId: current.sessionId,
      environmentId: current.environmentId,
      environmentKind: current.environmentKind,
      capabilityId: current.capabilityId,
      riskClass: current.riskClass,
      executor: this.executor.executorId,
      policyBasis: current.policy.basis,
      approvalBasis,
      beforeSha256: execution.beforeSha256,
      afterSha256: execution.afterSha256,
      output: execution.output,
      rollbackOfReceiptId: current.rollbackOfReceiptId,
      executedAt,
      receiptSha256: "0".repeat(64),
      replayed: false,
      auditCodes: ["verified-participant", "task-scope-bound", "deterministic-policy",
        "exact-preview-bound", "stale-state-checked", "synthetic-executor", "one-deed-one-receipt"],
    };
    let recorded;
    try {
      receipt.receiptSha256 = agentReceiptDigest(receipt);
      recorded = this.repository.recordExecution({ proposalId: current.proposalId,
        receipt: parseAgentReceipt(receipt), rollbackState: execution.rollbackState,
        preference: rememberApproval === "once" ? null : { task, capabilityId: current.capabilityId,
          decision: "allow", scope: rememberApproval } });
    } catch (error) {
      if (!this.repository.receiptForProposal(current.proposalId)) {
        execution.undo();
        this.repository.updateProposal(current.proposalId,
          { status: "failed", terminalCode: "agent-recording-failed" });
      }
      throw coded("agent-recording-failed", `The synthetic effect could not be recorded: ${error.code ?? "invalid-receipt"}`);
    }
    if (interruptAfterRecord) throw coded("agent-receipt-delivery-interrupted", "Receipt delivery was interrupted after the deed was recorded.");
    return { proposal: this.repository.proposal(current.proposalId), receipt: recorded,
      delivery: execution.delivery, replayed: false };
  }

  #verified(participant) {
    if (!participant?.verified) throw coded("agent-not-authorized", "A verified participant session is required.");
  }

  #taskAuthority(participant, taskId) {
    const task = this.repository.task(taskId);
    if (!task || task.participantId !== participant.principalId) {
      throw coded("agent-task-not-found", "The task does not exist.");
    }
    return task;
  }

  #proposalAuthority(participant, proposalId, proposalDigest) {
    const proposal = this.repository.proposal(proposalId);
    if (!proposal || proposal.participantId !== participant.principalId) {
      throw coded("agent-proposal-not-found", "The proposal does not exist.");
    }
    if (proposal.proposalDigest !== proposalDigest) {
      throw coded("agent-proposal-digest-mismatch", "The approval does not match the exact proposal.");
    }
    return proposal;
  }

  #active(task) {
    if (!task || task.status !== "active") {
      throw coded("agent-task-not-active", "The Agent Mode task is no longer active.");
    }
  }
}
