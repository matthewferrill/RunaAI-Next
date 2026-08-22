import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createClientAccessReadiness,
  createSyntheticResult,
  validateClientAccessPolicy,
  validateClientMatrix,
} from "./access-policy.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const read = async name => JSON.parse(await readFile(join(root, "fixtures", name), "utf8"));
const clone = value => structuredClone(value);
const rejects = (fn, code) => assert.throws(fn, error => error?.code === code);

const policy = await read("synthetic-policy.json");
const matrix = await read("client-matrix.json");

test("canonical multi-device policy is accepted and immutable", () => {
  const value = validateClientAccessPolicy(policy);
  assert.equal(new URL(value.canonicalOrigin).hostname, "runa.example.com");
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.keycloak), true);
  assert.throws(() => { value.keycloak.clientId = "changed"; }, TypeError);
});

test("readiness is deterministic, privacy-safe, and changes no production state", () => {
  const first = createClientAccessReadiness(policy, matrix);
  const second = createClientAccessReadiness(clone(policy), clone(matrix));
  assert.deepEqual(first, second);
  assert.equal(first.clientCaseCount, 5);
  assert.match(first.acceptancePlanDigest, /^[a-f0-9]{64}$/);
  assert.equal(first.liveDeploymentReady, false);
  assert.equal(first.deploymentBlockers.length, 4);
  assert.equal(first.offLanIngressActivated, false);
  assert.equal(first.productionChanged, false);
  assert.equal(first.protectedStoresOpened, false);
  assert.equal(first.privateValuesIncluded, false);
  assert.doesNotMatch(JSON.stringify(first), /password|privateKey|credentialId|cookieValue|token/i);
});

test("synthetic result is bound to exact policy and matrix digests", () => {
  const result = createSyntheticResult(policy, matrix);
  assert.match(result.policyDigest, /^[a-f0-9]{64}$/);
  assert.match(result.matrixDigest, /^[a-f0-9]{64}$/);
  assert.equal(result.dependencyAdded, false);
  assert.equal(result.serviceStarted, false);
  assert.equal(result.networkActivated, false);
});

test("Gate 6 commissioning IP is rejected as a permanent origin", () => {
  const value = clone(policy); value.canonicalOrigin = "https://192.168.50.169:9761";
  rejects(() => validateClientAccessPolicy(value), "gate7a-canonical-origin-invalid");
});

test("localhost is rejected as a permanent origin", () => {
  const value = clone(policy); value.canonicalOrigin = "https://localhost";
  rejects(() => validateClientAccessPolicy(value), "gate7a-canonical-origin-invalid");
});

test("HTTP and a non-standard production port are rejected", () => {
  const http = clone(policy); http.canonicalOrigin = "http://runa.example.com";
  rejects(() => validateClientAccessPolicy(http), "gate7a-canonical-origin-invalid");
  const port = clone(policy); port.canonicalOrigin = "https://runa.example.com:9761";
  rejects(() => validateClientAccessPolicy(port), "gate7a-canonical-origin-invalid");
});

test("canonical origin serialization is exact", () => {
  const slash = clone(policy); slash.canonicalOrigin = "https://runa.example.com/";
  rejects(() => validateClientAccessPolicy(slash), "gate7a-canonical-origin-invalid");
  const upper = clone(policy); upper.canonicalOrigin = "https://RUNA.example.com";
  rejects(() => validateClientAccessPolicy(upper), "gate7a-canonical-origin-invalid");
});

test("a browser-visible localhost issuer is rejected", () => {
  const value = clone(policy); value.keycloak.browserIssuer = "http://localhost:9762/realms/runaai-next";
  rejects(() => validateClientAccessPolicy(value), "gate7a-browser-issuer-invalid");
});

test("an incorrect Keycloak relative path or realm is rejected", () => {
  const path = clone(policy); path.keycloak.browserIssuer = "https://runa.example.com/realms/runaai-next";
  rejects(() => validateClientAccessPolicy(path), "gate7a-browser-issuer-invalid");
  const realm = clone(policy); realm.keycloak.browserIssuer = "https://runa.example.com/auth/realms/master";
  rejects(() => validateClientAccessPolicy(realm), "gate7a-browser-issuer-invalid");
});

test("the private Keycloak service cannot move off its loopback issuer", () => {
  const value = clone(policy); value.keycloak.internalIssuer = "http://192.168.50.169:9762/realms/runaai-next";
  rejects(() => validateClientAccessPolicy(value), "gate7a-browser-issuer-invalid");
});

test("WebAuthn RP ID must equal the canonical hostname", () => {
  const value = clone(policy); value.webauthn.relyingPartyId = "example.com";
  rejects(() => validateClientAccessPolicy(value), "gate7a-webauthn-origin-mismatch");
});

test("OIDC redirects and web origins are exact and wildcard-free", () => {
  const redirect = clone(policy); redirect.keycloak.redirectUris = ["https://runa.example.com/*"];
  rejects(() => validateClientAccessPolicy(redirect), "gate7a-oidc-client-boundary-invalid");
  const origin = clone(policy); origin.keycloak.webOrigins = ["https://other.example.com"];
  rejects(() => validateClientAccessPolicy(origin), "gate7a-oidc-client-boundary-invalid");
});

test("public registration, shared accounts, and reusable invitations are rejected", () => {
  const registration = clone(policy); registration.keycloak.publicSelfRegistration = true;
  rejects(() => validateClientAccessPolicy(registration), "gate7a-account-boundary-invalid");
  const shared = clone(policy); shared.accounts.sharedAccountsAllowed = true;
  rejects(() => validateClientAccessPolicy(shared), "gate7a-account-boundary-invalid");
  const invitation = clone(policy); invitation.accounts.invitationSingleUse = false;
  rejects(() => validateClientAccessPolicy(invitation), "gate7a-account-boundary-invalid");
});

test("passkeys require verified discoverable credentials and independent recovery", () => {
  const verification = clone(policy); verification.webauthn.userVerification = "preferred";
  rejects(() => validateClientAccessPolicy(verification), "gate7a-passkey-boundary-invalid");
  const recovery = clone(policy); recovery.webauthn.independentRecoveryRequired = false;
  rejects(() => validateClientAccessPolicy(recovery), "gate7a-passkey-boundary-invalid");
  const count = clone(policy); count.webauthn.ownerMinimumCredentials = 1;
  rejects(() => validateClientAccessPolicy(count), "gate7a-passkey-boundary-invalid");
});

test("platform, synced, and cross-device passkeys remain available for the client matrix", () => {
  for (const field of ["platformPasskeysAllowed", "syncedPasskeysAllowed", "crossDevicePasskeysAllowed"]) {
    const value = clone(policy); value.webauthn[field] = false;
    rejects(() => validateClientAccessPolicy(value), "gate7a-passkey-boundary-invalid");
  }
});

test("browser sessions must be encrypted, opaque, secure, host-only, and online-revocable", () => {
  const storage = clone(policy); storage.sessions.storage = "memory";
  rejects(() => validateClientAccessPolicy(storage), "gate7a-session-boundary-invalid");
  const cookie = clone(policy); cookie.sessions.cookie.secure = false;
  rejects(() => validateClientAccessPolicy(cookie), "gate7a-session-boundary-invalid");
  const revocation = clone(policy); revocation.sessions.onlineRevocationRequired = false;
  rejects(() => validateClientAccessPolicy(revocation), "gate7a-session-boundary-invalid");
});

test("governed work requires a fresh passkey and OpenFGA before protected work", () => {
  const stepUp = clone(policy); stepUp.governance.freshPasskeyStepUpRequired = false;
  rejects(() => validateClientAccessPolicy(stepUp), "gate7a-step-up-boundary-invalid");
  const stale = clone(policy); stale.governance.stepUpMaximumSeconds = 301;
  rejects(() => validateClientAccessPolicy(stale), "gate7a-step-up-boundary-invalid");
  const fga = clone(policy); fga.governance.openFgaBeforeProtectedWork = false;
  rejects(() => validateClientAccessPolicy(fga), "gate7a-step-up-boundary-invalid");
});

test("private CA, browser exceptions, and non-standard TLS are rejected", () => {
  const ca = clone(policy); ca.ingress.certificateTrust = "private-ca";
  rejects(() => validateClientAccessPolicy(ca), "gate7a-certificate-boundary-invalid");
  const exception = clone(policy); exception.ingress.certificateTrust = "browser-exception";
  rejects(() => validateClientAccessPolicy(exception), "gate7a-certificate-boundary-invalid");
  const port = clone(policy); port.ingress.tlsPort = 9761;
  rejects(() => validateClientAccessPolicy(port), "gate7a-certificate-boundary-invalid");
});

test("direct router forwarding and Control administration exposure are rejected", () => {
  const forwarding = clone(policy); forwarding.ingress.directRouterPortForward = true;
  rejects(() => validateClientAccessPolicy(forwarding), "gate7a-ingress-boundary-invalid");
  const admin = clone(policy); admin.ingress.controlAdministrativeRouteExposed = true;
  rejects(() => validateClientAccessPolicy(admin), "gate7a-ingress-boundary-invalid");
});

test("only Caddy is client-reachable", () => {
  const app = clone(policy); app.services.application.clientReachable = true;
  rejects(() => validateClientAccessPolicy(app), "gate7a-policy-invalid");
  const caddy = clone(policy); caddy.services.caddy.clientReachable = false;
  rejects(() => validateClientAccessPolicy(caddy), "gate7a-listener-boundary-invalid");
});

test("Home can be called only by Control and never by a browser", () => {
  const reachable = clone(policy); reachable.services.homeProvider.clientReachable = true;
  rejects(() => validateClientAccessPolicy(reachable), "gate7a-listener-boundary-invalid");
  const caller = clone(policy); caller.services.homeProvider.allowedCaller = "any-client";
  rejects(() => validateClientAccessPolicy(caller), "gate7a-listener-boundary-invalid");
});

test("the representative matrix contains five exact individual client cases", () => {
  const value = validateClientMatrix(matrix);
  assert.equal(value.cases.length, 5);
  assert.equal(new Set(value.cases.map(item => item.principalClass)).size, 2);
  assert.equal(new Set(value.cases.map(item => item.network)).size, 2);
  assert.equal(new Set(value.cases.map(item => item.clientClass)).size, 2);
});

test("missing, duplicate, or changed client cases fail closed", () => {
  const missing = clone(matrix); missing.cases.pop();
  rejects(() => validateClientMatrix(missing), "gate7a-client-matrix-invalid");
  const duplicate = clone(matrix); duplicate.cases[4].id = duplicate.cases[0].id;
  rejects(() => validateClientMatrix(duplicate), "gate7a-client-matrix-invalid");
  const changed = clone(matrix); changed.cases[0].freshStepUpRequired = false;
  rejects(() => validateClientMatrix(changed), "gate7a-client-matrix-invalid");
});

test("missing matrix assertions fail closed", () => {
  const value = clone(matrix); value.requiredAssertions.pop();
  rejects(() => validateClientMatrix(value), "gate7a-client-matrix-invalid");
});
