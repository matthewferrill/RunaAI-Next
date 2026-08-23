import { isIP } from "node:net";
import { z } from "zod";
import { validateClientAccessPolicy } from "./access-policy.mjs";
import {
  GATE7A_HOSTNAME_DECISION_VERSION,
  GATE7A_HOSTNAME_READINESS_VERSION,
} from "./formats.mjs";

const hostname = z.string().min(4).max(253).regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);
const decisionSchema = z.object({
  schemaVersion: z.literal(GATE7A_HOSTNAME_DECISION_VERSION),
  approvedHostname: hostname,
  approvedOrigin: z.string().url().max(500),
  registrableDomain: hostname,
  dnsAuthority: z.object({
    provider: z.literal("porkbun"),
    authoritativeNameServers: z.array(hostname).length(4),
    selectedHostRecordState: z.literal("absent"),
    proposedLanRecordType: z.literal("A"),
    proposedLanRecordTarget: z.ipv4(),
    changeApplied: z.literal(false),
  }).strict(),
  certificate: z.object({
    requiredTrust: z.literal("public-webpki"),
    recommendedSource: z.literal("porkbun-managed-wildcard-bundle"),
    installedForSelectedHostname: z.literal(false),
    renewalAutomationRequired: z.literal(true),
  }).strict(),
  offLan: z.object({
    mode: z.literal("disabled"),
    providerSelected: z.literal(false),
  }).strict(),
  nonOwnerFixtureSelected: z.literal(false),
  liveChangesAuthorized: z.literal(false),
  privateValuesIncluded: z.literal(false),
}).strict();

const coded = (code, message) => Object.assign(new Error(message), { code });

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

export function validateHostnameDecision(input) {
  let parsed;
  try { parsed = decisionSchema.parse(structuredClone(input)); }
  catch (error) { throw coded("gate7a-hostname-decision-invalid", error.message); }

  let origin;
  try { origin = new URL(parsed.approvedOrigin); }
  catch { throw coded("gate7a-hostname-decision-invalid", "The approved origin is invalid."); }

  const expectedNameservers = [
    "curitiba.ns.porkbun.com",
    "fortaleza.ns.porkbun.com",
    "maceio.ns.porkbun.com",
    "salvador.ns.porkbun.com",
  ];
  const actualNameservers = [...parsed.dnsAuthority.authoritativeNameServers].sort();
  if (parsed.approvedOrigin !== origin.origin || origin.protocol !== "https:" || origin.port
      || origin.pathname !== "/" || origin.search || origin.hash
      || origin.hostname !== parsed.approvedHostname || isIP(parsed.approvedHostname) !== 0
      || parsed.approvedHostname === parsed.registrableDomain
      || !parsed.approvedHostname.endsWith(`.${parsed.registrableDomain}`)
      || JSON.stringify(actualNameservers) !== JSON.stringify(expectedNameservers)
      || !parsed.dnsAuthority.proposedLanRecordTarget.startsWith("192.168.50.")) {
    throw coded("gate7a-hostname-decision-invalid",
      "The approved hostname, Porkbun authority, or bounded LAN projection is inconsistent.");
  }
  return deepFreeze(parsed);
}

export function createSelectedClientAccessPolicy(decisionInput, templateInput) {
  const decision = validateHostnameDecision(decisionInput);
  const selected = structuredClone(templateInput);
  selected.canonicalOrigin = decision.approvedOrigin;
  selected.keycloak.browserIssuer = `${decision.approvedOrigin}/auth/realms/runaai-next`;
  selected.keycloak.redirectUris = [`${decision.approvedOrigin}/session/callback`];
  selected.keycloak.webOrigins = [decision.approvedOrigin];
  selected.webauthn.relyingPartyId = decision.approvedHostname;
  return validateClientAccessPolicy(selected);
}

export function createHostnameDecisionReadiness(decisionInput, templateInput) {
  const decision = validateHostnameDecision(decisionInput);
  const policy = createSelectedClientAccessPolicy(decision, templateInput);
  return deepFreeze({
    schemaVersion: GATE7A_HOSTNAME_READINESS_VERSION,
    passed: true,
    approvedHostname: decision.approvedHostname,
    canonicalOrigin: policy.canonicalOrigin,
    browserIssuer: policy.keycloak.browserIssuer,
    relyingPartyId: policy.webauthn.relyingPartyId,
    redirectUri: policy.keycloak.redirectUris[0],
    dnsProvider: decision.dnsAuthority.provider,
    certificateSourceRecommendation: decision.certificate.recommendedSource,
    hostnameDecisionComplete: true,
    omenDirectAccessReady: false,
    liveDeploymentReady: false,
    remainingBlockers: Object.freeze([
      "dns-certificate-activation",
      "off-lan-ingress-privacy",
      "non-owner-acceptance-fixture",
    ]),
    dnsChangeApplied: false,
    certificateInstalled: false,
    offLanIngressActivated: false,
    productionChanged: false,
    privateValuesIncluded: false,
  });
}
