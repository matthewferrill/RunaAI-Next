import { createHmac } from "node:crypto";

export const LEGACY_SETTINGS_VERSION = "runa-settings-store/v1";
export const GATE4D_SETTINGS_VERSION = "runa2-gate4d-setting-import/v1";
const allowed = new Set(["Low", "Medium", "High"]);
const safeDefault = "Medium";
const coded = (code, message) => Object.assign(new Error(message), { code });
const safeId = (value, label) => {
  if (typeof value !== "string" || !value.trim() || value.length > 160) throw coded("gate4d-binding-required", `${label} is required.`);
  return value.trim();
};

export function mapLegacySettingsRecord(raw) {
  const candidate = raw?.schemaVersion === LEGACY_SETTINGS_VERSION
    ? raw?.values?.defaultIntelligenceLevel : undefined;
  const accepted = allowed.has(candidate);
  return Object.freeze({ schemaVersion: GATE4D_SETTINGS_VERSION,
    values: Object.freeze({ defaultIntelligenceLevel: accepted ? candidate : safeDefault }),
    sourceValueAccepted: accepted,
    defaultApplied: !accepted,
    emittedKeys: Object.freeze(["defaultIntelligenceLevel"]),
  });
}

export class MemoryGate4DSettingsTarget {
  constructor({ hmacKey = "synthetic-gate4d-hmac-key" } = {}) {
    if (typeof hmacKey !== "string" || hmacKey.length < 16) throw coded("gate4d-hmac-key-invalid", "A synthetic keyed-reference key is required.");
    this.hmacKey = hmacKey;
    this.values = new Map();
    this.runs = new Map();
  }

  #hmac(type, value) {
    return createHmac("sha256", this.hmacKey).update(`${type}\u0000${value}`).digest("hex");
  }

  seed(participantId, value) {
    const participant = safeId(participantId, "participantId");
    if (!allowed.has(value)) throw coded("gate4d-setting-invalid", "The seed value is invalid.");
    this.values.set(participant, value);
  }

  value(participantId) {
    return this.values.get(safeId(participantId, "participantId")) ?? safeDefault;
  }

  import({ runId, participantId, legacyRecord, injectFailureAfterWrite = false }) {
    const run = safeId(runId, "runId");
    const participant = safeId(participantId, "participantId");
    const mapped = mapLegacySettingsRecord(legacyRecord);
    const inputHmac = this.#hmac("input", JSON.stringify({ participant, mapped }));
    const existing = this.runs.get(run);
    if (existing) {
      if (existing.inputHmac !== inputHmac) throw coded("gate4d-run-conflict", "The run id was already used for different input.");
      return this.#receipt(existing, true);
    }
    const priorExplicit = this.values.has(participant);
    const priorValue = this.value(participant);
    this.values.set(participant, mapped.values.defaultIntelligenceLevel);
    if (injectFailureAfterWrite) {
      if (priorExplicit) this.values.set(participant, priorValue); else this.values.delete(participant);
      throw coded("gate4d-injected-failure", "The synthetic failure restored the prior target value.");
    }
    const state = { run, participant, participantRefHmac: this.#hmac("participant", participant), inputHmac,
      importedValue: mapped.values.defaultIntelligenceLevel, sourceValueAccepted: mapped.sourceValueAccepted,
      defaultApplied: mapped.defaultApplied, priorExplicit, priorValue, rolledBack: false };
    this.runs.set(run, state);
    return this.#receipt(state, false);
  }

  rollback({ runId }) {
    const run = safeId(runId, "runId");
    const state = this.runs.get(run);
    if (!state) throw coded("gate4d-run-not-found", "The Gate 4D import run was not found.");
    if (!state.rolledBack) {
      if (state.priorExplicit) this.values.set(state.participant, state.priorValue);
      else this.values.delete(state.participant);
      state.rolledBack = true;
    }
    return Object.freeze({ schemaVersion: "runa2-gate4d-rollback-receipt/v1",
      participantRefHmac: state.participantRefHmac, rolledBack: true,
      rollbackScope: "gate4d-imported-setting-only", protectedStoresOpened: false });
  }

  #receipt(state, idempotentReplay) {
    return Object.freeze({ schemaVersion: "runa2-gate4d-import-receipt/v1",
      participantRefHmac: state.participantRefHmac, selectedValue: state.importedValue,
      sourceValueAccepted: state.sourceValueAccepted, defaultApplied: state.defaultApplied,
      idempotentReplay, rolledBack: state.rolledBack, importedKeyCount: 1,
      credentialsImported: false, providerMetadataImported: false, protectedStoresOpened: false });
  }
}
