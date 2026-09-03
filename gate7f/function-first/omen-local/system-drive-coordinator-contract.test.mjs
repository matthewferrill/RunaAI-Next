import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("production coordinator trace executes every failure, crash, write, cleanup, and result boundary", () => {
  const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", new URL("./RunaCoordinatorTrace.test.ps1", import.meta.url).pathname.slice(1).replaceAll("/", "\\")],
  { encoding: "utf8", timeout: 30_000 });
  const record = JSON.parse(output.trim());
  assert.deepEqual(Object.keys(record), ["schemaVersion","passed","caseCount","probeOrderRejected",
    "terminalWithoutWriteRejected","wrongCompletionRejected","privateValuesIncluded"]);
  assert.equal(record.schemaVersion, "runa-omen-coordinator-trace-smoke/v1");
  assert.equal(record.passed, true); assert.equal(record.caseCount, 33);
  assert.equal(record.probeOrderRejected, true); assert.equal(record.terminalWithoutWriteRejected, true);
  assert.equal(record.wrongCompletionRejected, true); assert.equal(record.privateValuesIncluded, false);
});
