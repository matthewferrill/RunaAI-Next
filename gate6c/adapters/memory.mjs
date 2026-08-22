import { canonicalJson, sha256 } from "../../gate4/canonical.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const clone = value => structuredClone(value);

export class MemoryGate6cStore {
  constructor() {
    this.runs = new Map();
    this.participants = new Map();
    this.adapterName = "memory-gate6c";
  }

  async commitFinalDelta(plan, { failBeforeCommit = false, failAfterCommit = false } = {}) {
    const prior = this.runs.get(plan.runId);
    if (prior) {
      if (prior.planDigest !== plan.planDigest) throw coded("gate6c-run-conflict", "The final-delta run id was reused for different input.");
      return Object.freeze({ ...clone(prior.receipt), replayed: true });
    }
    const before = clone(this.participants.get(plan.participantId) ?? null);
    const next = { projectChat: clone(plan.projectChatPlan.records), learning: clone(plan.learningPlan.records),
      setting: clone(plan.setting), receipts: clone(plan.receiptRecords), domains: clone(plan.domains) };
    if (failBeforeCommit) throw coded("gate6c-simulated-before-commit", "The final delta failed before commit.");
    this.participants.set(plan.participantId, next);
    const receipt = { schemaVersion: "runa2-gate6c-final-delta-receipt/v1", runId: plan.runId,
      planDigest: plan.planDigest, bindingDigest: plan.bindingDigest, domains: clone(plan.domains),
      committed: true, replayed: false, plaintextPersisted: false, deferredStoresOpened: false,
      privateValuesIncluded: false };
    this.runs.set(plan.runId, { planDigest: plan.planDigest, participantId: plan.participantId,
      before, receipt: clone(receipt), rolledBack: false });
    if (failAfterCommit) throw coded("gate6c-response-lost", "The final delta committed but its response was lost.");
    return Object.freeze(receipt);
  }

  async rollbackRun(runId) {
    const run = this.runs.get(runId);
    if (!run) throw coded("gate6c-run-not-found", "The final-delta run was not found.");
    if (!run.rolledBack) {
      if (run.before === null) this.participants.delete(run.participantId);
      else this.participants.set(run.participantId, clone(run.before));
      run.rolledBack = true;
    }
    return Object.freeze({ schemaVersion: "runa2-gate6c-rollback-receipt/v1", runId,
      rollbackScope: "target-run-only", legacyModified: false, rolledBack: true,
      privateValuesIncluded: false });
  }

  audit(participantId) {
    const value = this.participants.get(participantId);
    if (!value) return null;
    return Object.freeze({ projectsAndChats: value.projectChat.length, learningEntries: value.learning.length,
      settings: value.setting ? 1 : 0, receipts: value.receipts.length,
      domainDigest: sha256(canonicalJson(value.domains)) });
  }
}
