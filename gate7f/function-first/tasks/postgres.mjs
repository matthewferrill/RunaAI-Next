import pg from "pg";
import { assert, canonicalJson, digest, failure } from "./contracts.mjs";

const KINDS = new Set(["task", "grant", "proposal", "intent", "receipt"]);
const identifier = value => {
  assert(/^[a-z][a-z0-9_]{0,48}$/.test(value), "m1-invalid-database-schema");
  return `"${value}"`;
};

/** PostgreSQL is the only authority. No reset/drop method is exposed. */
export class PostgresTaskStore {
  constructor({ pool, connectionString, schema = "runa_m1" }) {
    this.pool = pool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 2000 });
    this.ownsPool = !pool;
    this.schemaName = schema;
    this.sqlSchema = identifier(schema);
  }
  async initialize() {
    const s = this.sqlSchema;
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${s};
      CREATE TABLE IF NOT EXISTS ${s}.projects (
        participant_id text NOT NULL, project_id text NOT NULL,
        payload jsonb NOT NULL, payload_sha256 text NOT NULL,
        PRIMARY KEY (participant_id, project_id));
      CREATE TABLE IF NOT EXISTS ${s}.records (
        kind text NOT NULL CHECK (kind IN ('task','grant','proposal','intent','receipt')),
        record_id text NOT NULL, participant_id text NOT NULL, project_id text NOT NULL,
        task_id text, request_key text, payload jsonb NOT NULL, payload_sha256 text NOT NULL,
        PRIMARY KEY (kind, record_id),
        FOREIGN KEY (participant_id,project_id) REFERENCES ${s}.projects(participant_id,project_id));
      CREATE UNIQUE INDEX IF NOT EXISTS records_request_unique ON ${s}.records
        (participant_id,project_id,kind,request_key) WHERE request_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS records_scope_task ON ${s}.records (participant_id,project_id,kind,task_id);
      CREATE TABLE IF NOT EXISTS ${s}.audit (
        sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        participant_id text NOT NULL, project_id text NOT NULL, code text NOT NULL,
        record_id text NOT NULL, detail_sha256 text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS ${s}.outbox (
        receipt_id text PRIMARY KEY, participant_id text NOT NULL, project_id text NOT NULL,
        event jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now());`);
  }
  async close() { if (this.ownsPool) await this.pool.end(); }

  async transaction(context, work) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // All authority changes for one scope serialize. Long executor work is outside this transaction.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${this.schemaName}:scope:${digest({ principalId: context.principalId, projectId: context.projectId })}`]);
      const result = await work(new Transaction(client, this.sqlSchema, context));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async operation(proposalId, work) {
    const client = await this.pool.connect();
    const key = `${this.schemaName}:dispatch:${proposalId}`;
    let locked = false;
    try {
      locked = (await client.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [key])).rows[0].locked;
      if (!locked) throw failure("m1-operation-in-progress");
      return await work();
    } finally {
      if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [key]).catch(() => {});
      client.release();
    }
  }
}

class Transaction {
  constructor(client, schema, context) { Object.assign(this, { client, schema, context }); }
  scope() { return [this.context.principalId, this.context.projectId]; }
  decode(row) {
    if (!row) return null;
    assert(row.payload_sha256 === digest(row.payload), "m1-authority-record-integrity-failed");
    return row.payload;
  }
  async project() {
    return this.decode((await this.client.query(`SELECT payload,payload_sha256 FROM ${this.schema}.projects
      WHERE participant_id=$1 AND project_id=$2 FOR UPDATE`, this.scope())).rows[0]);
  }
  async saveProject(project, { insertOnly = false } = {}) {
    const values = [...this.scope(), canonicalJson(project), digest(project)];
    if (insertOnly) await this.client.query(`INSERT INTO ${this.schema}.projects
      (participant_id,project_id,payload,payload_sha256) VALUES ($1,$2,$3::jsonb,$4)`, values);
    else {
      const result = await this.client.query(`UPDATE ${this.schema}.projects SET payload=$3::jsonb,payload_sha256=$4
        WHERE participant_id=$1 AND project_id=$2`, values);
      assert(result.rowCount === 1, "m1-project-not-found");
    }
  }
  async get(kind, id) {
    assert(KINDS.has(kind), "m1-record-kind-invalid");
    return this.decode((await this.client.query(`SELECT payload,payload_sha256 FROM ${this.schema}.records
      WHERE participant_id=$1 AND project_id=$2 AND kind=$3 AND record_id=$4 FOR UPDATE`, [...this.scope(), kind, id])).rows[0]);
  }
  async byRequest(kind, key) {
    return this.decode((await this.client.query(`SELECT payload,payload_sha256 FROM ${this.schema}.records
      WHERE participant_id=$1 AND project_id=$2 AND kind=$3 AND request_key=$4 FOR UPDATE`, [...this.scope(), kind, key])).rows[0]);
  }
  async list(kind, taskId) {
    const result = await this.client.query(`SELECT payload,payload_sha256 FROM ${this.schema}.records
      WHERE participant_id=$1 AND project_id=$2 AND kind=$3 AND ($4::text IS NULL OR task_id=$4)
      ORDER BY record_id FOR UPDATE`, [...this.scope(), kind, taskId ?? null]);
    return result.rows.map(row => this.decode(row));
  }
  async save(kind, id, payload, { taskId = payload.taskId, requestKey = null, insertOnly = false } = {}) {
    assert(KINDS.has(kind), "m1-record-kind-invalid");
    if (insertOnly) {
      await this.client.query(`INSERT INTO ${this.schema}.records
        (kind,record_id,participant_id,project_id,task_id,request_key,payload,payload_sha256)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [kind, id, ...this.scope(), taskId ?? null, requestKey, canonicalJson(payload), digest(payload)]);
    } else {
      const result = await this.client.query(`UPDATE ${this.schema}.records SET payload=$5::jsonb,payload_sha256=$6
        WHERE participant_id=$1 AND project_id=$2 AND kind=$3 AND record_id=$4`,
      [...this.scope(), kind, id, canonicalJson(payload), digest(payload)]);
      assert(result.rowCount === 1, "m1-authority-record-not-found");
    }
  }
  async audit(code, recordId, details = {}) {
    await this.client.query(`INSERT INTO ${this.schema}.audit
      (participant_id,project_id,code,record_id,detail_sha256) VALUES ($1,$2,$3,$4,$5)`,
    [...this.scope(), code, recordId, digest(details)]);
  }
  async outbox(receipt) {
    const event = { schemaVersion: "runa-m1-effect-event/v1", receiptId: receipt.receiptId,
      taskId: receipt.taskId, proposalId: receipt.proposalId, receiptDigest: receipt.receiptDigest };
    await this.client.query(`INSERT INTO ${this.schema}.outbox
      (receipt_id,participant_id,project_id,event) VALUES ($1,$2,$3,$4::jsonb)`,
    [receipt.receiptId, ...this.scope(), canonicalJson(event)]);
  }
}
