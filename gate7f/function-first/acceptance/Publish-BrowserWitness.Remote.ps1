[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^campaign-(gemma4-26b-a4b|qwen3-coder-30b-a3b|qwen36-27b-mtp)-[a-f0-9]{16}$')][string]$CampaignDirectory,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedSourceCommit,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedRuntimeSeal,
  [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9+/=]+$')][string]$WitnessTicketBase64,
  [Parameter(Mandatory)][string]$ObservedWitnessJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$roots = @(
  [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')),
  [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
) | Select-Object -Unique
$root = @($roots | Where-Object {
  [IO.Path]::GetDirectoryName($_) -ceq 'C:\AI\RunaAI-Next-Candidate\staging' -and
  [IO.Path]::GetFileName($_) -match '^m1-task-native-[a-f0-9]{32}$' -and
  (Test-Path -LiteralPath (Join-Path $_ 'SOURCE-IDENTITY.json') -PathType Leaf)
})
if ($root.Count -ne 1) { throw 'browser-witness-operator-root-invalid' }
$root = [string]$root[0]
if ([Security.Principal.WindowsIdentity]::GetCurrent().Name -cne 'RUNA-CONTROL\Matthew' -or
    [IO.Path]::GetDirectoryName($root) -cne 'C:\AI\RunaAI-Next-Candidate\staging' -or
    [IO.Path]::GetFileName($root) -notmatch '^m1-task-native-[a-f0-9]{32}$' -or
    -not $CampaignDirectory.EndsWith($ExpectedRuntimeSeal.Substring(0, 16), [StringComparison]::Ordinal) -or
    $WitnessTicketBase64.Length -gt 8192 -or $ObservedWitnessJson.Length -gt 4096) {
  throw 'browser-witness-operator-binding-invalid'
}

$identityPath = Join-Path $root 'SOURCE-IDENTITY.json'
$identity = Get-Content -LiteralPath $identityPath -Raw | ConvertFrom-Json
if ($identity.schemaVersion -cne 'runaai-m1-source-identity/v1' -or
    $identity.sourceCommit -cne $ExpectedSourceCommit -or $identity.productionChanged -ne $false) {
  throw 'browser-witness-operator-source-invalid'
}

# The observation is mandatory input produced after the real browser reads the DOM.
# The source-pinned helper validates its exact canonical shape; it cannot construct
# the expected state from a checkpoint request or ticket.
$null = $ObservedWitnessJson | ConvertFrom-Json
$observed64 = [Convert]::ToBase64String([Text.UTF8Encoding]::new($false).GetBytes($ObservedWitnessJson))
$helper = Join-Path $root 'gate7f\function-first\acceptance\operator-browser-witness-helper.mjs'
$node = 'C:\AI\RunaAI-Next-Candidate\releases\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc\runtime\node.exe'
if (-not (Test-Path -LiteralPath $helper -PathType Leaf) -or
    ((Get-Item -LiteralPath $helper).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
    -not (Test-Path -LiteralPath $node -PathType Leaf)) {
  throw 'browser-witness-operator-helper-unavailable'
}

$code = @'
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const decode=value=>JSON.parse(Buffer.from(value,'base64').toString('utf8'));
const ticket=decode(process.argv[1]);
const observed=decode(process.argv[2]);
const {publishBrowserWitness}=await import(pathToFileURL(process.argv[3]).href);
const witnessSha256=await publishBrowserWitness(ticket,observed);
const observationSha256=createHash('sha256').update(JSON.stringify(observed)).digest('hex');
process.stdout.write(JSON.stringify({schemaVersion:'runaai-m1-browser-witness-publication-receipt/v1',published:true,witnessSha256,observationSha256,privateValuesIncluded:false}));
'@
& $node --input-type=module -e $code $WitnessTicketBase64 $observed64 $helper
if ($LASTEXITCODE -ne 0) { throw 'browser-witness-operator-publication-failed' }
