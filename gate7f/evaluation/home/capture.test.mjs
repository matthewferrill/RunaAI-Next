import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CONTEXT, assertLoadEnvelope, assertResidency, assertTelemetry, cleanupOwnedInstance, digest, loadedInstances,
  requestForCase, validateCompletion } from "./capture-contract.mjs";
import { messagesForBurninCase } from "../prompt.mjs";

const runtime = { name: "llama.cpp-win-x86_64-nvidia-cuda-avx2", version: "2.25.2" };
const inventory = { models: [{ key: "candidate", loaded_instances: [{ id: "owned",
  config: { context_length: CONTEXT, parallel: 4 } }] }] };
const response = () => ({ model: "candidate", choices: [{ finish_reason: "stop",
  message: { role: "assistant", content: "Synthetic answer." } }],
  model_info: { context_length: CONTEXT }, runtime,
  stats: { tokens_per_second: 20, time_to_first_token: 0.2 },
  usage: { completion_tokens: 10 } });

test("loaded envelope requires the exact artifact template and no speculative decoding", () => {
  const template = "synthetic-template";
  const hash = createHash("sha256").update(template).digest("hex");
  const config = { context_length: CONTEXT, flash_attention: true, offload_kv_cache_to_gpu: true,
    speculative_draft_mtp: false, speculative_draft_simple: false, speculative_draft_model: "",
    prompt_template: { template } };
  assertLoadEnvelope(config, hash);
  assert.throws(() => assertLoadEnvelope({ ...config, speculative_draft_mtp: true }, hash), /speculative/);
  assert.throws(() => assertLoadEnvelope(config, "a".repeat(64)), /template-mismatch/);
  assert.throws(() => assertLoadEnvelope({ ...config, flash_attention: false }, hash), /config-invalid/);
});

test("Home capture refuses pre-existing and concurrent models and load drift", () => {
  assert.throws(() => assertResidency(inventory, null, null), /preexisting-instance/);
  assertResidency({ models: [] }, null, null);
  const instance = assertResidency(inventory, "candidate", "owned");
  assertResidency(inventory, "candidate", "owned", digest(instance.config));
  const changed = structuredClone(inventory);
  changed.models[0].loaded_instances[0].config.parallel = 2;
  assert.throws(() => assertResidency(changed, "candidate", "owned", digest(instance.config)), /config-drift/);
  changed.models.push({ key: "other", loaded_instances: [{ id: "other" }] });
  assert.throws(() => assertResidency(changed, "candidate", "owned"), /unexpected-instance/);
  assert.equal(loadedInstances(inventory).length, 1);
});
test("capture requests preserve sealed messages and never transmit expected answers or tools", () => {
  const corpus = JSON.parse(readFileSync(new URL("../corpus.json", import.meta.url), "utf8"));
  for (const item of corpus.cases) {
    const messages = messagesForBurninCase(item);
    const request = requestForCase({ ...item, messages }, "candidate");
    assert.deepEqual(request.messages, messages);
    assert.deepEqual(Object.keys(request).sort(), ["max_tokens", "messages", "model", "stream", "temperature"]);
    assert.equal(request.max_tokens, item.format === "text" ? 256 : 512);
    assert.equal(request.temperature, 0);
  }
  assert.throws(() => requestForCase({ format: "text", messages: [
    { role: "tool", content: "data", tool_call_id: "x" },
  ] }, "candidate"), /message-invalid/);
});
test("capture preserves malformed model JSON for grading instead of repairing it", () => {
  const r = response(); r.choices[0].message.content = "{not JSON";
  assert.equal(validateCompletion(r, "candidate", "owned", runtime).rawResponse, "{not JSON");
});
test("configurable thinking uses the installed API's explicit per-request none value", () => {
  const item = { format: "text", messages: [{ role: "user", content: "Synthetic prompt." }] };
  assert.equal(requestForCase(item, "candidate", true).reasoning_effort, "none");
  assert.equal("reasoning_effort" in requestForCase(item, "candidate", false), false);
  assert.deepEqual(requestForCase(item, "candidate", true).messages, item.messages);
});
test("capture rejects incomplete, wrong-model, wrong-runtime and reasoning-bearing responses", () => {
  for (const mutate of [
    r => { r.choices[0].finish_reason = "length"; },
    r => { r.model = "other"; },
    r => { r.runtime = { ...runtime, version: "other" }; },
    r => { r.model_info.context_length = 4096; },
    r => { r.choices[0].message.reasoning_content = "thinking"; },
    r => { r.usage.completion_tokens_details = { reasoning_tokens: 1 }; },
    r => { r.choices[0].message.content = "<|channel>thought hidden"; },
    r => { r.choices[0].message.tool_calls = [{ function: { name: "execute" } }]; },
  ]) {
    const r = response(); mutate(r);
    assert.throws(() => validateCompletion(r, "candidate", "owned", runtime), /gate7f1-/);
  }
});
test("missing metrics are refused rather than invented as zero", () => {
  const r = response(); delete r.stats.time_to_first_token;
  assert.throws(() => validateCompletion(r, "candidate", "owned", runtime), /metrics-missing/);
  const good = validateCompletion(response(), "candidate", "owned", runtime);
  assert.equal(good.timeToFirstTokenMs, 200);
  assert.equal(good.generatedTokensPerSecond, 20);
});
test("telemetry stops on low host memory, heat and wrong GPU estate", () => {
  const sample = { freeMemoryBytes: 16 * 1024 ** 3, gpus: [0, 1].map(index => ({
    index, name: "Quadro RTX 6000", totalMemoryMiB: 23040, usedMemoryMiB: 14000, temperatureC: 60,
  })) };
  assertTelemetry(sample);
  assert.throws(() => assertTelemetry({ ...sample, freeMemoryBytes: 1024 }), /low-host-memory/);
  sample.gpus[1].temperatureC = 85;
  assert.throws(() => assertTelemetry(sample), /gpu-boundary/);
});
test("operator source has exact-instance cleanup, loopback-only API and no model-code execution", () => {
  const source = readFileSync(new URL("./home-runner.mjs", import.meta.url), "utf8");
  assert.match(source, /finally/);
  assert.match(source, /cleanupOwnedInstance\(api, instanceId\)/);
  assert.match(source, /redirect: "error"/);
  assert.doesNotMatch(source, /unload-all|eval\(|new Function|runInContext|api\/v1\/chat|integrations:/);
  const download = readFileSync(new URL("./Download-PinnedGemma.ps1", import.meta.url), "utf8");
  assert.match(download, /14439363584/);
  assert.match(download, /3eca3b8f6d7baf218a7dd6bba5fb59a56ee25fe2d567b6f5f589b4f697eca51d/);
  assert.match(download, /Assert-NoReparse/);
  assert.doesNotMatch(download, /Remove-Item|Set-Acl|Register-ScheduledTask|Start-Service|hfDownloadToken/);
});
test("cleanup unloads only its exact instance and preserves an unrelated concurrent model", async () => {
  const calls = [];
  const cleanup = await cleanupOwnedInstance(async (endpoint, body) => {
    calls.push({ endpoint, body });
    return endpoint.endsWith("/unload") ? { instance_id: "owned" }
      : { models: [{ key: "other", loaded_instances: [{ id: "other-instance" }] }] };
  }, "owned");
  assert.deepEqual(calls[0], { endpoint: "/api/v1/models/unload", body: { instance_id: "owned" } });
  assert.equal(calls.length, 2);
  assert.equal(cleanup.cleanupVerified, true);
  assert.equal(cleanup.unexpectedInstances, true);
});
test("cleanup never guesses ownership after a lost load response or unloads a pre-existing model", async () => {
  const calls = [];
  const cleanup = await cleanupOwnedInstance(async endpoint => {
    calls.push(endpoint);
    return inventory;
  }, null);
  assert.deepEqual(calls, ["/api/v1/models"]);
  assert.equal(cleanup.cleanupVerified, false);
  await assert.rejects(cleanupOwnedInstance(async () => { throw new Error("offline"); }, "owned"), /offline/);
});
