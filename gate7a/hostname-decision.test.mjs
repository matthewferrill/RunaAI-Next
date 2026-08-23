import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createHostnameDecisionReadiness,
  createSelectedClientAccessPolicy,
  validateHostnameDecision,
} from "./hostname-decision.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const read = async name => JSON.parse(await readFile(join(root, "fixtures", name), "utf8"));
const clone = value => structuredClone(value);
const rejects = (fn, code) => assert.throws(fn, error => error?.code === code);
const decision = await read("selected-hostname.json");
const template = await read("synthetic-policy.json");

test("the steward-approved hostname is exact, path-free, and bound to Porkbun authority", () => {
  const value = validateHostnameDecision(decision);
  assert.equal(value.approvedHostname, "runa.bridgebuildersai.com");
  assert.equal(value.approvedOrigin, "https://runa.bridgebuildersai.com");
  assert.equal(value.dnsAuthority.provider, "porkbun");
  assert.equal(Object.isFrozen(value), true);
});

test("the selected policy derives one exact origin, issuer, RP ID, and callback", () => {
  const policy = createSelectedClientAccessPolicy(decision, template);
  assert.equal(policy.canonicalOrigin, "https://runa.bridgebuildersai.com");
  assert.equal(policy.keycloak.browserIssuer,
    "https://runa.bridgebuildersai.com/auth/realms/runaai-next");
  assert.equal(policy.webauthn.relyingPartyId, "runa.bridgebuildersai.com");
  assert.deepEqual(policy.keycloak.redirectUris,
    ["https://runa.bridgebuildersai.com/session/callback"]);
});

test("an apex, path-based, or provider-drifted decision fails closed", () => {
  const apex = clone(decision);
  apex.approvedHostname = "bridgebuildersai.com";
  apex.approvedOrigin = "https://bridgebuildersai.com";
  rejects(() => validateHostnameDecision(apex), "gate7a-hostname-decision-invalid");

  const path = clone(decision);
  path.approvedOrigin = "https://bridgebuildersai.com/runaai";
  rejects(() => validateHostnameDecision(path), "gate7a-hostname-decision-invalid");

  const provider = clone(decision);
  provider.dnsAuthority.provider = "unknown";
  rejects(() => validateHostnameDecision(provider), "gate7a-hostname-decision-invalid");
});

test("hostname approval never claims DNS, certificate, off-LAN, or production activation", () => {
  const readiness = createHostnameDecisionReadiness(decision, template);
  assert.equal(readiness.hostnameDecisionComplete, true);
  assert.equal(readiness.omenDirectAccessReady, false);
  assert.equal(readiness.liveDeploymentReady, false);
  assert.deepEqual(readiness.remainingBlockers, [
    "dns-certificate-activation",
    "off-lan-ingress-privacy",
    "non-owner-acceptance-fixture",
  ]);
  assert.equal(readiness.dnsChangeApplied, false);
  assert.equal(readiness.certificateInstalled, false);
  assert.equal(readiness.offLanIngressActivated, false);
  assert.equal(readiness.productionChanged, false);
  assert.equal(readiness.privateValuesIncluded, false);
});
