// Re-run only retrieval + evals with the inode-order fix; merge into outputs-v2.json.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { embedMany, embed } from "ai";
import { Agent } from "@mastra/core/agent";
import { vectorStore, lmstudio, MODEL, embedder } from "./stack2.mjs";
process.env.SEAL="probes/SEAL-v2.md"; process.env.CORPUS="probes/corpus2";
execSync("node probes/verify-seal.mjs", { stdio:"inherit" });
const { cases, retrievalCorpora } = JSON.parse(readFileSync("probes/corpus2/questions.json","utf8"));
const prev = JSON.parse(readFileSync("probes/results/outputs-v2.json","utf8"));
const keep = prev.outputs.filter(o => !o.caseId.startsWith("retrieval") && !o.caseId.startsWith("evals"));
const out = [];
const indexes = {};
for (const { corpusSize, docs } of retrievalCorpora) {
  process.stdout.write(`embed:${corpusSize} `);
  for (const sfx of ["","-wal","-shm"]) rmSync(`storage/v2-corpus-${corpusSize}.db${sfx}`, { force:true });
  const store = vectorStore(`v2-corpus-${corpusSize}`);
  const { embeddings } = await embedMany({ model: embedder, values: docs.map(d=>d.text) });
  await store.createIndex({ indexName:"c", dimension: embeddings[0].length });
  await store.upsert({ indexName:"c", vectors: embeddings, metadata: docs.map(d=>({ docId:d.docId, text:d.text })) });
  indexes[corpusSize] = store;
}
const rag = new Agent({ name:"rag", instructions:"Answer only from the provided context. Quote the exact code if present.", model: lmstudio(MODEL) });
for (const c of cases.filter(x=>x.probe==="retrieval")) {
  process.stdout.write(`${c.caseId} `);
  const store = indexes[c.corpusSize]; const topK = c.topK ?? 5;
  const { embedding } = await embed({ model: embedder, value: c.query });
  const hits = await store.query({ indexName:"c", queryVector: embedding, topK });
  const ctx = hits.map(h=>`[${h.metadata.docId}] ${h.metadata.text}`).join("\n");
  const r = await rag.generate(`Context:\n${ctx}\n\nQuestion: ${c.query}`);
  const wantDoc = JSON.parse(readFileSync("probes/corpus2/labels.json","utf8")).labels.find(l=>l.caseId===c.caseId)?.expect?.fromDoc;
  out.push({ caseId:c.caseId, answer:String(r.text), retrieved:hits.map(h=>h.metadata.docId), rankOfTarget: wantDoc ? hits.findIndex(h=>h.metadata.docId===wantDoc) : null });
}
for (const c of cases.filter(x=>x.probe==="evals")) {
  process.stdout.write(`${c.caseId} `);
  const { similarity } = await import("@mastra/evals/scorers/utils").catch(()=>({}));
  let score=null, used=null;
  try { const mod = await import("@mastra/evals/checks"); const res = mod.similarity(c.scoreThis.response, c.scoreThis.context); score = typeof res==="number"?res:(res?.score??res?.value??null); used="checks.similarity"; } catch(e){ used="err:"+e.message.slice(0,40); }
  out.push({ caseId:c.caseId, score, metricUsed:used });
}
writeFileSync("probes/results/outputs-v2.json", JSON.stringify({ ...prev, outputs:[...keep, ...out] }, null, 1));
console.log(`\nre-ran ${out.length} cases`);
