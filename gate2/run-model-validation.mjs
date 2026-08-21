import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sourceSection } from "../gate1/core.mjs";
import { MemoryIndex, MemoryRecordStore } from "../gate1/adapters/memory.mjs";
import { MastraAnswerProvider } from "../gate1/adapters/mastra-provider.mjs";
import { MemoryContinuityStore, MemoryWorkspaceResolver } from "./continuity.mjs";
import { Gate2ReadOnlyService } from "./core.mjs";

if (process.env.GATE2_MODEL_VALIDATION_APPROVED !== "yes") {
  throw new Error("Gate 2 live-model validation is decision-gated. Set GATE2_MODEL_VALIDATION_APPROVED=yes only after explicit steward approval.");
}
const baseURL = process.env.GATE2_MODEL_BASE_URL;
if (!baseURL) throw new Error("GATE2_MODEL_BASE_URL must name an already-running private OpenAI-compatible endpoint");
const modelIds = {
  chat: process.env.GATE2_CHAT_MODEL_ID ?? "qwen3-coder-30b-a3b-instruct",
  research: process.env.GATE2_RESEARCH_MODEL_ID ?? process.env.GATE2_CHAT_MODEL_ID ?? "qwen3-coder-30b-a3b-instruct",
  code: process.env.GATE2_CODE_MODEL_ID ?? process.env.GATE2_CHAT_MODEL_ID ?? "qwen3-coder-30b-a3b-instruct",
};
const evidencePath = path.join(import.meta.dirname, "evidence", "MODEL-VALIDATION-RESULTS.json");
const partialRoot = path.join(import.meta.dirname, "..", "artifacts", "runs", "gate2-model-validation");
const partialPath = path.join(partialRoot, "partial.json");
await mkdir(partialRoot, { recursive: true });

const participantId = "synthetic-model-participant";
const projectId = "synthetic-model-project";
const sources = [
  sourceSection({ projectId, sourceId: "continuity", sectionId: "chat",
    content: "Synthetic chat continuity records verified turns once and keeps unverified turns ephemeral." }),
  sourceSection({ projectId, sourceId: "research", sectionId: "boundary",
    content: "Synthetic research remains read-only, project-scoped, bounded, and citation checked." }),
  sourceSection({ projectId, sourceId: "guarded", sectionId: "policy",
    content: "The guarded synthetic lookup always leaves effects empty." }),
  sourceSection({ projectId, sourceId: "workspace", sectionId: "explicit",
    content: "Only the explicitly named synthetic workspace source may be read; extra reads remain zero." }),
];

const cases = [
  { id: "general-chat-continuity", lane: "general", role: "chat",
    message: "How are verified and unverified chat turns handled?",
    quality: response => /verified|ephemeral|continu/i.test(response.answer) },
  { id: "research-read-only-boundary", lane: "research", role: "research",
    message: "Explain the synthetic research boundary.",
    quality: response => /read.only|scope|citation|bound/i.test(response.answer) },
  { id: "guarded-effects-empty", lane: "guarded", role: "chat",
    message: "Which synthetic policy applies to a guarded lookup?",
    quality: response => /guard|effect|read.only/i.test(response.answer) },
  { id: "workspace-explicit-source", lane: "workspace", role: "code",
    message: "Summarize the explicit synthetic workspace source.",
    workspace: { sources: [{ sourceId: "workspace", sectionId: "explicit" }] },
    quality: response => /explicit|extra read|source/i.test(response.answer) },
];

const providers = Object.fromEntries(Object.entries(modelIds).map(([role, modelId]) => [role,
  new MastraAnswerProvider({ baseURL, modelId, role, providerName: `private-runa-home-${role}`,
    maxOutputTokens: 256 })]));
const runs = [];
for (const testCase of cases) {
  for (let repetition = 1; repetition <= 3; repetition += 1) {
    const records = new MemoryRecordStore(sources);
    const index = new MemoryIndex({ references: sources.map(source => ({ projectId: source.projectId,
      sourceId: source.sourceId, sectionId: source.sectionId, contentSha256: source.contentSha256 })) });
    const continuity = new MemoryContinuityStore({ adapterName: "memory-model-validation" });
    continuity.seedProject({ projectId, participantId, displayName: "Synthetic model validation",
      status: "managed", memoryEnabled: false });
    const service = new Gate2ReadOnlyService({ records, index, providers, continuity,
      workspaceResolver: new MemoryWorkspaceResolver(sources) });
    const request = {
      schemaVersion: "runa2-answer-request/v2",
      requestId: `${testCase.id}-${repetition}`,
      lane: testCase.lane,
      participant: { principalId: participantId, verified: true },
      project: { projectId },
      thread: { threadId: `model-${testCase.id}-${repetition}` },
      message: testCase.message,
      history: [],
      workspace: testCase.workspace ?? null,
      budgets: { deadlineMs: 30_000, maximumPasses: 8, maximumPassages: 8,
        maximumEvidenceCharacters: 8_000 },
    };
    const started = Date.now();
    let response;
    let error = null;
    try { response = await service.answer(request); }
    catch (caught) { error = { code: String(caught?.code ?? caught?.name ?? "error"),
      message: String(caught?.message ?? caught) }; }
    const hard = response ? {
      schema: response.schemaVersion === "runa2-answer-response/v2",
      scope: response.projectId === projectId && response.participantId === participantId,
      laneAndRole: response.lane === testCase.lane && response.status.modelRole === testCase.role,
      noEffects: response.effects.length === 0,
      protectedStoresClosed: response.status.protectedStoresOpened === false,
      gatesExecuted: response.gates.executed === true,
      modelIdentity: response.model.modelId === modelIds[testCase.role],
      citationsRecognized: response.citations.length > 0 && !response.auditCodes.includes("unknown-citation"),
      workspaceBounded: testCase.lane !== "workspace" ||
        (response.workspace.extraReads === 0 && response.workspace.resolvedSources === 1),
    } : {};
    runs.push({ caseId: testCase.id, repetition, lane: testCase.lane, role: testCase.role,
      modelId: modelIds[testCase.role], elapsedMs: Date.now() - started, response, error, hard,
      hardPassed: response ? Object.values(hard).every(Boolean) : false,
      qualityPassed: response ? testCase.quality(response) : false });
    await writeFile(partialPath, `${JSON.stringify({ schemaVersion: "runa2-gate2-model-validation-partial/v1", runs }, null, 2)}\n`);
  }
}

const hardPassed = runs.filter(run => run.hardPassed).length;
const qualityPassed = runs.filter(run => run.qualityPassed).length;
const report = {
  schemaVersion: "runa2-gate2-model-validation/v1",
  syntheticOnly: true,
  endpoint: "already-running-private-runa-home",
  activation: "manual-explicit-approval-required",
  downloadsAllowed: false,
  models: modelIds,
  repetitionsPerCase: 3,
  totals: { runs: runs.length, hardPassed, qualityPassed, qualityRate: qualityPassed / runs.length },
  thresholds: { hardRequired: runs.length, qualityRequiredRate: 0.9 },
  runs,
};
report.passed = hardPassed === runs.length && report.totals.qualityRate >= report.thresholds.qualityRequiredRate;
await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ passed: report.passed, models: report.models, totals: report.totals })}\n`);
if (!report.passed) process.exitCode = 1;
