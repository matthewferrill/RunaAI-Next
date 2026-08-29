import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {canonicalJson,sha256} from '../../../gate4/canonical.mjs';
import {CASE_BUNDLE_SHA256,MODEL_CASES} from './cases.mjs';
import {R6_SEAL_AUTHORITIES,createR6RuntimeSeal,deriveR6RuntimeSeal} from './r6-runtime-seal.mjs';
import {validateRuntimeSeal} from './runner-contract.mjs';
import {CAMPAIGN_V2_POLICY} from '../readiness/lease-v2-contract.mjs';

const readinessPath=path.resolve('gate7f/function-first/readiness/evidence/20260828-functional-prerequisites.json');
const oldTelemetryPath=path.resolve('gate7f/function-first/readiness/evidence/20260828-campaign-coder-r5/campaign-hardware-plan.json');
const copy=value=>structuredClone(value);
async function authorityFiles(){const old=JSON.parse(await readFile(oldTelemetryPath,'utf8'));old.schemaVersion='runa-m1-campaign-hardware-plan/v2';
  old.classification='prospective-r6-hardware-only-not-functional-qualification';old.policy=CAMPAIGN_V2_POLICY;
  return {templateBytes:await readFile(R6_SEAL_AUTHORITIES.templatePath),criteriaFiles:[
    {id:'agent05-browser-checkpoint',bytes:Buffer.from('prospective frozen Agent05 criteria\n')},
    {id:'determinate-function-qualification',bytes:Buffer.from('prospective frozen determinate criteria\n')},
    {id:'lease-publication-margin',bytes:await readFile(R6_SEAL_AUTHORITIES.criteriaPath)}],
    readinessBytes:await readFile(readinessPath),effectiveReasoningBytes:await readFile(readinessPath),telemetryBytes:Buffer.from(canonicalJson(old)+'\n')};}
function normalizedSha(bytes){return sha256(Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n')));}
function manifest({root,archiveBytes=Buffer.from('prospective-r6-source-archive'),lockBytes=Buffer.from('{"lockfileVersion":3}\n'),evidence,criteria}){
  const archivePath=path.join(root,'source.tar'),packageLockPath=path.join(root,'package-lock.json');return {archivePath,packageLockPath,archiveBytes,lockBytes,value:{
    schemaVersion:'runaai-m1-r6-runtime-seal-input/v1',campaignId:R6_SEAL_AUTHORITIES.campaignId,
    authorities:{commonCriteria:criteria.map(item=>({id:item.id,path:item.path,sha256:sha256(item.bytes),normalizedSha256:normalizedSha(item.bytes)})),
      templateSha256:R6_SEAL_AUTHORITIES.templateSha256,caseBundleSha256:R6_SEAL_AUTHORITIES.caseBundleSha256},
    source:{commit:'f'.repeat(40),archivePath,archiveSha256:sha256(archiveBytes),packageLockPath,packageLockSha256:sha256(lockBytes),
      exportedWithCoreAutocrlfFalse:true,archiveCreatedBeforeInference:true},
    evidence:{readiness:{path:evidence.readinessPath,sha256:sha256(evidence.readinessBytes)},effectiveReasoning:{path:evidence.reasoningPath,sha256:sha256(evidence.reasoningBytes)},
      telemetry:{path:evidence.telemetryPath,sha256:sha256(evidence.telemetryBytes)}},
    declaration:{createdBeforeInference:true,observedR6Attempts:0,importedAttemptCount:0,selectiveReplacement:false,expectedAnswerTuning:false,
      partialRoster:false,inheritedRuntimeSealSha256:null,productionRoutingChanged:false},privateValuesIncluded:false}};}
async function fixture(){const root=await mkdtemp(path.join(tmpdir(),'m1-r6-seal-')),files=await authorityFiles(),evidence={readinessBytes:files.readinessBytes,
  reasoningBytes:files.effectiveReasoningBytes,telemetryBytes:files.telemetryBytes,readinessPath:path.join(root,'readiness.json'),
  reasoningPath:path.join(root,'reasoning.json'),telemetryPath:path.join(root,'telemetry.json')};
  const criteria=files.criteriaFiles.map(item=>({...item,path:path.join(root,item.id+'.md')}));
  await Promise.all([writeFile(evidence.readinessPath,evidence.readinessBytes),writeFile(evidence.reasoningPath,evidence.reasoningBytes),writeFile(evidence.telemetryPath,evidence.telemetryBytes),
    ...criteria.map(item=>writeFile(item.path,item.bytes))]);
  const made=manifest({root,evidence,criteria});await writeFile(made.archivePath,made.archiveBytes);await writeFile(made.packageLockPath,made.lockBytes);
  const manifestPath=path.join(root,'input.json');await writeFile(manifestPath,canonicalJson(made.value)+'\n');
  return {root,files,evidence,...made,manifestPath,async close(){await rm(root,{recursive:true,force:true});}};}
function derive(f,value=f.value,overrides={}){return deriveR6RuntimeSeal({manifest:value,...f.files,...overrides});}

test('R6 deterministically keeps the fixed roster roles budgets and recomputed suites',async()=>{const f=await fixture();try{
  const first=derive(f),second=derive(f),seal=first.seal,template=JSON.parse(f.files.templateBytes);assert.deepEqual(first.bytes,second.bytes);
  assert.equal(seal.schemaVersion,'runaai-m1-functional-runtime-seal/v2');assert.equal(seal.sourceCommit,f.value.source.commit);
  assert.equal(seal.maximumBatchMs,3600000);assert.equal(seal.caseBundleSha256,CASE_BUNDLE_SHA256);
  assert.deepEqual(seal.qualificationCriteria.entries.map(item=>item.id),R6_SEAL_AUTHORITIES.criteriaIds);
  assert.deepEqual(seal.candidates,template.candidates);assert.deepEqual(seal.roles,template.roles);
  const suites=Object.fromEntries(MODEL_CASES.flatMap(item=>(item.setup.suites??[]).map(value=>[value.suiteId,sha256(canonicalJson(value))])));
  assert.deepEqual(seal.suites,suites);assert.deepEqual(first.bytes,Buffer.from(canonicalJson(seal)+'\n'));
  assert.equal(validateRuntimeSeal(JSON.parse(first.bytes)).schemaVersion,'runaai-m1-functional-runtime-seal/v2');
}finally{await f.close();}});

test('R6 publication is canonical create-only and stable across independent directories',async()=>{const left=await fixture(),right=await fixture();try{
  const aPath=path.join(left.root,'out','runtime-seal.json'),bPath=path.join(right.root,'out','runtime-seal.json');await mkdir(path.dirname(aPath));await mkdir(path.dirname(bPath));
  const a=await createR6RuntimeSeal({manifestPath:left.manifestPath,outputPath:aPath}),b=await createR6RuntimeSeal({manifestPath:right.manifestPath,outputPath:bPath});
  assert.equal(a.runtimeSealSha256,b.runtimeSealSha256);assert.deepEqual(await readFile(aPath),await readFile(bPath));
  await assert.rejects(createR6RuntimeSeal({manifestPath:left.manifestPath,outputPath:aPath}),/output-exists/u);
  await assert.rejects(readFile(aPath+'.pending'));
}finally{await left.close();await right.close();}});

test('R6 refuses retrospective tuned partial inherited or recycled R5 inputs',async()=>{const f=await fixture();try{
  const variants=[v=>v.declaration.observedR6Attempts=1,v=>v.declaration.importedAttemptCount=1,v=>v.declaration.selectiveReplacement=true,
    v=>v.declaration.expectedAnswerTuning=true,v=>v.declaration.partialRoster=true,v=>v.declaration.inheritedRuntimeSealSha256='a'.repeat(64),
    v=>v.declaration.productionRoutingChanged=true,v=>v.source.archiveCreatedBeforeInference=false,v=>v.source.exportedWithCoreAutocrlfFalse=false,
    v=>v.schemaVersion='runaai-m1-r5-runtime-seal-input/v1',v=>v.campaignId='m1-r5-corrected-functions',v=>v.authorities.commonCriteria.pop(),
    v=>v.authorities.commonCriteria.reverse(),v=>v.authorities.commonCriteria[0].sha256='0'.repeat(64)];
  for(const mutate of variants){const value=copy(f.value);mutate(value);assert.throws(()=>derive(f,value));}
}finally{await f.close();}});

test('R6 refuses policy roster artifact role budget suite and evidence drift',async()=>{const f=await fixture();try{
  const mutateTelemetry=[v=>v.policy.readyLeaseMs++,v=>v.policy.maximumBatchMs++,v=>v.candidates.pop(),
    v=>v.candidates[0].artifact.sha256='0'.repeat(64),v=>v.candidates[0].requestReasoningEffort=null,v=>v.auxiliary.artifact.sha256='0'.repeat(64)];
  for(const mutate of mutateTelemetry){const value=JSON.parse(f.files.telemetryBytes);mutate(value);const bytes=Buffer.from(canonicalJson(value)+'\n'),manifestValue=copy(f.value);
    manifestValue.evidence.telemetry.sha256=sha256(bytes);assert.throws(()=>derive(f,manifestValue,{telemetryBytes:bytes}),/telemetry/u);}
  const template=JSON.parse(f.files.templateBytes);template.roles.chat.maximumOutputTokens=513;
  assert.throws(()=>derive(f,f.value,{templateBytes:Buffer.from(canonicalJson(template)+'\n')}),/template-drift/u);
  const changed=copy(f.files.criteriaFiles);changed[0]={...changed[0],bytes:Buffer.concat([changed[0].bytes,Buffer.from('x')])};
  assert.throws(()=>derive(f,f.value,{criteriaFiles:changed}),/criteria-drift/u);
}finally{await f.close();}});

test('R6 checks archive lock and evidence bytes before creating an output',async()=>{const f=await fixture();try{
  const directory=path.join(f.root,'output');await mkdir(directory);const output=path.join(directory,'runtime-seal.json');await writeFile(f.archivePath,'changed');
  await assert.rejects(createR6RuntimeSeal({manifestPath:f.manifestPath,outputPath:output}),/source-archive-drift/u);
  await writeFile(f.archivePath,f.archiveBytes);await writeFile(f.packageLockPath,'changed');await assert.rejects(createR6RuntimeSeal({manifestPath:f.manifestPath,outputPath:output}),/package-lock-drift/u);
  await writeFile(f.packageLockPath,f.lockBytes);await writeFile(f.evidence.readinessPath,'{}');await assert.rejects(createR6RuntimeSeal({manifestPath:f.manifestPath,outputPath:output}),/evidence-drift/u);
  await assert.rejects(readFile(output));await assert.rejects(readFile(output+'.pending'));
}finally{await f.close();}});
