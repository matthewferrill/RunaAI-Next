import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sha256} from '../../../../gate4/canonical.mjs';
import {APPLICATION} from './assembly.mjs';
import {createClosedPhaseCompanion} from './companion.mjs';

const read=value=>readFileSync(new URL(value,import.meta.url));
const inputs=()=>({sourceBytes:read('../../../../gate7a/control/Deploy-ControlOrdinaryAccessSuccessor.ps1'),
  childBytes:read('./Bounded-DeploymentChild.cs'),functionsBytes:read('./Closed-Phase-Functions.ps1'),aclBytes:read('../../../../gate7e/control/TargetOnlyAcl.cs')});
function powershell(script){
  const binary=String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`;
  const result=spawnSync(binary,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
    {encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:1048576,env:{...process.env,
      PSModulePath:String.raw`C:\Windows\system32\WindowsPowerShell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules`}});
  assert.equal(result.status,0,result.error?.code??result.stderr);return JSON.parse(result.stdout);
}

test('frozen deployer is retained and companion is a separate four-file package',()=>{
  const value=inputs(),before=Buffer.from(value.sourceBytes),result=createClosedPhaseCompanion(value);
  assert.deepEqual(value.sourceBytes,before);assert.equal(sha256(before),APPLICATION.deployerSourceSha256);
  assert.equal(result.files.length,4);assert.equal(result.applicationArtifactChanged,false);assert.equal(result.activated,false);
  assert.equal(result.sha256,sha256(result.bytes));assert.ok(result.files.every(file=>file.sha256===sha256(file.bytes)));
});

test('one-byte source drift and newline rewriting are denied, never silently normalized',()=>{
  for(const mutate of [v=>v.sourceBytes[0]^=1,v=>v.sourceBytes=Buffer.from(v.sourceBytes.toString().replaceAll('\r\n','\n'))]){
    const value=inputs();mutate(value);assert.throws(()=>createClosedPhaseCompanion(value),/deployer-source-drift/u);
  }
});

test('companion retains ordinary identity/readiness and removes all Caddy publication/rollback',()=>{
  const text=createClosedPhaseCompanion(inputs()).bytes.toString();
  for(const token of ['Get-OwnerSubject','ownerProofRebound=$true','ordinaryPasswordRouteReady=$true',
    'm1-deploy-functions-unready','m1-deploy-qualification-failed','gate7a-ordinary-deploy-protected-binding-drift',
    'candidate-closed Caddy untouched','Assert-ClosedCaddy','applicationAndCaddyChangedTogether=$false',
    'caddyPublicationDeferred=$true','admissionOpened=$false'])assert.ok(text.includes(token),token);
  assert.ok(!text.includes('Run-Caddy reload'));assert.ok(!text.includes('Destination $caddy'));
  assert.ok(!text.includes('"$caddy.new"'));assert.ok(!text.includes('WaitForExit()'));
  assert.ok(!text.includes('& tar.exe'));assert.ok(!text.includes('& node'));
  assert.ok(text.indexOf('if($script:m1EffectUnknown)')<text.indexOf('  if($changed){'));
});

test('bounded wrappers preserve exact argument arrays and packaged node, not PATH node',()=>{
  const text=createClosedPhaseCompanion(inputs()).bytes.toString();
  assert.ok(text.includes("Run-BoundedChild (Join-Path $release 'runtime\\node.exe')"));
  for(const token of ['120000','20000','60000','-TimeoutSec 20 -Headers','-TimeoutSec 20 -ContentType'])assert.ok(text.includes(token),token);
});

test('generated complete PowerShell script parses without executing its operational statements',()=>{
  const directory=mkdtempSync(join(tmpdir(),'m1-closed-ast-')),path=join(directory,'companion.ps1');
  try{writeFileSync(path,createClosedPhaseCompanion(inputs()).bytes,{flag:'wx'});
  const result=powershell(`$s=[IO.File]::ReadAllText('${path.replaceAll("'","''")}')
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($s,[ref]$tokens,[ref]$errors)
@{errors=@($errors|ForEach-Object{$_.Message});parameters=@($ast.ParamBlock.Parameters|ForEach-Object{$_.Name.VariablePath.UserPath})}|ConvertTo-Json -Compress`);
  assert.deepEqual(result.errors,[]);assert.ok(result.parameters.includes('HeldCaddyETag'));assert.ok(result.parameters.includes('TransitionId'));
  }finally{unlinkSync(path);rmdirSync(directory);}
});

function childRun(code,maximumMs=5000,maximumBytes=4096){
  const source=fileURLToPath(new URL('./Bounded-DeploymentChild.cs',import.meta.url));
  const args=Buffer.from(JSON.stringify(['-e',code])).toString('base64');
  return powershell(`$ErrorActionPreference='Stop'
Add-Type -Path '${source.replaceAll("'","''")}'
$arguments=[string[]]([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${args}'))|ConvertFrom-Json)
[RunaAI.Next.M1.DeploymentChild]::Run('${process.execPath.replaceAll("'","''")}',$arguments,${maximumMs},${maximumBytes})|ConvertTo-Json -Compress`);
}

test('actual isolated bounded child retains complete stdout and an observed exit',()=>{
  const result=childRun('process.stdout.write(JSON.stringify({value:73}));');
  assert.equal(result.ExitCode,0);assert.equal(result.StopConfirmed,true);assert.equal(result.OutputComplete,true);
  assert.equal(result.TimedOut,false);assert.equal(JSON.parse(result.Stdout).value,73);
});
test('actual isolated hanging child is stopped within deadline and not reported successful',()=>{
  const result=childRun('setInterval(()=>{},1000)',150);
  assert.equal(result.TimedOut,true);assert.equal(result.StopConfirmed,true);assert.ok(result.ProcessId>0);
});
test('actual isolated output flood is bounded and never returned as complete output',()=>{
  const result=childRun('setInterval(()=>process.stdout.write("x".repeat(4096)),1)',5000,1024);
  assert.equal(result.OutputLimited,true);assert.equal(result.StopConfirmed,true);assert.equal(result.Stdout,'');
});
test('private child receipt path is create-only and unknown forbids blind retry/rollback',()=>{
  const text=inputs().functionsBytes.toString();
  for(const token of ['[IO.FileMode]::CreateNew','[IO.FileShare]::None','$stream.Flush($true)',
    'm1-deploy-child-receipt-unretained','m1-deploy-evidence-acl-invalid','ReparsePoint','m1-deploy-child-outcome-unknown'])assert.ok(text.includes(token));
  assert.ok(!text.includes('Write-Host'));assert.ok(!text.includes('Write-Output $result.Stdout'));
});
