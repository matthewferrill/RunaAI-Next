import { createHash } from "node:crypto";
import pg from "pg";
import { GATE2_SETTING_SPEC, formatSyntheticProjectContext } from "../continuity.mjs";

const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const requestDigest = request => sha256(JSON.stringify(request));
const requestLockKey = request => {
  const unsigned = BigInt(`0x${sha256(request.requestId).slice(0, 16)}`);
  return (unsigned > 0x7fffffffffffffffn ? unsigned - 0x10000000000000000n : unsigned).toString();
};
const coded = (code, message) => Object.assign(new Error(message), { code });

export class PostgresContinuityStore {
  constructor({ connectionString, pool = null, adapterName = "postgres-synthetic" }) {
    this.pool = pool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 5_000 });
    this.ownsPool = !pool;
    this.adapterName = adapterName;
  }

  async initialize({ reset = false } = {}) {
    if (reset) await this.pool.query("DROP SCHEMA IF EXISTS gate2 CASCADE");
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS gate2;
      CREATE TABLE IF NOT EXISTS gate2.projects (
        project_id text PRIMARY KEY, participant_id text NOT NULL, display_name text NOT NULL,
        status text NOT NULL CHECK (status IN ('managed','archived')),
        environments jsonb NOT NULL DEFAULT '[]'::jsonb,
        verification_commands jsonb NOT NULL DEFAULT '[]'::jsonb,
        source_references jsonb NOT NULL DEFAULT '[]'::jsonb,
        memory_enabled boolean NOT NULL DEFAULT false
      );
      CREATE TABLE IF NOT EXISTS gate2.project_memory (
        memory_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        project_id text NOT NULL REFERENCES gate2.projects(project_id) ON DELETE CASCADE,
        summary text NOT NULL
      );
      CREATE TABLE IF NOT EXISTS gate2.chats (
        chat_id text PRIMARY KEY, participant_id text NOT NULL,
        project_id text NOT NULL REFERENCES gate2.projects(project_id), title text NOT NULL,
        parent_chat_id text, branch_from_turn integer, archived boolean NOT NULL DEFAULT false,
        unread boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS gate2.answer_requests (
        request_id text PRIMARY KEY, request_sha256 text NOT NULL, participant_id text NOT NULL,
        project_id text NOT NULL, thread_id text NOT NULL,
        lane text NOT NULL CHECK (lane IN ('general','research','guarded','workspace')),
        response_json jsonb NOT NULL, completed_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS gate2.chat_turns (
        turn_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        chat_id text NOT NULL REFERENCES gate2.chats(chat_id) ON DELETE CASCADE,
        request_id text NOT NULL UNIQUE, origin_request_id text, lane text NOT NULL,
        user_text text NOT NULL, assistant_text text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS gate2.settings (
        participant_id text NOT NULL, setting_key text NOT NULL, setting_value text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (participant_id, setting_key)
      );
    `);
  }

  async status() {
    const row = (await this.pool.query(`SELECT
      (SELECT count(*)::int FROM gate2.projects) projects,
      (SELECT count(*)::int FROM gate2.chats) chats`)).rows[0];
    return { chatAdapter: this.adapterName, projectAdapter: this.adapterName,
      settingsAdapter: this.adapterName, protectedStoresOpened: false, rollbackAvailable: true, ...row };
  }

  async seedProject(project) {
    await this.pool.query(`INSERT INTO gate2.projects
      (project_id,participant_id,display_name,status,environments,verification_commands,source_references,memory_enabled)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8)
      ON CONFLICT (project_id) DO UPDATE SET participant_id=excluded.participant_id,
        display_name=excluded.display_name,status=excluded.status,environments=excluded.environments,
        verification_commands=excluded.verification_commands,source_references=excluded.source_references,
        memory_enabled=excluded.memory_enabled`, [project.projectId, project.participantId, project.displayName,
      project.status === "archived" ? "archived" : "managed", JSON.stringify(project.environments ?? []),
      JSON.stringify(project.verificationCommands ?? []), JSON.stringify(project.sourceReferences ?? []),
      project.memoryEnabled === true && project.status !== "archived"]);
    for (const summary of project.memory ?? []) await this.pool.query(`INSERT INTO gate2.project_memory(project_id,summary)
      SELECT $1,$2 WHERE NOT EXISTS (SELECT 1 FROM gate2.project_memory WHERE project_id=$1 AND summary=$2)`,
    [project.projectId, String(summary)]);
    return this.readProject(project.participantId, project.projectId);
  }

  async createProjectFromPrepared({ participantId, projectId, displayName }) {
    const result = await this.pool.query(`INSERT INTO gate2.projects(project_id,participant_id,display_name,status)
      VALUES ($1,$2,$3,'managed') ON CONFLICT DO NOTHING RETURNING project_id`, [projectId, participantId, displayName]);
    if (!result.rowCount) throw coded("project-already-exists", "The synthetic project already exists.");
    return this.readProject(participantId, projectId);
  }

  async readProject(participantId, projectId) {
    const result = await this.pool.query(`SELECT project_id "projectId",participant_id "participantId",
      display_name "displayName",status,environments,verification_commands "verificationCommands",
      source_references "sourceReferences",memory_enabled "memoryEnabled"
      FROM gate2.projects WHERE project_id=$1`, [projectId]);
    const project = result.rows[0];
    if (!project) throw coded("project-not-found", "The synthetic project was not found.");
    if (project.participantId !== participantId) throw coded("project-scope-denied", "The synthetic project belongs to another participant.");
    const memory = await this.pool.query(`SELECT summary FROM gate2.project_memory WHERE project_id=$1 ORDER BY memory_id DESC LIMIT 20`, [projectId]);
    return { ...project, memory: memory.rows.map(row => row.summary) };
  }

  async projectContext(participantId, projectId) {
    const project = await this.readProject(participantId, projectId);
    const chats = await this.pool.query(`SELECT title FROM gate2.chats WHERE participant_id=$1 AND project_id=$2 ORDER BY updated_at DESC LIMIT 10`, [participantId, projectId]);
    return formatSyntheticProjectContext(project, chats.rows.map(row => row.title));
  }

  async attachSourceReference(participantId, projectId, referenceId) {
    const project = await this.readProject(participantId, projectId);
    await this.pool.query(`UPDATE gate2.projects SET source_references=$2::jsonb WHERE project_id=$1`,
      [projectId, JSON.stringify([...new Set([...project.sourceReferences, referenceId])])]);
    return this.readProject(participantId, projectId);
  }

  async setProjectMemory(participantId, projectId, enabled) {
    const project = await this.readProject(participantId, projectId);
    if (enabled && project.status !== "managed") throw coded("project-memory-invalid", "Archived projects cannot enable memory.");
    await this.pool.query(`UPDATE gate2.projects SET memory_enabled=$2 WHERE project_id=$1`, [projectId, enabled === true]);
    return this.readProject(participantId, projectId);
  }

  async recordAnswer(request, response) {
    if (!request.participant.verified) return { turnRecorded: false, source: "ephemeral-unverified" };
    const client = await this.pool.connect();
    const lockKey = requestLockKey(request);
    let locked = false;
    try {
      await client.query("SELECT set_config('lock_timeout', $1, false)",
        [`${Math.max(1, Math.floor(request.budgets?.deadlineMs ?? 5_000))}ms`]);
      try {
        await client.query("SELECT pg_advisory_lock($1::bigint)", [lockKey]);
        locked = true;
      } catch (error) {
        if (error?.code !== "55P03") throw error;
        throw coded("continuity-timeout", "The continuity request lock deadline expired.");
      } finally { await client.query("SELECT set_config('lock_timeout', '0', false)").catch(() => {}); }
      await client.query("BEGIN");
      const project = (await client.query(`SELECT participant_id FROM gate2.projects WHERE project_id=$1 FOR SHARE`, [request.project.projectId])).rows[0];
      if (!project) throw coded("project-not-found", "The synthetic project was not found.");
      if (project.participant_id !== request.participant.principalId) throw coded("project-scope-denied", "The synthetic project belongs to another participant.");
      const existing = (await client.query(`SELECT request_sha256 FROM gate2.answer_requests WHERE request_id=$1 FOR SHARE`, [request.requestId])).rows[0];
      if (existing) {
        if (existing.request_sha256 !== requestDigest(request)) throw coded("request-id-conflict", "The request id was reused for different input.");
        await client.query("COMMIT");
        return { turnRecorded: false, source: this.adapterName };
      }
      const chat = (await client.query(`SELECT participant_id,project_id FROM gate2.chats WHERE chat_id=$1 FOR SHARE`, [request.thread.threadId])).rows[0];
      if (chat && (chat.participant_id !== request.participant.principalId || chat.project_id !== request.project.projectId)) {
        throw coded("chat-scope-denied", "The synthetic chat belongs to another participant or project.");
      }
      await client.query(`INSERT INTO gate2.chats(chat_id,participant_id,project_id,title)
        VALUES ($1,$2,$3,$4) ON CONFLICT(chat_id) DO NOTHING`, [request.thread.threadId,
        request.participant.principalId, request.project.projectId, request.message.replace(/\s+/g, " ").trim().slice(0,120)]);
      await client.query(`INSERT INTO gate2.answer_requests
        (request_id,request_sha256,participant_id,project_id,thread_id,lane,response_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`, [request.requestId, requestDigest(request),
        request.participant.principalId, request.project.projectId, request.thread.threadId,
        request.lane, JSON.stringify(response)]);
      await client.query(`INSERT INTO gate2.chat_turns(chat_id,request_id,lane,user_text,assistant_text)
        VALUES ($1,$2,$3,$4,$5)`, [request.thread.threadId, request.requestId, request.lane, request.message, response.answer]);
      await client.query(`UPDATE gate2.chats SET unread=false,updated_at=now() WHERE chat_id=$1`, [request.thread.threadId]);
      await client.query("COMMIT");
      return { turnRecorded: true, source: this.adapterName };
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally {
      if (locked) await client.query("SELECT pg_advisory_unlock($1::bigint)", [lockKey]).catch(() => {});
      client.release();
    }
  }

  async readChat(participantId, projectId, chatId) {
    const chat = (await this.pool.query(`SELECT chat_id "chatId",participant_id "participantId",
      project_id "projectId",title,parent_chat_id "parentChatId",branch_from_turn "branchFromTurn",archived,unread
      FROM gate2.chats WHERE chat_id=$1`, [chatId])).rows[0];
    if (!chat) throw coded("chat-not-found", "The synthetic chat was not found.");
    if (chat.participantId !== participantId || chat.projectId !== projectId) throw coded("chat-scope-denied", "The synthetic chat belongs to another participant or project.");
    const turns = await this.pool.query(`SELECT COALESCE(origin_request_id,request_id) "requestId",lane,
      user_text "user",assistant_text "assistant",created_at "at" FROM gate2.chat_turns
      WHERE chat_id=$1 ORDER BY turn_id`, [chatId]);
    return { ...chat, turns: turns.rows };
  }

  async listChats(participantId, projectId, { includeArchived = false } = {}) {
    return (await this.pool.query(`SELECT chat_id "chatId",title,archived,unread FROM gate2.chats
      WHERE participant_id=$1 AND project_id=$2 AND ($3::boolean OR NOT archived) ORDER BY updated_at DESC`,
    [participantId, projectId, includeArchived])).rows;
  }

  async branchChat(participantId, projectId, chatId, { atTurn, newChatId, title } = {}) {
    const parent = await this.readChat(participantId, projectId, chatId);
    if (!Number.isInteger(atTurn) || atTurn < 0 || atTurn >= parent.turns.length) throw coded("chat-branch-invalid", "The branch point must name an existing turn.");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO gate2.chats(chat_id,participant_id,project_id,title,parent_chat_id,branch_from_turn)
        VALUES ($1,$2,$3,$4,$5,$6)`, [newChatId, participantId, projectId, title ?? `${parent.title} (branch)`, chatId, atTurn]);
      for (const [index, turn] of parent.turns.slice(0, atTurn + 1).entries()) await client.query(`INSERT INTO gate2.chat_turns
        (chat_id,request_id,origin_request_id,lane,user_text,assistant_text) VALUES ($1,$2,$3,$4,$5,$6)`,
      [newChatId, `branch:${newChatId}:${index}`, turn.requestId, turn.lane, turn.user, turn.assistant]);
      await client.query("COMMIT");
      return this.readChat(participantId, projectId, newChatId);
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  }

  async setChatState(participantId, projectId, chatId, { archived, unread, title } = {}) {
    await this.readChat(participantId, projectId, chatId);
    await this.pool.query(`UPDATE gate2.chats SET archived=COALESCE($2,archived),unread=COALESCE($3,unread),
      title=COALESCE($4,title),updated_at=now() WHERE chat_id=$1`, [chatId,
      archived === undefined ? null : archived === true, unread === undefined ? null : unread === true,
      title === undefined ? null : String(title).replace(/\s+/g," ").trim().slice(0,120)]);
    return this.readChat(participantId, projectId, chatId);
  }

  async searchChats(participantId, projectId, query, { maximumScans = 50 } = {}) {
    return (await this.pool.query(`SELECT DISTINCT c.chat_id "chatId",c.title,c.archived,c.unread
      FROM gate2.chats c LEFT JOIN gate2.chat_turns t ON t.chat_id=c.chat_id
      WHERE c.participant_id=$1 AND c.project_id=$2 AND
      (lower(c.title) LIKE $3 OR lower(COALESCE(t.user_text,'')) LIKE $3 OR lower(COALESCE(t.assistant_text,'')) LIKE $3)
      ORDER BY c.chat_id LIMIT $4`, [participantId, projectId, `%${String(query).toLowerCase()}%`, Math.max(1,maximumScans)])).rows;
  }

  async deleteChat(participantId, projectId, chatId) {
    await this.readChat(participantId, projectId, chatId);
    await this.pool.query(`DELETE FROM gate2.chats WHERE chat_id=$1`, [chatId]);
    return true;
  }

  async settingValues(participantId) {
    const rows = (await this.pool.query(`SELECT setting_key,setting_value FROM gate2.settings WHERE participant_id=$1`, [participantId])).rows;
    const stored = new Map(rows.map(row => [row.setting_key,row.setting_value]));
    return Object.fromEntries(Object.entries(GATE2_SETTING_SPEC).map(([key,spec]) =>
      [key, spec.allowedValues.includes(stored.get(key)) ? stored.get(key) : spec.defaultValue]));
  }

  async setSetting(participantId, key, value) {
    const spec = GATE2_SETTING_SPEC[key];
    if (!spec) throw coded("setting-unknown", `Unknown synthetic setting: ${key}`);
    if (!spec.allowedValues.includes(value)) throw coded("setting-value-invalid", `Invalid value for ${key}.`);
    await this.pool.query(`INSERT INTO gate2.settings(participant_id,setting_key,setting_value)
      VALUES ($1,$2,$3) ON CONFLICT(participant_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=now()`,
    [participantId,key,value]);
    return this.settingValues(participantId);
  }

  async seedTamperedSetting(participantId, key, value) {
    await this.pool.query(`INSERT INTO gate2.settings(participant_id,setting_key,setting_value) VALUES ($1,$2,$3)
      ON CONFLICT(participant_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value`, [participantId,key,value]);
  }

  async resolve(projectId, requested) {
    const references = [], denied = [];
    for (const locator of requested) {
      const same = (await this.pool.query(`SELECT project_id "projectId",source_id "sourceId",
        section_id "sectionId",content_sha256 "contentSha256" FROM gate1.source_sections
        WHERE project_id=$1 AND source_id=$2 AND section_id=$3 AND active`, [projectId,locator.sourceId,locator.sectionId])).rows[0];
      if (same) references.push(same);
      else if ((await this.pool.query(`SELECT 1 FROM gate1.source_sections WHERE project_id<>$1
        AND source_id=$2 AND section_id=$3 LIMIT 1`, [projectId,locator.sourceId,locator.sectionId])).rowCount) denied.push(locator);
    }
    return { references, denied };
  }

  async close() { if (this.ownsPool) await this.pool.end(); }
}
