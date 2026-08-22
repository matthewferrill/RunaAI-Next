[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ReleaseId,
  [Parameter(Mandatory)][string]$ExpectedCommit,
  [Parameter(Mandatory)][string]$ExpectedArtifactDigest,
  [Parameter(Mandatory)][string]$ExpectedRootSha256,
  [Parameter(Mandatory)][string]$ExpectedRootThumbprint,
  [Parameter(Mandatory)][string]$RootCertPath,
  [string]$ResultPath=''
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\AI\RunaAI-Next-Candidate';$configPath=Join-Path $root 'config\candidate.json'
$expectedSubject='CN=Caddy Local Authority - 2026 ECC Root';$publicBaseUrl='https://192.168.50.169:9761'
$trustScope='CurrentUser\Root';$failureStage='initialization'
trap{
  $failure=[string]$_.Exception.Message
  if($failure-notmatch'^control-caddy-trust-[a-z-]+$'){$failure='control-caddy-trust-failed'}
  if($ResultPath-ne''-and[IO.Path]::GetFullPath($ResultPath)-match'^C:\\AI\\RunaAI-Next-Candidate\\staging\\caddy-trust-[a-f0-9]{12}\\result\.json$'){
    [ordered]@{schemaVersion='runa2-gate6b-control-caddy-trust-error/v1';passed=$false;errorCode=$failure;failureStage=$failureStage;certificateValidationBypassed=$false;privateValuesIncluded=$false}|ConvertTo-Json -Compress|Set-Content -LiteralPath $ResultPath -Encoding utf8 -NoNewline
  }
  exit 1
}
if($env:COMPUTERNAME-ne'RUNA-CONTROL'-or[Security.Principal.WindowsIdentity]::GetCurrent().Name-ne'RUNA-CONTROL\Matthew'){throw 'control-caddy-trust-context-invalid'}
if([Diagnostics.Process]::GetCurrentProcess().SessionId-eq 0){throw 'control-caddy-trust-interactive-session-required'}
if($ReleaseId-notmatch'^[A-Za-z0-9._-]{1,100}$'-or$ExpectedCommit-notmatch'^[a-f0-9]{40}$'-or
  $ExpectedArtifactDigest-notmatch'^[a-f0-9]{64}$'-or$ExpectedRootSha256-notmatch'^[a-f0-9]{64}$'-or
  $ExpectedRootThumbprint-notmatch'^[A-F0-9]{40}$'){throw 'control-caddy-trust-pin-invalid'}
$rootCertPath=[IO.Path]::GetFullPath($RootCertPath)
if($rootCertPath-notmatch'^C:\\AI\\RunaAI-Next-Candidate\\staging\\caddy-trust-[a-f0-9]{12}\\root\.crt$'){throw 'control-caddy-trust-certificate-path-invalid'}
if($ResultPath-ne''-and[IO.Path]::GetFullPath($ResultPath)-notmatch'^C:\\AI\\RunaAI-Next-Candidate\\staging\\caddy-trust-[a-f0-9]{12}\\result\.json$'){throw 'control-caddy-trust-result-path-invalid'}
foreach($path in @($configPath,$rootCertPath)){if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw 'control-caddy-trust-required-path-missing'}}
$failureStage='release-state'
$config=Get-Content -Raw -LiteralPath $configPath|ConvertFrom-Json;$manifestPath=Join-Path (Split-Path -Parent $configPath) $config.releaseManifestPath
$manifest=Get-Content -Raw -LiteralPath $manifestPath|ConvertFrom-Json;$runtime=Invoke-RestMethod 'http://127.0.0.1:9760/api/runtime/status' -TimeoutSec 10
$readiness=Invoke-RestMethod 'http://127.0.0.1:9760/api/readiness/status' -TimeoutSec 10
if($config.publicBaseUrl-ne$publicBaseUrl-or$manifest.releaseId-ne$ReleaseId-or$manifest.commit-ne$ExpectedCommit-or
  $manifest.artifactDigest-ne$ExpectedArtifactDigest-or$runtime.running.releaseId-ne$ReleaseId-or
  $runtime.running.commit-ne$ExpectedCommit-or$runtime.running.artifactDigest-ne$ExpectedArtifactDigest-or
  $runtime.cutover.phase-notin@('planned','rolled-back','closed')){throw 'control-caddy-trust-release-mismatch'}
if($runtime.cutover.phase-eq'closed'){
  if($readiness.authority-ne'active'-or$readiness.protectedDataImported-ne$true-or$readiness.productionTrafficChanged-ne$true){throw 'control-caddy-trust-authority-invalid'}
}elseif($readiness.authority-ne'shadow'-or$readiness.protectedDataImported-ne$false-or$readiness.productionTrafficChanged-ne$false){throw 'control-caddy-trust-authority-invalid'}
$failureStage='certificate-validation'
$actualHash=(Get-FileHash -LiteralPath $rootCertPath -Algorithm SHA256).Hash.ToLowerInvariant()
$certificate=[Security.Cryptography.X509Certificates.X509Certificate2]::new($rootCertPath)
try{
  $basicConstraints=@($certificate.Extensions|Where-Object{$_-is[Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]})
  if($actualHash-ne$ExpectedRootSha256-or$certificate.Thumbprint-ne$ExpectedRootThumbprint-or
    $certificate.Subject-ne$expectedSubject-or$certificate.Issuer-ne$expectedSubject-or$certificate.HasPrivateKey-or
    $certificate.NotAfter.ToUniversalTime()-lt[DateTime]::UtcNow.AddYears(1)-or$basicConstraints.Count-ne 1-or
    $basicConstraints[0].CertificateAuthority-ne$true){throw 'control-caddy-trust-certificate-invalid'}
  $failureStage='trust-store-read'
  $existing=@(Get-ChildItem -LiteralPath 'Cert:\CurrentUser\Root'|Where-Object{$_.Thumbprint-eq$ExpectedRootThumbprint})
  if($existing.Count-gt 1){throw 'control-caddy-trust-duplicate'}
  $alreadyTrusted=$existing.Count-eq 1;$imported=$false
  if($alreadyTrusted){
    if([Convert]::ToBase64String($existing[0].RawData)-ne[Convert]::ToBase64String($certificate.RawData)){throw 'control-caddy-trust-store-mismatch'}
  }else{
    $failureStage='trust-import'
    & certutil.exe -user -f -addstore Root $rootCertPath *> $null
    if($LASTEXITCODE-ne 0){throw 'control-caddy-trust-import-failed'}
    $imported=$true
  }
  try{
    if(@(Get-ChildItem -LiteralPath 'Cert:\CurrentUser\Root'|Where-Object{$_.Thumbprint-eq$ExpectedRootThumbprint}).Count-ne 1){throw 'control-caddy-trust-import-mismatch'}
    $failureStage='https-validation';$httpsStatus=& curl.exe -sS -o NUL -w '%{http_code}' --max-time 10 "$publicBaseUrl/health/ready" 2>$null
    if($LASTEXITCODE-ne 0-or[string]$httpsStatus-ne'200'){throw 'control-caddy-trust-https-verification-failed'}
  }catch{
    if($imported){& certutil.exe -user -f -delstore Root $ExpectedRootThumbprint *> $null;if($LASTEXITCODE-ne 0){throw 'control-caddy-trust-rollback-failed'}}
    throw
  }
  $failureStage='evidence-write'
  $result=[ordered]@{schemaVersion='runa2-gate6b-control-caddy-trust/v1';passed=$true;scope=$trustScope;thumbprint=$ExpectedRootThumbprint;alreadyTrusted=$alreadyTrusted;httpsStatus=200;certificateValidationBypassed=$false;privateValuesIncluded=$false}|ConvertTo-Json -Compress
  if($ResultPath-ne''){Set-Content -LiteralPath $ResultPath -Value $result -Encoding utf8 -NoNewline}else{$result}
}finally{$certificate.Dispose()}
