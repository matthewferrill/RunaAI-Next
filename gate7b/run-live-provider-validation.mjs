import { performance } from "node:perf_hooks";

import { MastraAnswerProvider } from "../gate1/adapters/mastra-provider.mjs";

const argument = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const baseURL = argument("--base-url");
const modelId = argument("--model-id");
if (!baseURL || !modelId) throw Object.assign(new Error("base URL and model ID are required"),
  { code: "gate7b-live-provider-arguments-required" });

const evidence = [{ sourceId: "synthetic-source", sectionId: "selected",
  contentSha256: "a".repeat(64), content: "The synthetic selected source is read-only and explicit.",
  provenance: "untrusted-retrieved-data" }];

const cases = [
  { id: "general-cold", role: "chat", message: "Hi Runa. Reply with a brief greeting.", evidence: [] },
  { id: "general-warm", role: "chat", message: "Hi Runa. Reply with a brief greeting.", evidence: [] },
  { id: "research-evidence", role: "research", message: "What does the supplied synthetic source say?", evidence },
  { id: "workspace-evidence", role: "code", message: "Summarize the supplied synthetic source without changing anything.", evidence },
];

const results = [];
for (const item of cases) {
  const provider = new MastraAnswerProvider({ baseURL, modelId, role: item.role });
  const started = performance.now();
  try {
    const answer = await provider.answer({ request: { lane: item.role === "research" ? "research"
      : item.role === "code" ? "workspace" : "general", message: item.message, history: [] },
    ground: item.evidence.length ? "record-answers" : "no-ground-needed", advisory: null,
    evidence: item.evidence }, { deadlineMs: 60_000, maximumOutputBytes: 16_000 });
    results.push({ id: item.id, passed: answer.answer.length > 0,
      elapsedMs: Math.round(performance.now() - started), answerBytes: Buffer.byteLength(answer.answer),
      citationCount: answer.citations.length, role: answer.model.role,
      exactModel: answer.model.modelId === modelId });
  } catch (error) {
    results.push({ id: item.id, passed: false, elapsedMs: Math.round(performance.now() - started),
      errorCode: typeof error?.code === "string" ? error.code : "provider-validation-failed" });
  }
}

const checks = {
  allCasesCompleted: results.every(item => item.passed === true),
  exactModel: results.every(item => item.exactModel === true),
  roleRouting: results.every((item, index) => item.role === cases[index].role),
  plainChatHasNoCitations: results.slice(0, 2).every(item => item.citationCount === 0),
  evidenceLanesCite: results.slice(2).every(item => item.citationCount === 1),
};
process.stdout.write(`${JSON.stringify({ schemaVersion: "runa2-gate7b-live-provider-validation/v1",
  passed: Object.values(checks).every(Boolean), checks, results, privateValuesIncluded: false })}\n`);
if (!Object.values(checks).every(Boolean)) process.exitCode = 1;

