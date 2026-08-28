import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { MastraAnswerProvider } from "../../gate1/adapters/mastra-provider.mjs";
import { OpenAICompatibleEmbedder, WindowedBgeReranker } from "../../gate1/adapters/qdrant.mjs";
import { MastraM1Planner } from "./planner.mjs";

export const SMOKE_POLICY = Object.freeze({ schemaVersion: "runaai-m1-operator-smoke-policy/v1", scored: false,
  answerRoles: ["chat", "research", "review"], plannerRoles: ["code", "agent"], answerTokens: 512,
  plannerTokens: 1536, deadlineMs: 30_000, auxiliaryDeadlineMs: 10_000, maximumWireBytes: 2_000_000,
  noTextualReasoningSuffix: true, modelLifecycleOwnedBySealedOperator: true, productionChanged: false });
export const SMOKE_SOURCE_FILES = Object.freeze(["gate7f/function-first/operator-smoke.mjs", "gate7f/function-first/planner.mjs",
  "gate7f/function-first/provider-transport.mjs", "gate7f/function-first/model-roles.mjs",
  "gate1/adapters/mastra-provider.mjs", "gate1/adapters/qdrant.mjs"]);
const sha = text => createHash("sha256").update(text).digest("hex");
const privateUrl = value => { const url = new URL(value); assert.equal(url.protocol, "http:");
  assert.ok(["127.0.0.1", "192.168.50.165", "192.168.50.169"].includes(url.hostname));
  assert.equal(url.username + url.password + url.hash + url.search, ""); return url; };
export function validateSmokeSeal(seal) {
  assert.equal(seal.schemaVersion, "runaai-m1-operator-smoke/v1"); assert.equal(seal.scored, false);
  for (const value of [seal.baseUrl, seal.inventoryUrl, seal.rerankerUrl]) privateUrl(value);
  for (const value of [seal.runtimeSealSha256, seal.primaryArtifactSha256, seal.embeddingArtifactSha256]) assert.match(value, /^[a-f0-9]{64}$/);
  assert.ok([null, "none"].includes(seal.reasoningEffort));
  assert.ok(typeof seal.modelId === "string" && seal.modelId.length > 0);
  assert.ok(seal.primaryInstanceId && seal.embeddingInstanceId && seal.primaryInstanceId !== seal.embeddingInstanceId);
  assert.equal(seal.embeddingModelId, "text-embedding-nomic-embed-text-v1.5");
  assert.ok(seal.sourceFiles && SMOKE_SOURCE_FILES.every(path => Object.hasOwn(seal.sourceFiles, path)));
  for (const [path, digest] of Object.entries(seal.sourceFiles)) {
    assert.match(path, /^(gate1\/adapters|gate7f\/function-first)\/[a-z0-9/-]+\.mjs$/); assert.ok(!path.includes(".."));
    assert.match(digest, /^[a-f0-9]{64}$/);
  }
  return seal;
}

async function boundedText(response) {
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break;
    bytes += next.value.length; if (bytes > SMOKE_POLICY.maximumWireBytes) throw new Error("m1-smoke-wire-cap"); chunks.push(Buffer.from(next.value)); }
    return Buffer.concat(chunks).toString("utf8");
  } finally { await reader.cancel().catch(() => {}); }
}

export async function runOperatorSmoke(seal, { fetchImpl = fetch, record = async () => {} } = {}) {
  validateSmokeSeal(seal);
  const calls = [], checks = [], providerConfig = { schemaVersion: "runaai-model-roles/v1", baseUrl: seal.baseUrl,
    models: Object.fromEntries([...SMOKE_POLICY.answerRoles, ...SMOKE_POLICY.plannerRoles].map(role => [role, seal.modelId])) };
  const allowed = new Set([`${seal.baseUrl}/chat/completions`, `${seal.baseUrl}/embeddings`, `${seal.rerankerUrl}/rerank`]);
  let role = "preflight";
  const inventory = async () => {
    const response = await fetchImpl(seal.inventoryUrl, { redirect: "error", signal: AbortSignal.timeout(10_000) }); assert.equal(response.ok, true);
    const value = JSON.parse(await boundedText(response)); assert.ok(Array.isArray(value.models));
    const loaded = value.models.flatMap(model => { assert.ok(Array.isArray(model.loaded_instances)); return model.loaded_instances.map(instance => ({ key: model.key, id: instance.id })); });
    assert.deepEqual(loaded.map(item => item.id).sort(), [seal.primaryInstanceId, seal.embeddingInstanceId].sort());
    assert.equal(loaded.find(item => item.id === seal.primaryInstanceId).key, seal.modelId);
    assert.equal(loaded.find(item => item.id === seal.embeddingInstanceId).key, seal.embeddingModelId);
    await record({ type: "residency", loaded });
  };
  const wire = async (url, init) => {
    assert.ok(allowed.has(String(url))); assert.equal(init.method, "POST"); assert.equal(init.redirect, "error");
    const input = JSON.parse(init.body); assert.doesNotMatch(JSON.stringify(input), /\/no_think/);
    const start = Date.now(); await record({ type: "request", role, url: String(url), input });
    try {
      const response = await fetchImpl(url, init), text = await boundedText(response.clone());
      const event = { type: "response", role, url: String(url), status: response.status, elapsedMs: Date.now() - start, body: JSON.parse(text) };
      calls.push(event); await record(event); return response;
    } catch (error) { await record({ type: "transport-failure", role, elapsedMs: Date.now() - start, errorCode: error.code ?? error.name }); throw error; }
  };
  await inventory();
  try {
    const source = { projectId: "smoke-garden", sourceId: "smoke-note", sectionId: "provided", content: "In the fictional garden plan, pale stones mark the north room. The note lists no other room." };
    source.contentSha256 = sha(source.content);
    for (role of SMOKE_POLICY.answerRoles) {
      const answerer = new MastraAnswerProvider({ baseURL: seal.baseUrl, modelId: seal.modelId, role,
        reasoningEffort: seal.reasoningEffort, preventRedirects: true, fetchImpl: wire });
      const request = { participantId: "synthetic-smoke", projectId: "smoke-garden", threadId: `smoke-${role}`, lane: "general",
        message: role === "chat" ? "In one short sentence, greet the fictional Garden Circle." : "Which room is marked by pale stones in the supplied fictional note? Cite the note and do not claim to have run anything." };
      const result = await answerer.answer({ request, history: [], ground: role === "chat" ? "no-ground-needed" : "record-evidence",
        evidence: role === "chat" ? [] : [source] }, { deadlineMs: SMOKE_POLICY.deadlineMs, maximumOutputBytes: 24_000 });
      assert.equal(result.model.modelId, seal.modelId); assert.ok(result.answer.trim());
      if (role !== "chat") { assert.match(result.answer, /north/i); assert.ok(result.citations.some(item => item.sourceId === source.sourceId && item.sectionId === source.sectionId)); }
      checks.push(`${role}-actual-answer-adapter`); await record({ type: "adapter-result", role, result });
    }
    const content = "exports.echo = value => value;", path = "echo.js";
    for (role of SMOKE_POLICY.plannerRoles) {
      const planner = new MastraM1Planner({ provider: providerConfig, role, reasoningEffort: seal.reasoningEffort, fetchImpl: wire });
      const result = await planner.plan({ objective: "Inspect echo.js only. Do not change or execute anything.",
        snapshot: { files: [{ path, content, sha256: sha(content), bytes: Buffer.byteLength(content) }], projectRevision: 1 },
        receipts: [], previousPlans: [], repair: false, allowedPaths: [path], allowedSuites: [], capabilityIds: ["project.inspect"],
        signal: AbortSignal.timeout(SMOKE_POLICY.deadlineMs) });
      assert.ok(result.steps.length > 0 && result.steps.every(step => step.capabilityId === "project.inspect" && step.arguments.path === path));
      checks.push(`${role}-actual-planner-adapter`); await record({ type: "adapter-result", role, result });
    }
    role = "embedding";
    const dependencyFetch = (url, init) => wire(url, { ...init, redirect: "error" });
    const vectors = await new OpenAICompatibleEmbedder({ baseURL: seal.baseUrl, modelId: seal.embeddingModelId,
      dimension: 768, timeoutMs: SMOKE_POLICY.auxiliaryDeadlineMs, fetchImpl: dependencyFetch }).embed([
      `search_document: ${source.content}`, "search_query: Which room has pale stones?"]);
    assert.ok(vectors.every(vector => vector.every(Number.isFinite))); checks.push("nomic-actual-prefix-and-dimension");
    role = "reranker";
    const ranked = await new WindowedBgeReranker({ baseURL: seal.rerankerUrl, timeoutMs: SMOKE_POLICY.auxiliaryDeadlineMs,
      fetchImpl: dependencyFetch }).rerank("Which room has pale stones?", [source, { ...source, sourceId: "smoke-other", content: "A fictional harbor uses amber flags." }], 1);
    assert.equal(ranked.degraded, false); assert.equal(ranked.sources[0].sourceId, source.sourceId); checks.push("bge-actual-adapter");
    return { schemaVersion: "runaai-m1-operator-smoke-result/v1", candidateId: seal.candidateId, modelId: seal.modelId,
      passed: true, scored: false, checks, providerCalls: calls.length, productionChanged: false, modelsLoadedOrUnloaded: false };
  } finally { await inventory(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2); assert.equal(args.length, 4); assert.equal(args[0], "--seal"); assert.equal(args[2], "--seal-sha256");
  const bytes = await readFile(resolve(args[1])); assert.equal(sha(bytes), args[3]); const seal = validateSmokeSeal(JSON.parse(bytes));
  const root = resolve(import.meta.dirname, "../..");
  for (const [path, digest] of Object.entries(seal.sourceFiles)) assert.equal(sha(await readFile(join(root, path))), digest);
  const parent = join(root, "artifacts/runs"); await mkdir(parent, { recursive: true }); const directory = await mkdtemp(join(parent, "m1-smoke-"));
  let sequence = 0, result;
  const record = async event => writeFile(join(directory, `${String(sequence++).padStart(4,"0")}.json`), JSON.stringify(event,null,2), { flag: "wx" });
  await record({ type: "seal", sealSha256: args[3], seal, policy: SMOKE_POLICY });
  try { result = await runOperatorSmoke(seal, { record }); }
  catch (error) { result = { schemaVersion: "runaai-m1-operator-smoke-result/v1", passed: false, scored: false,
    errorCode: error.code ?? error.name, message: error.message, productionChanged: false }; process.exitCode = 1; }
  await record({ type: "result", result }); console.log(JSON.stringify({ ...result, evidenceDirectory: directory }));
}
