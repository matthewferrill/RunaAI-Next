import { createHash } from "node:crypto";
export const LEASE_POLICY = Object.freeze({ readyLeaseMs:600000, preparationMs:600000, loadMs:180000,
  sampleMs:5000, maximumGapMs:30000, minimumFreeHostBytes:8589934592, minimumFreeGpuMiB:1024,
  maximumStartTemperatureC:45, cutoffC:85, powerWatts:160, originalPowerWatts:260,
  gpuUuids:["GPU-15ea3e34-292b-3333-5e43-e5b133f9a30c","GPU-1f2f6459-b688-3466-5b49-a65c538be843"] });
export const NOMICS = Object.freeze({key:"text-embedding-nomic-embed-text-v1.5",bytes:84106624,
  sha256:"d4e388894e09cf3816e8b0896d81d265b55e7a9fff9ab03fe8bf4ef5e11295ac",context:2048,
  artifactPath:"C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\resources\\app\\.webpack\\bin\\bundled-models\\nomic-ai\\nomic-embed-text-v1.5-GGUF\\nomic-embed-text-v1.5.Q4_K_M.gguf" });
export const sha=value=>createHash("sha256").update(value).digest("hex");
export const assert=(ok,code)=>{if(!ok)throw Error(`lease-${code}`);};
export function residentList(value){
  assert(Array.isArray(value?.models),"inventory-shape");
  return value.models.flatMap(m=>{assert(typeof m.key==="string"&&Array.isArray(m.loaded_instances),"inventory-shape");
    return m.loaded_instances.map(i=>{assert(typeof i.id==="string"&&i.config&&typeof i.config==="object","instance-shape");return {...i,key:m.key};});});
}
export function checkResidents(value,owned,pendingKey=null){
  const found=residentList(value), keys=new Set();
  for(const i of found){
    assert(!keys.has(i.key),"duplicate-residency"); keys.add(i.key);
    const o=owned.find(x=>x.id===i.id&&x.key===i.key);
    assert(o||i.key===pendingKey,"unexpected-residency");
    if(o?.fingerprint)assert(o.fingerprint===sha(JSON.stringify(i.config)),"config-drift");
  }
  for(const o of owned)assert(found.some(i=>i.id===o.id&&i.key===o.key),"owned-residency-lost");
  return found;
}
export function checkHardware(s,power=160,starting=false){
  assert(Number.isFinite(s.freeMemoryBytes)&&s.freeMemoryBytes>=LEASE_POLICY.minimumFreeHostBytes,"host-memory");
  assert(Array.isArray(s.gpus)&&s.gpus.length===2,"gpu-count");
  for(let i=0;i<2;i++){
    const g=s.gpus[i];assert(g.index===i&&g.uuid===LEASE_POLICY.gpuUuids[i]&&g.name==="Quadro RTX 6000","gpu-identity");
    assert(g.memoryTotalMiB===23040&&Number.isFinite(g.memoryUsedMiB)&&g.memoryUsedMiB>=0&&g.memoryTotalMiB-g.memoryUsedMiB>=1024,"gpu-memory");
    assert(Number.isFinite(g.temperatureC)&&g.temperatureC<85&&(!starting||g.temperatureC<=45),"temperature");
    assert(g.powerLimitWatts===power,"power-drift");
  }
}
export function validCompletion(v,seal,leaseId){
  assert(v&&Object.keys(v).sort().join() === "leaseId,reason,schemaVersion,sealSha256", "completion-shape");
  assert(v.schemaVersion==="runa-m1-smoke-completion/v1"&&v.sealSha256===seal&&v.leaseId===leaseId&&["completed","abort"].includes(v.reason),"completion-binding");
  return v.reason;
}
export function primaryLoad(candidate){return {model:candidate.key,context_length:32768,flash_attention:true,
  offload_kv_cache_to_gpu:true,echo_load_config:true,speculative_draft_mtp:candidate.mtp,
  speculative_draft_simple:false,speculative_draft_model:"",...(candidate.mtp?{speculative_draft_max_tokens:2,
    speculative_draft_min_tokens:0,speculative_draft_min_continue_probability:0.75}:{})};}
