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
  admitWorkspaceManifest,
  authorityBindingSchema,
  bindingDigestFor,
  canonicalSha256,
  fileSetDigest,
  materializationReceiptSchema,
  materializationRequestSchema,
  sourceSelectionSchema,
  workspaceManifestSchema,
} from "./materialization-contracts.mjs";

const fail = code => Object.assign(new Error(code), { code });
const scopeId = z.string().min(1).max(160).regex(/^[^\u0000-\u001f\u007f]+$/u);
const contextSchema = z.object({ principalId: scopeId, projectId: scopeId, sessionId: scopeId }).strict();
const sourceIdSchema = z.string().regex(/^source-[a-f0-9-]{36}$/u);
const workspaceIdSchema = z.string().regex(/^workspace-[a-f0-9-]{36}$/u);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const authorityIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/u);
const utcSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u).refine(value => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}, "invalid canonical UTC instant");
const transitionIdentitySchema = z.object({
  workspaceId: workspaceIdSchema,
  expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  idempotencyKey: digestSchema,
  bindingDigest: digestSchema,
  capabilitySetDigest: z.literal(CAPABILITY_SET_DIGEST),
}).strict();
const publishedTransitionSchema = transitionIdentitySchema.extend({
  stagingManifestDigest: digestSchema,
  finalManifestDigest: digestSchema,
}).strict();
const terminalTransitionSchema = transitionIdentitySchema.extend({ receipt: materializationReceiptSchema }).strict();
const reconciliationTransitionSchema = transitionIdentitySchema.extend({ evidenceDigest: digestSchema }).strict();
const cleanupPendingTransitionSchema = terminalTransitionSchema.extend({ evidenceDigest: digestSchema }).strict();
export const externalOperationTerminalReceiptSchema = z.object({
  schemaVersion: z.literal("runa-workspace-external-operation-terminal-receipt/v1"),
  operationId: authorityIdSchema,
  requestId: authorityIdSchema,
  sourceId: sourceIdSchema,
  sourceRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  sourceKind: z.literal("git-public-https"),
  workspaceId: workspaceIdSchema,
  workspaceRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  taskId: authorityIdSchema,
  idempotencyKey: digestSchema,
  bindingDigest: digestSchema,
  capabilitySetVersion: z.literal(CAPABILITY_SET_VERSION),
  capabilitySetDigest: z.literal(CAPABILITY_SET_DIGEST),
  outcome: z.literal("terminal-success"),
  workspaceReceiptSha256: digestSchema,
  finalManifestDigest: digestSchema,
  nativeVersion: z.string().regex(/^[a-f0-9]{40}$/u),
  processState: z.literal("stopped"),
  activeProcesses: z.literal(0),
  publicationState: z.literal("published-reobserved"),
  cleanupState: z.literal("complete"),
  privateValuesIncluded: z.literal(false),
  modelInvoked: z.literal(false),
  recordedAt: utcSchema,
}).strict();
const readyTransitionSchema = terminalTransitionSchema.extend({
  workspaceManifestRaw: z.union([z.string(), z.instanceof(Buffer)]),
  operationReceipt: externalOperationTerminalReceiptSchema,
}).strict();
const sourceTransitionIdentitySchema = z.object({ sourceId: sourceIdSchema,
  expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  capabilitySetDigest: z.literal(CAPABILITY_SET_DIGEST),
}).strict();
const sourceCleanupTransitionSchema = sourceTransitionIdentitySchema.extend({
  successor: z.enum(["disconnected", "expired", "revoked", "failed"]),
  evidenceDigest: digestSchema,
}).strict();
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
const immutable = value => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) immutable(child);
  return Object.freeze(value);
};
const rawObject = value => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
const transitionIdentityFor = value => {
  const input = rawObject(value);
  return transitionIdentitySchema.parse({ workspaceId: input.workspaceId, expectedRevision: input.expectedRevision,
    idempotencyKey: input.idempotencyKey, bindingDigest: input.bindingDigest,
    capabilitySetDigest: input.capabilitySetDigest });
};
const sourceTransitionIdentityFor = value => {
  const input = rawObject(value);
  return sourceTransitionIdentitySchema.parse({ sourceId: input.sourceId, expectedRevision: input.expectedRevision,
    capabilitySetDigest: input.capabilitySetDigest });
};
const sourceCleanupTargetFor = value => {
  const input = rawObject(value);
  return sourceTransitionIdentitySchema.extend({
    successor: z.enum(["disconnected", "expired", "revoked", "failed"]),
  }).strict().parse({ sourceId: input.sourceId, expectedRevision: input.expectedRevision,
    capabilitySetDigest: input.capabilitySetDigest, successor: input.successor });
};
const activeSourceLifecycles = Object.freeze(["configured", "connected", "tested", "enabled"]);
const usableWorkspaceLifecycles = Object.freeze(["intent-recorded", "staging", "published-pending-db", "ready"]);
const legacyCompleteWorkspaceLifecycles = Object.freeze(["ready", "expired", "cancelled", "failed", "removed"]);

const legacyPublicationProof = (prior, row, binding) => {
  const sourceResult = sourceSelectionSchema.safeParse(prior?.source);
  const requestResult = materializationRequestSchema.safeParse(prior?.request);
  const manifestResult = workspaceManifestSchema.safeParse(prior?.workspaceManifest);
  if (!sourceResult.success || !requestResult.success || !manifestResult.success
      || !digestSchema.safeParse(prior?.stagingManifestDigest).success
      || !digestSchema.safeParse(prior?.finalManifestDigest).success) return null;
  const source = sourceResult.data, request = requestResult.data, manifest = manifestResult.data;
  const manifestDigest = canonicalSha256(manifest);
  if (manifestDigest !== prior.finalManifestDigest
      || (row.manifest_digest !== null && row.manifest_digest !== manifestDigest)
      || source.sourceId !== row.source_id || source.revision !== row.source_revision
      || binding.sourceId !== row.source_id || binding.sourceRevision !== row.source_revision
      || request.sourceId !== row.source_id || request.sourceId !== source.sourceId
      || request.sourceId !== binding.sourceId || request.taskId !== binding.taskId
      || request.expectedSourceRevision !== row.source_revision
      || request.expectedSourceRevision !== source.revision
      || request.expectedSourceRevision !== binding.sourceRevision
      || request.requestedRef !== source.requestedRef
      || manifest.workspaceId !== row.workspace_id || manifest.sourceId !== row.source_id
      || manifest.sourceId !== source.sourceId || manifest.sourceKind !== source.sourceKind
      || manifest.bindingDigest !== row.binding_digest || manifest.bindingDigest !== request.bindingDigest
      || manifest.capabilitySetVersion !== binding.capabilitySetVersion
      || manifest.capabilitySetDigest !== binding.capabilitySetDigest
      || manifest.limitsProfileId !== request.limitsProfileId
      || manifest.limitsProfileDigest !== request.limitsProfileDigest
      || manifest.createdAt !== request.createdAt || manifest.nativeVersion !== prior.expectedCommitOid
      || manifest.lifecycle !== "ready" || !manifest.complete || manifest.rejectedCount !== 0
      || manifest.fileSetDigest !== fileSetDigest(manifest.entries)) return null;
  return { manifest, manifestDigest, source, request };
};

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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${s};
      CREATE TABLE IF NOT EXISTS ${s}.sources (
        principal_id text NOT NULL, project_id text NOT NULL, source_id text PRIMARY KEY,
        definition_digest text NOT NULL, revision integer NOT NULL CHECK (revision > 0),
        lifecycle text NOT NULL, cleanup_state text NOT NULL,
        payload jsonb NOT NULL, payload_sha256 text NOT NULL,
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
        last_transition_digest text);
      ALTER TABLE ${s}.sources ADD COLUMN IF NOT EXISTS last_transition_digest text;
      CREATE INDEX IF NOT EXISTS sources_scope ON ${s}.sources
        (principal_id,project_id,created_at,source_id);
      CREATE TABLE IF NOT EXISTS ${s}.workspaces (
        principal_id text NOT NULL, project_id text NOT NULL, workspace_id text PRIMARY KEY,
        source_id text NOT NULL REFERENCES ${s}.sources(source_id), source_revision integer NOT NULL,
        request_id text NOT NULL, idempotency_key text NOT NULL, request_digest text NOT NULL,
        lifecycle text NOT NULL, cleanup_state text NOT NULL, revision integer NOT NULL CHECK (revision > 0),
        binding_digest text NOT NULL, capability_digest text NOT NULL,
        manifest_digest text, operation_receipt_sha256 text, last_transition_digest text,
        payload jsonb NOT NULL, payload_sha256 text NOT NULL,
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
        UNIQUE(principal_id,project_id,idempotency_key));
      ALTER TABLE ${s}.workspaces ADD COLUMN IF NOT EXISTS cleanup_state text;
      ALTER TABLE ${s}.workspaces ADD COLUMN IF NOT EXISTS revision integer;
      ALTER TABLE ${s}.workspaces ADD COLUMN IF NOT EXISTS capability_digest text;
      ALTER TABLE ${s}.workspaces ADD COLUMN IF NOT EXISTS last_transition_digest text;
      ALTER TABLE ${s}.workspaces ADD COLUMN IF NOT EXISTS manifest_digest text;
      ALTER TABLE ${s}.workspaces ADD COLUMN IF NOT EXISTS operation_receipt_sha256 text;
      CREATE TABLE IF NOT EXISTS ${s}.workspace_receipts (
        principal_id text NOT NULL, project_id text NOT NULL,
        workspace_id text NOT NULL REFERENCES ${s}.workspaces(workspace_id),
        workspace_revision integer NOT NULL CHECK (workspace_revision > 0),
        request_id text NOT NULL, idempotency_key text NOT NULL,
        receipt jsonb NOT NULL, receipt_sha256 text NOT NULL,
        recorded_at timestamptz NOT NULL,
        PRIMARY KEY(workspace_id,workspace_revision), UNIQUE(workspace_id,receipt_sha256));
      CREATE INDEX IF NOT EXISTS workspace_receipts_scope ON ${s}.workspace_receipts
        (principal_id,project_id,workspace_id,workspace_revision);
      CREATE OR REPLACE FUNCTION ${s}.reject_workspace_receipt_mutation() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'workspace receipts are immutable'; END $$;
      DROP TRIGGER IF EXISTS workspace_receipts_immutable ON ${s}.workspace_receipts;
      CREATE TRIGGER workspace_receipts_immutable BEFORE UPDATE OR DELETE ON ${s}.workspace_receipts
        FOR EACH ROW EXECUTE FUNCTION ${s}.reject_workspace_receipt_mutation();
      CREATE TABLE IF NOT EXISTS ${s}.operation_receipts (
        principal_id text NOT NULL, project_id text NOT NULL,
        workspace_id text NOT NULL, workspace_revision integer NOT NULL CHECK (workspace_revision > 0),
        operation_id text NOT NULL, request_id text NOT NULL, task_id text NOT NULL,
        workspace_receipt_sha256 text NOT NULL, receipt jsonb NOT NULL, receipt_sha256 text NOT NULL,
        recorded_at timestamptz NOT NULL,
        PRIMARY KEY(workspace_id,workspace_revision), UNIQUE(operation_id), UNIQUE(workspace_id,receipt_sha256),
        FOREIGN KEY(workspace_id,workspace_revision)
          REFERENCES ${s}.workspace_receipts(workspace_id,workspace_revision));
      CREATE INDEX IF NOT EXISTS operation_receipts_scope ON ${s}.operation_receipts
        (principal_id,project_id,workspace_id,workspace_revision);
      CREATE OR REPLACE FUNCTION ${s}.reject_operation_receipt_mutation() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'operation receipts are immutable'; END $$;
      DROP TRIGGER IF EXISTS operation_receipts_immutable ON ${s}.operation_receipts;
      CREATE TRIGGER operation_receipts_immutable BEFORE UPDATE OR DELETE ON ${s}.operation_receipts
        FOR EACH ROW EXECUTE FUNCTION ${s}.reject_operation_receipt_mutation();`);
      const legacyRows = (await client.query(`SELECT * FROM ${s}.workspaces
        WHERE cleanup_state IS NULL OR revision IS NULL OR capability_digest IS NULL
          OR (lifecycle='ready' AND operation_receipt_sha256 IS NULL) FOR UPDATE`)).rows;
      for (const row of legacyRows) {
        const migrationContext = { principalId: row.principal_id, projectId: row.project_id,
          sessionId: "schema-migration" };
        const prior = this.decode("workspace", { principalId: row.principal_id, projectId: row.project_id,
          sessionId: "schema-migration" }, row.workspace_id, row);
        const binding = authorityBindingSchema.parse(prior?.binding);
        const publication = legacyPublicationProof(prior, row, binding);
        const receiptAuthority = row.lifecycle === "ready" && publication !== null
          ? await this.#legacyReadyReceiptAuthority(client, migrationContext, row, prior, publication, binding)
          : null;
        const claimedComplete = row.cleanup_state === "complete"
          || (row.cleanup_state === null && legacyCompleteWorkspaceLifecycles.includes(row.lifecycle));
        const failClosed = (row.lifecycle === "ready" && receiptAuthority === null)
          || (claimedComplete && publication === null);
        const lifecycle = failClosed ? "unknown" : row.lifecycle;
        const revision = failClosed ? 1 : receiptAuthority?.workspaceRevision ?? 1;
        const cleanupState = failClosed || lifecycle === "unknown" ? "indeterminate"
          : row.cleanup_state ?? (lifecycle === "cleanup-pending" ? "pending"
            : legacyCompleteWorkspaceLifecycles.includes(lifecycle) && publication !== null ? "complete" : "not-required");
        const operationReceiptSha256 = failClosed ? null : receiptAuthority?.operationReceiptSha256 ?? null;
        const value = { ...prior, lifecycle, revision, cleanupState,
          workspaceManifest: failClosed ? null : publication?.manifest ?? prior.workspaceManifest ?? null,
          stagingManifestDigest: digestSchema.safeParse(prior.stagingManifestDigest).success
            ? prior.stagingManifestDigest : null,
          finalManifestDigest: failClosed ? null : publication?.manifestDigest ?? null,
          terminalOperationReceiptSha256: operationReceiptSha256 };
        const payload = this.encode("workspace", migrationContext, row.workspace_id, value);
        await client.query(`UPDATE ${s}.workspaces SET lifecycle=$2,cleanup_state=$3,revision=$4,capability_digest=$5,
          manifest_digest=$6,operation_receipt_sha256=$7,payload=$8::jsonb,payload_sha256=$9 WHERE workspace_id=$1`,
        [row.workspace_id, lifecycle, cleanupState, revision, binding.capabilitySetDigest,
          failClosed ? null : publication?.manifestDigest ?? null, operationReceiptSha256,
          JSON.stringify(payload), canonicalSha256(payload)]);
      }
      await client.query(`ALTER TABLE ${s}.workspaces ALTER COLUMN cleanup_state SET NOT NULL;
      ALTER TABLE ${s}.workspaces ALTER COLUMN revision SET NOT NULL;
      ALTER TABLE ${s}.workspaces ALTER COLUMN capability_digest SET NOT NULL;
      CREATE INDEX IF NOT EXISTS workspaces_scope ON ${s}.workspaces
        (principal_id,project_id,created_at,workspace_id);
      CREATE TABLE IF NOT EXISTS ${s}.outbox (
        sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        principal_id text NOT NULL, project_id text NOT NULL, event_type text NOT NULL,
        record_id text NOT NULL, payload_sha256 text NOT NULL,
        recorded_at timestamptz NOT NULL DEFAULT now());`);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
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
    const cleanupEvidenceDigest = value?.cleanupEvidenceDigest ?? null;
    const reconciliationEvidenceDigest = value?.reconciliationEvidenceDigest ?? null;
    if (selection.sourceId !== row.source_id || selection.revision !== row.revision
        || selection.lifecycle !== row.lifecycle || selection.cleanupState !== row.cleanup_state
        || selection.participantId !== ids.participantId || selection.projectId !== ids.projectId
        || selection.createdAt !== iso(row.created_at) || selection.updatedAt !== iso(row.updated_at)
        || canonicalSha256(definition) !== row.definition_digest
        || (cleanupEvidenceDigest !== null && !digestSchema.safeParse(cleanupEvidenceDigest).success)
        || (reconciliationEvidenceDigest !== null && !digestSchema.safeParse(reconciliationEvidenceDigest).success)
        || (row.cleanup_state === "complete" && cleanupEvidenceDigest === null)) {
      throw fail("workspace-authority-integrity-failed");
    }
    return { selection, expectedCommitOid: definition.expectedCommitOid,
      cleanupEvidenceDigest, reconciliationEvidenceDigest };
  }

  workspaceRecord(context, row) {
    const value = this.decode("workspace", context, row.workspace_id, row);
    const source = sourceSelectionSchema.parse(value?.source);
    const binding = authorityBindingSchema.parse(value?.binding);
    const request = materializationRequestSchema.parse(value?.request);
    const manifest = value?.workspaceManifest == null ? null : workspaceManifestSchema.parse(value.workspaceManifest);
    const operationReceiptSha256 = value?.terminalOperationReceiptSha256 ?? null;
    const ids = authorityIds(context, source.environmentId);
    if (value.workspaceId !== row.workspace_id || value.lifecycle !== row.lifecycle
        || value.revision !== row.revision || value.cleanupState !== row.cleanup_state
        || value.updatedAt !== iso(row.updated_at) || request.createdAt !== iso(row.created_at)
        || source.sourceId !== row.source_id || source.revision !== row.source_revision
        || binding.sourceId !== row.source_id || binding.sourceRevision !== row.source_revision
        || binding.participantId !== ids.participantId || binding.projectId !== ids.projectId
        || binding.environmentId !== ids.environmentId || request.requestId !== row.request_id
        || request.idempotencyKey !== row.idempotency_key || canonicalSha256(request) !== row.request_digest
        || request.bindingDigest !== row.binding_digest || bindingDigestFor(binding) !== row.binding_digest
        || request.sourceId !== row.source_id || request.sourceId !== source.sourceId
        || request.sourceId !== binding.sourceId || request.taskId !== binding.taskId
        || request.expectedSourceRevision !== row.source_revision
        || request.expectedSourceRevision !== source.revision
        || request.expectedSourceRevision !== binding.sourceRevision
        || request.requestedRef !== source.requestedRef
        || binding.capabilitySetDigest !== row.capability_digest
        || (operationReceiptSha256 !== null && !digestSchema.safeParse(operationReceiptSha256).success)
        || (row.operation_receipt_sha256 ?? null) !== operationReceiptSha256
        || (![null, undefined].includes(value.stagingManifestDigest) && !digestSchema.safeParse(value.stagingManifestDigest).success)
        || (![null, undefined].includes(value.finalManifestDigest) && !digestSchema.safeParse(value.finalManifestDigest).success)
        || (![null, undefined].includes(value.sourceInvalidationDigest)
          && !digestSchema.safeParse(value.sourceInvalidationDigest).success)
        || (row.manifest_digest === null) !== (manifest === null)
        || (manifest && (canonicalSha256(manifest) !== row.manifest_digest
          || canonicalSha256(manifest) !== value.finalManifestDigest
          || manifest.fileSetDigest !== fileSetDigest(manifest.entries)))
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
      const priorRows = (await client.query(`SELECT *
        FROM ${this.sqlSchema}.sources WHERE principal_id=$1 AND project_id=$2 AND definition_digest=$3
        ORDER BY created_at DESC,source_id DESC FOR UPDATE`,
      [context.principalId, context.projectId, definitionDigest])).rows;
      const priors = priorRows.map(row => ({ row, record: this.sourceRecord(context, row) }));
      const active = priors.find(({ row }) => activeSourceLifecycles.includes(row.lifecycle));
      if (active) return { created: false, source: active.record.selection };
      if (priors.some(({ row }) => row.cleanup_state !== "complete")) {
        throw fail("workspace-source-reconciliation-required");
      }

      const sourceId = `source-${randomUUID()}`;
      const createdAt = iso(this.now());
      const ids = authorityIds(context, definition.environmentId);
      const knownSelection = sourceSelectionSchema.parse({
        schemaVersion: "runa-workspace-source-selection/v1",
        ...ids,
        sourceId,
        sourceKind: "git-public-https",
        displayName: definition.displayName,
        lifecycle: "known",
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
      const payload = this.encode("source", context, sourceId, { selection: knownSelection, expectedCommitOid: definition.expectedCommitOid });
      const payloadSha256 = canonicalSha256(payload);
      await client.query(`INSERT INTO ${this.sqlSchema}.sources
        (principal_id,project_id,source_id,definition_digest,revision,lifecycle,cleanup_state,payload,payload_sha256,created_at,updated_at)
        VALUES($1,$2,$3,$4,1,'known','not-required',$5::jsonb,$6,$7,$7)`,
      [context.principalId, context.projectId, sourceId, definitionDigest, JSON.stringify(payload), payloadSha256, createdAt]);
      await client.query(`INSERT INTO ${this.sqlSchema}.outbox
        (principal_id,project_id,event_type,record_id,payload_sha256) VALUES($1,$2,'source-known',$3,$4)`,
      [context.principalId, context.projectId, sourceId, canonicalSha256(knownSelection)]);
      const selection = sourceSelectionSchema.parse({ ...knownSelection, lifecycle: "configured", revision: 2 });
      const configuredPayload = this.encode("source", context, sourceId,
        { selection, expectedCommitOid: definition.expectedCommitOid });
      const transitionDigest = canonicalSha256({ schemaVersion: "runa-workspace-source-transition/v1",
        sourceId, expectedRevision: 1, allowedPredecessors: ["known"], successor: "configured",
        cleanupState: "not-required", capabilitySetDigest: CAPABILITY_SET_DIGEST, fields: {} });
      const configured = await client.query(`UPDATE ${this.sqlSchema}.sources
        SET revision=2,lifecycle='configured',payload=$4::jsonb,payload_sha256=$5,last_transition_digest=$6
        WHERE principal_id=$1 AND project_id=$2 AND source_id=$3 AND revision=1 AND lifecycle='known'`,
      [context.principalId, context.projectId, sourceId, JSON.stringify(configuredPayload),
        canonicalSha256(configuredPayload), transitionDigest]);
      if (configured.rowCount !== 1) throw fail("workspace-source-transition-conflict");
      await client.query(`INSERT INTO ${this.sqlSchema}.outbox
        (principal_id,project_id,event_type,record_id,payload_sha256) VALUES($1,$2,'source-configured',$3,$4)`,
      [context.principalId, context.projectId, sourceId, transitionDigest]);
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

  async #sourceTransition(contextValue, inputValue, { inputSchema = sourceTransitionIdentitySchema,
    predecessors, successor, cleanupState, eventType, fieldsFor = () => ({}), invalidateWorkspaces = false,
    indeterminateWorkspaces = false }) {
    const identity = sourceTransitionIdentityFor(inputValue);
    return this.scoped(contextValue, async (client, context) => {
      const row = (await client.query(`SELECT * FROM ${this.sqlSchema}.sources
        WHERE principal_id=$1 AND project_id=$2 AND source_id=$3 FOR UPDATE`,
      [context.principalId, context.projectId, identity.sourceId])).rows[0];
      if (!row) throw fail("workspace-source-selection-denied");
      const current = this.sourceRecord(context, row);
      if (identity.capabilitySetDigest !== current.selection.capabilitySetDigest) {
        throw fail("workspace-source-transition-binding-mismatch");
      }
      const replayCandidate = row.lifecycle === successor && row.revision === identity.expectedRevision + 1;
      if (!replayCandidate
          && (row.revision !== identity.expectedRevision || !predecessors.includes(row.lifecycle))) {
        throw fail("workspace-source-transition-conflict");
      }
      const admitted = inputSchema.parse(inputValue);
      const fields = fieldsFor(admitted);
      const transitionDigest = canonicalSha256({ schemaVersion: "runa-workspace-source-transition/v1",
        sourceId: row.source_id, expectedRevision: identity.expectedRevision, allowedPredecessors: predecessors,
        successor, cleanupState, capabilitySetDigest: identity.capabilitySetDigest, fields });
      if (replayCandidate) {
        if (row.last_transition_digest === transitionDigest) return { changed: false, source: current.selection };
        throw fail("workspace-source-transition-conflict");
      }
      const updatedAt = iso(this.now()), revision = row.revision + 1;
      if (invalidateWorkspaces) {
        await this.#invalidateDependentWorkspaces(client, context, row.source_id, transitionDigest, updatedAt,
          indeterminateWorkspaces);
      }
      const selection = sourceSelectionSchema.parse({ ...current.selection, lifecycle: successor, cleanupState,
        revision, updatedAt, revokedAt: successor === "revoked" ? updatedAt : current.selection.revokedAt });
      const payload = this.encode("source", context, row.source_id,
        { ...current, ...fields, selection, expectedCommitOid: current.expectedCommitOid });
      const changed = await client.query(`UPDATE ${this.sqlSchema}.sources
        SET revision=$6,lifecycle=$7,cleanup_state=$8,payload=$9::jsonb,payload_sha256=$10,
          updated_at=$11,last_transition_digest=$12
        WHERE principal_id=$1 AND project_id=$2 AND source_id=$3 AND revision=$4 AND lifecycle=$5`,
      [context.principalId, context.projectId, row.source_id, row.revision, row.lifecycle, revision,
        successor, cleanupState, JSON.stringify(payload), canonicalSha256(payload), updatedAt, transitionDigest]);
      if (changed.rowCount !== 1) throw fail("workspace-source-transition-conflict");
      await client.query(`INSERT INTO ${this.sqlSchema}.outbox
        (principal_id,project_id,event_type,record_id,payload_sha256) VALUES($1,$2,$3,$4,$5)`,
      [context.principalId, context.projectId, eventType, row.source_id, transitionDigest]);
      return { changed: true, source: selection };
    });
  }

  async #invalidateDependentWorkspaces(client, context, sourceId, sourceTransitionDigest, updatedAt,
    indeterminate = false) {
    const rows = (await client.query(`SELECT * FROM ${this.sqlSchema}.workspaces
      WHERE principal_id=$1 AND project_id=$2 AND source_id=$3
      ORDER BY workspace_id FOR UPDATE`, [context.principalId, context.projectId, sourceId])).rows;
    for (const row of rows) {
      if (!usableWorkspaceLifecycles.includes(row.lifecycle)) continue;
      const current = this.workspaceRecord(context, row);
      const lifecycle = !indeterminate && row.lifecycle === "ready" ? "expired" : "unknown";
      const cleanupState = !indeterminate && row.lifecycle === "ready" ? "pending" : "indeterminate";
      const revision = row.revision + 1;
      const workspaceTransitionDigest = canonicalSha256({
        schemaVersion: "runa-workspace-source-invalidation/v1",
        sourceTransitionDigest, workspaceId: row.workspace_id, expectedRevision: row.revision,
        predecessor: row.lifecycle, successor: lifecycle, cleanupState,
      });
      const value = { ...current, lifecycle, cleanupState, revision, updatedAt,
        sourceInvalidationDigest: sourceTransitionDigest };
      const payload = this.encode("workspace", context, row.workspace_id, value);
      const changed = await client.query(`UPDATE ${this.sqlSchema}.workspaces
        SET lifecycle=$4,cleanup_state=$5,revision=$6,last_transition_digest=$7,
          payload=$8::jsonb,payload_sha256=$9,updated_at=$10
        WHERE principal_id=$1 AND project_id=$2 AND workspace_id=$3 AND revision=$11 AND lifecycle=$12`,
      [context.principalId, context.projectId, row.workspace_id, lifecycle, cleanupState, revision,
        workspaceTransitionDigest, JSON.stringify(payload), canonicalSha256(payload), updatedAt,
        row.revision, row.lifecycle]);
      if (changed.rowCount !== 1) throw fail("workspace-transition-conflict");
      await client.query(`INSERT INTO ${this.sqlSchema}.outbox
        (principal_id,project_id,event_type,record_id,payload_sha256)
        VALUES($1,$2,'workspace-source-invalidated',$3,$4)`,
      [context.principalId, context.projectId, row.workspace_id, workspaceTransitionDigest]);
    }
  }

  async recordSourceConfigured(context, input) { return this.#sourceTransition(context, input,
    { predecessors: ["known"], successor: "configured", cleanupState: "not-required", eventType: "source-configured" }); }
  async recordSourceConnected(context, input) { return this.#sourceTransition(context, input,
    { predecessors: ["configured"], successor: "connected", cleanupState: "not-required", eventType: "source-connected" }); }
  async recordSourceTested(context, input) { return this.#sourceTransition(context, input,
    { predecessors: ["connected"], successor: "tested", cleanupState: "not-required", eventType: "source-tested" }); }
  async recordSourceEnabled(context, input) { return this.#sourceTransition(context, input,
    { predecessors: ["tested"], successor: "enabled", cleanupState: "not-required", eventType: "source-enabled" }); }
  async recordSourceDisconnected(context, input) { return this.#sourceTransition(context, input,
    { predecessors: ["configured", "connected", "tested", "enabled"], successor: "disconnected", cleanupState: "pending", eventType: "source-disconnected", invalidateWorkspaces: true }); }
  async recordSourceExpired(context, input) { return this.#sourceTransition(context, input,
    { predecessors: ["configured", "connected", "tested", "enabled"], successor: "expired", cleanupState: "pending", eventType: "source-expired", invalidateWorkspaces: true }); }
  async recordSourceRevoked(context, input) { return this.#sourceTransition(context, input,
    { predecessors: ["known", "configured", "connected", "tested", "enabled"], successor: "revoked", cleanupState: "pending", eventType: "source-revoked", invalidateWorkspaces: true }); }
  async recordSourceFailed(context, input) { return this.#sourceTransition(context, input,
    { predecessors: ["known", "configured", "connected", "tested", "enabled"], successor: "failed", cleanupState: "pending", eventType: "source-failed", invalidateWorkspaces: true }); }
  async recordSourceUnknown(context, input) { return this.#sourceTransition(context, input,
    { predecessors: ["known", "configured", "connected", "tested", "enabled"], successor: "unknown", cleanupState: "indeterminate", eventType: "source-unknown", invalidateWorkspaces: true,
      indeterminateWorkspaces: true }); }
  async reconcileSourceUnknown(context, inputValue) { const { successor } = sourceCleanupTargetFor(inputValue);
    return this.#sourceTransition(context, inputValue,
    { predecessors: ["unknown"], successor, cleanupState: "pending", eventType: "source-unknown-reconciled",
      inputSchema: sourceCleanupTransitionSchema,
      fieldsFor: input => ({ reconciliationEvidenceDigest: input.evidenceDigest }), invalidateWorkspaces: true }); }
  async recordSourceCleanupComplete(context, inputValue) { const { successor } = sourceCleanupTargetFor(inputValue);
    return this.#sourceTransition(context, inputValue,
    { predecessors: [successor], successor,
      cleanupState: "complete", eventType: "source-cleanup-complete", inputSchema: sourceCleanupTransitionSchema,
      fieldsFor: input => ({ cleanupEvidenceDigest: input.evidenceDigest }), invalidateWorkspaces: true }); }

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
      const value = { workspaceId, lifecycle: "intent-recorded", revision: 1, cleanupState: "not-required",
        stagingManifestDigest: null, finalManifestDigest: null, source, binding, request,
        terminalOperationReceiptSha256: null,
        expectedCommitOid: sourceRecord.expectedCommitOid, updatedAt: createdAt };
      const payload = this.encode("workspace", context, workspaceId, value);
      await client.query(`INSERT INTO ${this.sqlSchema}.workspaces
        (principal_id,project_id,workspace_id,source_id,source_revision,request_id,idempotency_key,request_digest,
          lifecycle,cleanup_state,revision,binding_digest,capability_digest,payload,payload_sha256,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'intent-recorded','not-required',1,$9,$10,$11::jsonb,$12,$13,$13)`,
      [context.principalId, context.projectId, workspaceId, sourceId, row.revision, requestId, idempotencyKey,
        canonicalSha256(request), bindingDigest, CAPABILITY_SET_DIGEST, JSON.stringify(payload), canonicalSha256(payload), createdAt]);
      await client.query(`INSERT INTO ${this.sqlSchema}.outbox
        (principal_id,project_id,event_type,record_id,payload_sha256) VALUES($1,$2,'workspace-intent-recorded',$3,$4)`,
      [context.principalId, context.projectId, workspaceId, canonicalSha256(request)]);
      return { created: true, ...value };
    });
  }

  async getWorkspace(contextValue, rawWorkspaceId) {
    const context = contextSchema.parse(contextValue), workspaceId = workspaceIdSchema.parse(rawWorkspaceId);
    const row = (await this.pool.query(`SELECT workspace_row.*,
        CASE WHEN source_row.source_id IS NULL THEN NULL ELSE row_to_json(source_row) END AS current_source_row,
        workspace_receipt.request_id AS ready_workspace_request_id,
        workspace_receipt.idempotency_key AS ready_workspace_idempotency_key,
        workspace_receipt.receipt AS ready_workspace_receipt,
        workspace_receipt.receipt_sha256 AS ready_workspace_receipt_sha256,
        operation_receipt.operation_id AS ready_operation_id,
        operation_receipt.request_id AS ready_operation_request_id,
        operation_receipt.task_id AS ready_operation_task_id,
        operation_receipt.workspace_receipt_sha256 AS ready_operation_workspace_receipt_sha256,
        operation_receipt.receipt AS ready_operation_receipt,
        operation_receipt.receipt_sha256 AS ready_operation_receipt_sha256,
        operation_receipt.recorded_at AS ready_operation_recorded_at
      FROM ${this.sqlSchema}.workspaces AS workspace_row
      LEFT JOIN ${this.sqlSchema}.sources AS source_row
        ON source_row.principal_id=workspace_row.principal_id
        AND source_row.project_id=workspace_row.project_id
        AND source_row.source_id=workspace_row.source_id
      LEFT JOIN ${this.sqlSchema}.workspace_receipts AS workspace_receipt
        ON workspace_receipt.principal_id=workspace_row.principal_id
        AND workspace_receipt.project_id=workspace_row.project_id
        AND workspace_receipt.workspace_id=workspace_row.workspace_id
        AND workspace_receipt.workspace_revision=workspace_row.revision
      LEFT JOIN ${this.sqlSchema}.operation_receipts AS operation_receipt
        ON operation_receipt.principal_id=workspace_receipt.principal_id
        AND operation_receipt.project_id=workspace_receipt.project_id
        AND operation_receipt.workspace_id=workspace_receipt.workspace_id
        AND operation_receipt.workspace_revision=workspace_receipt.workspace_revision
      WHERE workspace_row.principal_id=$1 AND workspace_row.project_id=$2 AND workspace_row.workspace_id=$3`,
    [context.principalId, context.projectId, workspaceId])).rows[0];
    if (!row) throw fail("workspace-selection-denied");
    const workspace = this.workspaceRecord(context, row);
    if (row.current_source_row === null) throw fail("workspace-source-authority-stale");
    const source = this.sourceRecord(context, row.current_source_row);
    if (usableWorkspaceLifecycles.includes(row.lifecycle)
        && (row.current_source_row.revision !== row.source_revision
          || !activeSourceLifecycles.includes(row.current_source_row.lifecycle)
          || canonicalSha256(source.selection) !== canonicalSha256(workspace.source)
          || source.expectedCommitOid !== workspace.expectedCommitOid)) {
      throw fail("workspace-source-authority-stale");
    }
    if (row.lifecycle === "ready") {
      this.#readyReceiptAuthorityFromRow(workspace, row.revision, {
        workspace_request_id: row.ready_workspace_request_id,
        workspace_idempotency_key: row.ready_workspace_idempotency_key,
        workspace_receipt: row.ready_workspace_receipt,
        workspace_receipt_sha256: row.ready_workspace_receipt_sha256,
        operation_id: row.ready_operation_id,
        operation_request_id: row.ready_operation_request_id,
        operation_task_id: row.ready_operation_task_id,
        operation_workspace_receipt_sha256: row.ready_operation_workspace_receipt_sha256,
        operation_receipt: row.ready_operation_receipt,
        operation_receipt_sha256: row.ready_operation_receipt_sha256,
        operation_recorded_at: row.ready_operation_recorded_at,
      });
    }
    return workspace;
  }

  async #lockWorkspaceAuthority(client, context, workspaceId) {
    const selector = (await client.query(`SELECT source_id FROM ${this.sqlSchema}.workspaces
      WHERE principal_id=$1 AND project_id=$2 AND workspace_id=$3`,
    [context.principalId, context.projectId, workspaceId])).rows[0];
    if (!selector) throw fail("workspace-selection-denied");
    // Source is always locked before workspace, matching beginMaterialization and retry reconciliation.
    const sourceRow = (await client.query(`SELECT * FROM ${this.sqlSchema}.sources
      WHERE principal_id=$1 AND project_id=$2 AND source_id=$3 FOR UPDATE`,
    [context.principalId, context.projectId, selector.source_id])).rows[0];
    if (!sourceRow) throw fail("workspace-source-selection-denied");
    const row = (await client.query(`SELECT * FROM ${this.sqlSchema}.workspaces
      WHERE principal_id=$1 AND project_id=$2 AND workspace_id=$3 FOR UPDATE`,
    [context.principalId, context.projectId, workspaceId])).rows[0];
    if (!row || row.source_id !== selector.source_id) throw fail("workspace-authority-integrity-failed");
    return { row, sourceRow };
  }

  receiptFor(record, rawReceipt, expectedOutcome) {
    const receipt = materializationReceiptSchema.parse(rawReceipt);
    if (receipt.outcome !== expectedOutcome || receipt.requestId !== record.request.requestId
        || receipt.sourceId !== record.source.sourceId || receipt.workspaceId !== record.workspaceId
        || receipt.taskId !== record.binding.taskId || receipt.bindingDigest !== record.request.bindingDigest
        || receipt.capabilitySetVersion !== record.binding.capabilitySetVersion
        || receipt.capabilitySetDigest !== record.binding.capabilitySetDigest
        || receipt.limitsProfileId !== record.request.limitsProfileId
        || receipt.limitsProfileDigest !== record.request.limitsProfileDigest
        || (expectedOutcome === "ready" && (receipt.stagingManifestDigest !== record.stagingManifestDigest
          || receipt.finalManifestDigest !== record.finalManifestDigest
          || receipt.nativeVersion !== record.workspaceManifest?.nativeVersion))
        || receipt.sourceKind !== record.source.sourceKind) throw fail("workspace-receipt-binding-mismatch");
    return receipt;
  }

  operationReceiptFor(record, rawReceipt, workspaceReceipt, workspaceRevision) {
    const receipt = externalOperationTerminalReceiptSchema.parse(rawReceipt);
    const workspaceReceiptSha256 = canonicalSha256(workspaceReceipt);
    if (receipt.operationId !== record.binding.taskId
        || receipt.requestId !== record.request.requestId
        || receipt.sourceId !== record.source.sourceId
        || receipt.sourceRevision !== record.source.revision
        || receipt.sourceRevision !== record.binding.sourceRevision
        || receipt.sourceKind !== record.source.sourceKind
        || receipt.workspaceId !== record.workspaceId
        || receipt.workspaceRevision !== workspaceRevision
        || receipt.taskId !== record.binding.taskId
        || receipt.idempotencyKey !== record.request.idempotencyKey
        || receipt.bindingDigest !== record.request.bindingDigest
        || receipt.capabilitySetVersion !== record.binding.capabilitySetVersion
        || receipt.capabilitySetDigest !== record.binding.capabilitySetDigest
        || receipt.workspaceReceiptSha256 !== workspaceReceiptSha256
        || receipt.finalManifestDigest !== record.finalManifestDigest
        || receipt.nativeVersion !== record.workspaceManifest?.nativeVersion
        || Date.parse(receipt.recordedAt) < Date.parse(workspaceReceipt.finishedAt)) {
      throw fail("workspace-operation-receipt-binding-mismatch");
    }
    return receipt;
  }

  async #readyReceiptAuthority(client, context, record, workspaceRevision) {
    const row = (await client.query(`SELECT
        workspace_receipt.request_id AS workspace_request_id,
        workspace_receipt.idempotency_key AS workspace_idempotency_key,
        workspace_receipt.receipt AS workspace_receipt,
        workspace_receipt.receipt_sha256 AS workspace_receipt_sha256,
        operation_receipt.operation_id,
        operation_receipt.request_id AS operation_request_id,
        operation_receipt.task_id AS operation_task_id,
        operation_receipt.workspace_receipt_sha256 AS operation_workspace_receipt_sha256,
        operation_receipt.receipt AS operation_receipt,
        operation_receipt.receipt_sha256 AS operation_receipt_sha256,
        operation_receipt.recorded_at AS operation_recorded_at
      FROM ${this.sqlSchema}.workspace_receipts AS workspace_receipt
      JOIN ${this.sqlSchema}.operation_receipts AS operation_receipt
        ON operation_receipt.workspace_id=workspace_receipt.workspace_id
        AND operation_receipt.workspace_revision=workspace_receipt.workspace_revision
        AND operation_receipt.principal_id=workspace_receipt.principal_id
        AND operation_receipt.project_id=workspace_receipt.project_id
      WHERE workspace_receipt.principal_id=$1 AND workspace_receipt.project_id=$2
        AND workspace_receipt.workspace_id=$3 AND workspace_receipt.workspace_revision=$4`,
    [context.principalId, context.projectId, record.workspaceId, workspaceRevision])).rows[0];
    return this.#readyReceiptAuthorityFromRow(record, workspaceRevision, row);
  }

  #readyReceiptAuthorityFromRow(record, workspaceRevision, row) {
    if (!row || row.workspace_receipt == null || row.operation_receipt == null) {
      throw fail("workspace-ready-receipt-authority-missing");
    }
    const workspaceReceipt = this.receiptFor(record, row.workspace_receipt, "ready");
    const workspaceReceiptSha256 = canonicalSha256(workspaceReceipt);
    if (row.workspace_request_id !== record.request.requestId
        || row.workspace_idempotency_key !== record.request.idempotencyKey
        || row.workspace_receipt_sha256 !== workspaceReceiptSha256) {
      throw fail("workspace-receipt-integrity-failed");
    }
    const operationReceipt = this.operationReceiptFor(record, row.operation_receipt,
      workspaceReceipt, workspaceRevision);
    const operationReceiptSha256 = canonicalSha256(operationReceipt);
    if (row.operation_id !== operationReceipt.operationId
        || row.operation_request_id !== record.request.requestId
        || row.operation_task_id !== record.binding.taskId
        || row.operation_workspace_receipt_sha256 !== workspaceReceiptSha256
        || row.operation_receipt_sha256 !== operationReceiptSha256
        || iso(row.operation_recorded_at) !== operationReceipt.recordedAt
        || (record.terminalOperationReceiptSha256 != null
          && record.terminalOperationReceiptSha256 !== operationReceiptSha256)) {
      throw fail("workspace-operation-receipt-integrity-failed");
    }
    return Object.freeze({ workspaceReceipt: immutable(structuredClone(workspaceReceipt)),
      workspaceReceiptSha256, operationReceipt: immutable(structuredClone(operationReceipt)),
      operationReceiptSha256 });
  }

  async #legacyReadyReceiptAuthority(client, context, row, prior, publication, binding) {
    const revisions = (await client.query(`SELECT workspace_revision
      FROM ${this.sqlSchema}.operation_receipts
      WHERE principal_id=$1 AND project_id=$2 AND workspace_id=$3
      ORDER BY workspace_revision DESC`,
    [context.principalId, context.projectId, row.workspace_id])).rows;
    const record = { ...prior, workspaceId: row.workspace_id, source: publication.source,
      binding, request: publication.request, workspaceManifest: publication.manifest,
      finalManifestDigest: publication.manifestDigest };
    for (const candidate of revisions) {
      try {
        const authority = await this.#readyReceiptAuthority(client, context, record, candidate.workspace_revision);
        return { workspaceRevision: candidate.workspace_revision,
          operationReceiptSha256: authority.operationReceiptSha256 };
      } catch {
        // A malformed or partially retained candidate is not readiness authority.
      }
    }
    return null;
  }

  async #transition(contextValue, inputValue, { inputSchema = transitionIdentitySchema,
    predecessors, successor, cleanupState, eventType, fieldsFor = () => ({}), receiptOutcome = null,
    workspaceManifest = false, requireBoundActiveSource = false, requirePublicationManifest = false,
    externalOperationReceipt = false }) {
    const identity = transitionIdentityFor(inputValue);
    return this.scoped(contextValue, async (client, context) => {
      const { row, sourceRow } = await this.#lockWorkspaceAuthority(client, context, identity.workspaceId);
      const current = this.workspaceRecord(context, row);
      const authoritativeSource = this.sourceRecord(context, sourceRow);
      if (identity.idempotencyKey !== row.idempotency_key || identity.bindingDigest !== row.binding_digest
          || identity.capabilitySetDigest !== row.capability_digest) throw fail("workspace-transition-binding-mismatch");
      // Reject a disallowed lifecycle/revision before inspecting operation-specific evidence. This keeps
      // unknown closed to ordinary materialization and avoids turning receipt/manifest validation into
      // an oracle over retained publication digests. An exact successor revision is admitted only far
      // enough to verify an idempotent replay against the stored transition digest below.
      const replayCandidate = row.lifecycle === successor && row.revision === identity.expectedRevision + 1;
      if (!replayCandidate
          && (row.revision !== identity.expectedRevision || !predecessors.includes(row.lifecycle))) {
        throw fail("workspace-transition-conflict");
      }
      if (requireBoundActiveSource
          && (sourceRow.revision !== row.source_revision || !activeSourceLifecycles.includes(sourceRow.lifecycle)
            || canonicalSha256(authoritativeSource.selection) !== canonicalSha256(current.source)
            || authoritativeSource.expectedCommitOid !== current.expectedCommitOid)) {
        throw fail("workspace-source-authority-stale");
      }
      // Parse receipts, manifests and reconciliation evidence only after exact row, identity, revision,
      // lifecycle and current source authority have been admitted. A rejection above performs no write.
      const admitted = inputSchema.parse(inputValue);
      const fields = fieldsFor(admitted);
      let manifest = null;
      if (workspaceManifest) {
        try { manifest = admitWorkspaceManifest(admitted.workspaceManifestRaw, current.binding); }
        catch { throw fail("workspace-manifest-invalid"); }
        const manifestDigest = canonicalSha256(manifest);
        if (manifest.lifecycle !== "ready" || manifest.workspaceId !== current.workspaceId
            || manifest.sourceId !== current.source.sourceId || manifest.sourceKind !== current.source.sourceKind
            || manifest.bindingDigest !== current.request.bindingDigest
            || manifest.capabilitySetVersion !== current.binding.capabilitySetVersion
            || manifest.capabilitySetDigest !== current.binding.capabilitySetDigest
            || manifest.limitsProfileId !== current.request.limitsProfileId
            || manifest.limitsProfileDigest !== current.request.limitsProfileDigest
            || manifest.createdAt !== current.request.createdAt || !manifest.complete || manifest.rejectedCount !== 0
            || manifest.nativeVersion !== current.expectedCommitOid) throw fail("workspace-manifest-binding-mismatch");
        if (requirePublicationManifest
            && (current.stagingManifestDigest === null || current.finalManifestDigest !== manifestDigest)) {
          throw fail("workspace-manifest-publication-mismatch");
        }
      }
      let transitionFields = manifest ? { ...fields, workspaceManifest: manifest } : fields;
      const receiptRecord = manifest ? { ...current, workspaceManifest: manifest } : current;
      const receipt = receiptOutcome === null ? null : this.receiptFor(receiptRecord, admitted.receipt, receiptOutcome);
      let operationReceipt = null;
      if (externalOperationReceipt) {
        operationReceipt = this.operationReceiptFor(receiptRecord, admitted.operationReceipt,
          receipt, identity.expectedRevision + 1);
        transitionFields = { ...transitionFields,
          terminalOperationReceiptSha256: canonicalSha256(operationReceipt) };
      }
      const transitionProjection = { schemaVersion: "runa-workspace-postgres-transition/v1",
        workspaceId: current.workspaceId, expectedRevision: identity.expectedRevision,
        idempotencyKey: identity.idempotencyKey, bindingDigest: identity.bindingDigest,
        capabilitySetDigest: identity.capabilitySetDigest, allowedPredecessors: predecessors,
        successor, cleanupState, fields: transitionFields, receiptSha256: receipt ? canonicalSha256(receipt) : null,
        operationReceiptSha256: operationReceipt ? canonicalSha256(operationReceipt) : null };
      const transitionDigest = canonicalSha256(transitionProjection);
      if (replayCandidate) {
        if (row.last_transition_digest === transitionDigest) {
          if (operationReceipt) {
            const retained = await this.#readyReceiptAuthority(client, context, current, row.revision);
            if (retained.workspaceReceiptSha256 !== canonicalSha256(receipt)
                || retained.operationReceiptSha256 !== canonicalSha256(operationReceipt)) {
              throw fail("workspace-operation-receipt-integrity-failed");
            }
            return { changed: false, ...current, receipt: retained.workspaceReceipt,
              operationReceipt: retained.operationReceipt };
          }
          return { changed: false, ...current, receipt: receipt ? immutable(structuredClone(receipt)) : null };
        }
        throw fail("workspace-transition-conflict");
      }
      const updatedAt = iso(this.now()), revision = row.revision + 1;
      const value = { ...current, ...transitionFields, lifecycle: successor, cleanupState, revision, updatedAt };
      const payload = this.encode("workspace", context, row.workspace_id, value);
      const changed = await client.query(`UPDATE ${this.sqlSchema}.workspaces
        SET lifecycle=$6,cleanup_state=$7,revision=$8,last_transition_digest=$9,
          payload=$10::jsonb,payload_sha256=$11,updated_at=$12
          ,manifest_digest=$16,operation_receipt_sha256=$17
        WHERE principal_id=$1 AND project_id=$2 AND workspace_id=$3 AND revision=$4
          AND lifecycle=$5 AND idempotency_key=$13 AND binding_digest=$14 AND capability_digest=$15`,
      [context.principalId, context.projectId, row.workspace_id, row.revision, row.lifecycle,
        successor, cleanupState, revision, transitionDigest, JSON.stringify(payload), canonicalSha256(payload), updatedAt,
        identity.idempotencyKey, identity.bindingDigest, identity.capabilitySetDigest,
        manifest ? canonicalSha256(manifest) : row.manifest_digest,
        operationReceipt ? canonicalSha256(operationReceipt) : row.operation_receipt_sha256]);
      if (changed.rowCount !== 1) throw fail("workspace-transition-conflict");
      let receiptProjection = null, eventDigest = transitionDigest;
      if (receipt) {
        const receiptSha256 = canonicalSha256(receipt);
        await client.query(`INSERT INTO ${this.sqlSchema}.workspace_receipts
          (principal_id,project_id,workspace_id,workspace_revision,request_id,idempotency_key,receipt,receipt_sha256,recorded_at)
          VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
        [context.principalId, context.projectId, row.workspace_id, revision, row.request_id,
          row.idempotency_key, JSON.stringify(receipt), receiptSha256, updatedAt]);
        receiptProjection = immutable(structuredClone(receipt));
        eventDigest = receiptSha256;
      }
      let operationReceiptProjection = null;
      if (operationReceipt) {
        const operationReceiptSha256 = canonicalSha256(operationReceipt);
        await client.query(`INSERT INTO ${this.sqlSchema}.operation_receipts
          (principal_id,project_id,workspace_id,workspace_revision,operation_id,request_id,task_id,
            workspace_receipt_sha256,receipt,receipt_sha256,recorded_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
        [context.principalId, context.projectId, row.workspace_id, revision, operationReceipt.operationId,
          row.request_id, operationReceipt.taskId, canonicalSha256(receipt), JSON.stringify(operationReceipt),
          operationReceiptSha256, operationReceipt.recordedAt]);
        operationReceiptProjection = immutable(structuredClone(operationReceipt));
        eventDigest = operationReceiptSha256;
      }
      await client.query(`INSERT INTO ${this.sqlSchema}.outbox
        (principal_id,project_id,event_type,record_id,payload_sha256) VALUES($1,$2,$3,$4,$5)`,
      [context.principalId, context.projectId, eventType, row.workspace_id, eventDigest]);
      return { changed: true, ...value, receipt: receiptProjection,
        operationReceipt: operationReceiptProjection };
    });
  }

  async recordStaging(context, input) {
    return this.#transition(context, input, {
      predecessors: ["intent-recorded"], successor: "staging", cleanupState: "not-required",
      eventType: "workspace-staging", requireBoundActiveSource: true,
    });
  }

  async recordPublishedPendingDb(context, inputValue) {
    return this.#transition(context, inputValue, {
      predecessors: ["staging"], successor: "published-pending-db", cleanupState: "not-required",
      eventType: "workspace-published-pending-db", inputSchema: publishedTransitionSchema,
      fieldsFor: input => ({ stagingManifestDigest: input.stagingManifestDigest,
        finalManifestDigest: input.finalManifestDigest }), requireBoundActiveSource: true,
    });
  }

  async recordReady(context, input) {
    return this.#transition(context, input, {
      predecessors: ["published-pending-db"], successor: "ready", cleanupState: "complete",
      eventType: "workspace-ready", inputSchema: readyTransitionSchema, receiptOutcome: "ready",
      workspaceManifest: true, requireBoundActiveSource: true, requirePublicationManifest: true,
      externalOperationReceipt: true,
    });
  }

  async recordCancelled(context, input) {
    return this.#transition(context, input, {
      predecessors: ["intent-recorded", "staging"], successor: "cancelled", cleanupState: "complete",
      eventType: "workspace-cancelled", inputSchema: terminalTransitionSchema, receiptOutcome: "cancelled",
    });
  }

  async recordFailed(context, input) {
    return this.#transition(context, input, {
      predecessors: ["intent-recorded", "staging"], successor: "failed", cleanupState: "complete",
      eventType: "workspace-failed", inputSchema: terminalTransitionSchema, receiptOutcome: "failed",
    });
  }

  async recordTimedOut(context, input) {
    return this.#transition(context, input, {
      predecessors: ["staging"], successor: "failed", cleanupState: "complete",
      eventType: "workspace-timed-out", inputSchema: terminalTransitionSchema, receiptOutcome: "timed-out",
    });
  }

  async recordUnknown(context, input) {
    return this.#transition(context, input, {
      predecessors: ["intent-recorded", "staging", "published-pending-db", "ready"],
      successor: "unknown", cleanupState: "indeterminate", eventType: "workspace-unknown",
      inputSchema: terminalTransitionSchema, receiptOutcome: "unknown",
    });
  }

  async reconcileUnknownReady(context, inputValue) {
    return this.#transition(context, inputValue, {
      predecessors: ["unknown"], successor: "ready", cleanupState: "complete",
      eventType: "workspace-reconciled-ready", inputSchema: readyTransitionSchema, receiptOutcome: "ready",
      workspaceManifest: true, requireBoundActiveSource: true, requirePublicationManifest: true,
      externalOperationReceipt: true,
    });
  }

  async recordExpired(context, inputValue) {
    return this.#transition(context, inputValue, {
      predecessors: ["ready"], successor: "expired", cleanupState: "pending",
      eventType: "workspace-expired", inputSchema: reconciliationTransitionSchema,
      fieldsFor: input => ({ reconciliationEvidenceDigest: input.evidenceDigest }),
    });
  }

  async recordCleanupPending(context, inputValue) {
    return this.#transition(context, inputValue, {
      predecessors: ["cancelled", "failed", "expired", "unknown"], successor: "cleanup-pending",
      cleanupState: "pending", eventType: "workspace-cleanup-pending",
      inputSchema: cleanupPendingTransitionSchema,
      fieldsFor: input => ({ reconciliationEvidenceDigest: input.evidenceDigest }), receiptOutcome: "cleanup-pending",
    });
  }

  async recordRemoved(context, inputValue) {
    return this.#transition(context, inputValue, {
      predecessors: ["cancelled", "failed", "expired", "cleanup-pending"], successor: "removed",
      cleanupState: "complete", eventType: "workspace-removed", inputSchema: reconciliationTransitionSchema,
      fieldsFor: input => ({ reconciliationEvidenceDigest: input.evidenceDigest }),
    });
  }

  async reconcileUnknownRemoved(context, inputValue) {
    return this.#transition(context, inputValue, {
      predecessors: ["unknown"], successor: "removed", cleanupState: "complete",
      eventType: "workspace-reconciled-removed", inputSchema: reconciliationTransitionSchema,
      fieldsFor: input => ({ reconciliationEvidenceDigest: input.evidenceDigest }),
    });
  }

  async authorizeMaterializationRetry(contextValue, inputValue) {
    const identity = transitionIdentityFor(inputValue);
    return this.scoped(contextValue, async (client, context) => {
      const { row, sourceRow } = await this.#lockWorkspaceAuthority(client, context, identity.workspaceId);
      const workspace = this.workspaceRecord(context, row);
      const source = this.sourceRecord(context, sourceRow);
      if (identity.idempotencyKey !== row.idempotency_key || identity.bindingDigest !== row.binding_digest
          || identity.capabilitySetDigest !== row.capability_digest) throw fail("workspace-transition-binding-mismatch");
      const replayCandidate = row.lifecycle === "removed" && row.revision === identity.expectedRevision + 1
        && sourceRow.revision === row.source_revision + 1;
      if (!replayCandidate && (row.lifecycle !== "removed" || row.revision !== identity.expectedRevision
          || sourceRow.revision !== row.source_revision
          || !activeSourceLifecycles.includes(sourceRow.lifecycle))) {
        throw fail("workspace-retry-reconciliation-required");
      }
      const input = reconciliationTransitionSchema.parse(inputValue);
      const transitionDigest = canonicalSha256({ schemaVersion: "runa-workspace-retry-reconciliation/v1",
        workspaceId: row.workspace_id, expectedRevision: input.expectedRevision,
        idempotencyKey: input.idempotencyKey, bindingDigest: input.bindingDigest,
        capabilitySetDigest: input.capabilitySetDigest, evidenceDigest: input.evidenceDigest });
      if (replayCandidate) {
        if (row.last_transition_digest === transitionDigest) {
          return { changed: false, workspace, source: source.selection };
        }
        throw fail("workspace-retry-reconciliation-required");
      }
      const updatedAt = iso(this.now()), sourceRevision = sourceRow.revision + 1;
      const selection = sourceSelectionSchema.parse({ ...source.selection, revision: sourceRevision, updatedAt });
      const sourcePayload = this.encode("source", context, sourceRow.source_id,
        { selection, expectedCommitOid: source.expectedCommitOid });
      const sourceChanged = await client.query(`UPDATE ${this.sqlSchema}.sources
        SET revision=$4,payload=$5::jsonb,payload_sha256=$6,updated_at=$7,last_transition_digest=$8
        WHERE principal_id=$1 AND project_id=$2 AND source_id=$3 AND revision=$9`,
      [context.principalId, context.projectId, sourceRow.source_id, sourceRevision,
        JSON.stringify(sourcePayload), canonicalSha256(sourcePayload), updatedAt, transitionDigest, sourceRow.revision]);
      if (sourceChanged.rowCount !== 1) throw fail("workspace-source-transition-conflict");
      const workspaceValue = { ...workspace, revision: row.revision + 1,
        retrySourceRevision: sourceRevision, retryReconciliationEvidenceDigest: input.evidenceDigest, updatedAt };
      const workspacePayload = this.encode("workspace", context, row.workspace_id, workspaceValue);
      const workspaceChanged = await client.query(`UPDATE ${this.sqlSchema}.workspaces
        SET revision=$4,payload=$5::jsonb,payload_sha256=$6,updated_at=$7,last_transition_digest=$8
        WHERE principal_id=$1 AND project_id=$2 AND workspace_id=$3 AND revision=$9 AND lifecycle='removed'`,
      [context.principalId, context.projectId, row.workspace_id, row.revision + 1,
        JSON.stringify(workspacePayload), canonicalSha256(workspacePayload), updatedAt, transitionDigest, row.revision]);
      if (workspaceChanged.rowCount !== 1) throw fail("workspace-transition-conflict");
      await client.query(`INSERT INTO ${this.sqlSchema}.outbox
        (principal_id,project_id,event_type,record_id,payload_sha256)
        VALUES($1,$2,'workspace-retry-reconciled',$3,$4)`,
      [context.principalId, context.projectId, row.workspace_id, transitionDigest]);
      return { changed: true, workspace: workspaceValue, source: selection };
    });
  }

  async getReceipts(contextValue, rawWorkspaceId) {
    const context = contextSchema.parse(contextValue), workspaceId = workspaceIdSchema.parse(rawWorkspaceId);
    const rows = (await this.pool.query(`SELECT receipt,receipt_sha256 FROM ${this.sqlSchema}.workspace_receipts
      WHERE principal_id=$1 AND project_id=$2 AND workspace_id=$3 ORDER BY workspace_revision`,
    [context.principalId, context.projectId, workspaceId])).rows;
    if (rows.length === 0) {
      const workspace = await this.pool.query(`SELECT 1 FROM ${this.sqlSchema}.workspaces
        WHERE principal_id=$1 AND project_id=$2 AND workspace_id=$3`,
      [context.principalId, context.projectId, workspaceId]);
      if (workspace.rowCount === 0) throw fail("workspace-selection-denied");
    }
    return immutable(rows.map(row => {
      const receipt = materializationReceiptSchema.parse(row.receipt);
      if (canonicalSha256(receipt) !== row.receipt_sha256) throw fail("workspace-receipt-integrity-failed");
      return immutable(structuredClone(receipt));
    }));
  }

  async getOperationReceipts(contextValue, rawWorkspaceId) {
    const context = contextSchema.parse(contextValue), workspaceId = workspaceIdSchema.parse(rawWorkspaceId);
    const workspace = await this.getWorkspace(context, workspaceId);
    const revisions = (await this.pool.query(`SELECT workspace_revision
      FROM ${this.sqlSchema}.operation_receipts
      WHERE principal_id=$1 AND project_id=$2 AND workspace_id=$3 ORDER BY workspace_revision`,
    [context.principalId, context.projectId, workspaceId])).rows;
    const receipts = [];
    for (const row of revisions) {
      const authority = await this.#readyReceiptAuthority(this.pool, context, workspace, row.workspace_revision);
      receipts.push(authority.operationReceipt);
    }
    return immutable(receipts);
  }
}
