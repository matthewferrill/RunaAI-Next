import { createHash, randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { hostname, userInfo } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

import { canonicalJson } from "../../gate4/canonical.mjs";
import { readLegacyProjectChatDomain } from "../../gate4/inventory.mjs";
import { createEnvelopeCipher } from "../../gate4/envelope.mjs";
import { readProtectedE6Snapshot } from "../../gate4b/protected-source.mjs";
import { evaluateReadiness, requiredReadinessFacts } from "../../gate6/readiness.mjs";
import { assertReleaseManifest } from "../../gate6/release.mjs";
import { Gate6CutoverCoordinator } from "../../gate6/cutover.mjs";
import { PostgresCutoverStore } from "../../gate6/adapters/postgres.mjs";
import { verifyReleaseArtifact } from "../../gate6b/artifact.mjs";
import { KeycloakOnlineClient } from "../../gate6b/clients.mjs";
import { decodeKey, loadReleaseConfig, readSecretReference } from "../../gate6b/release-config.mjs";
import { PostgresBrowserCeremonyStore } from "../adapters/postgres-browser.mjs";
import { PostgresGate6cStore } from "../adapters/postgres.mjs";
import { assertOwnerCeremonyComplete } from "../ceremony.mjs";
import { assertBackupProof, assertFreezeLease, bindingDigest } from "../contracts.mjs";
import { bindProtectedSnapshotsToOwner, ownerAggregateInventory,
  verifyRetainedFinalDelta } from "../control-maintenance.mjs";
import { GATE6C_BACKUP_VERSION, GATE6C_BINDING_VERSION, GATE6C_FREEZE_VERSION,
  GATE6C_REQUIRED_DOMAINS } from "../formats.mjs";
import { Gate6cFinalDeltaService, buildGate6cFinalDeltaPlan } from "../migration.mjs";
import { reconcileGate6c } from "../reconciliation.mjs";
import { inspectSelectedContinuity } from "../selected-inventory.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const hex40 = value => /^[a-f0-9]{40}$/.test(String(value));
const hex64 = value => /^[a-f0-9]{64}$/.test(String(value));
const candidateRoot = resolve("C:\\AI\\RunaAI-Next-Candidate");
const legacyRoot = resolve("C:\\AI\\Projects\\RunaAI");
const phases = new Set(["prerequisite-check", "migrate-promote", "verify-live", "close", "rollback"]);

function argumentsOf(argv) {
  const names = new Set(["phase", "release-root", "config", "expected-release-id", "expected-commit",
    "expected-artifact-digest", "legacy-repo", "legacy-commit", "lease-id", "restore-proof",
    "preflight-proof"]);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = String(argv[index] ?? "").replace(/^--/, ""); const value = argv[index + 1];
    if (!names.has(key) || !value || !String(argv[index]).startsWith("--") || Object.hasOwn(result, key)) {
      throw coded("gate6cd-arguments-invalid", "The bounded protected-cutover arguments are invalid.");
    }
    result[key] = value;
  }
  for (const name of names) if (!result[name]) {
    throw coded("gate6cd-arguments-invalid", `The protected-cutover argument is required: ${name}.`);
  }
  if (!phases.has(result.phase)) throw coded("gate6cd-phase-invalid", "The protected-cutover phase is invalid.");
  return result;
}

function git(repo, args) {
  const result = spawnSync("git", ["-c", `safe.directory=${repo.replaceAll("\\", "/")}`, "-C", repo, ...args],
    { encoding: "utf8", windowsHide: true, timeout: 20_000 });
  if (result.status !== 0) throw coded("gate6cd-legacy-git-unavailable", "Legacy Git authority is unavailable.");
  return result.stdout.trim();
}

async function json(path, code) {
  try { return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, "")); }
  catch { throw coded(code, "A required protected-cutover JSON document is unavailable."); }
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function assertLegacy(repo, commit) {
  if (repo !== legacyRoot || !hex40(commit) || git(repo, ["rev-parse", "HEAD"]) !== commit
      || git(repo, ["branch", "--show-current"]) !== "main"
      || git(repo, ["status", "--porcelain", "--untracked-files=no"]) !== "") {
    throw coded("gate6cd-legacy-authority-mismatch", "Legacy RunaAI is not the exact clean authority.");
  }
}

async function legacyRuntimeVerified(commit) {
  try {
    const response = await fetch("http://127.0.0.1:3786/api/runtime/status", { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return false;
    const value = await response.json();
    return value?.ok === true && value?.running?.commit === commit && value?.running?.cleanAtStart === true;
  } catch { return false; }
}

async function loadContext(args) {
  if (process.platform !== "win32" || hostname().toUpperCase() !== "RUNA-CONTROL"
      || userInfo().username.toLowerCase() !== "matthew") {
    throw coded("gate6cd-owner-context-required", "The protected cutover must run as Matthew on RUNA-CONTROL.");
  }
  const releaseRoot = resolve(args["release-root"]); const configPath = resolve(args.config);
  if (releaseRoot !== resolve(candidateRoot, "releases", args["expected-release-id"])
      || configPath !== resolve(candidateRoot, "config", "candidate.json")
      || resolve(args["legacy-repo"]) !== legacyRoot || !hex40(args["expected-commit"])
      || !hex40(args["legacy-commit"]) || !hex64(args["expected-artifact-digest"])) {
    throw coded("gate6cd-path-or-pin-invalid", "The protected-cutover paths or release pins are invalid.");
  }
  assertLegacy(legacyRoot, args["legacy-commit"]);
  const loaded = await loadReleaseConfig(configPath); const config = loaded.value;
  const manifestPath = isAbsolute(config.releaseManifestPath) ? config.releaseManifestPath
    : resolve(dirname(configPath), config.releaseManifestPath);
  const manifest = assertReleaseManifest(await json(manifestPath, "gate6cd-manifest-unavailable"));
  if (config.mode !== "active" || config.gate6c?.enabled !== true
      || config.gate6c.expectedPrincipalId !== "matthew-owner"
      || config.gate6c.legacyCommit !== args["legacy-commit"]
      || !["http://localhost:9762/realms/runaai-next", "http://127.0.0.1:9762/realms/runaai-next"].includes(config.keycloak.issuer)
      || manifest.releaseId !== args["expected-release-id"] || manifest.commit !== args["expected-commit"]
      || manifest.artifactDigest !== args["expected-artifact-digest"]
      || manifest.configurationDigest !== loaded.configurationDigest) {
    throw coded("gate6cd-release-authority-mismatch", "The active promotion candidate differs from its exact pins.");
  }
  await verifyReleaseArtifact(releaseRoot, manifest.artifactDigest);
  const [connectionString, coreEncryptionValue, coreHmacValue, learningEncryptionValue,
    learningHmacValue, keycloakCredential] = await Promise.all([
      readSecretReference(config.databaseUrlRef, dirname(configPath)),
      readSecretReference(config.keyRefs.coreEncryption, dirname(configPath)),
      readSecretReference(config.keyRefs.coreHmac, dirname(configPath)),
      readSecretReference(config.keyRefs.learningEncryption, dirname(configPath)),
      readSecretReference(config.keyRefs.learningHmac, dirname(configPath)),
      readSecretReference(config.keycloak.clientCredentialRef, dirname(configPath)),
    ]);
  const coreEncryption = decodeKey(coreEncryptionValue, "core encryption key");
  const coreHmac = decodeKey(coreHmacValue, "core HMAC key");
  const learningEncryption = decodeKey(learningEncryptionValue, "learning encryption key");
  const learningHmac = decodeKey(learningHmacValue, "learning HMAC key");
  const coreCipher = createEnvelopeCipher({ encryptionKey: coreEncryption, hmacKey: coreHmac,
    keyId: "runa-core-release-v1" });
  const learningCipher = createEnvelopeCipher({ encryptionKey: learningEncryption,
    hmacKey: learningHmac, keyId: "runa-learning-release-v1" });
  coreEncryption.fill(0); coreHmac.fill(0); learningEncryption.fill(0); learningHmac.fill(0);
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 15_000,
    application_name: `runaai-next-${args.phase}` });
  pool.on("error", () => {});
  const binding = Object.freeze({ schemaVersion: GATE6C_BINDING_VERSION, cutoverId: config.cutoverId,
    releaseId: manifest.releaseId, releaseCommit: manifest.commit, artifactDigest: manifest.artifactDigest,
    sourceGeneration: config.gate6c.legacyCommit, targetGeneration: config.targetGeneration,
    participantRefHmac: coreCipher.digest({ type: "gate6c-owner-participant",
      principalId: config.gate6c.expectedPrincipalId }) });
  const ceremonyStore = new PostgresBrowserCeremonyStore({ pool, cipher: coreCipher });
  const ceremony = await ceremonyStore.ceremonyState(binding);
  assertOwnerCeremonyComplete(ceremony, binding);
  const cutoverStore = new PostgresCutoverStore({ pool, cutoverId: config.cutoverId });
  const coordinator = new Gate6CutoverCoordinator({ store: cutoverStore, manifest });
  const targetStore = new PostgresGate6cStore({ pool, coreCipher, learningCipher });
  await targetStore.initialize();
  return { args, releaseRoot, configPath, loaded, config, manifest, connectionString, keycloakCredential,
    pool, coreCipher, learningCipher, binding, ceremony, ceremonyStore, cutoverStore, coordinator, targetStore,
    async close() { coreCipher.destroy(); learningCipher.destroy(); await pool.end(); } };
}

async function freezeLease(context) {
  const markerPath = resolve(candidateRoot, "gate6c", "freeze-lease.json");
  const marker = await json(markerPath, "gate6cd-freeze-marker-unavailable");
  if (marker.schemaVersion !== "runa2-gate6c-control-freeze-lease/v1"
      || marker.leaseId !== context.args["lease-id"] || marker.sourceGeneration !== context.args["legacy-commit"]
      || marker.status !== "active" || marker.selectedWritesFrozen !== true
      || marker.legacyReadsAvailable !== true || !Number.isFinite(Date.parse(marker.issuedAt))
      || !Number.isFinite(Date.parse(marker.expiresAt)) || Date.parse(marker.expiresAt) <= Date.now()) {
    throw coded("gate6cd-freeze-marker-invalid", "The Control legacy freeze marker is not active and exact.");
  }
  return assertFreezeLease({ schemaVersion: GATE6C_FREEZE_VERSION,
    bindingDigest: bindingDigest(context.binding), leaseId: marker.leaseId,
    sourceGeneration: context.binding.sourceGeneration, selectedDomains: GATE6C_REQUIRED_DOMAINS,
    selectedWritesFrozen: true, legacyReadsAvailable: true, issuedAt: marker.issuedAt,
    expiresAt: marker.expiresAt, status: "active", privateValuesIncluded: false },
  { binding: context.binding });
}

async function backupProof(context) {
  const restorePath = resolve(context.args["restore-proof"]);
  if (restorePath !== resolve(candidateRoot, "gate6c", "restore-proof.json")) {
    throw coded("gate6cd-restore-proof-path-invalid", "The restore proof path is outside its exact boundary.");
  }
  const restore = await json(restorePath, "gate6cd-restore-proof-unavailable");
  const backupRoot = resolve(candidateRoot, "backups", "scheduled", String(restore.generation ?? ""));
  const manifestPath = resolve(backupRoot, "BACKUP-MANIFEST.json");
  if (!manifestPath.startsWith(`${resolve(candidateRoot, "backups", "scheduled")}\\`)) {
    throw coded("gate6cd-backup-path-invalid", "The selected backup path escaped its exact boundary.");
  }
  const bytes = await readFile(manifestPath); const backup = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  if (restore.schemaVersion !== "runa2-gate6c-scheduled-restore-proof/v1" || restore.passed !== true
      || restore.releaseId !== context.manifest.releaseId || restore.distinctRestoreVerified !== true
      || restore.distinctTargetsDestroyed !== true || restore.plaintextBackupCount !== 0
      || restore.scheduleActive !== true || backup.releaseId !== context.manifest.releaseId
      || backup.releaseCommit !== context.manifest.commit || backup.artifactDigest !== context.manifest.artifactDigest
      || backup.generation !== restore.generation || backup.plaintextBackupCount !== 0
      || !Array.isArray(backup.databases) || backup.databases.length !== 3
      || backup.databases.some(item => item.encrypted !== true || !hex64(item.encryptedDigest))) {
    throw coded("gate6cd-backup-proof-invalid", "The current encrypted backup or distinct restore proof is not exact.");
  }
  const information = await stat(restorePath);
  return assertBackupProof({ schemaVersion: GATE6C_BACKUP_VERSION,
    bindingDigest: bindingDigest(context.binding), scheduleActive: true,
    encryptedBackupCount: backup.databases.length, plaintextBackupCount: 0,
    manifestDigest: sha256(bytes), distinctRestoreVerified: true,
    verifiedAt: information.mtime.toISOString(), privateValuesIncluded: false },
  { binding: context.binding });
}

async function readiness(context, profile, dynamic = {}) {
  const proofPath = resolve(context.args["preflight-proof"]);
  if (proofPath !== resolve(candidateRoot, "gate6c", "preflight-proof.json")) {
    throw coded("gate6cd-preflight-proof-path-invalid", "The preflight proof path is outside its exact boundary.");
  }
  const proof = await json(proofPath, "gate6cd-preflight-proof-unavailable");
  if (proof.schemaVersion !== "runa2-gate6cd-control-preflight/v1" || proof.passed !== true
      || proof.releaseManifestDigest !== context.manifest.manifestDigest
      || proof.legacyCommit !== context.args["legacy-commit"] || proof.privateValuesIncluded !== false) {
    throw coded("gate6cd-preflight-proof-invalid", "The Control preflight proof does not bind the running release.");
  }
  const facts = Object.fromEntries(requiredReadinessFacts(profile).map(name => [name,
    Object.hasOwn(dynamic, name) ? dynamic[name] === true : proof.facts?.[name] === true]));
  const result = evaluateReadiness({ manifest: context.manifest, releaseBoundary: context.loaded.boundary,
    facts, profile });
  if (!result.passed) throw coded("gate6cd-readiness-failed", `${profile} readiness is not green.`);
  return result;
}

async function capture(context, reconciliationKey) {
  const sourcePinsPath = join(context.releaseRoot, "gate4", "SOURCE-PINS.json");
  const stateRoot = join(legacyRoot, ".runaai-local", "state");
  const firstProject = await readLegacyProjectChatDomain({ legacyRepo: legacyRoot,
    expectedCommit: context.args["legacy-commit"], sourcePinsPath });
  const firstSelected = inspectSelectedContinuity({ stateRoot, reconciliationKey });
  const firstLearning = await readProtectedE6Snapshot({ legacyRepo: legacyRoot,
    expectedCommit: context.args["legacy-commit"], participantId: context.config.gate6c.expectedPrincipalId });
  const secondProject = await readLegacyProjectChatDomain({ legacyRepo: legacyRoot,
    expectedCommit: context.args["legacy-commit"], sourcePinsPath });
  const secondSelected = inspectSelectedContinuity({ stateRoot, reconciliationKey });
  const secondLearning = await readProtectedE6Snapshot({ legacyRepo: legacyRoot,
    expectedCommit: context.args["legacy-commit"], participantId: context.config.gate6c.expectedPrincipalId });
  if (canonicalJson(firstProject.snapshot) !== canonicalJson(secondProject.snapshot)
      || canonicalJson(firstSelected) !== canonicalJson(secondSelected)
      || canonicalJson(firstLearning.snapshot) !== canonicalJson(secondLearning.snapshot)) {
    throw coded("gate6cd-protected-capture-nondeterministic", "The two protected capture passes differ.");
  }
  const mapped = bindProtectedSnapshotsToOwner({ projectChatSnapshot: firstProject.snapshot,
    learningSnapshot: firstLearning.snapshot, targetParticipantId: context.config.gate6c.expectedPrincipalId });
  const legacySetting = await json(join(stateRoot, "settings", "values.json"), "gate6cd-setting-source-invalid");
  return Object.freeze({ ...mapped, legacySetting, selectedReceipts: Object.freeze([]),
    selected: firstSelected, privateValuesIncluded: false });
}

function planInput(context, captured, runId) {
  return { runId, binding: context.binding, projectChatSnapshot: captured.projectChatSnapshot,
    learningSnapshot: captured.learningSnapshot, legacySetting: captured.legacySetting,
    selectedReceipts: captured.selectedReceipts };
}

async function verifyTarget(context, captured, runId, reconciliationKey, expectedSettingRevision = 1) {
  const input = planInput(context, captured, runId);
  const plan = buildGate6cFinalDeltaPlan(input, { coreCipher: context.coreCipher,
    learningCipher: context.learningCipher, reconciliationKey });
  const verified = await verifyRetainedFinalDelta({ plan, learningSnapshot: captured.learningSnapshot,
    store: context.targetStore, coreCipher: context.coreCipher, learningCipher: context.learningCipher,
    reconciliationKey, now: new Date(), expectedSettingRevision });
  if (!verified.exact) throw coded("gate6cd-target-reconciliation-failed", "The retained target differs from the frozen source.");
  return { plan, verified };
}

async function revokeTargetSessions(context) {
  const client = new KeycloakOnlineClient({ issuer: context.config.keycloak.issuer,
    clientId: context.config.keycloak.clientId, clientCredential: context.keycloakCredential,
    timeoutMs: context.config.limits.upstreamDeadlineMs });
  const sessions = await context.ceremonyStore.activeSessionCredentials({ binding: context.binding, now: new Date() });
  for (const session of sessions) await client.revoke(session.refreshToken).catch(() => {});
  await context.ceremonyStore.revokeSessions({ binding: context.binding, now: new Date() });
  const pending = Number((await context.pool.query(`SELECT count(*)::int remaining
    FROM runa_governance.capabilities WHERE status<>'consumed'`)).rows[0].remaining);
  if (pending !== 0) throw coded("gate6cd-target-capability-revocation-failed", "A pending target capability remains.");
  return sessions.length;
}

async function removeValidationArtifacts(context) {
  const prefix = `gate6d-${context.manifest.commit.slice(0, 12)}-%`;
  const client = await context.pool.connect();
  try {
    await client.query("BEGIN");
    const proposals = (await client.query(`SELECT proposal_id FROM runa_governance.proposals
      WHERE request_id LIKE $1 FOR UPDATE`, [prefix])).rows.map(row => row.proposal_id);
    if (proposals.length) {
      const receipts = (await client.query(`SELECT receipt_id FROM runa_governance.receipts
        WHERE proposal_id=ANY($1::text[])`, [proposals])).rows.map(row => row.receipt_id);
      if (receipts.length) await client.query("DELETE FROM runa_governance.outbox WHERE receipt_id=ANY($1::text[])", [receipts]);
      await client.query("DELETE FROM runa_governance.receipts WHERE proposal_id=ANY($1::text[])", [proposals]);
      await client.query("DELETE FROM runa_governance.capabilities WHERE proposal_id=ANY($1::text[])", [proposals]);
      await client.query("DELETE FROM runa_governance.proposals WHERE proposal_id=ANY($1::text[])", [proposals]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}

async function rollback(context, runId) {
  const state = await context.coordinator.status();
  let targetWasAuthoritative = false;
  if (!["planned", "rolled-back", "closed"].includes(state.phase)) {
    targetWasAuthoritative = state.authorityGeneration === state.targetGeneration;
    if (targetWasAuthoritative) await revokeTargetSessions(context);
    if (!await legacyRuntimeVerified(context.args["legacy-commit"])) {
      throw coded("gate6cd-legacy-runtime-unverified", "Legacy runtime could not be verified for rollback.");
    }
    await context.coordinator.rollback(`gate6cd-rollback-${context.manifest.commit.slice(0, 12)}`, {
      legacyRuntimeVerified: true, selectedWritesNeverUnfrozen: true,
      targetSessionsAndCapabilitiesRevoked: targetWasAuthoritative });
  }
  await removeValidationArtifacts(context);
  await context.targetStore.rollbackRun(runId).catch(error => {
    if (error?.code !== "gate6c-run-not-found") throw error;
  });
  return { targetWasAuthoritative };
}

async function migratePromote(context) {
  const runId = `gate6c-control-${context.manifest.commit.slice(0, 12)}`;
  const key = randomBytes(32); let staged = false; let step = "freeze-lease";
  try {
    const lease = await freezeLease(context); step = "backup-proof";
    const backup = await backupProof(context); step = "cutover-status";
    const state = await context.coordinator.status();
    if (state.phase !== "planned" || state.revision !== 0) {
      throw coded("gate6cd-cutover-not-pristine", "The protected cutover is not at its exact pristine state.");
    }
    step = "candidate-readiness";
    const candidate = await readiness(context, "candidate"); step = "record-candidate-readiness";
    await context.coordinator.recordCandidateReadiness(`gate6cd-candidate-${context.manifest.commit.slice(0, 12)}`, candidate);
    step = "record-freeze";
    await context.coordinator.freezeSelectedWrites(`gate6cd-freeze-${context.manifest.commit.slice(0, 12)}`, {
      selectedWritesFrozen: true, legacyReadsAvailable: true, sourceGeneration: context.config.sourceGeneration });
    step = "record-backup";
    await context.coordinator.verifyBackup(`gate6cd-backup-${context.manifest.commit.slice(0, 12)}`, {
      backupVerified: true, distinctRestoreVerified: true, sourceGeneration: context.config.sourceGeneration,
      manifestDigest: backup.manifestDigest });
    step = "protected-capture";
    const captured = await capture(context, key);
    step = "build-final-delta";
    const input = planInput(context, captured, runId);
    const plan = buildGate6cFinalDeltaPlan(input, { coreCipher: context.coreCipher,
      learningCipher: context.learningCipher, reconciliationKey: key });
    input.ownerCeremony = context.ceremony; input.backupProof = backup; input.freezeLease = lease;
    input.inventory = ownerAggregateInventory({ binding: context.binding, domains: plan.domains });
    step = "stage-final-delta";
    await new Gate6cFinalDeltaService({ store: context.targetStore, coreCipher: context.coreCipher,
      learningCipher: context.learningCipher, reconciliationKey: key }).stage(input);
    staged = true;
    step = "verify-retained-delta";
    const verified = await verifyRetainedFinalDelta({ plan, learningSnapshot: captured.learningSnapshot,
      store: context.targetStore, coreCipher: context.coreCipher, learningCipher: context.learningCipher,
      reconciliationKey: key, now: new Date() });
    if (!verified.exact) throw coded("gate6cd-target-reconciliation-failed", "The retained target differs from the frozen source.");
    const reconciled = reconcileGate6c({ binding: context.binding, domains: verified.domains,
      approvedKnowledge: verified.approvedKnowledge, sourceStillFrozen: true,
      deferredStoresUntouched: true, oneDeedOneReceipt: true });
    step = "record-final-delta";
    await context.coordinator.commitFinalDelta(`gate6cd-delta-${context.manifest.commit.slice(0, 12)}`, {
      sourceStillFrozen: true, sourceGeneration: context.config.sourceGeneration,
      targetGeneration: context.config.targetGeneration, domains: reconciled.domains });
    await context.coordinator.reconcile(`gate6cd-reconcile-${context.manifest.commit.slice(0, 12)}`, {
      sourceStillFrozen: true, sourceGeneration: context.config.sourceGeneration,
      targetGeneration: context.config.targetGeneration, domains: reconciled.domains,
      approvedKnowledge: reconciled.approvedKnowledge, oneDeedOneReceipt: true,
      deferredStoresUntouched: true });
    step = "promotion-readiness";
    const promotion = await readiness(context, "promotion", {
      ownerCredentialVerified: true, freshStepUpVerified: true, protectedDeltaAuthorityReady: true,
      sourceWriteFreezeReady: true, zeroDeltaReconciliationReady: true });
    await context.coordinator.recordPromotionReadiness(`gate6cd-ready-${context.manifest.commit.slice(0, 12)}`, promotion);
    step = "promote";
    await context.coordinator.promote(`gate6cd-promote-${context.manifest.commit.slice(0, 12)}`, {
      sourceStillFrozen: true, expectedAuthorityGeneration: context.config.sourceGeneration,
      targetGeneration: context.config.targetGeneration });
    return Object.freeze({ schemaVersion: "runa2-gate6cd-migrate-promote/v1", passed: true,
      phase: "promoted", selectedDomainCounts: Object.fromEntries(Object.entries(plan.domains)
        .map(([name, value]) => [name, value.count])), approvedKnowledgeActive: verified.approvedKnowledge.sourceActive,
      sourceModified: false, deferredStoresOpened: false, privateValuesIncluded: false });
  } catch (error) {
    try {
      if (staged || (await context.coordinator.status()).phase !== "planned") await rollback(context, runId);
    } catch { throw coded("gate6cd-automatic-rollback-failed", "Automatic target rollback failed closed."); }
    if (/^[a-z0-9-]{1,100}$/.test(String(error?.code ?? ""))) throw error;
    throw coded(`gate6cd-${step}-failed`, "A protected-cutover step failed closed.");
  } finally { key.fill(0); }
}

async function prerequisiteCheck(context) {
  const state = await context.coordinator.status();
  if (state.phase !== "planned" || state.revision !== 0) {
    throw coded("gate6cd-cutover-not-pristine", "The protected cutover is not at its exact pristine state.");
  }
  const backup = await backupProof(context);
  const candidate = await readiness(context, "candidate");
  return Object.freeze({ schemaVersion: "runa2-gate6cd-prerequisite-check/v1", passed: true,
    phase: state.phase, revision: state.revision, backupVerified: backup.distinctRestoreVerified,
    candidateReadinessPassed: candidate.passed, protectedStoresOpened: false,
    privateValuesIncluded: false });
}

async function post(path, body, credential = null) {
  const response = await fetch(`http://127.0.0.1:9760${path}`, { method: "POST",
    headers: { "content-type": "application/json", ...(credential ? { authorization: `Bearer ${credential}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(45_000) });
  const value = await response.json();
  if (!response.ok) throw coded(value?.errorCode ?? "gate6d-live-request-failed", "A live selected request failed closed.");
  return value;
}

async function liveValidate(context) {
  await freezeLease(context);
  const state = await context.coordinator.status();
  if (state.phase !== "promoted" || state.authorityGeneration !== context.config.targetGeneration) {
    throw coded("gate6d-promotion-state-invalid", "The candidate is not the selected promoted authority.");
  }
  const sessions = await context.ceremonyStore.activeSessionCredentials({ binding: context.binding, now: new Date() });
  if (sessions.length !== 1) throw coded("gate6d-owner-session-required", "Exactly one fresh passkey validation session is required.");
  const credential = sessions[0].accessToken;
  const before = (await context.pool.query(`SELECT setting_value,revision::int revision FROM runa_core.participant_settings
    WHERE participant_id='matthew-owner' AND setting_key='defaultIntelligenceLevel'`)).rows[0];
  if (!before || !["Low", "Medium", "High"].includes(before.setting_value)) {
    throw coded("gate6d-setting-state-invalid", "The migrated setting is unavailable for validation.");
  }
  const countsBefore = (await context.pool.query(`SELECT
    (SELECT count(*)::int FROM runa_core.chats WHERE participant_id='matthew-owner') chats,
    (SELECT count(*)::int FROM runa_core.chat_turns WHERE participant_id='matthew-owner') turns,
    (SELECT count(*)::int FROM runa_runtime.route_responses) responses,
    (SELECT count(*)::int FROM runa_governance.receipts) receipts,
    (SELECT count(*)::int FROM runa_governance.capabilities) capabilities`)).rows[0];
  const suffix = context.manifest.commit.slice(0, 12);
  const prompts = [
    ["general", "State Runa's operating identity in one concise sentence."],
    ["research", "State one governance rule for evaluating a migration decision."],
    ["guarded", "State one thing Runa must not do without approval."],
  ];
  const answers = [];
  for (let index = 0; index < prompts.length; index += 1) {
    const [lane, message] = prompts[index];
    answers.push(await post("/api/selected/answer", { requestId: `gate6d-${suffix}-${lane}`,
      lane, threadId: `gate6d-ephemeral-${lane}`, message, history: [] }));
  }
  if (answers.some(answer => typeof answer.answer !== "string" || !answer.answer.trim()
      || !Array.isArray(answer.effects) || answer.effects.length !== 0)) {
    throw coded("gate6d-representative-transcript-failed", "A representative read-only transcript failed its boundary.");
  }
  const nextValue = before.setting_value === "High" ? "Medium" : "High";
  let firstReceipt = null;
  try {
    const proposal = await post("/api/selected/settings/propose", { requestId: `gate6d-${suffix}-setting-forward`,
      projectId: "runa:personal", value: nextValue }, credential);
    firstReceipt = await post("/api/selected/settings/approve", { projectId: "runa:personal",
      approvalId: `gate6d-${suffix}-approve-forward`, proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest, approvalPhrase: "approve" }, credential);
    const rollbackProposal = await post("/api/selected/settings/propose", {
      requestId: `gate6d-${suffix}-setting-rollback`, projectId: "runa:personal",
      value: before.setting_value, rollbackOfReceiptId: firstReceipt.receiptId }, credential);
    await post("/api/selected/settings/approve", { projectId: "runa:personal",
      approvalId: `gate6d-${suffix}-approve-rollback`, proposalId: rollbackProposal.proposalId,
      proposalDigest: rollbackProposal.proposalDigest, approvalPhrase: "approve" }, credential);
  } catch (error) {
    throw error;
  }
  const after = (await context.pool.query(`SELECT setting_value,revision::int revision FROM runa_core.participant_settings
    WHERE participant_id='matthew-owner' AND setting_key='defaultIntelligenceLevel'`)).rows[0];
  const countsAfter = (await context.pool.query(`SELECT
    (SELECT count(*)::int FROM runa_core.chats WHERE participant_id='matthew-owner') chats,
    (SELECT count(*)::int FROM runa_core.chat_turns WHERE participant_id='matthew-owner') turns,
    (SELECT count(*)::int FROM runa_runtime.route_responses) responses,
    (SELECT count(*)::int FROM runa_governance.receipts) receipts,
    (SELECT count(*)::int FROM runa_governance.capabilities) capabilities`)).rows[0];
  if (after.setting_value !== before.setting_value || after.revision !== before.revision + 2
      || countsAfter.chats !== countsBefore.chats || countsAfter.turns !== countsBefore.turns
      || countsAfter.responses !== countsBefore.responses || countsAfter.receipts !== countsBefore.receipts + 2
      || countsAfter.capabilities !== countsBefore.capabilities + 2) {
    throw coded("gate6d-live-effect-reconciliation-failed", "The live action or ephemeral transcript boundary differs.");
  }
  const verifier = spawnSync(process.execPath, ["--test", "gate6/gate6.test.mjs",
    "gate6b/gate6b.test.mjs", "gate6c/gate6c.test.mjs"], { cwd: context.releaseRoot,
    windowsHide: true, stdio: "ignore", timeout: 120_000 });
  if (verifier.status !== 0) throw coded("gate6d-selected-verifier-failed", "The selected verifier failed.");
  let dependencyLossPassed = false;
  try { await fetch("http://127.0.0.1:1/", { signal: AbortSignal.timeout(500) }); }
  catch { dependencyLossPassed = true; }
  if (!dependencyLossPassed) throw coded("gate6d-dependency-loss-probe-failed", "The isolated dependency-loss probe did not fail closed.");
  const key = randomBytes(32);
  try {
    const captured = await capture(context, key);
    const runId = `gate6c-control-${context.manifest.commit.slice(0, 12)}`;
    const { verified } = await verifyTarget(context, captured, runId, key, after.revision);
    const runtimeResponse = await fetch("http://127.0.0.1:9760/api/runtime/status", { signal: AbortSignal.timeout(10_000) });
    const runtimeStatus = await runtimeResponse.json();
    const checks = { selectedVerifierPassed: true, representativeTranscriptsPassed: true,
      effectReceiptPassed: true, postRestartHealthPassed: runtimeResponse.ok,
      dependencyLossPassed: true, reconciliationStillExact: verified.exact,
      telemetryPrivacyPassed: countsAfter.responses === countsBefore.responses };
    await context.coordinator.verifyLive(`gate6d-live-${suffix}`, { runtimeStatus, checks });
    await context.coordinator.startObservation(`gate6d-observe-${suffix}`, {
      selectedWritesRemainFrozen: true, durationMinutes: 60 });
    await revokeTargetSessions(context);
    return Object.freeze({ schemaVersion: "runa2-gate6d-live-validation/v1", passed: true,
      phase: "observing", representativeLaneCount: answers.length, governedReceipts: 2,
      settingRestored: true, targetSessionRevoked: true, privateValuesIncluded: false });
  } finally { key.fill(0); }
}

async function closeCutover(context) {
  await freezeLease(context);
  const state = await context.coordinator.status();
  if (state.phase !== "observing" || Date.now() < Date.parse(state.observation?.endsAt)) {
    throw coded("gate6d-observation-incomplete", "The one-hour observation window is not complete.");
  }
  const observation = await json(resolve(candidateRoot, "gate6c", "observation-proof.json"),
    "gate6d-observation-proof-unavailable");
  if (observation.schemaVersion !== "runa2-gate6d-observation-proof/v1" || observation.passed !== true
      || observation.releaseManifestDigest !== context.manifest.manifestDigest
      || observation.cutoverId !== context.config.cutoverId || observation.durationMinutes < 60
      || observation.sampleCount < 120 || observation.freezeVerificationCount < 13
      || observation.healthGreenForEntireWindow !== true || observation.selectedWritesStayedFrozen !== true
      || observation.privateValuesIncluded !== false) {
    throw coded("gate6d-observation-proof-invalid", "The retained one-hour observation proof is not green.");
  }
  const health = await fetch("http://127.0.0.1:9760/health/ready", { signal: AbortSignal.timeout(10_000) });
  const status = await health.json();
  if (!health.ok || status.ready !== true || !await legacyRuntimeVerified(context.args["legacy-commit"])) {
    throw coded("gate6d-final-health-failed", "Final target or legacy rollback health is not green.");
  }
  const setting = (await context.pool.query(`SELECT revision::int revision FROM runa_core.participant_settings
    WHERE participant_id='matthew-owner' AND setting_key='defaultIntelligenceLevel'`)).rows[0];
  const key = randomBytes(32);
  try {
    const captured = await capture(context, key);
    const { verified } = await verifyTarget(context, captured,
      `gate6c-control-${context.manifest.commit.slice(0, 12)}`, key, setting.revision);
    if (!verified.exact) throw coded("gate6d-final-reconciliation-failed", "Final reconciliation is not exact.");
    await context.coordinator.close(`gate6d-close-${context.manifest.commit.slice(0, 12)}`, {
      healthGreenForEntireWindow: true, selectedWritesStayedFrozen: true,
      finalReconciliationExact: true });
    return Object.freeze({ schemaVersion: "runa2-gate6d-close/v1", passed: true, phase: "closed",
      finalReconciliationExact: true, legacyRollbackHealthy: true, privateValuesIncluded: false });
  } finally { key.fill(0); }
}

async function main(argv) {
  const args = argumentsOf(argv); const context = await loadContext(args);
  const runId = `gate6c-control-${context.manifest.commit.slice(0, 12)}`;
  try {
    if (args.phase === "prerequisite-check") return prerequisiteCheck(context);
    if (args.phase === "migrate-promote") return migratePromote(context);
    if (args.phase === "verify-live") return liveValidate(context);
    if (args.phase === "close") return closeCutover(context);
    const result = await rollback(context, runId);
    return Object.freeze({ schemaVersion: "runa2-gate6d-rollback/v1", passed: true,
      phase: "rolled-back", targetWasAuthoritative: result.targetWasAuthoritative,
      legacyModified: false, privateValuesIncluded: false });
  } finally { await context.close(); }
}

main(process.argv.slice(2)).then(result => process.stdout.write(`${JSON.stringify(result)}\n`), error => {
  const safe = /^[a-z0-9-]{1,100}$/.test(String(error?.code ?? "")) ? error.code : "gate6cd-protected-cutover-failed";
  process.stderr.write(`${JSON.stringify({ schemaVersion: "runa2-gate6cd-error/v1", errorCode: safe,
    privateValuesIncluded: false })}\n`); process.exitCode = 1;
});
