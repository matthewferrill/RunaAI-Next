import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBrowserCheckpoint } from "./browser-checkpoint.mjs";
import { CONTROL_CASES } from "./cases.mjs";
import { newObservation, ObservationLedger } from "./runner-contract.mjs";

test("operator checkpoint consumes exact bound browser evidence without pretending to inspect a DOM", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "m1-browser-bridge-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const item = CONTROL_CASES.find(item => item.id === "control-10-unknown-execution");
  const ledger = new ObservationLedger(newObservation({ ...item, role: "control" }, { runtimeSealSha256: "a".repeat(64) }));
  const principalId = "m1-test-" + "a".repeat(32), session = { principalId, sessionId: "b".repeat(64) };
  let writer;
  const checkpoint = createBrowserCheckpoint({ directory, maximumWaitMs: 2000, announce(value) {
    writer = (async () => { const request = JSON.parse(await readFile(value.requestPath, "utf8")), descriptor = request.checks[0];
      await writeFile(request.ackPath, JSON.stringify({ schemaVersion: "runaai-m1-browser-checkpoint-ack/v1", checkpointId: request.checkpointId,
        caseId: item.id, runtimeSealSha256: request.runtimeSealSha256,
        evidence: [{ id: "unit-browser", source: "browser", kind: descriptor.kind,
          data: { checkId: descriptor.checkId, actual: true, note: "UNIT FIXTURE ONLY, not real browser qualification" } }],
        checks: [{ checkId: descriptor.checkId, kind: descriptor.kind, actual: true, evidenceRefs: [{ id: "unit-browser", pointer: "/actual" }] }] })); })();
  } });
  await checkpoint({ client: { ledger, item: { setup: { project: "fixture" } }, principalId, session, projectId: "fixture", experience: "code",
    host: { baseUrl: "http://127.0.0.1:12345", async createBootstrap(id, options) { assert.equal(id, principalId); assert.deepEqual(options.session, session);
      return { url: "http://127.0.0.1:12345/__acceptance/session", nonce: "synthetic-unit-nonce" }; } } }, phase: "unknown", stage: "unknown" });
  await writer; assert.equal(ledger.observation.checks.length, 1); assert.equal(ledger.observation.evidence[0].source, "browser");
  assert.match(ledger.observation.evidence[0].data.note, /UNIT FIXTURE ONLY/);
});
