// Wave 5 vector-index child for E07 (harness -> vector-index). Synthetic deterministic vectors: this
// edge is the harness's own index, so no embedder is involved and the index behaviour is isolated
// from the model. W5_N vectors are upserted one at a time so a SIGKILL lands mid-build.
import { LibSQLVector } from "@mastra/libsql";

const DB = process.env.W5_DB, INDEX = process.env.W5_INDEX || "w5idx";
const N = Number(process.env.W5_N || 20), DIM = 8;
const TAG = process.env.W5_TAG || "a";
const PER = Number(process.env.W5_PER_MS || 0);
const DELAY = Number(process.env.W5_DELAY_MS || 0);
const v = new LibSQLVector({ id: `w5v-${process.pid}`, url: `file:${DB}` });
if (DELAY) await new Promise((r) => setTimeout(r, DELAY));
await v.createIndex({ indexName: INDEX, dimension: DIM }).catch(() => {});
for (let i = 0; i < N; i++) {
  const vec = Array.from({ length: DIM }, (_, j) => ((i + j + TAG.charCodeAt(0)) % 10) / 10);
  await v.upsert({ indexName: INDEX, vectors: [vec], ids: [`${TAG}-${i}`], metadata: [{ tag: TAG, i }] });
  process.stdout.write(`UP::${TAG}-${i}\n`);
  if (PER) await new Promise((r) => setTimeout(r, PER));
}
process.stdout.write("ACK::ok\n");
process.exit(0);
