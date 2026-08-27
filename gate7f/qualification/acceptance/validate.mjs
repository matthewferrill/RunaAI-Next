import assert from "node:assert/strict";

export function validateAcceptanceCorpus(corpus) {
  assert.equal(corpus.schemaVersion, "runa2-gate7f-qualification-acceptance/v1");
  assert.equal(corpus.attemptsPerCase, 3);
  assert.ok(corpus.cases.length >= 30);
  const ids = new Set();
  const roles = new Set(["ordinary-chat", "read-only-evidence-code", "agent-proposal"]);
  const modes = new Set(["text", "agent-json", "native-tool"]);
  for (const item of corpus.cases) {
    assert.match(item.id, /^[a-z][a-z0-9-]+$/);
    assert.ok(!ids.has(item.id), "Duplicate case id");
    ids.add(item.id);
    assert.ok(Array.isArray(item.roles) && item.roles.length > 0 && item.roles.every(role => roles.has(role)));
    assert.ok(modes.has(item.mode));
    assert.ok(Array.isArray(item.messages) && item.messages.length > 0);
    assert.equal(typeof item.critical, "boolean");
    assert.ok(Array.isArray(item.expected.checks));
    assert.ok(Array.isArray(item.rubric.must) && item.rubric.must.length > 0);
    assert.ok(Array.isArray(item.rubric.ordinaryErrors));
    assert.ok(Array.isArray(item.rubric.criticalErrors));
    assert.ok(Array.isArray(item.rubric.acceptableVariations));
    const callIds = new Set();
    for (const message of item.messages) {
      assert.ok(["system", "user", "assistant", "tool"].includes(message.role));
      assert.ok(typeof message.content === "string" || (message.role === "assistant" && message.content === null));
      if (message.role === "tool") assert.ok(callIds.has(message.tool_call_id), "Tool output must have a preceding call");
      for (const call of message.tool_calls ?? []) {
        assert.equal(message.role, "assistant");
        assert.equal(call.type, "function");
        assert.ok(!callIds.has(call.id));
        callIds.add(call.id);
        assert.equal(typeof JSON.parse(call.function.arguments), "object");
        assert.ok(item.tools.some(tool => tool.function.name === call.function.name));
      }
    }
    if (item.mode === "agent-json") assert.ok(item.capabilities?.length);
    if (item.mode === "native-tool") assert.ok(item.tools?.length);
    for (const [index, turn] of (item.turns ?? []).entries()) {
      assert.equal(typeof turn.user, "string");
      assert.ok(turn.user.length > 0);
      assert.ok(Array.isArray(item.expected.turns?.[index + 1]?.checks));
      assert.ok(item.rubric.turns?.[index + 1]?.must.length > 0);
    }
  }
  for (const role of roles) assert.ok(corpus.cases.filter(item => item.roles.includes(role)).length >= 5);
  return true;
}
