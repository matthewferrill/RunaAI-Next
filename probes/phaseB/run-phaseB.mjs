// Phase B runner — retrieval through @mastra/rag, the reranker, and the auth module.
//
// Graded against the sealed corpus, which carries both the questions and the documents so it
// reproduces byte for byte. Labels are locked: checked against, never widened.
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { loadEntries, appendEntry } from "../checkpoint.mjs";
import { writeRun } from "../wave5/w5-lib.mjs";
import { gate } from "../instrument.mjs";
import { embedMany, embed } from "ai";
import { vectorStore, embedder } from "../stack2.mjs";

execSync("node probes/phaseB/verify-seal.mjs", { stdio: "inherit" });

const SMOKE = process.env.SMOKE === "1";
const RERANK_URL = process.env.RERANK_URL || "http://192.168.50.165:8412";
const CKPT = "probes/results/phaseB-partial.jsonl";
mkdirSync("probes/results", { recursive: true }); mkdirSync("storage", { recursive: true });
const done = new Set(loadEntries(CKPT).map((e) => e.runKey));
const skip = (k) => { if (done.has(k)) { process.stdout.write(`${k}(skip) `); return true; } return false; };
const record = (runKey, rec) => { writeRun("PB", runKey.replace(/[^\w.-]/g, "_"), rec); appendEntry(CKPT, { runKey, ...rec }); process.stdout.write(`${runKey} `); };

const corpus = JSON.parse(readFileSync("probes/corpus2/questions.json", "utf8"));
const labelFile = JSON.parse(readFileSync("probes/corpus2/labels.json", "utf8"));
const labels = Object.fromEntries((labelFile.labels ?? labelFile).map((l) => [l.caseId, l.expect]));
const retrievalCases = corpus.cases.filter((c) => c.probe === "retrieval");
const corpora = Object.fromEntries(corpus.retrievalCorpora.map((r) => [r.corpusSize, r.docs]));

// ===== the reranker =================================================================================
async function rerankHealth() {
  try { return await (await fetch(`${RERANK_URL}/health`, { signal: AbortSignal.timeout(8000) })).json(); }
  catch (e) { return { error: String(e.message).slice(0, 120) }; }
}
async function rerank(query, documents, topN) {
  const t0 = Date.now();
  const r = await fetch(`${RERANK_URL}/rerank`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, documents, top_n: topN }), signal: AbortSignal.timeout(60000) });
  const j = await r.json();
  return { ms: Date.now() - t0, results: j.results ?? [], model: j.model, scored: j.scored };
}

// ===== indexes, built once per corpus size ==========================================================
const indexes = {};
async function buildIndex(size) {
  if (indexes[size]) return indexes[size];
  const docs = corpora[size];
  for (const s of ["", "-wal", "-shm"]) rmSync(`storage/pb-corpus-${size}.db${s}`, { force: true });
  const store = vectorStore(`pb-corpus-${size}`);
  const { embeddings } = await embedMany({ model: embedder, values: docs.map((d) => d.text) });
  await store.createIndex({ indexName: "c", dimension: embeddings[0].length });
  await store.upsert({ indexName: "c", vectors: embeddings, ids: docs.map((d) => d.docId),
    metadata: docs.map((d) => ({ docId: d.docId, text: d.text })) });
  indexes[size] = store;
  process.stdout.write(`[index:${size}] `);
  return store;
}

// The scorer. A case passes when the retrieved text CONTAINS the planted answer -- the label's own
// `mustContain`. Path-level credit is deliberately not given: a topically related document that does
// not carry the answer is a miss, which is the standard the v2 review established.
const found = (texts, expect) => !!expect?.mustContain && texts.some((t) => String(t).includes(expect.mustContain));
const foundDoc = (ids, expect) => !!expect?.fromDoc && ids.includes(expect.fromDoc);

// ===== I-PB1 + I-PB2: retrieval, paired with the reranker off and on ================================
async function retrieval() {
  for (const c of retrievalCases) {
    const size = c.corpusSize ?? 60;
    const topK = c.topK ?? 5;
    const expect = labels[c.caseId];
    const store = await buildIndex(size);
    const { embedding } = await embed({ model: embedder, value: c.query });
    // One vector query serves both arms, so the only difference between them is the reranker.
    const hits = await store.query({ indexName: "c", queryVector: embedding, topK: Math.max(topK, 20) });
    const baseHits = hits.slice(0, topK);

    for (const arm of ["off", "on"]) {
      const runKey = `PB.retrieval.${c.caseId}.rerank-${arm}`; if (skip(runKey)) continue;
      try {
        let chosen = baseHits, rr = null;
        if (arm === "on") {
          const pool = hits.slice(0, 20);
          rr = await rerank(c.query, pool.map((h) => h.metadata?.text ?? ""), topK);
          chosen = rr.results.map((r) => pool[r.index]).filter(Boolean);
        }
        const texts = chosen.map((h) => h?.metadata?.text ?? "");
        const ids = chosen.map((h) => h?.metadata?.docId ?? h?.id);
        record(runKey, { invariant: arm === "on" ? "I-PB2" : "I-PB1", caseId: c.caseId, axis: c.axis,
          arm, corpusSize: size, topK, poolSize: arm === "on" ? 20 : topK,
          found: found(texts, expect), foundDoc: foundDoc(ids, expect),
          expected: expect?.mustContain ?? null, expectedDoc: expect?.fromDoc ?? null,
          rerankMs: rr?.ms ?? null, rerankModel: rr?.model ?? null,
          topIds: ids.slice(0, 5) });
      } catch (e) { record(runKey, { invariant: "I-PB1", caseId: c.caseId, arm, environmentError: true, error: String(e.message).slice(0, 160) }); }
    }
  }
}

// ===== I-PB3: does the 512-token limit truncate silently? ===========================================
async function truncationLimit() {
  const runKey = "PB.rerank.truncation-512"; if (skip(runKey)) return;
  try {
    const health = await rerankHealth();
    const marker = "ZEPHYR-QUILL-8823";
    // The answer is placed BEYOND the documented 512-token window. If the service truncates without
    // saying so, a document whose only relevant content sits past the cut scores as irrelevant.
    const filler = "lorem ipsum dolor sit amet consectetur adipiscing elit ".repeat(220);
    const longDoc = `${filler} The archive passphrase is ${marker}.`;
    const shortDoc = `The archive passphrase is ${marker}.`;
    const decoy = "The cafeteria serves lunch between twelve and two on weekdays.";
    const longRun = await rerank("What is the archive passphrase?", [longDoc, decoy], 2);
    const shortRun = await rerank("What is the archive passphrase?", [shortDoc, decoy], 2);
    const scoreOf = (r, i) => r.results.find((x) => x.index === i)?.score ?? null;
    record(runKey, { invariant: "I-PB3", health,
      maxLength: health.max_length ?? null,
      longDocChars: longDoc.length, shortDocChars: shortDoc.length,
      longAnswerScore: scoreOf(longRun, 0), longDecoyScore: scoreOf(longRun, 1),
      shortAnswerScore: scoreOf(shortRun, 0), shortDecoyScore: scoreOf(shortRun, 1),
      // The violation: the same answer in the same words scores as irrelevant purely because of
      // where it sits, and nothing in the response says the document was cut.
      answerLostWhenLong: scoreOf(longRun, 0) !== null && scoreOf(shortRun, 0) !== null
        && scoreOf(longRun, 0) < scoreOf(longRun, 1) && scoreOf(shortRun, 0) > scoreOf(shortRun, 1),
      signalledTruncation: JSON.stringify(longRun).toLowerCase().includes("truncat") });
  } catch (e) { record(runKey, { invariant: "I-PB3", environmentError: true, error: String(e.message).slice(0, 160) }); }
}

// ===== I-PB4: does @mastra/core/auth supply actor identity and expiry? ==============================
async function authCapability() {
  const runKey = "PB.auth.capability"; if (skip(runKey)) return;
  try {
    const A = await import("@mastra/core/auth");
    const names = Object.keys(A).filter((k) => k !== "default");
    const has = (n) => names.includes(n);
    // Construct the concrete provider rather than reading the export list: an export that cannot be
    // instantiated is not a mechanism, and Phase A established that a present-but-unusable component
    // is a real and distinct outcome.
    let rbacOk = false, rbacErr = null, decision = null;
    try {
      const p = new A.StaticRBACProvider({ roles: A.DEFAULT_ROLES ?? undefined });
      rbacOk = typeof p === "object";
      decision = Object.getOwnPropertyNames(Object.getPrototypeOf(p)).filter((m) => m !== "constructor").slice(0, 12);
    } catch (e) { rbacErr = String(e.message).slice(0, 160); }
    record(runKey, { invariant: "I-PB4", exportCount: names.length,
      hasRBAC: has("StaticRBACProvider"), hasFGA: has("MastraFGAPermissions"),
      hasPermissions: has("PERMISSIONS"), hasResources: has("RESOURCES"), hasActions: has("ACTIONS"),
      hasSessionProvider: has("MemorySessionProvider") || has("CookieSessionProvider"),
      rbacConstructs: rbacOk, rbacError: rbacErr, providerMethods: decision,
      exports: names.slice(0, 30) });
  } catch (e) { record(runKey, { invariant: "I-PB4", environmentError: true, error: String(e.message).slice(0, 160) }); }
}

// ===== instrument gate ==============================================================================
if (!process.env.NO_GATE) {
  const g = gate("phase B");
  const health = await rerankHealth();
  g.check("the reranker is reachable and reports its model",
    !!health.model, JSON.stringify(health).slice(0, 160));
  // The scorer must fail a wrong answer as reliably as it passes a right one.
  g.bothDirections("retrieval scorer", (t) => found(t, { mustContain: "willow-chisel-508" }),
    ["the code is willow-chisel-508 exactly"], ["a completely unrelated document about lunch"]);
  const rr = await rerank("vector database", ["Vector search finds similar embeddings", "The sky is blue"], 2);
  g.check("the reranker separates a relevant document from an irrelevant one",
    rr.results.length >= 2 && rr.results[0].index === 0,
    JSON.stringify(rr.results).slice(0, 120));
  // Control: retrieval must find a verbatim planted answer in the smallest corpus, or nothing here
  // is decidable -- a broken index would read as a component that does not work.
  const ctl = retrievalCases.find((c) => c.axis === "verbatim");
  const store = await buildIndex(ctl.corpusSize ?? 60);
  const { embedding } = await embed({ model: embedder, value: ctl.query });
  const hits = await store.query({ indexName: "c", queryVector: embedding, topK: 5 });
  g.check("control: verbatim retrieval finds its planted answer",
    found(hits.map((h) => h.metadata?.text ?? ""), labels[ctl.caseId]),
    `${ctl.caseId} expecting ${labels[ctl.caseId]?.mustContain}`);
  const { failed } = g.report();
  if (failed) process.exit(1);
}

const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const parts = { AUTH: authCapability, TRUNC: truncationLimit, RETRIEVAL: retrieval };
for (const [k, fn] of Object.entries(parts)) {
  if (only && !only.has(k)) continue;
  console.log(`\n--- phase B / ${k} ---`);
  try { await fn(); } catch (e) { console.log(`\n!!! ${k} threw: ${String(e.message).slice(0, 200)}`); }
}
console.log(`\n\nPhase B: ${loadEntries(CKPT).length} runs recorded${SMOKE ? " (SMOKE)" : ""}`);
process.exit(0);
