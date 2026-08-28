import {CaddyQuiescenceCoordinator} from '../quiescence/coordinator.mjs';
import {APPLICATION,demand,hash} from './assembly.mjs';
import {UNIMPLEMENTED_BOUNDARIES} from './descriptor.mjs';

const clone=value=>structuredClone(value);
const pending=value=>!['succeeded','rejected'].includes(value.status);
const matches=(a,b)=>hash(a)===hash(b);
function current(value,latest,code){
  demand(latest&&latest.revision===value.revision&&latest.stateSha256===hash(value),code);
}
export const journalReference=value=>({revision:value.revision,stateSha256:hash(value)});
function validateQuiescence(value,descriptor,latest){
  // Reuse the v2 validator without constructing fake I/O adapters or invoking
  // them. It verifies the original/overlay bytes and each terminal mutation.
  CaddyQuiescenceCoordinator.prototype.validate.call({matchesReceipt:CaddyQuiescenceCoordinator.prototype.matchesReceipt},value);
  current(value,latest,'transaction-quiescence-stale');
  demand(value.transitionId===descriptor.transitionId&&value.originalSha256===descriptor.caddy.originalSha256
    &&value.overlaySha256===descriptor.caddy.initialClosedSha256
    &&value.scope==='selected-caddy-proxied-requests-only'&&value.homeQuiescenceProved===false,'transaction-quiescence-binding');
}
function descriptorBinding(descriptor,expected){
  demand(descriptor?.schemaVersion==='runaai-m1-deployment-assembly/v1'&&hash(descriptor)===expected
    &&descriptor.application.sourceCommit===APPLICATION.sourceCommit&&descriptor.qualification.runtimeSealSha256===APPLICATION.runtimeSealSha256
    &&descriptor.activationPermitted===false,'transaction-descriptor-binding');
}
function validateState(state,descriptor,latest){
  current(state,latest,'transaction-journal-stale');descriptorBinding(descriptor,state.descriptorSha256);
  demand(state.schemaVersion==='runaai-m1-deployment-transaction/v1'&&state.transitionId===descriptor.transitionId
    &&state.revision>=1&&Array.isArray(state.effects)&&state.homeChanged===false&&state.applicationChanged===false
    &&state.productionPromoted===false,'transaction-state');
}

/** Pure journal records only. The operator must persist each returned record by
 * current revision CAS in the owner-private journal before acting. `latest*`
 * references come from fresh journal reads, never browser/model input. No I/O,
 * timer, request, native command or deployment occurs in this module. */
export function prepareTransaction({descriptor,expectedDescriptorSha256,quiescence,latestQuiescence}){
  descriptorBinding(descriptor,expectedDescriptorSha256);validateQuiescence(quiescence,descriptor,latestQuiescence);
  demand(quiescence.phase==='prepared'&&quiescence.mutations.length===0,'transaction-prepared-required');
  return {schemaVersion:'runaai-m1-deployment-transaction/v1',transitionId:descriptor.transitionId,
    descriptorSha256:expectedDescriptorSha256,revision:1,phase:'prepared',effects:[],
    quiescenceRevision:quiescence.revision,quiescenceSha256:hash(quiescence),
    homeChanged:false,applicationChanged:false,productionPromoted:false,
    events:[{phase:'prepared',quiescenceRevision:quiescence.revision}]};
}

export function recordQuiescence({state,descriptor,latest,quiescence,latestQuiescence,now=Date.now()}){
  validateState(state,descriptor,latest);validateQuiescence(quiescence,descriptor,latestQuiescence);
  demand(quiescence.revision>state.quiescenceRevision&&Number.isFinite(now),'transaction-quiescence-revision');
  const effects=quiescence.mutations;
  demand(effects.length>=state.effects.length,'transaction-effect-history');
  for(let index=0;index<state.effects.length;index++){
    const prior=state.effects[index],next=effects[index];
    if(!pending(prior))demand(matches(prior,next),'transaction-terminal-rewrite');
    else demand(['mutationId','direction','fromConfigSha256','toConfigSha256','expectedEtag'].every(key=>prior[key]===next[key]),'transaction-effect-rebound');
  }
  const last=effects.at(-1);let phase='needs-reconciliation';
  if(!effects.some(pending)){
    if(quiescence.phase==='restored'&&(!last||last.direction==='restore'&&last.status==='succeeded'
      ||last.direction==='admission'&&last.status==='rejected'))phase='restored';
    else if(last&&(last.direction==='admission'&&last.status==='succeeded'||last.direction==='restore'&&last.status==='rejected')){
      if(quiescence.phase==='admission-closed')phase='control-closed';
      if(quiescence.phase==='control-quiescent'){
        const event=quiescence.events.at(-1),samples=quiescence.events.filter(item=>Array.isArray(item.counters)).slice(-3);
        demand(event.phase==='control-quiescent'&&event.stableZeroSamples>=3
          &&now>=Date.parse(event.at)&&now-Date.parse(event.at)<=5000&&samples.length===3
          &&samples.every(item=>item.counters.length===quiescence.upstreams.length
            &&quiescence.upstreams.every(address=>item.counters.filter(counter=>counter.address===address&&counter.num_requests===0).length===1)),
        'transaction-drain-not-fresh-or-proven');
        phase='control-quiescent';
      }
    }
  }
  const result=clone(state);result.revision++;result.phase=phase;result.effects=clone(effects);
  result.quiescenceRevision=quiescence.revision;result.quiescenceSha256=hash(quiescence);
  result.events.push({phase,quiescenceRevision:quiescence.revision,at:new Date(now).toISOString()});return result;
}

function currentQuiescence(state,latest){
  demand(latest?.revision===state.quiescenceRevision&&latest.stateSha256===state.quiescenceSha256,'transaction-quiescence-stale');
}
export function nextTransactionAction({state,descriptor,latest,latestQuiescence}){
  validateState(state,descriptor,latest);
  currentQuiescence(state,latestQuiescence);
  if(state.effects.some(pending)||state.phase==='needs-reconciliation')return {
    status:'blocked',code:'same-effect-reconciliation-required',effect:clone(state.effects.find(pending)??null),
    automaticRetryPermitted:false,rollbackPermitted:false,productionPromoted:false};
  if(state.phase==='prepared')return {status:'action-required',action:'control.closeAdmission',quiescenceRevision:state.quiescenceRevision,productionPromoted:false};
  if(state.phase==='control-closed')return {status:'action-required',action:'control.drain',quiescenceRevision:state.quiescenceRevision,productionPromoted:false};
  if(state.phase==='control-quiescent')return {status:'blocked',code:'native-wide-adapter-not-implemented',
    missing:[...UNIMPLEMENTED_BOUNDARIES],controlQuiescenceIsNotHomeQuiescence:true,productionPromoted:false};
  if(state.phase==='restored')return {status:'restored',deploymentCompleted:false,productionPromoted:false};
  demand(false,'transaction-phase');
}

export function rollbackTransactionAction({state,descriptor,latest,latestQuiescence}){
  validateState(state,descriptor,latest);
  currentQuiescence(state,latestQuiescence);
  demand(!state.effects.some(pending)&&['prepared','control-closed','control-quiescent','restored'].includes(state.phase),
    'transaction-reconcile-before-rollback');
  // This implemented slice cannot have changed Home/app, so the existing v2
  // rollback is valid. A future two-host executor must prove their restoration
  // before reusing the original route; merely adding a `ready:true` is forbidden.
  return {status:state.phase==='restored'?'restored':'action-required',action:state.phase==='restored'?null:'control.rollback',
    expectedOriginalSha256:descriptor.caddy.originalSha256,quiescenceRevision:state.quiescenceRevision,
    homeRestorationRequired:false,applicationRestorationRequired:false,productionPromoted:false};
}
