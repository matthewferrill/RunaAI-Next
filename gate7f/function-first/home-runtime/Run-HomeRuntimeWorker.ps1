param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedSeal)
. (Join-Path $PSScriptRoot 'Runtime-Windows.ps1')
if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value-cne'S-1-5-19'){throw 'runtime-worker-principal'}
[void](Assert-RuntimeInstallation $ExpectedSeal)
$active=Read-RuntimeJson ($script:RuntimeRoot+'\active-session.json')
if($active.installationSha256-cne$ExpectedSeal){throw 'runtime-active-binding'}
$paths=Runtime-SessionPaths $active.sessionId
$process=$null;$identity=$null;$code=1
try{
  $arguments='"'+$script:RuntimeRoot+'\code\home-runtime\runtime-main.mjs" worker '+$ExpectedSeal+' '+$active.sessionId
  $process=Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput ($paths.worker+'\stdout.txt') -RedirectStandardError ($paths.worker+'\stderr.txt')
  [void]$process.Handle;$identity=Get-RuntimeIdentity $process.Id
  Write-RuntimeJson ($paths.worker+'\process.json') $identity
  $process.WaitForExit();$code=$process.ExitCode
}finally{
  if($null-ne$identity-and-not(Test-RuntimeStopped $identity)){Stop-RuntimeProcess $identity}
  if($null-ne$process){$process.Dispose()}
}
exit $code
