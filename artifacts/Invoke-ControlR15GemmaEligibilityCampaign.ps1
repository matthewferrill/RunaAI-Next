[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$FinalizationSha256,
  [Parameter(Mandatory)][ValidatePattern('^controls-[0-9]+\.json$')][string]$ControlsName,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ControlsSha256,
  [Parameter(Mandatory)][ValidatePattern('^r15-browser-publication-control-[0-9]+\.json$')][string]$BrowserProofName,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$BrowserProofSha256,
  [Parameter(Mandatory)][ValidatePattern('^home-ready-[a-z0-9-]+\.json$')][string]$HomeReadyName,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$HomeReadySha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-'+$StageId
$validator=Join-Path $root 'Validate-Stage.ps1'
# Replaced with the exact staged validator digest when the fresh common bundle is sealed.
$validatorSha256='__R15_VALIDATOR_SHA256__'
if($validatorSha256-notmatch'^[a-f0-9]{64}$'){throw 'r15-gemma-campaign-validator-not-sealed'}
$remote="Set-StrictMode -Version Latest;`$ErrorActionPreference='Stop';if((Get-FileHash -LiteralPath '$validator' -Algorithm SHA256).Hash.ToLowerInvariant()-cne'$validatorSha256'){throw 'r15-gemma-campaign-validator-pin'};& '$validator' -StageId '$StageId' -Phase Campaign -FinalizationSha256 '$FinalizationSha256' -ControlsName '$ControlsName' -ControlsSha256 '$ControlsSha256' -BrowserProofName '$BrowserProofName' -BrowserProofSha256 '$BrowserProofSha256' -HomeReadyName '$HomeReadyName' -HomeReadySha256 '$HomeReadySha256';exit `$LASTEXITCODE"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remote))
& ssh.exe -F 'C:\Users\matth\.ssh\config' -o ClearAllForwardings=yes runa-control powershell.exe -NoProfile -NonInteractive -EncodedCommand $encoded
exit $LASTEXITCODE
