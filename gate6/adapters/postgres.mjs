import pg from "pg";

const coded = (code, message) => Object.assign(new Error(message), { code });
const clone = value => structuredClone(value);

export class PostgresCutoverStore {
  constructor({ connectionString, pool = null, cutoverId, responseLossAfterCommit = [] }) {
    if (!/^[A-Za-z0-9._:-]{1,160}$/.test(String(cutoverId))) throw coded("cutover-id-invalid", "The cutover id is invalid.");
    this.pool = pool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 8_000 });
    this.ownsPool = !pool;
    this.cutoverId = cutoverId;
    this.responseLossAfterCommit = new Set(responseLossAfterCommit);
  }

  async initialize(initialState, { reset = false } = {}) {
    if (initialState.cutoverId !== this.cutoverId) throw coded("cutover-id-mismatch", "Initial state belongs to another cutover.");
    if (reset) await this.pool.query("DROP SCHEMA IF EXISTS gate6 CASCADE");
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS gate6;
      CREATE TABLE IF NOT EXISTS gate6.cutover_state (
        cutover_id text PRIMARY KEY,
        revision integer NOT NULL CHECK(revision >= 0),
        phase text NOT NULL,
        authority_generation text NOT NULL,
        state_json jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE TABLE IF NOT EXISTS gate6.operations (
        cutover_id text NOT NULL REFERENCES gate6.cutover_state(cutover_id) ON DELETE CASCADE,
        operation_id text NOT NULL,
        input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),
        committed_revision integer NOT NULL,
        state_json jsonb NOT NULL,
        result_json jsonb NOT NULL,
        committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(cutover_id, operation_id)
      );
    `);
    await this.pool.query(`INSERT INTO gate6.cutover_state
      (cutover_id,revision,phase,authority_generation,state_json) VALUES($1,$2,$3,$4,$5::jsonb)
      ON CONFLICT(cutover_id) DO NOTHING`, [this.cutoverId, initialState.revision, initialState.phase,
      initialState.authorityGeneration, JSON.stringify(initialState)]);
  }

  async load() {
    const row = (await this.pool.query("SELECT state_json FROM gate6.cutover_state WHERE cutover_id=$1", [this.cutoverId])).rows[0];
    if (!row) throw coded("cutover-state-not-found", "The durable cutover state is not initialized.");
    return clone(row.state_json);
  }

  async findOperation(operationId, inputDigest) {
    const row = (await this.pool.query(`SELECT input_digest,state_json,result_json FROM gate6.operations
      WHERE cutover_id=$1 AND operation_id=$2`, [this.cutoverId, operationId])).rows[0];
    if (!row) return null;
    if (row.input_digest !== inputDigest) throw coded("cutover-operation-conflict", "The operation id is already bound to different input.");
    return { state: clone(row.state_json), result: clone(row.result_json), replayed: true };
  }

  async commitOperation({ operationId, inputDigest, expectedRevision, nextState, result }) {
    const client = await this.pool.connect();
    let committed = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const current = (await client.query("SELECT revision,state_json FROM gate6.cutover_state WHERE cutover_id=$1 FOR UPDATE", [this.cutoverId])).rows[0];
      if (!current) throw coded("cutover-state-not-found", "The durable cutover state is not initialized.");
      const existing = (await client.query(`SELECT input_digest,state_json,result_json FROM gate6.operations
        WHERE cutover_id=$1 AND operation_id=$2`, [this.cutoverId, operationId])).rows[0];
      if (existing) {
        if (existing.input_digest !== inputDigest) throw coded("cutover-operation-conflict", "The operation id is already bound to different input.");
        await client.query("COMMIT"); committed = true;
        return { state: clone(existing.state_json), result: clone(existing.result_json), replayed: true };
      }
      if (current.revision !== expectedRevision) throw coded("cutover-revision-conflict", "The cutover state changed before this operation could commit.");
      if (nextState.cutoverId !== this.cutoverId || nextState.revision !== expectedRevision + 1) throw coded("cutover-next-state-invalid", "The next cutover state is invalid.");
      await client.query(`UPDATE gate6.cutover_state SET revision=$2,phase=$3,authority_generation=$4,
        state_json=$5::jsonb,updated_at=clock_timestamp() WHERE cutover_id=$1`, [this.cutoverId,
        nextState.revision, nextState.phase, nextState.authorityGeneration, JSON.stringify(nextState)]);
      await client.query(`INSERT INTO gate6.operations
        (cutover_id,operation_id,input_digest,committed_revision,state_json,result_json)
        VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`, [this.cutoverId, operationId, inputDigest,
        nextState.revision, JSON.stringify(nextState), JSON.stringify(result)]);
      await client.query("COMMIT"); committed = true;
      if (this.responseLossAfterCommit.delete(operationId)) throw coded("cutover-response-lost", "The operation committed but its response was lost.");
      return { state: clone(nextState), result: clone(result), replayed: false };
    } catch (error) {
      if (!committed) await client.query("ROLLBACK").catch(() => {});
      if (error?.code === "40001") throw coded("cutover-revision-conflict", "The cutover transaction conflicted with another operation.");
      throw error;
    } finally { client.release(); }
  }

  async audit() {
    const row = (await this.pool.query(`SELECT s.revision,s.phase,s.authority_generation,
      (SELECT count(*)::int FROM gate6.operations o WHERE o.cutover_id=s.cutover_id) operations
      FROM gate6.cutover_state s WHERE s.cutover_id=$1`, [this.cutoverId])).rows[0];
    if (!row) throw coded("cutover-state-not-found", "The durable cutover state is not initialized.");
    return { revision: row.revision, phase: row.phase, authorityGeneration: row.authority_generation, operations: row.operations };
  }

  async dropGate6Schema() { await this.pool.query("DROP SCHEMA IF EXISTS gate6 CASCADE"); }
  async close() { if (this.ownsPool) await this.pool.end(); }
}
