import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import net from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import {CASE_BUNDLE_SHA256} from './cases.mjs';
import {QDRANT_PIN} from './runner-contract.mjs';
import {captureBoundedStream,CONTROL_REGRESSION_FIXED,controlRegressionEnvironment,executeAllTests,parseControlRegressionArguments,parseTapSummary,
  runVerifiedControlRegression,validateControlRegressionManifest,verifyControlRegressionCleanup} from './control-exact-regression.mjs';
import {ownerSafeEnvironment,runBoundedOwnerChild} from './control-exact-regression-owner.mjs';

const hash=letter=>letter.repeat(64);
const manifest=()=>({schemaVersion:'runaai-m1-control-regression-input/v1',runId:'1'.repeat(32),source:{commit:'2'.repeat(40),archiveSha256:hash('3'),
  packageLockSha256:hash('4'),extractedFiles:1480,caseBundleSha256:CASE_BUNDLE_SHA256},dependencies:{releaseRoot:CONTROL_REGRESSION_FIXED.releaseRoot,
  artifactDigest:CONTROL_REGRESSION_FIXED.dependencyArtifactDigest,nodeVersion:CONTROL_REGRESSION_FIXED.nodeVersion,nodeSha256:CONTROL_REGRESSION_FIXED.nodeSha256},
  postgresql:{toolRoot:CONTROL_REGRESSION_FIXED.postgresRoot,version:CONTROL_REGRESSION_FIXED.postgresVersion,
    binaries:{'initdb.exe':hash('5'),'pg_ctl.exe':hash('6'),'postgres.exe':hash('7')}},qdrant:{...QDRANT_PIN},execution:{maximumMs:900000,
    allTests:true,serial:true,zeroSkips:true,modelsAllowed:false,protectedDataAllowed:false,productionChangesAllowed:false,createdBeforeExecution:true}});
const tap=({tests=2,pass=2,fail=0,cancelled=0,skipped=0,todo=0}={})=>`TAP version 13\n1..${tests}\n# tests ${tests}\n# suites 0\n# pass ${pass}\n# fail ${fail}\n# cancelled ${cancelled}\n# skipped ${skipped}\n# todo ${todo}\n`;
async function fixture(){const root=await mkdtemp(path.join(tmpdir(),'m1-control-regression-'));return {root,async close(){await rm(root,{recursive:true,force:true});}};}
function verified(root,value=manifest()){return {root,manifest:value,manifestSha256:hash('8'),nodeExecutable:process.execPath,
  dependencyProof:{artifactDigest:value.dependencies.artifactDigest,fileCount:30036},versions:{quickjs:'0.32.0',mxc:'0.8.0'},postgres:value.postgresql.binaries};}
function resources(root){return {report:{nativePreflight:{ready:true},ports:{postgres:41001,qdrantHttp:41002,qdrantGrpc:41003}},dataDirectory:path.join(root,'data'),
  workerResources:{postgresPort:41001,native:{runtimeRoot:path.join(root,'runtime'),runnerPath:path.join(root,'runtime/quickjs-child.mjs'),
    nodeExecutable:path.join(root,'runtime/node.exe'),temporaryRoot:path.join(root,'transient')}},async close(){return {stoppedOwnedPostgres:true,stoppedOwnedQdrant:true};}};}
const clean=()=>({schemaVersion:'runaai-m1-control-regression-cleanup/v1',directoriesAbsent:{},portsClosed:{},sourceAndEvidenceRetained:true,
  productionChanged:false,protectedDataRead:false,modelsInvoked:false,passed:true});

test('strict prospective manifest fixes source/runtime/roster declarations and rejects every override surface',()=>{
  assert.deepEqual(validateControlRegressionManifest(manifest()),manifest());
  const mutations=[v=>{v.extra=true;},v=>{v.source.commit='x';},v=>{v.source.extractedFiles=0;},v=>{v.source.caseBundleSha256=hash('0');},
    v=>{v.dependencies.releaseRoot='C:\\other';},v=>{v.dependencies.artifactDigest=hash('0');},v=>{v.dependencies.nodeVersion='v23.0.0';},
    v=>{v.postgresql.toolRoot='C:\\other';},v=>{v.postgresql.binaries['pg_ctl.exe']='bad';},v=>{v.qdrant.bytes++;},
    v=>{v.execution.maximumMs--;},v=>{v.execution.allTests=false;},v=>{v.execution.serial=false;},v=>{v.execution.zeroSkips=false;},
    v=>{v.execution.modelsAllowed=true;},v=>{v.execution.protectedDataAllowed=true;},v=>{v.execution.productionChangesAllowed=true;},
    v=>{v.execution.createdBeforeExecution=false;}];
  for(const mutate of mutations){const value=structuredClone(manifest());mutate(value);assert.throws(()=>validateControlRegressionManifest(value));}
});

test('TAP summary requires one complete final summary and retains skips as a failing count',()=>{
  assert.deepEqual(parseTapSummary(tap()),{tests:2,suites:0,pass:2,fail:0,cancelled:0,skipped:0,todo:0});
  assert.equal(parseTapSummary(tap({tests:2,pass:1,skipped:1})).skipped,1);
  assert.throws(()=>parseTapSummary('# tests 1\n# pass 1\n'));assert.throws(()=>parseTapSummary(tap()+tap()));
});

test('owner supervisor environment retains only safe operating-system keys',()=>{
  assert.deepEqual(ownerSafeEnvironment({SystemRoot:'C:\\Windows',TEMP:'C:\\Temp',NODE_OPTIONS:'--require foreign.js',providerSecret:'private'}),
    {SystemRoot:'C:\\Windows',TEMP:'C:\\Temp'});
});

test('test environment exposes only owned endpoints and safe process keys, never inherited credentials or providers',()=>{
  const root='C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-'+('a'.repeat(32)),owned=resources(root);
  const env=controlRegressionEnvironment({SystemRoot:'C:\\Windows',PATH:'safe',OPENAI_API_KEY:'secret',HOME:'private',M1_TASK_PG_URL:'production',
    RUNAAI_PROVIDER_URL:'http://production'},owned,root);
  assert.equal(env.SystemRoot,'C:\\Windows');assert.equal(env.M1_TASK_PG_URL,'postgresql://m1_synthetic@127.0.0.1:41001/postgres');
  assert.equal(env.M1_QDRANT_BINARY,path.join(root,'tools/qdrant/bin/qdrant.exe'));assert.equal(env.TEMP,owned.dataDirectory);
  for(const key of ['OPENAI_API_KEY','HOME','RUNAAI_PROVIDER_URL'])assert.equal(Object.hasOwn(env,key),false);
});

test('CLI accepts only the fixed owner-root, manifest and manifest hash tuple; no test selection is possible',()=>{
  const args=parseControlRegressionArguments(['--owned-root','root','--manifest','input','--manifest-sha256',hash('a')]);
  assert.deepEqual(args,{root:'root',manifestPath:'input',manifestSha256:hash('a')});
  assert.throws(()=>parseControlRegressionArguments(['--owned-root','root','--test','one.test.mjs','--manifest','input']));
  assert.throws(()=>parseControlRegressionArguments(['--owned-root','root','--owned-root','other','--manifest','input']));
});

test('verified regression writes create-only complete success and cleanup evidence',async()=>{const f=await fixture();try{
  let observed=null;const result=await runVerifiedControlRegression({verified:verified(f.root),createResources:async()=>resources(f.root),
    executeTests:async input=>{observed=input;await writeFile(path.join(input.outputDirectory,'tests.tap'),tap(),{flag:'wx'});
      await writeFile(path.join(input.outputDirectory,'tests.stderr.txt'),'',{flag:'wx'});return {exitCode:0,signal:null,deadlineExpired:false,captureError:null,
        counts:parseTapSummary(tap()),passed:true,command:['node.exe',...CONTROL_REGRESSION_FIXED.testArguments]};},probeCleanup:async()=>clean()});
  assert.equal(result.passed,true);assert.deepEqual(observed.environment.M1_TASK_PG_URL,'postgresql://m1_synthetic@127.0.0.1:41001/postgres');
  assert.deepEqual(result.test.command,['node.exe','--test','--test-concurrency=1','--test-reporter=tap']);
  const directory=path.join(f.root,result.evidenceDirectory);for(const name of ['input-proof.json','tests.tap','tests.stderr.txt','cleanup.json','result.json'])await readFile(path.join(directory,name));
  await assert.rejects(runVerifiedControlRegression({verified:verified(f.root),createResources:async()=>resources(f.root),probeCleanup:async()=>clean()}));
}finally{await f.close();}});

test('skips, partial resource failure and cleanup uncertainty are retained but never passed',async()=>{for(const mode of ['skip','resource','cleanup']){const f=await fixture();try{
  const failurePorts={postgres:41011,qdrantHttp:41012,qdrantGrpc:41013};
  const failureReport={nativePreflight:{ready:true},ports:failurePorts,productionChanged:false},observedPorts=[];
  const result=await runVerifiedControlRegression({verified:verified(f.root),createResources:async()=>{if(mode==='resource')throw Object.assign(Error('no'),{code:'resource-failed',resourceReport:failureReport});return resources(f.root);},
    executeTests:async input=>{const text=tap({tests:2,pass:1,skipped:1});await writeFile(path.join(input.outputDirectory,'tests.tap'),text,{flag:'wx'});
      await writeFile(path.join(input.outputDirectory,'tests.stderr.txt'),'retained',{flag:'wx'});return {exitCode:0,signal:null,deadlineExpired:false,captureError:null,
        counts:parseTapSummary(text),passed:false,command:['node.exe',...CONTROL_REGRESSION_FIXED.testArguments]};},
    probeCleanup:async(_root,ports)=>{observedPorts.push(ports);return mode==='cleanup'?{...clean(),passed:false}:clean();}});
  assert.equal(result.passed,false);assert.equal(result.modelsInvoked,false);assert.equal(result.productionChanged,false);assert.ok(await readFile(path.join(f.root,result.evidenceDirectory,'cleanup.json')));
  assert.ok(await readFile(path.join(f.root,result.evidenceDirectory,'result.json')));
  if(mode==='resource'){const retained=JSON.parse(await readFile(path.join(f.root,result.evidenceDirectory,'cleanup.json'),'utf8'));
    assert.deepEqual(retained.resourceReport,failureReport);assert.deepEqual(observedPorts,[failurePorts]);}
}finally{await f.close();}}});

test('owned resources record all selected ports before any PostgreSQL or Qdrant start can fail',()=>{
  const source=requireText(path.join(import.meta.dirname,'owned-control-resources.mjs'));
  const assigned=source.indexOf('report.ports = { postgres: pgPort, qdrantHttp: qPort, qdrantGrpc: qGrpcPort }');
  assert.ok(assigned>source.indexOf('new Set([pgPort, qPort, qGrpcPort])'));
  assert.ok(assigned<source.indexOf('pgBin, "initdb.exe"'));assert.ok(assigned<source.indexOf('qdrant = spawn'));
});

test('actual Node test child runs the complete discovered root serially and zero skips is mandatory',async()=>{for(const skipped of [false,true]){const f=await fixture();try{
  const output=path.join(f.root,'output');await mkdir(output);await writeFile(path.join(f.root,'one.test.mjs'),
    `import test from 'node:test';test('one'${skipped?',{skip:true}':''},()=>{});\n`);
  const {NODE_TEST_CONTEXT:ignored,...environment}=process.env;
  const result=await executeAllTests({root:f.root,nodeExecutable:process.execPath,environment,outputDirectory:output,maximumMs:30000});
  assert.equal(result.counts.tests,1);assert.equal(result.counts.skipped,skipped?1:0);assert.equal(result.passed,!skipped);
  assert.deepEqual(result.command,[path.basename(process.execPath),'--test','--test-concurrency=1','--test-reporter=tap']);
}finally{await f.close();}}});

test('whole-run timeout terminates the exact test tree without retaining a live deadline timer',async()=>{const f=await fixture();try{
  const output=path.join(f.root,'output');await mkdir(output);await writeFile(path.join(f.root,'one.test.mjs'),
    "import test from 'node:test';test('bounded',async()=>{await new Promise(resolve=>setTimeout(resolve,60000));});\n");
  const {NODE_TEST_CONTEXT:ignored,...environment}=process.env,start=Date.now();
  const result=await executeAllTests({root:f.root,nodeExecutable:process.execPath,environment,outputDirectory:output,maximumMs:250});
  assert.equal(result.passed,false);assert.equal(result.deadlineExpired,true);assert.equal(result.failureCode,'m1-control-regression-timeout');
  assert.ok(Date.now()-start<10000);assert.ok((await stat(path.join(output,'tests.tap'))).size<CONTROL_REGRESSION_FIXED.maximumLogBytes);
}finally{await f.close();}});

test('bounded capture fails before writing a chunk that crosses its byte ceiling',async()=>{const f=await fixture();try{
  const stream=new PassThrough(),filename=path.join(f.root,'bounded.log'),captured=captureBoundedStream(stream,filename,32);
  stream.end(Buffer.alloc(33,120));await assert.rejects(captured,{code:'m1-control-regression-log-cap'});
  assert.equal((await stat(filename)).size,0);
}finally{await f.close();}});

test('cleanup proof requires every owned directory absent and every recorded port closed',async()=>{const f=await fixture();const server=net.createServer();try{
  for(const name of ['disposable-postgres','runtime','sandbox-runtime','transient','q','data'])await mkdir(path.join(f.root,name));
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));const port=server.address().port;
  const before=await verifyControlRegressionCleanup(f.root,{postgres:port});assert.equal(before.passed,false);
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  for(const name of ['disposable-postgres','runtime','sandbox-runtime','transient','q','data'])await rm(path.join(f.root,name),{recursive:true});
  const after=await verifyControlRegressionCleanup(f.root,{postgres:port});assert.equal(after.passed,true);
}finally{if(server.listening)await new Promise(resolve=>server.close(resolve));await f.close();}});

test('owner PowerShell entry point parses in Windows PowerShell 5 and contains no arbitrary remote or service surface',()=>{
  const filename=path.join(import.meta.dirname,'Invoke-ControlExactRegression.ps1'),text=requireText(filename);
  const supervisor=requireText(path.join(import.meta.dirname,'control-exact-regression-owner.mjs'));
  const command=`[void][scriptblock]::Create([IO.File]::ReadAllText('${filename.replaceAll("'","''")}'))`;
  const parsed=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,encoding:'utf8',timeout:10000});
  assert.equal(parsed.status,0,parsed.stderr);assert.match(text,/RUNA-CONTROL\\Matthew/u);assert.match(text,/control-exact-regression-owner\.mjs/u);
  assert.match(text,/GetEnvironmentVariables\('Process'\)/u);assert.match(text,/SetEnvironmentVariable/u);assert.match(text,/\$safeNames/u);
  assert.match(text,/GetEnvironmentVariable\(\$name,'Process'\)/u);assert.doesNotMatch(text,/\$originalEnvironment\[\$name\]/u);
  assert.match(text,/exit \$childExitCode/u);assert.doesNotMatch(text,/throw'm1-control-regression-run-failed'/u);
  assert.doesNotMatch(text+supervisor,/OPENAI|LMSTUDIO|RUNAAI_PROVIDER|M1_TASK_PG_URL/u);
  assert.doesNotMatch(text,/ReadToEndAsync|ReadToEnd\(|ProcessStartInfo|\.Kill\(/u);
  assert.match(supervisor,/1_020_000/u);assert.match(supervisor,/taskkill\.exe/u);assert.match(supervisor,/stdio:\['ignore','pipe','pipe'\]/u);
  assert.doesNotMatch(text+supervisor,/\bssh\b|Invoke-Expression|Start-Service|Stop-Service|\/v1\/chat\/completions|--test-name-pattern/u);
});

test('actual owner supervisor concurrently drains and fails closed on oversized stdout and stderr',async()=>{
  const script=`for(let i=0;i<1024;i++){process.stdout.write('x'.repeat(1024));process.stderr.write('y'.repeat(1024))}setInterval(()=>{},1000)`;
  const result=await runBoundedOwnerChild({file:process.execPath,args:['-e',script],cwd:process.cwd(),environment:ownerSafeEnvironment(),
    maximumMs:10_000,maximumOutputBytes:65_536});
  assert.equal(result.passed,false);assert.equal(result.errorCode,'m1-control-regression-owner-output-cap');
  assert.equal(result.stdout.length,65_536);assert.equal(result.stderr.length,65_536);assert.equal(result.stopProof?.tree,true);
});

test('actual owner supervisor timeout stops its complete Windows child tree',async()=>{
  const script=`const{spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000)`;
  const result=await runBoundedOwnerChild({file:process.execPath,args:['-e',script],cwd:process.cwd(),environment:ownerSafeEnvironment(),maximumMs:1000});
  assert.equal(result.passed,false);assert.equal(result.errorCode,'m1-control-regression-owner-timeout');assert.equal(result.stopProof?.tree,true);
  const descendant=Number(result.stdout.trim());assert.ok(Number.isSafeInteger(descendant)&&descendant>0);
  await new Promise(resolve=>setTimeout(resolve,200));assert.throws(()=>process.kill(descendant,0));
});

function requireText(filename){return spawnSync(process.execPath,['-e',`process.stdout.write(require('fs').readFileSync(${JSON.stringify(filename)},'utf8'))`],
  {encoding:'utf8',windowsHide:true,timeout:10000}).stdout;}
