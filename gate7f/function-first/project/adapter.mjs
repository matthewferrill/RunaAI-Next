import { z } from "zod";
import { CodeExecutionRequestSchema } from "../../../gate7e/contracts.mjs";
import { BindingSchema, CapabilityArguments, EffectIdSchema, ReferenceSchema, bindingDigest, describeFiles,
  digest, failure, normalizeFiles, referenceFor, stableJson, validateReference, workspaceDigest } from "./contracts.mjs";
import { revisionFilesystem, validateBaseDirectory } from "./filesystem.mjs";
import { buildTestBundle, compareTestReceipt, normalizeSuite } from "./test-harness.mjs";

const PreparedSchema = z.object({
  bindingSha256: z.string().regex(/^[a-f0-9]{64}$/), capabilityId: z.enum(Object.keys(CapabilityArguments)),
  arguments: z.unknown(), preconditionSha256: z.string().regex(/^[a-f0-9]{64}$/),
  beforeSha256: z.string().regex(/^[a-f0-9]{64}$/), beforeReference: ReferenceSchema,
  preview: z.unknown(), targetFiles: z.array(z.object({ path: z.string(), content: z.string() }).strict()).optional(),
}).strict();

/** Artifact bytes only. PostgreSQL, not this adapter, publishes the current revision. */
export class DisposableJavascriptProjectAdapter {
  constructor({ baseDirectory, executor, suites = {} }) {
    this.baseDirectory = validateBaseDirectory(baseDirectory);
    if (executor && typeof executor.execute !== "function") throw failure("project-executor-invalid");
    this.executor = executor;
    this.suites = new Map(Object.entries(suites).map(([name, value]) => {
      const suite = normalizeSuite(value);
      if (suite.suiteId !== name) throw failure("project-test-suite-invalid");
      return [name, suite];
    }));
  }

  async createEnvironment({ participantId, projectId, environmentId, files }) {
    const binding = BindingSchema.parse({ participantId, projectId, environmentId });
    files = normalizeFiles(files);
    const revisionId = `r-${digest(stableJson({ kind: "initial", binding, files: describeFiles(files) }))}`;
    const reference = referenceFor(binding, revisionId, files);
    const observed = await this._filesystem("create", binding, reference, files);
    this._verifySnapshot(binding, reference, observed);
    return reference;
  }

  async inspectRevision({ binding, reference }) {
    binding = BindingSchema.parse(binding);
    reference = validateReference(binding, reference);
    const observed = await this._filesystem("read", binding, reference);
    return this._verifySnapshot(binding, reference, observed);
  }

  async verifyMaterialized({ binding, reference }) { return this.inspectRevision({ binding, reference }); }

  async prepare({ binding, reference, capabilityId, args }) {
    binding = BindingSchema.parse(binding);
    if (!Object.hasOwn(CapabilityArguments, capabilityId)) throw failure("project-capability-unavailable");
    const arguments_ = CapabilityArguments[capabilityId].parse(args);
    const before = await this.inspectRevision({ binding, reference });
    let targetFiles;
    let preview;
    if (capabilityId === "project.inspect") {
      const file = before.files.find(file => file.path === arguments_.path);
      if (!file) throw failure("project-file-not-found");
      preview = { path: file.path, sha256: file.sha256, bytes: file.bytes, content: file.content };
    } else if (capabilityId === "project.run-tests") {
      const suite = this._suite(arguments_.suiteId);
      const bundle = buildTestBundle(before.files.map(({ path, content }) => ({ path, content })), suite);
      preview = { suiteId: suite.suiteId, suiteSha256: bundle.suiteSha256, testIds: suite.cases.map(test => test.testId) };
    } else if (capabilityId === "project.restore") {
      const target = await this.inspectRevision({ binding, reference: arguments_.targetReference });
      targetFiles = target.files.map(({ path, content }) => ({ path, content }));
      preview = { beforeSha256: before.workspaceSha256, afterSha256: target.workspaceSha256,
        changedPaths: changedPaths(before.files, target.files) };
    } else {
      const existing = before.files.find(file => file.path === arguments_.path);
      if ((existing?.sha256 ?? null) !== arguments_.expectedSha256) throw failure("project-stale-file");
      targetFiles = normalizeFiles([...before.files.filter(file => file.path !== arguments_.path)
        .map(({ path, content }) => ({ path, content })), { path: arguments_.path, content: arguments_.content }]);
      preview = { path: arguments_.path, beforeSha256: existing?.sha256 ?? null, afterSha256: digest(arguments_.content),
        beforeContent: existing?.content ?? null, afterContent: arguments_.content,
        workspaceSha256: workspaceDigest(targetFiles) };
    }
    return { bindingSha256: bindingDigest(binding), capabilityId, arguments: arguments_,
      preconditionSha256: before.workspaceSha256, beforeSha256: before.workspaceSha256,
      beforeReference: before.reference, preview, ...(targetFiles ? { targetFiles } : {}) };
  }

  async materialize({ binding, effectId, prepared, authorize, signal }) {
    const validated = await this._validatePrepared(binding, effectId, prepared);
    if (signal?.aborted) throw failure("project-operation-cancelled");
    if (authorize) await authorize();
    if (signal?.aborted) throw failure("project-operation-cancelled");
    if (validated.capabilityId === "project.restore") {
      // Restore is publication of an existing exact snapshot, never a filesystem overwrite.
      return this._result(validated, validated.arguments.targetReference);
    }
    const reference = this._stagedReference(binding, effectId, validated);
    const observed = await this._filesystem("create", binding, reference, validated.targetFiles);
    this._verifySnapshot(binding, reference, observed);
    return this._result(validated, reference);
  }

  async observeMaterialized({ binding, effectId, prepared }) {
    const validated = await this._validatePrepared(binding, effectId, prepared);
    if (validated.capabilityId === "project.restore") return { status: "present",
      result: this._result(validated, validated.arguments.targetReference) };
    const reference = this._stagedReference(binding, effectId, validated);
    const observed = await this._filesystem("observe", binding, reference);
    if (observed.status === "absent") return { status: "absent" };
    this._verifySnapshot(binding, reference, observed);
    return { status: "present", result: this._result(validated, reference) };
  }

  async executeTests({ binding, effectId, reference, suiteId, signal, authorize }) {
    binding = BindingSchema.parse(binding); EffectIdSchema.parse(effectId);
    const snapshot = await this.inspectRevision({ binding, reference });
    const bundle = buildTestBundle(snapshot.files.map(({ path, content }) => ({ path, content })), this._suite(suiteId));
    if (!this.executor) throw failure("project-executor-unavailable");
    const request = CodeExecutionRequestSchema.parse({ schemaVersion: "runa2-code-execution-request/v1", requestId: effectId,
      participant: { principalId: binding.participantId, verified: true }, project: { projectId: binding.projectId },
      thread: { threadId: binding.environmentId }, experience: "code", language: "javascript", source: bundle.source,
      origin: { type: "authenticated-user-run-action" } });
    if (signal?.aborted) throw failure("project-operation-cancelled");
    if (authorize) await authorize();
    if (signal?.aborted) throw failure("project-operation-cancelled");
    // Gate7E has no external cancel handle. An already-started run drains within its
    // existing hard ceilings; retain the real receipt and let the task service stop
    // subsequent work/publication. Never stamp a completed run as "never executed".
    const receipt = await this.executor.execute(request);
    const result = compareTestReceipt(receipt, request, bundle);
    return { ...result, workspaceSha256: snapshot.workspaceSha256 };
  }

  async _validatePrepared(binding, effectId, prepared) {
    BindingSchema.parse(binding); EffectIdSchema.parse(effectId);
    prepared = PreparedSchema.parse(prepared);
    if (!["project.apply-change", "project.restore"].includes(prepared.capabilityId)) throw failure("project-materialization-not-authorized");
    if (prepared.bindingSha256 !== bindingDigest(binding)) throw failure("project-prepared-binding-mismatch");
    const current = await this.prepare({ binding, reference: prepared.beforeReference,
      capabilityId: prepared.capabilityId, args: prepared.arguments });
    if (stableJson(current) !== stableJson(prepared)) throw failure("project-prepared-integrity-mismatch");
    return current;
  }

  _stagedReference(binding, effectId, prepared) {
    const revisionId = `r-${digest(stableJson({ bindingSha256: bindingDigest(binding), effectId,
      preparedSha256: digest(stableJson(prepared)) }))}`;
    return referenceFor(binding, revisionId, prepared.targetFiles);
  }

  _result(prepared, reference) {
    return { status: "materialized", reference, beforeSha256: prepared.beforeSha256, afterSha256: reference.workspaceSha256,
      output: { changedPaths: changedPaths(prepared.beforeReference.files, reference.files) },
      rollbackReference: prepared.beforeReference };
  }

  _suite(suiteId) {
    const suite = this.suites.get(suiteId);
    if (!suite) throw failure("project-test-suite-unavailable");
    return suite;
  }

  _filesystem(operation, binding, reference, files = reference.files) {
    return revisionFilesystem({ operation, baseDirectory: this.baseDirectory, environmentDirectory: `e-${bindingDigest(binding)}`,
      revisionId: reference.revisionId, files });
  }

  _verifySnapshot(binding, reference, observed) {
    if (observed.status !== "present") throw failure("project-revision-unavailable");
    const files = normalizeFiles(observed.files);
    if (stableJson(referenceFor(binding, reference.revisionId, files)) !== stableJson(reference)) throw failure("project-revision-integrity-mismatch");
    return { reference, workspaceSha256: reference.workspaceSha256,
      files: files.map(file => ({ ...file, sha256: digest(file.content), bytes: Buffer.byteLength(file.content) })) };
  }
}

function changedPaths(before, after) {
  const values = new Map(before.map(file => [file.path, file.sha256 ?? digest(file.content)]));
  const updated = new Map(after.map(file => [file.path, file.sha256 ?? digest(file.content)]));
  return [...new Set([...values.keys(), ...updated.keys()])].sort().filter(path => values.get(path) !== updated.get(path));
}
