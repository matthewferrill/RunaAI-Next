import {lstat,open,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {canonicalJson,sha256} from '../../../../gate4/canonical.mjs';
import {validateLegacyCompatibilityBinding,legacyCompatibilityHash} from './legacy-contract.mjs';

const HASH=/^[a-f0-9]{64}$/u,ID=/^[a-f0-9]{32}$/u,ZERO='0'.repeat(64),LIMIT=128;
const fail=code=>Object.assign(Error('m1-legacy-journal-'+code),{code:'m1-legacy-journal-'+code});
const need=(value,code)=>{if(!value)throw fail(code);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===keys.split(',').sort().join();
const time=value=>Number.isFinite(Date.parse(value)),clone=value=>structuredClone(value);

function initial(){return {mode:'open',pending:null,close:null,managedLink:null,restore:null};}
function reduce(state,event,bindingSha256){
  const next=clone(state);need(event&&typeof event.type==='string','event');
  if(event.type==='close-intent'){
    need(exact(event,'type,intentId,bindingSha256,recordedAt')&&ID.test(event.intentId)&&event.bindingSha256===bindingSha256
      &&time(event.recordedAt)&&next.mode==='open'&&next.pending===null&&next.close===null,'close-intent');
    next.mode='closing';next.pending={kind:'close',intentId:event.intentId};
  }else if(event.type==='close-result'){
    need(exact(event,'type,intentId,bindingSha256,outcome,receiptSha256,recordedAt')&&event.bindingSha256===bindingSha256
      &&next.pending?.kind==='close'&&event.intentId===next.pending.intentId&&['succeeded','unknown'].includes(event.outcome)
      &&HASH.test(event.receiptSha256)&&time(event.recordedAt),'close-result');
    next.close={intentId:event.intentId,status:event.outcome,receiptSha256:event.receiptSha256,recordedAt:event.recordedAt};
    next.mode=event.outcome==='succeeded'?'closed':'unknown';if(event.outcome==='succeeded')next.pending=null;
  }else if(event.type==='managed-link'){
    need(exact(event,'type,bindingSha256,managedReceiptSha256,nextReceiptSha256,legacyReceiptSha256,recordedAt')
      &&event.bindingSha256===bindingSha256&&next.mode==='closed'&&next.pending===null&&next.managedLink===null
      &&[event.managedReceiptSha256,event.nextReceiptSha256,event.legacyReceiptSha256].every(value=>HASH.test(value))
      &&event.legacyReceiptSha256===next.close?.receiptSha256&&time(event.recordedAt),'managed-link');
    next.managedLink=clone(event);
  }else if(event.type==='restore-intent'){
    need(exact(event,'type,intentId,bindingSha256,managedReceiptSha256,recordedAt')&&ID.test(event.intentId)
      &&event.bindingSha256===bindingSha256&&next.mode==='closed'&&next.pending===null&&next.restore===null
      &&event.managedReceiptSha256===next.managedLink?.managedReceiptSha256&&time(event.recordedAt),'restore-intent');
    next.mode='restoring';next.pending={kind:'restore',intentId:event.intentId};
  }else if(event.type==='restore-result'){
    need(exact(event,'type,intentId,bindingSha256,outcome,receiptSha256,recordedAt')&&event.bindingSha256===bindingSha256
      &&next.pending?.kind==='restore'&&event.intentId===next.pending.intentId&&['succeeded','unknown'].includes(event.outcome)
      &&HASH.test(event.receiptSha256)&&time(event.recordedAt),'restore-result');
    next.restore={intentId:event.intentId,status:event.outcome,receiptSha256:event.receiptSha256,recordedAt:event.recordedAt};
    next.mode=event.outcome==='succeeded'?'open':'unknown';if(event.outcome==='succeeded')next.pending=null;
  }else need(false,'event-type');return next;
}
async function plain(file,{directory=false}={}){
  for(let current=file;current!==path.dirname(current);current=path.dirname(current))need(!(await lstat(current)).isSymbolicLink(),'linked-path');
  const info=await lstat(file);need(directory?info.isDirectory():info.isFile()&&info.nlink===1,'path-kind');return info;
}

export class LegacyCompatibilityJournal{
  #directory;#binding;#bindingSha256;#assertOwnerPrivate;
  constructor({directory,binding,assertOwnerPrivate}){
    need(typeof directory==='string'&&path.isAbsolute(directory)&&typeof assertOwnerPrivate==='function','boundary');
    this.#directory=path.resolve(directory);this.#binding=validateLegacyCompatibilityBinding(binding);
    this.#bindingSha256=legacyCompatibilityHash(this.#binding);this.#assertOwnerPrivate=assertOwnerPrivate;
  }
  get binding(){return clone(this.#binding);}get bindingSha256(){return this.#bindingSha256;}
  async boundary(){await plain(this.#directory,{directory:true});need(path.resolve(await realpath(this.#directory)).toLowerCase()===this.#directory.toLowerCase(),'resolved-path');
    await this.#assertOwnerPrivate(this.#directory);}
  async load(){
    await this.boundary();const names=(await readdir(this.#directory)).sort();need(names.length<=LIMIT&&names.every((name,index)=>name===String(index+1).padStart(6,'0')+'.json'),'sequence');
    let revision=0,previousSha256=ZERO,state=initial();
    for(const name of names){const filename=path.join(this.#directory,name);await plain(filename);const handle=await open(filename,'r');let bytes;
      try{const before=await handle.stat();need(before.size>0&&before.size<=65536&&before.nlink===1,'record-bounds');bytes=await handle.readFile();
        const after=await handle.stat();need(after.nlink===1&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&bytes.length===before.size,'record-drift');}
      finally{await handle.close();}
      let record;try{record=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));}catch{throw fail('record-json');}
      need(exact(record,'schemaVersion,revision,binding,bindingSha256,previousSha256,event')
        &&record.schemaVersion==='runaai-legacy-compatibility-journal/v1'&&record.revision===revision+1
        &&canonicalJson(record.binding)===canonicalJson(this.#binding)&&record.bindingSha256===this.#bindingSha256
        &&record.previousSha256===previousSha256&&bytes.equals(Buffer.from(canonicalJson(record)+'\n')),'record-integrity');
      state=reduce(state,record.event,this.#bindingSha256);previousSha256=sha256(bytes);revision++;
    }
    await this.#assertOwnerPrivate(this.#directory);return {revision,previousSha256,...state};
  }
  async record(event){
    const prior=await this.load();need(prior.revision<LIMIT,'capacity');reduce(prior,event,this.#bindingSha256);
    const record={schemaVersion:'runaai-legacy-compatibility-journal/v1',revision:prior.revision+1,binding:this.#binding,
      bindingSha256:this.#bindingSha256,previousSha256:prior.previousSha256,event:clone(event)};
    const bytes=Buffer.from(canonicalJson(record)+'\n');need(bytes.length<=65536,'record-bounds');const filename=path.join(this.#directory,String(record.revision).padStart(6,'0')+'.json');
    let handle;try{handle=await open(filename,'wx');}catch(error){throw error.code==='EEXIST'?fail('concurrent-publication'):error;}
    try{need((await handle.stat()).nlink===1,'record-links');await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    const state=await this.load();need(state.revision===record.revision&&state.previousSha256===sha256(bytes),'publication-drift');return state;
  }
}
