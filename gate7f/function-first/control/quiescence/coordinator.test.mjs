import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdmissionOverlay,CaddyQuiescenceCoordinator,configDigest,digest} from './coordinator.mjs';
import {CaddyAdmin} from './caddy-admin.mjs';

const original=Buffer.from('http://127.0.0.1:45001 {\n  reverse_proxy 127.0.0.1:46001\n}\nhttp://127.0.0.1:45002 {\n  respond "unrelated {not-a-block}"\n}\n');
const scopes=[{siteAddress:'http://127.0.0.1:45001',mode:'api'}],upstreams=['127.0.0.1:46001'];
const transitionId='a'.repeat(32);
function fixture(options={}){
  let bytes=Buffer.from(original),config={source:original.toString()},version=0,now=0;
  const records=[],calls={fileWrites:0,reloads:0};
  const file={async read(){return Buffer.from(bytes);},async compareAndSwap(expected,next){
    assert.equal(digest(bytes),expected);calls.fileWrites++;bytes=Buffer.from(next);options.afterFile?.();}};
  const admin={async snapshot(){return {config:structuredClone(config),etag:'"v'+version+'"'};},async adapt(raw){return {source:raw.toString()};},
    async upstreams(){return options.counters?.()??upstreams.map(address=>({address,num_requests:0}));},
    async replace({config:next,etag}){calls.reloads++;assert.equal(etag,'"v'+version+'"');
      if(options.beforeReload)await options.beforeReload();if(options.failBefore)throw Error('lost before');
      config=structuredClone(next);version++;if(options.failAfter)throw Error('lost after');}};
  const coordinator=new CaddyQuiescenceCoordinator({admin,file,journal:{async save(state){records.push(state);}},
    clock:()=>now,pause:async ms=>{now+=ms;},maximumDrainMs:10,pollMs:2,stableSamples:2});
  return {coordinator,records,calls,file,admin,options,read:()=>bytes,config:()=>config,
    setFile(value){bytes=Buffer.from(value);},setConfig(value){config=structuredClone(value);version++;},advance(ms){now+=ms;},
    async prepare(){return coordinator.prepare({transitionId,expectedFileSha256:digest(original),expectedConfigSha256:configDigest({source:original.toString()}),scopes,upstreams});}};
}
test('overlay retains original bytes and unrelated block; input scopes are not mutated',()=>{
  const before=structuredClone(scopes),overlay=buildAdmissionOverlay({originalBytes:original,scopes,transitionId}).toString();
  assert.deepEqual(scopes,before);assert.ok(overlay.endsWith(original.toString().slice(original.toString().indexOf('  reverse_proxy'))));
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
test('lost acknowledgement after actual reload reconciles without a second mutation',async()=>{
  const f=fixture({failAfter:true}),closed=await f.coordinator.closeAdmission(await f.prepare());
  assert.equal(closed.events.at(-1).acknowledgementLost,true);const resumed=await f.coordinator.reconcile(closed);
  assert.equal(resumed.phase,'admission-closed');assert.equal(f.calls.reloads,1);
});
test('lost reload before observation stays unknown until actual successor is visible',async()=>{
  const f=fixture({failBefore:true}),prepared=await f.prepare();await assert.rejects(f.coordinator.closeAdmission(prepared),/uncertain/u);
  const unknown=f.records.at(-1);assert.equal((await f.coordinator.reconcile(unknown)).phase,'needs-reconciliation');
  assert.equal(f.calls.reloads,1);f.setConfig(unknown.overlayConfig);
  assert.equal((await f.coordinator.reconcile(unknown)).phase,'admission-closed');assert.equal(f.calls.reloads,1);
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
  await admin.snapshot();await admin.replace({config:{synthetic:true},etag:'"config-1"'});
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
  await assert.rejects(stale.replace({config:{},etag:'"old"'}),error=>error.code==='quiescence-admin-etag-drift'&&!error.message.includes('private'));
});
