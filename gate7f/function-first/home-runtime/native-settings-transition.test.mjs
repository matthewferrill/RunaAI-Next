import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNativeSettings} from './native-settings.mjs';
import {applyNativeSettingsTransition,restoreNativeSettingsTransition} from './native-settings-transition.mjs';
import {sha,NOMICS} from './contracts.mjs';
function fixture(){
  const original=Buffer.from(JSON.stringify({autoStartOnLaunch:true,port:1234,cors:false,logSensitiveData:true,logIncomingTokens:false,
    verbose:true,logLinesLimit:500,networkInterface:'0.0.0.0',justInTimeModelLoading:true,fileLoggingMode:'succinct'})+'\r\n');
  const prepared=prepareNativeSettings(original,sha(original)),calls=[],events=[];
  let settings=original,addresses=['0.0.0.0'],held=false;
  const baseline={schemaVersion:'runaai-native-server-observation/v1',observedAt:Date.now(),internalPort:50000,descriptorSha256:'a'.repeat(64),
    engine:{pid:42,startedAt:'2026-08-28T12:00:00.000Z',executable:'C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\LM Studio.exe'},http:{addresses,established:0}};
  const adapter={withOwnership:async fn=>{assert.equal(held,false);held=true;try{return await fn();}finally{held=false;}},
    assertQuiescent:async()=>{assert.equal(held,true);calls.push('quiescent');},assertHardwareLease:async()=>{assert.equal(held,true);calls.push('hardware');},
    readSettings:async()=>Buffer.from(settings),prepareFileIntent:async()=>calls.push('prepare'),
    swapFile:async()=>{calls.push('swap');settings=prepared.rawCandidate;},
    restoreFile:async()=>{calls.push('restore');settings=prepared.rawOriginal;},
    observeServer:async()=>({...baseline,observedAt:Date.now(),http:{addresses:[...addresses],established:0}}),
    commandServer:async(mode,{bind})=>{calls.push(mode);addresses=mode==='stop'?[]:[bind];},
    probeNonresidentNomic:async()=>{calls.push('probe');return{modelKey:NOMICS.key,artifactSha256:NOMICS.sha256,availableBefore:true,
      beforeResidentIds:[],afterResidentIds:[],status:400,denialReason:'model-not-loaded-jit-disabled',inferenceResponsePresent:false,engineUnchanged:true,hardwareLeaseHealthy:true,rawResponseSha256:'b'.repeat(64)};},
    record:async event=>{events.push(event);},closeAdmission:async()=>{calls.push('closed');}};
  return {prepared,baseline,adapter,transactionId:'f'.repeat(32),calls,events,setSettings:value=>{settings=value;}};
}
test('finite transition records intent before effects and does not equate file bytes to enforcement',async()=>{
  const f=fixture(),result=await applyNativeSettingsTransition(f);assert.equal(result.passed,true);
  assert.deepEqual(f.calls.filter(name=>['prepare','stop','swap','start','probe'].includes(name)),['prepare','stop','swap','start','probe']);
  assert.equal(result.stage,'jit-denial-proved');assert.equal(result.admissionOpened,false);assert.equal(result.powerRestored,false);
  const probe=f.events.find(event=>event.type==='transition-jit-negative-intent');assert.equal(probe.modelKey,NOMICS.key);assert.equal(probe.timeoutMs,10000);
});
test('unrelated baseline drift fails before a native server command',async()=>{
  const f=fixture();f.setSettings(Buffer.from('{}'));assert.equal((await applyNativeSettingsTransition(f)).passed,false);
  assert.equal(f.calls.includes('stop'),false);assert.equal(f.calls.at(-1),'closed');
});
test('lost quiescence or hardware guard prevents effects and never opens admission',async()=>{
  for(const name of ['assertQuiescent','assertHardwareLease']){const f=fixture();f.adapter[name]=async()=>{throw Error('lost');};
    const result=await applyNativeSettingsTransition(f);assert.equal(result.passed,false);assert.equal(result.stage,'entry');assert.equal(f.calls.includes('stop'),false);}
});
test('unknown native mutation is not retried or silently compensated',async()=>{
  const f=fixture();f.adapter.commandServer=async()=>{f.calls.push('uncertain-stop');throw Error('timeout');};
  const result=await applyNativeSettingsTransition(f);assert.equal(result.passed,false);assert.equal(result.stage,'prepared');
  assert.equal(f.calls.filter(name=>name==='uncertain-stop').length,1);assert.equal(f.calls.includes('swap'),false);assert.equal(f.calls.includes('restore'),false);
});
test('denial of an unavailable model or any resident after the real JIT probe is not a pass',async()=>{
  for(const change of [{availableBefore:false},{afterResidentIds:['unexpected']},{beforeResidentIds:''},{status:200},{status:503},
    {denialReason:'service-unavailable'},{engineUnchanged:false},{hardwareLeaseHealthy:false}]){
    const f=fixture(),probe=f.adapter.probeNonresidentNomic;f.adapter.probeNonresidentNomic=async(...args)=>({...await probe(...args),...change});
    const result=await applyNativeSettingsTransition(f);assert.equal(result.passed,false);assert.equal(result.stage,'jit-probe-dispatched');
    assert.equal(result.powerRestored,false);assert.equal(f.calls.includes('restore'),false);}
});
test('explicit restore rechecks current bytes, retains closed admission and never raises power',async()=>{
  const f=fixture();assert.equal((await applyNativeSettingsTransition(f)).passed,true);f.calls.length=0;
  f.baseline.observedAt=1000; // Persisted identity is deliberately old; observeServer returns fresh.
  const result=await restoreNativeSettingsTransition(f);assert.equal(result.passed,true);assert.equal(result.admissionOpened,false);assert.equal(result.powerRestored,false);
  assert.deepEqual(f.calls.filter(name=>['stop','restore','start'].includes(name)),['stop','restore','start']);
  assert.equal(sha(await f.adapter.readSettings()),f.prepared.originalSha256);
});
test('foreign edit prevents restore before stopping the server',async()=>{
  const f=fixture();await applyNativeSettingsTransition(f);f.calls.length=0;
  const foreign=JSON.parse(f.prepared.rawCandidate);foreign.logLinesLimit=600;f.setSettings(Buffer.from(JSON.stringify(foreign)));
  await assert.rejects(()=>restoreNativeSettingsTransition(f),/unowned-drift/);assert.equal(f.calls.includes('stop'),false);assert.equal(f.calls.includes('restore'),false);
});
