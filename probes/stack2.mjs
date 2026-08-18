// Configurable stack for the v2 sweep: memory config is a first-class knob so the fray can be mapped.
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore, LibSQLVector } from "@mastra/libsql";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const lmstudio = createOpenAICompatible({ name:"lmstudio", baseURL: process.env.LMSTUDIO_URL || "http://192.168.50.165:1234/v1" });
export const MODEL = process.env.LMSTUDIO_MODEL || "qwen3-coder-30b-a3b-instruct";
export const embedder = lmstudio.textEmbeddingModel("text-embedding-nomic-embed-text-v1.5");

// The four memory configs the matrix probes. Each is the framework's own documented option — nothing tuned.
export function memoryFor(config, dbFile) {
  const storage = new LibSQLStore({ id:`mem-${config}`, url: dbFile });
  if (config === "default")  return new Memory({ storage, options:{ lastMessages:10 } });
  if (config === "window40") return new Memory({ storage, options:{ lastMessages:40 } });
  if (config === "semantic") return new Memory({ storage, vector:new LibSQLVector({ id:`memv-${config}`, url: dbFile }), embedder, options:{ lastMessages:5, semanticRecall:{ topK:5, messageRange:2 } } });
  if (config === "working")  return new Memory({ storage, options:{ lastMessages:10, workingMemory:{ enabled:true } } });
  throw new Error(`unknown memory config ${config}`);
}
export function agentFor(config, dbFile) {
  return new Agent({ name:`probe-${config}`, instructions:"You are a helpful assistant. When the user tells you a fact to remember, retain it and report it exactly when asked.", model: lmstudio(MODEL), memory: memoryFor(config, dbFile) });
}
export function vectorStore(name="probe2-vectors"){ return new LibSQLVector({ id:name, url:`file:storage/${name}.db` }); }
