import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { finalExportManifest } from "./export-final-evidence.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "runa-final-export-test-"));
  const save = (name, value) => { const file = path.join(root, name); mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value)); };
  save("package-manifest.json", { fixture: true }); save("power-before.json", {}); save("power-applied.json", {});
  const arms = ["incumbent", "gemma26"].map(candidate => {
    const result = { schemaVersion: "runa2-qualification-capture-result/v1", candidate, phase: "acceptance-power-v2",
      passed: true, cleanupVerified: true, observed: 256, endedAt: "2026-08-27T19:00:00Z" };
    save("qualification/capture-" + candidate + "/result.json", result);
    save("qualification/capture-" + candidate + "/events.jsonl", "{\"fixture\":true}\n");
    return { candidate, exitCode: 0, result };
  });
  const operator = { schemaVersion: "runa2-qualification-controlled-power/v1", time: "2026-08-27T19:01:00Z",
    powerRestored: true, failure: null, arms };
  save("power-result.json", operator);
  return { root, save, operator, pin: sha(readFileSync(path.join(root, "package-manifest.json"))),
    cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
test("final export binds seven exact files without printing answer contents", () => {
  const f = fixture(); try {
    const result = finalExportManifest(f.root, f.pin, "2026-08-27T19:02:00Z");
    assert.equal(Object.keys(result.files).length, 7); assert.equal(result.answersPrinted, false);
    assert.equal(result.operatorPowerRestored, true); assert.equal(result.captureResults.length, 2);
    for (const [name, pin] of Object.entries(result.files)) {
      const bytes = readFileSync(path.join(f.root, name)); assert.equal(pin.bytes, bytes.length); assert.equal(pin.sha256, sha(bytes));
    }
    assert.throws(() => finalExportManifest(f.root, "0".repeat(64)), /package-pin/);
    assert.throws(() => finalExportManifest(f.root, f.pin, "1970-01-01T00:00:00Z"), /clock/);
  } finally { f.cleanup(); }
});
test("failed arms and unverified power restoration remain exportable evidence, never hidden passes", () => {
  const f = fixture(); try {
    const arm = f.operator.arms[1]; arm.result.passed = false; arm.result.observed = 7; arm.exitCode = 1;
    f.save("qualification/capture-gemma26/result.json", arm.result);
    f.operator.powerRestored = false; f.operator.failure = "qualification-power-restore-unverified";
    f.save("power-result.json", f.operator);
    const result = finalExportManifest(f.root, f.pin, "2026-08-27T19:02:00Z");
    assert.equal(result.captureResults[1].passed, false); assert.equal(result.captureResults[1].observed, 7);
    assert.equal(result.operatorPowerRestored, false); assert.equal(result.operatorFailure, f.operator.failure);
  } finally { f.cleanup(); }
});
test("operator/capture disagreement and duplicate arms cannot be exported as a consistent set", () => {
  const f = fixture(); try {
    f.operator.arms[1].result.observed = 7; f.save("power-result.json", f.operator);
    assert.throws(() => finalExportManifest(f.root, f.pin), /operator-result-mismatch/);
    f.operator.arms[1] = f.operator.arms[0]; f.save("power-result.json", f.operator);
    assert.throws(() => finalExportManifest(f.root, f.pin), /arm-set/);
  } finally { f.cleanup(); }
});
