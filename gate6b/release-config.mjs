import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { canonicalJson } from "../gate4/canonical.mjs";
import { validateReleaseBoundary, secretReferenceStatus } from "../gate5/operations.mjs";
import { explicitModelRolesSchema } from "../gate7f/function-first/model-roles.mjs";
import { m1FunctionConfigSchema, assertM1Roles } from "../gate7f/function-first/config.mjs";

const secretRef = z.string().regex(/^(env|file|vault|secret-store):[A-Za-z0-9._/-]{1,200}$/);
const url = z.string().url().max(500);
const bounded = z.string().min(1).max(200);
const absolutePath = z.string().min(3).max(4096).refine(isAbsolute, "absolute path required");
const service = z.object({ version: bounded, configurationDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const gate6c = z.object({ enabled: z.boolean(), legacyCommit: z.string().regex(/^[a-f0-9]{40}$/),
  expectedPrincipalId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/) }).strict();
const gate7a = z.object({ enabled: z.literal(true), canonicalOrigin: url,
  relyingPartyId: bounded, predecessorManifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  ordinaryClient: z.object({
    clientId: z.literal("runaai-next-user"),
    redirectUri: url,
    clientCredentialRef: secretRef,
  }).strict(),
}).strict();
const publicGitSource = z.object({
  environmentId: z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/),
  displayName: z.string().min(1).max(120),
  repositoryHttpsUrl: z.string().min(1).max(2048),
  requestedRef: z.string().min(1).max(255),
  expectedCommitOid: z.string().regex(/^[a-f0-9]{40}$/),
}).strict();
const nativeCandidate = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }).strict(),
  z.object({ enabled: z.literal(true), protectedWorkspaceParent: absolutePath }).strict(),
]);
const serverWorkspace = z.object({
  sourceDefinition: publicGitSource,
  nativeCandidate: nativeCandidate.optional(),
}).strict();
const legacySchema = z.object({
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
  keycloak: z.object({ issuer: url, backchannelIssuer: url.optional(), clientId: bounded,
    clientCredentialRef: secretRef }).strict(),
  gate6c: gate6c.optional(),
  gate7a: gate7a.optional(),
  openfga: z.object({ baseUrl: url, storeId: bounded, modelId: bounded, credentialRef: secretRef }).strict(),
  provider: z.object({ baseUrl: url, modelId: bounded }).strict(),
  services: z.object({ postgresql: service, keycloak: service, openfga: service, caddy: service }).strict(),
  limits: z.object({ maxRequestBytes: z.number().int().min(1).max(1_048_576),
    totalDeadlineMs: z.number().int().min(100).max(120_000),
    upstreamDeadlineMs: z.number().int().min(50).max(119_999) }).strict(),
}).strict();

const roleSchema = legacySchema.extend({
  schemaVersion: z.literal("runa2-gate6b-release-config/v2"),
  provider: explicitModelRolesSchema,
  functionFirst: m1FunctionConfigSchema.optional(),
});
const nativeRoleSchema = roleSchema.extend({
  schemaVersion: z.literal("runa2-gate6b-release-config/v3"),
  serverWorkspace,
});
const schema = z.discriminatedUnion("schemaVersion", [legacySchema, roleSchema, nativeRoleSchema]);

const coded = (code, message) => Object.assign(new Error(message), { code });
const sha256 = value => createHash("sha256").update(value).digest("hex");

function releaseBoundary(config, modelId = config.provider.modelId) {
  const secretRefs = { databaseUrl: config.databaseUrlRef, ...config.keyRefs,
    keycloakClient: config.keycloak.clientCredentialRef,
    ...(config.gate7a?.ordinaryClient
      ? { ordinaryKeycloakClient: config.gate7a.ordinaryClient.clientCredentialRef } : {}),
    openfgaCredential: config.openfga.credentialRef };
  return {
    profile: "release", bindHost: "127.0.0.1", scheme: "https",
    tls: { mode: "internal", clientAuth: "none" }, clientAuthenticationRequired: false,
    effectRetries: 0,
    deadlines: { totalMs: config.limits.totalDeadlineMs, upstreamMs: config.limits.upstreamDeadlineMs },
    maxRequestBytes: config.limits.maxRequestBytes,
    provider: { baseUrl: config.provider.baseUrl, expectedModel: modelId, presentedModel: modelId },
    secretRefs,
  };
}

function freezeConfig(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeConfig(child);
    Object.freeze(value);
  }
  return value;
}

export async function loadReleaseConfig(path) {
  let parsed;
  try { parsed = schema.parse(JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""))); }
  catch { throw coded("release-config-invalid", "The release configuration could not be read or validated."); }
  if (parsed.limits.upstreamDeadlineMs >= parsed.limits.totalDeadlineMs) {
    throw coded("release-config-invalid", "The upstream deadline must be shorter than the total deadline.");
  }
  if (parsed.gate7a?.enabled === true) {
    let origin;
    try { origin = new URL(parsed.gate7a.canonicalOrigin); }
    catch { throw coded("release-config-gate7a-invalid", "The canonical Gate 7A origin is invalid."); }
    const expectedIssuer = `${origin.origin}/auth/realms/runaai-next`;
    if (origin.protocol !== "https:" || origin.origin !== parsed.gate7a.canonicalOrigin
        || origin.hostname !== parsed.gate7a.relyingPartyId || origin.port
        || parsed.publicBaseUrl !== origin.origin || parsed.keycloak.issuer !== expectedIssuer
        || parsed.keycloak.backchannelIssuer !== "http://127.0.0.1:9762/realms/runaai-next"
        || parsed.gate7a.ordinaryClient.redirectUri !== `${origin.origin}/session/user/callback`
        || parsed.gate6c?.enabled !== true) {
      throw coded("release-config-gate7a-invalid", "The Gate 7A origin, issuer, backchannel, RP ID, and owner-session boundary must be exact.");
    }
  }
  const explicit = parsed.schemaVersion !== "runa2-gate6b-release-config/v1";
  if (parsed.functionFirst) {
    assertM1Roles(parsed.provider);
    if (!parsed.gate7a?.ordinaryClient) throw coded("release-config-m1-session-required", "M1 functions require the ordinary browser session client.");
  }
  if (parsed.serverWorkspace && !parsed.functionFirst) {
    throw coded("release-config-server-workspace-requires-m1",
      "A server workspace requires the M1 function surface.");
  }
  if (explicit && !["chat", "research", "code"].some(role => parsed.provider.models[role] !== null)) {
    throw coded("release-config-invalid", "At least one existing answer role must be configured.");
  }
  const modelIds = explicit ? Object.values(parsed.provider.models).filter(value => value !== null)
    : [parsed.provider.modelId];
  const boundaries = modelIds.map(modelId => releaseBoundary(parsed, modelId));
  for (const boundary of boundaries) {
    const checked = validateReleaseBoundary(boundary);
    if (!checked.passed) throw coded("release-config-boundary-invalid", checked.problems.join(","));
  }
  return Object.freeze({ path: resolve(path), directory: dirname(resolve(path)), value: freezeConfig(parsed),
    configurationDigest: sha256(canonicalJson(parsed)), boundary: freezeConfig(boundaries[0]) });
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
    ...(loaded.value.gate7a?.ordinaryClient
      ? { ordinaryKeycloakClient: loaded.value.gate7a.ordinaryClient.clientCredentialRef } : {}),
    openfgaCredential: loaded.value.openfga.credentialRef };
  return Object.freeze({ schemaVersion: "runa2-gate6b-config-status/v1",
    configurationDigest: loaded.configurationDigest,
    secretReferences: secretReferenceStatus(secretRefs, telemetryKey),
    privateValuesIncluded: false });
}
