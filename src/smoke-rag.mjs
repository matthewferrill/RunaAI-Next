// Install check: chunk, embed via LM Studio's embedding model, store in LibSQLVector, query back.
import { MDocument } from "@mastra/rag";
import { LibSQLVector } from "@mastra/libsql";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { embedMany, embed } from "ai";

const lmstudio = createOpenAICompatible({ name: "lmstudio", baseURL: "http://192.168.50.165:1234/v1" });
const embedder = lmstudio.textEmbeddingModel("text-embedding-nomic-embed-text-v1.5");

const doc = MDocument.fromText([
  "The reference stack talks to RUNA-HOME over the OpenAI-compatible interface.",
  "Biscuit is a dog who lives in the household and likes long walks.",
  "The deployment procedure requires a restart because Node parses each module once.",
].join("\n\n"));
const chunks = await doc.chunk({ strategy: "recursive", maxSize: 128, overlap: 0 });

const { embeddings } = await embedMany({ model: embedder, values: chunks.map((c) => c.text) });
const store = new LibSQLVector({ id: "reference-vectors", url: "file:storage/vectors.db" });
await store.createIndex({ indexName: "smoke", dimension: embeddings[0].length });
await store.upsert({ indexName: "smoke", vectors: embeddings, metadata: chunks.map((c) => ({ text: c.text })) });

const { embedding } = await embed({ model: embedder, value: "why does deploying need a restart?" });
const hits = await store.query({ indexName: "smoke", queryVector: embedding, topK: 1 });
console.log("chunks:", chunks.length, "| top hit:", hits[0]?.metadata?.text?.slice(0, 90));
