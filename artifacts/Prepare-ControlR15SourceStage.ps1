[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$sshConfig='C:\Users\matth\.ssh\config';$stageName='m1-task-native-'+$StageId
$remoteRoot='C:\AI\RunaAI-Next-Candidate\staging\'+$stageName;$operatorRoot='C:\AI\RunaAI-Next-Candidate\staging'
$common=Join-Path $PSScriptRoot 'm1-readiness\20260902-campaign-r15-common-v10'
$transfers=[ordered]@{
  (Join-Path $common 'source-6c9207d.tar')='source.tar'
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
  (Join-Path $common 'source-6c9207d.tar')='7247e99c519219dc3e54d9537ed604d8649489aae12a568062b57b37b39e3c6d'
  (Join-Path $common 'runtime-seal.json')='413aabf1c4ae249e4b22b034da439f801b4f3adbbad6efcde8c4ef7f9ae1ac08'
  (Join-Path $common 'campaign-hardware-plan.json')='70909973369038b8ef7633f815bb4dc1c7e0feec4cb664455d8e5f485088fe98'
  (Join-Path $common 'SOURCE-TREE-MANIFEST.json')='07ecf69ca08a836a3291152ca950d4ae7da840161e0c694303a7e40ec9ac4df5'
  (Join-Path $common 'SOURCE-IDENTITY.json')='a575d5e9a3706d619355617c9fec19e010bdeb393ca92eac497a40661793c1e3'
  (Join-Path $common 'CONTROL-REGRESSION-INPUT.json')='b64a795d8b4b73925a464d5458c7232819606bb5dd846fa30eb5ed8eeeeee875'
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
   $finalization.receipt.stageId-cne$StageId-or$finalization.receipt.sourceCommit-cne'6c9207d6fa3249b53f66b6a55b40bc25f348f18b'-or
   $finalization.finalizationSha256-notmatch'^[a-f0-9]{64}$'){throw 'r15-source-stage-finalize-result'}
[ordered]@{schemaVersion='runaai-m1-r15-source-stage-preparation/v2';stageId=$StageId;
  sourceCommit='6c9207d6fa3249b53f66b6a55b40bc25f348f18b';runtimeSealSha256='413aabf1c4ae249e4b22b034da439f801b4f3adbbad6efcde8c4ef7f9ae1ac08';
  manifestSha256='07ecf69ca08a836a3291152ca950d4ae7da840161e0c694303a7e40ec9ac4df5';
  finalizationSha256=$finalization.finalizationSha256;verifiedSourceFiles=2464;syntheticStateCopied=$false;productionChanged=$false}|ConvertTo-Json -Compress
