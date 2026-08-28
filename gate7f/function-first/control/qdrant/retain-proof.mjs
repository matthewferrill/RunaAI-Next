import {readFileSync,readdirSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha,SOURCE_FILES} from './contract.mjs';
const root=path.resolve(import.meta.dirname,'../../../..');
const destination=path.join(import.meta.dirname,'evidence/20260828-control-lifecycle-r2');
assert.equal(existsSync(destination),false,'evidence already exists');
const source=n=>path.join(root,'artifacts/m1-readiness',n);
const stage='m1-qdrant-proof-20260828-';
function receipts(revision){return readdirSync(source(stage+revision+'-evidence')).filter(n=>/^[A-Za-z]+-[a-f0-9]{32}\.json$/.test(n)).map(n=>({name:n,bytes:readFileSync(path.join(source(stage+revision+'-evidence'),n))})).map(v=>({...v,record:JSON.parse(v.bytes)}));}
const r1=receipts('r1'),r2=receipts('r2');
function parsed(rows,mode){return rows.filter(r=>r.record.mode===mode).sort((a,b)=>a.record.time.localeCompare(b.record.time)).map(r=>({receipt:r.record,value:JSON.parse(r.record.output.join('\n'))}));}
const before=parsed(r1,'Preflight')[0].value,after=parsed(r2,'Final')[0].value;
assert.deepEqual(after.configurationHashes,before.configurationHashes);
assert.deepEqual(after.ports,before.ports);
assert.deepEqual(after.tasks.filter(t=>t.name!=='M1-Qdrant'),before.tasks);
assert.equal(after.head,before.head);assert.equal(after.branch,before.branch);assert.equal(after.trackedChanges,0);
assert.deepEqual(after.tasks.find(t=>t.name==='M1-Qdrant'),{enabled:false,name:'M1-Qdrant',principal:'LOCAL SERVICE',state:'Disabled'});
assert.ok(r2.every(r=>r.record.exitCode===0));
assert.equal(r1.find(r=>r.record.mode==='Probe').record.exitCode,1);
const initial=parsed(r2,'Probe')[0].value,restarted=parsed(r2,'ReadProbe')[0].value;
assert.notEqual(initial.pid,restarted.pid);assert.notEqual(initial.runId,restarted.runId);
assert.equal(initial.syntheticReferenceRetained,true);assert.equal(restarted.syntheticReferenceRetained,true);
const runtime=parsed(r2,'InspectFailure').at(-1).value;
const runs=runtime.receipts.filter(r=>r.name.startsWith('run-'));
assert.equal(runs.length,2);for(const run of runs){assert.equal(run.value.exitCode,0);assert.equal(run.value.failure,null);}
assert.equal(parsed(r2,'Rollback').length,2);
const archive=parsed(r1,'ArchiveFailed')[0].value;assert.equal(archive.allFilesRetained,true);
mkdirSync(destination,{recursive:true});const artifacts={};
function retain(relative,bytes){const target=path.join(destination,relative);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx'});artifacts[relative]={bytes:bytes.length,sha256:sha(bytes)};}
for(const [revision,rows]of[['r1',r1],['r2',r2]]){
  for(const item of rows)retain(revision+'/receipts/'+item.name,item.bytes);
  for(const name of [...SOURCE_FILES,'qdrant.yaml','package.json'])retain(revision+'/package/'+name,readFileSync(path.join(source(stage+revision),name)));
}
retain('operator.ps1',readFileSync(path.join(import.meta.dirname,'Invoke-ControlM1QdrantProof.ps1')));
const summary={schemaVersion:'runaai-m1-qdrant-live-proof/v1',sourceCommit:'aa5deecf1c50bf54d4713784faab02333c05c590',
  packageSha256:sha(readFileSync(path.join(source(stage+'r2'),'package.json'))),observedAt:after.time,
  firstRehearsal:{passed:false,failedAfterReadiness:true,failedMutableReceiptReplacement:true,retainedPath:archive.retainedPath,packageSha256:archive.oldPackageSha256},
  correctedRehearsal:{passed:true,initialRunId:initial.runId,restartedRunId:restarted.runId,syntheticReferenceSurvivedRestart:true,cleanRunnerResults:runs.length,scopedRollbackCount:2,finalTaskDisabled:true,finalPortsFree:true},
  unchanged:{productionConfigurationHashes:after.configurationHashes,existingListenerIdentities:true,existingTaskStates:true,trackedCheckout:true},
  claims:{productionApplicationActivated:false,modelsCalled:false,protectedStoreReadOrChanged:false,gracefulDatabaseShutdownProven:false,windowsRebootTested:false},artifacts};
writeFileSync(path.join(destination,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({destination,...summary}));
