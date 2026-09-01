import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

test("watcher arms the exact preparation checkpoint and never uses a global witness counter", async () => {
  const source = await readFile(new URL("./Watch-ControlR13AckAfterWitness.Remote.ps1", import.meta.url), "utf8");
  assert.match(source, /runaai-m1-browser-watcher-armed\/v1/u);
  assert.match(source, /browser-observation-status\?checkpointId=/u);
  assert.match(source, /preparationCheckpointId/u);
  assert.match(source, /operator-browser-ack-helper\.mjs/u);
  assert.match(source, /DiscoveryTimeoutSeconds/u); assert.match(source, /ObservationTimeoutSeconds/u);
  assert.match(source, /PublicationTimeoutSeconds/u);
  assert.match(source, /\.IndexOf\(\$ExpectedRuntimeSeal\.Substring\(0,16\),\[StringComparison\]::Ordinal\)-lt0/u);
  assert.doesNotMatch(source, /\.Contains\([^\r\n]+\[StringComparison\]::/u);
  assert.match(source, /domBindingSha256/u); assert.match(source, /status\.domBinding\.witnessedUrl/u);
  assert.match(source, /consumed\.json/u); assert.match(source, /consumed\.checkpointId-cne\$checkpoint/u);
  assert.match(source, /consumed\.preparationOnly-eq\$true/u);
  assert.match(source, /\$completed\[\$checkpoint\]=\$true/u);
  assert.doesNotMatch(source, /acknowledgementAccepted-eq\$true\)\{exit 0\}/u);
  assert.doesNotMatch(source, /browserWitnessAccepted/u);
  assert.doesNotMatch(source, /witnessBaseline/u);
});

test("watcher parses in Windows PowerShell 5 without executing", { skip: process.platform !== "win32" }, () => {
  const file = fileURLToPath(new URL("./Watch-ControlR13AckAfterWitness.Remote.ps1", import.meta.url)).replaceAll("'", "''");
  const source = `$errors=$null;[Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$null,[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{$_.ToString()};exit 1}`;
  execFileSync("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(source, "utf16le").toString("base64")],
    { windowsHide: true, stdio: "pipe" });
});
