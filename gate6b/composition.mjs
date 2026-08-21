import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import pg from "pg";
import { MastraAnswerProvider } from "../gate1/adapters/mastra-provider.mjs";
import { Gate2ReadOnlyService } from "../gate2/core.mjs";
import { Gate3GovernedActionService } from "../gate3/core.mjs";
import { createEnvelopeCipher } from "../gate4/envelope.mjs";
import { PostgresGate4aStore } from "../gate4/adapters/postgres.mjs";
import { PostgresGate4bStore } from "../gate4b/adapters/postgres.mjs";
import { AcceptedApprovedKnowledgeAdapter } from "../gate4c/answer-context.mjs";
import { Gate5AuthorizationService, Gate5IdentityService } from "../gate5/identity.mjs";
import { PostgresPrincipalStore } from "../gate5/postgres.mjs";
import { PostgresCutoverStore } from "../gate6/adapters/postgres.mjs";
import { createInitialCutoverState } from "../gate6/cutover.mjs";
import { assertReleaseManifest, releaseRuntimeStatus } from "../gate6/release.mjs";
import { SelectedCoreApplication } from "./application.mjs";
import { DerivedActorAuthenticator, KeycloakIntrospector, KeycloakOnlineClient,
  KeycloakVerifier, OpenFgaChecker } from "./clients.mjs";
import { PostgresSelectedActionStore } from "./adapters/postgres-action.mjs";
import { PostgresRequestCoordinator, PostgresSelectedContinuityStore,
  PostgresWorkspaceStore } from "./adapters/postgres-continuity.mjs";
import { PostgresAcceptedLearningSource } from "./adapters/postgres-learning.mjs";
import { decodeKey, readSecretReference, safeConfigurationStatus } from "./release-config.mjs";
import { verifyReleaseArtifact } from "./artifact.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });

async function jsonFile(path, code) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { throw coded(code, `Required release JSON is unavailable: ${path}`); }
}

async function probe(url, timeoutMs) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch { return false; }
}

export async function createProductionComposition({ loadedConfig, releaseRoot }) {
  const config = loadedConfig.value;
  const relative = value => isAbsolute(value) ? value : resolve(loadedConfig.directory, value);
  const manifest = assertReleaseManifest(await jsonFile(relative(config.releaseManifestPath), "release-manifest-unavailable"));
  if (manifest.configurationDigest !== loadedConfig.configurationDigest) {
    throw coded("release-configuration-digest-mismatch", "The running configuration is not the reviewed release configuration.");
  }
  if (manifest.applicationEntryPoint !== "gate6b/server.mjs") {
    throw coded("release-entrypoint-mismatch", "The release manifest names another application entry point.");
  }
  const artifact = await verifyReleaseArtifact(releaseRoot, manifest.artifactDigest);

  const [connectionString, coreEncryption, coreHmac, learningEncryption, learningHmac,
    telemetryHmac, keycloakCredential, openfgaCredential] = await Promise.all([
      readSecretReference(config.databaseUrlRef, loadedConfig.directory),
      readSecretReference(config.keyRefs.coreEncryption, loadedConfig.directory),
      readSecretReference(config.keyRefs.coreHmac, loadedConfig.directory),
      readSecretReference(config.keyRefs.learningEncryption, loadedConfig.directory),
      readSecretReference(config.keyRefs.learningHmac, loadedConfig.directory),
      readSecretReference(config.keyRefs.telemetryHmac, loadedConfig.directory),
      readSecretReference(config.keycloak.clientCredentialRef, loadedConfig.directory),
      readSecretReference(config.openfga.credentialRef, loadedConfig.directory),
    ]);
  const coreCipher = createEnvelopeCipher({ encryptionKey: decodeKey(coreEncryption, "core encryption key"),
    hmacKey: decodeKey(coreHmac, "core HMAC key"), keyId: "runa-core-release-v1" });
  const learningCipher = createEnvelopeCipher({ encryptionKey: decodeKey(learningEncryption, "learning encryption key"),
    hmacKey: decodeKey(learningHmac, "learning HMAC key"), keyId: "runa-learning-release-v1" });
  const telemetryKey = decodeKey(telemetryHmac, "telemetry HMAC key").toString("base64url");

  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 8_000,
    application_name: "runaai-next-candidate" });
  pool.on("error", () => {});
  const coreMigrationStore = new PostgresGate4aStore({ pool });
  const learningMigrationStore = new PostgresGate4bStore({ pool });
  const principalStore = new PostgresPrincipalStore({ pool });
  const continuity = new PostgresSelectedContinuityStore({ pool, cipher: coreCipher });
  const workspace = new PostgresWorkspaceStore({ pool, cipher: coreCipher });
  const actionStore = new PostgresSelectedActionStore({ pool });
  await coreMigrationStore.initialize();
  await learningMigrationStore.initialize();
  await principalStore.initialize();
  await continuity.initialize();
  await workspace.initialize();
  await actionStore.initialize();

  const learningSource = new PostgresAcceptedLearningSource({ pool, cipher: learningCipher });
  const approvedKnowledge = new AcceptedApprovedKnowledgeAdapter({
    loadSource: options => learningSource.load(options), cipher: learningCipher,
    expectedSourceClassification: "protected-or-unknown",
  });
  const providers = Object.fromEntries(["chat", "research", "code"].map(role => [role,
    new MastraAnswerProvider({ baseURL: config.provider.baseUrl, modelId: config.provider.modelId,
      role, providerName: "private-openai-compatible" })]));
  const answerService = new Gate2ReadOnlyService({ records: workspace, index: workspace, providers,
    continuity, workspaceResolver: workspace, approvedKnowledge,
    statusProvider: () => ({ provider: "private-openai-compatible", retrieval: "postgres-direct",
      reranker: "explicit-window-not-required-for-explicit-source-set" }) });
  const actionService = new Gate3GovernedActionService({ store: actionStore });

  const keycloakClient = new KeycloakOnlineClient({ issuer: config.keycloak.issuer,
    clientId: config.keycloak.clientId, clientCredential: keycloakCredential,
    timeoutMs: config.limits.upstreamDeadlineMs });
  const verifier = new KeycloakVerifier({ client: keycloakClient, principalStore });
  const identityService = new Gate5IdentityService({ verifier,
    introspector: new KeycloakIntrospector(keycloakClient), principalStore,
    issuer: config.keycloak.issuer, audience: config.keycloak.clientId, pseudonymKey: telemetryKey });
  const authenticator = new DerivedActorAuthenticator({ identityService, verifier, principalStore });
  const authorizer = new Gate5AuthorizationService({ checker: new OpenFgaChecker({
    baseUrl: config.openfga.baseUrl, storeId: config.openfga.storeId,
    modelId: config.openfga.modelId, credential: openfgaCredential,
    timeoutMs: config.limits.upstreamDeadlineMs }) });
  const cutoverStore = new PostgresCutoverStore({ pool, cutoverId: config.cutoverId });
  const initialCutover = createInitialCutoverState({ cutoverId: config.cutoverId, manifest,
    sourceGeneration: config.sourceGeneration, targetGeneration: config.targetGeneration });
  await cutoverStore.initialize(initialCutover);
  let retainedCutover = await cutoverStore.load();
  if (retainedCutover.releaseManifestDigest !== manifest.manifestDigest) {
    await cutoverStore.rebindPristineRelease(initialCutover);
    retainedCutover = await cutoverStore.load();
  }
  if (retainedCutover.releaseManifestDigest !== manifest.manifestDigest
      || retainedCutover.sourceGeneration !== config.sourceGeneration
      || retainedCutover.targetGeneration !== config.targetGeneration) {
    throw coded("release-cutover-state-mismatch", "The retained cutover state belongs to another release or authority generation.");
  }
  const cutoverStatus = () => cutoverStore.load();
  const application = new SelectedCoreApplication({ mode: config.mode,
    targetGeneration: config.targetGeneration, cutoverStatus, answerService, actionService,
    authenticator, authorizer, requestCoordinator: new PostgresRequestCoordinator({ pool }) });

  const runtimeStatus = async () => {
    const cutover = await cutoverStatus();
    return releaseRuntimeStatus({ manifest, authorityGeneration: cutover.authorityGeneration,
      phase: cutover.phase, revision: cutover.revision });
  };
  const dependencyHealth = async () => {
    const [postgresql, keycloak, openfga, provider] = await Promise.all([
      pool.query("SELECT 1").then(() => true, () => false),
      probe(`${config.keycloak.issuer}/.well-known/openid-configuration`, config.limits.upstreamDeadlineMs),
      probe(`${config.openfga.baseUrl.replace(/\/$/, "")}/healthz`, config.limits.upstreamDeadlineMs),
      probe(`${config.provider.baseUrl.replace(/\/$/, "")}/models`, config.limits.upstreamDeadlineMs),
    ]);
    return Object.freeze({ schemaVersion: "runa2-gate6b-dependency-health/v1",
      ready: postgresql && keycloak && openfga && provider,
      dependencies: Object.freeze({ postgresql, keycloak, openfga, provider }),
      privateValuesIncluded: false });
  };
  const readinessStatus = async () => Object.freeze({ schemaVersion: "runa2-gate6b-shadow-readiness/v1",
    authority: await application.authority().then(() => "active", error => error?.code === "candidate-shadow-authority" ? "shadow" : "unavailable"),
    dependencies: await dependencyHealth(), configuration: safeConfigurationStatus(loadedConfig, telemetryKey),
    artifact,
    protectedDataImported: false, ownerCredentialEnrolled: false, productionTrafficChanged: false,
    privateValuesIncluded: false });

  return Object.freeze({ application, runtimeStatus, readinessStatus, dependencyHealth,
    releaseManifest: manifest,
    async close() { await pool.end(); } });
}
