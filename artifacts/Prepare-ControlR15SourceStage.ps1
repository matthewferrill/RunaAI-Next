[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$sshConfig='C:\Users\matth\.ssh\config';$stageName='m1-task-native-'+$StageId
$remoteRoot='C:\AI\RunaAI-Next-Candidate\staging\'+$stageName;$operatorRoot='C:\AI\RunaAI-Next-Candidate\staging'
$common=Join-Path $PSScriptRoot 'm1-readiness\20260902-campaign-r15-common-v11'
$transfers=[ordered]@{
  (Join-Path $common 'source-ecddd36.tar')='source.tar'
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
  (Join-Path $common 'source-ecddd36.tar')='84bd17325c7d4fc971034a994ddb7d5584f25ac4c054d39a791a0985acf7621e'
  (Join-Path $common 'runtime-seal.json')='48951539bbef9bc6ab43382c207599e4ead398a0facc128acd201f0be3a600ec'
  (Join-Path $common 'campaign-hardware-plan.json')='d47db8e88da17831b45987b1ad4130f74ddaa249dc28dfbccd936c8f8d8247c1'
  (Join-Path $common 'SOURCE-TREE-MANIFEST.json')='be280fd7646a323d90d890e8117c213af1fa394a30ef4f9c15d5e54176c60764'
  (Join-Path $common 'SOURCE-IDENTITY.json')='da19050ad38a5bf5a8835d597f6180b5f853789e659d6fb4867518e1e0996ad2'
  (Join-Path $common 'CONTROL-REGRESSION-INPUT.json')='fa704fd499da7b646879004edc29aada63f580214e6974ac34c2d563397c9787'
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
   $finalization.receipt.stageId-cne$StageId-or$finalization.receipt.sourceCommit-cne'ecddd363e8ece8dcd7597d89394c12a90596f16c'-or
   $finalization.finalizationSha256-notmatch'^[a-f0-9]{64}$'){throw 'r15-source-stage-finalize-result'}
[ordered]@{schemaVersion='runaai-m1-r15-source-stage-preparation/v2';stageId=$StageId;
  sourceCommit='ecddd363e8ece8dcd7597d89394c12a90596f16c';runtimeSealSha256='48951539bbef9bc6ab43382c207599e4ead398a0facc128acd201f0be3a600ec';
  manifestSha256='be280fd7646a323d90d890e8117c213af1fa394a30ef4f9c15d5e54176c60764';
  finalizationSha256=$finalization.finalizationSha256;verifiedSourceFiles=2464;syntheticStateCopied=$false;productionChanged=$false}|ConvertTo-Json -Compress
