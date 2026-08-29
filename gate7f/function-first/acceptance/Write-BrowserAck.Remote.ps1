[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('graded','preparation')][string]$Mode,
  [string]$CampaignDirectory='',
  [Parameter(Mandatory)][string]$CheckpointId,
  [Parameter(Mandatory)][string]$ExpectedRuntimeSeal,
  [Parameter(Mandatory)][string]$Url,
  [string]$ActualJson='null',
  [string]$ActualString='',
  [string]$DetailsJson='{}'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if([Security.Principal.WindowsIdentity]::GetCurrent().Name-cne'RUNA-CONTROL\Matthew'-or
   [IO.Path]::GetDirectoryName($root)-cne'C:\AI\RunaAI-Next-Candidate\staging'-or
   [IO.Path]::GetFileName($root)-notmatch'^m1-task-native-[a-f0-9]{32}$'-or
   ($CampaignDirectory-and$CampaignDirectory-notmatch'^campaign-(gemma4-26b-a4b|qwen3-coder-30b-a3b|qwen36-27b-mtp)-[a-f0-9]{16}$')-or
   $CheckpointId-notmatch'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$'-or
   $ExpectedRuntimeSeal-notmatch'^[a-f0-9]{64}$'-or
   $Url-notmatch'^http://127\.0\.0\.1:[1-9][0-9]{3,4}/$'-or
   $ActualJson.Length-gt4096-or$ActualString.Length-gt4096-or$DetailsJson.Length-gt4096){throw 'browser-ack-binding-invalid'}
$checkpointParent=if($CampaignDirectory){Join-Path $PSScriptRoot $CampaignDirectory}else{$PSScriptRoot}
$directory=Join-Path $checkpointParent ('browser-'+$CheckpointId)
if([IO.Path]::GetFullPath($directory)-cne$directory-or-not(Test-Path -LiteralPath $directory -PathType Container)-or
   ((Get-Item -LiteralPath $directory).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'browser-ack-directory-invalid'}
$requestPath=Join-Path $directory 'request.json';$ackPath=Join-Path $directory 'browser-ack.json'
$request=Get-Content -LiteralPath $requestPath -Raw|ConvertFrom-Json
if($request.schemaVersion-cne'runaai-m1-browser-checkpoint/v1'-or$request.checkpointId-cne$CheckpointId-or
   $request.runtimeSealSha256-cne$ExpectedRuntimeSeal-or$request.ackPath-cne$ackPath-or$request.baseUrl+'/'-cne$Url){throw 'browser-ack-request-binding-invalid'}
$actualRaw=if($ActualString){$ActualString|ConvertTo-Json -Compress}else{$ActualJson}
$null=$actualRaw|ConvertFrom-Json;$null=$DetailsJson|ConvertFrom-Json
$actual64=[Convert]::ToBase64String([Text.UTF8Encoding]::new($false).GetBytes($actualRaw))
$details64=[Convert]::ToBase64String([Text.UTF8Encoding]::new($false).GetBytes($DetailsJson))
$observedAt=[DateTime]::UtcNow.ToString('o')
$node='C:\Program Files\nodejs\node.exe'
$helper=Join-Path $root 'gate7f\function-first\acceptance\operator-browser-ack-helper.mjs'
if(-not(Test-Path -LiteralPath $node -PathType Leaf)-or-not(Test-Path -LiteralPath $helper -PathType Leaf)-or
   ((Get-Item -LiteralPath $helper).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'browser-ack-helper-unavailable'}
& $node $helper $Mode $requestPath $ackPath $Url $actual64 $details64 $observedAt
if($LASTEXITCODE-ne0){throw 'browser-ack-helper-failed'}
