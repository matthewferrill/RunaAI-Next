import {createHash} from 'node:crypto';
const HASH=/^[a-f0-9]{64}$/;
export const PROOF_POLICY=Object.freeze({schemaVersion:'runaai-native-processing-proof-policy/v1',
  requestCount:96,requestDeadlineMs:30000,responseCapBytes:131072,sampleIntervalMs:100,
  sampleDeadlineMs:45000,preparationDeadlineMs:600000,proofDeadlineMs:900000,sampleMs:5000,
  maximumGapMs:30000,minimumFreeHostBytes:8589934592,minimumFreeGpuMiB:1024,
  maximumStartTemperatureC:45,cutoffC:85,powerWatts:160,originalPowerWatts:260,
  gpuUuids:['GPU-15ea3e34-292b-3333-5e43-e5b133f9a30c','GPU-1f2f6459-b688-3466-5b49-a65c538be843']});
export const NOMIC=Object.freeze({key:'text-embedding-nomic-embed-text-v1.5',bytes:84106624,
  sha256:'d4e388894e09cf3816e8b0896d81d265b55e7a9fff9ab03fe8bf4ef5e11295ac',context:2048,dimension:768,
  artifactPath:'C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\resources\\app\\.webpack\\bin\\bundled-models\\nomic-ai\\nomic-embed-text-v1.5-GGUF\\nomic-embed-text-v1.5.Q4_K_M.gguf'});
export const sha=value=>createHash('sha256').update(value).digest('hex');
export const demand=(ok,code)=>{if(!ok)throw Error(`processing-proof-${code}`);};
export function checkHardware(value,power=160,starting=false){
  demand(Number.isFinite(value?.freeMemoryBytes)&&value.freeMemoryBytes>=PROOF_POLICY.minimumFreeHostBytes,'host-memory');
  demand(Array.isArray(value.gpus)&&value.gpus.length===2,'gpu-count');
  for(let index=0;index<2;index++){const gpu=value.gpus[index];
    demand(gpu.index===index&&gpu.uuid===PROOF_POLICY.gpuUuids[index]&&gpu.name==='Quadro RTX 6000','gpu-identity');
    demand(gpu.memoryTotalMiB===23040&&Number.isFinite(gpu.memoryUsedMiB)&&gpu.memoryUsedMiB>=0
      &&gpu.memoryTotalMiB-gpu.memoryUsedMiB>=PROOF_POLICY.minimumFreeGpuMiB,'gpu-memory');
    demand(Number.isFinite(gpu.temperatureC)&&gpu.temperatureC<PROOF_POLICY.cutoffC
      &&(!starting||gpu.temperatureC<=PROOF_POLICY.maximumStartTemperatureC),'temperature');
    demand(gpu.powerLimitWatts===power,'power-drift');
  }
}
const allowedStatus=new Set(['idle','processingPrompt','generating','computingEmbedding']);
export function projectSample(value,{instanceId,modelKey=NOMIC.key,startedAt,finishedAt,now=Date.now()}){
  demand(typeof instanceId==='string'&&instanceId.length>0&&instanceId.length<=256,'identity');
  demand(Number.isFinite(startedAt)&&Number.isFinite(finishedAt)&&finishedAt>=startedAt&&finishedAt-startedAt<=5000
    &&now>=finishedAt&&now-finishedAt<=5000,'stale');
  demand(Array.isArray(value)&&value.length===1,'model-count');const item=value[0];
  demand(item&&typeof item==='object'&&!Array.isArray(item)
    &&item.identifier===instanceId&&item.modelKey===modelKey&&item.type==='embedding'&&item.deviceIdentifier===null
    &&allowedStatus.has(item.status)&&Number.isSafeInteger(item.queued)&&item.queued>=0&&item.queued<=100000,'model');
  return {startedAt:new Date(startedAt).toISOString(),finishedAt:new Date(finishedAt).toISOString(),
    identifier:item.identifier,modelKey:item.modelKey,type:item.type,status:item.status,queued:item.queued};
}
export function validateRequestFixture(value){
  demand(value&&Object.keys(value).sort().join()==='input,role,type,url'&&value.type==='request'&&value.role==='embedding'
    &&value.url==='http://192.168.50.165:1234/v1/embeddings','fixture-envelope');
  demand(value.input&&Object.keys(value.input).sort().join()==='input,model'&&value.input.model===NOMIC.key
    &&Array.isArray(value.input.input)&&value.input.input.length===2
    &&value.input.input[0]==='search_document: In the fictional garden plan, pale stones mark the north room. The note lists no other room.'
    &&value.input.input[1]==='search_query: Which room has pale stones?','fixture-body');return value.input;
}
export function validateSamplerResult(value,{proofId,sealSha256,instanceId}){
  demand(value?.schemaVersion==='runaai-native-processing-sampler-result/v1'&&value.proofId===proofId
    &&value.sealSha256===sealSha256&&value.instanceId===instanceId&&HASH.test(value.samplesSha256)
    &&Number.isSafeInteger(value.sampleCount)&&value.sampleCount>0&&value.sampleCount<=1000
    &&value.positiveObserved===true&&value.queueObserved===true&&value.maximumQueued>0
    &&Array.isArray(value.statuses)&&value.statuses.includes('computingEmbedding')
    &&value.passed===true&&value.errorCode===null&&value.identity==='RUNA-HOME\\Matthew'&&value.inferenceCalled===false&&value.privateValuesIncluded===false
    &&value.admissionClosed===false&&value.drainProved===false,'sampler-result');return value;
}
export function validateRequestResult(value,{proofId,sealSha256,instanceId}){
  demand(value?.schemaVersion==='runaai-native-processing-request-result/v1'&&value.proofId===proofId
    &&value.sealSha256===sealSha256&&value.instanceId===instanceId&&value.requestCount===PROOF_POLICY.requestCount
    &&value.succeeded===PROOF_POLICY.requestCount&&value.failed===0&&value.unknown===0
    &&Number.isFinite(value.maximumElapsedMs)&&value.maximumElapsedMs>=0&&HASH.test(value.aggregateSha256)
    &&value.modelId===NOMIC.key&&value.vectorCount===PROOF_POLICY.requestCount*2&&value.dimension===NOMIC.dimension
    &&value.inferenceCalled===true&&value.syntheticOnly===true&&value.privateValuesIncluded===false,'request-result');return value;
}
