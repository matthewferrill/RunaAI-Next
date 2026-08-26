import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPlatformSupport } from "@microsoft/mxc-sdk";
import { stageSandboxRuntime } from "../gate6b/sandbox-runtime.mjs";
import { MxcJavascriptExecutor } from "./mxc-javascript-executor.mjs";

const root = await mkdtemp(join(tmpdir(), "runa2-gate7e-control-preflight-"));
try {
  if (process.platform !== "win32" || process.version !== "v22.22.0") {
    throw Object.assign(new Error("The exact Windows Node runtime is required."),
      { code: "control-preflight-runtime-invalid" });
  }
  const support = getPlatformSupport();
  if (support?.isSupported !== true
      || !(support.availableMethods ?? []).includes("processcontainer")
      || (support.isolationWarnings ?? []).some(value => value.includes("prepare-system-drive"))) {
    throw Object.assign(new Error("The MXC host prerequisite is not complete."),
      { code: "control-preflight-host-unprepared" });
  }

  const runtimeRoot = join(root, "runtime");
  const sandboxRoot = await stageSandboxRuntime({ sourceRoot: process.cwd(),
    nodeModulesRoot: join(process.cwd(), "node_modules"), destinationRoot: root });
  await mkdir(runtimeRoot, { recursive: true });
  const nodeExecutable = join(runtimeRoot, "node.exe");
  await copyFile(process.execPath, nodeExecutable);
  const executor = new MxcJavascriptExecutor({ runtimeRoot: sandboxRoot,
    runnerPath: join(sandboxRoot, "quickjs-child.mjs"), nodeExecutable });
  const preflight = await executor.preflight();
  if (preflight.ready !== true || preflight.receipt.status !== "executed"
      || preflight.receipt.output.stdout !== "runa2-sandbox-ready\n") {
    throw Object.assign(new Error("The exact startup program did not execute."),
      { code: "control-preflight-startup-failed" });
  }
  const arithmetic = await executor.execute({
    schemaVersion: "runa2-code-execution-request/v1",
    requestId: "control-target-only-arithmetic",
    participant: { principalId: "runa2-control-verifier", verified: true },
    project: { projectId: "runa:system" },
    thread: { threadId: "sandbox-startup" },
    experience: "code",
    language: "javascript",
    source: "console.log(115 + 25)",
    origin: { type: "authenticated-user-run-action" },
  });
  if (arithmetic.status !== "executed" || arithmetic.output.stdout !== "140\n"
      || arithmetic.systemStamped !== true || arithmetic.effects.length !== 0) {
    throw Object.assign(new Error("The arithmetic program did not execute exactly."),
      { code: "control-preflight-arithmetic-failed" });
  }
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "runa2-gate7e-control-real-preflight/v1",
    passed: true,
    isolationTier: arithmetic.isolation.tier,
    startupExecuted: true,
    arithmeticExecuted: true,
    sourceSha256: arithmetic.sourceSha256,
    network: arithmetic.isolation.network,
    filesystem: arithmetic.isolation.filesystem,
    effects: arithmetic.effects,
    privateValuesIncluded: false,
  })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    schemaVersion: "runa2-gate7e-control-real-preflight-error/v1",
    errorCode: /^[a-z0-9-]{1,100}$/.test(error?.code ?? "")
      ? error.code : "control-real-preflight-failed",
    privateValuesIncluded: false,
  })}\n`);
  process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}
