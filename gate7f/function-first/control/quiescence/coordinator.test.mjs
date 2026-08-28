import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdmissionOverlay,CaddyQuiescenceCoordinator,configDigest,digest} from './coordinator.mjs';
import {CaddyAdmin} from './caddy-admin.mjs';

const original=Buffer.from('http://127.0.0.1:45001 {\n  reverse_proxy 127.0.0.1:46001\n}\nhttp://127.0.0.1:45002 {\n  respond "unrelated {not-a-block}"\n}\n');
const scopes=[{siteAddress:'http://127.0.0.1:45001',mode:'api'}],upstreams=['127.0.0.1:46001'];
const transitionId='a'.repeat(32);
function fixture(options={}){
  let bytes=Buffer.from(original),config={source:original.toString()},version=0,now=0;
  const records=[],calls={fileWrites:0,reloads:0},outcomes=new Map(),mutations=[];
  const file={async read(){return Buffer.from(bytes);},async compareAndSwap(expected,next){
    assert.equal(digest(bytes),expected);calls.fileWrites++;bytes=Buffer.from(next);options.afterFile?.();}};
  const admin={async snapshot(){return {config:structuredClone(config),etag:'"v'+version+'"'};},async adapt(raw){return {source:raw.toString()};},
    async upstreams(){return options.counters?.()??upstreams.map(address=>({address,num_requests:0}));},
    async mutationOutcome(id){return structuredClone(outcomes.get(id)??null);},
    async replace({config:next,etag,mutation}){calls.reloads++;mutations.push(structuredClone(mutation));assert.equal(etag,'"v'+version+'"');
      if(options.beforeReload)await options.beforeReload();if(options.failBefore)throw Error('lost before');
      config=structuredClone(next);version++;
      const receipt={schemaVersion:'runaai-caddy-mutation-result/v1',...mutation,outcome:'succeeded',completedAt:new Date(now).toISOString()};
      outcomes.set(mutation.mutationId,receipt);if(options.failAfter)throw Error('lost after');return receipt;}};
  const journal={async load(){return structuredClone(records.at(-1)??null);},async save(state,{expectedRevision}){
    assert.equal((records.at(-1)?.revision??0),expectedRevision,'quiescence-journal-stale');records.push(structuredClone(state));}};
  const constructor={admin,file,journal,
    clock:()=>now,pause:async ms=>{now+=ms;},maximumDrainMs:10,pollMs:2,stableSamples:2};
  const coordinator=new CaddyQuiescenceCoordinator(constructor);
  return {coordinator,records,calls,file,admin,options,constructor,mutations,outcomes,read:()=>bytes,config:()=>config,
    setFile(value){bytes=Buffer.from(value);},setConfig(value){config=structuredClone(value);version++;},advance(ms){now+=ms;},
    async prepare(){return coordinator.prepare({transitionId,expectedFileSha256:digest(original),expectedConfigSha256:configDigest({source:original.toString()}),scopes,upstreams});}};
}
test('overlay retains original bytes and unrelated block; input scopes are not mutated',()=>{
  const before=structuredClone(scopes),overlay=buildAdmissionOverlay({originalBytes:original,scopes,transitionId}).toString();
  assert.deepEqual(scopes,before);assert.ok(overlay.endsWith(original.toString().slice(original.toString().indexOf('http://127.0.0.1:45002'))));
  assert.match(overlay,/route \{\n    respond @runa_m1_maintenance_[a-f0-9]+ "Runa maintenance [a-f0-9]+" 503\n    handle \{/u);
  assert.ok(overlay.includes('reverse_proxy 127.0.0.1:46001\n'));
  assert.match(overlay,/path \/api\/\* \/health\/\*/u);assert.equal((overlay.match(/Runa maintenance /gu)??[]).length,1);
});
for(const [name,change] of [
 ['missing site',()=>({scopes:[{siteAddress:'http://127.0.0.1:45003',mode:'api'}]})],
 ['duplicate scope',()=>({scopes:[...scopes,...scopes]})],['invalid mode',()=>({scopes:[{...scopes[0],mode:'all-hosts'}]})],
 ['shared site',()=>({originalBytes:Buffer.from(original.toString().replace('http://127.0.0.1:45001 {','http://127.0.0.1:45001, other.example {'))})],
 ['duplicate site',()=>({originalBytes:Buffer.concat([original,original])})],['external import',()=>({originalBytes:Buffer.concat([Buffer.from('import other.conf\n'),original])})],
])test('overlay rejects '+name,()=>assert.throws(()=>buildAdmissionOverlay({originalBytes:original,scopes,transitionId,...change()}),/quiescence-/u));
test('prepare is effect free and full close/drain/restore retains exact original authority',async()=>{
  const f=fixture(),prepared=await f.prepare();assert.deepEqual(f.calls,{fileWrites:0,reloads:0});
  const closed=await f.coordinator.closeAdmission(prepared),idle=await f.coordinator.drain(closed);
  assert.equal(idle.phase,'control-quiescent');assert.equal(idle.homeQuiescenceProved,false);
  assert.equal(idle.scope,'selected-caddy-proxied-requests-only');
  const restored=await f.coordinator.rollback(idle);assert.equal(restored.phase,'restored');
  assert.deepEqual(f.read(),original);assert.deepEqual(f.config(),{source:original.toString()});
});
test('positive active counters must finish and stable zero samples cannot be assumed',async()=>{
  let counter=0;const f=fixture({counters:()=>[{address:upstreams[0],num_requests:counter++<4?1:0}]});
  const closed=await f.coordinator.closeAdmission(await f.prepare()),idle=await f.coordinator.drain(closed);
  assert.equal(idle.phase,'control-quiescent');assert.ok(idle.events.some(event=>event.counters?.[0].num_requests===1));
  assert.equal(idle.events.at(-1).stableZeroSamples,2);
});
test('bounded drain timeout restores known original state and never yields quiescence',async()=>{
  const f=fixture({counters:()=>[{address:upstreams[0],num_requests:1}]});const closed=await f.coordinator.closeAdmission(await f.prepare());
  await assert.rejects(f.coordinator.drain(closed),/quiescence-drain-timeout/u);
  assert.equal(f.records.at(-1).phase,'restored');assert.deepEqual(f.read(),original);
  assert.ok(!f.records.some(state=>state.phase==='control-quiescent'));
});
test('zero counters observed after the deadline never produce late quiescence',async()=>{
  const f=fixture(),closed=await f.coordinator.closeAdmission(await f.prepare());
  const originalUpstreams=f.admin.upstreams;
  f.admin.upstreams=async options=>{assert.ok(options.maximumMs<=10);f.advance(11);return originalUpstreams();};
  await assert.rejects(f.coordinator.drain(closed),/quiescence-drain-timeout/u);
  assert.ok(!f.records.some(state=>state.phase==='control-quiescent'));assert.equal(f.records.at(-1).phase,'restored');
});
for(const values of [[],[{address:upstreams[0],num_requests:-1}],[{address:upstreams[0],num_requests:0},{address:upstreams[0],num_requests:0}]]){
  test('missing, invalid or duplicate counter is not zero',async()=>{
    const f=fixture(),closed=await f.coordinator.closeAdmission(await f.prepare());f.options.counters=()=>values;
    await assert.rejects(f.coordinator.drain(closed),/quiescence-counter-/u);
    assert.ok(!f.records.some(state=>state.phase==='control-quiescent'));
  });
}
test('stale file or runtime rejects admission before an effect',async()=>{
  for(const kind of ['file','runtime']){const f=fixture(),state=await f.prepare();
    if(kind==='file')f.setFile('foreign');else f.setConfig({foreign:true});
    await assert.rejects(f.coordinator.closeAdmission(state),/quiescence-predecessor-drift/u);assert.deepEqual(f.calls,{fileWrites:0,reloads:0});}
});
test('runtime change after file write is retained and never replaced',async()=>{
  const f=fixture(),state=await f.prepare();f.options.afterFile=()=>f.setConfig({foreign:true});
  await assert.rejects(f.coordinator.closeAdmission(state),/quiescence-runtime-drift/u);
  assert.deepEqual(f.config(),{foreign:true});assert.equal(f.calls.reloads,0);assert.equal(f.records.at(-1).phase,'needs-reconciliation');
});
test('file change after CAS is retained and the old overlay is not sent to runtime',async()=>{
  const f=fixture(),state=await f.prepare();f.options.afterFile=()=>f.setFile('foreign');
  await assert.rejects(f.coordinator.closeAdmission(state),/quiescence-file-drift/u);
  assert.equal(f.read().toString(),'foreign');assert.equal(f.calls.reloads,0);assert.equal(f.records.at(-1).phase,'needs-reconciliation');
});
test('lost acknowledgement after actual reload requires its exact retained terminal receipt',async()=>{
  const f=fixture({failAfter:true});await assert.rejects(f.coordinator.closeAdmission(await f.prepare()),/uncertain/u);
  const resumed=await f.coordinator.reconcile(f.records.at(-1));
  assert.equal(resumed.phase,'admission-closed');assert.equal(f.calls.reloads,1);
});
test('lost reload stays unknown when only its successor snapshot becomes visible',async()=>{
  const f=fixture({failBefore:true}),prepared=await f.prepare();await assert.rejects(f.coordinator.closeAdmission(prepared),/uncertain/u);
  const unknown=f.records.at(-1);assert.equal((await f.coordinator.reconcile(unknown)).phase,'needs-reconciliation');
  assert.equal(f.calls.reloads,1);f.setConfig(unknown.overlayConfig);
  assert.equal((await f.coordinator.reconcile(f.records.at(-1))).phase,'needs-reconciliation');assert.equal(f.calls.reloads,1);
});
test('uncertain admission cannot be rolled back before read-back reconciliation',async()=>{
  const f=fixture({failBefore:true}),prepared=await f.prepare();await assert.rejects(f.coordinator.closeAdmission(prepared),/uncertain/u);
  const unknown=f.records.at(-1),before=structuredClone(f.calls);
  await assert.rejects(f.coordinator.rollback(unknown),/quiescence-reconcile-required/u);assert.deepEqual(f.calls,before);
  f.setConfig(unknown.overlayConfig);f.options.failBefore=false;
  const mutation=f.mutations.at(-1);f.outcomes.set(mutation.mutationId,{schemaVersion:'runaai-caddy-mutation-result/v1',...mutation,outcome:'succeeded',completedAt:new Date(0).toISOString()});
  const reconciled=await f.coordinator.reconcile(unknown);await f.coordinator.rollback(reconciled);
  assert.deepEqual(f.read(),original);
});
test('restart reconciliation re-observes counters rather than inheriting a quiescent label',async()=>{
  const f=fixture(),closed=await f.coordinator.closeAdmission(await f.prepare()),idle=await f.coordinator.drain(closed);
  const restored=structuredClone(idle);f.options.counters=()=>[{address:upstreams[0],num_requests:1}];
  assert.equal((await f.coordinator.reconcile(restored)).phase,'admission-closed');
});
test('rollback never overwrites a foreign file or runtime',async()=>{
  for(const kind of ['file','runtime']){const f=fixture(),state=await f.coordinator.closeAdmission(await f.prepare()),before=structuredClone(f.calls);
    if(kind==='file')f.setFile('foreign');else f.setConfig({foreign:true});
    await assert.rejects(f.coordinator.rollback(state),/quiescence-rollback-drift/u);assert.deepEqual(f.calls,before);}
});
test('state byte or adapted-config tampering is rejected',async()=>{
  const f=fixture(),state=await f.prepare();for(const field of ['originalBase64','overlayBase64','originalConfigSha256','overlayConfigSha256']){
    const bad=structuredClone(state);bad[field]='bad';await assert.rejects(f.coordinator.reconcile(bad),/quiescence-/u);}
});
test('admin endpoint stays loopback with bounded requests and exact ETag',async()=>{
  assert.throws(()=>new CaddyAdmin({baseUrl:'http://192.168.50.169:2019'}),/boundary/u);
  const calls=[],admin=new CaddyAdmin({baseUrl:'http://127.0.0.1:2019',fetchImpl:async(url,init)=>{
    calls.push({url,...init});return new Response('{}',{status:200,headers:{etag:'"config-1"'}});}});
  await admin.snapshot();await admin.replace(adminMutation({synthetic:true},'"config-1"'));
  assert.equal(calls[1].headers['if-match'],'"config-1"');assert.equal(calls[1].redirect,'error');assert.ok(calls[1].signal);
  assert.equal(calls[1].headers.origin,'http://127.0.0.1:2019');
  await assert.rejects(admin.request('POST','/stop'),/quiescence-admin-route-denied/u);
  await assert.rejects(admin.request('DELETE','/config/'),/quiescence-admin-route-denied/u);
  assert.equal(calls.length,2);
});
test('admin rejects response caps and stale ETags without exposing bodies',async()=>{
  const capped=new CaddyAdmin({baseUrl:'http://127.0.0.1:2019',maximumBytes:1,fetchImpl:async()=>new Response('private value')});
  await assert.rejects(capped.snapshot(),/quiescence-admin-response-cap/u);
  const stale=new CaddyAdmin({baseUrl:'http://127.0.0.1:2019',fetchImpl:async()=>new Response('private value',{status:412})});
  const receipt=await stale.replace(adminMutation({},'"old"'));assert.equal(receipt.outcome,'rejected');assert.ok(!JSON.stringify(receipt).includes('private'));
});
function adminMutation(config,etag,id='b'.repeat(32)){
  return {config,etag,mutation:{mutationId:id,direction:'admission',fromConfigSha256:'0'.repeat(64),toConfigSha256:configDigest(config),expectedEtag:etag}};
}

for(const contents of [
  'custom_plugin foo\n',
  'respond "before"\n  tls internal\n',
  'respond "before"\n  @later path /example\n',
  'handle {\n    import unsafe.conf\n  }\n',
])test('unsupported or interleaved site grammar rejects before effects: '+contents.trim(),()=>{
  assert.throws(()=>buildAdmissionOverlay({originalBytes:Buffer.from('http://127.0.0.1:45001 {\n  '+contents+'}\n'),scopes,transitionId}),/quiescence-/u);
});

function terminal(mutation,overrides={}){
  return {schemaVersion:'runaai-caddy-mutation-result/v1',...mutation,outcome:'succeeded',completedAt:new Date(0).toISOString(),...overrides};
}
test('delayed restore cannot become closed or quiescent from an old-overlay snapshot',async()=>{
  const f=fixture(),closed=await f.coordinator.closeAdmission(await f.prepare());f.options.failBefore=true;
  await assert.rejects(f.coordinator.rollback(closed),/quiescence-restore-uncertain/u);
  const unknown=f.records.at(-1);assert.equal(unknown.mutations.at(-1).direction,'restore');
  const reconciled=await f.coordinator.reconcile(unknown);assert.equal(reconciled.phase,'needs-reconciliation');
  await assert.rejects(f.coordinator.drain(reconciled),/quiescence-reconcile-required/u);
  await assert.rejects(f.coordinator.drain(closed),/quiescence-journal-stale/u);
  await assert.rejects(f.coordinator.rollback(reconciled),/quiescence-reconcile-required/u);
  assert.equal(f.calls.reloads,2);assert.ok(!f.records.some(state=>state.phase==='control-quiescent'));
  // A later current snapshot still cannot prove that exact HTTP operation ended.
  f.setConfig(unknown.originalConfig);
  assert.equal((await f.coordinator.reconcile(f.records.at(-1))).phase,'needs-reconciliation');
  const mutation=f.mutations.at(-1);f.outcomes.set(mutation.mutationId,terminal(mutation));
  const restored=await f.coordinator.reconcile(f.records.at(-1));assert.equal(restored.phase,'restored');
  assert.deepEqual(f.read(),original);assert.equal(f.calls.reloads,2);
});

for(const field of ['mutationId','direction','fromConfigSha256','toConfigSha256','expectedEtag']){
  test('terminal result with different '+field+' cannot resolve the pending restore',async()=>{
    const f=fixture(),closed=await f.coordinator.closeAdmission(await f.prepare());f.options.failBefore=true;
    await assert.rejects(f.coordinator.rollback(closed),/uncertain/u);
    const mutation=f.mutations.at(-1);f.outcomes.set(mutation.mutationId,terminal(mutation,{[field]:'different'}));
    const resumed=await f.coordinator.reconcile(f.records.at(-1));assert.equal(resumed.phase,'needs-reconciliation');
    assert.equal(f.calls.reloads,2);assert.ok(!f.records.some(state=>state.phase==='control-quiescent'));
  });
}
test('restart without a retained terminal HTTP result remains unknown after commit',async()=>{
  const f=fixture(),closed=await f.coordinator.closeAdmission(await f.prepare());f.options.failAfter=true;
  await assert.rejects(f.coordinator.rollback(closed),/uncertain/u);f.outcomes.clear();
  const restarted=new CaddyQuiescenceCoordinator(f.constructor);
  const state=await restarted.reconcile(f.records.at(-1));assert.equal(state.phase,'needs-reconciliation');
  await assert.rejects(restarted.drain(state),/reconcile-required/u);assert.equal(f.calls.reloads,2);
});
test('terminal receipt persisted before restart resolves to restored without another admin mutation',async()=>{
  const f=fixture(),closed=await f.coordinator.closeAdmission(await f.prepare());
  const originalCas=f.file.compareAndSwap;f.file.compareAndSwap=async()=>{throw Error('crash before file restore');};
  await assert.rejects(f.coordinator.rollback(closed),/crash before file restore/u);
  assert.equal(f.records.at(-1).mutations.at(-1).status,'succeeded');f.outcomes.clear();f.file.compareAndSwap=originalCas;
  const restarted=new CaddyQuiescenceCoordinator(f.constructor),restored=await restarted.reconcile(f.records.at(-1));
  assert.equal(restored.phase,'restored');assert.equal(f.calls.reloads,2);assert.deepEqual(f.read(),original);
});
test('unresolved restore held concurrently denies stale drain and no second restore dispatches',async()=>{
  const f=fixture(),closed=await f.coordinator.closeAdmission(await f.prepare());let release;
  f.options.beforeReload=()=>new Promise(resolve=>{release=resolve;});
  const pending=f.coordinator.rollback(closed);
  while(!release)await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(f.coordinator.drain(closed),/quiescence-journal-stale/u);
  await assert.rejects(f.coordinator.rollback(closed),/quiescence-journal-stale/u);
  release();assert.equal((await pending).phase,'restored');assert.equal(f.calls.reloads,2);
});
test('failed mutation-intent persistence prevents admin dispatch',async()=>{
  const f=fixture(),closed=await f.coordinator.closeAdmission(await f.prepare()),prior=f.constructor.journal.save;
  f.constructor.journal.save=async(state,options)=>{if(state.mutations.at(-1)?.direction==='restore')throw Error('disk unavailable');return prior(state,options);};
  await assert.rejects(f.coordinator.rollback(closed),/disk unavailable/u);assert.equal(f.calls.reloads,1);
});
test('old v1 state and same-revision forged status never inherit v2 authority',async()=>{
  const f=fixture(),closed=await f.coordinator.closeAdmission(await f.prepare());
  await assert.rejects(f.coordinator.drain({...closed,schemaVersion:'runaai-caddy-quiescence/v1'}),/state-invalid/u);
  await assert.rejects(f.coordinator.drain({...closed,phase:'control-quiescent'}),/journal-stale/u);
});
test('a terminal rejected admission restores only the known original bytes without resending',async()=>{
  const f=fixture();f.admin.replace=async({mutation})=>{f.calls.reloads++;return terminal(mutation,{outcome:'rejected'});};
  await assert.rejects(f.coordinator.closeAdmission(await f.prepare()),/quiescence-admin-rejected/u);
  const state=await f.coordinator.reconcile(f.records.at(-1));assert.equal(state.phase,'restored');
  assert.deepEqual(f.read(),original);assert.equal(f.calls.reloads,1);
});
test('a terminal rejected restore can return to a freshly observed closed admission',async()=>{
  const f=fixture(),closed=await f.coordinator.closeAdmission(await f.prepare());
  f.admin.replace=async({mutation})=>{f.calls.reloads++;return terminal(mutation,{outcome:'rejected'});};
  await assert.rejects(f.coordinator.rollback(closed),/quiescence-admin-rejected/u);
  const state=await f.coordinator.reconcile(f.records.at(-1));assert.equal(state.phase,'admission-closed');
  assert.equal((await f.coordinator.drain(state)).phase,'control-quiescent');assert.equal(f.calls.reloads,2);
});
test('synthetic late fetch completion yields only the exact bound terminal receipt',async()=>{
  let release;
  const admin=new CaddyAdmin({baseUrl:'http://127.0.0.1:2019',operationMs:1000,mutationWaitMs:10,
    fetchImpl:async()=>new Promise(resolve=>{release=()=>resolve(new Response('{}'));})});
  const input=adminMutation({},'"e"');await assert.rejects(admin.replace(input),/uncertain/u);
  assert.equal(await admin.mutationOutcome(input.mutation.mutationId),null);
  release();await new Promise(resolve=>setImmediate(resolve));
  const receipt=await admin.mutationOutcome(input.mutation.mutationId);assert.equal(receipt.outcome,'succeeded');
  assert.equal(receipt.mutationId,input.mutation.mutationId);assert.equal(receipt.toConfigSha256,configDigest({}));
  await assert.rejects(admin.replace(input),/duplicate-or-cap/u);
});
