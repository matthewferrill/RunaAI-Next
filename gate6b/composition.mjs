import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import pg from "pg";
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
  KeycloakVerifier, MultiClientAuthenticator, OpenFgaChecker } from "./clients.mjs";
import { PostgresSelectedActionStore } from "./adapters/postgres-action.mjs";
import { PostgresRequestCoordinator, PostgresSelectedContinuityStore,
  PostgresWorkspaceStore } from "./adapters/postgres-continuity.mjs";
import { PostgresAcceptedLearningSource } from "./adapters/postgres-learning.mjs";
import { decodeKey, readSecretReference, safeConfigurationStatus } from "./release-config.mjs";
import { verifyReleaseArtifact } from "./artifact.mjs";
import { BrowserOwnerCeremonyService } from "../gate6c/browser-ceremony.mjs";
import { PostgresBrowserCeremonyStore, PostgresPendingCapabilityRevoker } from "../gate6c/adapters/postgres-browser.mjs";
import { GATE6C_BINDING_VERSION } from "../gate6c/formats.mjs";
import { OrdinaryBrowserSessionService } from "../gate7a/ordinary-session.mjs";
import { PostgresOrdinarySessionStore } from "../gate7a/postgres-ordinary-session.mjs";
import { HarmlessJavascriptExecutionService, MxcJavascriptExecutor } from "../gate7e/mxc-javascript-executor.mjs";
import { assertConfiguredReleaseModel, createReleaseAnswerProviders } from "./model-role-providers.mjs";
import { composeM1Functions } from "../gate7f/function-first/composition.mjs";
import { composeUserSystemStatus } from "./product-foundation.mjs";

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

export async function composeReadinessStatus({ application, dependencyHealth, configuration,
  artifact, browserCeremony = null, protectedImportStatus = async () => false }) {
  const [authority, dependencies, ceremony, protectedDataImported] = await Promise.all([
    application.authority().then(() => "active",
      error => error?.code === "candidate-shadow-authority" ? "shadow" : "unavailable"),
    dependencyHealth(),
    browserCeremony ? browserCeremony.status() : Promise.resolve(null),
    protectedImportStatus(),
  ]);
  return Object.freeze({ schemaVersion: "runa2-gate6b-shadow-readiness/v1",
    authority, dependencies, configuration, artifact,
    protectedDataImported: protectedDataImported === true,
    ownerCredentialEnrolled: ceremony?.complete === true,
    productionTrafficChanged: authority === "active",
    privateValuesIncluded: false });
}

export async function protectedImportCompleted(pool, enabled) {
  if (enabled !== true) return false;
  try {
    return (await pool.query("SELECT EXISTS(SELECT 1 FROM runa_gate6c.runs WHERE status='completed') imported"))
      .rows[0].imported === true;
  } catch (error) {
    if (error?.code === "42P01") return false;
    throw error;
  }
}

export async function createProductionComposition({ loadedConfig, releaseRoot }) {
  const config = loadedConfig.value;
  const relative = value => isAbsolute(value) ? value : resolve(loadedConfig.directory, value);
  const manifest = assertReleaseManifest(await jsonFile(relative(config.releaseManifestPath), "release-manifest-unavailable"));
  assertConfiguredReleaseModel(manifest, config);
  if (manifest.configurationDigest !== loadedConfig.configurationDigest) {
    throw coded("release-configuration-digest-mismatch", "The running configuration is not the reviewed release configuration.");
  }
  if (manifest.applicationEntryPoint !== "gate6b/server.mjs") {
    throw coded("release-entrypoint-mismatch", "The release manifest names another application entry point.");
  }
  const artifact = await verifyReleaseArtifact(releaseRoot, manifest.artifactDigest);
  const javascriptTransientRoot = resolve(loadedConfig.directory, "..", "transient", "javascript");
  await mkdir(javascriptTransientRoot, { recursive: true });
  const javascriptExecutor = new MxcJavascriptExecutor({
    runtimeRoot: resolve(releaseRoot, "sandbox-runtime"),
    runnerPath: resolve(releaseRoot, "sandbox-runtime", "quickjs-child.mjs"),
    nodeExecutable: resolve(releaseRoot, "runtime", "node.exe"),
    temporaryRoot: javascriptTransientRoot,
  });
  const sandboxPreflight = await javascriptExecutor.preflight();
  if (!sandboxPreflight.ready) {
    throw coded("sandbox-preflight-failed", "The harmless JavaScript sandbox did not pass startup validation.");
  }

  const [connectionString, coreEncryption, coreHmac, learningEncryption, learningHmac,
    telemetryHmac, keycloakCredential, ordinaryKeycloakCredential, openfgaCredential] = await Promise.all([
      readSecretReference(config.databaseUrlRef, loadedConfig.directory),
      readSecretReference(config.keyRefs.coreEncryption, loadedConfig.directory),
      readSecretReference(config.keyRefs.coreHmac, loadedConfig.directory),
      readSecretReference(config.keyRefs.learningEncryption, loadedConfig.directory),
      readSecretReference(config.keyRefs.learningHmac, loadedConfig.directory),
      readSecretReference(config.keyRefs.telemetryHmac, loadedConfig.directory),
      readSecretReference(config.keycloak.clientCredentialRef, loadedConfig.directory),
      config.gate7a?.ordinaryClient
        ? readSecretReference(config.gate7a.ordinaryClient.clientCredentialRef, loadedConfig.directory)
        : Promise.resolve(null),
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
  const m1 = config.functionFirst ? await composeM1Functions({ configuration: config.functionFirst, provider: config.provider,
    pool, cipher: coreCipher, javascriptExecutor, dataDirectory: resolve(loadedConfig.directory, "..", "state") }) : null;
  const providers = { ...createReleaseAnswerProviders(config.provider, { requestControls: config.functionFirst?.requestControls }),
    ...(m1 ? { review: m1.review } : {}) };
  const answerService = new Gate2ReadOnlyService({ records: workspace, index: m1?.index ?? workspace, providers,
    continuity, workspaceResolver: workspace, approvedKnowledge,
    reviewContextResolver: m1?.sources ?? null, requireReviewCheck: Boolean(m1),
    statusProvider: () => ({ provider: "private-openai-compatible", retrieval: m1 ? "qdrant-nomic-selected-sources" : "postgres-direct",
      reranker: m1 ? "explicit-window-bge" : "explicit-window-not-required-for-explicit-source-set" }) });
  const actionService = new Gate3GovernedActionService({ store: actionStore });
  const codeExecution = new HarmlessJavascriptExecutionService({ executor: javascriptExecutor });

  const keycloakClient = new KeycloakOnlineClient({ issuer: config.keycloak.issuer,
    backchannelIssuer: config.keycloak.backchannelIssuer,
    clientId: config.keycloak.clientId, clientCredential: keycloakCredential,
    timeoutMs: config.limits.upstreamDeadlineMs });
  const verifier = new KeycloakVerifier({ client: keycloakClient, principalStore });
  const identityService = new Gate5IdentityService({ verifier,
    introspector: new KeycloakIntrospector(keycloakClient), principalStore,
    issuer: config.keycloak.issuer, audience: config.keycloak.clientId, pseudonymKey: telemetryKey });
  const ownerAuthenticator = new DerivedActorAuthenticator({ identityService, verifier, principalStore });
  let ordinaryKeycloakClient = null;
  let authenticator = ownerAuthenticator;
  if (config.gate7a?.ordinaryClient) {
    ordinaryKeycloakClient = new KeycloakOnlineClient({ issuer: config.keycloak.issuer,
      backchannelIssuer: config.keycloak.backchannelIssuer,
      clientId: config.gate7a.ordinaryClient.clientId,
      clientCredential: ordinaryKeycloakCredential,
      timeoutMs: config.limits.upstreamDeadlineMs });
    const ordinaryVerifier = new KeycloakVerifier({ client: ordinaryKeycloakClient, principalStore });
    const ordinaryIdentity = new Gate5IdentityService({ verifier: ordinaryVerifier,
      introspector: new KeycloakIntrospector(ordinaryKeycloakClient), principalStore,
      issuer: config.keycloak.issuer, audience: config.gate7a.ordinaryClient.clientId,
      pseudonymKey: telemetryKey });
    authenticator = new MultiClientAuthenticator([ownerAuthenticator,
      new DerivedActorAuthenticator({ identityService: ordinaryIdentity,
        verifier: ordinaryVerifier, principalStore })]);
  }
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
    const acceptedPostCutoverRelease = config.gate7a?.enabled === true
      && retainedCutover.phase === "closed"
      && retainedCutover.authorityGeneration === config.targetGeneration
      && retainedCutover.releaseManifestDigest === config.gate7a.predecessorManifestDigest;
    if (!acceptedPostCutoverRelease) {
      await cutoverStore.rebindPristineRelease(initialCutover);
      retainedCutover = await cutoverStore.load();
    }
  }
  if (retainedCutover.releaseManifestDigest !== manifest.manifestDigest
      && !(config.gate7a?.enabled === true && retainedCutover.phase === "closed"
        && retainedCutover.authorityGeneration === config.targetGeneration
        && retainedCutover.releaseManifestDigest === config.gate7a.predecessorManifestDigest)
      || retainedCutover.sourceGeneration !== config.sourceGeneration
      || retainedCutover.targetGeneration !== config.targetGeneration) {
    throw coded("release-cutover-state-mismatch", "The retained cutover state belongs to another release or authority generation.");
  }
  const cutoverStatus = () => cutoverStore.load();
  let userSystemStatus = null;
  const application = new SelectedCoreApplication({ mode: config.mode,
    targetGeneration: config.targetGeneration, cutoverStatus, answerService, actionService,
    authenticator, authorizer, continuity, requestCoordinator: new PostgresRequestCoordinator({ pool, cipher: coreCipher }),
    codeExecution,
    systemStatus: input => {
      if (!userSystemStatus) throw coded("system-status-unavailable", "System status is unavailable.");
      return userSystemStatus(input);
    },
    totalDeadlineMs: config.limits.totalDeadlineMs });

  let browserCeremony = null;
  let ordinarySessions = null;
  if (config.gate6c?.enabled === true) {
    const binding = { schemaVersion: GATE6C_BINDING_VERSION, cutoverId: config.cutoverId,
      releaseId: manifest.releaseId, releaseCommit: manifest.commit,
      artifactDigest: manifest.artifactDigest, sourceGeneration: config.gate6c.legacyCommit,
      targetGeneration: config.targetGeneration,
      participantRefHmac: coreCipher.digest({ type: "gate6c-owner-participant",
        principalId: config.gate6c.expectedPrincipalId }) };
    browserCeremony = new BrowserOwnerCeremonyService({
      store: new PostgresBrowserCeremonyStore({ pool, cipher: coreCipher }),
      oidc: keycloakClient, principalStore, binding, publicBaseUrl: config.publicBaseUrl,
      clientId: config.keycloak.clientId, expectedPrincipalId: config.gate6c.expectedPrincipalId,
      capabilityRevoker: new PostgresPendingCapabilityRevoker({ pool }),
    });
    await browserCeremony.initialize();
  }
  if (config.gate7a?.ordinaryClient && ordinaryKeycloakClient) {
    ordinarySessions = new OrdinaryBrowserSessionService({
      store: new PostgresOrdinarySessionStore({ pool, cipher: coreCipher }),
      passwordOidc: ordinaryKeycloakClient, passkeyOidc: keycloakClient, principalStore,
      bindingDigest: manifest.manifestDigest, publicBaseUrl: config.publicBaseUrl,
      passwordClientId: config.gate7a.ordinaryClient.clientId,
      passkeyClientId: config.keycloak.clientId,
    });
    await ordinarySessions.initialize();
  }

  const runtimeStatus = async () => {
    const cutover = await cutoverStatus();
    return releaseRuntimeStatus({ manifest, authorityGeneration: cutover.authorityGeneration,
      phase: cutover.phase, revision: cutover.revision });
  };
  const dependencyHealth = async () => {
    const [postgresql, keycloak, openfga, provider] = await Promise.all([
      pool.query("SELECT 1").then(() => true, () => false),
      probe(`${config.keycloak.backchannelIssuer ?? config.keycloak.issuer}/.well-known/openid-configuration`,
        config.limits.upstreamDeadlineMs),
      probe(`${config.openfga.baseUrl.replace(/\/$/, "")}/healthz`, config.limits.upstreamDeadlineMs),
      probe(`${config.provider.baseUrl.replace(/\/$/, "")}/models`, config.limits.upstreamDeadlineMs),
    ]);
    const functions = m1 ? await m1.health() : null;
    return Object.freeze({ schemaVersion: "runa2-gate6b-dependency-health/v1",
      ready: postgresql && keycloak && openfga && provider && sandboxPreflight.ready && (!functions || functions.ready),
      dependencies: Object.freeze({ postgresql, keycloak, openfga, provider, sandbox: sandboxPreflight.ready,
        ...(functions ? { qdrant: functions.qdrant, embedding: functions.embedding, reranker: functions.reranker } : {}) }),
      privateValuesIncluded: false });
  };
  const protectedImportStatus = () => protectedImportCompleted(pool, config.gate6c?.enabled);
  const readinessStatus = () => composeReadinessStatus({ application, dependencyHealth,
    configuration: safeConfigurationStatus(loadedConfig, telemetryKey), artifact, browserCeremony,
    protectedImportStatus });
  userSystemStatus = async ({ client }) => composeUserSystemStatus({
    runtime: await runtimeStatus(), readiness: await readinessStatus(), client,
  });

  return Object.freeze({ application, browserCeremony, ordinarySessions, m1Functions: m1?.attach(application) ?? null,
    runtimeStatus, readinessStatus, dependencyHealth,
    releaseManifest: manifest,
    async close() { await pool.end(); } });
}
