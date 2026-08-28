import test from "node:test";
import assert from "node:assert/strict";
import { validateHealthBrowserAck } from "./health-app-smoke.mjs";

const binding = { smokeId: "smoke", sourceCommit: "a".repeat(40), baseUrl: "http://127.0.0.1:54444", startedAt: new Date(Date.now() - 60000).toISOString() };
const ack = () => ({ schemaVersion: "runaai-m1-health-browser-ack/v1", smokeId: binding.smokeId, sourceCommit: binding.sourceCommit,
  observations: ["initial-load", "reload"].map((action, index) => ({ source: "browser", action, url: `${binding.baseUrl}/`,
    observedAt: new Date(Date.now() - 40000 + index * 20000).toISOString(), domText: "Synthetic ordinary tester\nChat with Runa" })) });
test("health smoke requires exact source/session host and two real DOM observations over the interval", () => {
  assert.deepEqual(validateHealthBrowserAck(ack(), binding).smokeId, "smoke");
  for (const change of [value => { value.sourceCommit = "b".repeat(40); }, value => { value.observations.pop(); },
    value => { value.observations[1].source = "application"; }, value => { value.observations[1].action = "initial-load"; },
    value => { value.observations[1].url = "http://127.0.0.1:12345/"; }, value => { value.observations[1].domText = "Runa's service status is unavailable. No authority is inferred."; },
    value => { value.observations[1].observedAt = value.observations[0].observedAt; }]) {
    const invalid = ack(); change(invalid); assert.throws(() => validateHealthBrowserAck(invalid, binding), /m1-health-browser/);
  }
});
