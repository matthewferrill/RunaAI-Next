import { sha256 } from "../gate4/canonical.mjs";
import { buildReleaseManifest, releaseRuntimeStatus } from "./release.mjs";
import { evaluateReadiness, requiredReadinessFacts } from "./readiness.mjs";

const h = value => sha256(`gate6-synthetic\0${value}`);

export const SOURCE_GENERATION = "legacy-runaai:synthetic-source";
export const TARGET_GENERATION = "runaai-next:synthetic-target";

export function syntheticRelease() {
  return buildReleaseManifest({
    releaseId: "runaai-selected-core-2026-08-21",
    commit: "a986419919fc0f9756f790e8f8537d2f6010f1fa",
    artifactDigest: h("artifact"),
    configurationDigest: h("configuration"),
    applicationEntryPoint: "gate6/release-server.mjs",
    model: { provider: "openai-compatible-private", modelId: "qwen3-coder-30b-a3b-instruct",
      configurationDigest: h("model") },
    services: [
      { name: "postgresql", version: "18.6", configurationDigest: h("postgres") },
      { name: "keycloak", version: "26.7.2", configurationDigest: h("keycloak") },
      { name: "openfga", version: "1.18.3", configurationDigest: h("openfga") },
      { name: "caddy", version: "2.10.2", configurationDigest: h("caddy") },
    ],
  });
}

export function syntheticReleaseBoundary() {
  return {
    profile: "release", bindHost: "192.168.50.20", scheme: "https", port: 443,
    tls: { mode: "internal", clientAuth: "require-and-verify" }, clientAuthenticationRequired: true,
    effectRetries: 0, deadlines: { totalMs: 30_000, upstreamMs: 20_000 }, maxRequestBytes: 262_144,
    provider: { expectedModel: "qwen3-coder-30b-a3b-instruct", presentedModel: "qwen3-coder-30b-a3b-instruct",
      baseUrl: "http://127.0.0.1:1234/v1" },
    secretRefs: { database: "secret-store:runa/postgresql", oidc: "secret-store:runa/keycloak" },
  };
}

export function greenReadiness(profile = "candidate", manifest = syntheticRelease()) {
  const facts = Object.fromEntries(requiredReadinessFacts(profile).map(name => [name, true]));
  return evaluateReadiness({ manifest, releaseBoundary: syntheticReleaseBoundary(), facts, profile });
}

export function exactDomains(seed = "one") {
  return Object.fromEntries(["project-chat", "learning-events", "setting", "action-receipts"].map((domain, index) => [domain, {
    sourceCount: [100, 90, 1, 2][index], targetCount: [100, 90, 1, 2][index],
    sourceDigest: h(`${seed}:${domain}`), targetDigest: h(`${seed}:${domain}`),
  }]));
}

export function exactApprovedKnowledge(seed = "one") {
  return { sourceActive: 53, targetActive: 53,
    sourceScopeCounts: { personal: 1, project: 5, capability: 16, global: 31 },
    targetScopeCounts: { personal: 1, project: 5, capability: 16, global: 31 },
    sourceDigest: h(`${seed}:approved-knowledge`), targetDigest: h(`${seed}:approved-knowledge`) };
}

export function liveStatus(manifest, phase = "promoted", revision = 7) {
  return releaseRuntimeStatus({ manifest, authorityGeneration: TARGET_GENERATION, phase, revision });
}

export const liveChecks = Object.freeze({ selectedVerifierPassed: true, representativeTranscriptsPassed: true,
  effectReceiptPassed: true, postRestartHealthPassed: true, dependencyLossPassed: true,
  reconciliationStillExact: true, telemetryPrivacyPassed: true });
