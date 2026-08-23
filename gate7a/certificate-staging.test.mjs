import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./control/Stage-ControlPorkbunCertificate.ps1", import.meta.url), "utf8");

test("certificate staging is exact-owner, exact-domain, DPAPI-bound, and one-shot", () => {
  assert.match(source, /RUNA-CONTROL\\Matthew/);
  assert.match(source, /bridgebuildersai\.com/);
  assert.match(source, /runa\.bridgebuildersai\.com/);
  assert.match(source, /Add-Type -AssemblyName System\.Security/);
  assert.match(source, /ProtectedData\]::Unprotect/);
  assert.match(source, /DataProtectionScope\]::CurrentUser/);
  assert.match(source, /gate7a-certificate-stage-already-exists/);
});

test("certificate staging calls only the read-only SSL retrieval endpoint", () => {
  assert.match(source, /Invoke-RestMethod -Method Get/);
  assert.match(source, /api\.porkbun\.com\/api\/json\/v3\/ssl\/retrieve\/\$Domain/);
  assert.doesNotMatch(source, /\/dns\/|\b-Method\s+(Post|Put|Patch|Delete)\b/i);
});

test("certificate staging validates PEM, wildcard SAN, and remaining lifetime before retention", () => {
  assert.match(source, /BEGIN CERTIFICATE/);
  assert.match(source, /BEGIN \(\?:RSA \)\?PRIVATE KEY/);
  assert.match(source, /2\.5\.29\.17/);
  assert.match(source, /bridgebuildersai/);
  assert.match(source, /AddDays\(14\)/);
  assert.ok(source.indexOf("$failureStage = 'certificate-validation'")
    < source.indexOf("$failureStage = 'protected-retention'"));
});

test("certificate staging retains no certificate or key material in aggregate output", () => {
  const publicOutputMatch = source.match(
    /\[ordered\]@\{\s*schemaVersion = 'runa2-gate7a-certificate-staging\/v1'[\s\S]*?\}\s*\| ConvertTo-Json -Compress/,
  );
  assert.ok(publicOutputMatch, "public aggregate output block must exist");
  const publicOutput = publicOutputMatch[0];
  assert.doesNotMatch(publicOutput, /certificatechain\s*=|privatekey\s*=|publickey\s*=|apiKey\s*=|secretApiKey\s*=/i);
  assert.match(publicOutput, /privateValuesIncluded = \$false/);
  assert.match(source, /Remove-Item -LiteralPath \$targetRoot -Recurse -Force/);
});
