[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ReleaseId,
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [Parameter(Mandatory)][string]$ExpectedArtifactDigest,
  [Parameter(Mandatory)][int]$ExpectedArtifactFileCount,
  [Parameter(Mandatory)][string]$PriorReleaseId,
  [Parameter(Mandatory)][string]$PriorCommit,
  [Parameter(Mandatory)][string]$PriorArtifactDigest,
  [Parameter(Mandatory)][string]$ArchiveSha256,
  [Parameter(Mandatory)][string]$ConfigSha256,
  [Parameter(Mandatory)][string]$ManifestSha256,
  [Parameter(Mandatory)][string]$LauncherSha256,
  [Parameter(Mandatory)][string]$CaddyfileSha256,
  [string]$Root='C:\AI\RunaAI-Next-Candidate'
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$configuredByAttempt=$false
try{
  $configure=& (Join-Path $PSScriptRoot 'Configure-ControlOrdinaryAccess.ps1') `
    -ExpectedReleaseId $PriorReleaseId -ExpectedCommit $PriorCommit `
    -ExpectedArtifactDigest $PriorArtifactDigest -Root $Root|ConvertFrom-Json
  if($configure.passed-ne$true){throw 'gate7a-ordinary-activation-client-configure-invalid'}
  $configuredByAttempt=-not[bool]$configure.alreadyConfigured
  $deploy=& (Join-Path $PSScriptRoot 'Deploy-ControlOrdinaryAccessSuccessor.ps1') `
    -ReleaseId $ReleaseId -ExpectedCommit $ExpectedCommit -ExpectedArtifactDigest $ExpectedArtifactDigest `
    -ExpectedArtifactFileCount $ExpectedArtifactFileCount -PriorReleaseId $PriorReleaseId `
    -PriorCommit $PriorCommit -PriorArtifactDigest $PriorArtifactDigest -ArchiveSha256 $ArchiveSha256 `
    -ConfigSha256 $ConfigSha256 -ManifestSha256 $ManifestSha256 -LauncherSha256 $LauncherSha256 `
    -CaddyfileSha256 $CaddyfileSha256 -Root $Root|ConvertFrom-Json
  if($deploy.deployed-ne$true){throw 'gate7a-ordinary-activation-deploy-invalid'}
  [ordered]@{schemaVersion='runa2-gate7a-control-ordinary-activation/v1';passed=$true;
    releaseId=$ReleaseId;ordinaryClientReady=$true;ordinaryPasswordRouteReady=$true;
    ownerRouteUnchanged=$true;smtpChanged=$false;ordinaryUserCreated=$false;
    privateValuesIncluded=$false}|ConvertTo-Json -Compress
}catch{
  $failure=$_.Exception.Message;$rollbackPassed=$false
  if($configuredByAttempt){
    try{
      $removed=& (Join-Path $PSScriptRoot 'Remove-ControlOrdinaryAccess.ps1') `
        -ExpectedReleaseId $PriorReleaseId -ExpectedCommit $PriorCommit `
        -ExpectedArtifactDigest $PriorArtifactDigest -Root $Root|ConvertFrom-Json
      $rollbackPassed=$removed.passed-eq$true
    }catch{throw "gate7a-ordinary-activation-rollback-failed:$failure"}
  }
  throw "gate7a-ordinary-activation-failed:$failure;identityRolledBack=$rollbackPassed"
}
