const coded = (code, message) => Object.assign(new Error(message), { code });
const context = (recordType, recordId, field) => ({ recordType, participantId: "gate7a-ordinary-user",
  recordId, field });

export class PostgresOrdinarySessionStore {
  constructor({ pool, cipher }) { this.pool = pool; this.cipher = cipher; }

  async initialize({ bindingDigest }) {
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS gate7a;
      CREATE TABLE IF NOT EXISTS gate7a.release_bindings (
        binding_digest text PRIMARY KEY,
        activated_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE TABLE IF NOT EXISTS gate7a.browser_flows (
        state_digest text PRIMARY KEY,
        binding_digest text NOT NULL REFERENCES gate7a.release_bindings(binding_digest),
        method text NOT NULL CHECK(method IN ('password','passkey')),
        private_envelope jsonb NOT NULL,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS gate7a.browser_sessions (
        session_digest text PRIMARY KEY,
        binding_digest text NOT NULL REFERENCES gate7a.release_bindings(binding_digest),
        principal_id text NOT NULL,
        subject_ref text NOT NULL,
        method text NOT NULL CHECK(method IN ('password','webauthn','passkey','fido2','windows-hello')),
        client_id text NOT NULL,
        authenticated_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        private_envelope jsonb NOT NULL,
        revoked_at timestamptz
      );
    `);
    await this.pool.query(`INSERT INTO gate7a.release_bindings(binding_digest)
      VALUES($1) ON CONFLICT(binding_digest) DO NOTHING`, [bindingDigest]);
  }

  async createFlow({ bindingDigest, state, method, verifier, expiresAt }) {
    const stateDigest = this.cipher.digest({ type: "gate7a-ordinary-browser-flow", state });
    const envelope = this.cipher.encrypt(context("gate7a-ordinary-browser-flow", stateDigest, "private"),
      { state, verifier });
    try {
      await this.pool.query(`INSERT INTO gate7a.browser_flows
        (state_digest,binding_digest,method,private_envelope,expires_at)
        VALUES($1,$2,$3,$4::jsonb,$5)`, [stateDigest, bindingDigest, method,
        JSON.stringify(envelope), expiresAt]);
    } catch (error) {
      if (error?.code === "23505") throw coded("gate7a-ordinary-flow-conflict", "The ordinary browser flow already exists.");
      throw error;
    }
  }

  async consumeFlow({ bindingDigest, state, now }) {
    const stateDigest = this.cipher.digest({ type: "gate7a-ordinary-browser-flow", state });
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const row = (await client.query(`SELECT method,private_envelope,expires_at,consumed_at
        FROM gate7a.browser_flows WHERE state_digest=$1 AND binding_digest=$2 FOR UPDATE`,
      [stateDigest, bindingDigest])).rows[0];
      if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= now.getTime()) {
        throw coded("gate7a-ordinary-flow-invalid", "The ordinary browser flow is missing, expired, or already used.");
      }
      const privateValue = this.cipher.decrypt(context("gate7a-ordinary-browser-flow", stateDigest, "private"), row.private_envelope);
      if (privateValue.state !== state) throw coded("gate7a-ordinary-flow-invalid", "The ordinary browser flow binding is invalid.");
      await client.query("UPDATE gate7a.browser_flows SET consumed_at=$2 WHERE state_digest=$1", [stateDigest, now]);
      await client.query("COMMIT");
      return { method: row.method, verifier: privateValue.verifier };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async saveSession({ bindingDigest, sessionId, principalId, subject, accessToken, refreshToken,
    authenticatedAt, expiresAt, method, clientId }) {
    const sessionDigest = this.cipher.digest({ type: "gate7a-ordinary-browser-session", sessionId });
    const subjectRef = this.cipher.digest({ type: "gate7a-ordinary-oidc-subject", subject });
    const envelope = this.cipher.encrypt(context("gate7a-ordinary-browser-session", sessionDigest, "private"),
      { sessionId, accessToken, refreshToken });
    await this.pool.query(`INSERT INTO gate7a.browser_sessions
      (session_digest,binding_digest,principal_id,subject_ref,method,client_id,authenticated_at,expires_at,private_envelope)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`, [sessionDigest, bindingDigest, principalId,
      subjectRef, method, clientId, authenticatedAt, expiresAt, JSON.stringify(envelope)]);
  }

  async sessionCredentials({ bindingDigest, sessionId, now }) {
    const sessionDigest = this.cipher.digest({ type: "gate7a-ordinary-browser-session", sessionId });
    const row = (await this.pool.query(`SELECT client_id,private_envelope,expires_at,revoked_at
      FROM gate7a.browser_sessions WHERE session_digest=$1 AND binding_digest=$2`,
    [sessionDigest, bindingDigest])).rows[0];
    if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= now.getTime()) {
      throw coded("gate7a-ordinary-session-invalid", "The ordinary browser session is missing, expired, or revoked.");
    }
    const privateValue = this.cipher.decrypt(context("gate7a-ordinary-browser-session", sessionDigest, "private"), row.private_envelope);
    if (privateValue.sessionId !== sessionId) throw coded("gate7a-ordinary-session-invalid", "The ordinary browser session binding is invalid.");
    return { ...privateValue, clientId: row.client_id };
  }

  async sessionCredential(input) { return (await this.sessionCredentials(input)).accessToken; }

  async revokeSession({ bindingDigest, sessionId, now }) {
    const sessionDigest = this.cipher.digest({ type: "gate7a-ordinary-browser-session", sessionId });
    return (await this.pool.query(`UPDATE gate7a.browser_sessions SET revoked_at=$3
      WHERE binding_digest=$1 AND session_digest=$2 AND revoked_at IS NULL`,
    [bindingDigest, sessionDigest, now])).rowCount === 1;
  }
}
