import { createHash, randomUUID } from "node:crypto";

export const GATE5_CAPABILITY_VERSION = "runa2-gate5-capability/v1";
const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const coded = (code, message) => Object.assign(new Error(message), { code });

function canonical(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  throw coded("capability-arguments-invalid", "Capability arguments must be JSON values.");
}

export const capabilityArgumentHash = value => sha256(canonical(value));
const clone = value => structuredClone(value);

export class MemoryCapabilityStore {
  constructor() {
    this.rows = new Map();
    this.receipts = new Map();
  }

  issue(row) {
    const existing = this.rows.get(row.requestId);
    if (existing) {
      if (existing.intentDigest !== row.intentDigest) throw coded("capability-request-changed", "A capability request id cannot be reused for changed intent.");
      return clone(existing);
    }
    this.rows.set(row.requestId, clone(row));
    return clone(row);
  }

  revoke(capabilityId, revokedAt) {
    const row = [...this.rows.values()].find(value => value.capabilityId === capabilityId);
    if (!row || row.status !== "pending") return false;
    row.status = "revoked";
    row.revokedAt = revokedAt;
    return true;
  }

  reserve({ capabilityId, actorId, action, resource, argumentHash, now }) {
    const row = [...this.rows.values()].find(value => value.capabilityId === capabilityId);
    if (!row) return { outcome: "denied", reason: "capability-unknown" };
    const receipt = this.receipts.get(row.idempotencyKey);
    if (row.status === "consumed" && receipt) return { outcome: "replayed", reason: "capability-consumed", row: clone(row), receipt: clone(receipt) };
    if (row.status === "reserved") return { outcome: "in-progress", reason: "capability-already-reserved", row: clone(row) };
    if (row.status === "revoked") return { outcome: "denied", reason: "capability-revoked" };
    if (row.status === "expired" || Date.parse(row.expiresAt) <= Date.parse(now)) {
      row.status = "expired";
      return { outcome: "denied", reason: "capability-expired" };
    }
    if (row.actorId !== actorId) return { outcome: "denied", reason: "capability-actor-mismatch" };
    if (row.action !== action) return { outcome: "denied", reason: "capability-action-mismatch" };
    if (row.resource !== resource) return { outcome: "denied", reason: "capability-resource-mismatch" };
    if (row.argumentHash !== argumentHash) return { outcome: "denied", reason: "capability-argument-mismatch" };
    row.status = "reserved";
    row.reservedAt = now;
    return { outcome: "reserved", reason: "capability-reserved", row: clone(row) };
  }

  commit(capabilityId, receipt) {
    const row = [...this.rows.values()].find(value => value.capabilityId === capabilityId);
    if (!row || row.status !== "reserved") throw coded("capability-not-reserved", "Only a reserved capability can be committed.");
    row.status = "consumed";
    row.consumedAt = receipt.executedAt;
    this.receipts.set(row.idempotencyKey, clone(receipt));
    return clone(receipt);
  }

  release(capabilityId) {
    const row = [...this.rows.values()].find(value => value.capabilityId === capabilityId);
    if (row?.status === "reserved") {
      row.status = "pending";
      delete row.reservedAt;
    }
  }
}

export class OneTimeCapabilityService {
  constructor({ store, authorize, now = () => new Date(), ttlMs = 2 * 60 * 1000, ids = randomUUID }) {
    this.store = store;
    this.authorize = authorize;
    this.now = now;
    this.ttlMs = ttlMs;
    this.ids = ids;
  }

  async issue({ requestId, participant, action, resource, arguments: args, approvalId, approvalDigest }) {
    if (!participant?.verified) throw coded("capability-identity-required", "Verified identity is required.");
    if (!requestId || !approvalId || !/^[a-f0-9]{64}$/.test(approvalDigest ?? "")) throw coded("capability-approval-invalid", "An exact approval record is required.");
    const decision = await this.authorize({ participant, action, resource });
    if (!decision?.allowed) throw coded(decision?.reason ?? "capability-authorization-denied", "Capability issuance was denied.");
    const issuedAt = this.now();
    const argumentHash = capabilityArgumentHash(args);
    const intentDigest = sha256(canonical({ participantId: participant.principalId, action, resource, argumentHash, approvalId, approvalDigest }));
    return this.store.issue({
      schemaVersion: GATE5_CAPABILITY_VERSION,
      requestId,
      capabilityId: this.ids(),
      actorId: participant.principalId,
      action,
      resource,
      argumentHash,
      approvalId,
      approvalDigest,
      policyReason: decision.reason,
      intentDigest,
      idempotencyKey: sha256(`gate5\0${requestId}\0${intentDigest}`),
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + this.ttlMs).toISOString(),
      status: "pending",
      revokedAt: null,
      reservedAt: null,
      consumedAt: null,
    });
  }

  revoke(capabilityId) { return this.store.revoke(capabilityId, this.now().toISOString()); }

  async execute({ capabilityId, participant, action, resource, arguments: args, effect }) {
    if (!participant?.verified) throw coded("capability-identity-required", "Verified identity is required.");
    const decision = await this.authorize({ participant, action, resource });
    if (!decision?.allowed) throw coded(decision?.reason ?? "capability-authorization-denied", "Capability execution was denied.");
    const reservation = this.store.reserve({
      capabilityId,
      actorId: participant.principalId,
      action,
      resource,
      argumentHash: capabilityArgumentHash(args),
      now: this.now().toISOString(),
    });
    if (reservation.outcome === "replayed") return Object.freeze({ ...reservation.receipt, replayed: true });
    if (reservation.outcome !== "reserved") throw coded(reservation.reason, "Capability execution was denied.");
    try {
      const deed = await effect({ idempotencyKey: reservation.row.idempotencyKey, arguments: clone(args) });
      const executedAt = this.now().toISOString();
      return Object.freeze(this.store.commit(capabilityId, {
        schemaVersion: "runa2-gate5-capability-receipt/v1",
        receiptId: this.ids(),
        capabilityId,
        idempotencyKey: reservation.row.idempotencyKey,
        actorRef: sha256(`actor\0${participant.principalId}`),
        action,
        resourceRef: sha256(`resource\0${resource}`),
        deedDigest: sha256(canonical(deed)),
        executedAt,
        replayed: false,
      }));
    } catch (error) {
      this.store.release(capabilityId);
      throw error;
    }
  }
}

