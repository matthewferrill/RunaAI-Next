import { createHash } from "node:crypto";
import { chmod, readFile, readdir, writeFile } from "node:fs/promises";
import { isDeepStrictEqual as same } from "node:util";
import path from "node:path";
import { ACCEPTANCE_POLICY, CASE_BUNDLE_SHA256, MODEL_CASES } from "../../gate7f/function-first/acceptance/cases.mjs";
import {
  CANDIDATE_BLIND_ORDER_VERSION,
  EXPLICIT_SEMANTIC_DECISION_SCHEMA_VERSION,
  EXPLICIT_SEMANTIC_RUBRIC_VERSION,
  REVIEWER_INDEPENDENCE_DECLARATION,
  candidateBlindAttemptOrder,
  gradeExplicitSemanticCampaign,
  semanticChecksForCase,
  validateExplicitSemanticDecisions,
} from "../../gate7f/function-first/acceptance/independent-semantic-review.mjs";

const ROOT = path.resolve(".");
const WORK = path.resolve("artifacts/independent-semantic-r13");
const PACKETS = path.resolve("artifacts/m1-readiness/20260901-r13-valid-campaigns");
const runtimeSealSha256 = "abf15d75fd33df9f4f7b9966e450075d93b6cd18dd275c89afabece76f3bca87";
const sourceCommit = "d0b8f23db1bcc149764e19936559a8a9df468205";
const evaluatorId = "independent-semantic-r13-evaluator";
const expectedResultHashes = Object.freeze({
  "gemma4-26b-a4b": "9ff72556d987e564ccf773f97743d30ed3dec957e1528ca9ded7094e7467e3fd",
  "qwen3-coder-30b-a3b": "72acf8b01c9c56a9fcaa62dfb9e0400e75d0122afd32532819141fd8f799bebb",
  "qwen36-27b-mtp": "16dcad14af943bf6a3d4580696c6da3bc7b5b244b59084a59ddd51b3d50f1940",
});
const sha256 = value => createHash("sha256").update(value).digest("hex");
const jsonSha256 = value => sha256(Buffer.from(JSON.stringify(value), "utf8"));
const parse = bytes => JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
const rel = file => path.relative(ROOT, file).replaceAll("\\", "/");
const outputText = call => {
  const response = call?.response;
  if (response === null || response === undefined) return null;
  const message = response?.choices?.[0]?.message;
  return typeof message?.content === "string" ? message.content
    : typeof response?.text === "string" ? response.text : JSON.stringify(response);
};
const short = value => String(value ?? "").slice(0, 240) || "empty";
const providerToken = value => String(value ?? "").match(/[\p{L}\p{N}_-]{3,}/u)?.[0] ?? String(value ?? "").slice(0, 1);
const writeCreateOnly = async (file, value) => {
  const bytes = Buffer.from(typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await writeFile(file, bytes, { flag: "wx" });
  return { path: rel(file), bytes: bytes.length, sha256: sha256(bytes) };
};

const worksheetBytes = await readFile(path.join(WORK, "review-worksheet.json"));
const decisionsBytes = await readFile(path.join(WORK, "review-decisions.json"));
const inputManifestBytes = await readFile(path.join(WORK, "review-input-manifest.json"));
const worksheet = parse(worksheetBytes), decisions = parse(decisionsBytes), inputManifest = parse(inputManifestBytes);
if (worksheet.attempts?.length !== 360 || worksheet.candidateIdentityOmittedFromRows !== true
    || decisions.attempts?.length !== 360 || decisions.candidateIdentityKnownDuringReview !== false
    || decisions.evaluatorId !== evaluatorId || decisions.rubricVersion !== EXPLICIT_SEMANTIC_RUBRIC_VERSION
    || decisions.reviewerIndependence !== REVIEWER_INDEPENDENCE_DECLARATION
    || decisions.caseBundleSha256 !== CASE_BUNDLE_SHA256 || decisions.runtimeSealSha256 !== runtimeSealSha256
    || decisions.worksheetSha256 !== sha256(worksheetBytes)
    || decisions.candidateBlindOrderVersion !== CANDIDATE_BLIND_ORDER_VERSION
    || inputManifest.worksheet?.sha256 !== sha256(worksheetBytes))
  throw new Error("blind-review-bundle-unbound");

const packetDirectories = (await readdir(PACKETS, { withFileTypes: true }))
  .filter(entry => entry.isDirectory() && entry.name.startsWith("campaign-"))
  .map(entry => path.join(PACKETS, entry.name)).sort();
if (packetDirectories.length !== 3) throw new Error(`packet-directory-count:${packetDirectories.length}`);
const packets = [], packetMap = new Map(), expectedModelIds = {}, packetInputs = [];
let controlsSha256 = null, controlsBytes = null;
for (const directory of packetDirectories) {
  const sealBytes = await readFile(path.join(directory, "runtimeSeal.json")), seal = parse(sealBytes);
  if (sha256(sealBytes) !== runtimeSealSha256 || seal.sourceCommit !== sourceCommit
      || seal.caseBundleSha256 !== CASE_BUNDLE_SHA256) throw new Error(`runtime-seal-binding:${directory}`);
  for (const candidate of seal.candidates ?? []) expectedModelIds[candidate.candidateId] = candidate.modelId;
  const resultBytes = await readFile(path.join(directory, "result.json")), result = parse(resultBytes);
  if (expectedResultHashes[result.candidateId] !== sha256(resultBytes)
      || result.runtimeSealSha256 !== runtimeSealSha256 || result.attempts?.length !== 120)
    throw new Error(`result-binding:${directory}`);
  const localControlsBytes = await readFile(path.join(directory, "controls.json")), control = parse(localControlsBytes);
  if (control.attempts?.length !== 12 || control.attempts.some(attempt => attempt.grade?.status !== "pass")
      || control.modelsInvoked !== false || control.productionChanged !== false || control.protectedDataRead !== false)
    throw new Error(`controls-not-green:${directory}`);
  controlsSha256 ??= sha256(localControlsBytes); controlsBytes ??= localControlsBytes;
  if (controlsSha256 !== sha256(localControlsBytes)) throw new Error("controls-not-byte-identical");
  for (const entry of result.attempts) {
    const rawBytes = await readFile(path.join(directory, entry.file));
    const recordBytes = await readFile(path.join(directory, `${entry.attemptId}.record.json`));
    const observation = parse(rawBytes), record = parse(recordBytes);
    if (sha256(rawBytes) !== entry.sha256 || record.sha256 !== entry.sha256 || record.bytes !== rawBytes.length)
      throw new Error(`attempt-binding:${entry.attemptId}`);
    const packet = { attemptId: entry.attemptId, rawBytes, recordBytes, observation };
    if (packetMap.has(entry.attemptId)) throw new Error(`attempt-duplicate:${entry.attemptId}`);
    packetMap.set(entry.attemptId, packet); packets.push(packet);
  }
  packetInputs.push({ candidateId: result.candidateId, directory: rel(directory),
    resultSha256: sha256(resultBytes), attempts: result.attempts.length });
}
if (packets.length !== 360) throw new Error(`packet-count:${packets.length}`);

const mapping = candidateBlindAttemptOrder(runtimeSealSha256);
if (decisions.attemptOrderSha256 !== sha256(mapping.map(entry => entry.blindId).join("\n")))
  throw new Error("blind-order-hash-mismatch");
const worksheetMap = new Map(worksheet.attempts.map(row => [row.blindId, row]));
const decisionMap = new Map(decisions.attempts.map(row => [row.blindId, row]));
const caseMap = new Map(MODEL_CASES.map(item => [item.id, item]));

function worksheetRow(packet, blindId) {
  const observation = packet.observation;
  return { blindId, caseId: observation.caseId, role: observation.role, repetition: observation.repetition,
    observationStatus: observation.status, deterministicGrade: observation.grade?.status ?? null,
    failures: observation.failures ?? [], unresolved: observation.unresolved ?? [],
    providerOutputs: (observation.provider?.calls ?? []).flatMap((call, index) =>
      call.response === null || call.response === undefined ? [] : [{ index, text: outputText(call) }]),
    answers: (observation.application?.requests ?? []).flatMap((request, index) => request.operation === "answer"
      ? [{ requestIndex: index, phase: request.phase, answer: request.response?.answer ?? null,
        citations: request.response?.citations ?? null }] : []),
    planSummaries: (observation.workflow?.run?.plans ?? []).map((plan, index) => ({ index, summary: plan.summary ?? null })),
    selectedSources: (observation.sources?.selected ?? observation.sources?.canonical ?? [])
      .map((source, index) => ({ index, content: source.content ?? null })),
    semanticChecks: semanticChecksForCase(observation.caseId) };
}

function worksheetBindingValue(row, item, pointer) {
  let match = /^#worksheet\/providerOutputs\/(\d+)\/text$/u.exec(pointer);
  if (match) return row.providerOutputs.find(entry => entry.index === Number(match[1]))?.text;
  match = /^#worksheet\/answers\/(\d+)\/answer$/u.exec(pointer);
  if (match) return row.answers.find(entry => entry.requestIndex === Number(match[1]))?.answer;
  match = /^#worksheet\/planSummaries\/(\d+)\/summary$/u.exec(pointer);
  if (match) return row.planSummaries.find(entry => entry.index === Number(match[1]))?.summary;
  match = /^case#\/setup\/sources\/(\d+)\/content$/u.exec(pointer);
  if (match) return item.setup?.sources?.[Number(match[1])]?.content;
  return undefined;
}

function directBinding(binding, row, item, observation) {
  const reviewedValue = worksheetBindingValue(row, item, binding.pointer);
  if (reviewedValue === undefined || jsonSha256(reviewedValue) !== binding.valueSha256
      || !String(typeof reviewedValue === "string" ? reviewedValue : JSON.stringify(reviewedValue)).includes(binding.excerpt))
    throw new Error(`reviewer-binding-unbound:${row.blindId}:${binding.pointer}`);
  let match = /^#worksheet\/providerOutputs\/(\d+)\/text$/u.exec(binding.pointer);
  if (match) {
    const index = Number(match[1]), response = observation.provider.calls[index].response;
    return { pointer: `#/provider/calls/${index}/response`, valueSha256: jsonSha256(response),
      excerpt: providerToken(reviewedValue) };
  }
  match = /^#worksheet\/answers\/(\d+)\/answer$/u.exec(binding.pointer);
  if (match) return { pointer: `#/application/requests/${match[1]}/response/answer`,
    valueSha256: jsonSha256(reviewedValue), excerpt: short(reviewedValue) };
  match = /^#worksheet\/planSummaries\/(\d+)\/summary$/u.exec(binding.pointer);
  if (match) return { pointer: `#/workflow/run/plans/${match[1]}/summary`,
    valueSha256: jsonSha256(reviewedValue), excerpt: short(reviewedValue) };
  return { pointer: binding.pointer, valueSha256: jsonSha256(reviewedValue), excerpt: short(reviewedValue) };
}

function runtimeBinding(check, binding, item) {
  const source = /^case#\/setup\/sources\/(\d+)\/content$/u.exec(binding.pointer);
  if (!source) return true;
  if (check.kind !== "citations.claimSupport") return false;
  const alias = item.setup?.sources?.[Number(source[1])]?.alias;
  return item.setup?.selected?.includes(alias) === true;
}

const directAttempts = mapping.map(entry => {
  const packet = packetMap.get(entry.attemptId), row = worksheetMap.get(entry.blindId), decision = decisionMap.get(entry.blindId);
  const rebuilt = worksheetRow(packet, entry.blindId), item = caseMap.get(packet.observation.caseId);
  if (!row || !decision || !same(row, rebuilt) || decision.rowSha256 !== jsonSha256(row)
      || decision.providerOutputs.length !== row.providerOutputs.length
      || decision.providerOutputs.some((output, index) => output.index !== row.providerOutputs[index].index
        || output.textSha256 !== jsonSha256(row.providerOutputs[index].text)))
    throw new Error(`worksheet-decision-unbound:${entry.blindId}`);
  return { blindId: entry.blindId, rawSha256: sha256(packet.rawBytes), recordSha256: sha256(packet.recordBytes),
    providerOutputs: (packet.observation.provider?.calls ?? []).flatMap((call, index) =>
      call.response === null || call.response === undefined ? []
        : [{ pointer: `#/provider/calls/${index}/response`, sha256: jsonSha256(call.response) }]),
    checks: decision.checks.map(check => ({ checkId: check.checkId, verdict: check.verdict,
      reasonCode: check.reasonCode, rationale: check.rationale, evidenceState: check.evidenceState,
      // Source bindings prove what the blind reviewer compared against, but the
      // runtime semantic evidence for ordinary answer checks must quote the
      // surfaced answer itself. Citation-support checks are the one grader path
      // that also consumes selected-source quotations directly.
      bindings: check.bindings
        .filter(binding => runtimeBinding(check, binding, item))
        .map(binding => directBinding(binding, row, item, packet.observation)),
      facts: check.facts })) };
});
const bundle = { schemaVersion: EXPLICIT_SEMANTIC_DECISION_SCHEMA_VERSION, evaluatorId,
  rubricVersion: EXPLICIT_SEMANTIC_RUBRIC_VERSION, reviewerIndependence: REVIEWER_INDEPENDENCE_DECLARATION,
  caseBundleSha256: CASE_BUNDLE_SHA256, runtimeSealSha256,
  candidateBlindOrderVersion: CANDIDATE_BLIND_ORDER_VERSION, attemptOrderSha256: decisions.attemptOrderSha256,
  attempts: directAttempts };
const validated = validateExplicitSemanticDecisions({ bundle, packets, runtimeSealSha256, evaluatorId });
const grade = gradeExplicitSemanticCampaign({ bundle, packets, runtimeSealSha256, evaluatorId, expectedModelIds });

const controlsPassed = controlsSha256 !== null;
const candidates = grade.summary.candidates.map(candidate => ({ candidateId: candidate.candidateId,
  displayName: ACCEPTANCE_POLICY.roster.find(item => item.candidateId === candidate.candidateId)?.displayName,
  roles: candidate.roles.map(role => ({ role: role.role, planned: role.planned, recorded: role.recorded,
    acceptable: role.acceptable, acceptableRate: role.acceptableRate, failed: role.failed, blocked: role.blocked,
    criticalModelFailures: role.criticalModelFailures, criticalProductFailures: role.criticalProductFailures,
    threshold: 22, qualified: role.recorded === 24 && role.acceptable >= 22 && role.failed <= 2 && role.blocked === 0
      && role.criticalModelFailures === 0 && role.criticalProductFailures === 0 && controlsPassed })),
}));
for (const candidate of candidates) candidate.qualifiedAllFive = candidate.roles.every(role => role.qualified);
const roleRoutes = ACCEPTANCE_POLICY.roles.map(role => {
  const eligibleCandidates = candidates.flatMap(candidate => {
    const score = candidate.roles.find(item => item.role === role);
    return score.qualified ? [{ candidateId: candidate.candidateId, acceptable: score.acceptable,
      failed: score.failed }] : [];
  }).sort((left, right) => right.acceptable - left.acceptable || left.failed - right.failed
    || left.candidateId.localeCompare(right.candidateId));
  return { role, eligibleCandidates, qualifyingRouteExists: eligibleCandidates.length > 0,
    recommendedCandidateId: eligibleCandidates[0]?.candidateId ?? null };
});
const allFiveFunctionsHaveQualifyingRoute = roleRoutes.every(route => route.qualifyingRouteExists);
const scorecards = { schemaVersion: "runaai-m1-r13-role-scorecards/v1", evaluatorId,
  rubricVersion: EXPLICIT_SEMANTIC_RUBRIC_VERSION, caseBundleSha256: CASE_BUNDLE_SHA256,
  sourceCommit, runtimeSealSha256, reviewDecisionsSha256: sha256(decisionsBytes),
  directDecisionBundleSha256: jsonSha256(bundle), worksheetSha256: sha256(worksheetBytes),
  attempts: 360, determinateAttempts: grade.attempts.filter(attempt =>
    !["inconclusive", "blocked", "not-implemented"].includes(attempt.grade.status)).length,
  indeterminateAttempts: grade.attempts.filter(attempt =>
    ["inconclusive", "blocked", "not-implemented"].includes(attempt.grade.status))
    .map(attempt => ({ attemptId: attempt.attemptId, blindId: attempt.blindId,
      candidateId: attempt.grade.candidateId, role: attempt.grade.role, caseId: attempt.grade.caseId,
      repetition: attempt.grade.repetition, status: attempt.grade.status, problems: attempt.grade.problems })),
  controls: { planned: 12, passed: 12, allPassed: controlsPassed, sha256: controlsSha256 },
  candidates, roleRoutes, allFiveFunctionsHaveQualifyingRoute,
  productQualificationPassed: allFiveFunctionsHaveQualifyingRoute,
  customerTrialReady: allFiveFunctionsHaveQualifyingRoute,
  productionRoutingChanged: false, humanTrialStillRequired: true };

const bundleEntry = await writeCreateOnly(path.join(WORK, "explicit-semantic-decisions.json"), bundle);
const gradeEntry = await writeCreateOnly(path.join(WORK, "campaign-grade.json"), grade);
const scorecardEntry = await writeCreateOnly(path.join(WORK, "role-scorecards.json"), scorecards);
const validator = { schemaVersion: "runaai-m1-independent-semantic-validator-output/v1", valid: validated.valid,
  evaluatorId, rubricVersion: validated.rubricVersion, sourceCommit, runtimeSealSha256,
  caseBundleSha256: validated.caseBundleSha256, attemptsValidated: validated.attempts.length,
  providerOutputsCovered: validated.providerOutputsCovered, rawRecordsBound: packets.length,
  semanticChecksReviewed: decisions.attempts.reduce((sum, attempt) => sum + attempt.checks.length, 0),
  failedChecks: decisions.attempts.reduce((sum, attempt) => sum + attempt.checks.filter(check => check.verdict === "fail").length, 0),
  controlsPassed: 12, candidateIdentityKnownDuringReview: false };
const validatorEntry = await writeCreateOnly(path.join(WORK, "validator-output.json"), validator);
const lines = ["# R13 independent semantic review", "",
  `Source: \`${sourceCommit}\``, `Runtime seal: \`${runtimeSealSha256}\``, "",
  `The fresh candidate-blind reviewer decided ${validator.semanticChecksReviewed} semantic checks across 360 attempts and covered ${validated.providerOutputsCovered} retained provider outputs.`,
  `${validator.failedChecks} semantic checks failed. The exact candidate identities were not available while those decisions were authored.`, "",
  "## Role scorecards", "", "| Candidate | Chat | Research | Code | Agent | Review |", "|---|---:|---:|---:|---:|---:|",
  ...candidates.map(candidate => `| ${candidate.displayName} | ${ACCEPTANCE_POLICY.roles.map(role => {
    const score = candidate.roles.find(item => item.role === role); return `${score.acceptable}/24${score.qualified ? " qualified" : ""}`;
  }).join(" | ")} |`), "", "## Route disposition", "",
  ...roleRoutes.map(route => `- ${route.role}: ${route.qualifyingRouteExists ? `recommended \`${route.recommendedCandidateId}\`; eligible ${route.eligibleCandidates.map(item => `\`${item.candidateId}\``).join(", ")}` : "no qualifying candidate"}.`), "",
  allFiveFunctionsHaveQualifyingRoute
    ? "All five functions have an independently qualified route. Automated product qualification passed and the bounded customer trial is ready; the human trial is still required before M1 can complete."
    : "At least one function has no independently qualified route. Automated product qualification failed and the customer trial remains unavailable.",
  "", "No production route changed and no protected data was read by this campaign.", ""];
const reportEntry = await writeCreateOnly(path.join(WORK, "report.md"), `${lines.join("\n")}\n`);
const manifest = { schemaVersion: "runaai-m1-independent-semantic-r13-manifest/v1", createdAt: new Date().toISOString(),
  evaluatorId, reviewerIndependence: decisions.reviewerIndependence, candidateIdentityKnownDuringReview: false,
  sourceCommit, runtimeSealSha256, caseBundleSha256: CASE_BUNDLE_SHA256,
  worksheetSha256: sha256(worksheetBytes), reviewDecisionsSha256: sha256(decisionsBytes),
  inputManifestSha256: sha256(inputManifestBytes), controlsSha256, packetInputs,
  validation: { valid: validated.valid, attempts: validated.attempts.length,
    providerOutputsCovered: validated.providerOutputsCovered, semanticChecks: validator.semanticChecksReviewed,
    failedChecks: validator.failedChecks, rawRecordsBound: packets.length },
  outputs: [bundleEntry, gradeEntry, scorecardEntry, validatorEntry, reportEntry],
  productQualificationPassed: allFiveFunctionsHaveQualifyingRoute,
  customerTrialReady: allFiveFunctionsHaveQualifyingRoute, humanTrialStillRequired: true,
  productionRoutingChanged: false };
const manifestEntry = await writeCreateOnly(path.join(WORK, "manifest.json"), manifest);
for (const name of ["explicit-semantic-decisions.json", "campaign-grade.json", "role-scorecards.json",
  "validator-output.json", "report.md", "manifest.json"]) await chmod(path.join(WORK, name), 0o444);
console.log(JSON.stringify({ manifest: manifestEntry, report: reportEntry, grade: gradeEntry,
  scorecards: scorecardEntry, validator: validatorEntry, validation: manifest.validation,
  productQualificationPassed: allFiveFunctionsHaveQualifyingRoute,
  customerTrialReady: allFiveFunctionsHaveQualifyingRoute, roleRoutes }, null, 2));
