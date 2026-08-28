[CmdletBinding()]
param([Parameter(Mandatory)][string]$RequestPath)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$request=Get-Content -LiteralPath $RequestPath -Raw | ConvertFrom-Json
$root=[IO.Path]::GetFullPath([string]$request.allowedRoot)
$target=[IO.Path]::GetFullPath([string]$request.target)
if($target -ne (Join-Path $root 'Caddyfile') -or [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($RequestPath)) -ne $root){throw 'quiescence-file-target-invalid'}
foreach($p in @($root,$target,$RequestPath)){if((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'quiescence-file-reparse'}}
if([string]$request.expectedSha256 -notmatch '^[a-f0-9]{64}$'){throw 'quiescence-file-sha-invalid'}
$next=[Convert]::FromBase64String([string]$request.nextBase64)
if($next.Length -gt 1048576){throw 'quiescence-file-cap'}
$sha=[Security.Cryptography.SHA256]::Create()
$stream=$null
try{
  # Deny every other writer/deleter for the read/compare/write/flush interval.
  # Reads remain allowed; a crash during a write is an unknown outcome, not a pass.
  $stream=[IO.File]::Open($target,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::Read)
  if($stream.Length -gt 1048576){throw 'quiescence-file-cap'}
  $before=New-Object byte[] ([int]$stream.Length)
  $offset=0
  while($offset -lt $before.Length){$n=$stream.Read($before,$offset,$before.Length-$offset);if($n -le 0){throw 'quiescence-file-read'};$offset+=$n}
  $beforeSha=([BitConverter]::ToString($sha.ComputeHash($before))).Replace('-','').ToLowerInvariant()
  if($beforeSha -ne [string]$request.expectedSha256){throw 'quiescence-file-cas-drift'}
  $stream.Position=0
  $stream.Write($next,0,$next.Length)
  $stream.SetLength($next.Length)
  $stream.Flush($true)
  $nextSha=([BitConverter]::ToString($sha.ComputeHash($next))).Replace('-','').ToLowerInvariant()
  [ordered]@{schemaVersion='runaai-caddy-file-cas/v1';beforeSha256=$beforeSha;afterSha256=$nextSha;exclusiveWriteLease=$true}|ConvertTo-Json -Compress
}finally{if($null -ne $stream){$stream.Dispose()};$sha.Dispose()}
