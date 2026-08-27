param([switch]$AuthorizeGate7F1Download)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest
if (-not $AuthorizeGate7F1Download -or $env:COMPUTERNAME -ne 'RUNA-HOME') {
  throw 'gate7f1-download-authority-or-host-mismatch'
}
$revision = '8afd43710afbb87c711f33f7e7c11b1434a9fa1a'
$repo = 'google/gemma-4-26B-A4B-it-qat-q4_0-gguf'
$fileName = 'gemma-4-26B_q4_0-it.gguf'
$expectedHash = '3eca3b8f6d7baf218a7dd6bba5fb59a56ee25fe2d567b6f5f589b4f697eca51d'
$expectedBytes = [int64]14439363584
$modelRoot = 'C:\lm-studio-models'
$targetRoot = 'C:\lm-studio-models\google\gemma-4-26B-A4B-it-qat-q4_0-gguf'
$target = Join-Path $targetRoot $fileName
$partial = $target + '.partial'
$metadataUrl = 'https://huggingface.co/api/models/' + $repo + '/revision/' + $revision + '?blobs=true'
$baseUrl = 'https://huggingface.co/' + $repo + '/resolve/' + $revision + '/'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Assert-NoReparse([string]$Path) {
  $full = [IO.Path]::GetFullPath($Path)
  if ($full -ne $modelRoot -and -not $full.StartsWith($modelRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'gate7f1-download-path-outside-model-root'
  }
  $cursor = $full
  while ($cursor -and $cursor.Length -ge 3) {
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -Force -LiteralPath $cursor
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'gate7f1-download-reparse-refused'
      }
    }
    $parent = Split-Path -Parent $cursor
    if ($parent -eq $cursor) { break }
    $cursor = $parent
  }
}

function Download-Exact([string]$Url, [string]$Path, [switch]$Resume) {
  Assert-NoReparse $Path
  $args = @('--fail', '--location', '--silent', '--show-error', '--proto', '=https',
    '--proto-redir', '=https', '--connect-timeout', '30', '--max-time', '7200',
    '--speed-time', '120', '--speed-limit', '1024')
  if ($Resume) { $args += @('--continue-at', '-') }
  $args += @('--output', $Path, $Url)
  & curl.exe @args
  if ($LASTEXITCODE -ne 0) { throw 'gate7f1-download-transfer-failed' }
}

Assert-NoReparse $target
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$metadata = Invoke-RestMethod -Uri $metadataUrl -TimeoutSec 30
$entry = @($metadata.siblings | Where-Object rfilename -eq $fileName)
if ($metadata.sha -ne $revision -or $metadata.gated -ne $false -or
    $metadata.cardData.license -ne 'apache-2.0' -or $entry.Count -ne 1 -or
    $entry[0].lfs.sha256 -ne $expectedHash -or $entry[0].size -ne $expectedBytes) {
  throw 'gate7f1-download-remote-pin-mismatch'
}
if (-not (Test-Path -LiteralPath $targetRoot)) {
  New-Item -ItemType Directory -Path $targetRoot | Out-Null
}
$existed = Test-Path -LiteralPath $target
if (-not $existed) {
  if ((Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'").FreeSpace -lt ($expectedBytes + 20GB)) {
    throw 'gate7f1-download-insufficient-disk'
  }
  if ((Test-Path -LiteralPath $partial) -and (Get-Item -LiteralPath $partial).Length -gt $expectedBytes) {
    throw 'gate7f1-download-oversized-partial'
  }
  @{schemaVersion='runa2-gate7f1-download-progress/v1';phase='download-started';
    expectedBytes=$expectedBytes;revision=$revision} | ConvertTo-Json -Compress
  Download-Exact ($baseUrl + $fileName) $partial -Resume
  if ((Get-Item -LiteralPath $partial).Length -ne $expectedBytes) { throw 'gate7f1-download-size-mismatch' }
  @{schemaVersion='runa2-gate7f1-download-progress/v1';phase='hashing';bytes=$expectedBytes} | ConvertTo-Json -Compress
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $partial).Hash.ToLowerInvariant()
  if ($hash -ne $expectedHash) { throw 'gate7f1-download-hash-mismatch' }
  Assert-NoReparse $target
  if (Test-Path -LiteralPath $target) { throw 'gate7f1-download-target-appeared' }
  Move-Item -LiteralPath $partial -Destination $target
} else {
  if ((Get-Item -LiteralPath $target).Length -ne $expectedBytes -or
      (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant() -ne $expectedHash) {
    throw 'gate7f1-download-existing-target-mismatch'
  }
}
foreach ($name in @('README.md', 'LICENSE-2.0.txt')) {
  $noticePath = Join-Path $targetRoot $name
  if (-not (Test-Path -LiteralPath $noticePath)) {
    $noticePartial = $noticePath + '.partial'
    if (Test-Path -LiteralPath $noticePartial) { throw 'gate7f1-download-notice-partial-exists' }
    $url = if ($name -eq 'README.md') { $baseUrl + $name } else { 'https://www.apache.org/licenses/LICENSE-2.0.txt' }
    Download-Exact $url $noticePartial
    Assert-NoReparse $noticePath
    if (Test-Path -LiteralPath $noticePath) { throw 'gate7f1-download-notice-target-appeared' }
    Move-Item -LiteralPath $noticePartial -Destination $noticePath
  }
}
$result = @{schemaVersion='runa2-gate7f1-download-result/v1';host=$env:COMPUTERNAME;
  observedAt=(Get-Date).ToUniversalTime().ToString('o');repository=$repo;revision=$revision;
  path=$target;bytes=$expectedBytes;sha256=$expectedHash;alreadyPresent=$existed;passed=$true;
  license='Apache-2.0';modelLoaded=$false;multimodalProjectionDownloaded=$false;
  credentialsUsed=$false;controlChanged=$false;productionRoutingChanged=$false;privateValuesIncluded=$false}
$manifestPath = Join-Path $targetRoot 'gate7f1-artifact-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
  [IO.File]::WriteAllText($manifestPath, ($result | ConvertTo-Json -Depth 6), $utf8)
}
$result | ConvertTo-Json -Depth 6 -Compress
