[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$FinalizationSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$EligibilityManifestFileSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$EligibilityManifestSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$BatchResultSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-'+$StageId
$validator=Join-Path $root 'Validate-Stage.ps1'
$validatorSha256='0a97e9d389b0b8d5024633314014436e75a06aa3e30cc26980d5bbde518e2f5f'
if($validatorSha256-notmatch'^[a-f0-9]{64}$'){throw 'r15-gemma-review-prepare-validator-not-sealed'}
$remote="Set-StrictMode -Version Latest;`$ErrorActionPreference='Stop';if((Get-FileHash -LiteralPath '$validator' -Algorithm SHA256).Hash.ToLowerInvariant()-cne'$validatorSha256'){throw 'r15-gemma-review-prepare-validator-pin'};& '$validator' -StageId '$StageId' -Phase ReviewPrepare -FinalizationSha256 '$FinalizationSha256' -EligibilityManifestFileSha256 '$EligibilityManifestFileSha256' -EligibilityManifestSha256 '$EligibilityManifestSha256' -BatchResultSha256 '$BatchResultSha256';exit `$LASTEXITCODE"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remote))
& ssh.exe -F 'C:\Users\matth\.ssh\config' -o ClearAllForwardings=yes runa-control powershell.exe -NoProfile -NonInteractive -EncodedCommand $encoded
exit $LASTEXITCODE
