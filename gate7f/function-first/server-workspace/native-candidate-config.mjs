import { createHash, verify } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { canonicalStringify } from "./materialization-contracts.mjs";

const fail = code => Object.assign(new Error(code), { code });
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/u);
const publicKey = z.string().min(64).max(4096).regex(/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+-----END PUBLIC KEY-----\n$/u);
const absolutePath = z.string().min(3).max(4096).refine(isAbsolute, "absolute path required");
const moduleDirectory = dirname(fileURLToPath(import.meta.url));

export const NATIVE_CANDIDATE_MANIFEST_BASENAME = "m1-s2b1-native-control-release-manifest.json";
export const NATIVE_CANDIDATE_WATCHDOG_ENDPOINT = String.raw`\\.\pipe\runa-m1-s2b1-control-watchdog`;
export const NATIVE_CANDIDATE_MANIFEST_ALGORITHM = "ed25519";
// Release engineering replaces this unavailable key only in a reviewed source release. It is not configurable.
export const NATIVE_CANDIDATE_MANIFEST_PUBLIC_KEY_PEM = [
  "-----BEGIN PUBLIC KEY-----",
  "MCowBQYDK2VwAyEA//////////////////////////////////////////8=",
  "-----END PUBLIC KEY-----",
  "",
].join("\n");

const manifestMemberSchema = z.object({
  path: z.string().regex(/^[a-z0-9][a-z0-9._/-]{0,255}$/u),
  sha256: digest,
}).strict();
const candidateFactoryInputSchema = z.object({ enabled: z.boolean(),
  protectedWorkspaceParent: absolutePath }).strict();
const manifestSchema = z.object({
  schemaVersion: z.literal("runa-public-git-native-control-release-manifest/v1"),
  signingKeyId: id,
  signingKeyVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  watchdogIdentitySha256: digest,
  watchdogPublicKey: publicKey,
  members: z.array(manifestMemberSchema).min(1).max(64),
  signatureBase64: z.string().min(1).max(2048).refine(value => {
    try { return Buffer.from(value, "base64").toString("base64") === value; } catch { return false; }
  }, "canonical base64 signature required"),
}).strict();

const configSchema = z.object({
  schemaVersion: z.literal("runa-public-git-native-candidate-config/v1"),
  enabled: z.literal(true),
  releaseManifestPath: absolutePath,
  releaseRoot: absolutePath,
  protectedWorkspaceParent: absolutePath,
  watchdogEndpoint: z.literal(NATIVE_CANDIDATE_WATCHDOG_ENDPOINT),
  watchdogSigningKeyId: id,
  watchdogSigningKeyVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  watchdogPublicKey: publicKey,
  watchdogIdentitySha256: digest,
  workerReleaseSha256: digest,
}).strict();

const brand = new WeakSet();
const freeze = value => {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const manifestUnsigned = manifest => ({ schemaVersion: manifest.schemaVersion,
  signingKeyId: manifest.signingKeyId, signingKeyVersion: manifest.signingKeyVersion,
  watchdogIdentitySha256: manifest.watchdogIdentitySha256,
  watchdogPublicKey: manifest.watchdogPublicKey, members: manifest.members });

async function regularNoFollow(path, expectedRoot) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw fail("native-candidate-config-release-member-invalid");
  const resolved = await realpath(path);
  const inside = relative(expectedRoot, resolved);
  if (inside.startsWith("..") || isAbsolute(inside)) throw fail("native-candidate-config-release-member-escape");
  return resolved;
}

/**
 * Owner-only factory. The manifest/key/endpoint/release root are module-owned; only enablement and the protected
 * workspace parent enter from administrator bootstrap. Native ACL/file-identity proof remains a later Control gate,
 * so this factory refuses activation until the signed manifest and every source member are present and exact.
 */
export async function createNativeCandidateConfig(inputValue) {
  const { enabled, protectedWorkspaceParent } = candidateFactoryInputSchema.parse(inputValue);
  if (enabled !== true) return null;
  const parent = protectedWorkspaceParent;
  const moduleDirectoryStat = await lstat(moduleDirectory);
  const configuredParentStat = await lstat(parent);
  if (!moduleDirectoryStat.isDirectory() || moduleDirectoryStat.isSymbolicLink()
      || !configuredParentStat.isDirectory() || configuredParentStat.isSymbolicLink()) {
    throw fail("native-candidate-config-root-identity-invalid");
  }
  const releaseRoot = await realpath(moduleDirectory);
  const releaseRootStat = await lstat(releaseRoot);
  const parentResolved = await realpath(parent);
  const parentStat = await lstat(parentResolved);
  if (!releaseRootStat.isDirectory() || releaseRootStat.isSymbolicLink()
      || !parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw fail("native-candidate-config-root-identity-invalid");
  }
  const manifestPath = join(releaseRoot, NATIVE_CANDIDATE_MANIFEST_BASENAME);
  const raw = await readFile(await regularNoFollow(manifestPath, releaseRoot));
  if (raw.length === 0 || raw.includes(0)) throw fail("native-candidate-config-release-manifest-invalid");
  let manifest;
  try {
    const text = raw.toString("utf8");
    manifest = manifestSchema.parse(JSON.parse(text));
    if (!Buffer.from(text, "utf8").equals(raw) || canonicalStringify(manifest) !== text) {
      throw fail("native-candidate-config-release-manifest-noncanonical");
    }
  } catch (error) {
    if (error?.code?.startsWith?.("native-candidate-config-")) throw error;
    throw fail("native-candidate-config-release-manifest-invalid");
  }
  const unsignedBytes = Buffer.from(canonicalStringify(manifestUnsigned(manifest)));
  let signatureValid = false;
  try {
    const signature = Buffer.from(manifest.signatureBase64, "base64");
    signatureValid = signature.toString("base64") === manifest.signatureBase64
      && verify(null, unsignedBytes, NATIVE_CANDIDATE_MANIFEST_PUBLIC_KEY_PEM, signature);
  } catch { signatureValid = false; }
  if (!signatureValid) {
    throw fail("native-candidate-config-release-signature-invalid");
  }
  const seen = new Set();
  for (const member of manifest.members) {
    if (seen.has(member.path)) throw fail("native-candidate-config-release-member-duplicate");
    seen.add(member.path);
    const memberPath = await regularNoFollow(join(releaseRoot, member.path), releaseRoot);
    if (sha256(await readFile(memberPath)) !== member.sha256) throw fail("native-candidate-config-release-member-drift");
  }
  const parsed = configSchema.parse({ schemaVersion: "runa-public-git-native-candidate-config/v1", enabled: true,
    releaseManifestPath: manifestPath, releaseRoot, protectedWorkspaceParent: parentResolved,
    watchdogEndpoint: NATIVE_CANDIDATE_WATCHDOG_ENDPOINT, watchdogSigningKeyId: manifest.signingKeyId,
    watchdogSigningKeyVersion: manifest.signingKeyVersion, watchdogPublicKey: manifest.watchdogPublicKey,
    watchdogIdentitySha256: manifest.watchdogIdentitySha256, workerReleaseSha256: sha256(raw) });
  freeze(parsed); brand.add(parsed); return parsed;
}

export function assertNativeCandidateConfig(value) {
  configSchema.parse(value);
  if (!brand.has(value)) throw fail("native-candidate-config-brand-invalid");
  return value;
}

export const nativeCandidateConfigProofBoundary = Object.freeze({
  defaultEnabled: false,
  requestSelectable: false,
  environmentSelectable: false,
  databaseSelectable: false,
  modelSelectable: false,
  currentGateOneManifestSealed: false,
  nativeAclAndIdentityAcceptanceRequired: true,
  signedReleaseManifestRequired: true,
});
