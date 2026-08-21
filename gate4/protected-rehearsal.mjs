import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { canonicalJson, sha256 } from "./canonical.mjs";
import { inventoryFromSnapshot } from "./inventory.mjs";

const CHAT_FILE = /^[a-f0-9]{32}\.json\.enc$/;
const coded = code => Object.assign(new Error("The protected rehearsal precondition failed."), { code });

function inside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function recursiveFiles(root, predicate) {
  if (!existsSync(root)) return [];
  const files = [];
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = join(directory, entry.name);
      if (!inside(root, target)) throw coded("protected-backup-root-invalid");
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && predicate(target)) files.push(target);
      else if (!entry.isFile()) throw coded("protected-backup-entry-invalid");
    }
  };
  visit(root);
  return files;
}

function rawManifest(root, files) {
  return files.map(file => ({ name: relative(root, file).replace(/\\/g, "/"),
    bytes: statSync(file).size, sha256: sha256(readFileSync(file)) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function createScopedEncryptedBackup({ legacyRepo, backupRoot, expectedChatFiles = 26 }) {
  const stateRoot = resolve(legacyRepo, ".runaai-local", "state");
  const chatRoot = resolve(stateRoot, "chats");
  const projectRoot = resolve(stateRoot, "projects");
  const memoryRoot = resolve(stateRoot, "memory", "projects");
  const targetRoot = resolve(backupRoot);
  for (const target of [chatRoot, projectRoot, memoryRoot]) {
    if (!inside(stateRoot, target)) throw coded("protected-backup-root-invalid");
  }
  if (existsSync(targetRoot)) throw coded("protected-backup-already-exists");

  const entries = readdirSync(chatRoot, { withFileTypes: true });
  const encrypted = [];
  let keySeen = false;
  for (const entry of entries) {
    if (!entry.isFile()) throw coded("protected-backup-chat-entry-invalid");
    if (entry.name === "store-key.dpapi") { keySeen = true; continue; }
    if (entry.name !== "catalog.json.enc" && !CHAT_FILE.test(entry.name)) {
      throw coded("protected-backup-chat-entry-invalid");
    }
    encrypted.push(join(chatRoot, entry.name));
  }
  if (!keySeen || encrypted.length !== expectedChatFiles ||
      encrypted.filter(file => basename(file) === "catalog.json.enc").length !== 1) {
    throw coded("protected-backup-chat-count-mismatch");
  }
  if (recursiveFiles(projectRoot, file => file.endsWith(".json")).length ||
      recursiveFiles(memoryRoot, file => file.endsWith(".json")).length) {
    throw coded("protected-backup-unexpected-domain-record");
  }

  mkdirSync(targetRoot, { recursive: false, mode: 0o700 });
  for (const source of encrypted) copyFileSync(source, join(targetRoot, basename(source)));
  const sourceManifest = rawManifest(chatRoot, encrypted);
  const backupFiles = readdirSync(targetRoot, { withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => join(targetRoot, entry.name));
  const backupManifest = rawManifest(targetRoot, backupFiles);
  if (canonicalJson(sourceManifest) !== canonicalJson(backupManifest)) throw coded("protected-backup-copy-mismatch");
  return Object.freeze({ fileCount: sourceManifest.length,
    bytes: sourceManifest.reduce((sum, file) => sum + file.bytes, 0),
    manifestSha256: sha256(canonicalJson(sourceManifest)), sourceManifest });
}

export function verifyScopedEncryptedBackup({ legacyRepo, backupRoot, original }) {
  const chatRoot = resolve(legacyRepo, ".runaai-local", "state", "chats");
  const sourceFiles = readdirSync(chatRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && (entry.name === "catalog.json.enc" || CHAT_FILE.test(entry.name)))
    .map(entry => join(chatRoot, entry.name));
  const backupFiles = readdirSync(resolve(backupRoot), { withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => join(resolve(backupRoot), entry.name));
  const source = rawManifest(chatRoot, sourceFiles);
  const backup = rawManifest(resolve(backupRoot), backupFiles);
  const unchanged = canonicalJson(source) === canonicalJson(original.sourceManifest) &&
    canonicalJson(backup) === canonicalJson(original.sourceManifest);
  if (!unchanged) throw coded("protected-backup-postrun-mismatch");
  return { unchanged: true, manifestSha256: sha256(canonicalJson(source)) };
}

export function assertApprovedProtectedSnapshot({ snapshot, diagnostics, expectedManifest,
  expectedProjects = 0, expectedChats = 25, expectedTurns = 75, expectedProjectMemory = 0 }) {
  const inventory = inventoryFromSnapshot(snapshot, diagnostics);
  const expected = { projects: expectedProjects, chats: expectedChats,
    turns: expectedTurns, projectMemory: expectedProjectMemory };
  if (!inventory.passed || inventory.digests.domainManifest !== expectedManifest ||
      inventory.counts.projects !== expected.projects || inventory.counts.chats !== expected.chats ||
      inventory.counts.turns !== expected.turns || inventory.counts.projectMemory !== expected.projectMemory ||
      Object.values(inventory.relationships).some(value => value !== 0)) {
    throw coded("protected-source-snapshot-drift");
  }
  return { inventory, expected };
}

export function expectedTargetProjection(snapshot) {
  return snapshot.chats.map(chat => ({
    chatId: chat.catalog.chatId, projectId: chat.catalog.projectId,
    parentChatId: chat.catalog.parentChatId, branchFromTurn: chat.catalog.branchFromTurn,
    turnCount: chat.catalog.turnCount, archived: chat.catalog.archived, unread: chat.catalog.unread,
    createdAt: chat.catalog.createdAt, updatedAt: chat.catalog.updatedAt, title: chat.catalog.title,
    turns: chat.turns.map((turn, turnOrdinal) => ({ chatId: chat.catalog.chatId, turnOrdinal,
      occurredAt: turn.at, route: turn.route, originRequestId: null,
      user: turn.user, assistant: turn.assistant })),
  })).sort((left, right) => left.chatId.localeCompare(right.chatId));
}

export const logicalProjectionDigest = projection => sha256(canonicalJson(projection));

export function privateValuesForScan(snapshot, minimumLength = 8) {
  return snapshot.chats.flatMap(chat => [chat.catalog.title,
    ...chat.turns.flatMap(turn => [turn.user, turn.assistant])])
    .filter(value => typeof value === "string" && value.length >= minimumLength);
}

export function assertPrivateValuesAbsent(values, texts) {
  const haystacks = Array.isArray(texts) ? texts : [texts];
  if (values.some(value => haystacks.some(text => String(text).includes(value)))) {
    throw coded("protected-private-value-leak");
  }
  return true;
}
