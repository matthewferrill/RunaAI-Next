import {hash} from './assembly.mjs';

const HASH=/^[a-f0-9]{64}$/u,ID=/^[a-f0-9]{32}$/u;
const fail=code=>Object.assign(Error('m1-managed-callers-'+code),{code:'m1-managed-callers-'+code});
const need=(value,code)=>{if(!value)throw fail(code);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===keys.split(',').sort().join();
const authority=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9._-]{2,99}$/u.test(value);
const time=value=>Number.isFinite(Date.parse(value));
const base=(value,callerId,endpoint)=>{
  need(exact(value,'callerId,endpoint,authorityId,intentId,terminalReceiptSha256,observationSha256,samples')
    &&value.callerId===callerId&&value.endpoint===endpoint&&authority(value.authorityId)&&ID.test(value.intentId)
    &&HASH.test(value.terminalReceiptSha256)&&HASH.test(value.observationSha256)
    &&Array.isArray(value.samples)&&value.samples.length===3,'entry');
  let previous=0;
  for(const sample of value.samples){
    need(exact(sample,'observedAt,numRequests')&&time(sample.observedAt)&&sample.numRequests===0
      &&Date.parse(sample.observedAt)>previous,'samples');previous=Date.parse(sample.observedAt);
  }
  return previous;
};

export const MANAGED_CALLERS=Object.freeze([
  'next-provider-9770','legacy-primary-1234','legacy-embedding-1234','home-native-1234','legacy-reranker-8412',
]);

/** Exact complete closure. It deliberately contains no generic ready/closed
 * booleans: every caller is bound to a terminal intent and current observation. */
export function validateManagedCallerClosure(value,{transitionId,now=Date.now(),maximumAgeMs=5000}={}){
  need(exact(value,'schemaVersion,transitionId,observedAt,pendingEffect,entries,privateValuesIncluded')
    &&value.schemaVersion==='runaai-managed-native-closure/v1'&&value.transitionId===transitionId
    &&ID.test(transitionId)&&time(value.observedAt)&&value.pendingEffect===null&&value.privateValuesIncluded===false
    &&Number.isFinite(now)&&Number.isSafeInteger(maximumAgeMs)&&maximumAgeMs>=1&&maximumAgeMs<=5000
    &&now-Date.parse(value.observedAt)>=0&&now-Date.parse(value.observedAt)<=maximumAgeMs
    &&Array.isArray(value.entries)&&value.entries.length===MANAGED_CALLERS.length,'receipt');
  const entries=new Map(value.entries.map(entry=>[entry?.callerId,entry]));
  need(entries.size===MANAGED_CALLERS.length&&MANAGED_CALLERS.every(id=>entries.has(id)),'scope');
  const next=entries.get('next-provider-9770');base(next,'next-provider-9770','127.0.0.1:9770');
  const primary=entries.get('legacy-primary-1234');base(primary,'legacy-primary-1234','192.168.50.165:1234');
  const embedding=entries.get('legacy-embedding-1234');base(embedding,'legacy-embedding-1234','192.168.50.165:1234');
  need(primary.authorityId===embedding.authorityId&&primary.intentId===embedding.intentId
    &&primary.terminalReceiptSha256===embedding.terminalReceiptSha256,'legacy-shared-effect');
  const native=entries.get('home-native-1234');
  need(exact(native,'callerId,endpoint,authorityId,intentId,terminalReceiptSha256,observationSha256,observedAt,established,engineSha256,descriptorSha256')
    &&native.callerId==='home-native-1234'&&native.endpoint==='192.168.50.165:1234'
    &&authority(native.authorityId)&&ID.test(native.intentId)&&HASH.test(native.terminalReceiptSha256)
    &&HASH.test(native.observationSha256)&&time(native.observedAt)&&native.established===0
    &&HASH.test(native.engineSha256)&&HASH.test(native.descriptorSha256),'native');
  const reranker=entries.get('legacy-reranker-8412');
  need(exact(reranker,'callerId,endpoint,authorityId,intentId,terminalReceiptSha256,observationSha256,observedAt,available,expectedSha256,currentSha256')
    &&reranker.callerId==='legacy-reranker-8412'&&reranker.endpoint==='192.168.50.165:8412'
    &&authority(reranker.authorityId)&&ID.test(reranker.intentId)&&HASH.test(reranker.terminalReceiptSha256)
    &&HASH.test(reranker.observationSha256)&&time(reranker.observedAt)&&reranker.available===true
    &&HASH.test(reranker.expectedSha256)&&reranker.currentSha256===reranker.expectedSha256,'reranker');
  const observed=Date.parse(value.observedAt);
  for(const entry of value.entries){
    const observations=entry.samples?entry.samples.map(sample=>Date.parse(sample.observedAt)):[Date.parse(entry.observedAt)];
    need(observations.every(observation=>observation<=observed&&observed-observation<=maximumAgeMs),'observation-binding');
  }
  return Object.freeze({receipt:structuredClone(value),receiptSha256:hash(value)});
}

export function validateManagedCallerRestore(value,{transitionId,forwardReceiptSha256,now=Date.now(),maximumAgeMs=5000}={}){
  need(exact(value,'schemaVersion,transitionId,forwardReceiptSha256,observedAt,pendingEffect,effects,privateValuesIncluded')
    &&value.schemaVersion==='runaai-managed-native-closure-restore/v1'&&value.transitionId===transitionId
    &&ID.test(transitionId)&&value.forwardReceiptSha256===forwardReceiptSha256&&HASH.test(forwardReceiptSha256)
    &&time(value.observedAt)&&Number.isFinite(now)&&Number.isSafeInteger(maximumAgeMs)&&maximumAgeMs>=1&&maximumAgeMs<=5000
    &&now-Date.parse(value.observedAt)>=0
    &&now-Date.parse(value.observedAt)<=maximumAgeMs&&value.pendingEffect===null&&value.privateValuesIncluded===false
    &&Array.isArray(value.effects)&&value.effects.length===2,'restore');
  const expected=['next-provider-9770','legacy-primary-embedding-1234'];
  need(value.effects.map(effect=>effect.scope).sort().join()===expected.sort().join(),'restore-scope');
  for(const effect of value.effects)need(exact(effect,'scope,authorityId,forwardIntentId,restoreIntentId,terminalReceiptSha256,observationSha256')
    &&authority(effect.authorityId)&&ID.test(effect.forwardIntentId)&&ID.test(effect.restoreIntentId)
    &&effect.restoreIntentId!==effect.forwardIntentId&&HASH.test(effect.terminalReceiptSha256)
    &&HASH.test(effect.observationSha256),'restore-effect');
  return Object.freeze({receipt:structuredClone(value),receiptSha256:hash(value)});
}
