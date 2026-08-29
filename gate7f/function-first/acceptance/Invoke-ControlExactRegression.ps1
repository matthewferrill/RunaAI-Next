[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$OwnedRoot,
  [Parameter(Mandatory)][string]$ManifestPath,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedManifestSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$fixedParent='C:\AI\RunaAI-Next-Candidate\staging'
$fixedRelease='C:\AI\RunaAI-Next-Candidate\releases\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc'
$fixedNodeSha='bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb'
$root=[IO.Path]::GetFullPath($OwnedRoot)
if([IO.Path]::GetDirectoryName($root)-cne$fixedParent-or[IO.Path]::GetFileName($root)-cnotmatch'^m1-task-native-[a-f0-9]{32}$'){throw'm1-control-regression-owned-root'}
if([Security.Principal.WindowsIdentity]::GetCurrent().Name-cne'RUNA-CONTROL\Matthew'){throw'm1-control-regression-owner'}
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
if($repo-cne$root){throw'm1-control-regression-source-root'}
$manifest=[IO.Path]::GetFullPath($ManifestPath)
if($manifest-cne(Join-Path $root 'CONTROL-REGRESSION-INPUT.json')){throw'm1-control-regression-manifest-path'}
if(-not(Test-Path -LiteralPath $manifest -PathType Leaf)-or(Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash.ToLowerInvariant()-cne$ExpectedManifestSha256){throw'm1-control-regression-manifest-pin'}
$input=Get-Content -LiteralPath $manifest -Raw|ConvertFrom-Json
if($input.schemaVersion-cne'runaai-m1-control-regression-input/v1'-or$input.execution.maximumMs-ne900000){throw'm1-control-regression-manifest-schema'}
$node=Join-Path $fixedRelease 'runtime\node.exe'
if(-not(Test-Path -LiteralPath $node -PathType Leaf)-or(Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant()-cne$fixedNodeSha){throw'm1-control-regression-node-pin'}
$core=Join-Path $root 'gate7f\function-first\acceptance\control-exact-regression.mjs'
if(-not(Test-Path -LiteralPath $core -PathType Leaf)){throw'm1-control-regression-core'}
$supervisor=Join-Path $root 'gate7f\function-first\acceptance\control-exact-regression-owner.mjs'
if(-not(Test-Path -LiteralPath $supervisor -PathType Leaf)){throw'm1-control-regression-owner-supervisor'}
$arguments=@($supervisor,'--owned-root',$root,'--manifest',$manifest,'--manifest-sha256',$ExpectedManifestSha256)
if($arguments.Where({$_-match'"'}).Count-ne0){throw'm1-control-regression-argument-character'}
$originalEnvironment=[Environment]::GetEnvironmentVariables('Process')
$safeNames=@('SystemRoot','WINDIR','ComSpec','PATH','PATHEXT','PSModulePath','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','TEMP','TMP')
$safeEnvironment=@{}
foreach($name in $safeNames){$value=[Environment]::GetEnvironmentVariable($name,'Process');if($null-ne$value){$safeEnvironment[$name]=$value}}
try{
  foreach($name in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$name,$null,'Process')}
  foreach($entry in $safeEnvironment.GetEnumerator()){[Environment]::SetEnvironmentVariable([string]$entry.Key,[string]$entry.Value,'Process')}
  $child=Start-Process -FilePath $node -ArgumentList $arguments -Wait -PassThru -NoNewWindow
  $childExitCode=$child.ExitCode
}finally{
  foreach($name in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$name,$null,'Process')}
  foreach($entry in $originalEnvironment.GetEnumerator()){[Environment]::SetEnvironmentVariable([string]$entry.Key,[string]$entry.Value,'Process')}
}
if($childExitCode-ne0){exit $childExitCode}
