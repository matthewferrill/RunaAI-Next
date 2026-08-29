import {randomUUID} from 'node:crypto';
import {APPLICATION,hash} from './assembly.mjs';
import {validateManagedCallerClosure,validateManagedCallerRestore} from './managed-callers.mjs';
import {validateOwnerQualificationReceipt,validateOwnerHomeReceipt} from './owner-authority.mjs';

const HASH=/^[a-f0-9]{64}$/u,ID=/^[a-f0-9]{32}$/u;
const fail=code=>Object.assign(Error('m1-two-host-'+code),{code:'m1-two-host-'+code});
const need=(value,code)=>{if(!value)throw fail(code);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===keys.split(',').sort().join();
const time=value=>Number.isFinite(Date.parse(value));
const newId=()=>randomUUID().replaceAll('-','');
const nowIso=clock=>new Date(clock()).toISOString();

function applicationObservation(value,expected,clock){
  const observedNow=clock();
  need(exact(value,'schemaVersion,releaseId,commit,artifactDigest,observedAt,evidenceSha256,admissionClosed,privateValuesIncluded')
    &&value.schemaVersion==='runaai-control-application-observation/v1'&&value.releaseId===expected.releaseId
    &&value.commit===expected.commit&&value.artifactDigest===expected.artifactDigest&&time(value.observedAt)
    &&observedNow-Date.parse(value.observedAt)>=0&&observedNow-Date.parse(value.observedAt)<=5000&&HASH.test(value.evidenceSha256)
    &&value.admissionClosed===true&&value.privateValuesIncluded===false,'application-observation');return structuredClone(value);
}
function caddyPlan(value,descriptor,phase){
  const fileSha256=phase==='candidate-caddy'?descriptor.caddy.candidateClosedSha256:descriptor.caddy.finalSha256;
  need(exact(value,'phase,fileSha256,configSha256')&&value.phase===phase&&value.fileSha256===fileSha256&&HASH.test(value.configSha256),'caddy-plan');
  return structuredClone(value);
}
function caddyReceipt(value,descriptor,plan,clock){
  const observedNow=clock();
  need(exact(value,'schemaVersion,transitionId,phase,mutationId,fromFileSha256,toFileSha256,fromConfigSha256,toConfigSha256,expectedEtag,observedEtag,terminalReceiptSha256,evidenceSha256,observedAt,pendingMutation,privateValuesIncluded')
    &&value.schemaVersion==='runaai-owner-caddy-publication/v1'&&value.transitionId===descriptor.transitionId&&value.phase===plan.phase
    &&ID.test(value.mutationId)&&HASH.test(value.fromFileSha256)&&value.toFileSha256===plan.fileSha256
    &&HASH.test(value.fromConfigSha256)&&value.toConfigSha256===plan.configSha256
    &&typeof value.expectedEtag==='string'&&value.expectedEtag.length>0&&value.observedEtag===value.expectedEtag
    &&HASH.test(value.terminalReceiptSha256)&&HASH.test(value.evidenceSha256)&&time(value.observedAt)
    &&observedNow-Date.parse(value.observedAt)>=0&&observedNow-Date.parse(value.observedAt)<=5000
    &&value.pendingMutation===null&&value.privateValuesIncluded===false,'caddy-receipt');return structuredClone(value);
}
function caddyHealth(value,descriptor,plan,forwardReceiptSha256,clock){
  const observedNow=clock();
  need(exact(value,'schemaVersion,transitionId,phase,forwardReceiptSha256,fileSha256,configSha256,observedEtag,observedAt,evidenceSha256,healthAllowlistConfirmed,pendingMutation,privateValuesIncluded')
    &&value.schemaVersion==='runaai-owner-caddy-health-observation/v1'&&value.transitionId===descriptor.transitionId
    &&value.phase==='candidate-caddy'&&value.forwardReceiptSha256===forwardReceiptSha256&&HASH.test(forwardReceiptSha256)
    &&value.fileSha256===plan.fileSha256&&value.configSha256===plan.configSha256
    &&typeof value.observedEtag==='string'&&value.observedEtag.length>0&&value.observedEtag.length<=256&&!/[\r\n]/u.test(value.observedEtag)
    &&time(value.observedAt)&&observedNow-Date.parse(value.observedAt)>=0&&observedNow-Date.parse(value.observedAt)<=5000
    &&HASH.test(value.evidenceSha256)&&value.healthAllowlistConfirmed===true&&value.pendingMutation===null
    &&value.privateValuesIncluded===false,'caddy-health');return structuredClone(value);
}
function nativeResult(value,transitionId){
  need(value?.schemaVersion==='runaai-native-settings-transition/v1'&&value.transactionId===transitionId&&value.passed===true
    &&value.admissionOpened===false&&value.productionPromoted===false&&value.powerRestored===false,'home-apply');return structuredClone(value);
}
function nativeRestore(value,transitionId){
  need(value?.schemaVersion==='runaai-native-settings-restore/v1'&&value.transactionId===transitionId&&value.passed===true
    &&value.admissionOpened===false&&value.productionPromoted===false&&value.powerRestored===false,'home-restore');return structuredClone(value);
}

function activationReceipt(value,descriptor,manifest,clock){
  const observedNow=clock();
  need(exact(value,'schemaVersion,transitionId,descriptorSha256,packageSha256,sourceCommit,runtimeSealSha256,acceptanceGradesSha256,observedAt,expiresAt,evidenceSha256,activationPermitted,privateValuesIncluded')
    &&value.schemaVersion==='runaai-owner-activation-authority/v1'&&value.transitionId===descriptor.transitionId
    &&value.descriptorSha256===hash(descriptor)&&value.packageSha256===hash(manifest)
    &&value.sourceCommit===descriptor.application.sourceCommit
    &&value.runtimeSealSha256===descriptor.qualification.runtimeSealSha256
    &&value.acceptanceGradesSha256===descriptor.qualification.acceptanceGradesSha256
    &&time(value.observedAt)&&time(value.expiresAt)&&observedNow>=Date.parse(value.observedAt)
    &&observedNow<Date.parse(value.expiresAt)&&Date.parse(value.expiresAt)-Date.parse(value.observedAt)<=5000
    &&HASH.test(value.evidenceSha256)&&value.activationPermitted===true&&value.privateValuesIncluded===false,
  'activation-authority');
  return structuredClone(value);
}

/** Finite one-effect-at-a-time continuation. Every call reloads the durable
 * journal and never loops over effects, retries unknown work or opens admission
 * from an observation alone. */
export function createTwoHostDeploymentCoordinator({descriptor,manifest,journal,qualification,managedCallers,home,control,application,
  closedAdapter,activationAuthority,clock=Date.now,randomId=newId}){
  need(descriptor?.schemaVersion==='runaai-m1-deployment-assembly/v1'&&manifest?.schemaVersion==='runaai-m1-supervised-companion/v1'
    &&journal?.binding?.transitionId===descriptor.transitionId&&journal.binding.descriptorSha256===hash(descriptor)
    &&journal.binding.packageSha256===hash(manifest)&&typeof journal.load==='function'&&typeof journal.record==='function'
    &&typeof qualification?.observe==='function'&&typeof managedCallers?.close==='function'&&typeof managedCallers?.assertFresh==='function'
    &&typeof managedCallers?.restore==='function'&&typeof home?.apply==='function'&&typeof home?.confirm==='function'&&typeof home?.restore==='function'
    &&typeof control?.prepare==='function'&&typeof control?.publish==='function'&&typeof control?.confirmCandidateClosed==='function'
    &&typeof control?.restoreInitialClosed==='function'
    &&typeof application?.observe==='function'&&typeof application?.restore==='function'&&typeof closedAdapter?.execute==='function'
    &&typeof clock==='function'&&typeof randomId==='function','constructor');
  need(descriptor.activationPermitted===true&&Array.isArray(descriptor.blockers)&&descriptor.blockers.length===0
    &&typeof activationAuthority?.observe==='function','activation-blocked');
  const transitionId=descriptor.transitionId;
  const effect=(state,kind)=>state.effects.find(item=>item.kind===kind);
  const reconciliation=kind=>({status:'needs-reconciliation',kind,automaticRetryPermitted:false,
    automaticRollbackPermitted:false,productionPromoted:false});
  function blocked(state){return state.pendingWriter!==null||state.pendingDispatch!==null||state.pendingEffect!==null
    ||state.effects.some(item=>item.status==='unknown');}
  async function qualified(){return validateOwnerQualificationReceipt(await qualification.observe(descriptor),descriptor,clock);}
  async function authorized(){return activationReceipt(await activationAuthority.observe({descriptor,manifest}),descriptor,manifest,clock);}
  async function perform(kind,input,action,validate){
    const effectId=randomId();need(ID.test(effectId),'effect-id');const inputSha256=hash(input);
    await journal.record({type:'effect-intent',effectId,transitionId,kind,inputSha256,recordedAt:nowIso(clock)});
    let receipt,receiptSha256;
    try{receipt=validate(await action());receiptSha256=hash(receipt);
      await journal.record({type:'effect-result',effectId,transitionId,kind,inputSha256,outcome:'succeeded',receiptSha256,recordedAt:nowIso(clock)});
      return {status:'advanced',kind,effectId,receiptSha256,productionPromoted:false};
    }catch{
      receiptSha256=hash({schemaVersion:'runaai-owner-unknown-effect/v1',transitionId,effectId,kind,inputSha256});
      try{await journal.record({type:'effect-result',effectId,transitionId,kind,inputSha256,outcome:'unknown',receiptSha256,recordedAt:nowIso(clock)});}catch{}
      return {status:'needs-reconciliation',kind,effectId,receiptSha256,automaticRetryPermitted:false,automaticRollbackPermitted:false,productionPromoted:false};
    }
  }
  async function freshClosure(state){const forwardEffect=effect(state,'managed-closure');need(forwardEffect?.status==='succeeded','closure-missing');
    return validateManagedCallerClosure(await managedCallers.assertFresh({transitionId,forwardReceiptSha256:forwardEffect.receiptSha256}),{transitionId,now:clock()});}
  async function freshCandidateCaddy(state){const forwardEffect=effect(state,'candidate-caddy');need(forwardEffect?.status==='succeeded','candidate-caddy-missing');
    const plan=caddyPlan(await control.prepare({phase:'candidate-caddy',descriptor}),descriptor,'candidate-caddy');
    need(hash(plan)===forwardEffect.inputSha256,'candidate-caddy-plan-drift');
    return caddyHealth(await control.confirmCandidateClosed({transitionId,descriptor,plan,forwardReceiptSha256:forwardEffect.receiptSha256}),
      descriptor,plan,forwardEffect.receiptSha256,clock);
  }
  return Object.freeze({
    async advance(){
      await authorized();await qualified();let state=await journal.load();
      if(blocked(state))return {status:'needs-reconciliation',automaticRetryPermitted:false,automaticRollbackPermitted:false,productionPromoted:false};
      for(const item of state.effects)if(!['succeeded'].includes(item.status))return {status:'blocked',code:'terminal-effect-not-successful',kind:item.kind,productionPromoted:false};
      if(!effect(state,'managed-closure'))return perform('managed-closure',{transitionId,descriptorSha256:hash(descriptor)},
        ()=>managedCallers.close({transitionId,descriptor}),value=>validateManagedCallerClosure(value,{transitionId,now:clock()}).receipt);
      try{await freshClosure(state);}catch{return reconciliation('managed-closure-confirmation');}
      if(!effect(state,'home-apply'))return perform('home-apply',{transitionId,closureReceiptSha256:effect(state,'managed-closure').receiptSha256},
        async()=>{const result=nativeResult(await home.apply({transitionId,descriptor}),transitionId);
          validateOwnerHomeReceipt(await home.confirm({transitionId,descriptor,result}),descriptor,clock);return result;},value=>nativeResult(value,transitionId));
      try{validateOwnerHomeReceipt(await home.confirm({transitionId,descriptor,receiptSha256:effect(state,'home-apply').receiptSha256}),descriptor,clock);}
      catch{return reconciliation('home-confirmation');}
      if(!effect(state,'candidate-caddy')){
        const plan=caddyPlan(await control.prepare({phase:'candidate-caddy',descriptor}),descriptor,'candidate-caddy');
        return perform('candidate-caddy',plan,()=>control.publish({phase:'candidate-caddy',descriptor,plan}),value=>caddyReceipt(value,descriptor,plan,clock));
      }
      if(!state.applicationObservation){
        try{await freshCandidateCaddy(state);}catch{return reconciliation('candidate-caddy-health');}
        try{
          const writers=Object.entries(state.writers).filter(([,value])=>value.status==='succeeded');
          if(!writers.length){
            applicationObservation(await application.observe({expected:'predecessor',descriptor}),{...descriptor.predecessor},clock);
            const result=await closedAdapter.execute();if(result.status!=='closed-deployment-complete')return result;
            state=await journal.load();
          }
          const [writerId]=Object.entries(state.writers).filter(([,value])=>value.status==='succeeded').at(-1)??[];
          const [operationId]=Object.entries(state.dispatches).filter(([,value])=>value.writerId===writerId&&value.status==='succeeded').at(-1)??[];
          need(ID.test(writerId)&&ID.test(operationId),'application-dispatch');
          const observation=applicationObservation(await application.observe({expected:'successor',descriptor}),
            {releaseId:descriptor.application.releaseId,commit:descriptor.application.sourceCommit,artifactDigest:descriptor.application.artifactDigest},clock);
          await journal.record({type:'application-observed',transitionId,writerId,operationId,releaseId:observation.releaseId,commit:observation.commit,
            artifactDigest:observation.artifactDigest,observationSha256:observation.evidenceSha256,observedAt:observation.observedAt});
          return {status:'advanced',kind:'application-observed',operationId,observationSha256:observation.evidenceSha256,productionPromoted:false};
        }catch{return reconciliation('application-observed');}
      }
      if(!effect(state,'final-caddy')){
        try{await freshCandidateCaddy(state);}catch{return reconciliation('candidate-caddy-health');}
        const plan=caddyPlan(await control.prepare({phase:'final-caddy',descriptor}),descriptor,'final-caddy');
        return perform('final-caddy',plan,()=>control.publish({phase:'final-caddy',descriptor,plan}),value=>caddyReceipt(value,descriptor,plan,clock));
      }
      return {status:'complete',transitionId,releaseId:descriptor.application.releaseId,productionPromoted:true};
    },
    async rollback(){
      await authorized();await qualified();const state=await journal.load();
      if(blocked(state))return {status:'needs-reconciliation',automaticRetryPermitted:false,automaticRollbackPermitted:false,productionPromoted:false};
      const settledApplicationDispatch=Object.values(state.dispatches).some(value=>value.status==='succeeded');
      if(settledApplicationDispatch&&!state.applicationObservation)return {status:'needs-reconciliation',kind:'application-observation',
        automaticRetryPermitted:false,automaticRollbackPermitted:false,productionPromoted:false};
      const caddyForward=effect(state,'final-caddy')??effect(state,'candidate-caddy');
      if(effect(state,'final-caddy')&&!effect(state,'caddy-restore'))return perform('caddy-restore',
        {transitionId,forwardReceiptSha256:caddyForward.receiptSha256,target:descriptor.caddy.initialClosedSha256},
        ()=>control.restoreInitialClosed({transitionId,descriptor,forwardReceiptSha256:caddyForward.receiptSha256}),value=>{
          need(value?.schemaVersion==='runaai-owner-caddy-restore/v1'&&value.transitionId===transitionId&&value.passed===true
            &&value.currentFileSha256===descriptor.caddy.initialClosedSha256&&value.pendingMutation===null,'caddy-restore');return structuredClone(value);});
      if(state.applicationObservation&&!effect(state,'application-restore')){
        const operationId=state.applicationObservation.operationId;
        return perform('application-restore',{transitionId,operationId},()=>application.restore({transitionId,descriptor,operationId}),value=>{
          need(value?.schemaVersion==='runaai-owner-application-restore/v1'&&value.transitionId===transitionId&&value.forwardOperationId===operationId
            &&value.passed===true&&value.releaseId===descriptor.predecessor.releaseId&&value.commit===descriptor.predecessor.commit
            &&value.artifactDigest===descriptor.predecessor.artifactDigest&&value.admissionOpened===false,'application-restore');return structuredClone(value);});
      }
      if(caddyForward&&!effect(state,'caddy-restore'))return perform('caddy-restore',
        {transitionId,forwardReceiptSha256:caddyForward.receiptSha256,target:descriptor.caddy.initialClosedSha256},
        ()=>control.restoreInitialClosed({transitionId,descriptor,forwardReceiptSha256:caddyForward.receiptSha256}),value=>{
          need(value?.schemaVersion==='runaai-owner-caddy-restore/v1'&&value.transitionId===transitionId&&value.passed===true
            &&value.currentFileSha256===descriptor.caddy.initialClosedSha256&&value.pendingMutation===null,'caddy-restore');return structuredClone(value);});
      if(effect(state,'home-apply')&&!effect(state,'home-restore'))return perform('home-restore',
        {transitionId,forwardReceiptSha256:effect(state,'home-apply').receiptSha256},()=>home.restore({transitionId,descriptor,
          forwardReceiptSha256:effect(state,'home-apply').receiptSha256}),value=>nativeRestore(value,transitionId));
      if(effect(state,'managed-closure')&&!effect(state,'caller-restore'))return perform('caller-restore',
        {transitionId,forwardReceiptSha256:effect(state,'managed-closure').receiptSha256},()=>managedCallers.restore({transitionId,
          forwardReceiptSha256:effect(state,'managed-closure').receiptSha256}),value=>validateManagedCallerRestore(value,
          {transitionId,forwardReceiptSha256:effect(state,'managed-closure').receiptSha256,now:clock()}).receipt);
      return {status:'restored',transitionId,productionPromoted:false};
    },
  });
}

export const validateControlApplicationObservation=applicationObservation;
export const validateOwnerCaddyPublication=caddyReceipt;
export const validateOwnerCaddyHealthObservation=caddyHealth;
export const validateOwnerActivationAuthority=activationReceipt;
