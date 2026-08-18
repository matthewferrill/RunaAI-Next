import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const lmstudio = createOpenAICompatible({ name: "lmstudio", baseURL: "http://192.168.50.165:1234/v1" });
const mcp = new MCPClient({ servers: { filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", new URL("../sandbox", import.meta.url).pathname] } } });

const agent = new Agent({
  name: "reference-mcp",
  instructions: "You are a helpful assistant.",
  model: lmstudio("qwen3-coder-30b-a3b-instruct"),
  tools: await mcp.listTools(),
});

const result = await agent.generate("Read the file notes.txt and tell me the magic word.", { maxSteps: 5 });
console.log("steps:", result.steps?.length);
console.log("first toolCall keys:", result.toolCalls?.[0] ? Object.keys(result.toolCalls[0]).join(",") : "(none)");
console.log("toolNames:", JSON.stringify(result.toolCalls?.map(c => c.payload?.toolName ?? c.toolName ?? c.name)));
const text = String(result.text);
console.log("answer tail:", text.slice(-220));
console.log("contains plover:", text.toLowerCase().includes("plover"));
await mcp.disconnect();
