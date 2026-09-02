[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$FinalizationSha256,
  [Parameter(Mandatory)][ValidatePattern('^campaign-(?:gemma4-26b-a4b|qwen3-coder-30b-a3b|qwen36-27b-mtp)-[a-f0-9]{16}$')][string]$CampaignDirectory,
  [Parameter(Mandatory)][switch]$BrowserWitnessReady
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-'+$StageId
$validator=Join-Path $root 'Validate-Stage.ps1';$validatorSha256='fe088cbf627f64b051e0025061166e7dfbea93ec60ffe1bd9a7e9c489f029845'
$remote="Set-StrictMode -Version Latest;`$ErrorActionPreference='Stop';if((Get-FileHash -LiteralPath '$validator' -Algorithm SHA256).Hash.ToLowerInvariant()-cne'$validatorSha256'){throw 'r15-browser-validator-pin'};& '$validator' -StageId '$StageId' -Phase Browser -FinalizationSha256 '$FinalizationSha256' -CampaignDirectory '$CampaignDirectory';exit `$LASTEXITCODE"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remote))
. (Join-Path $PSScriptRoot 'Invoke-R15RemoteWithBrowserRelay.ps1')
Invoke-R15RemoteWithBrowserRelay -StageId $StageId -EncodedCommand $encoded -BrowserWitnessReady:$BrowserWitnessReady
