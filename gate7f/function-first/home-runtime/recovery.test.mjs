import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseOwnershipJournal,recoverOwnedRuntime} from './recovery.mjs';
import {QualifiedRuntimeController} from './controller.mjs';
import {LEASE_POLICY,loadRequest,validateProfile} from './contracts.mjs';
const profile={schemaVersion:'runaai-qualified-home-profile/v1',candidateId:'gemma',appSourceCommit:'1'.repeat(40),
  runtimeSealSha256:'2'.repeat(64),qualificationGradesSha256:'3'.repeat(64)};
const retained=readFileSync(new URL('../readiness/evidence/20260828-smoke-gemma-r1/events.jsonl',import.meta.url),'utf8').trim().split(/\r?\n/).map(JSON.parse);
const responses=new Map(retained.filter(event=>event.type==='load-response').map(event=>[event.key,event.value]));
const bytes=events=>Buffer.from(events.map(event=>JSON.stringify(event)+'\n').join(''));
async function fixture(){
  const state={events:[],resident:[],power:260,engine:'known-engine-epoch',unloaded:[],adopted:[],powerCalls:[]};
  const adapter={verifyPins:async()=>{},record:async event=>state.events.push(event),
    observe:async()=>({observedAt:Date.now(),engineIdentity:state.engine,settings:{justInTimeModelLoading:false,logSensitiveData:false,verbose:false,dynamicRemoteMcpServer:'deny',pluginUse:'deny'},
      hardware:{freeMemoryBytes:32*1024**3,gpus:LEASE_POLICY.gpuUuids.map((uuid,index)=>({index,uuid,name:'Quadro RTX 6000',memoryTotalMiB:23040,memoryUsedMiB:8000,temperatureC:40,powerLimitWatts:state.power}))},
      inventory:{models:state.resident.map(item=>({key:item.key,loaded_instances:[{id:item.id,config:structuredClone(item.config)}]}))}}),
    load:async request=>{const response=structuredClone(responses.get(request.model));response.instance_id=request.model;state.resident.push({key:request.model,id:request.model,config:response.load_config});return response;},
    unload:async({instance_id})=>{state.unloaded.push(instance_id);state.resident=state.resident.filter(item=>item.id!==instance_id);},
    setPower:async value=>{state.powerCalls.push(value);state.power=value;},
    adoptRecoveredOwnership:async value=>state.adopted.push(value)};
  const controller=new QualifiedRuntimeController({profile,adapter});await controller.start();state.powerCalls=[];
  return {state,adapter,controller,recover:()=>recoverOwnedRuntime({rawJournal:bytes(state.events),profile,adapter,verifyStopped:async()=>true})};
}
test('protected journal recovery consumes actual controller events and unloads only exact owned identities',async()=>{
  const f=await fixture();assert.equal(parseOwnershipJournal(bytes(f.state.events),profile).phase,'ready');
  const result=await f.recover();assert.deepEqual(result,{closed:true,clean:true,unloaded:2,restored:true});
  assert.equal(f.state.adopted.length,2);assert.equal(f.state.resident.length,0);assert.deepEqual(f.state.powerCalls,[260]);
  assert.equal(parseOwnershipJournal(bytes(f.state.events),profile).phase,'clean');
  assert.deepEqual(await f.recover(),{closed:true,clean:true,unloaded:0,restored:false});assert.equal(f.state.unloaded.length,2);
});
test('partial, malformed, reordered, different-profile journals fail before any recovery mutation',async()=>{
  const f=await fixture();const raw=bytes(f.state.events);
  for(const candidate of [raw.subarray(0,-1),Buffer.from('bad\n'),bytes([...f.state.events].reverse()),bytes(f.state.events.map(event=>({...event,profileSha256:'f'.repeat(64)})))]){
    await assert.rejects(recoverOwnedRuntime({rawJournal:candidate,profile,adapter:f.adapter,verifyStopped:async()=>true}));
  }
  assert.deepEqual(f.state.unloaded,[]);assert.deepEqual(f.state.powerCalls,[]);
});
test('lost load response and returned identity without observed fingerprint remain closed at160W',async()=>{
  for(const lastType of ['load-intent','load-returned']){
    const f=await fixture();const last=f.state.events.findIndex(event=>event.type===lastType);f.state.events=f.state.events.slice(0,last+1);
    await assert.rejects(f.recover(),lastType==='load-intent'?/ambiguous-load/:/fingerprint/);
    assert.deepEqual(f.state.unloaded,[]);assert.deepEqual(f.state.powerCalls,[]);assert.equal(f.state.power,160);
  }
});
test('engine/config identity drift never authorizes an unload',async()=>{
  for(const change of ['engine','config']){
    const f=await fixture();if(change==='engine')f.state.engine='different';else f.state.resident[0].config.context_length=8192;
    await assert.rejects(f.recover(),change==='engine'?/engine-changed/:/fingerprint/);assert.deepEqual(f.state.unloaded,[]);
    assert.deepEqual(f.state.powerCalls,[]);
  }
});
test('foreign residency is retained and prevents higher-power restoration after owned cleanup',async()=>{
  const f=await fixture();f.state.resident.push({key:'foreign',id:'not-ours',config:{}});
  await assert.rejects(f.recover(),/unexpected-residency/);assert.equal(f.state.unloaded.length,2);
  assert.deepEqual(f.state.resident.map(item=>item.id),['not-ours']);assert.deepEqual(f.state.powerCalls,[]);
});
test('both old processes must be independently stopped before pin reads or any native operation',async()=>{
  const f=await fixture();let read=false;f.adapter.verifyPins=async()=>{read=true;};
  await assert.rejects(recoverOwnedRuntime({rawJournal:bytes(f.state.events),profile,adapter:f.adapter,verifyStopped:async()=>false}),/processes-still-live/);
  assert.equal(read,false);assert.deepEqual(f.state.unloaded,[]);assert.deepEqual(f.state.powerCalls,[]);
});
test('unsafe settings or stale observations reject recovery before mutation and before260W restoration',async()=>{
  for(const field of ['justInTimeModelLoading','logSensitiveData','verbose']){
    const f=await fixture();const observe=f.adapter.observe;f.adapter.observe=async()=>{const value=await observe();value.settings[field]=true;return value;};
    await assert.rejects(f.recover(),/unsafe-server-settings/);assert.equal(f.state.unloaded.length,0);assert.deepEqual(f.state.powerCalls,[]);
  }
  const stale=await fixture();const staleObserve=stale.adapter.observe;stale.adapter.observe=async()=>({...await staleObserve(),observedAt:0});
  await assert.rejects(stale.recover(),/stale-observation/);assert.equal(stale.state.unloaded.length,0);
  const drift=await fixture();const observe=drift.adapter.observe;drift.adapter.observe=async()=>{
    const value=await observe();if(drift.state.resident.length===0)value.settings.justInTimeModelLoading=true;return value;};
  await assert.rejects(drift.recover(),/unsafe-server-settings/);assert.equal(drift.state.unloaded.length,2);assert.deepEqual(drift.state.powerCalls,[]);
});
test('already absent owned instance is reconciled without repeating an unload; clean state is not permission to repair drift',async()=>{
  const f=await fixture();const disappeared=f.state.resident.shift().id;await f.recover();
  assert.equal(f.state.unloaded.includes(disappeared),false);assert.equal(f.state.unloaded.length,1);
  f.state.resident.push({key:'foreign',id:'new',config:{}});await assert.rejects(f.recover(),/clean-state-drift/);
});
test('an intent before the first load permits power restoration only at unchanged engine and zero residency',async()=>{
  const f=await fixture();f.state.events=f.state.events.slice(0,1);f.state.resident=[];
  assert.equal((await f.recover()).unloaded,0);assert.deepEqual(f.state.powerCalls,[260]);
  const started=structuredClone(f.state.events[0]);
  const request=loadRequest(validateProfile(profile));
  assert.throws(()=>parseOwnershipJournal(bytes([started,{...started,type:'load-intent',key:request.model,request,engineIdentity:'not-allowed'}]),profile),/event-shape/);
});
