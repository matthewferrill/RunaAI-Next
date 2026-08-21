import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SCRIPT = fileURLToPath(new URL("./runa-gate4a-windows-dpapi.ps1", import.meta.url));
const MAX_BYTES = 4_096;
const coded = code => Object.assign(new Error("The disposable owner-bound key ceremony failed."), { code });

export function createGate4aDpapiProtector({
  platform = process.platform,
  systemRoot = process.env.SystemRoot || "C:\\Windows",
  scriptPath = DEFAULT_SCRIPT,
  spawn = spawnSync,
} = {}) {
  const executable = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  function run(mode, input) {
    if (platform !== "win32") throw coded("protected-key-platform-unsupported");
    if (!Buffer.isBuffer(input) || !input.length || input.length > MAX_BYTES) throw coded("protected-key-input-invalid");
    const result = spawn(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", resolve(scriptPath), mode], { input: input.toString("base64"), encoding: "utf8",
      windowsHide: true, timeout: 30_000, maxBuffer: MAX_BYTES * 4 });
    if (result?.status !== 0 || typeof result.stdout !== "string" || !result.stdout.trim()) {
      throw coded("protected-key-dpapi-failed");
    }
    const encoded = result.stdout.trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw coded("protected-key-dpapi-failed");
    const output = Buffer.from(encoded, "base64");
    if (!output.length || output.length > MAX_BYTES) throw coded("protected-key-dpapi-failed");
    return output;
  }
  return Object.freeze({
    id: "windows-dpapi-current-user-gate4a-rehearsal",
    protect: input => run("protect", input),
    unprotect: input => run("unprotect", input),
  });
}
