import { parseGate4aSnapshot, TARGET_RECORD_VERSION } from "./contracts.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const targetId = (kind, id) => `${kind}:${id}`;

function makeRecord(cipher, snapshot, kind, locator, id, publicData, privateData) {
  const locatorHmac = cipher.digest({ domain: "project-chat", kind, locator });
  const contentHmac = cipher.digest({ domain: "project-chat", kind, locator, publicData, privateData });
  const context = { recordType: kind, participantId: snapshot.participantId, recordId: id, field: "private-payload" };
  return {
    schemaVersion: TARGET_RECORD_VERSION,
    kind,
    targetId: id,
    participantId: snapshot.participantId,
    locatorHmac,
    contentHmac,
    publicData,
    privateEnvelope: cipher.encrypt(context, privateData),
  };
}

export function buildGate4aPlan(rawSnapshot, cipher) {
  const snapshot = parseGate4aSnapshot(rawSnapshot);
  const records = [];
  for (const project of snapshot.projects) {
    records.push(makeRecord(cipher, snapshot, "project", `project:${project.id}`, project.id, {
      projectId: project.id, schemaVersion: project.schemaVersion, projectType: project.type,
      status: project.status, registeredAt: project.registeredAt, updatedAt: project.updatedAt,
      memoryEnabled: project.memoryPolicy.enabled,
    }, {
      displayName: project.displayName, sources: project.sources, environments: project.environments,
      verificationCommands: project.verificationCommands, relevantIntegrations: project.relevantIntegrations,
      dataBoundaries: project.dataBoundaries, memoryPolicy: project.memoryPolicy,
      approvalPolicy: project.approvalPolicy, notes: project.notes,
    }));
  }
  for (const chat of snapshot.chats) {
    const meta = chat.catalog;
    records.push(makeRecord(cipher, snapshot, "chat", `chat:${meta.chatId}`, meta.chatId, {
      chatId: meta.chatId, projectId: meta.projectId, parentChatId: meta.parentChatId,
      branchFromTurn: meta.branchFromTurn, turnCount: meta.turnCount, archived: meta.archived,
      unread: meta.unread, createdAt: meta.createdAt, updatedAt: meta.updatedAt,
    }, { title: meta.title }));
    chat.turns.forEach((turn, ordinal) => records.push(makeRecord(cipher, snapshot, "chat-turn",
      `chat-turn:${meta.chatId}:${ordinal}`, targetId("turn", `${meta.chatId}:${ordinal}`), {
        chatId: meta.chatId, turnOrdinal: ordinal, occurredAt: turn.at, route: turn.route, originRequestId: null,
      }, { user: turn.user, assistant: turn.assistant })));
  }
  snapshot.projectMemory.forEach((memory, index) => {
    const id = targetId("memory", cipher.digest({ projectId: memory.projectId, createdAt: memory.createdAt, index }).slice(0, 40));
    records.push(makeRecord(cipher, snapshot, "project-memory",
      `project-memory:${memory.projectId}:${memory.createdAt}:${index}`, id, {
        memoryId: id, projectId: memory.projectId, createdAt: memory.createdAt,
        tier: memory.tier, scope: memory.scope, source: memory.source,
      }, { summary: memory.summary, metadata: memory.metadata }));
  });
  records.sort((left, right) => left.locatorHmac.localeCompare(right.locatorHmac));
  const targetKeys = new Set();
  const locatorKeys = new Set();
  for (const record of records) {
    const targetKey = `${record.kind}\u0000${record.targetId}`;
    const locatorKey = `${record.kind}\u0000${record.locatorHmac}`;
    if (targetKeys.has(targetKey) || locatorKeys.has(locatorKey)) {
      throw coded("migration-target-collision", "The source snapshot maps more than one item to the same migration target.");
    }
    targetKeys.add(targetKey);
    locatorKeys.add(locatorKey);
  }
  const manifestHmac = cipher.digest({ domain: "project-chat", records: records.map(record => ({
    kind: record.kind, locatorHmac: record.locatorHmac, contentHmac: record.contentHmac,
  })) });
  return Object.freeze({
    schemaVersion: "runa2-gate4a-migration-plan/v1",
    sourceSnapshotId: snapshot.sourceSnapshotId,
    participantId: snapshot.participantId,
    predecessorManifestHmac: snapshot.predecessorManifestHmac,
    manifestHmac,
    records: Object.freeze(records),
  });
}

export class Gate4aMigrationService {
  constructor({ store, cipher }) { this.store = store; this.cipher = cipher; }
  async migrate(rawSnapshot, { runId, mode = "synthetic", sourceCommit = null, targetCommit = null,
    failBeforeCommit = false, failAfterCommit = false } = {}) {
    if (!/^[A-Za-z0-9._:-]{1,160}$/.test(String(runId ?? ""))) throw coded("migration-run-id-invalid", "A bounded run id is required.");
    if (!new Set(["synthetic", "protected-rehearsal", "cutover"]).has(mode)) throw coded("migration-mode-invalid", "Unsupported migration mode.");
    const plan = buildGate4aPlan(rawSnapshot, this.cipher);
    return this.store.commitSnapshot({ ...plan, runId, mode, domain: "project-chat",
      domainVersion: "runa2-gate4a/v1", sourceCommit, targetCommit,
      sourceSnapshotDigest: plan.manifestHmac }, { failBeforeCommit, failAfterCommit });
  }
}

export class Gate4aProjectChatRepository {
  constructor({ store, cipher }) { this.store = store; this.cipher = cipher; }

  #scope(row, participantId, projectId = undefined) {
    if (!row || row.participantId !== participantId) throw coded("project-chat-scope-denied", "The record belongs to another participant.");
    if (projectId !== undefined && row.publicData.projectId !== projectId) throw coded("project-chat-scope-denied", "The chat belongs to another project.");
  }

  #private(row) {
    return this.cipher.decrypt({ recordType: row.kind, participantId: row.participantId,
      recordId: row.targetId, field: "private-payload" }, row.privateEnvelope);
  }

  async readProject(participantId, projectId) {
    const row = await this.store.getRaw("project", projectId, participantId);
    this.#scope(row, participantId);
    return { ...row.publicData, ...this.#private(row) };
  }

  async readChat(participantId, projectId, chatId) {
    const row = await this.store.getRaw("chat", chatId, participantId);
    this.#scope(row, participantId, projectId);
    const turns = (await this.store.listRaw("chat-turn", participantId))
      .filter(turn => turn.publicData.chatId === chatId)
      .sort((left, right) => left.publicData.turnOrdinal - right.publicData.turnOrdinal)
      .map(turn => ({ ...turn.publicData, ...this.#private(turn) }));
    return { ...row.publicData, ...this.#private(row), turns };
  }

  async listChats(participantId, projectId, { includeArchived = false } = {}) {
    const rows = await this.store.listRaw("chat", participantId);
    return rows.filter(row => row.publicData.projectId === projectId && (includeArchived || !row.publicData.archived))
      .sort((a, b) => String(b.publicData.updatedAt).localeCompare(String(a.publicData.updatedAt)))
      .map(row => ({ ...row.publicData, ...this.#private(row) }));
  }

  async searchChats(participantId, projectId, query, { maximumScans = 50 } = {}) {
    const needle = String(query ?? "").trim().toLowerCase();
    if (!needle) return [];
    const rows = (await this.store.listRaw("chat", participantId)).filter(row => row.publicData.projectId === projectId).slice(0, Math.max(1, maximumScans));
    const results = [];
    for (const row of rows) {
      const title = this.#private(row).title;
      const turns = (await this.store.listRaw("chat-turn", participantId)).filter(turn => turn.publicData.chatId === row.targetId);
      const hit = title.toLowerCase().includes(needle) || turns.some(turn => {
        const value = this.#private(turn);
        return value.user.toLowerCase().includes(needle) || value.assistant.toLowerCase().includes(needle);
      });
      if (hit) results.push({ ...row.publicData, title });
    }
    return results;
  }

  async projectContext(participantId, projectId) {
    const project = await this.readProject(participantId, projectId);
    const memories = (await this.store.listRaw("project-memory", participantId))
      .filter(row => row.publicData.projectId === projectId)
      .sort((a, b) => String(b.publicData.createdAt).localeCompare(String(a.publicData.createdAt)));
    const memory = project.memoryEnabled ? memories.slice(0, 8).map(row => this.#private(row).summary) : [];
    const chats = await this.listChats(participantId, projectId, { includeArchived: false });
    return { projectId, displayName: project.displayName, memoryEnabled: project.memoryEnabled,
      memory, siblingChatTitles: chats.slice(0, 10).map(chat => chat.title), typedUntrusted: true };
  }

  async status() { return { adapter: this.store.adapterName, rollbackAvailable: true, protectedStoresOpened: false }; }
}
