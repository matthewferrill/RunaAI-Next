import {
  actionIdempotencyKey, canonicalProposalFields, proposalDigest, renderPreview, sha256, valueDigest,
} from "../contracts.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const clone = value => structuredClone(value);
const settingKey = participantId => `${participantId}\u0000defaultIntelligenceLevel`;

export class MemoryGovernedActionStore {
  constructor({ now = () => new Date(), proposalTtlMs = 30 * 60_000 } = {}) {
    this.now = now;
    this.proposalTtlMs = proposalTtlMs;
    this.projects = new Map();
    this.settings = new Map();
    this.settingRevisions = new Map();
    this.proposals = new Map();
    this.requestDigests = new Map();
    this.receipts = new Map();
    this.capabilities = new Map();
    this.outbox = new Map();
  }

  seedProject({ projectId, participantId }) { this.projects.set(projectId, participantId); }
  seedSetting(participantId, value) {
    this.#validValue(value);
    const key = settingKey(participantId);
    this.settings.set(key, value);
    this.settingRevisions.set(key, (this.settingRevisions.get(key) ?? 0) + 1);
  }
  settingValue(participantId) { return this.settings.get(settingKey(participantId)) ?? "Medium"; }
  #settingState(participantId) {
    const key = settingKey(participantId);
    return { value: this.settings.get(key) ?? "Medium",
      version: this.settings.has(key) ? `revision-${this.settingRevisions.get(key) ?? 0}` : "absent" };
  }

  async propose(request) {
    this.#ownsProject(request.participant.principalId, request.project.projectId);
    const requestSha = sha256(JSON.stringify(request));
    const existingId = [...this.proposals.values()].find(item => item.requestId === request.requestId)?.proposalId;
    if (existingId) {
      if (this.requestDigests.get(request.requestId) !== requestSha) throw coded("action-request-conflict", "The request id is already bound to different action arguments.");
      return clone(this.proposals.get(existingId));
    }
    const beforeState = this.#settingState(request.participant.principalId);
    const beforeValue = beforeState.value;
    if (request.rollbackOfReceiptId) this.#validateRollback(request, beforeValue);
    if (beforeValue === request.action.value) throw coded("action-postcondition-already-satisfied", "The requested setting already has that value.");
    const created = this.now();
    const beforeVersion = beforeState.version;
    const boundBeforeSha256 = valueDigest({ participantId: request.participant.principalId,
      projectId: request.project.projectId, settingKey: request.action.settingKey, value: beforeValue,
      stateVersion: beforeVersion });
    const fields = canonicalProposalFields({ requestId: request.requestId,
      participantId: request.participant.principalId, projectId: request.project.projectId,
      origin: request.origin, action: request.action, beforeValue, beforeVersion,
      beforeSha256: boundBeforeSha256,
      rollbackOfReceiptId: request.rollbackOfReceiptId });
    const proposal = {
      schemaVersion: "runa2-action-proposal/v1",
      proposalId: `g3p-${sha256(JSON.stringify(fields)).slice(0, 36)}`,
      ...fields,
      preview: renderPreview({ projectId: fields.projectId, beforeValue,
        afterValue: request.action.value, rollbackOfReceiptId: request.rollbackOfReceiptId }),
      proposalDigest: proposalDigest(fields), status: "pending", terminalReason: null, createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + this.proposalTtlMs).toISOString(),
    };
    this.proposals.set(proposal.proposalId, proposal);
    this.requestDigests.set(request.requestId, requestSha);
    return clone(proposal);
  }

  async approveAndExecute(request, { failBeforeEffect = false, failAfterEffectBeforeRecord = false } = {}) {
    const proposal = this.proposals.get(request.proposalId);
    if (!proposal) throw coded("action-proposal-not-found", "The proposal does not exist.");
    this.#proposalAuthority(proposal, request.participant.principalId, request.proposalDigest);
    const existing = [...this.receipts.values()].find(item => item.proposalId === proposal.proposalId);
    if (existing) return { ...clone(existing), replayed: true };
    if (proposal.status !== "pending") throw coded("action-proposal-not-pending", `The proposal is ${proposal.status}.`);
    if (this.now().getTime() >= new Date(proposal.expiresAt).getTime()) {
      proposal.status = "expired";
      proposal.terminalReason = "expired-before-approval";
      throw coded("action-proposal-expired", "The proposal expired before approval.");
    }
    const currentState = this.#settingState(proposal.participantId);
    const current = currentState.value;
    const currentDigest = valueDigest({ participantId: proposal.participantId, projectId: proposal.projectId,
      settingKey: proposal.action.settingKey, value: current, stateVersion: currentState.version });
    if (currentDigest !== proposal.beforeSha256) {
      proposal.status = "failed"; proposal.terminalReason = "action-stale-state";
      throw coded("action-stale-state", "The setting changed after preview; nothing was executed.");
    }
    if (failBeforeEffect) {
      proposal.status = "failed"; proposal.terminalReason = "action-simulated-before-effect";
      throw coded("action-simulated-before-effect", "Simulated failure before the effect.");
    }
    const key = settingKey(proposal.participantId);
    const beforeRevision = this.settingRevisions.get(key);
    this.settings.set(key, proposal.action.value);
    this.settingRevisions.set(key, (beforeRevision ?? 0) + 1);
    const afterVersion = `revision-${this.settingRevisions.get(key)}`;
    if (failAfterEffectBeforeRecord) {
      this.settings.set(key, current);
      if (beforeRevision == null) this.settingRevisions.delete(key);
      else this.settingRevisions.set(key, beforeRevision);
      proposal.status = "failed"; proposal.terminalReason = "action-simulated-atomic-rollback";
      throw coded("action-simulated-atomic-rollback", "Simulated failure rolled the effect back before recording.");
    }
    const executedAt = this.now().toISOString();
    const idempotencyKey = actionIdempotencyKey(proposal);
    const capabilityId = `g3c-${sha256(proposal.proposalDigest).slice(0, 36)}`;
    const receipt = {
      schemaVersion: "runa2-action-receipt/v1", receiptId: `g3r-${idempotencyKey.slice(0, 36)}`,
      proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest,
      participantId: proposal.participantId, projectId: proposal.projectId, action: proposal.action,
      beforeValue: proposal.beforeValue, afterValue: proposal.action.value,
      beforeSha256: proposal.beforeSha256,
      afterSha256: valueDigest({ participantId: proposal.participantId, projectId: proposal.projectId,
        settingKey: proposal.action.settingKey, value: proposal.action.value, stateVersion: afterVersion }),
      capabilityId, idempotencyKey, rollbackOfReceiptId: proposal.rollbackOfReceiptId,
      executedAt, replayed: false,
      auditCodes: ["verified-steward", "exact-preview-bound", "stale-state-checked",
        "one-time-capability-consumed", "one-deed-one-receipt"],
    };
    this.capabilities.set(capabilityId, { proposalId: proposal.proposalId, approvalId: request.approvalId,
      approverId: request.participant.principalId, consumedAt: executedAt });
    this.receipts.set(receipt.receiptId, receipt);
    this.outbox.set(idempotencyKey, { eventType: "participant-setting.changed", receiptId: receipt.receiptId,
      state: "pending" });
    proposal.status = "executed";
    proposal.terminalReason = null;
    return clone(receipt);
  }

  async decline(request) {
    const proposal = this.proposals.get(request.proposalId);
    if (!proposal) throw coded("action-proposal-not-found", "The proposal does not exist.");
    this.#proposalAuthority(proposal, request.participant.principalId, request.proposalDigest);
    if (proposal.status !== "pending") throw coded("action-proposal-not-pending", `The proposal is ${proposal.status}.`);
    proposal.status = "declined";
    proposal.terminalReason = request.reason;
    return clone(proposal);
  }

  async readReceipt(participantId, receiptId) {
    const receipt = this.receipts.get(receiptId);
    if (!receipt || receipt.participantId !== participantId) throw coded("action-receipt-not-found", "The receipt does not exist.");
    return { ...clone(receipt), replayed: false };
  }

  auditState() { return { proposals: this.proposals.size, receipts: this.receipts.size,
    capabilities: this.capabilities.size, outbox: this.outbox.size }; }

  #proposalAuthority(proposal, participantId, digest) {
    if (proposal.participantId !== participantId) throw coded("action-not-authorized", "The proposal belongs to another steward.");
    if (proposal.proposalDigest !== digest) throw coded("action-proposal-digest-mismatch", "Approval does not match the exact preview.");
  }

  #validateRollback(request, current) {
    const receipt = this.receipts.get(request.rollbackOfReceiptId);
    if (!receipt || receipt.participantId !== request.participant.principalId || receipt.projectId !== request.project.projectId) {
      throw coded("action-rollback-receipt-invalid", "Rollback must name a receipt in the same steward and project scope.");
    }
    if (current !== receipt.afterValue || request.action.value !== receipt.beforeValue) {
      throw coded("action-rollback-state-invalid", "Rollback no longer matches the recorded before and after state.");
    }
  }

  #ownsProject(participantId, projectId) {
    if (this.projects.get(projectId) !== participantId) throw coded("action-project-not-authorized", "The project is outside this steward scope.");
  }
  #validValue(value) { if (!["Low", "Medium", "High"].includes(value)) throw coded("setting-value-invalid", "Invalid setting value."); }
}
