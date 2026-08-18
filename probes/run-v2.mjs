import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { embedMany, embed } from "ai";
import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";
import { createClient } from "@libsql/client";
import { agentFor, vectorStore, lmstudio, MODEL, embedder } from "./stack2.mjs";
import { loadEntries, appendEntry, skipSet, consolidate, isErrorEntry } from "./checkpoint.mjs";

process.env.SEAL = "probes/SEAL-v2.md"; process.env.CORPUS = "probes/corpus2";
execSync("node probes/verify-seal.mjs", { stdio:"inherit" });
const { cases, retrievalCorpora } = JSON.parse(readFileSync("probes/corpus2/questions.json","utf8"));
const R = "probe-user";
const log = (m) => process.stdout.write(m + " ");

// Checkpoint: every completed case lands on disk before the next starts, and a restarted run skips
// what already succeeded (error-only cases are re-attempted, at most 3 times). See GREEN-resume.md.
mkdirSync("probes/results", { recursive:true });
mkdirSync("storage", { recursive:true }); // gitignored, so absent on a fresh clone; LibSQL cannot create the parent dir itself
const CKPT = "probes/results/outputs-v2.partial.jsonl";
const skip = skipSet(loadEntries(CKPT));
const out = { push: (entry) => appendEntry(CKPT, entry) };
const skipCase = (c) => { if (skip.has(c.caseId)) { log(`${c.caseId}(skip)`); return true; } return false; };

// ---------- MEMORY ----------
for (const c of cases.filter(x=>x.probe==="memory")) {
  if (skipCase(c)) continue;
  log(c.caseId);
  const db = `file:storage/v2-${c.caseId}.db`; rmSync(db.replace("file:",""), { force:true });
  const a = agentFor(c.config ?? "default", db);
  const t = c.caseId, opts = (th=t, res=R) => ({ memory:{ thread:th, resource:res } });
  const say = async (text, o=opts()) => String((await a.generate(text, o)).text ?? "");
  try {
    if (c.axis === "recall-depth") {
      await say(c.teach); for (let i=0;i<(c.fillerTurns??0);i++) await say(`Filler ${i+1}: one color, one word.`);
      out.push({ caseId:c.caseId, config:c.config, answer: await say(c.ask) });
    } else if (c.axis === "contradiction") {
      await say(c.teach); await say(c.revise); for (let i=0;i<(c.fillerTurns??0);i++) await say(`Filler ${i+1}: one fruit.`);
      out.push({ caseId:c.caseId, answer: await say(c.ask) });
    } else if (c.axis === "thread-isolation") { await say(c.teach); out.push({ caseId:c.caseId, answer: await say(c.askInOtherThread, opts(`${t}-other`)) }); }
    else if (c.axis === "resource-isolation") { await say(c.teach); out.push({ caseId:c.caseId, answer: await say(c.askOtherResource, opts(`${t}-r2`, "other-user")) }); }
    else if (c.axis === "temporal-order") { await say(c.teach); await say(c.then); out.push({ caseId:c.caseId, answer: await say(c.ask) }); }
    else if (c.axis === "restart-survival") {
      await say(c.teach);
      const ch = spawnSync(process.execPath, ["-e", `import("./probes/stack2.mjs").then(async s=>{const a=s.agentFor("default",${JSON.stringify(db)});const r=await a.generate(${JSON.stringify(c.ask)},{memory:{thread:${JSON.stringify(t)},resource:${JSON.stringify(R)}}});console.log("A::"+r.text);});`], { encoding:"utf8", timeout:120000 });
      out.push({ caseId:c.caseId, answer: String(ch.stdout).split("A::")[1]?.trim() ?? `(child err: ${String(ch.stderr).slice(0,120)})` });
    } else if (c.axis === "growth-bound") {
      for (let i=0;i<(c.turns??40);i++) await say(`Turn ${i+1}: say ok.`);
      const dbc = createClient({ url: db }); const tbls = await dbc.execute("SELECT name FROM sqlite_master WHERE type='table'");
      const msgT = tbls.rows.map(r=>r.name).find(n=>/message/i.test(String(n)));
      let rows = null; if (msgT) rows = Number((await dbc.execute(`SELECT COUNT(*) c FROM ${msgT}`)).rows[0].c); dbc.close();
      out.push({ caseId:c.caseId, storedMessages: rows, turns: c.turns ?? 40 });
    }
  } catch (e) { out.push({ caseId:c.caseId, answer:`(error: ${String(e.message).slice(0,120)})` }); }
}

// ---------- RETRIEVAL ----------
const indexes = {};
const neededSizes = new Set(cases.filter(x=>x.probe==="retrieval" && !skip.has(x.caseId)).map(c=>c.corpusSize));
for (const { corpusSize, docs } of retrievalCorpora) {
  if (!neededSizes.has(corpusSize)) continue;
  log(`embed:${corpusSize}`);
  try { // a failed index build must error this corpus's cases, not kill the sweep (from the checkpoint work)
    // Delete the db and its WAL sidecars BEFORE opening the connection, or the write lands on a deleted
    // inode and every retrieval scores a false 0 (the bug that faked a 0/13 fray).
    for (const sfx of ["","-wal","-shm"]) rmSync(`storage/v2-corpus-${corpusSize}.db${sfx}`, { force:true });
    const store = vectorStore(`v2-corpus-${corpusSize}`);
    const { embeddings } = await embedMany({ model: embedder, values: docs.map(d=>d.text) });
    await store.createIndex({ indexName:"c", dimension: embeddings[0].length });
    await store.upsert({ indexName:"c", vectors: embeddings, metadata: docs.map(d=>({ docId:d.docId, text:d.text })) });
    indexes[corpusSize] = store;
  } catch (e) { log(`embed:${corpusSize}(failed: ${String(e.message).slice(0,60)})`); }
}
const ragAgent = new Agent({ name:"rag", instructions:"Answer only from the provided context. Quote the exact code if present.", model: lmstudio(MODEL) });
for (const c of cases.filter(x=>x.probe==="retrieval")) {
  if (skipCase(c)) continue;
  log(c.caseId);
  try {
    const store = indexes[c.corpusSize]; const topK = c.topK ?? 5;
    const { embedding } = await embed({ model: embedder, value: c.query });
    const hits = await store.query({ indexName:"c", queryVector: embedding, topK });
    const ctx = hits.map(h=>`[${h.metadata.docId}] ${h.metadata.text}`).join("\n");
    const r = await ragAgent.generate(`Context:\n${ctx}\n\nQuestion: ${c.query}`);
    out.push({ caseId:c.caseId, answer:String(r.text), retrieved: hits.map(h=>h.metadata.docId), retrievedRank: hits.findIndex(h=>h.metadata.docId===undefined) });
  } catch (e) { out.push({ caseId:c.caseId, answer:`(error: ${String(e.message).slice(0,120)})` }); }
}

// ---------- TOOLS ----------
mkdirSync("sandbox/inner/deep", { recursive:true });
for (const c of cases.filter(x=>x.probe==="tools")) {
  if (skipCase(c)) continue;
  log(c.caseId);
  try {
    if (c.setupFile) writeFileSync(`sandbox/${c.setupFile.name}`, c.setupFile.content);
    if (c.bigFile) { const lines = Array.from({length:c.bigFile.lines}, (_,i)=> i===c.bigFile.needleLine ? c.bigFile.needle : `line ${i+1} of routine filler text`); writeFileSync(`sandbox/${c.bigFile.name}`, lines.join("\n")); }
    const servers = c.badServer
      ? { database: { command:"node", args:["-e","process.exit(1)"] } }
      : { filesystem: { command:"npx", args:["-y","@modelcontextprotocol/server-filesystem", new URL("../sandbox", import.meta.url).pathname] } };
    const mcp = new MCPClient({ servers });
    let tools = {}; try { tools = await mcp.listTools(); } catch { /* unavailable server */ }
    const ta = new Agent({ name:"tools", instructions:"You are a helpful assistant.", model: lmstudio(MODEL), tools });
    const r = await ta.generate(c.ask, { maxSteps: 8 });
    out.push({ caseId:c.caseId, answer:String(r.text), toolNames:(r.toolCalls??[]).map(x=>x.payload?.toolName).filter(Boolean) });
    await mcp.disconnect();
  } catch (e) { out.push({ caseId:c.caseId, answer:`(error: ${String(e.message).slice(0,140)})` }); }
}

// ---------- MODEL ----------
for (const c of cases.filter(x=>x.probe==="model")) {
  if (skipCase(c)) continue;
  log(c.caseId);
  try {
    if (c.axis === "instruction-retention") {
      const db = `file:storage/v2-${c.caseId}.db`; rmSync(db.replace("file:",""),{force:true});
      const a = agentFor(c.config ?? "window40", db); const o = { memory:{ thread:c.caseId, resource:R } };
      const say = async (t)=>String((await a.generate(t,o)).text??"");
      await say(c.instruction); for (let i=0;i<(c.fillerTurns??0);i++) await say(`Filler ${i+1}: one sentence about weather.`);
      out.push({ caseId:c.caseId, answer: await say(c.ask) });
    } else if (c.axis === "context-saturation") {
      const filler = "This is neutral filler describing routine warehouse operations. ".repeat(Math.ceil(c.fillerChars/60));
      const plain = new Agent({ name:"sat", instructions:"You are a helpful assistant.", model: lmstudio(MODEL) });
      const r = await plain.generate(`${c.earlyFact}\n\n${filler}\n\n${c.ask}`);
      out.push({ caseId:c.caseId, answer:String(r.text) });
    } else if (c.axis === "structured-validity") {
      const plain = new Agent({ name:"struct", instructions:"You are a helpful assistant.", model: lmstudio(MODEL) });
      const trials = []; for (let t=0;t<(c.trials??10);t++) trials.push(String((await plain.generate(c.ask)).text));
      out.push({ caseId:c.caseId, trials });
    } else if (c.axis === "long-output-integrity") {
      const plain = new Agent({ name:"long", instructions:"You are a helpful assistant.", model: lmstudio(MODEL) });
      out.push({ caseId:c.caseId, answer:String((await plain.generate(c.ask)).text) });
    }
  } catch (e) { out.push({ caseId:c.caseId, answer:`(error: ${String(e.message).slice(0,120)})` }); }
}

// ---------- EVALS ----------
for (const c of cases.filter(x=>x.probe==="evals")) {
  if (skipCase(c)) continue;
  log(c.caseId);
  try {
    const { similarity } = await import("@mastra/evals/checks");
    // A non-LLM check: does the response overlap the context/expected. Returns a number in [0,1].
    const res = similarity(c.scoreThis.response, c.scoreThis.context);
    const score = typeof res === "number" ? res : (res?.score ?? res?.value ?? null);
    out.push({ caseId:c.caseId, score, metricUsed:"checks.similarity" });
  } catch (e) { out.push({ caseId:c.caseId, answer:`(error: ${String(e.message).slice(0,140)})` }); }
}

const finalOut = consolidate(loadEntries(CKPT));
const errCount = finalOut.filter(isErrorEntry).length;
writeFileSync("probes/results/outputs-v2.json", JSON.stringify({ schemaVersion:"runalab-probe-outputs/v2", ranAt:new Date().toISOString(), outputs: finalOut }, null, 1));
console.log(`\nwrote ${finalOut.length} outputs (${errCount} error entries) from ${CKPT}`);
