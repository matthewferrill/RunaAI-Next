import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { WindowedBgeReranker } from "../../gate1/adapters/qdrant.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const fail = code => Object.assign(new Error(code), { code });
const id = z.string().min(1).max(160).regex(/^[^\u0000-\u001f\u007f]+$/);
const contextSchema = z.object({ principalId: id, projectId: id, sessionId: id }).strict();
const reviewScopeSchema = z.object({ principalId: id, projectId: id }).strict();
const contextType = z.enum(["source", "artifact", "diff"]);
const attachSchema = z.object({ requestId: id, label: z.string().trim().min(1).max(120),
  contextType: contextType.default("source"),
  // Validate emptiness without transforming canonical source text. Citations,
  // encrypted storage and retries must bind the exact supplied UTF-8 bytes.
  content: z.string().min(1).max(8_000)
    .refine(value => value.trim().length > 0, "Source must contain non-whitespace text")
    .refine(value => Buffer.from(value, "utf8").toString("utf8") === value, "Source must be valid Unicode") }).strict();
const referenceSchema = z.object({ projectId: id, sourceId: id, sectionId: id,
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const privateContext = (projectId, sourceId) => ({ recordType: "workspace-section",
  participantId: projectId, recordId: `${sourceId}:provided`, field: "private-payload" });

// Caller supplies a server-authenticated, ownership-checked context. No filesystem import API.
export class PostgresSuppliedSourceStore {
  constructor({ pool, cipher, index }) { Object.assign(this, { pool, cipher, index }); }
  async initialize() {
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS runa_m1_sources;
      CREATE TABLE IF NOT EXISTS runa_m1_sources.sections (
        principal_id text NOT NULL, project_id text NOT NULL, source_id text PRIMARY KEY,
        request_id text NOT NULL, input_digest text NOT NULL, context_type text NOT NULL DEFAULT 'source',
        indexed boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(principal_id,project_id,request_id));
      ALTER TABLE runa_m1_sources.sections ADD COLUMN IF NOT EXISTS context_type text NOT NULL DEFAULT 'source';`);
  }
  async attach(rawContext, rawInput) {
    const context = contextSchema.parse(rawContext), input = attachSchema.parse(rawInput);
    if (["runa:personal", "runa:ephemeral"].includes(context.projectId)) throw fail("m1-source-project-required");
    const digest = hash(JSON.stringify(input));
    const legacySourceDigest = input.contextType === "source"
      ? hash(JSON.stringify({ requestId: input.requestId, label: input.label, content: input.content })) : null;
    const client = await this.pool.connect();
    let sourceId;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`m1-source:${context.principalId}:${context.projectId}`]);
      const existing = (await client.query(`SELECT source_id,input_digest FROM runa_m1_sources.sections
        WHERE principal_id=$1 AND project_id=$2 AND request_id=$3`, [context.principalId, context.projectId, input.requestId])).rows[0];
      if (existing && existing.input_digest !== digest && existing.input_digest !== legacySourceDigest) {
        throw fail("m1-source-request-conflict");
      }
      sourceId = existing?.source_id ?? `m1-source-${randomUUID()}`;
      if (!existing) {
        const count = Number((await client.query(`SELECT count(*) count FROM runa_m1_sources.sections
          WHERE principal_id=$1 AND project_id=$2`, [context.principalId, context.projectId])).rows[0].count);
        if (count >= 24) throw fail("m1-source-project-limit");
        const envelope = this.cipher.encrypt(privateContext(context.projectId, sourceId), { content: input.content, label: input.label });
        await client.query(`INSERT INTO runa_workspace.source_sections
          (project_scope,source_id,section_id,content_sha256,active,content_envelope) VALUES($1,$2,'provided',$3,true,$4::jsonb)`,
        [context.projectId, sourceId, hash(input.content), JSON.stringify(envelope)]);
        await client.query(`INSERT INTO runa_m1_sources.sections
          (principal_id,project_id,source_id,request_id,input_digest,context_type)
          VALUES($1,$2,$3,$4,$5,$6)`, [context.principalId, context.projectId, sourceId, input.requestId, digest, input.contextType]);
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
    // The source survives an index outage. Repeating this exact request repairs only its derived point.
    return this.retry(context, { sourceId });
  }
  async retry(rawContext, rawInput) {
    const context = contextSchema.parse(rawContext);
    const input = z.object({ sourceId: id, contentSha256: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict().parse(rawInput);
    const sourceId = input.sourceId;
    // Reload immutable canonical bytes; a repair never asks the browser to resend private text.
    const source = (await this.selected(context, [sourceId]))[0];
    if (input.contentSha256 && input.contentSha256 !== source.contentSha256) throw fail("m1-source-revision-conflict");
    let indexed = false;
    try {
      await this.index.upsert(source);
      await this.pool.query("UPDATE runa_m1_sources.sections SET indexed=true WHERE source_id=$1 AND principal_id=$2 AND project_id=$3",
        [sourceId, context.principalId, context.projectId]);
      indexed = true;
    } catch {
      await this.pool.query("UPDATE runa_m1_sources.sections SET indexed=false WHERE source_id=$1 AND principal_id=$2 AND project_id=$3",
        [sourceId, context.principalId, context.projectId]);
      // Report a retained but unavailable source; never imply successful retrieval.
    }
    return { schemaVersion: "runaai-m1-source/v1", sourceId, sectionId: "provided",
      contentSha256: source.contentSha256, label: source.label, characters: source.content.length,
      contextType: source.contextType,
      indexed, status: indexed ? "ready" : "retained-index-unavailable", contentRetained: true };
  }
  async list(rawContext) {
    const context = contextSchema.parse(rawContext);
    const rows = (await this.pool.query(`SELECT s.source_id,s.context_type,s.indexed,w.content_sha256,w.content_envelope
      FROM runa_m1_sources.sections s JOIN runa_workspace.source_sections w
        ON w.project_scope=s.project_id AND w.source_id=s.source_id AND w.section_id='provided'
      WHERE s.principal_id=$1 AND s.project_id=$2 AND w.active ORDER BY s.created_at,s.source_id LIMIT 24`,
    [context.principalId, context.projectId])).rows;
    return rows.map(row => {
      const value = this.cipher.decrypt(privateContext(context.projectId, row.source_id), row.content_envelope);
      if (hash(value.content) !== row.content_sha256) throw fail("m1-source-integrity-invalid");
      const selectedContextType = contextType.parse(row.context_type);
      return { sourceId: row.source_id, sectionId: "provided", contentSha256: row.content_sha256,
        contextType: selectedContextType, label: value.label, characters: value.content.length, indexed: row.indexed };
    });
  }
  async selected(rawContext, sourceIds) {
    const context = contextSchema.parse(rawContext);
    const ids = z.array(id).min(1).max(6).parse(sourceIds);
    if (new Set(ids).size !== ids.length) throw fail("m1-source-selection-invalid");
    const rows = (await this.pool.query(`SELECT s.source_id,s.context_type,w.content_sha256,w.content_envelope
      FROM runa_m1_sources.sections s JOIN runa_workspace.source_sections w
        ON w.project_scope=s.project_id AND w.source_id=s.source_id AND w.section_id='provided'
      WHERE s.principal_id=$1 AND s.project_id=$2 AND s.source_id=ANY($3::text[]) AND w.active`,
    [context.principalId, context.projectId, ids])).rows;
    if (rows.length !== ids.length) throw fail("m1-source-selection-denied");
    return ids.map(sourceId => {
      const row = rows.find(value => value.source_id === sourceId);
      const value = this.cipher.decrypt(privateContext(context.projectId, sourceId), row.content_envelope);
      if (hash(value.content) !== row.content_sha256) throw fail("m1-source-integrity-invalid");
      return { projectId: context.projectId, sourceId, sectionId: "provided",
        contentSha256: row.content_sha256, content: value.content, label: value.label,
        contextType: contextType.parse(row.context_type), active: true };
    });
  }

  // Review presentation metadata is resolved from the same owned source rows as
  // the canonical bytes. Browser-supplied labels or kinds never become trusted
  // review context, and the exact selected revisions must still match.
  async describeReviewContexts(rawScope, rawReferences) {
    const scope = reviewScopeSchema.parse(rawScope);
    const references = z.array(referenceSchema).min(1).max(6).parse(rawReferences);
    if (references.some(reference => reference.projectId !== scope.projectId)) throw fail("m1-review-context-denied");
    const ids = references.map(reference => reference.sourceId);
    if (new Set(ids).size !== ids.length) throw fail("m1-review-context-invalid");
    const rows = (await this.pool.query(`SELECT s.source_id,s.context_type,w.content_sha256,w.content_envelope
      FROM runa_m1_sources.sections s JOIN runa_workspace.source_sections w
        ON w.project_scope=s.project_id AND w.source_id=s.source_id AND w.section_id='provided'
      WHERE s.principal_id=$1 AND s.project_id=$2 AND s.source_id=ANY($3::text[]) AND w.active`,
    [scope.principalId, scope.projectId, ids])).rows;
    if (rows.length !== references.length) throw fail("m1-review-context-denied");
    return references.map(reference => {
      const row = rows.find(value => value.source_id === reference.sourceId);
      if (!row || reference.sectionId !== "provided" || row.content_sha256 !== reference.contentSha256) {
        throw fail("m1-review-context-revision-conflict");
      }
      const value = this.cipher.decrypt(privateContext(scope.projectId, reference.sourceId), row.content_envelope);
      return { contextType: contextType.parse(row.context_type), targetId: reference.sourceId,
        sourceId: reference.sourceId, sectionId: reference.sectionId, contentSha256: reference.contentSha256,
        label: z.string().trim().min(1).max(120).parse(value.label) };
    });
  }
}

export class SelectedSourceIndex {
  constructor({ endpoint, collection, embedder, reranker, fetchImpl = fetch, timeoutMs = 10_000 }) {
    const url = new URL(endpoint);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash
        || !/^m1_[a-z0-9_]{1,70}$/.test(collection)) throw fail("m1-index-config-invalid");
    Object.assign(this, { endpoint: endpoint.replace(/\/$/, ""), collection, embedder, reranker, fetchImpl, timeoutMs });
    this.requiresExplicitSelection = true;
  }
  async request(method, route, body, deadlineMs = this.timeoutMs) {
    const response = await this.fetchImpl(`${this.endpoint}/collections/${this.collection}${route}`, {
      method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(Math.max(1, Math.min(this.timeoutMs, deadlineMs))),
    });
    if (!response.ok) throw fail(`m1-index-http-${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw fail("m1-index-response-invalid");
    const chunks = []; let bytes = 0;
    while (true) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 2_000_000) { await reader.cancel(); throw fail("m1-index-output-limited"); }
      chunks.push(Buffer.from(next.value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  async initialize() {
    try {
      const existing = await this.request("GET", "");
      const vector = existing?.result?.config?.params?.vectors;
      if (vector?.size !== this.embedder.dimension || vector?.distance !== "Cosine") throw fail("m1-index-dimension-mismatch");
    } catch (error) {
      if (error.code !== "m1-index-http-404") throw error;
      await this.request("PUT", "", { vectors: { size: this.embedder.dimension, distance: "Cosine" } });
    }
  }
  async upsert(source) {
    const reference = referenceSchema.parse({ projectId: source.projectId, sourceId: source.sourceId,
      sectionId: source.sectionId, contentSha256: source.contentSha256 });
    if (typeof source.content !== "string" || source.content.length > 8_000 || hash(source.content) !== reference.contentSha256) throw fail("m1-index-source-invalid");
    const [vector] = await this.embedder.embed([`search_document: ${source.content}`]);
    if (!Array.isArray(vector) || vector.length !== this.embedder.dimension || vector.some(value => !Number.isFinite(value))) throw fail("m1-index-vector-invalid");
    const digest = hash(JSON.stringify(reference));
    const pointId = `${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20,32)}`;
    const acknowledgement = await this.request("PUT", "/points?wait=true", { points: [{ id: pointId, vector, payload: reference }] });
    if (acknowledgement?.status !== "ok" || acknowledgement?.result?.status !== "completed"
        || !Number.isSafeInteger(acknowledgement.result.operation_id) || acknowledgement.result.operation_id < 0) {
      throw fail("m1-index-acknowledgement-invalid");
    }
  }
  async searchSelected({ projectId, query, references, maximumPassages, deadlineMs = this.timeoutMs }) {
    const selected = z.array(referenceSchema).min(1).max(6).parse(references);
    if (selected.some(item => item.projectId !== projectId) || !Number.isInteger(maximumPassages) || maximumPassages < 1 || maximumPassages > 24) throw fail("m1-index-scope-denied");
    const start = Date.now();
    const [vector] = await this.embedder.embed([`search_query: ${query}`], { deadlineMs });
    if (!Array.isArray(vector) || vector.length !== this.embedder.dimension || vector.some(value => !Number.isFinite(value))) throw fail("m1-index-vector-invalid");
    const remaining = deadlineMs - (Date.now() - start);
    if (remaining <= 0) throw fail("m1-index-timeout");
    const result = await this.request("POST", "/points/query", { query: vector,
      filter: { must: [{ key: "projectId", match: { value: projectId } }],
        should: selected.map(reference => ({ must: ["sourceId", "sectionId", "contentSha256"].map(key => ({ key, match: { value: reference[key] } })) })) },
      limit: Math.min(maximumPassages, selected.length), with_payload: true, with_vector: false }, remaining);
    const points = result?.result?.points;
    if (!Array.isArray(points) || points.length > Math.min(maximumPassages, selected.length)) throw fail("m1-index-response-invalid");
    const observed = points.map(point => referenceSchema.parse(point.payload));
    const key = ref => JSON.stringify([ref.projectId, ref.sourceId, ref.sectionId, ref.contentSha256]);
    const allowed = new Set(selected.map(key));
    if (observed.some(ref => !allowed.has(key(ref))) || new Set(observed.map(key)).size !== observed.length) throw fail("m1-index-scope-denied");
    return { references: observed, degraded: false, unavailable: [] };
  }
  async rerank(...args) {
    if (!(this.reranker instanceof WindowedBgeReranker) && typeof this.reranker?.rerank !== "function") throw fail("m1-reranker-unavailable");
    return this.reranker.rerank(...args);
  }
}
