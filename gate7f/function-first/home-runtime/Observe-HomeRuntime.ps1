[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($env:COMPUTERNAME-ne'RUNA-HOME'){throw 'runtime-observation-host'}
$listeners=@(Get-NetTCPConnection -State Listen|Where-Object{$_.LocalPort-eq1234})
if($listeners.Count-ne1-or$listeners[0].LocalAddress-ne'127.0.0.1'){throw 'runtime-engine-binding'}
$process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listeners[0].OwningProcess)
$expected='C:\Users\Matthew\AppData\Local\Programs\LM Studio\LM Studio.exe'
if($null-eq$process-or$process.ExecutablePath-cne$expected){throw 'runtime-engine-executable'}
$owner=Invoke-CimMethod -InputObject $process -MethodName GetOwner
if($owner.ReturnValue-ne0-or$owner.Domain-ne'RUNA-HOME'-or$owner.User-ne'Matthew'){throw 'runtime-engine-owner'}
$identity=[string]$process.ProcessId+':'+$process.CreationDate.ToUniversalTime().ToString('o')+':'+$expected
[ordered]@{engineIdentity=$identity;observedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();readOnly=$true}|ConvertTo-Json -Compress
