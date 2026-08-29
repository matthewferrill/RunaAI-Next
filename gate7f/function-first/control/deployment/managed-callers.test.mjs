import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManagedCallerClosure,validateManagedCallerRestore} from './managed-callers.mjs';

const id=n=>n.toString(16).padStart(32,'0'),sha=n=>n.toString(16).padStart(64,'0');
const transitionId=id(1),now=Date.parse('2026-08-29T00:00:05.000Z');
const samples=()=>[2,3,4].map(second=>({observedAt:`2026-08-29T00:00:0${second}.000Z`,numRequests:0}));
const entry=(callerId,endpoint,intent=2,receipt=3)=>({callerId,endpoint,authorityId:callerId.startsWith('legacy')?'legacy-admission-v1':'next-caddy-v2',
  intentId:id(intent),terminalReceiptSha256:sha(receipt),observationSha256:sha(receipt+1),samples:samples()});
function closure(){return {schemaVersion:'runaai-managed-native-closure/v1',transitionId,observedAt:'2026-08-29T00:00:05.000Z',pendingEffect:null,
  entries:[entry('next-provider-9770','127.0.0.1:9770',10,11),entry('legacy-primary-1234','192.168.50.165:1234'),
    entry('legacy-embedding-1234','192.168.50.165:1234'),
    {callerId:'home-native-1234',endpoint:'192.168.50.165:1234',authorityId:'home-native-observer-v1',intentId:id(20),
      terminalReceiptSha256:sha(21),observationSha256:sha(22),observedAt:'2026-08-29T00:00:04.500Z',established:0,
      engineSha256:sha(23),descriptorSha256:sha(24)},
    {callerId:'legacy-reranker-8412',endpoint:'192.168.50.165:8412',authorityId:'legacy-reranker-observer-v1',intentId:id(30),
      terminalReceiptSha256:sha(31),observationSha256:sha(32),observedAt:'2026-08-29T00:00:04.500Z',available:true,
      expectedSha256:sha(33),currentSha256:sha(33)}],privateValuesIncluded:false};}
const check=value=>validateManagedCallerClosure(value,{transitionId,now});

test('accepts only the complete fresh five-scope closure',()=>{
  const result=check(closure());assert.match(result.receiptSha256,/^[a-f0-9]{64}$/u);assert.equal(result.receipt.entries.length,5);
});
for(const name of ['next-provider-9770','legacy-primary-1234','legacy-embedding-1234','home-native-1234','legacy-reranker-8412'])
  test('rejects missing '+name,()=>{const value=closure();value.entries=value.entries.filter(entry=>entry.callerId!==name);assert.throws(()=>check(value));});
test('rejects duplicate scope',()=>{const value=closure();value.entries[4]=structuredClone(value.entries[0]);assert.throws(()=>check(value));});
test('rejects unrelated legacy effects',()=>{const value=closure();value.entries[2].intentId=id(99);assert.throws(()=>check(value),/legacy-shared-effect/u);});
test('rejects nonzero and insufficient counter evidence',()=>{const value=closure();value.entries[0].samples[2].numRequests=1;assert.throws(()=>check(value));
  const short=closure();short.entries[1].samples.pop();assert.throws(()=>check(short));});
test('rejects stale closure and stale member observation',()=>{assert.throws(()=>validateManagedCallerClosure(closure(),{transitionId,now:now+5001}));
  const value=closure();value.entries[3].observedAt='2026-08-28T23:59:00.000Z';assert.throws(()=>check(value));});
test('rejects stale first and middle counter samples even when the latest sample is fresh',()=>{const value=closure();
  value.entries[0].samples=[{observedAt:'2026-08-29T00:00:02.000Z',numRequests:0},{observedAt:'2026-08-29T00:00:03.000Z',numRequests:0},
    {observedAt:'2026-08-29T00:00:04.500Z',numRequests:0}];
  assert.throws(()=>validateManagedCallerClosure(value,{transitionId,now,maximumAgeMs:1000}),/observation-binding/u);
});
test('rejects pending effects and native connections',()=>{const pending=closure();pending.pendingEffect=id(9);assert.throws(()=>check(pending));
  const connected=closure();connected.entries[3].established=1;assert.throws(()=>check(connected));});
test('rejects changed or unavailable reranker',()=>{const changed=closure();changed.entries[4].currentSha256=sha(34);assert.throws(()=>check(changed));
  const unavailable=closure();unavailable.entries[4].available=false;assert.throws(()=>check(unavailable));});
test('rejects added ready claim and private values',()=>{const extra=closure();extra.ready=true;assert.throws(()=>check(extra));
  const privateValue=closure();privateValue.privateValuesIncluded=true;assert.throws(()=>check(privateValue));});
test('validates exact inverse scope bound to the forward receipt',()=>{
  const forward=check(closure()),value={schemaVersion:'runaai-managed-native-closure-restore/v1',transitionId,
    forwardReceiptSha256:forward.receiptSha256,observedAt:'2026-08-29T00:00:05.000Z',pendingEffect:null,effects:[
      {scope:'next-provider-9770',authorityId:'next-caddy-v2',forwardIntentId:id(10),restoreIntentId:id(40),terminalReceiptSha256:sha(41),observationSha256:sha(42)},
      {scope:'legacy-primary-embedding-1234',authorityId:'legacy-admission-v1',forwardIntentId:id(2),restoreIntentId:id(43),terminalReceiptSha256:sha(44),observationSha256:sha(45)}],privateValuesIncluded:false};
  assert.match(validateManagedCallerRestore(value,{transitionId,forwardReceiptSha256:forward.receiptSha256,now}).receiptSha256,/^[a-f0-9]{64}$/u);
  assert.throws(()=>validateManagedCallerRestore(value,{transitionId,forwardReceiptSha256:forward.receiptSha256,now,maximumAgeMs:5001}));
  value.effects.pop();assert.throws(()=>validateManagedCallerRestore(value,{transitionId,forwardReceiptSha256:forward.receiptSha256,now}));
});
