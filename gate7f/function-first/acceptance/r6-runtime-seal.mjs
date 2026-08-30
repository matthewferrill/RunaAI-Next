import {createHash} from 'node:crypto';
import {link,lstat,open,readFile,realpath,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalJson,sha256} from '../../../gate4/canonical.mjs';
import {ACCEPTANCE_POLICY,R6J_CASE_BUNDLE_SHA256} from './cases.mjs';
import {validateRuntimeSeal} from './runner-contract.mjs';
import {CAMPAIGN_V2_POLICY,validateCampaignV2Policy} from '../readiness/lease-v2-contract.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url)),HASH=/^[a-f0-9]{64}$/u,COMMIT=/^[a-f0-9]{40}$/u;
const fail=code=>Object.assign(Error('m1-r6-seal-'+code),{code:'m1-r6-seal-'+code});
const need=(value,code)=>{if(!value)throw fail(code);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys.split(',').sort().join();
const clone=value=>structuredClone(value);
const normalized=value=>Buffer.from(new TextDecoder('utf8',{fatal:true}).decode(value).replaceAll('\r\n','\n'));
const decode=value=>{try{return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(value));}catch{throw fail('json');}};

export const R6_SEAL_AUTHORITIES=Object.freeze({
  campaignId:'m1-r6-campaign-lifecycle-v2',
  criteriaIds:Object.freeze(['agent05-browser-checkpoint','determinate-function-qualification','lease-publication-margin']),
  leaseCriteriaNormalizedSha256:'9cd2aa0366d6e4ced6cc2a3d3515f04ae75a019e1df277fc59de3aec1b979b96',
  templateSha256:'416102ff7129e5adb00de51b2f0fc3e5ca542c18a82941a32fdc4075b6a1c89f',
  caseBundleSha256:'8713db8fb54bebe069f73edfef7cd179c13a3caba1d4d15bd8567f39aaa418ed',
  criteriaPath:path.resolve(HERE,'../readiness/R6-CAMPAIGN-LEASE-PUBLICATION-MARGIN-CRITERIA-2026-08-29.md'),
  templatePath:path.join(HERE,'evidence','campaign-20260828-r4b','runtime-seal.json'),
});

function validateManifest(value){
  need(exact(value,'schemaVersion,campaignId,authorities,source,evidence,declaration,privateValuesIncluded')
    &&value.schemaVersion==='runaai-m1-r6-runtime-seal-input/v1'&&value.campaignId===R6_SEAL_AUTHORITIES.campaignId
    &&exact(value.authorities,'commonCriteria,templateSha256,caseBundleSha256')
    &&Array.isArray(value.authorities.commonCriteria)&&value.authorities.commonCriteria.length===3
    &&value.authorities.templateSha256===R6_SEAL_AUTHORITIES.templateSha256
    &&value.authorities.caseBundleSha256===R6_SEAL_AUTHORITIES.caseBundleSha256
    &&exact(value.source,'commit,archivePath,archiveSha256,packageLockPath,packageLockSha256,exportedWithCoreAutocrlfFalse,archiveCreatedBeforeInference')
    &&COMMIT.test(value.source.commit)&&path.isAbsolute(value.source.archivePath)&&HASH.test(value.source.archiveSha256)
    &&path.isAbsolute(value.source.packageLockPath)&&HASH.test(value.source.packageLockSha256)
    &&value.source.exportedWithCoreAutocrlfFalse===true&&value.source.archiveCreatedBeforeInference===true
    &&exact(value.evidence,'readiness,effectiveReasoning,telemetry')
    &&Object.values(value.evidence).every(item=>exact(item,'path,sha256')&&path.isAbsolute(item.path)&&HASH.test(item.sha256))
    &&exact(value.declaration,'createdBeforeInference,observedR6Attempts,importedAttemptCount,selectiveReplacement,expectedAnswerTuning,partialRoster,inheritedRuntimeSealSha256,productionRoutingChanged')
    &&value.declaration.createdBeforeInference===true&&value.declaration.observedR6Attempts===0&&value.declaration.importedAttemptCount===0
    &&value.declaration.selectiveReplacement===false&&value.declaration.expectedAnswerTuning===false&&value.declaration.partialRoster===false
    &&value.declaration.inheritedRuntimeSealSha256===null&&value.declaration.productionRoutingChanged===false
    &&value.privateValuesIncluded===false,'manifest');
  const ids=value.authorities.commonCriteria.map(item=>item?.id);
  need(ids.join()===R6_SEAL_AUTHORITIES.criteriaIds.join()&&new Set(ids).size===3
    &&value.authorities.commonCriteria.every(item=>exact(item,'id,path,sha256,normalizedSha256')&&path.isAbsolute(item.path)
      &&HASH.test(item.sha256)&&HASH.test(item.normalizedSha256)),'criteria-authorities');
  const lease=value.authorities.commonCriteria.find(item=>item.id==='lease-publication-margin');
  need(lease.normalizedSha256===R6_SEAL_AUTHORITIES.leaseCriteriaNormalizedSha256,'criteria-authorities');return clone(value);
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
  try{validateCampaignV2Policy(value?.policy);}catch{throw fail('telemetry');}
  need(value?.schemaVersion==='runa-m1-campaign-hardware-plan/v2'&&value.createdBeforeLoads===true
    &&value.classification==='prospective-r6-hardware-only-not-functional-qualification'&&value.maximumConcurrentPrimaries===1
    &&value.productionRoutingChanged===false&&value.protectedDataIncluded===false&&canonicalJson(value.policy)===canonicalJson(CAMPAIGN_V2_POLICY)
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
  const seal=validateRuntimeSeal(value);need(seal.caseBundleSha256===R6J_CASE_BUNDLE_SHA256&&R6J_CASE_BUNDLE_SHA256===R6_SEAL_AUTHORITIES.caseBundleSha256
    &&Object.keys(seal.suites).length>0&&seal.candidates.map(item=>item.candidateId).join()===ACCEPTANCE_POLICY.roster.map(item=>item.candidateId).join()
    &&seal.maximumBatchMs===CAMPAIGN_V2_POLICY.maximumBatchMs&&seal.productionRoutingChanged===false,'template-contract');return seal;
}

function criteriaAuthority(manifest,criteriaFiles){
  need(Array.isArray(criteriaFiles)&&criteriaFiles.length===3,'criteria-files');const byId=new Map(criteriaFiles.map(item=>[item.id,item.bytes]));
  need(byId.size===3,'criteria-files');const entries=manifest.authorities.commonCriteria.map(expected=>{const bytes=byId.get(expected.id);
    need(Buffer.isBuffer(bytes)&&sha256(bytes)===expected.sha256&&sha256(normalized(bytes))===expected.normalizedSha256,'criteria-drift');
    return {id:expected.id,sha256:expected.sha256,normalizedSha256:expected.normalizedSha256};});
  return Object.freeze({schemaVersion:'runaai-m1-common-qualification-criteria/v1',entries:Object.freeze(entries),
    combinedSha256:sha256(canonicalJson(entries))});
}

export function deriveR6RuntimeSeal({manifest:input,templateBytes,criteriaFiles,readinessBytes,effectiveReasoningBytes,telemetryBytes}){
  const manifest=validateManifest(input);need(sha256(templateBytes)===R6_SEAL_AUTHORITIES.templateSha256,'template-drift');
  const qualificationCriteria=criteriaAuthority(manifest,criteriaFiles);
  const template=fixedTemplate(decode(templateBytes));need(manifest.source.commit!==template.sourceCommit
    &&manifest.source.archiveSha256!==template.runtime.sourceArchiveSha256,'historical-source-reuse');
  need(sha256(readinessBytes)===manifest.evidence.readiness.sha256&&sha256(effectiveReasoningBytes)===manifest.evidence.effectiveReasoning.sha256
    &&sha256(telemetryBytes)===manifest.evidence.telemetry.sha256,'evidence-drift');
  validateReadiness(decode(readinessBytes));validateReadiness(decode(effectiveReasoningBytes));validateTelemetry(decode(telemetryBytes),template);
  const seal={...clone(template),schemaVersion:'runaai-m1-functional-runtime-seal/v2',qualificationCriteria,sourceCommit:manifest.source.commit,
    runtime:{...clone(template.runtime),sourceArchiveSha256:manifest.source.archiveSha256,
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
export async function createR6RuntimeSeal({manifestPath,outputPath}){
  const manifestBytes=await boundedFile(manifestPath,1024*1024),manifest=validateManifest(decode(manifestBytes));
  need(await hashFile(manifest.source.archivePath,512*1024*1024)===manifest.source.archiveSha256,'source-archive-drift');
  need(await hashFile(manifest.source.packageLockPath,16*1024*1024)===manifest.source.packageLockSha256,'package-lock-drift');
  const [templateBytes,readinessBytes,effectiveReasoningBytes,telemetryBytes,...criteriaBytes]=await Promise.all([
    boundedFile(R6_SEAL_AUTHORITIES.templatePath,1024*1024),
    boundedFile(manifest.evidence.readiness.path,16*1024*1024),boundedFile(manifest.evidence.effectiveReasoning.path,16*1024*1024),
    boundedFile(manifest.evidence.telemetry.path,16*1024*1024),...manifest.authorities.commonCriteria.map(item=>boundedFile(item.path,1024*1024))]);
  const criteriaFiles=manifest.authorities.commonCriteria.map((item,index)=>({id:item.id,bytes:criteriaBytes[index]}));
  const result=deriveR6RuntimeSeal({manifest,templateBytes,criteriaFiles,readinessBytes,effectiveReasoningBytes,telemetryBytes});
  need(path.isAbsolute(outputPath)&&path.basename(outputPath)==='runtime-seal.json','output-path');const target=path.resolve(outputPath),parent=path.dirname(target),pending=target+'.pending';
  need((await realpath(parent)).toLowerCase()===parent.toLowerCase()&&(await lstat(parent)).isDirectory(),'output-parent');let handle,ownedPending=false,linked=false;
  try{handle=await open(pending,'wx');ownedPending=true;await handle.writeFile(result.bytes);await handle.sync();await handle.close();handle=null;
    await link(pending,target);linked=true;await unlink(pending);}
  catch(error){try{await handle?.close();}catch{}if(ownedPending&&!linked)try{await unlink(pending);}catch{}
    throw error.code==='EEXIST'?fail('output-exists'):error;}
  const info=await lstat(target);need(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1,'output-boundary');const retained=await readFile(target);
  need(retained.equals(result.bytes),'output-drift');return Object.freeze({schemaVersion:'runaai-m1-r6-runtime-seal-publication/v1',outputPath:target,
    runtimeSealSha256:sha256(retained),bytes:retained.length,sourceCommit:result.seal.sourceCommit,caseBundleSha256:result.seal.caseBundleSha256,
    createdBeforeInference:true,productionRoutingChanged:false,privateValuesIncluded:false});
}
