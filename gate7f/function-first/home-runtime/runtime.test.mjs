import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {QualifiedRuntimeController} from './controller.mjs';
import {createRuntimeProxy} from './proxy.mjs';
import {validateProfile,loadRequest,verifyLoaded,validateRequest,NOMICS,LEASE_POLICY} from './contracts.mjs';

const profile=(id='gemma')=>({schemaVersion:'runaai-qualified-home-profile/v1',candidateId:id,
  appSourceCommit:'1'.repeat(40),runtimeSealSha256:'2'.repeat(64),qualificationGradesSha256:'3'.repeat(64)});
const responses=new Map();
for(const id of ['gemma','coder','qwen36']){
  const events=readFileSync(new URL(`../readiness/evidence/20260828-smoke-${id}-r1/events.jsonl`,import.meta.url),'utf8').trim().split(/\r?\n/).map(JSON.parse);
  for(const event of events.filter(e=>e.type==='load-response'))responses.set(event.key,event.value);
}
function fixture(id='gemma'){
  const values={settings:{justInTimeModelLoading:false,logSensitiveData:false,verbose:false},engine:'engine-process-start-pin',power:260,loaded:[],events:[],loads:[],unloads:[],temperature:40};
  const adapter={
    verifyPins:async()=>{},
    observe:async()=>({observedAt:Date.now(),settings:structuredClone(values.settings),engineIdentity:values.engine,
      hardware:{freeMemoryBytes:32*1024**3,gpus:LEASE_POLICY.gpuUuids.map((uuid,index)=>({index,uuid,name:'Quadro RTX 6000',memoryTotalMiB:23040,memoryUsedMiB:8000,temperatureC:values.temperature,powerLimitWatts:values.power}))},
      inventory:{models:values.loaded.map(v=>({key:v.key,loaded_instances:[{id:v.id,config:structuredClone(v.config)}]}))}}),
    setPower:async watts=>{values.power=watts;},
    load:async request=>{values.loads.push(structuredClone(request));const response=structuredClone(responses.get(request.model));
      assert.ok(response,'retained actual load-response fixture exists');response.instance_id=request.model;
      values.loaded.push({key:request.model,id:request.model,config:structuredClone(response.load_config)});return response;},
    unload:async({instance_id})=>{values.unloads.push(instance_id);values.loaded=values.loaded.filter(v=>v.id!==instance_id);},
    record:async event=>values.events.push(event),
  };
  return {values,adapter,controller:new QualifiedRuntimeController({profile:profile(id),adapter})};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return `http://127.0.0.1:${server.address().port}`;}
async function close(server){await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}

test('three pinned profiles keep exact primary/MTP and Nomic settings; unknown profiles denied',()=>{
  for(const id of ['gemma','coder','qwen36']){const p=validateProfile(profile(id));const request=loadRequest(p);
    assert.equal(request.context_length,32768);assert.equal(request.speculative_draft_mtp,id==='qwen36');
    assert.equal(request.flash_attention,true);assert.equal(request.offload_kv_cache_to_gpu,true);
    verifyLoaded(p,responses.get(p.candidate.key));verifyLoaded(p,responses.get(NOMICS.key),true);
    assert.equal(loadRequest(p,true).context_length,2048);
    const bad=structuredClone(responses.get(p.candidate.key));bad.load_config.context_length=8192;
    assert.throws(()=>verifyLoaded(p,bad),/primary-profile/);
  }
  assert.throws(()=>validateProfile(profile('other')),/candidate/);
  assert.throws(()=>validateProfile({...profile(),extra:true}),/profile-shape/);
});
test('unsafe JIT or logging settings fail before load or power change',async()=>{
  for(const key of ['justInTimeModelLoading','logSensitiveData','verbose']){const f=fixture();f.values.settings[key]=true;
    await assert.rejects(f.controller.start(),/unsafe-server-settings/);assert.equal(f.values.loads.length,0);assert.equal(f.values.power,260);}
});
test('explicit owned startup, idle polling and stop preserve the exact two-model envelope',async()=>{
  const f=fixture();await f.controller.start();assert.equal(f.controller.status.phase,'ready');assert.equal(f.values.power,160);
  assert.deepEqual(f.values.loads.map(v=>v.model),[f.controller.profile.candidate.key,NOMICS.key]);
  assert.equal((await f.controller.poll()).phase,'ready');assert.equal(f.values.loads.length,2,'poll never JIT reloads');
  const ticket=await f.controller.admit();assert.equal(f.controller.status.activeRequests,1);ticket.release();ticket.release();
  await f.controller.stop();assert.equal(f.controller.status.phase,'stopped');assert.equal(f.values.loaded.length,0);assert.equal(f.values.power,260);
});
test('drain prevents admissions and waits for both active requests before unloading',async()=>{
  const f=fixture();await f.controller.start();const one=await f.controller.admit(),two=await f.controller.admit();
  const stopped=f.controller.stop();await settle();assert.equal(f.controller.status.phase,'draining');
  await assert.rejects(f.controller.admit(),/not-ready/);assert.equal(f.values.unloads.length,0);
  one.release();await settle();assert.equal(f.values.unloads.length,0);two.release();await stopped;assert.equal(f.values.unloads.length,2);
});
test('async observation cannot admit a request into a generation that already stopped',async()=>{
  const f=fixture();await f.controller.start();const original=f.adapter.observe;let release;
  f.adapter.observe=async args=>{f.adapter.observe=original;const observed=await original(args);await new Promise(r=>{release=r;});return observed;};
  const admission=f.controller.admit();await settle();await f.controller.stop();release();
  await assert.rejects(admission,/generation-changed/);assert.equal(f.controller.status.activeRequests,0);
});
test('one client cancelling an observation does not unload models or cancel other users',async()=>{
  const f=fixture();await f.controller.start();const other=await f.controller.admit();const external=new AbortController();
  const original=f.adapter.observe;
  f.adapter.observe=async({signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  const admission=f.controller.admit({signal:external.signal});const rejected=assert.rejects(admission);external.abort(Error('client cancelled'));await rejected;
  assert.equal(f.controller.status.phase,'ready');assert.equal(other.signal.aborted,false);assert.equal(f.values.unloads.length,0);
  f.adapter.observe=original;other.release();await f.controller.stop();
});
test('an ambiguous load response never allows original-power restoration or a blind retry',async()=>{
  const f=fixture();let attempts=0;f.adapter.load=async()=>{attempts++;throw Error('connection lost after dispatch');};
  await assert.rejects(f.controller.start());assert.equal(attempts,1);assert.equal(f.values.power,160);
  assert.equal(f.controller.status.ambiguousPendingLoad,f.controller.profile.candidate.key);
  await assert.rejects(f.controller.stop(),/ambiguous-load/);assert.equal(f.values.power,160);assert.equal(attempts,1);
});
test('changed instance is never treated as ours for cleanup; no power restoration with ambiguity',async()=>{
  const f=fixture();await f.controller.start();f.values.loaded[0].config.context_length=8192;
  await f.controller.poll();assert.equal(f.controller.status.phase,'faulted');assert.equal(f.values.unloads.length,0);
  assert.equal(f.values.power,160);await assert.rejects(f.controller.admit(),/not-ready/);
});
test('foreign resident is retained while only the exact owned instances are unloaded',async()=>{
  const f=fixture();await f.controller.start();f.values.loaded.push({key:'foreign',id:'foreign',config:{}});
  await f.controller.poll();assert.deepEqual(f.values.loaded.map(v=>v.id),['foreign']);assert.equal(f.values.power,160);
  assert.equal(f.controller.status.fault,'runtime-cleanup-unconfirmed');
});
test('engine replacement during cleanup prevents unloading reused instance identities',async()=>{
  const f=fixture();await f.controller.start();const original=f.adapter.unload;
  f.adapter.unload=async args=>{await original(args);f.values.engine='restarted-engine';};
  await assert.rejects(f.controller.stop(),/cleanup-engine-changed/);assert.equal(f.values.unloads.length,1);assert.equal(f.values.power,160);
});
test('restored power is observed, not inferred from a successful setter return',async()=>{
  const f=fixture();await f.controller.start();f.adapter.setPower=async()=>{};
  await assert.rejects(f.controller.stop(),/restore-unconfirmed/);assert.equal(f.values.power,160);assert.equal(f.controller.status.phase,'faulted');
});
test('thermal fault aborts existing admissions before owned cleanup',async()=>{
  const f=fixture();await f.controller.start();const ticket=await f.controller.admit();ticket.signal.addEventListener('abort',()=>ticket.release(),{once:true});
  f.values.temperature=85;await f.controller.poll();assert.equal(ticket.signal.aborted,true);assert.equal(f.values.loaded.length,0);
  assert.equal(f.values.power,260);assert.equal(f.controller.status.phase,'faulted');
});
test('freshness, engine epoch and missing residency never trigger a blind reload',async()=>{
  for(const mutation of [f=>{const original=f.adapter.observe;f.adapter.observe=async()=>({...await original(),observedAt:Date.now()-10000});},
    f=>{f.values.engine='replacement-process';},f=>{f.values.loaded.shift();}]){
    const f=fixture();await f.controller.start();mutation(f);await f.controller.poll();assert.equal(f.controller.status.phase,'faulted');assert.equal(f.values.loads.length,2);
  }
});
test('request contract excludes override/JIT/native/MCP/unselected routes without changing accepted bytes',()=>{
  const p=validateProfile(profile());const body={model:p.candidate.key,messages:[{role:'user',content:'hello'}],reasoning_effort:'none'};
  const good=Buffer.from(JSON.stringify(body));validateRequest(p,'/v1/chat/completions','POST',good);
  for(const mutation of [b=>{b.ttl=3600;},b=>{b.model='foreign';},b=>{delete b.reasoning_effort;},b=>{b.stream=true;},b=>{b.integrations=[];}]){
    const bad=structuredClone(body);mutation(bad);assert.throws(()=>validateRequest(p,'/v1/chat/completions','POST',Buffer.from(JSON.stringify(bad))));}
  assert.throws(()=>validateRequest(p,'/api/v1/models/load','POST',good),/endpoint-denied/);
});
test('actual disposable HTTP proxy preserves request/reply bytes and upstream failures; no models executed',async()=>{
  const f=fixture();await f.controller.start();const seen=[];const response=Buffer.from('{\n "choices" : [{"message":{"content":"synthetic receipt"}}]\n}\n');
  let upstreamStatus=200;
  const upstream=createServer(async(req,res)=>{const b=[];for await(const c of req)b.push(c);seen.push(Buffer.concat(b));res.writeHead(upstreamStatus,{'content-type':'application/json'});res.end(response);});
  const upstreamUrl=await listen(upstream);const events=[];const proxy=createRuntimeProxy({controller:f.controller,upstream:upstreamUrl,allowedClients:['127.0.0.1'],event:e=>events.push(e)});
  const proxyUrl=await listen(proxy);
  try{
    const body=Buffer.from('{"model":"gemma-4-26b-a4b-it-qat", "reasoning_effort":"none", "messages":[{"role":"user","content":"synthetic only"}]}\n');
    const reply=await fetch(proxyUrl+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body});
    assert.equal(reply.status,200);assert.deepEqual(Buffer.from(await reply.arrayBuffer()),response);assert.deepEqual(seen,[body]);
    assert.equal(f.controller.status.activeRequests,0);assert.equal(events[0].type,'forwarded');assert.ok(!JSON.stringify(events).includes('synthetic'));
    upstreamStatus=500;const upstreamFailure=await fetch(proxyUrl+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body});
    assert.equal(upstreamFailure.status,500);assert.deepEqual(Buffer.from(await upstreamFailure.arrayBuffer()),response);
    const denied=await fetch(proxyUrl+'/api/v1/models/load',{method:'POST',headers:{'content-type':'application/json'},body});assert.equal(denied.status,503);assert.equal(seen.length,2);
    f.values.loaded[0].config.context_length=1;
    const unavailable=await fetch(proxyUrl+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body});assert.equal(unavailable.status,503);assert.equal(seen.length,2);
  }finally{await close(proxy);await close(upstream);}
});
