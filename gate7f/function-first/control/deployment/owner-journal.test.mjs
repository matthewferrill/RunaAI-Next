import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile,writeFile,link} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {OwnerDeploymentJournal,ownerJournalHash} from './owner-journal.mjs';

const id=n=>n.toString(16).padStart(32,'0'),sha=n=>n.toString(16).padStart(64,'0');
const binding={schemaVersion:'runaai-owner-deployment-binding/v1',transitionId:id(1),descriptorSha256:sha(2),packageSha256:sha(3)};
const at=n=>`2026-08-29T00:00:${String(n).padStart(2,'0')}.000Z`;
async function fixture(){const root=await mkdtemp(path.join(tmpdir(),'m1-owner-journal-')),directory=path.join(root,'journal');await mkdir(directory);
  const options={directory,binding,assertOwnerPrivate:async value=>assert.equal(value,directory)};
  return {root,directory,journal:new OwnerDeploymentJournal(options),restart:()=>new OwnerDeploymentJournal(options)};}
const writer=(writerId=id(10))=>({type:'writer-intent',writerId,transitionId:binding.transitionId,startedAt:at(1)});
const dispatch=(writerId=id(10),operationId=id(11))=>({type:'dispatch-intent',writerId,transitionId:binding.transitionId,operationId,
  requestSha256:sha(12),descriptorSha256:binding.descriptorSha256,packageSha256:binding.packageSha256,deadline:at(50)});
const dispatchResult=(status='closed-deployment-complete')=>({type:'dispatch-result',writerId:id(10),transitionId:binding.transitionId,operationId:id(11),
  requestSha256:sha(12),descriptorSha256:binding.descriptorSha256,packageSha256:binding.packageSha256,status,resultSha256:sha(13),recordedAt:at(3)});

test('restart reconstructs exact writer dispatch and terminal state',async()=>{const f=await fixture();try{
  await f.journal.record(writer());await f.journal.record(dispatch());await f.journal.record(dispatchResult());
  await f.journal.record({type:'writer-result',writerId:id(10),transitionId:binding.transitionId,outcome:'succeeded',recordedAt:at(4)});
  const value=await f.restart().load();assert.equal(value.revision,4);assert.equal(value.pendingWriter,null);assert.equal(value.pendingDispatch,null);
  assert.equal(value.writers[id(10)].status,'succeeded');assert.equal(value.dispatches[id(11)].status,'succeeded');
}finally{await rm(f.root,{recursive:true,force:true});}});

test('lost dispatch result and writer result remain unresolved across restart',async()=>{const f=await fixture();try{
  await f.journal.record(writer());await f.journal.record(dispatch());await f.journal.record(dispatchResult('needs-reconciliation'));
  await f.journal.record({type:'writer-result',writerId:id(10),transitionId:binding.transitionId,outcome:'unknown',recordedAt:at(4)});
  const value=await f.restart().load();assert.equal(value.pendingWriter,id(10));assert.equal(value.pendingDispatch,id(11));
  assert.equal(value.writers[id(10)].status,'unknown');assert.equal(value.dispatches[id(11)].status,'unknown');
  await assert.rejects(()=>f.restart().record(writer(id(20))),/writer-intent/u);
}finally{await rm(f.root,{recursive:true,force:true});}});

test('writer cannot succeed before one exact dispatch succeeds',async()=>{const f=await fixture();try{
  await f.journal.record(writer());await assert.rejects(()=>f.journal.record({type:'writer-result',writerId:id(10),transitionId:binding.transitionId,
    outcome:'succeeded',recordedAt:at(2)}),/writer-result-before-dispatch/u);
}finally{await rm(f.root,{recursive:true,force:true});}});

test('foreign or stale dispatch bindings are denied',async()=>{const f=await fixture();try{
  await f.journal.record(writer());const wrong=dispatch();wrong.packageSha256=sha(99);await assert.rejects(()=>f.journal.record(wrong));
  await f.journal.record(dispatch());const result=dispatchResult();result.requestSha256=sha(99);await assert.rejects(()=>f.journal.record(result),/dispatch-result-binding/u);
}finally{await rm(f.root,{recursive:true,force:true});}});

test('one writer cannot publish a second dispatch after its first dispatch settles',async()=>{const f=await fixture();try{
  await f.journal.record(writer());await f.journal.record(dispatch());await f.journal.record(dispatchResult());
  await assert.rejects(()=>f.restart().record(dispatch(id(10),id(14))),/dispatch-intent/u);
  const value=await f.restart().load();assert.equal(Object.keys(value.dispatches).length,1);assert.equal(value.pendingWriter,id(10));
}finally{await rm(f.root,{recursive:true,force:true});}});

test('create-only revision is the cross-process writer CAS',async()=>{const f=await fixture();try{
  const left=f.journal.record(writer(id(20))),right=f.restart().record(writer(id(21))),settled=await Promise.allSettled([left,right]);
  assert.equal(settled.filter(value=>value.status==='fulfilled').length,1);assert.equal(settled.filter(value=>value.status==='rejected').length,1);
  assert.equal((await f.restart().load()).revision,1);
}finally{await rm(f.root,{recursive:true,force:true});}});

test('generic effect is exact and unknown blocks every later writer or effect',async()=>{const f=await fixture();try{
  const intent={type:'effect-intent',effectId:id(30),transitionId:binding.transitionId,kind:'managed-closure',inputSha256:sha(31),recordedAt:at(1)};
  await f.journal.record(intent);await f.journal.record({type:'effect-result',effectId:id(30),transitionId:binding.transitionId,kind:intent.kind,
    inputSha256:intent.inputSha256,outcome:'unknown',receiptSha256:sha(32),recordedAt:at(2)});
  const value=await f.restart().load();assert.equal(value.pendingEffect,id(30));assert.equal(value.effects[0].status,'unknown');
  await assert.rejects(()=>f.journal.record(writer()));
  const next=structuredClone(intent);next.effectId=id(33);await assert.rejects(()=>f.journal.record(next));
}finally{await rm(f.root,{recursive:true,force:true});}});

test('one transition cannot record an ambiguous second effect of the same kind',async()=>{const f=await fixture();try{
  const first={type:'effect-intent',effectId:id(40),transitionId:binding.transitionId,kind:'managed-closure',inputSha256:sha(41),recordedAt:at(1)};
  await f.journal.record(first);await f.journal.record({type:'effect-result',effectId:first.effectId,transitionId:binding.transitionId,kind:first.kind,
    inputSha256:first.inputSha256,outcome:'succeeded',receiptSha256:sha(42),recordedAt:at(2)});
  await assert.rejects(()=>f.restart().record({...first,effectId:id(43),inputSha256:sha(44),recordedAt:at(3)}),/effect-intent/u);
  assert.equal((await f.restart().load()).effects.length,1);
}finally{await rm(f.root,{recursive:true,force:true});}});

test('application observation requires the settled exact dispatch',async()=>{const f=await fixture();try{
  await f.journal.record(writer());await f.journal.record(dispatch());await f.journal.record(dispatchResult());
  await f.journal.record({type:'writer-result',writerId:id(10),transitionId:binding.transitionId,outcome:'succeeded',recordedAt:at(4)});
  const observed={type:'application-observed',transitionId:binding.transitionId,writerId:id(10),operationId:id(11),releaseId:'candidate',
    commit:'a'.repeat(40),artifactDigest:sha(50),observationSha256:sha(51),observedAt:at(5)};
  await f.journal.record(observed);assert.equal((await f.restart().load()).applicationObservation.releaseId,'candidate');
  await assert.rejects(()=>f.journal.record(observed));
}finally{await rm(f.root,{recursive:true,force:true});}});

test('record swap and hardlink are rejected without accepting alternate bytes',async()=>{const f=await fixture();try{
  await f.journal.record(writer());const name=path.join(f.directory,'000001.json'),raw=await readFile(name);
  const record=JSON.parse(raw);record.event.writerId=id(99);await writeFile(name,JSON.stringify(record));await assert.rejects(()=>f.restart().load(),/record-integrity/u);
}finally{await rm(f.root,{recursive:true,force:true});}
  const h=await fixture();try{await h.journal.record(writer());await link(path.join(h.directory,'000001.json'),path.join(h.root,'linked.json'));
    await assert.rejects(()=>h.restart().load(),/path-kind|record-bounds/u);
  }finally{await rm(h.root,{recursive:true,force:true});}});

test('binding and event hashing are deterministic',()=>{
  assert.equal(ownerJournalHash(binding),ownerJournalHash(structuredClone(binding)));assert.notEqual(ownerJournalHash(binding),ownerJournalHash({...binding,packageSha256:sha(9)}));
});
