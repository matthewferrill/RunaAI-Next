import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {BrokerWorkerController} from './worker-controller.mjs';
const profile={schemaVersion:'runaai-qualified-home-profile/v1',candidateId:'gemma',appSourceCommit:'a'.repeat(40),
  runtimeSealSha256:'b'.repeat(64),qualificationGradesSha256:'c'.repeat(64)};
function fixture(){
  let now=100000,phase='ready',generation=randomUUID(),fail=null,pendingAdmit=null;const grants=new Map(),calls=[],timers=[];
  const client={async call(operation,args){calls.push({operation,args});if(fail)throw fail;
    if(operation==='status')return {phase,generation,profileSha256:worker.profile.profileSha256,closing:false,
      grants:[...grants].map(([grantId,grant])=>({grantId,...grant}))};
    if(operation==='admit'){if(pendingAdmit)await pendingAdmit;const grantId=randomUUID(),deadlineAt=now+65000;
      grants.set(grantId,{generation,deadlineAt,revoked:false});return {grantId,generation,deadlineAt,profileSha256:worker.profile.profileSha256};}
    if(operation==='release'){const released=grants.delete(args.grantId);return {released};}throw Error('unexpected operation');}};
  const worker=new BrokerWorkerController({profile,client,clock:()=>now,schedule:(fn,ms)=>{const timer={fn,ms};timers.push(timer);return timer;},cancel:()=>{}});
  return {worker,grants,calls,timers,advance:ms=>now+=ms,setPhase:value=>phase=value,setFail:value=>fail=value,
    setGeneration:()=>generation=randomUUID(),blockAdmit:promise=>pendingAdmit=promise};
}
test('worker binds fresh status and exact generation then waits for idempotent release acknowledgement',async()=>{
  const f=fixture();await assert.rejects(f.worker.admit(),/status-stale/);await f.worker.poll();
  const grant=await f.worker.admit();assert.equal(f.grants.size,1);assert.equal(grant.signal.aborted,false);
  const first=grant.release(),second=grant.release();assert.equal(first,second);await first;
  assert.equal(f.grants.size,0);assert.equal(f.worker.status.activeRequests,0);
  assert.deepEqual(f.calls.map(call=>call.operation),['status','admit','release']);
  assert.ok(f.calls.every(call=>!JSON.stringify(call).includes('messages')));
});
test('worker native revocation aborts but does not release until actual request finalization',async()=>{
  const f=fixture();await f.worker.poll();const grant=await f.worker.admit();
  [...f.grants.values()][0].revoked=true;await f.worker.poll();assert.equal(grant.signal.aborted,true);
  assert.equal(f.grants.size,1);await grant.release();assert.equal(f.grants.size,0);
});
test('supervisor loss closes all admissions without replaying or releasing unknown requests',async()=>{
  const f=fixture();await f.worker.poll();const grant=await f.worker.admit();
  f.setFail(Error('lost supervisor'));await assert.rejects(f.worker.poll(),/lost supervisor/);
  assert.equal(grant.signal.aborted,true);await assert.rejects(f.worker.admit(),/worker-closed/);
  await assert.rejects(grant.release(),/lost supervisor/);assert.equal(f.grants.size,1);
  const calls=f.calls.length;await assert.rejects(grant.release(),/lost supervisor/);assert.equal(f.calls.length,calls);
});
test('stale status and generation drift reject before upstream inference',async()=>{
  const f=fixture();await f.worker.poll();f.advance(5001);await assert.rejects(f.worker.admit(),/status-stale/);
  await f.worker.poll();f.setGeneration();await assert.rejects(f.worker.admit(),/worker-admission/);
  assert.equal(f.worker.status.ipcFailed,true);assert.equal(f.grants.size,1); // Unknown grant belongs to supervisor recovery.
});
test('cancellation while awaiting admission explicitly releases returned grant without dispatch',async()=>{
  const f=fixture();await f.worker.poll();let done;f.blockAdmit(new Promise(resolve=>done=resolve));
  const abort=new AbortController(),pending=f.worker.admit({signal:abort.signal});abort.abort(Error('cancelled'));done();
  await assert.rejects(pending,/cancelled/);assert.equal(f.grants.size,0);
  assert.deepEqual(f.calls.map(call=>call.operation),['status','admit','release']);
});
test('worker close/deadline revoke without fabricating completion',async()=>{
  const f=fixture();await f.worker.poll();const first=await f.worker.admit();f.timers[0].fn();
  assert.equal(first.signal.aborted,true);assert.equal(f.grants.size,1);const second=await f.worker.admit();
  await f.worker.close();assert.equal(second.signal.aborted,true);assert.equal(f.grants.size,2);
  await first.release();await second.release();assert.equal(f.grants.size,0);
});
