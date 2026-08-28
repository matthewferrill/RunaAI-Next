param()
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$root='C:\Users\codex-audit\AppData\Local\RunaM1Readiness\scheduler-probe-20260828-r1'
if($env:COMPUTERNAME-ne'RUNA-HOME'-or$PSScriptRoot-ne$root){throw 'readiness-probe-host'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
if($identity-ne'RUNA-HOME\codex-audit'){throw 'readiness-probe-owner'}
$file=Join-Path $root 'probe.jsonl'
$stream=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try{
 for($i=0;$i-lt7;$i++){
  $value=@{index=$i;time=[DateTime]::UtcNow.ToString('o');pid=$PID;identity=$identity;networkCalled=$false;modelLoaded=$false;passed=($i-eq6)}
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($value|ConvertTo-Json -Compress)+"`n")
  $stream.Write($bytes,0,$bytes.Length);$stream.Flush()
  if($i-lt6){Start-Sleep -Seconds 5}
 }
}finally{$stream.Dispose()}
