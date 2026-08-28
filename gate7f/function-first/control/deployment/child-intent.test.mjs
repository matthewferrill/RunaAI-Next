import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ps=value=>value.replaceAll("'","''");
function actualFixture(failure){
  const directory=mkdtempSync(join(tmpdir(),'m1-child-intent-')),side=join(directory,'side.txt'),program=join(directory,'child.cjs');
  const childSource=fileURLToPath(new URL('./Bounded-DeploymentChild.cs',import.meta.url));
  const functions=fileURLToPath(new URL('./Closed-Phase-Functions.ps1',import.meta.url));
  const transitionId='a'.repeat(32),journal=join(directory,'secrets','m1-deployment-'+transitionId);
  writeFileSync(program,`require('node:fs').appendFileSync(process.argv[2],'effect\\n');${failure==='started'?'setInterval(()=>{},1000);':''}`,{flag:'wx'});
  const script=`$ErrorActionPreference='Stop'
$Root='${ps(directory)}';$TransitionId='${transitionId}';$script:observedPid=0
$journal=Join-Path $Root ('secrets\\m1-deployment-'+$TransitionId)
New-Item -ItemType Directory -Path $journal -Force|Out-Null
$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @('S-1-5-18','S-1-5-32-544',[Security.Principal.WindowsIdentity]::GetCurrent().User.Value)){
 $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $journal -AclObject $acl
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function TextHash([string]$Value){$h=[Security.Cryptography.SHA256]::Create();try{([BitConverter]::ToString($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value)))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
Add-Type -Path '${ps(childSource)}'
. '${ps(functions)}'
$script:originalRetain=(Get-Item Function:Retain-ChildRecord).ScriptBlock
function Retain-ChildRecord([object]$Receipt){
 if($Receipt.stage-eq'started'){$script:observedPid=$Receipt.processId}
 if('${failure}'-eq$Receipt.stage){
   if('${failure}'-eq'started'){$limit=[DateTime]::UtcNow.AddSeconds(5);while(-not(Test-Path -LiteralPath '${ps(side)}')-and[DateTime]::UtcNow-lt$limit){Start-Sleep -Milliseconds 10}}
   throw 'synthetic-record-failure'
 }
 & $script:originalRetain $Receipt
}
$code=$null;$result=$null
try{$result=Run-BoundedChild '${ps(process.execPath)}' @('${ps(program)}','${ps(side)}') 5000 'qualification'}catch{$code=$_.Exception.Message}
$firstUnknown=$script:m1EffectUnknown;$countBeforeRetry=@(Get-ChildItem -LiteralPath $journal).Count
$stopped=$true;if($script:observedPid-gt0){try{$p=[Diagnostics.Process]::GetProcessById($script:observedPid);$stopped=$p.HasExited;$p.Dispose()}catch{$stopped=$true}}
if('${failure}'-eq'foreign-terminal'){
 $terminalFile=@(Get-ChildItem -LiteralPath $journal -Filter '*-terminal.json')[0]
 $terminal=[IO.File]::ReadAllText($terminalFile.FullName)|ConvertFrom-Json
 $terminal.childId='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
 [IO.File]::WriteAllText($terminalFile.FullName,($terminal|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
}
@{errorCode=$code;firstUnknown=$firstUnknown;coordinatorProcessId=$PID;
 records=$countBeforeRetry;stopped=$stopped;processId=$script:observedPid;exitCode=$(if($null-ne$result){$result.ExitCode}else{-1})}|ConvertTo-Json -Compress
`;
  const launch=source=>{
    const result=spawnSync(String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,
      ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],
      {encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:1048576,env:{...process.env,
        PSModulePath:String.raw`C:\Windows\system32\WindowsPowerShell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules`}});
    assert.equal(result.status,0,result.stderr||result.error?.code);
    return JSON.parse(result.stdout);
  };
  try{
    const observation=launch(script);
    // A genuinely new PowerShell coordinator imports the real helper afresh,
    // without the previous record-failure injection or in-memory unknown flag.
    const restart=failure==='none'?{restartErrorCode:null,restartUnknown:false}:launch(
      `$ErrorActionPreference='Stop'\n$Root='${ps(directory)}';$TransitionId='${transitionId}'\n`
      +script.slice(script.indexOf('function Hash'),script.indexOf('$script:originalRetain'))+`
$restartCode=$null
try{Run-BoundedChild '${ps(process.execPath)}' @('${ps(program)}','${ps(side)}') 5000 'qualification'|Out-Null}catch{$restartCode=$_.Exception.Message}
@{restartErrorCode=$restartCode;restartUnknown=$script:m1EffectUnknown;restartCoordinatorProcessId=$PID}|ConvertTo-Json -Compress
`);
    const records=existsSync(journal)?readdirSync(journal).map(name=>JSON.parse(readFileSync(join(journal,name)))):[];
    if(failure!=='none')assert.notEqual(restart.restartCoordinatorProcessId,observation.coordinatorProcessId);
    return {...observation,...restart,sideEffect:existsSync(side)?readFileSync(side,'utf8'):'',rawRecords:records};
  }finally{
    if(existsSync(journal)){for(const name of readdirSync(journal)){assert.match(name,/^[a-f0-9]{32}-(intent|started|terminal)\.json$/u);unlinkSync(join(journal,name));}rmdirSync(journal);}
    if(existsSync(join(directory,'secrets')))rmdirSync(join(directory,'secrets'));
    if(existsSync(side))unlinkSync(side);unlinkSync(program);rmdirSync(directory);
  }
}

test('actual child intent, PID/start identity and terminal are durable and exactly linked',t=>{
  const actual=actualFixture('none');assert.equal(actual.errorCode,null);assert.equal(actual.firstUnknown,false);
  t.diagnostic(JSON.stringify(actual));
  assert.equal(actual.exitCode,0);assert.equal(actual.records,3);assert.equal(actual.stopped,true);
  const intent=actual.rawRecords.find(record=>record.stage==='intent'),started=actual.rawRecords.find(record=>record.stage==='started'),terminal=actual.rawRecords.find(record=>record.stage==='terminal');
  assert.equal(started.childId,intent.childId);assert.equal(terminal.childId,intent.childId);assert.equal(started.processId,terminal.processId);
  assert.equal(started.processStartedAt,terminal.processStartedAt);assert.match(intent.argumentsSha256,/^[a-f0-9]{64}$/u);
  assert.ok(Date.parse(intent.preparedAt)<=Date.parse(started.observedAt));assert.ok(!JSON.stringify(actual.rawRecords).includes('child.cjs'));
});

test('actual child side effect followed by start-observer throw remains unknown; exact child stops and restart cannot replay',t=>{
  const actual=actualFixture('started');assert.equal(actual.errorCode,'m1-deploy-child-outcome-unknown');
  t.diagnostic(JSON.stringify(actual));
  assert.equal(actual.firstUnknown,true);assert.equal(actual.restartUnknown,true);assert.equal(actual.stopped,true);
  assert.ok(actual.processId>0);assert.equal(actual.records,1);assert.equal(actual.restartErrorCode,'m1-deploy-reconciliation-required');
  assert.equal(actual.sideEffect.match(/effect/gu)?.length,1);
});

test('actual completed child with lost terminal record retains unknown despite successful effect; restart cannot replay',t=>{
  const actual=actualFixture('terminal');assert.equal(actual.errorCode,'m1-deploy-child-receipt-unretained');
  t.diagnostic(JSON.stringify(actual));
  assert.equal(actual.firstUnknown,true);assert.equal(actual.records,2);assert.equal(actual.stopped,true);
  assert.equal(actual.restartErrorCode,'m1-deploy-reconciliation-required');assert.equal(actual.sideEffect.match(/effect/gu)?.length,1);
});

test('a successful terminal from a different child cannot resolve the retained exact intent after restart',t=>{
  const actual=actualFixture('foreign-terminal');t.diagnostic(JSON.stringify(actual));
  assert.equal(actual.errorCode,null);assert.equal(actual.firstUnknown,false);assert.equal(actual.records,3);
  assert.equal(actual.restartErrorCode,'m1-deploy-reconciliation-required');assert.equal(actual.restartUnknown,true);
  assert.equal(actual.sideEffect.match(/effect/gu)?.length,1);assert.equal(actual.stopped,true);
});
