import { randomUUID } from "node:crypto";
import { argumentHash } from "./action-request.mjs";

export async function initializeCapabilitySchema(pool, { reset = false } = {}) {
  if (reset) await pool.query("DROP SCHEMA IF EXISTS fray4 CASCADE");
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS fray4;
    CREATE TABLE IF NOT EXISTS fray4.authorization_decisions (
      decision_id text PRIMARY KEY,
      actor_id text NOT NULL,
      action text NOT NULL,
      resource_id text NOT NULL,
      allowed boolean NOT NULL,
      source text NOT NULL,
      detail_sha256 text,
      decided_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fray4.capabilities (
      capability_id text PRIMARY KEY,
      request_id text NOT NULL UNIQUE,
      actor_id text NOT NULL,
      action text NOT NULL,
      resource_id text NOT NULL,
      canonical_arguments text NOT NULL,
      argument_hash text NOT NULL,
      issued_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      status text NOT NULL CHECK (status IN ('pending','consumed','revoked','expired')),
      idempotency_key text NOT NULL UNIQUE,
      intent_source_id text NOT NULL,
      intent_content_sha256 text NOT NULL,
      issue_decision_id text NOT NULL REFERENCES fray4.authorization_decisions(decision_id),
      consumed_at timestamptz,
      revoked_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS fray4.effect_outbox (
      idempotency_key text PRIMARY KEY,
      capability_id text NOT NULL REFERENCES fray4.capabilities(capability_id),
      argument_hash text NOT NULL,
      state text NOT NULL CHECK (state IN ('reserved','committed','reconciled')),
      execution_decision_id text NOT NULL REFERENCES fray4.authorization_decisions(decision_id),
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fray4.effect_deeds (
      idempotency_key text PRIMARY KEY,
      capability_id text NOT NULL,
      actor_id text NOT NULL,
      resource_id text NOT NULL,
      argument_hash text NOT NULL,
      deed_json jsonb NOT NULL,
      performed_at timestamptz NOT NULL
    );
  `);
}

function identityReason(identity, actorId) {
  if (!identity?.decided) return "identity-uncertain";
  if (!identity.active) return "identity-inactive";
  if (`user:${identity.subject}` !== actorId) return "identity-actor-mismatch";
  return null;
}

function authorizationReason(authorization, actorId, action, resourceId) {
  if (!authorization?.decided) return "authorization-uncertain";
  if (authorization.actorId !== actorId || authorization.action !== action || authorization.resourceId !== resourceId) {
    return "authorization-decision-mismatch";
  }
  if (!authorization.allowed) return "authorization-denied";
  return null;
}

async function recordDecision(client, decision) {
  const decisionId = decision.decisionId ?? randomUUID();
  await client.query({
    text: `INSERT INTO fray4.authorization_decisions
      (decision_id,actor_id,action,resource_id,allowed,source,detail_sha256,decided_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    values: [decisionId, decision.actorId, decision.action, decision.resourceId, decision.allowed,
      decision.source ?? "openfga", decision.detailSha256 ?? null, decision.decidedAt ?? new Date().toISOString()],
  });
  return decisionId;
}

export class CapabilityStore {
  constructor(pool) {
    this.pool = pool;
  }

  async issue(actionRequest, { identity, authorization, now = new Date().toISOString(), capabilityId = randomUUID() }) {
    const identityFailure = identityReason(identity, actionRequest.actorId);
    if (identityFailure) return { outcome: "denied", reason: identityFailure, capabilityId: null };
    const authorizationFailure = authorizationReason(authorization, actionRequest.actorId, actionRequest.action, actionRequest.resourceId);
    if (authorizationFailure) return { outcome: "denied", reason: authorizationFailure, capabilityId: null };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const decisionId = await recordDecision(client, authorization);
      await client.query({
        text: `INSERT INTO fray4.capabilities
          (capability_id,request_id,actor_id,action,resource_id,canonical_arguments,argument_hash,
           issued_at,expires_at,status,idempotency_key,intent_source_id,intent_content_sha256,issue_decision_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12,$13)`,
        values: [capabilityId, actionRequest.requestId, actionRequest.actorId, actionRequest.action,
          actionRequest.resourceId, actionRequest.canonicalArguments, actionRequest.argumentHash,
          actionRequest.issuedAt, actionRequest.expiresAt, actionRequest.idempotencyKey,
          actionRequest.intentSourceId, actionRequest.intentContentSha256, decisionId],
      });
      await client.query("COMMIT");
      return { outcome: "pending", reason: "issued", capabilityId, decisionId, issuedAt: now };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      return { outcome: "denied", reason: "capability-store-error", capabilityId: null, error: error.message };
    } finally {
      client.release();
    }
  }

  async revoke(capabilityId, now = new Date().toISOString()) {
    const result = await this.pool.query({
      text: `UPDATE fray4.capabilities SET status='revoked', revoked_at=$2
             WHERE capability_id=$1 AND status='pending' RETURNING capability_id`,
      values: [capabilityId, now],
    });
    return result.rowCount === 1;
  }

  async reserve({ capabilityId, actorId, action, resourceId, arguments: args, identity, authorization, now = new Date().toISOString() }) {
    if (!capabilityId) return { outcome: "denied", reason: "missing-capability" };
    const identityFailure = identityReason(identity, actorId);
    if (identityFailure) return { outcome: "denied", reason: identityFailure };
    const authorizationFailure = authorizationReason(authorization, actorId, action, resourceId);
    if (authorizationFailure) return { outcome: "denied", reason: authorizationFailure };
    const suppliedHash = argumentHash(args);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let client;
      try {
        client = await this.pool.connect();
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const found = await client.query({ text: "SELECT * FROM fray4.capabilities WHERE capability_id=$1 FOR UPDATE", values: [capabilityId] });
        if (found.rowCount !== 1) {
          await client.query("ROLLBACK");
          return { outcome: "denied", reason: "unknown-capability" };
        }
        const capability = found.rows[0];
        if (capability.status === "revoked") {
          await client.query("ROLLBACK");
          return { outcome: "revoked", reason: "capability-revoked" };
        }
        if (capability.status === "consumed") {
          await client.query("ROLLBACK");
          return { outcome: "already-consumed", reason: "capability-consumed", idempotencyKey: capability.idempotency_key };
        }
        if (capability.status === "expired" || Date.parse(capability.expires_at) <= Date.parse(now)) {
          await client.query("UPDATE fray4.capabilities SET status='expired' WHERE capability_id=$1", [capabilityId]);
          await client.query("COMMIT");
          return { outcome: "expired", reason: "capability-expired" };
        }
        if (capability.actor_id !== actorId) {
          await client.query("ROLLBACK");
          return { outcome: "denied", reason: "capability-actor-mismatch" };
        }
        if (capability.action !== action) {
          await client.query("ROLLBACK");
          return { outcome: "denied", reason: "capability-action-mismatch" };
        }
        if (capability.resource_id !== resourceId) {
          await client.query("ROLLBACK");
          return { outcome: "denied", reason: "capability-resource-mismatch" };
        }
        if (capability.argument_hash !== suppliedHash) {
          await client.query("ROLLBACK");
          return { outcome: "denied", reason: "capability-argument-mismatch" };
        }
        const decisionId = await recordDecision(client, authorization);
        await client.query({
          text: "UPDATE fray4.capabilities SET status='consumed', consumed_at=$2 WHERE capability_id=$1",
          values: [capabilityId, now],
        });
        await client.query({
          text: `INSERT INTO fray4.effect_outbox
            (idempotency_key,capability_id,argument_hash,state,execution_decision_id,created_at,updated_at)
            VALUES ($1,$2,$3,'reserved',$4,$5,$5) ON CONFLICT (idempotency_key) DO NOTHING`,
          values: [capability.idempotency_key, capabilityId, suppliedHash, decisionId, now],
        });
        await client.query("COMMIT");
        return { outcome: "reserved", reason: "capability-consumed", capabilityId,
          idempotencyKey: capability.idempotency_key, argumentHash: suppliedHash, decisionId };
      } catch (error) {
        if (client) await client.query("ROLLBACK").catch(() => {});
        if (error.code === "40001" && attempt < 2) continue;
        return { outcome: "denied", reason: "capability-store-unavailable", error: error.message };
      } finally {
        client?.release();
      }
    }
    return { outcome: "denied", reason: "capability-store-unavailable", error: "serialization-retries-exhausted" };
  }

  async performDeed(reservation, { actorId, resourceId, arguments: args }, now = new Date().toISOString()) {
    const result = await this.pool.query({
      text: `INSERT INTO fray4.effect_deeds
        (idempotency_key,capability_id,actor_id,resource_id,argument_hash,deed_json,performed_at)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
        ON CONFLICT (idempotency_key) DO NOTHING RETURNING idempotency_key`,
      values: [reservation.idempotencyKey, reservation.capabilityId, actorId, resourceId,
        reservation.argumentHash, JSON.stringify(args), now],
    });
    return { inserted: result.rowCount === 1, idempotencyKey: reservation.idempotencyKey };
  }

  async markOutbox(idempotencyKey, state, now = new Date().toISOString()) {
    if (!new Set(["committed", "reconciled"]).has(state)) throw new Error("invalid outbox terminal state");
    await this.pool.query({
      text: "UPDATE fray4.effect_outbox SET state=$2, updated_at=$3 WHERE idempotency_key=$1",
      values: [idempotencyKey, state, now],
    });
  }

  async postcondition(idempotencyKey) {
    const result = await this.pool.query({
      text: "SELECT idempotency_key,capability_id,argument_hash,deed_json,performed_at FROM fray4.effect_deeds WHERE idempotency_key=$1",
      values: [idempotencyKey],
    });
    return result.rows[0] ?? null;
  }

  async reconcile(idempotencyKey, now = new Date().toISOString()) {
    const deed = await this.postcondition(idempotencyKey);
    if (!deed) return { outcome: "unknown/reconcile", reason: "deed-not-observed" };
    await this.markOutbox(idempotencyKey, "reconciled", now);
    return { outcome: "reconciled", reason: "deed-observed", deed };
  }

  async counts() {
    const [capabilities, outbox, deeds, decisions] = await Promise.all([
      this.pool.query("SELECT count(*)::int AS n FROM fray4.capabilities"),
      this.pool.query("SELECT count(*)::int AS n FROM fray4.effect_outbox"),
      this.pool.query("SELECT count(*)::int AS n FROM fray4.effect_deeds"),
      this.pool.query("SELECT count(*)::int AS n FROM fray4.authorization_decisions"),
    ]);
    return { capabilities: capabilities.rows[0].n, outbox: outbox.rows[0].n,
      deeds: deeds.rows[0].n, decisions: decisions.rows[0].n };
  }
}
