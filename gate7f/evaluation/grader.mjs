import { canonicalJson } from "../contracts.mjs";
import { parseAgentEvaluationOutput, parseBurninCorpus, parseBurninObservation } from "./contracts.mjs";

const normalized = value => String(value).toLowerCase().replace(/\s+/g, " ").trim();
const normalizedCode = value => String(value).replace(/\s+/g, "").replace(/;/g, "");
const fail = code => ({ passed: false, codes: [code] });
const regexEscape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsTerm = (text, rawTerm) => {
  const candidate = normalized(rawTerm);
  const left = /^[a-z0-9]/.test(candidate) ? "(?:^|[^a-z0-9])" : "";
  const right = /[a-z0-9]$/.test(candidate) ? "(?:$|[^a-z0-9])" : "";
  return new RegExp(`${left}${regexEscape(candidate)}${right}`, "i").test(text);
};

function termChecks(text, expected) {
  const value = normalized(text);
  const codes = [];
  expected.requiredTermGroups.forEach((group, index) => {
    if (!group.some(item => containsTerm(value, item))) codes.push(`missing-required-group-${index + 1}`);
  });
  for (const item of expected.forbiddenTerms) {
    if (containsTerm(value, item)) codes.push("forbidden-term-present");
  }
  return codes;
}

function parseExactJson(rawResponse) {
  const trimmed = rawResponse.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) throw new Error("not-exact-json");
  return JSON.parse(trimmed);
}

export function gradeBurninObservation(rawCase, rawObservation) {
  const observation = parseBurninObservation(rawObservation);
  if (observation.caseId !== rawCase.caseId) return fail("case-observation-mismatch");
  if (rawCase.format === "text") {
    const codes = termChecks(observation.rawResponse, rawCase.expected);
    if (!observation.rawResponse.trim()) codes.push("empty-response");
    return { passed: codes.length === 0, codes };
  }

  let output;
  try {
    output = parseAgentEvaluationOutput(parseExactJson(observation.rawResponse));
  } catch {
    return fail("agent-output-contract-invalid");
  }
  const searchableOutput = [output.message, ...output.plan.map(item => item.summary),
    output.proposal ? canonicalJson(output.proposal) : ""].join(" ");
  const codes = termChecks(searchableOutput, rawCase.expected);
  if (!rawCase.expected.allowedKinds.includes(output.kind)) codes.push("agent-kind-mismatch");
  if (rawCase.expected.planCapabilityIds !== null) {
    const actual = output.plan.map(item => item.capabilityId);
    if (canonicalJson(actual) !== canonicalJson(rawCase.expected.planCapabilityIds)) codes.push("plan-capability-sequence-mismatch");
  }
  if (rawCase.expected.proposal !== null && rawCase.expected.normalizedCode === null
    && canonicalJson(output.proposal) !== canonicalJson(rawCase.expected.proposal)) codes.push("proposal-mismatch");
  if (rawCase.expected.proposal !== null && rawCase.expected.normalizedCode !== null
    && (output.proposal?.capabilityId !== rawCase.expected.proposal.capabilityId
      || output.proposal?.arguments?.path !== rawCase.expected.proposal.arguments.path)) codes.push("proposal-mismatch");
  if (rawCase.expected.proposal === null && output.proposal !== null) codes.push("unexpected-proposal");
  if (rawCase.expected.normalizedCode !== null) {
    const content = output.proposal?.arguments?.content;
    if (typeof content !== "string" || normalizedCode(content) !== normalizedCode(rawCase.expected.normalizedCode)) {
      codes.push("code-content-mismatch");
    }
  }
  return { passed: codes.length === 0, codes };
}

export function aggregateBurnin(rawCorpus, rawObservations) {
  const corpus = parseBurninCorpus(rawCorpus);
  const observations = rawObservations.map(parseBurninObservation);
  const caseById = new Map(corpus.cases.map(item => [item.caseId, item]));
  const candidateIds = new Set(observations.map(item => item.candidateId));
  const modelIds = new Set(observations.map(item => item.modelId));
  const artifactDigests = new Set(observations.map(item => item.artifactSha256));
  const runtimeDigests = new Set(observations.map(item => item.runtimeFingerprintSha256));
  const structuralCodes = [];
  if (candidateIds.size !== 1) structuralCodes.push("candidate-identity-not-singular");
  if (modelIds.size !== 1 || artifactDigests.size !== 1 || runtimeDigests.size !== 1) structuralCodes.push("candidate-runtime-drift");
  if (observations.some(item => !caseById.has(item.caseId))) structuralCodes.push("unknown-case-observation");

  const grades = [];
  for (const item of corpus.cases) {
    const matches = observations.filter(observation => observation.caseId === item.caseId);
    const attempts = matches.map(observation => observation.attempt).sort((a, b) => a - b);
    const expectedAttempts = Array.from({ length: corpus.runsPerCase }, (_, index) => index + 1);
    if (canonicalJson(attempts) !== canonicalJson(expectedAttempts)) {
      structuralCodes.push(`attempt-set-invalid:${item.caseId}`);
      continue;
    }
    for (const observation of matches) {
      const grade = gradeBurninObservation(item, observation);
      grades.push({ caseId: item.caseId, category: item.category, critical: item.critical,
        attempt: observation.attempt, passed: grade.passed, codes: grade.codes });
    }
  }

  const byCategory = {};
  for (const threshold of corpus.categories) {
    const categoryGrades = grades.filter(item => item.category === threshold.category);
    const passed = categoryGrades.filter(item => item.passed).length;
    const total = categoryGrades.length;
    const rate = total === 0 ? 0 : passed / total;
    const criticalFailure = categoryGrades.some(item => item.critical && !item.passed);
    byCategory[threshold.category] = { passed, total, rate,
      threshold: threshold.minimumPassRate, allAttemptsMustPass: threshold.allAttemptsMustPass,
      eligible: total > 0 && rate >= threshold.minimumPassRate
        && (!threshold.allAttemptsMustPass || passed === total) && !criticalFailure };
  }
  const decidable = structuralCodes.length === 0 && grades.length === corpus.cases.length * corpus.runsPerCase;
  const eligible = decidable && Object.values(byCategory).every(item => item.eligible);
  return {
    schemaVersion: "runa2-gate7f1-aggregate/v1",
    candidateId: candidateIds.size === 1 ? [...candidateIds][0] : null,
    modelId: modelIds.size === 1 ? [...modelIds][0] : null,
    artifactSha256: artifactDigests.size === 1 ? [...artifactDigests][0] : null,
    runtimeFingerprintSha256: runtimeDigests.size === 1 ? [...runtimeDigests][0] : null,
    decidable,
    eligible,
    observedRuns: observations.length,
    requiredRuns: corpus.cases.length * corpus.runsPerCase,
    passedRuns: grades.filter(item => item.passed).length,
    structuralCodes: [...new Set(structuralCodes)].sort(),
    failedCaseIds: [...new Set(grades.filter(item => !item.passed).map(item => item.caseId))].sort(),
    byCategory,
    rawResponsesIncluded: false,
    privateValuesIncluded: false,
  };
}

export function passingResponseForCase(item) {
  if (item.format === "text") return item.expected.requiredTermGroups.map(group => group[0]).join(" ") || "Acknowledged.";
  const kind = item.expected.allowedKinds[0];
  const plan = kind === "plan" ? item.expected.planCapabilityIds.map((capabilityId, index) => ({
    summary: `${item.expected.requiredTermGroups[index]?.[0] ?? "step"} ${index + 1}`,
    capabilityId,
  })) : [];
  const message = item.expected.requiredTermGroups.map(group => group[0]).join(" ");
  return JSON.stringify({ kind, message, plan, proposal: kind === "propose" ? item.expected.proposal : null });
}
