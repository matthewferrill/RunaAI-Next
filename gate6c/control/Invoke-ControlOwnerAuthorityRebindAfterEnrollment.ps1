[CmdletBinding()]
param([string]$Root='C:\AI\RunaAI-Next-Candidate')

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if ($env:COMPUTERNAME -ne 'RUNA-CONTROL' -or [Security.Principal.WindowsIdentity]::GetCurrent().Name -ne 'RUNA-CONTROL\Matthew') { throw 'owner-rebind-context-invalid' }
if ([IO.Path]::GetFullPath($Root) -ne 'C:\AI\RunaAI-Next-Candidate') { throw 'candidate-root-invalid' }

$base='http://localhost:9762'; $password=$null; $token=$null
try {
  $password=[IO.File]::ReadAllText((Join-Path $Root 'secrets\keycloak-bootstrap')).Trim()
  $token=(Invoke-RestMethod -Method Post -Uri "$base/realms/master/protocol/openid-connect/token" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{ grant_type='password'; client_id='admin-cli'; username='candidate-bootstrap'; password=$password }).access_token
  $headers=@{ Authorization="Bearer $token" }
  $users=@(Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next/users?username=matthew-owner&exact=true" -Headers $headers)
  if ($users.Count -ne 1) { throw 'owner-rebind-user-mismatch' }
  $userId=[string]$users[0].id
  $credentials=@(Invoke-RestMethod -Method Get -Uri "$base/admin/realms/runaai-next/users/$userId/credentials" -Headers $headers)
  if (@($credentials | Where-Object { $_.type -eq 'password' }).Count -ne 1 -or
      @($credentials | Where-Object { $_.type -eq 'webauthn-passwordless' }).Count -ne 1) { throw 'owner-rebind-credential-state-mismatch' }
  $env:RUNA_GATE6C_OWNER_SUBJECT=$userId
  $script=Join-Path $Root 'staging\gate6c-resume-ad4e686\Rebind-ControlOwnerAuthority.mjs'
  $release=Join-Path $Root 'releases\runaai-next-gate6c-resume-2026-08-22-ad4e686'
  $output=& node.exe $script --release-root $release --config (Join-Path $Root 'config\candidate.json') `
    --expected-release-id 'runaai-next-gate6c-resume-2026-08-22-ad4e686' `
    --expected-commit 'ad4e686243726dea188b50751176a00e2338fd9e' `
    --expected-artifact-digest '688f102b7d5e9014d73f41ee381ed7fe00d7d40d9f28fc1ae938ca70cd9cabf6' `
    --prior-release-id 'runaai-next-gate6c-localhost-2026-08-22-ff15c61' `
    --prior-commit 'ff15c618ecbcb5095f362c6055f4a485af3148e7' `
    --prior-artifact-digest 'fff3c379258efe4a2cabf2835c91897c4df528b4ab20b229e967d86a12354668' `
    --reason 'interrupted-enrollment-recovery-release' `
    --legacy-repo 'C:\AI\Projects\RunaAI' --legacy-commit 'b4db04090d8f0df87234fab573b396e7824c5354' 2>&1
  $exit=$LASTEXITCODE; Remove-Item Env:RUNA_GATE6C_OWNER_SUBJECT -ErrorAction SilentlyContinue
  $text=($output | ForEach-Object { [string]$_ }) -join ''
  if ($exit -ne 0) { throw "owner-rebind-operator-failed:$text" }
  $result=$text | ConvertFrom-Json
  if ($result.passed -ne $true -or $result.ceremonyRevision -ne 1 -or $result.nextStep -ne 'enroll-primary-credential') { throw 'owner-rebind-result-invalid' }
  $result | ConvertTo-Json -Compress
} finally {
  Remove-Item Env:RUNA_GATE6C_OWNER_SUBJECT -ErrorAction SilentlyContinue
  Remove-Variable password,token -ErrorAction SilentlyContinue
}
