import pg from "pg";
import { assert, canonicalJson, digest, failure } from "./contracts.mjs";

const KINDS = new Set(["task", "grant", "proposal", "intent", "receipt", "run"]);
const identifier = value => {
  assert(/^[a-z][a-z0-9_]{0,48}$/.test(value), "m1-invalid-database-schema");
  return `"${value}"`;
};

/** PostgreSQL is the only authority. No reset/drop method is exposed. */
export class PostgresTaskStore {
  constructor({ pool, connectionString, schema = "runa_m1", cipher = null, allowPlaintextForSynthetic = false }) {
    assert(cipher ? typeof cipher.encrypt === "function" && typeof cipher.decrypt === "function"
      : allowPlaintextForSynthetic === true, "m1-encrypted-storage-required");
    this.pool = pool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 2000 });
    this.ownsPool = !pool;
    this.schemaName = schema;
    this.sqlSchema = identifier(schema);
    this.cipher = cipher;
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
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (kind, record_id),
        FOREIGN KEY (participant_id,project_id) REFERENCES ${s}.projects(participant_id,project_id));
      CREATE UNIQUE INDEX IF NOT EXISTS records_request_unique ON ${s}.records
        (participant_id,project_id,kind,request_key) WHERE request_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS records_scope_task ON ${s}.records (participant_id,project_id,kind,task_id);
      CREATE TABLE IF NOT EXISTS ${s}.runs (
        kind text NOT NULL CHECK (kind = 'run'), record_id text NOT NULL,
        participant_id text NOT NULL, project_id text NOT NULL, task_id text NOT NULL, request_key text,
        payload jsonb NOT NULL, payload_sha256 text NOT NULL, PRIMARY KEY (kind,record_id),
        updated_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (participant_id,project_id) REFERENCES ${s}.projects(participant_id,project_id));
      CREATE UNIQUE INDEX IF NOT EXISTS runs_request_unique ON ${s}.runs
        (participant_id,project_id,request_key) WHERE request_key IS NOT NULL;
      ALTER TABLE ${s}.records ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
      ALTER TABLE ${s}.runs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
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
      const result = await work(new Transaction(client, this.sqlSchema, context, this.cipher));
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
  constructor(client, schema, context, cipher) { Object.assign(this, { client, schema, context, cipher }); }
  scope() { return [this.context.principalId, this.context.projectId]; }
  table(kind) { assert(KINDS.has(kind), "m1-record-kind-invalid"); return `${this.schema}.${kind === "run" ? "runs" : "records"}`; }
  privateContext(kind, id) {
    return { recordType: `m1-${kind}`, participantId: this.context.principalId,
      recordId: digest({ projectId: this.context.projectId, kind, id }), field: "private-payload" };
  }
  encode(kind, id, payload) { return this.cipher ? this.cipher.encrypt(this.privateContext(kind, id), payload) : payload; }
  decode(row, kind, id = row?.record_id) {
    if (!row) return null;
    assert(row.payload_sha256 === digest(row.payload), "m1-authority-record-integrity-failed");
    if (!this.cipher) return row.payload;
    try { return this.cipher.decrypt(this.privateContext(kind, id), row.payload); }
    catch { throw failure("m1-authority-envelope-invalid"); }
  }
  async project() {
    return this.decode((await this.client.query(`SELECT payload,payload_sha256 FROM ${this.schema}.projects
      WHERE participant_id=$1 AND project_id=$2 FOR UPDATE`, this.scope())).rows[0], "project", this.context.projectId);
  }
  async saveProject(project, { insertOnly = false } = {}) {
    const encoded = this.encode("project", this.context.projectId, project);
    const values = [...this.scope(), canonicalJson(encoded), digest(encoded)];
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
    return this.decode((await this.client.query(`SELECT record_id,payload,payload_sha256 FROM ${this.table(kind)}
      WHERE participant_id=$1 AND project_id=$2 AND kind=$3 AND record_id=$4 FOR UPDATE`, [...this.scope(), kind, id])).rows[0], kind, id);
  }
  async byRequest(kind, key) {
    return this.decode((await this.client.query(`SELECT record_id,payload,payload_sha256 FROM ${this.table(kind)}
      WHERE participant_id=$1 AND project_id=$2 AND kind=$3 AND request_key=$4 FOR UPDATE`, [...this.scope(), kind, key])).rows[0], kind);
  }
  async list(kind, taskId) {
    const result = await this.client.query(`SELECT record_id,payload,payload_sha256 FROM ${this.table(kind)}
      WHERE participant_id=$1 AND project_id=$2 AND kind=$3 AND ($4::text IS NULL OR task_id=$4)
      ORDER BY record_id FOR UPDATE`, [...this.scope(), kind, taskId ?? null]);
    return result.rows.map(row => this.decode(row, kind));
  }
  async recent(kind) {
    const result = await this.client.query(`SELECT record_id,payload,payload_sha256 FROM ${this.table(kind)}
      WHERE participant_id=$1 AND project_id=$2 AND kind=$3 ORDER BY updated_at DESC,record_id DESC LIMIT 20`, [...this.scope(), kind]);
    return result.rows.map(row => this.decode(row, kind));
  }
  async save(kind, id, payload, { taskId = payload.taskId, requestKey = null, insertOnly = false } = {}) {
    assert(KINDS.has(kind), "m1-record-kind-invalid");
    const encoded = this.encode(kind, id, payload);
    if (insertOnly) {
      await this.client.query(`INSERT INTO ${this.table(kind)}
        (kind,record_id,participant_id,project_id,task_id,request_key,payload,payload_sha256)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [kind, id, ...this.scope(), taskId ?? null, requestKey, canonicalJson(encoded), digest(encoded)]);
    } else {
      const result = await this.client.query(`UPDATE ${this.table(kind)} SET payload=$5::jsonb,payload_sha256=$6,updated_at=now()
        WHERE participant_id=$1 AND project_id=$2 AND kind=$3 AND record_id=$4`,
      [...this.scope(), kind, id, canonicalJson(encoded), digest(encoded)]);
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
