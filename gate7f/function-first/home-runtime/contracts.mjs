import {MANIFEST} from '../readiness/manifest.mjs';
import {NOMICS,LEASE_POLICY,primaryLoad,sha,residentList,checkHardware} from '../readiness/lease-contract.mjs';

// The application owns its qualified per-role deadline (answers <=60s, plans <=30s).
// This outer transport ceiling must not shorten those deadlines, and cannot extend them.
export const RUNTIME_LIMITS=Object.freeze({sampleMs:5000,maximumObservationAgeMs:5000,requestMs:65000,bodyMs:10000,
  rerankerMs:15000,requestBytes:2*1024*1024,responseBytes:4*1024*1024,maximumOutputTokens:1536,drainMs:70000,abortDrainMs:5000,preparationMs:600000});
export const error=code=>Object.assign(Error('runtime-'+code),{code:'runtime-'+code});
export const demand=(ok,code)=>{if(!ok)throw error(code);};
const HASH=/^[a-f0-9]{64}$/;
export function validateProfile(input){
  demand(input&&Object.keys(input).sort().join()==='appSourceCommit,candidateId,qualificationGradesSha256,runtimeSealSha256,schemaVersion','profile-shape');
  demand(input.schemaVersion==='runaai-qualified-home-profile/v1'&&/^[a-f0-9]{40}$/.test(input.appSourceCommit)
    &&HASH.test(input.runtimeSealSha256)&&HASH.test(input.qualificationGradesSha256),'profile-pins');
  const candidate=MANIFEST.candidates.find(c=>c.id===input.candidateId);demand(candidate,'candidate');
  // A profile identifies already-qualified evidence. The installation orchestrator independently
  // verifies those evidence bytes/grades; this library never chooses or self-qualifies a model.
  return Object.freeze({...structuredClone(input),candidate:Object.freeze(structuredClone(candidate)),auxiliary:Object.freeze(structuredClone(NOMICS)),
    profileSha256:sha(JSON.stringify(input)),reasoningEffort:candidate.id==='coder'?null:'none'});
}
export function settingsSafe(settings){
  demand(settings?.justInTimeModelLoading===false&&settings.logSensitiveData===false&&settings.verbose===false,'unsafe-server-settings');
  demand(settings.dynamicRemoteMcpServer==='deny'&&settings.pluginUse==='deny','unsafe-native-mcp');
}
export function loadRequest(profile,auxiliary=false){return auxiliary?{model:NOMICS.key,context_length:2048,echo_load_config:true}:primaryLoad(profile.candidate);}
export function verifyLoaded(profile,response,auxiliary=false){
  demand(response?.status==='loaded'&&typeof response.instance_id==='string'&&response.instance_id.length>0,'load-result');
  const c=response.load_config;
  if(auxiliary){demand(c?.context_length===2048,'auxiliary-profile');return;}
  demand(c?.context_length===32768&&c.flash_attention===true&&c.offload_kv_cache_to_gpu===true
    &&c.speculative_draft_mtp===profile.candidate.mtp&&c.speculative_draft_simple===false
    &&c.speculative_draft_model===''&&sha(c.prompt_template?.template??'')===profile.candidate.templateSha256,'primary-profile');
  if(profile.candidate.mtp)demand(c.speculative_draft_max_tokens===2&&c.speculative_draft_min_tokens===0
    &&c.speculative_draft_min_continue_probability===0.75,'mtp-profile');
}
export function verifyObservation(observation,{owned,engineIdentity,now=Date.now(),powerWatts=160,ready=true}){
  demand(Number.isFinite(observation?.observedAt)&&now-observation.observedAt>=0
    &&now-observation.observedAt<=RUNTIME_LIMITS.maximumObservationAgeMs,'stale-observation');
  settingsSafe(observation.settings);
  demand(typeof observation.engineIdentity==='string'&&observation.engineIdentity.length>0
    &&(!engineIdentity||observation.engineIdentity===engineIdentity),'engine-identity');
  checkHardware(observation.hardware,powerWatts);
  const residents=residentList(observation.inventory);
  demand(residents.length===owned.length&&(!ready||owned.length===2),'resident-count');
  for(const o of owned){const matches=residents.filter(i=>i.id===o.id&&i.key===o.key);demand(matches.length===1,'resident-identity');
    demand(o.fingerprint===sha(JSON.stringify(matches[0].config)),'resident-config');}
  return observation;
}
export function validateRequest(profile,pathname,method,raw){
  demand((method==='GET'&&['/v1/models','/health'].includes(pathname))||(method==='POST'&&['/v1/chat/completions','/v1/embeddings','/rerank'].includes(pathname)),'endpoint-denied');
  if(method==='GET'){demand(raw.length===0,'body-denied');return;}
  let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw error('body-invalid');}
  demand(body&&typeof body==='object'&&!Array.isArray(body),'body-invalid');
  for(const name of ['ttl','load_config','context_length','integrations','previous_response_id'])demand(!Object.hasOwn(body,name),'load-or-agent-override');
  if(pathname==='/v1/chat/completions'){
    const allowed=new Set(['model','max_tokens','temperature','messages','reasoning_effort','stream']);
    demand(Object.keys(body).every(name=>allowed.has(name)),'request-field');
    demand(body.model===profile.candidate.key&&Array.isArray(body.messages),'unselected-model');
    demand(Number.isInteger(body.max_tokens)&&body.max_tokens>0&&body.max_tokens<=RUNTIME_LIMITS.maximumOutputTokens,'output-token-limit');
    demand(body.temperature===0,'sampling-drift');
    demand(body.messages.length>0&&body.messages.every(message=>message&&typeof message==='object'
      &&Object.keys(message).sort().join()==='content,role'&&['system','user','assistant'].includes(message.role)
      &&typeof message.content==='string'),'message-shape');
    demand(!Object.hasOwn(body,'stream')||body.stream===false,'stream-not-qualified');
    demand(profile.reasoningEffort===null?!Object.hasOwn(body,'reasoning_effort'):body.reasoning_effort===profile.reasoningEffort,'reasoning-drift');
  }else if(pathname==='/v1/embeddings'){
    demand(Object.keys(body).sort().join()==='input,model','request-field');demand(body.model===NOMICS.key,'unselected-model');
    demand(Array.isArray(body.input)&&body.input.length>0&&body.input.length<=64&&body.input.every(text=>typeof text==='string'
      &&text.isWellFormed()&&Buffer.byteLength(text,'utf8')<=1600&&Buffer.byteLength(text.normalize('NFKD'),'utf8')<=1600
      &&/^search_(?:document|query): /.test(text)),'embedding-input');
  }else{
    demand(Object.keys(body).sort().join()==='documents,query,top_n','request-field');
    demand(typeof body.query==='string'&&body.query.length>0&&body.query.length<=4000,'reranker-query');
    demand(Array.isArray(body.documents)&&body.documents.length>0&&body.documents.length<=32
      &&body.documents.every(text=>typeof text==='string'&&text.length>0&&text.length<=2000)
      &&body.top_n===body.documents.length,'reranker-window-batch');
  }
}
export {NOMICS,LEASE_POLICY,sha,residentList};
