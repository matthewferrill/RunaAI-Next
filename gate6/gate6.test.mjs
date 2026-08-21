import assert from "node:assert/strict";
import test from "node:test";

import { sha256 } from "../gate4/canonical.mjs";
import { MemoryCutoverStore } from "./adapters/memory.mjs";
import { createInitialCutoverState, Gate6CutoverCoordinator } from "./cutover.mjs";
import { exactApprovedKnowledge, exactDomains, greenReadiness, liveChecks, liveStatus,
  SOURCE_GENERATION, syntheticRelease, syntheticReleaseBoundary, TARGET_GENERATION } from "./fixtures.mjs";
import { evaluateReadiness, requiredReadinessFacts } from "./readiness.mjs";
import { assertReleaseManifest, buildReleaseManifest, releaseRuntimeStatus } from "./release.mjs";

const h = value => sha256(`gate6-test\0${value}`);
const hasCode = code => error => error?.code === code;

function harness() {
  const manifest = syntheticRelease();
  let clock = new Date("2026-08-21T18:00:00.000Z");
  const initial = createInitialCutoverState({ cutoverId: `cutover-${h(Math.random()).slice(0, 12)}`,
    manifest, sourceGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION });
  const store = new MemoryCutoverStore(initial);
  const coordinator = new Gate6CutoverCoordinator({ store, manifest, now: () => new Date(clock) });
  return { manifest, store, coordinator, advance: milliseconds => { clock = new Date(clock.getTime() + milliseconds); } };
}

async function toReconciled(value, suffix = "") {
  const domains = exactDomains(`reconcile${suffix}`);
  await value.coordinator.recordCandidateReadiness(`ready${suffix}`, greenReadiness("candidate", value.manifest));
  await value.coordinator.freezeSelectedWrites(`freeze${suffix}`, { selectedWritesFrozen: true,
    legacyReadsAvailable: true, sourceGeneration: SOURCE_GENERATION });
  await value.coordinator.verifyBackup(`backup${suffix}`, { backupVerified: true, distinctRestoreVerified: true,
    sourceGeneration: SOURCE_GENERATION, manifestDigest: h(`backup${suffix}`) });
  await value.coordinator.commitFinalDelta(`delta${suffix}`, { sourceStillFrozen: true,
    sourceGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION, domains });
  await value.coordinator.reconcile(`reconcile${suffix}`, { sourceStillFrozen: true,
    sourceGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION, domains,
    approvedKnowledge: exactApprovedKnowledge(`reconcile${suffix}`), oneDeedOneReceipt: true,
    deferredStoresUntouched: true });
  return domains;
}

async function toPromoted(value, suffix = "") {
  await toReconciled(value, suffix);
  await value.coordinator.recordPromotionReadiness(`promotion-ready${suffix}`, greenReadiness("promotion", value.manifest));
  await value.coordinator.promote(`promote${suffix}`, { sourceStillFrozen: true,
    expectedAuthorityGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION });
}

test("release manifest is canonical, complete, and service-order independent", () => {
  const manifest = syntheticRelease();
  assert.equal(assertReleaseManifest(manifest).manifestDigest, manifest.manifestDigest);
  assert.deepEqual(manifest.services.map(service => service.name), ["caddy", "keycloak", "openfga", "postgresql"]);
});

test("release manifest rejects secret-like fields and incomplete services", () => {
  const base = syntheticRelease();
  assert.throws(() => buildReleaseManifest({ releaseId: base.releaseId, commit: base.commit,
    artifactDigest: base.artifactDigest, configurationDigest: base.configurationDigest,
    applicationEntryPoint: base.applicationEntryPoint, model: base.model, services: base.services,
    token: "not-allowed" }), hasCode("release-secret-field-forbidden"));
  assert.throws(() => buildReleaseManifest({ releaseId: base.releaseId, commit: base.commit,
    artifactDigest: base.artifactDigest, configurationDigest: base.configurationDigest,
    applicationEntryPoint: base.applicationEntryPoint, model: base.model, services: base.services.slice(0, 3) }),
  hasCode("release-services-incomplete"));
});

test("release manifest tampering fails closed", () => {
  const manifest = syntheticRelease();
  assert.throws(() => assertReleaseManifest({ ...manifest, artifactDigest: h("changed") }),
    hasCode("release-manifest-digest-mismatch"));
});

test("runtime status exposes exact reviewed identities and no private values", () => {
  const manifest = syntheticRelease();
  const status = releaseRuntimeStatus({ manifest, authorityGeneration: TARGET_GENERATION, phase: "promoted", revision: 7 });
  assert.equal(status.running.commit, manifest.commit);
  assert.equal(status.running.artifactDigest, manifest.artifactDigest);
  assert.equal(status.privateValuesIncluded, false);
});

test("candidate and promotion readiness require their complete exact fact sets", () => {
  const manifest = syntheticRelease();
  assert.equal(greenReadiness("candidate", manifest).passed, true);
  assert.equal(greenReadiness("promotion", manifest).passed, true);
  assert.ok(requiredReadinessFacts("promotion").length > requiredReadinessFacts("candidate").length);
});

test("missing, unexpected, and unsafe release readiness facts fail closed", () => {
  const manifest = syntheticRelease();
  const facts = Object.fromEntries(requiredReadinessFacts("candidate").map(name => [name, true]));
  facts.postgresqlPersistent = false;
  assert.equal(evaluateReadiness({ manifest, releaseBoundary: syntheticReleaseBoundary(), facts, profile: "candidate" }).passed, false);
  facts.postgresqlPersistent = true; facts.unapproved = true;
  assert.equal(evaluateReadiness({ manifest, releaseBoundary: syntheticReleaseBoundary(), facts, profile: "candidate" }).passed, false);
  delete facts.unapproved;
  assert.equal(evaluateReadiness({ manifest, releaseBoundary: { ...syntheticReleaseBoundary(), scheme: "http" }, facts, profile: "candidate" }).passed, false);
});

test("initial cutover state keeps legacy authority", async () => {
  const value = harness();
  const state = await value.coordinator.status();
  assert.equal(state.phase, "planned");
  assert.equal(state.authorityGeneration, SOURCE_GENERATION);
  assert.equal(state.revision, 0);
});

test("full selected-core cutover closes only after the observation window", async () => {
  const value = harness();
  await toPromoted(value);
  await value.coordinator.verifyLive("live", { runtimeStatus: liveStatus(value.manifest), checks: liveChecks });
  await value.coordinator.startObservation("observe", { selectedWritesRemainFrozen: true, durationMinutes: 60 });
  await assert.rejects(value.coordinator.close("close-early", { healthGreenForEntireWindow: true,
    selectedWritesStayedFrozen: true, finalReconciliationExact: true }), hasCode("cutover-observation-incomplete"));
  value.advance(61 * 60_000);
  await value.coordinator.close("close", { healthGreenForEntireWindow: true,
    selectedWritesStayedFrozen: true, finalReconciliationExact: true });
  const state = await value.coordinator.status();
  assert.equal(state.phase, "closed");
  assert.equal(state.authorityGeneration, TARGET_GENERATION);
  assert.equal(state.revision, 10);
  assert.equal(state.events.length, 10);
});

test("failed readiness leaves legacy authority and planned state unchanged", async () => {
  const value = harness();
  const failed = { ...greenReadiness("candidate", value.manifest), passed: false };
  await assert.rejects(value.coordinator.recordCandidateReadiness("ready", failed), hasCode("cutover-readiness-failed"));
  assert.equal((await value.coordinator.status()).phase, "planned");
});

test("operations are idempotent and changed replay input is refused", async () => {
  const value = harness();
  const readiness = greenReadiness("candidate", value.manifest);
  const first = await value.coordinator.recordCandidateReadiness("ready", readiness);
  const replay = await value.coordinator.recordCandidateReadiness("ready", readiness);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  await assert.rejects(value.coordinator.recordCandidateReadiness("ready", { ...readiness, privateValuesIncluded: true }),
    hasCode("cutover-operation-conflict"));
});

test("concurrent identical operations create one transition", async () => {
  const value = harness();
  const readiness = greenReadiness("candidate", value.manifest);
  const results = await Promise.all([
    value.coordinator.recordCandidateReadiness("ready", readiness),
    value.coordinator.recordCandidateReadiness("ready", readiness),
  ]);
  assert.equal(results.filter(result => result.replayed).length, 1);
  assert.equal((await value.coordinator.status()).revision, 1);
});

test("commands cannot skip phases", async () => {
  const value = harness();
  await assert.rejects(value.coordinator.promote("promote", { sourceStillFrozen: true,
    expectedAuthorityGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION }), hasCode("cutover-phase-invalid"));
});

test("source generation drift blocks freeze and leaves candidate ready", async () => {
  const value = harness();
  await value.coordinator.recordCandidateReadiness("ready", greenReadiness("candidate", value.manifest));
  await assert.rejects(value.coordinator.freezeSelectedWrites("freeze", { selectedWritesFrozen: true,
    legacyReadsAvailable: true, sourceGeneration: "legacy:changed" }), hasCode("cutover-source-generation-drift"));
  assert.equal((await value.coordinator.status()).phase, "candidate-ready");
});

test("backup requires verified distinct restore and exact source authority", async () => {
  const value = harness();
  await value.coordinator.recordCandidateReadiness("ready", greenReadiness("candidate", value.manifest));
  await value.coordinator.freezeSelectedWrites("freeze", { selectedWritesFrozen: true,
    legacyReadsAvailable: true, sourceGeneration: SOURCE_GENERATION });
  await assert.rejects(value.coordinator.verifyBackup("backup", { backupVerified: true,
    distinctRestoreVerified: false, sourceGeneration: SOURCE_GENERATION, manifestDigest: h("backup") }),
  hasCode("cutover-restore-not-verified"));
});

test("final delta requires exactly all selected domains", async () => {
  const value = harness();
  await value.coordinator.recordCandidateReadiness("ready", greenReadiness("candidate", value.manifest));
  await value.coordinator.freezeSelectedWrites("freeze", { selectedWritesFrozen: true,
    legacyReadsAvailable: true, sourceGeneration: SOURCE_GENERATION });
  await value.coordinator.verifyBackup("backup", { backupVerified: true, distinctRestoreVerified: true,
    sourceGeneration: SOURCE_GENERATION, manifestDigest: h("backup") });
  const domains = exactDomains(); delete domains.setting;
  await assert.rejects(value.coordinator.commitFinalDelta("delta", { sourceStillFrozen: true,
    sourceGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION, domains }),
  hasCode("cutover-domain-set-invalid"));
});

test("any domain count or digest difference blocks delta", async () => {
  const value = harness();
  await value.coordinator.recordCandidateReadiness("ready", greenReadiness("candidate", value.manifest));
  await value.coordinator.freezeSelectedWrites("freeze", { selectedWritesFrozen: true,
    legacyReadsAvailable: true, sourceGeneration: SOURCE_GENERATION });
  await value.coordinator.verifyBackup("backup", { backupVerified: true, distinctRestoreVerified: true,
    sourceGeneration: SOURCE_GENERATION, manifestDigest: h("backup") });
  const domains = exactDomains(); domains["project-chat"].targetCount += 1;
  await assert.rejects(value.coordinator.commitFinalDelta("delta", { sourceStillFrozen: true,
    sourceGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION, domains }),
  hasCode("cutover-domain-reconciliation-failed"));
});

test("reconciliation must match the committed delta", async () => {
  const value = harness();
  const domains = exactDomains("first");
  await value.coordinator.recordCandidateReadiness("ready", greenReadiness("candidate", value.manifest));
  await value.coordinator.freezeSelectedWrites("freeze", { selectedWritesFrozen: true,
    legacyReadsAvailable: true, sourceGeneration: SOURCE_GENERATION });
  await value.coordinator.verifyBackup("backup", { backupVerified: true, distinctRestoreVerified: true,
    sourceGeneration: SOURCE_GENERATION, manifestDigest: h("backup") });
  await value.coordinator.commitFinalDelta("delta", { sourceStillFrozen: true,
    sourceGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION, domains });
  await assert.rejects(value.coordinator.reconcile("reconcile", { sourceStillFrozen: true,
    sourceGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION, domains: exactDomains("changed"),
    approvedKnowledge: exactApprovedKnowledge(), oneDeedOneReceipt: true, deferredStoresUntouched: true }),
  hasCode("cutover-delta-reconciliation-drift"));
});

test("approved-knowledge scope drift blocks reconciliation", async () => {
  const value = harness();
  const domains = exactDomains();
  await value.coordinator.recordCandidateReadiness("ready", greenReadiness("candidate", value.manifest));
  await value.coordinator.freezeSelectedWrites("freeze", { selectedWritesFrozen: true,
    legacyReadsAvailable: true, sourceGeneration: SOURCE_GENERATION });
  await value.coordinator.verifyBackup("backup", { backupVerified: true, distinctRestoreVerified: true,
    sourceGeneration: SOURCE_GENERATION, manifestDigest: h("backup") });
  await value.coordinator.commitFinalDelta("delta", { sourceStillFrozen: true,
    sourceGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION, domains });
  const knowledge = exactApprovedKnowledge(); knowledge.targetScopeCounts.global -= 1;
  await assert.rejects(value.coordinator.reconcile("reconcile", { sourceStillFrozen: true,
    sourceGeneration: SOURCE_GENERATION, targetGeneration: TARGET_GENERATION, domains,
    approvedKnowledge: knowledge, oneDeedOneReceipt: true, deferredStoresUntouched: true }),
  hasCode("cutover-approved-knowledge-scope-drift"));
});

test("promotion is compare-and-swap against legacy authority", async () => {
  const value = harness();
  await toReconciled(value);
  await value.coordinator.recordPromotionReadiness("promotion-ready", greenReadiness("promotion", value.manifest));
  await assert.rejects(value.coordinator.promote("promote", { sourceStillFrozen: true,
    expectedAuthorityGeneration: "wrong", targetGeneration: TARGET_GENERATION }), hasCode("cutover-promotion-cas-failed"));
  assert.equal((await value.coordinator.status()).authorityGeneration, SOURCE_GENERATION);
});

test("running commit, artifact, model, and service identities must all match", async () => {
  const value = harness();
  await toPromoted(value);
  const wrong = liveStatus(value.manifest); wrong.running.commit = "0".repeat(40);
  await assert.rejects(value.coordinator.verifyLive("live", { runtimeStatus: wrong, checks: liveChecks }),
    hasCode("cutover-live-identity-mismatch"));
  assert.equal((await value.coordinator.status()).phase, "promoted");
});

test("every live validation check is mandatory", async () => {
  const value = harness();
  await toPromoted(value);
  await assert.rejects(value.coordinator.verifyLive("live", { runtimeStatus: liveStatus(value.manifest),
    checks: { ...liveChecks, telemetryPrivacyPassed: false } }), hasCode("cutover-live-verification-failed"));
});

test("observation cannot be shortened below sixty minutes", async () => {
  const value = harness();
  await toPromoted(value);
  await value.coordinator.verifyLive("live", { runtimeStatus: liveStatus(value.manifest), checks: liveChecks });
  await assert.rejects(value.coordinator.startObservation("observe", { selectedWritesRemainFrozen: true,
    durationMinutes: 59 }), hasCode("cutover-observation-window-invalid"));
});

test("rollback before promotion restores legacy without target revocation", async () => {
  const value = harness();
  await value.coordinator.recordCandidateReadiness("ready", greenReadiness("candidate", value.manifest));
  await value.coordinator.rollback("rollback", { legacyRuntimeVerified: true, selectedWritesNeverUnfrozen: true });
  const state = await value.coordinator.status();
  assert.equal(state.phase, "rolled-back");
  assert.equal(state.authorityGeneration, SOURCE_GENERATION);
  assert.equal(state.rollback.targetWasAuthoritative, false);
});

test("rollback after promotion requires target session and capability revocation", async () => {
  const value = harness();
  await toPromoted(value);
  await assert.rejects(value.coordinator.rollback("rollback", { legacyRuntimeVerified: true,
    selectedWritesNeverUnfrozen: true, targetSessionsAndCapabilitiesRevoked: false }),
  hasCode("cutover-rollback-revocation-required"));
  assert.equal((await value.coordinator.status()).authorityGeneration, TARGET_GENERATION);
});

test("verified rollback after promotion returns authority to unchanged legacy", async () => {
  const value = harness();
  await toPromoted(value);
  await value.coordinator.rollback("rollback", { legacyRuntimeVerified: true,
    selectedWritesNeverUnfrozen: true, targetSessionsAndCapabilitiesRevoked: true });
  const state = await value.coordinator.status();
  assert.equal(state.phase, "rolled-back");
  assert.equal(state.authorityGeneration, SOURCE_GENERATION);
  assert.equal(state.rollback.targetWasAuthoritative, true);
});
