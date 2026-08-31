[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^(?:campaign-(?:gemma4-26b-a4b|qwen3-coder-30b-a3b|qwen36-27b-mtp)-[a-f0-9]{16}|supplemental-qwen36-27b-mtp-[a-f0-9]{16}-[a-f0-9]{12})$')][string]$CampaignDirectory,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedSourceCommit,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedRuntimeSeal,
  [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9+/=]+$')][string]$WitnessTicketBase64,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$')][string]$CheckpointId,
  [Parameter(Mandatory)][string]$Url,
  [Parameter(Mandatory)][string]$ObservedWitnessJson,
  [string]$ActualJson='false',
  [Parameter(Mandatory)][string]$DetailsJson
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
if ($root.Count -ne 1) { throw 'browser-witness-ack-operator-root-invalid' }
$root = [string]$root[0]
if ([Security.Principal.WindowsIdentity]::GetCurrent().Name -cne 'RUNA-CONTROL\Matthew' -or
    -not $CampaignDirectory.EndsWith($ExpectedRuntimeSeal.Substring(0, 16), [StringComparison]::Ordinal) -or
    $Url -notmatch '^http://127\.0\.0\.1:[1-9][0-9]{3,4}/$' -or
    $WitnessTicketBase64.Length -gt 8192 -or $ObservedWitnessJson.Length -gt 4096 -or
    $ActualJson.Length -gt 4096 -or $DetailsJson.Length -gt 4096) {
  throw 'browser-witness-ack-operator-binding-invalid'
}
$identity = Get-Content -LiteralPath (Join-Path $root 'SOURCE-IDENTITY.json') -Raw | ConvertFrom-Json
if ($identity.schemaVersion -cne 'runaai-m1-source-identity/v1' -or
    $identity.sourceCommit -cne $ExpectedSourceCommit -or $identity.productionChanged -ne $false) {
  throw 'browser-witness-ack-operator-source-invalid'
}
$ticketRaw = [Text.UTF8Encoding]::new($false).GetString([Convert]::FromBase64String($WitnessTicketBase64))
$ticket = $ticketRaw | ConvertFrom-Json
if ($ticket.checkpointId -cne $CheckpointId -or $ticket.baseUrl + '/' -cne $Url) {
  throw 'browser-witness-ack-operator-ticket-invalid'
}
$null = $ObservedWitnessJson | ConvertFrom-Json
$null = $ActualJson | ConvertFrom-Json
$null = $DetailsJson | ConvertFrom-Json
$directory = Join-Path (Join-Path $root 'acceptance-evidence') $CampaignDirectory
$checkpointDirectory = Join-Path $directory ('browser-' + $CheckpointId)
$requestPath = Join-Path $checkpointDirectory 'request.json'
$ackPath = Join-Path $checkpointDirectory 'browser-ack.json'
if ([IO.Path]::GetFullPath($checkpointDirectory) -cne $checkpointDirectory -or
    -not (Test-Path -LiteralPath $requestPath -PathType Leaf) -or (Test-Path -LiteralPath $ackPath)) {
  throw 'browser-witness-ack-operator-directory-invalid'
}
$request = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json
if ($request.checkpointId -cne $CheckpointId -or $request.runtimeSealSha256 -cne $ExpectedRuntimeSeal -or
    $request.ackPath -cne $ackPath -or $request.baseUrl + '/' -cne $Url) {
  throw 'browser-witness-ack-operator-request-invalid'
}
$actual64 = [Convert]::ToBase64String([Text.UTF8Encoding]::new($false).GetBytes($ActualJson))
$details64 = [Convert]::ToBase64String([Text.UTF8Encoding]::new($false).GetBytes($DetailsJson))
$observed64 = [Convert]::ToBase64String([Text.UTF8Encoding]::new($false).GetBytes($ObservedWitnessJson))
$observedAt = [DateTime]::UtcNow.ToString('o')
$node = 'C:\AI\RunaAI-Next-Candidate\releases\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc\runtime\node.exe'
$helper = Join-Path $root 'gate7f\function-first\acceptance\operator-browser-witness-and-ack-helper.mjs'
if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or
    -not (Test-Path -LiteralPath $helper -PathType Leaf) -or
    ((Get-Item -LiteralPath $helper).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
  throw 'browser-witness-ack-operator-helper-unavailable'
}
& $node $helper $WitnessTicketBase64 $requestPath $ackPath $Url $actual64 $details64 $observed64 $observedAt
if ($LASTEXITCODE -ne 0) { throw 'browser-witness-ack-operator-publication-failed' }
