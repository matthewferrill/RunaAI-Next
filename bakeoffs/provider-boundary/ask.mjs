import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

const baseURL = process.env.BAKEOFF_BASE_URL;
const modelId = process.env.BAKEOFF_MODEL_ID ?? "qwen3-coder-30b-a3b-instruct";
const timeoutMs = Number(process.env.BAKEOFF_TIMEOUT_MS ?? 5000);
if (!baseURL) throw new Error("BAKEOFF_BASE_URL is required");

const provider = createOpenAICompatible({ name: "bakeoff", baseURL });
const started = Date.now();
try {
  const result = await generateText({
    model: provider(modelId),
    prompt: "Reply with exactly READY.",
    maxRetries: 0,
    timeout: { totalMs: timeoutMs }
  });
  const actualModel = result.response?.modelId ?? null;
  if (result.finishReason !== "stop") {
    throw new Error(`INCOMPLETE_RESPONSE finish=${result.finishReason} raw=${result.rawFinishReason ?? "null"}`);
  }
  if (actualModel !== modelId) {
    throw new Error(`MODEL_IDENTITY_MISMATCH expected=${modelId} actual=${actualModel ?? "missing"}`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, elapsedMs: Date.now() - started,
    finishReason: result.finishReason, rawFinishReason: result.rawFinishReason ?? null,
    modelId: actualModel, text: result.text })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, elapsedMs: Date.now() - started,
    error: String(error?.message ?? error), name: String(error?.name ?? "Error") })}\n`);
  process.exitCode = 3;
}
