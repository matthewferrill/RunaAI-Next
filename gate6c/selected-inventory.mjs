import { createHmac } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { canonicalJson } from "../gate4/canonical.mjs";
import { mapLegacySettingsRecord } from "../gate4d/settings-migration.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const expectedKinds = new Set(["file-write", "verification-command", "git-commit", "git-push"]);

function hmac(key, value) {
  if (!Buffer.isBuffer(key) || key.length < 32) throw coded("gate6c-reconciliation-key-invalid", "A memory-only reconciliation key is required.");
  return createHmac("sha256", key).update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

function readJson(path, code) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw coded(code, "A selected legacy record is unreadable or invalid."); }
}

function filesUnder(root) {
  if (!existsSync(root)) return [];
  const pending = [root], files = [];
  while (pending.length) {
    const current = pending.pop();
    for (const name of readdirSync(current)) {
      const path = join(current, name); const info = statSync(path);
      if (info.isDirectory()) pending.push(path);
      else if (info.isFile()) files.push(path);
      else throw coded("gate6c-selected-root-unsafe", "A selected legacy root contains an unsupported filesystem object.");
    }
  }
  return files.sort();
}

function treeDigest(root, key) {
  return hmac(key, filesUnder(root).map(path => ({ locator: hmac(key, relative(root, path).replace(/\\/g, "/")),
    bytes: hmac(key, readFileSync(path)) })));
}

function actionSummary(stateRoot) {
  const root = join(stateRoot, "actions", "proposals");
  const records = [];
  for (const path of filesUnder(root)) {
    if (!path.toLowerCase().endsWith(".json")) throw coded("gate6c-action-record-unclassified", "The action store contains an unclassified file.");
    const record = readJson(path, "gate6c-action-record-invalid");
    if (record?.schemaVersion !== "runa-action-pathway/v1" || !expectedKinds.has(record.kind)) {
      throw coded("gate6c-action-record-unclassified", "An action record is outside the frozen legacy action contract.");
    }
    if (canonicalJson(record).includes("defaultIntelligenceLevel")) {
      throw coded("gate6c-selected-receipt-review-required", "A legacy action record may affect the selected setting and needs an explicit mapping decision.");
    }
    records.push(record);
  }
  const journalPath = join(stateRoot, "actions", "journal.json");
  if (existsSync(journalPath)) {
    const journal = readJson(journalPath, "gate6c-action-journal-invalid");
    if (!Array.isArray(journal) || journal.some(item => !expectedKinds.has(item?.kind)
      || canonicalJson(item).includes("defaultIntelligenceLevel"))) {
      throw coded("gate6c-selected-receipt-review-required", "The action journal contains an unclassified selected-setting reference.");
    }
  }
  return { unrelatedActionCount: records.length, selectedReceipts: [] };
}

export function inspectSelectedContinuity({ stateRoot, reconciliationKey }) {
  const root = resolve(stateRoot);
  const settingsRoot = join(root, "settings");
  const actionsRoot = join(root, "actions");
  const before = { settings: treeDigest(settingsRoot, reconciliationKey),
    actions: treeDigest(actionsRoot, reconciliationKey) };
  const settingPath = join(settingsRoot, "values.json");
  const settingSourcePresent = existsSync(settingPath);
  if (!settingSourcePresent && existsSync(settingsRoot)) {
    throw coded("gate6c-setting-source-missing", "A partial selected setting root cannot establish the legacy default.");
  }
  const legacySetting = settingSourcePresent ? readJson(settingPath, "gate6c-setting-source-invalid") : null;
  const mapped = mapLegacySettingsRecord(legacySetting);
  if ((!settingSourcePresent && !mapped.defaultApplied)
      || (settingSourcePresent && !mapped.sourceValueAccepted) || mapped.emittedKeys.length !== 1
      || mapped.emittedKeys[0] !== "defaultIntelligenceLevel") {
    throw coded("gate6c-setting-source-invalid", "The selected persisted setting is outside its frozen allowlist.");
  }
  const actions = actionSummary(root);
  const after = { settings: treeDigest(settingsRoot, reconciliationKey),
    actions: treeDigest(actionsRoot, reconciliationKey) };
  if (canonicalJson(before) !== canonicalJson(after)) {
    throw coded("gate6c-selected-source-changed", "The selected legacy roots changed during inventory.");
  }
  return Object.freeze({ schemaVersion: "runa2-gate6c-selected-continuity-inspection/v1",
    domains: Object.freeze({
      setting: Object.freeze({ count: 1, logicalDigest: hmac(reconciliationKey, mapped.values) }),
      "action-receipts": Object.freeze({ count: 0, logicalDigest: hmac(reconciliationKey, []) }),
    }),
    settingValueAllowed: true, settingSourcePresent, defaultApplied: mapped.defaultApplied,
    selectedReceiptClassified: true,
    unrelatedActionCount: actions.unrelatedActionCount, sourceTreeDigest: hmac(reconciliationKey, before),
    sourceModified: false, deferredStoresOpened: false, privateValuesIncluded: false });
}
