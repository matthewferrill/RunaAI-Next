[CmdletBinding()]
param([Parameter(Mandatory)][string]$SourceCommit,
  [string]$ExpectedControlCommit = 'f092d358a18f0ec0b6c2eaaeaf9a057b1d7f6d68')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
if ($SourceCommit -notmatch '^[a-f0-9]{40}$' -or $ExpectedControlCommit -notmatch '^[a-f0-9]{40}$') { throw 'm1-stage-commit-invalid' }
if ((git -C $repo rev-parse HEAD) -ne $SourceCommit -or $LASTEXITCODE -ne 0) { throw 'm1-stage-source-head-mismatch' }
$dirty = @(git -C $repo status --porcelain --untracked-files=all)
if ($LASTEXITCODE -ne 0 -or $dirty.Count -ne 0) { throw 'm1-stage-source-not-clean' }
$qdrant = 'D:\Projects\Runalab\artifacts\tools\qdrant\bin\qdrant.exe'
$qdrantSha = '369c562eae3d89333a13abfdb522fa209e3f587c1217a1059d817e80814ea9d4'
if ((Get-Item -LiteralPath $qdrant).Length -ne 84184576 -or (Get-FileHash -LiteralPath $qdrant -Algorithm SHA256).Hash.ToLowerInvariant() -ne $qdrantSha) { throw 'm1-stage-qdrant-pin-mismatch' }
$name = 'm1-task-native-' + [Guid]::NewGuid().ToString('N')
$ownedRoot = 'C:\AI\RunaAI-Next-Candidate\staging\' + $name
$artifactRoot = Join-Path $repo ('artifacts\runs\' + $name)
New-Item -ItemType Directory -Path $artifactRoot | Out-Null
$archive = Join-Path $artifactRoot 'source.tar'
git -C $repo archive --format=tar --output=$archive $SourceCommit
if ($LASTEXITCODE -ne 0) { throw 'm1-stage-archive-failed' }
$archiveSha = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$identityPath = Join-Path $artifactRoot 'SOURCE-IDENTITY.json'
$identity = [ordered]@{ schemaVersion='runaai-m1-source-identity/v1'; sourceCommit=$SourceCommit;
  sourceArchiveSha256=$archiveSha; caseBundleSha256='8713db8fb54bebe069f73edfef7cd179c13a3caba1d4d15bd8567f39aaa418ed';
  qdrantSha256=$qdrantSha; productionChanged=$false }
[IO.File]::WriteAllText($identityPath, ($identity | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
function Invoke-OwnerCommand([string]$Command) {
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
  $result = & ssh -F 'C:\Users\matth\.ssh\config' -o ClearAllForwardings=yes runa-control powershell.exe -NoProfile -NonInteractive -EncodedCommand $encoded
  if ($LASTEXITCODE -ne 0) { throw 'm1-stage-owner-command-failed' }
  return $result
}
$create = @'
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='__ROOT__'
if ([Security.Principal.WindowsIdentity]::GetCurrent().Name -ne 'RUNA-CONTROL\Matthew') { throw 'm1-stage-owner-mismatch' }
$repo='C:\AI\Projects\RunaAI-Next'
if ((git -C $repo rev-parse HEAD) -ne '__EXPECTED__') { throw 'm1-stage-control-head-mismatch' }
if (@(git -C $repo status --porcelain --untracked-files=no).Count -ne 0) { throw 'm1-stage-control-dirty' }
if ([IO.Path]::GetDirectoryName($root) -ne 'C:\AI\RunaAI-Next-Candidate\staging' -or (Test-Path -LiteralPath $root)) { throw 'm1-stage-target-exists' }
New-Item -ItemType Directory -Path $root | Out-Null
New-Item -ItemType Directory -Path (Join-Path $root 'tools\qdrant\bin') -Force | Out-Null
[ordered]@{identity='RUNA-CONTROL\Matthew';ownedRoot=$root;controlHead='__EXPECTED__';trackedClean=$true} | ConvertTo-Json -Compress
'@
$baseline = Invoke-OwnerCommand $create.Replace('__ROOT__',$ownedRoot).Replace('__EXPECTED__',$ExpectedControlCommit)
$destination = $ownedRoot.Replace('\','/')
& scp -F 'C:\Users\matth\.ssh\config' -o ClearAllForwardings=yes $archive ('runa-control:'+$destination+'/source.tar')
if ($LASTEXITCODE -ne 0) { throw 'm1-stage-source-transfer-failed' }
& scp -F 'C:\Users\matth\.ssh\config' -o ClearAllForwardings=yes $identityPath ('runa-control:'+$destination+'/SOURCE-IDENTITY.json')
if ($LASTEXITCODE -ne 0) { throw 'm1-stage-identity-transfer-failed' }
& scp -F 'C:\Users\matth\.ssh\config' -o ClearAllForwardings=yes $qdrant ('runa-control:'+$destination+'/tools/qdrant/bin/qdrant.exe')
if ($LASTEXITCODE -ne 0) { throw 'm1-stage-qdrant-transfer-failed' }
$finish = @'
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='__ROOT__'
if ((Get-FileHash -LiteralPath (Join-Path $root 'source.tar') -Algorithm SHA256).Hash.ToLowerInvariant() -ne '__ARCHIVE__') { throw 'm1-stage-archive-pin-mismatch' }
if ((Get-FileHash -LiteralPath (Join-Path $root 'tools\qdrant\bin\qdrant.exe') -Algorithm SHA256).Hash.ToLowerInvariant() -ne '__QDRANT__') { throw 'm1-stage-qdrant-pin-mismatch' }
& tar -xf (Join-Path $root 'source.tar') -C $root
if ($LASTEXITCODE -ne 0) { throw 'm1-stage-extract-failed' }
$release='C:\AI\RunaAI-Next-Candidate\releases\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc'
New-Item -ItemType Junction -Path (Join-Path $root 'node_modules') -Target (Join-Path $release 'node_modules') | Out-Null
[ordered]@{schemaVersion='runaai-m1-functional-stage/v1';ready=$true;ownedRoot=$root;
 sourceCommit='__COMMIT__';sourceArchiveSha256='__ARCHIVE__';qdrantSha256='__QDRANT__';
 nodeExecutable=(Join-Path $release 'runtime\node.exe');modelsInvoked=$false;servicesStarted=$false;productionChanged=$false} | ConvertTo-Json -Compress
'@
$result = Invoke-OwnerCommand $finish.Replace('__ROOT__',$ownedRoot).Replace('__ARCHIVE__',$archiveSha).Replace('__QDRANT__',$qdrantSha).Replace('__COMMIT__',$SourceCommit)
$result
