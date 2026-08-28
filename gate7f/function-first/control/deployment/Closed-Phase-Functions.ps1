# Separately pinned operator companion; never part of the qualified app artifact.
# The outer owner holds the transition journal writer and has resolved all Caddy
# requests. Matching snapshots alone do not prove an earlier request terminated.
Set-StrictMode -Version Latest
$script:m1ChildReceipts=@()
$script:m1EffectUnknown=$false

function Assert-ClosedCaddy {
  if((Hash $caddy)-ne$HeldCaddySha256){throw 'm1-closed-caddy-file-drift'}
  $response=$null
  try {
    $request=[Net.HttpWebRequest]::Create('http://127.0.0.1:2019/config/')
    $request.Method='GET';$request.Timeout=10000;$request.ReadWriteTimeout=10000;$request.AllowAutoRedirect=$false
    $request.Headers['Origin']='http://127.0.0.1:2019'
    $response=$request.GetResponse()
    if([int]$response.StatusCode-ne200-or[string]$response.Headers['ETag']-cne$HeldCaddyETag){throw 'm1-closed-caddy-runtime-drift'}
  } catch { throw 'm1-closed-caddy-runtime-unverified' }
  finally { if($null-ne$response){$response.Close()} }
}

function Assert-EvidenceDirectory {
  $directory=Join-Path $Root "secrets\m1-deployment-$TransitionId"
  if(-not(Test-Path -LiteralPath $directory -PathType Container)-or
    ((Get-Item -LiteralPath $directory).Attributes-band[IO.FileAttributes]::ReparsePoint)){
    throw 'm1-deploy-evidence-directory-invalid'
  }
  $allowed=@('S-1-5-18','S-1-5-32-544',[Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
  foreach($rule in (Get-Acl -LiteralPath $directory).Access){
    if($rule.AccessControlType-eq'Allow'-and$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value-notin$allowed){
      throw 'm1-deploy-evidence-acl-invalid'
    }
  }
  $directory
}

function Retain-ChildRecord([object]$Receipt) {
  $directory=Assert-EvidenceDirectory
  if($Receipt.childId-notmatch'^[a-f0-9]{32}$'-or$Receipt.stage-notin@('intent','started','terminal')){throw 'm1-child-record-binding'}
  $path=Join-Path $directory ($Receipt.childId+'-'+$Receipt.stage+'.json')
  $bytes=[Text.Encoding]::UTF8.GetBytes(($Receipt|ConvertTo-Json -Depth 8 -Compress))
  $stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  $script:m1ChildReceipts+=,$Receipt
}

function Read-ChildRecord([string]$Path) {
  $item=Get-Item -LiteralPath $Path
  if($item.Length-gt65536-or($item.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'm1-child-record-file-invalid'}
  [IO.File]::ReadAllText($Path)|ConvertFrom-Json
}

function Assert-NoUnresolvedChildren {
  $directory=Assert-EvidenceDirectory;$entries=@(Get-ChildItem -LiteralPath $directory -Force)
  if($entries.Count-gt64){throw 'm1-child-record-cap'}
  foreach($entry in $entries){if($entry.PSIsContainer-or$entry.Name-notmatch'^[a-f0-9]{32}-(intent|started|terminal)\.json$'){throw 'm1-child-record-file-invalid'}}
  foreach($entry in $entries){
    if($entry.Name-notlike'*-intent.json'){continue}
    $intent=Read-ChildRecord $entry.FullName
    if($intent.schemaVersion-ne'runaai-m1-deployment-child-intent/v1'-or$intent.transitionId-ne$TransitionId-or
      $intent.stage-ne'intent'-or$entry.Name-cne($intent.childId+'-intent.json')){throw 'm1-child-record-binding'}
    $startedPath=Join-Path $directory ($intent.childId+'-started.json');$terminalPath=Join-Path $directory ($intent.childId+'-terminal.json')
    if(-not(Test-Path -LiteralPath $startedPath -PathType Leaf)-or-not(Test-Path -LiteralPath $terminalPath -PathType Leaf)){throw 'm1-deploy-reconciliation-required'}
    $started=Read-ChildRecord $startedPath;$terminal=Read-ChildRecord $terminalPath
    if($started.schemaVersion-ne'runaai-m1-deployment-child-started/v1'-or$terminal.schemaVersion-ne'runaai-m1-deployment-child/v1'-or
      $started.stage-ne'started'-or$terminal.stage-ne'terminal'-or$started.intentSha256-ne(Hash $entry.FullName)-or
      $terminal.intentSha256-ne(Hash $entry.FullName)-or$terminal.startedRecordSha256-ne(Hash $startedPath)-or
      $terminal.outcome-ne'terminal'-or$terminal.stopConfirmed-ne$true-or$terminal.outputComplete-ne$true-or
      $terminal.timedOut-ne$false-or$terminal.outputLimited-ne$false-or$terminal.processId-ne$started.processId-or
      $terminal.processStartedAt-ne$started.processStartedAt){throw 'm1-deploy-reconciliation-required'}
    foreach($field in @('childId','transitionId','executableSha256','argumentsSha256','operation','maximumMs')){
      if($terminal.$field-cne$intent.$field-or$started.$field-cne$intent.$field){throw 'm1-child-record-binding'}
    }
  }
  foreach($entry in $entries){
    $childId=$entry.Name.Substring(0,32)
    if(-not(Test-Path -LiteralPath (Join-Path $directory ($childId+'-intent.json')) -PathType Leaf)){throw 'm1-child-record-orphan'}
  }
}

function Run-BoundedChild([string]$FileName,[string[]]$Arguments,[int]$MaximumMs,
  [ValidateSet('caddy-validate','archive-extract','qualification','owner-rebind')][string]$Operation) {
  if($script:m1EffectUnknown){throw 'm1-deploy-reconciliation-required'}
  try{Assert-NoUnresolvedChildren}catch{$script:m1EffectUnknown=$true;throw 'm1-deploy-reconciliation-required'}
  $fileSha=Hash $FileName
  $intent=[ordered]@{schemaVersion='runaai-m1-deployment-child-intent/v1';stage='intent';transitionId=$TransitionId;
    childId=([Guid]::NewGuid().ToString('N'));operation=$Operation;executableSha256=$fileSha;
    argumentsSha256=(TextHash (ConvertTo-Json -InputObject @($Arguments) -Compress));maximumMs=$MaximumMs;
    preparedAt=[DateTime]::UtcNow.ToString('o');privateValuesIncluded=$false}
  # From this point a crash/throw is unknown until this exact intent has both a
  # durable start identity and a complete matching terminal result. No replay.
  $script:m1EffectUnknown=$true
  try {
    Retain-ChildRecord $intent
    $directory=Assert-EvidenceDirectory;$intentSha=Hash (Join-Path $directory ($intent.childId+'-intent.json'))
    $observer=[Action[object]]{param($observed)
      $started=[ordered]@{schemaVersion='runaai-m1-deployment-child-started/v1';stage='started';intentSha256=$intentSha;
        childId=$intent.childId;transitionId=$TransitionId;operation=$Operation;executableSha256=$fileSha;
        argumentsSha256=$intent.argumentsSha256;maximumMs=$MaximumMs;processId=$observed.ProcessId;
        processStartedAt=$observed.ProcessStartedAt;observedAt=[DateTime]::UtcNow.ToString('o');privateValuesIncluded=$false}
      Retain-ChildRecord $started
    }
    $result=[RunaAI.Next.M1.DeploymentChild]::RunObserved($FileName,$Arguments,$MaximumMs,262144,$observer)
  }catch{throw 'm1-deploy-child-outcome-unknown'}
  $terminal=$result.Started-and$result.StopConfirmed-and$result.OutputComplete-and-not$result.TimedOut-and-not$result.OutputLimited
  $receipt=[ordered]@{schemaVersion='runaai-m1-deployment-child/v1';stage='terminal';transitionId=$TransitionId;
    childId=$intent.childId;operation=$Operation;executableSha256=$fileSha;maximumMs=$MaximumMs;
    argumentsSha256=$intent.argumentsSha256;intentSha256=$intentSha;
    startedRecordSha256=(Hash (Join-Path $directory ($intent.childId+'-started.json')));
    started=$result.Started;processId=$result.ProcessId;processStartedAt=$result.ProcessStartedAt;startedAt=$result.StartedAt;finishedAt=$result.FinishedAt;
    stopConfirmed=$result.StopConfirmed;timedOut=$result.TimedOut;outputLimited=$result.OutputLimited;
    outputComplete=$result.OutputComplete;exitCode=$result.ExitCode;stdoutBytes=$result.StdoutBytes;stderrBytes=$result.StderrBytes;
    outcome=$(if($terminal){'terminal'}else{'unknown'});privateValuesIncluded=$false}
  # A failed durable record is itself uncertain, even if the child exited. Never
  # auto-retry an operation whose terminal observation could not be retained.
  try{Retain-ChildRecord $receipt}catch{throw 'm1-deploy-child-receipt-unretained'}
  if(-not$terminal){$script:m1EffectUnknown=$true;throw 'm1-deploy-child-outcome-unknown'}
  $script:m1EffectUnknown=$false
  return $result
}

function Run-Caddy([ValidateSet('validate')][string]$Command,[string]$ConfigPath) {
  (Run-BoundedChild $caddyExe @($Command,'--config',$ConfigPath,'--adapter','caddyfile') 20000 'caddy-validate').ExitCode
}

function Write-ClosedPhaseFailure([string]$Code) {
  [ordered]@{schemaVersion='runaai-m1-closed-deployment/v1';transitionId=$TransitionId;passed=$false;
    errorCode=$Code;needsReconciliation=$script:m1EffectUnknown;admissionOpened=$false;
    caddyPublicationDeferred=$true;childReceipts=$script:m1ChildReceipts;privateValuesIncluded=$false}|ConvertTo-Json -Depth 8 -Compress
}
