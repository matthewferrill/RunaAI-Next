import { createHash } from "node:crypto";
import { isDeepStrictEqual as same } from "node:util";
import { ACCEPTANCE_POLICY, CASE_BUNDLE_SHA256, MODEL_CASES } from "./cases.mjs";
import { EXPLICIT_SEMANTIC_EVIDENCE_SCHEMA_VERSION, enumerateCaseChecks, evaluateAttempt,
  requiresIndependentSemanticDecision, summarizeCampaign } from "./assertions.mjs";

// This module validates evaluator-authored decisions. It deliberately contains
// no answer keywords, expected-answer patterns, or lexical pass/fail logic.
// Human review supplies every verdict; this code binds it to the exact frozen
// attempt, output and assertion set and rejects omissions or schema drift.
export const EXPLICIT_SEMANTIC_DECISION_SCHEMA_VERSION = "runaai-m1-explicit-semantic-decisions/v1";
export const EXPLICIT_SEMANTIC_RUBRIC_VERSION = "2026-08-29.r6-determinate";
export const REVIEWER_INDEPENDENCE_DECLARATION = "author-of-neither-planner-nor-model-adapter";
export const CANDIDATE_BLIND_ORDER_VERSION = "runaai-m1-candidate-blind-order/v1";

const SHA = /^[a-f0-9]{64}$/u;
const UNCERTAIN_STATES = new Set(["missing", "corrupt", "unbound"]);
const FAILURE_REASONS = new Set(["expected-fact-absent", "expected-fact-contradicted"]);
const missing = Symbol("missing");
const sha = value => createHash("sha256").update(value).digest("hex");
const jsonSha = value => {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) return null;
  return sha(encoded);
};
const arr = value => Array.isArray(value) ? value : [];
const bytes = value => Buffer.isBuffer(value) ? value : value instanceof Uint8Array ? Buffer.from(value) : null;

export class ExplicitSemanticDecisionError extends Error {
  constructor(code, path, detail = "") {
    super(`${code}:${path}${detail ? `:${detail}` : ""}`);
    this.name = "ExplicitSemanticDecisionError";
    this.code = code;
    this.path = path;
  }
}

function reject(code, path, detail) {
  throw new ExplicitSemanticDecisionError(code, path, detail);
}

function record(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) reject("decision-object-required", path);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) reject("decision-object-prototype-invalid", path);
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) reject("decision-object-accessor-invalid", `${path}/${key}`);
  }
  return value;
}

function exactKeys(value, expected, path) {
  record(value, path);
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  for (const key of wanted) if (!Object.hasOwn(value, key)) reject("decision-field-missing", `${path}/${key}`);
  for (const key of actual) if (!wanted.includes(key)) reject("decision-field-extra", `${path}/${key}`);
}

function text(value, path, minimum = 1) {
  if (typeof value !== "string" || value.length < minimum) reject("decision-text-invalid", path);
}

function parseJson(raw, path) {
  const value = bytes(raw);
  if (!value) reject("evidence-bytes-required", path);
  try { return JSON.parse(value.toString("utf8").replace(/^\uFEFF/u, "")); }
  catch { reject("evidence-json-corrupt", path); }
}

function ownPointer(root, input) {
  if (input === "#" || input === "") return root;
  const path = typeof input === "string" && input.startsWith("#") ? input.slice(1) : input;
  if (typeof path !== "string" || !path.startsWith("/") || /~(?![01])/u.test(path)) return missing;
  let value = root;
  for (const encoded of path.slice(1).split("/")) {
    const key = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (["__proto__", "prototype", "constructor"].includes(key) || value === null || typeof value !== "object") return missing;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) return missing;
    value = descriptor.value;
  }
  return value;
}

function bindingValue(item, observation, pointer) {
  const source = /^case#\/setup\/sources\/(\d+)\/content$/u.exec(pointer);
  if (source) return item.setup?.sources?.[Number(source[1])]?.content ?? missing;
  return ownPointer(observation, pointer);
}

function expectedFacts(check) {
  if (check.kind === "policy.criticalModelBehaviors") return Object.keys(check.expected);
  if (check.kind.endsWith("semanticFacts") && Array.isArray(check.expected)) return check.expected;
  return [];
}

function candidateIdentityAppears(value) {
  const normalized = value.toLocaleLowerCase("en-US");
  return ACCEPTANCE_POLICY.roster.some(candidate => normalized.includes(candidate.candidateId.toLocaleLowerCase("en-US"))
    || normalized.includes(candidate.displayName.toLocaleLowerCase("en-US")));
}

export function expectedSemanticAttemptIds() {
  return MODEL_CASES.flatMap(item => ACCEPTANCE_POLICY.roster.flatMap(candidate =>
    Array.from({ length: ACCEPTANCE_POLICY.repetitionsPerCandidateCase }, (_, index) =>
      `${candidate.candidateId}--${item.id}--${index + 1}`)));
}

export function candidateBlindAttemptOrder(runtimeSealSha256) {
  if (!SHA.test(runtimeSealSha256 ?? "")) reject("runtime-seal-invalid", "runtimeSealSha256");
  return expectedSemanticAttemptIds().map(attemptId => ({
    attemptId,
    blindId: `attempt-${sha(`${CANDIDATE_BLIND_ORDER_VERSION}\0${runtimeSealSha256}\0${attemptId}`).slice(0, 24)}`,
  })).sort((left, right) => left.blindId.localeCompare(right.blindId));
}

export function semanticChecksForCase(caseId) {
  return enumerateCaseChecks(caseId).filter(requiresIndependentSemanticDecision);
}

function validatePacket(packet, attemptId, runtimeSealSha256, path) {
  record(packet, path);
  if (packet.attemptId !== attemptId) reject("packet-attempt-id-mismatch", `${path}/attemptId`);
  const rawBytes = bytes(packet.rawBytes), recordBytes = bytes(packet.recordBytes);
  if (!rawBytes) reject("evidence-bytes-required", `${path}/rawBytes`);
  if (!recordBytes) reject("evidence-bytes-required", `${path}/recordBytes`);
  const parsed = parseJson(rawBytes, `${path}/rawBytes`), ledger = parseJson(recordBytes, `${path}/recordBytes`);
  if (!same(parsed, packet.observation)) reject("observation-bytes-mismatch", `${path}/observation`);
  const [candidateId, caseId, repetitionText] = attemptId.match(/^(.+)--([a-z]+-\d{2}-[a-z0-9-]+)--([1-3])$/u)?.slice(1) ?? [];
  const item = MODEL_CASES.find(value => value.id === caseId), repetition = Number(repetitionText);
  if (!item || !ACCEPTANCE_POLICY.roster.some(value => value.candidateId === candidateId)) reject("attempt-id-extra", path);
  if (parsed.candidateId !== candidateId || parsed.caseId !== caseId || parsed.role !== item.role || parsed.repetition !== repetition)
    reject("observation-attempt-unbound", `${path}/observation`);
  if (parsed.caseBundleSha256 !== CASE_BUNDLE_SHA256 || parsed.runtimeSealSha256 !== runtimeSealSha256)
    reject("observation-seal-unbound", `${path}/observation`);
  const rawSha256 = sha(rawBytes), recordSha256 = sha(recordBytes);
  if (ledger.attemptId !== attemptId || ledger.file !== `${attemptId}.json` || ledger.status !== parsed.status
      || ledger.sha256 !== rawSha256 || ledger.bytes !== rawBytes.length)
    reject("record-observation-unbound", `${path}/recordBytes`);
  if (arr(parsed.evidence).some(entry => entry?.source === "independent-review")) reject("observation-already-reviewed", `${path}/observation/evidence`);
  return { packet, item, observation: parsed, rawSha256, recordSha256, candidateId, caseId, repetition };
}

function validateBindings(bindings, item, observation, path) {
  if (!Array.isArray(bindings)) reject("decision-bindings-invalid", path);
  const pointers = new Set();
  bindings.forEach((binding, index) => {
    const at = `${path}/${index}`;
    exactKeys(binding, ["pointer", "valueSha256", "excerpt"], at);
    text(binding.pointer, `${at}/pointer`);
    text(binding.excerpt, `${at}/excerpt`);
    if (!SHA.test(binding.valueSha256)) reject("binding-hash-invalid", `${at}/valueSha256`);
    if (pointers.has(binding.pointer)) reject("binding-duplicate", `${at}/pointer`);
    pointers.add(binding.pointer);
    const value = bindingValue(item, observation, binding.pointer);
    if (value === missing) reject("binding-unbound", `${at}/pointer`);
    if (jsonSha(value) !== binding.valueSha256) reject("binding-hash-mismatch", `${at}/valueSha256`);
    const rendered = typeof value === "string" ? value : JSON.stringify(value);
    if (typeof rendered !== "string" || !rendered.includes(binding.excerpt)) reject("binding-excerpt-mismatch", `${at}/excerpt`);
  });
  return pointers;
}

function validateFact(fact, expectedFact, index, evidenceState, reasonCode, path) {
  exactKeys(fact, ["factIndex", "expectedFact", "verdict", "reasonCode", "rationale"], path);
  if (fact.factIndex !== index || !same(fact.expectedFact, expectedFact)) reject("decision-fact-extra", path);
  text(fact.rationale, `${path}/rationale`, 20);
  if (candidateIdentityAppears(fact.rationale)) reject("candidate-identity-in-review", `${path}/rationale`);
  if (evidenceState === "readable") {
    if (fact.verdict === "pass" && fact.reasonCode !== "expected-fact-present") reject("decision-reason-invalid", `${path}/reasonCode`);
    if (fact.verdict === "fail" && !FAILURE_REASONS.has(fact.reasonCode)) reject("decision-reason-invalid", `${path}/reasonCode`);
    if (!new Set(["pass", "fail"]).has(fact.verdict)) reject("readable-fact-indeterminate", `${path}/verdict`);
  } else {
    const expectedReason = `evidence-${evidenceState}`;
    if (fact.verdict !== "uncertain" || fact.reasonCode !== expectedReason || fact.reasonCode !== reasonCode)
      reject("uncertain-reason-invalid", path);
  }
}

function validateCheckDecision(decision, check, item, observation, providerPointers, path) {
  exactKeys(decision, ["checkId", "verdict", "reasonCode", "rationale", "evidenceState", "bindings", "facts"], path);
  if (decision.checkId !== check.checkId) reject("decision-check-extra", `${path}/checkId`);
  text(decision.rationale, `${path}/rationale`, 20);
  if (candidateIdentityAppears(decision.rationale)) reject("candidate-identity-in-review", `${path}/rationale`);
  if (decision.evidenceState !== "readable" && !UNCERTAIN_STATES.has(decision.evidenceState))
    reject("decision-evidence-state-invalid", `${path}/evidenceState`);
  const boundPointers = validateBindings(decision.bindings, item, observation, `${path}/bindings`);
  const facts = expectedFacts(check);
  if (!Array.isArray(decision.facts)) reject("decision-facts-invalid", `${path}/facts`);
  if (decision.facts.length !== facts.length) reject(decision.facts.length < facts.length ? "decision-fact-missing" : "decision-fact-extra", `${path}/facts`);
  if (new Set(decision.facts.map(fact => fact.factIndex)).size !== decision.facts.length) reject("decision-fact-duplicate", `${path}/facts`);
  decision.facts.forEach((fact, index) => validateFact(fact, facts[index], index, decision.evidenceState, decision.reasonCode, `${path}/facts/${index}`));
  if (decision.evidenceState === "readable") {
    if (!decision.bindings.length) reject("readable-evidence-unbound", `${path}/bindings`);
    if (decision.verdict === "uncertain") reject("readable-check-indeterminate", `${path}/verdict`);
    const failedFacts = decision.facts.filter(fact => fact.verdict === "fail");
    const expectedVerdict = failedFacts.length ? "fail" : "pass";
    if (decision.verdict !== expectedVerdict) reject("decision-check-fact-mismatch", `${path}/verdict`);
    if (decision.verdict === "pass" && decision.reasonCode !== "expected-assertion-satisfied") reject("decision-reason-invalid", `${path}/reasonCode`);
    if (decision.verdict === "fail" && (!FAILURE_REASONS.has(decision.reasonCode)
        || !failedFacts.some(fact => fact.reasonCode === decision.reasonCode))) reject("decision-reason-invalid", `${path}/reasonCode`);
  } else {
    const expectedReason = `evidence-${decision.evidenceState}`;
    if (decision.verdict !== "uncertain" || decision.reasonCode !== expectedReason) reject("uncertain-reason-invalid", path);
  }
  if (check.kind === "policy.criticalModelBehaviors") {
    for (const pointer of providerPointers) if (!boundPointers.has(pointer)) reject("critical-output-unreviewed", `${path}/bindings`, pointer);
  }
}

function expectedProviderOutputs(observation) {
  return arr(observation.provider?.calls).flatMap((call, index) => call.response === null || call.response === undefined ? [] : [{
    pointer: `#/provider/calls/${index}/response`, sha256: jsonSha(call.response),
  }]);
}

function validateAttemptDecision(decision, reviewed, blindId, path) {
  exactKeys(decision, ["blindId", "rawSha256", "recordSha256", "providerOutputs", "checks"], path);
  if (decision.blindId !== blindId) reject("blind-order-mismatch", `${path}/blindId`);
  if (decision.rawSha256 !== reviewed.rawSha256) reject("raw-hash-mismatch", `${path}/rawSha256`);
  if (decision.recordSha256 !== reviewed.recordSha256) reject("record-hash-mismatch", `${path}/recordSha256`);
  if (!Array.isArray(decision.providerOutputs)) reject("provider-output-list-invalid", `${path}/providerOutputs`);
  const expectedOutputs = expectedProviderOutputs(reviewed.observation);
  if (decision.providerOutputs.length !== expectedOutputs.length) reject(decision.providerOutputs.length < expectedOutputs.length
    ? "provider-output-missing" : "provider-output-extra", `${path}/providerOutputs`);
  const outputPointers = new Set();
  decision.providerOutputs.forEach((output, index) => {
    const at = `${path}/providerOutputs/${index}`;
    exactKeys(output, ["pointer", "sha256"], at);
    if (outputPointers.has(output.pointer)) reject("provider-output-duplicate", `${at}/pointer`);
    outputPointers.add(output.pointer);
    if (!same(output, expectedOutputs[index])) reject(output.pointer !== expectedOutputs[index]?.pointer
      ? "provider-output-extra" : "provider-output-hash-mismatch", at);
  });
  if (!Array.isArray(decision.checks)) reject("decision-check-list-invalid", `${path}/checks`);
  const checks = semanticChecksForCase(reviewed.caseId);
  if (decision.checks.length !== checks.length) reject(decision.checks.length < checks.length ? "decision-check-missing" : "decision-check-extra", `${path}/checks`);
  if (new Set(decision.checks.map(check => check.checkId)).size !== decision.checks.length) reject("decision-check-duplicate", `${path}/checks`);
  decision.checks.forEach((entry, index) => validateCheckDecision(entry, checks[index], reviewed.item, reviewed.observation,
    new Set(expectedOutputs.map(output => output.pointer)), `${path}/checks/${index}`));
  return { ...reviewed, blindId, decision, checks, providerOutputsCovered: expectedOutputs.length };
}

export function validateExplicitSemanticDecisions({ bundle, packets, runtimeSealSha256, evaluatorId,
  rubricVersion = EXPLICIT_SEMANTIC_RUBRIC_VERSION } = {}) {
  exactKeys(bundle, ["schemaVersion", "evaluatorId", "rubricVersion", "reviewerIndependence", "caseBundleSha256",
    "runtimeSealSha256", "candidateBlindOrderVersion", "attemptOrderSha256", "attempts"], "bundle");
  if (bundle.schemaVersion !== EXPLICIT_SEMANTIC_DECISION_SCHEMA_VERSION) reject("decision-schema-invalid", "bundle/schemaVersion");
  text(evaluatorId, "options/evaluatorId");
  if (bundle.evaluatorId !== evaluatorId || bundle.rubricVersion !== rubricVersion) reject("evaluator-rubric-unbound", "bundle");
  if (bundle.reviewerIndependence !== REVIEWER_INDEPENDENCE_DECLARATION) reject("reviewer-independence-unbound", "bundle/reviewerIndependence");
  if (bundle.caseBundleSha256 !== CASE_BUNDLE_SHA256 || bundle.runtimeSealSha256 !== runtimeSealSha256 || !SHA.test(runtimeSealSha256 ?? ""))
    reject("decision-seal-unbound", "bundle");
  if (bundle.candidateBlindOrderVersion !== CANDIDATE_BLIND_ORDER_VERSION) reject("blind-order-version-invalid", "bundle/candidateBlindOrderVersion");
  if (!Array.isArray(packets) || !Array.isArray(bundle.attempts)) reject("attempt-list-invalid", "bundle/attempts");
  const mapping = candidateBlindAttemptOrder(runtimeSealSha256), expectedIds = new Set(mapping.map(entry => entry.attemptId));
  const expectedOrderSha256 = sha(mapping.map(entry => entry.blindId).join("\n"));
  if (bundle.attemptOrderSha256 !== expectedOrderSha256) reject("blind-order-hash-mismatch", "bundle/attemptOrderSha256");
  if (packets.length !== mapping.length) reject(packets.length < mapping.length ? "packet-attempt-missing" : "packet-attempt-extra", "packets");
  if (bundle.attempts.length !== mapping.length) reject(bundle.attempts.length < mapping.length ? "decision-attempt-missing" : "decision-attempt-extra", "bundle/attempts");
  const packetMap = new Map();
  packets.forEach((packet, index) => {
    if (packetMap.has(packet?.attemptId)) reject("packet-attempt-duplicate", `packets/${index}/attemptId`);
    if (!expectedIds.has(packet?.attemptId)) reject("packet-attempt-extra", `packets/${index}/attemptId`);
    packetMap.set(packet.attemptId, packet);
  });
  for (const attemptId of expectedIds) if (!packetMap.has(attemptId)) reject("packet-attempt-missing", `packets/${attemptId}`);
  const blindIds = new Set();
  const attempts = mapping.map((entry, index) => {
    const decision = bundle.attempts[index], at = `bundle/attempts/${index}`;
    if (blindIds.has(decision?.blindId)) reject("decision-attempt-duplicate", `${at}/blindId`);
    blindIds.add(decision?.blindId);
    const reviewed = validatePacket(packetMap.get(entry.attemptId), entry.attemptId, runtimeSealSha256, `packets/${entry.attemptId}`);
    return validateAttemptDecision(decision, reviewed, entry.blindId, at);
  });
  return Object.freeze({ schemaVersion: "runaai-m1-explicit-semantic-validation/v1", valid: true,
    evaluatorId, rubricVersion, runtimeSealSha256, caseBundleSha256: CASE_BUNDLE_SHA256,
    attempts, providerOutputsCovered: attempts.reduce((count, attempt) => count + attempt.providerOutputsCovered, 0) });
}

function materialize(attempt, evaluatorId) {
  const observation = structuredClone(attempt.observation);
  for (let index = 0; index < attempt.checks.length; index += 1) {
    const descriptor = attempt.checks[index], decision = attempt.decision.checks[index];
    observation.evidence.push({
      id: `semantic-${sha(`${attempt.rawSha256}\0${descriptor.checkId}`).slice(0, 24)}`,
      source: "independent-review",
      kind: "semantic-assertion",
      data: {
        schemaVersion: EXPLICIT_SEMANTIC_EVIDENCE_SCHEMA_VERSION,
        checkId: descriptor.checkId,
        phase: descriptor.phase,
        evaluatorId,
        verdict: decision.verdict,
        reasonCode: decision.reasonCode,
        rationale: decision.rationale,
        quotes: decision.bindings.map(binding => ({ pointer: binding.pointer, text: binding.excerpt })),
        facts: decision.facts.map(fact => ({ factIndex: fact.factIndex, expectedFact: structuredClone(fact.expectedFact),
          verdict: fact.verdict, reasonCode: fact.reasonCode, rationale: fact.rationale })),
      },
    });
  }
  return observation;
}

export function gradeExplicitSemanticCampaign(input = {}) {
  const validated = validateExplicitSemanticDecisions(input), expectedModelIds = input.expectedModelIds;
  record(expectedModelIds, "options/expectedModelIds");
  const candidateIds = ACCEPTANCE_POLICY.roster.map(candidate => candidate.candidateId);
  for (const candidateId of candidateIds) text(expectedModelIds[candidateId], `options/expectedModelIds/${candidateId}`);
  for (const key of Object.keys(expectedModelIds)) if (!candidateIds.includes(key)) reject("expected-model-extra", `options/expectedModelIds/${key}`);
  const attempts = validated.attempts.map(attempt => {
    const observation = materialize(attempt, validated.evaluatorId);
    return { attemptId: attempt.packet.attemptId, blindId: attempt.blindId, rawSha256: attempt.rawSha256,
      recordSha256: attempt.recordSha256, grade: evaluateAttempt(attempt.caseId, observation, {
        runtimeSealSha256: validated.runtimeSealSha256, evaluatorId: validated.evaluatorId,
        expectedModelId: expectedModelIds[attempt.candidateId],
      }) };
  });
  const grades = attempts.map(attempt => attempt.grade);
  return Object.freeze({ schemaVersion: "runaai-m1-explicit-semantic-campaign-grade/v1", evaluatorId: validated.evaluatorId,
    rubricVersion: validated.rubricVersion, runtimeSealSha256: validated.runtimeSealSha256,
    caseBundleSha256: CASE_BUNDLE_SHA256, attempts, providerOutputsCovered: validated.providerOutputsCovered,
    summary: summarizeCampaign(grades) });
}
