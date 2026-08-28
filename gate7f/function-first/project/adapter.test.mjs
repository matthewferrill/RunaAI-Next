import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, link, symlink, mkdir, rename } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { getQuickJS } from "quickjs-emscripten";
import { DisposableJavascriptProjectAdapter } from "./adapter.mjs";
import { bindingDigest, digest, normalizeFiles, stableJson } from "./contracts.mjs";
import { buildTestBundle, compareTestReceipt } from "./test-harness.mjs";

const binding = { participantId: "synthetic-owner", projectId: "synthetic-project", environmentId: "synthetic-code" };
const add = "exports.add = (a, b) => a + b;";
const initialFiles = [{ path: "main.js", content: add }];
const addition = { suiteId: "addition", cases: [
  { testId: "positive", exportName: "add", args: [14, 12], expected: 26 },
  { testId: "negative", exportName: "add", args: [-5, 3], expected: -2 },
] };
const suiteMap = { addition };

// Real QuickJS language semantics, deliberately NOT MXC/isolation qualification.
// This test double stamps synthetic transport receipts solely to exercise host validation.
async function quickJsReceipt(request) {
  const vm = await getQuickJS(); const runtime = vm.newRuntime();
  runtime.setMemoryLimit(16_777_216); runtime.setMaxStackSize(524_288);
  const deadline = Date.now() + 1_200; runtime.setInterruptHandler(() => Date.now() > deadline);
  const context = runtime.newContext(); let stdout = "";
  try {
    const consoleObject = context.newObject();
    const log = context.newFunction("log", value => { stdout += `${context.dump(value)}\n`; return context.undefined; });
    context.setProp(consoleObject, "log", log); log.dispose();
    context.setProp(context.global, "console", consoleObject); consoleObject.dispose();
    const outcome = context.evalCode(request.source);
    if (outcome.error) { const problem = context.dump(outcome.error); outcome.error.dispose(); throw new Error(JSON.stringify(problem)); }
    outcome.value.dispose();
  } finally { context.dispose(); runtime.dispose(); }
  return receiptFor(request, stdout);
}
function receiptFor(request, stdout) {
  return { schemaVersion: "runa2-code-execution-receipt/v1", receiptId: "synthetic-unit-receipt", requestId: request.requestId,
    participantId: request.participant.principalId, projectId: request.project.projectId, threadId: request.thread.threadId,
    status: "executed", language: "javascript", sourceSha256: digest(request.source),
    runtime: { engine: "quickjs", package: "quickjs-emscripten", packageVersion: "0.32.0", host: "node", hostVersion: process.version },
    isolation: { provider: "microsoft-mxc", packageVersion: "0.8.0", method: "processcontainer", tier: "appcontainer-dacl",
      filesystem: "read-only-runtime-and-private-source-directory", network: "deny-all", environment: "empty", ui: "win32k-compatible-job-restricted" },
    limits: { sourceBytes: Buffer.byteLength(request.source), maximumSourceBytes: 8_000, wallClockMs: 2_000,
      quickJsDeadlineMs: 1_200, maximumOutputBytes: 16_000, quickJsMemoryBytes: 16_777_216, quickJsStackBytes: 524_288, processLimit: 1, stdin: "closed" },
    output: { stdout, stderr: "", combinedBytes: Buffer.byteLength(stdout), partialDelivered: false },
    exitCode: 0, errorCode: null, durationMs: 1, systemStamped: true, effects: [] };
}
function requestFor(bundle) {
  return { schemaVersion: "runa2-code-execution-request/v1", requestId: "synthetic-effect",
    participant: { principalId: binding.participantId, verified: true }, project: { projectId: binding.projectId },
    thread: { threadId: binding.environmentId }, experience: "code", language: "javascript", source: bundle.source,
    origin: { type: "authenticated-user-run-action" } };
}
async function fixture(t, executor = { execute: quickJsReceipt }) {
  const directory = await mkdtemp(path.join(tmpdir(), "runa-m1-project-test-"));
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
    assert.ok(path.basename(resolved).startsWith("runa-m1-project-test-"));
    await rm(resolved, { recursive: true, force: true, maxRetries: 3 });
  });
  const adapter = new DisposableJavascriptProjectAdapter({ baseDirectory: path.join(directory, "artifacts"), executor, suites: suiteMap });
  const reference = await adapter.createEnvironment({ ...binding, files: initialFiles });
  const revisionPath = ref => path.join(adapter.baseDirectory, `e-${bindingDigest(binding)}`, ref.revisionId);
  return { directory, adapter, reference, revisionPath };
}

test("actual immutable files: inspect, preview, stage, reconcile and exact restore do not publish or overwrite", async t => {
  const { adapter, reference, revisionPath } = await fixture(t);
  const first = await adapter.inspectRevision({ binding, reference });
  assert.equal(first.files[0].content, add);
  assert.equal(await readFile(path.join(revisionPath(reference), "main.js"), "utf8"), add);
  const args = { path: "main.js", content: "exports.add=(a,b)=>a-b;", expectedSha256: digest(add) };
  const preview = await adapter.prepare({ binding, reference, capabilityId: "project.preview-change", args });
  await assert.rejects(adapter.materialize({ binding, effectId: "preview", prepared: preview }), /not-authorized/);
  const prepared = await adapter.prepare({ binding, reference, capabilityId: "project.apply-change", args });
  assert.deepEqual(await adapter.observeMaterialized({ binding, effectId: "edit-1", prepared }), { status: "absent" });
  const result = await adapter.materialize({ binding, effectId: "edit-1", prepared });
  assert.deepEqual(await adapter.materialize({ binding, effectId: "edit-1", prepared }), result);
  assert.deepEqual(await adapter.observeMaterialized({ binding, effectId: "edit-1", prepared }), { status: "present", result });
  assert.equal(await readFile(path.join(revisionPath(reference), "main.js"), "utf8"), add);
  assert.equal(await readFile(path.join(revisionPath(result.reference), "main.js"), "utf8"), args.content);
  const restore = await adapter.prepare({ binding, reference: result.reference, capabilityId: "project.restore", args: { targetReference: result.rollbackReference } });
  const restored = await adapter.materialize({ binding, effectId: "restore-1", prepared: restore });
  assert.deepEqual(restored.reference, reference);
  assert.equal((await readdir(path.dirname(revisionPath(reference)))).length, 2);
});

test("stale expected hash, cross-scope reference, forged prepared preview and unknown capability fail closed", async t => {
  const { adapter, reference } = await fixture(t);
  await assert.rejects(adapter.inspectRevision({ binding: { ...binding, participantId: "other" }, reference }), /reference-invalid/);
  await assert.rejects(adapter.prepare({ binding, reference, capabilityId: "project.apply-change", args: { path: "main.js", content: add, expectedSha256: null } }), /stale-file/);
  await assert.rejects(adapter.prepare({ binding, reference, capabilityId: "host.shell", args: {} }), /capability-unavailable/);
  const prepared = await adapter.prepare({ binding, reference, capabilityId: "project.apply-change", args: { path: "main.js", content: `${add}\n`, expectedSha256: digest(add) } });
  prepared.preview.afterContent = "forged";
  await assert.rejects(adapter.materialize({ binding, effectId: "edit-1", prepared }), /prepared-integrity/);
});

test("file and bundle envelope rejects escapes, reserved names, duplicate paths and unbounded bytes", () => {
  for (const name of ["../main.js", "a/main.js", "a\\main.js", "main.js:secret", "CON.js", "con.js", "aux.js", "nul.js", "com1.js", "lpt9.js", "main.js.", "main.js ", "C:\\main.js"]) {
    assert.throws(() => normalizeFiles([{ path: name, content: "x" }]));
  }
  assert.throws(() => normalizeFiles([...initialFiles, ...initialFiles]), /duplicate-path/);
  assert.throws(() => normalizeFiles([{ path: "main.js", content: "x".repeat(4_001) }]), /budget/);
  assert.throws(() => normalizeFiles([{ path: "main.js", content: "\ud800" }]), /encoding/);
  assert.throws(() => buildTestBundle([{ path: "main.js", content: "\\".repeat(4_000) }], addition), /bundle-budget/);
});

test("tampered, extra or incomplete revision files never reconcile as successful or absent", async t => {
  const { adapter, reference, revisionPath } = await fixture(t);
  const prepared = await adapter.prepare({ binding, reference, capabilityId: "project.apply-change", args: { path: "main.js", content: `${add}\n`, expectedSha256: digest(add) } });
  const staged = await adapter.materialize({ binding, effectId: "edit-1", prepared });
  await writeFile(path.join(revisionPath(staged.reference), "main.js"), "tampered");
  await assert.rejects(adapter.observeMaterialized({ binding, effectId: "edit-1", prepared }), /integrity-mismatch/);
  await assert.rejects(adapter.materialize({ binding, effectId: "edit-1", prepared }), /integrity-mismatch/);
  assert.equal(await readFile(path.join(revisionPath(staged.reference), "main.js"), "utf8"), "tampered");
  await rm(path.join(revisionPath(staged.reference), "main.js"));
  await assert.rejects(adapter.observeMaterialized({ binding, effectId: "edit-1", prepared }), /project-/);
  await assert.rejects(adapter.materialize({ binding, effectId: "edit-1", prepared }), /project-/);
  assert.deepEqual(await readdir(revisionPath(staged.reference)), []);
  await writeFile(path.join(revisionPath(reference), "extra.js"), "unexpected");
  await assert.rejects(adapter.inspectRevision({ binding, reference }), /project-/);
});

test("hardlinks and junction ancestors are rejected without reading or writing their targets", async t => {
  const { directory, adapter, reference, revisionPath } = await fixture(t);
  const other = path.join(directory, "outside"); await mkdir(other);
  const sentinel = path.join(other, "sentinel.js"); await writeFile(sentinel, add);
  const file = path.join(revisionPath(reference), "main.js");
  await rm(file); await link(sentinel, file);
  await assert.rejects(adapter.inspectRevision({ binding, reference }), /project-/);
  const junction = path.join(directory, "linked"); await symlink(other, junction, "junction");
  const escaped = new DisposableJavascriptProjectAdapter({ baseDirectory: path.join(junction, "artifacts") });
  await assert.rejects(escaped.createEnvironment({ ...binding, files: initialFiles }), /project-/);
  assert.deepEqual(await readdir(other), ["sentinel.js"]);
  assert.equal(await readFile(sentinel, "utf8"), add);
});

test("independent adapter restart observes deterministic materialization; concurrent writers never overwrite", async t => {
  const { adapter, reference } = await fixture(t);
  const prepared = await adapter.prepare({ binding, reference, capabilityId: "project.apply-change", args: { path: "main.js", content: `${add}\n`, expectedSha256: digest(add) } });
  const outcomes = await Promise.allSettled([1, 2].map(() => adapter.materialize({ binding, effectId: "same-effect", prepared })));
  assert.ok(outcomes.some(outcome => outcome.status === "fulfilled"));
  const restarted = new DisposableJavascriptProjectAdapter({ baseDirectory: adapter.baseDirectory, suites: suiteMap });
  const observation = await restarted.observeMaterialized({ binding, effectId: "same-effect", prepared });
  assert.equal(observation.status, "present");
  assert.equal(observation.result.afterSha256, prepared.preview.workspaceSha256);
});

test("native handles prevent ancestor substitution and file mutation for the complete snapshot window", async t => {
  const { adapter, reference, revisionPath } = await fixture(t);
  const directory = revisionPath(reference); const file = path.join(directory, "main.js");
  const probe = fileURLToPath(new URL("./handle-lock-probe.ps1", import.meta.url));
  const child = spawn(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", probe, "-Directory", directory, "-File", file],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const closed = new Promise(resolve => child.once("close", resolve));
  let stderr = ""; child.stderr.on("data", chunk => { stderr += chunk; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`lock probe unavailable: ${stderr}`)), 5_000);
      child.stdout.on("data", chunk => { if (String(chunk).includes("ready")) { clearTimeout(timer); resolve(); } });
      child.once("error", error => { clearTimeout(timer); reject(error); });
    });
    await assert.rejects(rename(directory, `${directory}-renamed`));
    await assert.rejects(rename(adapter.baseDirectory, `${adapter.baseDirectory}-renamed`));
    await assert.rejects(writeFile(file, "must-not-write"));
  } finally { child.stdin.end("release\n"); await closed; }
  assert.equal(await readFile(file, "utf8"), add);
  // Proves the denial was the held handles, not an unwritable fixture or blanket ACL.
  await writeFile(file, add);
});

test("selected tests really invoke exported code and compare host expectations, then identify a planted defect", async t => {
  const { adapter, reference } = await fixture(t);
  const result = await adapter.executeTests({ binding, reference, effectId: "test-1", suiteId: "addition" });
  assert.equal(result.status, "passed"); assert.deepEqual(result.checks.map(check => check.actual), [26, -2]);
  const prepared = await adapter.prepare({ binding, reference, capabilityId: "project.apply-change", args: { path: "main.js", content: "exports.add=(a,b)=>a-b;", expectedSha256: digest(add) } });
  const changed = await adapter.materialize({ binding, effectId: "edit-1", prepared });
  const failed = await adapter.executeTests({ binding, reference: changed.reference, effectId: "test-2", suiteId: "addition" });
  assert.equal(failed.status, "failed"); assert.deepEqual(failed.checks.map(check => check.actual), [2, -8]);
  await assert.rejects(adapter.executeTests({ binding, reference, effectId: "test-3", suiteId: "model-chosen-shell" }), /suite-unavailable/);
});

test("fresh authority and cancellation are checked after preparing actual source and before dispatch", async t => {
  let calls = 0;
  const { adapter, reference } = await fixture(t, { execute: async request => { calls++; return quickJsReceipt(request); } });
  const controller = new AbortController();
  await assert.rejects(adapter.executeTests({ binding, reference, effectId: "test-1", suiteId: "addition", signal: controller.signal,
    authorize: async () => { controller.abort(); } }), /cancelled/);
  assert.equal(calls, 0);
  await assert.rejects(adapter.executeTests({ binding, reference, effectId: "test-2", suiteId: "addition",
    authorize: async () => { throw new Error("revoked"); } }), /revoked/);
  assert.equal(calls, 0);
});

test("host verifier rejects forged receipts, model success strings and absent or duplicate nonce records", async () => {
  const bundle = buildTestBundle(initialFiles, addition); const request = requestFor(bundle);
  const receipt = await quickJsReceipt(request);
  assert.throws(() => compareTestReceipt({ ...receipt, sourceSha256: "a".repeat(64) }, request, bundle), /receipt-mismatch/);
  assert.throws(() => compareTestReceipt(receiptFor(request, "all tests passed\n"), request, bundle), /result-invalid/);
  assert.throws(() => compareTestReceipt(receiptFor(request, receipt.output.stdout.repeat(2)), request, bundle), /result-invalid/);
  assert.ok(!bundle.source.includes('"expected"'));
});

test("trusted harness survives prototype/console/JSON replacement and does not leak oracle or nonce to source", async () => {
  const content = `JSON.stringify=()=>"26";console.log=()=>{};Object.getOwnPropertyDescriptor=()=>({value:()=>26});
Object.prototype.toJSON=()=>26;exports.add=(a,b)=>a+b;`;
  const bundle = buildTestBundle([{ path: "main.js", content }], addition);
  const request = requestFor(bundle); const result = compareTestReceipt(await quickJsReceipt(request), request, bundle);
  assert.equal(result.passed, true);
  const wrong = buildTestBundle([{ path: "main.js", content: 'exports.add=()=>{console.log("all tests passed");return 76;};' }], addition);
  const wrongRequest = requestFor(wrong);
  assert.equal(compareTestReceipt(await quickJsReceipt(wrongRequest), wrongRequest, wrong).passed, false);
});

test("non-JSON results, accessors and model load errors fail rather than coerce into successful output", async () => {
  const suite = { suiteId: "null-check", cases: [{ testId: "null-value", exportName: "run", args: [], expected: null }] };
  for (const content of ['exports.run=()=>NaN;', 'exports.run=()=>undefined;', 'exports.run=()=>({get value(){return null}});', 'throw new Error("bad source");']) {
    const bundle = buildTestBundle([{ path: "main.js", content }], suite); const request = requestFor(bundle);
    const result = compareTestReceipt(await quickJsReceipt(request), request, bundle);
    assert.equal(result.passed, false); assert.equal(result.checks[0].errorCode, "project-test-evaluation-failed");
  }
});

test("multiple explicit export files execute in deterministic filename order without Node or package access", async () => {
  const files = [{ path: "b-main.js", content: "exports.add=(a,b)=>exports.helper(a)+b;" },
    { path: "a-helper.js", content: "exports.helper=x=>x;" }];
  const bundle = buildTestBundle(files, addition); const request = requestFor(bundle);
  assert.equal(compareTestReceipt(await quickJsReceipt(request), request, bundle).passed, true);
  const unavailable = buildTestBundle([{ path: "main.js", content: "exports.add=()=>require('node:fs');" }], addition);
  const unavailableRequest = requestFor(unavailable);
  assert.equal(compareTestReceipt(await quickJsReceipt(unavailableRequest), unavailableRequest, unavailable).passed, false);
});
