import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer,request as httpRequest} from 'node:http';
import {connect} from 'node:net';
import {once} from 'node:events';
import {QualifiedRuntimeController} from './controller.mjs';
import {createRuntimeProxy} from './proxy.mjs';
import {validateProfile,loadRequest,verifyLoaded,validateRequest,NOMICS,LEASE_POLICY,RUNTIME_LIMITS} from './contracts.mjs';

const profile=(id='gemma')=>({schemaVersion:'runaai-qualified-home-profile/v1',candidateId:id,
  appSourceCommit:'1'.repeat(40),runtimeSealSha256:'2'.repeat(64),qualificationGradesSha256:'3'.repeat(64)});
const responses=new Map();
for(const id of ['gemma','coder','qwen36']){
  const events=readFileSync(new URL(`../readiness/evidence/20260828-smoke-${id}-r1/events.jsonl`,import.meta.url),'utf8').trim().split(/\r?\n/).map(JSON.parse);
  for(const event of events.filter(e=>e.type==='load-response'))responses.set(event.key,event.value);
}
function fixture(id='gemma'){
  const values={settings:{justInTimeModelLoading:false,logSensitiveData:false,verbose:false,dynamicRemoteMcpServer:'deny',pluginUse:'deny'},engine:'engine-process-start-pin',power:260,loaded:[],events:[],loads:[],unloads:[],temperature:40};
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
test('native MCP capability drift closes startup and active admissions without adding tool authority',async()=>{
  for(const key of ['dynamicRemoteMcpServer','pluginUse']){
    const f=fixture();f.values.settings[key]='allowAll';await assert.rejects(f.controller.start(),/unsafe-native-mcp/);
    assert.equal(f.values.loads.length,0);assert.equal(f.values.power,260);
    const active=fixture();await active.controller.start();active.values.settings[key]='allowAll';
    await assert.rejects(active.controller.admit(),/unsafe-native-mcp/);assert.equal(active.controller.status.phase,'faulted');
    assert.equal(active.values.loaded.length,0);
  }
});

test('live cleanup never restores higher power after unsafe settings or stale cleanup observation',async()=>{
  for(const [name,value]of [['justInTimeModelLoading',true],['logSensitiveData',true],['verbose',true],
    ['dynamicRemoteMcpServer','allowAll'],['pluginUse','allowAll']]){
    const f=fixture();await f.controller.start();f.values.settings[name]=value;
    await f.controller.poll();assert.equal(f.controller.status.phase,'faulted');
    assert.equal(f.values.loaded.length,0,'only exact observed owned instances were removed');
    assert.equal(f.values.power,160,'unsafe settings never permit the higher ceiling');
    assert.ok(!f.values.events.some(event=>event.type==='cleanup-complete'));
  }
  const f=fixture();await f.controller.start();const original=f.adapter.observe;
  f.adapter.observe=async()=>({...await original(),observedAt:Date.now()-10000});
  await assert.rejects(f.controller.stop(),/cleanup-stale-observation/);assert.equal(f.values.power,160);
});

test('a returned identity without a verified observed fingerprint cannot authorize live unload',async()=>{
  const f=fixture();const original=f.adapter.load;
  f.adapter.load=async request=>{const response=await original(request);response.load_config.context_length=1;return response;};
  await assert.rejects(f.controller.start(),/primary-profile/);
  assert.equal(f.values.loads.length,1);assert.equal(f.values.unloads.length,0);assert.equal(f.values.power,160);
  assert.ok(!f.values.events.some(event=>event.type==='owned'||event.type==='cleanup-complete'));
  await assert.rejects(f.controller.stop(),/cleanup-ownership/);
});
test('explicit owned startup, idle polling and stop preserve the exact two-model envelope',async()=>{
  const f=fixture();await f.controller.start();assert.equal(f.controller.status.phase,'ready');assert.equal(f.values.power,160);
  assert.deepEqual(f.values.loads.map(v=>v.model),[f.controller.profile.candidate.key,NOMICS.key]);
  assert.equal((await f.controller.poll()).phase,'ready');assert.equal(f.values.loads.length,2,'poll never JIT reloads');
  const ticket=await f.controller.admit();assert.equal(f.controller.status.activeRequests,1);ticket.release();ticket.release();
  await f.controller.stop();assert.equal(f.controller.status.phase,'stopped');assert.equal(f.values.loaded.length,0);assert.equal(f.values.power,260);
});
test('cancelling startup before native state changes stops without loading or inventing cleanup ownership',async()=>{
  const f=fixture();f.adapter.verifyPins=async(_profile,{signal})=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
  const start=f.controller.start();const rejected=assert.rejects(start,/startup-cancelled/);
  await f.controller.stop();await rejected;assert.equal(f.controller.status.phase,'stopped');
  assert.equal(f.values.loads.length,0);assert.equal(f.values.unloads.length,0);assert.equal(f.values.power,260);
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
  const p=validateProfile(profile());const body={model:p.candidate.key,max_tokens:512,temperature:0,messages:[{role:'user',content:'hello'}],reasoning_effort:'none'};
  const good=Buffer.from(JSON.stringify(body));validateRequest(p,'/v1/chat/completions','POST',good);
  for(const mutation of [b=>{b.ttl=3600;},b=>{b.model='foreign';},b=>{delete b.reasoning_effort;},b=>{b.stream=true;},b=>{b.integrations=[];},
    b=>{delete b.max_tokens;},b=>{b.max_tokens=1537;},b=>{b.max_tokens=-1;},b=>{b.max_tokens=1.5;},b=>{b.max_tokens=null;},
    b=>{b.temperature=1;},b=>{b.top_p=0.9;},b=>{b.tools=[];},b=>{b.max_completion_tokens=20000;},b=>{b.messages[0].tool_calls=[];}]){
    const bad=structuredClone(body);mutation(bad);assert.throws(()=>validateRequest(p,'/v1/chat/completions','POST',Buffer.from(JSON.stringify(bad))));}
  assert.throws(()=>validateRequest(p,'/api/v1/models/load','POST',good),/endpoint-denied/);
  validateRequest(p,'/v1/chat/completions','POST',Buffer.from(JSON.stringify({...body,max_tokens:1536})));
  const embedded={model:NOMICS.key,input:['search_document: synthetic']};
  validateRequest(p,'/v1/embeddings','POST',Buffer.from(JSON.stringify(embedded)));
  for(const b of [{...embedded,dimensions:123},{...embedded,input:['unprefixed']},{...embedded,input:['search_query: '+'x'.repeat(1600)]},
    {...embedded,input:['search_query: '+'각'.repeat(400)]}])
    assert.throws(()=>validateRequest(p,'/v1/embeddings','POST',Buffer.from(JSON.stringify(b))));
  const rerank={query:'synthetic',documents:['synthetic document'],top_n:1};
  validateRequest(p,'/rerank','POST',Buffer.from(JSON.stringify(rerank)));
  for(const b of [{...rerank,documents:Array(33).fill('text'),top_n:33},{...rerank,documents:['x'.repeat(2001)]},
    {...rerank,top_n:0},{...rerank,model:'foreign'},{...rerank,query:'x'.repeat(4001)}])
    assert.throws(()=>validateRequest(p,'/rerank','POST',Buffer.from(JSON.stringify(b))));
});

test('BGE fixed routes use only their loopback backend and preserve exact bodies and failure statuses',async()=>{
  const f=fixture();await f.controller.start();let primaryCalls=0;const seen=[];let status=200;
  const primary=createServer((_req,res)=>{primaryCalls++;res.end('{}');});
  const bge=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);seen.push({path:req.url,body:Buffer.concat(chunks)});
    res.writeHead(status,{'content-type':'application/json'});res.end(req.url==='/health'?' {"ok":true} ':' {"results":[{"index":0,"score":1}]} ');});
  const proxy=createRuntimeProxy({controller:f.controller,upstream:await listen(primary),rerankerUpstream:await listen(bge),allowedClients:['127.0.0.1']});
  const url=await listen(proxy);
  try{
    const body=Buffer.from(' {"query":"synthetic", "documents":["synthetic window"],"top_n":1}\n');
    const result=await fetch(url+'/rerank',{method:'POST',headers:{'content-type':'application/json'},body});
    assert.equal(result.status,200);assert.equal(await result.text(),' {"results":[{"index":0,"score":1}]} ');assert.deepEqual(seen[0].body,body);
    const health=await fetch(url+'/health');assert.equal(await health.text(),' {"ok":true} ');assert.equal(primaryCalls,0);
    status=503;const failed=await fetch(url+'/rerank',{method:'POST',headers:{'content-type':'application/json'},body});assert.equal(failed.status,503);
    assert.equal(seen.length,3);assert.equal(f.controller.status.activeRequests,0);
  }finally{await close(proxy);await close(primary);await close(bge);await f.controller.stop();}
});
test('actual disposable HTTP proxy preserves request/reply bytes and upstream failures; no models executed',async()=>{
  const f=fixture();await f.controller.start();const seen=[];const response=Buffer.from('{\n "choices" : [{"message":{"content":"synthetic receipt"}}]\n}\n');
  let upstreamStatus=200;
  const upstream=createServer(async(req,res)=>{const b=[];for await(const c of req)b.push(c);seen.push(Buffer.concat(b));res.writeHead(upstreamStatus,{'content-type':'application/json'});res.end(response);});
  const upstreamUrl=await listen(upstream);const events=[];const proxy=createRuntimeProxy({controller:f.controller,upstream:upstreamUrl,allowedClients:['127.0.0.1'],event:e=>events.push(e)});
  const proxyUrl=await listen(proxy);
  try{
    const body=Buffer.from('{"model":"gemma-4-26b-a4b-it-qat", "max_tokens":512,"temperature":0,"reasoning_effort":"none", "messages":[{"role":"user","content":"synthetic only"}]}\n');
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

test('qualified 60-second answer admission is not clipped by the outer proxy deadline (fake clock)',async t=>{
  const f=fixture();await f.controller.start();let finish;const accepted=new Promise(resolve=>{finish=resolve;});let upstreamReply;
  const upstream=createServer(async(req,res)=>{for await(const _ of req){}upstreamReply=res;finish();});
  const proxy=createRuntimeProxy({controller:f.controller,upstream:await listen(upstream),allowedClients:['127.0.0.1']});
  const url=await listen(proxy);t.mock.timers.enable({apis:['setTimeout']});
  try{
    const result=new Promise((resolve,reject)=>{const req=httpRequest(url+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'}},async res=>{
      const chunks=[];for await(const chunk of res)chunks.push(chunk);resolve({status:res.statusCode,body:Buffer.concat(chunks).toString()});});
      req.on('error',reject);req.end(JSON.stringify({model:f.controller.profile.candidate.key,max_tokens:512,temperature:0,reasoning_effort:'none',messages:[{role:'user',content:'synthetic'}]}));});
    await accepted;t.mock.timers.tick(60000);await settle();assert.equal(f.controller.status.activeRequests,1);
    assert.equal(RUNTIME_LIMITS.requestMs,65000);assert.ok(RUNTIME_LIMITS.drainMs>RUNTIME_LIMITS.requestMs);
    upstreamReply.writeHead(200,{'content-type':'application/json'});upstreamReply.end('{"synthetic":true}');
    assert.deepEqual(await result,{status:200,body:'{"synthetic":true}'});assert.equal(f.controller.status.activeRequests,0);
  }finally{t.mock.timers.reset();await close(proxy);await close(upstream);await f.controller.stop();}
});

test('a real incomplete HTTP request body is destroyed on its bounded deadline, with no admission',async t=>{
  const f=fixture();await f.controller.start();let calls=0;const events=[];
  const proxy=createRuntimeProxy({controller:f.controller,allowedClients:['127.0.0.1'],fetchImpl:async()=>{calls++;throw Error('unexpected');},event:e=>events.push(e)});
  const url=new URL(await listen(proxy));t.mock.timers.enable({apis:['setTimeout']});
  const socket=connect({host:'127.0.0.1',port:Number(url.port)});socket.on('error',()=>{});
  try{
    await once(socket,'connect');const received=once(proxy,'request');
    socket.write('POST /v1/chat/completions HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{');
    await received;await settle();const ended=once(socket,'close');t.mock.timers.tick(RUNTIME_LIMITS.bodyMs);await ended;await settle();
    assert.equal(calls,0);assert.equal(f.controller.status.activeRequests,0);assert.equal(events.length,1);
    assert.equal(events[0].code,'runtime-request-body-timeout');
  }finally{t.mock.timers.reset();socket.destroy();await close(proxy);await f.controller.stop();}
});
