import {createHash} from 'node:crypto';
import {link,lstat,open,readFile,realpath,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalJson,sha256} from '../../../gate4/canonical.mjs';
import {ACCEPTANCE_POLICY,R6J_CASE_BUNDLE_SHA256} from './cases.mjs';
import {validateRuntimeSeal} from './runner-contract.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const HASH=/^[a-f0-9]{64}$/u,COMMIT=/^[a-f0-9]{40}$/u;
const fail=code=>Object.assign(Error('m1-r5-seal-'+code),{code:'m1-r5-seal-'+code});
const need=(value,code)=>{if(!value)throw fail(code);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===keys.split(',').sort().join();
const clone=value=>structuredClone(value);
const normalized=value=>Buffer.from(new TextDecoder('utf8',{fatal:true}).decode(value).replaceAll('\r\n','\n'));
const decode=value=>{try{return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(value));}catch{throw fail('json');}};

export const R5_SEAL_AUTHORITIES=Object.freeze({
  campaignId:'m1-r5-corrected-functions',
  criteriaNormalizedSha256:'ce4ab557914c04a6547925b889420e3d961e66ed6df676fbdf597d309af9ba8d',
  templateSha256:'416102ff7129e5adb00de51b2f0fc3e5ca542c18a82941a32fdc4075b6a1c89f',
  caseBundleSha256:'8713db8fb54bebe069f73edfef7cd179c13a3caba1d4d15bd8567f39aaa418ed',
  criteriaPath:path.join(HERE,'R5-CORRECTED-FUNCTION-QUALIFICATION-CRITERIA-2026-08-28.md'),
  templatePath:path.join(HERE,'evidence','campaign-20260828-r4b','runtime-seal.json'),
});

const HARDWARE_POLICY=Object.freeze({readyLeaseMs:3600000,preparationMs:600000,loadMs:180000,sampleMs:5000,maximumGapMs:30000,
  minimumFreeHostBytes:8589934592,minimumFreeGpuMiB:1024,maximumStartTemperatureC:45,cutoffC:85,powerWatts:160,originalPowerWatts:260,
  gpuUuids:['GPU-15ea3e34-292b-3333-5e43-e5b133f9a30c','GPU-1f2f6459-b688-3466-5b49-a65c538be843'],
  workerDeadlineMs:4200000,supervisorDeadlineMs:4440000,taskDeadlineMs:4440000});

function validateManifest(value){
  need(exact(value,'schemaVersion,campaignId,authorities,source,evidence,declaration,privateValuesIncluded')
    &&value.schemaVersion==='runaai-m1-r5-runtime-seal-input/v1'&&value.campaignId===R5_SEAL_AUTHORITIES.campaignId
    &&exact(value.authorities,'criteriaNormalizedSha256,templateSha256,caseBundleSha256')
    &&value.authorities.criteriaNormalizedSha256===R5_SEAL_AUTHORITIES.criteriaNormalizedSha256
    &&value.authorities.templateSha256===R5_SEAL_AUTHORITIES.templateSha256
    &&value.authorities.caseBundleSha256===R5_SEAL_AUTHORITIES.caseBundleSha256
    &&exact(value.source,'commit,archivePath,archiveSha256,packageLockPath,packageLockSha256,exportedWithCoreAutocrlfFalse,archiveCreatedBeforeInference')
    &&COMMIT.test(value.source.commit)&&path.isAbsolute(value.source.archivePath)&&HASH.test(value.source.archiveSha256)
    &&path.isAbsolute(value.source.packageLockPath)&&HASH.test(value.source.packageLockSha256)
    &&value.source.exportedWithCoreAutocrlfFalse===true&&value.source.archiveCreatedBeforeInference===true
    &&exact(value.evidence,'readiness,effectiveReasoning,telemetry')
    &&Object.values(value.evidence).every(item=>exact(item,'path,sha256')&&path.isAbsolute(item.path)&&HASH.test(item.sha256))
    &&exact(value.declaration,'createdBeforeInference,observedR5Attempts,importedAttemptCount,selectiveReplacement,expectedAnswerTuning,partialRoster,inheritedRuntimeSealSha256,productionRoutingChanged')
    &&value.declaration.createdBeforeInference===true&&value.declaration.observedR5Attempts===0&&value.declaration.importedAttemptCount===0
    &&value.declaration.selectiveReplacement===false&&value.declaration.expectedAnswerTuning===false&&value.declaration.partialRoster===false
    &&value.declaration.inheritedRuntimeSealSha256===null&&value.declaration.productionRoutingChanged===false
    &&value.privateValuesIncluded===false,'manifest');return clone(value);
}
function validateReadiness(value){
  need(exact(value,'schemaVersion,createdBeforeScoredInference,qualification,scope,files,modelRuntime,controls,changedCompositionSinceSmoke,productionRoutingChanged,protectedDataIncluded')
    &&value.schemaVersion==='runaai-m1-functional-readiness-reference/v1'&&value.createdBeforeScoredInference===true&&value.qualification===false
    &&typeof value.scope==='string'&&value.scope.includes('Not a substitute for functional qualification')
    &&Array.isArray(value.files)&&value.files.length===6&&value.files.every(item=>exact(item,'path,sha256')&&typeof item.path==='string'&&HASH.test(item.sha256))
    &&exact(value.modelRuntime,'path,sha256')&&typeof value.modelRuntime.path==='string'&&HASH.test(value.modelRuntime.sha256)
    &&exact(value.controls,'gemma4,qwen36,qwen3Coder')&&value.controls.gemma4==='reasoning_effort none'
    &&value.controls.qwen36==='reasoning_effort none'&&value.controls.qwen3Coder==='reasoning_effort omitted'
    &&value.productionRoutingChanged===false&&value.protectedDataIncluded===false,'readiness');return value;
}
function validateTelemetry(value,template){
  need(value?.schemaVersion==='runa-m1-campaign-hardware-plan/v1'&&value.createdBeforeLoads===true
    &&value.classification==='prospective-hardware-only-not-functional-qualification'&&value.maximumConcurrentPrimaries===1
    &&value.productionRoutingChanged===false&&value.protectedDataIncluded===false&&canonicalJson(value.policy)===canonicalJson(HARDWARE_POLICY)
    &&value.existingReranker?.url===template.reranker.baseUrl&&value.existingReranker.changed===false
    &&value.auxiliary?.artifact?.key===template.embedding.modelId&&value.auxiliary.artifact.sha256===template.embedding.artifactSha256
    &&value.auxiliary.loadRequest?.model===template.embedding.modelId&&value.auxiliary.loadRequest.context_length===2048
    &&Array.isArray(value.runtimeFiles)&&value.runtimeFiles.some(item=>item?.sha256===template.runtime.modelRuntimeSha256)
    &&Array.isArray(value.candidates)&&value.candidates.length===3,'telemetry');
  const byId=new Map(value.candidates.map(item=>[item.candidateId,item]));need(byId.size===3,'telemetry-roster');
  for(const expected of template.candidates){const actual=byId.get(expected.candidateId),controls=Object.values(expected.requestControls).map(item=>item.reasoningEffort);
    need(actual?.artifact?.key===expected.modelId&&actual.artifact.sha256===expected.artifactSha256&&actual.artifact.bytes===expected.artifactBytes
      &&new Set(controls).size===1&&actual.requestReasoningEffort===controls[0]&&actual.loadRequest?.model===expected.modelId
      &&actual.loadRequest.context_length===32768,'telemetry-candidate');}
  return value;
}
function fixedTemplate(value){
  const seal=validateRuntimeSeal(value);need(seal.caseBundleSha256===R6J_CASE_BUNDLE_SHA256&&R6J_CASE_BUNDLE_SHA256===R5_SEAL_AUTHORITIES.caseBundleSha256
    &&Object.keys(seal.suites).length>0&&seal.candidates.map(item=>item.candidateId).join()===ACCEPTANCE_POLICY.roster.map(item=>item.candidateId).join()
    &&seal.productionRoutingChanged===false,'template-contract');return seal;
}

export function deriveR5RuntimeSeal({manifest:input,templateBytes,criteriaBytes,readinessBytes,effectiveReasoningBytes,telemetryBytes}){
  const manifest=validateManifest(input);need(sha256(templateBytes)===R5_SEAL_AUTHORITIES.templateSha256,'template-drift');
  need(sha256(normalized(criteriaBytes))===R5_SEAL_AUTHORITIES.criteriaNormalizedSha256,'criteria-drift');
  const template=fixedTemplate(decode(templateBytes));need(manifest.source.commit!==template.sourceCommit
    &&manifest.source.archiveSha256!==template.runtime.sourceArchiveSha256,'historical-source-reuse');
  need(sha256(readinessBytes)===manifest.evidence.readiness.sha256&&sha256(effectiveReasoningBytes)===manifest.evidence.effectiveReasoning.sha256
    &&sha256(telemetryBytes)===manifest.evidence.telemetry.sha256,'evidence-drift');
  validateReadiness(decode(readinessBytes));validateReadiness(decode(effectiveReasoningBytes));validateTelemetry(decode(telemetryBytes),template);
  const seal={...clone(template),sourceCommit:manifest.source.commit,runtime:{...clone(template.runtime),sourceArchiveSha256:manifest.source.archiveSha256,
      packageLockSha256:manifest.source.packageLockSha256},residency:{...clone(template.residency),readinessEvidenceSha256:manifest.evidence.readiness.sha256,
      effectiveReasoningEvidenceSha256:manifest.evidence.effectiveReasoning.sha256,telemetryPolicySha256:manifest.evidence.telemetry.sha256}};
  validateRuntimeSeal(seal,{sourceCommit:manifest.source.commit});return Object.freeze({seal:Object.freeze(seal),bytes:Buffer.from(canonicalJson(seal)+'\n')});
}

async function boundedFile(filename,maximum){
  need(path.isAbsolute(filename),'path');const resolved=path.resolve(filename),actual=await realpath(resolved);need(actual.toLowerCase()===resolved.toLowerCase(),'resolved-path');
  const linked=await lstat(resolved);need(linked.isFile()&&!linked.isSymbolicLink()&&linked.nlink===1,'file-boundary');const handle=await open(resolved,'r');let bytes;
  try{const before=await handle.stat();need(before.isFile()&&before.nlink===1&&before.size>0&&before.size<=maximum,'file-boundary');bytes=await handle.readFile();const after=await handle.stat();
    need(before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&after.nlink===1&&bytes.length===before.size,'file-drift');}
  finally{await handle.close();}return bytes;
}
async function hashFile(filename,maximum){
  const resolved=path.resolve(filename),actual=await realpath(resolved);need(actual.toLowerCase()===resolved.toLowerCase(),'resolved-path');const linked=await lstat(resolved);
  need(linked.isFile()&&!linked.isSymbolicLink()&&linked.nlink===1,'file-boundary');const handle=await open(resolved,'r'),digest=createHash('sha256');
  try{const before=await handle.stat();need(before.isFile()&&before.nlink===1&&before.size>0&&before.size<=maximum,'file-boundary');let position=0;
    while(position<before.size){const buffer=Buffer.allocUnsafe(Math.min(1024*1024,before.size-position)),{bytesRead}=await handle.read(buffer,0,buffer.length,position);
      need(bytesRead>0,'file-drift');digest.update(buffer.subarray(0,bytesRead));position+=bytesRead;}
    const after=await handle.stat();need(before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&after.nlink===1,'file-drift');}
  finally{await handle.close();}return digest.digest('hex');
}
export async function createR5RuntimeSeal({manifestPath,outputPath}){
  const manifestBytes=await boundedFile(manifestPath,1024*1024),manifest=validateManifest(decode(manifestBytes));
  need(await hashFile(manifest.source.archivePath,512*1024*1024)===manifest.source.archiveSha256,'source-archive-drift');
  need(await hashFile(manifest.source.packageLockPath,16*1024*1024)===manifest.source.packageLockSha256,'package-lock-drift');
  const [templateBytes,criteriaBytes,readinessBytes,effectiveReasoningBytes,telemetryBytes]=await Promise.all([
    boundedFile(R5_SEAL_AUTHORITIES.templatePath,1024*1024),boundedFile(R5_SEAL_AUTHORITIES.criteriaPath,1024*1024),
    boundedFile(manifest.evidence.readiness.path,16*1024*1024),boundedFile(manifest.evidence.effectiveReasoning.path,16*1024*1024),
    boundedFile(manifest.evidence.telemetry.path,16*1024*1024)]);
  const result=deriveR5RuntimeSeal({manifest,templateBytes,criteriaBytes,readinessBytes,effectiveReasoningBytes,telemetryBytes});
  need(path.isAbsolute(outputPath)&&path.basename(outputPath)==='runtime-seal.json','output-path');const target=path.resolve(outputPath),parent=path.dirname(target),pending=target+'.pending';
  need((await realpath(parent)).toLowerCase()===parent.toLowerCase()&&(await lstat(parent)).isDirectory(),'output-parent');let handle,ownedPending=false,linked=false;
  try{handle=await open(pending,'wx');ownedPending=true;await handle.writeFile(result.bytes);await handle.sync();await handle.close();handle=null;
    await link(pending,target);linked=true;await unlink(pending);}
  catch(error){try{await handle?.close();}catch{}if(ownedPending&&!linked)try{await unlink(pending);}catch{}
    throw error.code==='EEXIST'?fail('output-exists'):error;}
  const info=await lstat(target);need(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1,'output-boundary');const retained=await readFile(target);
  need(retained.equals(result.bytes),'output-drift');return Object.freeze({schemaVersion:'runaai-m1-r5-runtime-seal-publication/v1',outputPath:target,
    runtimeSealSha256:sha256(retained),bytes:retained.length,sourceCommit:result.seal.sourceCommit,caseBundleSha256:result.seal.caseBundleSha256,
    createdBeforeInference:true,productionRoutingChanged:false,privateValuesIncluded:false});
}
