import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {startSyntheticPostgres} from '../synthetic-postgres.mjs';

// Fixed model/executor doubles with real disposable PostgreSQL and LangGraph. No native
// model, production store, arbitrary test selection, or externally supplied database URL.
const repo=path.resolve(import.meta.dirname,'../../..');
const parent=path.join(repo,'artifacts','runs');mkdirSync(parent,{recursive:true});
const evidence=mkdtempSync(path.join(parent,'m1-task-regression-'));
const tests=['contracts.test.mjs','postgres.test.mjs','orchestrator.test.mjs','pending-authority.test.mjs']
  .map(file=>'gate7f/function-first/tasks/'+file);
const hash=value=>createHash('sha256').update(value).digest('hex');
const sources=['gate7f/function-first/planner.mjs','gate7f/function-first/planner-progress.mjs',
  'gate7f/function-first/tasks/orchestrator.mjs','gate7f/function-first/tasks/service.mjs',...tests];
const before=Object.fromEntries(sources.map(file=>[file,hash(readFileSync(path.join(repo,file)))]));
const database=await startSyntheticPostgres({toolRoot:process.env.RUNALAB_TOOL_ROOT??'D:/Projects/Runalab/artifacts/tools',
  artifactRoot:evidence});
let result,cleanup;
try{
  result=spawnSync(process.execPath,['--test',...tests],{cwd:repo,encoding:'utf8',windowsHide:true,
    env:{...process.env,M1_TASK_PG_URL:database.connectionString},timeout:180_000,maxBuffer:8_000_000});
  writeFileSync(path.join(evidence,'tests.tap'),result.stdout??'',{flag:'wx'});
  writeFileSync(path.join(evidence,'tests.stderr.txt'),result.stderr??'',{flag:'wx'});
}finally{cleanup=await database.stop();}
const count=field=>Number(new RegExp('^# '+field+' ([0-9]+)$','m').exec(result.stdout??'')?.[1]??NaN);
const counts=Object.fromEntries(['tests','pass','fail','skipped','cancelled'].map(field=>[field,count(field)]));
const sourceUnchanged=sources.every(file=>hash(readFileSync(path.join(repo,file)))===before[file]);
const report={schemaVersion:'runaai-m1-task-regression/v1',recordedAt:new Date().toISOString(),counts,
  passed:result.status===0&&!result.error&&counts.tests>0&&counts.pass===counts.tests&&counts.skipped===0
    &&counts.cancelled===0&&sourceUnchanged,exitCode:result.status,sourceUnchanged,sourceSha256:before,
  stdoutSha256:hash(result.stdout??''),stderrSha256:hash(result.stderr??''),cleanup,
  realPostgres:true,model:'deterministic-fixture',executor:'deterministic-fixture-not-native-execution',
  evidenceDirectory:evidence,productionChanged:false};
writeFileSync(path.join(evidence,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
