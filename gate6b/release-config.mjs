import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { canonicalJson } from "../gate4/canonical.mjs";
import { validateReleaseBoundary, secretReferenceStatus } from "../gate5/operations.mjs";

const secretRef = z.string().regex(/^(env|file|vault|secret-store):[A-Za-z0-9._/-]{1,200}$/);
const url = z.string().url().max(500);
const bounded = z.string().min(1).max(200);
const service = z.object({ version: bounded, configurationDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const schema = z.object({
  schemaVersion: z.literal("runa2-gate6b-release-config/v1"),
  profile: z.literal("release"),
  mode: z.enum(["shadow", "active"]),
  bind: z.object({ host: z.literal("127.0.0.1"), port: z.number().int().min(1024).max(65535) }).strict(),
  publicBaseUrl: url,
  releaseManifestPath: bounded,
  sourceGeneration: bounded,
  targetGeneration: bounded,
  cutoverId: bounded,
  databaseUrlRef: secretRef,
  keyRefs: z.object({ coreEncryption: secretRef, coreHmac: secretRef, learningEncryption: secretRef,
    learningHmac: secretRef, telemetryHmac: secretRef }).strict(),
  keycloak: z.object({ issuer: url, clientId: bounded, clientCredentialRef: secretRef }).strict(),
  openfga: z.object({ baseUrl: url, storeId: bounded, modelId: bounded, credentialRef: secretRef }).strict(),
  provider: z.object({ baseUrl: url, modelId: bounded }).strict(),
  services: z.object({ postgresql: service, keycloak: service, openfga: service, caddy: service }).strict(),
  limits: z.object({ maxRequestBytes: z.number().int().min(1).max(1_048_576),
    totalDeadlineMs: z.number().int().min(100).max(120_000),
    upstreamDeadlineMs: z.number().int().min(50).max(119_999) }).strict(),
}).strict();

const coded = (code, message) => Object.assign(new Error(message), { code });
const sha256 = value => createHash("sha256").update(value).digest("hex");

function releaseBoundary(config) {
  const secretRefs = { databaseUrl: config.databaseUrlRef, ...config.keyRefs,
    keycloakClient: config.keycloak.clientCredentialRef, openfgaCredential: config.openfga.credentialRef };
  return {
    profile: "release", bindHost: "127.0.0.1", scheme: "https",
    tls: { mode: "internal", clientAuth: "none" }, clientAuthenticationRequired: false,
    effectRetries: 0,
    deadlines: { totalMs: config.limits.totalDeadlineMs, upstreamMs: config.limits.upstreamDeadlineMs },
    maxRequestBytes: config.limits.maxRequestBytes,
    provider: { baseUrl: config.provider.baseUrl, expectedModel: config.provider.modelId,
      presentedModel: config.provider.modelId },
    secretRefs,
  };
}

export async function loadReleaseConfig(path) {
  let parsed;
  try { parsed = schema.parse(JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""))); }
  catch (error) { throw coded("release-config-invalid", error.message); }
  if (parsed.limits.upstreamDeadlineMs >= parsed.limits.totalDeadlineMs) {
    throw coded("release-config-invalid", "The upstream deadline must be shorter than the total deadline.");
  }
  const boundary = releaseBoundary(parsed);
  const checked = validateReleaseBoundary(boundary);
  if (!checked.passed) throw coded("release-config-boundary-invalid", checked.problems.join(","));
  return Object.freeze({ path: resolve(path), directory: dirname(resolve(path)), value: Object.freeze(parsed),
    configurationDigest: sha256(canonicalJson(parsed)), boundary: Object.freeze(boundary) });
}

export async function readSecretReference(reference, configDirectory, { maximumBytes = 16_384 } = {}) {
  const [scheme, ...rest] = String(reference).split(":");
  const locator = rest.join(":");
  let value;
  if (scheme === "env") value = process.env[locator];
  else if (scheme === "file") {
    const path = isAbsolute(locator) ? locator : resolve(configDirectory, locator);
    const bytes = await readFile(path);
    if (bytes.length > maximumBytes) throw coded("secret-reference-too-large", "A secret reference exceeded its byte ceiling.");
    value = bytes.toString("utf8").trim();
  } else throw coded("secret-reference-provider-unavailable", "The configured secret provider is unavailable.");
  if (typeof value !== "string" || !value.length) throw coded("secret-reference-empty", "A required secret reference is empty.");
  return value;
}

export function decodeKey(value, name) {
  let bytes;
  try { bytes = Buffer.from(String(value), "base64url"); } catch { throw coded("secret-key-invalid", `${name} is invalid.`); }
  if (bytes.length !== 32) throw coded("secret-key-invalid", `${name} must decode to exactly 32 bytes.`);
  return bytes;
}

export function safeConfigurationStatus(loaded, telemetryKey) {
  const secretRefs = { databaseUrl: loaded.value.databaseUrlRef, ...loaded.value.keyRefs,
    keycloakClient: loaded.value.keycloak.clientCredentialRef,
    openfgaCredential: loaded.value.openfga.credentialRef };
  return Object.freeze({ schemaVersion: "runa2-gate6b-config-status/v1",
    configurationDigest: loaded.configurationDigest,
    secretReferences: secretReferenceStatus(secretRefs, telemetryKey),
    privateValuesIncluded: false });
}
