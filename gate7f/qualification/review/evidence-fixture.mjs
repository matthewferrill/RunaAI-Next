import { createHash } from "node:crypto";

export const fixtureSha256 = value => createHash("sha256").update(value).digest("hex");
const objectDigest = value => fixtureSha256(JSON.stringify(value));
const clone = value => structuredClone(value);

// Independently authored, wholly synthetic transport evidence. No live or acceptance answer is used.
export function qualificationEvidenceFixture() {
  const model = "synthetic-qwen", instance = "fixture-owned-instance", phase = "diagnostics-v1";
  const template = "fixture template retaining system, user, assistant and tool turns";
  const config = { context_length: 32768, flash_attention: true, offload_kv_cache_to_gpu: true,
    speculative_draft_mtp: false, speculative_draft_simple: false, speculative_draft_model: "",
    prompt_template: { template } };
  const residentConfig = clone(config);
  delete residentConfig.prompt_template;
  const sourceFiles = Object.fromEntries([
    "qualification/runtime.mjs", "qualification/diagnostics.mjs", "evaluation/v2/capture-contract.mjs",
    "evaluation/v2/capture-policy.mjs", "evaluation/v2/gguf-metadata.mjs",
  ].map(file => [file, fixtureSha256("synthetic source: " + file)]));
  const manifest = { artifactPath: "C:\\synthetic-fixture\\candidate.gguf", artifactBytes: 128,
    artifactSha256: fixtureSha256("synthetic artifact"), architecture: "qwen3moe", quantization: "Q6_K",
    modelKey: model, reasoningOff: true, chatTemplateSha256: fixtureSha256(template) };
  const runtime = { name: "synthetic-runtime", version: "fixture-1",
    files: [{ path: "C:\\synthetic-fixture\\runtime.dll", sha256: fixtureSha256("synthetic runtime") }] };
  const bundle = { schemaVersion: "runa2-qualification-package/v1",
    source: { commit: "c".repeat(40), kind: phase, files: sourceFiles }, runtime,
    candidates: { incumbent: manifest } };
  const packageManifest = { schemaVersion: "runa2-qualification-package-manifest/v1",
    commit: bundle.source.commit, kind: phase, files: { ...sourceFiles,
      "qualification/bundle.json": fixtureSha256(JSON.stringify(bundle, null, 2) + "\n") } };
  const packageManifestSha256 = fixtureSha256(JSON.stringify(packageManifest, null, 2) + "\n");
  const tool = { type: "function", function: { name: "workspace_inspect", description: "Inert fixture inspection.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } } };
  const call = { id: "fixture-call", type: "function", function: { name: "workspace_inspect", arguments: '{"path":"fixture.txt"}' } };
  const expectedSchedule = [
    { id: "fixture-text:1", endpoint: "/api/v0/chat/completions", request: { max_tokens: 512,
      messages: [{ role: "system", content: "This is a synthetic verification fixture." }, { role: "user", content: "Reply briefly." }] } },
    { id: "fixture-native:1", endpoint: "/v1/chat/completions", request: { max_tokens: 512, tools: [tool], tool_choice: "auto",
      messages: [{ role: "system", content: "Only request the inert inspection." }, { role: "user", content: "Inspect fixture.txt." }] } },
    { id: "fixture-continuation:1", endpoint: "/v1/chat/completions", request: { max_tokens: 512, tools: [tool],
      messages: [{ role: "system", content: "Report the supplied inert result without inventing actions." },
        { role: "user", content: "Inspect fixture.txt." }, { role: "assistant", content: null, tool_calls: [call] },
        { role: "tool", tool_call_id: call.id, content: '{"marker":"synthetic-fixture-value"}' }] } },
  ];
  const events = [];
  const initial = Date.parse("2026-08-27T18:00:00.000Z");
  const event = (type, payload) => events.push({ type, time: new Date(initial + events.length * 100).toISOString(), ...clone(payload) });
  const telemetry = (label, loaded = false) => ({ label, freeMemoryBytes: 32 * 1024 ** 3, totalMemoryBytes: 128 * 1024 ** 3,
    gpus: [0, 1].map(index => ({ index, name: "Quadro RTX 6000", totalMemoryMiB: 23040,
      usedMemoryMiB: loaded ? (index ? 6500 : 7000) : (index ? 0 : 1629),
      utilizationPercent: loaded ? 30 : 0, temperatureC: 45, powerWatts: 45 })) });
  event("source", { source: bundle.source, manifest, runtime, phase,
    packageVerification: { manifest: packageManifest, sha256: packageManifestSha256 }, armTimeoutMs: 2700000,
    exclusiveRequestTrafficVerified: false, trafficBoundary: "Synthetic fixture; no inference occurred" });
  event("verified-files", { artifact: { path: manifest.artifactPath, bytes: manifest.artifactBytes,
    sha256: manifest.artifactSha256 }, runtime: runtime.files });
  event("metadata", { version: 3, tensorCount: 1, kvCount: 3, metadataBytes: 96,
    selected: { "general.name": model, "general.architecture": manifest.architecture, "tokenizer.chat_template": template },
    chatTemplateSha256: fixtureSha256(template) });
  event("identity", { identity: { key: model, architecture: manifest.architecture, size_bytes: manifest.artifactBytes,
    quantization: { name: manifest.quantization }, capabilities: { reasoning: { allowed_options: ["off", "on"] } }, loaded_instances: [] } });
  event("telemetry", telemetry("before-load"));
  event("load", { request: { model, context_length: 32768, flash_attention: true, offload_kv_cache_to_gpu: true, echo_load_config: true },
    response: { status: "loaded", instance_id: instance, load_config: config }, elapsedMs: 100 });
  const configSha256 = objectDigest(residentConfig);
  event("resident", { resident: { modelKey: model, id: instance, config: residentConfig }, configSha256 });
  event("telemetry", telemetry("after-load", true));
  for (const [index, item] of expectedSchedule.entries()) {
    event("telemetry", telemetry(item.id, true));
    event("request", { id: item.id, endpoint: item.endpoint, request: { ...item.request, model, temperature: 0, stream: false, reasoning_effort: "none" } });
    const isTool = index === 1;
    const response = { model, choices: [{ index: 0, finish_reason: isTool ? "tool_calls" : "stop",
      message: isTool ? { role: "assistant", tool_calls: [call] } : { role: "assistant", content: "synthetic fixture response " + index } }],
      usage: { completion_tokens: 3, prompt_tokens: 20, total_tokens: 23 } };
    if (item.endpoint === "/api/v0/chat/completions") Object.assign(response, { runtime: { name: runtime.name, version: runtime.version },
      model_info: { context_length: 32768 }, stats: { tokens_per_second: 30, time_to_first_token: 0.1 } });
    event("response", { id: item.id, endpoint: item.endpoint, response, elapsedMs: 100 });
    event("telemetry", telemetry(item.id + ":after", true));
    event("observation", { id: item.id, endpoint: item.endpoint, normalized: { content: isTool ? null : response.choices[0].message.content,
      toolCalls: isTool ? [call] : [], finishReason: isTool ? "tool_calls" : "stop", completionTokens: 3, promptTokens: 20,
      tokensPerSecond: index === 0 ? 30 : null, firstTokenMs: index === 0 ? 100 : null }, elapsedMs: 300 });
  }
  event("cleanup", { unload: { instance_id: instance }, remaining: [], cleanupVerified: true, unexpectedInstances: false, ownedInstance: instance });
  event("telemetry", telemetry("after-unload"));
  const result = { schemaVersion: "runa2-qualification-capture-result/v1", candidate: "incumbent", phase,
    startedAt: new Date(initial).toISOString(), endedAt: new Date(initial + events.length * 100).toISOString(),
    passed: true, failure: null, observed: expectedSchedule.length, cleanupVerified: true, ownershipAmbiguous: false,
    modelKey: model, configSha256, modelContentExecuted: false, productionRoutingChanged: false, protectedDataIncluded: false };
  return clone({ packageManifest, packageManifestSha256, bundle, events, result, expectedSchedule });
}

export const fixtureEvent = (fixture, type, id) => fixture.events.find(row => row.type === type && (id === undefined || row.id === id));
