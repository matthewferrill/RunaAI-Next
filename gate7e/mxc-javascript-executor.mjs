import { createHash, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { createConfigFromPolicy, getPlatformSupport, spawnSandboxFromConfig } from "@microsoft/mxc-sdk";
import { parseCodeExecutionReceipt, parseCodeExecutionRequest } from "./contracts.mjs";

const RESULT_MARKER = "RUNA2_EXECUTION_RESULT:";
const SOURCE_LIMIT = 8_000;
const OUTPUT_LIMIT = 16_000;
const WALL_CLOCK_MS = 2_000;
const QUICKJS_DEADLINE_MS = 1_200;
const MEMORY_LIMIT = 16 * 1024 * 1024;
const STACK_LIMIT = 512 * 1024;
const PARENT_CAPTURE_LIMIT = 160_000;
const acceptedDaclWarnings = [
  /^BaseContainer tier not selected, and AppContainer \+ BFS is not compiled into this binary;/,
  /^AppContainer \+ DACL tier selected:/,
];

const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const coded = (code, message) => Object.assign(new Error(message), { code });
const quote = value => `"${String(value).replaceAll('"', '\\"')}"`;

function supportFor(sdk) {
  const support = sdk.getPlatformSupport();
  const methods = new Set(support?.availableMethods ?? []);
  if (support?.isSupported !== true || !methods.has("processcontainer")) {
    throw coded("sandbox-isolation-unavailable", "The required local process sandbox is unavailable.");
  }
  const uiCapabilities = Object.values(support.uiCapabilities ?? {});
  if (!uiCapabilities.length || uiCapabilities.some(value => value !== true)) {
    throw coded("sandbox-ui-isolation-unavailable", "The required UI isolation is unavailable.");
  }
  if (!["base-container", "appcontainer-bfs", "appcontainer-dacl"].includes(support.isolationTier)) {
    throw coded("sandbox-isolation-unavailable", "The required local isolation tier is unavailable.");
  }
  const warnings = support.isolationWarnings ?? [];
  if (support.isolationTier !== "appcontainer-dacl" && warnings.length) {
    throw coded("sandbox-isolation-warning-unreviewed", "The sandbox reported an unreviewed isolation warning.");
  }
  if (support.isolationTier === "appcontainer-dacl"
      && warnings.some(warning => !acceptedDaclWarnings.some(pattern => pattern.test(warning)))) {
    throw coded("sandbox-isolation-warning-unreviewed", "The sandbox reported an unreviewed isolation warning.");
  }
  return support;
}

function childResult(stdout) {
  const markers = String(stdout).split(/\r?\n/).filter(line => line.startsWith(RESULT_MARKER));
  if (markers.length !== 1) throw coded("sandbox-result-invalid", "The sandbox returned no unique typed result.");
  let value;
  try { value = JSON.parse(Buffer.from(markers[0].slice(RESULT_MARKER.length), "base64url").toString("utf8")); }
  catch { throw coded("sandbox-result-invalid", "The sandbox result was malformed."); }
  if (!value || !["completed", "runtime-error", "timeout", "output-limited"].includes(value.status)
      || typeof value.stdout !== "string" || typeof value.stderr !== "string"
      || !(value.errorCode === null || /^[a-z0-9-]{1,100}$/.test(value.errorCode))
      || !/^v\d+\.\d+\.\d+$/.test(value.hostVersion)) {
    throw coded("sandbox-result-invalid", "The sandbox result did not match its contract.");
  }
  return value;
}

function boundedError(error) {
  const known = new Set(["sandbox-isolation-unavailable", "sandbox-isolation-warning-unreviewed",
    "sandbox-ui-isolation-unavailable", "sandbox-start-failed",
    "sandbox-result-invalid", "sandbox-output-limited", "sandbox-timeout", "sandbox-runtime-error",
    "sandbox-runtime-unavailable", "sandbox-memory-limit", "sandbox-source-invalid"]);
  return known.has(error?.code) ? error.code : "sandbox-unavailable";
}

export class MxcJavascriptExecutor {
  constructor({ runtimeRoot = resolve(import.meta.dirname, ".."),
    runnerPath = resolve(import.meta.dirname, "quickjs-child.mjs"), nodeExecutable = process.execPath,
    sdk = { createConfigFromPolicy, getPlatformSupport, spawnSandboxFromConfig },
    now = () => Date.now() } = {}) {
    this.runtimeRoot = resolve(runtimeRoot);
    this.runnerPath = resolve(runnerPath);
    this.nodeExecutable = resolve(nodeExecutable);
    this.sdk = sdk;
    this.now = now;
  }

  async execute(rawRequest) {
    const request = parseCodeExecutionRequest(rawRequest);
    const sourceSha256 = sha256(request.source);
    const startedAt = this.now();
    let support = { isolationTier: "unavailable" };
    let exitCode = null;
    let status = "unavailable";
    let errorCode = "sandbox-unavailable";
    let stdout = "";
    let stderr = "";
    let hostVersion = process.version;
    try {
      support = supportFor(this.sdk);
      const config = this.sdk.createConfigFromPolicy({
        version: "0.8.0-alpha",
        filesystem: { readonlyPaths: [this.runtimeRoot, dirname(this.nodeExecutable)],
          readwritePaths: [], deniedPaths: [], clearPolicyOnExit: true },
        network: { egress: { default: "deny" },
          ingress: { default: "deny", hostLoopback: "deny" } },
        ui: { allowWindows: false, clipboard: "none", allowInputInjection: false },
        timeoutMs: WALL_CLOCK_MS,
      }, "process", `runa2-js-${randomUUID()}`);
      config.fallback = { allowDaclMutation: true };
      config.process.commandLine = [quote(this.nodeExecutable), "--permission",
        `--allow-fs-read=${quote(this.runtimeRoot)}`, "--max-old-space-size=64",
        "--max-semi-space-size=1", "--no-warnings", quote(this.runnerPath)].join(" ");
      config.process.cwd = dirname(this.runnerPath);
      config.process.env = [
        `RUNA2_SOURCE_BASE64URL=${Buffer.from(request.source, "utf8").toString("base64url")}`,
        `RUNA2_SOURCE_SHA256=${sourceSha256}`,
      ];
      const child = this.sdk.spawnSandboxFromConfig(config, { usePty: false }, dirname(this.runnerPath));
      child.stdin?.on("error", () => {});
      child.stdin?.end();
      const outcome = await new Promise((resolveOutcome, rejectOutcome) => {
        let capturedStdout = "";
        let capturedStderr = "";
        let capturedBytes = 0;
        let parentLimited = false;
        let parentTimedOut = false;
        const capture = channel => chunk => {
          if (parentLimited) return;
          const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          capturedBytes += value.length;
          if (capturedBytes > PARENT_CAPTURE_LIMIT) {
            parentLimited = true;
            capturedStdout = "";
            capturedStderr = "";
            child.kill();
            return;
          }
          if (channel === "stdout") capturedStdout += value.toString("utf8");
          else capturedStderr += value.toString("utf8");
        };
        child.stdout?.on("data", capture("stdout"));
        child.stderr?.on("data", capture("stderr"));
        child.once("error", rejectOutcome);
        const timer = setTimeout(() => { parentTimedOut = true; child.kill(); }, WALL_CLOCK_MS + 500);
        child.once("close", code => {
          clearTimeout(timer);
          resolveOutcome({ exitCode: Number.isInteger(code) ? code : null,
            stdout: capturedStdout, stderr: capturedStderr, parentLimited, parentTimedOut });
        });
      });
      exitCode = outcome.exitCode;
      if (outcome.parentLimited) {
        status = "output-limited";
        errorCode = "sandbox-output-limited";
      } else if (outcome.parentTimedOut) {
        status = "timed-out";
        errorCode = "sandbox-timeout";
      } else {
        if (outcome.exitCode !== 0 && !String(outcome.stdout).includes(RESULT_MARKER)) {
          throw coded("sandbox-start-failed", "The sandbox process did not start successfully.");
        }
        const result = childResult(outcome.stdout);
        hostVersion = result.hostVersion;
        if (result.status === "completed" && outcome.exitCode === 0) {
          status = "executed";
          errorCode = null;
          stdout = result.stdout;
          stderr = result.stderr;
        } else {
          status = result.status === "timeout" ? "timed-out"
            : result.status === "output-limited" ? "output-limited" : "failed";
          errorCode = result.errorCode ?? "sandbox-runtime-error";
        }
      }
    } catch (error) {
      status = "unavailable";
      errorCode = boundedError(error);
    }
    const combinedBytes = Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8");
    if (combinedBytes > OUTPUT_LIMIT) {
      status = "output-limited";
      errorCode = "sandbox-output-limited";
      stdout = "";
      stderr = "";
    }
    const durationMs = Math.max(0, Math.round(this.now() - startedAt));
    return parseCodeExecutionReceipt({
      schemaVersion: "runa2-code-execution-receipt/v1",
      receiptId: `exec-${sha256(`${request.participant.principalId}\0${request.project.projectId}\0${request.thread.threadId}\0${request.requestId}\0${sourceSha256}\0${status}`).slice(0, 40)}`,
      requestId: request.requestId,
      participantId: request.participant.principalId,
      projectId: request.project.projectId,
      threadId: request.thread.threadId,
      status,
      language: "javascript",
      sourceSha256,
      runtime: { engine: "quickjs", package: "quickjs-emscripten", packageVersion: "0.32.0",
        host: "node", hostVersion },
      isolation: { provider: "microsoft-mxc", packageVersion: "0.8.0", method: "processcontainer",
        tier: support.isolationTier, filesystem: "read-only-runtime-only", network: "deny-all",
        environment: "explicit-minimal", ui: "denied" },
      limits: { sourceBytes: Buffer.byteLength(request.source, "utf8"), maximumSourceBytes: SOURCE_LIMIT,
        wallClockMs: WALL_CLOCK_MS, quickJsDeadlineMs: QUICKJS_DEADLINE_MS,
        maximumOutputBytes: OUTPUT_LIMIT, quickJsMemoryBytes: MEMORY_LIMIT,
        quickJsStackBytes: STACK_LIMIT, processLimit: 1, stdin: "closed" },
      output: { stdout, stderr,
        combinedBytes: Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8"),
        partialDelivered: false },
      exitCode,
      errorCode,
      durationMs,
      systemStamped: true,
      effects: [],
    });
  }

  async preflight() {
    const receipt = await this.execute({
      schemaVersion: "runa2-code-execution-request/v1",
      requestId: `sandbox-preflight-${randomUUID()}`,
      participant: { principalId: "runa2-system-preflight", verified: true },
      project: { projectId: "runa:system" },
      thread: { threadId: "sandbox-startup" },
      experience: "code",
      language: "javascript",
      source: "console.log('runa2-sandbox-ready')",
      origin: { type: "system-startup-preflight" },
    });
    return Object.freeze({ ready: receipt.status === "executed"
      && receipt.output.stdout === "runa2-sandbox-ready\n", receipt });
  }
}

class MemoryExecutionCoordinator {
  constructor({ maximumEntries = 256 } = {}) {
    this.maximumEntries = maximumEntries;
    this.entries = new Map();
  }

  async runOnce(request, execute) {
    const key = `${request.participant.principalId}\0${request.requestId}`;
    const inputDigest = sha256(JSON.stringify(request));
    const prior = this.entries.get(key);
    if (prior) {
      if (prior.inputDigest !== inputDigest) {
        throw coded("execution-request-id-conflict", "The execution request id is bound to different source.");
      }
      return structuredClone(await prior.receipt);
    }
    const receipt = Promise.resolve().then(execute);
    this.entries.set(key, { inputDigest, receipt });
    while (this.entries.size > this.maximumEntries) this.entries.delete(this.entries.keys().next().value);
    try { return structuredClone(await receipt); }
    catch (error) { this.entries.delete(key); throw error; }
  }
}

export class HarmlessJavascriptExecutionService {
  constructor({ executor = new MxcJavascriptExecutor(), coordinator = new MemoryExecutionCoordinator() } = {}) {
    this.executor = executor;
    this.coordinator = coordinator;
  }

  async execute(rawRequest) {
    const request = parseCodeExecutionRequest(rawRequest);
    return this.coordinator.runOnce(request, () => this.executor.execute(request));
  }
}

export { MemoryExecutionCoordinator, SOURCE_LIMIT, OUTPUT_LIMIT, WALL_CLOCK_MS,
  QUICKJS_DEADLINE_MS, MEMORY_LIMIT, STACK_LIMIT };
