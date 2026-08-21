import { randomBytes } from "node:crypto";
import { GATE4A_SNAPSHOT_VERSION, LEGACY_CHAT_VERSION, LEGACY_PROJECT_VERSION } from "./contracts.mjs";
import { createEnvelopeCipher } from "./envelope.mjs";

export const PARTICIPANT = "synthetic-steward";
export const PROJECT_ALPHA = "project-alpha";
export const PROJECT_BETA = "project-beta";
export const CHAT_A = "a".repeat(32);
export const CHAT_B = "b".repeat(32);
export const CHAT_C = "c".repeat(32);

export function testCipher({ onDecrypt = null, encryptionByte = 11, hmacByte = 29 } = {}) {
  return createEnvelopeCipher({ encryptionKey: Buffer.alloc(32, encryptionByte),
    hmacKey: Buffer.alloc(32, hmacByte), keyId: "gate4a-test-key", onDecrypt });
}

const project = ({ id, displayName, status = "managed", memoryEnabled = false }) => ({
  schemaVersion: LEGACY_PROJECT_VERSION, id, displayName, type: "software-project", status,
  registeredAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-21T10:00:00.000Z",
  sources: id === PROJECT_ALPHA ? [{ referenceId: "source-alpha" }] : [],
  environments: ["local"], verificationCommands: ["npm test"], relevantIntegrations: [],
  dataBoundaries: ["synthetic-only"], memoryPolicy: { enabled: memoryEnabled, projectMemoryAvailable: memoryEnabled },
  approvalPolicy: { requireApprovalForRiskyActions: true }, notes: ["Synthetic migration fixture"],
});

const chat = ({ chatId, title, projectId, parentChatId = null, branchFromTurn = null,
  archived = false, unread = false, turns }) => ({
  schemaVersion: LEGACY_CHAT_VERSION,
  catalog: { chatId, title, createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-21T10:00:00.000Z", projectId, parentChatId, branchFromTurn,
    turnCount: turns.length, archived, unread },
  turns,
});

const turn = (at, route, user, assistant) => ({ at, route, user, assistant });

export function makeSnapshot({ sourceSnapshotId = "snapshot-1", predecessorManifestHmac = null,
  alphaMemoryEnabled = true, includeParent = true, includeUnassigned = true,
  privateCanary = "PRIVATE_CHAT_CANARY_4A", mutate = null } = {}) {
  const parent = chat({ chatId: CHAT_A, title: `Plan ${privateCanary}`, projectId: PROJECT_ALPHA,
    turns: [turn("2026-08-20T10:01:00.000Z", "general-chat", `Question ${privateCanary}`, "Answer one"),
      turn("2026-08-20T10:02:00.000Z", "workspace-chat", "Question two", "Answer two")] });
  const branch = chat({ chatId: CHAT_B, title: "Plan branch", projectId: PROJECT_ALPHA,
    parentChatId: CHAT_A, branchFromTurn: 0,
    turns: [turn("2026-08-20T10:01:00.000Z", "general-chat", `Question ${privateCanary}`, "Answer one")] });
  const unassigned = chat({ chatId: CHAT_C, title: "Unassigned archive", projectId: null,
    archived: true, unread: true,
    turns: [turn("2026-08-20T11:00:00.000Z", "general-chat", "Unassigned", "Still private")] });
  const snapshot = {
    schemaVersion: GATE4A_SNAPSHOT_VERSION, sourceSnapshotId, participantId: PARTICIPANT,
    predecessorManifestHmac,
    projects: [project({ id: PROJECT_ALPHA, displayName: "Project Alpha", memoryEnabled: alphaMemoryEnabled }),
      project({ id: PROJECT_BETA, displayName: "Project Beta", status: "archived", memoryEnabled: false })],
    chats: [...(includeParent ? [parent] : []), branch, ...(includeUnassigned ? [unassigned] : [])],
    projectMemory: [{ version: 1, tier: "project-memory", scope: "local",
      summary: `Remember ${privateCanary}`, source: "steward-directed", projectId: PROJECT_ALPHA,
      metadata: { synthetic: true }, createdAt: "2026-08-21T09:00:00.000Z" }],
  };
  return mutate ? mutate(structuredClone(snapshot)) : snapshot;
}

export const disposableCipher = () => createEnvelopeCipher({ encryptionKey: randomBytes(32),
  hmacKey: randomBytes(32), keyId: "gate4a-disposable-integration" });
