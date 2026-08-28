import test from 'node:test';
import assert from 'node:assert/strict';
import {CaddyQuiescenceCoordinator,configDigest,digest} from '../quiescence/coordinator.mjs';
import {syntheticAssembly} from './deployment.fixtures.mjs';
import {prepareTransaction,recordQuiescence,nextTransactionAction,rollbackTransactionAction,journalReference} from './transaction.mjs';

// Actual coordinator, synthetic in-memory transport only. These tests are not
// Home readiness, live Caddy, deployment or campaign qualification evidence.
async function fixture(){
  const assembly=syntheticAssembly(),{descriptor,descriptorSha256,caddy}=assembly;
  let currentBytes=Buffer.from(caddy.originalBytes),config={text:currentBytes.toString()},version=0,clock=10000,record=null;
  const outcomes=new Map(),calls=[];let heldDirection=null;
  const file={async read(){return Buffer.from(currentBytes);},async compareAndSwap(expected,bytes){
    assert.equal(digest(currentBytes),expected);currentBytes=Buffer.from(bytes);}};
  const admin={async snapshot(){return {config:structuredClone(config),etag:'"v'+version+'"'};},
    async adapt(bytes){return {text:bytes.toString()};},async upstreams(){return [{address:'192.168.50.165:1234',num_requests:0}];},
    async replace({config:next,etag,mutation}){
      assert.equal(etag,'"v'+version+'"');calls.push(structuredClone(mutation));
      if(heldDirection===mutation.direction)throw Error('synthetic transport timeout');
      config=structuredClone(next);version++;
      const result={schemaVersion:'runaai-caddy-mutation-result/v1',...Object.fromEntries(['mutationId','direction','fromConfigSha256','toConfigSha256','expectedEtag'].map(key=>[key,mutation[key]])),
        outcome:'succeeded',completedAt:new Date(clock).toISOString()};outcomes.set(mutation.mutationId,result);return result;
    },async mutationOutcome(id){return outcomes.get(id)??null;}};
  const journal={async load(){return structuredClone(record);},async save(value,{expectedRevision}){
    assert.equal(record?.revision??0,expectedRevision);record=structuredClone(value);}};
  const coordinator=new CaddyQuiescenceCoordinator({admin,file,journal,clock:()=>clock,pause:async ms=>{clock+=ms;},pollMs:1,stableSamples:3});
  const quiescence=await coordinator.prepare({transitionId:descriptor.transitionId,expectedFileSha256:caddy.originalSha256,
    expectedConfigSha256:configDigest(config),scopes:[{siteAddress:'https://192.168.50.169:9761',mode:'api'},
      {siteAddress:'https://runa.bridgebuildersai.com',mode:'api'},{siteAddress:'http://127.0.0.1:9770',mode:'all'}],upstreams:['192.168.50.165:1234']});
  let state=prepareTransaction({descriptor,expectedDescriptorSha256:descriptorSha256,quiescence,latestQuiescence:journalReference(quiescence)});
  const context=()=>({state,descriptor,latest:journalReference(state),latestQuiescence:journalReference(record)});
  return {assembly,coordinator,calls,context,read:()=>record,now:()=>clock,state:()=>state,
    advance(ms){clock+=ms;},hold(direction){heldDirection=direction;},
    accept(value){state=recordQuiescence({...context(),quiescence:value,latestQuiescence:journalReference(record),now:clock});return state;},
    resolveHeld(){const mutation=calls.at(-1);config=structuredClone(mutation.direction==='restore'?record.originalConfig:record.overlayConfig);version++;
      const result={schemaVersion:'runaai-caddy-mutation-result/v1',...Object.fromEntries(['mutationId','direction','fromConfigSha256','toConfigSha256','expectedEtag'].map(key=>[key,mutation[key]])),
        outcome:'succeeded',completedAt:new Date(clock).toISOString()};outcomes.set(mutation.mutationId,result);heldDirection=null;},
  };
}

test('closed/drained Control transaction stops at real missing Home adapter, with exact safe rollback available',async()=>{
  const f=await fixture();assert.equal(nextTransactionAction(f.context()).action,'control.closeAdmission');
  const closed=await f.coordinator.closeAdmission(f.read());f.accept(closed);
  assert.equal(nextTransactionAction(f.context()).action,'control.drain');
  f.accept(await f.coordinator.drain(f.read()));const next=nextTransactionAction(f.context());
  assert.equal(next.status,'blocked');assert.equal(next.code,'native-wide-adapter-not-implemented');
  assert.equal(next.controlQuiescenceIsNotHomeQuiescence,true);assert.equal(next.productionPromoted,false);
  assert.equal(rollbackTransactionAction(f.context()).action,'control.rollback');
  f.accept(await f.coordinator.rollback(f.read()));assert.equal(nextTransactionAction(f.context()).status,'restored');
  assert.equal(nextTransactionAction(f.context()).deploymentCompleted,false);
});

test('unknown admission blocks retry and rollback even when snapshot appears closed',async()=>{
  const f=await fixture();f.hold('admission');await assert.rejects(f.coordinator.closeAdmission(f.read()));f.accept(f.read());
  const next=nextTransactionAction(f.context());assert.equal(next.code,'same-effect-reconciliation-required');
  assert.equal(next.effect.mutationId,f.calls[0].mutationId);assert.equal(next.automaticRetryPermitted,false);
  assert.throws(()=>rollbackTransactionAction(f.context()),/reconcile-before-rollback/u);
  f.resolveHeld();f.accept(await f.coordinator.reconcile(f.read()));assert.equal(nextTransactionAction(f.context()).action,'control.drain');
  assert.equal(f.calls.length,1);
});

test('pending restore remains unknown until exact same request terminates; never becomes quiescent again',async()=>{
  const f=await fixture();f.accept(await f.coordinator.closeAdmission(f.read()));f.accept(await f.coordinator.drain(f.read()));
  f.hold('restore');await assert.rejects(f.coordinator.rollback(f.read()));f.accept(f.read());
  assert.equal(nextTransactionAction(f.context()).effect.direction,'restore');
  f.accept(await f.coordinator.reconcile(f.read()));assert.equal(f.state().phase,'needs-reconciliation');
  assert.throws(()=>rollbackTransactionAction(f.context()));
  f.resolveHeld();f.accept(await f.coordinator.reconcile(f.read()));assert.equal(f.state().phase,'restored');
  assert.equal(nextTransactionAction(f.context()).status,'restored');assert.equal(f.calls.length,2);
});

test('outer state and inner quiescence revision must both be current before any decision',async()=>{
  const f=await fixture(),old=f.context();f.accept(await f.coordinator.closeAdmission(f.read()));
  assert.throws(()=>nextTransactionAction({...f.context(),latest:old.latest}),/journal-stale/u);
  const before=f.context();await f.coordinator.drain(f.read());
  assert.throws(()=>nextTransactionAction({...before,latestQuiescence:journalReference(f.read())}),/quiescence-stale/u);
  assert.throws(()=>rollbackTransactionAction({...before,latestQuiescence:journalReference(f.read())}),/quiescence-stale/u);
});

test('stale zero counters are not transferable native authority',async()=>{
  const f=await fixture();f.accept(await f.coordinator.closeAdmission(f.read()));const idle=await f.coordinator.drain(f.read());f.advance(5001);
  assert.throws(()=>f.accept(idle),/drain-not-fresh-or-proven/u);
});

test('cached Home boolean and listener marker cannot activate an unimplemented path',async()=>{
  const f=await fixture();f.accept(await f.coordinator.closeAdmission(f.read()));f.accept(await f.coordinator.drain(f.read()));
  const result=nextTransactionAction({...f.context(),ready:true,listener:{schemaVersion:'runaai-runtime-worker-listener/v1',port:9776},homeChanged:true});
  assert.equal(result.status,'blocked');assert.equal(f.state().homeChanged,false);
});

test('effect identity/terminal history cannot be rewritten while retaining apparent valid snapshots',async()=>{
  const f=await fixture();f.accept(await f.coordinator.closeAdmission(f.read()));const next=await f.coordinator.drain(f.read());
  const tampered=structuredClone(next);tampered.mutations[0].mutationId='c'.repeat(32);tampered.mutations[0].terminalReceipt.mutationId='c'.repeat(32);
  assert.throws(()=>recordQuiescence({...f.context(),quiescence:tampered,latestQuiescence:journalReference(tampered),now:f.now()}),/terminal-rewrite/u);
});

test('claims that app/Home already changed cannot use the pre-native rollback contract to reopen old routes',async()=>{
  const f=await fixture();const altered={...f.state(),homeChanged:true};
  assert.throws(()=>rollbackTransactionAction({...f.context(),state:altered,latest:journalReference(altered)}),/transaction-state/u);
});
