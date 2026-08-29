import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,link} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {prepareLegacyCompatibilityRequest} from './legacy-contract.mjs';
import {LegacyCompatibilityJournal} from './legacy-journal.mjs';
import {createLegacyCompatibilityAdapter} from './legacy-adapter.mjs';
import {createManagedCallerAdapter} from './managed-callers-adapter.mjs';

const id=n=>n.toString(16).padStart(32,'0'),sha=n=>n.toString(16).padStart(64,'0');
function binding(){return {schemaVersion:'runaai-legacy-compatibility-binding/v1',transitionId:id(1),legacy:{sourceCommit:'a'.repeat(40),configSha256:sha(2),
  modelAlias:'qwen/qwen3-4b',embeddingModel:'text-embedding-nomic-embed-text-v1.5'},control:{endpoint:'127.0.0.1:9771',sourceAddress:'192.168.50.150',
    caddyBinarySha256:sha(3),clientCertificateSha256:sha(4)},home:{endpoint:'192.168.50.165:9777',serverName:'runa-home-legacy.internal',
    serverCertificateSha256:sha(5),nativeEndpoint:'127.0.0.1:1234'},models:{mappedPrimaryId:'qualified-primary',mappedPrimaryFingerprint:sha(6),
    embeddingId:'text-embedding-nomic-embed-text-v1.5',embeddingFingerprint:sha(7)},limits:{requestMs:65000,bodyBytes:2*1024*1024,
    responseBytes:4*1024*1024,maximumOutputTokens:4000,sampleMs:1},privateValuesIncluded:false};}
const request=(body,pathname='/v1/chat/completions')=>({sourceAddress:'192.168.50.150',clientCertificateSha256:sha(4),pathname,method:'POST',raw:Buffer.from(JSON.stringify(body))});
const chat=(extra={})=>({model:'qwen/qwen3-4b',messages:[{role:'system',content:'Be useful.'},{role:'user',content:'Inspect the status.'}],temperature:0.3,max_tokens:2000,...extra});
async function fixture(){const root=await mkdtemp(path.join(tmpdir(),'m1-legacy-')),directory=path.join(root,'journal');await mkdir(directory);
  const value=binding();let now=Date.parse('2026-08-29T01:00:05.000Z'),nextId=100,routeMode='open';const calls=[],events=[];
  const journal=new LegacyCompatibilityJournal({directory,binding:value,assertOwnerPrivate:async()=>{}});
  const runtime={observe:async()=>({schemaVersion:'runaai-legacy-runtime-observation/v1',bindingSha256:journal.bindingSha256,
    observedAt:new Date(now).toISOString(),engineSha256:sha(8),descriptorSha256:sha(9),primaryId:value.models.mappedPrimaryId,
    primaryFingerprint:value.models.mappedPrimaryFingerprint,embeddingId:value.models.embeddingId,embeddingFingerprint:value.models.embeddingFingerprint,
    ready:true,privateValuesIncluded:false})};
  const routeReceipt=(kind,intentId,managedReceiptSha256=null)=>kind==='close'?{schemaVersion:'runaai-legacy-control-route-closure/v1',transitionId:value.transitionId,
    bindingSha256:journal.bindingSha256,intentId,endpoint:value.control.endpoint,terminalReceiptSha256:sha(10),observationSha256:sha(11),
    observedAt:new Date(now).toISOString(),activeRequests:0,privateValuesIncluded:false}:{schemaVersion:'runaai-legacy-control-route-restore/v1',
    transitionId:value.transitionId,bindingSha256:journal.bindingSha256,intentId,managedReceiptSha256,endpoint:value.control.endpoint,
    terminalReceiptSha256:sha(12),observationSha256:sha(13),observedAt:new Date(now).toISOString(),privateValuesIncluded:false};
  const route={close:async({intentId})=>{routeMode='closed';calls.push('route.close');return routeReceipt('close',intentId);},
    assertClosed:async({intentId})=>{assert.equal(routeMode,'closed');return routeReceipt('close',intentId);},
    restore:async({intentId,managedReceiptSha256})=>{routeMode='open';calls.push('route.restore');return routeReceipt('restore',intentId,managedReceiptSha256);}};
  const upstream={request:async item=>{calls.push({kind:'upstream',...item});const body=item.raw.length?JSON.parse(item.raw):null;
    if(item.pathname==='/v1/chat/completions')return {status:200,headers:{'content-type':'application/json'},raw:Buffer.from(JSON.stringify({id:'chat',model:body.model,
      choices:[{message:{role:'assistant',content:'done',tool_calls:body.tools?[{id:'call-1',type:'function',function:{name:'runtime_status',arguments:'{}'}}]:undefined},finish_reason:body.tools?'tool_calls':'stop'}]}))};
    if(item.pathname==='/v1/embeddings')return {status:200,headers:{'content-type':'application/json'},raw:Buffer.from(JSON.stringify({data:body.input.map((_,index)=>({index,embedding:[index,1]}))}))};
    if(item.pathname==='/v1/models')return {status:200,headers:{},raw:Buffer.from(JSON.stringify({data:[{id:value.models.mappedPrimaryId},{id:value.models.embeddingId}]}))};
    return {status:200,headers:{},raw:Buffer.from(JSON.stringify({models:[{key:value.models.mappedPrimaryId,loaded_instances:[{id:value.models.mappedPrimaryId,
      config:{context_length:32768}}]},{key:value.models.embeddingId,loaded_instances:[{id:value.models.embeddingId,config:{context_length:2048}}]}]}))};}};
  const adapter=createLegacyCompatibilityAdapter({binding:value,journal,upstream,runtime,route,clock:()=>now,randomId:()=>id(nextId++),
    delay:async ms=>{now+=ms;await new Promise(resolve=>setImmediate(resolve));},event:value=>events.push(value)});
  return {root,directory,binding:value,journal,runtime,route,upstream,adapter,calls,events,get now(){return now;},set now(value){now=value;},
    get routeMode(){return routeMode;},async close(){await rm(root,{recursive:true,force:true});}};}

test('chat preserves temperature, messages and tools while changing only the exact model alias',async()=>{const f=await fixture();try{
  const tools=[{type:'function',function:{name:'runtime_status',description:'Read status',parameters:{type:'object',properties:{},additionalProperties:false}}}],
    messages=[...chat().messages,{role:'assistant',content:'',tool_calls:[{id:'old-call',type:'function',function:{name:'runtime_status',arguments:'{}'}}]},
      {role:'tool',tool_call_id:'old-call',content:'commit abc'}],body=chat({messages,tools});
  const result=await f.adapter.dispatch(request(body)),upstream=f.calls.find(value=>value.kind==='upstream'),sent=JSON.parse(upstream.raw),reply=JSON.parse(result.raw);
  assert.equal(sent.model,'qualified-primary');assert.equal(sent.temperature,0.3);assert.deepEqual(sent.messages,messages);assert.deepEqual(sent.tools,tools);
  assert.equal(reply.model,'qwen/qwen3-4b');assert.equal(reply.choices[0].message.tool_calls[0].function.name,'runtime_status');
  assert.equal(Object.hasOwn(result.headers,'set-cookie'),false);
}finally{await f.close();}});

test('ordinary, second-opinion, workspace and patch prompts retain their exact legacy message bytes',async()=>{const f=await fixture();try{
  const prompts=['Explain this ordinary question.','Give a second opinion on this plan.','Inspect the disposable workspace status.','Draft a bounded patch without applying it.'];
  for(const content of prompts){const body=chat({messages:[{role:'system',content:'Legacy behavior.'},{role:'user',content}]});await f.adapter.dispatch(request(body));
    const sent=JSON.parse(f.calls.filter(value=>value.kind==='upstream').at(-1).raw);assert.deepEqual(sent.messages,body.messages);}
}finally{await f.close();}});

test('embedding input and output bytes preserve legacy batching and order',async()=>{const f=await fixture();try{
  const body={model:f.binding.legacy.embeddingModel,input:['raw document','query text']},raw=request(body,'/v1/embeddings').raw;
  const result=await f.adapter.dispatch(request(body,'/v1/embeddings')),call=f.calls.find(value=>value.kind==='upstream');
  assert.equal(call.raw.equals(raw),true);assert.deepEqual(JSON.parse(result.raw).data.map(value=>value.index),[0,1]);
}finally{await f.close();}});

test('both discovery routes project only the actual primary back to the legacy alias',async()=>{const f=await fixture();try{
  for(const pathname of ['/v1/models','/api/v1/models']){const result=await f.adapter.dispatch({sourceAddress:f.binding.control.sourceAddress,
      clientCertificateSha256:f.binding.control.clientCertificateSha256,pathname,method:'GET',raw:Buffer.alloc(0)}),body=JSON.parse(result.raw);
    assert.doesNotMatch(result.raw.toString(),/qualified-primary/u);assert.match(result.raw.toString(),/qwen\/qwen3-4b/u);
    assert.match(JSON.stringify(body),/text-embedding-nomic/u);}
}finally{await f.close();}});

test('identity, unknown routes, native mutation, streaming and unknown chat fields deny before upstream',async()=>{const f=await fixture();try{
  const denied=[{...request(chat()),clientCertificateSha256:sha(99)},request(chat(),'/api/v1/models/load'),request({...chat(),stream:true}),
    request({...chat(),ttl:20}),{...request(chat()),pathname:'/v1/chat/completions?x=1'}];
  for(const item of denied)await assert.rejects(f.adapter.dispatch(item));assert.equal(f.calls.filter(value=>value.kind==='upstream').length,0);
}finally{await f.close();}});

test('tool and message schemas remain bounded and malformed content never dispatches',async()=>{const f=await fixture();try{
  const invalid=[chat({messages:[{role:'assistant',content:'',tool_calls:[{id:'x',type:'other',function:{name:'a',arguments:'{}'}}]}]}),
    chat({messages:[{role:'tool',content:'x'}]}),chat({tools:[{type:'function',function:{name:'x',parameters:{},extra:true}}]}),
    chat({max_tokens:4001}),chat({temperature:Infinity})];
  for(const body of invalid)await assert.rejects(f.adapter.dispatch(request(body)));assert.equal(f.calls.filter(value=>value.kind==='upstream').length,0);
}finally{await f.close();}});

test('stale runtime and oversized upstream response fail without a false successful reply',async()=>{const stale=await fixture();try{
  stale.runtime.observe=async()=>({schemaVersion:'runaai-legacy-runtime-observation/v1',bindingSha256:stale.journal.bindingSha256,
    observedAt:new Date(stale.now-5001).toISOString(),engineSha256:sha(8),descriptorSha256:sha(9),primaryId:stale.binding.models.mappedPrimaryId,
    primaryFingerprint:stale.binding.models.mappedPrimaryFingerprint,embeddingId:stale.binding.models.embeddingId,
    embeddingFingerprint:stale.binding.models.embeddingFingerprint,ready:true,privateValuesIncluded:false});
  await assert.rejects(stale.adapter.dispatch(request(chat())),/runtime/u);assert.equal(stale.calls.filter(value=>value.kind==='upstream').length,0);
}finally{await stale.close();}
  const overflow=await fixture();try{overflow.upstream.request=async()=>({status:200,headers:{},raw:Buffer.alloc(overflow.binding.limits.responseBytes+1)});
    await assert.rejects(overflow.adapter.dispatch(request(chat())),/response/u);
  }finally{await overflow.close();}});

test('malformed successful upstream shapes never become compatibility success',async()=>{const f=await fixture();try{
  f.upstream.request=async()=>({status:200,headers:{'content-type':'application/json'},raw:Buffer.from('{}')});
  await assert.rejects(f.adapter.dispatch(request(chat())),/chat-response/u);
  await assert.rejects(f.adapter.dispatch(request({model:f.binding.legacy.embeddingModel,input:['one','two']},'/v1/embeddings')),/embedding-response/u);
  for(const pathname of ['/v1/models','/api/v1/models'])await assert.rejects(f.adapter.dispatch({sourceAddress:f.binding.control.sourceAddress,
    clientCertificateSha256:f.binding.control.clientCertificateSha256,pathname,method:'GET',raw:Buffer.alloc(0)}),/models-response/u);
}finally{await f.close();}});

test('bounded non-success response bytes remain exact and unsafe response headers are removed',async()=>{const f=await fixture();try{
  const raw=Buffer.from('legacy synthetic rate limit\n');f.upstream.request=async()=>({status:429,headers:{'content-type':'text/plain','set-cookie':'secret'},raw});
  const result=await f.adapter.dispatch(request(chat()));assert.equal(result.status,429);assert.equal(result.raw.equals(raw),true);
  assert.deepEqual(result.headers,{'content-type':'text/plain'});
}finally{await f.close();}});

test('close drains an admitted slow request, records three zero samples and denies later dispatch',async()=>{const f=await fixture();try{
  let release,started;const began=new Promise(resolve=>{started=resolve;}),wait=new Promise(resolve=>{release=resolve;});f.upstream.request=undefined;
  const slowUpstream={request:async item=>{started();await wait;return {status:200,headers:{},raw:Buffer.from(JSON.stringify({model:'qualified-primary',choices:[]}))};}};
  const adapter=createLegacyCompatibilityAdapter({binding:f.binding,journal:f.journal,upstream:slowUpstream,runtime:f.runtime,route:f.route,clock:()=>f.now,
    randomId:(()=>{let n=200;return()=>id(n++);})(),delay:async ms=>{f.now+=ms;await new Promise(resolve=>setImmediate(resolve));}});
  const pending=adapter.dispatch(request(chat()));await began;const closing=adapter.close();await new Promise(resolve=>setImmediate(resolve));release();await pending;
  const receipt=await closing;assert.equal(receipt.samples.length,3);assert.equal(receipt.samples.every(value=>value.activeRequests===0),true);
  assert.equal((await adapter.status()).mode,'closed');await assert.rejects(adapter.dispatch(request(chat())),/admission-closed/u);
}finally{await f.close();}});

test('lost close result remains fail-closed across restart and cannot be retried',async()=>{const f=await fixture();try{
  await f.journal.record({type:'close-intent',intentId:id(70),bindingSha256:f.journal.bindingSha256,recordedAt:new Date(f.now).toISOString()});
  const restarted=new LegacyCompatibilityJournal({directory:f.directory,binding:f.binding,assertOwnerPrivate:async()=>{}}),state=await restarted.load();
  assert.equal(state.mode,'closing');await assert.rejects(f.adapter.dispatch(request(chat())),/admission-closed/u);await assert.rejects(f.adapter.close(),/close-state/u);
}finally{await f.close();}});

test('lost restore result remains fail-closed even after the route effect returned',async()=>{const f=await fixture();try{
  const closed=await f.adapter.close(),managedReceiptSha256=sha(75);await f.adapter.linkManaged({managedReceiptSha256,nextReceiptSha256:sha(76),legacyReceiptSha256:closed.terminalReceiptSha256});
  const lossy={bindingSha256:f.journal.bindingSha256,load:()=>f.journal.load(),record:event=>event.type==='restore-result'?Promise.reject(Error('lost-result')):f.journal.record(event)};
  const restarted=createLegacyCompatibilityAdapter({binding:f.binding,journal:lossy,upstream:f.upstream,runtime:f.runtime,route:f.route,clock:()=>f.now,
    randomId:()=>id(77),delay:async ms=>{f.now+=ms;}});
  await assert.rejects(restarted.restore({managedReceiptSha256}),/lost-result/u);assert.equal((await restarted.status()).mode,'restoring');
  await assert.rejects(restarted.dispatch(request(chat())),/admission-closed/u);await assert.rejects(restarted.restore({managedReceiptSha256}),/restore-state/u);
}finally{await f.close();}});

test('unconfirmed Control route closure records unknown and cannot be presented as drained',async()=>{const f=await fixture();try{
  f.route.assertClosed=async()=>({ready:true});await assert.rejects(f.adapter.close(),/route-close/u);const state=await f.journal.load();
  assert.equal(state.mode,'unknown');await assert.rejects(f.adapter.assertFresh());await assert.rejects(f.adapter.dispatch(request(chat())),/admission-closed/u);
}finally{await f.close();}});

test('journal CAS and hardlink checks reject concurrent or replaceable authority records',async()=>{const f=await fixture();try{
  const event={type:'close-intent',intentId:id(71),bindingSha256:f.journal.bindingSha256,recordedAt:new Date(f.now).toISOString()},results=await Promise.allSettled([f.journal.record(event),f.journal.record(event)]);
  assert.equal(results.filter(value=>value.status==='fulfilled').length,1);const file=path.join(f.directory,'000001.json'),alias=path.join(f.directory,'alias.json');await link(file,alias);
  await assert.rejects(f.journal.load(),/(sequence|path-kind)/u);await rm(alias,{force:true});
}finally{await f.close();}});

function nextReceipt(f,intent=id(300)){return {schemaVersion:'runaai-next-provider-closure/v1',transitionId:f.binding.transitionId,authorityId:'next-caddy-v2',intentId:intent,
  terminalReceiptSha256:sha(301),observationSha256:sha(302),observedAt:new Date(f.now).toISOString(),samples:[0,1,2].map(offset=>({observedAt:new Date(f.now-2+offset).toISOString(),numRequests:0})),privateValuesIncluded:false};}
test('managed closure requires both routes and rollback consumes the exact combined receipt',async()=>{const f=await fixture();try{
  let nextMode='open',nextClose=nextReceipt(f),restoreSequence=400;const next={close:async()=>{nextMode='closed';return nextClose;},assertFresh:async()=>nextReceipt(f,nextClose.intentId),
    restore:async({managedReceiptSha256})=>{assert.match(managedReceiptSha256,/^[a-f0-9]{64}$/u);nextMode='open';return {schemaVersion:'runaai-next-provider-closure-restore/v1',
      transitionId:f.binding.transitionId,authorityId:'next-caddy-v2',forwardIntentId:nextClose.intentId,restoreIntentId:id(restoreSequence++),terminalReceiptSha256:sha(401),
      observationSha256:sha(402),observedAt:new Date(f.now).toISOString(),privateValuesIncluded:false};}};
  const nativeObserver={observe:async()=>({callerId:'home-native-1234',endpoint:'192.168.50.165:1234',authorityId:'home-native-observer-v1',intentId:id(410),
    terminalReceiptSha256:sha(411),observationSha256:sha(412),observedAt:new Date(f.now).toISOString(),established:0,engineSha256:sha(413),descriptorSha256:sha(414)})};
  const rerankerObserver={observe:async()=>({callerId:'legacy-reranker-8412',endpoint:'192.168.50.165:8412',authorityId:'legacy-reranker-observer-v1',intentId:id(420),
    terminalReceiptSha256:sha(421),observationSha256:sha(422),observedAt:new Date(f.now).toISOString(),available:true,expectedSha256:sha(423),currentSha256:sha(423)})};
  const managed=createManagedCallerAdapter({transitionId:f.binding.transitionId,next,legacy:f.adapter,nativeObserver,rerankerObserver,clock:()=>f.now}),receipt=await managed.close();
  assert.deepEqual(receipt.entries.map(value=>value.callerId).sort(),['home-native-1234','legacy-embedding-1234','legacy-primary-1234','legacy-reranker-8412','next-provider-9770'].sort());
  assert.equal((await f.adapter.status()).managedReceiptSha256!==null,true);assert.equal((await managed.assertFresh()).entries.length,5);
  const restored=await managed.restore({forwardReceiptSha256:(await f.adapter.status()).managedReceiptSha256});assert.equal(restored.effects.length,2);
  assert.equal((await f.adapter.status()).mode,'open');assert.equal(nextMode,'open');
}finally{await f.close();}});

test('request preparation never accepts a model alias or upstream route from request data',()=>{const value=binding(),prepared=prepareLegacyCompatibilityRequest(value,request(chat()));
  assert.equal(JSON.parse(prepared.raw).model,value.models.mappedPrimaryId);assert.equal(prepared.pathname,'/v1/chat/completions');
  assert.throws(()=>prepareLegacyCompatibilityRequest(value,request({...chat(),model:'other'})));
});
