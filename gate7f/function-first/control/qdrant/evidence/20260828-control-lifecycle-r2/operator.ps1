param([Parameter(Mandatory)][ValidateSet('Preflight','Upload','Install','Start','Probe','ReadProbe','StopRestart','Rollback','RegisterDisabled','Final','InspectFailure','ArchiveFailed')][string]$Mode,
 [Parameter(Mandatory)][string]$StageId,[Parameter(Mandatory)][string]$ExpectedPackageSha256,[string]$LocalPackage)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($StageId-notmatch'^m1-qdrant-proof-20260828-r[1-9][0-9]*$'-or$ExpectedPackageSha256-notmatch'^[a-f0-9]{64}$'){throw 'm1-qdrant-proof-arguments'}
$stage='C:\AI\RunaAI-Next-Candidate\staging\'+$StageId
$code=$stage
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
$evidenceDirectory=Join-Path $repository ('artifacts\m1-readiness\'+$StageId+'-evidence')
if(-not(Test-Path -LiteralPath $evidenceDirectory)){New-Item -ItemType Directory -Path $evidenceDirectory|Out-Null}
function Remote([string]$Body){
  $prefix='$ErrorActionPreference=''Stop'';$ProgressPreference=''SilentlyContinue'';Set-StrictMode -Version Latest;if($env:COMPUTERNAME-ne''RUNA-CONTROL''){throw ''proof-host''};'
  $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($prefix+$Body))
  $output=& ssh -F 'C:\Users\matth\.ssh\config' -o ClearAllForwardings=yes runa-control powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded
  $exitCode=$LASTEXITCODE
  $receipt=[ordered]@{schemaVersion='runaai-m1-qdrant-remote-command/v1';mode=$Mode;stageId=$StageId;packageSha256=$ExpectedPackageSha256;time=[DateTime]::UtcNow.ToString('o');exitCode=$exitCode;output=@($output)}
  $file=Join-Path $evidenceDirectory ($Mode+'-'+[Guid]::NewGuid().ToString('N')+'.json')
  $stream=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
  try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($receipt|ConvertTo-Json -Depth 12)+[Environment]::NewLine);$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
  $output
  if($exitCode-ne0){throw "m1-qdrant-proof-remote-failed:$Mode"}
}
$snapshot=@'
$root='C:\AI\RunaAI-Next-Candidate';$identity=[Security.Principal.WindowsIdentity]::GetCurrent();$admin=([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$repo='C:\AI\Projects\RunaAI-Next';$head=git -c safe.directory=C:/AI/Projects/RunaAI-Next -C $repo rev-parse HEAD;$branch=git -c safe.directory=C:/AI/Projects/RunaAI-Next -C $repo branch --show-current;$dirty=@(git -c safe.directory=C:/AI/Projects/RunaAI-Next -C $repo status --porcelain --untracked-files=no)
$ports=@(Get-NetTCPConnection -State Listen|Where-Object{$_.LocalPort-in@(9760,9761,9762,9763,9764,9765,9766,9770,9774,9775)}|Sort-Object LocalPort,LocalAddress|Select-Object LocalAddress,LocalPort,OwningProcess)
$tasks=@(Get-ScheduledTask -TaskPath '\RunaAI-Next\'|Sort-Object TaskName|ForEach-Object{@{name=$_.TaskName;state=[string]$_.State;enabled=$_.Settings.Enabled;principal=$_.Principal.UserId}})
$hashes=@{};foreach($name in @('candidate.json','release.json','Caddyfile')){$p=Join-Path $root ('config\'+$name);if(Test-Path -LiteralPath $p){$hashes[$name]=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}}
[ordered]@{schemaVersion='runaai-m1-qdrant-host-observation/v1';time=[DateTime]::UtcNow.ToString('o');identity=$identity.Name;administrator=$admin;head=$head;branch=$branch;trackedChanges=$dirty.Count;targetExists=(Test-Path -LiteralPath (Join-Path $root 'm1-qdrant'));ports=$ports;tasks=$tasks;configurationHashes=$hashes;protectedDataIncluded=$false}|ConvertTo-Json -Depth 10 -Compress
'@
if($Mode-in@('Preflight','Final')){Remote $snapshot;exit}
if($Mode-eq'Upload'){
  if(-not$LocalPackage){throw 'proof-local-package'}
  Remote ('if(Test-Path -LiteralPath '''+$stage+'''){throw ''proof-stage-exists''};New-Item -ItemType Directory -Path '''+$stage+'''|Out-Null')
  foreach($name in @('Common-M1Qdrant.ps1','Run-M1Qdrant.ps1','Install-ControlM1Qdrant.ps1','Start-ControlM1Qdrant.ps1','Rollback-ControlM1Qdrant.ps1','qdrant.yaml','qdrant.exe','package.json')){
    & scp -F 'C:\Users\matth\.ssh\config' -o ClearAllForwardings=yes (Join-Path $LocalPackage $name) ('runa-control:'+($stage.Replace('\','/'))+'/'+$name)
    if($LASTEXITCODE-ne0){throw 'proof-transfer-failed'}
  }
  Remote ('. '''+$stage+'\Common-M1Qdrant.ps1'';$null=Get-M1QdrantManifest '''+$stage+''' '''+$ExpectedPackageSha256+''';@{packageVerified=$true;servicesStarted=$false}|ConvertTo-Json -Compress');exit
}
$common='. '''+$code+'\Common-M1Qdrant.ps1'';'
$install='& '''+$code+'\Install-ControlM1Qdrant.ps1'' -PackageDirectory '''+$stage+''' -ExpectedPackageSha256 '''+$ExpectedPackageSha256+''';'
$start='& '''+$code+'\Start-ControlM1Qdrant.ps1'' -ExpectedPackageSha256 '''+$ExpectedPackageSha256+''';'
$rollback='& '''+$code+'\Rollback-ControlM1Qdrant.ps1'' -ExpectedPackageSha256 '''+$ExpectedPackageSha256+''';'
if($Mode-in@('Install','RegisterDisabled')){Remote $install;exit}
if($Mode-eq'Start'){Remote $start;exit}
if($Mode-eq'Rollback'){Remote $rollback;exit}
if($Mode-eq'StopRestart'){Remote ($rollback+$install+$start);exit}
if($Mode-eq'ArchiveFailed'){
  if($StageId-ne'm1-qdrant-proof-20260828-r1'-or$ExpectedPackageSha256-ne'665a0050a2eae72cc3d2f73e2a059e3c2687ea305e8fa3e93d5dd5aa1c8d8c61'){throw 'proof-archive-binding'}
  $archive=@'
$source='C:\AI\RunaAI-Next-Candidate\m1-qdrant';$target='C:\AI\RunaAI-Next-Candidate\m1-qdrant-retained-r1';$parent='C:\AI\RunaAI-Next-Candidate'
Assert-M1Qdrant ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($source))-ceq$parent) 'archive-source-boundary'
Assert-M1Qdrant ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($target))-ceq$parent) 'archive-target-boundary'
Assert-M1Qdrant (-not(Test-Path -LiteralPath $target)) 'archive-target-exists'
$null=Get-M1QdrantInstallation '665a0050a2eae72cc3d2f73e2a059e3c2687ea305e8fa3e93d5dd5aa1c8d8c61'
Assert-M1QdrantPath $source;Assert-M1QdrantTree $source;Assert-M1QdrantPath $target
Assert-M1Qdrant ($null-eq(Get-ScheduledTask -TaskPath '\RunaAI-Next\' -TaskName 'M1-Qdrant' -ErrorAction SilentlyContinue)) 'archive-task-present'
Assert-M1QdrantPortsFree
$proof=Get-Content -LiteralPath ($source+'\state\process.json') -Raw|ConvertFrom-Json
Assert-M1Qdrant ($null-eq(Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$proof.pid))) 'archive-old-pid-present'
$owned=@(Get-CimInstance Win32_Process|Where-Object{$_.ExecutablePath-ceq($source+'\code\qdrant.exe')-or($_.CommandLine-and$_.CommandLine.Contains($source+'\code\Run-M1Qdrant.ps1'))})
Assert-M1Qdrant ($owned.Count-eq0) 'archive-owned-process-present'
Move-Item -LiteralPath $source -Destination $target
Assert-M1Qdrant ((Test-Path -LiteralPath $target)-and-not(Test-Path -LiteralPath $source)) 'archive-not-confirmed'
@{schemaVersion='runaai-m1-qdrant-retained-failure/v1';retainedPath=$target;oldPackageSha256='665a0050a2eae72cc3d2f73e2a059e3c2687ea305e8fa3e93d5dd5aa1c8d8c61';taskAbsent=$true;ownedProcessesAbsent=$true;portsFree=$true;allFilesRetained=$true;productionChanged=$false}|ConvertTo-Json -Compress
'@
  Remote ($common+$archive);exit
}
if($Mode-eq'InspectFailure'){
  Remote ('$root=''C:\AI\RunaAI-Next-Candidate\m1-qdrant'';$task=Get-ScheduledTask -TaskPath ''\RunaAI-Next\'' -TaskName ''M1-Qdrant'' -ErrorAction SilentlyContinue;$info=Get-ScheduledTaskInfo -TaskPath ''\RunaAI-Next\'' -TaskName ''M1-Qdrant'' -ErrorAction SilentlyContinue;$taskView=$null;if($task){$taskView=@{name=$task.TaskName;state=[string]$task.State;enabled=$task.Settings.Enabled;lastTaskResult=$info.LastTaskResult}};$receipts=@();if(Test-Path -LiteralPath ($root+''\state'')){foreach($f in Get-ChildItem -LiteralPath ($root+''\state'') -File|Where-Object{$_.Name-match''^(process|ready|run-[a-f0-9]+)\.json$''}){$receipts+=@{name=$f.Name;value=(Get-Content -LiteralPath $f.FullName -Raw|ConvertFrom-Json)}}};@{task=$taskView;receipts=$receipts;logs=@(Get-ChildItem -LiteralPath ($root+''\state\logs'') -File -ErrorAction SilentlyContinue|ForEach-Object{Get-Content -LiteralPath $_.FullName -Raw|ConvertFrom-Json})}|ConvertTo-Json -Depth 12 -Compress');exit
}
$probe=@'
$collection='m1_service_lifecycle_probe';$base='http://127.0.0.1:9774';$point='7c84908a-f12f-4f8b-88fc-2d4aabc2da35'
$task=Get-ScheduledTask -TaskPath '\RunaAI-Next\' -TaskName 'M1-Qdrant';Assert-M1QdrantTask $task '__SHA__'
$p=Get-Content -LiteralPath 'C:\AI\RunaAI-Next-Candidate\m1-qdrant\state\process.json' -Raw|ConvertFrom-Json
Assert-M1QdrantChild $p (Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$p.pid));Assert-M1QdrantListeners $p.pid
__WRITE__
$r=Invoke-RestMethod -Uri ($base+'/collections/'+$collection+'/points/'+$point) -TimeoutSec 10
Assert-M1Qdrant ($r.result.payload.reference-eq'm1-synthetic-service-proof'-and$r.result.payload.revision-eq1) 'probe-data'
[ordered]@{schemaVersion='runaai-m1-qdrant-synthetic-probe/v1';time=[DateTime]::UtcNow.ToString('o');packageSha256='__SHA__';pid=$p.pid;runId=$p.runId;collection=$collection;syntheticReferenceRetained=$true;rawPrivateContentStored=$false;modelsCalled=$false;protectedDataChanged=$false}|ConvertTo-Json -Compress
'@
$write=@'
$collections=Invoke-RestMethod -Uri ($base+'/collections') -TimeoutSec 10
Assert-M1Qdrant (@($collections.result.collections|Where-Object{$_.name-eq$collection}).Count-eq0) 'probe-collection-exists'
$null=Invoke-RestMethod -Uri ($base+'/collections/'+$collection) -Method Put -ContentType 'application/json' -Body '{"vectors":{"size":4,"distance":"Cosine"}}' -TimeoutSec 10
$null=Invoke-RestMethod -Uri ($base+'/collections/'+$collection+'/points?wait=true') -Method Put -ContentType 'application/json' -Body ('{"points":[{"id":"'+$point+'","vector":[1,0,0,0],"payload":{"reference":"m1-synthetic-service-proof","revision":1}}]}') -TimeoutSec 10
'@
Remote ($common+$probe.Replace('__SHA__',$ExpectedPackageSha256).Replace('__WRITE__',$(if($Mode-eq'Probe'){$write}else{''})))
