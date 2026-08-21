import pg from "pg";
import {
  actionIdempotencyKey, canonicalProposalFields, parseGate3Proposal, parseGate3Receipt,
  proposalDigest, receiptDigest, renderPreview, sha256, valueDigest,
} from "../contracts.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const allowedValues = new Set(["Low", "Medium", "High"]);
const lockKey = value => {
  const unsigned = BigInt(`0x${sha256(value).slice(0, 16)}`);
  return (unsigned > 0x7fffffffffffffffn ? unsigned - 0x10000000000000000n : unsigned).toString();
};

export class PostgresGovernedActionStore {
  constructor({ connectionString, pool = null, now = () => new Date(), proposalTtlMs = 30 * 60_000 } = {}) {
    this.pool = pool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000, query_timeout: 5_000 });
    this.ownsPool = !pool;
    this.now = now;
    this.proposalTtlMs = proposalTtlMs;
  }

  async initialize({ reset = false } = {}) {
    if (reset) await this.pool.query("DROP SCHEMA IF EXISTS gate3 CASCADE");
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS gate3;
      CREATE TABLE IF NOT EXISTS gate3.proposals (
        proposal_id text PRIMARY KEY, request_id text NOT NULL UNIQUE, request_sha256 text NOT NULL,
        participant_id text NOT NULL, project_id text NOT NULL, proposal_digest text NOT NULL,
        status text NOT NULL CHECK (status IN ('pending','executed','declined','expired','failed')),
        proposal_json jsonb NOT NULL, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS gate3.capabilities (
        capability_id text PRIMARY KEY, proposal_id text NOT NULL UNIQUE REFERENCES gate3.proposals(proposal_id),
        proposal_digest text NOT NULL, approver_id text NOT NULL, approval_id text NOT NULL,
        expires_at timestamptz NOT NULL, consumed_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS gate3.receipts (
        receipt_id text PRIMARY KEY, proposal_id text NOT NULL UNIQUE REFERENCES gate3.proposals(proposal_id),
        participant_id text NOT NULL, project_id text NOT NULL, idempotency_key text NOT NULL UNIQUE,
        receipt_sha256 text NOT NULL, receipt_json jsonb NOT NULL, executed_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS gate3.outbox (
        outbox_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        idempotency_key text NOT NULL UNIQUE, event_type text NOT NULL, receipt_id text NOT NULL UNIQUE,
        payload_json jsonb NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','done')),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS gate3.attempts (
        attempt_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        proposal_id text NOT NULL REFERENCES gate3.proposals(proposal_id),
        participant_id text NOT NULL, outcome_code text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  async propose(request) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await client.query("SELECT pg_advisory_xact_lock($1)", [lockKey(`request:${request.requestId}`)]);
      const requestSha = sha256(JSON.stringify(request));
      const existing = (await client.query("SELECT request_sha256,proposal_digest,status,proposal_json FROM gate3.proposals WHERE request_id=$1", [request.requestId])).rows[0];
      if (existing) {
        if (existing.request_sha256 !== requestSha) throw coded("action-request-conflict", "The request id is already bound to different action arguments.");
        await client.query("COMMIT");
        return this.#validatedProposal(existing);
      }
      const owner = (await client.query("SELECT participant_id,status FROM gate2.projects WHERE project_id=$1 FOR SHARE", [request.project.projectId])).rows[0];
      if (!owner || owner.status !== "managed" || owner.participant_id !== request.participant.principalId) {
        throw coded("action-project-not-authorized", "The project is outside this steward scope.");
      }
      await client.query("SELECT pg_advisory_xact_lock($1)", [lockKey(`setting:${request.participant.principalId}`)]);
      const beforeState = await this.#settingState(client, request.participant.principalId);
      const beforeValue = beforeState.value;
      if (request.rollbackOfReceiptId) await this.#validateRollback(client, request, beforeValue);
      if (beforeValue === request.action.value) throw coded("action-postcondition-already-satisfied", "The requested setting already has that value.");
      const created = this.now();
      const beforeVersion = beforeState.version;
      const beforeSha256 = valueDigest({ participantId: request.participant.principalId,
        projectId: request.project.projectId, settingKey: request.action.settingKey, value: beforeValue,
        stateVersion: beforeVersion });
      const fields = canonicalProposalFields({ requestId: request.requestId,
        participantId: request.participant.principalId, projectId: request.project.projectId,
        origin: request.origin, action: request.action, beforeValue, beforeVersion, beforeSha256,
        rollbackOfReceiptId: request.rollbackOfReceiptId });
      const proposal = {
        schemaVersion: "runa2-action-proposal/v1",
        proposalId: `g3p-${sha256(JSON.stringify(fields)).slice(0, 36)}`,
        ...fields,
        preview: renderPreview({ projectId: fields.projectId, beforeValue,
          afterValue: request.action.value, rollbackOfReceiptId: request.rollbackOfReceiptId }),
        proposalDigest: proposalDigest(fields), status: "pending", terminalReason: null, createdAt: created.toISOString(),
        expiresAt: new Date(created.getTime() + this.proposalTtlMs).toISOString(),
      };
      await client.query(`INSERT INTO gate3.proposals(proposal_id,request_id,request_sha256,participant_id,
        project_id,proposal_digest,status,proposal_json,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,'pending',$7::jsonb,$8,$9)`, [proposal.proposalId, proposal.requestId,
        requestSha, proposal.participantId, proposal.projectId, proposal.proposalDigest,
        JSON.stringify(proposal), proposal.createdAt, proposal.expiresAt]);
      await client.query("COMMIT");
      return proposal;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async approveAndExecute(request, { failBeforeEffect = false, failAfterEffectBeforeRecord = false } = {}) {
    const client = await this.pool.connect();
    let committed = false;
    let failureContext = null;
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await client.query("SELECT pg_advisory_xact_lock($1)", [lockKey(`proposal:${request.proposalId}`)]);
      const row = (await client.query("SELECT proposal_json,proposal_digest,status FROM gate3.proposals WHERE proposal_id=$1 FOR UPDATE", [request.proposalId])).rows[0];
      if (!row) throw coded("action-proposal-not-found", "The proposal does not exist.");
      const proposal = this.#validatedProposal(row);
      this.#proposalAuthority(proposal, request.participant.principalId, request.proposalDigest);
      const prior = (await client.query("SELECT receipt_json,receipt_sha256 FROM gate3.receipts WHERE proposal_id=$1", [proposal.proposalId])).rows[0];
      if (prior) {
        await client.query("COMMIT"); committed = true;
        return { ...this.#validatedReceipt(prior), replayed: true };
      }
      if (row.status !== "pending") throw coded("action-proposal-not-pending", `The proposal is ${row.status}.`);
      failureContext = { proposalId: proposal.proposalId, participantId: proposal.participantId };
      if (this.now().getTime() >= new Date(proposal.expiresAt).getTime()) {
        proposal.status = "expired";
        proposal.terminalReason = "expired-before-approval";
        await client.query("UPDATE gate3.proposals SET status='expired',proposal_json=$2::jsonb WHERE proposal_id=$1",
          [proposal.proposalId, JSON.stringify(proposal)]);
        await client.query("COMMIT"); committed = true;
        throw coded("action-proposal-expired", "The proposal expired before approval.");
      }
      await client.query("SELECT pg_advisory_xact_lock($1)", [lockKey(`setting:${proposal.participantId}`)]);
      const currentState = await this.#settingState(client, proposal.participantId, true);
      const current = currentState.value;
      const currentDigest = valueDigest({ participantId: proposal.participantId, projectId: proposal.projectId,
        settingKey: proposal.action.settingKey, value: current, stateVersion: currentState.version });
      if (currentDigest !== proposal.beforeSha256) throw coded("action-stale-state", "The setting changed after preview; nothing was executed.");
      if (failBeforeEffect) throw coded("action-simulated-before-effect", "Simulated failure before the effect.");
      const afterRow = (await client.query(`INSERT INTO gate2.settings(participant_id,setting_key,setting_value)
        VALUES($1,$2,$3) ON CONFLICT(participant_id,setting_key) DO UPDATE
        SET setting_value=excluded.setting_value,updated_at=clock_timestamp()
        RETURNING setting_value,updated_at`,
      [proposal.participantId, proposal.action.settingKey, proposal.action.value])).rows[0];
      const afterVersion = new Date(afterRow.updated_at).toISOString();
      if (failAfterEffectBeforeRecord) throw coded("action-simulated-atomic-rollback", "Simulated failure rolled the effect back before recording.");
      const executedAt = this.now().toISOString();
      const idempotencyKey = actionIdempotencyKey(proposal);
      const capabilityId = `g3c-${sha256(proposal.proposalDigest).slice(0, 36)}`;
      const receipt = {
        schemaVersion: "runa2-action-receipt/v1", receiptId: `g3r-${idempotencyKey.slice(0, 36)}`,
        proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest,
        participantId: proposal.participantId, projectId: proposal.projectId, action: proposal.action,
        beforeValue: proposal.beforeValue, afterValue: proposal.action.value,
        beforeSha256: proposal.beforeSha256,
        afterSha256: valueDigest({ participantId: proposal.participantId, projectId: proposal.projectId,
          settingKey: proposal.action.settingKey, value: proposal.action.value, stateVersion: afterVersion }),
        capabilityId, idempotencyKey, rollbackOfReceiptId: proposal.rollbackOfReceiptId,
        executedAt, replayed: false,
        auditCodes: ["verified-steward", "exact-preview-bound", "stale-state-checked",
          "one-time-capability-consumed", "one-deed-one-receipt"],
      };
      await client.query(`INSERT INTO gate3.capabilities(capability_id,proposal_id,proposal_digest,
        approver_id,approval_id,expires_at,consumed_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [capabilityId, proposal.proposalId, proposal.proposalDigest, request.participant.principalId,
        request.approvalId, proposal.expiresAt, executedAt]);
      await client.query(`INSERT INTO gate3.receipts(receipt_id,proposal_id,participant_id,project_id,
        idempotency_key,receipt_sha256,receipt_json,executed_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [receipt.receiptId, proposal.proposalId, proposal.participantId, proposal.projectId,
        idempotencyKey, receiptDigest(receipt), JSON.stringify(receipt), executedAt]);
      await client.query(`INSERT INTO gate3.outbox(idempotency_key,event_type,receipt_id,payload_json)
        VALUES($1,'participant-setting.changed',$2,$3::jsonb)`,
      [idempotencyKey, receipt.receiptId, JSON.stringify({ receiptId: receipt.receiptId,
        participantId: receipt.participantId, projectId: receipt.projectId,
        settingKey: receipt.action.settingKey, beforeValue: receipt.beforeValue, afterValue: receipt.afterValue })]);
      proposal.status = "executed";
      proposal.terminalReason = null;
      await client.query("UPDATE gate3.proposals SET status='executed',proposal_json=$2::jsonb WHERE proposal_id=$1",
        [proposal.proposalId, JSON.stringify(proposal)]);
      await client.query("COMMIT"); committed = true;
      return receipt;
    } catch (error) {
      if (!committed) {
        await client.query("ROLLBACK").catch(() => {});
        if (failureContext && ["action-stale-state", "action-simulated-before-effect",
          "action-simulated-atomic-rollback"].includes(error?.code)) {
          await this.#recordFailure(failureContext, error.code).catch(() => {});
        }
      }
      throw error;
    } finally { client.release(); }
  }

  async decline(request) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = (await client.query("SELECT proposal_json,proposal_digest,status FROM gate3.proposals WHERE proposal_id=$1 FOR UPDATE", [request.proposalId])).rows[0];
      if (!row) throw coded("action-proposal-not-found", "The proposal does not exist.");
      const proposal = this.#validatedProposal(row);
      this.#proposalAuthority(proposal, request.participant.principalId, request.proposalDigest);
      if (row.status !== "pending") throw coded("action-proposal-not-pending", `The proposal is ${row.status}.`);
      proposal.status = "declined";
      proposal.terminalReason = request.reason;
      await client.query("UPDATE gate3.proposals SET status='declined',proposal_json=$2::jsonb WHERE proposal_id=$1",
        [proposal.proposalId, JSON.stringify(proposal)]);
      await client.query("COMMIT");
      return proposal;
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  }

  async readReceipt(participantId, receiptId) {
    const row = (await this.pool.query("SELECT receipt_json,receipt_sha256 FROM gate3.receipts WHERE receipt_id=$1 AND participant_id=$2",
      [receiptId, participantId])).rows[0];
    if (!row) throw coded("action-receipt-not-found", "The receipt does not exist.");
    return { ...this.#validatedReceipt(row), replayed: false };
  }

  async auditState() {
    return (await this.pool.query(`SELECT
      (SELECT count(*)::int FROM gate3.proposals) proposals,
      (SELECT count(*)::int FROM gate3.receipts) receipts,
      (SELECT count(*)::int FROM gate3.capabilities) capabilities,
      (SELECT count(*)::int FROM gate3.outbox) outbox,
      (SELECT count(*)::int FROM gate3.outbox WHERE state='pending') outbox_pending,
      (SELECT count(*)::int FROM gate3.attempts) failed_attempts`)).rows[0];
  }

  async close() { if (this.ownsPool) await this.pool.end(); }

  async #recordFailure({ proposalId, participantId }, code) {
    await this.pool.query(`WITH changed AS (
      UPDATE gate3.proposals SET status='failed',
        proposal_json=jsonb_set(jsonb_set(proposal_json,'{status}',to_jsonb('failed'::text)),
          '{terminalReason}',to_jsonb($3::text))
      WHERE proposal_id=$1 AND participant_id=$2 AND status='pending' RETURNING proposal_id
    ) INSERT INTO gate3.attempts(proposal_id,participant_id,outcome_code)
      SELECT proposal_id,$2,$3 FROM changed`, [proposalId, participantId, code]);
  }

  #validatedProposal(row) {
    const proposal = parseGate3Proposal(row.proposal_json);
    if (proposal.proposalDigest !== proposalDigest(proposal) ||
      proposal.proposalDigest !== row.proposal_digest || proposal.status !== row.status) {
      throw coded("action-proposal-tampered", "The stored proposal failed its digest or lifecycle check.");
    }
    return proposal;
  }

  #validatedReceipt(row) {
    const receipt = parseGate3Receipt(row.receipt_json);
    if (receiptDigest(receipt) !== row.receipt_sha256) {
      throw coded("action-receipt-tampered", "The stored receipt failed its digest check.");
    }
    return receipt;
  }

  async #settingState(client, participantId, forUpdate = false) {
    const row = (await client.query(`SELECT setting_value,updated_at FROM gate2.settings
      WHERE participant_id=$1 AND setting_key='defaultIntelligenceLevel' ${forUpdate ? "FOR UPDATE" : ""}`,
    [participantId])).rows[0];
    return allowedValues.has(row?.setting_value)
      ? { value: row.setting_value, version: new Date(row.updated_at).toISOString() }
      : { value: "Medium", version: "absent" };
  }

  async #validateRollback(client, request, current) {
    const row = (await client.query("SELECT receipt_json FROM gate3.receipts WHERE receipt_id=$1", [request.rollbackOfReceiptId])).rows[0];
    const receipt = row?.receipt_json;
    if (!receipt || receipt.participantId !== request.participant.principalId || receipt.projectId !== request.project.projectId) {
      throw coded("action-rollback-receipt-invalid", "Rollback must name a receipt in the same steward and project scope.");
    }
    if (current !== receipt.afterValue || request.action.value !== receipt.beforeValue) {
      throw coded("action-rollback-state-invalid", "Rollback no longer matches the recorded before and after state.");
    }
  }

  #proposalAuthority(proposal, participantId, digest) {
    if (proposal.participantId !== participantId) throw coded("action-not-authorized", "The proposal belongs to another steward.");
    if (proposal.proposalDigest !== digest) throw coded("action-proposal-digest-mismatch", "Approval does not match the exact preview.");
  }
}
