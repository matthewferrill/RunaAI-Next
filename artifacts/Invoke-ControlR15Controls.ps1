[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$FinalizationSha256,
  [Parameter(Mandatory)][switch]$BrowserWitnessReady
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-'+$StageId
$validator=Join-Path $root 'Validate-Stage.ps1';$validatorSha256='11635b98b25a5fb04a189346e89c00dcf1ce1766b108494088bd4e722ad21693'
$remote="Set-StrictMode -Version Latest;`$ErrorActionPreference='Stop';if((Get-FileHash -LiteralPath '$validator' -Algorithm SHA256).Hash.ToLowerInvariant()-cne'$validatorSha256'){throw 'r15-controls-validator-pin'};& '$validator' -StageId '$StageId' -Phase Controls -FinalizationSha256 '$FinalizationSha256';exit `$LASTEXITCODE"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remote))
. (Join-Path $PSScriptRoot 'Invoke-R15RemoteWithBrowserRelay.ps1')
Invoke-R15RemoteWithBrowserRelay -StageId $StageId -EncodedCommand $encoded -BrowserWitnessReady:$BrowserWitnessReady
