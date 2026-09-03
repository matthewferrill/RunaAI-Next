import { createHash, createPublicKey, randomBytes, sign, verify } from "node:crypto";

const coded = (code, message = code) => Object.assign(new Error(message), { code });
const ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u;
const HEX_64 = /^[a-f0-9]{64}$/u;
const B64URL = /^[A-Za-z0-9_-]+$/u;

export const LOCAL_CONTEXT_SCHEMAS = Object.freeze({
  capability: "runa-local-read-capability/v1",
  request: "runa-omen-local-request/v1",
  redemption: "runa-local-redemption/v1",
  completion: "runa-local-completion/v1",
  result: "runa-omen-local-result/v1",
  error: "runa-omen-local-error/v1",
  lifecycle: "runa-local-connection/v1",
  protection: "runa-local-protected-source/v1",
  containment: "runa-omen-git-readonly/v1",
});

export const LOCAL_CONTEXT_LIMITS = Object.freeze({
  roots: 8, displayNameCharacters: 80, canonicalPathCharacters: 1024,
  pendingCandidates: 16, candidateLifetimeMs: 120_000, requestBytes: 64 * 1024,
  concurrentRequests: 2, operationDeadlineMs: 15_000, responseBytes: 512 * 1024,
  capabilityLifetimeMs: 30_000, clockSkewMs: 10_000, fileBytes: 256 * 1024,
  returnedTextBytes: 64 * 1024, returnedTextLines: 400,
});

export const LOCAL_CONTEXT_OPERATIONS = Object.freeze([
  "folder-preview", "tree", "text-read", "git-status", "git-log", "git-diffstat",
  "git-branches", "git-remotes", "git-show-commit", "connection-test", "root-remove",
]);
const OPERATION_SET = new Set(LOCAL_CONTEXT_OPERATIONS);

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw coded("local-contract-value-invalid");
}

export const localSha256 = value => createHash("sha256").update(
  Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : canonicalJson(value)),
).digest("hex");

function exactObject(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) throw coded(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw coded(code);
  return value;
}

function identifier(value, code) {
  if (typeof value !== "string" || !ID.test(value)) throw coded(code);
  return value;
}

function timestamp(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw coded(code);
  return value;
}

function publicKey(value, code) {
  if (typeof value !== "string" || value.length < 32 || value.length > 256 || !B64URL.test(value)) throw coded(code);
  try { createPublicKey({ key: Buffer.from(value, "base64url"), format: "der", type: "spki" }); }
  catch { throw coded(code); }
  return value;
}

export function browserKeyThumbprint(browserPublicKey) {
  publicKey(browserPublicKey, "local-browser-key-invalid");
  return createHash("sha256").update(Buffer.from(browserPublicKey, "base64url")).digest("base64url");
}

export function validateCapabilityPayload(input, { now = new Date(), permitExpired = false } = {}) {
  const keys = ["schemaVersion", "capabilityId", "issuer", "audienceDeviceId", "bootEpoch",
    "browserPublicKey", "browserKeyThumbprint", "participantPseudonym", "projectId", "connectionId",
    "rootId", "operation", "argumentDigest", "capabilitySetVersion", "issuedAt", "expiresAt", "nonce"];
  const value = exactObject(input, keys, "local-capability-invalid");
  if (value.schemaVersion !== LOCAL_CONTEXT_SCHEMAS.capability) throw coded("local-capability-version-invalid");
  for (const key of ["capabilityId", "issuer", "audienceDeviceId", "participantPseudonym", "projectId",
    "connectionId", "rootId"]) identifier(value[key], "local-capability-field-invalid");
  if (!HEX_64.test(value.bootEpoch) || !HEX_64.test(value.argumentDigest)) throw coded("local-capability-digest-invalid");
  publicKey(value.browserPublicKey, "local-browser-key-invalid");
  if (value.browserKeyThumbprint !== browserKeyThumbprint(value.browserPublicKey)) throw coded("local-browser-key-mismatch");
  if (!OPERATION_SET.has(value.operation)) throw coded("local-operation-invalid");
  if (!Number.isSafeInteger(value.capabilitySetVersion) || value.capabilitySetVersion < 1) {
    throw coded("local-capability-version-invalid");
  }
  timestamp(value.issuedAt, "local-capability-time-invalid");
  timestamp(value.expiresAt, "local-capability-time-invalid");
  const issued = Date.parse(value.issuedAt), expires = Date.parse(value.expiresAt), current = now.getTime();
  if (expires <= issued || expires - issued > LOCAL_CONTEXT_LIMITS.capabilityLifetimeMs) {
    throw coded("local-capability-time-invalid");
  }
  if (!permitExpired && (current < issued - LOCAL_CONTEXT_LIMITS.clockSkewMs
      || current > expires + LOCAL_CONTEXT_LIMITS.clockSkewMs)) throw coded("local-capability-expired");
  if (typeof value.nonce !== "string" || value.nonce.length !== 43 || !B64URL.test(value.nonce)) {
    throw coded("local-capability-nonce-invalid");
  }
  return Object.freeze({ ...value });
}

export function createSignedCapability(input, privateKey, { now = new Date() } = {}) {
  const payload = validateCapabilityPayload({ schemaVersion: LOCAL_CONTEXT_SCHEMAS.capability,
    capabilityId: input.capabilityId, issuer: input.issuer, audienceDeviceId: input.audienceDeviceId,
    bootEpoch: input.bootEpoch, browserPublicKey: input.browserPublicKey,
    browserKeyThumbprint: browserKeyThumbprint(input.browserPublicKey),
    participantPseudonym: input.participantPseudonym, projectId: input.projectId,
    connectionId: input.connectionId, rootId: input.rootId, operation: input.operation,
    argumentDigest: input.argumentDigest, capabilitySetVersion: input.capabilitySetVersion,
    issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + LOCAL_CONTEXT_LIMITS.capabilityLifetimeMs).toISOString(),
    nonce: input.nonce ?? randomBytes(32).toString("base64url") }, { now });
  const encoded = Buffer.from(canonicalJson(payload)).toString("base64url");
  return `${encoded}.${sign(null, Buffer.from(encoded), privateKey).toString("base64url")}`;
}

export function verifySignedCapability(token, issuerPublicKey, options = {}) {
  if (typeof token !== "string" || token.length > 8192) throw coded("local-capability-token-invalid");
  const parts = token.split(".");
  if (parts.length !== 2 || parts.some(part => !B64URL.test(part))) throw coded("local-capability-token-invalid");
  if (!verify(null, Buffer.from(parts[0]), issuerPublicKey, Buffer.from(parts[1], "base64url"))) {
    throw coded("local-capability-signature-invalid");
  }
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
  catch { throw coded("local-capability-token-invalid"); }
  return validateCapabilityPayload(payload, options);
}

export function validateLocalRequest(input) {
  const keys = ["schemaVersion", "requestId", "connectionId", "rootId", "operation", "arguments",
    "controlCapability", "companionNonce", "bootEpoch", "browserPublicKey", "browserKeyThumbprint", "browserProof"];
  const value = exactObject(input, keys, "local-request-invalid");
  if (value.schemaVersion !== LOCAL_CONTEXT_SCHEMAS.request) throw coded("local-request-version-invalid");
  for (const key of ["requestId", "connectionId", "rootId"]) identifier(value[key], "local-request-field-invalid");
  if (!OPERATION_SET.has(value.operation)) throw coded("local-operation-invalid");
  if (!value.arguments || typeof value.arguments !== "object" || Array.isArray(value.arguments)
      || Buffer.byteLength(canonicalJson(value.arguments)) > LOCAL_CONTEXT_LIMITS.requestBytes) {
    throw coded("local-request-arguments-invalid");
  }
  if (typeof value.controlCapability !== "string" || value.controlCapability.length > 8192
      || typeof value.companionNonce !== "string" || value.companionNonce.length !== 43
      || !B64URL.test(value.companionNonce) || !HEX_64.test(value.bootEpoch)) throw coded("local-request-field-invalid");
  publicKey(value.browserPublicKey, "local-browser-key-invalid");
  if (value.browserKeyThumbprint !== browserKeyThumbprint(value.browserPublicKey)
      || typeof value.browserProof !== "string" || !B64URL.test(value.browserProof)) {
    throw coded("local-browser-proof-invalid");
  }
  return Object.freeze({ ...value, arguments: Object.freeze({ ...value.arguments }) });
}

export function browserProofInput(request) {
  return canonicalJson({ requestId: request.requestId, connectionId: request.connectionId,
    rootId: request.rootId, operation: request.operation, argumentDigest: localSha256(request.arguments),
    companionNonce: request.companionNonce, bootEpoch: request.bootEpoch });
}

export function verifyBrowserProof(request) {
  const value = validateLocalRequest(request);
  const key = createPublicKey({ key: Buffer.from(value.browserPublicKey, "base64url"), format: "der", type: "spki" });
  if (!verify(null, Buffer.from(browserProofInput(value)), key, Buffer.from(value.browserProof, "base64url"))) {
    throw coded("local-browser-proof-invalid");
  }
  return value;
}

const deniedSegments = new Set([".ssh", ".gnupg", ".aws", ".azure", ".kube", ".docker", ".git"]);
const deniedBasenames = new Set([".env", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", ".netrc",
  "_netrc", ".npmrc", ".pypirc", "credentials", "credentials.json", "secrets.json"]);
const deniedExtensions = [".pem", ".key", ".pfx", ".p12", ".keystore", ".jks", ".kdbx"];
const directPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/u,
  /AKIA[0-9A-Z]{16}/u,
  /gh[pousr]_[A-Za-z0-9]{36,255}/u,
  /github_pat_[A-Za-z0-9_]{20,255}/u,
  /sk-[A-Za-z0-9_-]{20,}/u,
  /xox[baprs]-[A-Za-z0-9-]{10,}/u,
];
const assignment = /^\s*(password|passwd|pwd|secret|client_secret|api-key|api_key|access-token|access_token|refresh-token|refresh_token)\s*[:=]\s*(.*?)\s*$/iu;
const exceptions = new Set(["", "example", "changeme", "<redacted>", "redacted"]);

export function protectedPathReason(relativePath, { internalGit = false } = {}) {
  if (typeof relativePath !== "string" || relativePath.length === 0
      || relativePath.length > LOCAL_CONTEXT_LIMITS.canonicalPathCharacters || relativePath.includes("\0")) {
    return "invalid-path";
  }
  const parts = relativePath.replaceAll("\\", "/").split("/").filter(Boolean);
  const lowered = parts.map(part => part.toLowerCase());
  if (lowered.some(part => deniedSegments.has(part) && !(internalGit && part === ".git"))) return "protected-name";
  const basename = lowered.at(-1) ?? "";
  if (deniedBasenames.has(basename) || basename.startsWith(".env.")) return "protected-name";
  if (deniedExtensions.some(extension => basename.endsWith(extension))) return "protected-name";
  return null;
}

function normalizedAssignmentValue(value) {
  let result = value.trim();
  if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

export function protectedContentReason(content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content));
  if (buffer.length > LOCAL_CONTEXT_LIMITS.fileBytes) return "oversize";
  const text = buffer.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(buffer)) return "invalid-utf8";
  if (directPatterns.some(pattern => pattern.test(text))) return "protected-content";
  for (const line of text.split(/\r?\n/u)) {
    const match = assignment.exec(line);
    if (!match) continue;
    const value = normalizedAssignmentValue(match[2]);
    if (exceptions.has(value.toLowerCase()) || /^\$\{[^}\r\n]+\}$/u.test(value)) continue;
    if (/^\S{8,}$/u.test(value)) return "protected-content";
  }
  return null;
}

export function assertReadableSource(relativePath, content) {
  if (protectedPathReason(relativePath)) throw coded("protected-source-denied");
  if (protectedContentReason(content)) throw coded("protected-source-denied");
  return true;
}
