import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SelectedSourceIndex } from "./sources.mjs";

const content = "Synthetic Atlas launch: April 9. Do not confuse it with Beacon.";
const source = { projectId: "project-atlas", sourceId: "source-atlas", sectionId: "provided",
  contentSha256: createHash("sha256").update(content).digest("hex"), content };
const { content: _, ...reference } = source;
function fixture(handler = () => ({ result: { points: [{ payload: reference }] } })) {
  const calls = [], embedded = [];
  const index = new SelectedSourceIndex({ endpoint: "http://127.0.0.1:6333", collection: "m1_synthetic_sources",
    embedder: { dimension: 3, async embed(values) { embedded.push(values); return values.map(() => [0.1,0.2,0.3]); } },
    reranker: { async rerank(_query, sources) { return { sources, degraded: false, unavailable: [] }; } },
    fetchImpl: async (url, options) => { const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ url, ...options, body }); return Response.json(handler({ url, ...options, body })); } });
  return { index, calls, embedded };
}
const search = index => index.searchSelected({ projectId: source.projectId, query: "When is Atlas launching?",
  references: [reference], maximumPassages: 6 });

test("selected research sends real vector query with exact project/source/revision filters", async () => {
  const { index, calls, embedded } = fixture();
  assert.deepEqual((await search(index)).references, [reference]);
  assert.match(embedded[0][0], /^search_query:/);
  assert.deepEqual(calls[0].body.filter.must, [{ key: "projectId", match: { value: source.projectId } }]);
  assert.deepEqual(calls[0].body.filter.should[0].must.map(x => x.match.value),
    [source.sourceId, source.sectionId, source.contentSha256]);
  assert.equal(calls[0].body.limit, 1);
});
test("source upsert preserves PostgreSQL content digest and sends no source text in vector payload", async () => {
  const { index, calls, embedded } = fixture(() => ({ status: "ok", result: { status: "completed", operation_id: 1 } }));
  await index.upsert(source);
  assert.deepEqual(calls[0].body.points[0].payload, reference);
  assert.match(embedded[0][0], /^search_document:/);
  assert.match(calls[0].body.points[0].id, /^[a-f0-9-]{36}$/);
});

for (const acknowledgement of [null, {}, { status: "error", result: { status: "failed" } },
  { status: "ok", result: { status: "acknowledged", operation_id: 1 } },
  { status: "ok", result: { status: "completed" } }]) {
  test(`HTTP success does not credit a failed or incomplete index acknowledgement: ${JSON.stringify(acknowledgement)}`, async () => {
    const { index } = fixture(() => acknowledgement);
    await assert.rejects(index.upsert(source), /acknowledgement-invalid/);
  });
}
test("foreign supplied project is denied before embedding or network", async () => {
  const { index, calls, embedded } = fixture();
  await assert.rejects(index.searchSelected({ projectId: "foreign", query: "secret", references: [reference], maximumPassages: 1 }), /scope-denied/);
  assert.equal(calls.length + embedded.length, 0);
});
for (const [name, payload] of [
  ["foreign project", { ...reference, projectId: "foreign" }],
  ["unselected source", { ...reference, sourceId: "other" }],
  ["stale revision", { ...reference, contentSha256: "f".repeat(64) }],
]) test(`index fails closed for ${name} returned by dependency`, async () => {
  const { index } = fixture(() => ({ result: { points: [{ payload }] } }));
  await assert.rejects(search(index), /scope-denied/);
});
test("duplicate or over-budget vector points fail closed", async () => {
  const { index } = fixture(() => ({ result: { points: [{ payload: reference }, { payload: reference }] } }));
  await assert.rejects(search(index), /response-invalid/);
});
test("empty real vector results remain honest empty evidence", async () => {
  const { index } = fixture(() => ({ result: { points: [] } }));
  assert.deepEqual((await search(index)).references, []);
});
test("tampered source never reaches embedder or index", async () => {
  const { index, calls, embedded } = fixture();
  await assert.rejects(index.upsert({ ...source, content: "tampered" }), /source-invalid/);
  assert.equal(calls.length + embedded.length, 0);
});
test("nonfinite embeddings are refused", async () => {
  const { index, calls } = fixture(); index.embedder.embed = async () => [[0,NaN,0]];
  await assert.rejects(search(index), /vector-invalid/); assert.equal(calls.length, 0);
});
test("existing collection mismatch is not deleted or rebuilt", async () => {
  const { index, calls } = fixture(() => ({ result: { config: { params: { vectors: { size: 2, distance: "Cosine" } } } } }));
  await assert.rejects(index.initialize(), /dimension-mismatch/);
  assert.equal(calls.length, 1); assert.equal(calls[0].method, "GET");
});
test("only explicitly named M1 collections and credential-free endpoints are accepted", () => {
  const base = { endpoint: "http://127.0.0.1:6333", collection: "production" };
  assert.throws(() => new SelectedSourceIndex(base), /config-invalid/);
  assert.throws(() => new SelectedSourceIndex({ ...base, collection: "m1_ok", endpoint: "http://user:password@localhost:6333" }), /config-invalid/);
});
