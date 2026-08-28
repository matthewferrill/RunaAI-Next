param([Parameter(Mandatory=$true)][ValidateSet('supervisor','localservice')][string]$Mode,[Parameter(Mandatory=$true)][string]$Root)
. (Join-Path $PSScriptRoot 'Windows-Ownership.ps1')
$ProgressPreference='SilentlyContinue'
Assert-ProofPath $Root $Root
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if($Mode-eq'localservice'){
  if($identity.User.Value-ne'S-1-5-19'){throw 'proof-worker-principal'}
  $results=[ordered]@{}
  $results.codeReadable=[IO.File]::ReadAllText((Join-Path $Root 'code\node-fixture.mjs')).Length-gt0
  $results.replyReadable=[IO.File]::ReadAllText((Join-Path $Root 'replies\system-probe.json'))-ceq'public-synthetic'
  Write-ProofJson (Join-Path $Root 'requests\probe.json') $Root @{synthetic=$true}
  $results.requestWritable=$true
  $results.privateStateDenied=$false
  try{[void][IO.File]::ReadAllText((Join-Path $Root 'state\private-canary.txt'))}catch [UnauthorizedAccessException]{$results.privateStateDenied=$true}
  $results.replyWriteDenied=$false
  try{$handle=[IO.File]::Open((Join-Path $Root 'replies\forged.json'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write);$handle.Dispose()}catch [UnauthorizedAccessException]{$results.replyWriteDenied=$true}
  $results.codeWriteDenied=$false
  try{$handle=[IO.File]::Open((Join-Path $Root 'code\forged.ps1'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write);$handle.Dispose()}catch [UnauthorizedAccessException]{$results.codeWriteDenied=$true}
  $results.rootWriteDenied=$false
  try{$handle=[IO.File]::Open((Join-Path $Root 'forged.json'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write);$handle.Dispose()}catch [UnauthorizedAccessException]{$results.rootWriteDenied=$true}
  Write-ProofJson (Join-Path $Root 'requests\localservice-result.json') $Root @{schemaVersion='runaai-localservice-os-proof/v1';principalSid=$identity.User.Value;checks=$results;passed=(@($results.Values|Where-Object{$_-ne$true}).Count-eq0);modelOperations=$false}
  exit
}
if($identity.User.Value-ne'S-1-5-18'){throw 'proof-supervisor-principal'}
$lock=$null;$child=$null;$childIdentity=$null;$failure=$null;$childStopped=$false;$started=[DateTime]::UtcNow
try{
  $config=Get-Content -LiteralPath (Join-Path $Root 'config.json') -Raw|ConvertFrom-Json
  if($config.nodePath-cne'C:\Program Files\nodejs\node.exe'-or(Get-FileHash -LiteralPath $config.nodePath -Algorithm SHA256).Hash.ToLowerInvariant()-cne$config.nodeSha256){throw 'proof-node-pin'}
  $lock=[IO.File]::Open((Join-Path $Root 'state\owner.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  Write-ProofJson (Join-Path $Root 'public\watchdog.json') $Root (Get-ProofIdentity $PID)
  $arguments='"'+(Join-Path $Root 'code\node-fixture.mjs')+'" "'+$Root+'"'
  $child=Start-Process -FilePath $config.nodePath -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Root 'state\node-stdout.txt') -RedirectStandardError (Join-Path $Root 'state\node-stderr.txt')
  $childIdentity=Get-ProofIdentity $child.Id
  if($null-eq$childIdentity){throw 'proof-child-missing'}
  Write-ProofJson (Join-Path $Root 'public\child.json') $Root $childIdentity
  while(([DateTime]::UtcNow-$started).TotalSeconds-lt50){
    if(Test-ProofStopped $childIdentity){$childStopped=$true;break}
    Start-Sleep -Milliseconds 100
  }
  if(-not$childStopped){throw 'proof-child-did-not-stop'}
  $journal=Get-Content -LiteralPath (Join-Path $Root 'state\synthetic-ownership.jsonl') -Raw|ConvertFrom-Json
  if($journal.type-cne'synthetic-owned'-or$journal.pid-ne$childIdentity.pid-or$journal.modelOperations-ne$false){throw 'proof-journal'}
}catch{$failure=if($_.Exception.Message-match'^proof-[a-z-]+$'){$_.Exception.Message}else{'proof-supervisor-failed'}}
finally{
  if($null-ne$childIdentity-and-not(Test-ProofStopped $childIdentity)){Stop-ProofProcess $childIdentity}
  if($null-ne$child){$child.Dispose()}
  if($null-ne$lock){$lock.Dispose()}
  Write-ProofJson (Join-Path $Root 'public\supervisor-result.json') $Root @{schemaVersion='runaai-native-watchdog-os-proof/v1';principalSid=$identity.User.Value;startedAt=$started.ToString('o');endedAt=[DateTime]::UtcNow.ToString('o');childStopped=$childStopped;survivedChildExit=($null-eq$failure-and$childStopped);failure=$failure;modelOperations=$false;productionChanges=$false}
}
if($failure){exit 1}
