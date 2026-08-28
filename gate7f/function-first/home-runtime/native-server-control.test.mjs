import test from 'node:test';
import assert from 'node:assert/strict';
import {hostname} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nativeServerCommand,validateNativeServerObservation,validateNativeServerBaseline,createNativeServerController} from './native-server-control.mjs';
const sample=()=>({schemaVersion:'runaai-native-server-observation/v1',observedAt:1000,internalPort:50000,descriptorSha256:'a'.repeat(64),
  engine:{pid:42,startedAt:'2026-08-28T12:00:00.000Z',executable:'C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\LM Studio.exe'},
  http:{addresses:['127.0.0.1'],established:0}});
test('native server control has only explicit server stop and pinned port/bind start commands',()=>{
  assert.deepEqual(nativeServerCommand('stop'),['server','stop']);
  assert.deepEqual(nativeServerCommand('start','127.0.0.1'),['server','start','--port','1234','--bind','127.0.0.1']);
  assert.deepEqual(nativeServerCommand('start','0.0.0.0'),['server','start','--port','1234','--bind','0.0.0.0']);
  for(const [mode,bind] of [['daemon'],['stop','0.0.0.0'],['start','192.168.50.1'],['load']])assert.throws(()=>nativeServerCommand(mode,bind));
});
test('native observations reject stale, wrong process and descriptor drift before a command',()=>{
  assert.equal(validateNativeServerObservation(sample(),{now:1000}).internalPort,50000);
  for(const mutate of [v=>v.observedAt=6001,v=>v.engine.pid=0,v=>v.engine.executable='C:\\fake.exe',v=>v.internalPort=1234,
    v=>v.http.addresses=['192.168.50.1'],v=>v.descriptorSha256='']){
    const value=sample();mutate(value);assert.throws(()=>validateNativeServerObservation(value,{now:1000}));}
  assert.throws(()=>validateNativeServerObservation(sample(),{now:7000}),/stale/);
  assert.throws(()=>validateNativeServerObservation(sample(),{now:1000,expectedDescriptorSha256:'b'.repeat(64)}),/descriptor-drift/);
  assert.throws(()=>validateNativeServerObservation(sample(),{now:1000,expectedEngine:{...sample().engine,pid:43}}),/engine-drift/);
});
test('native controller construction is inert and requires independent quiescence/retention callbacks',async()=>{
  assert.throws(()=>createNativeServerController({observerSha256:'a'.repeat(64)}));let calls=0;
  const codePins=Object.fromEntries(['Observe-NativeServer.ps1','Runtime-Windows.ps1','Settings-FileTransaction.ps1'].map(name=>[name,'a'.repeat(64)]));
  const controller=createNativeServerController({codePins,assertQuiescent:()=>{calls++;},record:()=>{calls++;}});
  assert.equal(calls,0);
  if(hostname().toUpperCase()!=='RUNA-HOME')await assert.rejects(()=>controller.verify(),/native-server-host/);
  assert.equal(calls,0);
});
test('historical baseline is an identity binding, not a substitute for a fresh command observation',()=>{
  assert.equal(validateNativeServerBaseline(sample()).engine.pid,42);
  const missing=sample();delete missing.descriptorSha256;assert.throws(()=>validateNativeServerBaseline(missing));
  const future=sample();future.observedAt=Date.now()+60000;assert.throws(()=>validateNativeServerBaseline(future),/baseline-time/);
});
test('native server observer parses in the actual Windows PowerShell5 parser without executing',{skip:process.platform!=='win32'},()=>{
  const script=fileURLToPath(new URL('./Observe-NativeServer.ps1',import.meta.url)).replaceAll("'","''");
  const command=`$tokens=$null;$errors=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${script}',[ref]$tokens,[ref]$errors);if($errors.Count-ne0){throw 'observer-parse'};'parsed'`;
  const result=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(result.trim(),'parsed');
});
