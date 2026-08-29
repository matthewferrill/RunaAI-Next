import {validateManagedCallerClosure,validateManagedCallerRestore} from './managed-callers.mjs';
import {legacyCompatibilityHash} from './legacy-contract.mjs';

const HASH=/^[a-f0-9]{64}$/u,ID=/^[a-f0-9]{32}$/u;
const fail=code=>Object.assign(Error('m1-managed-caller-adapter-'+code),{code:'m1-managed-caller-adapter-'+code});
const need=(value,code)=>{if(!value)throw fail(code);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===keys.split(',').sort().join();
const time=value=>Number.isFinite(Date.parse(value)),clone=value=>structuredClone(value),iso=clock=>new Date(clock()).toISOString();
function fresh(observedAt,clock){const age=clock()-Date.parse(observedAt);return time(observedAt)&&age>=0&&age<=5000;}
function nextClosure(value,transitionId,clock){need(exact(value,'schemaVersion,transitionId,authorityId,intentId,terminalReceiptSha256,observationSha256,observedAt,samples,privateValuesIncluded')
    &&value.schemaVersion==='runaai-next-provider-closure/v1'&&value.transitionId===transitionId&&value.authorityId==='next-caddy-v2'
    &&ID.test(value.intentId)&&HASH.test(value.terminalReceiptSha256)&&HASH.test(value.observationSha256)&&fresh(value.observedAt,clock)
    &&Array.isArray(value.samples)&&value.samples.length===3&&value.samples.every(sample=>exact(sample,'observedAt,numRequests')
      &&fresh(sample.observedAt,clock)&&sample.numRequests===0)&&value.privateValuesIncluded===false,'next-close');return clone(value);}
function legacyClosure(value,binding,clock){need(exact(value,'schemaVersion,transitionId,bindingSha256,intentId,terminalReceiptSha256,routeReceiptSha256,observationSha256,observedAt,samples,privateValuesIncluded')
    &&value.schemaVersion==='runaai-legacy-compatibility-closure/v1'&&value.transitionId===binding.transitionId
    &&value.bindingSha256===legacyCompatibilityHash(binding)&&ID.test(value.intentId)
    &&[value.terminalReceiptSha256,value.routeReceiptSha256,value.observationSha256].every(item=>HASH.test(item))&&fresh(value.observedAt,clock)
    &&Array.isArray(value.samples)&&value.samples.length===3&&value.samples.every(sample=>exact(sample,'observedAt,activeRequests')
      &&fresh(sample.observedAt,clock)&&sample.activeRequests===0)&&value.privateValuesIncluded===false,'legacy-close');return clone(value);}
function native(value,binding,clock){need(exact(value,'callerId,endpoint,authorityId,intentId,terminalReceiptSha256,observationSha256,observedAt,established,engineSha256,descriptorSha256')
    &&value.callerId==='home-native-1234'&&value.endpoint==='192.168.50.165:1234'&&value.authorityId==='home-native-observer-v1'
    &&ID.test(value.intentId)&&[value.terminalReceiptSha256,value.observationSha256,value.engineSha256,value.descriptorSha256].every(item=>HASH.test(item))
    &&fresh(value.observedAt,clock)&&value.established===0,'native');return clone(value);}
function reranker(value,clock){need(exact(value,'callerId,endpoint,authorityId,intentId,terminalReceiptSha256,observationSha256,observedAt,available,expectedSha256,currentSha256')
    &&value.callerId==='legacy-reranker-8412'&&value.endpoint==='192.168.50.165:8412'&&value.authorityId==='legacy-reranker-observer-v1'
    &&ID.test(value.intentId)&&[value.terminalReceiptSha256,value.observationSha256,value.expectedSha256].every(item=>HASH.test(item))
    &&fresh(value.observedAt,clock)&&value.available===true&&value.currentSha256===value.expectedSha256,'reranker');return clone(value);}

export function createManagedCallerAdapter({transitionId,next,legacy,nativeObserver,rerankerObserver,clock=Date.now}){
  need(ID.test(transitionId)&&legacy?.binding?.transitionId===transitionId&&typeof next?.close==='function'&&typeof next?.assertFresh==='function'
    &&typeof next?.restore==='function'&&typeof legacy.close==='function'&&typeof legacy.assertFresh==='function'&&typeof legacy.linkManaged==='function'
    &&typeof legacy.restore==='function'&&typeof legacy.status==='function'&&typeof nativeObserver?.observe==='function'
    &&typeof rerankerObserver?.observe==='function'&&typeof clock==='function','constructor');
  const binding=legacy.binding;
  async function compose(nextValue,legacyValue){
    const n=nextClosure(nextValue,transitionId,clock),l=legacyClosure(legacyValue,binding,clock),home=native(await nativeObserver.observe({transitionId}),binding,clock),rank=reranker(await rerankerObserver.observe({transitionId}),clock);
    const legacySamples=l.samples.map(sample=>({observedAt:sample.observedAt,numRequests:sample.activeRequests}));
    const entry=(callerId)=>({callerId,endpoint:'192.168.50.165:1234',authorityId:'legacy-compatibility-v1',intentId:l.intentId,
      terminalReceiptSha256:l.terminalReceiptSha256,observationSha256:l.observationSha256,samples:clone(legacySamples)});
    const receipt={schemaVersion:'runaai-managed-native-closure/v1',transitionId,observedAt:iso(clock),pendingEffect:null,entries:[
      {callerId:'next-provider-9770',endpoint:'127.0.0.1:9770',authorityId:n.authorityId,intentId:n.intentId,
        terminalReceiptSha256:n.terminalReceiptSha256,observationSha256:n.observationSha256,samples:clone(n.samples)},
      entry('legacy-primary-1234'),entry('legacy-embedding-1234'),home,rank],privateValuesIncluded:false};
    return {validated:validateManagedCallerClosure(receipt,{transitionId,now:clock()}),next:n,legacy:l};
  }
  return Object.freeze({
    async close(){const n=await next.close({transitionId}),l=await legacy.close(),result=await compose(n,l);
      await legacy.linkManaged({managedReceiptSha256:result.validated.receiptSha256,nextReceiptSha256:legacyCompatibilityHash(n),
        legacyReceiptSha256:l.terminalReceiptSha256});return result.validated.receipt;},
    async assertFresh(){const result=await compose(await next.assertFresh({transitionId}),await legacy.assertFresh());return result.validated.receipt;},
    async restore({forwardReceiptSha256}){
      need(HASH.test(forwardReceiptSha256),'forward-receipt');const status=await legacy.status();need(status.mode==='closed'&&status.managedReceiptSha256===forwardReceiptSha256,'forward-state');
      const l=await legacy.restore({managedReceiptSha256:forwardReceiptSha256}),n=await next.restore({transitionId,managedReceiptSha256:forwardReceiptSha256});
      need(exact(l,'schemaVersion,transitionId,bindingSha256,intentId,forwardIntentId,managedReceiptSha256,terminalReceiptSha256,observationSha256,observedAt,privateValuesIncluded')
        &&l.schemaVersion==='runaai-legacy-compatibility-restore/v1'&&l.transitionId===transitionId&&l.managedReceiptSha256===forwardReceiptSha256
        &&[l.intentId,l.forwardIntentId].every(value=>ID.test(value))&&[l.terminalReceiptSha256,l.observationSha256].every(value=>HASH.test(value))
        &&fresh(l.observedAt,clock)&&l.privateValuesIncluded===false,'legacy-restore');
      need(exact(n,'schemaVersion,transitionId,authorityId,forwardIntentId,restoreIntentId,terminalReceiptSha256,observationSha256,observedAt,privateValuesIncluded')
        &&n.schemaVersion==='runaai-next-provider-closure-restore/v1'&&n.transitionId===transitionId&&n.authorityId==='next-caddy-v2'
        &&[n.forwardIntentId,n.restoreIntentId].every(value=>ID.test(value))&&[n.terminalReceiptSha256,n.observationSha256].every(value=>HASH.test(value))
        &&fresh(n.observedAt,clock)&&n.privateValuesIncluded===false,'next-restore');
      const receipt={schemaVersion:'runaai-managed-native-closure-restore/v1',transitionId,forwardReceiptSha256,observedAt:iso(clock),pendingEffect:null,effects:[
        {scope:'next-provider-9770',authorityId:n.authorityId,forwardIntentId:n.forwardIntentId,restoreIntentId:n.restoreIntentId,
          terminalReceiptSha256:n.terminalReceiptSha256,observationSha256:n.observationSha256},
        {scope:'legacy-primary-embedding-1234',authorityId:'legacy-compatibility-v1',forwardIntentId:l.forwardIntentId,restoreIntentId:l.intentId,
          terminalReceiptSha256:l.terminalReceiptSha256,observationSha256:l.observationSha256}],privateValuesIncluded:false};
      return validateManagedCallerRestore(receipt,{transitionId,forwardReceiptSha256,now:clock()}).receipt;
    },
  });
}
