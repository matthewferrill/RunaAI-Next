import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {hostname,tmpdir} from 'node:os';
import {execFileSync,spawnSync,spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha} from './tls-primitives.mjs';
import {prepareNativeSettings} from './native-settings.mjs';
import {settingsFileCommand,createSettingsFileBridgeCore,SETTINGS_FILE_TARGET,SETTINGS_TRANSACTION_PARENT} from './native-settings-file-core.mjs';
import {createNativeSettingsFileBridge,SETTINGS_FILE_SOURCES} from './native-settings-file.mjs';
const original=Buffer.from(JSON.stringify({autoStartOnLaunch:true,port:1234,cors:false,logSensitiveData:true,logIncomingTokens:false,
  verbose:true,logLinesLimit:500,networkInterface:'0.0.0.0',justInTimeModelLoading:true,fileLoggingMode:'succinct'})+'\r\n');
function fixture(){
  const prepared=prepareNativeSettings(original,sha(original)),transactionId='a'.repeat(32),events=[],calls=[];
  let current=Buffer.from(original),hook=null;
  const io={verify:async()=>{calls.push('verify');},read:async()=>Buffer.from(current),execute:async command=>{
    calls.push('execute');if(hook)return hook(command);
    const mode=command.args[1],alreadyOriginal=mode==='Restore'&&current.equals(original);
    current=mode==='Swap'?Buffer.from(prepared.rawCandidate):Buffer.from(original);
    return {schemaVersion:'runaai-native-settings-file/v1',mode,transactionId,originalSha256:prepared.originalSha256,
      candidateSha256:prepared.candidateSha256,currentSha256:sha(current),passed:true,targetBound:true,privateValuesIncluded:false,
      inMemoryEnforcementProved:false,admissionOpened:false,actualPreimageRetained:mode!=='Prepare',alreadyOriginal};
  }};
  const options={transactionId,prepared,io,assertMutationSettled:async()=>{},assertQuiescent:async()=>{calls.push('quiescent');},record:async event=>{events.push(event);calls.push('record');}};
  return {prepared,transactionId,io,events,calls,options,setCurrent:value=>{current=value;},setHook:value=>{hook=value;}};
}
test('fixed command projection keeps private candidate off arguments and has no arbitrary path or action',()=>{
  const f=fixture(),command=settingsFileCommand({...f,mode:'Prepare'});
  assert.equal(command.args.includes(original.toString()),false);assert.equal(command.args.includes(f.prepared.rawCandidate.toString('base64')),false);
  assert.deepEqual(Buffer.from(command.input.toString(),'base64'),f.prepared.rawCandidate);
  assert.equal(SETTINGS_FILE_TARGET,'C:\\Users\\Matthew\\.lmstudio\\.internal\\http-server-config.json');
  assert.equal(SETTINGS_TRANSACTION_PARENT,'C:\\AI\\RunaAI-Next-HomeRuntime-Transactions');
  for(const patch of [{mode:'Delete'},{mode:'Swap',expectedCurrentSha256:'b'.repeat(64)},{mode:'Restore'},
    {mode:'Prepare',transactionId:'../bad'}])assert.throws(()=>settingsFileCommand({...f,...patch}));
});
test('bridge construction is inert and verified operations require two fresh quiescence checks around intent',async()=>{
  const f=fixture(),bridge=createSettingsFileBridgeCore(f.options);assert.equal(f.calls.length,0);
  await assert.rejects(()=>bridge.swapFile(),/not-verified|replay-or-busy/);await bridge.verify();
  await bridge.prepareFileIntent(f.prepared);await bridge.swapFile();
  const result=await bridge.restoreFile({expectedCurrentSha256:f.prepared.candidateSha256,alreadyOriginal:false});
  assert.equal(result.currentSha256,f.prepared.originalSha256);assert.deepEqual(await bridge.readSettings(),original);
  for(let i=0;i<f.calls.length;i++)if(f.calls[i]==='execute')assert.deepEqual(f.calls.slice(i-3,i),['quiescent','record','quiescent']);
  const publicText=JSON.stringify(f.events);assert.equal(publicText.includes(original.toString()),false);
  assert.equal(publicText.includes(f.prepared.rawCandidate.toString('base64')),false);
});
test('unknown mutation remains unconfirmed with sanitized error and no automatic or repeated dispatch',async()=>{
  const f=fixture(),bridge=createSettingsFileBridgeCore(f.options);await bridge.verify();
  f.setHook(async()=>{throw Object.assign(Error('PRIVATE '+original),{stdout:original,input:original});});
  await assert.rejects(()=>bridge.prepareFileIntent(f.prepared),error=>{
    assert.equal(error.message,'runtime-settings-file-command-unconfirmed');assert.equal(error.cause,undefined);return true;});
  await assert.rejects(()=>bridge.prepareFileIntent(f.prepared),/replay-or-busy/);
  await assert.rejects(()=>bridge.swapFile(),/replay-or-busy/);
  await assert.rejects(()=>bridge.restoreFile({expectedCurrentSha256:f.prepared.originalSha256,alreadyOriginal:true}),/replay-or-busy/);
  assert.equal(f.calls.filter(value=>value==='execute').length,1);assert.equal(JSON.stringify(f.events).includes('PRIVATE'),false);
  assert.equal(f.events.at(-1).unknownOutcome,true);
});

test('stopped-but-unknown child still blocks restore and verify cannot reset the uncertainty',async()=>{
  const f=fixture(),bridge=createSettingsFileBridgeCore(f.options);await bridge.verify();
  f.setHook(async()=>{throw Object.assign(Error('closed without outcome'),{executionStopped:true});});
  await assert.rejects(()=>bridge.swapFile(),/command-unconfirmed/);
  assert.equal(f.events.at(-1).executionStopped,true);await bridge.verify();
  await assert.rejects(()=>bridge.restoreFile({expectedCurrentSha256:f.prepared.originalSha256,alreadyOriginal:true}),/replay-or-busy/);
  assert.equal(f.calls.filter(value=>value==='execute').length,1);
});

test('new settings bridge cannot bypass a retained unresolved operation or omit the durable barrier',async()=>{
  const f=fixture();assert.throws(()=>createSettingsFileBridgeCore({...f.options,assertMutationSettled:undefined}),/settings-file-bridge/);
  f.options.assertMutationSettled=async()=>{if(f.events.some(event=>event.type==='native-settings-file-intent'))throw Error('durable unresolved');};
  let bridge=createSettingsFileBridgeCore(f.options);await bridge.verify();
  f.setHook(async()=>{throw Error('lost result');});await assert.rejects(()=>bridge.swapFile(),/command-unconfirmed/);
  bridge=createSettingsFileBridgeCore(f.options);await bridge.verify();
  await assert.rejects(()=>bridge.restoreFile({expectedCurrentSha256:f.prepared.originalSha256,alreadyOriginal:true}),/durable unresolved/);
  assert.equal(f.calls.filter(value=>value==='execute').length,1);
});

test('actual delayed settings child cannot race a compensating restore after an unknown result',async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'runa-settings-child-')),target=path.join(directory,'settings.json');
  const f=fixture();writeFileSync(target,original);let child,closed,dispatches=0;
  const childSource=`import{writeFileSync}from'node:fs';
    process.once('message',value=>{if(value!=='release')process.exit(2);
      writeFileSync(process.argv[1],Buffer.from(process.argv[2],'base64'));process.disconnect();});
    process.send('armed');setTimeout(()=>process.exit(3),3000).unref();`;
  f.io.read=async()=>readFileSync(target);
  f.io.execute=async command=>{
    dispatches++;
    if(command.args[1]==='Swap'){
      child=spawn(process.execPath,['--input-type=module','-e',childSource,target,f.prepared.rawCandidate.toString('base64')],
        {windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
      closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code));});
      await new Promise((resolve,reject)=>{child.once('message',value=>value==='armed'?resolve():reject(Error('bad fixture')));child.once('error',reject);});
      // Model a returned timeout whose exact child is still demonstrably alive. No runtime native
      // process, settings file, model or secret is involved: this is a disposable local Node child.
      throw Object.assign(Error('unconfirmed live fixture'),{executionStopped:false});
    }
    writeFileSync(target,original);
    return {schemaVersion:'runaai-native-settings-file/v1',mode:'Restore',transactionId:f.transactionId,
      originalSha256:f.prepared.originalSha256,candidateSha256:f.prepared.candidateSha256,currentSha256:f.prepared.originalSha256,
      passed:true,targetBound:true,privateValuesIncluded:false,inMemoryEnforcementProved:false,admissionOpened:false,
      actualPreimageRetained:true,alreadyOriginal:true};
  };
  const bridge=createSettingsFileBridgeCore(f.options);
  try{
    await bridge.verify();await assert.rejects(()=>bridge.swapFile(),/command-unconfirmed/);
    assert.equal(child.exitCode,null);assert.equal(f.events.at(-1).executionStopped,false);
    assert.deepEqual(await bridge.readSettings(),original);
    await assert.rejects(()=>bridge.restoreFile({expectedCurrentSha256:f.prepared.originalSha256,alreadyOriginal:true}),/replay-or-busy/);
    assert.equal(dispatches,1);child.send('release');assert.equal(await closed,0);
    assert.deepEqual(readFileSync(target),f.prepared.rawCandidate);
    // A later exit and matching candidate still do not establish a durable reconciled operation.
    await assert.rejects(()=>bridge.restoreFile({expectedCurrentSha256:f.prepared.candidateSha256,alreadyOriginal:false}),/replay-or-busy/);
    assert.equal(dispatches,1);
  }finally{
    if(child?.exitCode===null)child.kill();if(closed)await closed.catch(()=>{});
    rmSync(directory,{recursive:true,force:true});
  }
});
test('stale baseline, changed preparation, unrelated restore and code drift stop before file command',async()=>{
  for(const kind of ['baseline','prepared','restore','pins']){
    const f=fixture(),bridge=createSettingsFileBridgeCore(f.options);await bridge.verify();
    if(kind==='baseline')f.setCurrent(Buffer.from('{}'));
    if(kind==='restore'){const value=JSON.parse(f.prepared.rawCandidate);value.logLinesLimit=600;f.setCurrent(Buffer.from(JSON.stringify(value)));}
    if(kind==='pins')f.io.verify=async()=>{throw Error('pin drift');};
    if(kind==='restore')await assert.rejects(()=>bridge.restoreFile({expectedCurrentSha256:f.prepared.candidateSha256,alreadyOriginal:false}));
    else if(kind==='prepared'){const value=JSON.parse(original);value.logLinesLimit=600;const bytes=Buffer.from(JSON.stringify(value));
      await assert.rejects(()=>bridge.prepareFileIntent(prepareNativeSettings(bytes,sha(bytes))),/preparation-drift/);}
    else await assert.rejects(()=>bridge.swapFile());
    assert.equal(f.calls.includes('execute'),false);
  }
});
test('lost final quiescence denies dispatch and no in-memory permission claims native idle',async()=>{
  const f=fixture();let checks=0;f.options.assertQuiescent=async()=>{if(++checks===2)throw Error('lost native drain');};
  const bridge=createSettingsFileBridgeCore(f.options);await bridge.verify();await assert.rejects(()=>bridge.swapFile(),/lost native drain/);
  assert.equal(f.calls.includes('execute'),false);assert.equal(f.events.length,1);
});
test('already-original restore still dispatches conflict-aware recovery and rejects stale expected hash',async()=>{
  const f=fixture(),bridge=createSettingsFileBridgeCore(f.options);await bridge.verify();
  await assert.rejects(()=>bridge.restoreFile({expectedCurrentSha256:f.prepared.candidateSha256,alreadyOriginal:true}),/stale-restore/);
  const result=await bridge.restoreFile({expectedCurrentSha256:f.prepared.originalSha256,alreadyOriginal:true});
  assert.equal(result.alreadyOriginal,true);assert.equal(f.calls.filter(value=>value==='execute').length,1);
});
test('receipt mismatch or post-command mutation never confirms a settings operation',async()=>{
  for(const kind of ['receipt','drift']){
    const f=fixture(),bridge=createSettingsFileBridgeCore(f.options);await bridge.verify();const real=f.io.execute;
    f.io.execute=async command=>{const result=await real(command);if(kind==='receipt')result.transactionId='b'.repeat(32);else f.setCurrent(Buffer.from('{}'));return result;};
    await assert.rejects(()=>bridge.prepareFileIntent(f.prepared),/unconfirmed|post-command-drift/);
    assert.equal(f.events.some(event=>event.confirmed===true),false);
    f.setCurrent(Buffer.from(original));
    await assert.rejects(()=>bridge.restoreFile({expectedCurrentSha256:f.prepared.originalSha256,alreadyOriginal:true}),/replay-or-busy/);
    assert.equal(f.calls.filter(value=>value==='execute').length,1);
  }
});
test('real bridge rejects non-Home use and additional path overrides without any read or mutation',async()=>{
  const f=fixture(),codePins=Object.fromEntries(SETTINGS_FILE_SOURCES.map(name=>[name,sha(readFileSync(new URL('./'+name,import.meta.url)))]));
  const options={transactionId:f.transactionId,prepared:f.prepared,codePins,assertMutationSettled:async()=>{},assertQuiescent:async()=>{},record:async()=>{}};
  assert.throws(()=>createNativeSettingsFileBridge({...options,target:'C:\\other'}),/options/);
  const bridge=createNativeSettingsFileBridge(options);
  if(hostname().toUpperCase()!=='RUNA-HOME')await assert.rejects(()=>bridge.verify(),/settings-file-host/);
});
test('actual PowerShell5 parser accepts fixed bridge and script refuses wrong host before stdin or path mutation',{skip:process.platform!=='win32'},()=>{
  const source=fileURLToPath(new URL('./Invoke-NativeSettingsFile.ps1',import.meta.url));
  const command=`$t=$null;$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${source.replaceAll("'","''")}',[ref]$t,[ref]$e);if($e.Count){throw 'parse'};'parsed'`;
  assert.equal(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],
    {encoding:'utf8',timeout:10000,windowsHide:true}).trim(),'parsed');
  const raw=readFileSync(source,'utf8');assert.ok(raw.indexOf("$env:COMPUTERNAME-cne'RUNA-HOME'")<raw.indexOf('[Console]::OpenStandardInput'));
  assert.ok(raw.includes('Repair-InterruptedSettingsSwap $directory'));assert.equal(raw.includes('Remove-Item'),false);
  if(hostname().toUpperCase()!=='RUNA-HOME'){
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',source,
      '-Mode','Prepare','-TransactionId','e'.repeat(32),'-ExpectedOriginalSha256','a'.repeat(64),'-ExpectedCandidateSha256','b'.repeat(64)],
      {encoding:'utf8',input:'PRIVATE-invalid-input',timeout:10000,windowsHide:true,
        env:{...process.env,PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'}});
    assert.equal(result.error,undefined);assert.equal(result.status,1);
    assert.equal(JSON.parse(result.stdout).errorCode,'settings-file-host-authority');assert.equal(result.stderr,'');
    assert.equal(result.stdout.includes('PRIVATE'),false);
  }
});
