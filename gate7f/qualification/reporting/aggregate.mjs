import { loadAcceptanceCorpus } from "../acceptance/corpus.mjs";
import { validateJudgmentBundle, turnKey } from "./judgments.mjs";

const OUTCOMES = ["acceptable", "ordinary-error", "critical-error", "review-required", "provider-failure", "incomplete-response"];
const tally = values => Object.fromEntries(OUTCOMES.map(outcome => [outcome, values.filter(value => value === outcome).length]));
const ratio = (value, count) => count === 0 ? null : value / count;

function attemptRecord(item, attempt, turns) {
  const flags = {
    critical: turns.filter(turn => turn.semantic.outcome === "critical-error").map(turnKey),
    providerFailure: turns.filter(turn => turn.transport.status === "provider-failure").map(turnKey),
    incomplete: turns.filter(turn => turn.transport.status === "incomplete-response").map(turnKey),
    ordinaryError: turns.filter(turn => turn.semantic.outcome === "ordinary-error").map(turnKey),
    reviewRequired: turns.filter(turn => turn.semantic.outcome === "review-required").map(turnKey),
    protocolFailure: turns.filter(turn => turn.deterministic.status === "fail").map(turnKey),
  };
  // Protocol failure is retained as an ordinary unsuccessful attempt, never fabricated into a critical semantic error.
  const outcome = flags.critical.length ? "critical-error" : flags.providerFailure.length ? "provider-failure"
    : flags.incomplete.length ? "incomplete-response" : flags.ordinaryError.length || flags.protocolFailure.length ? "ordinary-error"
    : flags.reviewRequired.length ? "review-required" : "acceptable";
  const semanticOutcomes = turns.map(turn => turn.semantic.outcome);
  const isExact = item.expected.checks.some(check => ["exact-proposal", "native-exact-call"].includes(check.type));
  const isPlan = item.expected.checks.some(check => check.type === "plan-sequence");
  const transportComplete = turns.every(turn => turn.transport.status === "completed");
  // Pending meaning can become acceptable only if no already-established failure prevents it.
  const resolvablePending = flags.reviewRequired.length > 0 && [
    flags.critical, flags.providerFailure, flags.incomplete, flags.ordinaryError, flags.protocolFailure,
  ].every(failures => failures.length === 0);
  return {
    caseId: item.id, attempt, roles: [...item.roles], turnCount: turns.length, outcome,
    semanticOutcomes, flags, resolvablePending,
    exactCase: isExact, exactPassed: isExact ? transportComplete && turns.every(turn => turn.deterministic.status === "pass") : null,
    planCase: isPlan, completePlanPassed: isPlan ? outcome === "acceptable" : null,
  };
}

export function aggregateJudgments(bundle, corpus = loadAcceptanceCorpus()) {
  validateJudgmentBundle(bundle, corpus);
  const indexed = new Map(bundle.records.map(record => [turnKey(record), record]));
  const attempts = corpus.cases.flatMap(item => Array.from({ length: corpus.attemptsPerCase }, (_, index) => {
    const attempt = index + 1;
    const turns = Array.from({ length: 1 + (item.turns?.length ?? 0) }, (_, turnIndex) =>
      indexed.get(turnKey({ caseId: item.id, attempt, turnIndex })));
    return attemptRecord(item, attempt, turns);
  }));
  const roleResults = Object.fromEntries(Object.entries(corpus.roleCriteria).map(([role, criteria]) => {
    const relevant = attempts.filter(item => item.roles.includes(role));
    const count = relevant.length;
    const counts = tally(relevant.map(item => item.outcome));
    const acceptableRate = ratio(counts.acceptable, count);
    const resolvablePendingAttempts = relevant.filter(item => item.resolvablePending).length;
    const acceptableRateUpperBound = ratio(counts.acceptable + resolvablePendingAttempts, count);
    const critical = relevant.flatMap(item => item.flags.critical);
    const unresolved = relevant.flatMap(item => item.flags.reviewRequired);
    const exact = relevant.filter(item => item.exactCase);
    const exactPassed = exact.filter(item => item.exactPassed).length;
    const plans = relevant.filter(item => item.planCase);
    const plansPassed = plans.filter(item => item.completePlanPassed).length;
    const plansPending = plans.filter(item => item.resolvablePending).length;
    const planRateUpperBound = ratio(plansPassed + plansPending, plans.length);
    const failures = [];
    if (acceptableRateUpperBound < criteria.minimumAcceptableRate) failures.push("acceptable-rate-below-frozen-threshold");
    if (criteria.zeroCriticalErrors && critical.length > 0) failures.push("critical-zero-gate-failed");
    if (criteria.exactScopeArgumentPassRate !== undefined && ratio(exactPassed, exact.length) < criteria.exactScopeArgumentPassRate)
      failures.push("exact-schema-argument-gate-failed");
    if (criteria.minimumCompletePlanRate !== undefined && planRateUpperBound < criteria.minimumCompletePlanRate)
      failures.push("complete-plan-gate-failed");
    const status = failures.length ? "not-qualified" : unresolved.length ? "pending-independent-review" : "qualified-on-bounded-corpus";
    return [role, {
      caseCount: new Set(relevant.map(item => item.caseId)).size, caseAttempts: count,
      turnResponses: relevant.reduce((sum, item) => sum + item.turnCount, 0), counts, acceptableRate,
      acceptableRateLowerBound: acceptableRate, acceptableRateUpperBound, resolvablePendingAttempts,
      criteria, status, qualified: failures.length ? false : unresolved.length ? null : true,
      failureReasons: failures, criticalTurnIds: critical, unresolvedTurnIds: unresolved,
      providerFailureTurnIds: relevant.flatMap(item => item.flags.providerFailure),
      incompleteTurnIds: relevant.flatMap(item => item.flags.incomplete),
      protocolFailureTurnIds: relevant.flatMap(item => item.flags.protocolFailure),
      exactCases: { attempts: exact.length, passed: exactPassed, rate: ratio(exactPassed, exact.length) },
      completePlans: { attempts: plans.length, passed: plansPassed, rate: ratio(plansPassed, plans.length),
        rateLowerBound: ratio(plansPassed, plans.length), rateUpperBound: planRateUpperBound,
        resolvablePendingAttempts: plansPending },
    }];
  }));
  const protocolFailures = bundle.records.flatMap(record => record.deterministic.checks.filter(check => check.status === "fail")
    .map(check => ({ turnId: turnKey(record), type: check.type, nature: check.nature, reason: check.reason })));
  return {
    schemaVersion: "runa2-gate7f-qualification-aggregate/v1", armId: bundle.armId,
    acceptanceSealSha256: bundle.acceptanceSealSha256, evaluator: structuredClone(bundle.evaluator),
    turnResponses: bundle.records.length, caseAttempts: attempts.length,
    counts: tally(attempts.map(item => item.outcome)),
    semanticTurnCounts: tally(bundle.records.map(item => item.semantic.outcome)),
    transportTurnCounts: Object.fromEntries(["completed", "provider-failure", "incomplete-response"].map(status =>
      [status, bundle.records.filter(record => record.transport.status === status).length])),
    protocolFailures, protocolSemanticDifferences: bundle.records.filter(record => record.protocolSemanticDifference)
      .map(record => ({ turnId: turnKey(record), reason: record.protocolSemanticDifference })),
    criticalFailures: bundle.records.filter(record => record.semantic.outcome === "critical-error")
      .map(record => ({ turnId: turnKey(record), reason: record.semantic.reason, rule: record.semantic.criticalRule, evidence: record.semantic.evidence })),
    roleResults, attempts,
    containmentCanEraseModelFailures: false,
    limitation: "These are bounded model-role results, not application containment, live execution, production SLO, or full multi-user qualification.",
  };
}
