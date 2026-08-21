import pg from "pg";

const coded = (code, message) => Object.assign(new Error(message), { code });
const tableFor = kind => {
  const table = { project: "projects", chat: "chats", "chat-turn": "chat_turns", "project-memory": "project_memory" }[kind];
  if (!table) throw coded("migration-kind-invalid", `Unknown record kind: ${kind}`);
  return table;
};
const deleteOrder = ["project-memory", "chat-turn", "chat", "project"];

function mapRow(kind, row) {
  if (!row) return null;
  if (kind === "project") return {
    kind, targetId: row.project_id, participantId: row.participant_id,
    locatorHmac: row.locator_hmac, contentHmac: row.source_content_hmac,
    publicData: { projectId: row.project_id, schemaVersion: row.schema_version,
      projectType: row.project_type, status: row.status,
      registeredAt: new Date(row.registered_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
      memoryEnabled: row.memory_enabled }, privateEnvelope: row.private_payload_envelope,
  };
  if (kind === "chat") return {
    kind, targetId: row.chat_id, participantId: row.participant_id,
    locatorHmac: row.locator_hmac, contentHmac: row.source_content_hmac,
    publicData: { chatId: row.chat_id, projectId: row.project_id,
      parentChatId: row.parent_chat_id, branchFromTurn: row.branch_from_turn,
      turnCount: row.turn_count, archived: row.archived, unread: row.unread,
      createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() },
    privateEnvelope: row.title_envelope,
  };
  if (kind === "chat-turn") return {
    kind, targetId: `turn:${row.chat_id}:${row.turn_ordinal}`, participantId: row.participant_id,
    locatorHmac: row.locator_hmac, contentHmac: row.source_content_hmac,
    publicData: { chatId: row.chat_id, turnOrdinal: row.turn_ordinal,
      occurredAt: new Date(row.occurred_at).toISOString(), route: row.route,
      originRequestId: row.origin_request_id }, privateEnvelope: row.content_envelope,
  };
  return {
    kind, targetId: row.memory_id, participantId: row.participant_id,
    locatorHmac: row.locator_hmac, contentHmac: row.source_content_hmac,
    publicData: { memoryId: row.memory_id, projectId: row.project_id,
      createdAt: new Date(row.created_at).toISOString(), tier: row.tier,
      scope: row.scope, source: row.source }, privateEnvelope: row.private_payload_envelope,
  };
}

export class PostgresGate4aStore {
  constructor({ connectionString, pool = null }) {
    this.pool = pool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 8_000 });
    this.ownsPool = !pool;
    this.adapterName = "postgres-gate4a";
  }

  async initialize({ reset = false } = {}) {
    if (reset) await this.pool.query("DROP SCHEMA IF EXISTS runa_migration CASCADE; DROP SCHEMA IF EXISTS runa_core CASCADE");
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS runa_core;
      CREATE SCHEMA IF NOT EXISTS runa_migration;
      CREATE TABLE IF NOT EXISTS runa_core.projects (
        project_id text NOT NULL, participant_id text NOT NULL,
        schema_version text NOT NULL, project_type text NOT NULL,
        status text NOT NULL CHECK(status IN ('managed','archived')),
        registered_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
        memory_enabled boolean NOT NULL CHECK(NOT memory_enabled OR status='managed'),
        private_payload_envelope jsonb NOT NULL, payload_hmac text NOT NULL,
        locator_hmac text NOT NULL, source_content_hmac text NOT NULL,
        PRIMARY KEY(participant_id,project_id), UNIQUE(participant_id,locator_hmac)
      );
      CREATE TABLE IF NOT EXISTS runa_core.chats (
        chat_id text NOT NULL, participant_id text NOT NULL, project_id text,
        parent_chat_id text, branch_from_turn integer CHECK(branch_from_turn IS NULL OR branch_from_turn >= 0),
        turn_count integer NOT NULL CHECK(turn_count >= 0), archived boolean NOT NULL,
        unread boolean NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
        title_envelope jsonb NOT NULL, title_hmac text NOT NULL,
        locator_hmac text NOT NULL, source_content_hmac text NOT NULL,
        PRIMARY KEY(participant_id,chat_id), UNIQUE(participant_id,locator_hmac),
        CHECK((parent_chat_id IS NULL) = (branch_from_turn IS NULL)),
        FOREIGN KEY(participant_id,project_id) REFERENCES runa_core.projects(participant_id,project_id)
      );
      CREATE TABLE IF NOT EXISTS runa_core.chat_turns (
        participant_id text NOT NULL, chat_id text NOT NULL, turn_ordinal integer NOT NULL CHECK(turn_ordinal >= 0),
        occurred_at timestamptz NOT NULL, route text NOT NULL, origin_request_id text,
        content_envelope jsonb NOT NULL, content_hmac text NOT NULL,
        locator_hmac text NOT NULL, source_content_hmac text NOT NULL,
        PRIMARY KEY(participant_id,chat_id,turn_ordinal), UNIQUE(participant_id,locator_hmac),
        FOREIGN KEY(participant_id,chat_id) REFERENCES runa_core.chats(participant_id,chat_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS runa_core.project_memory (
        memory_id text NOT NULL, participant_id text NOT NULL, project_id text NOT NULL,
        created_at timestamptz NOT NULL, tier text NOT NULL CHECK(tier='project-memory'),
        scope text NOT NULL, source text NOT NULL,
        private_payload_envelope jsonb NOT NULL, payload_hmac text NOT NULL,
        locator_hmac text NOT NULL, source_content_hmac text NOT NULL,
        PRIMARY KEY(participant_id,memory_id), UNIQUE(participant_id,locator_hmac),
        FOREIGN KEY(participant_id,project_id) REFERENCES runa_core.projects(participant_id,project_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS runa_migration.domain_state (
        participant_id text PRIMARY KEY, manifest_hmac text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS runa_migration.runs (
        run_id text PRIMARY KEY, domain text NOT NULL, domain_version text NOT NULL,
        source_snapshot_id text NOT NULL, source_snapshot_digest text NOT NULL,
        source_commit text, target_commit text, participant_id text NOT NULL,
        mode text NOT NULL CHECK(mode IN ('synthetic','inventory','protected-rehearsal','cutover')),
        status text NOT NULL CHECK(status IN ('completed')),
        manifest_hmac text NOT NULL, predecessor_manifest_hmac text,
        result_json jsonb NOT NULL, verifier_result_json jsonb NOT NULL,
        started_at timestamptz NOT NULL, completed_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runa_migration.items (
        run_id text NOT NULL REFERENCES runa_migration.runs(run_id) ON DELETE CASCADE,
        kind text NOT NULL, locator_hmac text NOT NULL, source_content_hmac text,
        target_content_hmac text,
        target_id text, disposition text NOT NULL CHECK(disposition IN ('upserted','deleted')),
        recorded_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(run_id,kind,locator_hmac)
      );
      CREATE TABLE IF NOT EXISTS runa_migration.tombstones (
        run_id text NOT NULL REFERENCES runa_migration.runs(run_id) ON DELETE CASCADE,
        participant_id text NOT NULL, kind text NOT NULL, locator_hmac text NOT NULL,
        deleted_content_retained boolean NOT NULL DEFAULT false CHECK(NOT deleted_content_retained),
        PRIMARY KEY(run_id,kind,locator_hmac)
      );
    `);
  }

  async #insertRecord(client, record) {
    const p = record.publicData;
    if (record.kind === "project") return client.query(`INSERT INTO runa_core.projects
      (project_id,participant_id,schema_version,project_type,status,registered_at,updated_at,memory_enabled,
       private_payload_envelope,payload_hmac,locator_hmac,source_content_hmac)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
      ON CONFLICT(participant_id,project_id) DO UPDATE SET schema_version=excluded.schema_version,
       project_type=excluded.project_type,status=excluded.status,registered_at=excluded.registered_at,
       updated_at=excluded.updated_at,memory_enabled=excluded.memory_enabled,
       private_payload_envelope=excluded.private_payload_envelope,payload_hmac=excluded.payload_hmac,
       locator_hmac=excluded.locator_hmac,source_content_hmac=excluded.source_content_hmac`,
    [p.projectId, record.participantId, p.schemaVersion, p.projectType, p.status, p.registeredAt,
      p.updatedAt, p.memoryEnabled, JSON.stringify(record.privateEnvelope), record.privateEnvelope.contentHmac,
      record.locatorHmac, record.contentHmac]);
    if (record.kind === "chat") return client.query(`INSERT INTO runa_core.chats
      (chat_id,participant_id,project_id,parent_chat_id,branch_from_turn,turn_count,archived,unread,
       created_at,updated_at,title_envelope,title_hmac,locator_hmac,source_content_hmac)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)
      ON CONFLICT(participant_id,chat_id) DO UPDATE SET project_id=excluded.project_id,
       parent_chat_id=excluded.parent_chat_id,branch_from_turn=excluded.branch_from_turn,
       turn_count=excluded.turn_count,archived=excluded.archived,unread=excluded.unread,
       created_at=excluded.created_at,updated_at=excluded.updated_at,title_envelope=excluded.title_envelope,
       title_hmac=excluded.title_hmac,locator_hmac=excluded.locator_hmac,source_content_hmac=excluded.source_content_hmac`,
    [p.chatId, record.participantId, p.projectId, p.parentChatId, p.branchFromTurn, p.turnCount,
      p.archived, p.unread, p.createdAt, p.updatedAt, JSON.stringify(record.privateEnvelope),
      record.privateEnvelope.contentHmac, record.locatorHmac, record.contentHmac]);
    if (record.kind === "chat-turn") return client.query(`INSERT INTO runa_core.chat_turns
      (participant_id,chat_id,turn_ordinal,occurred_at,route,origin_request_id,content_envelope,
       content_hmac,locator_hmac,source_content_hmac)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
      ON CONFLICT(participant_id,chat_id,turn_ordinal) DO UPDATE SET occurred_at=excluded.occurred_at,
       route=excluded.route,origin_request_id=excluded.origin_request_id,content_envelope=excluded.content_envelope,
       content_hmac=excluded.content_hmac,locator_hmac=excluded.locator_hmac,source_content_hmac=excluded.source_content_hmac`,
    [record.participantId, p.chatId, p.turnOrdinal, p.occurredAt, p.route, p.originRequestId,
      JSON.stringify(record.privateEnvelope), record.privateEnvelope.contentHmac,
      record.locatorHmac, record.contentHmac]);
    return client.query(`INSERT INTO runa_core.project_memory
      (memory_id,participant_id,project_id,created_at,tier,scope,source,private_payload_envelope,
       payload_hmac,locator_hmac,source_content_hmac)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
      ON CONFLICT(participant_id,memory_id) DO UPDATE SET project_id=excluded.project_id,
       created_at=excluded.created_at,tier=excluded.tier,scope=excluded.scope,source=excluded.source,
       private_payload_envelope=excluded.private_payload_envelope,payload_hmac=excluded.payload_hmac,
       locator_hmac=excluded.locator_hmac,source_content_hmac=excluded.source_content_hmac`,
    [p.memoryId, record.participantId, p.projectId, p.createdAt, p.tier, p.scope, p.source,
      JSON.stringify(record.privateEnvelope), record.privateEnvelope.contentHmac,
      record.locatorHmac, record.contentHmac]);
  }

  async commitSnapshot(plan, { failBeforeCommit = false, failAfterCommit = false } = {}) {
    const client = await this.pool.connect();
    let committed = false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`gate4a:${plan.participantId}`]);
      const existing = (await client.query("SELECT manifest_hmac,result_json FROM runa_migration.runs WHERE run_id=$1", [plan.runId])).rows[0];
      if (existing) {
        if (existing.manifest_hmac !== plan.manifestHmac) throw coded("migration-run-conflict", "The run id was reused for different source content.");
        await client.query("COMMIT"); committed = true;
        return { ...existing.result_json, replayed: true };
      }
      const state = (await client.query("SELECT manifest_hmac FROM runa_migration.domain_state WHERE participant_id=$1 FOR UPDATE", [plan.participantId])).rows[0];
      if ((state?.manifest_hmac ?? null) !== plan.predecessorManifestHmac) throw coded("migration-predecessor-conflict", "The source snapshot does not name the current accepted predecessor.");
      const incoming = new Set(plan.records.map(record => record.locatorHmac));
      const deleted = [];
      for (const kind of deleteOrder) {
        const table = tableFor(kind);
        const rows = (await client.query(`SELECT locator_hmac FROM runa_core.${table} WHERE participant_id=$1`, [plan.participantId])).rows;
        for (const row of rows) if (!incoming.has(row.locator_hmac)) deleted.push({ kind, locatorHmac: row.locator_hmac });
        const keep = plan.records.filter(record => record.kind === kind).map(record => record.locatorHmac);
        if (keep.length) await client.query(`DELETE FROM runa_core.${table} WHERE participant_id=$1 AND NOT(locator_hmac = ANY($2::text[]))`, [plan.participantId, keep]);
        else await client.query(`DELETE FROM runa_core.${table} WHERE participant_id=$1`, [plan.participantId]);
      }
      for (const kind of ["project", "chat", "chat-turn", "project-memory"])
        for (const record of plan.records.filter(value => value.kind === kind)) await this.#insertRecord(client, record);
      const kindCounts = Object.fromEntries(["project", "chat", "chat-turn", "project-memory"].map(kind => [kind, plan.records.filter(record => record.kind === kind).length]));
      const result = { schemaVersion: "runa2-gate4a-run-result/v1", runId: plan.runId,
        sourceSnapshotId: plan.sourceSnapshotId, participantId: plan.participantId,
        mode: plan.mode, domain: plan.domain, domainVersion: plan.domainVersion,
        sourceCommit: plan.sourceCommit, targetCommit: plan.targetCommit,
        sourceSnapshotDigest: plan.sourceSnapshotDigest, manifestHmac: plan.manifestHmac,
        predecessorManifestHmac: plan.predecessorManifestHmac,
        counts: { projects: kindCounts.project, chats: kindCounts.chat,
          turns: kindCounts["chat-turn"], projectMemory: kindCounts["project-memory"] },
        tombstones: deleted.length, replayed: false, committed: true };
      const completedAt = new Date().toISOString();
      const verifierResult = { passed: true, counts: result.counts, tombstones: result.tombstones };
      await client.query(`INSERT INTO runa_migration.runs
        (run_id,domain,domain_version,source_snapshot_id,source_snapshot_digest,source_commit,target_commit,
         participant_id,mode,status,manifest_hmac,predecessor_manifest_hmac,result_json,verifier_result_json,
         started_at,completed_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed',$10,$11,$12::jsonb,$13::jsonb,$14,$14)`,
      [plan.runId, plan.domain, plan.domainVersion, plan.sourceSnapshotId, plan.sourceSnapshotDigest,
        plan.sourceCommit, plan.targetCommit, plan.participantId, plan.mode, plan.manifestHmac,
        plan.predecessorManifestHmac, JSON.stringify(result), JSON.stringify(verifierResult), completedAt]);
      for (const record of plan.records) await client.query(`INSERT INTO runa_migration.items
        (run_id,kind,locator_hmac,source_content_hmac,target_content_hmac,target_id,disposition)
        VALUES($1,$2,$3,$4,$4,$5,'upserted')`,
      [plan.runId, record.kind, record.locatorHmac, record.contentHmac, record.targetId]);
      for (const row of deleted) {
        await client.query("INSERT INTO runa_migration.items(run_id,kind,locator_hmac,disposition) VALUES($1,$2,$3,'deleted')", [plan.runId, row.kind, row.locatorHmac]);
        await client.query(`INSERT INTO runa_migration.tombstones
          (run_id,participant_id,kind,locator_hmac,deleted_content_retained) VALUES($1,$2,$3,$4,false)`,
        [plan.runId, plan.participantId, row.kind, row.locatorHmac]);
      }
      await client.query(`INSERT INTO runa_migration.domain_state(participant_id,manifest_hmac)
        VALUES($1,$2) ON CONFLICT(participant_id) DO UPDATE SET manifest_hmac=excluded.manifest_hmac,updated_at=now()`,
      [plan.participantId, plan.manifestHmac]);
      if (failBeforeCommit) throw coded("migration-simulated-before-commit", "The synthetic failure occurred before commit.");
      await client.query("COMMIT"); committed = true;
      if (failAfterCommit) throw coded("migration-response-lost", "The commit succeeded but its response was lost.");
      return result;
    } catch (error) {
      if (!committed) await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async #rows(kind, participantId = null, targetId = null) {
    const table = tableFor(kind);
    const idClause = kind === "project" ? "project_id" : kind === "chat" ? "chat_id" : kind === "project-memory" ? "memory_id" : null;
    let sql = `SELECT * FROM runa_core.${table} WHERE ($1::text IS NULL OR participant_id=$1)`;
    const params = [participantId];
    if (targetId !== null && idClause) { sql += ` AND ${idClause}=$2`; params.push(targetId); }
    if (targetId !== null && kind === "chat-turn") {
      const match = /^turn:([a-f0-9]{32}):(\d+)$/.exec(targetId);
      if (!match) return [];
      sql += " AND chat_id=$2 AND turn_ordinal=$3"; params.push(match[1], Number(match[2]));
    }
    sql += idClause ? ` ORDER BY ${idClause}` : " ORDER BY chat_id,turn_ordinal";
    return (await this.pool.query(sql, params)).rows.map(row => mapRow(kind, row));
  }
  async getRaw(kind, targetId, participantId = null) { return (await this.#rows(kind, participantId, targetId))[0] ?? null; }
  async listRaw(kind, participantId) { return this.#rows(kind, participantId); }
  async auditState(participantId) {
    return (await this.pool.query(`SELECT
      (SELECT count(*)::int FROM runa_core.projects WHERE participant_id=$1) projects,
      (SELECT count(*)::int FROM runa_core.chats WHERE participant_id=$1) chats,
      (SELECT count(*)::int FROM runa_core.chat_turns WHERE participant_id=$1) turns,
      (SELECT count(*)::int FROM runa_core.project_memory WHERE participant_id=$1) project_memory,
      (SELECT count(*)::int FROM runa_migration.runs WHERE participant_id=$1) runs,
      (SELECT count(*)::int FROM runa_migration.items i JOIN runa_migration.runs r USING(run_id) WHERE r.participant_id=$1) items,
      (SELECT count(*)::int FROM runa_migration.tombstones WHERE participant_id=$1) tombstones,
      (SELECT manifest_hmac FROM runa_migration.domain_state WHERE participant_id=$1) current_manifest_hmac`, [participantId])).rows[0];
  }
  async dropGate4aSchemas() { await this.pool.query("DROP SCHEMA IF EXISTS runa_migration CASCADE; DROP SCHEMA IF EXISTS runa_core CASCADE"); }
  async close() { if (this.ownsPool) await this.pool.end(); }
}
