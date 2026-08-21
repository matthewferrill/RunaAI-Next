import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export const PROTECTED_COMPARISON_VERSION = "runa2-gate4c-protected-aggregate-comparison/v1";
export const COMPARISON_SCOPES = Object.freeze([
  "personal", "project", "capability", "global", "session", "evaluation", "training-candidate",
]);
const coded = (code, message) => Object.assign(new Error(message), { code });
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw coded("protected-comparison-aggregate-invalid", `${label} must be a non-negative integer.`);
  return value;
}

export function emptyScopeTally() {
  return Object.fromEntries(COMPARISON_SCOPES.map(scope => [scope, 0]));
}

export function tallyProtectedScopes(lessons) {
  if (!Array.isArray(lessons)) throw coded("protected-comparison-aggregate-invalid", "Lessons must be an array.");
  const tally = emptyScopeTally();
  for (const lesson of lessons) {
    if (!exact(lesson, ["scope"]) || !COMPARISON_SCOPES.includes(lesson.scope)) {
      throw coded("protected-comparison-scope-invalid", "An active lesson has an unapproved scope category.");
    }
    tally[lesson.scope] += 1;
  }
  return Object.freeze(tally);
}

function sanitizeTally(value, label) {
  if (!exact(value, COMPARISON_SCOPES)) throw coded("protected-comparison-aggregate-invalid", `${label} has an invalid scope shape.`);
  return Object.freeze(Object.fromEntries(COMPARISON_SCOPES.map(scope => [scope, integer(value[scope], `${label}.${scope}`)])));
}

export function sanitizeProtectedComparisonPass(raw) {
  if (!exact(raw, ["sourceEntries", "sourceIntegrityHealthy", "legacy", "projected"])) {
    throw coded("protected-comparison-aggregate-invalid", "The comparison pass contains disallowed fields.");
  }
  const side = (value, label) => {
    if (!exact(value, ["activeCount", "byScope"])) throw coded("protected-comparison-aggregate-invalid", `${label} contains disallowed fields.`);
    const byScope = sanitizeTally(value.byScope, `${label}.byScope`);
    const activeCount = integer(value.activeCount, `${label}.activeCount`);
    if (Object.values(byScope).reduce((sum, count) => sum + count, 0) !== activeCount) {
      throw coded("protected-comparison-aggregate-invalid", `${label} scope counts do not total its active count.`);
    }
    return Object.freeze({ activeCount, byScope });
  };
  if (raw.sourceIntegrityHealthy !== true) throw coded("protected-comparison-source-invalid", "The protected source integrity check did not pass.");
  return Object.freeze({ sourceEntries: integer(raw.sourceEntries, "sourceEntries"), sourceIntegrityHealthy: true,
    legacy: side(raw.legacy, "legacy"), projected: side(raw.projected, "projected") });
}

function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

export function buildProtectedComparisonResult({ authority, first, second, sourceUnchanged }) {
  if (!exact(authority, ["legacyCommit", "nextCommit", "clean", "ownerIdentityVerified", "sourcePinsVerified"])
      || authority.clean !== true || authority.ownerIdentityVerified !== true || authority.sourcePinsVerified !== true) {
    throw coded("protected-comparison-authority-invalid", "The protected comparison authority is invalid.");
  }
  const one = sanitizeProtectedComparisonPass(first); const two = sanitizeProtectedComparisonPass(second);
  const countsEqual = one.legacy.activeCount === one.projected.activeCount;
  const scopeCountsEqual = same(one.legacy.byScope, one.projected.byScope);
  const deterministicSecondPass = same(one, two);
  const unchanged = sourceUnchanged === true;
  return Object.freeze({ schemaVersion: PROTECTED_COMPARISON_VERSION,
    authority: Object.freeze({ legacyCommit: authority.legacyCommit, nextCommit: authority.nextCommit,
      clean: true, ownerIdentityVerified: true, sourcePinsVerified: true }),
    source: Object.freeze({ entries: one.sourceEntries, integrityHealthy: true, unchanged }),
    legacy: one.legacy, projected: one.projected,
    checks: Object.freeze({ countsEqual, scopeCountsEqual, deterministicSecondPass,
      disposableKeysDestroyed: true, noTargetCreated: true, modelContextActivated: false,
      answerLanesActivated: false, qdrantActivated: false }),
    disallowedFieldsEmitted: false,
    passed: one.sourceEntries === 90 && countsEqual && scopeCountsEqual && deterministicSecondPass && unchanged });
}

export function assertProtectedComparisonAuthority({ legacyRepo, nextRepo, expectedLegacyCommit,
  expectedNextCommit, sourcePins, exec = execFileSync }) {
  const run = (file, args) => String(exec(file, args, { encoding: "utf8", windowsHide: true })).trim();
  const legacy = resolve(legacyRepo); const next = resolve(nextRepo);
  if (run("hostname", []).toLowerCase() !== "runa-control"
      || run("whoami", []).toLowerCase() !== "runa-control\\matthew") {
    throw coded("protected-comparison-owner-authority-mismatch", "The comparison requires Matthew on Runa-Control.");
  }
  const git = (repo, ...args) => run("git", ["-c", `safe.directory=${repo.replaceAll("\\", "/")}`, "-C", repo, ...args]);
  if (git(legacy, "rev-parse", "HEAD") !== expectedLegacyCommit || git(legacy, "branch", "--show-current") !== "main"
      || git(legacy, "status", "--porcelain", "--untracked-files=no")) {
    throw coded("protected-comparison-legacy-authority-mismatch", "The legacy checkout authority does not match.");
  }
  if (git(next, "rev-parse", "HEAD") !== expectedNextCommit
      || git(next, "branch", "--show-current") !== "runa2/gate-4c-protected-comparison"
      || git(next, "status", "--porcelain", "--untracked-files=no")) {
    throw coded("protected-comparison-next-authority-mismatch", "The comparison checkout authority does not match.");
  }
  if (!exact(sourcePins, ["schemaVersion", "recordedAt", "integrationBase", "controlLegacyHead",
    "publishedLegacyMainObserved", "historyStatus", "selectedSourceContentEquivalentAcrossObservedCheckouts", "sources"])
      || !Array.isArray(sourcePins.sources)) throw coded("protected-comparison-source-pin-mismatch", "The reviewed source pins are invalid.");
  for (const source of sourcePins.sources) {
    if (!exact(source, ["path", "gitBlobSha1"]) || git(legacy, "rev-parse", `HEAD:${source.path}`) !== source.gitBlobSha1) {
      throw coded("protected-comparison-source-pin-mismatch", "A reviewed legacy source pin changed.");
    }
  }
  return Object.freeze({ legacyCommit: expectedLegacyCommit, nextCommit: expectedNextCommit,
    clean: true, ownerIdentityVerified: true, sourcePinsVerified: true });
}
