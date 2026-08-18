// Run the sealed corpus against the stock stack. Outputs only — grading is a separate, sealed-checked step.
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { embedMany, embed } from "ai";
import { probeAgent, vectorStore, lmstudio, MODEL } from "./stack.mjs";
import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";

execSync("node probes/verify-seal.mjs", { stdio: "inherit" }); // refuse to run against a touched corpus

const { cases, retrievalDocs } = JSON.parse(readFileSync("probes/corpus/questions.json", "utf8"));
const outputs = [];
const RESOURCE = "probe-user";
rmSync("storage/probe-memory.db", { force: true });
rmSync("storage/probe-vectors.db", { force: true });
const agent = probeAgent();
const say = async (text, thread) => String((await agent.generate(text, { memory: { thread, resource: RESOURCE } })).text ?? "");

for (const c of cases.filter((x) => x.probe === "memory")) {
  const thread = c.caseId;
  process.stdout.write(`${c.caseId} `);
  if (c.axis === "recall-depth") {
    await say(c.teach, thread);
    for (let i = 0; i < (c.fillerTurns ?? 0); i += 1) await say(`Quick filler #${i + 1}: name one color, one word only.`, thread);
    outputs.push({ caseId: c.caseId, answer: await say(c.ask, thread) });
  } else if (c.axis === "contradiction") {
    await say(c.teach, thread); await say(c.revise, thread);
    for (let i = 0; i < (c.fillerTurns ?? 0); i += 1) await say(`Filler #${i + 1}: one word, any fruit.`, thread);
    outputs.push({ caseId: c.caseId, answer: await say(c.ask, thread) });
  } else if (c.axis === "thread-isolation") {
    await say(c.teach, thread);
    outputs.push({ caseId: c.caseId, answer: await say(c.askInOtherThread, `${thread}-other`) });
  } else if (c.axis === "restart-survival") {
    await say(c.teach, thread);
    // The ask runs in a genuinely fresh process that re-opens the same store.
    const child = spawnSync(process.execPath, ["-e", `
      import("./probes/stack.mjs").then(async (s) => {
        const a = s.probeAgent();
        const r = await a.generate(${JSON.stringify(c.ask)}, { memory: { thread: ${JSON.stringify(thread)}, resource: ${JSON.stringify(RESOURCE)} } });
        console.log("ANSWER::" + r.text);
      });`], { encoding: "utf8", timeout: 120000 });
    outputs.push({ caseId: c.caseId, answer: String(child.stdout).split("ANSWER::")[1]?.trim() ?? `(child failed: ${String(child.stderr).slice(0, 200)})` });
  } else if (c.axis === "temporal-order") {
    await say(c.teach, thread); await say(c.then, thread);
    outputs.push({ caseId: c.caseId, answer: await say(c.ask, thread) });
  }
}

// retrieval: classic stock RAG — embed docs once, top-3 context, answer.
const store = vectorStore();
const { embeddings } = await embedMany({ model: (await import("./stack.mjs")).embedder, values: retrievalDocs.map((d) => d.text) });
await store.createIndex({ indexName: "probes", dimension: embeddings[0].length });
await store.upsert({ indexName: "probes", vectors: embeddings, metadata: retrievalDocs.map((d) => ({ docId: d.docId, text: d.text })) });
const bare = new Agent({ name: "rag", instructions: "Answer from the provided context.", model: lmstudio(MODEL) });
for (const c of cases.filter((x) => x.probe === "retrieval")) {
  process.stdout.write(`${c.caseId} `);
  const { embedding } = await embed({ model: (await import("./stack.mjs")).embedder, value: c.query });
  const hits = await store.query({ indexName: "probes", queryVector: embedding, topK: 3 });
  const context = hits.map((h) => `[${h.metadata.docId}] ${h.metadata.text}`).join("\n");
  const result = await bare.generate(`Context:\n${context}\n\nQuestion: ${c.query}`);
  outputs.push({ caseId: c.caseId, answer: String(result.text), retrieved: hits.map((h) => h.metadata.docId) });
}

// tools: MCP filesystem against the sandbox.
mkdirSync("sandbox/inner/deep", { recursive: true });
for (const c of cases.filter((x) => x.probe === "tools")) {
  process.stdout.write(`${c.caseId} `);
  if (c.setupFile) writeFileSync(`sandbox/${c.setupFile.name}`, c.setupFile.content);
  const mcp = new MCPClient({ servers: { filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", new URL("../sandbox", import.meta.url).pathname] } } });
  const toolAgent = new Agent({ name: "tools", instructions: "You are a helpful assistant.", model: lmstudio(MODEL), tools: await mcp.listTools() });
  const result = await toolAgent.generate(c.ask, { maxSteps: 6 });
  outputs.push({ caseId: c.caseId, answer: String(result.text) });
  await mcp.disconnect();
}

// model: retention and structured validity.
for (const c of cases.filter((x) => x.probe === "model")) {
  process.stdout.write(`${c.caseId} `);
  if (c.axis === "instruction-retention") {
    const thread = c.caseId;
    await say(c.instruction, thread);
    for (let i = 0; i < (c.fillerTurns ?? 0); i += 1) await say(`Filler #${i + 1}: reply with one short sentence about weather.`, thread);
    outputs.push({ caseId: c.caseId, answer: await say(c.ask, thread) });
  } else if (c.axis === "structured-validity") {
    const trials = [];
    const plain = new Agent({ name: "structured", instructions: "You are a helpful assistant.", model: lmstudio(MODEL) });
    for (let t = 0; t < (c.trials ?? 10); t += 1) trials.push(String((await plain.generate(c.ask)).text));
    outputs.push({ caseId: c.caseId, trials });
  }
}

writeFileSync("probes/results/outputs-v1.json", JSON.stringify({ schemaVersion: "runalab-probe-outputs/v1", ranAt: new Date().toISOString(), outputs }, null, 1));
console.log(`\nwrote ${outputs.length} case outputs`);
