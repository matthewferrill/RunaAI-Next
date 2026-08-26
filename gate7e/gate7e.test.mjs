import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter, once } from "node:events";
import { cp, copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createConfigFromPolicy, getPlatformSupport, spawnSandboxFromConfig } from "@microsoft/mxc-sdk";
import { SelectedCoreApplication } from "../gate6b/application.mjs";
import { createCandidateHttpServer } from "../gate6b/http-server.mjs";
import { executionOutput, javascriptSource } from "../gate6b/public/code-execution.mjs";
import { stageSandboxRuntime } from "../gate6b/sandbox-runtime.mjs";
import { parseCodeExecutionRequest } from "./contracts.mjs";
import { HarmlessJavascriptExecutionService, MemoryExecutionCoordinator,
  MxcJavascriptExecutor, createTransientSource } from "./mxc-javascript-executor.mjs";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const request = (overrides = {}) => ({
  schemaVersion: "runa2-code-execution-request/v1",
  requestId: "execution-request-1",
  participant: { principalId: "ordinary-member", verified: true },
  project: { projectId: "runa:personal" },
  thread: { threadId: "code-thread-1" },
  experience: "code", language: "javascript",
  source: "console.log(15 + 15)",
  origin: { type: "authenticated-user-run-action" },
  ...overrides,
});

const uiCapabilities = Object.freeze({
  canBlockClipboardRead: true, canBlockClipboardWrite: true, canBlockInputInjection: true,
  canBlockInputMethodChanges: true, canBlockExternalUiObjects: true, canBlockGlobalUiNamespace: true,
  canBlockDesktopSwitching: true, canBlockLogoffOrShutdown: true,
  canBlockSystemParameterChanges: true, canBlockDisplaySettingsChanges: true,
});

function fakeChild({ stdout, stderr = "", exitCode = 0 }) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  let closed = false;
  const close = code => {
    if (closed) return;
    closed = true;
    child.stdout.end(); child.stderr.end();
    queueMicrotask(() => child.emit("close", code));
  };
  child.kill = () => close(null);
  queueMicrotask(() => {
    if (closed) return;
    child.stdout.write(stdout);
    if (!closed) child.stderr.write(stderr);
    close(exitCode);
  });
  return child;
}

function fakeSdk(result, capture) {
  return {
    getPlatformSupport: () => ({ isSupported: true, availableMethods: ["processcontainer"],
      isolationTier: "appcontainer-dacl", isolationWarnings: [], uiCapabilities }),
    createConfigFromPolicy(policy, intent, containerId) {
      capture.policy = policy; capture.intent = intent; capture.containerId = containerId;
      return { process: {} };
    },
    spawnSandboxFromConfig(config, options, cwd) {
      capture.config = structuredClone(config); capture.options = options; capture.cwd = cwd;
      return fakeChild(result);
    },
  };
}

function marker(value) {
  return `RUNA2_EXECUTION_RESULT:${Buffer.from(JSON.stringify(value)).toString("base64url")}\n`;
}

test("the execution request is exact, bounded, authenticated Code intent", () => {
  const parsed = parseCodeExecutionRequest(request());
  assert.equal(parsed.source, "console.log(15 + 15)");
  assert.throws(() => parseCodeExecutionRequest(request({ source: "x".repeat(8_001) })));
  assert.throws(() => parseCodeExecutionRequest(request({ participant: {
    principalId: "ordinary-member", verified: false } })));
  assert.throws(() => parseCodeExecutionRequest(request({ experience: "chat" })));
  assert.throws(() => parseCodeExecutionRequest(request({ origin: { type: "model-request" } })));
});

test("only a typed successful sandbox result receives executed status", async () => {
  const capture = {};
  const source = "console.log(15 + 15)";
  const executor = new MxcJavascriptExecutor({ runtimeRoot: resolve("."), sdk: fakeSdk({
    stdout: marker({ status: "completed", stdout: "30\n", stderr: "", errorCode: null,
      hostVersion: process.version }), exitCode: 0,
  }, capture), now: (() => { let value = 100; return () => value++; })() });
  const receipt = await executor.execute(request({ source }));
  assert.equal(receipt.status, "executed");
  assert.equal(receipt.output.stdout, "30\n");
  assert.equal(receipt.sourceSha256, sha256(source));
  assert.equal(receipt.systemStamped, true);
  assert.deepEqual(receipt.effects, []);
  assert.equal(JSON.stringify(receipt).includes(source), false);
  assert.equal(capture.intent, "process");
  assert.deepEqual(capture.policy.filesystem.readwritePaths, []);
  assert.equal(capture.policy.network.egress.default, "deny");
  assert.equal(capture.policy.network.ingress.hostLoopback, "deny");
  assert.equal(capture.policy.ui.allowWindows, false);
  assert.deepEqual(capture.config.fallback, { allowDaclMutation: true });
  assert.equal(capture.options.usePty, false);
  assert.match(capture.config.process.commandLine, /--permission/);
  assert.match(capture.config.process.commandLine, /--allow-fs-read=/);
  assert.equal(Object.hasOwn(capture.config.process, "env"), false);
  assert.equal(capture.config.process.commandLine.includes(source), false);
  assert.match(capture.config.process.commandLine, /--source-file=/);
  assert.match(capture.config.process.commandLine, new RegExp(`--source-sha256=${sha256(source)}`));
  const transientPath = capture.policy.filesystem.readonlyPaths[2];
  assert.match(capture.config.process.commandLine, new RegExp(transientPath.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")));
  await assert.rejects(readFile(transientPath));
  assert.equal(receipt.isolation.environment, "empty");
  assert.equal(receipt.isolation.filesystem, "read-only-runtime-and-transient-source");
});

test("transient source transport is exclusive, exact, and removed before return", async () => {
  const source = "console.log('private draft')";
  const transport = await createTransientSource({ source, sourceSha256: sha256(source) });
  assert.equal(await readFile(transport.sourcePath, "utf8"), source);
  await transport.cleanup();
  await assert.rejects(readFile(transport.sourcePath));
});

test("source transport and cleanup failures fail closed without output", async () => {
  const completed = { stdout: marker({ status: "completed", stdout: "30\n", stderr: "",
    errorCode: null, hostVersion: process.version }), exitCode: 0 };
  const transportFailure = new Error("transport failed");
  transportFailure.code = "sandbox-source-transport-failed";
  const unavailable = await new MxcJavascriptExecutor({ sdk: fakeSdk(completed, {}),
    sourceTransport: async () => { throw transportFailure; } }).execute(request({ requestId: "transport-failed" }));
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.errorCode, "sandbox-source-transport-failed");
  assert.equal(unavailable.output.combinedBytes, 0);

  const cleanupFailed = await new MxcJavascriptExecutor({ sdk: fakeSdk(completed, {}),
    sourceTransport: async ({ sourceSha256 }) => ({ sourcePath: resolve("transient-source.js"),
      sourceSha256, async cleanup() { throw new Error("cleanup failed"); } })
  }).execute(request({ requestId: "cleanup-failed" }));
  assert.equal(cleanupFailed.status, "unavailable");
  assert.equal(cleanupFailed.errorCode, "sandbox-cleanup-failed");
  assert.equal(cleanupFailed.output.combinedBytes, 0);
});

test("missing typed evidence and parent output overflow fail closed without partial output", async () => {
  const unavailable = await new MxcJavascriptExecutor({ sdk: fakeSdk({
    stdout: "model says this ran\n", stderr: "private diagnostic", exitCode: 1,
  }, {}) }).execute(request());
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.errorCode, "sandbox-start-failed");
  assert.equal(unavailable.output.combinedBytes, 0);

  const limited = await new MxcJavascriptExecutor({ sdk: fakeSdk({
    stdout: "x".repeat(161_000), exitCode: 0,
  }, {}) }).execute(request({ requestId: "execution-output-limit" }));
  assert.equal(limited.status, "output-limited");
  assert.equal(limited.output.combinedBytes, 0);
  assert.equal(limited.output.partialDelivered, false);
});

test("execution idempotency binds one request id to one exact source", async () => {
  let calls = 0;
  const coordinator = new MemoryExecutionCoordinator();
  const service = new HarmlessJavascriptExecutionService({ coordinator, executor: {
    async execute(input) { calls += 1; return { requestId: input.requestId, calls }; },
  } });
  const first = await service.execute(request());
  const replay = await service.execute(request());
  assert.deepEqual(replay, first);
  assert.equal(calls, 1);
  await assert.rejects(service.execute(request({ source: "console.log(31)" })),
    error => error.code === "execution-request-id-conflict");
});

test("ordinary verified members may explicitly run the harmless envelope without step-up", async () => {
  const calls = [];
  const participant = { verified: true, principalId: "ordinary-member", methods: ["password"] };
  const app = new SelectedCoreApplication({ mode: "active", targetGeneration: "target",
    cutoverStatus: async () => ({ phase: "promoted", authorityGeneration: "target" }),
    answerService: {}, actionService: {},
    authenticator: { async authenticate(credential, options) { calls.push(["authenticate", credential, options]); return participant; } },
    authorizer: { async authorize(input) { calls.push(["authorize", input]); return { allowed: true }; } },
    codeExecution: { async execute(input) { calls.push(["execute", input]); return { status: "executed" }; } },
  });
  const result = await app.executeCode({ credential: "ordinary-session", body: {
    requestId: "run-1", experience: "code", language: "javascript",
    threadId: "thread-1", projectId: "code-project", source: "console.log(2 + 3)",
  } });
  assert.equal(result.status, "executed");
  assert.deepEqual(calls[0], ["authenticate", "ordinary-session", { requireOnline: false }]);
  assert.deepEqual(calls[1][1], { participant, action: "chat-ephemeral", resource: "project:runa:personal" });
  assert.equal(calls[2][1].origin.type, "authenticated-user-run-action");
  assert.equal(calls[2][1].source, "console.log(2 + 3)");
  await assert.rejects(app.executeCode({ credential: null, body: {
    requestId: "run-2", experience: "code", language: "javascript", threadId: "thread-1",
    source: "console.log(1)",
  } }), error => error.code === "identity-token-missing");
});

test("the browser execution route is session scoped, exact-origin, POST-only, and explicitly marked", async t => {
  const calls = [];
  const ordinarySessions = { publicBaseUrl: "https://runa.example.test",
    async credentialForSession(value) { assert.equal(value, "ordinary-session"); return "opaque"; } };
  const server = createCandidateHttpServer({ application: {
    async executeCode(input) { calls.push(input); return { status: "executed" }; },
  }, runtimeStatus: async () => ({}), readinessStatus: async () => ({}),
  dependencyHealth: async () => ({ ready: true }), ordinarySessions,
  staticRoot: resolve("gate6b/public") });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { origin: ordinarySessions.publicBaseUrl,
    cookie: "__Host-runa_user_session=ordinary-session", "content-type": "application/json",
    "x-runa-workspace": "1" };
  const payload = { experience: "code", language: "javascript", source: "console.log(30)" };
  const accepted = await fetch(`${base}/api/selected/code/execute`, { method: "POST", headers,
    body: JSON.stringify(payload) });
  assert.equal(accepted.status, 200);
  assert.deepEqual(calls, [{ credential: "opaque", body: payload }]);
  const unmarked = await fetch(`${base}/api/selected/code/execute`, { method: "POST",
    headers: Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "x-runa-workspace")),
    body: JSON.stringify(payload) });
  assert.equal(unmarked.status, 400);
  assert.equal((await unmarked.json()).errorCode, "workspace-request-invalid");
  assert.equal((await fetch(`${base}/api/selected/code/execute`, { headers })).status, 404);
  assert.equal(calls.length, 1);
});

test("the browser extracts one exact bounded JavaScript draft and labels output honestly", () => {
  const source = "const total = 15 + 15;\nconsole.log(total);";
  assert.equal(javascriptSource(`Here is the draft:\n\n\`\`\`javascript\n${source}\n\`\`\``), source);
  assert.equal(javascriptSource("```python\nprint(30)\n```"), null);
  assert.equal(javascriptSource("```js\n1\n```\n```js\n2\n```"), null);
  assert.equal(javascriptSource(`\`\`\`js\n${"x".repeat(8_001)}\n\`\`\``), null);
  assert.equal(executionOutput({ status: "executed", output: { stdout: "30\n", stderr: "" } }), "30");
  assert.match(executionOutput({ status: "failed", output: { stdout: "", stderr: "" } }), /did not run/);
});

async function runQuickJsChild(source, { storedSource = source, digest = sha256(source),
  removeBeforeRun = false, permissionModel = false } = {}) {
  const runner = resolve("gate7e/quickjs-child.mjs");
  const transport = await createTransientSource({ source: storedSource, sourceSha256: digest });
  try {
    if (removeBeforeRun) await transport.cleanup();
    const args = permissionModel ? ["--permission", `--allow-fs-read=${resolve(".")}`,
      `--allow-fs-read=${await realpath(resolve("node_modules"))}`,
      `--allow-fs-read=${transport.sourcePath}`] : [];
    args.push(runner, `--source-file=${transport.sourcePath}`, `--source-sha256=${digest}`);
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"], env: {} });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    const [exitCode] = await once(child, "close");
    const encoded = stdout.trim().replace(/^RUNA2_EXECUTION_RESULT:/, "");
    return { exitCode, stderr, result: JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) };
  } finally {
    await transport.cleanup();
  }
}

test("the QuickJS child rejects missing, changed, and oversized transient source", async () => {
  const source = "console.log(30)";
  for (const result of [
    await runQuickJsChild(source, { removeBeforeRun: true }),
    await runQuickJsChild(source, { storedSource: "console.log(31)" }),
    await runQuickJsChild("x".repeat(8_001)),
  ]) {
    assert.equal(result.exitCode, 2);
    assert.equal(result.result.status, "runtime-error");
    assert.equal(result.result.errorCode, "sandbox-source-invalid");
    assert.equal(result.result.stdout, "");
  }
});

test("the QuickJS child computes real output and exposes no Node, file, or network APIs", async () => {
  const arithmetic = await runQuickJsChild("console.log(((2 + 3) / 2) * 10)", { permissionModel: true });
  assert.equal(arithmetic.exitCode, 0);
  assert.equal(arithmetic.result.status, "completed");
  assert.equal(arithmetic.result.stdout, "25\n");
  const globals = await runQuickJsChild("console.log(typeof process, typeof require, typeof fetch, typeof WebSocket)");
  assert.equal(globals.result.stdout, "undefined undefined undefined undefined\n");
  assert.equal(globals.stderr, "");
});

test("the staged guest runtime contains only the runner and pinned QuickJS packages", async t => {
  const destinationRoot = await mkdtemp(join(tmpdir(), "runa2-gate7e-stage-"));
  t.after(() => rm(destinationRoot, { recursive: true, force: true }));
  const sandboxRoot = await stageSandboxRuntime({ sourceRoot: resolve("."),
    nodeModulesRoot: resolve("node_modules"), destinationRoot });
  assert.deepEqual((await readdir(sandboxRoot)).sort(), ["node_modules", "quickjs-child.mjs"]);
  assert.deepEqual((await readdir(join(sandboxRoot, "node_modules"))).sort(),
    ["@jitl", "quickjs-emscripten", "quickjs-emscripten-core"]);
  assert.equal((await readFile(join(sandboxRoot, "quickjs-child.mjs"), "utf8")).includes("getQuickJS"), true);
});

test("the QuickJS child stops runaway time and output without returning partial data", async () => {
  const timeout = await runQuickJsChild("while (true) {};");
  assert.equal(timeout.result.status, "timeout");
  assert.equal(timeout.result.stdout, "");
  const output = await runQuickJsChild("for (let i = 0; i < 20000; i++) console.log('xxxxxxxxxx');");
  assert.equal(output.result.status, "output-limited");
  assert.equal(output.result.stdout, "");
  assert.equal(output.result.stderr, "");
});

test("the QuickJS allocation ceiling stops memory exhaustion without returning partial data", async () => {
  const memory = await runQuickJsChild("new ArrayBuffer(64 * 1024 * 1024);");
  assert.equal(memory.result.status, "runtime-error");
  assert.equal(memory.result.errorCode, "sandbox-memory-limit");
  assert.equal(memory.result.stdout, "");
  assert.equal(memory.result.stderr, "");
});

test("MXC runs the pinned child or exposes the exact host-preparation blocker and fails closed", { timeout: 30_000 }, async t => {
  const support = getPlatformSupport();
  if (process.platform !== "win32" || support.isSupported !== true
      || !(support.availableMethods ?? []).includes("processcontainer")) {
    t.skip("Microsoft ProcessContainer is not available on this host.");
    return;
  }
  const temporaryRoot = await mkdtemp(join(tmpdir(), "runa2-gate7e-"));
  assert.equal(resolve(temporaryRoot).startsWith(resolve(tmpdir())), true);
  t.after(async () => rm(temporaryRoot, { recursive: true, force: true }));
  await mkdir(join(temporaryRoot, "gate7e"), { recursive: true });
  await mkdir(join(temporaryRoot, "runtime"), { recursive: true });
  await mkdir(join(temporaryRoot, "node_modules", "@jitl"), { recursive: true });
  await copyFile(resolve("gate7e/quickjs-child.mjs"), join(temporaryRoot, "gate7e", "quickjs-child.mjs"));
  await copyFile(process.execPath, join(temporaryRoot, "runtime", "node.exe"));
  await cp(resolve("node_modules/quickjs-emscripten"), join(temporaryRoot, "node_modules", "quickjs-emscripten"), { recursive: true });
  await cp(resolve("node_modules/quickjs-emscripten-core"), join(temporaryRoot, "node_modules", "quickjs-emscripten-core"), { recursive: true });
  await cp(resolve("node_modules/@jitl"), join(temporaryRoot, "node_modules", "@jitl"), { recursive: true });
  let diagnostics = "";
  const diagnosticSdk = { createConfigFromPolicy, getPlatformSupport,
    spawnSandboxFromConfig(...input) {
      const child = spawnSandboxFromConfig(...input);
      child.stderr?.on("data", chunk => { diagnostics += chunk.toString("utf8"); });
      return child;
    } };
  const executor = new MxcJavascriptExecutor({ runtimeRoot: temporaryRoot,
    runnerPath: join(temporaryRoot, "gate7e", "quickjs-child.mjs"),
    nodeExecutable: join(temporaryRoot, "runtime", "node.exe"), sdk: diagnosticSdk });
  const receipt = await executor.execute(request({ requestId: "mxc-disposable-smoke",
    source: "console.log(115 + 25)" }));
  if (receipt.status === "executed") {
    assert.equal(receipt.output.stdout, "140\n");
  } else {
    assert.equal(receipt.status, "unavailable");
    assert.equal(receipt.errorCode, "sandbox-start-failed");
    const directDaclBlocker = /Failed to apply DACL ACEs|DACL fallback requires write-DAC permission/.test(diagnostics);
    const drivePreparationBlocker = receipt.exitCode === 0xC0000142
      && (support.isolationWarnings ?? []).some(warning => warning.includes("prepare-system-drive"));
    assert.equal(directDaclBlocker || drivePreparationBlocker, true);
    assert.equal(receipt.output.combinedBytes, 0);
  }
  assert.equal(receipt.isolation.provider, "microsoft-mxc");
  assert.equal(receipt.isolation.network, "deny-all");
  assert.equal(receipt.isolation.filesystem, "read-only-runtime-and-transient-source");
});

test("public code execution wiring and the compact release runtime preserve the boundary", async () => {
  const [script, helper, styles, server, composition, builder, stager, deployer] = await Promise.all([
    readFile(resolve("gate6b/public/status.js"), "utf8"),
    readFile(resolve("gate6b/public/code-execution.mjs"), "utf8"),
    readFile(resolve("gate6b/public/styles.css"), "utf8"),
    readFile(resolve("gate6b/http-server.mjs"), "utf8"),
    readFile(resolve("gate6b/composition.mjs"), "utf8"),
    readFile(resolve("gate6b/build-release.mjs"), "utf8"),
    readFile(resolve("gate6b/sandbox-runtime.mjs"), "utf8"),
    readFile(resolve("gate7a/control/Deploy-ControlOrdinaryAccessSuccessor.ps1"), "utf8"),
  ]);
  assert.match(script, /Draft — not run/);
  assert.match(script, /Ran in sandbox/);
  assert.match(script, /\/api\/selected\/code\/execute/);
  assert.match(styles, /\.execution-badge/);
  assert.match(server, /request\.method === "POST" && url\.pathname === "\/api\/selected\/code\/execute"/);
  assert.match(composition, /runtimeRoot: resolve\(releaseRoot, "sandbox-runtime"\)/);
  assert.match(composition, /runnerPath: resolve\(releaseRoot, "sandbox-runtime", "quickjs-child\.mjs"\)/);
  assert.match(composition, /ready: postgresql && keycloak && openfga && provider && sandboxPreflight\.ready/);
  assert.match(builder, /stageSandboxRuntime\(\{ sourceRoot: root, nodeModulesRoot: nodeModules,/);
  assert.match(stager, /resolve\(sandboxRoot, "quickjs-child\.mjs"\)/);
  assert.match(stager, /\["quickjs-emscripten", "quickjs-emscripten-core", "@jitl"\]/);
  assert.match(deployer, /gate7e-harmless-javascript/);
  assert.match(deployer, /health\.dependencies\.sandbox-ne\$true/);
  assert.doesNotMatch(`${script}\n${helper}`, /innerHTML|localStorage|sessionStorage/);
});

test("the Control repair is target-only, fail-closed, and preserves descendant DACL bytes", {
  timeout: 30_000,
}, async t => {
  const [source, rehearsal, operator, systemPreflight, preflight] = await Promise.all([
    readFile(resolve("gate7e/control/TargetOnlyAcl.cs"), "utf8"),
    readFile(resolve("gate7e/control/Test-TargetOnlyAcl.ps1"), "utf8"),
    readFile(resolve("gate7e/control/Invoke-ControlTargetOnlyHostRepair.ps1"), "utf8"),
    readFile(resolve("gate7e/control/Invoke-ControlSystemPreflight.ps1"), "utf8"),
    readFile(resolve("gate7e/run-control-preflight.mjs"), "utf8"),
  ]);
  assert.match(source, /SetFileSecurityW/);
  assert.match(source, /DaclSecurityInformation/);
  assert.match(source, /HostPreparationMask = 0x00120088/);
  assert.match(source, /S-1-15-2-1/);
  assert.match(source, /S-1-15-2-2/);
  assert.match(source, /target-sid-conflict/);
  assert.match(source, /OwnershipSha256/);
  assert.match(source, /DaclProtected/);
  assert.match(source, /DaclDefaulted/);
  assert.match(source, /ProtectedDaclSecurityInformation/);
  assert.match(source, /RecoverAndEnsureHostPreparation/);
  assert.match(source, /RestoreDaclAndControlFlags/);
  assert.match(source, /RollBackOrThrow/);
  assert.doesNotMatch(`${source}\n${operator}`, /SetNamedSecurityInfoW|Set-Acl|\bicacls\b|wxc-host-prep/);
  assert.equal(operator.includes("$systemDriveRoot = 'C:\\'"), true);
  assert.match(operator, /RUNA-CONTROL\\Matthew/);
  assert.match(operator, /NT AUTHORITY\\SYSTEM/);
  assert.match(operator, /target-only-critical-path-drift/);
  assert.match(operator, /RecoverAndReconcile/);
  assert.match(operator, /RequirePrivilegedControlTests/);
  assert.match(systemPreflight, /NT AUTHORITY\\SYSTEM/);
  assert.match(systemPreflight, /process\.version/);
  assert.match(systemPreflight, /v22\.22\.0/);
  assert.match(systemPreflight, /Get-ScheduledTaskInfo/);
  assert.match(systemPreflight, /Unregister-ScheduledTask/);
  assert.match(systemPreflight, /privateValuesIncluded=\$false/);
  assert.doesNotMatch(systemPreflight, /Write-Output \$stdoutText|Write-Output \$stderrText/);
  assert.match(preflight, /destinationRoot: root/);
  assert.match(preflight, /receipt\.status !== "executed"/);
  assert.match(preflight, /arithmetic\.output\.stdout !== "140\\n"/);
  assert.match(preflight, /sandboxExitCode: preflight\.receipt\.exitCode/);
  assert.match(preflight, /combinedBytes: preflight\.receipt\.output\.combinedBytes/);
  assert.doesNotMatch(preflight, /diagnostic[^\n]*stdout|diagnostic[^\n]*stderr/);

  if (process.platform !== "win32") {
    t.skip("The exact DACL regression requires Windows.");
    return;
  }
  const temporaryEntries = async () => new Set((await readdir(tmpdir()))
    .filter(name => name.startsWith("runa2-gate7e-acl-")));
  const before = await temporaryEntries();
  const child = spawn("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
    resolve("gate7e/control/Test-TargetOnlyAcl.ps1"),
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const [exitCode] = await once(child, "close");
  assert.equal(exitCode, 0, stderr);
  const result = JSON.parse(stdout.trim());
  assert.deepEqual(result, {
    schemaVersion: "runa2-gate7e-target-only-acl-test/v1",
    passed: true,
    applyCount: 2,
    idempotent: true,
    exactRemoval: true,
    exactRestore: true,
    conflictRejected: true,
    duplicateRejected: true,
    privilegedControlTestsRun: false,
    protectedDaclPreserved: null,
    metadataRecoveryPassed: null,
    descendantDaclStable: true,
    privateValuesIncluded: false,
  });
  const after = await temporaryEntries();
  assert.deepEqual(after, before);
  assert.match(rehearsal, /Remove-Item -LiteralPath \$fullRoot -Recurse -Force/);
});
