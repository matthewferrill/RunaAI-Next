import { canonicalJson, sha256 } from "../gate4/canonical.mjs";
import { assertReleaseManifest } from "./release.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const digest = value => sha256(canonicalJson(value));
const clone = value => structuredClone(value);
const hex64 = value => /^[a-f0-9]{64}$/.test(String(value));
const operationIdValid = value => /^[A-Za-z0-9._:-]{1,160}$/.test(String(value));
const requiredDomains = Object.freeze(["action-receipts", "learning-events", "project-chat", "setting"]);

function requirePhase(state, phases) {
  if (!phases.includes(state.phase)) throw coded("cutover-phase-invalid", `Cutover phase ${state.phase} does not permit this operation.`);
}

function requireBoolean(value, code, message) { if (value !== true) throw coded(code, message); }
function requireGeneration(value, name) {
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(String(value))) throw coded("cutover-generation-invalid", `${name} generation is invalid.`);
}

function eventFor(sequence, command, operationId, inputDigest, now) {
  return Object.freeze({ sequence, command, operationId, inputDigest, at: now.toISOString() });
}

function exactAggregate(aggregate) {
  if (!aggregate || !Number.isInteger(aggregate.sourceCount) || aggregate.sourceCount < 0
      || !Number.isInteger(aggregate.targetCount) || aggregate.targetCount < 0
      || !hex64(aggregate.sourceDigest) || !hex64(aggregate.targetDigest)) return false;
  return aggregate.sourceCount === aggregate.targetCount && aggregate.sourceDigest === aggregate.targetDigest;
}

function validateDomains(domains) {
  const keys = Object.keys(domains ?? {}).sort();
  if (canonicalJson(keys) !== canonicalJson(requiredDomains)) throw coded("cutover-domain-set-invalid", "The final delta must contain exactly the selected domains.");
  for (const domain of requiredDomains) if (!exactAggregate(domains[domain])) throw coded("cutover-domain-reconciliation-failed", `Source and target differ for ${domain}.`);
  return clone(domains);
}

function validateKnowledge(knowledge) {
  if (!exactAggregate({ sourceCount: knowledge?.sourceActive, targetCount: knowledge?.targetActive,
    sourceDigest: knowledge?.sourceDigest, targetDigest: knowledge?.targetDigest })) {
    throw coded("cutover-approved-knowledge-reconciliation-failed", "Approved-knowledge active state differs.");
  }
  const sourceKeys = Object.keys(knowledge.sourceScopeCounts ?? {}).sort();
  const targetKeys = Object.keys(knowledge.targetScopeCounts ?? {}).sort();
  if (canonicalJson(sourceKeys) !== canonicalJson(targetKeys) || sourceKeys.some(key => !Number.isInteger(knowledge.sourceScopeCounts[key])
      || knowledge.sourceScopeCounts[key] < 0 || knowledge.sourceScopeCounts[key] !== knowledge.targetScopeCounts[key])) {
    throw coded("cutover-approved-knowledge-scope-drift", "Approved-knowledge scope counts differ.");
  }
  return clone(knowledge);
}

export function createInitialCutoverState({ cutoverId, manifest, sourceGeneration, targetGeneration }) {
  const release = assertReleaseManifest(manifest);
  if (!operationIdValid(cutoverId)) throw coded("cutover-id-invalid", "The cutover id is invalid.");
  requireGeneration(sourceGeneration, "Source"); requireGeneration(targetGeneration, "Target");
  if (sourceGeneration === targetGeneration) throw coded("cutover-generation-collision", "Source and target generations must be distinct.");
  return Object.freeze({
    schemaVersion: "runa2-gate6-cutover-state/v1",
    cutoverId,
    releaseManifestDigest: release.manifestDigest,
    releaseCommit: release.commit,
    releaseArtifactDigest: release.artifactDigest,
    selectedScopeVersion: release.selectedScopeVersion,
    sourceGeneration,
    targetGeneration,
    authorityGeneration: sourceGeneration,
    phase: "planned",
    revision: 0,
    candidateReadinessDigest: null,
    promotionReadinessDigest: null,
    freeze: null,
    backup: null,
    delta: null,
    reconciliation: null,
    liveVerification: null,
    observation: null,
    rollback: null,
    events: [],
  });
}

export class Gate6CutoverCoordinator {
  constructor({ store, manifest, now = () => new Date() }) {
    if (!store?.load || !store?.findOperation || !store?.commitOperation) throw coded("cutover-store-required", "A durable cutover store is required.");
    this.store = store;
    this.manifest = assertReleaseManifest(manifest);
    this.now = now;
  }

  async status() { return this.store.load(); }

  async #transition(operationId, command, input, allowedPhases, mutate) {
    if (!operationIdValid(operationId)) throw coded("cutover-operation-id-invalid", "A bounded operation id is required.");
    const inputDigest = digest({ command, input });
    const replay = await this.store.findOperation(operationId, inputDigest);
    if (replay) {
      if (replay.state.releaseManifestDigest !== this.manifest.manifestDigest) throw coded("cutover-release-mismatch", "The cutover state belongs to another release manifest.");
      return replay;
    }
    const current = await this.store.load();
    if (current.releaseManifestDigest !== this.manifest.manifestDigest) throw coded("cutover-release-mismatch", "The cutover state belongs to another release manifest.");
    requirePhase(current, allowedPhases);
    const changed = mutate(clone(current));
    changed.revision = current.revision + 1;
    const event = eventFor(changed.revision, command, operationId, inputDigest, this.now());
    changed.events.push(event);
    const result = Object.freeze({ schemaVersion: "runa2-gate6-cutover-receipt/v1", cutoverId: current.cutoverId,
      command, operationId, inputDigest, phase: changed.phase, revision: changed.revision,
      authorityGeneration: changed.authorityGeneration, privateValuesIncluded: false });
    return this.store.commitOperation({ operationId, inputDigest, expectedRevision: current.revision,
      nextState: changed, result });
  }

  recordCandidateReadiness(operationId, readiness) {
    return this.#transition(operationId, "record-candidate-readiness", readiness, ["planned"], state => {
      requireBoolean(readiness?.passed, "cutover-readiness-failed", "The production candidate is not ready.");
      if (readiness.profile !== "candidate" || readiness.releaseManifestDigest !== this.manifest.manifestDigest) throw coded("cutover-readiness-authority-mismatch", "Candidate readiness belongs to another profile or release.");
      state.candidateReadinessDigest = digest(readiness);
      state.phase = "candidate-ready";
      return state;
    });
  }

  freezeSelectedWrites(operationId, input) {
    return this.#transition(operationId, "freeze-selected-writes", input, ["candidate-ready"], state => {
      requireBoolean(input?.selectedWritesFrozen, "cutover-freeze-not-confirmed", "Selected legacy writes must be frozen.");
      requireBoolean(input?.legacyReadsAvailable, "cutover-legacy-read-unavailable", "Legacy reads must remain available during cutover.");
      if (input.sourceGeneration !== state.sourceGeneration) throw coded("cutover-source-generation-drift", "The source generation changed before freeze.");
      state.freeze = { sourceGeneration: input.sourceGeneration, selectedWritesFrozen: true,
        legacyReadsAvailable: true, frozenAt: this.now().toISOString() };
      state.phase = "frozen";
      return state;
    });
  }

  verifyBackup(operationId, input) {
    return this.#transition(operationId, "verify-backup", input, ["frozen"], state => {
      requireBoolean(input?.backupVerified, "cutover-backup-not-verified", "The final encrypted backup is not verified.");
      requireBoolean(input?.distinctRestoreVerified, "cutover-restore-not-verified", "A distinct-target restore is not verified.");
      if (input.sourceGeneration !== state.sourceGeneration || !hex64(input.manifestDigest)) throw coded("cutover-backup-authority-mismatch", "Backup authority or digest is invalid.");
      state.backup = { sourceGeneration: input.sourceGeneration, manifestDigest: input.manifestDigest,
        backupVerified: true, distinctRestoreVerified: true, verifiedAt: this.now().toISOString() };
      state.phase = "backup-verified";
      return state;
    });
  }

  commitFinalDelta(operationId, input) {
    return this.#transition(operationId, "commit-final-delta", input, ["backup-verified"], state => {
      requireBoolean(input?.sourceStillFrozen, "cutover-source-unfrozen", "The source write freeze was lost.");
      if (input.sourceGeneration !== state.sourceGeneration || input.targetGeneration !== state.targetGeneration) throw coded("cutover-generation-drift", "Source or target generation changed during final delta.");
      state.delta = { sourceGeneration: input.sourceGeneration, targetGeneration: input.targetGeneration,
        domains: validateDomains(input.domains), committedAt: this.now().toISOString() };
      state.phase = "delta-committed";
      return state;
    });
  }

  reconcile(operationId, input) {
    return this.#transition(operationId, "reconcile", input, ["delta-committed"], state => {
      requireBoolean(input?.sourceStillFrozen, "cutover-source-unfrozen", "The source write freeze was lost before reconciliation.");
      if (input.sourceGeneration !== state.sourceGeneration || input.targetGeneration !== state.targetGeneration) throw coded("cutover-generation-drift", "Source or target generation changed before reconciliation.");
      const domains = validateDomains(input.domains);
      if (digest(domains) !== digest(state.delta.domains)) throw coded("cutover-delta-reconciliation-drift", "Reconciliation no longer matches the committed final delta.");
      const approvedKnowledge = validateKnowledge(input.approvedKnowledge);
      requireBoolean(input?.oneDeedOneReceipt, "cutover-effect-receipt-duplicate", "The selected effect receipt is not unique.");
      requireBoolean(input?.deferredStoresUntouched, "cutover-deferred-store-changed", "A deferred protected store changed.");
      state.reconciliation = { domains, approvedKnowledge,
        oneDeedOneReceipt: true, deferredStoresUntouched: true,
        reconciliationDigest: digest({ domains, approvedKnowledge }), reconciledAt: this.now().toISOString() };
      state.phase = "reconciled";
      return state;
    });
  }

  recordPromotionReadiness(operationId, readiness) {
    return this.#transition(operationId, "record-promotion-readiness", readiness, ["reconciled"], state => {
      requireBoolean(readiness?.passed, "cutover-promotion-readiness-failed", "Promotion readiness is not green.");
      if (readiness.profile !== "promotion" || readiness.releaseManifestDigest !== this.manifest.manifestDigest) throw coded("cutover-readiness-authority-mismatch", "Promotion readiness belongs to another profile or release.");
      state.promotionReadinessDigest = digest(readiness);
      state.phase = "promotion-ready";
      return state;
    });
  }

  promote(operationId, input) {
    return this.#transition(operationId, "promote", input, ["promotion-ready"], state => {
      requireBoolean(input?.sourceStillFrozen, "cutover-source-unfrozen", "The source write freeze was lost before promotion.");
      if (input.expectedAuthorityGeneration !== state.sourceGeneration || state.authorityGeneration !== state.sourceGeneration
          || input.targetGeneration !== state.targetGeneration) throw coded("cutover-promotion-cas-failed", "Promotion authority changed unexpectedly.");
      state.authorityGeneration = state.targetGeneration;
      state.phase = "promoted";
      return state;
    });
  }

  verifyLive(operationId, input) {
    return this.#transition(operationId, "verify-live", input, ["promoted"], state => {
      const status = input?.runtimeStatus;
      if (status?.running?.commit !== this.manifest.commit || status?.running?.artifactDigest !== this.manifest.artifactDigest
          || status?.manifestDigest !== this.manifest.manifestDigest || status?.authorityGeneration !== state.targetGeneration
          || status?.cutover?.phase !== state.phase || status?.cutover?.revision !== state.revision
          || canonicalJson(status?.model) !== canonicalJson(this.manifest.model)
          || canonicalJson(status?.services) !== canonicalJson(this.manifest.services)) throw coded("cutover-live-identity-mismatch", "The running release or service identity does not match the reviewed manifest.");
      for (const check of ["selectedVerifierPassed", "representativeTranscriptsPassed", "effectReceiptPassed",
        "postRestartHealthPassed", "dependencyLossPassed", "reconciliationStillExact", "telemetryPrivacyPassed"])
        requireBoolean(input?.checks?.[check], "cutover-live-verification-failed", `Live verification failed: ${check}.`);
      state.liveVerification = { runtimeStatusDigest: digest(status), checks: clone(input.checks),
        verifiedAt: this.now().toISOString() };
      state.phase = "live-verified";
      return state;
    });
  }

  startObservation(operationId, input) {
    return this.#transition(operationId, "start-observation", input, ["live-verified"], state => {
      requireBoolean(input?.selectedWritesRemainFrozen, "cutover-observation-write-freeze-required", "Selected writes must remain frozen for observation.");
      if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 60 || input.durationMinutes > 24 * 60) throw coded("cutover-observation-window-invalid", "Observation must be between 60 minutes and 24 hours.");
      const started = this.now();
      state.observation = { startedAt: started.toISOString(), endsAt: new Date(started.getTime() + input.durationMinutes * 60_000).toISOString(),
        durationMinutes: input.durationMinutes, selectedWritesFrozen: true };
      state.phase = "observing";
      return state;
    });
  }

  close(operationId, input) {
    return this.#transition(operationId, "close", input, ["observing"], state => {
      if (this.now().getTime() < Date.parse(state.observation.endsAt)) throw coded("cutover-observation-incomplete", "The rollback observation window is not complete.");
      requireBoolean(input?.healthGreenForEntireWindow, "cutover-observation-health-failed", "Health was not green for the full observation window.");
      requireBoolean(input?.selectedWritesStayedFrozen, "cutover-observation-write-freeze-lost", "Selected writes were enabled before Gate 6 closed.");
      requireBoolean(input?.finalReconciliationExact, "cutover-final-reconciliation-failed", "Final reconciliation is not exact.");
      state.phase = "closed";
      return state;
    });
  }

  rollback(operationId, input) {
    return this.#transition(operationId, "rollback", input,
      ["candidate-ready", "frozen", "backup-verified", "delta-committed", "reconciled", "promotion-ready", "promoted", "live-verified", "observing"], state => {
        requireBoolean(input?.legacyRuntimeVerified, "cutover-rollback-legacy-unverified", "The legacy runtime was not verified after rollback.");
        requireBoolean(input?.selectedWritesNeverUnfrozen, "cutover-rollback-loss-window-violated", "Selected writes were enabled before rollback completed.");
        const targetWasAuthoritative = state.authorityGeneration === state.targetGeneration;
        if (targetWasAuthoritative) requireBoolean(input?.targetSessionsAndCapabilitiesRevoked,
          "cutover-rollback-revocation-required", "Target sessions and capabilities must be revoked during rollback.");
        state.authorityGeneration = state.sourceGeneration;
        state.rollback = { targetWasAuthoritative, legacyRuntimeVerified: true,
          selectedWritesNeverUnfrozen: true, targetSessionsAndCapabilitiesRevoked: targetWasAuthoritative,
          rolledBackAt: this.now().toISOString() };
        state.phase = "rolled-back";
        return state;
      });
  }
}

export { requiredDomains as GATE6_REQUIRED_DOMAINS };
