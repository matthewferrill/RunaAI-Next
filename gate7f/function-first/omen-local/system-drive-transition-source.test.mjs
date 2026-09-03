import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { validateTransitionRecord } from "./system-drive-transition-contract.mjs";
import { loadOmenReleasePins } from "./release-pins.mjs";

const here = import.meta.dirname;
const files = ["Invoke-RunaOmenSystemDriveTransition.ps1", "Get-RunaOmenHostPrerequisites.ps1",
  "RunaOmenAclNative.cs", "RunaContainedProcess.cs"];

test("system-drive source binds only the reviewed target-only API path", async () => {
  const source = (await Promise.all(files.map(file => readFile(resolve(here, file), "utf8")))).join("\n");
  for (const forbidden of [/SetNamedSecurityInfo/u, /\bSetSecurityInfo\s*\(/u, /\bSet-Acl\b/u, /\bicacls\b/ui,
    /\bprepare-system-drive\b/u, /\bunprepare-system-drive\b/u, /Threading\.MutexSecurity/u]) assert.doesNotMatch(source, forbidden);
  for (const required of ["SetFileSecurityW", "DACL_SECURITY_INFORMATION", "SetEntriesInAclW",
    "Global\\RunaAI-SystemDrivePreparation-v1", "MoveFileExW", "CreateProcessW", "CreateSuspended"])
    assert.ok(source.includes(required), required);
});

test("coordinator source retains immediate rollback and deprovision truth gates", async () => {
  const source = await readFile(resolve(here, "Invoke-RunaOmenSystemDriveTransition.ps1"), "utf8");
  assert.match(source, /if \(\$isPre -and \$write\.Success\)/u);
  const rollbackPhase = source.indexOf("$journal.phase = 'rollback-started'");
  const rollbackPins = source.indexOf("if (-not (Test-RunaPins))", rollbackPhase);
  const rollbackIdentity = source.indexOf("Assert-RunaRootIdentity $rootIdentity", rollbackPins);
  const rollbackReadback = source.indexOf("[RunaOmenAclNative]::Equal([RunaOmenAclNative]::Read($Target), $actual)", rollbackIdentity);
  const rollbackWrite = source.indexOf("[RunaOmenAclNative]::ApplyDacl($Target, $rollbackRaw)", rollbackReadback);
  assert.ok(rollbackPhase >= 0 && rollbackPins > rollbackPhase && rollbackIdentity > rollbackPins
    && rollbackReadback > rollbackIdentity && rollbackWrite > rollbackReadback);
  assert.match(source, /Write-RunaTransition 'error' 'preflight' 'pin-drift' 'prepared' \$false \$false 'retained' \$true/u);
  assert.match(source, /\$mutexOutcome = \[RunaMutexWait\]::Enter\(\$script:Mutex\)/u);
  assert.match(source, /if \(\$mutexOutcome -ceq 'busy'\) \{ Write-RunaMutexPreconditionFailure; exit 1 \}/u);
  assert.match(source, /if \(\$mutexOutcome -ceq 'abandoned'\)[\s\S]*reconciliation-required/u);
});

test("PowerShell 5.1 compiles helpers and real owned-temp API probes", () => {
  for (const script of ["RunaContainedProcess.test.ps1", "RunaOmenAclNative.test.ps1", "RunaMutexGate.test.ps1",
    "RunaIdentityGuard.test.ps1", "RunaCoordinatorTrace.test.ps1"]) {
    const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", resolve(here, script)], { encoding: "utf8", timeout: 30_000 });
    const record = JSON.parse(output.trim());
    assert.equal(record.passed, true);
  }
});

test("transition and reader scripts parse under Windows PowerShell", () => {
  const command = files.filter(file => file.endsWith(".ps1")).map(file =>
    `$e=$null;$t=$null;[Management.Automation.Language.Parser]::ParseFile('${resolve(here, file).replaceAll("'", "''")}',[ref]$t,[ref]$e)|Out-Null;if(@($e).Count){exit 1}`)
    .join(";");
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { timeout: 15_000 });
});

test("disabled actual transition publishes one exact fail-closed record", () => {
  const script = resolve(here, "Invoke-RunaOmenSystemDriveTransition.ps1");
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Operation", "Prepare",
    "-ExpectedScriptSha256", "0".repeat(64), "-NativeSourcePath", "missing", "-ExpectedNativeSourceSha256",
    "0".repeat(64), "-ContainedProcessSourcePath", "missing", "-ExpectedContainedProcessSourceSha256",
    "0".repeat(64), "-PrerequisiteReaderPath", "missing", "-ExpectedPrerequisiteReaderSha256", "0".repeat(64),
    "-HostPrepPath", "missing", "-ExpectedHostPrepSha256", "0".repeat(64), "-PowerShellPath", "missing",
    "-ExpectedPowerShellSha256", "0".repeat(64)];
  const result = spawnSync("powershell.exe", args, { encoding: "utf8", timeout: 15_000,
    env: { ...process.env, RUNA_ACTUAL_HOST_TRANSITION: "0" } });
  assert.equal(result.status, 1); assert.equal(result.stderr, "");
  const lines = result.stdout.trim().split(/\r?\n/u); assert.equal(lines.length, 1);
  assert.equal(validateTransitionRecord(JSON.parse(lines[0])), true);
});

test("host repair release pins bind every executable source byte", async () => {
  const pins = await loadOmenReleasePins();
  const pairs = [[pins.hostPrepPath, pins.hostPrepSha256],
    [pins.hostPrerequisiteReaderPath, pins.hostPrerequisiteReaderSha256],
    [pins.hostTransitionPath, pins.hostTransitionSha256], [pins.aclNativeSourcePath, pins.aclNativeSourceSha256],
    [pins.containedProcessSourcePath, pins.containedProcessSourceSha256],
    [pins.hostRepairLauncherPath, pins.hostRepairLauncherSha256]];
  for (const [path, digest] of pairs)
    assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), digest, path);
});

test("pinned transition stops before mutation under the ordinary Omen token", async t => {
  const token = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "$p=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent());$p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"],
  { encoding: "utf8", timeout: 15_000 });
  if (token.stdout.trim().toLowerCase() === "true") { t.skip("elevated token cannot exercise no-write stop"); return; }
  const pins = await loadOmenReleasePins();
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", pins.hostTransitionPath,
    "-Operation", "Prepare", "-ExpectedScriptSha256", pins.hostTransitionSha256,
    "-NativeSourcePath", pins.aclNativeSourcePath, "-ExpectedNativeSourceSha256", pins.aclNativeSourceSha256,
    "-ContainedProcessSourcePath", pins.containedProcessSourcePath, "-ExpectedContainedProcessSourceSha256",
    pins.containedProcessSourceSha256, "-PrerequisiteReaderPath", pins.hostPrerequisiteReaderPath,
    "-ExpectedPrerequisiteReaderSha256", pins.hostPrerequisiteReaderSha256, "-HostPrepPath", pins.hostPrepPath,
    "-ExpectedHostPrepSha256", pins.hostPrepSha256, "-PowerShellPath", pins.powershellPath,
    "-ExpectedPowerShellSha256", pins.powershellSha256];
  const result = spawnSync("powershell.exe", args, { encoding: "utf8", timeout: 30_000,
    env: { ...process.env, RUNA_ACTUAL_HOST_TRANSITION: "1" } });
  assert.equal(result.status, 1); assert.equal(result.stderr, "");
  const lines = result.stdout.trim().split(/\r?\n/u); assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]); assert.equal(validateTransitionRecord(record), true);
  assert.equal(record.code, "precondition-failed"); assert.equal(record.targetOnlyProbePassed, false);
});
