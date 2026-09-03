import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runActualOmenGitPermissionBoundaryDiagnostic } from "./actual-git-proof.mjs";
import { loadOmenReleasePins } from "./release-pins.mjs";

const coded = code => Object.assign(new Error(code), { code });
const psLiteral = value => `'${String(value).replaceAll("'", "''")}'`;

function runPowerShell(path, encodedCommand, env) {
  return new Promise((done, fail) => {
    const child = spawn(path, ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand],
      { stdio: "inherit", windowsHide: true, env });
    child.once("error", fail);
    child.once("exit", (code, signal) => signal ? fail(coded("elevation-terminal-unresolved")) : done(code));
  });
}

export async function runActualHostPrerequisiteRepair() {
  if (process.env.RUNA_ACTUAL_HOST_REPAIR !== "1") throw coded("actual-host-repair-not-enabled");
  const pins = await loadOmenReleasePins();
  const pinned = [[pins.hostRepairLauncherPath, pins.hostRepairLauncherSha256],
    [pins.hostTransitionPath, pins.hostTransitionSha256], [pins.hostPrerequisiteReaderPath,
    pins.hostPrerequisiteReaderSha256], [pins.aclNativeSourcePath, pins.aclNativeSourceSha256],
    [pins.containedProcessSourcePath, pins.containedProcessSourceSha256], [pins.hostPrepPath, pins.hostPrepSha256],
    [pins.powershellPath, pins.powershellSha256]];
  for (const [path, digest] of pinned) {
    if (createHash("sha256").update(await readFile(path)).digest("hex") !== digest) throw coded("host-repair-pin-drift");
  }
  const argumentsList = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", pins.hostTransitionPath,
    "-Operation", "Prepare", "-ExpectedScriptSha256", pins.hostTransitionSha256,
    "-NativeSourcePath", pins.aclNativeSourcePath, "-ExpectedNativeSourceSha256", pins.aclNativeSourceSha256,
    "-ContainedProcessSourcePath", pins.containedProcessSourcePath, "-ExpectedContainedProcessSourceSha256",
    pins.containedProcessSourceSha256, "-PrerequisiteReaderPath", pins.hostPrerequisiteReaderPath,
    "-ExpectedPrerequisiteReaderSha256", pins.hostPrerequisiteReaderSha256, "-HostPrepPath", pins.hostPrepPath,
    "-ExpectedHostPrepSha256", pins.hostPrepSha256, "-PowerShellPath", pins.powershellPath,
    "-ExpectedPowerShellSha256", pins.powershellSha256, "-Target", "C:\\"];
  const command = `$env:RUNA_ACTUAL_HOST_TRANSITION='1';$a=@(${argumentsList.map(psLiteral).join(",")});`
    + `$p=Start-Process -FilePath ${psLiteral(pins.powershellPath)} -ArgumentList $a -Verb RunAs -Wait -PassThru;exit $p.ExitCode`;
  const encoded = Buffer.from(command, "utf16le").toString("base64");
  const elevationExitCode = await runPowerShell(pins.powershellPath, encoded, process.env);
  if (elevationExitCode !== 0) throw Object.assign(coded("actual-host-repair-failed"), { elevationExitCode });
  const diagnostic = await runActualOmenGitPermissionBoundaryDiagnostic();
  return { schemaVersion: "runa-omen-host-repair/v1", passed: diagnostic.passed === true,
    hostPrerequisitesReady: true, diagnostic, privateValuesIncluded: false, modelCalled: false };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runActualHostPrerequisiteRepair().then(result => process.stdout.write(`${JSON.stringify(result)}\n`), error => {
    process.stderr.write(`${JSON.stringify({ schemaVersion: "runa-omen-host-repair-error/v1",
      code: error?.code ?? "actual-host-repair-failed", elevationExitCode: error?.elevationExitCode ?? null,
      privateValuesIncluded: false })}\n`); process.exitCode = 1;
  });
}
