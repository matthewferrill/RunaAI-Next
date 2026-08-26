import { cp, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createConfigFromPolicy, getPlatformSupport, spawnSandboxFromConfig } from "@microsoft/mxc-sdk";

const { MxcJavascriptExecutor } = await import(pathToFileURL(resolve("gate7e/mxc-javascript-executor.mjs")).href);

const source = "console.log(115 + 25)";
const variants = [
  ["one-custom-variable", () => ["RUNA2_TEST=value"]],
  ["unset", () => undefined],
  ["empty", () => []],
  ["system-root", () => ["SystemRoot=C:\\Windows"]],
  ["windows-root", () => ["SystemRoot=C:\\Windows", "WINDIR=C:\\Windows"]],
  ["windows-baseline", () => ["SystemDrive=C:", "SystemRoot=C:\\Windows", "WINDIR=C:\\Windows"]],
];

function request(name) {
  return {
    schemaVersion: "runa2-code-execution-request/v1",
    requestId: `mxc-environment-${name}`,
    participant: { principalId: "runa2-control-diagnostic", verified: true },
    project: { projectId: "runa:system" },
    thread: { threadId: "sandbox-diagnostic" },
    experience: "code",
    language: "javascript",
    source,
    origin: { type: "authenticated-user-run-action" },
  };
}

function diagnosticCode(value) {
  const text = String(value);
  if (/0x800700CB/i.test(text)) return "environment-option-not-found";
  if (/DACL fallback requires write-DAC permission/i.test(text)) return "write-dac-required";
  if (/Failed to apply DACL ACEs/i.test(text)) return "dacl-application-failed";
  if (/CreateProcessW failed/i.test(text)) return "create-process-failed";
  return text.trim() ? "other" : null;
}

const support = getPlatformSupport();
if (process.platform !== "win32" || support.isSupported !== true
    || !(support.availableMethods ?? []).includes("processcontainer")) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: "runa2-gate7e-mxc-environment-diagnostic/v1",
    supported: false, privateValuesIncluded: false })}\n`);
  process.exit(0);
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "runa2-gate7e-env-"));
try {
  await mkdir(join(temporaryRoot, "gate7e"), { recursive: true });
  await mkdir(join(temporaryRoot, "runtime"), { recursive: true });
  await mkdir(join(temporaryRoot, "node_modules", "@jitl"), { recursive: true });
  await copyFile(resolve("gate7e/quickjs-child.mjs"), join(temporaryRoot, "gate7e", "quickjs-child.mjs"));
  await copyFile(process.execPath, join(temporaryRoot, "runtime", "node.exe"));
  await cp(resolve("node_modules/quickjs-emscripten"), join(temporaryRoot, "node_modules", "quickjs-emscripten"),
    { recursive: true });
  await cp(resolve("node_modules/quickjs-emscripten-core"),
    join(temporaryRoot, "node_modules", "quickjs-emscripten-core"), { recursive: true });
  await cp(resolve("node_modules/@jitl"), join(temporaryRoot, "node_modules", "@jitl"), { recursive: true });

  const results = [];
  for (const [name, environmentFor] of variants) {
    let diagnostics = "";
    const diagnosticSdk = {
      createConfigFromPolicy,
      getPlatformSupport,
      spawnSandboxFromConfig(config, options, workingDirectory) {
        const environment = environmentFor(config);
        if (environment === undefined) delete config.process.env;
        else config.process.env = environment;
        const child = spawnSandboxFromConfig(config, options, workingDirectory);
        child.stderr?.on("data", chunk => { diagnostics += chunk.toString("utf8"); });
        return child;
      },
    };
    const executor = new MxcJavascriptExecutor({ runtimeRoot: temporaryRoot,
      runnerPath: join(temporaryRoot, "gate7e", "quickjs-child.mjs"),
      nodeExecutable: join(temporaryRoot, "runtime", "node.exe"), sdk: diagnosticSdk });
    const receipt = await executor.execute(request(name));
    results.push({ name, status: receipt.status, errorCode: receipt.errorCode,
      exitCode: receipt.exitCode,
      processStarted: receipt.errorCode !== "sandbox-start-failed",
      outputMatched: receipt.output.stdout === "140\n",
      diagnosticCode: diagnosticCode(diagnostics) });
  }
  const directResults = [];
  const nodeExecutable = join(temporaryRoot, "runtime", "node.exe");
  const directCases = [
    ["node-version", `"${nodeExecutable}" --version`, undefined],
    ["node-inline", `"${nodeExecutable}" -e "process.stdout.write('ready')"`, undefined],
    ["node-permission-inline", `"${nodeExecutable}" --permission --allow-fs-read="${temporaryRoot}" `
      + `-e "process.stdout.write('ready')"`, undefined],
    ["node-inline-empty-env", `"${nodeExecutable}" -e "process.stdout.write('ready')"`, []],
    ["node-inline-one-env", `"${nodeExecutable}" -e "process.stdout.write('ready')"`, ["RUNA2_TEST=value"]],
  ];
  for (const [name, commandLine, environment] of directCases) {
    const config = createConfigFromPolicy({
      version: "0.8.0-alpha",
      filesystem: { readonlyPaths: [temporaryRoot, dirname(nodeExecutable)],
        readwritePaths: [], deniedPaths: [], clearPolicyOnExit: true },
      network: { egress: { default: "deny" }, ingress: { default: "deny", hostLoopback: "deny" } },
      ui: { allowWindows: false, clipboard: "none", allowInputInjection: false },
      timeoutMs: 2_000,
    }, "process", `runa2-env-direct-${randomUUID()}`);
    config.fallback = { allowDaclMutation: true };
    config.process.commandLine = commandLine;
    config.process.cwd = temporaryRoot;
    if (environment !== undefined) config.process.env = environment;
    let stdout = "";
    let stderr = "";
    const child = spawnSandboxFromConfig(config, { usePty: false }, temporaryRoot);
    child.stdout?.on("data", chunk => { stdout += chunk.toString("utf8"); });
    child.stderr?.on("data", chunk => { stderr += chunk.toString("utf8"); });
    const exitCode = await new Promise(resolveExit => child.once("close", resolveExit));
    directResults.push({ name, exitCode: Number.isInteger(exitCode) ? exitCode : null,
      outputMatched: stdout === "ready" || /^v22\.22\.0\r?\n$/.test(stdout),
      stdoutPresent: stdout.length > 0, stderrPresent: stderr.length > 0,
      diagnosticCode: diagnosticCode(`${stdout}\n${stderr}`) });
  }
  process.stdout.write(`${JSON.stringify({ schemaVersion: "runa2-gate7e-mxc-environment-diagnostic/v1",
    supported: true, isolationTier: support.isolationTier,
    warningCodes: (support.isolationWarnings ?? []).map(warning =>
      warning.includes("prepare-system-drive") ? "prepare-system-drive-required"
        : warning.includes("prepare-null-device") ? "prepare-null-device-required"
          : warning.startsWith("BaseContainer tier not selected") ? "dacl-fallback" : "other"),
    results, directResults,
    privateValuesIncluded: false })}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
