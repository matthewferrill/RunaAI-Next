// Stock memory, documented default configuration. Nothing tuned.
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const lmstudio = createOpenAICompatible({
  name: "lmstudio",
  baseURL: process.env.LMSTUDIO_URL || "http://192.168.50.165:1234/v1",
});

export const referenceAgent = new Agent({
  name: "reference",
  instructions: "You are a helpful assistant.",
  model: lmstudio(process.env.LMSTUDIO_MODEL || "qwen3-coder-30b-a3b-instruct"),
  memory: new Memory({
    storage: new LibSQLStore({ id: "reference-memory", url: "file:./storage/memory.db" }),
  }),
});
