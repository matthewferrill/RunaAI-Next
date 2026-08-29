[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$OwnedRoot,
  [Parameter(Mandatory)][string]$ManifestPath,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedManifestSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$terminalCode=125
function Stop-ExactTree([Diagnostics.Process]$target){
  try{if($target.HasExited){return $true}}catch{return $false}
  $stopInfo=New-Object Diagnostics.ProcessStartInfo
  $stopInfo.FileName=Join-Path $env:SystemRoot 'System32\taskkill.exe'
  $stopInfo.Arguments='/PID '+[string]$target.Id+' /T /F'
  $stopInfo.UseShellExecute=$false
  $stopInfo.CreateNoWindow=$true
  $stopInfo.RedirectStandardInput=$false
  $stopInfo.RedirectStandardOutput=$false
  $stopInfo.RedirectStandardError=$false
  $stopInfo.EnvironmentVariables.Clear()
  foreach($name in @('SystemRoot','WINDIR','ComSpec','PATH','PATHEXT')){$value=[Environment]::GetEnvironmentVariable($name,'Process');if($null-ne$value){$stopInfo.EnvironmentVariables[$name]=$value}}
  $stop=New-Object Diagnostics.Process
  $stop.StartInfo=$stopInfo
  $started=$false
  try{
    if(-not$stop.Start()){return $false}
    $started=$true
    $stopWatch=[Diagnostics.Stopwatch]::StartNew()
    while(-not$stop.HasExited-and$stopWatch.ElapsedMilliseconds-lt10000){[Threading.Thread]::Sleep(50)}
    return $stop.HasExited-and$stop.ExitCode-eq0
  }catch{return $false}
  finally{
    if($started){try{if(-not$stop.HasExited){$stop.Kill()}}catch{}}
    try{$stop.Dispose()}catch{}
  }
}
try{
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
if($arguments.Where({$_-match'["\s]'}).Count-ne0){throw'm1-control-regression-argument-character'}
$safeNames=@('SystemRoot','WINDIR','ComSpec','PATH','PATHEXT','PSModulePath','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','TEMP','TMP')
$startInfo=New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName=$node
$startInfo.Arguments=($arguments -join ' ')
$startInfo.WorkingDirectory=$root
$startInfo.UseShellExecute=$false
$startInfo.CreateNoWindow=$true
$startInfo.RedirectStandardInput=$false
$startInfo.RedirectStandardOutput=$false
$startInfo.RedirectStandardError=$false
$startInfo.EnvironmentVariables.Clear()
foreach($name in $safeNames){$value=[Environment]::GetEnvironmentVariable($name,'Process');if($null-ne$value){$startInfo.EnvironmentVariables[$name]=$value}}
$startInfo.EnvironmentVariables['SystemDrive']='C:'
$startInfo.EnvironmentVariables['OS']='Windows_NT'
$child=New-Object System.Diagnostics.Process
$child.StartInfo=$startInfo
$childStarted=$false
try{
  if(-not$child.Start()){throw'm1-control-regression-owner-start'}
  $childStarted=$true
  $watch=[Diagnostics.Stopwatch]::StartNew()
  while(-not$child.HasExited-and$watch.ElapsedMilliseconds-lt1050000){[Threading.Thread]::Sleep(100)}
  if(-not$child.HasExited){
    if(-not(Stop-ExactTree $child)){throw'm1-control-regression-owner-stop-unconfirmed'}
    $terminalCode=124
  }else{
    $terminalCode=$child.ExitCode
  }
}finally{
  if($childStarted){
    try{if(-not$child.HasExited-and-not(Stop-ExactTree $child)){$terminalCode=125}}catch{$terminalCode=125}
  }
  try{$child.Dispose()}catch{}
}
}catch{
  $terminalCode=125
}finally{
  [Environment]::Exit($terminalCode)
}
