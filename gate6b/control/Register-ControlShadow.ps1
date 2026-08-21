[CmdletBinding()]
param([string]$Root = 'C:\AI\RunaAI-Next-Candidate',[Parameter(Mandatory)][string]$ReleaseId)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }
if ($ReleaseId -notmatch '^[A-Za-z0-9._-]{1,100}$') { throw 'candidate-release-id-invalid' }
$release = Join-Path $Root "releases\$ReleaseId"; $config = Join-Path $Root 'config\candidate.json'
foreach ($required in @($release,$config,(Join-Path $Root 'config\release.json'),(Join-Path $release 'artifact-files.json'))) { if (-not (Test-Path -LiteralPath $required)) { throw "candidate-required-path-missing:$required" } }
$control = Join-Path $Root 'control'; $javaHome = Get-ChildItem -LiteralPath (Join-Path $Root 'tools\java') -Directory | Select-Object -First 1 -ExpandProperty FullName
$keycloakHome = Join-Path $Root 'tools\keycloak\keycloak-26.7.2'
Set-Content -LiteralPath (Join-Path $control 'Run-Postgresql.ps1') -Encoding utf8 -Value @'
$root='C:\AI\RunaAI-Next-Candidate'
& "$root\tools\postgresql\pgsql\bin\postgres.exe" -D "$root\data\postgresql"
exit $LASTEXITCODE
'@
Set-Content -LiteralPath (Join-Path $control 'Run-Keycloak.ps1') -Encoding utf8 -Value @"
`$root='C:\AI\RunaAI-Next-Candidate'; `$env:JAVA_HOME='$javaHome'; `$env:KC_DB='postgres'; `$env:KC_DB_URL='jdbc:postgresql://127.0.0.1:9765/keycloak_candidate'; `$env:KC_DB_USERNAME='keycloak_candidate'; `$env:KC_DB_PASSWORD=[IO.File]::ReadAllText("`$root\secrets\postgres-keycloak").Trim()
& '$keycloakHome\bin\kc.bat' start --cache=local --http-enabled=true --http-host=127.0.0.1 --http-port=9762 --http-management-host=127.0.0.1 --http-management-port=9766 --hostname=http://127.0.0.1:9762 --hostname-strict=true --health-enabled=true --metrics-enabled=false
exit `$LASTEXITCODE
"@
Set-Content -LiteralPath (Join-Path $control 'Run-Caddy.ps1') -Encoding utf8 -Value @'
$root='C:\AI\RunaAI-Next-Candidate'
& "$root\tools\caddy\caddy.exe" run --config "$root\config\Caddyfile" --adapter caddyfile
exit $LASTEXITCODE
'@
Set-Content -LiteralPath (Join-Path $control 'Run-Application.ps1') -Encoding utf8 -Value @"
`$root='C:\AI\RunaAI-Next-Candidate'
& '$release\runtime\node.exe' '$release\gate6b\server.mjs' --config '$config' 1>> "`$root\logs\application.stdout.log" 2>> "`$root\logs\application.stderr.log"
exit `$LASTEXITCODE
"@
$taskPath = '\RunaAI-Next\'
if (@(Get-ScheduledTask -TaskPath $taskPath -ErrorAction SilentlyContinue).Count -ne 0) { throw 'candidate-tasks-already-registered' }
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$systemPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$postgresPrincipal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\LOCAL SERVICE' -LogonType ServiceAccount -RunLevel Limited
$trigger = New-ScheduledTaskTrigger -AtStartup
foreach ($name in @('Postgresql','OpenFga','Keycloak','Caddy','Application')) {
  $script = Join-Path $control "Run-$name.ps1"; $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$script`""
  if ($name -eq 'Postgresql') { Register-ScheduledTask -TaskPath $taskPath -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $postgresPrincipal | Out-Null }
  else { Register-ScheduledTask -TaskPath $taskPath -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $systemPrincipal | Out-Null }
}
$firewallName = 'RunaAI Next Candidate TLS'
if (-not (Get-NetFirewallRule -DisplayName $firewallName -ErrorAction SilentlyContinue)) { New-NetFirewallRule -DisplayName $firewallName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 9761 -Profile Private -RemoteAddress LocalSubnet | Out-Null }
Start-ScheduledTask -TaskPath $taskPath -TaskName 'Postgresql'
$deadline=[DateTime]::UtcNow.AddSeconds(60); do { Start-Sleep -Milliseconds 500; $pg=Get-NetTCPConnection -State Listen -LocalPort 9765 -ErrorAction SilentlyContinue } until ($pg -or [DateTime]::UtcNow -gt $deadline)
if (-not $pg) { throw 'candidate-postgresql-task-start-failed' }
foreach ($name in @('OpenFga','Keycloak','Caddy')) { Start-ScheduledTask -TaskPath $taskPath -TaskName $name }
$deadline=[DateTime]::UtcNow.AddMinutes(3); do { Start-Sleep -Seconds 1; $ports=@(9761,9762,9763,9764,9770 | Where-Object { Get-NetTCPConnection -State Listen -LocalPort $_ -ErrorAction SilentlyContinue }) } until ($ports.Count -eq 5 -or [DateTime]::UtcNow -gt $deadline)
if ($ports.Count -ne 5) { throw 'candidate-dependency-task-start-failed' }
Start-ScheduledTask -TaskPath $taskPath -TaskName 'Application'
$deadline=[DateTime]::UtcNow.AddMinutes(10); do { Start-Sleep -Seconds 1; try { $live=(Invoke-RestMethod -Uri 'http://127.0.0.1:9760/health/live' -TimeoutSec 3).live -eq $true } catch { $live=$false } } until ($live -or [DateTime]::UtcNow -gt $deadline)
if (-not $live) { throw 'candidate-application-task-start-failed' }
[ordered]@{ schemaVersion='runa2-gate6b-control-register/v1'; registered=$true; releaseId=$ReleaseId; taskCount=@(Get-ScheduledTask -TaskPath $taskPath).Count; applicationLive=$live; shadow=$true; protectedDataImported=$false; ownerCredentialEnrolled=$false; productionTrafficChanged=$false; privateValuesIncluded=$false } | ConvertTo-Json -Compress
