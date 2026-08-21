import pg from "pg";

const coded = (code, message) => Object.assign(new Error(message), { code });

function resultFor(plan, appendedEntries) {
  return {
    schemaVersion: "runa2-gate4b-run-result/v1",
    runId: plan.runId,
    sourceSnapshotId: plan.sourceSnapshotId,
    participantId: plan.participantId,
    sourceCommit: plan.sourceCommit,
    domain: "learning-events",
    mode: "append-only-history-preservation",
    manifestHmac: plan.manifestHmac,
    predecessorManifestHmac: plan.predecessorManifestHmac,
    sourceHeadDigest: plan.sourceHeadDigest,
    counts: structuredClone(plan.counts),
    appendedEntries,
    projectionActivated: false,
    committed: true,
    replayed: false,
  };
}

export class PostgresGate4bStore {
  constructor({ connectionString, pool = null }) {
    this.pool = pool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 8_000 });
    this.ownsPool = !pool;
    this.adapterName = "postgres-gate4b";
  }

  async initialize({ reset = false } = {}) {
    if (reset) await this.pool.query("DROP SCHEMA IF EXISTS runa_learning_migration CASCADE; DROP SCHEMA IF EXISTS runa_learning CASCADE");
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS runa_learning;
      CREATE SCHEMA IF NOT EXISTS runa_learning_migration;
      CREATE TABLE IF NOT EXISTS runa_learning.journal_entries (
        participant_id text NOT NULL,
        sequence integer NOT NULL CHECK(sequence > 0),
        target_id text NOT NULL,
        entry_kind text NOT NULL CHECK(entry_kind IN ('learning-event','outcome-feedback','lifecycle','approval','approval-batch')),
        recorded_at timestamptz NOT NULL,
        source_entry_digest text NOT NULL CHECK(source_entry_digest ~ '^sha256:[a-f0-9]{64}$'),
        previous_source_entry_digest text CHECK(previous_source_entry_digest IS NULL OR previous_source_entry_digest ~ '^sha256:[a-f0-9]{64}$'),
        private_envelope jsonb NOT NULL,
        envelope_hmac text NOT NULL CHECK(envelope_hmac ~ '^[a-f0-9]{64}$'),
        PRIMARY KEY(participant_id, sequence),
        UNIQUE(participant_id, target_id),
        UNIQUE(participant_id, source_entry_digest)
      );
      CREATE TABLE IF NOT EXISTS runa_learning.journal_index (
        participant_id text NOT NULL,
        sequence integer NOT NULL,
        schema_version text NOT NULL,
        entry_kind text NOT NULL,
        recorded_at timestamptz NOT NULL,
        reference_type text NOT NULL CHECK(reference_type IN ('event','outcome','approval','approval-batch')),
        reference_hmac text NOT NULL CHECK(reference_hmac ~ '^[a-f0-9]{64}$'),
        event_type text,
        destination text,
        scope text,
        authority_state text,
        action text,
        target_event_hmac text CHECK(target_event_hmac IS NULL OR target_event_hmac ~ '^[a-f0-9]{64}$'),
        approval_count integer CHECK(approval_count IS NULL OR approval_count > 0),
        PRIMARY KEY(participant_id, sequence),
        FOREIGN KEY(participant_id, sequence) REFERENCES runa_learning.journal_entries(participant_id, sequence) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS runa_learning_migration.domain_state (
        participant_id text PRIMARY KEY,
        manifest_hmac text NOT NULL,
        source_entry_digests jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS runa_learning_migration.runs (
        run_id text PRIMARY KEY,
        participant_id text NOT NULL,
        source_snapshot_id text NOT NULL,
        source_commit text NOT NULL,
        manifest_hmac text NOT NULL,
        predecessor_manifest_hmac text,
        result_json jsonb NOT NULL,
        completed_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runa_learning_migration.items (
        run_id text NOT NULL REFERENCES runa_learning_migration.runs(run_id) ON DELETE CASCADE,
        sequence integer NOT NULL,
        source_entry_digest text NOT NULL,
        target_id text NOT NULL,
        disposition text NOT NULL CHECK(disposition='appended'),
        PRIMARY KEY(run_id, sequence)
      );
    `);
  }

  async commitSnapshot(plan, { failBeforeCommit = false, failAfterCommit = false } = {}) {
    const client = await this.pool.connect();
    let committed = false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`gate4b:${plan.participantId}`]);
      const existing = (await client.query(
        "SELECT manifest_hmac,result_json FROM runa_learning_migration.runs WHERE run_id=$1",
        [plan.runId],
      )).rows[0];
      if (existing) {
        if (existing.manifest_hmac !== plan.manifestHmac) throw coded("migration-run-conflict", "The run id was reused for different source content.");
        await client.query("COMMIT"); committed = true;
        return { ...existing.result_json, replayed: true };
      }

      const state = (await client.query(
        "SELECT manifest_hmac,source_entry_digests FROM runa_learning_migration.domain_state WHERE participant_id=$1 FOR UPDATE",
        [plan.participantId],
      )).rows[0];
      const priorManifest = state?.manifest_hmac ?? null;
      const priorDigests = state?.source_entry_digests ?? [];
      if (priorManifest !== plan.predecessorManifestHmac) throw coded("migration-predecessor-conflict", "The source snapshot does not name the current accepted predecessor.");
      if (plan.sourceEntryDigests.length < priorDigests.length) throw coded("migration-append-only-violation", "The learning journal cannot shrink.");
      for (let index = 0; index < priorDigests.length; index += 1) {
        if (plan.sourceEntryDigests[index] !== priorDigests[index]) throw coded("migration-append-only-violation", "The learning journal cannot rewrite accepted history.");
      }

      const start = priorDigests.length;
      for (let index = start; index < plan.records.length; index += 1) {
        const record = plan.records[index];
        const metadata = plan.indexes[index];
        await client.query(`INSERT INTO runa_learning.journal_entries
          (participant_id,sequence,target_id,entry_kind,recorded_at,source_entry_digest,
           previous_source_entry_digest,private_envelope,envelope_hmac)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
        [record.participantId, record.sequence, record.targetId, record.entryKind, metadata.recordedAt,
          record.sourceEntryDigest, record.previousSourceEntryDigest, JSON.stringify(record.privateEnvelope),
          record.privateEnvelope.contentHmac]);
        await client.query(`INSERT INTO runa_learning.journal_index
          (participant_id,sequence,schema_version,entry_kind,recorded_at,reference_type,reference_hmac,
           event_type,destination,scope,authority_state,action,target_event_hmac,approval_count)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [record.participantId, metadata.sequence, metadata.schemaVersion, metadata.entryKind,
          metadata.recordedAt, metadata.referenceType, metadata.referenceHmac,
          metadata.eventType ?? null, metadata.destination ?? null, metadata.scope ?? null,
          metadata.authorityState ?? null, metadata.action ?? null,
          metadata.targetEventHmac ?? null, metadata.approvalCount ?? null]);
      }

      const result = resultFor(plan, plan.records.length - start);
      const completedAt = new Date().toISOString();
      await client.query(`INSERT INTO runa_learning_migration.runs
        (run_id,participant_id,source_snapshot_id,source_commit,manifest_hmac,
         predecessor_manifest_hmac,result_json,completed_at)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [plan.runId, plan.participantId, plan.sourceSnapshotId, plan.sourceCommit, plan.manifestHmac,
        plan.predecessorManifestHmac, JSON.stringify(result), completedAt]);
      for (let index = start; index < plan.records.length; index += 1) {
        const record = plan.records[index];
        await client.query(`INSERT INTO runa_learning_migration.items
          (run_id,sequence,source_entry_digest,target_id,disposition) VALUES($1,$2,$3,$4,'appended')`,
        [plan.runId, record.sequence, record.sourceEntryDigest, record.targetId]);
      }
      await client.query(`INSERT INTO runa_learning_migration.domain_state
        (participant_id,manifest_hmac,source_entry_digests) VALUES($1,$2,$3::jsonb)
        ON CONFLICT(participant_id) DO UPDATE SET manifest_hmac=excluded.manifest_hmac,
          source_entry_digests=excluded.source_entry_digests,updated_at=now()`,
      [plan.participantId, plan.manifestHmac, JSON.stringify(plan.sourceEntryDigests)]);
      if (failBeforeCommit) throw coded("migration-simulated-before-commit", "The synthetic failure occurred before commit.");
      await client.query("COMMIT"); committed = true;
      if (failAfterCommit) throw coded("migration-response-lost", "The commit succeeded but its response was lost.");
      return result;
    } catch (error) {
      if (!committed) await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async readRawRecords(participantId) {
    return (await this.pool.query(`SELECT participant_id,sequence,target_id,entry_kind,
      source_entry_digest,previous_source_entry_digest,private_envelope
      FROM runa_learning.journal_entries WHERE participant_id=$1 ORDER BY sequence`, [participantId])).rows;
  }

  async readRawIndexes(participantId) {
    return (await this.pool.query("SELECT * FROM runa_learning.journal_index WHERE participant_id=$1 ORDER BY sequence", [participantId])).rows;
  }

  async auditState(participantId) {
    return (await this.pool.query(`SELECT
      (SELECT count(*)::int FROM runa_learning.journal_entries WHERE participant_id=$1) entries,
      (SELECT count(*)::int FROM runa_learning.journal_index WHERE participant_id=$1) indexes,
      (SELECT count(*)::int FROM runa_learning_migration.runs WHERE participant_id=$1) runs,
      (SELECT count(*)::int FROM runa_learning_migration.items i JOIN runa_learning_migration.runs r USING(run_id) WHERE r.participant_id=$1) items,
      (SELECT manifest_hmac FROM runa_learning_migration.domain_state WHERE participant_id=$1) current_manifest_hmac`, [participantId])).rows[0];
  }

  async dropGate4bSchemas() {
    await this.pool.query("DROP SCHEMA IF EXISTS runa_learning_migration CASCADE; DROP SCHEMA IF EXISTS runa_learning CASCADE");
  }

  async close() { if (this.ownsPool) await this.pool.end(); }
}
