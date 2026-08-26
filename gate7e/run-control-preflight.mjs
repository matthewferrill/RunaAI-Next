import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getPlatformSupport } from "@microsoft/mxc-sdk";
import { stageSandboxRuntime } from "../gate6b/sandbox-runtime.mjs";
import { MxcJavascriptExecutor } from "./mxc-javascript-executor.mjs";

const temporaryParent = process.platform === "win32" ? resolve(process.cwd(), "..") : tmpdir();
const nodeRuntimeRoot = await mkdtemp(join(temporaryParent, "runa2-gate7e-node-"));
let sandboxRoot = null;
let diagnostic = null;
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

  sandboxRoot = await stageSandboxRuntime({ sourceRoot: process.cwd(),
    nodeModulesRoot: join(process.cwd(), "node_modules"), destinationRoot: temporaryParent,
    directoryName: `runa2-gate7e-sandbox-${randomUUID()}` });
  const nodeExecutable = join(nodeRuntimeRoot, "node.exe");
  await copyFile(process.execPath, nodeExecutable);
  const executor = new MxcJavascriptExecutor({ runtimeRoot: sandboxRoot,
    runnerPath: join(sandboxRoot, "quickjs-child.mjs"), nodeExecutable,
    temporaryRoot: temporaryParent });
  const preflight = await executor.preflight();
  if (preflight.ready !== true || preflight.receipt.status !== "executed"
      || preflight.receipt.output.stdout !== "runa2-sandbox-ready\n") {
    diagnostic = Object.freeze({
      receiptStatus: preflight.receipt.status,
      sandboxErrorCode: preflight.receipt.errorCode,
      sandboxExitCode: preflight.receipt.exitCode,
      isolationTier: preflight.receipt.isolation.tier,
      combinedBytes: preflight.receipt.output.combinedBytes,
    });
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
    diagnostic,
    privateValuesIncluded: false,
  })}\n`);
  process.exitCode = 1;
} finally {
  if (sandboxRoot) await rm(sandboxRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  await rm(nodeRuntimeRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}
