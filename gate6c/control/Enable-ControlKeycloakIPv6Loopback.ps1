[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($env:COMPUTERNAME-ne 'RUNA-CONTROL'){throw 'keycloak-loopback-host-invalid'}
if(-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'keycloak-loopback-admin-required'}

$listenAddress='::1';$listenPort=9762;$connectAddress='127.0.0.1';$connectPort=9762
$ipv4=@(Get-NetTCPConnection -State Listen -LocalAddress $connectAddress -LocalPort $connectPort -ErrorAction SilentlyContinue)
$ipv6=@(Get-NetTCPConnection -State Listen -LocalAddress $listenAddress -LocalPort $listenPort -ErrorAction SilentlyContinue)
if($ipv4.Count-ne 1 -or $ipv6.Count-ne 0){throw 'keycloak-loopback-listener-state-invalid'}
if((Get-Service -Name iphlpsvc).Status-ne 'Running'){throw 'keycloak-loopback-ip-helper-unavailable'}
$before=(& netsh.exe interface portproxy show v6tov4) -join "`n"
if($before-match '(?m)^\s*::1\s+9762\s+'){throw 'keycloak-loopback-portproxy-already-exists'}

$added=$false
try{
  & netsh.exe interface portproxy add v6tov4 listenaddress=$listenAddress listenport=$listenPort connectaddress=$connectAddress connectport=$connectPort protocol=tcp | Out-Null
  if($LASTEXITCODE-ne 0){throw 'keycloak-loopback-portproxy-add-failed'}
  $added=$true
  $deadline=[DateTime]::UtcNow.AddSeconds(20);$status='000'
  do{Start-Sleep -Milliseconds 500;$status=& curl.exe -6 -s -o NUL -w '%{http_code}' --connect-timeout 2 'http://localhost:9762/realms/runaai-next/.well-known/openid-configuration'}until($status-eq '200' -or [DateTime]::UtcNow-gt $deadline)
  if($status-ne '200'){throw 'keycloak-loopback-ipv6-verification-failed'}
  $after=(& netsh.exe interface portproxy show v6tov4) -join "`n"
  if($after-notmatch '(?m)^\s*::1\s+9762\s+127\.0\.0\.1\s+9762\s*$'){throw 'keycloak-loopback-portproxy-verification-failed'}
  $listeners=@(Get-NetTCPConnection -State Listen -LocalPort 9762 -ErrorAction SilentlyContinue)
  if(@($listeners|Where-Object{$_.LocalAddress-eq '::1'}).Count-ne 1 -or
     @($listeners|Where-Object{$_.LocalAddress-eq '127.0.0.1'}).Count-ne 1){throw 'keycloak-loopback-dual-listener-invalid'}
  [ordered]@{schemaVersion='runa2-gate6c-keycloak-ipv6-loopback/v1';enabled=$true;
    ipv4Loopback=$true;ipv6Loopback=$true;lanListenerAdded=$false;keycloakRestarted=$false;
    legacyModified=$false;protectedDataImported=$false;productionTrafficChanged=$false;
    rollbackCommandRetained=$true;privateValuesIncluded=$false}|ConvertTo-Json -Compress
} catch {
  if($added){& netsh.exe interface portproxy delete v6tov4 listenaddress=$listenAddress listenport=$listenPort protocol=tcp|Out-Null}
  throw
}
