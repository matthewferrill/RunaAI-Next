import { createServer } from "node:http";

const port = Number(process.env.GATE1_RERANKER_PORT ?? 9575);

const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let body = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    return response.end(JSON.stringify({ ok: true }));
  }
  if (request.url !== "/rerank" || request.method !== "POST") {
    response.writeHead(404, { "content-type": "application/json" });
    return response.end(JSON.stringify({ error: "not-found" }));
  }
  const documents = Array.isArray(body.documents) ? body.documents : [];
  const terms = new Set(String(body.query ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const results = documents.map((document, index) => {
    const words = new Set(String(document).toLowerCase().match(/[a-z0-9]+/g) ?? []);
    return { index, score: [...terms].filter(term => words.has(term)).length };
  }).sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Number(body.top_n ?? documents.length));
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ results }));
});

server.listen(port, "127.0.0.1", () => process.stdout.write(`gate1 stub reranker ready ${port}\n`));
