import { safeRetrieveApprovedKnowledge } from "./projection.mjs";

const deliveries = new WeakSet();
const zeroScope = Object.freeze({ consideredCount: 0, eligibleCount: 0, excludedCount: 0,
  excludedByReason: Object.freeze({}) });

function keyedReferences(value) {
  return Object.freeze((value ?? []).map(item => Object.freeze({
    approvalRefHmac: item.approvalRefHmac,
    eventRefHmac: item.eventRefHmac,
    eventIntegrityHmac: item.eventIntegrityHmac,
  })));
}

function makeDelivery({ result, libraryCount, delivered, reason, degraded = false, errorCode = null }) {
  const delivery = Object.freeze({
    providerContext: delivered ? result.context : null,
    receipt: Object.freeze({
      schemaVersion: "runa2-approved-knowledge-delivery-receipt/v1",
      availableLibraryCount: libraryCount,
      selectedCount: delivered ? result.selectedCount : 0,
      delivered,
      reason,
      scopeFiltering: result.scopeFiltering ?? zeroScope,
      references: delivered ? keyedReferences(result.references) : Object.freeze([]),
      degraded,
      errorCode,
      deliveryProvesCompliance: false,
    }),
  });
  deliveries.add(delivery);
  return delivery;
}

export class SyntheticApprovedKnowledgeAdapter {
  constructor({ projection, currentManifestHmac, cipher, now = () => new Date() }) {
    this.projection = projection;
    this.currentManifestHmac = currentManifestHmac;
    this.cipher = cipher;
    this.now = now;
  }

  async select({ requestScope, task }) {
    const libraryCount = Number.isInteger(this.projection?.activeLessonCount)
      ? this.projection.activeLessonCount : 0;
    if (this.projection?.sourceClassification !== "synthetic-fixture") {
      return makeDelivery({ result: {}, libraryCount: 0, delivered: false,
        reason: "synthetic-source-required", degraded: true,
        errorCode: "approved-knowledge-source-not-synthetic" });
    }
    const result = safeRetrieveApprovedKnowledge({ projection: this.projection,
      currentManifestHmac: this.currentManifestHmac, requestScope, task,
      cipher: this.cipher, now: this.now() });
    if (result.errorCode) return makeDelivery({ result, libraryCount, delivered: false,
      reason: "approved-knowledge-unavailable", degraded: true, errorCode: result.errorCode });
    const delivered = result.selected === true && result.context !== null;
    return makeDelivery({ result, libraryCount, delivered,
      reason: result.reason ?? (delivered ? "relevant-approved-knowledge" : "no-relevant-approved-knowledge") });
  }
}

export function providerAdvisoryFromDelivery(delivery) {
  return deliveries.has(delivery) ? delivery.providerContext : null;
}

export function approvedKnowledgeReceipt(delivery, fallbackReason = "adapter-disabled", { delivered = null } = {}) {
  if (delivery === null || delivery === undefined) return {
    schemaVersion: "runa2-approved-knowledge-delivery-receipt/v1",
    availableLibraryCount: 0, selectedCount: 0, delivered: false, reason: fallbackReason,
    scopeFiltering: zeroScope, references: [], degraded: false, errorCode: null,
    deliveryProvesCompliance: false,
  };
  if (!deliveries.has(delivery)) return {
    schemaVersion: "runa2-approved-knowledge-delivery-receipt/v1",
    availableLibraryCount: 0, selectedCount: 0, delivered: false,
    reason: "approved-knowledge-unavailable", scopeFiltering: zeroScope, references: [],
    degraded: true, errorCode: "approved-knowledge-delivery-invalid",
    deliveryProvesCompliance: false,
  };
  const receipt = structuredClone(delivery.receipt);
  if (delivered === false && receipt.delivered) {
    receipt.delivered = false;
    receipt.reason = "selected-but-not-delivered";
  }
  return receipt;
}
