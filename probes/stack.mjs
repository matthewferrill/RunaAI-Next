// The stock stack, exactly as install-checked. Probes import this so every case runs the same assembly.
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore, LibSQLVector } from "@mastra/libsql";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const lmstudio = createOpenAICompatible({ name: "lmstudio", baseURL: process.env.LMSTUDIO_URL || "http://192.168.50.165:1234/v1" });
export const MODEL = process.env.LMSTUDIO_MODEL || "qwen3-coder-30b-a3b-instruct";
export const embedder = lmstudio.textEmbeddingModel("text-embedding-nomic-embed-text-v1.5");

export function probeAgent({ dbFile = "file:storage/probe-memory.db" } = {}) {
  return new Agent({
    name: "probe",
    instructions: "You are a helpful assistant.",
    model: lmstudio(MODEL),
    memory: new Memory({ storage: new LibSQLStore({ id: "probe-memory", url: dbFile }) }),
  });
}
export function vectorStore() {
  return new LibSQLVector({ id: "probe-vectors", url: "file:storage/probe-vectors.db" });
}
