import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { assertReadableSource, browserKeyThumbprint, browserProofInput, canonicalJson,
  createSignedCapability, LOCAL_CONTEXT_SCHEMAS, localSha256, protectedContentReason,
  protectedPathReason, validateLocalRequest, verifyBrowserProof, verifySignedCapability }
  from "./local-context-contract.mjs";

const issuer = generateKeyPairSync("ed25519");
const browser = generateKeyPairSync("ed25519");
const browserPublicKey = browser.publicKey.export({ format: "der", type: "spki" }).toString("base64url");
const now = new Date("2026-09-02T14:00:00.000Z");
const baseCapability = {
  capabilityId: "cap-1", issuer: "control-candidate", audienceDeviceId: "omen-1",
  bootEpoch: "a".repeat(64), browserPublicKey, participantPseudonym: "participant-1",
  projectId: "project-1", connectionId: "connection-1", rootId: "root-1", operation: "text-read",
  argumentDigest: localSha256({ path: "notes/readme.txt" }), capabilitySetVersion: 1,
};

function request(overrides = {}) {
  const value = { schemaVersion: LOCAL_CONTEXT_SCHEMAS.request, requestId: "request-1",
    connectionId: "connection-1", rootId: "root-1", operation: "text-read",
    arguments: { path: "notes/readme.txt" }, controlCapability: "placeholder.token",
    companionNonce: "A".repeat(43), bootEpoch: "a".repeat(64), browserPublicKey,
    browserKeyThumbprint: browserKeyThumbprint(browserPublicKey), browserProof: "pending", ...overrides };
  value.browserProof = sign(null, Buffer.from(browserProofInput(value)), browser.privateKey).toString("base64url");
  return value;
}

test("canonical JSON is stable and rejects non-data values", () => {
  assert.equal(canonicalJson({ z: 1, a: { y: true, x: ["b", "a"] } }),
    '{"a":{"x":["b","a"],"y":true},"z":1}');
  assert.throws(() => canonicalJson({ callback() {} }), { code: "local-contract-value-invalid" });
});

test("one-use capability shape is signed, bounded and exact", () => {
  const token = createSignedCapability(baseCapability, issuer.privateKey, { now });
  const payload = verifySignedCapability(token, issuer.publicKey, { now });
  assert.equal(payload.browserPublicKey, browserPublicKey);
  assert.equal(payload.browserKeyThumbprint, browserKeyThumbprint(browserPublicKey));
  assert.equal(payload.argumentDigest, localSha256({ path: "notes/readme.txt" }));
  assert.throws(() => verifySignedCapability(`${token}x`, issuer.publicKey, { now }),
    { code: "local-capability-signature-invalid" });
  assert.throws(() => verifySignedCapability(token, issuer.publicKey,
    { now: new Date("2026-09-02T14:00:41.001Z") }), { code: "local-capability-expired" });
});

test("browser proof binds request, arguments, companion nonce and boot epoch", () => {
  const valid = request();
  assert.equal(verifyBrowserProof(valid).requestId, "request-1");
  for (const changed of [
    { ...valid, requestId: "request-2" },
    { ...valid, arguments: { path: "other.txt" } },
    { ...valid, companionNonce: "B".repeat(43) },
    { ...valid, bootEpoch: "b".repeat(64) },
  ]) assert.throws(() => verifyBrowserProof(changed), { code: "local-browser-proof-invalid" });
  assert.throws(() => validateLocalRequest({ ...valid, extra: true }), { code: "local-request-invalid" });
});

test("protected source v1 freezes denied names and the internal Git exception", () => {
  for (const path of [".env", "A/.ENV.local", "keys/id_ed25519", "auth/client.PFX",
    ".ssh/config", "repo/.git/config"]) assert.equal(protectedPathReason(path), "protected-name", path);
  assert.equal(protectedPathReason("repo/.git/config", { internalGit: true }), null);
  assert.equal(protectedPathReason("src/credential-helper.mjs"), null);
  assert.equal(protectedPathReason("docs/environment.md"), null);
});

test("protected source v1 scans the entire bounded file and keeps exact negative exceptions", () => {
  const secrets = [
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    `value AKIA${"A".repeat(16)}`,
    `github_pat_${"a".repeat(20)}`,
    `password=${"x".repeat(8)}`,
    `${"safe\n".repeat(14_000)}secret=${"z".repeat(12)}`,
  ];
  for (const value of secrets) assert.equal(protectedContentReason(value), "protected-content");
  for (const value of ["password=example", "secret=<redacted>", "api_key=${RUNA_API_KEY}",
    "const password = form.password;", "This prose discusses a password safely."]) {
    assert.equal(protectedContentReason(value), null, value);
  }
  assert.equal(assertReadableSource("src/example.mjs", "api_key=${RUNA_API_KEY}"), true);
  assert.throws(() => assertReadableSource("src/example.mjs", `sk-${"a".repeat(20)}`),
    { code: "protected-source-denied" });
});
