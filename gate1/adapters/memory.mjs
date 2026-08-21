import { createHash } from "node:crypto";

const digest = value => createHash("sha256").update(String(value)).digest("hex");
const requestDigest = request => digest(JSON.stringify(request));

export class MemoryRecordStore {
  constructor(sources = []) {
    this.sources = new Map(sources.map(source => [
      `${source.projectId}\u0000${source.sourceId}\u0000${source.sectionId}`,
      { ...source, contentSha256: source.contentSha256 ?? digest(source.content), active: source.active !== false },
    ]));
    this.committed = new Map();
    this.turns = [];
  }

  async getCommitted(request) {
    const found = this.committed.get(request.requestId);
    if (!found) return null;
    if (found.requestSha256 !== requestDigest(request)) {
      const error = new Error("requestId was already used for a different request");
      error.code = "request-id-conflict";
      throw error;
    }
    return structuredClone(found.response);
  }

  async commit(request, response) {
    const existing = await this.getCommitted(request);
    if (existing) return existing;
    this.committed.set(request.requestId, { requestSha256: requestDigest(request), response: structuredClone(response) });
    this.turns.push({ requestId: request.requestId, projectId: request.project.projectId, threadId: request.thread.threadId });
    return structuredClone(response);
  }

  async activeSources(projectId, references) {
    return references.flatMap(reference => {
      const source = this.sources.get(`${projectId}\u0000${reference.sourceId}\u0000${reference.sectionId}`);
      return source?.active && source.contentSha256 === reference.contentSha256 ? [{ ...source }] : [];
    });
  }

  revoke(projectId, sourceId, sectionId) {
    const source = this.sources.get(`${projectId}\u0000${sourceId}\u0000${sectionId}`);
    if (source) source.active = false;
  }
}

export class MemoryIndex {
  constructor({ references = [], unavailable = false, degraded = false } = {}) {
    this.references = references;
    this.unavailable = unavailable;
    this.degraded = degraded;
    this.searches = [];
  }

  async search({ projectId, query, maximumPassages }) {
    this.searches.push({ projectId, query });
    if (this.unavailable) {
      const error = new Error("synthetic vector index unavailable");
      error.code = "qdrant-unavailable";
      throw error;
    }
    return {
      references: this.references.filter(reference => reference.projectId === projectId).slice(0, maximumPassages),
      degraded: this.degraded,
      unavailable: this.degraded ? ["reranker"] : [],
    };
  }
}

export class ScriptedProvider {
  constructor({ reply, modelId = "stub-deterministic-v1", role = "fast-chat-research", delayMs = 0 } = {}) {
    this.reply = reply ?? (({ evidence }) => ({
      answer: evidence.length ? `The synthetic record answers this from ${evidence[0].sourceId}.` : "This is not a project-record question.",
      citations: evidence.length ? [{ sourceId: evidence[0].sourceId, sectionId: evidence[0].sectionId }] : [],
    }));
    this.modelId = modelId;
    this.role = role;
    this.delayMs = delayMs;
    this.calls = [];
  }

  async answer(input, { deadlineMs }) {
    this.calls.push(structuredClone(input));
    if (this.delayMs > deadlineMs) {
      await new Promise(resolve => setTimeout(resolve, deadlineMs));
      const error = new Error("provider deadline exceeded");
      error.code = "provider-timeout";
      throw error;
    }
    if (this.delayMs) await new Promise(resolve => setTimeout(resolve, this.delayMs));
    return { ...(await this.reply(input)), model: { role: this.role, provider: "scripted", modelId: this.modelId }, outputLimited: false };
  }
}
