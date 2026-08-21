import { createDecipheriv, createHash, hkdfSync, scryptSync } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson, sha256 } from "../gate4/canonical.mjs";
import { GATE4B_SNAPSHOT_VERSION, parseGate4bSnapshot } from "./contracts.mjs";

const coded = code => Object.assign(new Error("The protected E6 source check failed closed."), { code });
const ENTRY_FILE = /^(\d{12})-([a-f0-9]{32})\.runaenc$/;
const ENTRY_KINDS = new Set(["learning-event", "outcome-feedback", "lifecycle", "approval", "approval-batch"]);
const JOURNAL_VERSION = "runa-learning-event-journal/v1";
const ENVELOPE_VERSION = "runa-learning-event-journal-envelope/v1";
const CREDENTIAL_VERSION = "runa-learning-center-credential/e6-2-v1";
const KEYCHECK = "runa-learning-event-journal-keycheck/v1";

function exact(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function inside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
function safeFile(path, maximum = 512 * 1024) {
  if (!existsSync(path)) throw coded("protected-source-file-missing");
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink() || realpathSync(path) !== resolve(path)
      || stats.size < 1 || stats.size > maximum) throw coded("protected-source-file-unsafe");
  return readFileSync(path);
}
function decode(value, length = null) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw coded("protected-source-ciphertext-invalid");
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value || (length !== null && bytes.length !== length)) throw coded("protected-source-ciphertext-invalid");
  return bytes;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function aad(envelope) {
  return Buffer.from(JSON.stringify(stable({ formatVersion: envelope.formatVersion, entryId: envelope.entryId,
    sequence: envelope.sequence, kind: envelope.kind })), "utf8");
}
function decryptEnvelope(envelope, key) {
  const allowedKind = envelope?.kind === "keycheck" || ENTRY_KINDS.has(envelope?.kind);
  if (!exact(envelope, ["formatVersion", "entryId", "sequence", "kind", "nonce", "tag", "ciphertext"])
      || envelope.formatVersion !== ENVELOPE_VERSION || !allowedKind
      || !/^[a-f0-9]{32}$/.test(envelope.entryId) || !Number.isSafeInteger(envelope.sequence)) {
    throw coded("protected-source-envelope-invalid");
  }
  let plaintext;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, decode(envelope.nonce, 12));
    decipher.setAAD(aad(envelope));
    decipher.setAuthTag(decode(envelope.tag, 16));
    plaintext = Buffer.concat([decipher.update(decode(envelope.ciphertext)), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch (error) {
    if (error?.code?.startsWith("protected-")) throw error;
    throw coded("protected-source-decryption-failed");
  } finally { plaintext?.fill(0); }
}
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

function journalFiles(legacyRepo) {
  const root = resolve(legacyRepo, ".runaai-local", "state", "learning", "event-journal-v1");
  const entriesRoot = join(root, "entries");
  if (!existsSync(root) || !existsSync(entriesRoot) || lstatSync(root).isSymbolicLink()
      || lstatSync(entriesRoot).isSymbolicLink() || realpathSync(root) !== root || realpathSync(entriesRoot) !== entriesRoot) {
    throw coded("protected-source-journal-layout-invalid");
  }
  if (existsSync(join(root, "writer.lock"))) throw coded("protected-source-writer-active");
  const entries = readdirSync(entriesRoot).map(name => {
    const match = ENTRY_FILE.exec(name);
    if (!match) throw coded("protected-source-journal-layout-invalid");
    return { path: join(entriesRoot, name), name: `entries/${name}`, sequence: Number(match[1]), entryId: match[2] };
  }).sort((a, b) => a.sequence - b.sequence);
  for (let index = 0; index < entries.length; index += 1) {
    if (entries[index].sequence !== index + 1) throw coded("protected-source-journal-order-invalid");
    safeFile(entries[index].path);
  }
  return { root, manifest: join(root, "manifest.json"), entries };
}

function fileManifest(root, files) {
  return files.map(path => ({ name: relative(root, path).replace(/\\/g, "/"), bytes: statSync(path).size,
    sha256: sha256(readFileSync(path)) })).sort((a, b) => a.name.localeCompare(b.name));
}

export function createScopedE6Backup({ legacyRepo, backupRoot, expectedEntries = 90 }) {
  const journal = journalFiles(legacyRepo); const target = resolve(backupRoot);
  if (journal.entries.length !== expectedEntries) throw coded("protected-source-entry-count-mismatch");
  if (existsSync(target)) throw coded("protected-backup-already-exists");
  const sourceFiles = [journal.manifest, ...journal.entries.map(item => item.path)];
  const sourceManifest = fileManifest(journal.root, sourceFiles);
  mkdirSync(join(target, "entries"), { recursive: true, mode: 0o700 });
  for (const source of sourceFiles) {
    const destination = join(target, relative(journal.root, source));
    if (!inside(target, destination)) throw coded("protected-backup-root-invalid");
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    copyFileSync(source, destination);
  }
  const backupFiles = [join(target, "manifest.json"), ...journal.entries.map(item => join(target, item.name))];
  const backupManifest = fileManifest(target, backupFiles);
  if (canonicalJson(sourceManifest) !== canonicalJson(backupManifest)) throw coded("protected-backup-copy-mismatch");
  return Object.freeze({ fileCount: sourceManifest.length,
    bytes: sourceManifest.reduce((sum, item) => sum + item.bytes, 0),
    manifestSha256: sha256(canonicalJson(sourceManifest)), sourceManifest });
}

export function verifyScopedE6Backup({ legacyRepo, backupRoot, original }) {
  const journal = journalFiles(legacyRepo);
  const sourceFiles = [journal.manifest, ...journal.entries.map(item => item.path)];
  const backupFiles = [join(resolve(backupRoot), "manifest.json"),
    ...journal.entries.map(item => join(resolve(backupRoot), item.name))];
  const source = fileManifest(journal.root, sourceFiles);
  const backup = fileManifest(resolve(backupRoot), backupFiles);
  if (canonicalJson(source) !== canonicalJson(original.sourceManifest)
      || canonicalJson(backup) !== canonicalJson(original.sourceManifest)) throw coded("protected-backup-postrun-mismatch");
  return { unchanged: true, manifestSha256: sha256(canonicalJson(source)) };
}

function recursiveFiles(root) {
  if (!existsSync(root)) return [];
  if (lstatSync(root).isSymbolicLink() || realpathSync(root) !== resolve(root)) throw coded("protected-boundary-root-unsafe");
  const files = [];
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = join(directory, entry.name);
      if (!inside(root, target) || entry.isSymbolicLink()) throw coded("protected-boundary-entry-unsafe");
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) files.push(target);
      else throw coded("protected-boundary-entry-unsafe");
    }
  };
  visit(root); return files;
}

export function protectedLearningBoundaryManifest(legacyRepo) {
  const learning = resolve(legacyRepo, ".runaai-local", "state", "learning");
  const domains = {
    e6: "event-journal-v1", e3: "inbox-v1", e4: "review-v1", e5: "activation-v1",
    deviceVault: "device-vault-v1", learningCenterCredential: "learning-center-v1",
  };
  const result = {};
  for (const [name, relativeName] of Object.entries(domains)) {
    const root = join(learning, relativeName); const files = recursiveFiles(root);
    const manifest = fileManifest(root, files);
    result[name] = { present: existsSync(root), files: files.length,
      bytes: files.reduce((sum, file) => sum + statSync(file).size, 0), digest: sha256(canonicalJson(manifest)) };
  }
  return Object.freeze(result);
}

export async function readProtectedE6Snapshot({ legacyRepo, expectedCommit, participantId = "matthew-owner",
  protector = null, allowTestKdf = false }) {
  const root = resolve(legacyRepo); const journal = journalFiles(root);
  const credentialPath = resolve(root, ".runaai-local", "state", "learning", "learning-center-v1", "journal-credential.json");
  const credentialBytes = safeFile(credentialPath, 128 * 1024);
  let credential;
  try { credential = JSON.parse(credentialBytes.toString("utf8")); } catch { throw coded("protected-source-credential-invalid"); }
  if (!exact(credential, ["formatVersion", "createdAt", "protection", "journalId", "ciphertext", "ciphertextSha256"])
      || credential.formatVersion !== CREDENTIAL_VERSION || !/^[a-f0-9]{32}$/.test(credential.journalId)) {
    throw coded("protected-source-credential-invalid");
  }
  const protectedBytes = Buffer.from(credential.ciphertext, "base64url");
  if (!protectedBytes.length || sha(protectedBytes) !== credential.ciphertextSha256) throw coded("protected-source-credential-invalid");
  let dpapi = protector;
  if (!dpapi) {
    const module = await import(pathToFileURL(resolve(root, "src", "runa", "learning-device-vault.mjs")).href);
    dpapi = module.createWindowsDpapiProtector();
  }
  let credentialPlaintext; let key; let master; let secret;
  try {
    credentialPlaintext = dpapi.unprotect(protectedBytes);
    secret = JSON.parse(credentialPlaintext.toString("utf8"));
    if (!exact(secret, ["formatVersion", "createdAt", "journalId", "passphrase"])
        || secret.formatVersion !== CREDENTIAL_VERSION || secret.journalId !== credential.journalId
        || typeof secret.passphrase !== "string" || secret.passphrase.length < 32) throw coded("protected-source-credential-invalid");
    const manifest = JSON.parse(safeFile(journal.manifest, 128 * 1024).toString("utf8"));
    if (!exact(manifest, ["formatVersion", "journalId", "createdAt", "cipher", "kdf", "salt", "keycheck"])
        || manifest.formatVersion !== JOURNAL_VERSION || manifest.journalId !== secret.journalId || manifest.cipher !== "aes-256-gcm") {
      throw coded("protected-source-manifest-invalid");
    }
    const kdf = manifest.kdf;
    if (!exact(kdf, ["algorithm", "N", "r", "p", "keyLength", "maxmem"]) || kdf.algorithm !== "scrypt"
        || kdf.r !== 8 || kdf.p !== 1 || kdf.keyLength !== 32 || kdf.maxmem > 128 * 1024 * 1024
        || (!allowTestKdf && kdf.N !== 65536)) throw coded("protected-source-kdf-invalid");
    const salt = decode(manifest.salt, 32);
    master = scryptSync(secret.passphrase, salt, 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: kdf.maxmem });
    key = Buffer.from(hkdfSync("sha256", master, salt, "runa-learning-event-journal-record-key/v1", 32));
    const keycheck = decryptEnvelope(manifest.keycheck, key);
    if (!exact(keycheck, ["value"]) || keycheck.value !== KEYCHECK) throw coded("protected-source-keycheck-invalid");
    const entries = journal.entries.map(item => {
      const envelope = JSON.parse(safeFile(item.path).toString("utf8"));
      if (envelope.sequence !== item.sequence || envelope.entryId !== item.entryId) throw coded("protected-source-envelope-invalid");
      return decryptEnvelope(envelope, key);
    });
    const raw = fileManifest(journal.root, [journal.manifest, ...journal.entries.map(item => item.path)]);
    const snapshot = parseGate4bSnapshot({ schemaVersion: GATE4B_SNAPSHOT_VERSION,
      sourceSnapshotId: `legacy-e6:${sha256(canonicalJson(raw))}`, participantId,
      sourceCommit: expectedCommit, predecessorManifestHmac: null, journalId: manifest.journalId, entries });
    return Object.freeze({ snapshot, aggregate: { entries: entries.length,
      byKind: Object.fromEntries([...ENTRY_KINDS].map(kind => [kind, entries.filter(entry => entry.kind === kind).length])),
      sourceManifest: sha256(canonicalJson(raw)) } });
  } catch (error) {
    if (error?.code?.startsWith("protected-") || error?.code?.startsWith("migration-")) throw error;
    throw coded("protected-source-read-failed");
  } finally {
    protectedBytes.fill(0); credentialPlaintext?.fill(0); master?.fill(0); key?.fill(0);
    if (secret) secret.passphrase = null;
  }
}

export function privateLearningValuesForScan(snapshot, minimumLength = 8) {
  const safe = new Set([snapshot.participantId, "learning-event", "outcome-feedback", "lifecycle", "approval", "approval-batch",
    "direct-teaching", "user-correction", "personal", "project", "capability", "global-approved", "global",
    "approve", "revoke", "expire", "correct", "delete", "safe-hold-proposed", "release-safe-hold"]);
  for (const entry of snapshot.entries) {
    safe.add(entry.kind); safe.add(entry.recordedAt);
    if (entry.kind === "learning-event") {
      safe.add(entry.payload.eventType); safe.add(entry.payload.destination?.tier);
      safe.add(entry.payload.scope?.proposedReuse); safe.add(entry.payload.approval?.state);
    } else if (entry.kind === "lifecycle" || entry.kind === "approval") safe.add(entry.payload.action);
  }
  const values = new Set();
  const visit = value => {
    if (typeof value === "string" && value.length >= minimumLength && !safe.has(value)
        && !/^sha256:[a-f0-9]{64}$/.test(value) && !/^\d{4}-\d{2}-\d{2}T/.test(value)) values.add(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  snapshot.entries.forEach(entry => visit(entry.payload));
  return [...values].sort((a, b) => b.length - a.length);
}

export function assertPrivateLearningValuesAbsent(values, targets) {
  for (const target of targets) for (const value of values) if (String(target).includes(value)) throw coded("protected-private-value-exposed");
  return true;
}
