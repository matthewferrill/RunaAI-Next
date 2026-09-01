import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ACCEPTANCE_POLICY, CASE_BUNDLE_SHA256, MODEL_CASES } from "./cases.mjs";
import { EXPLICIT_SEMANTIC_DECISION_SCHEMA_VERSION, EXPLICIT_SEMANTIC_RUBRIC_VERSION,
  REVIEWER_INDEPENDENCE_DECLARATION, CANDIDATE_BLIND_ORDER_VERSION, candidateBlindAttemptOrder,
  expectedSemanticAttemptIds, gradeExplicitSemanticCampaign, semanticChecksForCase,
  validateExplicitSemanticDecisions } from "./independent-semantic-review.mjs";

// Synthetic contract tests only. No model, host, service, network or production
// data is touched. Every generated decision is explicit; the product validator
// is never allowed to fill a verdict or fact.
const seal = "8".repeat(64);
const evaluatorId = "independent-r6-contract-test";
const modelIds = Object.fromEntries(ACCEPTANCE_POLICY.roster.map(candidate => [candidate.candidateId, "synthetic-model"]));
const sha = value => createHash("sha256").update(value).digest("hex");
const jsonSha = value => sha(JSON.stringify(value));
const phaseFor = (step, index) => step.id ?? `${index}:${step.action}`;
const itemFor = id => MODEL_CASES.find(item => item.id === id);

function attemptIdentity(attemptId) {
  const match = /^(.+)--([a-z]+-\d{2}-[a-z0-9-]+)--([1-3])$/u.exec(attemptId);
  assert.ok(match, attemptId);
  return { candidateId: match[1], caseId: match[2], repetition: Number(match[3]) };
}

function observation(attemptId) {
  const { candidateId, caseId, repetition } = attemptIdentity(attemptId), item = itemFor(caseId);
  const observed = {
    schemaVersion: "runaai-m1-functional-attempt/v1", candidateId, caseId, repetition, role: item.role,
    status: "completed", caseBundleSha256: CASE_BUNDLE_SHA256, runtimeSealSha256: seal,
    application: { requests: [], final: null }, provider: { calls: [], unexpectedCalls: [] },
    sources: { bindings: [], selectedAliases: [], indexOperations: [] }, project: {}, authority: {},
    workflow: { run: { plans: [] }, receipts: [], proposals: [] }, native: { calls: [], receipts: [], suites: [] },
    checks: [], evidence: item.journey.map((step, index) => ({ id: `phase-${index}`, source: "application",
      kind: "synthetic-journey-event", data: { phase: phaseFor(step, index) } })), failures: [], notImplemented: [],
  };
  for (let index = 0; index < item.journey.length; index += 1) {
    const step = item.journey[index], phase = phaseFor(step, index);
    if (step.action !== "answer") continue;
    const answer = "Complete readable output.";
    observed.application.requests.push({ operation: "answer", phase, requestId: `request-${index}`, status: 200,
      response: { answer, completion: { reason: "complete", timedOut: false, outputLimited: false }, citations: [] } });
    observed.provider.calls.push({ phase, role: item.role, modelId: "synthetic-model", response: { text: answer } });
  }
  if (["code", "agent"].includes(item.role)) {
    const summary = "Complete readable prospective plan summary.";
    observed.workflow.run.plans.push({ summary });
    observed.provider.calls.push({ phase: "1:run.start", role: item.role, modelId: "synthetic-model",
      response: { text: JSON.stringify({ summary, steps: [] }) } });
  }
  return observed;
}

function packet(attemptId) {
  const observed = observation(attemptId), rawBytes = Buffer.from(`${JSON.stringify(observed, null, 2)}\n`), rawSha256 = sha(rawBytes);
  const record = { attemptId, file: `${attemptId}.json`, bytes: rawBytes.length, sha256: rawSha256, status: observed.status };
  return { attemptId, observation: observed, rawBytes, recordBytes: Buffer.from(`${JSON.stringify(record, null, 2)}\n`) };
}

function valueAt(item, observed, pointer) {
  const source = /^case#\/setup\/sources\/(\d+)\/content$/u.exec(pointer);
  if (source) return item.setup.sources[Number(source[1])].content;
  let value = observed;
  for (const key of pointer.slice(2).split("/").map(part => part.replaceAll("~1", "/").replaceAll("~0", "~"))) value = value[key];
  return value;
}

function binding(item, observed, pointer, excerpt = null) {
  const value = valueAt(item, observed, pointer), rendered = typeof value === "string" ? value : JSON.stringify(value);
  return { pointer, valueSha256: jsonSha(value), excerpt: excerpt ?? rendered.slice(0, Math.min(64, rendered.length)) };
}

function bindingsFor(check, item, observed) {
  if (check.kind === "policy.criticalModelBehaviors") return observed.provider.calls.map((call, index) =>
    binding(item, observed, `#/provider/calls/${index}/response`));
  if (check.kind === "summary.semanticFacts") return [binding(item, observed, "#/workflow/run/plans/0/summary")];
  const answerBindings = observed.application.requests.map((request, index) => ({ request, index }))
    .filter(({ request }) => request.operation === "answer" && (check.phase === null || request.phase === check.phase))
    .map(({ index }) => binding(item, observed, `#/application/requests/${index}/response/answer`));
  if (check.kind !== "citations.claimSupport") return answerBindings;
  const sourceBindings = (item.setup.sources ?? []).map((source, index) => ({ source, index }))
    .filter(({ source }) => (item.setup.selected ?? []).includes(source.alias))
    .map(({ index }) => binding(item, observed, `case#/setup/sources/${index}/content`));
  return [...answerBindings, ...sourceBindings];
}

function expectedFacts(check) {
  if (check.kind === "policy.criticalModelBehaviors") return Object.keys(check.expected);
  if (check.kind === "answer.numericResult") return [check.expected];
  if (check.kind.endsWith("semanticFacts") && Array.isArray(check.expected)) return check.expected;
  return [];
}

function decisionFor(packetValue, blindId) {
  const observed = packetValue.observation, item = itemFor(observed.caseId);
  return {
    blindId,
    rawSha256: sha(packetValue.rawBytes),
    recordSha256: sha(packetValue.recordBytes),
    providerOutputs: observed.provider.calls.flatMap((call, index) => call.response === null || call.response === undefined ? [] : [{
      pointer: `#/provider/calls/${index}/response`, sha256: jsonSha(call.response),
    }]),
    checks: semanticChecksForCase(observed.caseId).map(check => ({
      checkId: check.checkId, verdict: "pass", reasonCode: "expected-assertion-satisfied",
      rationale: "The independent evaluator explicitly found this assertion satisfied in the complete bound output.",
      evidenceState: "readable", bindings: bindingsFor(check, item, observed),
      facts: expectedFacts(check).map((expectedFact, factIndex) => ({ factIndex, expectedFact, verdict: "pass",
        reasonCode: "expected-fact-present", rationale: "The independent evaluator explicitly found this expected fact in the complete bound output." })),
    })),
  };
}

function campaign() {
  const packets = expectedSemanticAttemptIds().map(packet), byId = new Map(packets.map(value => [value.attemptId, value]));
  const mapping = candidateBlindAttemptOrder(seal);
  const bundle = {
    schemaVersion: EXPLICIT_SEMANTIC_DECISION_SCHEMA_VERSION, evaluatorId, rubricVersion: EXPLICIT_SEMANTIC_RUBRIC_VERSION,
    reviewerIndependence: REVIEWER_INDEPENDENCE_DECLARATION, caseBundleSha256: CASE_BUNDLE_SHA256, runtimeSealSha256: seal,
    candidateBlindOrderVersion: CANDIDATE_BLIND_ORDER_VERSION,
    attemptOrderSha256: sha(mapping.map(entry => entry.blindId).join("\n")),
    attempts: mapping.map(entry => decisionFor(byId.get(entry.attemptId), entry.blindId)),
  };
  return { packets, bundle, mapping };
}

function decisionForAttempt(fixture, attemptId) {
  const blindId = fixture.mapping.find(entry => entry.attemptId === attemptId).blindId;
  return fixture.bundle.attempts.find(attempt => attempt.blindId === blindId);
}

function packetForAttempt(fixture, attemptId) {
  return fixture.packets.find(value => value.attemptId === attemptId);
}

function refreshAttempt(fixture, attemptId) {
  const value = packetForAttempt(fixture, attemptId), blindId = fixture.mapping.find(entry => entry.attemptId === attemptId).blindId;
  value.rawBytes = Buffer.from(`${JSON.stringify(value.observation, null, 2)}\n`);
  value.recordBytes = Buffer.from(`${JSON.stringify({ attemptId, file: `${attemptId}.json`, bytes: value.rawBytes.length,
    sha256: sha(value.rawBytes), status: value.observation.status }, null, 2)}\n`);
  const index = fixture.bundle.attempts.findIndex(attempt => attempt.blindId === blindId);
  fixture.bundle.attempts[index] = decisionFor(value, blindId);
}

function input(fixture) {
  return { bundle: fixture.bundle, packets: fixture.packets, runtimeSealSha256: seal, evaluatorId,
    rubricVersion: EXPLICIT_SEMANTIC_RUBRIC_VERSION, expectedModelIds: modelIds };
}

function semanticDecision(fixture, caseId, kind, repetition = 1, candidateId = ACCEPTANCE_POLICY.roster[0].candidateId) {
  const attemptId = `${candidateId}--${caseId}--${repetition}`;
  return decisionForAttempt(fixture, attemptId).checks.find(check => check.checkId.endsWith(`:${kind}`));
}

test("the fixed candidate-blind bundle explicitly covers all360 attempts and every retained provider output", () => {
  const fixture = campaign(), validated = validateExplicitSemanticDecisions(input(fixture));
  assert.equal(validated.attempts.length, 360);
  assert.equal(new Set(validated.attempts.map(attempt => attempt.packet.attemptId)).size, 360);
  assert.equal(validated.providerOutputsCovered,
    fixture.packets.reduce((count, value) => count + value.observation.provider.calls.length, 0));
  const serialized = JSON.stringify(fixture.bundle).toLocaleLowerCase("en-US");
  for (const candidate of ACCEPTANCE_POLICY.roster) {
    assert.equal(serialized.includes(candidate.candidateId.toLocaleLowerCase("en-US")), false);
    assert.equal(serialized.includes(candidate.displayName.toLocaleLowerCase("en-US")), false);
  }
});

test("missing, duplicate and extra attempt identities fail closed", () => {
  let fixture = campaign(); fixture.bundle.attempts.pop();
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-attempt-missing" });
  fixture = campaign(); fixture.bundle.attempts.push(structuredClone(fixture.bundle.attempts[0]));
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-attempt-extra" });
  fixture = campaign(); fixture.bundle.attempts.at(-1).blindId = fixture.bundle.attempts[0].blindId;
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-attempt-duplicate" });
  fixture = campaign(); fixture.packets.pop();
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "packet-attempt-missing" });
});

test("every provider output needs its exact complete-JSON hash once", () => {
  let fixture = campaign(); fixture.bundle.attempts[0].providerOutputs.pop();
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "provider-output-missing" });
  fixture = campaign(); fixture.bundle.attempts[0].providerOutputs[0].sha256 = "0".repeat(64);
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "provider-output-hash-mismatch" });
  fixture = campaign(); fixture.bundle.attempts[0].providerOutputs.push(structuredClone(fixture.bundle.attempts[0].providerOutputs[0]));
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "provider-output-extra" });
});

test("semantic checks admit no missing, duplicate, extra or defaulted decision", () => {
  let fixture = campaign(); fixture.bundle.attempts[0].checks.pop();
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-check-missing" });
  fixture = campaign(); {
    const decision = decisionForAttempt(fixture, `${ACCEPTANCE_POLICY.roster[0].candidateId}--chat-05-useful-summary--1`);
    decision.checks[1] = structuredClone(decision.checks[0]);
  }
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-check-duplicate" });
  fixture = campaign(); fixture.bundle.attempts[0].checks.push(structuredClone(fixture.bundle.attempts[0].checks[0]));
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-check-extra" });
  fixture = campaign(); delete fixture.bundle.attempts[0].checks[0].verdict;
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-field-missing" });
  fixture = campaign(); fixture.bundle.attempts[0].checks[0].defaultVerdict = "pass";
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-field-extra" });
  fixture = campaign(); Object.setPrototypeOf(fixture.bundle.attempts[0].checks[0], { defaultVerdict: "pass" });
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-object-prototype-invalid" });
});

test("numeric results are sealed independent decisions and cannot disappear from the bundle", () => {
  const checks = semanticChecksForCase("chat-03-current-topic");
  assert.equal(checks.filter(check => check.kind === "answer.numericResult").length, 2);
  const fixture = campaign();
  const decision = decisionForAttempt(fixture, `${ACCEPTANCE_POLICY.roster[0].candidateId}--chat-03-current-topic--1`);
  decision.checks = decision.checks.filter(check => check.checkId !== checks[0].checkId);
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-check-missing" });
});

test("numeric semantic decisions bind the frozen expected result as a fact", () => {
  const passFixture = campaign();
  const pass = semanticDecision(passFixture, "chat-03-current-topic", "answer.numericResult");
  assert.deepEqual(pass.facts.map(fact => fact.expectedFact), [12]);
  assert.doesNotThrow(() => validateExplicitSemanticDecisions(input(passFixture)));

  for (const reasonCode of ["expected-fact-absent", "expected-fact-contradicted"]) {
    const failFixture = campaign(), fail = semanticDecision(failFixture, "chat-03-current-topic", "answer.numericResult");
    fail.verdict = "fail";
    fail.reasonCode = reasonCode;
    fail.rationale = "The complete readable numeric answer does not satisfy the frozen expected result.";
    fail.facts[0].verdict = "fail";
    fail.facts[0].reasonCode = reasonCode;
    fail.facts[0].rationale = "The complete readable answer does not contain the frozen expected numeric result.";
    const graded = gradeExplicitSemanticCampaign(input(failFixture));
    const attempt = graded.attempts.find(value => value.grade.caseId === "chat-03-current-topic"
      && value.grade.repetition === 1 && value.grade.candidateId === ACCEPTANCE_POLICY.roster[0].candidateId);
    assert.equal(attempt.grade.checks.find(check => check.checkId === fail.checkId).status, "fail");
  }
});

test("zero-fact semantic assertions still accept explicit determinate failure", () => {
  const fixture = campaign(), fail = semanticDecision(fixture, "research-01-selected-facts", "citations.claimSupport");
  assert.equal(fail.facts.length, 0);
  fail.verdict = "fail";
  fail.reasonCode = "expected-fact-absent";
  fail.rationale = "The complete readable answer has no canonical citation supporting its claim.";
  assert.doesNotThrow(() => validateExplicitSemanticDecisions(input(fixture)));
});

test("zero-fact semantic assertions reject pass/fail reason-code contradictions", () => {
  let fixture = campaign(), check = semanticDecision(fixture, "research-01-selected-facts", "citations.claimSupport");
  check.verdict = "pass";
  check.reasonCode = "expected-fact-absent";
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-reason-invalid" });

  fixture = campaign(); check = semanticDecision(fixture, "research-01-selected-facts", "citations.claimSupport");
  check.verdict = "fail";
  check.reasonCode = "expected-assertion-satisfied";
  check.rationale = "The complete readable answer has no canonical citation supporting its claim.";
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-reason-invalid" });
});

test("fact-backed failures require a matching failed-fact reason", () => {
  const fixture = campaign(), check = semanticDecision(fixture, "chat-05-useful-summary", "answer.semanticFacts");
  check.facts[0].verdict = "fail";
  check.facts[0].reasonCode = "expected-fact-absent";
  check.facts[0].rationale = "The complete readable answer omits this exact required fact.";
  check.verdict = "fail";
  check.reasonCode = "expected-fact-contradicted";
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-reason-invalid" });
});

test("every expected fact is decided exactly once with its frozen identity", () => {
  let fixture = campaign(), check = semanticDecision(fixture, "chat-05-useful-summary", "answer.semanticFacts"); check.facts.pop();
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-fact-missing" });
  fixture = campaign(); check = semanticDecision(fixture, "chat-05-useful-summary", "answer.semanticFacts"); check.facts[1] = structuredClone(check.facts[0]);
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-fact-duplicate" });
  fixture = campaign(); check = semanticDecision(fixture, "chat-05-useful-summary", "answer.semanticFacts"); check.facts.push({ ...structuredClone(check.facts[0]), factIndex: 2 });
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "decision-fact-extra" });
});

test("readable absent and contradicted facts are determinate failures with exact reason codes", () => {
  for (const reasonCode of ["expected-fact-absent", "expected-fact-contradicted"]) {
    const fixture = campaign(), check = semanticDecision(fixture, "chat-05-useful-summary", "answer.semanticFacts");
    check.facts[0].verdict = "fail"; check.facts[0].reasonCode = reasonCode;
    check.facts[0].rationale = reasonCode === "expected-fact-absent"
      ? "The complete readable answer omits this exact required fact."
      : "The complete readable answer states the opposite of this exact required fact.";
    check.verdict = "fail"; check.reasonCode = reasonCode;
    const graded = gradeExplicitSemanticCampaign(input(fixture));
    const attempt = graded.attempts.find(value => value.grade.caseId === "chat-05-useful-summary" && value.grade.repetition === 1
      && value.grade.candidateId === ACCEPTANCE_POLICY.roster[0].candidateId);
    const result = attempt.grade.checks.find(value => value.kind === "answer.semanticFacts");
    assert.equal(result.status, "fail");
    assert.equal(result.reasonCode, reasonCode);
  }
});

test("uncertain is reserved for missing, corrupt or unbound evidence and grades inconclusive", () => {
  for (const state of ["missing", "corrupt", "unbound"]) {
    const fixture = campaign(), check = semanticDecision(fixture, "chat-05-useful-summary", "answer.semanticFacts");
    check.evidenceState = state; check.verdict = "uncertain"; check.reasonCode = `evidence-${state}`; check.bindings = [];
    for (const fact of check.facts) { fact.verdict = "uncertain"; fact.reasonCode = `evidence-${state}`; }
    const graded = gradeExplicitSemanticCampaign(input(fixture));
    const attempt = graded.attempts.find(value => value.grade.caseId === "chat-05-useful-summary" && value.grade.repetition === 1
      && value.grade.candidateId === ACCEPTANCE_POLICY.roster[0].candidateId);
    const result = attempt.grade.checks.find(value => value.kind === "answer.semanticFacts");
    assert.equal(result.status, "inconclusive");
    assert.equal(result.reasonCode, `evidence-${state}`);
  }
  let fixture = campaign(), check = semanticDecision(fixture, "chat-05-useful-summary", "answer.semanticFacts");
  check.verdict = "uncertain"; check.reasonCode = "expected-fact-absent";
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "readable-check-indeterminate" });
  fixture = campaign(); check = semanticDecision(fixture, "chat-05-useful-summary", "answer.semanticFacts");
  check.evidenceState = "missing"; check.verdict = "uncertain"; check.reasonCode = "expected-fact-absent"; check.bindings = [];
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "uncertain-reason-invalid" });
});

test("one- and two-character exact outputs are valid bound semantic evidence", () => {
  const fixture = campaign(), attemptId = `${ACCEPTANCE_POLICY.roster[0].candidateId}--chat-03-current-topic--1`;
  const value = packetForAttempt(fixture, attemptId);
  value.observation.application.requests[0].response.answer = "12";
  value.observation.application.requests[1].response.answer = "54";
  value.observation.provider.calls[0].response.text = "12";
  value.observation.provider.calls[1].response.text = "54";
  refreshAttempt(fixture, attemptId);
  const graded = gradeExplicitSemanticCampaign(input(fixture));
  const attempt = graded.attempts.find(entry => entry.attemptId === attemptId);
  assert.equal(attempt.grade.checks.find(check => check.kind === "answer.currentTurnRelevant").status, "pass");
  assert.equal(attempt.grade.checks.find(check => check.kind === "answer.unsupportedExecutionClaim").status, "pass");
});

test("semantic outcomes come only from explicit decisions, never lexical keyword grading", () => {
  const passFixture = campaign(), passCheck = semanticDecision(passFixture, "chat-05-useful-summary", "answer.semanticFacts");
  const failFixture = campaign(), failCheck = semanticDecision(failFixture, "chat-05-useful-summary", "answer.semanticFacts");
  failCheck.facts[0].verdict = "fail"; failCheck.facts[0].reasonCode = "expected-fact-absent";
  failCheck.facts[0].rationale = "The complete readable answer omits this exact required fact.";
  failCheck.verdict = "fail"; failCheck.reasonCode = "expected-fact-absent";
  assert.deepEqual(passCheck.bindings, failCheck.bindings, "identical bound text; only the explicit evaluator decision differs");
  const passed = gradeExplicitSemanticCampaign(input(passFixture)), failed = gradeExplicitSemanticCampaign(input(failFixture));
  const select = result => result.attempts.find(value => value.grade.caseId === "chat-05-useful-summary" && value.grade.repetition === 1
    && value.grade.candidateId === ACCEPTANCE_POLICY.roster[0].candidateId).grade.checks.find(value => value.kind === "answer.semanticFacts");
  assert.equal(select(passed).status, "pass");
  assert.equal(select(failed).status, "fail");
});

test("raw, record, evaluator, rubric, binding and candidate-blind metadata are exact", () => {
  let fixture = campaign(); fixture.bundle.attempts[0].rawSha256 = "0".repeat(64);
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "raw-hash-mismatch" });
  fixture = campaign(); fixture.bundle.attempts[0].recordSha256 = "0".repeat(64);
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "record-hash-mismatch" });
  fixture = campaign(); {
    const attemptId = fixture.packets[0].attemptId, value = JSON.parse(fixture.packets[0].recordBytes);
    value.status = "failed";
    fixture.packets[0].recordBytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    const decision = decisionForAttempt(fixture, attemptId);
    decision.recordSha256 = sha(fixture.packets[0].recordBytes);
  }
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "record-observation-unbound" });
  fixture = campaign(); fixture.bundle.evaluatorId = "different";
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "evaluator-rubric-unbound" });
  fixture = campaign(); fixture.bundle.attemptOrderSha256 = "0".repeat(64);
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "blind-order-hash-mismatch" });
  fixture = campaign(); fixture.bundle.attempts[0].checks[0].bindings[0].valueSha256 = "0".repeat(64);
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "binding-hash-mismatch" });
  fixture = campaign(); fixture.bundle.attempts[0].checks[0].rationale = "Gemma 4 26B A4B should pass because it is Gemma.";
  assert.throws(() => validateExplicitSemanticDecisions(input(fixture)), { code: "candidate-identity-in-review" });
});
