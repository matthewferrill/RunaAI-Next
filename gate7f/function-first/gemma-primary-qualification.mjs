import { sha256 } from "../../gate4/canonical.mjs";

const fail = code => { throw Object.assign(new Error(code), { code }); };
const requireThat = (value, code) => { if (!value) fail(code); };
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join() === [...keys].sort().join();
const decode = (bytes, expectedSha256, code) => {
  requireThat(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array, "m1-gemma-review-evidence-bytes-required");
  const value = Buffer.from(bytes);
  requireThat(value.length > 0 && value.length <= 4 * 1024 * 1024, "m1-gemma-review-evidence-size-invalid");
  requireThat(sha256(value) === expectedSha256, code);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value)); }
  catch { fail("m1-gemma-review-evidence-json-invalid"); }
};
const unfencedJson = text => {
  try { return JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "")); }
  catch { fail("m1-gemma-review-response-invalid"); }
};

export const GEMMA_PRIMARY_MODEL = Object.freeze({
  candidateId: "gemma4-26b-a4b",
  modelId: "gemma-4-26b-a4b-it-qat",
  artifactSha256: "3eca3b8f6d7baf218a7dd6bba5fb59a56ee25fe2d567b6f5f589b4f697eca51d",
});
export const FOCUSED_REVIEW_EVIDENCE = Object.freeze({
  gradeSha256: "2c7e87797518490d22af115128a01b6ec1dc51e30c7e497651dc2141a8e16de6",
  answerSha256: "002f2af561750178b915906068dc473e22358cf79fc3c84badb7c501092bb688",
  checkerSha256: "e849a9aa1208c4435f6192e8de2e75fd6325f029d3c8dc974a6eeb3da33f8bdf",
  sourceCommit: "33b0f3068cc35cb7969148b1578cd107ab440197",
  answerRunId: "focused-review-20260902-f17e80070418",
  checkerRunId: "focused-review-checker-20260902-cb6e5785b5af",
  checkerRunnerSha256: "a6ebe15fe0df712d61ea9d346aa7c529a953a2e2d9e988e8470bfc2e847e7d29",
});
const CASE_SOURCES = Object.freeze({
  "review-01-cross-file-contract": ["pricing", "order"],
  "review-02-long-contradiction": ["overview", "appendix"],
  "review-03-current-policy": ["archived", "current", "runbook"],
  "review-04-path-issue": ["handler", "boundary"],
  "review-05-unsupported-claim": ["measurements", "claim"],
  "review-06-evidence-explanation": ["rules", "worker"],
  "review-07-fake-tool-output": ["note", "code"],
  "review-08-insufficient-context": ["caller"],
});

function validatePublication(value, { runId, runnerSha256, checker }) {
  requireThat(exactKeys(value, ["schemaVersion", "publishedAt", "runId", "sourceCommit", "runnerSha256",
    "readinessReceiptSha256", "transport", "remoteExitCode", "result"]), "m1-gemma-review-publication-shape-invalid");
  requireThat(value.schemaVersion === "runaai-focused-review-omen-publication/v1"
    && value.runId === runId && value.sourceCommit === FOCUSED_REVIEW_EVIDENCE.sourceCommit
    && value.runnerSha256 === runnerSha256 && value.transport === "Omen -> Control WSL -> Home"
    && value.remoteExitCode === 0, "m1-gemma-review-publication-invalid");
  const result = value.result;
  requireThat(result?.schemaVersion === "runaai-focused-gemma-review-result/v1" && result.runId === runId
    && result.runnerSha256 === runnerSha256 && result.sourceCommit === FOCUSED_REVIEW_EVIDENCE.sourceCommit
    && result.host === "RUNA-HOME" && result.nodeVersion === "v22.22.1"
    && result.model?.key === GEMMA_PRIMARY_MODEL.modelId
    && result.model?.artifactSha256 === GEMMA_PRIMARY_MODEL.artifactSha256
    && result.failure === null && result.attemptCount === 8 && result.productionChanged === false
    && result.protectedDataRead === false && result.cleanup?.unloadVerified === true
    && result.cleanup?.powerRestored === true && result.cleanup?.loadedModelInstances === 0,
  "m1-gemma-review-result-invalid");
  requireThat(checker ? result.phaseMode === "checker" && result.inputRunId === FOCUSED_REVIEW_EVIDENCE.answerRunId
    : !Object.hasOwn(result, "phaseMode") && !Object.hasOwn(result, "inputRunId"), "m1-gemma-review-phase-invalid");
  requireThat(Array.isArray(result.attempts) && result.attempts.length === 8
    && new Set(result.attempts.map(item => item.caseId)).size === 8
    && result.attempts.every(item => CASE_SOURCES[item.caseId] && item.httpStatus === 200
      && item.modelId === GEMMA_PRIMARY_MODEL.modelId), "m1-gemma-review-attempts-invalid");
  for (const attempt of result.attempts) {
    const parsed = unfencedJson(attempt.rawContent);
    if (!checker) {
      requireThat(exactKeys(parsed, ["answer", "citations"]) && typeof parsed.answer === "string" && parsed.answer.trim()
        && Array.isArray(parsed.citations) && parsed.citations.length > 0, "m1-gemma-review-answer-shape-invalid");
      continue;
    }
    const allowed = new Set(CASE_SOURCES[attempt.caseId]);
    requireThat(exactKeys(parsed, ["verdict", "reason", "finalAnswer", "citations"])
      && parsed.verdict === "accept" && typeof parsed.reason === "string" && parsed.reason.trim()
      && typeof parsed.finalAnswer === "string" && parsed.finalAnswer.trim()
      && Array.isArray(parsed.citations) && parsed.citations.length > 0
      && new Set(parsed.citations.map(citation => `${citation.sourceId}\u0000${citation.sectionId}`)).size === parsed.citations.length
      && parsed.citations.every(citation => exactKeys(citation, ["sourceId", "sectionId"])
        && allowed.has(citation.sourceId) && citation.sectionId === "provided"), "m1-gemma-review-checker-shape-invalid");
  }
  return result;
}

/** Validate the exact retained actual-system Review evidence. This is a release
 * admission check, not a model test and not a mutable winner label. */
export function validateFocusedGemmaReviewEvidence({ gradeBytes, answerBytes, checkerBytes }) {
  const grade = decode(gradeBytes, FOCUSED_REVIEW_EVIDENCE.gradeSha256, "m1-gemma-review-grade-byte-mismatch");
  const answer = decode(answerBytes, FOCUSED_REVIEW_EVIDENCE.answerSha256, "m1-gemma-review-answer-byte-mismatch");
  const checker = decode(checkerBytes, FOCUSED_REVIEW_EVIDENCE.checkerSha256, "m1-gemma-review-checker-byte-mismatch");
  requireThat(grade?.schemaVersion === "runaai-focused-review-grade/v1"
    && grade.candidate === GEMMA_PRIMARY_MODEL.candidateId && grade.modelId === GEMMA_PRIMARY_MODEL.modelId
    && grade.role === "review" && grade.sourceCommit === FOCUSED_REVIEW_EVIDENCE.sourceCommit
    && grade.answerRunId === FOCUSED_REVIEW_EVIDENCE.answerRunId && grade.checkerRunId === FOCUSED_REVIEW_EVIDENCE.checkerRunId
    && grade.caseCount === 8 && grade.semanticAnswersPassed === 8 && grade.checkerContractsPassed === 8
    && grade.checkerSemanticPassed === 8 && grade.nullableFieldsObserved === 0 && grade.modelFailures === 0
    && grade.methodFailuresInFinalRun === 0 && grade.cleanupVerified === true && grade.productionChanged === false
    && grade.protectedDataRead === false && grade.decision === "qualified-for-bounded-review-model-role",
  "m1-gemma-review-grade-invalid");
  validatePublication(answer, { runId: FOCUSED_REVIEW_EVIDENCE.answerRunId,
    runnerSha256: answer.runnerSha256, checker: false });
  validatePublication(checker, { runId: FOCUSED_REVIEW_EVIDENCE.checkerRunId,
    runnerSha256: FOCUSED_REVIEW_EVIDENCE.checkerRunnerSha256, checker: true });
  return Object.freeze({ passed: true, role: "review", candidateId: GEMMA_PRIMARY_MODEL.candidateId,
    modelId: GEMMA_PRIMARY_MODEL.modelId, artifactSha256: GEMMA_PRIMARY_MODEL.artifactSha256,
    gradeSha256: FOCUSED_REVIEW_EVIDENCE.gradeSha256, answerSha256: FOCUSED_REVIEW_EVIDENCE.answerSha256,
    checkerSha256: FOCUSED_REVIEW_EVIDENCE.checkerSha256, semanticAnswersPassed: 8, checkerContractsPassed: 8,
    productionChanged: false, protectedDataRead: false });
}
