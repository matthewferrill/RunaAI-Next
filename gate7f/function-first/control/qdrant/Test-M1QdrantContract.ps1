param([Parameter(Mandatory)][string]$FixtureRoot,[Parameter(Mandatory)][string]$PackageSha256)
$ProgressPreference='SilentlyContinue'
. (Join-Path $PSScriptRoot 'Common-M1Qdrant.ps1')
$results=[Collections.Generic.List[object]]::new()
function Check([string]$Name,[scriptblock]$Body){try{& $Body;$results.Add(@{name=$Name;passed=$true})}catch{$results.Add(@{name=$Name;passed=$false;error=$_.Exception.Message})}}
function Rejected([scriptblock]$Body){$rejected=$false;try{& $Body}catch{$rejected=$true};if(-not$rejected){throw 'test-expected-rejection'}}
$package=Join-Path $FixtureRoot 'package'
Check 'real binary package and canonical configuration validate' {$null=Get-M1QdrantManifest $package $PackageSha256}
Check 'wrong package digest denied' {Rejected {$null=Get-M1QdrantManifest $package ('0'*64)}}
Check 'alternate stream path denied' {Rejected {Assert-M1QdrantPath ($FixtureRoot+'\ordinary.txt:hidden')}}
Check 'path normalization and UNC denied' {foreach($p in @('C:\AI\..\outside','\\server\share\value','C:\path.\file')){Rejected {Assert-M1QdrantPath $p}}}
Check 'ordinary file allowed' {Assert-M1QdrantPath (Join-Path $FixtureRoot 'ordinary.txt') -File}
Check 'actual mutable receipt replacement succeeds twice' {
  $file=Join-Path $FixtureRoot 'mutable-receipt.json'
  Write-M1QdrantJson $file @{revision=1}
  Write-M1QdrantJson $file @{revision=2}
  Assert-M1Qdrant ((Get-Content -LiteralPath $file -Raw|ConvertFrom-Json).revision-eq2) 'test-replacement'
}
Check 'hardlink rejected by actual native handle metadata' {Rejected {Assert-M1QdrantPath (Join-Path $FixtureRoot 'hardlink-a.txt') -File}}
Check 'junction rejected without traversing it' {Rejected {Assert-M1QdrantTree (Join-Path $FixtureRoot 'linked')}}
Check 'ACL constructor gives LocalService no code write' {
  $acl=Get-M1QdrantSecurity 'Read';$rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  $ls=@($rules|Where-Object{$_.IdentityReference.Value-eq'S-1-5-19'})[0]
  Assert-M1Qdrant ($acl.AreAccessRulesProtected-and$rules.Count-eq3-and($ls.FileSystemRights-band[Security.AccessControl.FileSystemRights]::Write)-eq0) 'test-code-acl'
  $state=Get-M1QdrantSecurity 'State';$r=@($state.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])|Where-Object{$_.IdentityReference.Value-eq'S-1-5-19'})[0]
  Assert-M1Qdrant (($r.FileSystemRights-band[Security.AccessControl.FileSystemRights]::Modify)-eq[Security.AccessControl.FileSystemRights]::Modify) 'test-state-acl'
}
$sha='1'*64
function FixtureTask {
  [pscustomobject]@{TaskPath='\RunaAI-Next\';TaskName='M1-Qdrant';Description=('RunaAI M1 derived index; package '+$sha);
    Principal=[pscustomobject]@{UserId='S-1-5-19';RunLevel='Limited';LogonType='ServiceAccount'};
    Actions=@([pscustomobject]@{Execute=$script:M1QdrantShell;Arguments=(Get-M1QdrantArguments $sha);WorkingDirectory=$script:M1QdrantRoot+'\code'});
    Triggers=@([pscustomobject]@{CimClass=[pscustomobject]@{CimClassName='MSFT_TaskBootTrigger'}});
    Settings=[pscustomobject]@{RestartCount=5;RestartInterval='PT1M';ExecutionTimeLimit='PT0S';MultipleInstances='IgnoreNew';StartWhenAvailable=$true;DisallowStartIfOnBatteries=$false;StopIfGoingOnBatteries=$false;Hidden=$true}}
}
Check 'exact task allowed' {Assert-M1QdrantTask (FixtureTask) $sha}
Check 'task authority/action/extra trigger drift denied' {
  foreach($mutation in @({param($t)$t.Principal.UserId='S-1-5-18'},{param($t)$t.Actions[0].Arguments+=' -other'},{param($t)$t.Triggers+=@($t.Triggers[0])},{param($t)$t.Settings.RestartCount=6},{param($t)$t.TaskName='Application'})){
    $task=FixtureTask;& $mutation $task;Rejected {Assert-M1QdrantTask $task $sha}
  }
}
$script:fakeListeners=@()
function Get-NetTCPConnection {param($State,$ErrorAction) $script:fakeListeners}
Check 'free ports allowed and occupied ports denied' {
  Assert-M1QdrantPortsFree
  $script:fakeListeners=@([pscustomobject]@{LocalAddress='127.0.0.1';LocalPort=9774;OwningProcess=44})
  Rejected {Assert-M1QdrantPortsFree}
}
Check 'both loopback listeners must belong to exact child' {
  $script:fakeListeners=@(9774,9775|ForEach-Object{[pscustomobject]@{LocalAddress='127.0.0.1';LocalPort=$_;OwningProcess=44}})
  Assert-M1QdrantListeners 44
  $script:fakeListeners[0].LocalAddress='0.0.0.0';Rejected {Assert-M1QdrantListeners 44}
  $script:fakeListeners[0].LocalAddress='127.0.0.1';$script:fakeListeners[1].OwningProcess=99;Rejected {Assert-M1QdrantListeners 44}
}
Check 'child identity includes exact executable command and creation time' {
  $exe=$script:M1QdrantRoot+'\code\qdrant.exe';$time=[DateTime]::Parse('2026-08-28T00:00:00Z').ToUniversalTime()
  $proof=@{pid=44;startedAt=$time.ToString('o');executable=$exe}
  $live=[pscustomobject]@{ProcessId=44;ExecutablePath=$exe;CommandLine='"'+$exe+'" --config-path "'+$script:M1QdrantRoot+'\code\qdrant.yaml"';CreationDate=$time}
  Assert-M1QdrantChild $proof $live
  $live.CreationDate=$time.AddSeconds(1);Rejected {Assert-M1QdrantChild $proof $live}
  $live.CreationDate=$time;$live.CommandLine+=' --bootstrap http://external';Rejected {Assert-M1QdrantChild $proof $live}
}
Check 'self-consistent package cannot widen canonical service configuration' {
  $yaml=Join-Path $package 'qdrant.yaml';$manifestPath=Join-Path $package 'package.json'
  $oldConfig=[IO.File]::ReadAllBytes($yaml);$oldManifest=[IO.File]::ReadAllBytes($manifestPath)
  try{
    $bad=(Get-M1QdrantConfiguration).Replace('host: 127.0.0.1','host: 0.0.0.0')
    [IO.File]::WriteAllText($yaml,$bad,[Text.UTF8Encoding]::new($false))
    $m=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
    $entry=@($m.files|Where-Object{$_.name-eq'qdrant.yaml'})[0];$entry.bytes=(Get-Item -LiteralPath $yaml).Length;$entry.sha256=Get-M1QdrantHash $yaml
    [IO.File]::WriteAllText($manifestPath,($m|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    $rejected=$false
    try{$null=Get-M1QdrantManifest $package (Get-M1QdrantHash $manifestPath)}catch{Assert-M1Qdrant ($_.Exception.Message-eq'm1-qdrant-configuration-drift') 'test-wrong-config-failure';$rejected=$true}
    Assert-M1Qdrant $rejected 'test-config-not-rejected'
  }finally{[IO.File]::WriteAllBytes($yaml,$oldConfig);[IO.File]::WriteAllBytes($manifestPath,$oldManifest)}
}
[ordered]@{schemaVersion='runaai-m1-qdrant-contract-tests/v1';servicesStarted=$false;taskApisMocked=$true;tests=@($results)}|ConvertTo-Json -Depth 8 -Compress
if(@($results|Where-Object{-not$_.passed}).Count){exit 1}
