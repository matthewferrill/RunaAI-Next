import {randomUUID} from 'node:crypto';
import {prepareLegacyCompatibilityRequest,projectLegacyCompatibilityResponse,validateLegacyCompatibilityBinding,legacyCompatibilityHash} from './legacy-contract.mjs';

const HASH=/^[a-f0-9]{64}$/u,ID=/^[a-f0-9]{32}$/u;
const fail=code=>Object.assign(Error('m1-legacy-adapter-'+code),{code:'m1-legacy-adapter-'+code});
const need=(value,code)=>{if(!value)throw fail(code);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===keys.split(',').sort().join();
const time=value=>Number.isFinite(Date.parse(value)),clone=value=>structuredClone(value);
const id=()=>randomUUID().replaceAll('-',''),iso=clock=>new Date(clock()).toISOString();

function runtimeObservation(value,binding,clock){
  const now=clock(),bindingSha256=legacyCompatibilityHash(binding);
  need(exact(value,'schemaVersion,bindingSha256,observedAt,engineSha256,descriptorSha256,primaryId,primaryFingerprint,embeddingId,embeddingFingerprint,ready,privateValuesIncluded')
    &&value.schemaVersion==='runaai-legacy-runtime-observation/v1'&&value.bindingSha256===bindingSha256
    &&time(value.observedAt)&&now-Date.parse(value.observedAt)>=0&&now-Date.parse(value.observedAt)<=5000
    &&HASH.test(value.engineSha256)&&HASH.test(value.descriptorSha256)&&value.primaryId===binding.models.mappedPrimaryId
    &&value.primaryFingerprint===binding.models.mappedPrimaryFingerprint&&value.embeddingId===binding.models.embeddingId
    &&value.embeddingFingerprint===binding.models.embeddingFingerprint&&value.ready===true&&value.privateValuesIncluded===false,'runtime');
  return clone(value);
}
function terminal(kind,binding,intentId,clock){return {schemaVersion:'runaai-legacy-compatibility-terminal/v1',kind,intentId,
  transitionId:binding.transitionId,bindingSha256:legacyCompatibilityHash(binding),recordedAt:iso(clock),privateValuesIncluded:false};}
function routeClose(value,binding,intentId,clock){const now=clock();need(exact(value,'schemaVersion,transitionId,bindingSha256,intentId,endpoint,terminalReceiptSha256,observationSha256,observedAt,activeRequests,privateValuesIncluded')
    &&value.schemaVersion==='runaai-legacy-control-route-closure/v1'&&value.transitionId===binding.transitionId
    &&value.bindingSha256===legacyCompatibilityHash(binding)&&value.intentId===intentId&&value.endpoint===binding.control.endpoint
    &&HASH.test(value.terminalReceiptSha256)&&HASH.test(value.observationSha256)&&time(value.observedAt)
    &&now-Date.parse(value.observedAt)>=0&&now-Date.parse(value.observedAt)<=5000&&value.activeRequests===0&&value.privateValuesIncluded===false,'route-close');return clone(value);}
function routeRestore(value,binding,intentId,managedReceiptSha256,clock){const now=clock();need(exact(value,'schemaVersion,transitionId,bindingSha256,intentId,managedReceiptSha256,endpoint,terminalReceiptSha256,observationSha256,observedAt,privateValuesIncluded')
    &&value.schemaVersion==='runaai-legacy-control-route-restore/v1'&&value.transitionId===binding.transitionId
    &&value.bindingSha256===legacyCompatibilityHash(binding)&&value.intentId===intentId&&value.managedReceiptSha256===managedReceiptSha256
    &&value.endpoint===binding.control.endpoint&&HASH.test(value.terminalReceiptSha256)&&HASH.test(value.observationSha256)
    &&time(value.observedAt)&&now-Date.parse(value.observedAt)>=0&&now-Date.parse(value.observedAt)<=5000&&value.privateValuesIncluded===false,'route-restore');return clone(value);}
function closureReceipt(binding,state,samples,observation,routeReceipt,clock){
  need(state.mode==='closed'&&state.close?.status==='succeeded'&&samples.length===3&&samples.every(sample=>sample.activeRequests===0)
    &&samples.every((sample,index)=>time(sample.observedAt)&&(index===0||Date.parse(sample.observedAt)>Date.parse(samples[index-1].observedAt)))
    &&Date.parse(samples.at(-1).observedAt)<=clock(),'closure-state');
  return Object.freeze({schemaVersion:'runaai-legacy-compatibility-closure/v1',transitionId:binding.transitionId,
    bindingSha256:legacyCompatibilityHash(binding),intentId:state.close.intentId,terminalReceiptSha256:state.close.receiptSha256,
    routeReceiptSha256:legacyCompatibilityHash(routeReceipt),observationSha256:legacyCompatibilityHash(observation),observedAt:iso(clock),
    samples:clone(samples),privateValuesIncluded:false});
}

/** Separate legacy protocol/admission boundary. It opens no listener; the
 * caller supplies the pinned mTLS server and fixed native-loopback transport. */
export function createLegacyCompatibilityAdapter({binding:input,journal,upstream,runtime,route,clock=Date.now,randomId=id,
  delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),event=()=>{}}){
  const binding=validateLegacyCompatibilityBinding(input),bindingSha256=legacyCompatibilityHash(binding);
  need(journal?.bindingSha256===bindingSha256&&typeof journal.load==='function'&&typeof journal.record==='function'
    &&typeof upstream?.request==='function'&&typeof runtime?.observe==='function'&&typeof route?.close==='function'
    &&typeof route?.assertClosed==='function'&&typeof route?.restore==='function'&&typeof clock==='function'
    &&typeof randomId==='function'&&typeof delay==='function'&&typeof event==='function','constructor');
  let active=0,queue=Promise.resolve();
  const exclusive=work=>{const run=queue.then(work,work);queue=run.then(()=>undefined,()=>undefined);return run;};
  async function observed(){return runtimeObservation(await runtime.observe(binding),binding,clock);}
  async function acquireIngress(identity){
    need(exact(identity,'sourceAddress,clientCertificateSha256')&&identity.sourceAddress===binding.control.sourceAddress
      &&identity.clientCertificateSha256===binding.control.clientCertificateSha256,'client-identity');
    await exclusive(async()=>{const state=await journal.load();need(state.mode==='open'&&state.pending===null,'admission-closed');active++;});
    let released=false,used=false;
    return Object.freeze({
      async dispatch(request){
        need(!released&&!used,'ingress-use');used=true;
        const prepared=prepareLegacyCompatibilityRequest(binding,request);
        const controller=new AbortController(),onAbort=()=>controller.abort(request.signal?.reason),timer=setTimeout(()=>controller.abort(),binding.limits.requestMs);
        if(request.signal){if(request.signal.aborted)controller.abort(request.signal.reason);else request.signal.addEventListener('abort',onAbort,{once:true});}
        try{
          const observation=await observed();event({kind:'legacy-dispatch-start',requestSha256:prepared.requestSha256,requestKind:prepared.kind,
            observationSha256:legacyCompatibilityHash(observation),activeRequests:active});
          const response=await upstream.request({endpoint:binding.home.nativeEndpoint,pathname:prepared.pathname,method:prepared.method,
            raw:prepared.raw,signal:controller.signal});
          const projected=projectLegacyCompatibilityResponse(binding,{kind:prepared.kind,inputCount:prepared.inputCount,...response});
          event({kind:'legacy-dispatch-finish',requestSha256:prepared.requestSha256,requestKind:prepared.kind,status:projected.status,activeRequests:active});
          return projected;
        }finally{clearTimeout(timer);if(request.signal)request.signal.removeEventListener('abort',onAbort);}
      },
      async release(){if(released)return;released=true;await exclusive(async()=>{active--;need(active>=0,'active-underflow');});},
    });
  }
  async function samples(){const values=[];for(let index=0;index<3;index++){if(index)await delay(binding.limits.sampleMs);
      values.push({observedAt:iso(clock),activeRequests:active});}return values;}
  async function currentClosure(){const state=await journal.load();need(state.mode==='closed'&&state.pending===null,'not-closed');
    const routeReceipt=routeClose(await route.assertClosed({binding,intentId:state.close.intentId}),binding,state.close.intentId,clock);
    const observation=await observed(),values=await samples();return closureReceipt(binding,state,values,observation,routeReceipt,clock);}
  return Object.freeze({
    get binding(){return clone(binding);},
    acquireIngress,
    async dispatch(request){
      const ingress=await acquireIngress({sourceAddress:request?.sourceAddress,clientCertificateSha256:request?.clientCertificateSha256});
      try{return await ingress.dispatch(request);}finally{await ingress.release();}
    },
    async close(){
      const intentId=randomId();need(ID.test(intentId),'intent-id');let state;
      try{state=await exclusive(async()=>{const current=await journal.load();need(current.mode==='open'&&current.pending===null,'close-state');
        return journal.record({type:'close-intent',intentId,bindingSha256,recordedAt:iso(clock)});});
        routeClose(await route.close({binding,intentId}),binding,intentId,clock);const deadline=clock()+binding.limits.requestMs;
        while(active!==0&&clock()<deadline)await delay(Math.min(binding.limits.sampleMs,Math.max(1,deadline-clock())));
        need(active===0,'drain-timeout');const observation=await observed(),values=await samples();need(values.every(value=>value.activeRequests===0),'drain');
        const routeReceipt=routeClose(await route.assertClosed({binding,intentId}),binding,intentId,clock);
        const effect={...terminal('close',binding,intentId,clock),routeReceiptSha256:legacyCompatibilityHash(routeReceipt)},receiptSha256=legacyCompatibilityHash(effect);
        state=await journal.record({type:'close-result',intentId,bindingSha256,outcome:'succeeded',receiptSha256,recordedAt:iso(clock)});
        event({kind:'legacy-admission-closed',intentId,receiptSha256});return closureReceipt(binding,state,values,observation,routeReceipt,clock);
      }catch(error){
        try{const current=await journal.load();if(current.pending?.kind==='close'&&current.pending.intentId===intentId){const effect=terminal('close-unknown',binding,intentId,clock);
            await journal.record({type:'close-result',intentId,bindingSha256,outcome:'unknown',receiptSha256:legacyCompatibilityHash(effect),recordedAt:iso(clock)});}}catch{}
        throw error;
      }
    },
    async assertFresh(){return currentClosure();},
    async linkManaged({managedReceiptSha256,nextReceiptSha256,legacyReceiptSha256}){
      need([managedReceiptSha256,nextReceiptSha256,legacyReceiptSha256].every(value=>HASH.test(value)),'managed-link');
      return journal.record({type:'managed-link',bindingSha256,managedReceiptSha256,nextReceiptSha256,legacyReceiptSha256,recordedAt:iso(clock)});
    },
    async restore({managedReceiptSha256}){
      const intentId=randomId();need(ID.test(intentId),'intent-id');let state;
      try{state=await exclusive(async()=>{const current=await journal.load();need(current.mode==='closed'&&current.pending===null
          &&current.managedLink?.managedReceiptSha256===managedReceiptSha256,'restore-state');
        return journal.record({type:'restore-intent',intentId,bindingSha256,managedReceiptSha256,recordedAt:iso(clock)});});
        const observation=await observed(),routeReceipt=routeRestore(await route.restore({binding,intentId,managedReceiptSha256}),binding,intentId,managedReceiptSha256,clock);
        const effect={...terminal('restore',binding,intentId,clock),routeReceiptSha256:legacyCompatibilityHash(routeReceipt)},receiptSha256=legacyCompatibilityHash(effect);
        state=await journal.record({type:'restore-result',intentId,bindingSha256,outcome:'succeeded',receiptSha256,recordedAt:iso(clock)});
        event({kind:'legacy-admission-restored',intentId,receiptSha256});return Object.freeze({schemaVersion:'runaai-legacy-compatibility-restore/v1',
          transitionId:binding.transitionId,bindingSha256,intentId,forwardIntentId:state.close.intentId,managedReceiptSha256,terminalReceiptSha256:receiptSha256,
          observationSha256:legacyCompatibilityHash(observation),observedAt:iso(clock),privateValuesIncluded:false});
      }catch(error){try{const current=await journal.load();if(current.pending?.kind==='restore'&&current.pending.intentId===intentId){const effect=terminal('restore-unknown',binding,intentId,clock);
            await journal.record({type:'restore-result',intentId,bindingSha256,outcome:'unknown',receiptSha256:legacyCompatibilityHash(effect),recordedAt:iso(clock)});}}catch{}
        throw error;}
    },
    async status(){const state=await journal.load();return Object.freeze({schemaVersion:'runaai-legacy-compatibility-status/v1',mode:state.mode,
      activeRequests:active,pending:clone(state.pending),bindingSha256,managedReceiptSha256:state.managedLink?.managedReceiptSha256??null});},
  });
}

export const validateLegacyRuntimeObservation=runtimeObservation;
