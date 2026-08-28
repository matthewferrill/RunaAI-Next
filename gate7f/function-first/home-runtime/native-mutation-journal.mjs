import {lstat,open,readdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const zero='0'.repeat(64),limit=256;
const fail=code=>Object.assign(Error('runtime-native-journal-'+code),{code:'runtime-native-journal-'+code});
const check=(value,code)=>{if(!value)throw fail(code);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===keys.split(',').sort().join();
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value)
  :Array.isArray(value)?'['+value.map(canonical).join(',')+']'
  :'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
function validateBinding(value){
  check(exact(value,'transitionId,originalSha256,candidateSha256,engine,descriptorSha256,operatorSha256')
    &&/^[a-f0-9]{32}$/.test(value.transitionId)
    &&['originalSha256','candidateSha256','descriptorSha256','operatorSha256'].every(key=>HASH.test(value[key]))
    &&exact(value.engine,'pid,startedAt,executable')&&Number.isSafeInteger(value.engine.pid)&&value.engine.pid>0
    &&Number.isFinite(Date.parse(value.engine.startedAt))&&typeof value.engine.executable==='string'
    &&value.engine.executable.length>0&&value.engine.executable.length<512,'binding');
  const copy=JSON.parse(canonical(value));Object.freeze(copy.engine);return Object.freeze(copy);
}
function settingsReceipt(value,binding,mode,currentSha256){
  check(exact(value,'schemaVersion,mode,transactionId,originalSha256,candidateSha256,currentSha256,passed,targetBound,privateValuesIncluded,inMemoryEnforcementProved,admissionOpened,actualPreimageRetained,alreadyOriginal')
    &&value.schemaVersion==='runaai-native-settings-file/v1'&&value.mode===mode
    &&value.transactionId===binding.transitionId&&value.originalSha256===binding.originalSha256
    &&value.candidateSha256===binding.candidateSha256
    &&value.currentSha256===(mode==='Swap'?binding.candidateSha256:binding.originalSha256)
    &&value.passed===true&&value.targetBound===true&&value.privateValuesIncluded===false
    &&value.inMemoryEnforcementProved===false&&value.admissionOpened===false
    &&typeof value.actualPreimageRetained==='boolean'
    &&value.alreadyOriginal===(mode==='Restore'&&currentSha256===binding.originalSha256)
    &&(mode!=='Swap'||value.actualPreimageRetained===true),'settings-receipt');
}
function reduce(state,event,binding){
  check(event&&typeof event.type==='string','event');
  const next=structuredClone(state),type=event.type;
  if(type==='native-settings-file-intent'){
    check(exact(event,'type,transactionId,mode,originalSha256,candidateSha256,currentSha256')
      &&event.transactionId===binding.transitionId&&['Prepare','Swap','Restore'].includes(event.mode)
      &&event.originalSha256===binding.originalSha256&&event.candidateSha256===binding.candidateSha256
      &&HASH.test(event.currentSha256)
      &&(event.mode==='Restore'||event.currentSha256===binding.originalSha256),'settings-intent');
    const id='settings:'+event.mode;
    check(!next.pending&&!next.operations[id],'pending-or-reused');
    next.pending=id;next.operations[id]={kind:'settings',mode:event.mode,currentSha256:event.currentSha256,status:'pending'};
  }else if(type==='native-settings-file-returned'){
    check(event.transactionId===binding.transitionId&&['Prepare','Swap','Restore'].includes(event.mode),'settings-return');
    const id='settings:'+event.mode,op=next.operations[id];
    check(next.pending===id&&op?.status==='pending','return-without-pending');
    if(event.confirmed===true){
      check(exact(event,'type,transactionId,mode,confirmed,receipt'),'settings-return');
      settingsReceipt(event.receipt,binding,event.mode,op.currentSha256);op.status='confirmed';next.pending=null;
    }else{
      check(exact(event,'type,transactionId,mode,confirmed,unknownOutcome,executionStopped,errorCode')
        &&event.confirmed===false&&event.unknownOutcome===true&&typeof event.executionStopped==='boolean'
        &&event.errorCode==='runtime-settings-file-command-unconfirmed','settings-return');
      op.status='unknown';
    }
  }else if(type==='native-server-command-intent'){
    check(exact(event,'type,commandId,mode,bind,engine,descriptorSha256,time')&&UUID.test(event.commandId)
      &&['stop','start'].includes(event.mode)&&(event.mode==='stop'?event.bind===null:['127.0.0.1','0.0.0.0'].includes(event.bind))
      &&canonical(event.engine)===canonical(binding.engine)&&event.descriptorSha256===binding.descriptorSha256
      &&Number.isFinite(event.time),'server-intent');
    const id='server:'+event.commandId;
    check(!next.pending&&!next.operations[id],'pending-or-reused');
    next.pending=id;next.operations[id]={kind:'server',mode:event.mode,time:event.time,status:'pending'};
  }else if(type==='native-server-command-returned'){
    check(exact(event,'type,commandId,mode,failure,stdoutSha256,stderrSha256,time')
      &&UUID.test(event.commandId)&&Number.isFinite(event.time),'server-return');
    const id='server:'+event.commandId,op=next.operations[id];
    check(next.pending===id&&op?.kind==='server'&&op.mode===event.mode&&op.status==='pending'&&event.time>=op.time,'return-without-pending');
    op.returnedAt=event.time;
    if(event.failure===null){
      check(HASH.test(event.stdoutSha256)&&HASH.test(event.stderrSha256),'server-return');op.status='returned';
    }else{
      check(exact(event.failure,'code,executionStopped')&&event.failure.code==='runtime-native-server-child-unconfirmed'
        &&typeof event.failure.executionStopped==='boolean'&&event.stdoutSha256===null&&event.stderrSha256===null,'server-return');
      op.status='unknown';
    }
  }else if(type==='native-server-command-confirmed'){
    check(exact(event,'type,commandId,mode,engine,descriptorSha256,observedAt,time,settingsEnforced')
      &&UUID.test(event.commandId)&&canonical(event.engine)===canonical(binding.engine)
      &&event.descriptorSha256===binding.descriptorSha256&&Number.isFinite(event.observedAt)
      &&Number.isFinite(event.time)&&event.time>=event.observedAt&&event.time-event.observedAt<=5000
      &&event.settingsEnforced===false,'server-confirmation');
    const id='server:'+event.commandId,op=next.operations[id];
    check(next.pending===id&&op?.kind==='server'&&op.mode===event.mode&&op.status==='returned'
      &&event.observedAt>=op.returnedAt,'confirmation-without-return');
    op.status='confirmed';next.pending=null;
  }else throw fail('unsupported-event');
  return next;
}

async function plain(file,{directory=false}={}){
  for(let current=file;current!==path.dirname(current);current=path.dirname(current)){
    const info=await lstat(current);check(!info.isSymbolicLink(),'linked-path');
  }
  const info=await lstat(file);
  check(directory?info.isDirectory():info.isFile()&&info.nlink===1,'path-kind');return info;
}

/** Fixed host adapters may persist their metadata through this operator-only store. No arbitrary
 * event, mutation, reset, lifecycle command, or recovery authorization is provided. A protected
 * host wrapper must bind this directory and supply real ACL/ownership verification; an in-memory
 * flag or another reconstructed adapter never clears a retained pending operation. */
export class NativeMutationJournal{
  #directory;#binding;#assertOwnerPrivate;#bindingSha256;
  constructor({directory,binding,assertOwnerPrivate}){
    check(typeof directory==='string'&&path.isAbsolute(directory)&&typeof assertOwnerPrivate==='function','boundary');
    this.#directory=path.resolve(directory);this.#binding=validateBinding(binding);this.#assertOwnerPrivate=assertOwnerPrivate;
    this.#bindingSha256=hash(canonical(this.#binding));
  }
  async boundary(){
    await plain(this.#directory,{directory:true});
    check(path.resolve(await realpath(this.#directory)).toLowerCase()===this.#directory.toLowerCase(),'resolved-path');
    await this.#assertOwnerPrivate(this.#directory);
  }
  async load(){
    await this.boundary();const names=(await readdir(this.#directory)).sort();
    check(names.length<=limit&&names.every((name,index)=>name===String(index+1).padStart(6,'0')+'.json'),'sequence');
    let previousSha256=zero,state={pending:null,operations:{}},revision=0;
    for(const name of names){
      const filename=path.join(this.#directory,name);await plain(filename);
      const handle=await open(filename,'r');let bytes;
      try{
        const before=await handle.stat();check(before.nlink===1&&before.size>0&&before.size<=65536,'record-bounds');
        bytes=await handle.readFile();const after=await handle.stat();
        check(before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&after.nlink===1
          &&bytes.length===before.size,'record-drift');
      }finally{await handle.close();}
      let record;try{record=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));}catch{throw fail('record-invalid');}
      check(exact(record,'schemaVersion,revision,binding,bindingSha256,previousSha256,event')
        &&record.schemaVersion==='runaai-native-mutation-journal/v1'&&record.revision===revision+1
        &&record.bindingSha256===this.#bindingSha256&&canonical(record.binding)===canonical(this.#binding)
        &&record.previousSha256===previousSha256&&bytes.equals(Buffer.from(canonical(record)+'\n')),'record-integrity');
      state=reduce(state,record.event,this.#binding);previousSha256=hash(bytes);revision++;
    }
    await this.#assertOwnerPrivate(this.#directory);
    return {revision,previousSha256,...state};
  }
  async assertMutationSettled(){const state=await this.load();check(state.pending===null,'unresolved-mutation');return state;}
  async record(input){
    const raw=canonical(input);check(typeof raw==='string'&&Buffer.byteLength(raw)<=32768,'event-bounds');
    const event=JSON.parse(raw),prior=await this.load();reduce(prior,event,this.#binding);
    check(prior.revision<limit,'capacity');
    const record={schemaVersion:'runaai-native-mutation-journal/v1',revision:prior.revision+1,binding:this.#binding,
      bindingSha256:this.#bindingSha256,previousSha256:prior.previousSha256,event};
    const bytes=Buffer.from(canonical(record)+'\n');check(bytes.length<=65536,'record-bounds');
    const filename=path.join(this.#directory,String(record.revision).padStart(6,'0')+'.json');
    let handle;try{handle=await open(filename,'wx');}catch(error){throw error.code==='EEXIST'?fail('concurrent-publication'):error;}
    try{check((await handle.stat()).nlink===1,'record-links');await handle.writeFile(bytes);await handle.sync();}
    finally{await handle.close();}
    // Partial writes, lost replies, or validation failure never become permission to dispatch.
    const state=await this.load();check(state.revision===record.revision&&state.previousSha256===hash(bytes),'publication-drift');
    return {revision:state.revision,recordSha256:state.previousSha256,pending:state.pending!==null};
  }
}
