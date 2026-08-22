import pg from "pg";
import { PostgresGate4aStore } from "../../gate4/adapters/postgres.mjs";
import { PostgresGate4bStore } from "../../gate4b/adapters/postgres.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const clone = value => structuredClone(value);

export class PostgresGate6cStore {
  constructor({ connectionString, pool = null, coreCipher, learningCipher }) {
    this.pool = pool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 15_000 });
    this.ownsPool = !pool;
    this.coreStore = new PostgresGate4aStore({ pool: this.pool });
    this.learningStore = new PostgresGate4bStore({ pool: this.pool });
    this.coreCipher = coreCipher;
    this.learningCipher = learningCipher;
    this.adapterName = "postgres-gate6c";
  }

  async initialize() {
    await this.coreStore.initialize();
    await this.learningStore.initialize();
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS runa_governance;
      CREATE SCHEMA IF NOT EXISTS runa_gate6c;
      CREATE TABLE IF NOT EXISTS runa_core.participant_settings (
        participant_id text NOT NULL, setting_key text NOT NULL,
        setting_value text NOT NULL CHECK(setting_value IN ('Low','Medium','High')),
        revision bigint NOT NULL CHECK(revision > 0), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(participant_id,setting_key)
      );
      CREATE TABLE IF NOT EXISTS runa_governance.migrated_setting_receipts (
        run_id text NOT NULL, participant_id text NOT NULL, target_id text NOT NULL,
        occurred_at timestamptz NOT NULL, source_receipt_digest text NOT NULL,
        locator_hmac text NOT NULL, content_hmac text NOT NULL, private_envelope jsonb NOT NULL,
        PRIMARY KEY(run_id,target_id), UNIQUE(participant_id,source_receipt_digest)
      );
      CREATE TABLE IF NOT EXISTS runa_gate6c.runs (
        run_id text PRIMARY KEY, plan_digest text NOT NULL, binding_digest text NOT NULL,
        participant_id text NOT NULL, status text NOT NULL CHECK(status IN ('started','completed','rolled-back')),
        receipt_json jsonb, started_at timestamptz NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz
      );
    `);
  }

  async #targetCounts(participantId) {
    return (await this.pool.query(`SELECT
      (SELECT count(*)::int FROM runa_core.projects WHERE participant_id=$1) projects,
      (SELECT count(*)::int FROM runa_core.chats WHERE participant_id=$1) chats,
      (SELECT count(*)::int FROM runa_core.chat_turns WHERE participant_id=$1) turns,
      (SELECT count(*)::int FROM runa_core.project_memory WHERE participant_id=$1) project_memory,
      (SELECT count(*)::int FROM runa_learning.journal_entries WHERE participant_id=$1) learning,
      (SELECT count(*)::int FROM runa_core.participant_settings WHERE participant_id=$1) settings,
      (SELECT count(*)::int FROM runa_governance.migrated_setting_receipts WHERE participant_id=$1) receipts`,
    [participantId])).rows[0];
  }

  async #begin(plan) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`gate6c:${plan.runId}`]);
      const prior = (await client.query("SELECT * FROM runa_gate6c.runs WHERE run_id=$1 FOR UPDATE", [plan.runId])).rows[0];
      if (prior) {
        if (prior.plan_digest !== plan.planDigest) throw coded("gate6c-run-conflict", "The final-delta run id was reused for different input.");
        await client.query("COMMIT");
        return prior;
      }
      const counts = await this.#targetCounts(plan.participantId);
      if (Object.values(counts).some(count => count !== 0)) {
        throw coded("gate6c-target-not-empty", "The selected target participant already contains authoritative-looking data.");
      }
      await client.query(`INSERT INTO runa_gate6c.runs
        (run_id,plan_digest,binding_digest,participant_id,status) VALUES($1,$2,$3,$4,'started')`,
      [plan.runId, plan.planDigest, plan.bindingDigest, plan.participantId]);
      await client.query("COMMIT");
      return { run_id: plan.runId, plan_digest: plan.planDigest, binding_digest: plan.bindingDigest,
        participant_id: plan.participantId, status: "started", receipt_json: null };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async #commitSelected(plan) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`gate6c-selected:${plan.participantId}`]);
      await client.query(`INSERT INTO runa_core.participant_settings
        (participant_id,setting_key,setting_value,revision) VALUES($1,$2,$3,$4)
        ON CONFLICT(participant_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,
          revision=excluded.revision,updated_at=clock_timestamp()`,
      [plan.participantId, plan.setting.key, plan.setting.value, plan.setting.revision]);
      for (const record of plan.receiptRecords) await client.query(`INSERT INTO runa_governance.migrated_setting_receipts
        (run_id,participant_id,target_id,occurred_at,source_receipt_digest,locator_hmac,content_hmac,private_envelope)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(run_id,target_id) DO NOTHING`,
      [plan.runId, record.participantId, record.targetId, record.publicData.occurredAt,
        record.publicData.sourceReceiptDigest, record.locatorHmac, record.contentHmac,
        JSON.stringify(record.privateEnvelope)]);
      const receipt = { schemaVersion: "runa2-gate6c-final-delta-receipt/v1", runId: plan.runId,
        planDigest: plan.planDigest, bindingDigest: plan.bindingDigest, domains: clone(plan.domains),
        committed: true, replayed: false, plaintextPersisted: false, deferredStoresOpened: false,
        privateValuesIncluded: false };
      await client.query(`UPDATE runa_gate6c.runs SET status='completed',receipt_json=$2::jsonb,
        completed_at=clock_timestamp() WHERE run_id=$1 AND plan_digest=$3`,
      [plan.runId, JSON.stringify(receipt), plan.planDigest]);
      await client.query("COMMIT");
      return receipt;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async commitFinalDelta(plan, { failBeforeCommit = false, failAfterCommit = false } = {}) {
    const state = await this.#begin(plan);
    if (state.status === "rolled-back") throw coded("gate6c-run-rolled-back", "A rolled-back final-delta run cannot resume.");
    if (state.status === "completed") return Object.freeze({ ...clone(state.receipt_json), replayed: true });
    if (failBeforeCommit) throw coded("gate6c-simulated-before-commit", "The final delta failed before protected target writes.");
    const projectResult = await this.coreStore.commitSnapshot(plan.projectChatPlan);
    const learningResult = await this.learningStore.commitSnapshot(plan.learningPlan);
    if (!projectResult.committed || !learningResult.committed) throw coded("gate6c-domain-commit-failed", "A selected migration domain did not commit.");
    const receipt = await this.#commitSelected(plan);
    if (failAfterCommit) throw coded("gate6c-response-lost", "The final delta committed but its response was lost.");
    return Object.freeze(receipt);
  }

  async rollbackRun(runId) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const run = (await client.query("SELECT * FROM runa_gate6c.runs WHERE run_id=$1 FOR UPDATE", [runId])).rows[0];
      if (!run) throw coded("gate6c-run-not-found", "The final-delta run was not found.");
      if (run.status !== "rolled-back") {
        await client.query("DELETE FROM runa_governance.migrated_setting_receipts WHERE run_id=$1", [runId]);
        await client.query("DELETE FROM runa_core.participant_settings WHERE participant_id=$1 AND setting_key='defaultIntelligenceLevel'", [run.participant_id]);
        await client.query("DELETE FROM runa_learning.journal_entries WHERE participant_id=$1", [run.participant_id]);
        await client.query("DELETE FROM runa_learning_migration.runs WHERE run_id=$1", [`${runId}:learning-events`]);
        await client.query("DELETE FROM runa_learning_migration.domain_state WHERE participant_id=$1", [run.participant_id]);
        for (const table of ["project_memory", "chat_turns", "chats", "projects"])
          await client.query(`DELETE FROM runa_core.${table} WHERE participant_id=$1`, [run.participant_id]);
        await client.query("DELETE FROM runa_migration.runs WHERE run_id=$1", [`${runId}:project-chat`]);
        await client.query("DELETE FROM runa_migration.domain_state WHERE participant_id=$1", [run.participant_id]);
        await client.query("UPDATE runa_gate6c.runs SET status='rolled-back' WHERE run_id=$1", [runId]);
      }
      await client.query("COMMIT");
      return Object.freeze({ schemaVersion: "runa2-gate6c-rollback-receipt/v1", runId,
        rollbackScope: "target-run-only", legacyModified: false, rolledBack: true,
        privateValuesIncluded: false });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async audit(participantId) {
    const counts = await this.#targetCounts(participantId);
    const run = (await this.pool.query(`SELECT status,receipt_json FROM runa_gate6c.runs
      WHERE participant_id=$1 ORDER BY started_at DESC LIMIT 1`, [participantId])).rows[0];
    return Object.freeze({ ...counts, runStatus: run?.status ?? null,
      domains: run?.receipt_json?.domains ?? null });
  }

  async close() { if (this.ownsPool) await this.pool.end(); }
}
