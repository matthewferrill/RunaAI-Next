import {randomUUID} from 'node:crypto';
import {CaddyQuiescenceCoordinator,configDigest,digest} from '../quiescence/coordinator.mjs';
import {APPLICATION,hash} from './assembly.mjs';

const HASH=/^[a-f0-9]{64}$/u,ID=/^[a-f0-9]{32}$/u;
const fail=code=>Object.assign(Error('m1-owner-authority-'+code),{code:'m1-owner-authority-'+code});
const need=(value,code)=>{if(!value)throw fail(code);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===keys.split(',').sort().join();
const clone=value=>structuredClone(value),nowIso=clock=>new Date(clock()).toISOString();
const id=()=>randomUUID().replaceAll('-','');

function qualificationReceipt(value,descriptor,clock){
  const observedNow=clock();
  need(exact(value,'schemaVersion,transitionId,descriptorSha256,sourceCommit,runtimeSealSha256,acceptanceGradesSha256,observedAt,expiresAt,evidenceSha256,privateValuesIncluded')
    &&value.schemaVersion==='runaai-owner-qualification-receipt/v1'&&value.transitionId===descriptor.transitionId
    &&value.descriptorSha256===hash(descriptor)&&value.sourceCommit===APPLICATION.sourceCommit
    &&value.runtimeSealSha256===APPLICATION.runtimeSealSha256
    &&value.acceptanceGradesSha256===descriptor.qualification.acceptanceGradesSha256
    &&HASH.test(value.evidenceSha256)&&Number.isFinite(Date.parse(value.observedAt))&&Number.isFinite(Date.parse(value.expiresAt))
    &&observedNow>=Date.parse(value.observedAt)&&observedNow<Date.parse(value.expiresAt)&&Date.parse(value.expiresAt)-Date.parse(value.observedAt)<=5000
    &&value.privateValuesIncluded===false,'qualification');return clone(value);
}
function homeReceipt(value,descriptor,clock){
  const observedNow=clock();
  need(exact(value,'schemaVersion,transitionId,descriptorSha256,installationSha256,profileSha256,observedAt,expiresAt,evidenceSha256,taskProcessConfirmed,nativeConfirmed,mtlsConfirmed,privateValuesIncluded')
    &&value.schemaVersion==='runaai-owner-home-readiness-receipt/v1'&&value.transitionId===descriptor.transitionId
    &&value.descriptorSha256===hash(descriptor)&&value.installationSha256===descriptor.home.installationSha256
    &&value.profileSha256===descriptor.home.profileSha256&&HASH.test(value.evidenceSha256)
    &&Number.isFinite(Date.parse(value.observedAt))&&Number.isFinite(Date.parse(value.expiresAt))
    &&observedNow>=Date.parse(value.observedAt)&&observedNow<Date.parse(value.expiresAt)&&Date.parse(value.expiresAt)-Date.parse(value.observedAt)<=5000
    &&value.taskProcessConfirmed===true&&value.nativeConfirmed===true&&value.mtlsConfirmed===true
    &&value.privateValuesIncluded===false,'home');return clone(value);
}

/** Concrete adapter for createClosedCompanionAdapter. It reads actual journals,
 * file bytes and Caddy admin state on every held-phase check. */
export function createOwnerDeploymentAuthority({descriptor,manifest,journal,quiescenceJournal,caddyFile,caddyAdmin,
  qualification,home,assertOwnerPrivate,clock=Date.now,randomId=id}){
  need(descriptor?.schemaVersion==='runaai-m1-deployment-assembly/v1'&&manifest?.schemaVersion==='runaai-m1-supervised-companion/v1'
    &&journal?.binding?.transitionId===descriptor.transitionId&&journal.binding.descriptorSha256===hash(descriptor)
    &&journal.binding.packageSha256===hash(manifest)&&typeof journal.load==='function'&&typeof journal.record==='function'
    &&typeof quiescenceJournal?.load==='function'&&typeof caddyFile?.read==='function'
    &&typeof caddyAdmin?.snapshot==='function'&&typeof caddyAdmin?.adapt==='function'
    &&typeof qualification?.observe==='function'&&typeof home?.observe==='function'
    &&typeof assertOwnerPrivate==='function'&&typeof clock==='function'&&typeof randomId==='function','constructor');
  let activeWriter=null;
  async function validateCaddyJournal(){
    const value=await quiescenceJournal.load(descriptor.transitionId);need(value,'quiescence-missing');
    CaddyQuiescenceCoordinator.prototype.validate.call({matchesReceipt:CaddyQuiescenceCoordinator.prototype.matchesReceipt},value);
    need(value.transitionId===descriptor.transitionId&&value.phase==='control-quiescent'
      &&value.mutations.every(mutation=>['succeeded','rejected'].includes(mutation.status)),'quiescence');return value;
  }
  async function actualClosed(expectedDispatch=null){
    await validateCaddyJournal();const state=await journal.load();
    need(state.pendingEffect===null&&state.pendingWriter===activeWriter&&activeWriter!==null,'writer');
    const bytes=await caddyFile.read();need(digest(bytes)===descriptor.caddy.candidateClosedSha256,'caddy-file');
    const adapted=await caddyAdmin.adapt(bytes),expectedConfigSha256=configDigest(adapted),current=await caddyAdmin.snapshot();
    need(configDigest(current.config)===expectedConfigSha256&&typeof current.etag==='string'&&current.etag.length>0
      &&current.etag.length<=256&&!/[\r\n]/u.test(current.etag),'caddy-runtime');
    const effectInputSha256=hash({phase:'candidate-caddy',fileSha256:descriptor.caddy.candidateClosedSha256,configSha256:expectedConfigSha256});
    need(state.effects.some(effect=>effect.kind==='candidate-caddy'&&effect.inputSha256===effectInputSha256&&effect.status==='succeeded'),'candidate-effect');
    let activeDispatch=null;
    if(expectedDispatch===null)need(state.pendingDispatch===null,'foreign-dispatch');
    else{
      need(exact(expectedDispatch,'operationId,requestSha256,descriptorSha256,packageSha256')&&state.pendingDispatch===expectedDispatch.operationId,'dispatch');
      const actual=state.dispatches[expectedDispatch.operationId];need(actual?.status==='pending'&&actual.writerId===activeWriter
        &&['requestSha256','descriptorSha256','packageSha256'].every(key=>actual[key]===expectedDispatch[key]),'dispatch');
      activeDispatch=clone(expectedDispatch);
    }
    return {transitionId:descriptor.transitionId,fileSha256:descriptor.caddy.candidateClosedSha256,etag:current.etag,pendingMutation:false,activeDispatch};
  }
  return Object.freeze({
    async withExclusiveClosedPhase(_descriptor,callback){
      need(activeWriter===null&&typeof callback==='function','writer-active');const writerId=randomId();need(ID.test(writerId),'writer-id');
      await journal.record({type:'writer-intent',writerId,transitionId:descriptor.transitionId,startedAt:nowIso(clock)});activeWriter=writerId;
      try{
        const value=await callback();const outcome=value?.status==='closed-deployment-complete'?'succeeded':'unknown';
        await journal.record({type:'writer-result',writerId,transitionId:descriptor.transitionId,outcome,recordedAt:nowIso(clock)});return value;
      }catch(error){try{await journal.record({type:'writer-result',writerId,transitionId:descriptor.transitionId,outcome:'unknown',recordedAt:nowIso(clock)});}catch{}
        throw error;
      }finally{activeWriter=null;}
    },
    assertOwnerPrivate,
    async verifyQualification(){return qualificationReceipt(await qualification.observe(descriptor),descriptor,clock);},
    async assertFreshHomeReady(){return homeReceipt(await home.observe(descriptor),descriptor,clock);},
    async assertCurrentClosedPhase(_descriptor,expectedDispatch=null){return actualClosed(expectedDispatch);},
    async recordDispatchIntent(value){
      need(activeWriter!==null&&value.transitionId===descriptor.transitionId,'dispatch-writer');
      return journal.record({type:'dispatch-intent',writerId:activeWriter,...clone(value)});
    },
    async recordDispatchResult(value){
      need(activeWriter!==null&&value.transitionId===descriptor.transitionId,'dispatch-writer');
      return journal.record({type:'dispatch-result',writerId:activeWriter,transitionId:value.transitionId,operationId:value.operationId,
        requestSha256:value.requestSha256,descriptorSha256:value.descriptorSha256,packageSha256:value.packageSha256,status:value.status,
        resultSha256:hash(value),recordedAt:nowIso(clock)});
    },
  });
}

export const validateOwnerQualificationReceipt=qualificationReceipt;
export const validateOwnerHomeReceipt=homeReceipt;
