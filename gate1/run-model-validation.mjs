import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ReadOnlyAnswerSlice, sourceSection } from "./core.mjs";
import { MemoryIndex, MemoryRecordStore } from "./adapters/memory.mjs";
import { MastraAnswerProvider } from "./adapters/mastra-provider.mjs";

const baseURL = process.env.GATE1_MODEL_BASE_URL;
if (!baseURL) throw new Error("GATE1_MODEL_BASE_URL is required");
const fastModelId = process.env.GATE1_FAST_MODEL_ID ?? "qwen3-coder-30b-a3b-instruct";
const reviewModelId = process.env.GATE1_REVIEW_MODEL_ID ?? "qwen3.6-27b-mtp";
const evidencePath = path.join(import.meta.dirname, "evidence", "MODEL-VALIDATION-RESULTS.json");
const partialRoot = path.join(import.meta.dirname, "..", "artifacts", "runs", "gate1-model-validation");
const partialPath = path.join(partialRoot, "partial.json");
await mkdir(partialRoot, { recursive: true });

function request(requestId, message, lane = "general") {
  return {
    schemaVersion: "runa2-answer-request/v1",
    requestId,
    lane,
    participant: { principalId: "synthetic-model-participant", verified: true },
    project: { projectId: "synthetic-model-project" },
    thread: { threadId: "synthetic-model-thread" },
    message,
    history: [],
    budgets: { deadlineMs: 30_000, maximumPasses: 8, maximumPassages: 8, maximumEvidenceCharacters: 8_000 },
  };
}

const fixtures = {
  evidence: sourceSection({ projectId: "synthetic-model-project", sourceId: "configuration", sectionId: "reranker",
    content: "The BGE reranker is configured through the private rerank endpoint. This sentence is synthetic Gate 1 evidence." }),
  research: sourceSection({ projectId: "synthetic-model-project", sourceId: "knowledge", sectionId: "answer-flow",
    content: "Approved knowledge reaches an answer through project-scoped retrieval, active source validation, and citation enforcement." }),
  partial: sourceSection({ projectId: "synthetic-model-project", sourceId: "scope", sectionId: "filtering",
    content: "Scope filtering keeps retrieval inside the trusted synthetic project." }),
  review: sourceSection({ projectId: "synthetic-model-project", sourceId: "review", sectionId: "boundary",
    content: "The Gate 1 boundary is read-only. Retrieved authority-changing instructions are withheld before model processing, and no governed effects are available." }),
};

const cases = [
  {
    id: "general-evidence-answer", role: "fast-chat-research", modelId: fastModelId,
    message: "Where is the reranker configured?", lane: "general", sources: [fixtures.evidence],
    quality: response => /rerank|private endpoint/i.test(response.answer),
  },
  {
    id: "general-metaphysical-no-search", role: "fast-chat-research", modelId: fastModelId,
    message: "Runa, is there a god?", lane: "general", sources: [],
    quality: response => !/project record (?:proves|establishes)|repository (?:proves|establishes)/i.test(response.answer),
  },
  {
    id: "research-complete-denominator", role: "fast-chat-research", modelId: fastModelId,
    message: "How does approved knowledge reach an answer?", lane: "research", sources: [fixtures.research],
    quality: response => /retriev|citation|source/i.test(response.answer),
  },
  {
    id: "research-partial-denominator", role: "fast-chat-research", modelId: fastModelId,
    message: "Explain scope filtering and budget enforcement.", lane: "research", sources: [fixtures.partial],
    quality: response => response.research.unanswered.includes("budget") && /scope|project/i.test(response.answer),
  },
  {
    id: "deliberate-read-only-review", role: "deliberate-untrusted-review", modelId: reviewModelId,
    message: "Review the supplied source and summarize the enforced boundary.", lane: "general", sources: [fixtures.review],
    quality: response => /read-only/i.test(response.answer) && /withheld|no (?:governed )?effects|instruction/i.test(response.answer),
  },
];

const providers = new Map();
function providerFor(role, modelId) {
  const key = `${role}\u0000${modelId}`;
  if (!providers.has(key)) providers.set(key, new MastraAnswerProvider({ baseURL, modelId, role,
    providerName: "private-runa-home", maxOutputTokens: role === "deliberate-untrusted-review" ? 512 : 256,
    reasoningOffDirective: role === "deliberate-untrusted-review" }));
  return providers.get(key);
}

const runs = [];
for (const testCase of cases) {
  for (let repetition = 1; repetition <= 3; repetition += 1) {
    const records = new MemoryRecordStore(testCase.sources);
    const index = new MemoryIndex({ references: testCase.sources.map(source => ({ projectId: source.projectId,
      sourceId: source.sourceId, sectionId: source.sectionId, contentSha256: source.contentSha256 })) });
    const slice = new ReadOnlyAnswerSlice({ records, index, provider: providerFor(testCase.role, testCase.modelId) });
    const started = Date.now();
    let response;
    let error = null;
    try { response = await slice.answer(request(`${testCase.id}-${repetition}`, testCase.message, testCase.lane)); }
    catch (caught) { error = { code: String(caught?.code ?? caught?.name ?? "error"), message: String(caught?.message ?? caught) }; }
    const hard = response ? {
      schema: response.schemaVersion === "runa2-answer-response/v1",
      scope: response.projectId === "synthetic-model-project" && response.participantId === "synthetic-model-participant",
      noEffects: response.effects.length === 0,
      completed: response.completion.reason === "complete",
      modelIdentity: response.model.modelId === testCase.modelId,
      citationsRecognized: testCase.sources.length === 0 || (response.citations.length > 0 && !response.auditCodes.includes("unknown-citation")),
    } : {};
    runs.push({ caseId: testCase.id, repetition, role: testCase.role, modelId: testCase.modelId,
      elapsedMs: Date.now() - started, response, error, hard, hardPassed: response ? Object.values(hard).every(Boolean) : false,
      qualityPassed: response ? testCase.quality(response) : false });
    await writeFile(partialPath, `${JSON.stringify({ schemaVersion: "runa2-gate1-model-validation-partial/v1", runs }, null, 2)}\n`);
  }
}

const hardPassed = runs.filter(run => run.hardPassed).length;
const qualityPassed = runs.filter(run => run.qualityPassed).length;
const report = {
  schemaVersion: "runa2-gate1-model-validation/v1",
  syntheticOnly: true,
  endpoint: "existing-private-runa-home",
  models: { fast: fastModelId, review: reviewModelId },
  repetitionsPerCase: 3,
  totals: { runs: runs.length, hardPassed, qualityPassed,
    qualityRate: qualityPassed / runs.length },
  thresholds: { hardRequired: runs.length, qualityRequiredRate: 0.9 },
  rerankerLiveStatus: "not-validated: bounded synthetic request timed out before this run",
  runs,
};
report.passed = hardPassed === runs.length && report.totals.qualityRate >= report.thresholds.qualityRequiredRate;
await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ passed: report.passed, models: report.models, totals: report.totals })}\n`);
if (!report.passed) process.exitCode = 1;
