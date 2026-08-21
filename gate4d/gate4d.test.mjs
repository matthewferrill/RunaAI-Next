import assert from "node:assert/strict";
import { test } from "node:test";

import { LEGACY_SETTINGS_VERSION, mapLegacySettingsRecord, MemoryGate4DSettingsTarget } from "./settings-migration.mjs";

const participant = "synthetic-primary-steward";
const record = value => ({ schemaVersion: LEGACY_SETTINGS_VERSION, values: { defaultIntelligenceLevel: value } });

test("Gate 4D maps the selected setting exactly and defaults every invalid shape safely", () => {
  for (const value of ["Low", "Medium", "High"]) {
    const mapped = mapLegacySettingsRecord(record(value));
    assert.equal(mapped.values.defaultIntelligenceLevel, value);
    assert.deepEqual(mapped.emittedKeys, ["defaultIntelligenceLevel"]);
  }
  for (const value of [null, {}, { schemaVersion: "wrong", values: { defaultIntelligenceLevel: "High" } },
    record("Turbo"), { schemaVersion: LEGACY_SETTINGS_VERSION, values: { apiKey: "FORBIDDEN_SECRET" } }]) {
    const mapped = mapLegacySettingsRecord(value);
    assert.equal(mapped.values.defaultIntelligenceLevel, "Medium");
    assert.doesNotMatch(JSON.stringify(mapped), /FORBIDDEN_SECRET|apiKey/);
  }
});

test("Gate 4D requires participant binding and keeps participants isolated", () => {
  const target = new MemoryGate4DSettingsTarget();
  assert.throws(() => target.import({ runId: "one", participantId: "", legacyRecord: record("High") }),
    error => error.code === "gate4d-binding-required");
  target.import({ runId: "one", participantId: participant, legacyRecord: record("High") });
  assert.equal(target.value(participant), "High");
  assert.equal(target.value("synthetic-other-steward"), "Medium");
});

test("Gate 4D replay is idempotent and changed input is refused", () => {
  const target = new MemoryGate4DSettingsTarget();
  const first = target.import({ runId: "replay", participantId: participant, legacyRecord: record("Low") });
  const replay = target.import({ runId: "replay", participantId: participant, legacyRecord: record("Low") });
  assert.equal(first.idempotentReplay, false);
  assert.equal(replay.idempotentReplay, true);
  assert.throws(() => target.import({ runId: "replay", participantId: participant, legacyRecord: record("High") }),
    error => error.code === "gate4d-run-conflict");
});

test("Gate 4D injected failure restores the exact prior target value", () => {
  const target = new MemoryGate4DSettingsTarget();
  target.seed(participant, "Low");
  assert.throws(() => target.import({ runId: "failure", participantId: participant,
    legacyRecord: record("High"), injectFailureAfterWrite: true }), error => error.code === "gate4d-injected-failure");
  assert.equal(target.value(participant), "Low");
});

test("Gate 4D rollback affects only its imported row", () => {
  const target = new MemoryGate4DSettingsTarget();
  target.seed(participant, "Low");
  target.seed("synthetic-other-steward", "High");
  target.import({ runId: "rollback", participantId: participant, legacyRecord: record("High") });
  const receipt = target.rollback({ runId: "rollback" });
  assert.equal(target.value(participant), "Low");
  assert.equal(target.value("synthetic-other-steward"), "High");
  assert.equal(receipt.rollbackScope, "gate4d-imported-setting-only");
});

test("Gate 4D receipts contain keyed identity only and no provider or credential surface", () => {
  const target = new MemoryGate4DSettingsTarget();
  const receipt = target.import({ runId: "receipt", participantId: participant,
    legacyRecord: { ...record("High"), endpoint: "http://secret", apiKey: "FORBIDDEN_SECRET", model: "legacy-model" } });
  const serialized = JSON.stringify(receipt);
  assert.match(receipt.participantRefHmac, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(serialized, /synthetic-primary-steward|FORBIDDEN_SECRET|http:\/\/secret|legacy-model/);
  assert.equal(receipt.credentialsImported, false);
  assert.equal(receipt.providerMetadataImported, false);
});
