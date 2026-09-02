import test from "node:test";
import assert from "node:assert/strict";
import { composeUserSystemStatus, defaultUserSettings, validateConversationOperation,
  validateUserSetting } from "../../gate6b/product-foundation.mjs";

test("user settings are closed, bounded and keep intelligence governed", () => {
  assert.deepEqual(defaultUserSettings(), { theme: "system", textSize: "medium", density: "comfortable",
    reducedMotion: "system", defaultIntelligenceLevel: "Medium" });
  assert.deepEqual(validateUserSetting("theme", "dark"), { key: "theme", value: "dark", governed: false });
  assert.throws(() => validateUserSetting("defaultIntelligenceLevel", "High"), /governed proposal/u);
  assert.deepEqual(validateUserSetting("defaultIntelligenceLevel", "High", { permitGoverned: true }),
    { key: "defaultIntelligenceLevel", value: "High", governed: true });
  for (const [key, value] of [["other", "dark"], ["theme", "other"], ["density", "dense"]]) {
    assert.throws(() => validateUserSetting(key, value));
  }
});

test("conversation operations reject unbounded and cross-experience shapes", () => {
  const base = { requestId: "request-1", experience: "chat", chatId: "chat-1" };
  assert.deepEqual(validateConversationOperation({ ...base, action: "archive" }), { ...base, action: "archive" });
  assert.equal(validateConversationOperation({ ...base, action: "rename", title: "  Useful   title " }).title,
    "Useful title");
  assert.equal(validateConversationOperation({ ...base, action: "search", query: "  settings  " }).query, "settings");
  assert.deepEqual(validateConversationOperation({ action: "archived", requestId: "request-2", experience: "code" }),
    { action: "archived", requestId: "request-2", experience: "code" });
  for (const value of [{ ...base, action: "purge" }, { ...base, action: "archive", experience: "review" },
    { ...base, action: "rename", title: "" }, { ...base, action: "search", query: "\u0000" }]) {
    assert.throws(() => validateConversationOperation(value));
  }
});

test("system status distinguishes browser, Control and Home observations", () => {
  const ready = composeUserSystemStatus({
    runtime: { running: { releaseId: "release-1", commit: "a".repeat(40) },
      model: { provider: "private-openai-compatible", modelId: "gemma-4-26b-a4b-it-qat" } },
    readiness: { authority: "active", artifact: { verified: true },
      dependencies: { ready: true, dependencies: { postgresql: true, provider: true } } },
    client: { connected: true },
  });
  assert.equal(ready.state, "ready");
  assert.equal(ready.omen.state, "connected");
  assert.equal(ready.omen.deviceIdentity, "unverified");
  assert.equal(ready.control.commit, "a".repeat(40));
  assert.equal(ready.home.state, "reachable");
  assert.equal(ready.home.configuredModel, "gemma-4-26b-a4b-it-qat");
  assert.equal(ready.home.lease, "unknown");
  assert.equal(ready.home.residency, "unknown");

  const unavailable = composeUserSystemStatus({ runtime: {}, readiness: { authority: "unavailable" }, client: {} });
  assert.equal(unavailable.state, "unavailable");
  assert.equal(unavailable.omen.state, "unknown");
  assert.equal(unavailable.home.state, "unknown");
});
