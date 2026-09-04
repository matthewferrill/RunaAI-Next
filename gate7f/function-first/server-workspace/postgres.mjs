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
  canonicalStringify,
  fileSetDigest,
  materializationAdmissionResultSchema,
  materializationEffectClaimSchema,
  materializationOperationLookupInputSchema,
  materializationReceiptSchema,
  materializationRequestSchema,
  publicGitOperationAuthoritySchema,
  sourceSelectionSchema,
  workspaceManifestSchema,
} from "./materialization-contracts.mjs";
import { durablePublicationAuthoritySchema, publicationAuthorityManifestSchema } from "./publication-primitive.mjs";

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
const candidateBeginInputSchema = z.object({ sourceId: sourceIdSchema, requestScopeDigest: digestSchema,
  operationAuthority: publicGitOperationAuthoritySchema }).strict();
const effectClaimInputSchema = z.object({ operationId: authorityIdSchema, authorityDigest: digestSchema,
  effect: z.enum(["git-fetch", "publication"]),
  expectedWorkspaceRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) }).strict();
const publicationResourcesSchema = z.object({ parentResourceId: authorityIdSchema,
  ingressRootResourceId: authorityIdSchema, stagingRootResourceId: authorityIdSchema }).strict();
const publicationAuthorityEnvelopeSchema = z.object({
  schemaVersion: z.literal("runa-workspace-publication-authority-envelope/v1"),
  authorityManifest: publicationAuthorityManifestSchema,
  publicationResources: publicationResourcesSchema,
}).strict();
const candidateStagingInputSchema = transitionIdentitySchema.extend({
  operationAuthorityDigest: digestSchema,
  fetchClaim: materializationEffectClaimSchema,
  workspaceManifest: workspaceManifestSchema,
  publicationAuthorityManifest: publicationAuthorityManifestSchema,
  publicationResources: publicationResourcesSchema,
}).strict();
const candidatePublishedInputSchema = publishedTransitionSchema.extend({
  operationAuthorityDigest: digestSchema,
  publicationClaim: materializationEffectClaimSchema,
  publicationObservation: z.object({ schemaVersion: z.literal("runa-workspace-publication-proposal/v1"),
    classification: z.literal("published-verified"), proposedAction: z.literal("record-published-pending-db"),
    reason: z.string().min(1).max(256), databaseMutationPerformed: z.literal(false),
    receiptAuthored: z.literal(false), filesystemMutationAttempted: z.literal(true),
    filesystemMutationConfirmed: z.literal(true), deletionAuthorized: z.literal(false),
    observedFinalIdentity: z.object({ volumeSerial: z.string().regex(/^[a-f0-9]{8}$/u),
      fileId: z.string().regex(/^[a-f0-9]{16}$/u) }).strict(),
    observedFinalDigest: digestSchema,
    databaseTransitionProposal: z.object({ from: z.literal("staging"),
      to: z.literal("published-pending-db"), expectedRevision: z.number().int().min(1) }).strict(),
  }).strict(),
}).strict();
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
const candidateReadyTransitionSchema = readyTransitionSchema.extend({ operationAuthorityDigest: digestSchema }).strict();
const candidateTerminalTransitionSchema = terminalTransitionSchema.extend({ operationAuthorityDigest: digestSchema }).strict();

export function assertCandidateDeterminatePublicationState(workspaceLifecycle, publicationState) {
  if (workspaceLifecycle === "staging" && publicationState !== "staging-authorized") {
    throw fail("workspace-publication-state-requires-unknown");
  }
  return true;
}
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
const requestScopeDigestFor = (context, source) => {
  const scope = authorityIds(context, source.selection.environmentId);
  return canonicalSha256({ schemaVersion: "runa-workspace-materialization-request-scope/v1",
    participantId: scope.participantId, projectId: scope.projectId, sourceId: source.selection.sourceId,
    sourceRevision: source.selection.revision, operationMode: "public-git",
    capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
    limitsProfileId: MATERIALIZATION_POLICY_ID, limitsProfileDigest: MATERIALIZATION_POLICY_DIGEST });
};
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
const immutableEqual = (left, right) => canonicalStringify(left) === canonicalStringify(right);
const sameClaimIdentity = (left, right) => left?.schemaVersion === right?.schemaVersion
  && left?.operationId === right?.operationId && left?.effect === right?.effect
  && left?.claimId === right?.claimId && left?.claimRevision === right?.claimRevision
  && left?.claimDigest === right?.claimDigest && left?.claimedAt === right?.claimedAt;
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
    schema = "runa_m1_server_workspaces", now = Date.now, verifyWatchdogAuthority = null }) {
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
    if (verifyWatchdogAuthority !== null && (typeof verifyWatchdogAuthority !== "function"
        || !Object.isFrozen(verifyWatchdogAuthority)
        || verifyWatchdogAuthority.constructor?.name === "AsyncFunction")) {
      throw fail("workspace-watchdog-authority-verifier-invalid");
    }
    this.verifyWatchdogAuthority = verifyWatchdogAuthority;
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
      await client.query(`CREATE TABLE IF NOT EXISTS ${s}.operation_authorities (
        operation_id text PRIMARY KEY, workspace_id text NOT NULL UNIQUE REFERENCES ${s}.workspaces(workspace_id),
        principal_id text NOT NULL, project_id text NOT NULL, source_id text NOT NULL,
        task_id text NOT NULL, request_scope_digest text NOT NULL, requested_at timestamptz NOT NULL,
        deadline_at timestamptz NOT NULL, authority_digest text NOT NULL UNIQUE,
        worker_release_sha256 text NOT NULL, topology_digest text NOT NULL,
        capability_set_version text NOT NULL, capability_set_digest text NOT NULL,
        signing_key_id text NOT NULL, signing_key_version integer NOT NULL CHECK (signing_key_version > 0),
        watchdog_identity_sha256 text NOT NULL, signature_base64 text NOT NULL,
        authority_envelope jsonb NOT NULL, authority_envelope_sha256 text NOT NULL,
        attestation_sha256 text NOT NULL, created_at timestamptz NOT NULL,
        UNIQUE(principal_id,project_id,source_id,request_scope_digest),
        CHECK (operation_id=task_id),
        CHECK (deadline_at=requested_at + interval '120 seconds'),
        CHECK (length(request_scope_digest)=64 AND length(authority_digest)=64
          AND length(worker_release_sha256)=64 AND length(topology_digest)=64
          AND length(capability_set_digest)=64 AND length(watchdog_identity_sha256)=64
          AND length(authority_envelope_sha256)=64 AND length(attestation_sha256)=64));
      CREATE INDEX IF NOT EXISTS operation_authorities_scope ON ${s}.operation_authorities
        (principal_id,project_id,source_id,request_scope_digest);
      CREATE OR REPLACE FUNCTION ${s}.reject_operation_authority_mutation() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'operation authorities are immutable'; END $$;
      DROP TRIGGER IF EXISTS operation_authorities_immutable ON ${s}.operation_authorities;
      CREATE TRIGGER operation_authorities_immutable BEFORE UPDATE OR DELETE ON ${s}.operation_authorities
        FOR EACH ROW EXECUTE FUNCTION ${s}.reject_operation_authority_mutation();
      CREATE TABLE IF NOT EXISTS ${s}.workspace_effect_claims (
        operation_id text NOT NULL REFERENCES ${s}.operation_authorities(operation_id),
        effect text NOT NULL CHECK (effect IN ('git-fetch','publication')),
        claim_id text NOT NULL UNIQUE, claim_revision integer NOT NULL CHECK (claim_revision=1),
        state text NOT NULL CHECK (state IN ('claimed','observed','failed-unknown')),
        claim_digest text NOT NULL, claimed_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
        PRIMARY KEY(operation_id,effect), CHECK (length(claim_digest)=64));
      CREATE OR REPLACE FUNCTION ${s}.enforce_workspace_effect_claim_identity() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
          IF NEW.operation_id<>OLD.operation_id OR NEW.effect<>OLD.effect OR NEW.claim_id<>OLD.claim_id
            OR NEW.claim_revision<>OLD.claim_revision OR NEW.claim_digest<>OLD.claim_digest
            OR NEW.claimed_at<>OLD.claimed_at THEN RAISE EXCEPTION 'workspace effect claim identity is immutable'; END IF;
          IF NEW.state<>OLD.state AND NOT (OLD.state='claimed' AND NEW.state IN ('observed','failed-unknown'))
            THEN RAISE EXCEPTION 'workspace effect claim transition is invalid'; END IF;
          IF NEW.state=OLD.state OR NEW.updated_at<OLD.updated_at
            THEN RAISE EXCEPTION 'workspace effect claim update is invalid'; END IF;
          RETURN NEW;
        END $$;
      DROP TRIGGER IF EXISTS workspace_effect_claim_identity ON ${s}.workspace_effect_claims;
      DROP TRIGGER IF EXISTS workspace_effect_claims_immutable ON ${s}.workspace_effect_claims;
      CREATE TRIGGER workspace_effect_claims_immutable BEFORE UPDATE ON ${s}.workspace_effect_claims
        FOR EACH ROW EXECUTE FUNCTION ${s}.enforce_workspace_effect_claim_identity();
      CREATE OR REPLACE FUNCTION ${s}.reject_workspace_effect_claim_delete() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'workspace effect claims cannot be deleted'; END $$;
      DROP TRIGGER IF EXISTS workspace_effect_claim_no_delete ON ${s}.workspace_effect_claims;
      CREATE TRIGGER workspace_effect_claim_no_delete BEFORE DELETE ON ${s}.workspace_effect_claims
        FOR EACH ROW EXECUTE FUNCTION ${s}.reject_workspace_effect_claim_delete();
      CREATE TABLE IF NOT EXISTS ${s}.workspace_publication_authorities (
        workspace_id text PRIMARY KEY REFERENCES ${s}.workspaces(workspace_id),
        operation_id text NOT NULL UNIQUE REFERENCES ${s}.operation_authorities(operation_id),
        principal_id text NOT NULL, project_id text NOT NULL,
        workspace_revision integer NOT NULL CHECK (workspace_revision > 0),
        operation_authority_digest text NOT NULL, request_digest text NOT NULL, binding_digest text NOT NULL,
        authority_manifest jsonb NOT NULL, authority_envelope_sha256 text NOT NULL, authority_manifest_digest text NOT NULL,
        parent_resource_id text NOT NULL, ingress_root_resource_id text NOT NULL, staging_root_resource_id text NOT NULL,
        parent_volume_serial text NOT NULL, parent_file_id text NOT NULL,
        staging_name text NOT NULL, staging_volume_serial text NOT NULL, staging_file_id text NOT NULL,
        final_name text NOT NULL, final_volume_serial text NOT NULL, final_file_id text NOT NULL,
        publication_claim_id text, publication_claim_revision integer,
        observed_final_identity jsonb, observed_final_digest text,
        state text NOT NULL CHECK (state IN ('staging-authorized','publication-claimed','published-observed','unknown')),
        state_revision integer NOT NULL CHECK (state_revision > 0), created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        CHECK (length(operation_authority_digest)=64 AND length(request_digest)=64
          AND length(binding_digest)=64 AND length(authority_manifest_digest)=64
          AND length(authority_envelope_sha256)=64));
      CREATE OR REPLACE FUNCTION ${s}.enforce_workspace_publication_authority_identity() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
          IF NEW.workspace_id<>OLD.workspace_id OR NEW.operation_id<>OLD.operation_id
            OR NEW.principal_id<>OLD.principal_id OR NEW.project_id<>OLD.project_id
            OR NEW.operation_authority_digest<>OLD.operation_authority_digest
            OR NEW.request_digest<>OLD.request_digest OR NEW.binding_digest<>OLD.binding_digest
            OR NEW.authority_manifest<>OLD.authority_manifest
            OR NEW.authority_envelope_sha256<>OLD.authority_envelope_sha256
            OR NEW.authority_manifest_digest<>OLD.authority_manifest_digest
            OR NEW.parent_resource_id<>OLD.parent_resource_id
            OR NEW.ingress_root_resource_id<>OLD.ingress_root_resource_id
            OR NEW.staging_root_resource_id<>OLD.staging_root_resource_id
            OR NEW.parent_volume_serial<>OLD.parent_volume_serial OR NEW.parent_file_id<>OLD.parent_file_id
            OR NEW.staging_name<>OLD.staging_name OR NEW.staging_volume_serial<>OLD.staging_volume_serial
            OR NEW.staging_file_id<>OLD.staging_file_id OR NEW.final_name<>OLD.final_name
            OR NEW.final_volume_serial<>OLD.final_volume_serial OR NEW.final_file_id<>OLD.final_file_id
            OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'workspace publication authority is immutable'; END IF;
          IF NEW.updated_at<OLD.updated_at THEN RAISE EXCEPTION 'workspace publication authority time regressed'; END IF;
          IF NEW.state=OLD.state THEN
            IF NOT (OLD.state IN ('published-observed','unknown')
              AND NEW.workspace_revision=OLD.workspace_revision+1
              AND NEW.state_revision=OLD.state_revision
              AND NEW.publication_claim_id IS NOT DISTINCT FROM OLD.publication_claim_id
              AND NEW.publication_claim_revision IS NOT DISTINCT FROM OLD.publication_claim_revision
              AND NEW.observed_final_identity IS NOT DISTINCT FROM OLD.observed_final_identity
              AND NEW.observed_final_digest IS NOT DISTINCT FROM OLD.observed_final_digest)
              THEN RAISE EXCEPTION 'workspace publication authority same-state update is invalid'; END IF;
          ELSIF OLD.state='staging-authorized' AND NEW.state='publication-claimed' THEN
            IF OLD.publication_claim_id IS NOT NULL OR NEW.publication_claim_id IS NULL
              OR NEW.publication_claim_revision<>1 OR NEW.workspace_revision<>OLD.workspace_revision
              OR NEW.state_revision<>OLD.state_revision+1 OR NEW.observed_final_identity IS NOT NULL
              OR NEW.observed_final_digest IS NOT NULL
              THEN RAISE EXCEPTION 'workspace publication claim transition is invalid'; END IF;
          ELSIF OLD.state='publication-claimed' AND NEW.state='published-observed' THEN
            IF NEW.publication_claim_id IS DISTINCT FROM OLD.publication_claim_id
              OR NEW.publication_claim_revision IS DISTINCT FROM OLD.publication_claim_revision
              OR NEW.workspace_revision<>OLD.workspace_revision+1 OR NEW.state_revision<>OLD.state_revision+1
              OR NEW.observed_final_identity IS NULL OR NEW.observed_final_digest IS NULL
              THEN RAISE EXCEPTION 'workspace publication observation transition is invalid'; END IF;
          ELSIF NEW.state='unknown' AND OLD.state IN ('staging-authorized','publication-claimed','published-observed') THEN
            IF NEW.workspace_revision<>OLD.workspace_revision+1 OR NEW.state_revision<>OLD.state_revision+1
              OR NEW.publication_claim_id IS DISTINCT FROM OLD.publication_claim_id
              OR NEW.publication_claim_revision IS DISTINCT FROM OLD.publication_claim_revision
              OR NEW.observed_final_identity IS DISTINCT FROM OLD.observed_final_identity
              OR NEW.observed_final_digest IS DISTINCT FROM OLD.observed_final_digest
              THEN RAISE EXCEPTION 'workspace publication unknown transition is invalid'; END IF;
          ELSIF OLD.state='unknown' AND NEW.state='published-observed' THEN
            IF NEW.workspace_revision<>OLD.workspace_revision+1 OR NEW.state_revision<>OLD.state_revision+1
              OR NEW.publication_claim_id IS NULL
              OR NEW.publication_claim_id IS DISTINCT FROM OLD.publication_claim_id
              OR NEW.publication_claim_revision IS DISTINCT FROM OLD.publication_claim_revision
              OR NEW.observed_final_identity IS NULL OR NEW.observed_final_digest IS NULL
              OR NEW.observed_final_identity IS DISTINCT FROM OLD.observed_final_identity
              OR NEW.observed_final_digest IS DISTINCT FROM OLD.observed_final_digest
              THEN RAISE EXCEPTION 'workspace publication reconciliation transition is invalid'; END IF;
          ELSE RAISE EXCEPTION 'workspace publication authority transition is invalid'; END IF;
          RETURN NEW;
        END $$;
      DROP TRIGGER IF EXISTS workspace_publication_authority_identity ON ${s}.workspace_publication_authorities;
      DROP TRIGGER IF EXISTS workspace_publication_authorities_immutable ON ${s}.workspace_publication_authorities;
      CREATE TRIGGER workspace_publication_authorities_immutable BEFORE UPDATE ON ${s}.workspace_publication_authorities
        FOR EACH ROW EXECUTE FUNCTION ${s}.enforce_workspace_publication_authority_identity();
      CREATE OR REPLACE FUNCTION ${s}.reject_workspace_publication_authority_delete() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'workspace publication authorities cannot be deleted'; END $$;
      DROP TRIGGER IF EXISTS workspace_publication_authority_no_delete ON ${s}.workspace_publication_authorities;
      CREATE TRIGGER workspace_publication_authority_no_delete BEFORE DELETE ON ${s}.workspace_publication_authorities
        FOR EACH ROW EXECUTE FUNCTION ${s}.reject_workspace_publication_authority_delete();
      CREATE TABLE IF NOT EXISTS ${s}.outbox (
        sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        principal_id text NOT NULL, project_id text NOT NULL, event_type text NOT NULL,
        record_id text NOT NULL, payload_sha256 text NOT NULL,
        recorded_at timestamptz NOT NULL DEFAULT now());`);
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
      const unauthorisedNonterminalRows = (await client.query(`SELECT workspace_row.*
        FROM ${s}.workspaces AS workspace_row
        LEFT JOIN ${s}.operation_authorities AS authority
          ON authority.workspace_id=workspace_row.workspace_id
        WHERE authority.workspace_id IS NULL
          AND workspace_row.lifecycle IN ('intent-recorded','staging','published-pending-db')
        FOR UPDATE OF workspace_row`)).rows;
      for (const row of unauthorisedNonterminalRows) {
        const migrationContext = { principalId: row.principal_id, projectId: row.project_id,
          sessionId: "operation-authority-migration" };
        const prior = this.decode("workspace", migrationContext, row.workspace_id, row);
        const transitionDigest = canonicalSha256({ schemaVersion: "runa-workspace-authority-migration/v1",
          workspaceId: row.workspace_id, predecessor: row.lifecycle, successor: "unknown",
          reason: "genuine-watchdog-authority-unavailable" });
        const value = { ...prior, lifecycle: "unknown", cleanupState: "indeterminate",
          revision: Number(row.revision ?? 1) + 1, updatedAt: iso(this.now()),
          operationAuthorityMigration: "genuine-watchdog-authority-unavailable" };
        const payload = this.encode("workspace", migrationContext, row.workspace_id, value);
        await client.query(`UPDATE ${s}.workspaces SET lifecycle='unknown',cleanup_state='indeterminate',
          revision=$2,last_transition_digest=$3,payload=$4::jsonb,payload_sha256=$5,updated_at=$6
          WHERE workspace_id=$1`, [row.workspace_id, value.revision, transitionDigest,
          JSON.stringify(payload), canonicalSha256(payload), value.updatedAt]);
        await client.query(`INSERT INTO ${s}.outbox
          (principal_id,project_id,event_type,record_id,payload_sha256)
          VALUES($1,$2,'workspace-operation-authority-migration-unknown',$3,$4)`,
        [row.principal_id, row.project_id, row.workspace_id, transitionDigest]);
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

  #candidateAuthorityFromRow(context, row) {
    if (!row || this.verifyWatchdogAuthority === null) throw fail("workspace-operation-authority-invalid");
    if ((row.authority_principal_id ?? row.principal_id) !== context.principalId
        || (row.authority_project_id ?? row.project_id) !== context.projectId) {
      throw fail("workspace-operation-authority-invalid");
    }
    if (canonicalSha256(row.authority_envelope) !== row.authority_envelope_sha256) {
      throw fail("workspace-operation-authority-invalid");
    }
    let decoded;
    try {
      decoded = this.cipher
        ? this.cipher.decrypt(envelopeContext("operation-authority", context, row.operation_id), row.authority_envelope)
        : row.authority_envelope;
    } catch { throw fail("workspace-operation-authority-invalid"); }
    let authority;
    try { authority = publicGitOperationAuthoritySchema.parse(decoded); }
    catch { throw fail("workspace-operation-authority-invalid"); }
    if (authority.operationId !== row.operation_id || authority.taskId !== row.task_id
        || authority.authorityDigest !== row.authority_digest
        || authority.requestedAt !== iso(row.requested_at) || authority.deadlineAt !== iso(row.deadline_at)
        || authority.workerReleaseSha256 !== row.worker_release_sha256
        || authority.topologyDigest !== row.topology_digest
        || authority.capabilitySetVersion !== row.capability_set_version
        || authority.capabilitySetDigest !== row.capability_set_digest
        || authority.attestation.signingKeyId !== row.signing_key_id
        || authority.attestation.signingKeyVersion !== row.signing_key_version
        || authority.attestation.watchdogIdentitySha256 !== row.watchdog_identity_sha256
        || authority.attestation.signatureBase64 !== row.signature_base64
        || canonicalSha256(authority.attestation) !== row.attestation_sha256
        || this.verifyWatchdogAuthority(authority) !== true) {
      throw fail("workspace-operation-authority-invalid");
    }
    return immutable(authority);
  }

  async admitMaterializationRequest(contextValue, inputValue) {
    const input = z.object({ sourceId: sourceIdSchema, operationMode: z.literal("public-git") }).strict().parse(inputValue);
    if (this.verifyWatchdogAuthority === null) throw fail("workspace-operation-authority-verifier-unavailable");
    return this.scoped(contextValue, async (client, context) => {
      const sourceRow = (await client.query(`SELECT * FROM ${this.sqlSchema}.sources
        WHERE principal_id=$1 AND project_id=$2 AND source_id=$3 FOR UPDATE`,
      [context.principalId, context.projectId, input.sourceId])).rows[0];
      if (!sourceRow) throw fail("workspace-source-selection-denied");
      if (!activeSourceLifecycles.includes(sourceRow.lifecycle)) throw fail("workspace-source-inactive");
      const source = this.sourceRecord(context, sourceRow);
      const requestScopeDigest = requestScopeDigestFor(context, source);
      const exactRow = (await client.query(`SELECT authority.*,workspace.lifecycle AS workspace_lifecycle
        FROM ${this.sqlSchema}.operation_authorities AS authority
        JOIN ${this.sqlSchema}.workspaces AS workspace ON workspace.workspace_id=authority.workspace_id
        WHERE authority.principal_id=$1 AND authority.project_id=$2 AND authority.source_id=$3
          AND authority.request_scope_digest=$4 FOR UPDATE OF authority,workspace`,
      [context.principalId, context.projectId, input.sourceId, requestScopeDigest])).rows[0];
      if (exactRow) {
        const authority = this.#candidateAuthorityFromRow(context, exactRow);
        return materializationAdmissionResultSchema.parse({ disposition: "existing", requestScopeDigest,
          operationId: authority.operationId, authorityDigest: authority.authorityDigest,
          attestation: authority.attestation });
      }
      const blockerRows = (await client.query(`SELECT authority.*,workspace.lifecycle AS workspace_lifecycle
        FROM ${this.sqlSchema}.workspaces AS workspace
        LEFT JOIN ${this.sqlSchema}.operation_authorities AS authority ON authority.workspace_id=workspace.workspace_id
        WHERE workspace.principal_id=$1 AND workspace.project_id=$2 AND workspace.source_id=$3
          AND workspace.lifecycle IN ('intent-recorded','staging','published-pending-db','unknown','cleanup-pending')
        ORDER BY workspace.created_at,workspace.workspace_id FOR UPDATE OF workspace`,
      [context.principalId, context.projectId, input.sourceId])).rows;
      if (blockerRows.length > 1) throw fail("workspace-operation-authority-unknown");
      if (blockerRows.length === 1) {
        const blocker = blockerRows[0];
        if (!blocker.operation_id || blocker.principal_id !== context.principalId
            || blocker.project_id !== context.projectId || blocker.source_id !== input.sourceId) {
          throw fail("workspace-operation-authority-unknown");
        }
        const authority = this.#candidateAuthorityFromRow(context, blocker);
        return materializationAdmissionResultSchema.parse({ disposition: "reconciliation-required",
          requestScopeDigest: blocker.request_scope_digest, operationId: authority.operationId,
          authorityDigest: authority.authorityDigest, attestation: authority.attestation });
      }
      return materializationAdmissionResultSchema.parse({ disposition: "absent", requestScopeDigest,
        sourceRevision: source.selection.revision });
    });
  }

  async beginMaterialization(contextValue, inputValue) {
    if (inputValue && Object.getPrototypeOf(inputValue) === Object.prototype
        && Object.keys(inputValue).join(",") === "sourceId") {
      if (this.verifyWatchdogAuthority !== null) throw fail("workspace-candidate-authority-required");
      return this.#beginLegacyMaterialization(contextValue, inputValue);
    }
    if (this.verifyWatchdogAuthority === null) throw fail("workspace-operation-authority-verifier-unavailable");
    return this.#beginCandidateMaterialization(contextValue, candidateBeginInputSchema.parse(inputValue));
  }

  async #beginLegacyMaterialization(contextValue, { sourceId: rawSourceId }) {
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

  async #beginCandidateMaterialization(contextValue, input) {
    return this.scoped(contextValue, async (client, context) => {
      const sourceRow = (await client.query(`SELECT * FROM ${this.sqlSchema}.sources
        WHERE principal_id=$1 AND project_id=$2 AND source_id=$3 FOR UPDATE`,
      [context.principalId, context.projectId, input.sourceId])).rows[0];
      if (!sourceRow) throw fail("workspace-source-selection-denied");
      if (!activeSourceLifecycles.includes(sourceRow.lifecycle)) throw fail("workspace-source-inactive");
      const sourceRecord = this.sourceRecord(context, sourceRow);
      const requestScopeDigest = requestScopeDigestFor(context, sourceRecord);
      if (requestScopeDigest !== input.requestScopeDigest) throw fail("workspace-request-scope-stale");
      const authority = publicGitOperationAuthoritySchema.parse(input.operationAuthority);
      if (this.verifyWatchdogAuthority(authority) !== true) throw fail("workspace-operation-authority-invalid");
      const authorityObservedAt = this.now();
      if (!Number.isSafeInteger(authorityObservedAt)
          || Date.parse(authority.requestedAt) > authorityObservedAt
          || Date.parse(authority.deadlineAt) <= authorityObservedAt) {
        throw fail("workspace-operation-authority-invalid");
      }

      const operationPrior = (await client.query(`SELECT authority.*,workspace.*,
          authority.workspace_id AS authority_workspace_id,
          authority.principal_id AS authority_principal_id,authority.project_id AS authority_project_id,
          authority.source_id AS authority_source_id,authority.request_scope_digest AS authority_request_scope_digest
        FROM ${this.sqlSchema}.operation_authorities AS authority
        JOIN ${this.sqlSchema}.workspaces AS workspace ON workspace.workspace_id=authority.workspace_id
        WHERE authority.operation_id=$1 FOR UPDATE OF authority,workspace`, [authority.operationId])).rows[0];
      if (operationPrior) {
        if (operationPrior.authority_principal_id !== context.principalId
            || operationPrior.authority_project_id !== context.projectId
            || operationPrior.authority_source_id !== input.sourceId
            || operationPrior.authority_request_scope_digest !== requestScopeDigest
            || operationPrior.authority_workspace_id !== operationPrior.workspace_id) {
          throw fail("workspace-operation-authority-conflict");
        }
        const retainedAuthority = this.#candidateAuthorityFromRow(context, operationPrior);
        if (canonicalSha256(retainedAuthority) !== canonicalSha256(authority)) {
          throw fail("workspace-operation-authority-conflict");
        }
        return { created: false, disposition: "exact-replay", operationAuthority: retainedAuthority,
          workspace: this.workspaceRecord(context, operationPrior), terminalEvidence: null };
      }

      const winner = (await client.query(`SELECT authority.*,workspace.*,
          authority.workspace_id AS authority_workspace_id,
          authority.principal_id AS authority_principal_id,authority.project_id AS authority_project_id,
          authority.source_id AS authority_source_id,authority.request_scope_digest AS authority_request_scope_digest
        FROM ${this.sqlSchema}.operation_authorities AS authority
        JOIN ${this.sqlSchema}.workspaces AS workspace ON workspace.workspace_id=authority.workspace_id
        WHERE authority.principal_id=$1 AND authority.project_id=$2 AND authority.source_id=$3
          AND authority.request_scope_digest=$4 FOR UPDATE OF authority,workspace`,
      [context.principalId, context.projectId, input.sourceId, requestScopeDigest])).rows[0];
      if (winner) {
        return { created: false, disposition: "converged-existing",
          existingOperationAuthority: this.#candidateAuthorityFromRow(context, winner),
          unusedAuthorityDigest: authority.authorityDigest };
      }

      const participantCount = Number((await client.query(`SELECT count(*) AS count FROM ${this.sqlSchema}.workspaces
        WHERE principal_id=$1 AND lifecycle IN ('intent-recorded','staging','published-pending-db')`,
      [context.principalId])).rows[0].count);
      if (participantCount >= 2) throw fail("workspace-participant-concurrency-limit");
      const sourceCount = Number((await client.query(`SELECT count(*) AS count FROM ${this.sqlSchema}.workspaces
        WHERE principal_id=$1 AND project_id=$2 AND source_id=$3
          AND lifecycle IN ('intent-recorded','staging','published-pending-db')`,
      [context.principalId, context.projectId, input.sourceId])).rows[0].count);
      if (sourceCount >= 1) throw fail("workspace-source-concurrency-limit");

      const workspaceId = `workspace-${randomUUID()}`, requestId = `request-${randomUUID()}`;
      const ids = authorityIds(context, sourceRecord.selection.environmentId);
      const binding = authorityBindingSchema.parse({ schemaVersion: "runa-workspace-binding/v1", ...ids,
        sourceId: input.sourceId, taskId: authority.taskId, sourceRevision: sourceRow.revision,
        capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST });
      const bindingDigest = bindingDigestFor(binding);
      const request = materializationRequestSchema.parse({ schemaVersion: "runa-workspace-materialization-request/v1",
        requestId, idempotencyKey: requestScopeDigest, sourceId: input.sourceId, taskId: authority.taskId,
        bindingDigest, expectedSourceRevision: sourceRow.revision, capabilitySetVersion: CAPABILITY_SET_VERSION,
        capabilitySetDigest: CAPABILITY_SET_DIGEST, requestedRef: sourceRecord.selection.requestedRef,
        uploadSessionId: null, uploadManifestDigest: null, limitsProfileId: MATERIALIZATION_POLICY_ID,
        limitsProfileDigest: MATERIALIZATION_POLICY_DIGEST, createdAt: authority.requestedAt,
        deadlineAt: authority.deadlineAt });
      const value = { workspaceId, lifecycle: "intent-recorded", revision: 1, cleanupState: "not-required",
        requestScopeDigest, operationAuthorityDigest: authority.authorityDigest,
        stagingManifestDigest: null, finalManifestDigest: null, source: sourceRecord.selection, binding, request,
        terminalOperationReceiptSha256: null, expectedCommitOid: sourceRecord.expectedCommitOid,
        updatedAt: authority.requestedAt };
      const payload = this.encode("workspace", context, workspaceId, value);
      const authorityEnvelope = this.encode("operation-authority", context, authority.operationId, authority);
      await client.query(`INSERT INTO ${this.sqlSchema}.workspaces
        (principal_id,project_id,workspace_id,source_id,source_revision,request_id,idempotency_key,request_digest,
          lifecycle,cleanup_state,revision,binding_digest,capability_digest,payload,payload_sha256,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'intent-recorded','not-required',1,$9,$10,$11::jsonb,$12,$13,$13)`,
      [context.principalId, context.projectId, workspaceId, input.sourceId, sourceRow.revision, requestId,
        requestScopeDigest, canonicalSha256(request), bindingDigest, CAPABILITY_SET_DIGEST,
        JSON.stringify(payload), canonicalSha256(payload), authority.requestedAt]);
      await client.query(`INSERT INTO ${this.sqlSchema}.operation_authorities
        (operation_id,workspace_id,principal_id,project_id,source_id,task_id,request_scope_digest,
          requested_at,deadline_at,authority_digest,worker_release_sha256,topology_digest,
          capability_set_version,capability_set_digest,signing_key_id,signing_key_version,
          watchdog_identity_sha256,signature_base64,authority_envelope,authority_envelope_sha256,
          attestation_sha256,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$8)`,
      [authority.operationId, workspaceId, context.principalId, context.projectId, input.sourceId,
        authority.taskId, requestScopeDigest, authority.requestedAt, authority.deadlineAt,
        authority.authorityDigest, authority.workerReleaseSha256, authority.topologyDigest,
        authority.capabilitySetVersion, authority.capabilitySetDigest, authority.attestation.signingKeyId,
        authority.attestation.signingKeyVersion, authority.attestation.watchdogIdentitySha256,
        authority.attestation.signatureBase64, JSON.stringify(authorityEnvelope), canonicalSha256(authorityEnvelope),
        canonicalSha256(authority.attestation)]);
      const eventDigest = canonicalSha256({ request, authorityDigest: authority.authorityDigest, requestScopeDigest });
      await client.query(`INSERT INTO ${this.sqlSchema}.outbox
        (principal_id,project_id,event_type,record_id,payload_sha256)
        VALUES($1,$2,'workspace-authority-intent-recorded',$3,$4)`,
      [context.principalId, context.projectId, workspaceId, eventDigest]);
      return { created: true, disposition: "created", operationAuthority: immutable(structuredClone(authority)),
        workspace: immutable(value) };
    });
  }

  #effectClaimFromRow(row) {
    let claim;
    try {
      claim = materializationEffectClaimSchema.parse({ schemaVersion: "runa-workspace-effect-claim/v1",
      operationId: row.operation_id, effect: row.effect, claimId: row.claim_id,
      claimRevision: row.claim_revision, state: row.state, claimDigest: row.claim_digest,
      claimedAt: iso(row.claimed_at), updatedAt: iso(row.updated_at) });
    } catch { throw fail("workspace-effect-claim-authority-invalid"); }
    const expectedDigest = canonicalSha256({ schemaVersion: claim.schemaVersion,
      operationId: claim.operationId, effect: claim.effect, claimId: claim.claimId,
      claimRevision: claim.claimRevision, claimedAt: claim.claimedAt });
    if (claim.claimDigest !== expectedDigest || Date.parse(claim.updatedAt) < Date.parse(claim.claimedAt)) {
      throw fail("workspace-effect-claim-authority-invalid");
    }
    return claim;
  }

  #durablePublicationFromRows(context, workspace, authority, row, publicationClaim) {
    if (!row) return null;
    if (row.principal_id !== context.principalId || row.project_id !== context.projectId
        || row.workspace_id !== workspace.workspaceId || row.operation_id !== authority.operationId
        || row.workspace_revision !== workspace.revision) {
      throw fail("workspace-publication-authority-invalid");
    }
    if (canonicalSha256(row.authority_manifest) !== row.authority_envelope_sha256) {
      throw fail("workspace-publication-authority-invalid");
    }
    let decoded;
    try {
      decoded = this.cipher
        ? this.cipher.decrypt(envelopeContext("publication-authority", {
          principalId: row.principal_id, projectId: row.project_id, sessionId: "publication-authority-read",
        }, workspace.workspaceId), row.authority_manifest)
        : row.authority_manifest;
    } catch { throw fail("workspace-publication-authority-invalid"); }
    let envelope;
    try { envelope = publicationAuthorityEnvelopeSchema.parse(decoded); }
    catch { throw fail("workspace-publication-authority-invalid"); }
    const manifest = envelope.authorityManifest;
    const authoritativeResources = envelope.publicationResources;
    const resourceIds = [row.parent_resource_id, row.ingress_root_resource_id, row.staging_root_resource_id];
    const resourceIdsValid = resourceIds.every(value => authorityIdSchema.safeParse(value).success)
      && new Set(resourceIds).size === resourceIds.length
      && row.parent_resource_id === authoritativeResources.parentResourceId
      && row.ingress_root_resource_id === authoritativeResources.ingressRootResourceId
      && row.staging_root_resource_id === authoritativeResources.stagingRootResourceId;
    const claimColumnsMatch = publicationClaim === null
      ? row.publication_claim_id === null && row.publication_claim_revision === null
      : row.publication_claim_id === publicationClaim.claimId
        && row.publication_claim_revision === publicationClaim.claimRevision
        && publicationClaim.operationId === authority.operationId
        && publicationClaim.effect === "publication";
    const observedIdentityPresent = row.observed_final_identity !== null;
    const observedDigestPresent = row.observed_final_digest !== null;
    const observedPairCoherent = observedIdentityPresent === observedDigestPresent;
    const observedValueCoherent = !observedIdentityPresent
      || (immutableEqual(row.observed_final_identity, manifest.final.expectedIdentity)
        && row.observed_final_digest === workspace.finalManifestDigest);
    const stateRevisionCoherent = (row.state === "staging-authorized" && row.state_revision === 1)
      || (row.state === "publication-claimed" && row.state_revision === 2)
      || (row.state === "published-observed" && [3, 5].includes(row.state_revision))
      || (row.state === "unknown"
        && ((publicationClaim === null && !observedIdentityPresent && row.state_revision === 2)
          || (publicationClaim?.state === "failed-unknown" && !observedIdentityPresent
            && row.state_revision === 3)
          || (publicationClaim?.state === "observed" && observedIdentityPresent
            && row.state_revision === 4)));
    const stateCoherent = (row.state === "staging-authorized"
        && workspace.lifecycle === "staging" && publicationClaim === null && !observedIdentityPresent)
      || (row.state === "publication-claimed" && workspace.lifecycle === "staging"
        && publicationClaim?.state === "claimed" && !observedIdentityPresent)
      || (row.state === "published-observed"
        && ["published-pending-db", "ready", "expired", "cleanup-pending", "removed"].includes(workspace.lifecycle)
        && publicationClaim?.state === "observed" && observedIdentityPresent)
      || (row.state === "unknown"
        && ["failed", "cancelled", "unknown", "cleanup-pending", "removed"].includes(workspace.lifecycle)
        && (publicationClaim === null
          || (publicationClaim.state === "failed-unknown" && !observedIdentityPresent)
          || (publicationClaim.state === "observed" && observedIdentityPresent)));
    const value = { schemaVersion: "runa-workspace-durable-publication-authority/v1",
      operationId: authority.operationId, workspaceId: workspace.workspaceId,
      workspaceRevision: row.workspace_revision, operationAuthorityDigest: row.operation_authority_digest,
      requestDigest: row.request_digest, bindingDigest: row.binding_digest,
      authorityManifest: manifest, authorityManifestDigest: row.authority_manifest_digest,
      parentResourceId: row.parent_resource_id, ingressRootResourceId: row.ingress_root_resource_id,
      stagingRootResourceId: row.staging_root_resource_id, publicationClaim,
      workspaceLifecycle: workspace.lifecycle, state: row.state };
    if (canonicalSha256(manifest) !== row.authority_manifest_digest
        || manifest.workspaceId !== workspace.workspaceId
        || manifest.workspaceManifestDigest !== workspace.stagingManifestDigest
        || authority.authorityDigest !== row.operation_authority_digest
        || authority.operationId !== workspace.binding.taskId
        || authority.authorityDigest !== workspace.operationAuthorityDigest
        || workspace.request.bindingDigest !== row.binding_digest
        || canonicalSha256(workspace.request) !== row.request_digest
        || !resourceIdsValid
        || row.parent_volume_serial !== manifest.parentIdentity.volumeSerial
        || row.parent_file_id !== manifest.parentIdentity.fileId
        || row.staging_name !== manifest.staging.name
        || row.staging_volume_serial !== manifest.staging.identity.volumeSerial
        || row.staging_file_id !== manifest.staging.identity.fileId
        || row.final_name !== manifest.final.name
        || row.final_volume_serial !== manifest.final.expectedIdentity.volumeSerial
        || row.final_file_id !== manifest.final.expectedIdentity.fileId
        || !claimColumnsMatch || !observedPairCoherent || !observedValueCoherent
        || !Number.isSafeInteger(row.state_revision) || !stateRevisionCoherent || !stateCoherent) {
      throw fail("workspace-publication-authority-invalid");
    }
    if (["expired", "removed"].includes(workspace.lifecycle)) return null;
    try { return durablePublicationAuthoritySchema.parse(value); }
    catch { throw fail("workspace-publication-authority-invalid"); }
  }

  async lookupMaterializationByOperation(contextValue, inputValue) {
    const context = contextSchema.parse(contextValue);
    const input = materializationOperationLookupInputSchema.parse(inputValue);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const row = (await client.query(`SELECT authority.*,workspace.*,
          authority.workspace_id AS authority_workspace_id,
          authority.principal_id AS authority_principal_id,authority.project_id AS authority_project_id,
          authority.source_id AS authority_source_id,authority.request_scope_digest AS authority_request_scope_digest
        FROM ${this.sqlSchema}.operation_authorities AS authority
        JOIN ${this.sqlSchema}.workspaces AS workspace ON workspace.workspace_id=authority.workspace_id
        WHERE authority.principal_id=$1 AND authority.project_id=$2 AND authority.operation_id=$3`,
      [context.principalId, context.projectId, input.operationId])).rows[0];
      if (!row) { await client.query("COMMIT"); return { found: false, disposition: "absent" }; }
      if (row.authority_digest !== input.authorityDigest) throw fail("workspace-operation-authority-invalid");
      const authority = this.#candidateAuthorityFromRow(context, row);
      const workspace = this.workspaceRecord(context, row);
      if (authority.taskId !== workspace.binding.taskId
          || row.authority_workspace_id !== workspace.workspaceId
          || row.authority_source_id !== workspace.source.sourceId
          || row.authority_request_scope_digest !== workspace.requestScopeDigest
          || authority.authorityDigest !== workspace.operationAuthorityDigest) {
        throw fail("workspace-operation-authority-invalid");
      }
      const claimRows = (await client.query(`SELECT * FROM ${this.sqlSchema}.workspace_effect_claims
        WHERE operation_id=$1 ORDER BY effect`, [authority.operationId])).rows;
      const effectClaims = claimRows.map(claim => this.#effectClaimFromRow(claim));
      const fetchClaim = effectClaims.find(claim => claim.effect === "git-fetch") ?? null;
      const publicationRow = (await client.query(`SELECT * FROM ${this.sqlSchema}.workspace_publication_authorities
        WHERE operation_id=$1`, [authority.operationId])).rows[0];
      const publicationClaim = effectClaims.find(claim => claim.effect === "publication") ?? null;
      const publicationRequired = workspace.stagingManifestDigest !== null;
      const publicationClaimRequired = publicationRow?.state === "publication-claimed"
        || publicationRow?.state === "published-observed";
      if ((publicationRequired && publicationRow === undefined)
          || (!publicationRequired && publicationRow !== undefined)
          || (publicationRow !== undefined && fetchClaim?.state !== "observed")
          || (publicationRow === undefined && publicationClaim !== null)
          || (publicationClaimRequired && publicationClaim === null)
          || (publicationRow?.state === "staging-authorized" && publicationClaim !== null)) {
        throw fail("workspace-publication-authority-invalid");
      }
      const publicationAuthority = publicationRow
        ? this.#durablePublicationFromRows(context, workspace, authority, publicationRow, publicationClaim) : null;
      const workspaceReceiptRow = (await client.query(`SELECT receipt,receipt_sha256 FROM ${this.sqlSchema}.workspace_receipts
        WHERE principal_id=$1 AND project_id=$2 AND workspace_id=$3 AND workspace_revision=$4`,
      [context.principalId, context.projectId, workspace.workspaceId, workspace.revision])).rows[0];
      const operationReceiptRow = (await client.query(`SELECT receipt,receipt_sha256 FROM ${this.sqlSchema}.operation_receipts
        WHERE principal_id=$1 AND project_id=$2 AND operation_id=$3`,
      [context.principalId, context.projectId, authority.operationId])).rows[0];
      let workspaceReceipt = workspaceReceiptRow?.receipt ?? null;
      let operationReceipt = operationReceiptRow?.receipt ?? null;
      const historicalTerminalLifecycle = ["failed", "cancelled", "unknown", "cleanup-pending", "expired", "removed"]
        .includes(workspace.lifecycle);
      if (operationReceiptRow && historicalTerminalLifecycle) {
        let historicalRevision;
        try { historicalRevision = externalOperationTerminalReceiptSchema.parse(operationReceipt).workspaceRevision; }
        catch { throw fail("workspace-operation-authority-invalid"); }
        try { await this.#readyReceiptAuthority(client, context, workspace, historicalRevision); }
        catch { throw fail("workspace-operation-authority-invalid"); }
      }
      if (workspace.lifecycle === "ready") {
        const retained = await this.#readyReceiptAuthority(client, context, workspace, workspace.revision);
        workspaceReceipt = retained.workspaceReceipt; operationReceipt = retained.operationReceipt;
      } else if (["failed", "cancelled", "unknown", "cleanup-pending"].includes(workspace.lifecycle)) {
        if (!workspaceReceiptRow || canonicalSha256(workspaceReceipt) !== workspaceReceiptRow.receipt_sha256) {
          throw fail("workspace-operation-authority-invalid");
        }
        workspaceReceipt = this.receiptFor(workspace, workspaceReceipt, workspace.lifecycle);
        operationReceipt = null;
      } else if (["expired", "removed"].includes(workspace.lifecycle)) {
        if (workspaceReceiptRow) throw fail("workspace-operation-authority-invalid");
        workspaceReceipt = null;
        operationReceipt = null;
      } else if (workspaceReceiptRow || operationReceiptRow) {
        throw fail("workspace-operation-authority-invalid");
      }
      const result = { found: true, disposition: "exact", requestScopeDigest: row.request_scope_digest,
        operationAuthority: authority, workspace, effectClaims, publicationAuthority,
        workspaceReceipt, operationReceipt };
      await client.query("COMMIT"); return immutable(result);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {}); throw error;
    } finally { client.release(); }
  }

  async claimEffect(contextValue, inputValue) {
    const input = effectClaimInputSchema.parse(inputValue);
    if (this.verifyWatchdogAuthority === null) throw fail("workspace-operation-authority-verifier-unavailable");
    return this.scoped(contextValue, async (client, context) => {
      const selector = (await client.query(`SELECT workspace_id FROM ${this.sqlSchema}.operation_authorities
        WHERE principal_id=$1 AND project_id=$2 AND operation_id=$3`,
      [context.principalId, context.projectId, input.operationId])).rows[0];
      if (!selector) throw fail("workspace-effect-claim-authority-invalid");
      const { row, sourceRow } = await this.#lockWorkspaceAuthority(client, context, selector.workspace_id);
      const authorityRow = (await client.query(`SELECT * FROM ${this.sqlSchema}.operation_authorities
        WHERE principal_id=$1 AND project_id=$2 AND operation_id=$3 AND workspace_id=$4 FOR UPDATE`,
      [context.principalId, context.projectId, input.operationId, row.workspace_id])).rows[0];
      if (!authorityRow || authorityRow.authority_digest !== input.authorityDigest
          || row.revision !== input.expectedWorkspaceRevision) {
        throw fail("workspace-effect-claim-authority-invalid");
      }
      const authority = this.#candidateAuthorityFromRow(context, authorityRow);
      const workspace = this.workspaceRecord(context, row);
      const source = this.sourceRecord(context, sourceRow);
      if (sourceRow.revision !== row.source_revision || !activeSourceLifecycles.includes(sourceRow.lifecycle)
          || canonicalSha256(source.selection) !== canonicalSha256(workspace.source)
          || source.expectedCommitOid !== workspace.expectedCommitOid) {
        throw fail("workspace-source-authority-stale");
      }
      const allowedLifecycle = input.effect === "git-fetch" ? "intent-recorded" : "staging";
      if (workspace.lifecycle !== allowedLifecycle) throw fail("workspace-effect-claim-state-invalid");
      const prior = (await client.query(`SELECT * FROM ${this.sqlSchema}.workspace_effect_claims
        WHERE operation_id=$1 AND effect=$2 FOR UPDATE`, [input.operationId, input.effect])).rows[0];
      let created = false, claim;
      if (prior) claim = this.#effectClaimFromRow(prior);
      else {
        const claimId = `claim-${randomUUID()}`, claimedAt = iso(this.now());
        const claimDigest = canonicalSha256({ schemaVersion: "runa-workspace-effect-claim/v1",
          operationId: input.operationId, effect: input.effect, claimId, claimRevision: 1, claimedAt });
        await client.query(`INSERT INTO ${this.sqlSchema}.workspace_effect_claims
          (operation_id,effect,claim_id,claim_revision,state,claim_digest,claimed_at,updated_at)
          VALUES($1,$2,$3,1,'claimed',$4,$5,$5)`,
        [input.operationId, input.effect, claimId, claimDigest, claimedAt]);
        claim = materializationEffectClaimSchema.parse({ schemaVersion: "runa-workspace-effect-claim/v1",
          operationId: input.operationId, effect: input.effect, claimId, claimRevision: 1,
          state: "claimed", claimDigest, claimedAt, updatedAt: claimedAt });
        created = true;
      }
      let publicationAuthority;
      if (input.effect === "publication") {
        const publicationRow = (await client.query(`SELECT * FROM ${this.sqlSchema}.workspace_publication_authorities
          WHERE operation_id=$1 FOR UPDATE`, [input.operationId])).rows[0];
        if (!publicationRow || (created && publicationRow.state !== "staging-authorized")
            || (!created && publicationRow.state !== "publication-claimed")
            || (!created && publicationRow.publication_claim_id !== claim.claimId)) {
          throw fail("workspace-publication-authority-invalid");
        }
        if (created) {
          const changed = await client.query(`UPDATE ${this.sqlSchema}.workspace_publication_authorities
            SET publication_claim_id=$2,publication_claim_revision=1,state='publication-claimed',
              state_revision=state_revision+1,updated_at=$3
            WHERE operation_id=$1 AND state='staging-authorized'`,
          [input.operationId, claim.claimId, claim.claimedAt]);
          if (changed.rowCount !== 1) throw fail("workspace-publication-authority-conflict");
          publicationRow.publication_claim_id = claim.claimId;
          publicationRow.publication_claim_revision = 1;
          publicationRow.state = "publication-claimed";
          publicationRow.state_revision += 1;
          publicationRow.updated_at = claim.claimedAt;
        }
        publicationAuthority = this.#durablePublicationFromRows(context, workspace, authority, publicationRow, claim);
      }
      if (created) {
        await client.query(`INSERT INTO ${this.sqlSchema}.outbox
          (principal_id,project_id,event_type,record_id,payload_sha256) VALUES($1,$2,$3,$4,$5)`,
        [context.principalId, context.projectId, `workspace-${input.effect}-claimed`, input.operationId,
          claim.claimDigest]);
      }
      return immutable({ created, claim, ...(publicationAuthority ? { publicationAuthority } : {}) });
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
    externalOperationReceipt = false, requireOperationAuthority = false }) {
    const identity = transitionIdentityFor(inputValue);
    return this.scoped(contextValue, async (client, context) => {
      const { row, sourceRow } = await this.#lockWorkspaceAuthority(client, context, identity.workspaceId);
      const current = this.workspaceRecord(context, row);
      const authoritativeSource = this.sourceRecord(context, sourceRow);
      if (identity.idempotencyKey !== row.idempotency_key || identity.bindingDigest !== row.binding_digest
          || identity.capabilitySetDigest !== row.capability_digest) throw fail("workspace-transition-binding-mismatch");
      let retainedOperationAuthority = null;
      if (this.verifyWatchdogAuthority !== null) {
        const authorityRow = (await client.query(`SELECT * FROM ${this.sqlSchema}.operation_authorities
          WHERE workspace_id=$1 FOR UPDATE`, [current.workspaceId])).rows[0];
        if (authorityRow) {
          retainedOperationAuthority = this.#candidateAuthorityFromRow(context, authorityRow);
          if (retainedOperationAuthority.operationId !== current.binding.taskId
              || retainedOperationAuthority.authorityDigest !== current.operationAuthorityDigest) {
            throw fail("workspace-operation-authority-invalid");
          }
        } else if (current.operationAuthorityDigest !== null && current.operationAuthorityDigest !== undefined) {
          throw fail("workspace-operation-authority-invalid");
        }
      }
      if (requireOperationAuthority) {
        if (retainedOperationAuthority === null
            || retainedOperationAuthority.authorityDigest !== inputValue.operationAuthorityDigest) {
          throw fail("workspace-operation-authority-invalid");
        }
        if (["failed", "cancelled"].includes(successor) && row.lifecycle === "staging") {
          const publicationState = (await client.query(`SELECT state
            FROM ${this.sqlSchema}.workspace_publication_authorities
            WHERE workspace_id=$1 FOR UPDATE`, [current.workspaceId])).rows[0]?.state ?? null;
          assertCandidateDeterminatePublicationState(row.lifecycle, publicationState);
        }
      }
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
      if (requireOperationAuthority) transitionProjection.operationAuthorityDigest = inputValue.operationAuthorityDigest;
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
      if (retainedOperationAuthority && successor === "ready" && row.lifecycle === "published-pending-db") {
        const publicationChanged = await client.query(`UPDATE ${this.sqlSchema}.workspace_publication_authorities
          SET workspace_revision=$2,updated_at=$3
          WHERE workspace_id=$1 AND state='published-observed'`, [row.workspace_id, revision, updatedAt]);
        if (publicationChanged.rowCount !== 1) throw fail("workspace-publication-authority-invalid");
      } else if (retainedOperationAuthority && successor === "ready" && row.lifecycle === "unknown") {
        const publicationChanged = await client.query(`UPDATE ${this.sqlSchema}.workspace_publication_authorities
          SET workspace_revision=$2,state='published-observed',state_revision=state_revision+1,updated_at=$3
          WHERE workspace_id=$1 AND state='unknown' AND publication_claim_id IS NOT NULL
            AND observed_final_identity IS NOT NULL AND observed_final_digest IS NOT NULL`,
        [row.workspace_id, revision, updatedAt]);
        if (publicationChanged.rowCount !== 1) throw fail("workspace-publication-authority-invalid");
      } else if (retainedOperationAuthority && ["failed", "cancelled"].includes(successor)
          && row.lifecycle === "staging") {
        const publicationChanged = await client.query(`UPDATE ${this.sqlSchema}.workspace_publication_authorities
          SET workspace_revision=$2,state='unknown',state_revision=state_revision+1,updated_at=$3
          WHERE workspace_id=$1 AND state='staging-authorized'`,
        [row.workspace_id, revision, updatedAt]);
        if (publicationChanged.rowCount !== 1) throw fail("workspace-publication-authority-invalid");
      } else if (retainedOperationAuthority && successor === "unknown"
          && ["staging", "published-pending-db", "ready"].includes(row.lifecycle)) {
        const publicationChanged = await client.query(`UPDATE ${this.sqlSchema}.workspace_publication_authorities
          SET workspace_revision=$2,state='unknown',state_revision=state_revision+1,updated_at=$3
          WHERE workspace_id=$1 AND state IN ('staging-authorized','publication-claimed','published-observed')`,
        [row.workspace_id, revision, updatedAt]);
        if (publicationChanged.rowCount !== 1) throw fail("workspace-publication-authority-invalid");
      } else if (retainedOperationAuthority && current.stagingManifestDigest !== null
          && ["expired", "cleanup-pending", "removed"].includes(successor)) {
        const publicationChanged = await client.query(`UPDATE ${this.sqlSchema}.workspace_publication_authorities
          SET workspace_revision=$2,updated_at=$3
          WHERE workspace_id=$1 AND state IN ('published-observed','unknown')`,
        [row.workspace_id, revision, updatedAt]);
        if (publicationChanged.rowCount !== 1) throw fail("workspace-publication-authority-invalid");
      }
      if (requireOperationAuthority && ["failed", "cancelled"].includes(successor)) {
        await client.query(`UPDATE ${this.sqlSchema}.workspace_effect_claims
          SET state='observed',updated_at=$2 WHERE operation_id=$1 AND state='claimed'`,
        [current.binding.taskId, updatedAt]);
      }
      if (requireOperationAuthority && successor === "unknown") {
        await client.query(`UPDATE ${this.sqlSchema}.workspace_effect_claims
          SET state='failed-unknown',updated_at=$2 WHERE operation_id=$1 AND state='claimed'`,
        [current.binding.taskId, updatedAt]);
      }
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

  async #recordCandidateStaging(contextValue, inputValue) {
    const input = candidateStagingInputSchema.parse(inputValue);
    return this.scoped(contextValue, async (client, context) => {
      const { row, sourceRow } = await this.#lockWorkspaceAuthority(client, context, input.workspaceId);
      const current = this.workspaceRecord(context, row), source = this.sourceRecord(context, sourceRow);
      const replayCandidate = row.lifecycle === "staging" && row.revision === input.expectedRevision + 1;
      if ((!replayCandidate && (row.revision !== input.expectedRevision || row.lifecycle !== "intent-recorded"))
          || row.idempotency_key !== input.idempotencyKey || row.binding_digest !== input.bindingDigest
          || row.capability_digest !== input.capabilitySetDigest
          || sourceRow.revision !== row.source_revision || !activeSourceLifecycles.includes(sourceRow.lifecycle)
          || canonicalSha256(source.selection) !== canonicalSha256(current.source)
          || source.expectedCommitOid !== current.expectedCommitOid) {
        throw fail("workspace-transition-conflict");
      }
      const authorityRow = (await client.query(`SELECT * FROM ${this.sqlSchema}.operation_authorities
        WHERE workspace_id=$1 FOR UPDATE`, [current.workspaceId])).rows[0];
      const authority = this.#candidateAuthorityFromRow(context, authorityRow);
      if (authority.authorityDigest !== input.operationAuthorityDigest
          || authority.operationId !== current.binding.taskId) throw fail("workspace-operation-authority-invalid");
      const claimRow = (await client.query(`SELECT * FROM ${this.sqlSchema}.workspace_effect_claims
        WHERE operation_id=$1 AND effect='git-fetch' FOR UPDATE`, [authority.operationId])).rows[0];
      const fetchClaim = this.#effectClaimFromRow(claimRow);
      if (input.fetchClaim.state !== "claimed" || !sameClaimIdentity(fetchClaim, input.fetchClaim)
          || (!replayCandidate && fetchClaim.state !== "claimed")
          || (replayCandidate && fetchClaim.state !== "observed")) {
        throw fail("workspace-effect-claim-authority-invalid");
      }
      let manifest;
      try { manifest = admitWorkspaceManifest(canonicalStringify(input.workspaceManifest), current.binding); }
      catch { throw fail("workspace-publication-authority-invalid"); }
      const manifestDigest = canonicalSha256(manifest);
      if (manifest.lifecycle !== "staging" || manifest.workspaceId !== current.workspaceId
          || manifest.sourceId !== current.source.sourceId || manifest.bindingDigest !== current.request.bindingDigest
          || manifest.nativeVersion !== current.expectedCommitOid || !manifest.complete || manifest.rejectedCount !== 0
          || manifest.fileSetDigest !== fileSetDigest(manifest.entries)
          || manifest.sourceKind !== current.source.sourceKind
          || manifest.capabilitySetVersion !== current.binding.capabilitySetVersion
          || manifest.capabilitySetDigest !== current.binding.capabilitySetDigest
          || manifest.limitsProfileId !== current.request.limitsProfileId
          || manifest.limitsProfileDigest !== current.request.limitsProfileDigest
          || manifest.createdAt !== current.request.createdAt
          || input.publicationAuthorityManifest.workspaceId !== current.workspaceId
          || input.publicationAuthorityManifest.workspaceManifestDigest !== manifestDigest
          || input.publicationAuthorityManifest.files.length !== manifest.entries.length
          || input.publicationAuthorityManifest.files.some((file, index) => {
            const entry = manifest.entries[index];
            return !entry || file.path !== entry.path || file.bytes !== entry.bytes || file.sha256 !== entry.sha256;
          })) {
        throw fail("workspace-publication-authority-invalid");
      }
      const authorityManifestDigest = canonicalSha256(input.publicationAuthorityManifest);
      const authorityEnvelopeValue = publicationAuthorityEnvelopeSchema.parse({
        schemaVersion: "runa-workspace-publication-authority-envelope/v1",
        authorityManifest: input.publicationAuthorityManifest,
        publicationResources: input.publicationResources,
      });
      const authorityEnvelope = this.encode("publication-authority", context, current.workspaceId,
        authorityEnvelopeValue);
      const updatedAt = iso(this.now()), revision = row.revision + 1;
      const transitionDigest = canonicalSha256({ schemaVersion: "runa-workspace-candidate-staging-transition/v1",
        workspaceId: current.workspaceId, expectedRevision: input.expectedRevision,
        operationAuthorityDigest: authority.authorityDigest, fetchClaimDigest: fetchClaim.claimDigest,
        workspaceManifestDigest: manifestDigest, authorityManifestDigest,
        publicationResources: input.publicationResources });
      if (replayCandidate) {
        const publicationRow = (await client.query(`SELECT * FROM ${this.sqlSchema}.workspace_publication_authorities
          WHERE operation_id=$1 FOR UPDATE`, [authority.operationId])).rows[0];
        if (row.last_transition_digest !== transitionDigest || !publicationRow
            || publicationRow.state !== "staging-authorized" || publicationRow.workspace_revision !== row.revision
            || publicationRow.operation_authority_digest !== authority.authorityDigest
            || publicationRow.authority_manifest_digest !== authorityManifestDigest
            || publicationRow.parent_resource_id !== input.publicationResources.parentResourceId
            || publicationRow.ingress_root_resource_id !== input.publicationResources.ingressRootResourceId
            || publicationRow.staging_root_resource_id !== input.publicationResources.stagingRootResourceId) {
          throw fail("workspace-transition-conflict");
        }
        const publicationAuthority = this.#durablePublicationFromRows(context, current, authority, publicationRow, null);
        return immutable({ changed: false, ...current, publicationAuthority,
          receipt: null, operationReceipt: null });
      }
      const value = { ...current, lifecycle: "staging", revision, updatedAt,
        stagingManifestDigest: manifestDigest };
      const payload = this.encode("workspace", context, row.workspace_id, value);
      const changed = await client.query(`UPDATE ${this.sqlSchema}.workspaces
        SET lifecycle='staging',revision=$2,last_transition_digest=$3,payload=$4::jsonb,
          payload_sha256=$5,updated_at=$6 WHERE workspace_id=$1 AND lifecycle='intent-recorded' AND revision=$7`,
      [row.workspace_id, revision, transitionDigest, JSON.stringify(payload), canonicalSha256(payload),
        updatedAt, input.expectedRevision]);
      if (changed.rowCount !== 1) throw fail("workspace-transition-conflict");
      await client.query(`INSERT INTO ${this.sqlSchema}.workspace_publication_authorities
        (workspace_id,operation_id,principal_id,project_id,workspace_revision,operation_authority_digest,request_digest,binding_digest,
          authority_manifest,authority_envelope_sha256,authority_manifest_digest,parent_resource_id,ingress_root_resource_id,staging_root_resource_id,
          parent_volume_serial,parent_file_id,staging_name,staging_volume_serial,staging_file_id,
          final_name,final_volume_serial,final_file_id,state,state_revision,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
          'staging-authorized',1,$23,$23)`,
      [current.workspaceId, authority.operationId, context.principalId, context.projectId,
        revision, authority.authorityDigest,
        canonicalSha256(current.request), current.request.bindingDigest,
        JSON.stringify(authorityEnvelope), canonicalSha256(authorityEnvelope), authorityManifestDigest,
        input.publicationResources.parentResourceId, input.publicationResources.ingressRootResourceId,
        input.publicationResources.stagingRootResourceId,
        input.publicationAuthorityManifest.parentIdentity.volumeSerial,
        input.publicationAuthorityManifest.parentIdentity.fileId,
        input.publicationAuthorityManifest.staging.name,
        input.publicationAuthorityManifest.staging.identity.volumeSerial,
        input.publicationAuthorityManifest.staging.identity.fileId,
        input.publicationAuthorityManifest.final.name,
        input.publicationAuthorityManifest.final.expectedIdentity.volumeSerial,
        input.publicationAuthorityManifest.final.expectedIdentity.fileId, updatedAt]);
      const fetchObserved = await client.query(`UPDATE ${this.sqlSchema}.workspace_effect_claims
        SET state='observed',updated_at=$2 WHERE operation_id=$1 AND effect='git-fetch' AND state='claimed'`,
      [authority.operationId, updatedAt]);
      if (fetchObserved.rowCount !== 1) throw fail("workspace-effect-claim-authority-invalid");
      await client.query(`INSERT INTO ${this.sqlSchema}.outbox
        (principal_id,project_id,event_type,record_id,payload_sha256)
        VALUES($1,$2,'workspace-staging-authorized',$3,$4)`,
      [context.principalId, context.projectId, current.workspaceId, transitionDigest]);
      const publicationAuthority = this.#durablePublicationFromRows(context, value, authority, {
        workspace_id: current.workspaceId, operation_id: authority.operationId,
        workspace_revision: revision, operation_authority_digest: authority.authorityDigest,
        request_digest: canonicalSha256(current.request), binding_digest: current.request.bindingDigest,
        authority_manifest: authorityEnvelope, authority_envelope_sha256: canonicalSha256(authorityEnvelope),
        authority_manifest_digest: authorityManifestDigest,
        parent_resource_id: input.publicationResources.parentResourceId,
        ingress_root_resource_id: input.publicationResources.ingressRootResourceId,
        staging_root_resource_id: input.publicationResources.stagingRootResourceId,
        parent_volume_serial: input.publicationAuthorityManifest.parentIdentity.volumeSerial,
        parent_file_id: input.publicationAuthorityManifest.parentIdentity.fileId,
        staging_name: input.publicationAuthorityManifest.staging.name,
        staging_volume_serial: input.publicationAuthorityManifest.staging.identity.volumeSerial,
        staging_file_id: input.publicationAuthorityManifest.staging.identity.fileId,
        final_name: input.publicationAuthorityManifest.final.name,
        final_volume_serial: input.publicationAuthorityManifest.final.expectedIdentity.volumeSerial,
        final_file_id: input.publicationAuthorityManifest.final.expectedIdentity.fileId,
        publication_claim_id: null, publication_claim_revision: null,
        observed_final_identity: null, observed_final_digest: null,
        state: "staging-authorized", state_revision: 1,
        principal_id: context.principalId, project_id: context.projectId,
      }, null);
      return immutable({ changed: true, ...value, publicationAuthority,
        receipt: null, operationReceipt: null });
    });
  }

  async #recordCandidatePublished(contextValue, inputValue) {
    const input = candidatePublishedInputSchema.parse(inputValue);
    return this.scoped(contextValue, async (client, context) => {
      const { row, sourceRow } = await this.#lockWorkspaceAuthority(client, context, input.workspaceId);
      const current = this.workspaceRecord(context, row), source = this.sourceRecord(context, sourceRow);
      const replayCandidate = row.lifecycle === "published-pending-db"
        && row.revision === input.expectedRevision + 1;
      if ((!replayCandidate && (row.revision !== input.expectedRevision || row.lifecycle !== "staging"))
          || row.idempotency_key !== input.idempotencyKey || row.binding_digest !== input.bindingDigest
          || row.capability_digest !== input.capabilitySetDigest
          || sourceRow.revision !== row.source_revision || !activeSourceLifecycles.includes(sourceRow.lifecycle)
          || canonicalSha256(source.selection) !== canonicalSha256(current.source)
          || source.expectedCommitOid !== current.expectedCommitOid) {
        throw fail("workspace-transition-conflict");
      }
      const authorityRow = (await client.query(`SELECT * FROM ${this.sqlSchema}.operation_authorities
        WHERE workspace_id=$1 FOR UPDATE`, [current.workspaceId])).rows[0];
      const authority = this.#candidateAuthorityFromRow(context, authorityRow);
      if (authority.authorityDigest !== input.operationAuthorityDigest) {
        throw fail("workspace-operation-authority-invalid");
      }
      const claimRow = (await client.query(`SELECT * FROM ${this.sqlSchema}.workspace_effect_claims
        WHERE operation_id=$1 AND effect='publication' FOR UPDATE`, [authority.operationId])).rows[0];
      const claim = this.#effectClaimFromRow(claimRow);
      if (input.publicationClaim.state !== "claimed" || !sameClaimIdentity(claim, input.publicationClaim)
          || (!replayCandidate && claim.state !== "claimed")
          || (replayCandidate && claim.state !== "observed")) {
        throw fail("workspace-effect-claim-authority-invalid");
      }
      const publicationRow = (await client.query(`SELECT * FROM ${this.sqlSchema}.workspace_publication_authorities
        WHERE operation_id=$1 FOR UPDATE`, [authority.operationId])).rows[0];
      if (!publicationRow || (!replayCandidate && publicationRow.state !== "publication-claimed")
          || (replayCandidate && publicationRow.state !== "published-observed")
          || publicationRow.publication_claim_id !== claim.claimId
          || input.publicationObservation.databaseTransitionProposal.expectedRevision !== input.expectedRevision
          || input.stagingManifestDigest !== current.stagingManifestDigest
          || input.finalManifestDigest !== input.publicationObservation.observedFinalDigest
          || input.publicationObservation.observedFinalIdentity.volumeSerial !== publicationRow.final_volume_serial
          || input.publicationObservation.observedFinalIdentity.fileId !== publicationRow.final_file_id) {
        throw fail("workspace-publication-authority-invalid");
      }
      const updatedAt = iso(this.now()), revision = row.revision + 1;
      const transitionDigest = canonicalSha256({ schemaVersion: "runa-workspace-candidate-published-transition/v1",
        workspaceId: current.workspaceId, expectedRevision: input.expectedRevision,
        operationAuthorityDigest: authority.authorityDigest, publicationClaimDigest: claim.claimDigest,
        observationDigest: canonicalSha256(input.publicationObservation),
        stagingManifestDigest: input.stagingManifestDigest, finalManifestDigest: input.finalManifestDigest });
      if (replayCandidate) {
        if (row.last_transition_digest !== transitionDigest
            || !immutableEqual(publicationRow.observed_final_identity,
              input.publicationObservation.observedFinalIdentity)
            || publicationRow.observed_final_digest !== input.publicationObservation.observedFinalDigest) {
          throw fail("workspace-transition-conflict");
        }
        const publicationAuthority = this.#durablePublicationFromRows(context, current, authority, publicationRow, claim);
        return immutable({ changed: false, ...current, publicationAuthority,
          receipt: null, operationReceipt: null });
      }
      const value = { ...current, lifecycle: "published-pending-db", revision, updatedAt,
        stagingManifestDigest: input.stagingManifestDigest, finalManifestDigest: input.finalManifestDigest };
      const payload = this.encode("workspace", context, row.workspace_id, value);
      const changed = await client.query(`UPDATE ${this.sqlSchema}.workspaces
        SET lifecycle='published-pending-db',revision=$2,last_transition_digest=$3,
          payload=$4::jsonb,payload_sha256=$5,updated_at=$6
        WHERE workspace_id=$1 AND lifecycle='staging' AND revision=$7`,
      [row.workspace_id, revision, transitionDigest, JSON.stringify(payload), canonicalSha256(payload),
        updatedAt, input.expectedRevision]);
      if (changed.rowCount !== 1) throw fail("workspace-transition-conflict");
      const publicationObserved = await client.query(`UPDATE ${this.sqlSchema}.workspace_publication_authorities
        SET workspace_revision=$2,state='published-observed',state_revision=state_revision+1,
          observed_final_identity=$3::jsonb,observed_final_digest=$4,updated_at=$5
        WHERE operation_id=$1 AND state='publication-claimed' AND publication_claim_id=$6`,
      [authority.operationId, revision, JSON.stringify(input.publicationObservation.observedFinalIdentity),
        input.publicationObservation.observedFinalDigest, updatedAt, claim.claimId]);
      if (publicationObserved.rowCount !== 1) throw fail("workspace-publication-authority-conflict");
      const claimObserved = await client.query(`UPDATE ${this.sqlSchema}.workspace_effect_claims SET state='observed',updated_at=$2
        WHERE operation_id=$1 AND effect='publication' AND state='claimed'`, [authority.operationId, updatedAt]);
      if (claimObserved.rowCount !== 1) throw fail("workspace-effect-claim-authority-invalid");
      await client.query(`INSERT INTO ${this.sqlSchema}.outbox
        (principal_id,project_id,event_type,record_id,payload_sha256)
        VALUES($1,$2,'workspace-published-pending-db',$3,$4)`,
      [context.principalId, context.projectId, current.workspaceId, transitionDigest]);
      publicationRow.workspace_revision = revision;
      publicationRow.state = "published-observed";
      publicationRow.state_revision += 1;
      publicationRow.observed_final_identity = input.publicationObservation.observedFinalIdentity;
      publicationRow.observed_final_digest = input.publicationObservation.observedFinalDigest;
      publicationRow.updated_at = updatedAt;
      const observedClaim = { ...claim, state: "observed", updatedAt };
      const publicationAuthority = this.#durablePublicationFromRows(context, value, authority, publicationRow, observedClaim);
      return immutable({ changed: true, ...value, publicationAuthority,
        receipt: null, operationReceipt: null });
    });
  }

  async recordStaging(context, input) {
    if (input?.operationAuthorityDigest !== undefined) return this.#recordCandidateStaging(context, input);
    return this.#transition(context, input, {
      predecessors: ["intent-recorded"], successor: "staging", cleanupState: "not-required",
      eventType: "workspace-staging", requireBoundActiveSource: true,
    });
  }

  async recordPublishedPendingDb(context, inputValue) {
    if (inputValue?.operationAuthorityDigest !== undefined) return this.#recordCandidatePublished(context, inputValue);
    return this.#transition(context, inputValue, {
      predecessors: ["staging"], successor: "published-pending-db", cleanupState: "not-required",
      eventType: "workspace-published-pending-db", inputSchema: publishedTransitionSchema,
      fieldsFor: input => ({ stagingManifestDigest: input.stagingManifestDigest,
        finalManifestDigest: input.finalManifestDigest }), requireBoundActiveSource: true,
    });
  }

  async recordReady(context, input) {
    const candidate = input?.operationAuthorityDigest !== undefined;
    return this.#transition(context, input, {
      predecessors: ["published-pending-db"], successor: "ready", cleanupState: "complete",
      eventType: "workspace-ready", inputSchema: candidate ? candidateReadyTransitionSchema : readyTransitionSchema,
      receiptOutcome: "ready",
      workspaceManifest: true, requireBoundActiveSource: true, requirePublicationManifest: true,
      externalOperationReceipt: true, requireOperationAuthority: candidate,
    });
  }

  async recordCancelled(context, input) {
    const candidate = input?.operationAuthorityDigest !== undefined;
    return this.#transition(context, input, {
      predecessors: ["intent-recorded", "staging"], successor: "cancelled", cleanupState: "complete",
      eventType: "workspace-cancelled", inputSchema: candidate ? candidateTerminalTransitionSchema : terminalTransitionSchema,
      receiptOutcome: "cancelled", requireOperationAuthority: candidate,
    });
  }

  async recordFailed(context, input) {
    const candidate = input?.operationAuthorityDigest !== undefined;
    return this.#transition(context, input, {
      predecessors: ["intent-recorded", "staging"], successor: "failed", cleanupState: "complete",
      eventType: "workspace-failed", inputSchema: candidate ? candidateTerminalTransitionSchema : terminalTransitionSchema,
      receiptOutcome: "failed", requireOperationAuthority: candidate,
    });
  }

  async recordTimedOut(context, input) {
    return this.#transition(context, input, {
      predecessors: ["staging"], successor: "failed", cleanupState: "complete",
      eventType: "workspace-timed-out", inputSchema: terminalTransitionSchema, receiptOutcome: "timed-out",
    });
  }

  async recordUnknown(context, input) {
    const candidate = input?.operationAuthorityDigest !== undefined;
    return this.#transition(context, input, {
      predecessors: ["intent-recorded", "staging", "published-pending-db", "ready"],
      successor: "unknown", cleanupState: "indeterminate", eventType: "workspace-unknown",
      inputSchema: candidate ? candidateTerminalTransitionSchema : terminalTransitionSchema,
      receiptOutcome: "unknown", requireOperationAuthority: candidate,
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
