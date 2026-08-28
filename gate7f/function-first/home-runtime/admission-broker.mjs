import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {demand,error,RUNTIME_LIMITS} from './contracts.mjs';

const schemaVersion='runaai-home-admission-ipc/v1';
const hex=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const sortedKeys=value=>Object.keys(value).sort().join();
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&sortedKeys(value)===keys;
function identity(value){
  demand(exact(value,'pid,startedAt')&&Number.isSafeInteger(value.pid)&&value.pid>0
    &&typeof value.startedAt==='string'&&Number.isFinite(Date.parse(value.startedAt)),'broker-worker');
  return Object.freeze({...value});
}
function keyBytes(key){demand(Buffer.isBuffer(key)&&key.length===32,'broker-key');return Buffer.from(key);}
function argumentsFor(operation,args){
  if(operation==='status'){demand(exact(args,''),'broker-arguments');return {};}
  if(operation==='admit'){demand(exact(args,'requestId')&&uuid.test(args.requestId),'broker-arguments');return {requestId:args.requestId};}
  if(operation==='release'){demand(exact(args,'generation,grantId')&&uuid.test(args.grantId)&&uuid.test(args.generation),'broker-arguments');
    return {generation:args.generation,grantId:args.grantId};}
  throw error('broker-operation');
}
function payloadOf(value){
  demand(exact(value,'args,mac,operation,schemaVersion,sentAt,sequence,sessionId,worker'),'broker-shape');
  demand(value.schemaVersion===schemaVersion&&hex.test(value.sessionId)&&Number.isSafeInteger(value.sequence)&&value.sequence>0
    &&Number.isSafeInteger(value.sentAt)&&value.sentAt>=0,'broker-message');
  return {schemaVersion,sessionId:value.sessionId,worker:identity(value.worker),sequence:value.sequence,sentAt:value.sentAt,
    operation:value.operation,args:argumentsFor(value.operation,value.args)};
}
const macFor=(key,payload)=>createHmac('sha256',key).update(JSON.stringify(payload)).digest('hex');
export function signBrokerRequest({sessionId,worker,sequence,sentAt=Date.now(),operation,args},key){
  const payload=payloadOf({schemaVersion,sessionId,worker,sequence,sentAt,operation,args,mac:'0'.repeat(64)});
  return {...payload,mac:macFor(keyBytes(key),payload)};
}

/** Privileged control plane only; no sockets, IPC files, model bodies or command dispatch.
 * Its physical transport and stopped-worker observer must be independently protected/qualified. */
export class PinnedAdmissionBroker {
  #controller;#sessionId;#worker;#key;#sequence=0;#grants=new Map();#requests=new Set();#clock;#schedule;#cancel;#verifyStopped;#closing=false;
  constructor({controller,sessionId,worker,key,clock=Date.now,schedule=setTimeout,cancel=clearTimeout,verifyStopped}){
    demand(hex.test(sessionId)&&controller&&['admit','poll','fault','stop'].every(name=>typeof controller[name]==='function'),'broker-config');
    demand(typeof verifyStopped==='function','broker-stopped-observer');
    this.#controller=controller;this.#sessionId=sessionId;this.#worker=identity(worker);this.#key=keyBytes(key);
    this.#clock=clock;this.#schedule=schedule;this.#cancel=cancel;this.#verifyStopped=verifyStopped;
  }
  async handle(message){
    const payload=payloadOf(message);demand(hex.test(message.mac),'broker-authentication');
    demand(timingSafeEqual(Buffer.from(message.mac,'hex'),Buffer.from(macFor(this.#key,payload),'hex')),'broker-authentication');
    demand(payload.sessionId===this.#sessionId&&payload.worker.pid===this.#worker.pid&&payload.worker.startedAt===this.#worker.startedAt,'broker-binding');
    const age=this.#clock()-payload.sentAt;demand(age>=-1000&&age<=5000,'broker-stale-message');
    // Synchronous sequence reservation precedes any asynchronous native observation.
    demand(payload.sequence===this.#sequence+1,'broker-replay-or-order');this.#sequence=payload.sequence;
    if(payload.operation==='admit')return this.#admit(payload.args.requestId);
    if(payload.operation==='release')return this.#release(payload.args);
    return this.status;
  }
  async #admit(requestId){
    demand(!this.#closing,'broker-closing');demand(this.#requests.size<32&&!this.#requests.has(requestId),'broker-request-conflict');
    this.#requests.add(requestId);const abort=new AbortController();let ticket;
    try{
      ticket=await this.#controller.admit({signal:abort.signal});demand(!this.#closing,'broker-closing');
      demand(uuid.test(ticket.generation),'broker-generation');
      const grantId=randomUUID(),deadlineAt=this.#clock()+RUNTIME_LIMITS.requestMs;
      const timeout=this.#schedule(()=>abort.abort(error('grant-expired')),RUNTIME_LIMITS.requestMs);timeout?.unref?.();
      this.#grants.set(grantId,{ticket,requestId,abort,timeout,deadlineAt});
      return {grantId,generation:ticket.generation,profileSha256:this.#controller.status.profileSha256,deadlineAt};
    }catch(e){abort.abort(e);ticket?.release();this.#requests.delete(requestId);throw e;}
  }
  #release({grantId,generation}){
    const grant=this.#grants.get(grantId);if(!grant)return {released:false};
    demand(generation===grant.ticket.generation,'broker-release-generation');
    this.#cancel(grant.timeout);grant.ticket.release();this.#grants.delete(grantId);this.#requests.delete(grant.requestId);
    return {released:true};
  }
  get status(){return {phase:this.#controller.status.phase,generation:this.#controller.status.generation,
    profileSha256:this.#controller.status.profileSha256,closing:this.#closing,
    grants:[...this.#grants].map(([grantId,v])=>({grantId,generation:v.ticket.generation,deadlineAt:v.deadlineAt,
      revoked:v.abort.signal.aborted||v.ticket.signal.aborted}))};}
  async poll(){await this.#controller.poll();return this.status;}
  async stop(){this.#closing=true;await this.#controller.stop();return this.status;}
  async workerStopped(){
    // This operation is deliberately absent from handle(). Only the supervisor can request it,
    // and an independent native exact-PID/start-time observer must confirm the worker stopped.
    demand(await this.#verifyStopped(this.#worker)===true,'broker-worker-still-live');this.#closing=true;
    for(const [grantId,grant]of this.#grants){grant.abort.abort(error('worker-stopped'));this.#release({grantId,generation:grant.ticket.generation});}
    await this.#controller.fault('runtime-worker-stopped');return this.status;
  }
}
