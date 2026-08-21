import { createHash } from "node:crypto";
import pg from "pg";

const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const requestSha256 = request => sha256(JSON.stringify(request));
const requestLockKey = request => {
  const unsigned = BigInt(`0x${sha256(request.requestId).slice(0, 16)}`);
  return (unsigned > 0x7fffffffffffffffn ? unsigned - 0x10000000000000000n : unsigned).toString();
};

export class PostgresRecordStore {
  constructor({ connectionString, pool = null }) {
    this.pool = pool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 5_000 });
    this.ownsPool = !pool;
  }

  async initialize({ reset = false } = {}) {
    if (reset) await this.pool.query("DROP SCHEMA IF EXISTS gate1 CASCADE");
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS gate1;
      CREATE TABLE IF NOT EXISTS gate1.source_sections (
        project_id text NOT NULL,
        source_id text NOT NULL,
        section_id text NOT NULL,
        content text NOT NULL,
        content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
        active boolean NOT NULL DEFAULT true,
        PRIMARY KEY (project_id, source_id, section_id)
      );
      CREATE TABLE IF NOT EXISTS gate1.answer_requests (
        request_id text PRIMARY KEY,
        request_sha256 text NOT NULL,
        participant_id text NOT NULL,
        project_id text NOT NULL,
        thread_id text NOT NULL,
        lane text NOT NULL CHECK (lane IN ('general', 'research')),
        response_json jsonb NOT NULL,
        completed_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS gate1.thread_turns (
        turn_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        request_id text NOT NULL UNIQUE REFERENCES gate1.answer_requests(request_id),
        participant_id text NOT NULL,
        project_id text NOT NULL,
        thread_id text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  async seedSources(sources) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const source of sources) {
        await client.query(`INSERT INTO gate1.source_sections
          (project_id, source_id, section_id, content, content_sha256, active)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (project_id, source_id, section_id) DO UPDATE SET
            content=excluded.content, content_sha256=excluded.content_sha256, active=excluded.active`,
        [source.projectId, source.sourceId, source.sectionId, source.content,
          source.contentSha256 ?? sha256(source.content), source.active !== false]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async listActiveSources() {
    const result = await this.pool.query(`SELECT project_id "projectId", source_id "sourceId",
      section_id "sectionId", content, content_sha256 "contentSha256", active
      FROM gate1.source_sections WHERE active ORDER BY project_id, source_id, section_id`);
    return result.rows;
  }

  async activeSources(projectId, references) {
    const results = [];
    for (const reference of references) {
      const found = await this.pool.query(`SELECT project_id "projectId", source_id "sourceId",
        section_id "sectionId", content, content_sha256 "contentSha256", active
        FROM gate1.source_sections
        WHERE project_id=$1 AND source_id=$2 AND section_id=$3 AND content_sha256=$4 AND active`,
      [projectId, reference.sourceId, reference.sectionId, reference.contentSha256]);
      if (found.rows[0]) results.push(found.rows[0]);
    }
    return results;
  }

  async revoke(projectId, sourceId, sectionId) {
    await this.pool.query(`UPDATE gate1.source_sections SET active=false
      WHERE project_id=$1 AND source_id=$2 AND section_id=$3`, [projectId, sourceId, sectionId]);
  }

  async #getCommittedWith(client, request) {
    const found = await client.query(`SELECT request_sha256 "requestSha256", response_json "response"
      FROM gate1.answer_requests WHERE request_id=$1`, [request.requestId]);
    if (!found.rows[0]) return null;
    if (found.rows[0].requestSha256 !== requestSha256(request)) {
      const error = new Error("requestId was already used for a different request");
      error.code = "request-id-conflict";
      throw error;
    }
    return found.rows[0].response;
  }

  async getCommitted(request) {
    return this.#getCommittedWith(this.pool, request);
  }

  async #commitWith(client, request, response) {
    try {
      await client.query("BEGIN");
      const inserted = await client.query(`INSERT INTO gate1.answer_requests
        (request_id, request_sha256, participant_id, project_id, thread_id, lane, response_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
        ON CONFLICT (request_id) DO NOTHING RETURNING response_json "response"`,
      [request.requestId, requestSha256(request), request.participant.principalId, request.project.projectId,
        request.thread.threadId, request.lane, JSON.stringify(response)]);
      if (inserted.rowCount === 1) {
        await client.query(`INSERT INTO gate1.thread_turns
          (request_id, participant_id, project_id, thread_id) VALUES ($1,$2,$3,$4)`,
        [request.requestId, request.participant.principalId, request.project.projectId, request.thread.threadId]);
      }
      const committed = await client.query(`SELECT request_sha256 "requestSha256", response_json "response"
        FROM gate1.answer_requests WHERE request_id=$1 FOR SHARE`, [request.requestId]);
      if (committed.rows[0].requestSha256 !== requestSha256(request)) {
        const error = new Error("requestId was already used for a different request");
        error.code = "request-id-conflict";
        throw error;
      }
      await client.query("COMMIT");
      return committed.rows[0].response;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  async commit(request, response) {
    const client = await this.pool.connect();
    try { return await this.#commitWith(client, request, response); }
    finally { client.release(); }
  }

  async runOnce(request, operation, { deadlineMs = 5_000 } = {}) {
    const client = await this.pool.connect();
    const lockKey = requestLockKey(request);
    let locked = false;
    try {
      await client.query("SELECT set_config('lock_timeout', $1, false)", [`${Math.max(1, Math.floor(deadlineMs))}ms`]);
      try {
        await client.query("SELECT pg_advisory_lock($1::bigint)", [lockKey]);
        locked = true;
      } catch (error) {
        if (error?.code !== "55P03") throw error;
        const timeout = new Error("request deadline expired while waiting for the execution lock");
        timeout.code = "request-timeout";
        throw timeout;
      } finally {
        await client.query("SELECT set_config('lock_timeout', '0', false)").catch(() => {});
      }
      const existing = await this.#getCommittedWith(client, request);
      if (existing) return existing;
      return await this.#commitWith(client, request, await operation());
    } finally {
      if (locked) await client.query("SELECT pg_advisory_unlock($1::bigint)", [lockKey]).catch(() => {});
      client.release();
    }
  }

  async counts(requestId) {
    const result = await this.pool.query(`SELECT
      (SELECT count(*)::int FROM gate1.answer_requests WHERE request_id=$1) requests,
      (SELECT count(*)::int FROM gate1.thread_turns WHERE request_id=$1) turns`, [requestId]);
    return result.rows[0];
  }

  async close() {
    if (this.ownsPool) await this.pool.end();
  }
}
