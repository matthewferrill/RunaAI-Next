[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$parent='C:\AI\RunaAI-Next-Candidate\staging';$root=Join-Path $parent ('m1-task-native-'+$StageId)
$dependency=Join-Path $parent 'm1-task-native-0b2f2c898d1d437b8a778649d491a7a0'
$release='C:\AI\RunaAI-Next-Candidate\releases\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc'
$sourceCommit='2e81d94b3f362c6d8d2d04bbf6a486a091228af7'
$archiveSha256='b843a2bb088287c703ad777a4572f3577a8026ac567106f4f4984cbcd4959368'
$runtimeSealSha256='89adf8bdcfa2dc4db0c07dd96b4b2c80953d2a5188c18f9cd14f77602493e93d'
$packageLockSha256='2b443060beac09e89779ab2e4b60a22e7bf89e26880f14d0d4cdc04db9d8328e'
$loopbackPipeSha256='54d3027dc79b4325e29a48c2b9372a5d0e8563ff3ebaa2398b7a1b772eb0230e'
if([Security.Principal.WindowsIdentity]::GetCurrent().Name-cne'RUNA-CONTROL\Matthew'-or$PSScriptRoot-cne$root-or
   [IO.Path]::GetDirectoryName($root)-cne$parent){throw 'r15-source-stage-boundary'}
if((Get-FileHash -LiteralPath (Join-Path $root 'source.tar') -Algorithm SHA256).Hash.ToLowerInvariant()-cne$archiveSha256){throw 'r15-source-stage-archive'}
& tar.exe -xf (Join-Path $root 'source.tar') -C $root
if($LASTEXITCODE-ne0){throw 'r15-source-stage-extract'}
$identity=Get-Content -LiteralPath (Join-Path $root 'SOURCE-IDENTITY.json') -Raw|ConvertFrom-Json
$identityKeys=($identity.PSObject.Properties.Name|Sort-Object)-join','
$actualSeal=(Get-FileHash -LiteralPath (Join-Path $root 'runtime-seal.json') -Algorithm SHA256).Hash.ToLowerInvariant()
$seal=Get-Content -LiteralPath (Join-Path $root 'runtime-seal.json') -Raw|ConvertFrom-Json
if($identityKeys-cne'caseBundleSha256,productionChanged,qdrantSha256,schemaVersion,sourceArchiveSha256,sourceCommit'-or
   $identity.sourceCommit-cne$sourceCommit-or$identity.sourceArchiveSha256-cne$archiveSha256-or
   $actualSeal-cne$runtimeSealSha256-or$seal.schemaVersion-cne'runaai-m1-functional-runtime-seal/v11'-or
   $seal.qualificationCriteria.schemaVersion-cne'runaai-m1-r15-qualification-criteria/v1'-or
   $seal.sourceCommit-cne$sourceCommit-or$seal.roles.review.maximumOutputTokens-ne1024-or
   $seal.roles.agent.maximumOutputTokens-ne1536-or
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
[ordered]@{schemaVersion='runaai-m1-r15-source-stage-finalization/v1';finalized=$true;stageId=$StageId;
  sourceCommit=$identity.sourceCommit;runtimeSealSha256=$actualSeal;reviewTokens=$seal.roles.review.maximumOutputTokens;
  agentTokens=$seal.roles.agent.maximumOutputTokens;browserControlReady=$true;syntheticStateCopied=$false;
  productionChanged=$false;privateValuesIncluded=$false}|ConvertTo-Json -Compress
