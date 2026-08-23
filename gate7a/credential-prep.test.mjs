import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const enrollment = await readFile(new URL("./control/Set-ControlPorkbunCredential.ps1", import.meta.url), "utf8");
const preflight = await readFile(new URL("./control/Test-ControlPorkbunCredential.ps1", import.meta.url), "utf8");

test("Porkbun enrollment is interactive, owner-bound, DPAPI-protected, and network-inert", () => {
  assert.match(enrollment, /RUNA-CONTROL\\Matthew/);
  assert.match(enrollment, /Read-Host 'Porkbun API key' -AsSecureString/);
  assert.match(enrollment, /Read-Host 'Porkbun secret API key' -AsSecureString/);
  assert.match(enrollment, /Add-Type -AssemblyName System\.Security/);
  assert.match(enrollment, /ProtectedData\]::Protect/);
  assert.match(enrollment, /DataProtectionScope\]::CurrentUser/);
  assert.match(enrollment, /ZeroFreeBSTR/);
  assert.match(enrollment, /networkCalled = \$false/);
  assert.doesNotMatch(enrollment, /Invoke-RestMethod|Invoke-WebRequest/);
});

test("Porkbun preflight makes only authenticated read calls and never opens the SSL bundle", () => {
  assert.match(preflight, /Add-Type -AssemblyName System\.Security/);
  assert.match(preflight, /-Method Get -Uri "\$base\/ping"/);
  assert.match(preflight, /-Method Get -Uri "\$base\/dns\/retrieve\/\$Domain"/);
  assert.doesNotMatch(preflight, /ssl\/retrieve|\b-Method\s+(Post|Put|Patch|Delete)\b/i);
  assert.match(preflight, /sslBundleOpened = \$false/);
  assert.match(preflight, /dnsChanged = \$false/);
  assert.match(preflight, /certificateRetrieved = \$false/);
});

test("a clean Windows PowerShell assembly-load failure is explicit and precedes secret entry", () => {
  assert.ok(enrollment.indexOf("Add-Type -AssemblyName System.Security")
    < enrollment.indexOf("Read-Host 'Porkbun API key' -AsSecureString"));
  assert.match(enrollment, /\$failureStage = 'assembly-load'/);
  assert.match(enrollment, /gate7a-porkbun-credential-\$failureStage-failed/);
});

test("credential tools retain no secret, certificate, public IP, or private response value in output", () => {
  const enrollmentWithoutProtectedPayload = enrollment.replace(
    /\$payload = [\s\S]*?\$clearBytes =/, "$clearBytes =");
  for (const source of [enrollmentWithoutProtectedPayload, preflight]) {
    const outputBlocks = [...source.matchAll(/\[ordered\]@\{[\s\S]*?\}\s*\| ConvertTo-Json -Compress/g)]
      .map(match => match[0]).join("\n");
    assert.doesNotMatch(outputBlocks, /apiKey\s*=|secretApiKey\s*=|privatekey|certificatechain|yourIp/i);
    assert.match(outputBlocks, /privateValuesIncluded = \$false/);
  }
});
