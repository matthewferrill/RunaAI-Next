// The reference agent: pure standard, nothing custom.
//
// Mastra Agent + AI SDK openai-compatible provider, pointed at the LM Studio endpoint on RUNA-HOME.
// This file is the documented minimal configuration and nothing else. Every piece Runa wants to add
// later must beat what this does out of the box.

import { Agent } from "@mastra/core/agent";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const lmstudio = createOpenAICompatible({
  name: "lmstudio",
  baseURL: process.env.LMSTUDIO_URL || "http://192.168.50.165:1234/v1",
});

export const referenceAgent = new Agent({
  name: "reference",
  // The stock instruction, deliberately generic. Runa's identity is a piece that must prove itself in
  // later; the reference arm gets what any quickstart gets.
  instructions: "You are a helpful assistant.",
  model: lmstudio(process.env.LMSTUDIO_MODEL || "qwen3-coder-30b-a3b-instruct"),
});
