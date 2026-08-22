import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeSnapshot as makeProjectChat, testCipher as coreCipher, PARTICIPANT } from "../gate4/fixtures.mjs";
import { makeSnapshot as makeLearning, testCipher as learningCipher } from "../gate4b/fixtures.mjs";
import { assertBackupProof, assertBinding, assertOwnerAggregateInventory, bindingDigest,
  digestEvidence } from "./contracts.mjs";
import { advanceOwnerCeremony, assertOwnerCeremonyComplete, createOwnerCeremonyState } from "./ceremony.mjs";
import { issueFreezeLease, releaseFreezeLease, renewFreezeLease } from "./freeze.mjs";
import { GATE6C_BACKUP_VERSION, GATE6C_BINDING_VERSION, GATE6C_INVENTORY_VERSION,
  GATE6C_OWNER_STEPS } from "./formats.mjs";
import { Gate6cFinalDeltaService, buildGate6cFinalDeltaPlan } from "./migration.mjs";
import { reconcileGate6c } from "./reconciliation.mjs";
import { inspectSelectedContinuity } from "./selected-inventory.mjs";
import { MemoryGate6cStore } from "./adapters/memory.mjs";
import { BrowserOwnerCeremonyService, MemoryBrowserCeremonyStore } from "./browser-ceremony.mjs";
import { bindOwnerAndVerifyRecoveryAuthority } from "./control/Advance-ControlRecoveryAuthority.mjs";
import { rebindOwnerRecoveryAuthority } from "./control/Rebind-ControlOwnerAuthority.mjs";
import { rebindCompletedOwnerCeremony } from "./control/Rebind-ControlCompletedOwnerCeremony.mjs";

const SOURCE = "b4db04090d8f0df87234fab573b396e7824c5354";
const TARGET = "77f3017d10f4e4670ad551b3d000cc2569c1dfdb";
const NOW = new Date("2026-08-21T22:00:00.000Z");
const binding = () => ({ schemaVersion: GATE6C_BINDING_VERSION, cutoverId: "selected-core-2026-08-21",
  releaseId: "runaai-next-selected-core-2026-08-21-77f3017", releaseCommit: TARGET,
  artifactDigest: "a7fcc146b40c4522f10b1f11c81aafc320800482bd70efc81f6d02ce880599e2",
  sourceGeneration: SOURCE, targetGeneration: "runaai-next-control-candidate-v1",
  participantRefHmac: "a".repeat(64) });
const evidence = (command) => ({ passed: true, evidenceDigest: digestEvidence({ command, synthetic: true }),
  ...(["enroll-primary-credential", "verify-sign-in", "verify-fresh-step-up",
    "enroll-recovery-credential", "verify-recovery"].includes(command) ? { method: "webauthn" } : {}),
  ...(command === "verify-revocation" ? { sessionsRevoked: true, capabilitiesRevoked: true } : {}) });
function ceremony(authority = binding()) {
  let state = createOwnerCeremonyState(authority);
  GATE6C_OWNER_STEPS.forEach((command, index) => {
    state = advanceOwnerCeremony(state, { operationId: `owner-${index + 1}`, command,
      evidence: evidence(command), observedAt: new Date(NOW.getTime() + index * 1_000).toISOString() });
  });
  return state;
}
const backup = authority => ({ schemaVersion: GATE6C_BACKUP_VERSION, bindingDigest: bindingDigest(authority),
  scheduleActive: true, encryptedBackupCount: 3, plaintextBackupCount: 0,
  manifestDigest: "b".repeat(64), distinctRestoreVerified: true,
  verifiedAt: new Date(NOW.getTime() - 60_000).toISOString(), privateValuesIncluded: false });
function snapshots() {
  const projectChatSnapshot = makeProjectChat();
  const learningSnapshot = makeLearning();
  learningSnapshot.participantId = projectChatSnapshot.participantId;
  return { projectChatSnapshot, learningSnapshot };
}
const setting = value => ({ schemaVersion: "runa-settings-store/v1",
  values: { defaultIntelligenceLevel: value } });
const receipt = (digest = "c".repeat(64)) => ({ schemaVersion: "runa2-gate6c-selected-receipt-source/v1",
  sourceReceiptDigest: digest, occurredAt: "2026-08-21T21:00:00.000Z",
  beforeValue: "Medium", afterValue: "High", status: "executed" });
function planInput(overrides = {}) {
  return { runId: "gate6c-synthetic-1", binding: binding(), ...snapshots(),
    legacySetting: setting("High"), selectedReceipts: [receipt()], ...overrides };
}
function inventory(authority, domains) {
  return { schemaVersion: GATE6C_INVENTORY_VERSION, bindingDigest: bindingDigest(authority),
    sourceCommit: authority.sourceGeneration, sourceBranch: "main", trackedClean: true,
    sourcePinsVerified: true, twoPassDeterministic: true, settingValueAllowed: true,
    selectedReceiptClassified: true, domains: structuredClone(domains), deferredStoresOpened: false,
    sourceModified: false, privateValuesIncluded: false };
}
function completeInput({ runId = "gate6c-synthetic-1", key = Buffer.alloc(32, 77), receipts = [receipt()] } = {}) {
  const authority = binding();
  const base = planInput({ runId, binding: authority, selectedReceipts: receipts });
  const plan = buildGate6cFinalDeltaPlan(base, { coreCipher: coreCipher(), learningCipher: learningCipher(),
    reconciliationKey: key });
  return { input: { ...base, ownerCeremony: ceremony(authority), backupProof: backup(authority),
    freezeLease: issueFreezeLease({ binding: authority, leaseId: "freeze-1", now: NOW }),
    inventory: inventory(authority, plan.domains) }, plan, key };
}

test("authority binding is exact and secret-like fields are refused", () => {
  assert.equal(assertBinding(binding()).releaseCommit, TARGET);
  assert.throws(() => assertBinding({ ...binding(), token: "private" }), { code: "gate6c-binding-invalid" });
  assert.throws(() => assertBinding({ ...binding(), targetGeneration: SOURCE }), { code: "gate6c-binding-invalid" });
});

test("owner ceremony enforces order and user-verified methods", () => {
  const state = createOwnerCeremonyState(binding());
  assert.throws(() => advanceOwnerCeremony(state, { operationId: "wrong", command: "verify-sign-in",
    evidence: evidence("verify-sign-in"), observedAt: NOW.toISOString() }), { code: "gate6c-owner-step-order-invalid" });
  let next = advanceOwnerCeremony(state, { operationId: "one", command: GATE6C_OWNER_STEPS[0],
    evidence: evidence(GATE6C_OWNER_STEPS[0]), observedAt: NOW.toISOString() });
  assert.throws(() => advanceOwnerCeremony(next, { operationId: "two", command: GATE6C_OWNER_STEPS[1],
    evidence: { ...evidence(GATE6C_OWNER_STEPS[1]), method: "password" }, observedAt: NOW.toISOString() }),
  { code: "gate6c-owner-method-invalid" });
});

test("complete owner ceremony proves sign-in, step-up, revocation, and recovery", () => {
  const state = assertOwnerCeremonyComplete(ceremony(), binding());
  assert.equal(state.complete, true);
  assert.equal(state.events.length, 7);
  assert.equal(JSON.stringify(state).includes("credentialId"), false);
});

test("backup proof requires recurrence, encryption, distinct restore, and freshness", () => {
  assert.equal(assertBackupProof(backup(binding()), { binding: binding(), now: NOW }).scheduleActive, true);
  assert.throws(() => assertBackupProof({ ...backup(binding()), plaintextBackupCount: 1 },
    { binding: binding(), now: NOW }), { code: "gate6c-backup-proof-invalid" });
  assert.throws(() => assertBackupProof({ ...backup(binding()), verifiedAt: "2026-08-19T00:00:00.000Z" },
    { binding: binding(), now: NOW }), { code: "gate6c-backup-proof-stale" });
});

test("freeze lease is bounded, renewable, and not casually releasable", () => {
  const lease = issueFreezeLease({ binding: binding(), leaseId: "freeze-1", now: NOW, durationMinutes: 30 });
  const renewed = renewFreezeLease(lease, { binding: binding(), now: new Date(NOW.getTime() + 60_000), durationMinutes: 45 });
  assert.ok(Date.parse(renewed.expiresAt) > Date.parse(lease.expiresAt));
  assert.throws(() => releaseFreezeLease(renewed, { binding: binding(), now: new Date(NOW.getTime() + 120_000),
    reason: "review-needed" }), { code: "gate6c-freeze-release-denied" });
  assert.equal(releaseFreezeLease(renewed, { binding: binding(), now: new Date(NOW.getTime() + 120_000),
    reason: "verified-rollback" }).status, "released");
});

test("owner aggregate inventory accepts exactly four selected domains", () => {
  const { plan } = completeInput();
  assert.equal(Object.keys(assertOwnerAggregateInventory(inventory(binding(), plan.domains),
    { binding: binding() }).domains).length, 4);
  const wrong = inventory(binding(), plan.domains); delete wrong.domains.setting;
  assert.throws(() => assertOwnerAggregateInventory(wrong, { binding: binding() }),
    { code: "gate6c-domain-set-invalid" });
});

test("final delta maps all selected domains and no deferred store", () => {
  const { plan } = completeInput();
  assert.deepEqual(Object.keys(plan.domains).sort(), ["action-receipts", "learning-events", "project-chat", "setting"]);
  assert.equal(plan.setting.value, "High");
  assert.equal(plan.receiptRecords.length, 1);
  assert.equal(plan.deferredStoresOpened, false);
  assert.equal(plan.plaintextPersisted, false);
});

test("final delta accepts a verified zero-receipt source without inventing history", () => {
  const { plan } = completeInput({ receipts: [] });
  assert.equal(plan.domains["action-receipts"].count, 0);
  assert.equal(plan.receiptRecords.length, 0);
});

test("final delta rejects an invalid setting and duplicate selected receipt", () => {
  assert.throws(() => buildGate6cFinalDeltaPlan(planInput({ legacySetting: setting("Extreme") }),
    { coreCipher: coreCipher(), learningCipher: learningCipher(), reconciliationKey: Buffer.alloc(32, 1) }),
  { code: "gate6c-setting-source-invalid" });
  assert.throws(() => buildGate6cFinalDeltaPlan(planInput({ selectedReceipts: [receipt(), receipt()] }),
    { coreCipher: coreCipher(), learningCipher: learningCipher(), reconciliationKey: Buffer.alloc(32, 1) }),
  { code: "gate6c-selected-receipt-duplicate" });
});

test("final delta refuses participant and source-generation drift", () => {
  const mismatched = planInput(); mismatched.learningSnapshot.participantId = "another-owner";
  assert.throws(() => buildGate6cFinalDeltaPlan(mismatched,
    { coreCipher: coreCipher(), learningCipher: learningCipher(), reconciliationKey: Buffer.alloc(32, 1) }),
  { code: "gate6c-participant-mismatch" });
  const drift = planInput(); drift.learningSnapshot.sourceCommit = "d".repeat(40);
  assert.throws(() => buildGate6cFinalDeltaPlan(drift,
    { coreCipher: coreCipher(), learningCipher: learningCipher(), reconciliationKey: Buffer.alloc(32, 1) }),
  { code: "gate6c-source-generation-drift" });
});

test("staging commits once and exact retry is idempotent", async () => {
  const { input, key } = completeInput(); const store = new MemoryGate6cStore();
  const service = new Gate6cFinalDeltaService({ store, coreCipher: coreCipher(),
    learningCipher: learningCipher(), reconciliationKey: key, now: () => NOW });
  const first = await service.stage(input); const replay = await service.stage(input);
  assert.equal(first.committed, true); assert.equal(first.replayed, false); assert.equal(replay.replayed, true);
  assert.equal(store.audit(PARTICIPANT).receipts, 1);
});

test("changed input under one run id is refused", async () => {
  const { input, key } = completeInput(); const store = new MemoryGate6cStore();
  const service = new Gate6cFinalDeltaService({ store, coreCipher: coreCipher(),
    learningCipher: learningCipher(), reconciliationKey: key, now: () => NOW });
  await service.stage(input);
  const changed = completeInput({ key, receipts: [] }).input;
  await assert.rejects(() => service.stage(changed), { code: "gate6c-run-conflict" });
});

test("failure before commit leaves no target rows", async () => {
  const { input, key } = completeInput(); const store = new MemoryGate6cStore();
  const service = new Gate6cFinalDeltaService({ store, coreCipher: coreCipher(),
    learningCipher: learningCipher(), reconciliationKey: key, now: () => NOW });
  await assert.rejects(() => service.stage(input, { failBeforeCommit: true }), { code: "gate6c-simulated-before-commit" });
  assert.equal(store.audit(PARTICIPANT), null);
});

test("response loss retries to the one committed run", async () => {
  const { input, key } = completeInput(); const store = new MemoryGate6cStore();
  const service = new Gate6cFinalDeltaService({ store, coreCipher: coreCipher(),
    learningCipher: learningCipher(), reconciliationKey: key, now: () => NOW });
  await assert.rejects(() => service.stage(input, { failAfterCommit: true }), { code: "gate6c-response-lost" });
  assert.equal((await service.stage(input)).replayed, true);
});

test("pre-promotion rollback restores only the target run", async () => {
  const { input, key } = completeInput(); const store = new MemoryGate6cStore();
  const service = new Gate6cFinalDeltaService({ store, coreCipher: coreCipher(),
    learningCipher: learningCipher(), reconciliationKey: key, now: () => NOW });
  await service.stage(input);
  assert.throws(() => service.rollback({ runId: input.runId, targetAuthoritative: true,
    legacyRuntimeVerified: true, selectedWritesStillFrozen: true }), { code: "gate6c-rollback-boundary-invalid" });
  const result = await service.rollback({ runId: input.runId, targetAuthoritative: false,
    legacyRuntimeVerified: true, selectedWritesStillFrozen: true });
  assert.equal(result.legacyModified, false); assert.equal(store.audit(PARTICIPANT), null);
});

test("exact reconciliation covers all domains and approved knowledge", () => {
  const { plan } = completeInput();
  const domains = Object.fromEntries(Object.entries(plan.domains).map(([name, value]) => [name,
    { sourceCount: value.count, targetCount: value.count,
      sourceDigest: value.logicalDigest, targetDigest: value.logicalDigest }]));
  const knowledge = { sourceActive: 2, targetActive: 2, sourceDigest: "d".repeat(64),
    targetDigest: "d".repeat(64), sourceScopeCounts: { personal: 1, project: 1 },
    targetScopeCounts: { personal: 1, project: 1 } };
  const result = reconcileGate6c({ binding: binding(), domains, approvedKnowledge: knowledge,
    sourceStillFrozen: true, deferredStoresUntouched: true, oneDeedOneReceipt: true });
  assert.equal(result.exact, true);
  domains.setting.targetCount = 2;
  assert.throws(() => reconcileGate6c({ binding: binding(), domains, approvedKnowledge: knowledge,
    sourceStillFrozen: true, deferredStoresUntouched: true, oneDeedOneReceipt: true }),
  { code: "gate6c-domain-reconciliation-failed" });
});

test("private evidence fields are refused", () => {
  const { plan } = completeInput(); const value = inventory(binding(), plan.domains);
  value.sessionToken = "PRIVATE";
  assert.throws(() => assertOwnerAggregateInventory(value, { binding: binding() }),
    { code: "gate6c-owner-inventory-invalid" });
});

test("each plan uses a memory-only reconciliation key", () => {
  const one = buildGate6cFinalDeltaPlan(planInput(), { coreCipher: coreCipher(),
    learningCipher: learningCipher(), reconciliationKey: Buffer.alloc(32, 1) });
  const two = buildGate6cFinalDeltaPlan(planInput(), { coreCipher: coreCipher(),
    learningCipher: learningCipher(), reconciliationKey: randomBytes(32) });
  assert.notEqual(one.domains.setting.logicalDigest, two.domains.setting.logicalDigest);
  assert.equal(JSON.stringify(one).includes("reconciliationKey"), false);
});

test("selected owner inventory reads only setting and action roots", () => {
  const root = mkdtempSync(join(tmpdir(), "gate6c-selected-"));
  try {
    mkdirSync(join(root, "settings"), { recursive: true });
    writeFileSync(join(root, "settings", "values.json"), JSON.stringify(setting("High")));
    const result = inspectSelectedContinuity({ stateRoot: root, reconciliationKey: Buffer.alloc(32, 7) });
    assert.equal(result.domains.setting.count, 1);
    assert.equal(result.domains["action-receipts"].count, 0);
    assert.equal(result.deferredStoresOpened, false);
    assert.equal(JSON.stringify(result).includes("High"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("selected owner inventory fails closed on a possible setting action", () => {
  const root = mkdtempSync(join(tmpdir(), "gate6c-selected-"));
  try {
    mkdirSync(join(root, "settings"), { recursive: true });
    mkdirSync(join(root, "actions", "proposals"), { recursive: true });
    writeFileSync(join(root, "settings", "values.json"), JSON.stringify(setting("Medium")));
    writeFileSync(join(root, "actions", "proposals", "0000000000000001.json"), JSON.stringify({
      schemaVersion: "runa-action-pathway/v1", kind: "file-write",
      payload: { relativePath: "defaultIntelligenceLevel" } }));
    assert.throws(() => inspectSelectedContinuity({ stateRoot: root,
      reconciliationKey: Buffer.alloc(32, 7) }), { code: "gate6c-selected-receipt-review-required" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Control scheduled backup never writes a plaintext dump", () => {
  const source = readFileSync(new URL("./control/Invoke-ControlScheduledBackup.ps1", import.meta.url), "utf8");
  assert.match(source, /candidate\.releaseManifestPath/);
  assert.match(source, /candidate-running-release-mismatch/);
  assert.doesNotMatch(source, /config\\release\.json/);
  assert.match(source, /RedirectStandardOutput = \$true/);
  assert.match(source, /ProtectedData\]::Protect/);
  assert.match(source, /DataProtectionScope\]::LocalMachine/);
  assert.match(source, /--no-password/);
  assert.match(source, /completed\.Count -ge 30/);
  assert.doesNotMatch(source, /--file|\.dump['"]/);
  assert.doesNotMatch(source, /Remove-Item/);
});

test("Control restore proof streams decrypted archives only to distinct targets", () => {
  const source = readFileSync(new URL("./control/Invoke-ControlScheduledRestoreProof.ps1", import.meta.url), "utf8");
  assert.match(source, /candidate\.releaseManifestPath/);
  assert.match(source, /candidate-running-release-mismatch/);
  assert.doesNotMatch(source, /config\\release\.json/);
  assert.match(source, /ProtectedData\]::Unprotect/);
  assert.match(source, /RedirectStandardInput = \$true/);
  assert.match(source, /\$env:PGPASSWORD = \$password/);
  assert.match(source, /--no-password/);
  assert.match(source, /psql\.exe'\) -w/);
  assert.match(source, /g6cproof_runa/);
  assert.match(source, /dropdb\.exe/);
  assert.match(source, /plaintextBackupCount=0/);
  assert.doesNotMatch(source, /WriteAllBytes|Set-Content/);
});

test("Control backup schedule is SYSTEM-owned and fail-closed at its capacity", () => {
  const source = readFileSync(new URL("./control/Register-ControlBackupSchedule.ps1", import.meta.url), "utf8");
  assert.match(source, /candidate\.releaseManifestPath/);
  assert.match(source, /candidate-running-release-mismatch/);
  assert.doesNotMatch(source, /config\\release\.json/);
  assert.match(source, /\$taskName = 'ProtectedBackup'/);
  assert.match(source, /UserId 'SYSTEM'/);
  assert.match(source, /-AtStartup/);
  assert.match(source, /retentionMode='fail-closed-at-30-generations'/);
  assert.doesNotMatch(source, /Unregister-ScheduledTask|Remove-Item/);
});

test("Control freeze tool preserves reads, records original ACL, and cannot casually release", () => {
  const source = readFileSync(new URL("./control/Set-ControlLegacyWriteFreeze.ps1", import.meta.url), "utf8");
  assert.match(source, /conservative-entire-legacy-state-root-write-deny/);
  assert.match(source, /legacyReadsAvailable=\$true/);
  assert.match(source, /SetSecurityDescriptorSddlForm/);
  assert.match(source, /verified-rollback','gate6-closed/);
  assert.match(source, /DataProtectionScope\]::LocalMachine/);
  assert.match(source, /legacy-state-changed-during-freeze/);
  assert.doesNotMatch(source, /Remove-Item|rmSync|\.runaai-local\\state.*-Recurse -Force/);
});

test("Control owner tools bind the exact candidate config and DPAPI user context", () => {
  const prepare = readFileSync(new URL("./control/Prepare-ControlOwner.ps1", import.meta.url), "utf8");
  const operator = readFileSync(new URL("./control/Advance-ControlRecoveryAuthority.mjs", import.meta.url), "utf8");
  const clipboard = readFileSync(new URL("./control/Copy-ControlOwnerBootstrapPassword.ps1", import.meta.url), "utf8");
  const repair = readFileSync(new URL("./control/Repair-ControlOwnerBootstrapPassword.ps1", import.meta.url), "utf8");
  const localhostDeploy = readFileSync(new URL("./control/Deploy-ControlLocalhostShadow.ps1", import.meta.url), "utf8");
  const resumeDeploy = readFileSync(new URL("./control/Deploy-ControlEnrollmentResume.ps1", import.meta.url), "utf8");
  const resumeRebind = readFileSync(new URL("./control/Invoke-ControlOwnerAuthorityRebindAfterEnrollment.ps1", import.meta.url), "utf8");
  const completedOwnerDeploy = readFileSync(new URL("./control/Deploy-ControlCompletedOwnerReadiness.ps1", import.meta.url), "utf8");
  const flowProof = readFileSync(new URL("./control/Test-ControlOwnerPasskeyFlow.ps1", import.meta.url), "utf8");
  const configureFlow = readFileSync(new URL("./control/Configure-ControlOwnerPasskeyFlow.ps1", import.meta.url), "utf8");
  const restoreFlow = readFileSync(new URL("./control/Restore-ControlOwnerPasskeyFlow.ps1", import.meta.url), "utf8");
  const amrProof = readFileSync(new URL("./control/Test-ControlPasskeyAmrMapper.ps1", import.meta.url), "utf8");
  const configureAmr = readFileSync(new URL("./control/Configure-ControlOwnerPasskeyAmr.ps1", import.meta.url), "utf8");
  const restoreAmr = readFileSync(new URL("./control/Restore-ControlOwnerPasskeyAmr.ps1", import.meta.url), "utf8");
  const rebind = readFileSync(new URL("./control/Rebind-ControlOwnerAuthority.mjs", import.meta.url), "utf8");
  assert.match(prepare, /config\\candidate\.json/);
  assert.match(operator, /config\\\\candidate\.json/);
  for (const source of [prepare, clipboard, repair]) {
    assert.match(source, /Add-Type -AssemblyName System\.Security/);
    assert.match(source, /DataProtectionScope\]::CurrentUser/);
  }
  assert.match(repair, /owner-bootstrap-repair-state-invalid/);
  assert.match(repair, /passkeyCredentials=0/);
  assert.doesNotMatch(repair, /Write-Output.*password|Set-Clipboard/);
  assert.match(prepare, /serviceAccountsEnabled=\$false/);
  assert.match(prepare, /webAuthnPolicyPasswordlessPasskeysEnabled/);
  assert.match(operator, /BEGIN ISOLATION LEVEL SERIALIZABLE/);
  assert.match(operator, /verifyReleaseArtifact/);
  assert.match(operator, /--untracked-files=no/);
  assert.doesNotMatch(operator, /config\.sourceGeneration !== args\["legacy-commit"\]/);
  assert.match(localhostDeploy, /http:\/\/localhost:9762\/realms\/runaai-next/);
  assert.match(localhostDeploy, /rolledBack=\$true/);
  assert.match(localhostDeploy, /priorCeremonyRetained=\$true/);
  assert.doesNotMatch(localhostDeploy, /C:\\AI\\Projects\\RunaAI/);
  assert.match(rebind, /priorCeremonyRetained: true/);
  assert.match(rebind, /webauthn-rp-domain-correction/);
  assert.match(resumeDeploy, /candidate-current-safety-state-drift/);
  assert.match(resumeDeploy, /rolledBack=\$true/);
  assert.match(resumeRebind, /interrupted-enrollment-recovery-release/);
  assert.match(resumeRebind, /webauthn-passwordless' \}\)\.Count -ne 1/);
  assert.match(completedOwnerDeploy, /ownerCredentialEnrolled-ne \$true/);
  assert.match(completedOwnerDeploy, /authority-ne 'shadow'/);
  assert.match(completedOwnerDeploy, /candidatePromoted=\$false/);
  assert.match(completedOwnerDeploy, /rolledBack=\$true/);
  assert.match(completedOwnerDeploy, /Rebind-ControlCompletedOwnerCeremony\.mjs/);
  assert.match(flowProof, /runaai-next-gate6c-flow-proof/);
  assert.match(flowProof, /finally \{/);
  assert.match(flowProof, /Method Delete -Uri "\$base\/admin\/realms\/\$realmName"/);
  for (const source of [flowProof, configureFlow]) {
    assert.match(source, /webauthn-authenticator-passwordless/);
    assert.match(source, /'default\.reference\.value'='webauthn'/);
    assert.match(source, /'default\.reference\.maxAge'='300'/);
  }
  assert.match(configureFlow, /authenticationFlowBindingOverrides/);
  assert.match(configureFlow, /owner-passkey-flow-safety-state-drift/);
  assert.match(configureFlow, /protectedDataImported=\$false/);
  assert.match(configureFlow, /productionTrafficChanged=\$false/);
  assert.match(restoreFlow, /owner-passkey-flow-rollback-safety-state-drift/);
  assert.match(restoreFlow, /ownerCredentialRetained=\$true/);
  assert.doesNotMatch(configureFlow, /Write-Output.*password|Set-Clipboard/);
  assert.match(amrProof, /runaai-next-gate6c-amr-proof/);
  assert.match(amrProof, /oidc-hardcoded-claim-mapper/);
  assert.match(amrProof, /'claim\.value'='\["webauthn"\]'/);
  assert.match(amrProof, /inspected\.active -ne \$true/);
  assert.match(amrProof, /Method Delete -Uri "\$base\/admin\/realms\/\$realmName"/);
  assert.match(configureAmr, /owner-passkey-amr-flow-not-exclusive/);
  assert.match(configureAmr, /directAccessGrantsEnabled -ne \$false/);
  assert.match(configureAmr, /serviceAccountsEnabled -ne \$false/);
  assert.match(configureAmr, /included\.client\.audience/);
  assert.match(configureAmr, /oidc-hardcoded-claim-mapper/);
  assert.match(configureAmr, /owner-passkey-amr-replacement-invalid/);
  assert.match(restoreAmr, /owner-passkey-amr-rollback-safety-state-drift/);
  assert.match(restoreAmr, /passkeyFlowRetained=\$true/);
  assert.doesNotMatch(configureAmr, /Write-Output.*password|Set-Clipboard/);
});

test("browser owner ceremony uses PKCE, exact owner binding, WebAuthn, and opaque sessions", async () => {
  const store = new MemoryBrowserCeremonyStore();
  const active = new Set();
  const refreshPairs = new Map();
  const calls = { exchanges: [], revoked: [] };
  const oidc = {
    issuer: "http://keycloak.test/realms/runaai-next",
    authorizationUrl(input) {
      const value = new URL(`${this.issuer}/protocol/openid-connect/auth`);
      value.search = new URLSearchParams({ state: input.state, code_challenge: input.codeChallenge,
        code_challenge_method: "S256", redirect_uri: input.redirectUri }).toString();
      if (input.action) value.searchParams.set("kc_action", input.action);
      return value.toString();
    },
    async exchangeCode(input) {
      calls.exchanges.push(input);
      const token = `PRIVATE_BROWSER_TOKEN_${calls.exchanges.length}`;
      const refreshToken = `PRIVATE_BROWSER_REFRESH_${calls.exchanges.length}`;
      active.add(token);
      refreshPairs.set(refreshToken, token);
      return { accessToken: token, refreshToken };
    },
    async inspect(token) {
      return { active: active.has(token), issuer: this.issuer, audience: ["runaai-next"],
        subject: "prebound-owner-subject", authenticatedAt: NOW.toISOString(),
        expiresAt: new Date(NOW.getTime() + 600_000).toISOString(), methods: ["webauthn"] };
    },
    async countPasswordless(token) {
      return { decided: true, count: token.endsWith("_1") ? 1 : token.endsWith("_4") ? 2 : 0 };
    },
    async revoke(token) { active.delete(refreshPairs.get(token)); calls.revoked.push(token); return { revoked: true }; },
  };
  let randomCounter = 18;
  const service = new BrowserOwnerCeremonyService({ store, oidc,
    principalStore: { async bySubject(subject) { assert.equal(subject, "prebound-owner-subject");
      return { principalId: "matthew-owner", status: "active" }; } }, binding: binding(),
    publicBaseUrl: "https://192.168.50.20:9761", clientId: "runaai-next",
    expectedPrincipalId: "matthew-owner", now: () => NOW,
    random: size => Buffer.alloc(size, ++randomCounter),
    capabilityRevoker: { async revokeAll() { return { revoked: 0, remaining: 0 }; } },
  });
  await service.initialize();
  await store.advanceCeremony({ binding: binding(), operationId: "external-recovery-authority",
    command: "verify-recovery-authority", evidence: { passed: true,
      evidenceDigest: digestEvidence({ synthetic: "recovery-authority" }) }, observedAt: NOW.toISOString() });

  const primary = await service.start("enroll-primary-credential");
  const primaryUrl = new URL(primary.redirectUrl);
  assert.equal(primaryUrl.searchParams.get("kc_action"), "webauthn-register-passwordless");
  const enrolled = await service.callback({ state: primaryUrl.searchParams.get("state"),
    code: "enroll-primary", actionStatus: "success" });
  assert.equal(enrolled.nextStep, "verify-sign-in");

  const signIn = await service.start("verify-sign-in");
  const signInUrl = new URL(signIn.redirectUrl);
  assert.equal(signInUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(signInUrl.searchParams.has("code_verifier"), false);
  const state = signInUrl.searchParams.get("state");
  const signedIn = await service.callback({ state, code: "code-one" });
  assert.equal(signedIn.nextStep, "verify-fresh-step-up");
  assert.doesNotMatch(JSON.stringify(signedIn), /PRIVATE_BROWSER_TOKEN/);
  await assert.rejects(service.callback({ state, code: "code-one" }),
    { code: "gate6c-browser-flow-invalid" });

  const stepUp = await service.start("verify-fresh-step-up");
  await service.callback({ state: new URL(stepUp.redirectUrl).searchParams.get("state"), code: "code-two" });
  const revoked = await service.revokeAndVerify();
  assert.equal(revoked.nextStep, "enroll-recovery-credential");
  assert.equal(calls.revoked.length, 3);
  await assert.rejects(service.credentialForSession(signedIn.sessionId),
    { code: "gate6c-browser-session-invalid" });

  const recoveryEnrollment = await service.start("enroll-recovery-credential");
  const recoveryEnrollmentUrl = new URL(recoveryEnrollment.redirectUrl);
  await service.callback({ state: recoveryEnrollmentUrl.searchParams.get("state"),
    code: "enroll-recovery", actionStatus: "success" });
  const recovery = await service.start("verify-recovery");
  const recovered = await service.callback({ state: new URL(recovery.redirectUrl).searchParams.get("state"),
    code: "code-three" });
  assert.equal(recovered.nextStep, null);
  assert.equal((await service.status()).complete, true);
});

test("browser owner ceremony rejects password-only and an unbound subject", async () => {
  async function prepared(decision, principal) {
    const store = new MemoryBrowserCeremonyStore();
    const oidc = { issuer: "http://issuer", authorizationUrl(input) {
      return `http://issuer/auth?state=${encodeURIComponent(input.state)}`;
    }, async exchangeCode() { return { accessToken: "PRIVATE", refreshToken: "PRIVATE_REFRESH" }; }, async inspect() { return decision; },
    async revoke() { return { revoked: true }; } };
    const service = new BrowserOwnerCeremonyService({ store, oidc,
      principalStore: { async bySubject() { return principal; } }, binding: binding(),
      publicBaseUrl: "https://candidate.test", clientId: "runaai-next",
      expectedPrincipalId: "matthew-owner", now: () => NOW, random: size => Buffer.alloc(size, 23) });
    await service.initialize();
    for (const [operationId, command, evidenceValue] of [
      ["authority", "verify-recovery-authority", { passed: true,
        evidenceDigest: digestEvidence({ command: "authority" }) }],
      ["enroll", "enroll-primary-credential", { passed: true, method: "webauthn",
        evidenceDigest: digestEvidence({ command: "enroll" }) }],
    ]) await store.advanceCeremony({ binding: binding(), operationId, command,
      evidence: evidenceValue, observedAt: NOW.toISOString() });
    return { service, state: new URL((await service.start("verify-sign-in")).redirectUrl).searchParams.get("state") };
  }
  const base = { active: true, issuer: "http://issuer", audience: ["runaai-next"],
    subject: "subject", authenticatedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString() };
  const password = await prepared({ ...base, methods: ["pwd"] },
    { principalId: "matthew-owner", status: "active" });
  await assert.rejects(password.service.callback({ state: password.state, code: "password" }),
    { code: "gate6c-browser-user-verification-required" });
  const wrongOwner = await prepared({ ...base, methods: ["webauthn"] },
    { principalId: "someone-else", status: "active" });
  await assert.rejects(wrongOwner.service.callback({ state: wrongOwner.state, code: "wrongown" }),
    { code: "gate6c-browser-owner-binding-mismatch" });
});

test("browser enrollment requires the exact distinct passkey count", async () => {
  const store = new MemoryBrowserCeremonyStore();
  let active = true;
  const oidc = { issuer: "http://issuer", authorizationUrl(input) {
    return `http://issuer/auth?state=${encodeURIComponent(input.state)}`;
  }, async exchangeCode() { return { accessToken: "PRIVATE", refreshToken: "PRIVATE_REFRESH" }; },
  async inspect() { return { active, issuer: "http://issuer", audience: ["runaai-next"],
    subject: "owner-subject", authenticatedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(), methods: ["pwd"] }; },
  async countPasswordless() { return { decided: true, count: 0 }; },
  async revoke() { active = false; return { revoked: true }; } };
  const service = new BrowserOwnerCeremonyService({ store, oidc,
    principalStore: { async bySubject() { return { principalId: "matthew-owner", status: "active" }; } },
    binding: binding(), publicBaseUrl: "https://candidate.test", clientId: "runaai-next",
    expectedPrincipalId: "matthew-owner", now: () => NOW, random: size => Buffer.alloc(size, 29) });
  await service.initialize();
  await store.advanceCeremony({ binding: binding(), operationId: "authority", command: "verify-recovery-authority",
    evidence: { passed: true, evidenceDigest: digestEvidence({ command: "authority" }) },
    observedAt: NOW.toISOString() });
  const started = await service.start("enroll-primary-credential");
  await assert.rejects(service.callback({ state: new URL(started.redirectUrl).searchParams.get("state"),
    code: "enrollment-code", actionStatus: "success" }),
  { code: "gate6c-browser-credential-count-invalid" });
  assert.equal((await service.status()).nextStep, "enroll-primary-credential");
  assert.equal(active, false);
});

test("an interrupted enrollment resumes by proving the exact existing passkey", async () => {
  const store = new MemoryBrowserCeremonyStore();
  const oidc = { issuer: "http://issuer", authorizationUrl(input) {
    const value = new URL("http://issuer/auth");
    value.searchParams.set("state", input.state);
    if (input.action) value.searchParams.set("kc_action", input.action);
    return value.toString();
  }, async exchangeCode() { return { accessToken: "PRIVATE", refreshToken: "PRIVATE_REFRESH" }; },
  async inspect() { return { active: true, issuer: "http://issuer", audience: ["runaai-next"],
    subject: "owner-subject", authenticatedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(), methods: ["webauthn"] }; },
  async countPasswordless() { return { decided: true, count: 1 }; },
  async revoke() { return { revoked: true }; } };
  const service = new BrowserOwnerCeremonyService({ store, oidc,
    principalStore: { async bySubject() { return { principalId: "matthew-owner", status: "active" }; } },
    binding: binding(), publicBaseUrl: "https://candidate.test", clientId: "runaai-next",
    expectedPrincipalId: "matthew-owner", now: () => NOW, random: size => Buffer.alloc(size, 31) });
  await service.initialize();
  await store.advanceCeremony({ binding: binding(), operationId: "authority", command: "verify-recovery-authority",
    evidence: { passed: true, evidenceDigest: digestEvidence({ command: "authority" }) },
    observedAt: NOW.toISOString() });
  const resumed = await service.start("enroll-primary-credential", { resumeExisting: true });
  const url = new URL(resumed.redirectUrl);
  assert.equal(url.searchParams.has("kc_action"), false);
  const completed = await service.callback({ state: url.searchParams.get("state"), code: "resume-code" });
  assert.equal(completed.nextStep, "verify-sign-in");
});

test("owner operator atomically binds the exact target principal and advances recovery authority", async () => {
  const authority = binding();
  const initial = createOwnerCeremonyState(authority);
  const queries = [];
  let released = false;
  const client = { async query(sql, parameters = []) {
    queries.push({ sql: String(sql).replace(/\s+/g, " ").trim(), parameters });
    if (String(sql).includes("count(*)")) return { rows: [{ count: 0 }] };
    if (String(sql).includes("SELECT state_json")) return { rows: [{ state_json: initial }] };
    if (String(sql).includes("UPDATE gate6c.owner_ceremonies")) return { rowCount: 1, rows: [] };
    return { rowCount: 1, rows: [] };
  }, release() { released = true; } };
  const result = await bindOwnerAndVerifyRecoveryAuthority({ pool: { async connect() { return client; } },
    binding: authority, subject: "11111111-1111-4111-8111-111111111111",
    observedAt: NOW.toISOString(), operationId: "control-recovery-authority-123456abcdef",
    advanceOwnerCeremony, digestEvidence, bindingDigest });
  assert.deepEqual(result, { schemaVersion: "runa2-gate6c-owner-authority-result/v1", passed: true,
    principalId: "matthew-owner", ceremonyRevision: 1, nextStep: "enroll-primary-credential",
    privateValuesIncluded: false });
  assert.equal(queries[0].sql, "BEGIN ISOLATION LEVEL SERIALIZABLE");
  assert.equal(queries.at(-1).sql, "COMMIT");
  assert.deepEqual(queries.find(item => item.sql.startsWith("INSERT INTO gate5.principals")).parameters,
    ["matthew-owner", "11111111-1111-4111-8111-111111111111"]);
  assert.equal(JSON.parse(queries.find(item => item.sql.startsWith("UPDATE gate6c.owner_ceremonies")).parameters[1]).revision, 1);
  assert.equal(released, true);
});

test("owner operator rolls back when the target principal store is no longer empty", async () => {
  const queries = [];
  let released = false;
  const client = { async query(sql) {
    queries.push(String(sql).replace(/\s+/g, " ").trim());
    if (String(sql).includes("count(*)")) return { rows: [{ count: 1 }] };
    return { rows: [], rowCount: 0 };
  }, release() { released = true; } };
  await assert.rejects(bindOwnerAndVerifyRecoveryAuthority({ pool: { async connect() { return client; } },
    binding: binding(), subject: "11111111-1111-4111-8111-111111111111",
    observedAt: NOW.toISOString(), operationId: "control-recovery-authority-123456abcdef",
    advanceOwnerCeremony, digestEvidence, bindingDigest }), { code: "gate6c-owner-principal-state-changed" });
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.equal(released, true);
});

test("owner rebind retains the failed-IP audit row and advances only the corrected ceremony", async () => {
  const priorBinding = binding();
  const correctedBinding = { ...binding(), releaseId: "runaai-next-gate6c-localhost" };
  const priorState = advanceOwnerCeremony(createOwnerCeremonyState(priorBinding), {
    operationId: "prior-authority", command: "verify-recovery-authority",
    evidence: { passed: true, evidenceDigest: digestEvidence({ prior: true }) }, observedAt: NOW.toISOString() });
  const currentState = createOwnerCeremonyState(correctedBinding);
  const priorDigest = bindingDigest(priorBinding); const correctedDigest = bindingDigest(correctedBinding);
  const queries = []; let released = false;
  const client = { async query(sql, parameters = []) {
    queries.push({ sql: String(sql).replace(/\s+/g, " ").trim(), parameters });
    if (String(sql).includes("FROM gate5.principals")) return { rows: [{
      oidc_subject: "11111111-1111-4111-8111-111111111111", role: "primary-steward",
      age_class: "adult", status: "active", record_version: 1 }] };
    if (String(sql).includes("FROM gate6c.owner_ceremonies")) return { rows: [
      { binding_digest: priorDigest, state_json: priorState },
      { binding_digest: correctedDigest, state_json: currentState }] };
    if (String(sql).includes("UPDATE gate6c.owner_ceremonies")) return { rowCount: 1, rows: [] };
    return { rows: [], rowCount: 1 };
  }, release() { released = true; } };
  const result = await rebindOwnerRecoveryAuthority({ pool: { async connect() { return client; } },
    priorBinding, binding: correctedBinding, subject: "11111111-1111-4111-8111-111111111111",
    reason: "webauthn-rp-domain-correction",
    observedAt: NOW.toISOString(), operationId: "control-owner-rebind-123456abcdef",
    advanceOwnerCeremony, digestEvidence, bindingDigest });
  assert.deepEqual(result, { schemaVersion: "runa2-gate6c-owner-rebind-result/v1", passed: true,
    priorCeremonyRetained: true, ceremonyRevision: 1, nextStep: "enroll-primary-credential",
    privateValuesIncluded: false });
  const update = queries.find(item => item.sql.startsWith("UPDATE gate6c.owner_ceremonies"));
  assert.equal(update.parameters[0], correctedDigest);
  assert.equal(JSON.parse(update.parameters[1]).revision, 1);
  assert.equal(queries.at(-1).sql, "COMMIT"); assert.equal(released, true);
});

test("owner rebind rolls back if both exact ceremony rows are not retained", async () => {
  const priorBinding = binding(); const correctedBinding = { ...binding(), releaseId: "corrected-release" };
  const queries = []; let released = false;
  const client = { async query(sql) {
    queries.push(String(sql).replace(/\s+/g, " ").trim());
    if (String(sql).includes("FROM gate5.principals")) return { rows: [{
      oidc_subject: "11111111-1111-4111-8111-111111111111", role: "primary-steward",
      age_class: "adult", status: "active", record_version: 1 }] };
    if (String(sql).includes("FROM gate6c.owner_ceremonies")) return { rows: [] };
    return { rows: [], rowCount: 0 };
  }, release() { released = true; } };
  await assert.rejects(rebindOwnerRecoveryAuthority({ pool: { async connect() { return client; } },
    priorBinding, binding: correctedBinding, subject: "11111111-1111-4111-8111-111111111111",
    reason: "webauthn-rp-domain-correction",
    observedAt: NOW.toISOString(), operationId: "control-owner-rebind-123456abcdef",
    advanceOwnerCeremony, digestEvidence, bindingDigest }), { code: "gate6c-owner-rebind-ceremony-missing" });
  assert.equal(queries.at(-1), "ROLLBACK"); assert.equal(released, true);
});

test("completed owner rebind preserves completion without promoting the candidate", async () => {
  const priorBinding = binding();
  const nextBinding = { ...binding(), releaseId: "runaai-next-readiness-release",
    releaseCommit: "e".repeat(40), artifactDigest: "f".repeat(64) };
  const priorState = ceremony(priorBinding); const currentState = createOwnerCeremonyState(nextBinding);
  const priorDigest = bindingDigest(priorBinding); const nextDigest = bindingDigest(nextBinding);
  const queries = []; let released = false;
  const client = { async query(sql, parameters = []) {
    queries.push({ sql: String(sql).replace(/\s+/g, " ").trim(), parameters });
    if (String(sql).includes("FROM gate5.principals")) return { rows: [{
      oidc_subject: "11111111-1111-4111-8111-111111111111", role: "primary-steward",
      age_class: "adult", status: "active", record_version: 1 }] };
    if (String(sql).includes("FROM gate6c.owner_ceremonies")) return { rows: [
      { binding_digest: priorDigest, state_json: priorState },
      { binding_digest: nextDigest, state_json: currentState }] };
    return { rows: [], rowCount: 1 };
  }, release() { released = true; } };
  const result = await rebindCompletedOwnerCeremony({ pool: { async connect() { return client; } },
    priorBinding, binding: nextBinding, subject: "11111111-1111-4111-8111-111111111111",
    reason: "completed-owner-readiness-release", observedAt: NOW.toISOString(),
    operationId: "control-completed-owner-rebind-123456abcdef",
    assertOwnerCeremonyComplete, bindingDigest });
  assert.equal(result.ceremonyComplete, true);
  assert.equal(result.candidatePromoted, false);
  const update = queries.find(item => item.sql.startsWith("UPDATE gate6c.owner_ceremonies"));
  assert.equal(update.parameters[0], nextDigest);
  assertOwnerCeremonyComplete(JSON.parse(update.parameters[1]), nextBinding);
  assert.equal(queries.at(-1).sql, "COMMIT");
  assert.equal(released, true);
});
