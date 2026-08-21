import { createHash } from "node:crypto";
import { modelSafeIndexText } from "../content-policy.mjs";

const stablePointId = source => Number.parseInt(createHash("sha256")
  .update(`${source.projectId}\u0000${source.sourceId}\u0000${source.sectionId}`).digest("hex").slice(0, 12), 16);

async function boundedJson(response, maximumBytes) {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maximumBytes) {
    const error = new Error("dependency response exceeded its byte ceiling");
    error.code = "dependency-output-limited";
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

export class OpenAICompatibleEmbedder {
  constructor({ baseURL, modelId, dimension, timeoutMs = 5_000 }) {
    this.url = `${baseURL.replace(/\/$/, "")}/embeddings`;
    this.modelId = modelId;
    this.dimension = dimension;
    this.timeoutMs = timeoutMs;
  }

  async embed(texts, { deadlineMs = this.timeoutMs } = {}) {
    const response = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.modelId, input: texts }),
      signal: AbortSignal.timeout(Math.max(1, Math.min(this.timeoutMs, deadlineMs))),
    });
    if (!response.ok) throw Object.assign(new Error(`embedding dependency returned ${response.status}`), { code: "embedding-unavailable" });
    const body = await boundedJson(response, 8_000_000);
    const vectors = [...(body?.data ?? [])].sort((a, b) => a.index - b.index).map(item => item.embedding);
    if (vectors.length !== texts.length || vectors.some(vector => !Array.isArray(vector) || vector.length !== this.dimension)) {
      throw Object.assign(new Error("embedding response shape mismatch"), { code: "embedding-shape-invalid" });
    }
    if (body.model && body.model !== this.modelId) {
      throw Object.assign(new Error("embedding model identity mismatch"), { code: "embedding-model-mismatch" });
    }
    return vectors;
  }
}

function windows(text, size = 2_000, overlap = 300) {
  if (text.length <= size) return [text];
  const result = [];
  for (let start = 0; start < text.length; start += size - overlap) {
    result.push(text.slice(start, start + size));
    if (start + size >= text.length) break;
  }
  return result;
}

export class WindowedBgeReranker {
  constructor({ baseURL, timeoutMs = 5_000, batchSize = 32 }) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 256) {
      throw new Error("reranker batchSize must be an integer from 1 through 256");
    }
    const normalized = baseURL.replace(/\/$/, "").replace(/\/rerank$/, "");
    this.url = `${normalized}/rerank`;
    this.timeoutMs = timeoutMs;
    this.batchSize = batchSize;
  }

  async rerank(query, sources, maximumPassages, { deadlineMs = this.timeoutMs } = {}) {
    const documents = [];
    const owners = [];
    sources.forEach((source, sourceIndex) => windows(source.content).forEach(window => {
      documents.push(window);
      owners.push(sourceIndex);
    }));
    if (!documents.length) return { sources, degraded: false, unavailable: [] };
    const sourceScores = new Map();
    const deadlineAt = Date.now() + deadlineMs;
    let processed = 0;
    try {
      for (let offset = 0; offset < documents.length; offset += this.batchSize) {
        const remaining = deadlineAt - Date.now();
        if (remaining <= 0) throw new DOMException("reranker deadline expired", "TimeoutError");
        const batch = documents.slice(offset, offset + this.batchSize);
        const response = await fetch(this.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query, documents: batch, top_n: batch.length }),
          signal: AbortSignal.timeout(Math.max(1, Math.min(this.timeoutMs, remaining))),
        });
        if (!response.ok) throw new Error(`reranker returned ${response.status}`);
        const body = await boundedJson(response, 1_000_000);
        if (!Array.isArray(body?.results) || !body.results.length) throw new Error("reranker response was empty");
        for (const item of body.results) {
          if (!Number.isInteger(item.index) || item.index < 0 || item.index >= batch.length ||
            typeof item.score !== "number" || !Number.isFinite(item.score)) throw new Error("reranker response was malformed");
          const owner = owners[offset + item.index];
          sourceScores.set(owner, Math.max(sourceScores.get(owner) ?? Number.NEGATIVE_INFINITY, item.score));
        }
        processed += batch.length;
      }
      const ordered = [...sources].map((source, index) => ({ source, index, score: sourceScores.get(index) ?? Number.NEGATIVE_INFINITY }))
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, maximumPassages).map(item => item.source);
      return { sources: ordered, degraded: false, unavailable: [], truncated: false };
    } catch {
      return { sources: sources.slice(0, maximumPassages), degraded: true, unavailable: ["reranker"],
        truncated: processed > 0 && processed < documents.length };
    }
  }
}

export class QdrantDerivedIndex {
  constructor({ endpoint, collection = "runaai_gate1_sections", embedder, reranker = null, timeoutMs = 5_000 }) {
    this.endpoint = endpoint.replace(/\/$/, "");
    this.collection = collection;
    this.embedder = embedder;
    this.reranker = reranker;
    this.timeoutMs = timeoutMs;
  }

  async #request(method, route, body, { deadlineMs = this.timeoutMs } = {}) {
    const response = await fetch(`${this.endpoint}${route}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1, Math.min(this.timeoutMs, deadlineMs))),
    });
    if (!response.ok) {
      const error = new Error(`qdrant returned ${response.status}`);
      error.code = "qdrant-unavailable";
      throw error;
    }
    return boundedJson(response, 2_000_000);
  }

  async rebuild(sources) {
    await this.#request("DELETE", `/collections/${this.collection}`).catch(error => {
      if (!String(error.message).includes("404")) throw error;
    });
    await this.#request("PUT", `/collections/${this.collection}`, {
      vectors: { size: this.embedder.dimension, distance: "Cosine" },
    });
    const vectors = await this.embedder.embed(sources.map(modelSafeIndexText));
    const points = sources.map((source, index) => ({
      id: stablePointId(source),
      vector: vectors[index],
      payload: { projectId: source.projectId, sourceId: source.sourceId, sectionId: source.sectionId,
        contentSha256: source.contentSha256 },
    }));
    if (points.length) await this.#request("PUT", `/collections/${this.collection}/points?wait=true`, { points });
    const count = await this.#request("POST", `/collections/${this.collection}/points/count`, { exact: true });
    const scroll = await this.#request("POST", `/collections/${this.collection}/points/scroll`, {
      limit: Math.max(1, sources.length + 1), with_payload: true, with_vector: false,
    });
    const expected = sources.map(source => `${source.projectId}\u0000${source.sourceId}\u0000${source.sectionId}\u0000${source.contentSha256}`).sort();
    const observed = (scroll?.result?.points ?? []).map(point => `${point.payload.projectId}\u0000${point.payload.sourceId}\u0000${point.payload.sectionId}\u0000${point.payload.contentSha256}`).sort();
    return { sourceCount: sources.length, vectorCount: count?.result?.count ?? -1,
      digestsAligned: JSON.stringify(observed) === JSON.stringify(expected),
      aligned: count?.result?.count === sources.length && JSON.stringify(observed) === JSON.stringify(expected) };
  }

  async search({ projectId, query, maximumPassages, deadlineMs = this.timeoutMs }) {
    const deadlineAt = Date.now() + deadlineMs;
    const [vector] = await this.embedder.embed([query], { deadlineMs: Math.max(1, deadlineAt - Date.now()) });
    const body = await this.#request("POST", `/collections/${this.collection}/points/query`, {
      query: vector,
      filter: { must: [{ key: "projectId", match: { value: projectId } }] },
      limit: maximumPassages,
      with_payload: true,
      with_vector: false,
    }, { deadlineMs: Math.max(1, deadlineAt - Date.now()) });
    return {
      references: (body?.result?.points ?? []).map(point => ({ projectId: point.payload.projectId,
        sourceId: point.payload.sourceId, sectionId: point.payload.sectionId,
        contentSha256: point.payload.contentSha256 })),
      degraded: false,
      unavailable: [],
    };
  }

  async rerank(query, sources, maximumPassages, options = {}) {
    if (!this.reranker) return { sources: sources.slice(0, maximumPassages), degraded: true, unavailable: ["reranker"] };
    return this.reranker.rerank(query, sources, maximumPassages, options);
  }
}
