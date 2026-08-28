import test from "node:test";
import assert from "node:assert/strict";
import { PostgresSuppliedSourceStore } from "./sources.mjs";

const context = { principalId: "synthetic-user", projectId: "synthetic-project", sessionId: "synthetic-session" };
for (const [name, content] of [
  ["empty", ""], ["whitespace", " \t\r\n\ufeff"],
  ["raw over limit despite short trimmed text", " ".repeat(8_000) + "x"],
  ["unpaired high surrogate", "source\ud800"], ["unpaired low surrogate", "\udc00source"],
]) test(`source input rejects ${name} before database or index access`, async () => {
  let calls = 0;
  const source = new PostgresSuppliedSourceStore({
    pool: { async connect() { calls++; throw new Error("unexpected-database-access"); } },
    cipher: { encrypt() { calls++; } }, index: { async upsert() { calls++; } },
  });
  await assert.rejects(source.attach(context, { requestId: "source-request", label: "Source", content }),
    error => error.name === "ZodError");
  assert.equal(calls, 0);
});
for (const content of ["  indented\n", "\ufeffUnicode: π 😀\r\n", " ".repeat(7_999) + "x"])
  test(`valid source reaches the store without relaxing the raw limit (${content.length} code units)`, async () => {
    let calls = 0;
    const source = new PostgresSuppliedSourceStore({ pool: { async connect() {
      calls++; throw new Error("expected-database-boundary");
    } } });
    await assert.rejects(source.attach(context, { requestId: "source-request", label: "Source", content }),
      /expected-database-boundary/);
    assert.equal(calls, 1);
  });
