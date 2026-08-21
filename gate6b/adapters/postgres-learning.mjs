import pg from "pg";
import { GATE4C_ACCEPTED_SOURCE_VERSION } from "../../gate4c/formats.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });

export class PostgresAcceptedLearningSource {
  constructor({ connectionString, pool = null, participantId = null, cipher }) {
    this.pool = pool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 8_000 });
    this.ownsPool = !pool;
    this.participantId = participantId;
    this.cipher = cipher;
  }

  async load({ requestScope = null } = {}) {
    const participantId = this.participantId ?? requestScope?.participantId;
    if (typeof participantId !== "string" || !participantId) {
      throw coded("approved-knowledge-participant-required", "An authenticated participant scope is required.");
    }
    const state = (await this.pool.query(`SELECT manifest_hmac FROM runa_learning_migration.domain_state
      WHERE participant_id=$1`, [participantId])).rows[0];
    if (!state) throw coded("approved-knowledge-source-unavailable", "No accepted learning authority is available.");
    const run = (await this.pool.query(`SELECT source_snapshot_id,source_commit,manifest_hmac,
      predecessor_manifest_hmac FROM runa_learning_migration.runs
      WHERE participant_id=$1 AND manifest_hmac=$2 ORDER BY completed_at DESC LIMIT 1`,
    [participantId, state.manifest_hmac])).rows[0];
    if (!run) throw coded("approved-knowledge-source-unavailable", "The accepted learning run is unavailable.");
    const rows = (await this.pool.query(`SELECT participant_id,sequence,target_id,entry_kind,
      source_entry_digest,previous_source_entry_digest,private_envelope
      FROM runa_learning.journal_entries WHERE participant_id=$1 ORDER BY sequence`, [participantId])).rows;
    if (!rows.length) throw coded("approved-knowledge-source-unavailable", "The accepted learning journal is empty.");
    const records = rows.map(row => ({ schemaVersion: "runa2-learning-journal-record/v1",
      participantId: row.participant_id, sequence: row.sequence, targetId: row.target_id,
      entryKind: row.entry_kind, sourceEntryDigest: row.source_entry_digest,
      previousSourceEntryDigest: row.previous_source_entry_digest,
      privateEnvelope: row.private_envelope }));
    const first = records[0];
    const entry = this.cipher.decrypt({ recordType: "learning-journal-entry",
      participantId, recordId: first.targetId, field: "legacy-entry" }, first.privateEnvelope);
    return Object.freeze({
      schemaVersion: GATE4C_ACCEPTED_SOURCE_VERSION,
      sourceSnapshotId: run.source_snapshot_id,
      participantId,
      sourceCommit: run.source_commit,
      predecessorManifestHmac: run.predecessor_manifest_hmac,
      journalId: entry.journalId,
      manifestHmac: run.manifest_hmac,
      sourceHeadDigest: records.at(-1).sourceEntryDigest,
      records: Object.freeze(records),
    });
  }

  async close() { if (this.ownsPool) await this.pool.end(); }
}
