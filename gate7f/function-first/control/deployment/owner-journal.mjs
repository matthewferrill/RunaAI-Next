import {lstat,open,readdir,readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {canonicalJson,sha256} from '../../../../gate4/canonical.mjs';

const HASH=/^[a-f0-9]{64}$/u,ID=/^[a-f0-9]{32}$/u,LIMIT=512,ZERO='0'.repeat(64);
const KINDS=Object.freeze(['managed-closure','home-apply','candidate-caddy','application-observed','final-caddy',
  'application-restore','home-restore','caller-restore','caddy-restore']);
const fail=code=>Object.assign(Error('m1-owner-journal-'+code),{code:'m1-owner-journal-'+code});
const need=(value,code)=>{if(!value)throw fail(code);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===keys.split(',').sort().join();
const time=value=>Number.isFinite(Date.parse(value));
const clone=value=>structuredClone(value);

function validateBinding(value){
  need(exact(value,'schemaVersion,transitionId,descriptorSha256,packageSha256')
    &&value.schemaVersion==='runaai-owner-deployment-binding/v1'&&ID.test(value.transitionId)
    &&HASH.test(value.descriptorSha256)&&HASH.test(value.packageSha256),'binding');return clone(value);
}
function initial(){return {pendingWriter:null,pendingDispatch:null,pendingEffect:null,writers:{},dispatches:{},effects:[],applicationObservation:null};}
function reduce(state,event,binding){
  need(event&&typeof event.type==='string','event');const next=clone(state);
  if(event.type==='writer-intent'){
    need(exact(event,'type,writerId,transitionId,startedAt')&&ID.test(event.writerId)&&event.transitionId===binding.transitionId&&time(event.startedAt)
      &&next.pendingWriter===null&&next.pendingDispatch===null&&next.pendingEffect===null&&!next.writers[event.writerId],'writer-intent');
    next.pendingWriter=event.writerId;next.writers[event.writerId]={status:'pending',startedAt:event.startedAt};
  }else if(event.type==='dispatch-intent'){
    need(exact(event,'type,writerId,transitionId,operationId,requestSha256,descriptorSha256,packageSha256,deadline')
      &&event.writerId===next.pendingWriter&&event.transitionId===binding.transitionId&&ID.test(event.operationId)
      &&HASH.test(event.requestSha256)&&event.descriptorSha256===binding.descriptorSha256
      &&event.packageSha256===binding.packageSha256&&time(event.deadline)&&next.pendingDispatch===null
      &&!next.dispatches[event.operationId],'dispatch-intent');
    next.pendingDispatch=event.operationId;next.dispatches[event.operationId]={status:'pending',writerId:event.writerId,
      requestSha256:event.requestSha256,descriptorSha256:event.descriptorSha256,packageSha256:event.packageSha256,deadline:event.deadline};
  }else if(event.type==='dispatch-result'){
    need(exact(event,'type,writerId,transitionId,operationId,requestSha256,descriptorSha256,packageSha256,status,resultSha256,recordedAt')
      &&event.writerId===next.pendingWriter&&event.transitionId===binding.transitionId&&event.operationId===next.pendingDispatch
      &&['closed-deployment-complete','needs-reconciliation'].includes(event.status)&&HASH.test(event.resultSha256)&&time(event.recordedAt),'dispatch-result');
    const dispatch=next.dispatches[event.operationId];need(dispatch&&dispatch.status==='pending'
      &&['requestSha256','descriptorSha256','packageSha256'].every(key=>dispatch[key]===event[key]),'dispatch-result-binding');
    dispatch.status=event.status==='closed-deployment-complete'?'succeeded':'unknown';dispatch.resultSha256=event.resultSha256;
    dispatch.recordedAt=event.recordedAt;if(dispatch.status==='succeeded')next.pendingDispatch=null;
  }else if(event.type==='writer-result'){
    need(exact(event,'type,writerId,transitionId,outcome,recordedAt')&&event.writerId===next.pendingWriter
      &&event.transitionId===binding.transitionId&&['succeeded','unknown'].includes(event.outcome)&&time(event.recordedAt),'writer-result');
    const writer=next.writers[event.writerId];need(writer?.status==='pending','writer-result-binding');
    if(event.outcome==='succeeded')need(next.pendingDispatch===null
      &&Object.values(next.dispatches).some(item=>item.writerId===event.writerId&&item.status==='succeeded'),'writer-result-before-dispatch');
    writer.status=event.outcome;writer.recordedAt=event.recordedAt;if(event.outcome==='succeeded')next.pendingWriter=null;
  }else if(event.type==='effect-intent'){
    need(exact(event,'type,effectId,transitionId,kind,inputSha256,recordedAt')&&ID.test(event.effectId)
      &&event.transitionId===binding.transitionId&&KINDS.includes(event.kind)&&HASH.test(event.inputSha256)&&time(event.recordedAt)
      &&next.pendingWriter===null&&next.pendingDispatch===null&&next.pendingEffect===null
      &&!next.effects.some(effect=>effect.effectId===event.effectId),'effect-intent');
    next.pendingEffect=event.effectId;next.effects.push({effectId:event.effectId,kind:event.kind,inputSha256:event.inputSha256,status:'pending',recordedAt:event.recordedAt});
  }else if(event.type==='effect-result'){
    need(exact(event,'type,effectId,transitionId,kind,inputSha256,outcome,receiptSha256,recordedAt')
      &&event.effectId===next.pendingEffect&&event.transitionId===binding.transitionId
      &&['succeeded','rejected','unknown'].includes(event.outcome)&&HASH.test(event.receiptSha256)&&time(event.recordedAt),'effect-result');
    const effect=next.effects.find(item=>item.effectId===event.effectId);need(effect?.status==='pending'
      &&effect.kind===event.kind&&effect.inputSha256===event.inputSha256,'effect-result-binding');
    effect.status=event.outcome;effect.receiptSha256=event.receiptSha256;effect.finishedAt=event.recordedAt;
    if(event.outcome!=='unknown')next.pendingEffect=null;
  }else if(event.type==='application-observed'){
    need(exact(event,'type,transitionId,writerId,operationId,releaseId,commit,artifactDigest,observationSha256,observedAt')
      &&event.transitionId===binding.transitionId&&ID.test(event.writerId)&&ID.test(event.operationId)
      &&typeof event.releaseId==='string'&&event.releaseId.length>0&&event.releaseId.length<=100
      &&/^[a-f0-9]{40}$/u.test(event.commit)&&HASH.test(event.artifactDigest)&&HASH.test(event.observationSha256)&&time(event.observedAt)
      &&next.pendingWriter===null&&next.pendingDispatch===null&&next.pendingEffect===null&&next.applicationObservation===null
      &&next.writers[event.writerId]?.status==='succeeded'&&next.dispatches[event.operationId]?.status==='succeeded','application-observed');
    next.applicationObservation=clone(event);
  }else need(false,'event-type');
  return next;
}
async function plain(file,{directory=false}={}){
  for(let current=file;current!==path.dirname(current);current=path.dirname(current))need(!(await lstat(current)).isSymbolicLink(),'linked-path');
  const info=await lstat(file);need(directory?info.isDirectory():info.isFile()&&info.nlink===1,'path-kind');return info;
}

/** Append-only owner-private metadata journal. It stores no credentials,
 * settings bytes, conversation data or model output. */
export class OwnerDeploymentJournal{
  #directory;#binding;#bindingSha256;#assertOwnerPrivate;
  constructor({directory,binding,assertOwnerPrivate}){
    need(typeof directory==='string'&&path.isAbsolute(directory)&&typeof assertOwnerPrivate==='function','boundary');
    this.#directory=path.resolve(directory);this.#binding=validateBinding(binding);this.#bindingSha256=sha256(canonicalJson(this.#binding));
    this.#assertOwnerPrivate=assertOwnerPrivate;
  }
  get binding(){return clone(this.#binding);}
  async boundary(){await plain(this.#directory,{directory:true});need(path.resolve(await realpath(this.#directory)).toLowerCase()===this.#directory.toLowerCase(),'resolved-path');
    await this.#assertOwnerPrivate(this.#directory);}
  async load(){
    await this.boundary();const names=(await readdir(this.#directory)).sort();
    need(names.length<=LIMIT&&names.every((name,index)=>name===String(index+1).padStart(6,'0')+'.json'),'sequence');
    let revision=0,previousSha256=ZERO,state=initial();
    for(const name of names){const filename=path.join(this.#directory,name);await plain(filename);const handle=await open(filename,'r');let bytes;
      try{const before=await handle.stat();need(before.size>0&&before.size<=65536&&before.nlink===1,'record-bounds');bytes=await handle.readFile();
        const after=await handle.stat();need(after.nlink===1&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&bytes.length===before.size,'record-drift');}
      finally{await handle.close();}
      let record;try{record=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));}catch{throw fail('record-json');}
      need(exact(record,'schemaVersion,revision,binding,bindingSha256,previousSha256,event')
        &&record.schemaVersion==='runaai-owner-deployment-journal/v1'&&record.revision===revision+1
        &&canonicalJson(record.binding)===canonicalJson(this.#binding)&&record.bindingSha256===this.#bindingSha256
        &&record.previousSha256===previousSha256&&bytes.equals(Buffer.from(canonicalJson(record)+'\n')),'record-integrity');
      state=reduce(state,record.event,this.#binding);previousSha256=sha256(bytes);revision++;
    }
    await this.#assertOwnerPrivate(this.#directory);return {revision,previousSha256,...state};
  }
  async record(event){
    const prior=await this.load();need(prior.revision<LIMIT,'capacity');reduce(prior,event,this.#binding);
    const record={schemaVersion:'runaai-owner-deployment-journal/v1',revision:prior.revision+1,binding:this.#binding,
      bindingSha256:this.#bindingSha256,previousSha256:prior.previousSha256,event:clone(event)};
    const bytes=Buffer.from(canonicalJson(record)+'\n');need(bytes.length<=65536,'record-bounds');const filename=path.join(this.#directory,String(record.revision).padStart(6,'0')+'.json');
    let handle;try{handle=await open(filename,'wx');}catch(error){throw error.code==='EEXIST'?fail('concurrent-publication'):error;}
    try{need((await handle.stat()).nlink===1,'record-links');await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    const state=await this.load();need(state.revision===record.revision&&state.previousSha256===sha256(bytes),'publication-drift');
    return state;
  }
}

export const ownerJournalHash=value=>sha256(canonicalJson(value));
export const ownerEffectKinds=KINDS;
