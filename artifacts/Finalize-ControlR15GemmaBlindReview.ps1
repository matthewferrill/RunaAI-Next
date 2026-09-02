[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$FinalizationSha256,
  [Parameter(Mandatory)][ValidatePattern('^controls-[0-9]+\.json$')][string]$ControlsName,
  [Parameter(Mandatory)][ValidatePattern('^r15-browser-publication-control-[0-9]+\.json$')][string]$BrowserProofName,
  [Parameter(Mandatory)][ValidatePattern('^home-ready-[a-z0-9-]+\.json$')][string]$HomeReadyName,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ControlsSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$BrowserProofSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$HomeReadySha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$EligibilityManifestFileSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$EligibilityManifestSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$BatchResultSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$EligibilityValidationSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$HomeCompletionPreflightSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$HomeCompletionReceiptSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$HomeTerminalStatusSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$HomeBeforeStateSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$HomeFinalStateSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$HomeExportSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$HomeCompletionPublicationSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$HomeCompletionVerificationSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ReviewManifestSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$WorksheetSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$DecisionsSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-'+$StageId
$validator=Join-Path $root 'Validate-Stage.ps1'
$validatorSha256='0a97e9d389b0b8d5024633314014436e75a06aa3e30cc26980d5bbde518e2f5f'
if($validatorSha256-notmatch'^[a-f0-9]{64}$'){throw 'r15-gemma-review-finalize-validator-not-sealed'}
$arguments=@('-StageId',$StageId,'-Phase','ReviewFinalize','-FinalizationSha256',$FinalizationSha256,
  '-ControlsName',$ControlsName,'-ControlsSha256',$ControlsSha256,'-BrowserProofName',$BrowserProofName,
  '-BrowserProofSha256',$BrowserProofSha256,'-HomeReadyName',$HomeReadyName,'-HomeReadySha256',$HomeReadySha256,
  '-EligibilityManifestFileSha256',$EligibilityManifestFileSha256,'-EligibilityManifestSha256',$EligibilityManifestSha256,
  '-BatchResultSha256',$BatchResultSha256,'-EligibilityValidationSha256',$EligibilityValidationSha256,
  '-HomeCompletionPreflightSha256',$HomeCompletionPreflightSha256,'-HomeCompletionReceiptSha256',$HomeCompletionReceiptSha256,
  '-HomeTerminalStatusSha256',$HomeTerminalStatusSha256,'-HomeBeforeStateSha256',$HomeBeforeStateSha256,
  '-HomeFinalStateSha256',$HomeFinalStateSha256,'-HomeExportSha256',$HomeExportSha256,
  '-HomeCompletionPublicationSha256',$HomeCompletionPublicationSha256,
  '-HomeCompletionVerificationSha256',$HomeCompletionVerificationSha256,'-ReviewManifestSha256',$ReviewManifestSha256,
  '-WorksheetSha256',$WorksheetSha256,'-DecisionsSha256',$DecisionsSha256)
$quoted=$arguments|ForEach-Object{'"'+$_+'"'}
$remote="Set-StrictMode -Version Latest;`$ErrorActionPreference='Stop';if((Get-FileHash -LiteralPath '$validator' -Algorithm SHA256).Hash.ToLowerInvariant()-cne'$validatorSha256'){throw 'r15-gemma-review-finalize-validator-pin'};& '$validator' "+($quoted-join' ')+";exit `$LASTEXITCODE"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remote))
& ssh.exe -F 'C:\Users\matth\.ssh\config' -o ClearAllForwardings=yes runa-control powershell.exe -NoProfile -NonInteractive -EncodedCommand $encoded
exit $LASTEXITCODE
