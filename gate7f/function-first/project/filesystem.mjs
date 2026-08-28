import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { failure } from "./contracts.mjs";

const helper = fileURLToPath(new URL("./Invoke-ProjectFilesystem.ps1", import.meta.url));
export function validateBaseDirectory(value) {
  if (process.platform !== "win32") throw failure("project-platform-isolation-unavailable");
  if (typeof value !== "string" || !/^[A-Za-z]:\\/.test(value) || value.length > 180
    || value !== path.resolve(value) || value === path.parse(value).root
    || value.slice(2).includes(":") || /(?:^|\\)[^\\]*[. ](?:\\|$)/.test(value)
    || value.split("\\").some(part => /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) {
    throw failure("project-base-invalid");
  }
  return value;
}

export async function revisionFilesystem({ operation, baseDirectory, environmentDirectory, revisionId, files }) {
  validateBaseDirectory(baseDirectory);
  const input = JSON.stringify({ operation, baseDirectory, environmentDirectory, revisionId,
    files: files.map(file => ({ path: file.path, base64: Buffer.from(file.content ?? "").toString("base64") })) });
  const powershell = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return new Promise((resolve, reject) => {
    const child = spawn(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", helper], {
      windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = ""; let stderrBytes = 0; let settled = false;
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(result); };
    const timer = setTimeout(() => { child.kill(); finish(failure("project-filesystem-timeout")); }, 15_000);
    child.on("error", () => finish(failure("project-filesystem-unavailable")));
    child.stdin.on("error", () => {});
    child.stdout.on("data", chunk => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout) > 32_000) { child.kill(); finish(failure("project-filesystem-output-invalid")); }
    });
    child.stderr.on("data", chunk => { stderrBytes += chunk.length; if (stderrBytes > 16_000) child.kill(); });
    child.on("close", code => {
      try {
        const result = JSON.parse(stdout.trim());
        if (result.status === "error" || code !== 0 || stderrBytes) throw failure(
          /^project-[a-z-]+$/.test(result.errorCode ?? "") ? result.errorCode : "project-filesystem-operation-failed");
        if (result.status === "absent" && operation === "observe") return finish(null, { status: "absent" });
        if (result.status !== "present" || !Array.isArray(result.files)) throw failure("project-filesystem-output-invalid");
        const decoded = result.files.map(file => {
          if (typeof file.path !== "string" || typeof file.base64 !== "string") throw failure("project-filesystem-output-invalid");
          const bytes = Buffer.from(file.base64, "base64");
          if (bytes.toString("base64") !== file.base64) throw failure("project-filesystem-output-invalid");
          return { path: file.path, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
        });
        finish(null, { status: "present", created: result.created === true, files: decoded });
      } catch (error) { finish(error?.code ? error : failure("project-filesystem-output-invalid")); }
    });
    child.stdin.end(input);
  });
}
