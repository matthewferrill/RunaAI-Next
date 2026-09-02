[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ControlOwnedRoot,
  [Parameter(Mandatory)][ValidatePattern('^campaign-(?:gemma4-26b-a4b|qwen3-coder-30b-a3b|qwen36-27b-mtp)-[a-f0-9]{16}$')][string]$CampaignDirectory,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedSourceCommit,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedRuntimeSeal,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$')][string]$CheckpointId,
  [Parameter(Mandatory)][ValidatePattern('^http://127\.0\.0\.1:[1-9][0-9]{3,4}/$')][string]$Url,
  [Parameter(Mandatory)][string]$ObservationPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($ControlOwnedRoot)
$tempRoot=[IO.Path]::GetFullPath(([IO.Path]::GetTempPath()))
$observationFile=[IO.Path]::GetFullPath($ObservationPath)
if([IO.Path]::GetDirectoryName($root)-cne'C:\AI\RunaAI-Next-Candidate\staging'-or
   [IO.Path]::GetFileName($root)-notmatch'^m1-task-native-[a-f0-9]{32}$'-or
   -not$CampaignDirectory.EndsWith($ExpectedRuntimeSeal.Substring(0,16),[StringComparison]::Ordinal)-or
   -not$observationFile.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase)-or
   -not(Test-Path -LiteralPath $observationFile -PathType Leaf)-or
   ((Get-Item -LiteralPath $observationFile).Attributes-band[IO.FileAttributes]::ReparsePoint)-or
   (Get-Item -LiteralPath $observationFile).Length-gt32768){throw 'r15-browser-ack-after-witness-binding-invalid'}
$value=Get-Content -LiteralPath $observationFile -Raw|ConvertFrom-Json
$keys=($value.PSObject.Properties.Name|Sort-Object)-join','
if($keys-cne'actual,details,observedDomBinding,observedWitness,witnessTicket'-or
   $value.witnessTicket.checkpointId-cne$CheckpointId-or$value.witnessTicket.caseId-cne'agent-05-cancel-drain'-or
   $value.witnessTicket.stage-cne'in-flight'-or$value.actual-ne$false-or
   $value.observedWitness.taskStatus-cne$value.details.taskStatus-or
   $value.observedWitness.notice-cne$value.details.notice-or
   $value.observedWitness.claimedImmediateKill-ne$value.details.claimedImmediateKill-or
   ($value.observedWitness.boundedDrain|ConvertTo-Json -Compress)-cne($value.details.boundedDrain|ConvertTo-Json -Compress)){
  throw 'r15-browser-ack-after-witness-observation-invalid'
}
$detailsJson=$value.details|ConvertTo-Json -Compress -Depth 8
$ackHelper=Join-Path $PSScriptRoot 'Write-ControlBrowserAck.ps1'
if(-not(Test-Path -LiteralPath $ackHelper -PathType Leaf)-or
   ((Get-Item -LiteralPath $ackHelper).Attributes-band[IO.FileAttributes]::ReparsePoint)){
  throw 'r15-browser-ack-after-witness-helper-invalid'
}
& $ackHelper -Mode graded -ControlOwnedRoot $root -CampaignDirectory $CampaignDirectory `
  -CheckpointId $CheckpointId -ExpectedRuntimeSeal $ExpectedRuntimeSeal -Url $Url `
  -ActualJson 'false' -DetailsJson $detailsJson
if(-not$?){throw 'r15-browser-ack-after-witness-publication-failed'}
[ordered]@{
  schemaVersion='runaai-m1-r15-browser-ack-after-live-witness/v1'
  checkpointId=$CheckpointId
  liveWitnessRepublished=$false
  acknowledgementPublished=$true
  productionChanged=$false
}|ConvertTo-Json -Compress
