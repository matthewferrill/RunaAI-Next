import pg from "pg";

const coded = (code, message) => Object.assign(new Error(message), { code });

export class PostgresPrincipalStore {
  constructor({ connectionString, pool = null } = {}) {
    this.pool = pool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 5_000 });
    this.ownsPool = !pool;
  }

  async initialize({ reset = false } = {}) {
    if (reset) await this.pool.query("DROP SCHEMA IF EXISTS gate5 CASCADE");
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS gate5;
      CREATE TABLE IF NOT EXISTS gate5.principals (
        principal_id text PRIMARY KEY,
        oidc_subject text NOT NULL UNIQUE,
        role text NOT NULL,
        age_class text NOT NULL,
        status text NOT NULL,
        record_version integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE TABLE IF NOT EXISTS gate5.restore_runs (
        run_id text PRIMARY KEY,
        manifest_digest text NOT NULL,
        restored_count integer NOT NULL,
        committed_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE TABLE IF NOT EXISTS gate5.restored_records (
        run_id text NOT NULL REFERENCES gate5.restore_runs(run_id) ON DELETE CASCADE,
        domain text NOT NULL,
        record_id text NOT NULL,
        record_json jsonb NOT NULL,
        PRIMARY KEY (run_id, domain, record_id)
      );
    `);
  }

  async seed(record) {
    await this.pool.query(`INSERT INTO gate5.principals
      (principal_id,oidc_subject,role,age_class,status,record_version)
      VALUES($1,$2,$3,$4,$5,$6)`, [record.principalId, record.subject, record.role, record.ageClass, record.status, record.recordVersion]);
  }

  async bySubject(subject) {
    const row = (await this.pool.query(`SELECT principal_id,role,age_class,status,record_version
      FROM gate5.principals WHERE oidc_subject=$1`, [subject])).rows[0];
    if (!row) throw coded("principal-not-found", "No product principal is bound to this authenticated subject.");
    return {
      principalId: row.principal_id,
      role: row.role,
      ageClass: row.age_class,
      status: row.status,
      recordVersion: row.record_version,
    };
  }

  async restore({ runId, manifestDigest, records, failAfter = null }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const prior = (await client.query("SELECT manifest_digest,restored_count FROM gate5.restore_runs WHERE run_id=$1 FOR UPDATE", [runId])).rows[0];
      if (prior) {
        if (prior.manifest_digest !== manifestDigest) throw coded("restore-run-changed", "Restore run id is bound to a different manifest.");
        await client.query("COMMIT");
        return { restored: prior.restored_count, replayed: true };
      }
      await client.query("INSERT INTO gate5.restore_runs(run_id,manifest_digest,restored_count) VALUES($1,$2,$3)", [runId, manifestDigest, records.length]);
      let inserted = 0;
      for (const record of records) {
        await client.query(`INSERT INTO gate5.restored_records(run_id,domain,record_id,record_json)
          VALUES($1,$2,$3,$4::jsonb)`, [runId, record.domain, record.recordId, JSON.stringify(record)]);
        inserted += 1;
        if (failAfter !== null && inserted >= failAfter) throw coded("restore-injected-failure", "Synthetic PostgreSQL restore failure.");
      }
      await client.query("COMMIT");
      return { restored: inserted, replayed: false };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async restoredRecords(runId) {
    return (await this.pool.query(`SELECT record_json FROM gate5.restored_records
      WHERE run_id=$1 ORDER BY domain,record_id`, [runId])).rows.map(row => row.record_json);
  }

  async rollbackRestore(runId) {
    return (await this.pool.query("DELETE FROM gate5.restore_runs WHERE run_id=$1", [runId])).rowCount === 1;
  }

  async counts() {
    return (await this.pool.query(`SELECT
      (SELECT count(*)::int FROM gate5.principals) principals,
      (SELECT count(*)::int FROM gate5.restore_runs) restore_runs,
      (SELECT count(*)::int FROM gate5.restored_records) restored_records`)).rows[0];
  }

  async rollbackGate5() { await this.pool.query("DROP SCHEMA IF EXISTS gate5 CASCADE"); }
  async close() { if (this.ownsPool) await this.pool.end(); }
}
