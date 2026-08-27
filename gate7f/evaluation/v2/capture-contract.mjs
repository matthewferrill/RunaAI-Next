import { createHash } from "node:crypto";
import { CAPTURE_POLICY } from "./capture-policy.mjs";

export const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const API = "http://127.0.0.1:1234";
export const CONTEXT = 32768;
export function requireValue(condition, code) {
  if (!condition) throw new Error(code);
}
export function loadedInstances(inventory) {
  requireValue(Array.isArray(inventory?.models), "gate7f1-inventory-invalid");
  return inventory.models.flatMap(model => (model.loaded_instances ?? []).map(instance => ({
    modelKey: model.key, ...instance,
  })));
}
export function assertLoadEnvelope(config, templateSha256) {
  requireValue(config?.context_length === CONTEXT && config.flash_attention === true
    && config.offload_kv_cache_to_gpu === true, "gate7f1-load-config-invalid");
  requireValue(config.speculative_draft_mtp === false && config.speculative_draft_simple === false
    && config.speculative_draft_model === "", "gate7f1-speculative-runtime-not-disabled");
  requireValue(typeof templateSha256 === "string" && typeof config.prompt_template?.template === "string"
    && createHash("sha256").update(config.prompt_template.template).digest("hex") === templateSha256,
  "gate7f1-loaded-template-mismatch");
}
export function assertResidency(inventory, modelKey, instanceId, configDigest) {
  const instances = loadedInstances(inventory);
  if (instanceId === null) {
    requireValue(instances.length === 0, "gate7f1-preexisting-instance");
    return;
  }
  requireValue(instances.length === 1 && instances[0].modelKey === modelKey
    && instances[0].id === instanceId, "gate7f1-unexpected-instance");
  requireValue(instances[0].config?.context_length === CONTEXT, "gate7f1-context-drift");
  if (configDigest) requireValue(digest(instances[0].config) === configDigest, "gate7f1-load-config-drift");
  return instances[0];
}
export function requestForCase(item, modelKey, reasoningOff = false) {
  requireValue(typeof modelKey === "string" && modelKey.length > 0, "gate7f1-model-key-invalid");
  requireValue(["text", "agent-json"].includes(item.format) && Array.isArray(item.messages)
    && item.messages.length > 0, "gate7f1-request-invalid");
  for (const message of item.messages) {
    requireValue(Object.keys(message).sort().join(",") === "content,role"
      && ["user", "assistant", "system"].includes(message.role)
      && typeof message.content === "string", "gate7f1-message-invalid");
  }
  const request = { model: modelKey, messages: structuredClone(item.messages), temperature: 0,
    max_tokens: item.format === "text" ? CAPTURE_POLICY.textOutputTokens : CAPTURE_POLICY.agentOutputTokens, stream: false };
  if (reasoningOff) request.reasoning_effort = "none";
  return request;
}
export function validateCompletion(response, modelKey, instanceId, runtime) {
  requireValue(response && [modelKey, instanceId].includes(response.model), "gate7f1-response-model-mismatch");
  requireValue(Array.isArray(response.choices) && response.choices.length === 1, "gate7f1-response-shape-invalid");
  const choice = response.choices[0];
  requireValue(["stop", "length"].includes(choice.finish_reason), "gate7f1-provider-output-incomplete");
  requireValue(typeof choice.message?.content === "string"
    && Buffer.byteLength(choice.message.content) <= 65536, "gate7f1-provider-content-invalid");
  requireValue(!choice.message.tool_calls?.length, "gate7f1-unexpected-tool-call");
  requireValue(!choice.message.reasoning && !choice.message.reasoning_content
    && !/<think>|<\|channel>thought/i.test(choice.message.content)
    && !(response.stats?.reasoning_output_tokens > 0)
    && !(response.usage?.completion_tokens_details?.reasoning_tokens > 0), "gate7f1-reasoning-not-disabled");
  requireValue(response.model_info?.context_length === CONTEXT, "gate7f1-response-context-mismatch");
  requireValue(response.runtime?.name === runtime.name && response.runtime?.version === runtime.version,
    "gate7f1-response-runtime-mismatch");
  requireValue(Number.isInteger(response.usage?.completion_tokens) && response.usage.completion_tokens >= 0,
    "gate7f1-usage-missing");
  requireValue(Number.isFinite(response.stats?.tokens_per_second) && response.stats.tokens_per_second >= 0
    && Number.isFinite(response.stats?.time_to_first_token) && response.stats.time_to_first_token >= 0,
    "gate7f1-performance-metrics-missing");
  return { finishReason: choice.finish_reason, rawResponse: choice.message.content, generationTokens: response.usage.completion_tokens,
    generatedTokensPerSecond: response.stats.tokens_per_second,
    timeToFirstTokenMs: response.stats.time_to_first_token * 1000 };
}
export function assertTelemetry(sample) {
  requireValue(sample.freeMemoryBytes >= 8 * 1024 ** 3, "gate7f1-low-host-memory");
  requireValue(sample.gpus.length === 2 && sample.gpus.every(gpu =>
    gpu.name === "Quadro RTX 6000" && Number.isFinite(gpu.temperatureC) && gpu.temperatureC < 85
    && gpu.totalMemoryMiB === 23040 && gpu.usedMemoryMiB < gpu.totalMemoryMiB),
  "gate7f1-gpu-boundary");
}

export async function cleanupOwnedInstance(api, instanceId) {
  let unload = null;
  if (instanceId !== null) {
    requireValue(typeof instanceId === "string" && instanceId.length > 0, "gate7f1-cleanup-id-invalid");
    unload = await api("/api/v1/models/unload", { instance_id: instanceId }, 120000);
  }
  const remaining = loadedInstances(await api("/api/v1/models"));
  return { unload, remaining, cleanupVerified: instanceId === null ? remaining.length === 0
    : !remaining.some(item => item.id === instanceId), unexpectedInstances: remaining.length > 0 };
}
