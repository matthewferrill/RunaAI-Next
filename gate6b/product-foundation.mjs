const coded = (code, message) => Object.assign(new Error(message), { code });

export const USER_SETTING_DEFINITIONS = Object.freeze({
  theme: Object.freeze({ defaultValue: "system", values: Object.freeze(["system", "dawn", "dark"]) }),
  textSize: Object.freeze({ defaultValue: "medium", values: Object.freeze(["small", "medium", "large"]) }),
  density: Object.freeze({ defaultValue: "comfortable", values: Object.freeze(["comfortable", "compact"]) }),
  reducedMotion: Object.freeze({ defaultValue: "system", values: Object.freeze(["system", "reduce", "allow"]) }),
  defaultIntelligenceLevel: Object.freeze({ defaultValue: "Medium", values: Object.freeze(["Low", "Medium", "High"]), governed: true }),
});

export function defaultUserSettings() {
  return Object.freeze(Object.fromEntries(Object.entries(USER_SETTING_DEFINITIONS)
    .map(([key, definition]) => [key, definition.defaultValue])));
}

export function validateUserSetting(key, value, { permitGoverned = false } = {}) {
  const definition = USER_SETTING_DEFINITIONS[key];
  if (!definition) throw coded("setting-key-invalid", "That setting is not available in this release.");
  if (definition.governed && !permitGoverned) {
    throw coded("setting-approval-required", "That setting uses the governed proposal and approval flow.");
  }
  if (!definition.values.includes(value)) throw coded("setting-value-invalid", "That setting value is unavailable.");
  return Object.freeze({ key, value, governed: definition.governed === true });
}

export function validateConversationOperation(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw coded("conversation-operation-invalid", "A conversation operation is required.");
  }
  const action = String(input.action ?? "");
  if (!["rename", "archive", "unarchive", "delete", "branch", "search", "archived"].includes(action)) {
    throw coded("conversation-action-invalid", "That conversation action is unavailable.");
  }
  const experience = String(input.experience ?? "");
  if (!["chat", "code"].includes(experience)) {
    throw coded("request-experience-invalid", "Chat or Code experience is required.");
  }
  const requestId = String(input.requestId ?? "").trim();
  if (!requestId || requestId.length > 160 || /[\u0000-\u001f\u007f]/u.test(requestId)) {
    throw coded("request-id-invalid", "A bounded request id is required.");
  }
  if (action === "archived") return Object.freeze({ action, experience, requestId });
  if (action === "search") {
    const query = String(input.query ?? "").replace(/\s+/gu, " ").trim();
    if (!query || query.length > 120 || /[\u0000-\u001f\u007f]/u.test(query)) {
      throw coded("conversation-query-invalid", "A search between one and 120 characters is required.");
    }
    return Object.freeze({ action, experience, requestId, query });
  }
  const chatId = String(input.chatId ?? "").trim();
  if (!chatId || chatId.length > 160 || /[\u0000-\u001f\u007f]/u.test(chatId)) {
    throw coded("chat-id-invalid", "A bounded chat id is required.");
  }
  if (action === "rename") {
    const title = String(input.title ?? "").replace(/\s+/gu, " ").trim();
    if (!title || title.length > 120 || /[\u0000-\u001f\u007f]/u.test(title)) {
      throw coded("chat-title-invalid", "A title between one and 120 characters is required.");
    }
    return Object.freeze({ action, experience, requestId, chatId, title });
  }
  return Object.freeze({ action, experience, requestId, chatId });
}

function stateFromReadiness(readiness) {
  if (readiness?.authority === "active" && readiness?.dependencies?.ready === true) return "ready";
  if (readiness?.authority === "unavailable" || !readiness?.dependencies) return "unavailable";
  return "degraded";
}

export function composeUserSystemStatus({ runtime, readiness, client = {} }) {
  const dependencies = readiness?.dependencies?.dependencies ?? {};
  const state = stateFromReadiness(readiness);
  const homeReachable = dependencies.provider === true;
  return Object.freeze({
    schemaVersion: "runaai-user-system-status/v1",
    state,
    observedAt: new Date().toISOString(),
    omen: Object.freeze({
      state: client.connected === true ? "connected" : "unknown",
      observation: "browser-request",
      deviceIdentity: "unverified",
    }),
    control: Object.freeze({
      state,
      releaseId: runtime?.running?.releaseId ?? null,
      commit: runtime?.running?.commit ?? null,
      artifactVerified: readiness?.artifact?.verified === true,
      authority: readiness?.authority ?? "unavailable",
      dependencies: Object.freeze({ ...dependencies }),
    }),
    home: Object.freeze({
      state: homeReachable ? "reachable" : dependencies.provider === false ? "unavailable" : "unknown",
      configuredModel: runtime?.model?.modelId ?? null,
      provider: runtime?.model?.provider ?? null,
      lease: "unknown",
      residency: "unknown",
      explanation: homeReachable
        ? "The configured provider answered its health probe. Lease and resident-model state were not observed by this request."
        : "The configured provider did not prove reachability. No model authority is inferred.",
    }),
    privateValuesIncluded: false,
  });
}

export const CONNECTION_BASELINE = Object.freeze([
  Object.freeze({ id: "local-folders", label: "Local folders", lifecycle: "known", enabled: false }),
  Object.freeze({ id: "local-git", label: "Local Git", lifecycle: "known", enabled: false }),
  Object.freeze({ id: "github", label: "GitHub", lifecycle: "not-configured", enabled: false }),
  Object.freeze({ id: "web-research", label: "Web research", lifecycle: "not-configured", enabled: false }),
]);
