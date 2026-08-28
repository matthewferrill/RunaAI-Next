import {randomUUID} from 'node:crypto';
import {validateProfile,RUNTIME_LIMITS,demand,error} from './contracts.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys;

/** Unprivileged proxy facade: control metadata only, no native model/power/filesystem methods.
 * Caller polls at least once per second; missing replies abort local requests and never replay IPC.
 * The privileged broker retains an unacknowledged grant until exact worker-death proof. */
export class BrokerWorkerController {
  #client;#clock;#schedule;#cancel;#grants=new Map();#failed=false;#closing=false;#status;#polledAt=null;
  constructor({profile,client,clock=Date.now,schedule=setTimeout,cancel=clearTimeout}){
    Object.defineProperty(this,'profile',{value:validateProfile(profile),enumerable:true});
    demand(typeof client?.call==='function','worker-client');this.#client=client;this.#clock=clock;
    this.#schedule=schedule;this.#cancel=cancel;
    this.#status={phase:'stopped',generation:null,profileSha256:this.profile.profileSha256,closing:false};
  }
  get status(){return Object.freeze({...this.#status,activeRequests:this.#grants.size,ipcFailed:this.#failed});}
  #fault(code){this.#failed=true;this.#status={...this.#status,phase:'faulted'};
    for(const grant of this.#grants.values())grant.abort.abort(error(code));}
  #validateStatus(value){
    demand(exact(value,'closing,generation,grants,phase,profileSha256')&&typeof value.closing==='boolean'
      &&['stopped','warming','ready','draining','faulted'].includes(value.phase)
      &&(value.generation===null||UUID.test(value.generation))&&value.profileSha256===this.profile.profileSha256
      &&Array.isArray(value.grants)&&value.grants.length<=32,'worker-status');
    const ids=new Set();
    for(const grant of value.grants){demand(exact(grant,'deadlineAt,generation,grantId,revoked')&&UUID.test(grant.grantId)
      &&UUID.test(grant.generation)&&Number.isSafeInteger(grant.deadlineAt)&&typeof grant.revoked==='boolean'
      &&!ids.has(grant.grantId),'worker-status-grant');ids.add(grant.grantId);}
    demand(value.phase!=='ready'||UUID.test(value.generation),'worker-status-generation');return value;
  }
  async poll(){
    if(this.#failed)return this.status;
    try{
      const value=this.#validateStatus(await this.#client.call('status',{}));this.#polledAt=this.#clock();
      this.#status={phase:value.phase,generation:value.generation,profileSha256:value.profileSha256,closing:value.closing};
      for(const[id,local]of this.#grants){
        const remote=value.grants.find(grant=>grant.grantId===id);
        // Graceful drain closes new admissions but lets existing, still-valid requests finish.
        // The native controller explicitly revokes tickets for faults or the bounded drain timeout.
        if(!['ready','draining'].includes(value.phase)||value.generation!==local.generation||!remote||remote.revoked
          ||remote.generation!==local.generation||remote.deadlineAt!==local.deadlineAt)local.abort.abort(error('worker-grant-revoked'));
      }
      return this.status;
    }catch(e){this.#fault('worker-supervisor-unavailable');throw e;}
  }
  async admit({signal}={}){
    signal?.throwIfAborted();demand(!this.#failed&&!this.#closing,'worker-closed');
    demand(this.#polledAt!==null&&this.#clock()-this.#polledAt<=RUNTIME_LIMITS.maximumObservationAgeMs
      &&this.#status.phase==='ready'&&!this.#status.closing,'worker-status-stale');
    let value;
    try{
      value=await this.#client.call('admit',{requestId:randomUUID()});
      demand(exact(value,'deadlineAt,generation,grantId,profileSha256')&&UUID.test(value.grantId)&&UUID.test(value.generation)
        &&value.profileSha256===this.profile.profileSha256&&value.generation===this.#status.generation
        &&Number.isSafeInteger(value.deadlineAt)&&value.deadlineAt>this.#clock()
        &&value.deadlineAt<=this.#clock()+RUNTIME_LIMITS.requestMs&&!this.#grants.has(value.grantId),'worker-admission');
    }catch(e){if(!e?.remoteDomainError)this.#fault('worker-admission-unknown');throw e;}
    const abort=new AbortController();const external=()=>abort.abort(signal.reason);
    signal?.addEventListener('abort',external,{once:true});
    if(signal?.aborted)external();
    const local={...value,abort,releasePromise:null,timer:null};
    local.timer=this.#schedule(()=>abort.abort(error('worker-grant-expired')),value.deadlineAt-this.#clock());local.timer?.unref?.();
    this.#grants.set(value.grantId,local);
    const release=()=>{
      if(local.releasePromise)return local.releasePromise;
      this.#cancel(local.timer);signal?.removeEventListener('abort',external);
      local.releasePromise=(async()=>{
        try{const result=await this.#client.call('release',{grantId:value.grantId,generation:value.generation});
          demand(exact(result,'released')&&typeof result.released==='boolean','worker-release-ack');
          // A missing grant is safe only after this exact authenticated release response. No replay.
          this.#grants.delete(value.grantId);
        }catch(e){this.#fault('worker-release-unconfirmed');throw e;}
      })();return local.releasePromise;
    };
    if(this.#failed||this.#closing||signal?.aborted){abort.abort(signal?.reason??error('worker-closed'));await release();
      signal?.throwIfAborted();throw error('worker-closed');}
    return {generation:value.generation,signal:abort.signal,release};
  }
  async close(){this.#closing=true;this.#status={...this.#status,closing:true};
    for(const grant of this.#grants.values())grant.abort.abort(error('worker-stopping'));
    // The proxy owns each request's release after its socket actually settles. Closing this facade
    // must not acknowledge those requests early. The outer supervisor eventually proves worker exit.
    return this.status;
  }
}
