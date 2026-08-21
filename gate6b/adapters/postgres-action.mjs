import pg from "pg";
import {
  actionIdempotencyKey, canonicalProposalFields, parseGate3Proposal, parseGate3Receipt,
  proposalDigest, receiptDigest, renderPreview, sha256, valueDigest,
} from "../../gate3/contracts.mjs";
import { PERSONAL_SCOPE } from "../application.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const lockKey = value => {
  const unsigned = BigInt(`0x${sha256(value).slice(0, 16)}`);
  return (unsigned > 0x7fffffffffffffffn ? unsigned - 0x10000000000000000n : unsigned).toString();
};

export class PostgresSelectedActionStore {
  constructor({ connectionString, pool = null, now = () => new Date(), proposalTtlMs = 30 * 60_000 } = {}) {
    this.pool = pool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 8_000 });
    this.ownsPool = !pool;
    this.now = now;
    this.proposalTtlMs = proposalTtlMs;
  }

  async initialize() {
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS runa_governance;
      CREATE TABLE IF NOT EXISTS runa_governance.proposals (
        proposal_id text PRIMARY KEY, request_id text NOT NULL UNIQUE, request_digest text NOT NULL,
        participant_id text NOT NULL, project_scope text NOT NULL, proposal_digest text NOT NULL,
        status text NOT NULL CHECK(status IN ('pending','executed','declined','expired','failed')),
        proposal_json jsonb NOT NULL, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runa_governance.receipts (
        receipt_id text PRIMARY KEY, proposal_id text NOT NULL UNIQUE REFERENCES runa_governance.proposals(proposal_id),
        participant_id text NOT NULL, project_scope text NOT NULL, idempotency_key text NOT NULL UNIQUE,
        capability_id text NOT NULL UNIQUE, receipt_digest text NOT NULL, receipt_json jsonb NOT NULL,
        executed_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runa_governance.capabilities (
        capability_id text PRIMARY KEY, proposal_id text NOT NULL UNIQUE REFERENCES runa_governance.proposals(proposal_id),
        participant_id text NOT NULL, action_kind text NOT NULL, argument_digest text NOT NULL,
        status text NOT NULL CHECK(status IN ('consumed')), issued_at timestamptz NOT NULL,
        consumed_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runa_governance.outbox (
        idempotency_key text PRIMARY KEY, receipt_id text NOT NULL UNIQUE,
        event_type text NOT NULL, payload_json jsonb NOT NULL,
        state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','done')),
        created_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
    `);
  }

  async propose(request) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await client.query("SELECT pg_advisory_xact_lock($1)", [lockKey(`proposal-request:${request.requestId}`)]);
      const digest = sha256(JSON.stringify(request));
      const prior = (await client.query(`SELECT request_digest,proposal_json,proposal_digest,status
        FROM runa_governance.proposals WHERE request_id=$1`, [request.requestId])).rows[0];
      if (prior) {
        if (prior.request_digest !== digest) throw coded("action-request-conflict", "The request id is bound to different action arguments.");
        await client.query("COMMIT");
        return this.#validatedProposal(prior);
      }
      await this.#assertProject(client, request.participant.principalId, request.project.projectId);
      const before = await this.#settingState(client, request.participant.principalId, true);
      if (request.rollbackOfReceiptId) await this.#validateRollback(client, request, before.value);
      if (before.value === request.action.value) throw coded("action-postcondition-already-satisfied", "The requested setting already has that value.");
      const created = this.now();
      const fields = canonicalProposalFields({ requestId: request.requestId,
        participantId: request.participant.principalId, projectId: request.project.projectId,
        origin: request.origin, action: request.action, beforeValue: before.value,
        beforeVersion: before.version,
        beforeSha256: valueDigest({ participantId: request.participant.principalId,
          projectId: request.project.projectId, settingKey: request.action.settingKey,
          value: before.value, stateVersion: before.version }),
        rollbackOfReceiptId: request.rollbackOfReceiptId });
      const proposal = {
        schemaVersion: "runa2-action-proposal/v1",
        proposalId: `g6bp-${sha256(JSON.stringify(fields)).slice(0, 35)}`,
        ...fields,
        preview: renderPreview({ projectId: fields.projectId, beforeValue: fields.beforeValue,
          afterValue: fields.action.value, rollbackOfReceiptId: fields.rollbackOfReceiptId }),
        proposalDigest: proposalDigest(fields), status: "pending", terminalReason: null,
        createdAt: created.toISOString(),
        expiresAt: new Date(created.getTime() + this.proposalTtlMs).toISOString(),
      };
      await client.query(`INSERT INTO runa_governance.proposals
        (proposal_id,request_id,request_digest,participant_id,project_scope,proposal_digest,status,
         proposal_json,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,'pending',$7::jsonb,$8,$9)`,
      [proposal.proposalId, proposal.requestId, digest, proposal.participantId, proposal.projectId,
        proposal.proposalDigest, JSON.stringify(proposal), proposal.createdAt, proposal.expiresAt]);
      await client.query("COMMIT");
      return proposal;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async approveAndExecute(request, { failBeforeEffect = false,
    failAfterEffectBeforeRecord = false } = {}) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await client.query("SELECT pg_advisory_xact_lock($1)", [lockKey(`proposal:${request.proposalId}`)]);
      const row = (await client.query(`SELECT proposal_json,proposal_digest,status
        FROM runa_governance.proposals WHERE proposal_id=$1 FOR UPDATE`, [request.proposalId])).rows[0];
      if (!row) throw coded("action-proposal-not-found", "The proposal does not exist.");
      const proposal = this.#validatedProposal(row);
      this.#proposalAuthority(proposal, request.participant.principalId, request.proposalDigest);
      const prior = (await client.query(`SELECT receipt_json,receipt_digest FROM runa_governance.receipts
        WHERE proposal_id=$1`, [proposal.proposalId])).rows[0];
      if (prior) {
        await client.query("COMMIT");
        return { ...this.#validatedReceipt(prior), replayed: true };
      }
      if (proposal.status !== "pending") throw coded("action-proposal-not-pending", `The proposal is ${proposal.status}.`);
      if (this.now().getTime() >= Date.parse(proposal.expiresAt)) {
        proposal.status = "expired";
        proposal.terminalReason = "expired-before-approval";
        await client.query(`UPDATE runa_governance.proposals SET status='expired',proposal_json=$2::jsonb
          WHERE proposal_id=$1`, [proposal.proposalId, JSON.stringify(proposal)]);
        await client.query("COMMIT");
        throw coded("action-proposal-expired", "The proposal expired before approval.");
      }
      const current = await this.#settingState(client, proposal.participantId, true);
      const currentDigest = valueDigest({ participantId: proposal.participantId, projectId: proposal.projectId,
        settingKey: proposal.action.settingKey, value: current.value, stateVersion: current.version });
      if (currentDigest !== proposal.beforeSha256) throw coded("action-stale-state", "The setting changed after preview; nothing was executed.");
      if (failBeforeEffect) throw coded("action-simulated-before-effect", "Simulated failure before the effect.");
      const afterRevision = current.revision + 1n;
      await client.query(`INSERT INTO runa_core.participant_settings
        (participant_id,setting_key,setting_value,revision,updated_at) VALUES($1,$2,$3,$4,clock_timestamp())
        ON CONFLICT(participant_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,
          revision=excluded.revision,updated_at=excluded.updated_at`,
      [proposal.participantId, proposal.action.settingKey, proposal.action.value, afterRevision.toString()]);
      if (failAfterEffectBeforeRecord) throw coded("action-simulated-atomic-rollback", "Simulated failure rolled the effect back before recording.");
      const executedAt = this.now().toISOString();
      const idempotencyKey = actionIdempotencyKey(proposal);
      const capabilityId = `g6bc-${sha256(proposal.proposalDigest).slice(0, 35)}`;
      await client.query(`INSERT INTO runa_governance.capabilities
        (capability_id,proposal_id,participant_id,action_kind,argument_digest,status,issued_at,consumed_at)
        VALUES($1,$2,$3,$4,$5,'consumed',$6,$6)`, [capabilityId, proposal.proposalId,
        proposal.participantId, proposal.action.kind, sha256(JSON.stringify(proposal.action)), executedAt]);
      const receipt = {
        schemaVersion: "runa2-action-receipt/v1",
        receiptId: `g6br-${idempotencyKey.slice(0, 35)}`,
        proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest,
        participantId: proposal.participantId, projectId: proposal.projectId, action: proposal.action,
        beforeValue: proposal.beforeValue, afterValue: proposal.action.value,
        beforeSha256: proposal.beforeSha256,
        afterSha256: valueDigest({ participantId: proposal.participantId, projectId: proposal.projectId,
          settingKey: proposal.action.settingKey, value: proposal.action.value,
          stateVersion: afterRevision.toString() }),
        capabilityId, idempotencyKey, rollbackOfReceiptId: proposal.rollbackOfReceiptId,
        executedAt, replayed: false,
        auditCodes: ["verified-steward", "gate5-authorized", "fresh-step-up-verified",
          "exact-preview-bound", "stale-state-checked", "one-time-capability-consumed",
          "one-deed-one-receipt"],
      };
      await client.query(`INSERT INTO runa_governance.receipts
        (receipt_id,proposal_id,participant_id,project_scope,idempotency_key,capability_id,
         receipt_digest,receipt_json,executed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [receipt.receiptId, receipt.proposalId, receipt.participantId, receipt.projectId,
        receipt.idempotencyKey, receipt.capabilityId, receiptDigest(receipt), JSON.stringify(receipt), receipt.executedAt]);
      await client.query(`INSERT INTO runa_governance.outbox
        (idempotency_key,receipt_id,event_type,payload_json)
        VALUES($1,$2,'participant-setting.changed',$3::jsonb)`, [receipt.idempotencyKey,
        receipt.receiptId, JSON.stringify({ receiptId: receipt.receiptId,
          participantRef: sha256(receipt.participantId), settingKey: receipt.action.settingKey,
          beforeValue: receipt.beforeValue, afterValue: receipt.afterValue })]);
      proposal.status = "executed";
      await client.query(`UPDATE runa_governance.proposals SET status='executed',proposal_json=$2::jsonb
        WHERE proposal_id=$1`, [proposal.proposalId, JSON.stringify(proposal)]);
      await client.query("COMMIT");
      return receipt;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async decline(request) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = (await client.query(`SELECT proposal_json,proposal_digest,status
        FROM runa_governance.proposals WHERE proposal_id=$1 FOR UPDATE`, [request.proposalId])).rows[0];
      if (!row) throw coded("action-proposal-not-found", "The proposal does not exist.");
      const proposal = this.#validatedProposal(row);
      this.#proposalAuthority(proposal, request.participant.principalId, request.proposalDigest);
      if (proposal.status !== "pending") throw coded("action-proposal-not-pending", `The proposal is ${proposal.status}.`);
      proposal.status = "declined";
      proposal.terminalReason = request.reason;
      await client.query(`UPDATE runa_governance.proposals SET status='declined',proposal_json=$2::jsonb
        WHERE proposal_id=$1`, [proposal.proposalId, JSON.stringify(proposal)]);
      await client.query("COMMIT");
      return proposal;
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  }

  async readReceipt(participantId, receiptId) {
    const row = (await this.pool.query(`SELECT receipt_json,receipt_digest FROM runa_governance.receipts
      WHERE receipt_id=$1 AND participant_id=$2`, [receiptId, participantId])).rows[0];
    if (!row) throw coded("action-receipt-not-found", "The receipt does not exist.");
    return { ...this.#validatedReceipt(row), replayed: false };
  }

  async auditState() {
    return (await this.pool.query(`SELECT
      (SELECT count(*)::int FROM runa_governance.proposals) proposals,
      (SELECT count(*)::int FROM runa_governance.receipts) receipts,
      (SELECT count(*)::int FROM runa_governance.capabilities) capabilities,
      (SELECT count(*)::int FROM runa_governance.outbox) outbox,
      (SELECT count(*)::int FROM runa_core.participant_settings) settings`)).rows[0];
  }

  async #assertProject(client, participantId, projectId) {
    if (projectId === PERSONAL_SCOPE) return;
    const row = (await client.query(`SELECT status FROM runa_core.projects
      WHERE participant_id=$1 AND project_id=$2`, [participantId, projectId])).rows[0];
    if (!row || row.status !== "managed") throw coded("action-project-not-authorized", "The project is outside this steward scope.");
  }

  async #settingState(client, participantId, forUpdate = false) {
    const row = (await client.query(`SELECT setting_value,revision FROM runa_core.participant_settings
      WHERE participant_id=$1 AND setting_key='defaultIntelligenceLevel' ${forUpdate ? "FOR UPDATE" : ""}`,
    [participantId])).rows[0];
    return row ? { value: row.setting_value, revision: BigInt(row.revision), version: String(row.revision) }
      : { value: "Medium", revision: 0n, version: "absent" };
  }

  async #validateRollback(client, request, currentValue) {
    const row = (await client.query(`SELECT receipt_json FROM runa_governance.receipts
      WHERE receipt_id=$1`, [request.rollbackOfReceiptId])).rows[0];
    const receipt = row?.receipt_json;
    if (!receipt || receipt.participantId !== request.participant.principalId
        || receipt.projectId !== request.project.projectId) {
      throw coded("action-rollback-receipt-invalid", "Rollback must name a receipt in the same scope.");
    }
    if (currentValue !== receipt.afterValue || request.action.value !== receipt.beforeValue) {
      throw coded("action-rollback-state-invalid", "Rollback no longer matches the recorded before and after state.");
    }
  }

  #validatedProposal(row) {
    const proposal = parseGate3Proposal(row.proposal_json);
    if (proposalDigest(proposal) !== row.proposal_digest || proposal.proposalDigest !== row.proposal_digest
        || proposal.status !== row.status) throw coded("action-proposal-tampered", "The stored proposal failed validation.");
    return proposal;
  }

  #validatedReceipt(row) {
    const receipt = parseGate3Receipt(row.receipt_json);
    if (receiptDigest(receipt) !== row.receipt_digest) throw coded("action-receipt-tampered", "The stored receipt failed validation.");
    return receipt;
  }

  #proposalAuthority(proposal, participantId, digest) {
    if (proposal.participantId !== participantId) throw coded("action-not-authorized", "The proposal belongs to another steward.");
    if (proposal.proposalDigest !== digest) throw coded("action-proposal-digest-mismatch", "Approval does not match the exact preview.");
  }

  async close() { if (this.ownsPool) await this.pool.end(); }
}
