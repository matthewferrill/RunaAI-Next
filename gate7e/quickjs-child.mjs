import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { getQuickJS } from "quickjs-emscripten";

const RESULT_MARKER = "RUNA2_EXECUTION_RESULT:";
const SOURCE_LIMIT = 8_000;
const OUTPUT_LIMIT = 16_000;
const MEMORY_LIMIT = 16 * 1024 * 1024;
const STACK_LIMIT = 512 * 1024;
const QUICKJS_DEADLINE_MS = 1_200;

const sourcePathArgument = process.argv.find(value => value.startsWith("--source-file="));
const sourceDigestArgument = process.argv.find(value => value.startsWith("--source-sha256="));
const sourcePath = sourcePathArgument?.slice("--source-file=".length) ?? "";
const expectedDigest = sourceDigestArgument?.slice("--source-sha256=".length) ?? "";

function emit(value) {
  process.stdout.write(`${RESULT_MARKER}${Buffer.from(JSON.stringify({ ...value,
    hostVersion: process.version }), "utf8").toString("base64url")}\n`);
}

function safeText(value) {
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return `${value}n`;
  try {
    const encoded = JSON.stringify(value, (_key, nested) => typeof nested === "bigint" ? `${nested}n` : nested);
    if (typeof encoded === "string") return encoded;
  } catch {}
  return String(value);
}

let source;
try {
  const encoded = readFileSync(sourcePath);
  if (!encoded.length || encoded.length > SOURCE_LIMIT || !/^[a-f0-9]{64}$/.test(expectedDigest)) {
    throw new Error("source-invalid");
  }
  const actualDigest = createHash("sha256").update(encoded).digest("hex");
  if (actualDigest !== expectedDigest) throw new Error("source-invalid");
  source = new TextDecoder("utf-8", { fatal: true }).decode(encoded);
} catch {
  emit({ status: "runtime-error", stdout: "", stderr: "", errorCode: "sandbox-source-invalid" });
  process.exit(2);
}

const sourceBytes = Buffer.byteLength(source, "utf8");
if (!sourceBytes || sourceBytes > SOURCE_LIMIT) {
  emit({ status: "runtime-error", stdout: "", stderr: "", errorCode: "sandbox-source-invalid" });
  process.exit(2);
}

let stdout = "";
let stderr = "";
let outputBytes = 0;
let outputLimited = false;
const startedAt = Date.now();

function append(channel, values) {
  if (outputLimited) return;
  const line = `${values.map(safeText).join(" ")}\n`;
  const bytes = Buffer.byteLength(line, "utf8");
  if (outputBytes + bytes > OUTPUT_LIMIT) {
    outputLimited = true;
    stdout = "";
    stderr = "";
    outputBytes = 0;
    return;
  }
  outputBytes += bytes;
  if (channel === "stderr") stderr += line;
  else stdout += line;
}

let runtime;
let context;
try {
  const QuickJS = await getQuickJS();
  runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT);
  runtime.setMaxStackSize(STACK_LIMIT);
  runtime.setInterruptHandler(() => outputLimited || Date.now() > startedAt + QUICKJS_DEADLINE_MS);
  context = runtime.newContext();

  const consoleValue = context.newObject();
  for (const [name, channel] of [["log", "stdout"], ["info", "stdout"],
    ["warn", "stderr"], ["error", "stderr"]]) {
    const callback = context.newFunction(name, (...values) => {
      append(channel, values.map(value => context.dump(value)));
      return context.undefined;
    });
    context.setProp(consoleValue, name, callback);
    callback.dispose();
  }
  context.setProp(context.global, "console", consoleValue);
  consoleValue.dispose();

  const evaluated = context.evalCode(source, "user-code.js");
  if (outputLimited) {
    if (evaluated.error) evaluated.error.dispose(); else evaluated.value.dispose();
    emit({ status: "output-limited", stdout: "", stderr: "", errorCode: "sandbox-output-limited" });
    process.exitCode = 3;
  } else if (evaluated.error) {
    let details = null;
    try { details = context.dump(evaluated.error); } catch {}
    evaluated.error.dispose();
    const name = typeof details?.name === "string" ? details.name : "Error";
    const message = typeof details?.message === "string" ? details.message : "JavaScript execution failed.";
    const interrupted = name === "InternalError" && message === "interrupted";
    const memory = /memory|allocation|out of memory/i.test(message);
    emit({ status: interrupted ? "timeout" : "runtime-error", stdout: "", stderr: "",
      errorCode: interrupted ? "sandbox-timeout" : memory ? "sandbox-memory-limit" : "sandbox-runtime-error" });
    process.exitCode = interrupted ? 4 : 2;
  } else {
    evaluated.value.dispose();
    emit({ status: "completed", stdout, stderr, errorCode: null });
  }
} catch (error) {
  const memory = /memory|allocation|out of memory/i.test(String(error?.message ?? ""));
  emit({ status: "runtime-error", stdout: "", stderr: "",
    errorCode: memory ? "sandbox-memory-limit" : "sandbox-runtime-unavailable" });
  process.exitCode = 2;
} finally {
  try { context?.dispose(); } catch {}
  try { runtime?.dispose(); } catch {}
}
