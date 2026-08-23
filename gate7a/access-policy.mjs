import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { canonicalJson } from "../gate4/canonical.mjs";
import {
  GATE7A_CLIENT_CASES,
  GATE7A_MATRIX_VERSION,
  GATE7A_POLICY_VERSION,
  GATE7A_READINESS_VERSION,
  GATE7A_REQUIRED_ASSERTIONS,
  GATE7A_SYNTHETIC_VERSION,
} from "./formats.mjs";

const bounded = z.string().min(1).max(200);
const url = z.string().url().max(500);
const loopbackService = z.object({
  bind: z.literal("127.0.0.1"),
  port: z.number().int().min(1024).max(65535),
  clientReachable: z.literal(false),
}).strict();

const policySchema = z.object({
  schemaVersion: z.literal(GATE7A_POLICY_VERSION),
  canonicalOrigin: url,
  keycloak: z.object({
    browserIssuer: url,
    internalIssuer: url,
    relativePath: z.literal("/auth"),
    realm: z.literal("runaai-next"),
    clientId: z.literal("runaai-next"),
    redirectUris: z.array(url).min(1).max(4),
    webOrigins: z.array(url).min(1).max(4),
    publicSelfRegistration: z.boolean(),
  }).strict(),
  webauthn: z.object({
    relyingPartyId: bounded,
    userVerification: z.enum(["required", "preferred", "discouraged"]),
    discoverableCredential: z.enum(["required", "preferred", "discouraged"]),
    platformPasskeysAllowed: z.boolean(),
    syncedPasskeysAllowed: z.boolean(),
    crossDevicePasskeysAllowed: z.boolean(),
    ownerMinimumCredentials: z.number().int().min(1).max(16),
    independentRecoveryRequired: z.boolean(),
    ordinaryUseOptional: z.boolean(),
    protectedActionStepUpRequired: z.boolean(),
    ownerAdministrativeAuthentication: z.literal("user-verified-passkey"),
  }).strict(),
  accounts: z.object({
    individualPrincipalsRequired: z.boolean(),
    sharedAccountsAllowed: z.boolean(),
    invitationRequired: z.boolean(),
    invitationSingleUse: z.boolean(),
    invitationMaximumMinutes: z.number().int().min(1).max(60),
    usernamePasswordEnabled: z.boolean(),
    passwordSetByUser: z.boolean(),
    verifiedEmailRequired: z.boolean(),
    verifiedEmailPasswordRecovery: z.boolean(),
    ownerOrdinaryTestAccountSeparated: z.boolean(),
  }).strict(),
  sessions: z.object({
    storage: z.enum(["encrypted-postgresql", "memory", "browser"]),
    onlineRevocationRequired: z.boolean(),
    maximumMinutes: z.number().int().min(5).max(1440),
    cookie: z.object({
      opaque: z.boolean(),
      secure: z.boolean(),
      httpOnly: z.boolean(),
      sameSite: z.enum(["strict", "lax", "none"]),
      hostOnly: z.boolean(),
    }).strict(),
  }).strict(),
  governance: z.object({
    freshPasskeyStepUpRequired: z.boolean(),
    stepUpMaximumSeconds: z.number().int().min(30).max(900),
    openFgaBeforeProtectedWork: z.boolean(),
  }).strict(),
  ingress: z.object({
    lanMode: z.literal("private-interface"),
    offLanMode: z.enum(["disabled", "reviewed-connector", "private-overlay"]),
    directRouterPortForward: z.boolean(),
    controlAdministrativeRouteExposed: z.boolean(),
    certificateTrust: z.enum(["public-webpki", "private-ca", "browser-exception"]),
    tlsPort: z.number().int().min(1).max(65535),
  }).strict(),
  services: z.object({
    caddy: z.object({
      bind: z.literal("private-interface"),
      port: z.number().int().min(1).max(65535),
      clientReachable: z.boolean(),
    }).strict(),
    application: loopbackService,
    keycloak: loopbackService,
    openfga: loopbackService,
    postgresql: loopbackService,
    homeProvider: z.object({
      clientReachable: z.boolean(),
      allowedCaller: z.enum(["control", "any-client"]),
    }).strict(),
  }).strict(),
}).strict();

const matrixCase = z.object({
  id: bounded,
  network: z.enum(["lan", "off-lan"]),
  clientClass: z.enum(["windows-pc", "phone"]),
  principalClass: z.enum(["primary-owner", "household-member"]),
  authenticator: z.enum([
    "username-password",
    "platform-passkey",
    "platform-or-synced-passkey",
    "platform-or-cross-device-passkey",
  ]),
  optionalPasskeySupported: z.boolean(),
  protectedActionPasskeyRequired: z.boolean(),
}).strict();

const matrixSchema = z.object({
  schemaVersion: z.literal(GATE7A_MATRIX_VERSION),
  cases: z.array(matrixCase).min(1).max(20),
  requiredAssertions: z.array(bounded).min(1).max(30),
  privateValuesIncluded: z.literal(false),
}).strict();

const coded = (code, message) => Object.assign(new Error(message), { code });
const sorted = values => [...values].sort((left, right) => left.localeCompare(right));
const exact = (actual, expected) => canonicalJson(sorted(actual)) === canonicalJson(sorted(expected));
const sha256 = value => createHash("sha256").update(value).digest("hex");

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function parseOrigin(value) {
  let parsed;
  try { parsed = new URL(value); }
  catch { throw coded("gate7a-canonical-origin-invalid", "The canonical origin is not a valid URL."); }
  const hostname = parsed.hostname.toLowerCase();
  const forbiddenSuffixes = [".home.arpa", ".internal", ".invalid", ".lan", ".local", ".localhost"];
  if (value !== parsed.origin || parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/"
      || parsed.search || parsed.hash || parsed.port || isIP(hostname) !== 0 || hostname === "localhost"
      || !hostname.includes(".") || forbiddenSuffixes.some(suffix => hostname.endsWith(suffix))) {
    throw coded("gate7a-canonical-origin-invalid",
      "The canonical origin must be one stable DNS hostname on standard HTTPS port 443.");
  }
  return Object.freeze({ origin: parsed.origin, hostname });
}

function assertPolicy(parsed) {
  const canonical = parseOrigin(parsed.canonicalOrigin);
  const expectedIssuer = `${canonical.origin}/auth/realms/runaai-next`;
  if (parsed.keycloak.browserIssuer !== expectedIssuer || /localhost|127\.0\.0\.1|\[::1\]/i.test(parsed.keycloak.browserIssuer)) {
    throw coded("gate7a-browser-issuer-invalid", "The browser issuer must use the canonical external origin.");
  }
  if (parsed.keycloak.internalIssuer !== "http://127.0.0.1:9762/realms/runaai-next") {
    throw coded("gate7a-browser-issuer-invalid", "The private Keycloak service must remain on its exact loopback issuer.");
  }
  if (parsed.webauthn.relyingPartyId !== canonical.hostname) {
    throw coded("gate7a-webauthn-origin-mismatch", "The WebAuthn relying-party ID must equal the canonical hostname.");
  }
  const expectedRedirects = [`${canonical.origin}/session/callback`];
  if (!exact(parsed.keycloak.redirectUris, expectedRedirects)
      || !exact(parsed.keycloak.webOrigins, [canonical.origin])
      || parsed.keycloak.redirectUris.some(value => value.includes("*"))) {
    throw coded("gate7a-oidc-client-boundary-invalid", "OIDC redirects and web origins must be exact and canonical.");
  }
  if (parsed.keycloak.publicSelfRegistration || !parsed.accounts.individualPrincipalsRequired
      || parsed.accounts.sharedAccountsAllowed || !parsed.accounts.invitationRequired
      || !parsed.accounts.invitationSingleUse || parsed.accounts.invitationMaximumMinutes > 10
      || !parsed.accounts.usernamePasswordEnabled || !parsed.accounts.passwordSetByUser
      || !parsed.accounts.verifiedEmailRequired || !parsed.accounts.verifiedEmailPasswordRecovery
      || !parsed.accounts.ownerOrdinaryTestAccountSeparated) {
    throw coded("gate7a-account-boundary-invalid", "Accounts must be individual and invitation-gated.");
  }
  if (parsed.webauthn.userVerification !== "required"
      || parsed.webauthn.discoverableCredential !== "required"
      || !parsed.webauthn.platformPasskeysAllowed || !parsed.webauthn.syncedPasskeysAllowed
      || !parsed.webauthn.crossDevicePasskeysAllowed || parsed.webauthn.ownerMinimumCredentials < 2
      || !parsed.webauthn.independentRecoveryRequired || !parsed.webauthn.ordinaryUseOptional
      || !parsed.webauthn.protectedActionStepUpRequired
      || parsed.webauthn.ownerAdministrativeAuthentication !== "user-verified-passkey") {
    throw coded("gate7a-passkey-boundary-invalid", "The multi-device passkey and recovery policy is incomplete.");
  }
  if (parsed.sessions.storage !== "encrypted-postgresql" || !parsed.sessions.onlineRevocationRequired
      || !parsed.sessions.cookie.opaque || !parsed.sessions.cookie.secure || !parsed.sessions.cookie.httpOnly
      || parsed.sessions.cookie.sameSite !== "lax" || !parsed.sessions.cookie.hostOnly) {
    throw coded("gate7a-session-boundary-invalid", "The browser session boundary is not production-safe.");
  }
  if (!parsed.governance.freshPasskeyStepUpRequired || parsed.governance.stepUpMaximumSeconds > 300
      || !parsed.governance.openFgaBeforeProtectedWork) {
    throw coded("gate7a-step-up-boundary-invalid", "Governed work requires fresh passkey and authorization checks.");
  }
  if (parsed.ingress.certificateTrust !== "public-webpki" || parsed.ingress.tlsPort !== 443) {
    throw coded("gate7a-certificate-boundary-invalid", "Ordinary clients require public WebPKI trust on port 443.");
  }
  if (parsed.ingress.directRouterPortForward || parsed.ingress.controlAdministrativeRouteExposed
      || !["disabled", "reviewed-connector", "private-overlay"].includes(parsed.ingress.offLanMode)) {
    throw coded("gate7a-ingress-boundary-invalid", "The remote ingress boundary is not accepted.");
  }
  const backendServices = ["application", "keycloak", "openfga", "postgresql"];
  if (!parsed.services.caddy.clientReachable || parsed.services.caddy.port !== 443
      || backendServices.some(name => parsed.services[name].bind !== "127.0.0.1"
        || parsed.services[name].clientReachable)
      || parsed.services.homeProvider.clientReachable
      || parsed.services.homeProvider.allowedCaller !== "control") {
    throw coded("gate7a-listener-boundary-invalid", "Only Caddy may be client-reachable; Home remains Control-only.");
  }
  return canonical;
}

export function validateClientAccessPolicy(input) {
  let parsed;
  try { parsed = policySchema.parse(structuredClone(input)); }
  catch (error) { throw coded("gate7a-policy-invalid", error.message); }
  assertPolicy(parsed);
  return deepFreeze(parsed);
}

export function validateClientMatrix(input) {
  let parsed;
  try { parsed = matrixSchema.parse(structuredClone(input)); }
  catch (error) { throw coded("gate7a-client-matrix-invalid", error.message); }
  const ids = parsed.cases.map(item => item.id);
  if (new Set(ids).size !== ids.length || !exact(ids, GATE7A_CLIENT_CASES)
      || !exact(parsed.requiredAssertions, GATE7A_REQUIRED_ASSERTIONS)
      || parsed.cases.some(item => !item.optionalPasskeySupported || !item.protectedActionPasskeyRequired)
      || parsed.cases.filter(item => item.principalClass === "household-member")
        .some(item => item.authenticator !== "username-password")
      || parsed.cases.filter(item => item.principalClass === "primary-owner")
        .some(item => item.authenticator === "username-password")) {
    throw coded("gate7a-client-matrix-invalid", "The representative client matrix is incomplete or changed.");
  }
  return deepFreeze(parsed);
}

export function createClientAccessReadiness(policyInput, matrixInput) {
  const policy = validateClientAccessPolicy(policyInput);
  const matrix = validateClientMatrix(matrixInput);
  const plan = matrix.cases.map(item => Object.freeze({
    id: item.id,
    network: item.network,
    clientClass: item.clientClass,
    principalClass: item.principalClass,
    assertionCount: matrix.requiredAssertions.length,
  })).sort((left, right) => left.id.localeCompare(right.id));
  return deepFreeze({
    schemaVersion: GATE7A_READINESS_VERSION,
    passed: true,
    canonicalOrigin: policy.canonicalOrigin,
    browserIssuer: policy.keycloak.browserIssuer,
    relyingPartyId: policy.webauthn.relyingPartyId,
    standardHttps: true,
    ordinaryBrowserTrust: true,
    privateCaRequired: false,
    publicSelfRegistration: false,
    ordinaryUsernamePasswordEnabled: true,
    verifiedEmailPasswordRecovery: true,
    ordinaryPasskeyOptional: true,
    protectedActionPasskeyRequired: true,
    ownerOrdinaryTestAccountSeparated: true,
    individualPrincipalsRequired: true,
    independentRecoveryRequired: true,
    backendLoopbackOnly: true,
    homeClientReachable: false,
    directRouterPortForward: false,
    clientCaseCount: plan.length,
    acceptancePlanDigest: sha256(canonicalJson(plan)),
    liveDeploymentReady: false,
    deploymentBlockers: Object.freeze([
      "canonical-hostname",
      "dns-certificate-method",
      "off-lan-ingress-privacy",
      "non-owner-acceptance-fixture",
    ]),
    offLanIngressActivated: false,
    productionChanged: false,
    protectedStoresOpened: false,
    privateValuesIncluded: false,
  });
}

export function createSyntheticResult(policyInput, matrixInput) {
  const readiness = createClientAccessReadiness(policyInput, matrixInput);
  return deepFreeze({
    schemaVersion: GATE7A_SYNTHETIC_VERSION,
    passed: true,
    policyDigest: sha256(canonicalJson(validateClientAccessPolicy(policyInput))),
    matrixDigest: sha256(canonicalJson(validateClientMatrix(matrixInput))),
    readiness,
    dependencyAdded: false,
    serviceStarted: false,
    networkActivated: false,
    productionChanged: false,
    protectedStoresOpened: false,
    privateValuesIncluded: false,
  });
}

async function loadJson(path, errorCode) {
  try { return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, "")); }
  catch (error) { throw coded(errorCode, error.message); }
}

export async function loadClientAccessPolicy(path) {
  return validateClientAccessPolicy(await loadJson(path, "gate7a-policy-load-failed"));
}

export async function loadClientMatrix(path) {
  return validateClientMatrix(await loadJson(path, "gate7a-client-matrix-load-failed"));
}
