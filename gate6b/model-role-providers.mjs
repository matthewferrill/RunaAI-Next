import { MastraAnswerProvider } from "../gate1/adapters/mastra-provider.mjs";
import { canonicalJson, sha256 } from "../gate4/canonical.mjs";
import { resolveModelRoles } from "../gate7f/function-first/model-roles.mjs";

export const ANSWER_MODEL_ROLES = Object.freeze(["chat", "research", "code"]);
const providerName = "private-openai-compatible";
const coded = (code, message) => Object.assign(new Error(message), { code });

export function createReleaseAnswerProviders(provider, {
  createProvider = options => new MastraAnswerProvider(options),
  requestControls = null,
} = {}) {
  const selected = resolveModelRoles(provider);
  return Object.freeze(Object.fromEntries(ANSWER_MODEL_ROLES.map(role => {
    const modelId = selected.models[role];
    // Keep a registered provider so the existing answer path returns its typed unavailable
    // response without saving a completed turn. Never substitute another role's model.
    if (modelId === null) return [role, Object.freeze({ role, modelId: null,
      async answer() { throw coded("provider-role-unavailable", "The selected model role is disabled."); },
    })];
    return [role, createProvider({ baseURL: selected.baseUrl, modelId, role, providerName,
      ...(requestControls ? { reasoningEffort: requestControls[role]?.reasoningEffort ?? null, preventRedirects: true } : {}) })];
  })));
}

export function releaseModelIdentity(provider) {
  const selected = resolveModelRoles(provider);
  const configurationDigest = sha256(canonicalJson(provider));
  return Object.freeze(selected.selectionMode === "legacy-single-model"
    ? { provider: providerName, modelId: provider.modelId, configurationDigest }
    : { provider: providerName, models: selected.models, configurationDigest });
}

export function assertConfiguredReleaseModel(manifest, config) {
  const legacy = config.schemaVersion === "runa2-gate6b-release-config/v1";
  const explicit = ["runa2-gate6b-release-config/v2", "runa2-gate6b-release-config/v3"]
    .includes(config.schemaVersion);
  const expectedVersion = legacy ? "runa2-gate6-release/v1" : "runa2-gate6-release/v2";
  if ((!legacy && !explicit) || manifest.schemaVersion !== expectedVersion
      || canonicalJson(manifest.model) !== canonicalJson(releaseModelIdentity(config.provider))) {
    throw coded("release-model-config-mismatch", "The release model selections do not match the configuration.");
  }
}
