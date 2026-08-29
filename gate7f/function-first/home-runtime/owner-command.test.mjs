import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {ownerCommandArgs,prepareOwnerCommand,validateOwnerCommandResult,createOwnerCommandExecutor} from './owner-command.mjs';
const commandId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',descriptorSha256='a'.repeat(64);
const engine={pid:14568,startedAt:'2026-08-23T14:19:15.3385098Z',executable:'C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\LM Studio.exe'};
const prep=(mode='status',bind=null)=>prepareOwnerCommand({commandId,mode,bind,engine,descriptorSha256});
const result=(p,patch={})=>Buffer.from(JSON.stringify({schemaVersion:'runaai-owner-command-result/v1',packageSha256:p.packageSha256,commandId,
  mode:p.manifest.mode,bind:p.manifest.bind,startedAt:'2026-08-28T01:00:00Z',endedAt:'2026-08-28T01:00:01Z',passed:true,errorCode:null,
  dispatched:true,executionStopped:true,stdoutSha256:'b'.repeat(64),stderrSha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  identity:'RUNA-HOME\\Matthew',credentialsCopied:false,credentialReadByWrapper:false,privateValuesIncluded:false,inferenceCalled:false,
  settingsChanged:false,nativeOutcomeConfirmed:false,admissionClosed:false,drainProved:false,...patch})+'\n');
test('only fixed owner CLI argument arrays exist',()=>{assert.deepEqual(ownerCommandArgs('status'),['ps','--json']);assert.deepEqual(ownerCommandArgs('stop'),['server','stop']);
 assert.deepEqual(ownerCommandArgs('start','127.0.0.1'),['server','start','--port','1234','--bind','127.0.0.1']);
 for(const value of [['load'],['start','192.168.50.1'],['stop','127.0.0.1']])assert.throws(()=>ownerCommandArgs(...value));});
test('package is deterministic, source-bound and has no credential or shell input',()=>{const a=prep(),b=prep();assert.equal(a.packageSha256,b.packageSha256);
 assert.match(a.manifest.root,/^C:\\ProgramData\\RunaAI-Next-NativeCommand-[a-f0-9]{32}$/);assert.deepEqual(Object.keys(a.manifest.sourceFiles).sort(),['Run-HomeOwnerCommand.ps1','Runtime-Windows.ps1']);
 assert.equal(JSON.stringify(a).includes('password'),false);assert.equal(JSON.stringify(a).includes('credential'),false);});
test('returned worker receipt never becomes native confirmation',async()=>{const p=prep('stop'),raw=result(p);assert.equal(validateOwnerCommandResult(raw,p).nativeOutcomeConfirmed,false);
 const execute=createOwnerCommandExecutor({executeTask:async actual=>{assert.equal(actual.packageSha256,p.packageSha256);return raw;}});
 const value=await execute({commandId,mode:'stop',baseline:{engine,descriptorSha256}});assert.equal(value.result.nativeOutcomeConfirmed,false);
 for(const patch of [{nativeOutcomeConfirmed:true},{credentialsCopied:true},{commandId:'bad'},{private:'x'},{executionStopped:false}])assert.throws(()=>validateOwnerCommandResult(result(p,patch),p));});
test('failed or unknown result cannot be returned as an executable success',async()=>{const p=prep('stop');for(const patch of [{passed:false,errorCode:'owner-command-unconfirmed'},{executionStopped:false}]){
  const execute=createOwnerCommandExecutor({executeTask:async()=>result(p,patch)});await assert.rejects(()=>execute({commandId,mode:'stop',baseline:{engine,descriptorSha256}}));}});
test('actual worker parses in Windows PowerShell 5 without execution',{skip:process.platform!=='win32'},()=>{const file=fileURLToPath(new URL('./Run-HomeOwnerCommand.ps1',import.meta.url)).replaceAll("'","''");
 const script=`$t=$null;$e=$null;[void][Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$t,[ref]$e);if($e.Count){throw 'parse'};'parsed'`;
 assert.equal(execFileSync('powershell.exe',['-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8'}).trim(),'parsed');});
