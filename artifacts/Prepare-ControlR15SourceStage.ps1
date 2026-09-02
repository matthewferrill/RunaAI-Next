[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$sshConfig='C:\Users\matth\.ssh\config';$stageName='m1-task-native-'+$StageId
$remoteRoot='C:\AI\RunaAI-Next-Candidate\staging\'+$stageName;$operatorRoot='C:\AI\RunaAI-Next-Candidate\staging'
$common=Join-Path $PSScriptRoot 'm1-readiness\20260902-campaign-r15-common-v9'
$transfers=[ordered]@{
  (Join-Path $common 'source-8830702.tar')='source.tar'
  (Join-Path $common 'runtime-seal.json')='runtime-seal.json'
  (Join-Path $common 'campaign-hardware-plan.json')='campaign-hardware-plan.json'
  (Join-Path $common 'SOURCE-IDENTITY.json')='SOURCE-IDENTITY.json'
  (Join-Path $common 'CONTROL-REGRESSION-INPUT.json')='CONTROL-REGRESSION-INPUT.json'
  (Join-Path $common 'SOURCE-TREE-MANIFEST.json')='SOURCE-TREE-MANIFEST.json'
  (Join-Path $PSScriptRoot 'Finalize-ControlR15SourceStage.ps1')='Finalize-SourceStage.ps1'
  (Join-Path $PSScriptRoot 'Validate-ControlR15Stage.Remote.ps1')='Validate-Stage.ps1'
  (Join-Path $PSScriptRoot 'm1-browser-loopback-pipe.remote.cjs')='m1-browser-loopback-pipe.cjs'
}
foreach($source in $transfers.Keys){if(-not(Test-Path -LiteralPath $source -PathType Leaf)){throw 'r15-source-local-source-missing'}}
$commonPins=[ordered]@{
  (Join-Path $common 'source-8830702.tar')='41b7cc3bcc327c8b36c6b36ebbcf3e97a4b568d93915cd9b5e08e121ad1f8ae6'
  (Join-Path $common 'runtime-seal.json')='6175af9a744b3e199c347e3da13d60e04b7b873812daf972b8cf19e14350a6f1'
  (Join-Path $common 'campaign-hardware-plan.json')='c8588e58b69d0a6d8cdff8fb32049eb1f315a6bbbe76a563b4c49236f83f98d4'
  (Join-Path $common 'SOURCE-TREE-MANIFEST.json')='1baceef0ac8650ee36d48fca12e88eddd1780e92691de60a234a92450b78568a'
  (Join-Path $common 'SOURCE-IDENTITY.json')='520eb93d2825e2b446a5339516728b6c3c7ffbdbf9b4e66555ffa816f1a3ee3a'
  (Join-Path $common 'CONTROL-REGRESSION-INPUT.json')='aa142797cab33a823d4d4427b683083a23af0a00a8ec1b8c93e53d75f9c556df'
}
foreach($source in $commonPins.Keys){
  if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()-cne$commonPins[$source]){throw 'r15-source-local-common-pin'}
}
& ssh.exe -F $sshConfig -o ClearAllForwardings=yes runa-control powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ($operatorRoot+'\Create-ControlFreshStage.ps1') -StageId $StageId
if($LASTEXITCODE-ne0){throw 'r15-source-stage-create-failed'}
foreach($entry in $transfers.GetEnumerator()){
  & scp.exe -F $sshConfig -q -- $entry.Key ('runa-control:'+($remoteRoot+'\'+$entry.Value))
  if($LASTEXITCODE-ne0){throw 'r15-source-stage-transfer-failed'}
}
$checks=foreach($entry in $transfers.GetEnumerator()){
  $hash=(Get-FileHash -LiteralPath $entry.Key -Algorithm SHA256).Hash.ToLowerInvariant()
  "if((Get-FileHash -LiteralPath '$remoteRoot\$($entry.Value)' -Algorithm SHA256).Hash.ToLowerInvariant()-cne'$hash'){throw 'r15-source-stage-transfer-pin'}"
}
$remoteCheck="Set-StrictMode -Version Latest;`$ErrorActionPreference='Stop';"+($checks-join';')
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remoteCheck))
& ssh.exe -F $sshConfig -o ClearAllForwardings=yes runa-control powershell.exe -NoProfile -NonInteractive -EncodedCommand $encoded
if($LASTEXITCODE-ne0){throw 'r15-source-stage-transfer-verification-failed'}
$finalizationRaw=@(& ssh.exe -F $sshConfig -o ClearAllForwardings=yes runa-control powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ($remoteRoot+'\Finalize-SourceStage.ps1') -StageId $StageId)
if($LASTEXITCODE-ne0){throw 'r15-source-stage-finalize-failed'}
$finalizationLine=@($finalizationRaw|Where-Object{-not[string]::IsNullOrWhiteSpace($_)})|Select-Object -Last 1
try{$finalization=$finalizationLine|ConvertFrom-Json}catch{throw 'r15-source-stage-finalize-output'}
if($finalization.schemaVersion-cne'runaai-m1-r15-source-stage-finalization-result/v1'-or
   $finalization.receipt.stageId-cne$StageId-or$finalization.receipt.sourceCommit-cne'8830702386b6a904a42fe097ec1b02615bf30249'-or
   $finalization.finalizationSha256-notmatch'^[a-f0-9]{64}$'){throw 'r15-source-stage-finalize-result'}
[ordered]@{schemaVersion='runaai-m1-r15-source-stage-preparation/v2';stageId=$StageId;
  sourceCommit='8830702386b6a904a42fe097ec1b02615bf30249';runtimeSealSha256='6175af9a744b3e199c347e3da13d60e04b7b873812daf972b8cf19e14350a6f1';
  manifestSha256='1baceef0ac8650ee36d48fca12e88eddd1780e92691de60a234a92450b78568a';
  finalizationSha256=$finalization.finalizationSha256;verifiedSourceFiles=2464;syntheticStateCopied=$false;productionChanged=$false}|ConvertTo-Json -Compress
