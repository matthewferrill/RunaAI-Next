import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createConfigFromPolicy, getPlatformSupport, spawnSandboxFromConfig } from "@microsoft/mxc-sdk";
import { createContainedGitConfig, fixedArguments, policyTemplateDigest } from "./git-observer.mjs";
import { loadOmenReleasePins } from "./release-pins.mjs";

const coded = code => Object.assign(new Error(code), { code });
const acceptedWarnings = [/^BaseContainer tier not selected, and AppContainer \+ BFS is not compiled into this binary;/u,
  /^AppContainer \+ DACL tier selected:/u];

async function run(payload) {
  const pins = await loadOmenReleasePins();
  if (!payload || !["first-run", "post-restart"].includes(payload.phase)
      || typeof payload.repository !== "string" || !existsSync(payload.repository)
      || !Array.isArray(payload.urls) || payload.urls.length !== 3
      || payload.urls.some(value => typeof value !== "string" || value.length > 500)) {
    throw coded("omen-network-proof-input-invalid");
  }
  const files = [[pins.nativeScriptPath, pins.nativeScriptSha256], [pins.powershellPath, pins.powershellSha256],
    [pins.gitPath, pins.gitSha256], [pins.gitSystemConfigPath, pins.gitSystemConfigSha256],
    [pins.gitSystemAttributesPath, pins.gitSystemAttributesSha256],
    [pins.mxcExecutorPath, pins.mxcExecutorSha256]];
  for (const [path, expected] of files) {
    if (createHash("sha256").update(await readFile(path)).digest("hex") !== expected) {
      throw coded("omen-network-proof-release-mismatch");
    }
  }
  const support = getPlatformSupport();
  if (support?.isSupported !== true || !(support.availableMethods ?? []).includes("processcontainer")
      || support.isolationTier !== "appcontainer-dacl"
      || (support.isolationWarnings ?? []).some(warning => !acceptedWarnings.some(pattern => pattern.test(warning)))) {
    throw coded("omen-network-proof-containment-unavailable");
  }
  const attempts = [];
  for (let index = 0; index < payload.urls.length; index += 1) {
    const statusArgs = fixedArguments("status", {}, payload.repository);
    const prefix = statusArgs.slice(0, statusArgs.indexOf("status"));
    const config = createContainedGitConfig({ createConfigFromPolicy }, { root: payload.repository,
      gitInstallRoot: pins.gitInstallRoot, gitPath: pins.gitPath,
      args: [...prefix, "ls-remote", "--exit-code", payload.urls[index]],
      containerId: `runa-network-${payload.phase}-${index}` });
    if (policyTemplateDigest(config) !== pins.policyTemplateSha256) throw coded("omen-network-policy-drift");
    const child = spawnSandboxFromConfig(config, { usePty: false, executablePath: pins.mxcExecutorPath },
      payload.repository);
    child.stdin?.on("error", () => {}); child.stdin?.end();
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0);
    child.stdout?.on("data", chunk => { stdout = Buffer.concat([stdout, Buffer.from(chunk)]); });
    child.stderr?.on("data", chunk => { stderr = Buffer.concat([stderr, Buffer.from(chunk)]); });
    const exitCode = await new Promise((done, fail) => {
      const timer = setTimeout(() => { try { child.kill(); } catch {}; fail(coded("omen-network-proof-timeout")); }, 18_000);
      child.once("error", () => { clearTimeout(timer); fail(coded("omen-network-proof-process-error")); });
      child.once("close", code => { clearTimeout(timer); done(code); });
    });
    if (exitCode !== 128 || stdout.length !== 0 || stdout.length + stderr.length > 256 * 1024) {
      throw coded("omen-network-proof-not-denied");
    }
    let stderrText;
    try { stderrText = new TextDecoder("utf-8", { fatal: true }).decode(stderr); }
    catch { throw coded("omen-network-proof-diagnostic-invalid"); }
    const attemptedConnection = /fatal: unable to access '[^'\r\n]+':/u.test(stderrText)
      && /(?:Failed to connect|Could not resolve host|Couldn't connect to server|Network is unreachable|Permission denied)/iu.test(stderrText);
    if (!attemptedConnection) throw coded("omen-network-connection-attempt-unproved");
    attempts.push({ target: index, exitCode, stdoutBytes: stdout.length, stderrBytes: stderr.length,
      attemptedConnection,
      commandSha256: createHash("sha256").update(config.process.commandLine).digest("hex"),
      policySha256: createHash("sha256").update(JSON.stringify(config)).digest("hex") });
  }
  return { schemaVersion: "runa-omen-network-child-proof/v1", phase: payload.phase,
    attempts, passed: attempts.length === 3 && attempts.every(value => value.attemptedConnection),
    privateValuesIncluded: false };
}

let payload;
try { payload = JSON.parse(Buffer.from(process.argv[2] ?? "", "base64url").toString("utf8")); }
catch { payload = null; }
run(payload).then(value => process.stdout.write(`${JSON.stringify(value)}\n`), error => {
  process.stderr.write(`${JSON.stringify({ schemaVersion: "runa-omen-network-child-error/v1",
    errorCode: error?.code ?? "omen-network-child-failed", privateValuesIncluded: false })}\n`);
  process.exitCode = 1;
});
