import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative, sep, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson, sha256 } from "./canonical.mjs";
import { GATE4A_SNAPSHOT_VERSION, LEGACY_CHAT_VERSION } from "./formats.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const REVIEWED_LEGACY_SOURCE_COUNT = 10;

function inside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function filesInExactDirectory(root, predicate = () => true) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && predicate(entry.name))
    .map(entry => join(root, entry.name));
}

const bytesOf = paths => paths.reduce((sum, path) => sum + statSync(path).size, 0);

export function inventoryFromSnapshot(rawSnapshot, diagnostics = {}) {
  const projects = Array.isArray(rawSnapshot.projects) ? rawSnapshot.projects : [];
  const chats = Array.isArray(rawSnapshot.chats) ? rawSnapshot.chats : [];
  const memory = Array.isArray(rawSnapshot.projectMemory) ? rawSnapshot.projectMemory : [];
  const projectIds = new Set(projects.map(project => project.id));
  const chatIds = new Set(chats.map(chat => chat.catalog.chatId));
  const relations = {
    missingProjectAssignments: chats.filter(chat => chat.catalog.projectId && !projectIds.has(chat.catalog.projectId)).length,
    unknownParentReferences: chats.filter(chat => chat.catalog.parentChatId && !chatIds.has(chat.catalog.parentChatId)).length,
    invalidBranchPoints: chats.filter(chat => (chat.catalog.parentChatId === null) !== (chat.catalog.branchFromTurn === null) ||
      (chat.catalog.branchFromTurn !== null && chat.catalog.branchFromTurn >= chat.turns.length)).length,
    turnCountMismatches: chats.filter(chat => chat.catalog.turnCount !== chat.turns.length).length,
    duplicateProjectIds: projects.length - projectIds.size,
    duplicateChatIds: chats.length - chatIds.size,
    memoryProjectMismatches: memory.filter(record => !projectIds.has(record.projectId)).length,
  };
  const counts = {
    projects: projects.length,
    projectsManaged: projects.filter(project => project.status === "managed").length,
    projectsArchived: projects.filter(project => project.status === "archived").length,
    projectsMemoryEnabled: projects.filter(project => project.memoryPolicy?.enabled === true).length,
    sourceReferences: projects.reduce((sum, project) => sum + (project.sources?.length ?? 0), 0),
    pathwayEntries: projects.reduce((sum, project) => sum + (project.environments?.length ?? 0) + (project.verificationCommands?.length ?? 0), 0),
    chats: chats.length,
    chatsAssigned: chats.filter(chat => chat.catalog.projectId).length,
    chatsUnassigned: chats.filter(chat => !chat.catalog.projectId).length,
    chatsArchived: chats.filter(chat => chat.catalog.archived).length,
    chatsUnread: chats.filter(chat => chat.catalog.unread).length,
    chatsBranched: chats.filter(chat => chat.catalog.parentChatId).length,
    turns: chats.reduce((sum, chat) => sum + chat.turns.length, 0),
    projectMemory: memory.length,
    unreadableProjects: diagnostics.unreadableProjects ?? 0,
    unreadableChats: diagnostics.unreadableChats ?? 0,
    unreadableProjectMemory: diagnostics.unreadableProjectMemory ?? 0,
  };
  const safeRoutes = ["general", "general-chat", "guarded", "guarded-chat", "local-chat", "research", "workspace", "workspace-chat"];
  const turnsByRoute = Object.fromEntries(safeRoutes.map(route => [route,
    chats.reduce((sum, chat) => sum + chat.turns.filter(turn => turn.route === route).length, 0)]));
  turnsByRoute.other = chats.reduce((sum, chat) => sum + chat.turns.filter(turn => !safeRoutes.includes(turn.route)).length, 0);
  const digests = {
    projects: sha256(canonicalJson(projects)),
    chatMetadata: sha256(canonicalJson(chats.map(chat => chat.catalog))),
    transcripts: sha256(canonicalJson(chats.map(chat => chat.turns))),
    projectMemory: sha256(canonicalJson(memory)),
  };
  digests.domainManifest = sha256(canonicalJson(digests));
  const blockingRelations = relations.missingProjectAssignments + relations.invalidBranchPoints +
    relations.turnCountMismatches + relations.duplicateProjectIds + relations.duplicateChatIds + relations.memoryProjectMismatches;
  const unreadable = counts.unreadableProjects + counts.unreadableChats + counts.unreadableProjectMemory;
  return Object.freeze({
    schemaVersion: "runa2-gate4a-owner-inventory/v1",
    sourceSchemas: { projects: diagnostics.projectSchemaVersion ?? "runa-project-store/v1",
      chats: diagnostics.chatSchemaVersion ?? LEGACY_CHAT_VERSION, projectMemory: 1 },
    storeAvailability: { chats: diagnostics.chatStoreAvailable ?? true,
      chatKeyUnsealed: diagnostics.chatKeyUnsealed ?? true },
    counts, turnsByRoute, bytes: diagnostics.bytes ?? { projects: 0, chats: 0, projectMemory: 0 },
    maximumRecordBytes: diagnostics.maximumRecordBytes ?? { project: 0, chat: 0, projectMemory: 0 },
    digests, relationships: relations,
    disallowedFieldsEmitted: false,
    deterministicSecondPass: false,
    passed: blockingRelations === 0 && unreadable === 0 && (diagnostics.chatStoreAvailable ?? true),
  });
}

export function assertLegacyAuthority({ legacyRepo, expectedCommit }) {
  const repo = resolve(legacyRepo);
  const git = args => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = git(["rev-parse", "HEAD"]);
  const branch = git(["branch", "--show-current"]);
  const upstream = git(["rev-parse", "origin/main"]);
  const tracked = git(["status", "--porcelain", "--untracked-files=no"]);
  if (commit !== expectedCommit || upstream !== expectedCommit || branch !== "main" || tracked) {
    throw coded("inventory-authority-mismatch", "Legacy checkout is not the expected clean tracked main authority.");
  }
  return { repo, commit, branch, upstream };
}

export function assertLegacySourcePins({ authority, sourcePinsPath }) {
  let pins;
  try { pins = JSON.parse(readFileSync(sourcePinsPath, "utf8")); }
  catch { throw coded("inventory-source-pins-invalid", "The reviewed source-pin manifest is unreadable."); }
  if (pins?.schemaVersion !== "runa2-gate4a-source-pins/v1" || pins.hashCanonicalization !== "utf8-lf" ||
      pins.legacyHead !== authority.commit || !Array.isArray(pins.sources)) {
    throw coded("inventory-source-pins-invalid", "The reviewed source-pin manifest does not bind this authority.");
  }
  const selected = pins.sources.filter(pin => pin?.repo === "RunaAI");
  if (selected.length !== REVIEWED_LEGACY_SOURCE_COUNT ||
      new Set(selected.map(pin => pin.path)).size !== selected.length) {
    throw coded("inventory-source-pins-invalid", "The reviewed legacy source-pin set has the wrong size or is ambiguous.");
  }
  for (const pin of selected) {
    if (typeof pin.path !== "string" || !/^[a-f0-9]{64}$/.test(String(pin.sha256))) {
      throw coded("inventory-source-pins-invalid", "A reviewed legacy source pin is malformed.");
    }
    const target = resolve(authority.repo, pin.path);
    if (!inside(authority.repo, target) || !existsSync(target) || !statSync(target).isFile()) {
      throw coded("inventory-source-pin-mismatch", "A reviewed legacy source is absent or outside the authority root.");
    }
    const canonicalText = readFileSync(target, "utf8").replace(/\r\n?/g, "\n");
    if (sha256(canonicalText) !== pin.sha256) {
      throw coded("inventory-source-pin-mismatch", "A reviewed legacy source differs from its transport-canonical pin.");
    }
  }
  return { verifiedSourcePins: selected.length, sourcePinsSha256: sha256(canonicalJson(pins)) };
}

export async function readLegacyProjectChatDomain({ legacyRepo, expectedCommit, sourcePinsPath }) {
  const authority = { ...assertLegacyAuthority({ legacyRepo, expectedCommit }) };
  Object.assign(authority, assertLegacySourcePins({ authority, sourcePinsPath }));
  const stateRoot = resolve(authority.repo, ".runaai-local", "state");
  const chatRoot = resolve(stateRoot, "chats");
  const projectRoot = resolve(stateRoot, "projects");
  const memoryRoot = resolve(stateRoot, "memory", "projects");
  for (const target of [chatRoot, projectRoot, memoryRoot]) if (!inside(stateRoot, target)) throw coded("inventory-root-invalid", "Inventory root escaped the approved state boundary.");
  const source = name => pathToFileURL(resolve(authority.repo, "src", "runa", name)).href;
  const [{ createChatStore }, { createProjectStore }, { createLocalStateAdapter }, { createMemoryStore }] = await Promise.all([
    import(source("chat-store.mjs")), import(source("project-store.mjs")),
    import(source("local-state.mjs")), import(source("memory-store.mjs")),
  ]);
  const adapter = createLocalStateAdapter({ root: stateRoot });
  const chatStore = createChatStore({ root: chatRoot });
  const projectStore = createProjectStore({ adapter });
  const memoryStore = createMemoryStore({ adapter });
  const projectFiles = filesInExactDirectory(projectRoot, name => name.endsWith(".json"));
  const projects = projectStore.listProjects();
  const chatFiles = filesInExactDirectory(chatRoot, name => name.endsWith(".json.enc"));
  const catalog = chatStore.listChats({ includeArchived: true });
  const chats = [];
  let unreadableChats = 0;
  for (const entry of catalog) {
    try {
      const read = chatStore.readChat(entry.chatId);
      if (read.chat.turnCount !== entry.turnCount) unreadableChats += 1;
      chats.push({ schemaVersion: LEGACY_CHAT_VERSION, catalog: { ...entry }, turns: read.turns.map(turn => ({ ...turn })) });
    } catch { unreadableChats += 1; }
  }
  const projectMemory = [];
  let unreadableProjectMemory = 0;
  const memoryFiles = [];
  for (const project of projects) {
    const directory = resolve(memoryRoot, project.id);
    if (!inside(memoryRoot, directory)) throw coded("inventory-memory-root-invalid", "A project memory root escaped its approved boundary.");
    for (const file of filesInExactDirectory(directory, name => name.endsWith(".json"))) {
      memoryFiles.push(file);
      const relativePath = relative(stateRoot, file).replace(/\\/g, "/");
      try { projectMemory.push(memoryStore.readRecord(relativePath)); }
      catch { unreadableProjectMemory += 1; }
    }
  }
  const size = file => statSync(file).size;
  const maximum = files => files.length ? Math.max(...files.map(size)) : 0;
  const diagnostics = {
    chatStoreAvailable: chatStore.available(), chatKeyUnsealed: chatStore.status().configured ? chatStore.status().available : true,
    unreadableProjects: Math.max(0, projectFiles.length - projects.length), unreadableChats,
    unreadableProjectMemory, projectSchemaVersion: projects[0]?.schemaVersion ?? "runa-project-store/v1",
    chatSchemaVersion: LEGACY_CHAT_VERSION,
    bytes: { projects: bytesOf(projectFiles), chats: bytesOf(chatFiles), projectMemory: bytesOf(memoryFiles) },
    maximumRecordBytes: { project: maximum(projectFiles), chat: maximum(chatFiles), projectMemory: maximum(memoryFiles) },
  };
  return { authority, snapshot: { schemaVersion: GATE4A_SNAPSHOT_VERSION,
    sourceSnapshotId: `owner-inventory:${authority.commit}`, participantId: "legacy-verified-steward",
    predecessorManifestHmac: null, projects: projects.map(project => structuredClone(project)), chats, projectMemory }, diagnostics };
}

export function safeInventoryOutput({ authority, first, second, scriptSha256 }) {
  const deterministic = first.digests.domainManifest === second.digests.domainManifest && canonicalJson(first.counts) === canonicalJson(second.counts);
  return { ...first, sourceCommit: authority.commit, inventoryScriptSha256: scriptSha256,
    sourcePinsSha256: authority.sourcePinsSha256, verifiedSourcePins: authority.verifiedSourcePins,
    deterministicSecondPass: deterministic, passed: first.passed && second.passed && deterministic };
}

export const inventoryScriptHash = paths => sha256(canonicalJson((Array.isArray(paths) ? paths : [paths]).map(path => sha256(readFileSync(path)))));
