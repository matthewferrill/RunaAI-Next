import { advanceOwnerCeremony, createOwnerCeremonyState } from "../ceremony.mjs";
import { bindingDigest } from "../contracts.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const context = (recordType, recordId, field) => ({ recordType, participantId: "gate6c-owner",
  recordId, field });

export class PostgresBrowserCeremonyStore {
  constructor({ pool, cipher }) { this.pool = pool; this.cipher = cipher; }

  async initialize({ binding }) {
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS gate6c;
      CREATE TABLE IF NOT EXISTS gate6c.owner_ceremonies (
        binding_digest text PRIMARY KEY,
        state_json jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE TABLE IF NOT EXISTS gate6c.browser_flows (
        state_digest text PRIMARY KEY,
        binding_digest text NOT NULL REFERENCES gate6c.owner_ceremonies(binding_digest),
        command text NOT NULL,
        private_envelope jsonb NOT NULL,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS gate6c.browser_sessions (
        session_digest text PRIMARY KEY,
        binding_digest text NOT NULL REFERENCES gate6c.owner_ceremonies(binding_digest),
        principal_id text NOT NULL,
        subject_ref text NOT NULL,
        method text NOT NULL,
        authenticated_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        private_envelope jsonb NOT NULL,
        revoked_at timestamptz
      );
    `);
    const digest = bindingDigest(binding);
    const initial = createOwnerCeremonyState(binding);
    await this.pool.query(`INSERT INTO gate6c.owner_ceremonies(binding_digest,state_json)
      VALUES($1,$2::jsonb) ON CONFLICT(binding_digest) DO NOTHING`, [digest, JSON.stringify(initial)]);
  }

  async ceremonyState(binding) {
    const row = (await this.pool.query("SELECT state_json FROM gate6c.owner_ceremonies WHERE binding_digest=$1",
      [bindingDigest(binding)])).rows[0];
    if (!row) throw coded("gate6c-owner-ceremony-missing", "The bound owner ceremony is unavailable.");
    return row.state_json;
  }

  async advanceCeremony({ binding, ...input }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const digest = bindingDigest(binding);
      const row = (await client.query(`SELECT state_json FROM gate6c.owner_ceremonies
        WHERE binding_digest=$1 FOR UPDATE`, [digest])).rows[0];
      if (!row) throw coded("gate6c-owner-ceremony-missing", "The bound owner ceremony is unavailable.");
      const next = advanceOwnerCeremony(row.state_json, input);
      await client.query(`UPDATE gate6c.owner_ceremonies SET state_json=$2::jsonb,
        updated_at=clock_timestamp() WHERE binding_digest=$1`, [digest, JSON.stringify(next)]);
      await client.query("COMMIT");
      return next;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async createFlow({ binding, state, command, verifier, expiresAt }) {
    const stateDigest = this.cipher.digest({ type: "gate6c-browser-flow", state });
    const envelope = this.cipher.encrypt(context("gate6c-browser-flow", stateDigest, "private"),
      { state, verifier });
    try {
      await this.pool.query(`INSERT INTO gate6c.browser_flows
        (state_digest,binding_digest,command,private_envelope,expires_at)
        VALUES($1,$2,$3,$4::jsonb,$5)`, [stateDigest, bindingDigest(binding), command,
        JSON.stringify(envelope), expiresAt]);
    } catch (error) {
      if (error?.code === "23505") throw coded("gate6c-browser-flow-conflict", "The browser flow already exists.");
      throw error;
    }
  }

  async consumeFlow({ binding, state, now }) {
    const stateDigest = this.cipher.digest({ type: "gate6c-browser-flow", state });
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const row = (await client.query(`SELECT command,private_envelope,expires_at,consumed_at
        FROM gate6c.browser_flows WHERE state_digest=$1 AND binding_digest=$2 FOR UPDATE`,
      [stateDigest, bindingDigest(binding)])).rows[0];
      if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= now.getTime()) {
        throw coded("gate6c-browser-flow-invalid", "The browser flow is missing, expired, or already used.");
      }
      const privateValue = this.cipher.decrypt(context("gate6c-browser-flow", stateDigest, "private"), row.private_envelope);
      if (privateValue.state !== state) throw coded("gate6c-browser-flow-invalid", "The browser flow binding is invalid.");
      await client.query("UPDATE gate6c.browser_flows SET consumed_at=$2 WHERE state_digest=$1", [stateDigest, now]);
      await client.query("COMMIT");
      return { command: row.command, verifier: privateValue.verifier };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async saveSession({ binding, sessionId, principalId, subject, accessToken, refreshToken,
    authenticatedAt, expiresAt, method }) {
    const sessionDigest = this.cipher.digest({ type: "gate6c-browser-session", sessionId });
    const subjectRef = this.cipher.digest({ type: "gate6c-oidc-subject", subject });
    const envelope = this.cipher.encrypt(context("gate6c-browser-session", sessionDigest, "private"),
      { sessionId, accessToken, refreshToken });
    await this.pool.query(`INSERT INTO gate6c.browser_sessions
      (session_digest,binding_digest,principal_id,subject_ref,method,authenticated_at,expires_at,private_envelope)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [sessionDigest, bindingDigest(binding), principalId,
      subjectRef, method, authenticatedAt, expiresAt, JSON.stringify(envelope)]);
  }

  async sessionCredential({ binding, sessionId, now }) {
    const sessionDigest = this.cipher.digest({ type: "gate6c-browser-session", sessionId });
    const row = (await this.pool.query(`SELECT private_envelope,expires_at,revoked_at
      FROM gate6c.browser_sessions WHERE session_digest=$1 AND binding_digest=$2`,
    [sessionDigest, bindingDigest(binding)])).rows[0];
    if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= now.getTime()) {
      throw coded("gate6c-browser-session-invalid", "The browser session is missing, expired, or revoked.");
    }
    const privateValue = this.cipher.decrypt(context("gate6c-browser-session", sessionDigest, "private"), row.private_envelope);
    if (privateValue.sessionId !== sessionId) throw coded("gate6c-browser-session-invalid", "The browser session binding is invalid.");
    return privateValue.accessToken;
  }

  async activeSessionCredentials({ binding, now }) {
    const rows = (await this.pool.query(`SELECT session_digest,private_envelope FROM gate6c.browser_sessions
      WHERE binding_digest=$1 AND revoked_at IS NULL AND expires_at>$2 ORDER BY session_digest`,
    [bindingDigest(binding), now])).rows;
    return rows.map(row => {
      const value = this.cipher.decrypt(context("gate6c-browser-session", row.session_digest, "private"), row.private_envelope);
      return { sessionId: value.sessionId, accessToken: value.accessToken,
        refreshToken: value.refreshToken };
    });
  }

  async revokeSessions({ binding, now }) {
    return (await this.pool.query(`UPDATE gate6c.browser_sessions SET revoked_at=$2
      WHERE binding_digest=$1 AND revoked_at IS NULL`, [bindingDigest(binding), now])).rowCount;
  }

  async revokeSession({ binding, sessionId, now }) {
    const sessionDigest = this.cipher.digest({ type: "gate6c-browser-session", sessionId });
    return (await this.pool.query(`UPDATE gate6c.browser_sessions SET revoked_at=$3
      WHERE binding_digest=$1 AND session_digest=$2 AND revoked_at IS NULL`,
    [bindingDigest(binding), sessionDigest, now])).rowCount === 1;
  }
}

export class PostgresPendingCapabilityRevoker {
  constructor({ pool }) { this.pool = pool; }
  async revokeAll({ principalId }) {
    const row = (await this.pool.query(`SELECT count(*)::int AS remaining
      FROM runa_governance.capabilities WHERE participant_id=$1 AND status<>'consumed'`,
    [principalId])).rows[0];
    return Object.freeze({ revoked: 0, remaining: Number(row?.remaining ?? 0) });
  }
}
