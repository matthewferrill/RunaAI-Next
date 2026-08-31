import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const wrapper = fileURLToPath(new URL("./Publish-BrowserWitness.Remote.ps1", import.meta.url));

test("the owner witness wrapper parses in Windows PowerShell 5 without executing", () => {
  const escaped = wrapper.replaceAll("'", "''");
  const command = `$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile('${escaped}',[ref]$null,[ref]$errors);if($errors.Count){$errors|ForEach-Object{$_.Message};exit 1}`;
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command],
    { windowsHide: true, stdio: "pipe" });
});

test("the wrapper requires browser-derived state and never builds it from request metadata", async () => {
  const source = await readFile(wrapper, "utf8");
  assert.match(source, /\[Parameter\(Mandatory\)\]\[string\]\$ObservedWitnessJson/u);
  assert.match(source, /publishBrowserWitness\(ticket,observed\)/u);
  assert.doesNotMatch(source, /AGENT05_BOUNDED_DRAIN|AGENT05_BOUNDED_DRAIN_NOTICE|request\.json/u);
  assert.match(source, /SOURCE-IDENTITY\.json/u);
  assert.match(source, /\.\.\\\.\.\\\.\./u);
  assert.match(source, /ExpectedSourceCommit/u);
  assert.match(source, /ExpectedRuntimeSeal/u);
});
