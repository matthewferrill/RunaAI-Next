import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {canonicalJson,sha256} from '../../../gate4/canonical.mjs';
import {R6J_CASE_BUNDLE_SHA256} from './cases.mjs';
import {R5_SEAL_AUTHORITIES,deriveR5RuntimeSeal,createR5RuntimeSeal} from './r5-runtime-seal.mjs';

const readinessPath=path.resolve('gate7f/function-first/readiness/evidence/20260828-functional-prerequisites.json');
const telemetryPath=path.resolve('gate7f/function-first/readiness/evidence/20260828-campaign-coder-r5/campaign-hardware-plan.json');
const copy=value=>structuredClone(value);
async function authorities(){return {templateBytes:await readFile(R5_SEAL_AUTHORITIES.templatePath),criteriaBytes:await readFile(R5_SEAL_AUTHORITIES.criteriaPath),
  readinessBytes:await readFile(readinessPath),effectiveReasoningBytes:await readFile(readinessPath),telemetryBytes:await readFile(telemetryPath)};}
function manifest({root,archiveBytes=Buffer.from('synthetic-final-r5-source-archive'),lockBytes=Buffer.from('{"lockfileVersion":3}\n'),evidence}){
  const archivePath=path.join(root,'source.tar'),packageLockPath=path.join(root,'package-lock.json');return {archivePath,packageLockPath,archiveBytes,lockBytes,value:{
    schemaVersion:'runaai-m1-r5-runtime-seal-input/v1',campaignId:R5_SEAL_AUTHORITIES.campaignId,
    authorities:{criteriaNormalizedSha256:R5_SEAL_AUTHORITIES.criteriaNormalizedSha256,templateSha256:R5_SEAL_AUTHORITIES.templateSha256,caseBundleSha256:R5_SEAL_AUTHORITIES.caseBundleSha256},
    source:{commit:'f'.repeat(40),archivePath,archiveSha256:sha256(archiveBytes),packageLockPath,packageLockSha256:sha256(lockBytes),
      exportedWithCoreAutocrlfFalse:true,archiveCreatedBeforeInference:true},
    evidence:{readiness:{path:evidence.readinessPath,sha256:sha256(evidence.readinessBytes)},effectiveReasoning:{path:evidence.reasoningPath,sha256:sha256(evidence.reasoningBytes)},
      telemetry:{path:evidence.telemetryPath,sha256:sha256(evidence.telemetryBytes)}},
    declaration:{createdBeforeInference:true,observedR5Attempts:0,importedAttemptCount:0,selectiveReplacement:false,expectedAnswerTuning:false,
      partialRoster:false,inheritedRuntimeSealSha256:null,productionRoutingChanged:false},privateValuesIncluded:false}};}
async function fixture(){const root=await mkdtemp(path.join(tmpdir(),'m1-r5-seal-')),files=await authorities(),evidence={readinessBytes:files.readinessBytes,
  reasoningBytes:files.effectiveReasoningBytes,telemetryBytes:files.telemetryBytes,readinessPath:path.join(root,'readiness.json'),reasoningPath:path.join(root,'reasoning.json'),
  telemetryPath:path.join(root,'telemetry.json')};await Promise.all([writeFile(evidence.readinessPath,evidence.readinessBytes),writeFile(evidence.reasoningPath,evidence.reasoningBytes),
    writeFile(evidence.telemetryPath,evidence.telemetryBytes)]);const made=manifest({root,evidence});await writeFile(made.archivePath,made.archiveBytes);await writeFile(made.packageLockPath,made.lockBytes);
  const manifestPath=path.join(root,'input.json');await writeFile(manifestPath,canonicalJson(made.value)+'\n');return {root,files,evidence,...made,manifestPath,async close(){await rm(root,{recursive:true,force:true});}};}
function derive(f,manifestValue=f.value,overrides={}){return deriveR5RuntimeSeal({manifest:manifestValue,...f.files,...overrides});}

test('deterministically derives fixed R5 fields and retains its historical pinned suites',async()=>{const f=await fixture();try{
  const first=derive(f),second=derive(f),seal=first.seal,template=JSON.parse(f.files.templateBytes);assert.deepEqual(first.bytes,second.bytes);
  assert.equal(seal.sourceCommit,f.value.source.commit);assert.equal(seal.runtime.sourceArchiveSha256,f.value.source.archiveSha256);
  assert.equal(seal.runtime.packageLockSha256,f.value.source.packageLockSha256);assert.equal(seal.caseBundleSha256,R6J_CASE_BUNDLE_SHA256);
  assert.deepEqual(seal.suites,template.suites);assert.deepEqual(seal.candidates,template.candidates);assert.deepEqual(seal.roles,template.roles);
  assert.deepEqual(seal.runtime,{...template.runtime,sourceArchiveSha256:f.value.source.archiveSha256,packageLockSha256:f.value.source.packageLockSha256});
  assert.equal(first.bytes.equals(Buffer.from(canonicalJson(seal)+'\n')),true);
}finally{await f.close();}});

test('publishes create-only canonical bytes and produces the same seal in independent directories',async()=>{const left=await fixture(),right=await fixture();try{
  const leftOutput=path.join(left.root,'out','runtime-seal.json'),rightOutput=path.join(right.root,'out','runtime-seal.json');await mkdir(path.dirname(leftOutput));await mkdir(path.dirname(rightOutput));
  const a=await createR5RuntimeSeal({manifestPath:left.manifestPath,outputPath:leftOutput}),b=await createR5RuntimeSeal({manifestPath:right.manifestPath,outputPath:rightOutput});
  assert.equal(a.runtimeSealSha256,b.runtimeSealSha256);assert.deepEqual(await readFile(leftOutput),await readFile(rightOutput));
  await assert.rejects(readFile(leftOutput+'.pending'));await assert.rejects(readFile(rightOutput+'.pending'));
  await assert.rejects(createR5RuntimeSeal({manifestPath:left.manifestPath,outputPath:leftOutput}),/output-exists/u);
  await assert.rejects(readFile(leftOutput+'.pending'));
}finally{await left.close();await right.close();}});

test('rejects retrospective, tuned, partial, inherited and operator-override manifests',async()=>{const f=await fixture();try{
  const cases=[v=>{v.declaration.observedR5Attempts=1;},v=>{v.declaration.importedAttemptCount=1;},v=>{v.declaration.selectiveReplacement=true;},
    v=>{v.declaration.expectedAnswerTuning=true;},v=>{v.declaration.partialRoster=true;},v=>{v.declaration.inheritedRuntimeSealSha256='a'.repeat(64);},
    v=>{v.declaration.productionRoutingChanged=true;},v=>{v.source.exportedWithCoreAutocrlfFalse=false;},v=>{v.source.archiveCreatedBeforeInference=false;},
    v=>{v.source.commit=JSON.parse(f.files.templateBytes).sourceCommit;},v=>{v.source.archiveSha256=JSON.parse(f.files.templateBytes).runtime.sourceArchiveSha256;},
    v=>{v.candidates=[];},v=>{v.roles={};},v=>{v.suites={};},v=>{delete v.evidence.telemetry;}];
  for(const mutate of cases){const value=copy(f.value);mutate(value);assert.throws(()=>derive(f,value));}
}finally{await f.close();}});

test('rejects authority, evidence, reasoning and hardware-plan drift',async()=>{const f=await fixture();try{
  for(const [field,bytes] of [['templateBytes',Buffer.concat([f.files.templateBytes,Buffer.from(' ')])],['criteriaBytes',Buffer.concat([f.files.criteriaBytes,Buffer.from('x')])],
    ['readinessBytes',Buffer.from('{}')],['effectiveReasoningBytes',Buffer.from('{}')],['telemetryBytes',Buffer.from('{}')]])assert.throws(()=>derive(f,f.value,{[field]:bytes}));
  const readiness=JSON.parse(f.files.readinessBytes);readiness.createdBeforeScoredInference=false;const changedReadiness=Buffer.from(JSON.stringify(readiness));
  let value=copy(f.value);value.evidence.readiness.sha256=sha256(changedReadiness);assert.throws(()=>derive(f,value,{readinessBytes:changedReadiness}),/readiness/u);
  const variants=[v=>{v.createdBeforeLoads=false;},v=>{v.maximumConcurrentPrimaries=2;},v=>{v.policy.powerWatts=260;},v=>{v.candidates.pop();},
    v=>{v.candidates[0].artifact.sha256='0'.repeat(64);},v=>{v.candidates[0].requestReasoningEffort=null;},v=>{v.auxiliary.artifact.sha256='0'.repeat(64);},
    v=>{v.existingReranker.changed=true;}];
  for(const mutate of variants){const telemetry=JSON.parse(f.files.telemetryBytes);mutate(telemetry);const bytes=Buffer.from(JSON.stringify(telemetry));value=copy(f.value);
    value.evidence.telemetry.sha256=sha256(bytes);assert.throws(()=>derive(f,value,{telemetryBytes:bytes}),/telemetry/u);}
}finally{await f.close();}});

test('actual file publication refuses archive, lock and evidence hash drift before creating output',async()=>{const f=await fixture();try{
  const outputDirectory=path.join(f.root,'output');await mkdir(outputDirectory);const output=path.join(outputDirectory,'runtime-seal.json');await writeFile(f.archivePath,'changed');
  await assert.rejects(createR5RuntimeSeal({manifestPath:f.manifestPath,outputPath:output}),/source-archive-drift/u);
  await writeFile(f.archivePath,f.archiveBytes);await writeFile(f.packageLockPath,'changed');await assert.rejects(createR5RuntimeSeal({manifestPath:f.manifestPath,outputPath:output}),/package-lock-drift/u);
  await writeFile(f.packageLockPath,f.lockBytes);await writeFile(f.evidence.readinessPath,'{}');await assert.rejects(createR5RuntimeSeal({manifestPath:f.manifestPath,outputPath:output}),/evidence-drift/u);
  await assert.rejects(readFile(output));await assert.rejects(readFile(output+'.pending'));
}finally{await f.close();}});

test('a foreign pending publication is retained and cannot become or erase a seal',async()=>{const f=await fixture();try{
  const outputDirectory=path.join(f.root,'output');await mkdir(outputDirectory);const output=path.join(outputDirectory,'runtime-seal.json'),pending=output+'.pending';
  await writeFile(pending,'foreign-publication');await assert.rejects(createR5RuntimeSeal({manifestPath:f.manifestPath,outputPath:output}),/output-exists/u);
  assert.equal((await readFile(pending,'utf8')),'foreign-publication');await assert.rejects(readFile(output));
}finally{await f.close();}});
