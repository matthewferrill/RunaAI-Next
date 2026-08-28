import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
import {openSync,closeSync,fstatSync,readSync,writeSync,fsyncSync,existsSync,unlinkSync,readdirSync,renameSync} from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {assertPlainPath} from './native-adapter.mjs';
import {signBrokerRequest} from './admission-broker.mjs';
import {demand,error} from './contracts.mjs';

const HEX=/^[a-f0-9]{64}$/;
const replySchema='runaai-home-admission-ipc-reply/v1';
const MAC=(key,payload)=>createHmac('sha256',key).update(JSON.stringify(payload)).digest('hex');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function bind(root,sessionId,key){
  demand(HEX.test(sessionId)&&Buffer.isBuffer(key)&&key.length===32&&path.basename(root)===sessionId,'ipc-binding');
  assertPlainPath(root,{directory:true});const requests=path.join(root,'requests'),replies=path.join(root,'replies');
  assertPlainPath(requests,{directory:true});assertPlainPath(replies,{directory:true});
  return {requests,replies,key:Buffer.from(key)};
}
function filename(sequence){demand(Number.isSafeInteger(sequence)&&sequence>0&&sequence<1e15,'ipc-sequence');return String(sequence).padStart(15,'0')+'.json';}
function readBounded(file,maximumBytes){
  assertPlainPath(file);const fd=openSync(file,'r');
  try{const before=fstatSync(fd);demand(before.nlink===1&&before.size>0&&before.size<=maximumBytes,'ipc-file-bounds');
    const bytes=Buffer.alloc(before.size);let offset=0;while(offset<bytes.length){const count=readSync(fd,bytes,offset,bytes.length-offset,offset);
      demand(count>0,'ipc-short-read');offset+=count;}
    const after=fstatSync(fd);demand(after.nlink===1&&after.size===before.size&&after.mtimeMs===before.mtimeMs&&after.ino===before.ino,'ipc-file-changed');
    return bytes;
  }finally{closeSync(fd);}
}
function create(file,bytes,maximumBytes){
  assertPlainPath(path.dirname(file),{directory:true});demand(bytes.length>0&&bytes.length<=maximumBytes,'ipc-output-bounds');
  // Only the designated single writer owns this sequence. Flush in a non-readable pending name
  // before atomic publication; a server must never mistake a partly written request for tampering.
  const pending=file+'.pending',fd=openSync(pending,'wx');
  try{demand(fstatSync(fd).nlink===1,'ipc-output-links');writeSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
  demand(!existsSync(file),'ipc-existing-identity');renameSync(pending,file);
}
function parsed(bytes){try{return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));}catch{throw error('ipc-json');}}
function replyPayload({sessionId,sequence,result}){return {schemaVersion:replySchema,sessionId,sequence,result};}
function signedReply(data,key){const payload=replyPayload(data);return {...payload,mac:MAC(key,payload)};}
function verifyReply(value,{sessionId,sequence,key}){
  demand(value&&Object.keys(value).sort().join()==='mac,result,schemaVersion,sequence,sessionId'&&value.schemaVersion===replySchema
    &&value.sessionId===sessionId&&value.sequence===sequence&&HEX.test(value.mac),'ipc-reply-binding');
  demand(timingSafeEqual(Buffer.from(value.mac,'hex'),Buffer.from(MAC(key,replyPayload(value)),'hex')),'ipc-reply-authentication');
  demand(value.result&&typeof value.result.ok==='boolean'&&Object.keys(value.result).sort().join()===(value.result.ok?'ok,value':'errorCode,ok'),'ipc-reply-shape');
  if(!value.result.ok){demand(/^runtime-[a-z0-9-]+$/.test(value.result.errorCode),'ipc-error-shape');throw Object.assign(Error(value.result.errorCode),{code:value.result.errorCode,remoteDomainError:true});}
  return value.result.value;
}
const fatalBroker=new Set(['shape','message','worker','operation','arguments','authentication','binding','stale-message','replay-or-order'].map(c=>'runtime-broker-'+c));

/** Physical files only. ACL installation and exclusive supervisor ownership are external prerequisites.
 * The network worker creates requests; SYSTEM alone creates responses. Only bounded control metadata
 * crosses the channel. Each endpoint cleans only its own exact ephemeral transfer file names. */
export class BrokerFileServer {
  #directories;#sessionId;#broker;#next=1;#busy=false;#failed=false;
  constructor({root,sessionId,key,broker}){this.#directories=bind(root,sessionId,key);this.#sessionId=sessionId;this.#broker=broker;}
  async pump(){
    demand(!this.#failed,'ipc-server-faulted');if(this.#busy)return false;this.#busy=true;
    try{
      const {requests,replies,key}=this.#directories;
      const inputNames=readdirSync(requests),outputNames=readdirSync(replies);
      demand(inputNames.length<=32&&outputNames.length<=32&&[...inputNames,...outputNames].every(name=>/^\d{15}\.json(?:\.pending)?$/.test(name)),'ipc-directory-shape');
      // Absence of the original request means its client has consumed the authenticated response.
      // This removes only transport bytes, never an active native admission or lifecycle evidence.
      for(const name of outputNames.filter(name=>!name.endsWith('.pending'))){const seq=Number(name.slice(0,15));if(seq<this.#next&&!existsSync(path.join(requests,name))){
        const replyFile=path.join(replies,name);assertPlainPath(replyFile);unlinkSync(replyFile);}}
      const name=filename(this.#next),input=path.join(requests,name);if(!existsSync(input))return false;
      const message=parsed(readBounded(input,8192));demand(message.sequence===this.#next,'ipc-request-sequence');
      let result;
      try{result={ok:true,value:await this.#broker.handle(message)};}
      catch(e){if(fatalBroker.has(e?.code))throw e;result={ok:false,errorCode:/^runtime-[a-z0-9-]+$/.test(e?.code??'')?e.code:'runtime-broker-unavailable'};}
      create(path.join(replies,name),Buffer.from(JSON.stringify(signedReply({sessionId:this.#sessionId,sequence:this.#next,result},key))),32768);
      this.#next++;return true;
    }catch(e){this.#failed=true;throw e;}finally{this.#busy=false;}
  }
}

export class BrokerFileClient {
  #directories;#sessionId;#worker;#sequence=0;#tail=Promise.resolve();#failed=false;#timeoutMs;
  constructor({root,sessionId,worker,key,timeoutMs=10000}){
    demand(Number.isSafeInteger(timeoutMs)&&timeoutMs>=50&&timeoutMs<=15000,'ipc-timeout');
    this.#directories=bind(root,sessionId,key);this.#sessionId=sessionId;this.#worker=Object.freeze({...worker});this.#timeoutMs=timeoutMs;
  }
  call(operation,args={}){const pending=this.#tail.then(()=>this.#call(operation,args));this.#tail=pending.catch(()=>{});return pending;}
  async #call(operation,args){
    demand(!this.#failed,'ipc-client-faulted');const sequence=this.#sequence+1,{requests,replies,key}=this.#directories;
    const input=path.join(requests,filename(sequence)),output=path.join(replies,filename(sequence));
    const message=signBrokerRequest({sessionId:this.#sessionId,worker:this.#worker,sequence,operation,args},key);
    this.#sequence=sequence;
    const bytes=Buffer.from(JSON.stringify(message));const until=performance.now()+this.#timeoutMs;
    try{
      create(input,bytes,8192);while(!existsSync(output)){demand(performance.now()<until,'ipc-response-timeout');await sleep(10);}
      const reply=parsed(readBounded(output,32768));let result,domainError;
      try{result=verifyReply(reply,{sessionId:this.#sessionId,sequence,key});}catch(e){if(!e.remoteDomainError)throw e;domainError=e;}
      demand(digest(readBounded(input,8192))===digest(bytes),'ipc-own-request-drift');unlinkSync(input);
      if(domainError)throw domainError;return result;
    }catch(e){if(!e.remoteDomainError)this.#failed=true;throw e;}
  }
}
