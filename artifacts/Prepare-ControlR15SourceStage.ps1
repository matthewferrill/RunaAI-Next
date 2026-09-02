[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$sshConfig='C:\Users\matth\.ssh\config';$stageName='m1-task-native-'+$StageId
$remoteRoot='C:\AI\RunaAI-Next-Candidate\staging\'+$stageName;$operatorRoot='C:\AI\RunaAI-Next-Candidate\staging'
$common=Join-Path $PSScriptRoot 'm1-readiness\20260902-campaign-r15-common-v15'
$transfers=[ordered]@{
  (Join-Path $common 'source-2431ad3.tar')='source.tar'
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
  (Join-Path $common 'source-2431ad3.tar')='85445369814694a15ba42bab2c5d70ea3688c02e5ec4ee14c97b74a353258911'
  (Join-Path $common 'runtime-seal.json')='45e2d5bd0086b0da5170596395959fd543ebbff31edee151b41e22986ea2e7da'
  (Join-Path $common 'campaign-hardware-plan.json')='69528da70cdcef3e7e14fd2dd3b6780a475e64e6e0c56dc336f445da2b81654c'
  (Join-Path $common 'SOURCE-TREE-MANIFEST.json')='078d41257e39a87d47bf0ac026e7f4065f76abb0a55047456b8d2a6982dc06f9'
  (Join-Path $common 'SOURCE-IDENTITY.json')='1ee5d319632a29b1bc395593137270dcc175149a61d3c467aa89a9a4b40f10a4'
  (Join-Path $common 'CONTROL-REGRESSION-INPUT.json')='e6de307e118df75376d6cf561d44b55c44011a48b4de62c82b16dacef74982c4'
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
   $finalization.receipt.stageId-cne$StageId-or$finalization.receipt.sourceCommit-cne'2431ad3ca52d8ec3a87d042c298d2c1de61339da'-or
   $finalization.finalizationSha256-notmatch'^[a-f0-9]{64}$'){throw 'r15-source-stage-finalize-result'}
[ordered]@{schemaVersion='runaai-m1-r15-source-stage-preparation/v2';stageId=$StageId;
  sourceCommit='2431ad3ca52d8ec3a87d042c298d2c1de61339da';runtimeSealSha256='45e2d5bd0086b0da5170596395959fd543ebbff31edee151b41e22986ea2e7da';
  manifestSha256='078d41257e39a87d47bf0ac026e7f4065f76abb0a55047456b8d2a6982dc06f9';
  finalizationSha256=$finalization.finalizationSha256;verifiedSourceFiles=2465;syntheticStateCopied=$false;productionChanged=$false}|ConvertTo-Json -Compress
