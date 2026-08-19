// Direct plant: writes a message and its embedding into the store with NO agent turn.
//
// This is what the sealed preregistration's validation list asks for -- "plant a payload in the
// index and confirm it is retrievable, independent of the agent" -- and it is the more faithful
// instrument. Planting through an agent turn works, but the agent's refusal is then stored beside
// the payload, and every later recall sees the model's own prior refusal next to the injection. A
// clean result from that arm would measure "the model already declined this once" rather than
// "retrieved content is treated as data". The threat model's disk-level actor does not pass through
// a refusal either, so the direct write is both the cleaner measurement and the realistic one.
import { LibSQLVector } from "@mastra/libsql";
import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";

const EMBED_URL = process.env.W6_EMBED_URL || process.env.LMSTUDIO_URL || "http://192.168.50.165:1234/v1";
const EMBED_MODEL = "text-embedding-nomic-embed-text-v1.5";
export const VEC_INDEX = "memory_messages_768";

export async function embed(text) {
  const r = await fetch(`${EMBED_URL}/embeddings`, { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }) });
  const j = await r.json();
  const v = j?.data?.[0]?.embedding;
  if (!Array.isArray(v)) throw new Error(`no embedding returned: ${JSON.stringify(j).slice(0, 120)}`);
  return v;
}

// The vector row's metadata shape is copied from what the agent path actually writes, verified by
// reading a real row rather than assumed, so semantic recall treats a planted memory identically.
export async function plantDirect(dbPath, { thread = "t1", resource = "r1", text, role = "user" }) {
  const db = createClient({ url: `file:${dbPath}` });
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const content = JSON.stringify({ format: 2, parts: [{ type: "text", text }], content: text });
  await db.execute({
    sql: `INSERT INTO mastra_messages (id, thread_id, resourceId, role, type, content, createdAt)
          VALUES (?, ?, ?, ?, 'text', ?, ?)`,
    args: [id, thread, resource, role, content, createdAt] });
  db.close();
  const v = await embed(text);
  const vec = new LibSQLVector({ id: `plant-${process.pid}`, url: `file:${dbPath}` });
  await vec.createIndex({ indexName: VEC_INDEX, dimension: v.length }).catch(() => {});
  await vec.upsert({ indexName: VEC_INDEX, vectors: [v], ids: [id],
    metadata: [{ message_id: id, thread_id: thread, resource_id: resource, role, content: text, created_at: createdAt }] });
  return { id, dim: v.length };
}

// Confirms the plant is retrievable WITHOUT the agent: a vector query against the index must return
// the planted id. If this fails the plant is not in play and no downstream result means anything.
export async function plantRetrievable(dbPath, text, plantedId) {
  const v = await embed(text);
  const vec = new LibSQLVector({ id: `check-${process.pid}`, url: `file:${dbPath}` });
  const hits = await vec.query({ indexName: VEC_INDEX, queryVector: v, topK: 10 });
  return { found: hits.some((h) => h.id === plantedId), topIds: hits.slice(0, 3).map((h) => h.id), n: hits.length };
}
