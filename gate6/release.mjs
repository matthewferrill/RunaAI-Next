import { canonicalJson, sha256 } from "../gate4/canonical.mjs";

export const GATE6_SCOPE_VERSION = "runa2-selected-core/2026-08-21";
export const GATE6_RELEASE_VERSION = "runa2-gate6-release/v1";

const coded = (code, message) => Object.assign(new Error(message), { code });
const digest = value => sha256(canonicalJson(value));
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hex40 = value => /^[a-f0-9]{40}$/.test(String(value));
const hex64 = value => /^[a-f0-9]{64}$/.test(String(value));
const bounded = (value, maximum = 200) => typeof value === "string" && value.length > 0 && value.length <= maximum;
const forbiddenKey = /secret|token|password|cookie|authorization|private.?key|credential|ciphertext|recovery/i;

function rejectSecretFields(value, path = "manifest") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKey.test(key)) throw coded("release-secret-field-forbidden", `Secret-like release field is forbidden at ${path}.${key}.`);
    rejectSecretFields(child, `${path}.${key}`);
  }
}

function parseService(service) {
  if (!exactKeys(service, ["name", "version", "configurationDigest"])) throw coded("release-service-invalid", "Each service identity must contain only name, version, and configurationDigest.");
  if (!bounded(service.name, 80) || !bounded(service.version, 120) || !hex64(service.configurationDigest)) throw coded("release-service-invalid", "A service identity is malformed.");
  return { name: service.name, version: service.version, configurationDigest: service.configurationDigest };
}

export function buildReleaseManifest(input) {
  rejectSecretFields(input);
  if (!exactKeys(input, ["releaseId", "commit", "artifactDigest", "configurationDigest", "applicationEntryPoint", "model", "services"])) {
    throw coded("release-manifest-shape-invalid", "The release manifest input has missing or unexpected fields.");
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(String(input.releaseId))) throw coded("release-id-invalid", "The release id is invalid.");
  if (!hex40(input.commit) || !hex64(input.artifactDigest) || !hex64(input.configurationDigest)) throw coded("release-digest-invalid", "Release commit and digests must be exact.");
  if (!bounded(input.applicationEntryPoint, 240) || input.applicationEntryPoint.includes("..")) throw coded("release-entrypoint-invalid", "The production application entry point is invalid.");
  if (!exactKeys(input.model, ["provider", "modelId", "configurationDigest"]) || !bounded(input.model.provider, 100)
      || !bounded(input.model.modelId, 160) || !hex64(input.model.configurationDigest)) throw coded("release-model-invalid", "The exact model identity is required.");
  if (!Array.isArray(input.services) || input.services.length < 4) throw coded("release-services-incomplete", "PostgreSQL, Keycloak, OpenFGA, and Caddy service identities are required.");
  const services = input.services.map(parseService).sort((left, right) => left.name.localeCompare(right.name));
  const names = new Set(services.map(service => service.name));
  for (const required of ["caddy", "keycloak", "openfga", "postgresql"]) if (!names.has(required)) throw coded("release-services-incomplete", `Required service identity is missing: ${required}.`);
  if (names.size !== services.length) throw coded("release-service-duplicate", "Service identities must be unique.");
  const base = {
    schemaVersion: GATE6_RELEASE_VERSION,
    selectedScopeVersion: GATE6_SCOPE_VERSION,
    releaseId: input.releaseId,
    commit: input.commit,
    artifactDigest: input.artifactDigest,
    configurationDigest: input.configurationDigest,
    applicationEntryPoint: input.applicationEntryPoint,
    model: { ...input.model },
    services,
  };
  return Object.freeze({ ...base, manifestDigest: digest(base) });
}

export function assertReleaseManifest(manifest) {
  if (!exactKeys(manifest, ["schemaVersion", "selectedScopeVersion", "releaseId", "commit", "artifactDigest", "configurationDigest", "applicationEntryPoint", "model", "services", "manifestDigest"])) {
    throw coded("release-manifest-shape-invalid", "The release manifest has missing or unexpected fields.");
  }
  const rebuilt = buildReleaseManifest({ releaseId: manifest.releaseId, commit: manifest.commit,
    artifactDigest: manifest.artifactDigest, configurationDigest: manifest.configurationDigest,
    applicationEntryPoint: manifest.applicationEntryPoint, model: manifest.model, services: manifest.services });
  if (rebuilt.schemaVersion !== manifest.schemaVersion || rebuilt.selectedScopeVersion !== manifest.selectedScopeVersion
      || rebuilt.manifestDigest !== manifest.manifestDigest) throw coded("release-manifest-digest-mismatch", "The release manifest does not match its digest or selected scope.");
  return rebuilt;
}

export function releaseRuntimeStatus({ manifest, authorityGeneration, phase, revision }) {
  const accepted = assertReleaseManifest(manifest);
  return Object.freeze({
    schemaVersion: "runa2-gate6-runtime-status/v1",
    running: { commit: accepted.commit, artifactDigest: accepted.artifactDigest,
      releaseId: accepted.releaseId, applicationEntryPoint: accepted.applicationEntryPoint },
    selectedScopeVersion: accepted.selectedScopeVersion,
    manifestDigest: accepted.manifestDigest,
    authorityGeneration,
    cutover: { phase, revision },
    model: { ...accepted.model },
    services: accepted.services.map(service => ({ ...service })),
    privateValuesIncluded: false,
  });
}
