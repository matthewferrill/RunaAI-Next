import { createHash } from "node:crypto";
import pg from "pg";
import { PERSONAL_SCOPE } from "../application.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const clone = value => structuredClone(value);
const requestDigest = value => sha256(JSON.stringify(value));
const lockKey = value => {
  const unsigned = BigInt(`0x${sha256(value).slice(0, 16)}`);
  return (unsigned > 0x7fffffffffffffffn ? unsigned - 0x10000000000000000n : unsigned).toString();
};

function routeFor(lane) {
  return { general: "general-chat", guarded: "guarded-chat", research: "research-chat",
    workspace: "workspace-chat" }[lane] ?? "general-chat";
}

function safeTitle(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled chat";
}

export class PostgresSelectedContinuityStore {
  constructor({ connectionString, pool = null, cipher, now = () => new Date() }) {
    this.pool = pool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 8_000 });
    this.ownsPool = !pool;
    this.cipher = cipher;
    this.now = now;
    this.adapterName = "postgres-runa-core";
  }

  async initialize() {
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS runa_runtime;
      CREATE TABLE IF NOT EXISTS runa_runtime.answer_requests (
        request_id text PRIMARY KEY, request_digest text NOT NULL,
        participant_id text NOT NULL, project_scope text NOT NULL, thread_id text NOT NULL,
        response_digest text NOT NULL, completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE TABLE IF NOT EXISTS runa_runtime.route_responses (
        operation text NOT NULL, request_id text NOT NULL, actor_id text NOT NULL,
        input_digest text NOT NULL, response_json jsonb NOT NULL,
        completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(operation,request_id)
      );
      CREATE TABLE IF NOT EXISTS runa_core.participant_settings (
        participant_id text NOT NULL, setting_key text NOT NULL,
        setting_value text NOT NULL CHECK(setting_value IN ('Low','Medium','High')),
        revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
        updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(participant_id,setting_key)
      );
    `);
  }

  async status() {
    const row = (await this.pool.query(`SELECT
      (SELECT count(*)::int FROM runa_core.projects) projects,
      (SELECT count(*)::int FROM runa_core.chats) chats`)).rows[0];
    return { schemaVersion: "runa2-selected-continuity/v1", chatAdapter: this.adapterName,
      projectAdapter: this.adapterName, settingsAdapter: this.adapterName,
      protectedStoresOpened: false, rollbackAvailable: true, ...row };
  }

  async recordAnswer(request, response) {
    if (!request.participant.verified) return { turnRecorded: false, source: "ephemeral-unverified" };
    const participantId = request.participant.principalId;
    const projectScope = request.project.projectId;
    const projectId = projectScope === PERSONAL_SCOPE ? null : projectScope;
    const client = await this.pool.connect();
    const key = lockKey(`answer:${request.requestId}`);
    let locked = false;
    try {
      await client.query("SELECT pg_advisory_lock($1::bigint)", [key]);
      locked = true;
      await client.query("BEGIN");
      const prior = (await client.query("SELECT request_digest FROM runa_runtime.answer_requests WHERE request_id=$1", [request.requestId])).rows[0];
      if (prior) {
        if (prior.request_digest !== requestDigest(request)) throw coded("request-id-conflict", "The request id is bound to different input.");
        await client.query("COMMIT");
        return { turnRecorded: false, source: this.adapterName };
      }
      if (projectId !== null) {
        const project = (await client.query("SELECT participant_id,status FROM runa_core.projects WHERE participant_id=$1 AND project_id=$2", [participantId, projectId])).rows[0];
        if (!project || project.status !== "managed") throw coded("project-not-found", "The selected managed project was not found.");
      }
      const current = (await client.query(`SELECT participant_id,project_id,turn_count FROM runa_core.chats
        WHERE participant_id=$1 AND chat_id=$2 FOR UPDATE`, [participantId, request.thread.threadId])).rows[0];
      if (current && current.project_id !== projectId) throw coded("chat-scope-denied", "The chat belongs to another project scope.");
      if (!current) await this.#insertChat(client, request, projectId);
      const ordinal = current?.turn_count ?? 0;
      await this.#insertTurn(client, request, response, ordinal);
      await client.query(`UPDATE runa_core.chats SET turn_count=turn_count+1,updated_at=$3,unread=false
        WHERE participant_id=$1 AND chat_id=$2`, [participantId, request.thread.threadId, this.now().toISOString()]);
      await client.query(`INSERT INTO runa_runtime.answer_requests
        (request_id,request_digest,participant_id,project_scope,thread_id,response_digest)
        VALUES($1,$2,$3,$4,$5,$6)`, [request.requestId, requestDigest(request), participantId,
        projectScope, request.thread.threadId, sha256(JSON.stringify(response))]);
      await client.query("COMMIT");
      return { turnRecorded: true, source: this.adapterName };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      if (locked) await client.query("SELECT pg_advisory_unlock($1::bigint)", [key]).catch(() => {});
      client.release();
    }
  }

  async #insertChat(client, request, projectId) {
    const participantId = request.participant.principalId;
    const chatId = request.thread.threadId;
    const privateData = { title: safeTitle(request.message) };
    const now = this.now().toISOString();
    const publicData = { chatId, projectId, parentChatId: null, branchFromTurn: null, turnCount: 0,
      archived: false, unread: false, createdAt: now, updatedAt: now };
    const context = { recordType: "chat", participantId, recordId: chatId, field: "private-payload" };
    const envelope = this.cipher.encrypt(context, privateData);
    await client.query(`INSERT INTO runa_core.chats
      (chat_id,participant_id,project_id,parent_chat_id,branch_from_turn,turn_count,archived,unread,
       created_at,updated_at,title_envelope,title_hmac,locator_hmac,source_content_hmac)
      VALUES($1,$2,$3,NULL,NULL,0,false,false,$4,$4,$5::jsonb,$6,$7,$8)`, [chatId, participantId,
      projectId, now, JSON.stringify(envelope), envelope.contentHmac,
      this.cipher.digest({ domain: "project-chat", kind: "chat", locator: `chat:${chatId}` }),
      this.cipher.digest({ domain: "project-chat", kind: "chat", locator: `chat:${chatId}`, publicData, privateData })]);
  }

  async #insertTurn(client, request, response, ordinal) {
    const participantId = request.participant.principalId;
    const chatId = request.thread.threadId;
    const id = `turn:${chatId}:${ordinal}`;
    const privateData = { user: request.message, assistant: response.answer };
    const publicData = { chatId, turnOrdinal: ordinal, occurredAt: this.now().toISOString(),
      route: routeFor(request.lane), originRequestId: request.requestId };
    const context = { recordType: "chat-turn", participantId, recordId: id, field: "private-payload" };
    const envelope = this.cipher.encrypt(context, privateData);
    await client.query(`INSERT INTO runa_core.chat_turns
      (participant_id,chat_id,turn_ordinal,occurred_at,route,origin_request_id,content_envelope,
       content_hmac,locator_hmac,source_content_hmac)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`, [participantId, chatId, ordinal,
      publicData.occurredAt, publicData.route, publicData.originRequestId, JSON.stringify(envelope),
      envelope.contentHmac,
      this.cipher.digest({ domain: "project-chat", kind: "chat-turn", locator: `chat-turn:${chatId}:${ordinal}` }),
      this.cipher.digest({ domain: "project-chat", kind: "chat-turn", locator: `chat-turn:${chatId}:${ordinal}`, publicData, privateData })]);
  }

  async settingValues(participantId) {
    const row = (await this.pool.query(`SELECT setting_value FROM runa_core.participant_settings
      WHERE participant_id=$1 AND setting_key='defaultIntelligenceLevel'`, [participantId])).rows[0];
    return { defaultIntelligenceLevel: ["Low", "Medium", "High"].includes(row?.setting_value) ? row.setting_value : "Medium" };
  }

  async close() { if (this.ownsPool) await this.pool.end(); }
}

export class PostgresRequestCoordinator {
  constructor({ pool }) { this.pool = pool; }
  async runOnce({ operation, requestId, actorId, inputDigest, execute }) {
    const client = await this.pool.connect();
    const key = lockKey(`route:${operation}:${requestId}`);
    let locked = false;
    try {
      await client.query("SELECT pg_advisory_lock($1::bigint)", [key]);
      locked = true;
      const prior = (await client.query(`SELECT actor_id,input_digest,response_json FROM runa_runtime.route_responses
        WHERE operation=$1 AND request_id=$2`, [operation, requestId])).rows[0];
      if (prior) {
        if (prior.actor_id !== actorId || prior.input_digest !== inputDigest) throw coded("request-id-conflict", "The request id is bound to different input.");
        return clone(prior.response_json);
      }
      const response = await execute();
      await client.query(`INSERT INTO runa_runtime.route_responses
        (operation,request_id,actor_id,input_digest,response_json) VALUES($1,$2,$3,$4,$5::jsonb)`,
      [operation, requestId, actorId, inputDigest, JSON.stringify(response)]);
      return response;
    } finally {
      if (locked) await client.query("SELECT pg_advisory_unlock($1::bigint)", [key]).catch(() => {});
      client.release();
    }
  }
}

export class PostgresWorkspaceStore {
  constructor({ pool, cipher }) { this.pool = pool; this.cipher = cipher; }
  async initialize() {
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS runa_workspace;
      CREATE TABLE IF NOT EXISTS runa_workspace.source_sections (
        project_scope text NOT NULL, source_id text NOT NULL, section_id text NOT NULL,
        content_sha256 text NOT NULL, active boolean NOT NULL DEFAULT true,
        content_envelope jsonb NOT NULL, PRIMARY KEY(project_scope,source_id,section_id)
      );`);
  }
  async seedSource({ projectId, sourceId, sectionId, content, active = true }) {
    const context = { recordType: "workspace-section", participantId: projectId,
      recordId: `${sourceId}:${sectionId}`, field: "private-payload" };
    const envelope = this.cipher.encrypt(context, { content });
    await this.pool.query(`INSERT INTO runa_workspace.source_sections
      (project_scope,source_id,section_id,content_sha256,active,content_envelope)
      VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(project_scope,source_id,section_id)
      DO UPDATE SET content_sha256=excluded.content_sha256,active=excluded.active,content_envelope=excluded.content_envelope`,
    [projectId, sourceId, sectionId, sha256(content), active, JSON.stringify(envelope)]);
  }
  async resolve(projectId, requested) {
    const references = [], denied = [];
    for (const locator of requested) {
      const same = (await this.pool.query(`SELECT content_sha256 FROM runa_workspace.source_sections
        WHERE project_scope=$1 AND source_id=$2 AND section_id=$3 AND active`, [projectId, locator.sourceId, locator.sectionId])).rows[0];
      if (same) references.push({ projectId, sourceId: locator.sourceId, sectionId: locator.sectionId,
        contentSha256: same.content_sha256 });
      else if ((await this.pool.query(`SELECT 1 FROM runa_workspace.source_sections
        WHERE project_scope<>$1 AND source_id=$2 AND section_id=$3 LIMIT 1`, [projectId, locator.sourceId, locator.sectionId])).rowCount) denied.push(locator);
    }
    return { references, denied };
  }
  async activeSources(projectId, references) {
    const result = [];
    for (const reference of references) {
      const row = (await this.pool.query(`SELECT content_sha256,content_envelope FROM runa_workspace.source_sections
        WHERE project_scope=$1 AND source_id=$2 AND section_id=$3 AND active`,
      [projectId, reference.sourceId, reference.sectionId])).rows[0];
      if (!row || row.content_sha256 !== reference.contentSha256) continue;
      const context = { recordType: "workspace-section", participantId: projectId,
        recordId: `${reference.sourceId}:${reference.sectionId}`, field: "private-payload" };
      const value = this.cipher.decrypt(context, row.content_envelope);
      if (sha256(value.content) !== row.content_sha256) throw coded("workspace-section-tampered", "A workspace section failed its content digest.");
      result.push({ projectId, sourceId: reference.sourceId, sectionId: reference.sectionId,
        contentSha256: row.content_sha256, content: value.content, active: true });
    }
    return result;
  }
  async search({ projectId, query, maximumPassages }) {
    const rows = (await this.pool.query(`SELECT source_id,section_id,content_sha256,content_envelope
      FROM runa_workspace.source_sections WHERE project_scope=$1 AND active ORDER BY source_id,section_id LIMIT 200`, [projectId])).rows;
    const terms = new Set(String(query).toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
    const scored = [];
    for (const row of rows) {
      const context = { recordType: "workspace-section", participantId: projectId,
        recordId: `${row.source_id}:${row.section_id}`, field: "private-payload" };
      const value = this.cipher.decrypt(context, row.content_envelope);
      const haystack = value.content.toLowerCase();
      const score = [...terms].reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      if (score) scored.push({ score, reference: { projectId, sourceId: row.source_id,
        sectionId: row.section_id, contentSha256: row.content_sha256 } });
    }
    scored.sort((a, b) => b.score - a.score || a.reference.sourceId.localeCompare(b.reference.sourceId));
    return { references: scored.slice(0, maximumPassages).map(item => item.reference), degraded: false, unavailable: [] };
  }
  async rerank(query, sources, maximumPassages) {
    const terms = new Set(String(query).toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
    const ordered = sources.map((source, index) => ({ source, index,
      score: [...terms].reduce((total, term) => total + (source.content.toLowerCase().includes(term) ? 1 : 0), 0) }))
      .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, maximumPassages).map(item => item.source);
    return { sources: ordered, degraded: false, unavailable: [], truncated: false };
  }
  async getCommitted() { return null; }
  async commit(_request, response) { return clone(response); }
  async runOnce(_request, execute) { return clone(await execute()); }
}

