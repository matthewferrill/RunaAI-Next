import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,linkSync,mkdirSync,symlinkSync,rmSync,realpathSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {assertPlainPath,parseGpuTelemetry,createPinnedNativeAdapter,HOME_RUNTIME_ROOT} from './native-adapter.mjs';
import {validateProfile} from './contracts.mjs';

test('native observation parser rejects malformed/nonfinite numeric readings',()=>{
  const v=parseGpuTelemetry('0, Quadro RTX 6000, GPU-test, 23040, 8000, 44, 160, 25.2, 0\n');
  assert.equal(v[0].temperatureC,44);assert.equal(v[0].powerLimitWatts,160);
  assert.throws(()=>parseGpuTelemetry('0, bad'),/gpu-observation/);
  assert.throws(()=>parseGpuTelemetry('0,x,id,23040,NaN,40,160,25,0'),/gpu-observation/);
});
test('native plain-path checks execute on ordinary files and actual NTFS hardlink/junction fixtures',()=>{
  const parent=realpathSync(os.tmpdir()),root=mkdtempSync(path.join(parent,'runa-runtime-path-'));
  try{
    const file=path.join(root,'one.txt');writeFileSync(file,'synthetic');assertPlainPath(file);
    linkSync(file,path.join(root,'two.txt'));assert.throws(()=>assertPlainPath(file),/native-path-kind/);
    mkdirSync(path.join(root,'target'));writeFileSync(path.join(root,'target/file.txt'),'synthetic');
    symlinkSync(path.join(root,'target'),path.join(root,'junction'),'junction');
    assert.throws(()=>assertPlainPath(path.join(root,'junction/file.txt')),/native-path-link/);
    for(const bad of [file+':stream','\\\\server\\share\\file','C:\\test.\\file','C:\\x\\..\\file'])assert.throws(()=>assertPlainPath(bad),/native-path/);
  }finally{const resolved=realpathSync(root);assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('runa-runtime-path-'));rmSync(resolved,{recursive:true,force:false});}
});
test('native adapter constructor has no model calls and refuses non-Home execution or unbound paths',async()=>{
  let calls=0;const pins={engineExecutableSha256:'1'.repeat(64),observationScriptSha256:'2'.repeat(64),nodeSha256:'3'.repeat(64)};
  const adapter=createPinnedNativeAdapter({operatorPins:pins,fetchImpl:async()=>{calls++;throw Error('unexpected network');}});
  assert.equal(calls,0);assert.equal(HOME_RUNTIME_ROOT,'C:\\AI\\RunaAI-Next-HomeRuntime');
  const p=validateProfile({schemaVersion:'runaai-qualified-home-profile/v1',candidateId:'gemma',appSourceCommit:'1'.repeat(40),runtimeSealSha256:'2'.repeat(64),qualificationGradesSha256:'3'.repeat(64)});
  if(os.hostname().toUpperCase()!=='RUNA-HOME')await assert.rejects(adapter.verifyPins(p),/native-host-runtime/);
  assert.equal(calls,0);assert.throws(()=>createPinnedNativeAdapter({operatorPins:pins,stateRoot:'C:\\other'}),/native-state-root/);
});
test('PowerShell engine observer parses and contains only read-only exact-boundary operations',()=>{
  const file=path.join(import.meta.dirname,'Observe-HomeRuntime.ps1'),source=readFileSync(file,'utf8');
  assert.doesNotMatch(source,/Start-Process|Stop-Process|Set-Content|WriteAll|Register-ScheduledTask|Invoke-RestMethod|Set-Acl/);
  assert.match(source,/LocalAddress-ne'127\.0\.0\.1'/);assert.match(source,/CreationDate/);assert.match(source,/GetOwner/);
  const script=`$e=$null;$t=$null;[void][Management.Automation.Language.Parser]::ParseFile('${file.replaceAll("'","''")}',[ref]$t,[ref]$e);if($e.Count){throw 'parse-error'}`;
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000});
});
