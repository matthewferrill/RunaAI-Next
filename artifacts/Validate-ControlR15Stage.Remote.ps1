[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId,
  [Parameter(Mandatory)][ValidateSet('Finalize','Controls','Browser','Campaign','Completion','ReviewPrepare','ReviewFinalize')][string]$Phase,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$FinalizationSha256,
  [ValidatePattern('^campaign-(?:gemma4-26b-a4b|qwen3-coder-30b-a3b|qwen36-27b-mtp)-[a-f0-9]{16}$')][string]$CampaignDirectory,
  [ValidatePattern('^controls-[0-9]+\.json$')][string]$ControlsName,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$ControlsSha256,
  [ValidatePattern('^r15-browser-publication-control-[0-9]+\.json$')][string]$BrowserProofName,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$BrowserProofSha256,
  [ValidatePattern('^home-ready-[a-z0-9-]+\.json$')][string]$HomeReadyName,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$HomeReadySha256,
  [ValidatePattern('^20260829-campaign-gemma-r[1-9][0-9]*$')][string]$ExpectedLeaseId,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedLeaseSeal,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$EligibilityManifestFileSha256,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$EligibilityManifestSha256,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$BatchResultSha256,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$EligibilityValidationSha256,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$HomeCompletionPreflightSha256,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$HomeCompletionReceiptSha256,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$HomeTerminalStatusSha256,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$HomeBeforeStateSha256,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$HomeFinalStateSha256,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$HomeExportSha256,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$HomeCompletionPublicationSha256,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$HomeCompletionVerificationSha256,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$ReviewManifestSha256,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$WorksheetSha256,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$DecisionsSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$parent='C:\AI\RunaAI-Next-Candidate\staging';$root=Join-Path $parent ('m1-task-native-'+$StageId)
$release='C:\AI\RunaAI-Next-Candidate\releases\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc'
$sourceCommit='ecddd363e8ece8dcd7597d89394c12a90596f16c'
$archiveSha256='84bd17325c7d4fc971034a994ddb7d5584f25ac4c054d39a791a0985acf7621e'
$runtimeSealSha256='48951539bbef9bc6ab43382c207599e4ead398a0facc128acd201f0be3a600ec'
$hardwarePlanSha256='d47db8e88da17831b45987b1ad4130f74ddaa249dc28dfbccd936c8f8d8247c1'
$manifestSha256='be280fd7646a323d90d890e8117c213af1fa394a30ef4f9c15d5e54176c60764'
$identitySha256='da19050ad38a5bf5a8835d597f6180b5f853789e659d6fb4867518e1e0996ad2'
$controlRegressionInputSha256='fa704fd499da7b646879004edc29aada63f580214e6974ac34c2d563397c9787'
$nodeSha256='bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb'
$packageLockSha256='2b443060beac09e89779ab2e4b60a22e7bf89e26880f14d0d4cdc04db9d8328e'
$loopbackPipeSha256='54d3027dc79b4325e29a48c2b9372a5d0e8563ff3ebaa2398b7a1b772eb0230e'

function Get-LowerSha256([string]$Path){
  (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Assert-PlainFile([string]$Path,[string]$ErrorCode){
  if(-not(Test-Path -LiteralPath $Path -PathType Leaf)){throw $ErrorCode}
  $item=Get-Item -LiteralPath $Path -Force
  if(($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw $ErrorCode}
  $item
}
function Invoke-R15RuntimeSecurityNormalization([string]$OwnedRoot,[string]$NodePath){
  $normalizer=Join-Path $OwnedRoot 'gate7f\function-first\acceptance\normalize-r15-runtime-security.mjs'
  Assert-PlainFile $normalizer 'r15-stage-runtime-security-normalizer-file'|Out-Null
  $raw=@(& $NodePath $normalizer --owned-root $OwnedRoot)
  if($LASTEXITCODE-ne0){throw 'r15-stage-runtime-security-normalizer'}
  $line=@($raw|Where-Object{-not[string]::IsNullOrWhiteSpace($_)})|Select-Object -Last 1
  try{$value=$line|ConvertFrom-Json}catch{throw 'r15-stage-runtime-security-normalizer-output'}
  $keys=($value.PSObject.Properties.Name|Sort-Object)-join','
  if($keys-cne'effects,exitCode,modelsInvoked,privateValuesIncluded,productionChanged,ready,receiptStatus,schemaVersion'-or
     $value.schemaVersion-cne'runaai-m1-r15-runtime-security-normalization/v1'-or$value.ready-cne$true-or
     $value.receiptStatus-cne'executed'-or$value.exitCode-ne0-or$value.effects-ne0-or
     $value.modelsInvoked-cne$false-or$value.productionChanged-cne$false-or$value.privateValuesIncluded-cne$false){
    throw 'r15-stage-runtime-security-normalizer-result'
  }
  $value
}

if([Security.Principal.WindowsIdentity]::GetCurrent().Name-cne'RUNA-CONTROL\Matthew'-or
   $PSScriptRoot-cne$root-or[IO.Path]::GetDirectoryName($root)-cne$parent){throw 'r15-stage-validation-boundary'}
$rootItem=Get-Item -LiteralPath $root -Force
if(($rootItem.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'r15-stage-validation-root-reparse'}

$archive=Join-Path $root 'source.tar';$sealPath=Join-Path $root 'runtime-seal.json'
$hardwarePlanPath=Join-Path $root 'campaign-hardware-plan.json';$manifestPath=Join-Path $root 'SOURCE-TREE-MANIFEST.json'
$identityPath=Join-Path $root 'SOURCE-IDENTITY.json';$controlInputPath=Join-Path $root 'CONTROL-REGRESSION-INPUT.json'
Assert-PlainFile $archive 'r15-stage-validation-archive-file'|Out-Null
Assert-PlainFile $sealPath 'r15-stage-validation-seal-file'|Out-Null
Assert-PlainFile $hardwarePlanPath 'r15-stage-validation-plan-file'|Out-Null
Assert-PlainFile $manifestPath 'r15-stage-validation-manifest-file'|Out-Null
Assert-PlainFile $identityPath 'r15-stage-validation-identity-file'|Out-Null
Assert-PlainFile $controlInputPath 'r15-stage-validation-control-input-file'|Out-Null
if((Get-LowerSha256 $archive)-cne$archiveSha256-or(Get-LowerSha256 $sealPath)-cne$runtimeSealSha256-or
   (Get-LowerSha256 $hardwarePlanPath)-cne$hardwarePlanSha256-or(Get-LowerSha256 $manifestPath)-cne$manifestSha256-or
   (Get-LowerSha256 $identityPath)-cne$identitySha256-or(Get-LowerSha256 $controlInputPath)-cne$controlRegressionInputSha256){
  throw 'r15-stage-validation-common-pin'
}
$seal=Get-Content -LiteralPath $sealPath -Raw|ConvertFrom-Json
$hardwarePlan=Get-Content -LiteralPath $hardwarePlanPath -Raw|ConvertFrom-Json
if($seal.schemaVersion-cne'runaai-m1-functional-runtime-seal/v11'-or$seal.sourceCommit-cne$sourceCommit-or
   $seal.runtime.sourceArchiveSha256-cne$archiveSha256-or$seal.runtime.nodeSha256-cne$nodeSha256-or
   $seal.residency.telemetryPolicySha256-cne$hardwarePlanSha256-or
   $hardwarePlan.schemaVersion-cne'runa-m1-campaign-hardware-plan/v2'-or$hardwarePlan.sourceCommit-cne$sourceCommit-or
   $hardwarePlan.classification-cne'prospective-r15-hardware-only-not-functional-qualification'-or
   $hardwarePlan.createdBeforeLoads-cne$true-or$hardwarePlan.productionRoutingChanged-cne$false-or
   $hardwarePlan.protectedDataIncluded-cne$false){throw 'r15-stage-validation-common-schema'}

$manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
$manifestKeys=($manifest.PSObject.Properties.Name|Sort-Object)-join','
if($manifestKeys-cne'entries,schemaVersion,sourceArchiveSha256,sourceCommit'-or
   $manifest.schemaVersion-cne'runaai-m1-r15-source-tree-manifest/v1'-or
   $manifest.sourceCommit-cne$sourceCommit-or$manifest.sourceArchiveSha256-cne$archiveSha256-or
   @($manifest.entries).Count-ne2464){throw 'r15-stage-validation-manifest-schema'}
$seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
$expectedDirectories=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
$previous=$null
foreach($entry in @($manifest.entries)){
  $entryKeys=($entry.PSObject.Properties.Name|Sort-Object)-join','
  if($entryKeys-cne'bytes,path,sha256'-or$entry.path-isnot[string]-or$entry.sha256-isnot[string]-or
     $entry.path-notmatch'^(?!/)(?!.*(?:^|/)\.\.(?:/|$))(?!.*\\)[\x20-\x7e]+$'-or
     $entry.sha256-notmatch'^[a-f0-9]{64}$'-or$entry.bytes-isnot[long]-and$entry.bytes-isnot[int]){
    throw 'r15-stage-validation-manifest-entry'
  }
  if(-not$seen.Add($entry.path)-or($null-ne$previous-and[StringComparer]::Ordinal.Compare($previous,$entry.path)-ge0)){
    throw 'r15-stage-validation-manifest-order'
  }
  $previous=$entry.path
  $directory=[IO.Path]::GetDirectoryName($entry.path.Replace('/','\'))
  while(-not[string]::IsNullOrEmpty($directory)){
    $expectedDirectories.Add($directory.Replace('\','/'))|Out-Null
    $directory=[IO.Path]::GetDirectoryName($directory)
  }
  $candidate=Join-Path $root ($entry.path.Replace('/','\'))
  $full=[IO.Path]::GetFullPath($candidate);$prefix=$root.TrimEnd('\')+'\'
  if(-not$full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'r15-stage-validation-manifest-boundary'}
  $item=Assert-PlainFile $full 'r15-stage-validation-source-file'
  if($item.Length-ne[long]$entry.bytes-or(Get-LowerSha256 $full)-cne$entry.sha256){throw 'r15-stage-validation-source-pin'}
}

function Assert-ExactStageSet {
  $allowedRootFiles=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach($name in @('CONTROL-REGRESSION-INPUT.json','Finalize-SourceStage.ps1','m1-browser-loopback-pipe.cjs',
      'runtime-seal.json','campaign-hardware-plan.json','source.tar','SOURCE-IDENTITY.json','SOURCE-TREE-MANIFEST.json',
      'Validate-Stage.ps1','SOURCE-STAGE-FINALIZATION.json','OWNED-RUNTIME-MANIFEST.json','OWNED-RUNTIME-ACCESS.json')){$allowedRootFiles.Add($name)|Out-Null}
  $stack=New-Object 'System.Collections.Generic.Stack[string]';$stack.Push($root)
  while($stack.Count-ne0){
    $directory=$stack.Pop()
    foreach($item in @(Get-ChildItem -LiteralPath $directory -Force)){
      $relative=$item.FullName.Substring($root.Length).TrimStart('\').Replace('\','/')
      $reparse=($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0
      if($relative-ceq'node_modules'){
        if(-not$item.PSIsContainer-or-not$reparse){throw 'r15-stage-validation-modules-junction'}
        continue
      }
      if($relative-ceq'acceptance-evidence'-or$relative-ceq'tools/qdrant'-or
         $relative-ceq'runtime'-or$relative-ceq'sandbox-runtime'-or$relative-ceq'transient'){
        if(-not$item.PSIsContainer-or$reparse){throw 'r15-stage-validation-dynamic-root'}
        continue
      }
      if($reparse){throw 'r15-stage-validation-unexpected-reparse'}
      if($item.PSIsContainer){
        if(-not$expectedDirectories.Contains($relative)){throw 'r15-stage-validation-extra-directory'}
        $stack.Push($item.FullName)
      }elseif(-not$seen.Contains($relative)-and-not($relative.IndexOf('/')-lt0-and$allowedRootFiles.Contains($relative))){
        throw 'r15-stage-validation-extra-file'
      }
    }
  }
}
function Test-AllowedExecutionMutation([string]$Path){
  if([string]::IsNullOrWhiteSpace($Path)-or-not$Path.StartsWith(($root.TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase)){return $false}
  $relative=$Path.Substring($root.Length).TrimStart('\')
  foreach($dynamic in @('acceptance-evidence','disposable-postgres','transient','q','data')){
    if($relative-ceq$dynamic-or$relative.StartsWith(($dynamic+'\'),[StringComparison]::OrdinalIgnoreCase)){return $true}
  }
  $relative-ceq'disposable-postgres.log'
}
Assert-ExactStageSet

$packageLock=Join-Path $root 'package-lock.json';$loopbackPipe=Join-Path $root 'm1-browser-loopback-pipe.cjs'
$controlInput=Get-Content -LiteralPath (Join-Path $root 'CONTROL-REGRESSION-INPUT.json') -Raw|ConvertFrom-Json
Assert-PlainFile $loopbackPipe 'r15-stage-validation-loopback-file'|Out-Null
if((Get-LowerSha256 $packageLock)-cne$packageLockSha256-or(Get-LowerSha256 $loopbackPipe)-cne$loopbackPipeSha256){
  throw 'r15-stage-validation-runtime-source-pin'
}
$node=Join-Path $release 'runtime\node.exe';$modules=Join-Path $root 'node_modules';$expectedModules=Join-Path $release 'node_modules'
Assert-PlainFile $node 'r15-stage-validation-node-file'|Out-Null
if((Get-LowerSha256 $node)-cne$nodeSha256){throw 'r15-stage-validation-node-pin'}
$moduleItem=Get-Item -LiteralPath $modules -Force
if(-not$moduleItem.PSIsContainer-or($moduleItem.Attributes-band[IO.FileAttributes]::ReparsePoint)-eq0-or
   (($moduleItem.Target|Select-Object -First 1)-as[string])-cne$expectedModules){throw 'r15-stage-validation-modules-junction'}

if($Phase-cne'Finalize'){
  if([string]::IsNullOrWhiteSpace($FinalizationSha256)){throw 'r15-stage-validation-finalization-required'}
  if($Phase-ceq'Browser'-and[string]::IsNullOrWhiteSpace($CampaignDirectory)){throw 'r15-stage-validation-campaign-required'}
  if($Phase-cne'Browser'-and-not[string]::IsNullOrWhiteSpace($CampaignDirectory)){throw 'r15-stage-validation-campaign-unexpected'}
  $campaignInputs=@($ControlsName,$ControlsSha256,$BrowserProofName,$BrowserProofSha256,$HomeReadyName,$HomeReadySha256)
  $completionInputs=@($ExpectedLeaseId,$ExpectedLeaseSeal,$EligibilityManifestFileSha256,$EligibilityManifestSha256,
    $BatchResultSha256,$EligibilityValidationSha256)
  $reviewPrepareInputs=@($EligibilityManifestFileSha256,$EligibilityManifestSha256,$BatchResultSha256)
  $reviewFinalInputs=@($EligibilityManifestFileSha256,$EligibilityManifestSha256,$BatchResultSha256,$EligibilityValidationSha256,
    $HomeCompletionPreflightSha256,$HomeCompletionReceiptSha256,$HomeTerminalStatusSha256,$HomeBeforeStateSha256,
    $HomeFinalStateSha256,$HomeExportSha256,$HomeCompletionPublicationSha256,$HomeCompletionVerificationSha256,
    $ReviewManifestSha256,$WorksheetSha256,$DecisionsSha256)
  if($Phase-ceq'Campaign'){
    if(@($campaignInputs|Where-Object{[string]::IsNullOrWhiteSpace($_)}).Count-ne0-or
       @($reviewFinalInputs+$ExpectedLeaseId+$ExpectedLeaseSeal|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}).Count-ne0){throw 'r15-stage-validation-campaign-input-required'}
  }elseif($Phase-ceq'Completion'){
    if(@($completionInputs|Where-Object{[string]::IsNullOrWhiteSpace($_)}).Count-ne0-or
       @($campaignInputs+$HomeCompletionPreflightSha256+$HomeCompletionReceiptSha256+$HomeTerminalStatusSha256+
         $HomeBeforeStateSha256+$HomeFinalStateSha256+$HomeExportSha256+$HomeCompletionPublicationSha256+
         $HomeCompletionVerificationSha256+$ReviewManifestSha256+$WorksheetSha256+$DecisionsSha256|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}).Count-ne0){throw 'r15-stage-validation-completion-input-required'}
  }elseif($Phase-ceq'ReviewPrepare'){
    if(@($reviewPrepareInputs|Where-Object{[string]::IsNullOrWhiteSpace($_)}).Count-ne0-or
       @($campaignInputs+$ExpectedLeaseId+$ExpectedLeaseSeal+$EligibilityValidationSha256+$HomeCompletionPreflightSha256+
         $HomeCompletionReceiptSha256+$HomeTerminalStatusSha256+$HomeBeforeStateSha256+$HomeFinalStateSha256+
         $HomeExportSha256+$HomeCompletionPublicationSha256+$HomeCompletionVerificationSha256+$ReviewManifestSha256+
         $WorksheetSha256+$DecisionsSha256|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}).Count-ne0){throw 'r15-stage-validation-review-prepare-input-required'}
  }elseif($Phase-ceq'ReviewFinalize'){
    if(@($campaignInputs|Where-Object{[string]::IsNullOrWhiteSpace($_)}).Count-ne0-or
       @($reviewFinalInputs|Where-Object{[string]::IsNullOrWhiteSpace($_)}).Count-ne0-or
       @($ExpectedLeaseId,$ExpectedLeaseSeal|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}).Count-ne0){throw 'r15-stage-validation-review-finalize-input-required'}
  }elseif(@($campaignInputs+$reviewFinalInputs+$ExpectedLeaseId+$ExpectedLeaseSeal|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}).Count-ne0){
    throw 'r15-stage-validation-input-unexpected'
  }
  $receiptPath=Join-Path $root 'SOURCE-STAGE-FINALIZATION.json'
  Assert-PlainFile $receiptPath 'r15-stage-validation-finalization-file'|Out-Null
  if((Get-LowerSha256 $receiptPath)-cne$FinalizationSha256){throw 'r15-stage-validation-finalization-pin'}
  $receipt=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
  $receiptKeys=($receipt.PSObject.Properties.Name|Sort-Object)-join','
  $validatorSha256=Get-LowerSha256 $PSCommandPath
  if($receiptKeys-cne'agentTokens,archiveSha256,browserControlReady,controlRegressionInputSha256,finalized,hardwarePlanSha256,identitySha256,loopbackPipeSha256,manifestSha256,nodeSha256,privateValuesIncluded,productionChanged,runtimeFiles,runtimeManifestSha256,runtimeSecurityEntries,runtimeSecurityNormalized,runtimeSecuritySha256,runtimeSealSha256,schemaVersion,sourceCommit,stageId,syntheticStateCopied,validatorSha256'-or
     $receipt.schemaVersion-cne'runaai-m1-r15-source-stage-finalization/v4'-or$receipt.finalized-cne$true-or
     $receipt.stageId-cne$StageId-or$receipt.sourceCommit-cne$sourceCommit-or$receipt.archiveSha256-cne$archiveSha256-or
     $receipt.runtimeSealSha256-cne$runtimeSealSha256-or$receipt.hardwarePlanSha256-cne$hardwarePlanSha256-or
     $receipt.manifestSha256-cne$manifestSha256-or$receipt.identitySha256-cne$identitySha256-or
      $receipt.controlRegressionInputSha256-cne$controlRegressionInputSha256-or$receipt.loopbackPipeSha256-cne$loopbackPipeSha256-or
       $receipt.nodeSha256-cne$nodeSha256-or$receipt.runtimeManifestSha256-notmatch'^[a-f0-9]{64}$'-or
       $receipt.runtimeSecuritySha256-notmatch'^[a-f0-9]{64}$'-or$receipt.runtimeSecurityEntries-lt5-or
       $receipt.runtimeSecurityEntries-gt10000-or$receipt.runtimeSecurityNormalized-cne$true-or
      $receipt.runtimeFiles-lt5-or$receipt.runtimeFiles-gt10000-or
     $receipt.validatorSha256-cne$validatorSha256-or$receipt.agentTokens-ne1536-or
     $receipt.browserControlReady-cne$true-or$receipt.syntheticStateCopied-cne$false-or
     $receipt.productionChanged-cne$false-or$receipt.privateValuesIncluded-cne$false){throw 'r15-stage-validation-finalization-schema'}
}
if($Phase-ceq'Finalize'){
  $finalizeLocks=New-Object 'System.Collections.Generic.List[System.IO.FileStream]'
  try{
    foreach($entry in @($manifest.entries)){
      $filename=Join-Path $root ($entry.path.Replace('/','\'))
      $stream=New-Object IO.FileStream($filename,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
      $finalizeLocks.Add($stream)
      if((Get-LowerSha256 $filename)-cne$entry.sha256){throw 'r15-stage-finalize-locked-source-pin'}
    }
    $nodeLock=New-Object IO.FileStream($node,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    $finalizeLocks.Add($nodeLock)
    if((Get-LowerSha256 $node)-cne$nodeSha256){throw 'r15-stage-finalize-locked-node-pin'}
    $builder=Join-Path $root 'gate7f\function-first\acceptance\owned-runtime-stage.mjs'
    if($controlInput.dependencies.releaseRoot-cne$release-or
       $controlInput.dependencies.artifactDigest-notmatch'^[a-f0-9]{64}$'-or
       $controlInput.dependencies.nodeSha256-cne$nodeSha256){throw 'r15-stage-runtime-dependency-binding'}
    $runtimeRaw=@(& $node $builder --owned-root $root --release-root $release --source-commit $sourceCommit `
      --source-archive-sha256 $archiveSha256 --dependency-artifact-digest $controlInput.dependencies.artifactDigest `
      --source-tree-manifest-sha256 $manifestSha256 --node-sha256 $nodeSha256)
    $runtimeExit=$LASTEXITCODE
    if($runtimeExit-ne0){throw 'r15-stage-runtime-build'}
    $runtimeLine=@($runtimeRaw|Where-Object{-not[string]::IsNullOrWhiteSpace($_)})|Select-Object -Last 1
    try{$runtimeResult=$runtimeLine|ConvertFrom-Json}catch{throw 'r15-stage-runtime-build-output'}
    if($runtimeResult.schemaVersion-cne'runaai-m1-owned-runtime-stage-result/v1'-or
       $runtimeResult.manifestSha256-notmatch'^[a-f0-9]{64}$'-or$runtimeResult.runtimeFiles-lt5-or
       $runtimeResult.nodeSha256-cne$nodeSha256){throw 'r15-stage-runtime-build-result'}
    $builtManifestPath=Join-Path $root 'OWNED-RUNTIME-MANIFEST.json'
    $builtManifest=Get-Content -LiteralPath $builtManifestPath -Raw|ConvertFrom-Json
    $securityPaths=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    foreach($entry in @($builtManifest.entries)){
      if($entry.path-isnot[string]-or$entry.path-notmatch'^(?:runtime|sandbox-runtime)/'){throw 'r15-stage-runtime-security-manifest'}
      $securityPaths.Add($entry.path)|Out-Null
      $directory=[IO.Path]::GetDirectoryName($entry.path.Replace('/','\'))
      while(-not[string]::IsNullOrEmpty($directory)){$securityPaths.Add($directory.Replace('\','/'))|Out-Null;$directory=[IO.Path]::GetDirectoryName($directory)}
    }
    . (Join-Path $root 'gate7f\function-first\acceptance\Get-R15RuntimeSecurityDigest.ps1')
    $transient=Join-Path $root 'transient'
    if(Test-Path -LiteralPath $transient){throw 'r15-stage-runtime-security-transient-preexisting'}
    [void](New-Item -ItemType Directory -Path $transient)
    try{
      $accessRaw=@(& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $root 'gate7f\function-first\tasks\Stage-OwnedNativeAccess.ps1') -OwnedRoot $root)
      if($LASTEXITCODE-ne0){throw 'r15-stage-runtime-security-access'}
      $accessLine=@($accessRaw|Where-Object{-not[string]::IsNullOrWhiteSpace($_)})|Select-Object -Last 1
      try{$normalizationAccess=$accessLine|ConvertFrom-Json}catch{throw 'r15-stage-runtime-security-access-output'}
      if($normalizationAccess.schemaVersion-cne'runa-m1-owned-native-access/v1'-or$normalizationAccess.passed-cne$true-or
         $normalizationAccess.ancestorsUnchanged-cne$true-or$normalizationAccess.sampledDescendantUnchanged-cne$true-or
         $normalizationAccess.productionAclChanged-cne$false){throw 'r15-stage-runtime-security-access-result'}
      $securityBefore=Get-R15RuntimeSecurityDigest -Root $root -RelativePaths @($securityPaths)
      $normalizationFirst=Invoke-R15RuntimeSecurityNormalization -OwnedRoot $root -NodePath $node
      $securityAfterFirst=Get-R15RuntimeSecurityDigest -Root $root -RelativePaths @($securityPaths)
      $normalizationSecond=Invoke-R15RuntimeSecurityNormalization -OwnedRoot $root -NodePath $node
      $securityAfterSecond=Get-R15RuntimeSecurityDigest -Root $root -RelativePaths @($securityPaths)
      if($securityAfterFirst.Count-ne$securityPaths.Count-or$securityAfterSecond.Count-ne$securityPaths.Count-or
         $securityAfterFirst.Sha256-cne$securityAfterSecond.Sha256){throw 'r15-stage-runtime-security-normalization-not-idempotent'}
      if(@(Get-ChildItem -LiteralPath $transient -Force).Count-ne0){throw 'r15-stage-runtime-security-transient-not-empty'}
      $runtimeSecuritySha256=$securityAfterSecond.Sha256;$runtimeSecurityEntries=$securityAfterSecond.Count
    }finally{
      if(Test-Path -LiteralPath $transient){Remove-Item -LiteralPath $transient -Force}
    }
  }finally{foreach($stream in $finalizeLocks){$stream.Dispose()}}
  Assert-ExactStageSet
  [ordered]@{schemaVersion='runaai-m1-r15-stage-validation/v2';phase=$Phase;stageId=$StageId;sourceCommit=$sourceCommit;
    archiveSha256=$archiveSha256;runtimeSealSha256=$runtimeSealSha256;hardwarePlanSha256=$hardwarePlanSha256;
    manifestSha256=$manifestSha256;runtimeManifestSha256=$runtimeResult.manifestSha256;
    runtimeFiles=$runtimeResult.runtimeFiles;runtimeSecuritySha256=$runtimeSecuritySha256;
    runtimeSecurityEntries=$runtimeSecurityEntries;runtimeSecurityNormalized=$true;
    verifiedSourceFiles=$seen.Count;modelsInvoked=$false;productionChanged=$false}|ConvertTo-Json -Compress
  return
}

function Get-StreamSha256([IO.FileStream]$Stream){
  $sha=[Security.Cryptography.SHA256]::Create()
  try{
    $Stream.Position=0;$value=([BitConverter]::ToString($sha.ComputeHash($Stream))).Replace('-','').ToLowerInvariant()
    $Stream.Position=0;$value
  }finally{$sha.Dispose()}
}
$runtimeManifestPath=Join-Path $root 'OWNED-RUNTIME-MANIFEST.json'
Assert-PlainFile $runtimeManifestPath 'r15-stage-runtime-manifest-file'|Out-Null
if((Get-LowerSha256 $runtimeManifestPath)-cne$receipt.runtimeManifestSha256){throw 'r15-stage-runtime-manifest-pin'}
$runtimeManifest=Get-Content -LiteralPath $runtimeManifestPath -Raw|ConvertFrom-Json
$runtimeManifestKeys=($runtimeManifest.PSObject.Properties.Name|Sort-Object)-join','
  if($runtimeManifestKeys-cne'dependencyArtifactDigest,entries,nodeSourceSha256,schemaVersion,sourceArchiveSha256,sourceCommit,sourceTreeManifestSha256'-or
    $runtimeManifest.schemaVersion-cne'runaai-m1-owned-runtime-manifest/v2'-or
    $runtimeManifest.sourceCommit-cne$sourceCommit-or$runtimeManifest.sourceArchiveSha256-cne$archiveSha256-or
    $runtimeManifest.nodeSourceSha256-cne$nodeSha256-or$runtimeManifest.sourceTreeManifestSha256-cne$manifestSha256-or
    $runtimeManifest.dependencyArtifactDigest-cne$controlInput.dependencies.artifactDigest-or
    @($runtimeManifest.entries).Count-ne$receipt.runtimeFiles){
  throw 'r15-stage-runtime-manifest-schema'
}
$runtimeSeen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
$runtimeExpectedDirectories=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
$runtimePrevious=$null
foreach($entry in @($runtimeManifest.entries)){
  $entryKeys=($entry.PSObject.Properties.Name|Sort-Object)-join','
  if($entryKeys-cne'bytes,path,sha256'-or$entry.path-isnot[string]-or
     $entry.path-notmatch'^(?:runtime|sandbox-runtime)/(?!.*(?:^|/)\.\.(?:/|$))(?!.*\\)[\x20-\x7e]+$'-or
     $entry.sha256-notmatch'^[a-f0-9]{64}$'-or$entry.bytes-isnot[long]-and$entry.bytes-isnot[int]-or
     -not$runtimeSeen.Add($entry.path)-or($null-ne$runtimePrevious-and[StringComparer]::Ordinal.Compare($runtimePrevious,$entry.path)-ge0)){
    throw 'r15-stage-runtime-manifest-entry'
  }
  $runtimePrevious=$entry.path
  $directory=[IO.Path]::GetDirectoryName($entry.path.Replace('/','\'))
  while(-not[string]::IsNullOrEmpty($directory)){
    $runtimeExpectedDirectories.Add($directory.Replace('\','/'))|Out-Null
    $directory=[IO.Path]::GetDirectoryName($directory)
  }
  $candidate=Join-Path $root ($entry.path.Replace('/','\'));$item=Assert-PlainFile $candidate 'r15-stage-runtime-file'
  if($item.Length-ne[long]$entry.bytes-or(Get-LowerSha256 $candidate)-cne$entry.sha256){throw 'r15-stage-runtime-file-pin'}
}
if(-not$runtimeSeen.Contains('runtime/node.exe')-or-not$runtimeSeen.Contains('sandbox-runtime/quickjs-child.mjs')){
  throw 'r15-stage-runtime-required-file'
}
$runtimeActualFiles=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
$runtimeActualDirectories=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
$runtimeStack=New-Object 'System.Collections.Generic.Stack[string]'
foreach($name in @('runtime','sandbox-runtime')){
  $directory=Join-Path $root $name;$item=Get-Item -LiteralPath $directory -Force
  if(-not$item.PSIsContainer-or($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'r15-stage-runtime-root'}
  $runtimeStack.Push($directory)
}
while($runtimeStack.Count-ne0){
  $directory=$runtimeStack.Pop();$relativeDirectory=$directory.Substring($root.Length).TrimStart('\').Replace('\','/')
  $runtimeActualDirectories.Add($relativeDirectory)|Out-Null
  foreach($item in @(Get-ChildItem -LiteralPath $directory -Force)){
    if(($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'r15-stage-runtime-reparse'}
    if($item.PSIsContainer){$runtimeStack.Push($item.FullName)}
    else{$runtimeActualFiles.Add($item.FullName.Substring($root.Length).TrimStart('\').Replace('\','/'))|Out-Null}
  }
}
if((($runtimeActualFiles|Sort-Object)-join"`n")-cne(($runtimeSeen|Sort-Object)-join"`n")-or
   (($runtimeActualDirectories|Sort-Object)-join"`n")-cne(($runtimeExpectedDirectories|Sort-Object)-join"`n")){
  throw 'r15-stage-runtime-exact-set'
}
$runtimeSecurityPaths=@($runtimeSeen)+@($runtimeExpectedDirectories)
. (Join-Path $root 'gate7f\function-first\acceptance\Get-R15RuntimeSecurityDigest.ps1')
function Assert-R15RuntimeDurableState {
  foreach($entry in @($runtimeManifest.entries)){
    $candidate=Join-Path $root ($entry.path.Replace('/','\'));$item=Assert-PlainFile $candidate 'r15-stage-runtime-file'
    if($item.Length-ne[long]$entry.bytes-or(Get-LowerSha256 $candidate)-cne$entry.sha256){throw 'r15-stage-runtime-file-pin'}
  }
  $actualFiles=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  $actualDirectories=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  $stack=New-Object 'System.Collections.Generic.Stack[string]'
  foreach($name in @('runtime','sandbox-runtime')){$stack.Push((Join-Path $root $name))}
  while($stack.Count-ne0){
    $directory=$stack.Pop();$actualDirectories.Add($directory.Substring($root.Length).TrimStart('\').Replace('\','/'))|Out-Null
    foreach($item in @(Get-ChildItem -LiteralPath $directory -Force)){
      if(($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'r15-stage-runtime-reparse'}
      if($item.PSIsContainer){$stack.Push($item.FullName)}
      else{$actualFiles.Add($item.FullName.Substring($root.Length).TrimStart('\').Replace('\','/'))|Out-Null}
    }
  }
  if((($actualFiles|Sort-Object)-join"`n")-cne(($runtimeSeen|Sort-Object)-join"`n")-or
     (($actualDirectories|Sort-Object)-join"`n")-cne(($runtimeExpectedDirectories|Sort-Object)-join"`n")){
    throw 'r15-stage-runtime-exact-set'
  }
}
$transient=Join-Path $root 'transient'
if(Test-Path -LiteralPath $transient){throw 'r15-stage-transient-preexisting'}
[void](New-Item -ItemType Directory -Path $transient)
$accessRaw=@(& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $root 'gate7f\function-first\tasks\Stage-OwnedNativeAccess.ps1') -OwnedRoot $root)
if($LASTEXITCODE-ne0){throw 'r15-stage-native-access'}
$accessLine=@($accessRaw|Where-Object{-not[string]::IsNullOrWhiteSpace($_)})|Select-Object -Last 1
try{$access=$accessLine|ConvertFrom-Json}catch{throw 'r15-stage-native-access-output'}
if($access.schemaVersion-cne'runa-m1-owned-native-access/v1'-or$access.passed-cne$true-or
   $access.ancestorsUnchanged-cne$true-or$access.sampledDescendantUnchanged-cne$true-or
   $access.productionAclChanged-cne$false){throw 'r15-stage-native-access-result'}
$runtimeSecurityBeforeNormalization=Get-R15RuntimeSecurityDigest -Root $root -RelativePaths $runtimeSecurityPaths
if($runtimeSecurityBeforeNormalization.Count-ne$receipt.runtimeSecurityEntries-or
   $runtimeSecurityBeforeNormalization.Sha256-cne$receipt.runtimeSecuritySha256){throw 'r15-stage-runtime-security-baseline-drift'}
$runtimeNormalization=Invoke-R15RuntimeSecurityNormalization -OwnedRoot $root -NodePath $node
$runtimeSecurityBefore=Get-R15RuntimeSecurityDigest -Root $root -RelativePaths $runtimeSecurityPaths
if($runtimeSecurityBefore.Count-ne$runtimeSecurityBeforeNormalization.Count-or
   $runtimeSecurityBefore.Sha256-cne$runtimeSecurityBeforeNormalization.Sha256){throw 'r15-stage-runtime-security-normalization-not-idempotent'}
$campaignArmPath=Join-Path $root 'acceptance-evidence\r15-gemma-eligibility-arm.json'
$gemmaCampaignRelative='acceptance-evidence\campaign-gemma4-26b-a4b-'+$runtimeSealSha256.Substring(0,16)
$gemmaCampaignPath=Join-Path $root $gemmaCampaignRelative
$campaignArmFileSha256=$null;$campaignArmSha256=$null
$phasePinnedSpecs=New-Object 'System.Collections.Generic.List[object]'
if($Phase-ceq'Completion'-or$Phase-ceq'ReviewPrepare'-or$Phase-ceq'ReviewFinalize'){
  $phasePinnedSpecs.Add([pscustomobject]@{Path=$campaignArmPath;Sha=$EligibilityManifestFileSha256;Code='r15-stage-gemma-arm'})
  $phasePinnedSpecs.Add([pscustomobject]@{Path=(Join-Path $gemmaCampaignPath 'result.json');Sha=$BatchResultSha256;Code='r15-stage-gemma-result'})
}
if($Phase-ceq'Completion'-or$Phase-ceq'ReviewFinalize'){
  $phasePinnedSpecs.Add([pscustomobject]@{Path=(Join-Path $gemmaCampaignPath 'eligibility-validation.json');Sha=$EligibilityValidationSha256;Code='r15-stage-gemma-validation'})
}
if($Phase-ceq'ReviewFinalize'){
  $controlsPath=Join-Path $root ('acceptance-evidence\'+$ControlsName)
  $browserProofPath=Join-Path $root ('acceptance-evidence\'+$BrowserProofName)
  $homeReadyPath=Join-Path $root ('acceptance-evidence\'+$HomeReadyName)
  foreach($spec in @(
    [pscustomobject]@{Path=$controlsPath;Sha=$ControlsSha256;Code='r15-stage-review-controls'},
    [pscustomobject]@{Path=$browserProofPath;Sha=$BrowserProofSha256;Code='r15-stage-review-browser'},
    [pscustomobject]@{Path=$homeReadyPath;Sha=$HomeReadySha256;Code='r15-stage-review-home-ready'},
    [pscustomobject]@{Path=(Join-Path $gemmaCampaignPath 'home-completion-preflight.json');Sha=$HomeCompletionPreflightSha256;Code='r15-stage-review-home-preflight'},
    [pscustomobject]@{Path=(Join-Path $gemmaCampaignPath 'home-completion-receipt.json');Sha=$HomeCompletionReceiptSha256;Code='r15-stage-review-home-receipt'},
    [pscustomobject]@{Path=(Join-Path $gemmaCampaignPath 'home-terminal-status.json');Sha=$HomeTerminalStatusSha256;Code='r15-stage-review-home-terminal'},
    [pscustomobject]@{Path=(Join-Path $gemmaCampaignPath 'home-before-cleanup-state.json');Sha=$HomeBeforeStateSha256;Code='r15-stage-review-home-before'},
    [pscustomobject]@{Path=(Join-Path $gemmaCampaignPath 'home-final-state.json');Sha=$HomeFinalStateSha256;Code='r15-stage-review-home-final'},
    [pscustomobject]@{Path=(Join-Path $gemmaCampaignPath 'home-export.json');Sha=$HomeExportSha256;Code='r15-stage-review-home-export'},
    [pscustomobject]@{Path=(Join-Path $gemmaCampaignPath 'home-completion-publication.json');Sha=$HomeCompletionPublicationSha256;Code='r15-stage-review-home-publication'},
    [pscustomobject]@{Path=(Join-Path $gemmaCampaignPath 'home-completion-verification.json');Sha=$HomeCompletionVerificationSha256;Code='r15-stage-review-home-verification'},
    [pscustomobject]@{Path=(Join-Path $root 'acceptance-evidence\operator-review-binding\review-manifest.json');Sha=$ReviewManifestSha256;Code='r15-stage-review-manifest'},
    [pscustomobject]@{Path=(Join-Path $root 'acceptance-evidence\candidate-blind-review\review-worksheet.json');Sha=$WorksheetSha256;Code='r15-stage-review-worksheet'},
    [pscustomobject]@{Path=(Join-Path $root 'acceptance-evidence\candidate-blind-review\review-decisions.json');Sha=$DecisionsSha256;Code='r15-stage-review-decisions'}
  )){$phasePinnedSpecs.Add($spec)}
}
foreach($spec in $phasePinnedSpecs){
  Assert-PlainFile $spec.Path ($spec.Code+'-file')|Out-Null
  if((Get-LowerSha256 $spec.Path)-cne$spec.Sha){throw ($spec.Code+'-pin')}
}
if($Phase-ceq'Campaign'){
  $controlsPath=Join-Path $root ('acceptance-evidence\'+$ControlsName)
  $browserProofPath=Join-Path $root ('acceptance-evidence\'+$BrowserProofName)
  $homeReadyPath=Join-Path $root ('acceptance-evidence\'+$HomeReadyName)
  $homeLivePath=Join-Path $root 'acceptance-evidence\home-live.json'
  foreach($spec in @(
    [pscustomobject]@{Path=$controlsPath;Sha=$ControlsSha256;Code='r15-stage-campaign-controls'},
    [pscustomobject]@{Path=$browserProofPath;Sha=$BrowserProofSha256;Code='r15-stage-campaign-browser-proof'},
    [pscustomobject]@{Path=$homeReadyPath;Sha=$HomeReadySha256;Code='r15-stage-campaign-home-ready'})){
    Assert-PlainFile $spec.Path ($spec.Code+'-file')|Out-Null
    if((Get-LowerSha256 $spec.Path)-cne$spec.Sha){throw ($spec.Code+'-pin')}
  }
  Assert-PlainFile $homeLivePath 'r15-stage-campaign-home-live-file'|Out-Null
  if((Test-Path -LiteralPath $campaignArmPath)-or(Test-Path -LiteralPath $gemmaCampaignPath)){
    throw 'r15-stage-campaign-prior-arm-or-attempts'
  }
  $prepareArm=Join-Path $root 'gate7f\function-first\acceptance\prepare-r15-gemma-eligibility-arm.mjs'
  $prepareRaw=@(& $node $prepareArm --owned-root $root --controls ('acceptance-evidence/'+$ControlsName) `
    --controls-sha256 $ControlsSha256 --browser-proof ('acceptance-evidence/'+$BrowserProofName) `
    --browser-proof-sha256 $BrowserProofSha256 --home-ready ('acceptance-evidence/'+$HomeReadyName) `
    --home-ready-sha256 $HomeReadySha256 --output 'acceptance-evidence/r15-gemma-eligibility-arm.json')
  if($LASTEXITCODE-ne0){throw 'r15-stage-campaign-arm-preparation'}
  $prepareLine=@($prepareRaw|Where-Object{-not[string]::IsNullOrWhiteSpace($_)})|Select-Object -Last 1
  try{$preparedArm=$prepareLine|ConvertFrom-Json}catch{throw 'r15-stage-campaign-arm-preparation-output'}
  if($preparedArm.schemaVersion-cne'runaai-m1-r15-gemma-arm-preparation/v1'-or
     $preparedArm.candidateId-cne'gemma4-26b-a4b'-or$preparedArm.requiredAttempts-ne120-or
     $preparedArm.scoredAttemptsAtCreation-ne0-or$preparedArm.modelsInvokedByPreparation-cne$false-or
     $preparedArm.productionChanged-cne$false-or$preparedArm.protectedDataRead-cne$false-or
     $preparedArm.fileSha256-notmatch'^[a-f0-9]{64}$'-or$preparedArm.eligibilityManifestSha256-notmatch'^[a-f0-9]{64}$'){
    throw 'r15-stage-campaign-arm-preparation-result'
  }
  Assert-PlainFile $campaignArmPath 'r15-stage-campaign-arm-file'|Out-Null
  if((Get-LowerSha256 $campaignArmPath)-cne$preparedArm.fileSha256){throw 'r15-stage-campaign-arm-file-pin'}
  $campaignArmFileSha256=$preparedArm.fileSha256;$campaignArmSha256=$preparedArm.eligibilityManifestSha256
}
$lockSpecs=New-Object 'System.Collections.Generic.Dictionary[string,string]' ([StringComparer]::OrdinalIgnoreCase)
foreach($entry in @($manifest.entries)){$lockSpecs.Add((Join-Path $root ($entry.path.Replace('/','\'))),$entry.sha256)}
foreach($entry in @($runtimeManifest.entries)){$lockSpecs.Add((Join-Path $root ($entry.path.Replace('/','\'))),$entry.sha256)}
foreach($spec in @(
  [pscustomobject]@{Path=$archive;Sha=$archiveSha256},[pscustomobject]@{Path=$sealPath;Sha=$runtimeSealSha256},
  [pscustomobject]@{Path=$hardwarePlanPath;Sha=$hardwarePlanSha256},[pscustomobject]@{Path=$manifestPath;Sha=$manifestSha256},
  [pscustomobject]@{Path=$identityPath;Sha=$identitySha256},[pscustomobject]@{Path=$controlInputPath;Sha=$controlRegressionInputSha256},
  [pscustomobject]@{Path=$loopbackPipe;Sha=$loopbackPipeSha256},[pscustomobject]@{Path=$receiptPath;Sha=$FinalizationSha256},
  [pscustomobject]@{Path=$runtimeManifestPath;Sha=$receipt.runtimeManifestSha256},
  [pscustomobject]@{Path=$PSCommandPath;Sha=$validatorSha256},[pscustomobject]@{Path=$node;Sha=$nodeSha256})){
  if(-not$lockSpecs.ContainsKey($spec.Path)){$lockSpecs.Add($spec.Path,$spec.Sha)}
}
if($Phase-ceq'Campaign'){
  foreach($spec in @(
    [pscustomobject]@{Path=$controlsPath;Sha=$ControlsSha256},[pscustomobject]@{Path=$browserProofPath;Sha=$BrowserProofSha256},
    [pscustomobject]@{Path=$homeReadyPath;Sha=$HomeReadySha256},[pscustomobject]@{Path=$campaignArmPath;Sha=$campaignArmFileSha256})){
    if(-not$lockSpecs.ContainsKey($spec.Path)){$lockSpecs.Add($spec.Path,$spec.Sha)}
  }
}
foreach($spec in $phasePinnedSpecs){if(-not$lockSpecs.ContainsKey($spec.Path)){$lockSpecs.Add($spec.Path,$spec.Sha)}}
$locks=New-Object 'System.Collections.Generic.List[System.IO.FileStream]'
$watchers=New-Object 'System.Collections.Generic.List[System.IO.FileSystemWatcher]'
$sourceIds=@();$nodeExit=1;$mutationCount=0
$mutationSamples=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
$watcherErrors=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
$queuedEvents=New-Object 'System.Collections.Generic.List[System.Management.Automation.PSEventArgs]'
try{
  foreach($spec in $lockSpecs.GetEnumerator()){
    $stream=New-Object IO.FileStream($spec.Key,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    $locks.Add($stream)
    if((Get-StreamSha256 $stream)-cne$spec.Value){throw 'r15-stage-validation-locked-source-pin'}
  }
  if($runtimeSecurityBefore.Count-ne$runtimeSecurityPaths.Count){throw 'r15-stage-runtime-security-count'}
  . (Join-Path $root 'gate7f\function-first\acceptance\Wait-R15WatcherQuiescence.ps1')
  $mutableRoots=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  foreach($name in @('acceptance-evidence','disposable-postgres','transient','q','data','node_modules')){$mutableRoots.Add($name)|Out-Null}
  $protectedTopLevels=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  foreach($entry in @($manifest.entries)){
    $top=($entry.path-split'/')[0]
    if($entry.path.Contains('/')-and-not$mutableRoots.Contains($top)){$protectedTopLevels.Add($top)|Out-Null}
  }
  foreach($name in @('runtime','sandbox-runtime')){$protectedTopLevels.Add($name)|Out-Null}
  $watchSpecs=@([pscustomobject]@{Path=$root;Recursive=$false;TransientRuntimeSecurity=$false})
  foreach($name in @($protectedTopLevels|Sort-Object)){
    $protectedPath=Join-Path $root $name
    if(-not(Test-Path -LiteralPath $protectedPath -PathType Container)){throw 'r15-stage-validation-protected-root-missing'}
    $watchSpecs+=@([pscustomobject]@{Path=$protectedPath;Recursive=$true;TransientRuntimeSecurity=($name-ceq'runtime'-or$name-ceq'sandbox-runtime')})
  }
  for($watchIndex=0;$watchIndex-lt$watchSpecs.Count;$watchIndex++){
    $spec=$watchSpecs[$watchIndex]
    $watcher=New-Object IO.FileSystemWatcher($spec.Path)
    $watcher.IncludeSubdirectories=$spec.Recursive
    $watcher.InternalBufferSize=65536
    $watcher.NotifyFilter=[IO.NotifyFilters]::FileName-bor[IO.NotifyFilters]::DirectoryName-bor[IO.NotifyFilters]::LastWrite-bor[IO.NotifyFilters]::Size-bor[IO.NotifyFilters]::Attributes
    if(-not$spec.TransientRuntimeSecurity){$watcher.NotifyFilter=$watcher.NotifyFilter-bor[IO.NotifyFilters]::Security}
    foreach($eventName in @('Changed','Created','Deleted','Renamed','Error')){
      $sourceId='r15-'+$StageId+'-'+$watchIndex+'-'+$eventName.ToLowerInvariant()
      Register-ObjectEvent -InputObject $watcher -EventName $eventName -SourceIdentifier $sourceId|Out-Null
      $sourceIds+=$sourceId
    }
    $watchers.Add($watcher)
    $watcher.EnableRaisingEvents=$true
  }
  Assert-ExactStageSet
  $moduleItem=Get-Item -LiteralPath $modules -Force
  if((($moduleItem.Target|Select-Object -First 1)-as[string])-cne$expectedModules){throw 'r15-stage-validation-modules-launch-drift'}
  if($Phase-ceq'Controls'){
    $entry=Join-Path $root 'gate7f\function-first\acceptance\control-functional.mjs'
    & $node $entry --mode controls --owned-root $root --source-commit $sourceCommit --browser-checkpoints true --runtime-seal runtime-seal.json
  }elseif($Phase-ceq'Browser'){
    $entry=Join-Path $root 'gate7f\function-first\acceptance\run-r15-browser-publication-control.mjs'
    & $node $entry --owned-root $root --source-commit $sourceCommit --runtime-seal runtime-seal.json --browser-checkpoints true --campaign-directory $CampaignDirectory
  }elseif($Phase-ceq'Campaign'){
    $entry=Join-Path $root 'gate7f\function-first\acceptance\run-r15-gemma-eligibility-campaign.mjs'
    & $node $entry --mode scored --owned-root $root --source-commit $sourceCommit `
      --runtime-seal runtime-seal.json --runtime-seal-sha256 $runtimeSealSha256 `
      --controls ('acceptance-evidence/'+$ControlsName) --controls-sha256 $ControlsSha256 `
      --candidate-id gemma4-26b-a4b --home-ready ('acceptance-evidence/'+$HomeReadyName) `
      --home-ready-sha256 $HomeReadySha256 --hardware-plan campaign-hardware-plan.json `
      --hardware-plan-sha256 $hardwarePlanSha256 --home-status acceptance-evidence/home-live.json `
      --browser-checkpoints true --eligibility-manifest acceptance-evidence/r15-gemma-eligibility-arm.json `
      --eligibility-manifest-sha256 $campaignArmSha256
  }elseif($Phase-ceq'Completion'){
    $entry=Join-Path $root 'gate7f\function-first\acceptance\verify-r15-gemma-home-completion.mjs'
    & $node $entry --owned-root $root --eligibility-manifest acceptance-evidence/r15-gemma-eligibility-arm.json `
      --eligibility-manifest-file-sha256 $EligibilityManifestFileSha256 --eligibility-manifest-sha256 $EligibilityManifestSha256 `
      --batch-result (($gemmaCampaignRelative+'\result.json').Replace('\','/')) --batch-result-sha256 $BatchResultSha256 `
      --eligibility-validation (($gemmaCampaignRelative+'\eligibility-validation.json').Replace('\','/')) `
      --eligibility-validation-sha256 $EligibilityValidationSha256 --runtime-seal runtime-seal.json `
      --runtime-seal-sha256 $runtimeSealSha256 --source-tree-manifest SOURCE-TREE-MANIFEST.json `
      --source-tree-manifest-sha256 $manifestSha256 --runtime-seal-prefix $runtimeSealSha256.Substring(0,16) `
      --lease-id $ExpectedLeaseId --lease-seal-sha256 $ExpectedLeaseSeal `
      --output (($gemmaCampaignRelative+'\home-completion-preflight.json').Replace('\','/'))
  }elseif($Phase-ceq'ReviewPrepare'){
    $entry=Join-Path $root 'gate7f\function-first\acceptance\prepare-r15-gemma-blind-review.mjs'
    & $node $entry --owned-root $root --eligibility-manifest acceptance-evidence/r15-gemma-eligibility-arm.json `
      --eligibility-manifest-sha256 $EligibilityManifestSha256 `
      --batch-result (($gemmaCampaignRelative+'\result.json').Replace('\','/')) --batch-result-sha256 $BatchResultSha256 `
      --private-output-directory acceptance-evidence/operator-review-binding `
      --worksheet-output-directory acceptance-evidence/candidate-blind-review
  }elseif($Phase-ceq'ReviewFinalize'){
    $entry=Join-Path $root 'gate7f\function-first\acceptance\finalize-r15-gemma-blind-review.mjs'
    $campaignForward=$gemmaCampaignRelative.Replace('\','/')
    & $node $entry --owned-root $root --eligibility-manifest acceptance-evidence/r15-gemma-eligibility-arm.json `
      --eligibility-manifest-file-sha256 $EligibilityManifestFileSha256 --eligibility-manifest-sha256 $EligibilityManifestSha256 `
      --batch-result ($campaignForward+'/result.json') --batch-result-sha256 $BatchResultSha256 `
      --completion-validation ($campaignForward+'/eligibility-validation.json') --completion-validation-sha256 $EligibilityValidationSha256 `
      --runtime-seal runtime-seal.json --runtime-seal-sha256 $runtimeSealSha256 `
      --source-tree-manifest SOURCE-TREE-MANIFEST.json --source-tree-manifest-sha256 $manifestSha256 `
      --hardware-plan campaign-hardware-plan.json --hardware-plan-sha256 $hardwarePlanSha256 `
      --controls ('acceptance-evidence/'+$ControlsName) --controls-sha256 $ControlsSha256 `
      --browser-proof ('acceptance-evidence/'+$BrowserProofName) --browser-proof-sha256 $BrowserProofSha256 `
      --home-ready ('acceptance-evidence/'+$HomeReadyName) --home-ready-sha256 $HomeReadySha256 `
      --home-completion-preflight ($campaignForward+'/home-completion-preflight.json') --home-completion-preflight-sha256 $HomeCompletionPreflightSha256 `
      --home-completion-receipt ($campaignForward+'/home-completion-receipt.json') --home-completion-receipt-sha256 $HomeCompletionReceiptSha256 `
      --home-terminal-status ($campaignForward+'/home-terminal-status.json') --home-terminal-status-sha256 $HomeTerminalStatusSha256 `
      --home-before-state ($campaignForward+'/home-before-cleanup-state.json') --home-before-state-sha256 $HomeBeforeStateSha256 `
      --home-final-state ($campaignForward+'/home-final-state.json') --home-final-state-sha256 $HomeFinalStateSha256 `
      --home-export ($campaignForward+'/home-export.json') --home-export-sha256 $HomeExportSha256 `
      --home-completion-publication ($campaignForward+'/home-completion-publication.json') --home-completion-publication-sha256 $HomeCompletionPublicationSha256 `
      --home-completion-verification ($campaignForward+'/home-completion-verification.json') --home-completion-verification-sha256 $HomeCompletionVerificationSha256 `
      --review-manifest acceptance-evidence/operator-review-binding/review-manifest.json --review-manifest-sha256 $ReviewManifestSha256 `
      --worksheet acceptance-evidence/candidate-blind-review/review-worksheet.json --worksheet-sha256 $WorksheetSha256 `
      --decisions acceptance-evidence/candidate-blind-review/review-decisions.json --decisions-sha256 $DecisionsSha256 `
      --output acceptance-evidence/operator-review-binding/candidate-eligibility.json
  }else{throw 'r15-stage-validation-phase'}
  $nodeExit=$LASTEXITCODE
  Start-Sleep -Milliseconds 250
  $postgresLog=Join-Path $root 'disposable-postgres.log'
  if(Test-Path -LiteralPath $postgresLog){
    $logItem=Get-Item -LiteralPath $postgresLog -Force
    if($logItem.PSIsContainer-or($logItem.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'r15-stage-validation-postgres-log-type'}
    Remove-Item -LiteralPath $postgresLog -Force
  }
  Assert-ExactStageSet
  Wait-R15WatcherQuiescence -SourceIdentifier $sourceIds -Destination $queuedEvents -QuietMilliseconds 250 -MaximumMilliseconds 5000
  foreach($watcher in $watchers){$watcher.EnableRaisingEvents=$false;$watcher.Dispose()}
  Wait-R15WatcherQuiescence -SourceIdentifier $sourceIds -Destination $queuedEvents -QuietMilliseconds 500 -MaximumMilliseconds 5000
  Assert-ExactStageSet
  Assert-R15RuntimeDurableState
  $runtimeSecurityAfter=Get-R15RuntimeSecurityDigest -Root $root -RelativePaths $runtimeSecurityPaths
  if($runtimeSecurityAfter.Count-ne$runtimeSecurityBefore.Count-or$runtimeSecurityAfter.Sha256-cne$runtimeSecurityBefore.Sha256){
    throw 'r15-stage-runtime-security-drift'
  }
  foreach($event in $queuedEvents){
    if($event.SourceIdentifier.EndsWith('-error')){
      $mutationCount++
      $exception=$event.SourceEventArgs.GetException()
      $type=if($null-ne$exception){$exception.GetType().FullName}else{'unknown'}
      $hresult=if($null-ne$exception){('0x{0:x8}'-f$exception.HResult)}else{'unknown'}
      $watcherErrors.Add(($type+'|'+$hresult))|Out-Null
      continue
    }
    $changedPaths=@($event.SourceEventArgs.FullPath)
    if($event.SourceEventArgs.PSObject.Properties.Name-contains'OldFullPath'){$changedPaths+=@($event.SourceEventArgs.OldFullPath)}
    foreach($changed in $changedPaths){
      if(Test-AllowedExecutionMutation $changed){continue}
      $mutationCount++
      if($mutationSamples.Count-lt32){
        $sample=if([string]::IsNullOrWhiteSpace($changed)){'empty-path'}
          elseif($changed.StartsWith(($root.TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase)){$changed.Substring($root.Length).TrimStart('\').Replace('\','/')}
          else{'outside-stage'}
        $mutationSamples.Add($sample)|Out-Null
      }
    }
  }
}finally{
  foreach($sourceId in $sourceIds){Unregister-Event -SourceIdentifier $sourceId -ErrorAction SilentlyContinue;Remove-Event -SourceIdentifier $sourceId -ErrorAction SilentlyContinue}
  foreach($watcher in $watchers){$watcher.Dispose()}
  foreach($stream in $locks){$stream.Dispose()}
}
if($mutationCount-ne0){
  $diagnostic=[ordered]@{schemaVersion='runaai-m1-r15-stage-mutation-diagnostic/v1';stageId=$StageId;phase=$Phase;
    mutationCount=$mutationCount;samples=@($mutationSamples|Sort-Object);watcherErrors=@($watcherErrors|Sort-Object);
    sampleLimit=32;privateValuesIncluded=$false;productionChanged=$false}
  $diagnosticPath=Join-Path $root 'acceptance-evidence\stage-mutation-diagnostic.json'
  $diagnosticBytes=[Text.UTF8Encoding]::new($false).GetBytes(($diagnostic|ConvertTo-Json -Compress)+"`n")
  $diagnosticStream=New-Object IO.FileStream($diagnosticPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$diagnosticStream.Write($diagnosticBytes,0,$diagnosticBytes.Length);$diagnosticStream.Flush($true)}finally{$diagnosticStream.Dispose()}
  throw ('r15-stage-validation-execution-mutation: count='+$mutationCount+'; samples='+(@($mutationSamples|Sort-Object)-join',')+'; errors='+(@($watcherErrors|Sort-Object)-join','))
}
exit $nodeExit
