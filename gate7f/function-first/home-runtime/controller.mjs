import {randomUUID} from 'node:crypto';
import {validateProfile,verifyLoaded,verifyObservation,loadRequest,residentList,sha,error,demand,settingsSafe,RUNTIME_LIMITS,LEASE_POLICY} from './contracts.mjs';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
/** Operator core only. No startup side effect, sockets, commands, persistence or native adapter.
 * The native package must implement these bounded adapter methods and independent crash cleanup.
 * It must not infer ownership by model name or port alone. */
export class QualifiedRuntimeController {
  #adapter;#phase='stopped';#owned=[];#generation=null;#engineIdentity=null;#requests=new Set();#powerChanged=false;
  #transition=null;#fault=null;#clock;#wait;#preparing=null;#pendingKey=null;
  constructor({profile,adapter,clock=Date.now,delay=wait}){
    Object.defineProperty(this,'profile',{value:validateProfile(profile),enumerable:true});this.#adapter=adapter;this.#clock=clock;this.#wait=delay;
    for(const name of ['verifyPins','observe','setPower','load','unload','record'])demand(typeof adapter?.[name]==='function','adapter');
  }
  get status(){return Object.freeze({phase:this.#phase,generation:this.#generation,profileSha256:this.profile.profileSha256,
    activeRequests:this.#requests.size,fault:this.#fault,ownedInstances:this.#owned.length,ambiguousPendingLoad:this.#pendingKey});}
  async #record(type,value={}){await this.#adapter.record({type,time:this.#clock(),profileSha256:this.profile.profileSha256,generation:this.#generation,...value});}
  async start(){
    demand(this.#phase==='stopped'&&!this.#transition,'start-state');
    this.#phase='warming';this.#generation=randomUUID();this.#fault=null;
    const pending=this.#start();this.#transition=pending;
    try{await pending;}finally{if(this.#transition===pending)this.#transition=null;}
  }
  async #start(){
    this.#preparing=new AbortController();const timeout=setTimeout(()=>this.#preparing?.abort(error('preparation-timeout')),RUNTIME_LIMITS.preparationMs);
    const signal=this.#preparing.signal;
    try{
      await this.#adapter.verifyPins(this.profile,{signal});
      let observation=await this.#adapter.observe({signal});
      verifyObservation(observation,{owned:[],now:this.#clock(),powerWatts:260,ready:false});
      this.#engineIdentity=observation.engineIdentity;
      await this.#record('start-intent',{engineIdentity:this.#engineIdentity});
      this.#powerChanged=true;await this.#adapter.setPower(160,{signal});
      while(true){signal.throwIfAborted();observation=await this.#adapter.observe({signal});
        verifyObservation(observation,{owned:[],engineIdentity:this.#engineIdentity,now:this.#clock(),ready:false});
        if(observation.hardware.gpus.every(g=>g.temperatureC<=45))break;
        await this.#wait(LEASE_POLICY.sampleMs);
      }
      for(const auxiliary of [false,true]){
        signal.throwIfAborted();const request=loadRequest(this.profile,auxiliary);
        await this.#record('load-intent',{key:request.model,request});
        this.#pendingKey=request.model;
        const response=await this.#adapter.load(request,{signal});
        // Record returned identity before any later validation can fail. A lost response is an
        // ambiguous operation: native supervisor must reconcile, never blindly repeat the load.
        demand(response?.status==='loaded'&&typeof response.instance_id==='string','load-result');
        const owned={key:request.model,id:response.instance_id,fingerprint:null};this.#owned.push(owned);this.#pendingKey=null;
        await this.#record('load-returned',{key:owned.key,id:owned.id});
        verifyLoaded(this.profile,response,auxiliary);
        observation=await this.#adapter.observe({signal});
        const matches=residentList(observation.inventory).filter(i=>i.key===owned.key&&i.id===owned.id);
        demand(matches.length===1,'load-residency');owned.fingerprint=sha(JSON.stringify(matches[0].config));
        verifyObservation(observation,{owned:this.#owned,engineIdentity:this.#engineIdentity,now:this.#clock(),ready:auxiliary});
        await this.#record('owned',{owned:{...owned}});
      }
      signal.throwIfAborted();this.#phase='ready';await this.#record('ready');
    }catch(e){this.#fault=typeof e?.code==='string'?e.code:'runtime-start-failed';this.#phase='faulted';
      await this.#cleanup().catch(()=>{});throw e;
    }finally{clearTimeout(timeout);this.#preparing=null;}
  }
  async #fresh(signal,generation){const observation=await this.#adapter.observe({signal});
    if(generation)demand(this.#phase==='ready'&&this.#generation===generation,'generation-changed');
    return verifyObservation(observation,{owned:this.#owned,engineIdentity:this.#engineIdentity,now:this.#clock()});}
  async admit({signal}={}){
    demand(this.#phase==='ready','not-ready');const generation=this.#generation;
    signal?.throwIfAborted();
    try{await this.#fresh(signal,generation);}catch(e){
      if(!signal?.aborted&&this.#phase==='ready'&&this.#generation===generation)await this.fault('runtime-observation-invalid');throw e;}
    // Lifecycle can enter draining while observe awaits: never admit into an old generation.
    demand(this.#phase==='ready'&&generation===this.#generation,'generation-changed');signal?.throwIfAborted();
    const controller=new AbortController();const externalAbort=()=>controller.abort(signal.reason);
    signal?.addEventListener('abort',externalAbort,{once:true});
    const entry={controller};this.#requests.add(entry);let released=false;
    return {generation,signal:controller.signal,release:()=>{if(released)return;released=true;
      signal?.removeEventListener('abort',externalAbort);this.#requests.delete(entry);}};
  }
  async poll(){if(this.#phase!=='ready')return this.status;const generation=this.#generation;
    try{await this.#fresh(undefined,generation);}catch{if(this.#phase==='ready'&&this.#generation===generation)await this.fault('runtime-watchdog-failed');}return this.status;
  }
  async #drain(abortNow){
    if(abortNow)for(const entry of this.#requests)entry.controller.abort(error('runtime-fault'));
    let until=this.#clock()+(abortNow?RUNTIME_LIMITS.abortDrainMs:RUNTIME_LIMITS.drainMs);
    while(this.#requests.size&&this.#clock()<until)await this.#wait(25);
    if(this.#requests.size){for(const entry of this.#requests)entry.controller.abort(error('drain-timeout'));
      until=this.#clock()+RUNTIME_LIMITS.abortDrainMs;
      while(this.#requests.size&&this.#clock()<until)await this.#wait(25);}
    demand(this.#requests.size===0,'drain-unconfirmed');
  }
  async #cleanup(){
    // Cancellation or pin failure before the first native state change owns nothing to undo.
    if(this.#engineIdentity===null&&!this.#powerChanged&&this.#owned.length===0&&this.#pendingKey===null)return;
    // A new/changed engine may reuse instance IDs. Never unload those as our old ownership.
    let observation=await this.#adapter.observe();
    demand(observation.engineIdentity===this.#engineIdentity,'cleanup-engine-changed');
    for(const owned of [...this.#owned]){
      demand(observation.engineIdentity===this.#engineIdentity,'cleanup-engine-changed');
      const found=residentList(observation.inventory).filter(i=>i.key===owned.key&&i.id===owned.id);
      if(found.length===0){this.#owned=this.#owned.filter(o=>o!==owned);continue;}
      demand(found.length===1&&typeof owned.fingerprint==='string'
        &&sha(JSON.stringify(found[0].config))===owned.fingerprint,'cleanup-ownership');
      await this.#adapter.unload({instance_id:owned.id});this.#owned=this.#owned.filter(o=>o!==owned);
      await this.#record('unloaded',{key:owned.key,id:owned.id});observation=await this.#adapter.observe();
    }
    demand(residentList(observation.inventory).length===0,'cleanup-unexpected-residency');
    demand(this.#pendingKey===null,'cleanup-ambiguous-load');
    if(this.#powerChanged){
      // The fault may itself be a settings change. Exact-owned unload can still reduce exposure,
      // but neither that cleanup nor an empty registry permits restoring a higher power ceiling
      // while JIT/logging/MCP has drifted. Reobserve immediately before the setter.
      observation=await this.#adapter.observe();settingsSafe(observation.settings);
      demand(Number.isFinite(observation.observedAt)&&this.#clock()>=observation.observedAt
        &&this.#clock()-observation.observedAt<=RUNTIME_LIMITS.maximumObservationAgeMs,'cleanup-stale-observation');
      demand(observation.engineIdentity===this.#engineIdentity,'cleanup-engine-changed');
      demand(residentList(observation.inventory).length===0,'cleanup-unexpected-residency');
      await this.#adapter.setPower(260);const restored=await this.#adapter.observe();
      settingsSafe(restored.settings);
      demand(Number.isFinite(restored.observedAt)&&this.#clock()>=restored.observedAt
        &&this.#clock()-restored.observedAt<=RUNTIME_LIMITS.maximumObservationAgeMs
        &&restored.engineIdentity===this.#engineIdentity&&residentList(restored.inventory).length===0
        &&restored.hardware?.gpus?.length===2&&restored.hardware.gpus.every((g,index)=>g.index===index
          &&g.uuid===LEASE_POLICY.gpuUuids[index]&&g.powerLimitWatts===260),'restore-unconfirmed');
      this.#powerChanged=false;
    }
    await this.#record('cleanup-complete');
  }
  async stop(){
    if(this.#phase==='warming'&&this.#transition){const preparation=this.#transition;
      this.#preparing?.abort(error('startup-cancelled'));try{await preparation;}catch{}
      if(this.#transition===preparation)this.#transition=null;return this.stop();}
    if(this.#transition)return this.#transition;
    demand(this.#phase==='ready'||this.#phase==='faulted','stop-state');this.#phase='draining';
    const pending=(async()=>{try{await this.#drain(false);await this.#cleanup();this.#phase='stopped';}
      catch(e){this.#phase='faulted';this.#fault='runtime-stop-unconfirmed';throw e;}})();
    this.#transition=pending;try{await pending;}finally{this.#transition=null;}
  }
  async fault(code){
    if(this.#phase==='faulted'&&this.#transition)return this.#transition;
    if(this.#phase!=='ready'&&this.#phase!=='draining')return;
    this.#phase='faulted';this.#fault=code;
    for(const entry of this.#requests)entry.controller.abort(error('runtime-fault'));
    if(this.#transition)return this.#transition;
    const pending=(async()=>{try{await this.#drain(true);await this.#cleanup();}catch{this.#fault='runtime-cleanup-unconfirmed';}})();
    this.#transition=pending;try{await pending;}finally{this.#transition=null;}
  }
}
