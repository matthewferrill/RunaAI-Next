import test from "node:test";
import assert from "node:assert/strict";
import { verifyCapture } from "../verify.mjs";
import { fixtureEvent, fixtureSha256, qualificationEvidenceFixture } from "./evidence-fixture.mjs";

test("independent synthetic fixture validates text, native tool-only and result-continuation evidence", () => {
  assert.ok(verifyCapture(qualificationEvidenceFixture()));
});

const mutations = [
  ["wrong external package digest", f => { f.packageManifestSha256 = "0".repeat(64); }],
  ["package event digest altered", f => { fixtureEvent(f, "source").packageVerification.sha256 = "0".repeat(64); }],
  ["source commit altered", f => { fixtureEvent(f, "source").source.commit = "f".repeat(40); }],
  ["source file hash altered", f => { fixtureEvent(f, "source").source.files["qualification/runtime.mjs"] = "f".repeat(64); }],
  ["package file omitted", f => { delete fixtureEvent(f, "source").packageVerification.manifest.files["qualification/runtime.mjs"]; }],
  ["package extra file", f => { fixtureEvent(f, "source").packageVerification.manifest.files["qualification/unsealed.mjs"] = "e".repeat(64); }],
  ["bundle hash altered", f => { fixtureEvent(f, "source").packageVerification.manifest.files["qualification/bundle.json"] = "f".repeat(64); }],
  ["artifact SHA altered", f => { fixtureEvent(f, "source").manifest.artifactSha256 = "f".repeat(64); }],
  ["artifact bytes altered", f => { fixtureEvent(f, "source").manifest.artifactBytes++; }],
  ["identity quantization altered", f => { fixtureEvent(f, "identity").identity.quantization.name = "wrong"; }],
  ["identity architecture altered", f => { fixtureEvent(f, "identity").identity.architecture = "wrong"; }],
  ["identity size altered", f => { fixtureEvent(f, "identity").identity.size_bytes++; }],
  ["identity model altered", f => { fixtureEvent(f, "identity").identity.key = "another-model"; }],
  ["runtime version altered", f => { fixtureEvent(f, "source").runtime.version = "wrong"; }],
  ["runtime binary hash altered", f => { fixtureEvent(f, "source").runtime.files[0].sha256 = "f".repeat(64); }],
  ["missing actual file-hash checks", f => { f.events = f.events.filter(row => row.type !== "verified-files"); }],
  ["checked artifact hash altered", f => { fixtureEvent(f, "verified-files").artifact.sha256 = "f".repeat(64); }],
  ["checked artifact path altered", f => { fixtureEvent(f, "verified-files").artifact.path = "C:\\synthetic-fixture\\wrong.gguf"; }],
  ["checked artifact bytes altered", f => { fixtureEvent(f, "verified-files").artifact.bytes++; }],
  ["checked runtime omitted", f => { fixtureEvent(f, "verified-files").runtime = []; }],
  ["checked runtime hash altered", f => { fixtureEvent(f, "verified-files").runtime[0].sha256 = "f".repeat(64); }],
  ["metadata template altered", f => { fixtureEvent(f, "metadata").selected["tokenizer.chat_template"] += " changed"; }],
  ["metadata template digest altered", f => { fixtureEvent(f, "metadata").chatTemplateSha256 = "f".repeat(64); }],
  ["echoed load template altered", f => { fixtureEvent(f, "load").response.load_config.prompt_template.template += " changed"; }],
  ["loaded context altered", f => { fixtureEvent(f, "load").response.load_config.context_length = 8192; }],
  ["load request context altered", f => { fixtureEvent(f, "load").request.context_length = 8192; }],
  ["loaded speculation enabled", f => { fixtureEvent(f, "load").response.load_config.speculative_draft_simple = true; }],
  ["resident config altered", f => { fixtureEvent(f, "resident").resident.config.context_length = 8192; }],
  ["resident digest altered", f => { fixtureEvent(f, "resident").configSha256 = "f".repeat(64); }],
  ["resident instance altered", f => { fixtureEvent(f, "resident").resident.id = "unowned-instance"; }],
  ["request prompt altered", f => { fixtureEvent(f, "request").request.messages[1].content += " changed"; }],
  ["request role altered", f => { fixtureEvent(f, "request").request.messages[0].role = "user"; }],
  ["request cap altered", f => { fixtureEvent(f, "request").request.max_tokens++; }],
  ["request temperature altered", f => { fixtureEvent(f, "request").request.temperature = 0.7; }],
  ["request reasoning enabled", f => { fixtureEvent(f, "request").request.reasoning_effort = "high"; }],
  ["request endpoint altered", f => { fixtureEvent(f, "request").endpoint = "/other-endpoint"; }],
  ["tool schema altered", f => { fixtureEvent(f, "request", "fixture-native:1").request.tools[0].function.name = "ungranted_tool"; }],
  ["native result ID altered", f => { fixtureEvent(f, "request", "fixture-continuation:1").request.messages.at(-1).tool_call_id = "unmatched"; }],
  ["observation text altered", f => { fixtureEvent(f, "observation").normalized.content += " changed"; }],
  ["observation tools altered", f => { fixtureEvent(f, "observation", "fixture-native:1").normalized.toolCalls[0].function.arguments = '{"path":"wrong.txt"}'; }],
  ["observation finish altered", f => { fixtureEvent(f, "observation").normalized.finishReason = "length"; }],
  ["observation token count altered", f => { fixtureEvent(f, "observation").normalized.completionTokens++; }],
  ["observation TTFT altered", f => { fixtureEvent(f, "observation").normalized.firstTokenMs++; }],
  ["raw reply model altered", f => { fixtureEvent(f, "response").response.model = "unowned-model"; }],
  ["raw reply runtime altered", f => { fixtureEvent(f, "response").response.runtime.version = "wrong"; }],
  ["raw reply context altered", f => { fixtureEvent(f, "response").response.model_info.context_length = 8192; }],
  ["missing request", f => { f.events.splice(f.events.findIndex(r => r.type === "request"), 1); }],
  ["missing response", f => { f.events.splice(f.events.findIndex(r => r.type === "response"), 1); }],
  ["duplicate response", f => { f.events.splice(f.events.findIndex(r => r.type === "response"), 0, structuredClone(fixtureEvent(f, "response"))); }],
  ["unknown observation", f => { fixtureEvent(f, "observation").id = "unplanned:1"; }],
  ["response before request", f => { const a = f.events.findIndex(r => r.type === "request"), b = f.events.findIndex(r => r.type === "response"); [f.events[a], f.events[b]] = [f.events[b], f.events[a]]; }],
  ["wrong result denominator", f => { f.result.observed--; }],
  ["wrong result candidate", f => { f.result.candidate = "gemma26"; }],
  ["wrong result phase", f => { f.result.phase = "unsealed-phase"; }],
  ["wrong result configuration digest", f => { f.result.configSha256 = "f".repeat(64); }],
  ["result claims production changed", f => { f.result.productionRoutingChanged = true; }],
  ["result says cleanup failed", f => { f.result.cleanupVerified = false; }],
  ["missing cleanup proof", f => { f.events = f.events.filter(r => r.type !== "cleanup"); }],
  ["unload wrong instance", f => { fixtureEvent(f, "cleanup").unload.instance_id = "unowned-instance"; }],
  ["owned instance remains", f => { fixtureEvent(f, "cleanup").remaining = [{ id: "fixture-owned-instance", modelKey: "synthetic-qwen" }]; }],
  ["unexpected instance flag", f => { fixtureEvent(f, "cleanup").unexpectedInstances = true; }],
  ["ambiguous ownership", f => { f.result.ownershipAmbiguous = true; }],
  ["GPU threshold violation", f => { fixtureEvent(f, "telemetry").gpus[0].temperatureC = 90; }],
  ["low host memory", f => { fixtureEvent(f, "telemetry").freeMemoryBytes = 1024; }],
  ["missing telemetry", f => { f.events = f.events.filter(r => r.type !== "telemetry"); }],
  ["monitor failure despite passed result", f => { f.events.splice(-1, 0, { type: "telemetry-failure", time: f.events.at(-1).time, code: "fixture-monitor-failed" }); }],
  ["all per-request telemetry omitted", f => { f.events = f.events.filter(row => row.type !== "telemetry"
    || ["before-load", "after-load", "after-unload"].includes(row.label)); }],
  ["telemetry phase ordering changed", f => { const samples = f.events.filter(row => row.type === "telemetry");
    const before = samples.find(row => row.label === "before-load"), after = samples.find(row => row.label === "after-unload");
    before.label = "after-unload"; after.label = "before-load"; }],
  ["negative GPU allocation", f => { fixtureEvent(f, "telemetry").gpus[0].usedMemoryMiB = -1; }],
  ["duplicated GPU index", f => { fixtureEvent(f, "telemetry").gpus[1].index = 0; }],
  ["free memory greater than total", f => { fixtureEvent(f, "telemetry").totalMemoryBytes = 1024; }],
  ["negative measured generation rate", f => { fixtureEvent(f, "response").response.stats.tokens_per_second = -30;
    fixtureEvent(f, "observation").normalized.tokensPerSecond = -30; }],
  ["negative measured first-token latency", f => { fixtureEvent(f, "response").response.stats.time_to_first_token = -1;
    fixtureEvent(f, "observation").normalized.firstTokenMs = -1000; }],
  ["load never reported loaded", f => { fixtureEvent(f, "load").response.status = "loading"; }],
  ["zero permitted arm duration", f => { fixtureEvent(f, "source").armTimeoutMs = 0; }],
  ["arm duration exceeds runtime maximum", f => { fixtureEvent(f, "source").armTimeoutMs = 10 ** 12; }],
  ["request elapsed exceeds its captured wall-clock interval", f => {
    fixtureEvent(f, "response").elapsedMs = 6_000_000;
    fixtureEvent(f, "observation").elapsedMs = 6_000_001;
  }],
  ["negative prompt usage retained in raw and normalized evidence", f => {
    fixtureEvent(f, "response").response.usage.prompt_tokens = -1;
    fixtureEvent(f, "observation").normalized.promptTokens = -1;
  }],
  ["completion usage exceeds the sealed request token cap", f => {
    fixtureEvent(f, "response").response.usage.completion_tokens = 1_000_000;
    fixtureEvent(f, "observation").normalized.completionTokens = 1_000_000;
  }],
];

for (const [label, mutate] of mutations) test("independent evidence mutation rejected: " + label, () => {
  const fixture = qualificationEvidenceFixture();
  mutate(fixture);
  assert.throws(() => verifyCapture(fixture), undefined, "Verifier accepted " + label);
});

test("coordinated internal GGUF/load-template rehash cannot replace the external sealed template pin", () => {
  const f = qualificationEvidenceFixture(), replacement = "different internally consistent template";
  const metadata = fixtureEvent(f, "metadata"), load = fixtureEvent(f, "load"), resident = fixtureEvent(f, "resident");
  metadata.selected["tokenizer.chat_template"] = replacement;
  metadata.chatTemplateSha256 = fixtureSha256(replacement);
  load.response.load_config.prompt_template.template = replacement;
  resident.configSha256 = fixtureSha256(JSON.stringify(resident.resident.config));
  f.result.configSha256 = resident.configSha256;
  assert.throws(() => verifyCapture(f));
});

test("coordinated identity/requests/responses cannot swap a sealed candidate model", () => {
  const f = qualificationEvidenceFixture(), replacement = "different-model";
  fixtureEvent(f, "identity").identity.key = replacement;
  fixtureEvent(f, "load").request.model = replacement;
  fixtureEvent(f, "resident").resident.modelKey = replacement;
  for (const row of f.events) {
    if (row.type === "request") row.request.model = replacement;
    if (row.type === "response") row.response.model = replacement;
  }
  f.result.modelKey = replacement;
  assert.throws(() => verifyCapture(f));
});

test("identity must be established before loading or issuing inference", () => {
  const f = qualificationEvidenceFixture();
  const identityIndex = f.events.findIndex(row => row.type === "identity");
  const [identity] = f.events.splice(identityIndex, 1);
  f.events.splice(f.events.findIndex(row => row.type === "cleanup"), 0, identity);
  for (const [index, row] of f.events.entries()) row.time = new Date(Date.parse(f.result.startedAt) + index * 100).toISOString();
  assert.throws(() => verifyCapture(f));
});

function reclockFixture(f) {
  const start = Date.parse(f.result.startedAt);
  for (const [index, row] of f.events.entries()) row.time = new Date(start + index * 100).toISOString();
  f.result.endedAt = new Date(start + f.events.length * 100).toISOString();
  for (const row of f.events.filter(row => ["response", "observation"].includes(row.type))) {
    row.elapsedMs = Date.parse(row.time) - Date.parse(fixtureEvent(f, "request", row.id).time);
  }
}

function reversedConcurrentFixture() {
  const f = qualificationEvidenceFixture();
  const a = f.expectedSchedule[0].id, b = f.expectedSchedule[1].id;
  f.expectedSchedule[0].concurrencyGroup = "fixture-slot-0";
  f.expectedSchedule[1].concurrencyGroup = "fixture-slot-0";
  const before = id => f.events.find(row => row.type === "telemetry" && row.label === id);
  const after = id => f.events.find(row => row.type === "telemetry" && row.label === id + ":after");
  const block = [before(b), fixtureEvent(f, "request", b), before(a), fixtureEvent(f, "request", a),
    fixtureEvent(f, "response", a), after(a), fixtureEvent(f, "observation", a),
    fixtureEvent(f, "response", b), after(b), fixtureEvent(f, "observation", b)];
  const first = f.events.indexOf(before(a));
  f.events.splice(first, block.length, ...block);
  reclockFixture(f);
  return f;
}

test("declared concurrent lanes may start out of schedule order and finish independently", () => {
  const f = reversedConcurrentFixture();
  assert.deepEqual(f.events.filter(row => row.type === "request").map(row => row.id),
    ["fixture-native:1", "fixture-text:1", "fixture-continuation:1"]);
  assert.ok(verifyCapture(f));
});

test("next group cannot start while a previous concurrent lane still lacks its observation", () => {
  const f = reversedConcurrentFixture(), nextId = f.expectedSchedule[2].id;
  const moving = f.events.filter(row => (row.type === "request" && row.id === nextId)
    || (row.type === "telemetry" && row.label === nextId));
  f.events = f.events.filter(row => !moving.includes(row));
  const unfinished = f.events.indexOf(fixtureEvent(f, "observation", f.expectedSchedule[1].id));
  f.events.splice(unfinished, 0, ...moving);
  reclockFixture(f);
  assert.throws(() => verifyCapture(f));
});
