[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$sshConfig='C:\Users\matth\.ssh\config';$stageName='m1-task-native-'+$StageId
$remoteRoot='C:\AI\RunaAI-Next-Candidate\staging\'+$stageName;$operatorRoot='C:\AI\RunaAI-Next-Candidate\staging'
$common=Join-Path $PSScriptRoot 'm1-readiness\20260902-campaign-r15-common-v13'
$transfers=[ordered]@{
  (Join-Path $common 'source-c760419.tar')='source.tar'
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
  (Join-Path $common 'source-c760419.tar')='171d3dccac2dc6ef56d81738c669de4309f6435287817c88b443b9b857953ae9'
  (Join-Path $common 'runtime-seal.json')='38838d4c1761ba4102864a72ec6fdb6eacaa9606aae0bf0581e8f87c7975186e'
  (Join-Path $common 'campaign-hardware-plan.json')='fde62058b663407feb8e7d0c8cf8626ce8129a00757b500810cef666908755aa'
  (Join-Path $common 'SOURCE-TREE-MANIFEST.json')='b5d4ce42fc4768c35a4951e31a060d7f897d75611ec3ac4e0d71d778da2c6889'
  (Join-Path $common 'SOURCE-IDENTITY.json')='23ef2694dcf9c95eb9f66db5acf496107ed734fd9623a8113a337ad284823d3b'
  (Join-Path $common 'CONTROL-REGRESSION-INPUT.json')='4f94c0af2c7a8a68b6d26a50affe836b542c3e5280f57f5dc0a8117dd3f65fdd'
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
   $finalization.receipt.stageId-cne$StageId-or$finalization.receipt.sourceCommit-cne'c760419885e5ba5729335f272f177ef74931b83a'-or
   $finalization.finalizationSha256-notmatch'^[a-f0-9]{64}$'){throw 'r15-source-stage-finalize-result'}
[ordered]@{schemaVersion='runaai-m1-r15-source-stage-preparation/v2';stageId=$StageId;
  sourceCommit='c760419885e5ba5729335f272f177ef74931b83a';runtimeSealSha256='38838d4c1761ba4102864a72ec6fdb6eacaa9606aae0bf0581e8f87c7975186e';
  manifestSha256='b5d4ce42fc4768c35a4951e31a060d7f897d75611ec3ac4e0d71d778da2c6889';
  finalizationSha256=$finalization.finalizationSha256;verifiedSourceFiles=2465;syntheticStateCopied=$false;productionChanged=$false}|ConvertTo-Json -Compress
