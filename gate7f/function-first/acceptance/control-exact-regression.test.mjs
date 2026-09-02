import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import net from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import {CASE_BUNDLE_SHA256} from './cases.mjs';
import {QDRANT_PIN} from './runner-contract.mjs';
import {captureBoundedStream,CONTROL_REGRESSION_FIXED,controlRegressionEnvironment,executeAllTests,parseControlRegressionArguments,parseTapSummary,
  runVerifiedControlRegression,validateControlRegressionManifest,verifyControlRegressionCleanup} from './control-exact-regression.mjs';
import {ownerSafeEnvironment,ownerSafeEnvironmentForRoot,runBoundedOwnerChild} from './control-exact-regression-owner.mjs';
import {parseOwnerEntryArguments,purgeToOwnerEntryEnvironment} from './control-exact-regression-entry.mjs';
import {buildInvocation,parseInvocationArguments} from './build-control-exact-regression-invocation.mjs';
import {shouldRetryNativePreflight} from './owned-control-resources.mjs';
import {buildOwnedRuntime,validateOwnedRuntime} from './owned-runtime-stage.mjs';
import {buildArtifactManifest} from '../../../gate6b/artifact.mjs';
const {parse:parseBootstrap,verifyArchive:verifyBootstrapArchive,verifyRelease:verifyBootstrapRelease}=createRequire(import.meta.url)('./control-exact-regression-bootstrap.cjs');

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
  assert.deepEqual(ownerSafeEnvironment({SystemRoot:'C:\\Windows',SystemDrive:'Z:',OS:'foreign',TEMP:'C:\\Temp',NODE_OPTIONS:'--require foreign.js',providerSecret:'private'}),
    {SystemRoot:'C:\\Windows',SystemDrive:'C:',OS:'Windows_NT',TEMP:'C:\\Temp'});
  const root='C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-'+('a'.repeat(32));
  assert.deepEqual(ownerSafeEnvironmentForRoot(root,{SystemRoot:'C:\\Windows',LOCALAPPDATA:'C:\\Users\\Matthew\\AppData\\Local',
    USERPROFILE:'C:\\Users\\Matthew',providerSecret:'private'}),
  {SystemRoot:'C:\\Windows',SystemDrive:'C:',OS:'Windows_NT',LOCALAPPDATA:path.join(root,'transient')});
});

test('test environment exposes only owned endpoints and safe process keys, never inherited credentials or providers',()=>{
  const root='C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-'+('a'.repeat(32)),owned=resources(root);
  const env=controlRegressionEnvironment({SystemRoot:'C:\\Windows',SystemDrive:'Z:',OS:'foreign',PATH:'safe',LOCALAPPDATA:'C:\\Users\\Matthew\\AppData\\Local',
    OPENAI_API_KEY:'secret',HOME:'private',M1_TASK_PG_URL:'production',
    RUNAAI_PROVIDER_URL:'http://production'},owned,root);
  assert.equal(env.SystemRoot,'C:\\Windows');assert.equal(env.SystemDrive,'C:');assert.equal(env.OS,'Windows_NT');
  assert.equal(env.M1_TASK_PG_URL,'postgresql://m1_synthetic@127.0.0.1:41001/postgres');
  assert.equal(env.M1_QDRANT_BINARY,path.join(root,'tools/qdrant/bin/qdrant.exe'));assert.equal(env.TEMP,owned.dataDirectory);
  assert.equal(env.LOCALAPPDATA,owned.workerResources.native.temporaryRoot);
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

test('owned resources use only the compact prebuilt runtime retained beneath the exact stage',()=>{
  const source=requireText(path.join(import.meta.dirname,'owned-control-resources.mjs'));
  assert.match(source,/runtimeRoot = path\.join\(root, "sandbox-runtime"\)/u);
  assert.match(source,/nodeExecutable = path\.join\(root, "runtime", "node\.exe"\)/u);
  assert.match(source,/new MxcJavascriptExecutor\(\{ runtimeRoot, runnerPath, nodeExecutable, temporaryRoot: transient \}\)/u);
  assert.match(source,/validateOwnedRuntime/u);assert.doesNotMatch(source,/copyFile|stageSandboxRuntime/u);
  assert.match(source,/\["disposable-postgres", "transient", "q", "data"\]/u);
});

test('owned runtime is created once, fully manifested and rejects changed or additional files',async()=>{const f=await fixture();try{
  const sourceCommit='a'.repeat(40),sourceArchiveSha256='b'.repeat(64),release=path.join(f.root,'release');
  await mkdir(path.join(release,'runtime'),{recursive:true});await writeFile(path.join(release,'runtime/node.exe'),'pinned-node');
  await mkdir(path.join(f.root,'gate7e'),{recursive:true});
  const quickjs=Buffer.from('export const pinned=true;\n');await writeFile(path.join(f.root,'gate7e/quickjs-child.mjs'),quickjs);
  for(const name of ['quickjs-emscripten','quickjs-emscripten-core','@jitl']){
    const directory=path.join(release,'node_modules',name);await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'fixture.js'),`export default ${JSON.stringify(name)};\n`);
  }
  const artifact=await buildArtifactManifest(release);await writeFile(path.join(release,'artifact-files.json'),`${JSON.stringify(artifact)}\n`);
  const sourceTree=Buffer.from(`${JSON.stringify({entries:[{path:'gate7e/quickjs-child.mjs',bytes:quickjs.length,sha256:actualSha(quickjs)}]})}\n`);
  await writeFile(path.join(f.root,'SOURCE-TREE-MANIFEST.json'),sourceTree);
  const binding={root:f.root,releaseRoot:release,sourceCommit,sourceArchiveSha256,
    expectedDependencyArtifactDigest:artifact.artifactDigest,expectedSourceTreeManifestSha256:actualSha(sourceTree),
    expectedNodeSha256:actualSha(Buffer.from('pinned-node'))};
  const built=await buildOwnedRuntime(binding);
  assert.equal(built.runtimeFiles,5);assert.match(built.manifestSha256,/^[a-f0-9]{64}$/u);
  await validateOwnedRuntime({root:f.root,expectedManifestSha256:built.manifestSha256,expectedSourceCommit:sourceCommit,
    expectedSourceArchiveSha256:sourceArchiveSha256,expectedNodeSha256:built.nodeSha256,releaseRoot:release,
    expectedDependencyArtifactDigest:artifact.artifactDigest,expectedSourceTreeManifestSha256:actualSha(sourceTree)});
  const nodeCopy=path.join(f.root,'runtime/node.exe');await writeFile(nodeCopy,'changed-node');
  await assert.rejects(validateOwnedRuntime({root:f.root,expectedManifestSha256:built.manifestSha256,expectedSourceCommit:sourceCommit,
    expectedSourceArchiveSha256:sourceArchiveSha256,expectedNodeSha256:built.nodeSha256,releaseRoot:release,
    expectedDependencyArtifactDigest:artifact.artifactDigest,expectedSourceTreeManifestSha256:actualSha(sourceTree)}),{code:'owned-runtime-file-pin'});
  await writeFile(nodeCopy,'pinned-node');await writeFile(path.join(f.root,'sandbox-runtime/extra.js'),'extra');
  await assert.rejects(validateOwnedRuntime({root:f.root,expectedManifestSha256:built.manifestSha256,expectedSourceCommit:sourceCommit,
    expectedSourceArchiveSha256:sourceArchiveSha256,expectedNodeSha256:built.nodeSha256,releaseRoot:release,
    expectedDependencyArtifactDigest:artifact.artifactDigest,expectedSourceTreeManifestSha256:actualSha(sourceTree)}),{code:'owned-runtime-exact-set'});
}finally{await f.close();}});

test('owned runtime rejects a substituted dependency before creating its trusted manifest',async()=>{const f=await fixture();try{
  const release=path.join(f.root,'release');await mkdir(path.join(release,'runtime'),{recursive:true});
  const node=Buffer.from('node');await writeFile(path.join(release,'runtime/node.exe'),node);
  await mkdir(path.join(f.root,'gate7e'),{recursive:true});const runner=Buffer.from('runner');await writeFile(path.join(f.root,'gate7e/quickjs-child.mjs'),runner);
  for(const name of ['quickjs-emscripten','quickjs-emscripten-core','@jitl']){const directory=path.join(release,'node_modules',name);await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'fixture.js'),'original');}
  const artifact=await buildArtifactManifest(release);await writeFile(path.join(release,'artifact-files.json'),`${JSON.stringify(artifact)}\n`);
  const sourceTree=Buffer.from(`${JSON.stringify({entries:[{path:'gate7e/quickjs-child.mjs',bytes:runner.length,sha256:actualSha(runner)}]})}\n`);
  await writeFile(path.join(f.root,'SOURCE-TREE-MANIFEST.json'),sourceTree);
  await writeFile(path.join(release,'node_modules/quickjs-emscripten/fixture.js'),'substitute');
  await assert.rejects(buildOwnedRuntime({root:f.root,releaseRoot:release,sourceCommit:'a'.repeat(40),sourceArchiveSha256:'b'.repeat(64),
    expectedDependencyArtifactDigest:artifact.artifactDigest,expectedSourceTreeManifestSha256:actualSha(sourceTree),expectedNodeSha256:actualSha(node)}),
  {code:'owned-runtime-source-file-pin'});
  await assert.rejects(lstat(path.join(f.root,'OWNED-RUNTIME-MANIFEST.json')),{code:'ENOENT'});
}finally{await f.close();}});

test('R15 Control wrapper locks every manifested runtime file before launching application code',()=>{
  const validator=requireText(path.resolve(import.meta.dirname,'../../../artifacts/Validate-ControlR15Stage.Remote.ps1'));
  const finalizer=requireText(path.resolve(import.meta.dirname,'../../../artifacts/Finalize-ControlR15SourceStage.ps1'));
  assert.match(validator,/foreach\(\$entry in @\(\$runtimeManifest\.entries\)\)\{\$lockSpecs\.Add/u);
  assert.match(validator,/@\(\$manifest\.entries\)\.Count-ne2440/u);
  assert.match(finalizer,/\$validation\.verifiedSourceFiles-ne2440/u);
  assert.match(validator,/\$relative-ceq'transient'/u);
  assert.match(validator,/@\('acceptance-evidence','disposable-postgres','transient','q','data'\)/u);
  assert.match(validator,/Remove-Item -LiteralPath \$postgresLog -Force[\s\S]*?Assert-ExactStageSet/u);
  assert.match(validator,/\[IO\.FileShare\]::Read/u);assert.match(validator,/r15-stage-runtime-exact-set/u);
  assert.match(validator,/\$watchSpecs=@\(\[pscustomobject\]@\{Path=\$root;Recursive=\$false\}\)/u);
  assert.match(validator,/foreach\(\$entry in @\(\$manifest\.entries\)\)[\s\S]*?\$protectedTopLevels\.Add/u);
  assert.match(validator,/@\('acceptance-evidence','disposable-postgres','transient','q','data','node_modules'\)/u);
  assert.match(validator,/foreach\(\$watcher in \$watchers\)\{\$watcher\.EnableRaisingEvents=\$false\}[\s\S]*?do\{[\s\S]*?Get-Event[\s\S]*?\}while\(\$batch\.Count-ne0\)/u);
  assert.match(validator,/GetException\(\)/u);assert.match(validator,/\$exception\.GetType\(\)\.FullName/u);
  assert.doesNotMatch(validator,/New-Object IO\.FileSystemWatcher\(\$root\)[\s\S]*?IncludeSubdirectories=\$true/u);
  assert.ok(validator.indexOf("$stream=New-Object IO.FileStream($spec.Key")<validator.indexOf("& $node $entry --mode controls"));
  const mutation=/function Test-AllowedExecutionMutation[\s\S]*?Assert-ExactStageSet/u.exec(validator)?.[0];assert.ok(mutation);
  assert.doesNotMatch(mutation,/['"]runtime['"]|['"]sandbox-runtime['"]/u);
  assert.match(finalizer,/runaai-m1-r15-source-stage-finalization\/v3/u);
  assert.match(finalizer,/runtimeManifestSha256=\$validation\.runtimeManifestSha256/u);
});

test('native preflight retries once only for an empty system-stamped start failure',()=>{
  const receipt={status:'unavailable',errorCode:'sandbox-start-failed',exitCode:1,systemStamped:true,
    output:{stdout:'',stderr:'',combinedBytes:0,partialDelivered:false},effects:[]};
  const startupObservation={schemaVersion:'runa2-sandbox-startup-observation/v1',processStarted:true,exitCode:1,
    rawStdoutBytes:0,rawStderrBytes:0,resultMarkerCount:0,classifiedErrorCode:'sandbox-start-failed',privateValuesIncluded:false};
  assert.equal(shouldRetryNativePreflight({ready:false,receipt,startupObservation},0),true);
  assert.equal(shouldRetryNativePreflight({ready:false,receipt,startupObservation},1),false);
  const changes=[value=>{value.ready=true;},value=>{value.receipt.status='failed';},value=>{value.receipt.errorCode='sandbox-timeout';},
    value=>{value.receipt.exitCode=0;},value=>{value.receipt.systemStamped=false;},value=>{value.receipt.output.stdout='partial';},
    value=>{value.receipt.output.stderr='diagnostic';},value=>{value.receipt.output.combinedBytes=1;},
    value=>{value.receipt.output.partialDelivered=true;},value=>{value.receipt.effects=[{type:'unexpected'}];},
    value=>{value.startupObservation=null;},value=>{value.startupObservation.processStarted=false;},
    value=>{value.startupObservation.exitCode=0;},value=>{value.startupObservation.rawStdoutBytes=1;},
    value=>{value.startupObservation.rawStderrBytes=1;},value=>{value.startupObservation.resultMarkerCount=1;},
    value=>{value.startupObservation.classifiedErrorCode='sandbox-start-filesystem-lstat-denied';},
    value=>{value.startupObservation.privateValuesIncluded=true;}];
  for(const change of changes){const value={ready:false,receipt:structuredClone(receipt),startupObservation:structuredClone(startupObservation)};
    change(value);assert.equal(shouldRetryNativePreflight(value,0),false);}
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

test('cleanup proof requires mutable resources absent, sealed runtime retained and every recorded port closed',async()=>{const f=await fixture();const server=net.createServer();try{
  for(const name of ['disposable-postgres','runtime','sandbox-runtime','transient','q','data'])await mkdir(path.join(f.root,name));
  await writeFile(path.join(f.root,'OWNED-RUNTIME-MANIFEST.json'),'{}\n');
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));const port=server.address().port;
  const before=await verifyControlRegressionCleanup(f.root,{postgres:port});assert.equal(before.passed,false);
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  for(const name of ['disposable-postgres','transient','q','data'])await rm(path.join(f.root,name),{recursive:true});
  const after=await verifyControlRegressionCleanup(f.root,{postgres:port});assert.equal(after.passed,true);assert.deepEqual(after.retainedRuntime,{runtime:true,'sandbox-runtime':true,manifest:true});
}finally{if(server.listening)await new Promise(resolve=>server.close(resolve));await f.close();}});

test('externally pinned dispatcher uses argument transport and one finite owner-session wait',()=>{
  const filename=path.join(import.meta.dirname,'Invoke-ControlExactRegression.ps1'),dispatcher=requireText(filename);
  const entry=requireText(path.join(import.meta.dirname,'control-exact-regression-entry.mjs'));
  const supervisor=requireText(path.join(import.meta.dirname,'control-exact-regression-owner.mjs'));
  const command=`[void][scriptblock]::Create([IO.File]::ReadAllText('${filename.replaceAll("'","''")}'))`;
  const parsed=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,encoding:'utf8',timeout:10000});
  assert.equal(parsed.status,0,parsed.stderr);assert.match(dispatcher,/control-exact-regression-bootstrap\.cjs/u);assert.match(dispatcher,/EnvironmentVariables\.Clear\(\)/u);
  assert.match(dispatcher,/Convert\]::ToBase64String/u);assert.match(dispatcher,/process\.argv\[1\]/u);assert.match(dispatcher,/RedirectStandardInput=\$true/u);assert.match(dispatcher,/StandardInput\.Close\(\)/u);assert.match(dispatcher,/\[Environment\]::Exit\(\$terminal\)/u);
  assert.doesNotMatch(dispatcher,/Start-Process|\.HasExited|ReadToEnd|StandardInput\.BaseStream\.Write|WaitForExit\(\)/u);assert.match(dispatcher,/WaitForExit\(1095000\)/u);assert.match(dispatcher,/\$terminal=\$child\.ExitCode/u);assert.match(dispatcher,/WaitForExit\(10000\)/u);
  assert.match(dispatcher,/GetEnvironmentVariables\('Process'\)/u);assert.doesNotMatch(dispatcher,/\bGet-FileHash\b|\bTest-Path\b|\bConvertTo-Json\b|\bJoin-Path\b|\bNew-Object\b/u);
  assert.match(dispatcher,/maximumMs=1080000/u);assert.match(dispatcher,/m1-control-bootstrap-watchdog-timeout/u);assert.match(dispatcher,/spawnSync\(taskkill/u);assert.match(dispatcher,/timeout:10000/u);
  assert.match(dispatcher,/CONTROL-BOOTSTRAP-WATCHDOG\.jsonl/u);assert.match(dispatcher,/CONTROL-BOOTSTRAP-STDOUT\.txt/u);assert.match(dispatcher,/CONTROL-BOOTSTRAP-STDERR\.txt/u);assert.match(dispatcher,/openSync\([^\n]+,'wx'\)/u);
  assert.ok(dispatcher.indexOf('watchdog-intent/v1')<dispatcher.indexOf("child=spawn(process.execPath"));const initialIndex=dispatcher.indexOf('const initial=');assert.ok(dispatcher.indexOf('if(!write(initial))',initialIndex)<dispatcher.indexOf('process.stdout.write',initialIndex));
  assert.match(dispatcher,/child\.stdout\.destroy\(\)/u);assert.match(dispatcher,/child\.stderr\.destroy\(\)/u);assert.match(dispatcher,/child\.unref\(\)/u);assert.match(dispatcher,/process\.stdout\.on\('error'/u);assert.match(dispatcher,/stream\.on\('error'/u);
  assert.match(dispatcher,/if\(!settled\)timer=setTimeout/u);
  const watchdog=/\$watchdogSource=@'\r?\n([\s\S]*?)\r?\n'@/u.exec(dispatcher)?.[1],bootstrap=requireText(path.join(import.meta.dirname,'control-exact-regression-bootstrap.cjs'));
  assert.ok(watchdog);const estimatedCommand=160+Buffer.byteLength(watchdog,'utf8')*4/3+Buffer.byteLength(bootstrap,'utf8')*4/3+1024;
  assert.ok(estimatedCommand<24576,`Node command length ${estimatedCommand} lost the 25% Windows margin`);
  const target={FOREIGN_SECRET:'no',SystemRoot:'wrong'};const safe=purgeToOwnerEntryEnvironment({SystemRoot:'C:\\foreign',TEMP:'C:\\foreign',FOREIGN_SECRET:'no'},target);
  assert.equal(target.FOREIGN_SECRET,undefined);assert.equal(target.SystemRoot,'C:\\Windows');assert.equal(safe.TEMP,undefined);assert.equal(safe.ComSpec,'C:\\Windows\\System32\\cmd.exe');
  assert.throws(()=>parseOwnerEntryArguments(['--owned-root','C:\\bad root','--manifest','x','--manifest-sha256',hash('a')]),/entry-arguments/u);
  assert.match(entry,/purgeToOwnerEntryEnvironment\(\);validateOwnerEntry\(parsed\);/u);assert.match(entry,/await import\('\.\/control-exact-regression-owner\.mjs'\)/u);
  assert.ok(entry.indexOf('purgeToOwnerEntryEnvironment();')<entry.indexOf("await import('./control-exact-regression-owner.mjs')"));
  assert.match(entry,/FIXED_NODE_SHA256/u);assert.match(entry,/whoami\.exe/u);assert.match(entry,/realpathSync\(executable\)/u);
  assert.doesNotMatch(entry+supervisor,/OPENAI|LMSTUDIO|RUNAAI_PROVIDER|M1_TASK_PG_URL/u);
  assert.match(supervisor,/1_020_000/u);assert.match(supervisor,/taskkill\.exe/u);assert.match(supervisor,/stdio:\['ignore','pipe','pipe'\]/u);
  assert.match(supervisor,/LOCALAPPDATA:path\.join\(path\.resolve\(root\),'transient'\)/u);
  assert.doesNotMatch(supervisor,/Users\\\\Matthew|process\.env\.LOCALAPPDATA/u);
  assert.doesNotMatch(entry+supervisor,/\bssh\b|Invoke-Expression|Start-Service|Stop-Service|\/v1\/chat\/completions|--test-name-pattern/u);
});

test('outer watchdog stops its child and terminates promptly when the started journal append fails',async()=>{const f=await fixture();try{
  const dispatcher=requireText(path.join(import.meta.dirname,'Invoke-ControlExactRegression.ps1')),match=/\$watchdogSource=@'\r?\n([\s\S]*?)\r?\n'@/u.exec(dispatcher);assert.ok(match);
  let watchdog=match[1].replace('maximumMs=1080000','maximumMs=1000').replace("||!/^C:\\\\AI\\\\RunaAI-Next-Candidate\\\\staging\\\\m1-task-native-[a-f0-9]{32}$/.test(root)",'||false');
  assert.match(watchdog,/\|\|false/u);watchdog=watchdog.replace('const write=value=>{try{','let syntheticWrites=0;const write=value=>{try{if(++syntheticWrites===2)throw Error(\'synthetic-write\');');
  const loader="globalThis.__RUNA_CONTROL_BOOTSTRAP__=true;eval(Buffer.from(process.argv[1],'base64').toString('utf8'))",bootstrap="setInterval(()=>{},1000)";
  const result=spawnSync(process.execPath,['-e',loader,Buffer.from(watchdog).toString('base64'),Buffer.from(bootstrap).toString('base64'),'--owned-root',f.root],{encoding:'utf8',windowsHide:true,timeout:5000,env:process.env});
  assert.ok([124,125].includes(result.status),result.stderr);const receipt=result.stdout.split(/\r?\n/u).filter(Boolean).map(line=>JSON.parse(line)).find(item=>item.schemaVersion==='runaai-m1-control-bootstrap-watchdog/v1');
  assert.ok(receipt?.childProcessId>0);assert.throws(()=>process.kill(receipt.childProcessId,0));
}finally{await f.close();}});

function bootstrapTar(entries){const chunks=[];for(const[name,content,type='0']of entries){const bytes=Buffer.from(content),header=Buffer.alloc(512);
  header.write(name);header.write('0000644\0',100);header.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);header[156]=type.charCodeAt(0);
  chunks.push(header,bytes,Buffer.alloc((512-bytes.length%512)%512));}return Buffer.concat([...chunks,Buffer.alloc(1024)]);}
const actualSha=value=>createHash('sha256').update(value).digest('hex');
test('argument bootstrap is actually invoked and verifies every extracted source byte before importing repository code',async()=>{const f=await fixture();try{
  const archive=bootstrapTar([['file.mjs','export const value=1;\n']]),archivePath=path.join(f.root,'source.tar');
  await writeFile(archivePath,archive);await writeFile(path.join(f.root,'file.mjs'),'export const value=1;\n');
  assert.equal(verifyBootstrapArchive(f.root,archivePath,actualSha(archive)),1);
  await writeFile(path.join(f.root,'file.mjs'),'export const value=2;\n');assert.throws(()=>verifyBootstrapArchive(f.root,archivePath,actualSha(archive)),/source-drift/u);
  const source=requireText(path.join(import.meta.dirname,'control-exact-regression-bootstrap.cjs'));
  assert.ok(source.indexOf('verifyArchive(root,archivePath')<source.indexOf('await import(pathToFileURL(entry).href)'));
  assert.ok(source.indexOf('verifyRelease(fixedRelease,fixedArtifact)')<source.indexOf('await import(pathToFileURL(entry).href)'));
  assert.throws(()=>parseBootstrap(['--owned-root','C:\\safe&bad']),/bootstrap-arguments/u);
  const loader="globalThis.__RUNA_CONTROL_BOOTSTRAP__=true;eval(Buffer.from(process.argv[1],'base64').toString('utf8'))",invoked=spawnSync(process.execPath,['-e',loader,Buffer.from(source).toString('base64')],{encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(invoked.status,1);assert.match(invoked.stdout,/m1-control-bootstrap-arguments/u);
}finally{await f.close();}});

test('bootstrap verifies the complete dependency artifact and rejects drift before repository import',async()=>{const f=await fixture();try{
  await mkdir(path.join(f.root,'node_modules'));const one=Buffer.from('one\n'),two=Buffer.from('two\n');await writeFile(path.join(f.root,'runtime.bin'),one);await writeFile(path.join(f.root,'node_modules','package.json'),two);
  const entries=[{path:'node_modules/package.json',size:two.length,sha256:actualSha(two)},{path:'runtime.bin',size:one.length,sha256:actualSha(one)}];
  const canonical=value=>{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value).sort())out[key]=canonical(value[key]);return out;}return value;};
  const base={schemaVersion:'runa2-gate6b-artifact/v1',entries},artifactDigest=actualSha(JSON.stringify(canonical(base)));
  await writeFile(path.join(f.root,'artifact-files.json'),JSON.stringify({...base,artifactDigest}));assert.equal(verifyBootstrapRelease(f.root,artifactDigest).fileCount,2);
  await writeFile(path.join(f.root,'runtime.bin'),'changed\n');assert.throws(()=>verifyBootstrapRelease(f.root,artifactDigest),/artifact-drift/u);
}finally{await f.close();}});

test('trusted invocation preloader hashes dispatcher bytes before parsing the same bytes',async()=>{const f=await fixture();try{
  const dispatcher=Buffer.from("[Console]::Out.WriteLine('verified')\n"),dispatcherPath=path.join(f.root,'dispatcher.ps1');await writeFile(dispatcherPath,dispatcher);
  const raw=['--owned-root','C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-'+('a'.repeat(32)),'--manifest-sha256',hash('1'),'--dispatcher-sha256',actualSha(dispatcher),
    '--bootstrap-sha256',hash('2'),'--identity-sha256',hash('3'),'--archive-sha256',hash('4'),'--source-commit','5'.repeat(40)];
  const result=buildInvocation(parseInvocationArguments(raw),{dispatcherPath}),source=Buffer.from(result.encodedCommand,'base64').toString('utf16le');
  assert.ok(source.indexOf('ComputeHash($bytes)')<source.indexOf('[ScriptBlock]::Create($body)'));assert.match(source,/UTF8Encoding\]::new\(\$false,\$true\)/u);
  assert.match(source,/\{throw 'm1-control-preloader-dispatcher-pin'\}/u);assert.doesNotMatch(source,/throw'm1-control-preloader/u);
  assert.doesNotMatch(source,/New-Object|Get-FileHash|Test-Path|ConvertTo-Json/u);
  await writeFile(dispatcherPath,'changed');assert.throws(()=>buildInvocation(parseInvocationArguments(raw),{dispatcherPath}),/dispatcher-pin/u);
}finally{await f.close();}});

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

test('owner supervisor has a finite terminal when tree stop and pipe close are unconfirmed',async()=>{
  const script=`const{spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','inherit','inherit']});console.log(c.pid);setInterval(()=>{},1000)`;
  const started=Date.now(),result=await runBoundedOwnerChild({file:process.execPath,args:['-e',script],cwd:process.cwd(),environment:ownerSafeEnvironment(),maximumMs:200,postStopMs:300,
    stopTree:()=>{throw Error('synthetic-unconfirmed-stop');},fallbackKill:()=>{throw Error('synthetic-unconfirmed-fallback');}});
  assert.equal(result.passed,false);assert.equal(result.errorCode,'m1-control-regression-owner-terminal-unconfirmed');assert.ok(Date.now()-started<3000);
  assert.ok(result.childProcessId>0);assert.equal(result.stopAttempted,true);assert.equal(result.postStopExceeded,true);assert.equal(result.stopProof,null);
  const descendant=Number(result.stdout.trim());assert.ok(Number.isSafeInteger(descendant)&&descendant>0);stopWindowsTreeForTest(descendant);
});

function stopWindowsTreeForTest(processId){const executable=path.join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe');
  const stopped=spawnSync(executable,['/PID',String(processId),'/T','/F'],{windowsHide:true,encoding:'utf8',timeout:10000});assert.equal(stopped.status,0,stopped.stderr);}

function requireText(filename){return spawnSync(process.execPath,['-e',`process.stdout.write(require('fs').readFileSync(${JSON.stringify(filename)},'utf8'))`],
  {encoding:'utf8',windowsHide:true,timeout:10000}).stdout;}
