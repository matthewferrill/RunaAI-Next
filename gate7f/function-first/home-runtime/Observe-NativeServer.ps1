# Read-only native internal-API identity and HTTP listener metadata. No CLI invocation or store data.
. (Join-Path $PSScriptRoot 'Settings-FileTransaction.ps1')
if($env:COMPUTERNAME-cne'RUNA-HOME'){throw 'settings-observe-host'}
$descriptor='C:\Users\Matthew\.lmstudio\.internal\http-server.json'
$raw=Read-SettingsBytes $descriptor;$value=[Text.UTF8Encoding]::new($false,$true).GetString($raw)|ConvertFrom-Json
if($value.port-isnot[int]-or$value.port-lt1-or$value.port-gt65535-or$value.port-eq1234){throw 'settings-internal-api-port'}
$internal=@(Get-NetTCPConnection -State Listen -LocalPort $value.port -ErrorAction SilentlyContinue)
if($internal.Count-lt1-or$internal.Count-gt2){throw 'settings-internal-api-listener'}
$ids=@($internal|ForEach-Object{$_.OwningProcess}|Select-Object -Unique)
if($ids.Count-ne1){throw 'settings-internal-api-owner'}
foreach($item in $internal){if(@('127.0.0.1','::1')-cnotcontains$item.LocalAddress){throw 'settings-internal-api-not-loopback'}}
$identity=Get-RuntimeIdentity ([int]$ids[0])
if($null-eq$identity-or$identity.executable-cne'C:\Users\Matthew\AppData\Local\Programs\LM Studio\LM Studio.exe'){throw 'settings-internal-api-engine'}
$native=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$identity.pid) -OperationTimeoutSec 5
$owner=Invoke-CimMethod -InputObject $native -MethodName GetOwner -OperationTimeoutSec 5
if($owner.Domain-cne'RUNA-HOME'-or$owner.User-cne'Matthew'){throw 'settings-internal-api-principal'}
$http=@(Get-NetTCPConnection -LocalPort 1234 -ErrorAction SilentlyContinue)
$listeners=@($http|Where-Object{$_.State-eq'Listen'})
foreach($listener in $listeners){if($listener.OwningProcess-ne$identity.pid){throw 'settings-http-foreign-owner'}}
@{schemaVersion='runaai-native-server-observation/v1';observedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();
 descriptorSha256=(Settings-Hash $raw);internalPort=$value.port;engine=$identity;
 http=@{addresses=@($listeners|ForEach-Object{$_.LocalAddress});established=@($http|Where-Object{$_.State-eq'Established'}).Count};
 privateValuesIncluded=$false}|ConvertTo-Json -Depth 6 -Compress
