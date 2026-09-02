import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { sha256 } from "../../gate4/canonical.mjs";
import { qualifiedDeploymentFixture } from "./deployment.fixtures.mjs";
import { parseVerificationArguments, runVerificationCli, verifySuccessorFiles } from "./verify-successor.mjs";

// Actual bounded temporary file I/O for the verifier, not product deployment.
async function filesFixture() {
  const root = await mkdtemp(join(tmpdir(), "runa-m1-deployment-verifier-"));
  const fixture = qualifiedDeploymentFixture(), input = fixture.inputs();
  const focusedRoot = new URL("./readiness/evidence/20260902-focused-gemma-review/", import.meta.url);
  const contents = { "prior.json": Buffer.from(JSON.stringify(input.prior)), "successor.json": Buffer.from(JSON.stringify(input.successor)),
    "plan.json": Buffer.from(JSON.stringify(input.plan)), "grades.json": input.gradesBytes, "runtime-seal.json": input.runtimeSealBytes,
    "focused-review-grade.json": Buffer.from(await readFile(new URL("focused-review-grade.json", focusedRoot))),
    "focused-review-answer.json": Buffer.from(await readFile(new URL("focused-review-20260902-f17e80070418.json", focusedRoot))),
    "focused-review-checker.json": Buffer.from(await readFile(new URL("focused-review-checker-20260902-cb6e5785b5af.json", focusedRoot))) };
  for (const [name, value] of Object.entries(contents)) await writeFile(join(root, name), value, { flag: "wx" });
  const args = { prior: join(root, "prior.json"), successor: join(root, "successor.json"), plan: join(root, "plan.json"),
    grades: join(root, "grades.json"), "runtime-seal": join(root, "runtime-seal.json"), "expected-source-commit": input.expectedSourceCommit,
    "focused-review-grade": join(root, "focused-review-grade.json"), "focused-review-answer": join(root, "focused-review-answer.json"),
    "focused-review-checker": join(root, "focused-review-checker.json"),
    "expected-plan-sha256": sha256(contents["plan.json"]) };
  return { root, args, contents, async close() {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.match(root.slice(dirname(root).length + 1), /^runa-m1-deployment-verifier-/u);
    await rm(root, { recursive: true, force: true });
  } };
}
const argv = value => Object.entries(value).flatMap(([key, value]) => [`--${key}`, value]);

test("CLI requires all exact known fields, source commit and external plan digest", () => {
  assert.throws(() => parseVerificationArguments([]), /arguments-invalid/);
  assert.throws(() => parseVerificationArguments(["--prior", "a", "--prior", "b"]), /arguments-invalid/);
  assert.throws(() => parseVerificationArguments(["--override", "true"]), /arguments-invalid/);
});

test("actual file verifier reads a coherent sealed candidate without modifying any file", async () => {
  const fixture = await filesFixture();
  try {
    const result = await verifySuccessorFiles(parseVerificationArguments(argv(fixture.args)));
    assert.equal(result.passed, true); assert.equal(result.productionChanged, false);
    assert.deepEqual((await readdir(fixture.root)).sort(), Object.keys(fixture.contents).sort());
    for (const [name, value] of Object.entries(fixture.contents)) assert.deepEqual(await readFile(join(fixture.root, name)), value);
  } finally { await fixture.close(); }
});

test("plan reread is pinned and CLI failures disclose no private config/path/error stack", async () => {
  const fixture = await filesFixture();
  try {
    await writeFile(fixture.args.plan, Buffer.from('{"private":"do-not-display-this-secret"}'));
    let output = "";
    const code = await runVerificationCli(argv(fixture.args), text => { output += text; });
    assert.equal(code, 1); const record = JSON.parse(output);
    assert.equal(record.passed, false); assert.equal(record.errorCode, "m1-deploy-plan-byte-mismatch");
    assert.equal(record.privateValuesIncluded, false);
    assert.equal(output.includes("do-not-display-this-secret"), false); assert.equal(output.includes(fixture.root), false);
    assert.equal(output.includes("AssertionError"), false);
  } finally { await fixture.close(); }
});

test("missing files cannot leak filenames or private values through standard errors", async () => {
  const fixture = await filesFixture();
  try {
    fixture.args.grades = join(fixture.root, "private-sentinel-missing.json");
    let output = ""; assert.equal(await runVerificationCli(argv(fixture.args), text => { output += text; }), 1);
    assert.equal(JSON.parse(output).errorCode, "m1-deploy-evidence-read-failed");
    assert.equal(output.includes("private-sentinel"), false);
  } finally { await fixture.close(); }
});
