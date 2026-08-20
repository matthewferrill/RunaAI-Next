import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { readFileSync } from "node:fs";

const prompt = process.env.BAKEOFF_PROMPT_FILE
  ? readFileSync(process.env.BAKEOFF_PROMPT_FILE, "utf8")
  : (process.env.BAKEOFF_PROMPT ?? "Reply with exactly READY.");
const maxInputBytes = Number(process.env.BAKEOFF_MAX_INPUT_BYTES ?? 65536);
const inputBytes = Buffer.byteLength(prompt, "utf8");
if (inputBytes > maxInputBytes) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: "INPUT_BYTES_EXCEEDED",
    inputBytes, maxInputBytes, transmitted: false })}\n`);
  process.exit(3);
}
const baseURL = process.env.BAKEOFF_BASE_URL;
const modelId = process.env.BAKEOFF_MODEL_ID ?? "qwen3-coder-30b-a3b-instruct";
const provider = createOpenAICompatible({ name: "preflight", baseURL });
try {
  const result = await generateText({ model: provider(modelId), prompt, maxRetries: 0,
    timeout: { totalMs: 5000 } });
  process.stdout.write(`${JSON.stringify({ ok: result.finishReason === "stop",
    inputBytes, maxInputBytes, transmitted: true, finishReason: result.finishReason })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, inputBytes, maxInputBytes,
    transmitted: true, error: String(error.message) })}\n`);
  process.exit(3);
}
