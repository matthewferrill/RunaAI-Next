import { createHash } from "node:crypto";
import { z } from "zod";

export const MAX_FILES = 4;
export const MAX_PROJECT_BYTES = 4_000;
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_.-]{0,159}$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const FilePathSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,47}\.js$/)
  .refine(value => !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])\./i.test(value));
export const BindingSchema = z.object({ participantId: id, projectId: id, environmentId: id }).strict();
export const FileSchema = z.object({ path: FilePathSchema, content: z.string() }).strict();
export const ReferenceSchema = z.object({
  schemaVersion: z.literal("runa2-disposable-project-revision/v1"),
  bindingSha256: sha,
  environmentId: id,
  revisionId: z.string().regex(/^r-[a-f0-9]{64}$/),
  workspaceSha256: sha,
  files: z.array(z.object({ path: FilePathSchema, sha256: sha,
    bytes: z.number().int().nonnegative().max(MAX_PROJECT_BYTES) }).strict()).min(1).max(MAX_FILES),
}).strict();
export const CapabilityArguments = Object.freeze({
  "project.inspect": z.object({ path: FilePathSchema }).strict(),
  "project.preview-change": z.object({ path: FilePathSchema, content: z.string(), expectedSha256: sha.nullable() }).strict(),
  "project.apply-change": z.object({ path: FilePathSchema, content: z.string(), expectedSha256: sha.nullable() }).strict(),
  "project.run-tests": z.object({ suiteId: id }).strict(),
  // Only the authoritative task service resolves this from its own forward receipt.
  "project.restore": z.object({ targetReference: ReferenceSchema }).strict(),
});
export function failure(code) { return Object.assign(new Error(code), { code }); }
export function digest(value) { return createHash("sha256").update(value).digest("hex"); }
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export const bindingDigest = binding => digest(stableJson(BindingSchema.parse(binding)));
export function normalizeFiles(files) {
  const parsed = z.array(FileSchema).min(1).max(MAX_FILES).parse(files).sort((a, b) => a.path.localeCompare(b.path, "en"));
  if (new Set(parsed.map(file => file.path)).size !== parsed.length) throw failure("project-duplicate-path");
  if (parsed.some(file => new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(file.content)) !== file.content)) {
    throw failure("project-source-encoding-invalid");
  }
  if (parsed.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0) > MAX_PROJECT_BYTES) {
    throw failure("project-source-budget-exceeded");
  }
  return parsed;
}
export function describeFiles(files) {
  return normalizeFiles(files).map(file => ({ path: file.path, sha256: digest(file.content), bytes: Buffer.byteLength(file.content) }));
}
export const workspaceDigest = files => digest(stableJson(describeFiles(files)));
export function referenceFor(binding, revisionId, files) {
  return ReferenceSchema.parse({ schemaVersion: "runa2-disposable-project-revision/v1", bindingSha256: bindingDigest(binding),
    environmentId: binding.environmentId, revisionId, workspaceSha256: workspaceDigest(files), files: describeFiles(files) });
}
export function validateReference(binding, reference) {
  const parsed = ReferenceSchema.parse(reference);
  const manifest = parsed.files;
  if (parsed.bindingSha256 !== bindingDigest(binding) || parsed.environmentId !== binding.environmentId
    || new Set(manifest.map(file => file.path)).size !== manifest.length
    || stableJson(manifest) !== stableJson([...manifest].sort((a, b) => a.path.localeCompare(b.path, "en")))
    || digest(stableJson(manifest)) !== parsed.workspaceSha256
    || manifest.reduce((sum, file) => sum + file.bytes, 0) > MAX_PROJECT_BYTES) throw failure("project-reference-invalid");
  return parsed;
}
export const EffectIdSchema = id;
