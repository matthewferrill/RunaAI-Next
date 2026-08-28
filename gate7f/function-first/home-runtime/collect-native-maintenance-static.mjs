// Offline inspection of the previously pinned public bundle, never execution or credential access.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './tls-primitives.mjs';
const sourceSha256='6cbb7ba8dfeefee1ce523a88e0f9d64687cdad59564ee5e7fbff6bb95d00f22f';
const decodedSha256='634a4c5805ff239c77f135631a7e3634ccdb8dcfc2cb767aa5be4d197c1f509e';
const cache=path.resolve(import.meta.dirname,'../../../artifacts/m1-readiness/native-source-cache');
assert.equal(readFileSync(path.join(cache,'.gitignore'),'utf8').trim(),'*');
const source=readFileSync(path.join(cache,sourceSha256+'.bin'));
assert.equal(source.length,24258428);assert.equal(sha(source),sourceSha256);
const decoded=readFileSync(path.join(cache,sourceSha256+'.decoded.txt'));
assert.equal(sha(decoded),decodedSha256);
const text=decoded.toString('utf8');
const definitions=[
  {name:'cli-passkey-check',index:11428595,length:1060,
    contains:['lmsCliClientIdentifier','getLmsFullKey','Invalid passkey for lms CLI client']},
  {name:'native-processing-rpc',index:11322020,length:490,
    contains:['getInstanceProcessingState','getInstanceBySpecifierOrThrow','processingState']},
  {name:'embedding-queue-state',index:9935990,length:1650,
    contains:['queueLengthSignal','setProcessingState','computingEmbedding']},
  {name:'embedding-unload-clears-queue',index:9938950,length:520,
    contains:['onUnload','clearQueue']},
  {name:'llm-queue-state',index:9962860,length:700,
    contains:['ParallelPredictionQueue','queueLengthSignal','setProcessingState']},
  {name:'llm-unload-clears-queue',index:9987350,length:680,
    contains:['onUnload','predictionQueue','clearQueue','ExplicitModelUnloadError']},
  {name:'model-unload-terminates-worker',index:10013600,length:1740,
    contains:['unloadInternal','childUtilityProcess','kill','unloadReason','resolveUnloadPromise']},
];
const sections=definitions.map(({name,index,length,contains})=>{
  const code=text.slice(index,index+length);for(const needle of contains)assert.ok(code.includes(needle),name+':'+needle);
  return {name,index,length,code,codeSha256:sha(code)};
});
const output=path.join(import.meta.dirname,'evidence/20260828-native-maintenance-static.json');
assert.equal(existsSync(output),false);
const result={schemaVersion:'runaai-native-maintenance-static/v1',observedAt:new Date().toISOString(),
  sourceSha256,sourceBytes:source.length,decodedSha256,decoder:'analyze-native-cache.mjs',
  decoderSha256:sha(readFileSync(path.join(import.meta.dirname,'analyze-native-cache.mjs'))),
  literalTableRotation:104,readOnly:true,cacheOnly:true,vendorCodeExecuted:false,credentialRead:false,
  installedOperationProved:false,admissionClosed:false,drainProved:false,sections};
const raw=JSON.stringify(result,null,2)+'\n';writeFileSync(output,raw,{flag:'wx'});
console.log(JSON.stringify({output,sha256:sha(raw),sectionCount:sections.length,sourceSha256,decodedSha256}));
