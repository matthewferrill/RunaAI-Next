import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const LM_URL = process.env.LM_URL || 'http://192.168.50.165:1234/v1';
const RERANK_URL = process.env.RERANK_URL || 'http://192.168.50.165:8412';
const outputPath = 'probes/results/reranker-hard-corpus.json';
const sha256 = value => createHash('sha256').update(String(value)).digest('hex');
const preregistrationSha256 = sha256(readFileSync('RERANKER-HARD-CORPUS-PREREGISTRATION.md'));
const runnerSha256 = sha256(readFileSync(new URL(import.meta.url)));
const filler = Array.from({ length: 95 }, (_, index) => `Routine appendix ${index + 1} records ordinary maintenance, paint, chairs, weather, and cafeteria inventory.`).join(' ');
const specifications = [
  ['sector atlas launch codename', 'AZURE-FALCON'], ['warehouse seven release key', 'MINT-482'],
  ['north bridge inspection date', '2041-03-17'], ['orchard relay voltage', '7.6 volts'],
  ['harbor archive shelf', 'SHELF-Q9'], ['cedar program owner', 'Mina Sol'],
  ['delta valve material', 'titanium'], ['lunar trial sample count', '73'],
  ['east clinic backup day', 'Wednesday'], ['river permit animal', 'aardvark'],
  ['amber route terminal', 'Station K'], ['quartz sensor frequency', '18.4 kilohertz'],
];
const cases = specifications.map(([subject, answer], caseIndex) => {
  const id = `hard-${String(caseIndex + 1).padStart(2, '0')}`;
  const relevantId = `${id}-primary`;
  const relevant = { id: relevantId, text: `${filler} SIGNED CONTROL RECORD. The ${subject} is ${answer}. This signed sentence supersedes drafts.` };
  const distractors = Array.from({ length: 8 }, (_, index) => ({ id: `${id}-distractor-${index + 1}`,
    text: `UNSIGNED DISCUSSION ${index + 1}. ${subject}. ${subject}. This commentary asks about the ${subject} but contains no signed answer and is not authoritative.` }));
  const unrelated = Array.from({ length: 11 }, (_, index) => ({ id: `${id}-noise-${index + 1}`,
    text: `Unrelated record ${index + 1} discusses gardening schedules, invoices, lunch menus, and generic office furniture.` }));
  return { id, query: `According to the signed control record, what is the ${subject}?`, answer, relevantId,
    documents: [relevant, ...distractors, ...unrelated] };
});

const jsonRequest = async (url, body, timeoutMs = 120000) => {
  const started = Date.now();
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} -> ${response.status}: ${text.slice(0, 500)}`);
  return { body: JSON.parse(text), elapsedMs: Date.now() - started };
};
const embed = async values => (await jsonRequest(`${LM_URL}/embeddings`, {
  model: 'text-embedding-nomic-embed-text-v1.5', input: values,
}, 300000)).body.data.sort((a,b)=>a.index-b.index).map(item => item.embedding);
const cosine = (a, b) => {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return dot / (Math.sqrt(aa) * Math.sqrt(bb));
};
const windows = (text, size = 400, overlap = 80) => {
  const words = text.split(/\s+/);
  const out = [];
  for (let start = 0, index = 0; start < words.length; start += size - overlap, index += 1) {
    out.push({ index, text: words.slice(start, start + size).join(' ') });
    if (start + size >= words.length) break;
  }
  return out;
};
const rerank = async (query, documents) => jsonRequest(`${RERANK_URL}/rerank`, { query, documents, top_n: documents.length }, 300000);
const ranks = [];
for (const test of cases) {
  const vectors = await embed([test.query, ...test.documents.map(item => item.text)]);
  const baseline = test.documents.map((document, index) => ({ id: document.id, score: cosine(vectors[0], vectors[index + 1]) }))
    .sort((a,b)=>b.score-a.score);
  const wholeResponse = await rerank(test.query, test.documents.map(item => item.text));
  const whole = wholeResponse.body.results.map(item => ({ id: test.documents[item.index].id, score: item.score })).sort((a,b)=>b.score-a.score);
  const chunkRows = test.documents.flatMap(document => windows(document.text).map(window => ({ documentId: document.id,
    windowId: `${document.id}:w${window.index}`, text: window.text })));
  const chunkResponse = await rerank(test.query, chunkRows.map(item => item.text));
  const best = new Map();
  for (const item of chunkResponse.body.results) {
    const row = chunkRows[item.index];
    if (!best.has(row.documentId) || best.get(row.documentId).score < item.score) best.set(row.documentId,
      { id: row.documentId, score: item.score, windowId: row.windowId });
  }
  const chunked = [...best.values()].sort((a,b)=>b.score-a.score);
  const rankOf = rows => rows.findIndex(item => item.id === test.relevantId) + 1;
  ranks.push({ caseId: test.id, query: test.query, answerSha256: sha256(test.answer), relevantId: test.relevantId,
    baseline: { rank: rankOf(baseline), top5: baseline.slice(0,5) },
    whole: { rank: rankOf(whole), top5: whole.slice(0,5), elapsedMs: wholeResponse.elapsedMs,
      model: wholeResponse.body.model ?? null, scored: wholeResponse.body.scored ?? null },
    chunked: { rank: rankOf(chunked), top5: chunked.slice(0,5), elapsedMs: chunkResponse.elapsedMs,
      model: chunkResponse.body.model ?? null, scored: chunkResponse.body.scored ?? null },
    winningWindow: chunked.find(item => item.id === test.relevantId)?.windowId ?? null });
  console.log(`${test.id}: baseline=${rankOf(baseline)} whole=${rankOf(whole)} chunked=${rankOf(chunked)}`);
}
const hit = arm => ranks.filter(item => item[arm].rank >= 1 && item[arm].rank <= 5).length;
const latency = ranks.map(item => item.chunked.elapsedMs).sort((a,b)=>a-b);
const medianChunkedMs = latency[Math.floor(latency.length / 2)];
const totals = { baselineTop5: hit('baseline'), wholeTop5: hit('whole'), chunkedTop5: hit('chunked'), medianChunkedMs };
const checks = { improvesByThree: totals.chunkedTop5 - totals.baselineTop5 >= 3,
  neverReduces: totals.chunkedTop5 >= totals.baselineTop5,
  windowsExposed: ranks.every(item => item.winningWindow && item.chunked.top5.every(row => row.windowId)),
  latencyWithinBudget: medianChunkedMs <= 2000 };
const keepReranker = Object.values(checks).every(Boolean);
const report = { schemaVersion: 1, preregistrationSha256, runnerSha256, serviceHealth: await (await fetch(`${RERANK_URL}/health`)).json(),
  cases: ranks, totals, checks, decision: keepReranker ? 'KEEP_WINDOWED_BGE' : 'OMIT_RERANKER_UNTIL_NEW_GAP', passed: true };
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ totals, checks, decision: report.decision }));

