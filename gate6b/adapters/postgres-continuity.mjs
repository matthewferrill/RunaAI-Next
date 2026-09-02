import { createHash } from "node:crypto";
import pg from "pg";
import { PERSONAL_SCOPE } from "../application.mjs";
import { createConversationContext, parseConversationScope, CONVERSATION_CONTEXT_LIMITS }
  from "../../gate7f/function-first/conversation-context.mjs";
import { isRetryableConversationFailure } from "../../gate7f/function-first/conversation-outcome.mjs";
import { answerEvidence, readAnswerEvidence } from "../../gate7f/function-first/conversation-evidence.mjs";
import { defaultUserSettings, validateUserSetting } from "../product-foundation.mjs";

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
    workspace: "workspace-chat", code: "code-chat" }[lane] ?? "general-chat";
}

function safeTitle(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled chat";
}

const experiences = new Set(["chat", "code"]);
const codeRoutes = new Set(["workspace-chat", "code-chat"]);

export function classifyExperience({ explicit = null, routes = [], projectExperience = null } = {}) {
  if (experiences.has(explicit)) return explicit;
  if (routes.some(route => codeRoutes.has(route))) return "code";
  return experiences.has(projectExperience) ? projectExperience : "chat";
}

function privateContext(kind, participantId, recordId) {
  return { recordType: kind, participantId, recordId, field: "private-payload" };
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
      CREATE TABLE IF NOT EXISTS runa_runtime.route_responses_v2 (
        operation text NOT NULL, request_id text NOT NULL, actor_id text NOT NULL,
        input_digest text NOT NULL, response_envelope jsonb NOT NULL,
        completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(operation,request_id)
      );
      CREATE TABLE IF NOT EXISTS runa_core.participant_settings (
        participant_id text NOT NULL, setting_key text NOT NULL,
        setting_value text NOT NULL,
        revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
        updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(participant_id,setting_key)
      );
      DO $settings$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid='runa_core.participant_settings'::regclass
            AND conname='participant_settings_setting_value_check'
            AND pg_get_constraintdef(oid) NOT LIKE '%setting_key%'
        ) THEN
          ALTER TABLE runa_core.participant_settings
            DROP CONSTRAINT participant_settings_setting_value_check;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid='runa_core.participant_settings'::regclass
            AND conname='participant_settings_setting_value_check'
        ) THEN
          ALTER TABLE runa_core.participant_settings ADD CONSTRAINT participant_settings_setting_value_check CHECK (
            (setting_key='defaultIntelligenceLevel' AND setting_value IN ('Low','Medium','High')) OR
            (setting_key='theme' AND setting_value IN ('system','dawn','dark')) OR
            (setting_key='textSize' AND setting_value IN ('small','medium','large')) OR
            (setting_key='density' AND setting_value IN ('comfortable','compact')) OR
            (setting_key='reducedMotion' AND setting_value IN ('system','reduce','allow'))
          );
        END IF;
      END $settings$;
      ALTER TABLE runa_core.chats ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
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

  async navigation(participantId, experience) {
    if (!experiences.has(experience)) throw coded("request-experience-invalid", "Chat or Code experience is required.");
    const [projectRows, chatRows, routeRows] = await Promise.all([
      this.pool.query(`SELECT project_id,project_type,status,updated_at,private_payload_envelope
        FROM runa_core.projects WHERE participant_id=$1 AND status='managed'
        ORDER BY updated_at DESC,project_id LIMIT 200`, [participantId]),
      this.pool.query(`SELECT chat_id,project_id,turn_count,updated_at,title_envelope
        FROM runa_core.chats WHERE participant_id=$1 AND NOT archived AND deleted_at IS NULL
        ORDER BY updated_at DESC,chat_id LIMIT 200`, [participantId]),
      this.pool.query(`SELECT turns.chat_id,chats.project_id,array_agg(DISTINCT turns.route ORDER BY turns.route) routes
        FROM runa_core.chat_turns turns JOIN runa_core.chats chats
          ON chats.participant_id=turns.participant_id AND chats.chat_id=turns.chat_id
        WHERE turns.participant_id=$1 GROUP BY turns.chat_id,chats.project_id`, [participantId]),
    ]);
    const routes = new Map(routeRows.rows.map(row => [row.chat_id, row.routes ?? []]));
    const projects = projectRows.rows.map(row => {
      const value = this.cipher.decrypt(privateContext("project", participantId, row.project_id), row.private_payload_envelope);
      return { projectId: row.project_id, displayName: safeTitle(value.displayName),
        explicitExperience: experiences.has(value.experience) ? value.experience : null,
        projectType: row.project_type, updatedAt: new Date(row.updated_at).toISOString() };
    });
    const codeProjectIds = new Set(routeRows.rows.filter(row => row.project_id
      && row.routes?.some(route => codeRoutes.has(route))).map(row => row.project_id));
    const projectExperiences = new Map(projects.map(project => [project.projectId,
      classifyExperience({ explicit: project.explicitExperience,
        routes: codeProjectIds.has(project.projectId) ? ["code-chat"] : [] })]));
    const chats = chatRows.rows.map(row => {
      const value = this.cipher.decrypt(privateContext("chat", participantId, row.chat_id), row.title_envelope);
      return { chatId: row.chat_id, projectId: row.project_id, title: safeTitle(value.title),
        experience: classifyExperience({ explicit: value.experience, routes: routes.get(row.chat_id) ?? [],
          projectExperience: row.project_id ? projectExperiences.get(row.project_id) : null }),
        turnCount: row.turn_count, updatedAt: new Date(row.updated_at).toISOString() };
    });
    const selectedProjects = projects.map(({ explicitExperience, projectType: _projectType, ...project }) => ({
      ...project, experience: projectExperiences.get(project.projectId),
    })).filter(project => project.experience === experience);
    const selectedProjectIds = new Set(selectedProjects.map(project => project.projectId));
    const selectedChats = chats.filter(chat => chat.experience === experience
      && (!chat.projectId || selectedProjectIds.has(chat.projectId)));
    return Object.freeze({ schemaVersion: "runa2-navigation/v1", experience,
      projects: Object.freeze(selectedProjects), chats: Object.freeze(selectedChats) });
  }

  async createProject({ participantId, requestId, experience, displayName }) {
    if (!experiences.has(experience)) throw coded("request-experience-invalid", "Chat or Code experience is required.");
    const projectId = `project-${experience}-${sha256(`${participantId}\0${requestId}`).slice(0, 32)}`;
    const now = this.now().toISOString();
    const privateData = { displayName, experience };
    const publicData = { projectId, schemaVersion: "runa2-user-project/v1", projectType: "personal-project",
      status: "managed", registeredAt: now, updatedAt: now, memoryEnabled: false };
    const envelope = this.cipher.encrypt(privateContext("project", participantId, projectId), privateData);
    await this.pool.query(`INSERT INTO runa_core.projects
      (project_id,participant_id,schema_version,project_type,status,registered_at,updated_at,memory_enabled,
       private_payload_envelope,payload_hmac,locator_hmac,source_content_hmac)
      VALUES($1,$2,$3,$4,'managed',$5,$5,false,$6::jsonb,$7,$8,$9)
      ON CONFLICT(participant_id,project_id) DO NOTHING`, [projectId, participantId,
      publicData.schemaVersion, publicData.projectType, now, JSON.stringify(envelope), envelope.contentHmac,
      this.cipher.digest({ domain: "project-chat", kind: "project", locator: `project:${projectId}` }),
      this.cipher.digest({ domain: "project-chat", kind: "project", locator: `project:${projectId}`,
        publicData, privateData })]);
    const retained = (await this.pool.query(`SELECT status,private_payload_envelope,updated_at
      FROM runa_core.projects WHERE participant_id=$1 AND project_id=$2`, [participantId, projectId])).rows[0];
    if (!retained || retained.status !== "managed") throw coded("project-create-failed", "The personal project was not retained.");
    const privateValue = this.cipher.decrypt(privateContext("project", participantId, projectId), retained.private_payload_envelope);
    if (privateValue.displayName !== displayName || privateValue.experience !== experience) {
      throw coded("request-id-conflict", "The project request id is bound to different input.");
    }
    return Object.freeze({ schemaVersion: "runa2-project-created/v1", projectId,
      displayName, experience, updatedAt: new Date(retained.updated_at).toISOString() });
  }

  async readChat(participantId, chatId, experience) {
    if (!experiences.has(experience)) throw coded("request-experience-invalid", "Chat or Code experience is required.");
    const row = (await this.pool.query(`SELECT chat_id,project_id,turn_count,archived,deleted_at,updated_at,title_envelope
      FROM runa_core.chats WHERE participant_id=$1 AND chat_id=$2`, [participantId, chatId])).rows[0];
    if (!row || row.archived || row.deleted_at) throw coded("chat-not-found", "The selected chat was not found.");
    const title = this.cipher.decrypt(privateContext("chat", participantId, chatId), row.title_envelope);
    let projectExperience = null;
    if (row.project_id) {
      const project = (await this.pool.query(`SELECT status,private_payload_envelope FROM runa_core.projects
        WHERE participant_id=$1 AND project_id=$2`, [participantId, row.project_id])).rows[0];
      if (!project || project.status !== "managed") throw coded("project-not-found", "The selected managed project was not found.");
      const privateProject = this.cipher.decrypt(privateContext("project", participantId, row.project_id), project.private_payload_envelope);
      const projectRoutes = privateProject.experience ? [] : (await this.pool.query(`SELECT DISTINCT turns.route
        FROM runa_core.chats chats JOIN runa_core.chat_turns turns
          ON turns.participant_id=chats.participant_id AND turns.chat_id=chats.chat_id
        WHERE chats.participant_id=$1 AND chats.project_id=$2`, [participantId, row.project_id])).rows.map(item => item.route);
      projectExperience = classifyExperience({ explicit: privateProject.experience, routes: projectRoutes });
    }
    const turnRows = (await this.pool.query(`SELECT turn_ordinal,occurred_at,route,content_envelope
      FROM runa_core.chat_turns WHERE participant_id=$1 AND chat_id=$2 ORDER BY turn_ordinal`,
    [participantId, chatId])).rows;
    const retainedExperience = classifyExperience({ explicit: title.experience,
      routes: turnRows.map(turn => turn.route), projectExperience });
    if (retainedExperience !== experience) throw coded("chat-experience-denied", "The selected chat belongs to another experience.");
    const turns = turnRows.map(row => {
      const payload = this.cipher.decrypt(privateContext("chat-turn", participantId,
        `turn:${chatId}:${row.turn_ordinal}`), row.content_envelope);
      return { turnOrdinal: row.turn_ordinal, occurredAt: new Date(row.occurred_at).toISOString(),
        route: row.route, user: payload.user, assistant: payload.assistant,
        evidence: readAnswerEvidence(payload.evidence) };
    });
    return Object.freeze({ schemaVersion: "runa2-chat-record/v1", chatId, projectId: row.project_id,
      title: safeTitle(title.title), experience, turnCount: row.turn_count,
      updatedAt: new Date(row.updated_at).toISOString(), turns: Object.freeze(turns) });
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
      // A row lock cannot serialize two first turns when the chat row does not
      // exist yet. Lock the authenticated conversation key for this transaction.
      await client.query("SELECT pg_advisory_xact_lock($1::bigint)",
        [lockKey(`conversation:${participantId}:${request.thread.threadId}`)]);
      const prior = (await client.query("SELECT request_digest FROM runa_runtime.answer_requests WHERE request_id=$1", [request.requestId])).rows[0];
      if (prior) {
        if (prior.request_digest !== requestDigest(request)) throw coded("request-id-conflict", "The request id is bound to different input.");
        await client.query("COMMIT");
        return { turnRecorded: false, source: this.adapterName };
      }
      if (projectId !== null) {
        const project = (await client.query("SELECT participant_id,status,private_payload_envelope FROM runa_core.projects WHERE participant_id=$1 AND project_id=$2", [participantId, projectId])).rows[0];
        if (!project || project.status !== "managed") throw coded("project-not-found", "The selected managed project was not found.");
        const privateProject = this.cipher.decrypt(privateContext("project", participantId, projectId), project.private_payload_envelope);
        const projectRoutes = privateProject.experience ? [] : (await client.query(`SELECT DISTINCT turns.route
          FROM runa_core.chats chats JOIN runa_core.chat_turns turns
            ON turns.participant_id=chats.participant_id AND turns.chat_id=chats.chat_id
          WHERE chats.participant_id=$1 AND chats.project_id=$2`, [participantId, projectId])).rows.map(row => row.route);
        if (classifyExperience({ explicit: privateProject.experience, routes: projectRoutes }) !== request.experience) {
          throw coded("project-experience-denied", "The selected project belongs to another experience.");
        }
      }
      const current = (await client.query(`SELECT participant_id,project_id,turn_count,archived,deleted_at,title_envelope FROM runa_core.chats
        WHERE participant_id=$1 AND chat_id=$2 FOR UPDATE`, [participantId, request.thread.threadId])).rows[0];
      if (current?.archived || current?.deleted_at) throw coded("chat-scope-denied", "The selected conversation was not found.");
      if (current && current.project_id !== projectId) throw coded("chat-scope-denied", "The chat belongs to another project scope.");
      if (request.contextRevision !== undefined && request.contextRevision !== (current?.turn_count ?? 0)) {
        throw coded("conversation-revision-conflict", "The conversation changed while this answer was being prepared. Reload the chat before retrying.");
      }
      if (current) {
        const privateChat = this.cipher.decrypt(privateContext("chat", participantId, request.thread.threadId), current.title_envelope);
        const routeRows = (await client.query(`SELECT route FROM runa_core.chat_turns
          WHERE participant_id=$1 AND chat_id=$2`, [participantId, request.thread.threadId])).rows;
        if (classifyExperience({ explicit: privateChat.experience,
          routes: routeRows.map(row => row.route) }) !== request.experience) {
          throw coded("chat-experience-denied", "The chat belongs to another experience.");
        }
      }
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

  async prepareAnswerContext(input) {
    const scope = parseConversationScope(input);
    const { participantId, threadId, experience } = scope;
    const projectId = scope.projectId === PERSONAL_SCOPE ? null : scope.projectId;
    if (projectId !== null) {
      const project = (await this.pool.query(`SELECT status,private_payload_envelope FROM runa_core.projects
        WHERE participant_id=$1 AND project_id=$2`, [participantId, projectId])).rows[0];
      if (!project || project.status !== "managed") throw coded("project-not-found", "The selected managed project was not found.");
      const privateProject = this.cipher.decrypt(privateContext("project", participantId, projectId), project.private_payload_envelope);
      const routes = privateProject.experience ? [] : (await this.pool.query(`SELECT DISTINCT turns.route
        FROM runa_core.chats chats JOIN runa_core.chat_turns turns
          ON turns.participant_id=chats.participant_id AND turns.chat_id=chats.chat_id
        WHERE chats.participant_id=$1 AND chats.project_id=$2`, [participantId, projectId])).rows.map(row => row.route);
      if (classifyExperience({ explicit: privateProject.experience, routes }) !== experience) {
        throw coded("project-experience-denied", "The selected project belongs to another experience.");
      }
    }
    const chat = (await this.pool.query(`SELECT chat_id,project_id,turn_count,archived,deleted_at,title_envelope
      FROM runa_core.chats WHERE participant_id=$1 AND chat_id=$2`, [participantId, threadId])).rows[0];
    if (!chat) {
      const foreign = (await this.pool.query(`SELECT 1 FROM runa_core.chats
        WHERE chat_id=$1 AND participant_id<>$2 LIMIT 1`, [threadId, participantId])).rowCount;
      if (foreign) throw coded("chat-scope-denied", "The selected conversation was not found.");
      return createConversationContext(scope);
    }
    if (chat.archived || chat.deleted_at || chat.project_id !== projectId) throw coded("chat-scope-denied", "The selected conversation was not found.");
    const privateChat = this.cipher.decrypt(privateContext("chat", participantId, threadId), chat.title_envelope);
    const routeRows = privateChat.experience ? [] : (await this.pool.query(`SELECT DISTINCT route
      FROM runa_core.chat_turns WHERE participant_id=$1 AND chat_id=$2`, [participantId, threadId])).rows;
    if (classifyExperience({ explicit: privateChat.experience, routes: routeRows.map(row => row.route) }) !== experience) {
      throw coded("chat-experience-denied", "The selected conversation belongs to another experience.");
    }
    const rows = (await this.pool.query(`SELECT turn_ordinal,content_envelope FROM runa_core.chat_turns
      WHERE participant_id=$1 AND chat_id=$2 ORDER BY turn_ordinal DESC LIMIT $3`,
    [participantId, threadId, CONVERSATION_CONTEXT_LIMITS.maximumTurns])).rows.reverse();
    const turns = rows.map(row => this.cipher.decrypt(privateContext("chat-turn", participantId,
      `turn:${threadId}:${row.turn_ordinal}`), row.content_envelope));
    return createConversationContext(scope, { turns, turnCount: chat.turn_count });
  }

  async manageConversation(participantId, operation) {
    if (operation.action === "archived") {
      const rows = (await this.pool.query(`SELECT chat_id,project_id,turn_count,updated_at,title_envelope
        FROM runa_core.chats WHERE participant_id=$1 AND archived AND deleted_at IS NULL
        ORDER BY updated_at DESC,chat_id LIMIT 200`, [participantId])).rows;
      const results = [];
      for (const row of rows) {
        const value = this.cipher.decrypt(privateContext("chat", participantId, row.chat_id), row.title_envelope);
        const routes = (await this.pool.query(`SELECT DISTINCT route FROM runa_core.chat_turns
          WHERE participant_id=$1 AND chat_id=$2`, [participantId, row.chat_id])).rows.map(item => item.route);
        const experience = classifyExperience({ explicit: value.experience, routes });
        if (experience === operation.experience) results.push({ chatId: row.chat_id, projectId: row.project_id,
          title: safeTitle(value.title), experience, turnCount: row.turn_count,
          updatedAt: new Date(row.updated_at).toISOString() });
      }
      return Object.freeze({ schemaVersion: "runaai-archived-conversations/v1",
        experience: operation.experience, results: Object.freeze(results), privateValuesIncluded: false });
    }
    if (operation.action === "search") {
      const catalog = await this.navigation(participantId, operation.experience);
      const query = operation.query.toLocaleLowerCase();
      return Object.freeze({ schemaVersion: "runaai-conversation-search/v1", experience: operation.experience,
        query: operation.query, results: Object.freeze(catalog.chats
          .filter(chat => chat.title.toLocaleLowerCase().includes(query)).slice(0, 50)),
        privateValuesIncluded: false });
    }
    const retained = await this.#conversationRow(participantId, operation.chatId, operation.experience);
    if (operation.action === "rename") {
      if (retained.archived || retained.deletedAt) throw coded("chat-not-found", "The selected chat was not found.");
      const privateData = { ...retained.privateData, title: operation.title, experience: operation.experience };
      const envelope = this.cipher.encrypt(privateContext("chat", participantId, operation.chatId), privateData);
      const updatedAt = this.now().toISOString();
      const updated = await this.pool.query(`UPDATE runa_core.chats SET title_envelope=$3::jsonb,title_hmac=$4,
        updated_at=$5 WHERE participant_id=$1 AND chat_id=$2 AND NOT archived AND deleted_at IS NULL`,
      [participantId, operation.chatId, JSON.stringify(envelope), envelope.contentHmac, updatedAt]);
      if (updated.rowCount !== 1) throw coded("conversation-revision-conflict", "The conversation changed before rename completed.");
      return Object.freeze({ action: "renamed", chatId: operation.chatId, title: operation.title, updatedAt });
    }
    if (operation.action === "archive") {
      if (retained.archived || retained.deletedAt) throw coded("chat-not-found", "The selected chat was not found.");
      const updatedAt = this.now().toISOString();
      const updated = await this.pool.query(`UPDATE runa_core.chats SET archived=true,updated_at=$3
        WHERE participant_id=$1 AND chat_id=$2 AND NOT archived AND deleted_at IS NULL`,
      [participantId, operation.chatId, updatedAt]);
      if (updated.rowCount !== 1) throw coded("conversation-revision-conflict", "The conversation changed before archive completed.");
      return Object.freeze({ action: "archived", chatId: operation.chatId, updatedAt });
    }
    if (operation.action === "unarchive") {
      if (retained.deletedAt) throw coded("chat-deleted", "A deleted conversation cannot be restored by unarchive.");
      if (!retained.archived) throw coded("chat-not-archived", "The selected chat is not archived.");
      const updatedAt = this.now().toISOString();
      const updated = await this.pool.query(`UPDATE runa_core.chats SET archived=false,updated_at=$3
        WHERE participant_id=$1 AND chat_id=$2 AND archived AND deleted_at IS NULL`,
      [participantId, operation.chatId, updatedAt]);
      if (updated.rowCount !== 1) throw coded("conversation-revision-conflict", "The conversation changed before restore completed.");
      return Object.freeze({ action: "unarchived", chatId: operation.chatId, updatedAt });
    }
    if (operation.action === "delete") {
      if (retained.deletedAt) throw coded("chat-not-found", "The selected chat was not found.");
      const updatedAt = this.now().toISOString();
      const updated = await this.pool.query(`UPDATE runa_core.chats SET archived=true,deleted_at=$3,updated_at=$3
        WHERE participant_id=$1 AND chat_id=$2 AND deleted_at IS NULL`, [participantId, operation.chatId, updatedAt]);
      if (updated.rowCount !== 1) throw coded("conversation-revision-conflict", "The conversation changed before delete completed.");
      return Object.freeze({ action: "deleted", recovery: "retained-soft-delete", chatId: operation.chatId, updatedAt });
    }
    if (operation.action === "branch") {
      if (retained.archived || retained.deletedAt) throw coded("chat-not-found", "The selected chat was not found.");
      return this.#branchConversation(participantId, retained, operation);
    }
    throw coded("conversation-action-invalid", "That conversation action is unavailable.");
  }

  async #conversationRow(participantId, chatId, experience) {
    const row = (await this.pool.query(`SELECT chat_id,project_id,parent_chat_id,branch_from_turn,turn_count,
      archived,deleted_at,created_at,updated_at,title_envelope FROM runa_core.chats
      WHERE participant_id=$1 AND chat_id=$2`, [participantId, chatId])).rows[0];
    if (!row) throw coded("chat-not-found", "The selected chat was not found.");
    const privateData = this.cipher.decrypt(privateContext("chat", participantId, chatId), row.title_envelope);
    const routes = (await this.pool.query(`SELECT route FROM runa_core.chat_turns
      WHERE participant_id=$1 AND chat_id=$2 ORDER BY turn_ordinal`, [participantId, chatId])).rows.map(item => item.route);
    if (classifyExperience({ explicit: privateData.experience, routes }) !== experience) {
      throw coded("chat-experience-denied", "The selected chat belongs to another experience.");
    }
    return Object.freeze({ chatId, projectId: row.project_id, parentChatId: row.parent_chat_id,
      branchFromTurn: row.branch_from_turn, turnCount: row.turn_count, archived: row.archived,
      deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
      privateData });
  }

  async #branchConversation(participantId, retained, operation) {
    const branchId = `chat-branch-${sha256(`${participantId}\0${operation.requestId}`).slice(0, 32)}`;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = (await client.query(`SELECT parent_chat_id,branch_from_turn FROM runa_core.chats
        WHERE participant_id=$1 AND chat_id=$2`, [participantId, branchId])).rows[0];
      if (existing) {
        if (existing.parent_chat_id !== retained.chatId || existing.branch_from_turn !== retained.turnCount) {
          throw coded("request-id-conflict", "The branch request id is bound to another conversation.");
        }
        await client.query("COMMIT");
        return Object.freeze({ action: "branched", chatId: branchId, parentChatId: retained.chatId,
          branchFromTurn: retained.turnCount, turnCount: retained.turnCount });
      }
      const source = (await client.query(`SELECT turn_count,archived,deleted_at FROM runa_core.chats
        WHERE participant_id=$1 AND chat_id=$2 FOR SHARE`, [participantId, retained.chatId])).rows[0];
      if (!source || source.archived || source.deleted_at || source.turn_count !== retained.turnCount) {
        throw coded("conversation-revision-conflict", "The conversation changed before the branch snapshot was secured.");
      }
      const now = this.now().toISOString();
      const privateData = { title: `${safeTitle(retained.privateData.title)} branch`.slice(0, 120),
        experience: operation.experience };
      const publicData = { chatId: branchId, projectId: retained.projectId, parentChatId: retained.chatId,
        branchFromTurn: retained.turnCount, turnCount: retained.turnCount, archived: false, unread: false,
        createdAt: now, updatedAt: now };
      const envelope = this.cipher.encrypt(privateContext("chat", participantId, branchId), privateData);
      await client.query(`INSERT INTO runa_core.chats
        (chat_id,participant_id,project_id,parent_chat_id,branch_from_turn,turn_count,archived,unread,
         created_at,updated_at,title_envelope,title_hmac,locator_hmac,source_content_hmac)
        VALUES($1,$2,$3,$4,$5,$5,false,false,$6,$6,$7::jsonb,$8,$9,$10)`,
      [branchId, participantId, retained.projectId, retained.chatId, retained.turnCount, now,
        JSON.stringify(envelope), envelope.contentHmac,
        this.cipher.digest({ domain: "project-chat", kind: "chat", locator: `chat:${branchId}` }),
        this.cipher.digest({ domain: "project-chat", kind: "chat", locator: `chat:${branchId}`,
          publicData, privateData })]);
      const rows = (await client.query(`SELECT turn_ordinal,occurred_at,route,origin_request_id,content_envelope
        FROM runa_core.chat_turns WHERE participant_id=$1 AND chat_id=$2 AND turn_ordinal<$3 ORDER BY turn_ordinal`,
      [participantId, retained.chatId, retained.turnCount])).rows;
      if (rows.length !== retained.turnCount || rows.some((row, index) => row.turn_ordinal !== index)) {
        throw coded("conversation-revision-conflict", "The conversation turn sequence changed before branching completed.");
      }
      for (const row of rows) {
        const payload = this.cipher.decrypt(privateContext("chat-turn", participantId,
          `turn:${retained.chatId}:${row.turn_ordinal}`), row.content_envelope);
        const turnPublic = { chatId: branchId, turnOrdinal: row.turn_ordinal,
          occurredAt: new Date(row.occurred_at).toISOString(), route: row.route,
          originRequestId: row.origin_request_id };
        const turnEnvelope = this.cipher.encrypt(privateContext("chat-turn", participantId,
          `turn:${branchId}:${row.turn_ordinal}`), payload);
        await client.query(`INSERT INTO runa_core.chat_turns
          (participant_id,chat_id,turn_ordinal,occurred_at,route,origin_request_id,content_envelope,
           content_hmac,locator_hmac,source_content_hmac) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,
        [participantId, branchId, row.turn_ordinal, row.occurred_at, row.route, row.origin_request_id,
          JSON.stringify(turnEnvelope), turnEnvelope.contentHmac,
          this.cipher.digest({ domain: "project-chat", kind: "chat-turn", locator: `chat-turn:${branchId}:${row.turn_ordinal}` }),
          this.cipher.digest({ domain: "project-chat", kind: "chat-turn", locator: `chat-turn:${branchId}:${row.turn_ordinal}`,
            publicData: turnPublic, privateData: payload })]);
      }
      await client.query("COMMIT");
      return Object.freeze({ action: "branched", chatId: branchId, parentChatId: retained.chatId,
        branchFromTurn: retained.turnCount, turnCount: retained.turnCount });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async #insertChat(client, request, projectId) {
    const participantId = request.participant.principalId;
    const chatId = request.thread.threadId;
    const privateData = { title: safeTitle(request.message), experience: request.experience };
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
    const privateData = { user: request.message, assistant: response.answer, evidence: answerEvidence(response) };
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
    const rows = (await this.pool.query(`SELECT setting_key,setting_value FROM runa_core.participant_settings
      WHERE participant_id=$1`, [participantId])).rows;
    const values = { ...defaultUserSettings() };
    for (const row of rows) {
      try {
        const setting = validateUserSetting(row.setting_key, row.setting_value, { permitGoverned: true });
        values[setting.key] = setting.value;
      } catch {}
    }
    return values;
  }

  async setSetting(participantId, key, value) {
    const setting = validateUserSetting(key, value);
    const row = (await this.pool.query(`INSERT INTO runa_core.participant_settings
      (participant_id,setting_key,setting_value,revision,updated_at) VALUES($1,$2,$3,1,clock_timestamp())
      ON CONFLICT(participant_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,
        revision=runa_core.participant_settings.revision+1,updated_at=clock_timestamp()
      RETURNING revision,updated_at`, [participantId, setting.key, setting.value])).rows[0];
    return Object.freeze({ key: setting.key, value: setting.value, revision: Number(row.revision),
      updatedAt: new Date(row.updated_at).toISOString() });
  }

  async close() { if (this.ownsPool) await this.pool.end(); }
}

export class PostgresRequestCoordinator {
  constructor({ pool, cipher }) {
    if (typeof cipher?.encrypt !== "function" || typeof cipher?.decrypt !== "function") {
      throw coded("request-cache-cipher-required", "An authenticated private cache cipher is required.");
    }
    this.pool = pool; this.cipher = cipher;
  }
  async runOnce({ operation, requestId, actorId, inputDigest, execute }) {
    for (const value of [operation, requestId, actorId, inputDigest]) {
      if (typeof value !== "string" || !value.length || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) {
        throw coded("request-cache-scope-invalid", "The request cache scope is invalid.");
      }
    }
    const context = { recordType: "request-response-v2", participantId: actorId,
      recordId: sha256(JSON.stringify([operation, requestId, inputDigest])), field: "private-response" };
    const client = await this.pool.connect();
    const key = lockKey(`route:${operation}:${requestId}`);
    let locked = false;
    try {
      await client.query("SELECT pg_advisory_lock($1::bigint)", [key]);
      locked = true;
      // The old plaintext namespace is retained for old-release rollback, never
      // read as v2 authority or updated by this coordinator.
      const prior = (await client.query(`SELECT actor_id,input_digest,response_envelope FROM runa_runtime.route_responses_v2
        WHERE operation=$1 AND request_id=$2`, [operation, requestId])).rows[0];
      if (prior) {
        if (prior.actor_id !== actorId || prior.input_digest !== inputDigest) throw coded("request-id-conflict", "The request id is bound to different input.");
        const response = this.cipher.decrypt(context, prior.response_envelope);
        if (operation !== "answer" || !isRetryableConversationFailure(response)) return clone(response);
      }
      const response = await execute();
      const envelope = this.cipher.encrypt(context, response);
      await client.query(`INSERT INTO runa_runtime.route_responses_v2
        (operation,request_id,actor_id,input_digest,response_envelope) VALUES($1,$2,$3,$4,$5::jsonb)
        ON CONFLICT(operation,request_id) DO UPDATE SET response_envelope=excluded.response_envelope,
          completed_at=clock_timestamp()
        WHERE runa_runtime.route_responses_v2.actor_id=excluded.actor_id
          AND runa_runtime.route_responses_v2.input_digest=excluded.input_digest`,
      [operation, requestId, actorId, inputDigest, JSON.stringify(envelope)]);
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

