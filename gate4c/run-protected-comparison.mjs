import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson } from "../gate4/canonical.mjs";
import { createEnvelopeCipher } from "../gate4/envelope.mjs";
import { buildGate4bPlan } from "../gate4b/migration.mjs";
import { assertPrivateLearningValuesAbsent, privateLearningValuesForScan,
  protectedLearningBoundaryManifest, readProtectedE6Snapshot } from "../gate4b/protected-source.mjs";
import { buildApprovedKnowledgeProjection } from "./projection.mjs";
import { acceptedSourceFromPlan } from "./source.mjs";
import { assertProtectedComparisonAuthority, buildProtectedComparisonResult,
  PROTECTED_COMPARISON_VERSION, tallyProtectedScopes } from "./protected-comparison.mjs";

const nextRepo = resolve(import.meta.dirname, "..");
const coded = code => Object.assign(new Error("The protected aggregate comparison failed closed."), { code });
function argsOf(values) {
  const allowed = new Set(["--legacy-repo", "--expected-legacy-commit", "--expected-next-commit"]); const result = {};
  if (values.length !== 6) throw coded("protected-comparison-arguments-invalid");
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]; const value = values[index + 1];
    if (!allowed.has(key) || !value || Object.hasOwn(result, key.slice(2))) throw coded("protected-comparison-arguments-invalid");
    result[key.slice(2)] = value;
  }
  if (Object.keys(result).length !== 3) throw coded("protected-comparison-arguments-invalid");
  return result;
}

async function legacyActiveAggregate(legacyRepo, at) {
  const root = resolve(legacyRepo);
  const [{ createLearningDeviceVaultService }, { createLearningCenterService }] = await Promise.all([
    import(pathToFileURL(resolve(root, "src", "runa", "learning-device-vault-service.mjs")).href),
    import(pathToFileURL(resolve(root, "src", "runa", "learning-center-service.mjs")).href),
  ]);
  const vault = createLearningDeviceVaultService({ workspaceRoot: root });
  const center = createLearningCenterService({ workspaceRoot: root, credentialProvider: vault,
    now: () => new Date(at) });
  let journal; let snapshot;
  try {
    journal = center.openJournalForAuthorizedAdapter();
    const integrity = journal.integrity();
    if (!integrity.healthy) throw coded("protected-comparison-source-invalid");
    snapshot = journal.readActiveApprovedKnowledgeSnapshot();
    const scopes = snapshot.lessons.map(item => ({ scope: item.scope }));
    return Object.freeze({ sourceEntries: snapshot.headSequence, sourceIntegrityHealthy: true,
      activeCount: scopes.length, byScope: tallyProtectedScopes(scopes) });
  } finally {
    snapshot = null;
    try { journal?.lock(); } catch {}
  }
}

async function comparisonPass({ legacyRepo, expectedLegacyCommit, at, runNumber }) {
  const legacy = await legacyActiveAggregate(legacyRepo, at);
  const sourceRead = await readProtectedE6Snapshot({ legacyRepo, expectedCommit: expectedLegacyCommit });
  const privateValues = privateLearningValuesForScan(sourceRead.snapshot);
  let encryptionKey = randomBytes(32); let hmacKey = randomBytes(32); let cipher; let projection;
  try {
    cipher = createEnvelopeCipher({ encryptionKey, hmacKey, keyId: `gate4c-protected-comparison-pass-${runNumber}` });
    encryptionKey.fill(0); hmacKey.fill(0); encryptionKey = null; hmacKey = null;
    const plan = buildGate4bPlan(sourceRead.snapshot, cipher, { runId: `gate4c-protected-comparison-pass-${runNumber}` });
    const source = acceptedSourceFromPlan(sourceRead.snapshot, plan);
    projection = buildApprovedKnowledgeProjection({ source, cipher, now: new Date(at) });
    const projectedScopes = projection.lessons.map(item => ({ scope: item.scope }));
    const pass = Object.freeze({ sourceEntries: sourceRead.aggregate.entries, sourceIntegrityHealthy: true,
      legacy: Object.freeze({ activeCount: legacy.activeCount, byScope: legacy.byScope }),
      projected: Object.freeze({ activeCount: projectedScopes.length, byScope: tallyProtectedScopes(projectedScopes) }) });
    if (legacy.sourceEntries !== sourceRead.aggregate.entries || sourceRead.aggregate.entries !== 90) {
      throw coded("protected-comparison-source-invalid");
    }
    assertPrivateLearningValuesAbsent(privateValues, [JSON.stringify(pass)]);
    return Object.freeze({ aggregate: pass, privateValues });
  } finally {
    projection = null; cipher?.destroy(); encryptionKey?.fill(0); hmacKey?.fill(0);
  }
}

let report = null; let safeErrorCode = null;
try {
  const args = argsOf(process.argv.slice(2)); const legacyRepo = resolve(args["legacy-repo"]);
  const expectedLegacyCommit = args["expected-legacy-commit"]; const expectedNextCommit = args["expected-next-commit"];
  const sourcePins = JSON.parse(readFileSync(resolve(nextRepo, "gate4b", "SOURCE-PINS.json"), "utf8"));
  const authority = assertProtectedComparisonAuthority({ legacyRepo, nextRepo, expectedLegacyCommit,
    expectedNextCommit, sourcePins });
  const before = protectedLearningBoundaryManifest(legacyRepo);
  if (!before.e6.present || !before.learningCenterCredential.present || !before.deviceVault.present) {
    throw coded("protected-comparison-source-invalid");
  }
  const at = new Date().toISOString();
  const first = await comparisonPass({ legacyRepo, expectedLegacyCommit, at, runNumber: 1 });
  const second = await comparisonPass({ legacyRepo, expectedLegacyCommit, at, runNumber: 2 });
  const after = protectedLearningBoundaryManifest(legacyRepo);
  const sourceUnchanged = canonicalJson(before) === canonicalJson(after);
  report = buildProtectedComparisonResult({ authority, first: first.aggregate, second: second.aggregate, sourceUnchanged });
  assertPrivateLearningValuesAbsent([...first.privateValues, ...second.privateValues], [JSON.stringify(report)]);
  first.privateValues.length = 0; second.privateValues.length = 0;
  if (!report.passed) process.exitCode = 1;
} catch (error) {
  const allowed = new Set(["protected-comparison-arguments-invalid", "protected-comparison-owner-authority-mismatch",
    "protected-comparison-legacy-authority-mismatch", "protected-comparison-next-authority-mismatch",
    "protected-comparison-source-pin-mismatch", "protected-comparison-source-invalid",
    "protected-comparison-scope-invalid", "protected-comparison-aggregate-invalid",
    "protected-comparison-authority-invalid", "protected-private-value-exposed"]);
  safeErrorCode = allowed.has(error?.code) ? error.code : "protected-comparison-failed";
}
if (report) process.stdout.write(`${JSON.stringify(report)}\n`);
else {
  process.stdout.write(`${JSON.stringify({ schemaVersion: PROTECTED_COMPARISON_VERSION,
    errorCode: safeErrorCode ?? "protected-comparison-failed", disallowedFieldsEmitted: false, passed: false })}\n`);
  process.exitCode = 1;
}
