import { z } from "zod";
import { canonicalJson } from "./canonical.mjs";
import { GATE4A_SNAPSHOT_VERSION, LEGACY_CHAT_VERSION, LEGACY_PROJECT_VERSION,
  TARGET_RECORD_VERSION } from "./formats.mjs";

export { GATE4A_SNAPSHOT_VERSION, LEGACY_CHAT_VERSION, LEGACY_PROJECT_VERSION,
  TARGET_RECORD_VERSION };

const projectId = z.string().regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/).max(160);
const chatId = z.string().regex(/^[a-f0-9]{32}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const dateTime = z.string().datetime();
const bounded = (maximum = 32_768) => z.string().max(maximum);
const sourceReference = z.object({ referenceId: projectId }).strict();

const legacyProject = z.object({
  schemaVersion: z.literal(LEGACY_PROJECT_VERSION),
  id: projectId,
  displayName: bounded(120).min(1),
  type: bounded(160).min(1),
  status: z.enum(["managed", "archived"]),
  registeredAt: dateTime,
  updatedAt: dateTime,
  sources: z.array(sourceReference).max(100),
  environments: z.array(bounded(300)).max(24),
  verificationCommands: z.array(bounded(300)).max(24),
  relevantIntegrations: z.array(bounded(160)).max(100).default([]),
  dataBoundaries: z.array(bounded(300)).max(100).default([]),
  memoryPolicy: z.object({ enabled: z.boolean(), projectMemoryAvailable: z.boolean().optional() }).passthrough(),
  approvalPolicy: z.record(z.string(), z.unknown()).default({}),
  notes: z.array(bounded(300)).max(100).default([]),
}).strict();

const legacyChatCatalog = z.object({
  chatId,
  title: bounded(120).min(1),
  createdAt: dateTime,
  updatedAt: dateTime,
  projectId: projectId.nullable(),
  parentChatId: chatId.nullable(),
  branchFromTurn: z.number().int().nonnegative().nullable(),
  turnCount: z.number().int().nonnegative().max(2_000),
  archived: z.boolean(),
  unread: z.boolean().default(false),
}).strict();

const legacyTurn = z.object({
  at: dateTime,
  route: bounded(64).min(1),
  user: bounded(),
  assistant: bounded(),
}).strict().refine(turn => turn.user.trim() || turn.assistant.trim(), { message: "empty chat turn" });

const legacyChat = z.object({
  schemaVersion: z.literal(LEGACY_CHAT_VERSION),
  catalog: legacyChatCatalog,
  turns: z.array(legacyTurn).max(2_000),
}).strict();

const projectMemory = z.object({
  version: z.literal(1),
  tier: z.literal("project-memory"),
  scope: bounded(160),
  summary: bounded(2_000).min(1),
  source: bounded(160),
  projectId,
  metadata: z.record(z.string(), z.unknown()),
  createdAt: dateTime,
}).strict();

const snapshotSchema = z.object({
  schemaVersion: z.literal(GATE4A_SNAPSHOT_VERSION),
  sourceSnapshotId: z.string().regex(/^[A-Za-z0-9._:-]+$/).max(160),
  participantId: z.string().min(1).max(160).regex(/^[^\u0000-\u001f\u007f]+$/),
  predecessorManifestHmac: digest.nullable().default(null),
  projects: z.array(legacyProject).max(1_000),
  chats: z.array(legacyChat).max(10_000),
  projectMemory: z.array(projectMemory).max(100_000),
}).strict();

const coded = (code, message) => Object.assign(new Error(message), { code });

function unique(values, label) {
  if (new Set(values).size !== values.length) throw coded("migration-source-duplicate", `Duplicate ${label} in the source snapshot.`);
}

function prohibitedMemoryField(value) {
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (["rawTranscript", "rawDiagnosticLog", "secret", "apiKey", "token"].includes(key) && child) return true;
    if (prohibitedMemoryField(child)) return true;
  }
  return false;
}

export function parseGate4aSnapshot(raw) {
  let snapshot;
  try { snapshot = snapshotSchema.parse(raw); }
  catch (error) { throw coded("migration-source-invalid", error.message); }
  unique(snapshot.projects.map(project => project.id), "project id");
  unique(snapshot.chats.map(chat => chat.catalog.chatId), "chat id");
  const projects = new Map(snapshot.projects.map(project => [project.id, project]));
  for (const project of snapshot.projects) {
    if (project.status === "archived" && project.memoryPolicy.enabled) {
      throw coded("migration-project-memory-invalid", `Archived project ${project.id} cannot have memory enabled.`);
    }
  }
  for (const chat of snapshot.chats) {
    const meta = chat.catalog;
    if (meta.turnCount !== chat.turns.length) throw coded("migration-turn-count-mismatch", `Chat ${meta.chatId} turn count does not match.`);
    if (meta.projectId && !projects.has(meta.projectId)) throw coded("migration-chat-project-missing", `Chat ${meta.chatId} names a missing project.`);
    if (meta.parentChatId === meta.chatId) throw coded("migration-branch-invalid", "A chat cannot be its own parent.");
    if (meta.branchFromTurn !== null && meta.branchFromTurn >= chat.turns.length) throw coded("migration-branch-invalid", "A branch point must name a carried turn.");
    if ((meta.parentChatId === null) !== (meta.branchFromTurn === null)) throw coded("migration-branch-invalid", "Branch parent and turn must appear together.");
  }
  for (const memory of snapshot.projectMemory) {
    if (!projects.has(memory.projectId)) throw coded("migration-memory-project-missing", "Project memory names a missing project.");
    if (prohibitedMemoryField(memory)) throw coded("migration-memory-prohibited", "Project memory contains a prohibited raw or secret-like field.");
  }
  unique(snapshot.projectMemory.map((record, index) => `${record.projectId}\u0000${record.createdAt}\u0000${index}`), "project-memory locator");
  return structuredClone(snapshot);
}

export function canonicalSnapshotManifest(snapshot) {
  return canonicalJson({
    schemaVersion: snapshot.schemaVersion,
    sourceSnapshotId: snapshot.sourceSnapshotId,
    participantId: snapshot.participantId,
    projects: snapshot.projects,
    chats: snapshot.chats,
    projectMemory: snapshot.projectMemory,
  });
}
