const coded = (code, message) => Object.assign(new Error(message), { code });
function cloneState(state) { return { records: state.records.map(value => structuredClone(value)), indexes: state.indexes.map(value => structuredClone(value)), runs: new Map([...state.runs].map(([key, value]) => [key, structuredClone(value)])), manifestHmac: state.manifestHmac, sourceEntryDigests: [...state.sourceEntryDigests] }; }

export class MemoryGate4bStore {
  constructor() { this.adapterName = "memory-synthetic"; this.state = { records: [], indexes: [], runs: new Map(), manifestHmac: null, sourceEntryDigests: [] }; }
  async commitSnapshot(plan, { failBeforeCommit = false, failAfterCommit = false } = {}) {
    const existing = this.state.runs.get(plan.runId);
    if (existing) { if (existing.manifestHmac !== plan.manifestHmac) throw coded("migration-run-conflict", "The run id was reused for different source content."); return { ...structuredClone(existing), replayed: true }; }
    if (plan.predecessorManifestHmac !== this.state.manifestHmac) throw coded("migration-predecessor-conflict", "The source snapshot does not name the current accepted predecessor.");
    if (plan.sourceEntryDigests.length < this.state.sourceEntryDigests.length) throw coded("migration-append-only-violation", "The learning journal cannot shrink.");
    for (let index = 0; index < this.state.sourceEntryDigests.length; index += 1) if (plan.sourceEntryDigests[index] !== this.state.sourceEntryDigests[index]) throw coded("migration-append-only-violation", "The learning journal cannot rewrite accepted history.");
    const next = cloneState(this.state); const start = next.sourceEntryDigests.length;
    next.records.push(...plan.records.slice(start).map(value => structuredClone(value))); next.indexes.push(...plan.indexes.slice(start).map(value => structuredClone(value))); next.sourceEntryDigests = [...plan.sourceEntryDigests];
    const result = { schemaVersion: "runa2-gate4b-run-result/v1", runId: plan.runId, sourceSnapshotId: plan.sourceSnapshotId,
      participantId: plan.participantId, sourceCommit: plan.sourceCommit, domain: "learning-events", mode: "append-only-history-preservation",
      manifestHmac: plan.manifestHmac, predecessorManifestHmac: plan.predecessorManifestHmac, sourceHeadDigest: plan.sourceHeadDigest,
      counts: structuredClone(plan.counts), appendedEntries: plan.records.length - start, projectionActivated: false, committed: true, replayed: false };
    if (failBeforeCommit) throw coded("migration-simulated-before-commit", "The synthetic failure occurred before commit.");
    next.runs.set(plan.runId, result); next.manifestHmac = plan.manifestHmac; this.state = next;
    if (failAfterCommit) throw coded("migration-response-lost", "The commit succeeded but its response was lost.");
    return structuredClone(result);
  }
  async auditState() { return { records: this.state.records.length, indexes: this.state.indexes.length, runs: this.state.runs.size, manifestHmac: this.state.manifestHmac, sourceEntryDigests: [...this.state.sourceEntryDigests], projectionActivated: false }; }
}
