[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$parent='C:\AI\RunaAI-Next-Candidate\staging';$root=Join-Path $parent ('m1-task-native-'+$StageId)
$dependency=Join-Path $parent 'm1-task-native-0b2f2c898d1d437b8a778649d491a7a0'
$release='C:\AI\RunaAI-Next-Candidate\releases\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc'
$sourceCommit='ecddd363e8ece8dcd7597d89394c12a90596f16c'
$archiveSha256='84bd17325c7d4fc971034a994ddb7d5584f25ac4c054d39a791a0985acf7621e'
$runtimeSealSha256='48951539bbef9bc6ab43382c207599e4ead398a0facc128acd201f0be3a600ec'
$hardwarePlanSha256='d47db8e88da17831b45987b1ad4130f74ddaa249dc28dfbccd936c8f8d8247c1'
$manifestSha256='be280fd7646a323d90d890e8117c213af1fa394a30ef4f9c15d5e54176c60764'
$identitySha256='da19050ad38a5bf5a8835d597f6180b5f853789e659d6fb4867518e1e0996ad2'
$controlRegressionInputSha256='fa704fd499da7b646879004edc29aada63f580214e6974ac34c2d563397c9787'
$validatorSha256='91af979b6c9124531b5ebf8378af2c64a90ee3cd886d79a0a5303bccc4d5e9d5'
$nodeSha256='bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb'
$packageLockSha256='2b443060beac09e89779ab2e4b60a22e7bf89e26880f14d0d4cdc04db9d8328e'
$loopbackPipeSha256='54d3027dc79b4325e29a48c2b9372a5d0e8563ff3ebaa2398b7a1b772eb0230e'
function Get-ByteSha256([byte[]]$Bytes){
  $sha=[Security.Cryptography.SHA256]::Create()
  try{([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
}
if([Security.Principal.WindowsIdentity]::GetCurrent().Name-cne'RUNA-CONTROL\Matthew'-or$PSScriptRoot-cne$root-or
   [IO.Path]::GetDirectoryName($root)-cne$parent){throw 'r15-source-stage-boundary'}
$expectedPreExtract=@('CONTROL-REGRESSION-INPUT.json','Finalize-SourceStage.ps1','m1-browser-loopback-pipe.cjs',
  'runtime-seal.json','campaign-hardware-plan.json','source.tar','SOURCE-IDENTITY.json','SOURCE-TREE-MANIFEST.json','Validate-Stage.ps1')
$preExtract=@(Get-ChildItem -LiteralPath $root -Force)
if((($preExtract.Name|Sort-Object)-join',')-cne(($expectedPreExtract|Sort-Object)-join',')){throw 'r15-source-stage-preextract-set'}
foreach($item in $preExtract){if(($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0-or$item.PSIsContainer){throw 'r15-source-stage-preextract-type'}}
$validator=Join-Path $root 'Validate-Stage.ps1'
if((Get-FileHash -LiteralPath $validator -Algorithm SHA256).Hash.ToLowerInvariant()-cne$validatorSha256){throw 'r15-source-stage-validator'}
$archivePath=Join-Path $root 'source.tar';$archiveBytes=[IO.File]::ReadAllBytes($archivePath)
if((Get-ByteSha256 $archiveBytes)-cne$archiveSha256){throw 'r15-source-stage-archive'}
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName='tar.exe';$start.Arguments="-xf - -C `"$root`"";$start.UseShellExecute=$false
$start.RedirectStandardInput=$true;$start.RedirectStandardError=$true;$start.CreateNoWindow=$true
$process=New-Object Diagnostics.Process;$process.StartInfo=$start
try{
  if(-not$process.Start()){throw 'r15-source-stage-extract-start'}
  $process.StandardInput.BaseStream.Write($archiveBytes,0,$archiveBytes.Length);$process.StandardInput.Close()
  $extractError=$process.StandardError.ReadToEnd();$process.WaitForExit()
  if($process.ExitCode-ne0){throw ('r15-source-stage-extract: '+$extractError)}
}finally{$process.Dispose()}
$identity=Get-Content -LiteralPath (Join-Path $root 'SOURCE-IDENTITY.json') -Raw|ConvertFrom-Json
$identityKeys=($identity.PSObject.Properties.Name|Sort-Object)-join','
$actualSeal=(Get-FileHash -LiteralPath (Join-Path $root 'runtime-seal.json') -Algorithm SHA256).Hash.ToLowerInvariant()
$seal=Get-Content -LiteralPath (Join-Path $root 'runtime-seal.json') -Raw|ConvertFrom-Json
$hardwarePlanPath=Join-Path $root 'campaign-hardware-plan.json'
$actualHardwarePlan=(Get-FileHash -LiteralPath $hardwarePlanPath -Algorithm SHA256).Hash.ToLowerInvariant()
$hardwarePlan=Get-Content -LiteralPath $hardwarePlanPath -Raw|ConvertFrom-Json
if($identityKeys-cne'caseBundleSha256,productionChanged,qdrantSha256,schemaVersion,sourceArchiveSha256,sourceCommit'-or
   $identity.sourceCommit-cne$sourceCommit-or$identity.sourceArchiveSha256-cne$archiveSha256-or
   $actualSeal-cne$runtimeSealSha256-or$seal.schemaVersion-cne'runaai-m1-functional-runtime-seal/v11'-or
   $seal.qualificationCriteria.schemaVersion-cne'runaai-m1-r15-qualification-criteria/v1'-or
   $seal.sourceCommit-cne$sourceCommit-or$seal.roles.review.maximumOutputTokens-ne1024-or
   $seal.roles.agent.maximumOutputTokens-ne1536-or
   $actualHardwarePlan-cne$hardwarePlanSha256-or$seal.residency.telemetryPolicySha256-cne$hardwarePlanSha256-or
   $hardwarePlan.schemaVersion-cne'runa-m1-campaign-hardware-plan/v2'-or
   $hardwarePlan.sourceCommit-cne$sourceCommit-or
   $hardwarePlan.classification-cne'prospective-r15-hardware-only-not-functional-qualification'-or
   $hardwarePlan.createdBeforeLoads-cne$true-or$hardwarePlan.productionRoutingChanged-cne$false-or
   $hardwarePlan.protectedDataIncluded-cne$false-or
   (Get-FileHash -LiteralPath (Join-Path $root 'package-lock.json') -Algorithm SHA256).Hash.ToLowerInvariant()-cne$packageLockSha256){throw 'r15-source-stage-identity'}
$loopbackPipe=Join-Path $root 'm1-browser-loopback-pipe.cjs'
if(-not(Test-Path -LiteralPath $loopbackPipe -PathType Leaf)-or
   (Get-FileHash -LiteralPath $loopbackPipe -Algorithm SHA256).Hash.ToLowerInvariant()-cne$loopbackPipeSha256){throw 'r15-source-stage-loopback-pipe'}
$modules=Join-Path $root 'node_modules';$moduleSource=Join-Path $release 'node_modules'
if((Test-Path -LiteralPath $modules)-or-not(Test-Path -LiteralPath $moduleSource -PathType Container)){throw 'r15-source-stage-modules'}
New-Item -ItemType Junction -Path $modules -Target $moduleSource|Out-Null
$toolSource=Join-Path $dependency 'tools';$toolTarget=Join-Path $root 'tools'
if(-not(Test-Path -LiteralPath $toolSource -PathType Container)-or-not(Test-Path -LiteralPath $toolTarget -PathType Container)){throw 'r15-source-stage-tools'}
$toolChildren=@(Get-ChildItem -LiteralPath $toolSource -Force)
if($toolChildren.Count-ne1-or$toolChildren[0].Name-cne'qdrant'-or-not$toolChildren[0].PSIsContainer-or
   (Test-Path -LiteralPath (Join-Path $toolTarget 'qdrant'))){throw 'r15-source-stage-tools'}
Copy-Item -LiteralPath $toolChildren[0].FullName -Destination (Join-Path $toolTarget 'qdrant') -Recurse
$evidence=[IO.Directory]::CreateDirectory((Join-Path $root 'acceptance-evidence'))
foreach($helperName in @('Write-BrowserAck.Remote.ps1','Publish-BrowserWitnessAndAck.Remote.ps1')){
  $helper=Join-Path $root ('gate7f\function-first\acceptance\'+$helperName);$target=Join-Path $evidence.FullName $helperName
  if(-not(Test-Path -LiteralPath $helper -PathType Leaf)-or(Test-Path -LiteralPath $target)){throw 'r15-source-stage-browser-helper'}
  Copy-Item -LiteralPath $helper -Destination $target
}
$validationRaw=& $validator -StageId $StageId -Phase Finalize
$validation=$validationRaw|Select-Object -Last 1|ConvertFrom-Json
if($validation.schemaVersion-cne'runaai-m1-r15-stage-validation/v2'-or$validation.verifiedSourceFiles-ne2464-or
   $validation.runtimeManifestSha256-notmatch'^[a-f0-9]{64}$'-or$validation.runtimeFiles-lt5-or
   $validation.runtimeSecuritySha256-notmatch'^[a-f0-9]{64}$'-or$validation.runtimeSecurityEntries-lt5-or
   $validation.runtimeSecurityNormalized-cne$true-or$validation.modelsInvoked-cne$false){throw 'r15-source-stage-validation'}
$receipt=[ordered]@{schemaVersion='runaai-m1-r15-source-stage-finalization/v4';finalized=$true;stageId=$StageId;
  sourceCommit=$identity.sourceCommit;archiveSha256=$archiveSha256;runtimeSealSha256=$actualSeal;
  hardwarePlanSha256=$actualHardwarePlan;manifestSha256=$manifestSha256;identitySha256=$identitySha256;
  controlRegressionInputSha256=$controlRegressionInputSha256;loopbackPipeSha256=$loopbackPipeSha256;nodeSha256=$nodeSha256;
  validatorSha256=$validatorSha256;runtimeManifestSha256=$validation.runtimeManifestSha256;runtimeFiles=$validation.runtimeFiles;
  runtimeSecuritySha256=$validation.runtimeSecuritySha256;runtimeSecurityEntries=$validation.runtimeSecurityEntries;
  runtimeSecurityNormalized=$true;
  agentTokens=$seal.roles.agent.maximumOutputTokens;
  browserControlReady=$true;syntheticStateCopied=$false;productionChanged=$false;privateValuesIncluded=$false}
$receiptBytes=[Text.UTF8Encoding]::new($false).GetBytes(($receipt|ConvertTo-Json -Compress)+"`n")
$receiptPath=Join-Path $root 'SOURCE-STAGE-FINALIZATION.json'
$stream=New-Object IO.FileStream($receiptPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$stream.Write($receiptBytes,0,$receiptBytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
[ordered]@{schemaVersion='runaai-m1-r15-source-stage-finalization-result/v1';receipt=$receipt;
  finalizationSha256=(Get-ByteSha256 $receiptBytes)}|ConvertTo-Json -Depth 5 -Compress
