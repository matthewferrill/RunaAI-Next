import { randomUUID } from "node:crypto";
import pg from "pg";
import { z } from "zod";
import {
  CAPABILITY_SET_DIGEST,
  CAPABILITY_SET_VERSION,
  MATERIALIZATION_DEADLINE_MS,
  MATERIALIZATION_POLICY_DIGEST,
  MATERIALIZATION_POLICY_ID,
  NETWORK_POLICY_DIGEST,
  NETWORK_POLICY_ID,
  authorityBindingSchema,
  bindingDigestFor,
  canonicalSha256,
  materializationRequestSchema,
  sourceSelectionSchema,
} from "./materialization-contracts.mjs";

const fail = code => Object.assign(new Error(code), { code });
const scopeId = z.string().min(1).max(160).regex(/^[^\u0000-\u001f\u007f]+$/u);
const contextSchema = z.object({ principalId: scopeId, projectId: scopeId, sessionId: scopeId }).strict();
const sourceIdSchema = z.string().regex(/^source-[a-f0-9-]{36}$/u);
const workspaceIdSchema = z.string().regex(/^workspace-[a-f0-9-]{36}$/u);
export const publicGitSourceDefinitionSchema = z.object({
  environmentId: z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/u),
  displayName: z.string().min(1).max(120),
  repositoryHttpsUrl: z.string().min(1).max(2048),
  requestedRef: z.string().min(1).max(255),
  expectedCommitOid: z.string().regex(/^[a-f0-9]{40}$/u),
}).strict();

const identifier = value => {
  if (!/^[a-z][a-z0-9_]{0,48}$/u.test(value)) throw fail("workspace-database-schema-invalid");
  return `"${value}"`;
};
const iso = value => new Date(value).toISOString();
const opaque = (kind, value) => `${kind}-${canonicalSha256(value).slice(0, 32)}`;
const authorityIds = (context, environmentId) => ({
  participantId: opaque("participant", context.principalId),
  projectId: opaque("project", [context.principalId, context.projectId]),
  environmentId,
});
const envelopeContext = (kind, context, id) => ({
  recordType: `m1-server-workspace-${kind}`,
  participantId: context.principalId,
  recordId: canonicalSha256([context.projectId, kind, id]),
  field: "private-payload",
});

/** PostgreSQL is authoritative; filesystem and network effects are deliberately outside this store. */
export class PostgresServerWorkspaceStore {
  constructor({ pool, connectionString, cipher = null, allowPlaintextForSynthetic = false,
    schema = "runa_m1_server_workspaces", now = Date.now }) {
    if (!cipher && allowPlaintextForSynthetic !== true) throw fail("workspace-encrypted-storage-required");
    if (cipher && (typeof cipher.encrypt !== "function" || typeof cipher.decrypt !== "function")) {
      throw fail("workspace-encrypted-storage-required");
    }
    this.pool = pool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 2000 });
    this.ownsPool = !pool;
    this.cipher = cipher;
    this.schemaName = schema;
    this.sqlSchema = identifier(schema);
    this.now = now;
  }

  async initialize() {
    const s = this.sqlSchema;
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${s};
      CREATE TABLE IF NOT EXISTS ${s}.sources (
        principal_id text NOT NULL, project_id text NOT NULL, source_id text PRIMARY KEY,
        definition_digest text NOT NULL, revision integer NOT NULL CHECK (revision > 0),
        lifecycle text NOT NULL, cleanup_state text NOT NULL,
        payload jsonb NOT NULL, payload_sha256 text NOT NULL,
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
      CREATE INDEX IF NOT EXISTS sources_scope ON ${s}.sources
        (principal_id,project_id,created_at,source_id);
      CREATE TABLE IF NOT EXISTS ${s}.workspaces (
        principal_id text NOT NULL, project_id text NOT NULL, workspace_id text PRIMARY KEY,
        source_id text NOT NULL REFERENCES ${s}.sources(source_id), source_revision integer NOT NULL,
        request_id text NOT NULL, idempotency_key text NOT NULL, request_digest text NOT NULL,
        lifecycle text NOT NULL, binding_digest text NOT NULL,
        payload jsonb NOT NULL, payload_sha256 text NOT NULL,
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
        UNIQUE(principal_id,project_id,idempotency_key));
      CREATE INDEX IF NOT EXISTS workspaces_scope ON ${s}.workspaces
        (principal_id,project_id,created_at,workspace_id);
      CREATE TABLE IF NOT EXISTS ${s}.outbox (
        sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        principal_id text NOT NULL, project_id text NOT NULL, event_type text NOT NULL,
        record_id text NOT NULL, payload_sha256 text NOT NULL,
        recorded_at timestamptz NOT NULL DEFAULT now());`);
  }

  async close() { if (this.ownsPool) await this.pool.end(); }

  encode(kind, context, id, value) {
    return this.cipher ? this.cipher.encrypt(envelopeContext(kind, context, id), value) : value;
  }

  decode(kind, context, id, row) {
    if (!row) return null;
    if (canonicalSha256(row.payload) !== row.payload_sha256) throw fail("workspace-authority-integrity-failed");
    try { return this.cipher ? this.cipher.decrypt(envelopeContext(kind, context, id), row.payload) : row.payload; }
    catch { throw fail("workspace-authority-envelope-invalid"); }
  }

  sourceRecord(context, row) {
    const value = this.decode("source", context, row.source_id, row);
    const selection = sourceSelectionSchema.parse(value?.selection);
    const definition = publicGitSourceDefinitionSchema.parse({ environmentId: selection.environmentId,
      displayName: selection.displayName, repositoryHttpsUrl: selection.repositoryHttpsUrl,
      requestedRef: selection.requestedRef, expectedCommitOid: value?.expectedCommitOid });
    const ids = authorityIds(context, selection.environmentId);
    if (selection.sourceId !== row.source_id || selection.revision !== row.revision
        || selection.lifecycle !== row.lifecycle || selection.cleanupState !== row.cleanup_state
        || selection.participantId !== ids.participantId || selection.projectId !== ids.projectId
        || selection.createdAt !== iso(row.created_at) || selection.updatedAt !== iso(row.updated_at)
        || canonicalSha256(definition) !== row.definition_digest) {
      throw fail("workspace-authority-integrity-failed");
    }
    return { selection, expectedCommitOid: definition.expectedCommitOid };
  }

  workspaceRecord(context, row) {
    const value = this.decode("workspace", context, row.workspace_id, row);
    const source = sourceSelectionSchema.parse(value?.source);
    const binding = authorityBindingSchema.parse(value?.binding);
    const request = materializationRequestSchema.parse(value?.request);
    const ids = authorityIds(context, source.environmentId);
    if (value.workspaceId !== row.workspace_id || value.lifecycle !== row.lifecycle
        || value.updatedAt !== iso(row.updated_at) || request.createdAt !== iso(row.created_at)
        || source.sourceId !== row.source_id || source.revision !== row.source_revision
        || binding.sourceId !== row.source_id || binding.sourceRevision !== row.source_revision
        || binding.participantId !== ids.participantId || binding.projectId !== ids.projectId
        || binding.environmentId !== ids.environmentId || request.requestId !== row.request_id
        || request.idempotencyKey !== row.idempotency_key || canonicalSha256(request) !== row.request_digest
        || request.bindingDigest !== row.binding_digest || bindingDigestFor(binding) !== row.binding_digest
        || !/^[a-f0-9]{40}$/u.test(value.expectedCommitOid ?? "")) {
      throw fail("workspace-authority-integrity-failed");
    }
    return { ...value, source, binding, request };
  }

  async scoped(contextValue, work) {
    const context = contextSchema.parse(contextValue);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Participant lock is always acquired before project lock so the global
      // two-workspace limit cannot race across this participant's projects.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${this.schemaName}:participant:${canonicalSha256(context.principalId)}`,
      ]);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${this.schemaName}:${canonicalSha256([context.principalId, context.projectId])}`,
      ]);
      const result = await work(client, context);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async connectPublicGit(contextValue, definitionValue) {
    const definition = publicGitSourceDefinitionSchema.parse(definitionValue);
    return this.scoped(contextValue, async (client, context) => {
      const definitionDigest = canonicalSha256(definition);
      const prior = (await client.query(`SELECT *
        FROM ${this.sqlSchema}.sources WHERE principal_id=$1 AND project_id=$2 AND definition_digest=$3
          AND lifecycle IN ('configured','connected','tested','enabled')
        ORDER BY created_at DESC,source_id DESC LIMIT 1 FOR UPDATE`,
      [context.principalId, context.projectId, definitionDigest])).rows[0];
      if (prior) return { created: false, source: this.sourceRecord(context, prior).selection };

      const sourceId = `source-${randomUUID()}`;
      const createdAt = iso(this.now());
      const ids = authorityIds(context, definition.environmentId);
      const selection = sourceSelectionSchema.parse({
        schemaVersion: "runa-workspace-source-selection/v1",
        ...ids,
        sourceId,
        sourceKind: "git-public-https",
        displayName: definition.displayName,
        lifecycle: "configured",
        cleanupState: "not-required",
        capabilitySetVersion: CAPABILITY_SET_VERSION,
        capabilitySetDigest: CAPABILITY_SET_DIGEST,
        revision: 1,
        createdAt,
        updatedAt: createdAt,
        revokedAt: null,
        repositoryHttpsUrl: definition.repositoryHttpsUrl,
        requestedRef: definition.requestedRef,
        endpointPolicyId: NETWORK_POLICY_ID,
        endpointPolicyDigest: NETWORK_POLICY_DIGEST,
      });
      const payload = this.encode("source", context, sourceId, { selection, expectedCommitOid: definition.expectedCommitOid });
      const payloadSha256 = canonicalSha256(payload);
      await client.query(`INSERT INTO ${this.sqlSchema}.sources
        (principal_id,project_id,source_id,definition_digest,revision,lifecycle,cleanup_state,payload,payload_sha256,created_at,updated_at)
        VALUES($1,$2,$3,$4,1,'configured','not-required',$5::jsonb,$6,$7,$7)`,
      [context.principalId, context.projectId, sourceId, definitionDigest, JSON.stringify(payload), payloadSha256, createdAt]);
      await client.query(`INSERT INTO ${this.sqlSchema}.outbox
        (principal_id,project_id,event_type,record_id,payload_sha256) VALUES($1,$2,'source-record-create',$3,$4)`,
      [context.principalId, context.projectId, sourceId, canonicalSha256(selection)]);
      return { created: true, source: selection };
    });
  }

  async listSources(contextValue) {
    const context = contextSchema.parse(contextValue);
    const rows = (await this.pool.query(`SELECT * FROM ${this.sqlSchema}.sources
      WHERE principal_id=$1 AND project_id=$2 ORDER BY created_at,source_id LIMIT 24`,
    [context.principalId, context.projectId])).rows;
    return rows.map(row => this.sourceRecord(context, row).selection);
  }

  async beginMaterialization(contextValue, { sourceId: rawSourceId }) {
    const sourceId = sourceIdSchema.parse(rawSourceId);
    return this.scoped(contextValue, async (client, context) => {
      const row = (await client.query(`SELECT *
        FROM ${this.sqlSchema}.sources WHERE principal_id=$1 AND project_id=$2 AND source_id=$3 FOR UPDATE`,
      [context.principalId, context.projectId, sourceId])).rows[0];
      if (!row) throw fail("workspace-source-selection-denied");
      if (!["configured", "connected", "tested", "enabled"].includes(row.lifecycle)) throw fail("workspace-source-inactive");
      const sourceRecord = this.sourceRecord(context, row);
      const source = sourceRecord.selection;
      const authority = authorityIds(context, source.environmentId);
      const idempotencyKey = canonicalSha256({ schemaVersion: "runa-workspace-materialization-idempotency/v1",
        participantId: authority.participantId, projectId: authority.projectId, sourceId, sourceRevision: row.revision });
      const prior = (await client.query(`SELECT * FROM ${this.sqlSchema}.workspaces
        WHERE principal_id=$1 AND project_id=$2 AND idempotency_key=$3 FOR UPDATE`,
      [context.principalId, context.projectId, idempotencyKey])).rows[0];
      if (prior) return { created: false, ...this.workspaceRecord(context, prior) };

      const participantCount = Number((await client.query(`SELECT count(*) AS count FROM ${this.sqlSchema}.workspaces
        WHERE principal_id=$1 AND lifecycle IN ('intent-recorded','staging','published-pending-db')`,
      [context.principalId])).rows[0].count);
      if (participantCount >= 2) throw fail("workspace-participant-concurrency-limit");
      const sourceCount = Number((await client.query(`SELECT count(*) AS count FROM ${this.sqlSchema}.workspaces
        WHERE principal_id=$1 AND project_id=$2 AND source_id=$3
          AND lifecycle IN ('intent-recorded','staging','published-pending-db')`,
      [context.principalId, context.projectId, sourceId])).rows[0].count);
      if (sourceCount >= 1) throw fail("workspace-source-concurrency-limit");

      const requestId = `request-${randomUUID()}`;
      const taskId = `task-${randomUUID()}`;
      const workspaceId = `workspace-${randomUUID()}`;
      const binding = authorityBindingSchema.parse({ schemaVersion: "runa-workspace-binding/v1", ...authority,
        sourceId, taskId, sourceRevision: row.revision,
        capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST });
      const bindingDigest = bindingDigestFor(binding);
      const createdAtMs = this.now();
      const createdAt = iso(createdAtMs);
      const request = materializationRequestSchema.parse({ schemaVersion: "runa-workspace-materialization-request/v1",
        requestId, idempotencyKey, sourceId, taskId, bindingDigest, expectedSourceRevision: row.revision,
        capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
        requestedRef: source.requestedRef, uploadSessionId: null, uploadManifestDigest: null,
        limitsProfileId: MATERIALIZATION_POLICY_ID, limitsProfileDigest: MATERIALIZATION_POLICY_DIGEST,
        createdAt, deadlineAt: iso(createdAtMs + MATERIALIZATION_DEADLINE_MS) });
      const value = { workspaceId, lifecycle: "intent-recorded", source, binding, request,
        expectedCommitOid: sourceRecord.expectedCommitOid, updatedAt: createdAt };
      const payload = this.encode("workspace", context, workspaceId, value);
      await client.query(`INSERT INTO ${this.sqlSchema}.workspaces
        (principal_id,project_id,workspace_id,source_id,source_revision,request_id,idempotency_key,request_digest,
          lifecycle,binding_digest,payload,payload_sha256,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'intent-recorded',$9,$10::jsonb,$11,$12,$12)`,
      [context.principalId, context.projectId, workspaceId, sourceId, row.revision, requestId, idempotencyKey,
        canonicalSha256(request), bindingDigest, JSON.stringify(payload), canonicalSha256(payload), createdAt]);
      await client.query(`INSERT INTO ${this.sqlSchema}.outbox
        (principal_id,project_id,event_type,record_id,payload_sha256) VALUES($1,$2,'workspace-intent-recorded',$3,$4)`,
      [context.principalId, context.projectId, workspaceId, canonicalSha256(request)]);
      return { created: true, ...value };
    });
  }

  async getWorkspace(contextValue, rawWorkspaceId) {
    const context = contextSchema.parse(contextValue), workspaceId = workspaceIdSchema.parse(rawWorkspaceId);
    const row = (await this.pool.query(`SELECT * FROM ${this.sqlSchema}.workspaces
      WHERE principal_id=$1 AND project_id=$2 AND workspace_id=$3`,
    [context.principalId, context.projectId, workspaceId])).rows[0];
    if (!row) throw fail("workspace-selection-denied");
    return this.workspaceRecord(context, row);
  }
}
