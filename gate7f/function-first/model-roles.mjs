import { z } from "zod";

// Roles are chosen by application policy, never inferred from a model response.
export const MODEL_ROLES = Object.freeze(["chat", "research", "code", "review", "agent"]);
const schemaVersion = "runaai-model-roles/v1";
const roleSchema = z.enum(MODEL_ROLES);
const modelIdSchema = z.string().min(1).max(200).refine(value =>
  value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value), "Invalid model identifier.");

function safeProviderUrl(value) {
  if (!/^https?:\/\//iu.test(value) || /[\s\\?#]/u.test(value)) return false;
  try {
    const url = new URL(value);
    const authority = value.slice(value.indexOf("://") + 3).split("/")[0];
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname)
      && !url.username && !url.password && !authority.includes("@")
      && !url.search && !url.hash;
  } catch {
    return false;
  }
}

const baseUrlSchema = z.string().min(1).max(500)
  .refine(safeProviderUrl, "Invalid provider URL.");
const modelsSchema = z.object(Object.fromEntries(
  MODEL_ROLES.map(role => [role, modelIdSchema.nullable()]),
)).strict();

// No transforms/defaults: valid legacy inputs retain their exact values.
// Historical release parsing remains with that release's versioned schema.
export const legacyModelProviderSchema = z.object({
  baseUrl: baseUrlSchema,
  modelId: modelIdSchema,
}).strict();

export const explicitModelRolesSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  baseUrl: baseUrlSchema,
  models: modelsSchema,
}).strict();

const providerSchema = z.union([legacyModelProviderSchema, explicitModelRolesSchema]);
const invalid = () => Object.assign(new Error("The model role configuration or requested role is invalid."), {
  code: "model-role-invalid",
});

export function resolveModelRoles(provider) {
  const checked = providerSchema.safeParse(provider);
  if (!checked.success) throw invalid();
  const value = checked.data;
  const explicit = value.schemaVersion === schemaVersion;
  const models = explicit ? { ...value.models } : {
    chat: value.modelId,
    research: value.modelId,
    code: value.modelId,
    review: null,
    agent: null,
  };
  return Object.freeze({
    schemaVersion,
    baseUrl: value.baseUrl,
    models: Object.freeze(models),
    selectionMode: explicit ? "explicit-role-models" : "legacy-single-model",
  });
}

export function resolveModelRole(provider, role) {
  if (!roleSchema.safeParse(role).success) throw invalid();
  const selected = resolveModelRoles(provider);
  const modelId = selected.models[role];
  if (modelId === null) {
    throw Object.assign(new Error("No model is configured for the requested role."), {
      code: "model-role-unavailable",
    });
  }
  return Object.freeze({ baseURL: selected.baseUrl, modelId, role });
}
