[CmdletBinding()]
param(
  [string]$Root = 'C:\AI\RunaAI-Next-Candidate',
  [Parameter(Mandatory)][string]$Staging,
  [Parameter(Mandatory)][string]$PrivateAddress,
  [string]$ProviderAddress = '192.168.50.165',
  [string]$ModelId = 'qwen3-coder-30b-a3b-instruct'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }
if ($PrivateAddress -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)') { throw 'candidate-private-address-invalid' }
if (-not (Test-Path -LiteralPath $Staging -PathType Container)) { throw 'candidate-staging-missing' }

$paths = [ordered]@{
  Tools = Join-Path $Root 'tools'; Data = Join-Path $Root 'data'; Config = Join-Path $Root 'config'
  Secrets = Join-Path $Root 'secrets'; Logs = Join-Path $Root 'logs'; Backups = Join-Path $Root 'backups'
  Releases = Join-Path $Root 'releases'; Control = Join-Path $Root 'control'
}
New-Item -ItemType Directory -Path $Root -Force | Out-Null
foreach ($path in $paths.Values) { New-Item -ItemType Directory -Path $path -Force | Out-Null }
$marker = Join-Path $Root 'GATE6B-SHADOW-CANDIDATE'
if (-not (Test-Path -LiteralPath $marker)) { Set-Content -LiteralPath $marker -Value 'runa2-gate6b-control-shadow/v1' -Encoding ascii -NoNewline }

function Expand-Once([string]$Archive, [string]$Destination) {
  if (Test-Path -LiteralPath $Destination) { return }
  New-Item -ItemType Directory -Path $Destination | Out-Null
  Expand-Archive -LiteralPath (Join-Path $Staging $Archive) -DestinationPath $Destination
}
Expand-Once 'postgresql-18.6-1-windows-x64-binaries.zip' (Join-Path $paths.Tools 'postgresql')
Expand-Once 'keycloak-26.7.2.zip' (Join-Path $paths.Tools 'keycloak')
Expand-Once 'caddy_2.11.4_windows_amd64.zip' (Join-Path $paths.Tools 'caddy')
Expand-Once 'OpenJDK21U-jre_x64_windows_hotspot_21.0.12_8.zip' (Join-Path $paths.Tools 'java')
$openFgaRoot = Join-Path $paths.Tools 'openfga'
if (-not (Test-Path -LiteralPath (Join-Path $openFgaRoot 'openfga.exe'))) {
  New-Item -ItemType Directory -Path $openFgaRoot -Force | Out-Null
  & tar.exe -xf (Join-Path $Staging 'openfga_1.18.3_windows_amd64.tar.gz') -C $openFgaRoot
  if ($LASTEXITCODE -ne 0) { throw 'candidate-openfga-extract-failed' }
}

$aclIdentity = "$env:COMPUTERNAME\$env:USERNAME"
& icacls.exe $paths.Secrets '/inheritance:r' '/grant:r' "SYSTEM:(OI)(CI)F" "$aclIdentity`:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'candidate-secret-acl-failed' }
function New-Secret([string]$Name, [int]$Bytes = 32) {
  $path = Join-Path $paths.Secrets $Name
  if (-not (Test-Path -LiteralPath $path)) {
    $buffer = New-Object byte[] $Bytes
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
    $value = [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+','-').Replace('/','_')
    [IO.File]::WriteAllText($path, $value, [Text.Encoding]::ASCII)
  }
  return [IO.File]::ReadAllText($path, [Text.Encoding]::ASCII).Trim()
}
$postgresAdmin = New-Secret 'postgres-admin'; $postgresRuna = New-Secret 'postgres-runa'
$postgresKeycloak = New-Secret 'postgres-keycloak'; $postgresOpenFga = New-Secret 'postgres-openfga'
$keycloakBootstrap = New-Secret 'keycloak-bootstrap'; $keycloakClient = New-Secret 'keycloak-client'
$openFgaToken = New-Secret 'openfga-token'
foreach ($name in @('core-encryption','core-hmac','learning-encryption','learning-hmac','telemetry-hmac')) { [void](New-Secret $name) }
[IO.File]::WriteAllText((Join-Path $paths.Secrets 'database-url'),
  "postgresql://runa_candidate:$postgresRuna@127.0.0.1:9765/runaai_next?sslmode=disable", [Text.Encoding]::ASCII)

$pgRoot = Join-Path $paths.Tools 'postgresql\pgsql'; $pgBin = Join-Path $pgRoot 'bin'
$pgData = Join-Path $paths.Data 'postgresql'
if (-not (Test-Path -LiteralPath (Join-Path $pgData 'PG_VERSION'))) {
  $pwFile = Join-Path $paths.Secrets 'postgres-admin'
  & (Join-Path $pgBin 'initdb.exe') -D $pgData -U postgres --pwfile=$pwFile --auth-local=scram-sha-256 --auth-host=scram-sha-256 --encoding=UTF8
  if ($LASTEXITCODE -ne 0) { throw 'candidate-postgres-init-failed' }
  Add-Content -LiteralPath (Join-Path $pgData 'postgresql.conf') -Encoding ascii -Value @"
listen_addresses = '127.0.0.1'
port = 9765
password_encryption = 'scram-sha-256'
logging_collector = on
log_directory = '$($paths.Logs.Replace('\','/'))'
log_filename = 'postgresql-%Y-%m-%d.log'
"@
}
$env:PGPASSWORD = $postgresAdmin
$runPostgres = Join-Path $paths.Control 'Run-Postgresql.ps1'
Set-Content -LiteralPath $runPostgres -Encoding utf8 -Value @'
$ErrorActionPreference = 'Stop'
$root = 'C:\AI\RunaAI-Next-Candidate'
& "$root\tools\postgresql\pgsql\bin\postgres.exe" -D "$root\data\postgresql"
exit $LASTEXITCODE
'@
$stopPostgres = Join-Path $paths.Control 'Stop-Postgresql.ps1'
Set-Content -LiteralPath $stopPostgres -Encoding utf8 -Value @'
$root = 'C:\AI\RunaAI-Next-Candidate'
& "$root\tools\postgresql\pgsql\bin\pg_ctl.exe" -D "$root\data\postgresql" stop -m fast -w
exit $LASTEXITCODE
'@
$postgresIdentity = 'NT AUTHORITY\LOCAL SERVICE'
& icacls.exe $pgData '/grant:r' '*S-1-5-19:(OI)(CI)M' | Out-Null
& icacls.exe $paths.Logs '/grant:r' '*S-1-5-19:(OI)(CI)M' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'candidate-postgres-acl-failed' }
$pgListener = Get-NetTCPConnection -State Listen -LocalPort 9765 -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pgListener) {
  $postmasterPid = Join-Path $pgData 'postmaster.pid'
  if (Test-Path -LiteralPath $postmasterPid) {
    $recordedPid = [int](Get-Content -LiteralPath $postmasterPid -TotalCount 1)
    if (-not (Get-Process -Id $recordedPid -ErrorAction SilentlyContinue)) { Remove-Item -LiteralPath $postmasterPid -Force }
  }
  $bootstrapTaskPath = '\RunaAI-Next-Bootstrap\'
  $taskSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  foreach ($taskName in @('Postgresql','Stop-Postgresql')) { if (Get-ScheduledTask -TaskPath $bootstrapTaskPath -TaskName $taskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskPath $bootstrapTaskPath -TaskName $taskName -Confirm:$false } }
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId $postgresIdentity -LogonType ServiceAccount -RunLevel Limited
  $taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$runPostgres`""
  Register-ScheduledTask -TaskPath $bootstrapTaskPath -TaskName 'Postgresql' -Action $taskAction -Settings $taskSettings -Principal $taskPrincipal | Out-Null
  $stopAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$stopPostgres`""
  Register-ScheduledTask -TaskPath $bootstrapTaskPath -TaskName 'Stop-Postgresql' -Action $stopAction -Settings $taskSettings -Principal $taskPrincipal | Out-Null
  Start-ScheduledTask -TaskPath $bootstrapTaskPath -TaskName 'Postgresql'
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  do { Start-Sleep -Milliseconds 500; $pgListener = Get-NetTCPConnection -State Listen -LocalPort 9765 -ErrorAction SilentlyContinue | Select-Object -First 1 } until ($pgListener -or [DateTime]::UtcNow -gt $deadline)
  if (-not $pgListener) { throw 'candidate-postgres-start-failed' }
}
$deadline = [DateTime]::UtcNow.AddSeconds(60)
do {
  Start-Sleep -Milliseconds 500
  & (Join-Path $pgBin 'pg_isready.exe') -h 127.0.0.1 -p 9765 -d postgres -U postgres *> $null
  $pgReady = $LASTEXITCODE -eq 0
} until ($pgReady -or [DateTime]::UtcNow -gt $deadline)
if (-not $pgReady) { throw 'candidate-postgres-ready-failed' }
function Ensure-Role([string]$Role, [string]$Password) {
  $present = & (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -p 9765 -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$Role'"
  if (($present -join '').Trim() -ne '1') {
    & (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -p 9765 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE $Role LOGIN PASSWORD '$Password'"
    if ($LASTEXITCODE -ne 0) { throw "candidate-role-create-failed:$Role" }
  }
}
function Ensure-Database([string]$Database, [string]$Owner) {
  $present = & (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -p 9765 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$Database'"
  if (($present -join '').Trim() -ne '1') {
    & (Join-Path $pgBin 'createdb.exe') -h 127.0.0.1 -p 9765 -U postgres -O $Owner $Database
    if ($LASTEXITCODE -ne 0) { throw "candidate-database-create-failed:$Database" }
  }
}
Ensure-Role 'runa_candidate' $postgresRuna; Ensure-Role 'keycloak_candidate' $postgresKeycloak; Ensure-Role 'openfga_candidate' $postgresOpenFga
Ensure-Database 'runaai_next' 'runa_candidate'; Ensure-Database 'keycloak_candidate' 'keycloak_candidate'; Ensure-Database 'openfga_candidate' 'openfga_candidate'

$openFgaExe = Join-Path $openFgaRoot 'openfga.exe'
$env:OPENFGA_DATASTORE_ENGINE = 'postgres'; $env:OPENFGA_DATASTORE_URI = 'postgres://127.0.0.1:9765/openfga_candidate?sslmode=disable'
$env:OPENFGA_DATASTORE_USERNAME = 'openfga_candidate'; $env:OPENFGA_DATASTORE_PASSWORD = $postgresOpenFga
& $openFgaExe migrate --log-format json
if ($LASTEXITCODE -ne 0) { throw 'candidate-openfga-migrate-failed' }
$runOpenFga = Join-Path $paths.Control 'Run-OpenFga.ps1'
Set-Content -LiteralPath $runOpenFga -Encoding utf8 -Value @'
$ErrorActionPreference = 'Stop'
$root = 'C:\AI\RunaAI-Next-Candidate'
$env:OPENFGA_DATASTORE_ENGINE = 'postgres'
$env:OPENFGA_DATASTORE_URI = 'postgres://127.0.0.1:9765/openfga_candidate?sslmode=disable'
$env:OPENFGA_DATASTORE_USERNAME = 'openfga_candidate'
$env:OPENFGA_DATASTORE_PASSWORD = [IO.File]::ReadAllText("$root\secrets\postgres-openfga").Trim()
$env:OPENFGA_AUTHN_METHOD = 'preshared'
$env:OPENFGA_AUTHN_PRESHARED_KEYS = [IO.File]::ReadAllText("$root\secrets\openfga-token").Trim()
& "$root\tools\openfga\openfga.exe" run --http-addr 127.0.0.1:9763 --grpc-addr 127.0.0.1:9764 --metrics-enabled=false --playground-enabled=false --log-format json
exit $LASTEXITCODE
'@
$fgaListener = Get-NetTCPConnection -State Listen -LocalPort 9763 -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $fgaListener) { $fgaProcess = Start-Process powershell.exe -ArgumentList '-NoProfile','-File',$runOpenFga -WindowStyle Hidden -PassThru }
$deadline = [DateTime]::UtcNow.AddSeconds(60)
do { Start-Sleep -Milliseconds 500; try { $fgaReady = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9763/healthz' -TimeoutSec 2).StatusCode -eq 200 } catch { $fgaReady = $false } } until ($fgaReady -or [DateTime]::UtcNow -gt $deadline)
if (-not $fgaReady) { throw 'candidate-openfga-start-failed' }
$fgaHeaders = @{ Authorization = "Bearer $openFgaToken" }; $fgaFactsPath = Join-Path $paths.Config 'openfga-public.json'
if (Test-Path -LiteralPath $fgaFactsPath) { $fgaFacts = Get-Content -LiteralPath $fgaFactsPath -Raw | ConvertFrom-Json } else {
  $store = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:9763/stores' -Headers $fgaHeaders -ContentType 'application/json' -Body '{"name":"runaai-next-candidate"}'
  $modelBody = @{ schema_version = '1.1'; type_definitions = @(
    @{ type = 'user' },
    @{ type = 'project'; relations = @{ chat_ephemeral = @{ this = @{} }; use_local_workspace_evidence = @{ this = @{} }; propose_own_preference = @{ this = @{} }; approve_workspace_action = @{ this = @{} } }; metadata = @{ relations = @{ chat_ephemeral = @{ directly_related_user_types = @(@{ type = 'user' }) }; use_local_workspace_evidence = @{ directly_related_user_types = @(@{ type = 'user' }) }; propose_own_preference = @{ directly_related_user_types = @(@{ type = 'user' }) }; approve_workspace_action = @{ directly_related_user_types = @(@{ type = 'user' }) } } } }
  ) } | ConvertTo-Json -Depth 12 -Compress
  $model = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:9763/stores/$($store.id)/authorization-models" -Headers $fgaHeaders -ContentType 'application/json' -Body $modelBody
  $fgaFacts = [ordered]@{ storeId = $store.id; modelId = $model.authorization_model_id }
  $fgaFacts | ConvertTo-Json | Set-Content -LiteralPath $fgaFactsPath -Encoding utf8
}

$javaHome = Get-ChildItem -LiteralPath (Join-Path $paths.Tools 'java') -Directory | Select-Object -First 1 -ExpandProperty FullName
$keycloakHome = Join-Path $paths.Tools 'keycloak\keycloak-26.7.2'
$runKeycloakBootstrap = Join-Path $paths.Control 'Run-Keycloak-Bootstrap.ps1'
Set-Content -LiteralPath $runKeycloakBootstrap -Encoding utf8 -Value @"
`$ErrorActionPreference = 'Stop'
`$root = 'C:\AI\RunaAI-Next-Candidate'
`$env:JAVA_HOME = '$javaHome'
`$env:KC_BOOTSTRAP_ADMIN_USERNAME = 'candidate-bootstrap'
`$env:KC_BOOTSTRAP_ADMIN_PASSWORD = [IO.File]::ReadAllText("`$root\secrets\keycloak-bootstrap").Trim()
`$env:KC_DB = 'postgres'
`$env:KC_DB_URL = 'jdbc:postgresql://127.0.0.1:9765/keycloak_candidate'
`$env:KC_DB_USERNAME = 'keycloak_candidate'
`$env:KC_DB_PASSWORD = [IO.File]::ReadAllText("`$root\secrets\postgres-keycloak").Trim()
& '$keycloakHome\bin\kc.bat' start --cache=local --http-enabled=true --http-host=127.0.0.1 --http-port=9762 --http-management-host=127.0.0.1 --http-management-port=9766 --hostname=http://127.0.0.1:9762 --hostname-strict=true --health-enabled=true --metrics-enabled=false
exit `$LASTEXITCODE
"@
$kcListener = Get-NetTCPConnection -State Listen -LocalPort 9762 -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $kcListener) { $kcProcess = Start-Process powershell.exe -ArgumentList '-NoProfile','-File',$runKeycloakBootstrap -WindowStyle Hidden -PassThru }
$deadline = [DateTime]::UtcNow.AddMinutes(3)
do { Start-Sleep -Seconds 1; try { $kcReady = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9762/realms/master/.well-known/openid-configuration' -TimeoutSec 3).StatusCode -eq 200 } catch { $kcReady = $false } } until ($kcReady -or [DateTime]::UtcNow -gt $deadline)
if (-not $kcReady) { throw 'candidate-keycloak-start-failed' }
$token = (Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:9762/realms/master/protocol/openid-connect/token' -ContentType 'application/x-www-form-urlencoded' -Body @{ grant_type='password'; client_id='admin-cli'; username='candidate-bootstrap'; password=$keycloakBootstrap }).access_token
$adminHeaders = @{ Authorization = "Bearer $token" }
try { Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:9762/admin/realms/runaai-next' -Headers $adminHeaders | Out-Null; $realmExists = $true } catch { $realmExists = $false }
if (-not $realmExists) { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:9762/admin/realms' -Headers $adminHeaders -ContentType 'application/json' -Body (@{ realm='runaai-next'; enabled=$true; sslRequired='external' } | ConvertTo-Json -Compress) }
$clients = @(Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:9762/admin/realms/runaai-next/clients?clientId=runaai-next' -Headers $adminHeaders)
if ($clients.Count -eq 0) {
  $clientBody = @{ clientId='runaai-next'; name='RunaAI Next candidate'; enabled=$true; publicClient=$false; clientAuthenticatorType='client-secret'; secret=$keycloakClient; serviceAccountsEnabled=$true; standardFlowEnabled=$true; directAccessGrantsEnabled=$false; redirectUris=@("https://$PrivateAddress`:9761/*"); webOrigins=@("https://$PrivateAddress`:9761") } | ConvertTo-Json -Depth 6 -Compress
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:9762/admin/realms/runaai-next/clients' -Headers $adminHeaders -ContentType 'application/json' -Body $clientBody
}

$caddyFile = Join-Path $paths.Config 'Caddyfile'
Set-Content -LiteralPath $caddyFile -Encoding utf8 -Value @"
https://$PrivateAddress`:9761 {
  tls internal
  request_body { max_size 256KB }
  reverse_proxy 127.0.0.1:9760 {
    lb_retries 0
    transport http {
      dial_timeout 10s
      response_header_timeout 30s
    }
  }
}
http://127.0.0.1:9770 {
  reverse_proxy http://$ProviderAddress`:1234 {
    lb_retries 0
    transport http {
      dial_timeout 10s
      response_header_timeout 30s
    }
  }
}
"@
$serviceSpec = [ordered]@{
  postgresql = @{ version='18.6'; binary=(Join-Path $pgBin 'postgres.exe'); port=9765; bind='127.0.0.1' }
  keycloak = @{ version='26.7.2'; home=$keycloakHome; port=9762; managementPort=9766; bind='127.0.0.1'; cache='local-single-node' }
  openfga = @{ version='1.18.3'; binary=$openFgaExe; httpPort=9763; grpcPort=9764; bind='127.0.0.1'; storeId=$fgaFacts.storeId; modelId=$fgaFacts.modelId }
  caddy = @{ version='2.11.4'; binary=(Join-Path $paths.Tools 'caddy\caddy.exe'); privateAddress=$PrivateAddress; tlsPort=9761; providerProxyPort=9770 }
}
$serviceSpec | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $paths.Config 'service-public.json') -Encoding utf8
function Hash-Text([string]$Text) {
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { $hash = $algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)) } finally { $algorithm.Dispose() }
  return ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
}
$pgIdentity = Hash-Text ((Get-Content -LiteralPath (Join-Path $pgData 'postgresql.conf') -Raw) + (Get-Content -LiteralPath (Join-Path $pgData 'pg_hba.conf') -Raw) + (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $pgBin 'postgres.exe')).Hash)
$kcIdentity = Hash-Text (($serviceSpec.keycloak | ConvertTo-Json -Compress) + (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $keycloakHome 'lib\quarkus-run.jar')).Hash)
$fgaIdentity = Hash-Text (($serviceSpec.openfga | ConvertTo-Json -Compress) + (Get-FileHash -Algorithm SHA256 -LiteralPath $openFgaExe).Hash)
$caddyIdentity = Hash-Text ((Get-Content -LiteralPath $caddyFile -Raw) + (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $paths.Tools 'caddy\caddy.exe')).Hash)
$candidate = [ordered]@{
  schemaVersion='runa2-gate6b-release-config/v1'; profile='release'; mode='shadow'; bind=@{ host='127.0.0.1'; port=9760 }; publicBaseUrl="https://$PrivateAddress`:9761"
  releaseManifestPath='release.json'; sourceGeneration='legacy-runaai:control-production'; targetGeneration='runaai-next:control-candidate'; cutoverId='runaai-next-selected-core'
  databaseUrlRef='file:C:\AI\RunaAI-Next-Candidate\secrets\database-url'
  keyRefs=@{ coreEncryption='file:C:\AI\RunaAI-Next-Candidate\secrets\core-encryption'; coreHmac='file:C:\AI\RunaAI-Next-Candidate\secrets\core-hmac'; learningEncryption='file:C:\AI\RunaAI-Next-Candidate\secrets\learning-encryption'; learningHmac='file:C:\AI\RunaAI-Next-Candidate\secrets\learning-hmac'; telemetryHmac='file:C:\AI\RunaAI-Next-Candidate\secrets\telemetry-hmac' }
  keycloak=@{ issuer='http://127.0.0.1:9762/realms/runaai-next'; clientId='runaai-next'; clientCredentialRef='file:C:\AI\RunaAI-Next-Candidate\secrets\keycloak-client' }
  openfga=@{ baseUrl='http://127.0.0.1:9763'; storeId=$fgaFacts.storeId; modelId=$fgaFacts.modelId; credentialRef='file:C:\AI\RunaAI-Next-Candidate\secrets\openfga-token' }
  provider=@{ baseUrl='http://127.0.0.1:9770/v1'; modelId=$ModelId }
  services=@{ postgresql=@{ version='18.6'; configurationDigest=$pgIdentity }; keycloak=@{ version='26.7.2'; configurationDigest=$kcIdentity }; openfga=@{ version='1.18.3'; configurationDigest=$fgaIdentity }; caddy=@{ version='2.11.4'; configurationDigest=$caddyIdentity } }
  limits=@{ maxRequestBytes=262144; totalDeadlineMs=30000; upstreamDeadlineMs=10000 }
}
$candidate | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $paths.Config 'candidate.json') -Encoding utf8
foreach ($port in @(9762,9763)) { $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1; if ($listener) { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue } }
$bootstrapTaskPath = '\RunaAI-Next-Bootstrap\'
if (Get-ScheduledTask -TaskPath $bootstrapTaskPath -TaskName 'Postgresql' -ErrorAction SilentlyContinue) {
  Start-ScheduledTask -TaskPath $bootstrapTaskPath -TaskName 'Stop-Postgresql'
  $deadline=[DateTime]::UtcNow.AddSeconds(60)
  do { Start-Sleep -Milliseconds 500; $pgListener=Get-NetTCPConnection -State Listen -LocalPort 9765 -ErrorAction SilentlyContinue } until (-not $pgListener -or [DateTime]::UtcNow -gt $deadline)
  if ($pgListener) { throw 'candidate-postgres-stop-failed' }
  Unregister-ScheduledTask -TaskPath $bootstrapTaskPath -TaskName 'Postgresql' -Confirm:$false
  Unregister-ScheduledTask -TaskPath $bootstrapTaskPath -TaskName 'Stop-Postgresql' -Confirm:$false
}
Remove-Item Env:PGPASSWORD,Env:KC_BOOTSTRAP_ADMIN_PASSWORD,Env:OPENFGA_DATASTORE_PASSWORD,Env:OPENFGA_AUTHN_PRESHARED_KEYS -ErrorAction SilentlyContinue
[ordered]@{ schemaVersion='runa2-gate6b-control-initialize/v1'; initialized=$true; root=$Root; services=@{ postgresql='stopped'; keycloak='stopped'; openfga='stopped'; caddy='not-started'; application='not-installed' }; protectedDataImported=$false; ownerCredentialEnrolled=$false; productionTrafficChanged=$false; privateValuesIncluded=$false } | ConvertTo-Json -Depth 5 -Compress
