import {validateProfile,loadRequest,residentList,sha,demand,LEASE_POLICY,settingsSafe,RUNTIME_LIMITS} from './contracts.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys;

/** Replay only the private fsync'd lifecycle journal, never model output or public IPC.
 * A partial tail or unresolved load intentionally cannot authorize cleanup/restart. */
export function parseOwnershipJournal(raw,profileInput){
  const profile=validateProfile(profileInput);demand(Buffer.isBuffer(raw)&&raw.length<=64*1024*1024,'recovery-journal-cap');
  if(raw.length===0)return {profile,phase:'empty',generation:null,engineIdentity:null,owned:[],pending:null};
  let text;try{text=new TextDecoder('utf8',{fatal:true}).decode(raw);}catch{demand(false,'recovery-journal-utf8');}
  demand(text.endsWith('\n')&&!text.includes('\r'),'recovery-partial-journal');
  let state={profile,phase:'empty',generation:null,engineIdentity:null,owned:[],pending:null};let lastTime=0;
  for(const line of text.slice(0,-1).split('\n')){
    demand(Buffer.byteLength(line)>0&&Buffer.byteLength(line)<=32768,'recovery-event-cap');
    let event;try{event=JSON.parse(line);}catch{demand(false,'recovery-event-json');}
    const extras={
      'start-intent':['engineIdentity'],'load-intent':['key','request'],'load-returned':['id','key'],
      owned:['owned'],ready:[],unloaded:['id','key'],'cleanup-complete':[],
    }[event?.type];
    demand(Array.isArray(extras)&&exact(event,['type','time','profileSha256','generation',...extras].sort().join()),'recovery-event-shape');
    demand(Number.isSafeInteger(event.time)&&event.time>=lastTime&&event.profileSha256===profile.profileSha256
      &&UUID.test(event.generation),'recovery-event-binding');lastTime=event.time;
    if(event.type==='start-intent'){
      demand(['empty','clean'].includes(state.phase)&&typeof event.engineIdentity==='string'&&event.engineIdentity.length>0
        &&event.engineIdentity.length<=1024&&event.generation!==state.generation,'recovery-start-order');
      state={profile,phase:'starting',generation:event.generation,engineIdentity:event.engineIdentity,owned:[],pending:null};continue;
    }
    demand(state.generation===event.generation&&!['empty','clean'].includes(state.phase),'recovery-generation');
    if(event.type==='load-intent'){
      const auxiliary=state.owned.length===1;const expected=loadRequest(profile,auxiliary);
      demand(state.phase==='starting'&&state.pending===null&&state.owned.length<2
        &&state.owned.every(item=>HASH.test(item.fingerprint))&&event.key===expected.model
        &&JSON.stringify(event.request)===JSON.stringify(expected),'recovery-load-order');state.pending=event.key;
    }else if(event.type==='load-returned'){
      demand(state.phase==='starting'&&state.pending===event.key&&typeof event.id==='string'&&event.id.length>0&&event.id.length<=256
        &&!state.owned.some(item=>item.id===event.id),'recovery-load-return');
      state.owned.push({key:event.key,id:event.id,fingerprint:null});state.pending=null;
    }else if(event.type==='owned'){
      demand(exact(event.owned,'fingerprint,id,key')&&HASH.test(event.owned.fingerprint),'recovery-owned-shape');
      const current=state.owned.at(-1);demand(state.phase==='starting'&&current?.key===event.owned.key&&current.id===event.owned.id
        &&current.fingerprint===null,'recovery-owned-order');current.fingerprint=event.owned.fingerprint;
    }else if(event.type==='ready'){
      demand(state.phase==='starting'&&state.pending===null&&state.owned.length===2&&state.owned.every(item=>HASH.test(item.fingerprint)),
        'recovery-ready-order');state.phase='ready';
    }else if(event.type==='unloaded'){
      const index=state.owned.findIndex(item=>item.key===event.key&&item.id===event.id);demand(index>=0,'recovery-unload-order');
      state.owned.splice(index,1);state.phase='recovering';
    }else if(event.type==='cleanup-complete'){
      demand(state.pending===null,'recovery-ambiguous-completion');state.owned=[];state.phase='clean';
    }
  }
  return state;
}

function exactHardware(observation,now){
  settingsSafe(observation?.settings);
  demand(Number.isFinite(observation?.observedAt)&&now>=observation.observedAt
    &&now-observation.observedAt<=RUNTIME_LIMITS.maximumObservationAgeMs,'recovery-stale-observation');
  demand(observation?.hardware?.gpus?.length===2&&observation.hardware.gpus.every((gpu,index)=>gpu.index===index
    &&gpu.uuid===LEASE_POLICY.gpuUuids[index]&&[160,260].includes(gpu.powerLimitWatts)),'recovery-hardware');
}

/** Privileged recovery only, after the independent native watchdog has proved BOTH old Node
 * supervisor and network worker identities stopped and still holds the exclusive native lock.
 * Returns closed/clean; never loads, reopens admission, chooses a profile or changes settings. */
export async function recoverOwnedRuntime({rawJournal,profile,adapter,verifyStopped,clock=Date.now}){
  const state=parseOwnershipJournal(rawJournal,profile);
  demand(typeof verifyStopped==='function'&&await verifyStopped()===true,'recovery-processes-still-live');
  for(const name of ['verifyPins','observe','adoptRecoveredOwnership','unload','setPower','record'])demand(typeof adapter?.[name]==='function','recovery-adapter');
  await adapter.verifyPins(state.profile,{});
  let observation=await adapter.observe();exactHardware(observation,clock());
  if(state.phase==='empty'||state.phase==='clean'){
    demand(residentList(observation.inventory).length===0&&observation.hardware.gpus.every(gpu=>gpu.powerLimitWatts===260),
      'recovery-clean-state-drift');return {closed:true,clean:true,unloaded:0,restored:false};
  }
  demand(state.pending===null,'recovery-ambiguous-load');
  demand(observation.engineIdentity===state.engineIdentity,'recovery-engine-changed');
  const record=(type,value={})=>adapter.record({type,time:clock(),profileSha256:state.profile.profileSha256,
    generation:state.generation,...value});
  let unloaded=0;
  for(const owned of state.owned){
    demand(observation.engineIdentity===state.engineIdentity,'recovery-engine-changed');
    const matching=residentList(observation.inventory).filter(item=>item.key===owned.key&&item.id===owned.id);
    demand(matching.length<=1,'recovery-duplicate-identity');
    if(matching.length){
      // A returned ID alone is not an observed fingerprint after a process crash. Keep it closed.
      demand(HASH.test(owned.fingerprint)&&sha(JSON.stringify(matching[0].config))===owned.fingerprint,'recovery-fingerprint');
      await adapter.adoptRecoveredOwnership({engineIdentity:state.engineIdentity,owned});
      await adapter.unload({instance_id:owned.id});unloaded++;
      observation=await adapter.observe();exactHardware(observation,clock());
      demand(observation.engineIdentity===state.engineIdentity&&!residentList(observation.inventory).some(item=>item.id===owned.id),
        'recovery-unload-unconfirmed');
    }
    await record('unloaded',{key:owned.key,id:owned.id});
  }
  observation=await adapter.observe();exactHardware(observation,clock());
  demand(observation.engineIdentity===state.engineIdentity&&residentList(observation.inventory).length===0,'recovery-unexpected-residency');
  await adapter.setPower(260);
  observation=await adapter.observe();exactHardware(observation,clock());
  demand(observation.engineIdentity===state.engineIdentity&&residentList(observation.inventory).length===0
    &&observation.hardware.gpus.every(gpu=>gpu.powerLimitWatts===260),'recovery-restore-unconfirmed');
  await record('cleanup-complete');return {closed:true,clean:true,unloaded,restored:true};
}
