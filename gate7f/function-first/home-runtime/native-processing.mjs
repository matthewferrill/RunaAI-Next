import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha,demand} from './tls-primitives.mjs';
import {privateChildJson} from './private-child-result.mjs';
import {createNativeServerController,validateNativeServerBaseline,validateNativeServerObservation,NATIVE_SERVER_PATHS} from './native-server-control.mjs';
import {assertPlainPath} from './native-adapter.mjs';
const statuses=new Set(['idle','processingPrompt','generating','computingEmbedding']);
const fields=new Set(['type','modelKey','format','displayName','publisher','path','sizeBytes','indexedModelIdentifier',
  'deviceIdentifier','paramsString','architecture','quantization','variants','selectedVariant','identifier','ttlMs',
  'lastUsedTime','vision','trainedForToolUse','maxContextLength','contextLength','status','queued','parallel']);
const ownSources=['native-processing.mjs','native-server-control.mjs','private-child-result.mjs','tls-primitives.mjs'];
const observerSources=['Observe-NativeServer.ps1','Runtime-Windows.ps1','Settings-FileTransaction.ps1'];
export const NATIVE_PROCESSING_SOURCES=Object.freeze([...ownSources,...observerSources].sort());
const identity=value=>[value.identifier,value.modelKey,value.type].join('\0');
function expectedList(values){
  demand(Array.isArray(values)&&values.length<=32,'native-processing-expected');const seen=new Set();
  return values.map(value=>{
    demand(value&&Object.keys(value).sort().join()==='identifier,modelKey,type'
      &&['llm','embedding'].includes(value.type)&&['identifier','modelKey'].every(key=>typeof value[key]==='string'
        &&value[key].length>0&&value[key].length<=256&&!/[\x00-\x1f\x7f]/.test(value[key])),'native-processing-identity');
    demand(!seen.has(value.identifier),'native-processing-duplicate');seen.add(value.identifier);return {...value};
  }).sort((a,b)=>identity(a).localeCompare(identity(b)));
}
/** Metadata projection only. No processing snapshot closes native admission or grants lifecycle
 * authority. Nonselected/unknown identities fail rather than leaking their names or hiding work. */
export function projectNativeProcessing(value,{expectedModels,startedAt,finishedAt,now=Date.now()}){
  const expected=expectedList(expectedModels);
  demand(Number.isFinite(startedAt)&&Number.isFinite(finishedAt)&&finishedAt>=startedAt&&finishedAt-startedAt<=5000
    &&now>=finishedAt&&now-finishedAt<=5000,'native-processing-stale');
  demand(Array.isArray(value)&&value.length<=32,'native-processing-shape');const seen=new Set();
  const models=value.map(item=>{
    demand(item&&typeof item==='object'&&!Array.isArray(item)&&Object.keys(item).every(key=>fields.has(key))
      &&typeof item.identifier==='string'&&typeof item.modelKey==='string'&&['llm','embedding'].includes(item.type)
      &&item.deviceIdentifier===null&&statuses.has(item.status)&&Number.isSafeInteger(item.queued)&&item.queued>=0
      &&item.queued<=100000,'native-processing-model');
    demand(!seen.has(item.identifier),'native-processing-duplicate');seen.add(item.identifier);
    return {identifier:item.identifier,modelKey:item.modelKey,type:item.type,status:item.status,queued:item.queued};
  }).sort((a,b)=>identity(a).localeCompare(identity(b)));
  demand(models.length===expected.length&&models.every((value,index)=>identity(value)===identity(expected[index])),'native-processing-identity-drift');
  return {schemaVersion:'runaai-native-processing-observation/v1',startedAt,finishedAt,models,
    observedIdle:models.every(model=>model.status==='idle'&&model.queued===0),admissionClosed:false,drainProved:false,
    inferenceCalled:false,privateValuesIncluded:false};
}
export function nativeProcessingCommand(){return ['ps','--json'];}
/** Home-only installed CLI observer. Calling verify or observe is not permission to change settings
 * or stop a caller. The real instance-state mapping still requires installed positive/queued proof. */
export function createNativeProcessingObserver({codePins,assertOwnership}){
  demand(codePins&&Object.keys(codePins).sort().join()===NATIVE_PROCESSING_SOURCES.join()
    &&Object.values(codePins).every(value=>/^[a-f0-9]{64}$/.test(value))&&typeof assertOwnership==='function','native-processing-options');
  const pins=Object.freeze({...codePins});let verified=false;
  const controller=createNativeServerController({codePins:Object.fromEntries(observerSources.map(name=>[name,pins[name]])),
    assertQuiescent:async()=>{demand(false,'native-processing-no-lifecycle');},record:async()=>{demand(false,'native-processing-no-lifecycle');}});
  const checkSources=()=>{for(const name of ownSources){const file=new URL('./'+name,import.meta.url);
    // URL paths are converted by the filesystem API only after the shared native path check.
    assertPlainPath(fileURLToPath(file));demand(sha(readFileSync(file))===pins[name],'native-processing-source-drift');}};
  return {
    async verify(){await controller.verify();checkSources();verified=true;},
    async observe({baseline,expectedModels}){
      demand(verified,'native-processing-not-verified');validateNativeServerBaseline(baseline);expectedList(expectedModels);
      await assertOwnership();await controller.verify();checkSources();
      const before=validateNativeServerObservation(await controller.observe(),{expectedEngine:baseline.engine,expectedDescriptorSha256:baseline.descriptorSha256});
      const startedAt=Date.now();let raw;
      try{
        const child=spawn(NATIVE_SERVER_PATHS.cli,nativeProcessingCommand(),{windowsHide:true,stdio:['pipe','pipe','pipe'],
          env:{...process.env,LMS_API_SERVER_INFO_PATH:NATIVE_SERVER_PATHS.descriptor}});
        const pending=privateChildJson(child,{timeoutMs:5000});child.stdin.end();raw=await pending;
      }catch{demand(false,'native-processing-unconfirmed');}
      const finishedAt=Date.now();
      const after=validateNativeServerObservation(await controller.observe(),{expectedEngine:before.engine,expectedDescriptorSha256:before.descriptorSha256});
      await assertOwnership();checkSources();
      return {...projectNativeProcessing(raw,{expectedModels,startedAt,finishedAt}),engine:after.engine,
        descriptorSha256:after.descriptorSha256,cliSha256:'976d4389f97b2cf95b38a4eb673855d8a846f2db21a20eb4fe5e79f7179722f5'};
    },
  };
}
