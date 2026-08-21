const coded = (code, message) => Object.assign(new Error(message), { code });
const recordKey = (participantId, kind, targetId) => `${participantId}\u0000${kind}\u0000${targetId}`;

function cloneState(state) {
  return {
    records: new Map([...state.records].map(([key, value]) => [key, structuredClone(value)])),
    runs: new Map([...state.runs].map(([key, value]) => [key, structuredClone(value)])),
    items: state.items.map(value => structuredClone(value)),
    tombstones: state.tombstones.map(value => structuredClone(value)),
    manifests: new Map(state.manifests),
  };
}

function counts(records, participantId) {
  const output = { projects: 0, chats: 0, turns: 0, projectMemory: 0 };
  for (const row of records.values()) {
    if (row.participantId !== participantId) continue;
    if (row.kind === "project") output.projects += 1;
    if (row.kind === "chat") output.chats += 1;
    if (row.kind === "chat-turn") output.turns += 1;
    if (row.kind === "project-memory") output.projectMemory += 1;
  }
  return output;
}

export class MemoryGate4aStore {
  constructor() {
    this.adapterName = "memory-synthetic";
    this.state = { records: new Map(), runs: new Map(), items: [], tombstones: [], manifests: new Map() };
  }

  async commitSnapshot(plan, { failBeforeCommit = false, failAfterCommit = false } = {}) {
    const existing = this.state.runs.get(plan.runId);
    if (existing) {
      if (existing.manifestHmac !== plan.manifestHmac) throw coded("migration-run-conflict", "The run id was reused for different source content.");
      return { ...structuredClone(existing), replayed: true };
    }
    const next = cloneState(this.state);
    const currentManifest = next.manifests.get(plan.participantId) ?? null;
    if (currentManifest !== plan.predecessorManifestHmac) {
      throw coded("migration-predecessor-conflict", "The source snapshot does not name the current accepted predecessor.");
    }
    const incoming = new Set(plan.records.map(record => record.locatorHmac));
    for (const [key, row] of [...next.records]) {
      if (row.participantId !== plan.participantId || incoming.has(row.locatorHmac)) continue;
      next.records.delete(key);
      const tombstone = { runId: plan.runId, participantId: plan.participantId,
        kind: row.kind, locatorHmac: row.locatorHmac, deletedContentRetained: false };
      next.tombstones.push(tombstone);
      next.items.push({ ...tombstone, disposition: "deleted", sourceContentHmac: null,
        targetContentHmac: null, targetId: null });
    }
    for (const record of plan.records) {
      next.records.set(recordKey(record.participantId, record.kind, record.targetId), structuredClone(record));
      next.items.push({ runId: plan.runId, participantId: plan.participantId, kind: record.kind,
        locatorHmac: record.locatorHmac, sourceContentHmac: record.contentHmac,
        targetContentHmac: record.contentHmac,
        targetId: record.targetId, disposition: "upserted" });
    }
    const result = { schemaVersion: "runa2-gate4a-run-result/v1", runId: plan.runId,
      sourceSnapshotId: plan.sourceSnapshotId, participantId: plan.participantId,
      mode: plan.mode, domain: plan.domain, domainVersion: plan.domainVersion,
      sourceCommit: plan.sourceCommit, targetCommit: plan.targetCommit,
      sourceSnapshotDigest: plan.sourceSnapshotDigest, manifestHmac: plan.manifestHmac,
      predecessorManifestHmac: plan.predecessorManifestHmac,
      counts: counts(next.records, plan.participantId), tombstones: next.tombstones.filter(row => row.runId === plan.runId).length,
      replayed: false, committed: true };
    if (failBeforeCommit) throw coded("migration-simulated-before-commit", "The synthetic failure occurred before commit.");
    next.runs.set(plan.runId, result);
    next.manifests.set(plan.participantId, plan.manifestHmac);
    this.state = next;
    if (failAfterCommit) throw coded("migration-response-lost", "The commit succeeded but its response was lost.");
    return structuredClone(result);
  }

  async getRaw(kind, targetId, participantId = null) {
    const row = participantId === null
      ? [...this.state.records.values()].find(value => value.kind === kind && value.targetId === targetId)
      : this.state.records.get(recordKey(participantId, kind, targetId));
    return row ? structuredClone(row) : null;
  }
  async listRaw(kind, participantId) {
    return [...this.state.records.values()].filter(row => row.kind === kind && row.participantId === participantId)
      .map(value => structuredClone(value));
  }
  async auditState(participantId) {
    return { counts: counts(this.state.records, participantId), runs: this.state.runs.size,
      items: this.state.items.length, tombstones: this.state.tombstones.length,
      currentManifestHmac: this.state.manifests.get(participantId) ?? null };
  }
  tamper(kind, targetId, mutate, participantId = null) {
    const key = participantId === null
      ? [...this.state.records].find(([, value]) => value.kind === kind && value.targetId === targetId)?.[0]
      : recordKey(participantId, kind, targetId);
    const row = this.state.records.get(key);
    if (!row) throw new Error("missing row");
    this.state.records.set(key, mutate(structuredClone(row)));
  }
}
