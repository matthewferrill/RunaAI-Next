import { validateReleaseBoundary } from "../gate5/operations.mjs";
import { assertReleaseManifest } from "./release.mjs";

const CANDIDATE_FACTS = Object.freeze([
  "releaseApplicationEntrypointVerified", "releaseArtifactVerified", "targetPathDistinctFromLegacy",
  "sourceCheckoutCleanExact", "targetCheckoutCleanExact", "postgresqlPersistent",
  "keycloakPersistent", "openfgaPersistent", "privateTlsVerified", "secretsReferencedOnly",
  "backupVerified", "restoreVerifiedDistinctTarget", "providerModelExact", "runtimeStatusAvailable",
  "rollbackOwnerPresent", "legacyRollbackAvailable", "timeSynchronized", "capacityHeadroomVerified",
  "noPublicListener", "noProtectedOutput", "selectedVerifierAvailable",
]);
const PROMOTION_FACTS = Object.freeze([
  ...CANDIDATE_FACTS, "ownerCredentialVerified", "freshStepUpVerified", "protectedDeltaAuthorityReady",
  "sourceWriteFreezeReady", "zeroDeltaReconciliationReady",
]);

const coded = (code, message) => Object.assign(new Error(message), { code });

export function evaluateReadiness({ manifest, releaseBoundary, facts, profile = "candidate" }) {
  assertReleaseManifest(manifest);
  if (!new Set(["candidate", "promotion"]).has(profile)) throw coded("readiness-profile-invalid", "Readiness profile must be candidate or promotion.");
  const required = profile === "promotion" ? PROMOTION_FACTS : CANDIDATE_FACTS;
  const problems = [];
  const keys = Object.keys(facts ?? {}).sort();
  const unexpected = keys.filter(key => !required.includes(key));
  if (unexpected.length) problems.push(...unexpected.map(key => `unexpected-fact:${key}`));
  for (const fact of required) if (facts?.[fact] !== true) problems.push(`not-green:${fact}`);
  const boundary = validateReleaseBoundary(releaseBoundary);
  problems.push(...boundary.problems.map(problem => `release-boundary:${problem}`));
  const safeFacts = Object.fromEntries(required.map(fact => [fact, facts?.[fact] === true]));
  return Object.freeze({
    schemaVersion: "runa2-gate6-readiness/v1",
    profile,
    releaseManifestDigest: manifest.manifestDigest,
    facts: Object.freeze(safeFacts),
    releaseBoundaryPassed: boundary.passed,
    problems: Object.freeze(problems),
    passed: problems.length === 0,
    privateValuesIncluded: false,
  });
}

export const requiredReadinessFacts = profile => Object.freeze([...(profile === "promotion" ? PROMOTION_FACTS : CANDIDATE_FACTS)]);
