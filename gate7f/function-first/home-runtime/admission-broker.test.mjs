import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PinnedAdmissionBroker,signBrokerRequest} from './admission-broker.mjs';

function fixture(){
  const key=Buffer.alloc(32,7),sessionId='a'.repeat(64),worker={pid:1234,startedAt:'2026-08-28T18:00:00.000Z'};
  const generation=randomUUID();let now=10000,sequence=0,stopped=false;const tickets=[],timers=[],calls=[];
  const controller={status:{phase:'ready',generation,profileSha256:'b'.repeat(64)},
    admit:async({signal})=>{calls.push('admit');const ticket={generation,signal,releases:0,release(){this.releases++;}};tickets.push(ticket);return ticket;},
    poll:async()=>calls.push('poll'),stop:async()=>{calls.push('stop');controller.status.phase='stopped';},
    fault:async()=>{calls.push('fault');controller.status.phase='faulted';}};
  const broker=new PinnedAdmissionBroker({controller,sessionId,worker,key,clock:()=>now,schedule:callback=>{timers.push(callback);return callback;},
    cancel:()=>{},verifyStopped:async identity=>{assert.deepEqual(identity,worker);return stopped;}});
  const message=(operation,args={},overrides={})=>signBrokerRequest({sessionId,worker,sequence:++sequence,sentAt:now,operation,args,...overrides},key);
  return {broker,key,worker,sessionId,controller,tickets,timers,calls,message,setNow:value=>{now=value;},setStopped:value=>{stopped=value;}};
}
test('control broker accepts only authenticated, fresh, ordered exact-worker messages',async()=>{
  const f=fixture(),good=f.message('status');
  await assert.rejects(f.broker.handle({...good,mac:'0'.repeat(64)}),/authentication/);
  await assert.rejects(f.broker.handle({...good,extra:'not allowed'}),/shape/);
  const status=await f.broker.handle(good);assert.equal(status.phase,'ready');assert.deepEqual(f.calls,[]);
  await assert.rejects(f.broker.handle(good),/replay-or-order/);
  const foreign=f.message('status',{}, {worker:{...f.worker,pid:9999}});await assert.rejects(f.broker.handle(foreign),/binding/);
  const stale=signBrokerRequest({...good,sequence:2,sentAt:0},f.key);await assert.rejects(f.broker.handle(stale),/stale-message/);
  assert.deepEqual(f.calls,[]);
});
test('native operations, arbitrary data and recovery have no privileged IPC method',async()=>{
  const f=fixture();for(const operation of ['load','unload','setPower','exec','record','workerStopped','stop'])
    assert.throws(()=>f.message(operation,{command:'never executed'}),/broker-operation/);
  assert.throws(()=>f.message('admit',{requestId:randomUUID(),path:'C:\\private'}),/broker-arguments/);
  assert.throws(()=>f.message('status',{message:'private content'}),/broker-arguments/);assert.deepEqual(f.calls,[]);
});
test('independent concurrent grants keep generation/acknowledgment and disclose no request content',async()=>{
  const f=fixture();const one=await f.broker.handle(f.message('admit',{requestId:randomUUID()}));
  const two=await f.broker.handle(f.message('admit',{requestId:randomUUID()}));assert.notEqual(one.grantId,two.grantId);
  assert.equal(f.broker.status.grants.length,2);assert.deepEqual(Object.keys(one).sort(),['deadlineAt','generation','grantId','profileSha256']);
  await assert.rejects(f.broker.handle(f.message('release',{grantId:one.grantId,generation:randomUUID()})),/release-generation/);
  assert.equal(f.tickets[0].releases,0);
  assert.deepEqual(await f.broker.handle(f.message('release',{grantId:one.grantId,generation:one.generation})),{released:true});
  assert.equal(f.broker.status.grants.length,1);assert.equal(f.tickets[1].releases,0);
  await f.broker.handle(f.message('release',{grantId:two.grantId,generation:two.generation}));assert.equal(f.broker.status.grants.length,0);
});
test('expired grants revoke but never falsely acknowledge that the worker request stopped',async()=>{
  const f=fixture();const grant=await f.broker.handle(f.message('admit',{requestId:randomUUID()}));
  f.timers[0]();assert.equal(f.broker.status.grants[0].revoked,true);assert.equal(f.tickets[0].releases,0);
  assert.equal(f.broker.status.grants.length,1);await f.broker.handle(f.message('release',{grantId:grant.grantId,generation:grant.generation}));
  assert.equal(f.tickets[0].releases,1);
});
test('only independently confirmed exact-worker death permits unacknowledged-grant release and fault cleanup',async()=>{
  const f=fixture();await f.broker.handle(f.message('admit',{requestId:randomUUID()}));
  await assert.rejects(f.broker.workerStopped(),/worker-still-live/);assert.equal(f.tickets[0].releases,0);
  f.setStopped(true);await f.broker.workerStopped();assert.equal(f.tickets[0].releases,1);assert.equal(f.tickets[0].signal.aborted,true);
  assert.equal(f.broker.status.phase,'faulted');await assert.rejects(f.broker.handle(f.message('admit',{requestId:randomUUID()})),/broker-closing/);
});
test('closing during an asynchronous admission releases the returned native ticket without publishing a grant',async()=>{
  const f=fixture();let resume;const original=f.controller.admit;f.controller.admit=async args=>{const ticket=await original(args);await new Promise(r=>{resume=r;});return ticket;};
  const pending=f.broker.handle(f.message('admit',{requestId:randomUUID()}));const rejected=assert.rejects(pending,/broker-closing/);
  await new Promise(resolve=>setImmediate(resolve));await f.broker.stop();resume();await rejected;
  assert.equal(f.tickets[0].releases,1);assert.equal(f.broker.status.grants.length,0);
});
