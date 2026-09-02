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
  const completion=requireText(path.resolve(import.meta.dirname,'../../../artifacts/Complete-ControlR15GemmaEligibilityCampaign.ps1'));
  const reviewPrepare=requireText(path.resolve(import.meta.dirname,'../../../artifacts/Prepare-ControlR15GemmaBlindReview.ps1'));
  const reviewFinalize=requireText(path.resolve(import.meta.dirname,'../../../artifacts/Finalize-ControlR15GemmaBlindReview.ps1'));
  assert.match(validator,/foreach\(\$entry in @\(\$runtimeManifest\.entries\)\)\{\$lockSpecs\.Add/u);
  assert.match(validator,/@\(\$manifest\.entries\)\.Count-ne2465/u);
  assert.match(finalizer,/\$validation\.verifiedSourceFiles-ne2465/u);
  assert.match(validator,/@\('acceptance-evidence','disposable-postgres','transient','q','data'\)/u);
  assert.match(validator,/Remove-Item -LiteralPath \$postgresLog -Force[\s\S]*?Assert-ExactStageSet/u);
  assert.match(validator,/\[IO\.FileShare\]::Read/u);assert.match(validator,/r15-stage-runtime-exact-set/u);
  assert.match(validator,/\$watchSpecs=@\(\[pscustomobject\]@\{Path=\$root;Recursive=\$false;TransientRuntimeSecurity=\$false\}\)/u);
  assert.match(validator,/foreach\(\$entry in @\(\$manifest\.entries\)\)[\s\S]*?\$protectedTopLevels\.Add/u);
  assert.match(validator,/@\('acceptance-evidence','disposable-postgres','transient','q','data','node_modules'\)/u);
  assert.match(validator,/Wait-R15WatcherQuiescence[\s\S]*?EnableRaisingEvents=\$false;\$watcher\.Dispose\(\)[\s\S]*?Wait-R15WatcherQuiescence[\s\S]*?Assert-ExactStageSet/u);
  assert.match(validator,/Get-R15RuntimeSecurityDigest[\s\S]*?\$runtimeSecurityBefore/u);
  assert.match(validator,/Invoke-R15RuntimeSecurityNormalization[\s\S]*?r15-stage-runtime-security-normalization-not-idempotent/u);
  assert.match(validator,/runtimeSecurityBeforeNormalization\.Sha256-cne\$receipt\.runtimeSecuritySha256/u);
  assert.match(validator,/Assert-R15RuntimeDurableState[\s\S]*?r15-stage-runtime-security-drift/u);
  assert.match(validator,/TransientRuntimeSecurity=\(\$name-ceq'runtime'-or\$name-ceq'sandbox-runtime'\)/u);
  assert.match(validator,/Kind='name';NotifyFilter=\[IO\.NotifyFilters\]::FileName-bor\[IO\.NotifyFilters\]::DirectoryName/u);
  assert.match(validator,/Kind='content';NotifyFilter=\[IO\.NotifyFilters\]::LastWrite-bor\[IO\.NotifyFilters\]::Size/u);
  assert.match(validator,/Kind='metadata';NotifyFilter=\$metadataFilter/u);
  assert.match(validator,/if\(-not\$spec\.TransientRuntimeSecurity\)\{\$metadataFilter=\$metadataFilter-bor\[IO\.NotifyFilters\]::Security\}/u);
  assert.match(validator,/GetException\(\)/u);assert.match(validator,/\$exception\.GetType\(\)\.FullName/u);
  assert.doesNotMatch(validator,/New-Object IO\.FileSystemWatcher\(\$root\)[\s\S]*?IncludeSubdirectories=\$true/u);
  assert.ok(validator.indexOf("$stream=New-Object IO.FileStream($spec.Key")<validator.indexOf("& $node $entry --mode controls"));
  assert.match(validator,/Test-R15AllowedExecutionMutation -Root \$root -Path \$changed -SourceIdentifier \$event\.SourceIdentifier -SealedDirectories \$sealedDirectories/u);
  assert.match(validator,/EndsWith\('-content-changed'/u);
  const mutation=/function Test-R15AllowedExecutionMutation[\s\S]*?\n\}/u.exec(validator)?.[0];assert.ok(mutation);
  assert.doesNotMatch(mutation,/foreach\(\$dynamic[^}]+runtime|foreach\(\$dynamic[^}]+sandbox-runtime/su);
  assert.match(finalizer,/runaai-m1-r15-source-stage-finalization\/v4/u);
  assert.match(finalizer,/runtimeManifestSha256=\$validation\.runtimeManifestSha256/u);
  assert.match(finalizer,/runtimeSecuritySha256=\$validation\.runtimeSecuritySha256/u);
  assert.match(validator,/ValidateSet\('Finalize','Controls','Browser','Campaign','Completion','ReviewPrepare','ReviewFinalize'\)/u);
  assert.match(validator,/if\(\$Phase-ceq'Campaign'\)[\s\S]*?prepare-r15-gemma-eligibility-arm\.mjs/u);
  assert.match(validator,/--candidate-id gemma4-26b-a4b/u);
  assert.doesNotMatch(completion,/CompletionVerifierSha256/u);
  assert.match(completion,/r15-gemma-completion-validator-pin/u);
  assert.match(completion,/-Phase Completion/u);
  assert.match(validator,/verify-r15-gemma-home-completion\.mjs/u);
  assert.match(validator,/foreach\(\$entry in @\(\$manifest\.entries\)\)\{\$lockSpecs\.Add/u);
  assert.match(validator,/prepare-r15-gemma-blind-review\.mjs/u);
  assert.match(validator,/finalize-r15-gemma-blind-review\.mjs/u);
  assert.match(reviewPrepare,/r15-gemma-review-prepare-validator-pin/u);
  assert.match(reviewPrepare,/-Phase ReviewPrepare/u);
  assert.match(reviewFinalize,/r15-gemma-review-finalize-validator-pin/u);
  assert.match(reviewFinalize,/'-Phase','ReviewFinalize'/u);
  assert.match(completion,/verify-completed-campaign-v2\.mjs/u);
  assert.match(completion,/\$status\.taskState-cne'Ready'/u);
  assert.match(completion,/\$status\.taskExit-ne0/u);
  assert.match(completion,/\$status\.result\.ambiguousLoad-ne\$null/u);
  assert.match(completion,/home-completion-verification\.json/u);
  assert.match(validator,/run-r15-gemma-eligibility-campaign\.mjs/u);
  assert.match(validator,/r15-stage-campaign-prior-arm-or-attempts/u);
  assert.doesNotMatch(validator,/--candidate-id \$CandidateId/u);
});

test('R15 execution mutation classifier ignores only sealed-directory content noise', {skip:process.platform!=='win32'}, async()=>{
  const f=await fixture();try{
    const scriptPath=path.join(f.root,'mutation-classifier-regression.ps1');
    const validator=requireText(path.resolve(import.meta.dirname,'../../../artifacts/Validate-ControlR15Stage.Remote.ps1'));
    const classifier=/function Test-R15AllowedExecutionMutation[\s\S]*?\n\}/u.exec(validator)?.[0];
    assert.ok(classifier,'production classifier must be extractable for behavioral proof');
    const script=String.raw`param([Parameter(Mandatory)][string]$FixtureRoot)
$ErrorActionPreference='Stop'
${classifier}
$sealed=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$runtime=Join-Path $FixtureRoot 'runtime';$source=Join-Path $FixtureRoot 'tools\qdrant';$file=Join-Path $runtime 'node.exe'
$sealed.Add($runtime)|Out-Null;$sealed.Add($source)|Out-Null
[ordered]@{
  dynamic=(Test-R15AllowedExecutionMutation -Root $FixtureRoot -Path (Join-Path $FixtureRoot 'acceptance-evidence\x.json') -SourceIdentifier 'r15-x-name-created' -SealedDirectories $sealed)
  sealedDirectoryContent=(Test-R15AllowedExecutionMutation -Root $FixtureRoot -Path $runtime -SourceIdentifier 'r15-x-content-changed' -SealedDirectories $sealed)
  sealedDirectoryMetadata=(Test-R15AllowedExecutionMutation -Root $FixtureRoot -Path $runtime -SourceIdentifier 'r15-x-metadata-changed' -SealedDirectories $sealed)
  sealedDirectoryName=(Test-R15AllowedExecutionMutation -Root $FixtureRoot -Path $source -SourceIdentifier 'r15-x-name-renamed' -SealedDirectories $sealed)
  sealedFileContent=(Test-R15AllowedExecutionMutation -Root $FixtureRoot -Path $file -SourceIdentifier 'r15-x-content-changed' -SealedDirectories $sealed)
  unknownDirectoryContent=(Test-R15AllowedExecutionMutation -Root $FixtureRoot -Path (Join-Path $FixtureRoot 'unknown') -SourceIdentifier 'r15-x-content-changed' -SealedDirectories $sealed)
}|ConvertTo-Json -Compress`;
    await writeFile(scriptPath,script);
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',scriptPath,
      '-FixtureRoot',f.root],{encoding:'utf8',timeout:10000,windowsHide:true});
    assert.equal(result.status,0,result.stderr||result.stdout);
    assert.deepEqual(JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1)),{
      dynamic:true,sealedDirectoryContent:true,sealedDirectoryMetadata:false,sealedDirectoryName:false,
      sealedFileContent:false,unknownDirectoryContent:false
    });
  }finally{await f.close();}
});

test('R15 browser-bearing operators require presence and supervise an expiring same-port relay',()=>{
  const artifacts=path.resolve(import.meta.dirname,'../../../artifacts');
  const helper=requireText(path.join(artifacts,'Invoke-R15RemoteWithBrowserRelay.ps1'));
  for(const name of ['Invoke-ControlR15Controls.ps1','Invoke-ControlR15BrowserProof.ps1','Invoke-ControlR15GemmaEligibilityCampaign.ps1']){
    const wrapper=requireText(path.join(artifacts,name));
    assert.match(wrapper,/\[Parameter\(Mandatory\)\]\[switch\]\$BrowserWitnessReady/u);
    assert.match(wrapper,/Invoke-R15RemoteWithBrowserRelay/u);
    assert.doesNotMatch(wrapper,/& ssh(?:\.exe)?\b/u);
  }
  assert.match(helper,/r15-browser-witness-presence-required/u);
  assert.match(helper,/runaai-m1-browser-checkpoint-ready\/v1/u);
  assert.match(helper,/runaai-m1-browser-relay-ready\/v1/u);
  assert.match(helper,/\$parsedExpiry-le\[DateTimeOffset\]::UtcNow/u);
  assert.match(helper,/Start-R15BrowserRelay -RemotePort \$uri\.Port/u);
  assert.match(helper,/relaySupervised=\$true;humanBrowserRequired=\$true/u);
  assert.match(helper,/ReadLineAsync\(\)/u);
  assert.match(helper,/relayState\.Process\.HasExited/u);
  assert.match(helper,/UtcNow-ge\$relayExpiry/u);
  assert.match(helper,/r15-browser-relay-not-live-before-publication/u);
  assert.match(helper,/taskkill\.exe/u);
  assert.match(helper,/Arguments = '\/PID ' \+ \$Process\.Id \+ ' \/T \/F'/u);
  assert.match(helper,/r15-child-process-tree-stop-unconfirmed/u);
  assert.match(helper,/Invoke-R15BrowserCleanup -RelayState \$relayState -RemoteProcess \$remote -RemoteStarted \$remoteStarted/u);
  assert.match(helper,/ClearAllForwardings=yes/u);
});

test('R15 relay normalizes PowerShell 5 string and PowerShell 7 UTC DateTime JSON expiry values',()=>{
  const helperPath=path.resolve(import.meta.dirname,'../../../artifacts/Invoke-R15RemoteWithBrowserRelay.ps1');
  const quoted=helperPath.replaceAll("'","''");
  const script=`. '${quoted}'\n`+
    `$checkpoint='{"expiresAt":"2026-09-02T13:13:42.354Z"}'|ConvertFrom-Json\n`+
    `$expiry=ConvertTo-R15CheckpointExpiry -Value $checkpoint.expiresAt\n`+
    `$invalid=@(`+
      `[DateTime]::SpecifyKind([DateTime]'2026-09-02T13:13:42.354',[DateTimeKind]::Local),`+
      `[DateTime]::SpecifyKind([DateTime]'2026-09-02T13:13:42.354',[DateTimeKind]::Unspecified),`+
      `[DateTimeOffset]::new(2026,9,2,13,13,42,[TimeSpan]::FromHours(1)),`+
      `'2026-09-02T13:13:42.354+00:00','malformed',1)\n`+
    `$rejected=0;foreach($bad in $invalid){$accepted=$false;try{[void](ConvertTo-R15CheckpointExpiry -Value $bad);$accepted=$true}catch{if($_.Exception.Message-cne'r15-browser-checkpoint-expiry-invalid'){throw}};if($accepted){throw 'invalid-expiry-accepted'};$rejected++}\n`+
    `[ordered]@{inputType=$checkpoint.expiresAt.GetType().FullName;expiry=$expiry.ToString('O');`+
      `utcTicks=$expiry.UtcDateTime.Ticks.ToString();invalidRejected=$rejected}|ConvertTo-Json -Compress`;
  const encoded=Buffer.from(script,'utf16le').toString('base64');
  for(const [executable,inputType] of [['powershell.exe','System.String'],['pwsh.exe','System.DateTime']]){
    const result=spawnSync(executable,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',encoded],
      {encoding:'utf8',timeout:10000,windowsHide:true});
    assert.equal(result.status,0,`${executable}: ${result.stderr||result.stdout}`);
    assert.deepEqual(JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1)),{
      inputType,expiry:'2026-09-02T13:13:42.3540000+00:00',utcTicks:'639239516223540000',invalidRejected:6
    });
  }
});

test('R15 browser cleanup attempts the remote tree after a relay cleanup failure', {skip:process.platform!=='win32'}, async()=>{
  const f=await fixture();try{
    const scriptPath=path.join(f.root,'browser-cleanup-regression.ps1');
    const helperPath=path.resolve(import.meta.dirname,'../../../artifacts/Invoke-R15RemoteWithBrowserRelay.ps1');
    const script=String.raw`param([Parameter(Mandatory)][string]$HelperPath)
$ErrorActionPreference='Stop';. $HelperPath
$calls=New-Object 'System.Collections.Generic.List[string]'
$stop={param($owned)$calls.Add([string]$owned)|Out-Null;if($owned-ceq'relay'){throw 'forced-relay-stop-failure'}}
$failures=@(Invoke-R15BrowserCleanup -RelayState ([pscustomobject]@{Process='relay'}) -RemoteProcess 'remote' -RemoteStarted $true -StopProcess $stop)
[ordered]@{calls=@($calls);failures=@($failures)}|ConvertTo-Json -Compress`;
    await writeFile(scriptPath,script);
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',scriptPath,
      '-HelperPath',helperPath],{encoding:'utf8',timeout:10000,windowsHide:true});
    assert.equal(result.status,0,result.stderr||result.stdout);
    assert.deepEqual(JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1)),{
      calls:['relay','remote'],failures:['relay: forced-relay-stop-failure']
    });
  }finally{await f.close();}
});

test('R15 runtime security digest detects durable ACL drift and accepts exact restoration', {skip:process.platform!=='win32'}, async()=>{
  const f=await fixture();try{
    const scriptPath=path.join(f.root,'runtime-security-regression.ps1');
    const helperPath=path.resolve(import.meta.dirname,'Get-R15RuntimeSecurityDigest.ps1');
    const script=String.raw`param([Parameter(Mandatory)][string]$HelperPath,[Parameter(Mandatory)][string]$FixtureRoot)
$ErrorActionPreference='Stop';. $HelperPath
$runtime=Join-Path $FixtureRoot 'runtime';$sandbox=Join-Path $FixtureRoot 'sandbox-runtime';$nested=Join-Path $sandbox 'node_modules'
[void](New-Item -ItemType Directory -Path $runtime);[void](New-Item -ItemType Directory -Path $nested)
$runtimeFile=Join-Path $runtime 'node.exe';$sandboxFile=Join-Path $nested 'fixture.js'
[IO.File]::WriteAllText($runtimeFile,'node');[IO.File]::WriteAllText($sandboxFile,'fixture')
$paths=@('runtime','runtime/node.exe','sandbox-runtime','sandbox-runtime/node_modules','sandbox-runtime/node_modules/fixture.js')
$before=Get-R15RuntimeSecurityDigest -Root $FixtureRoot -RelativePaths $paths
$original=[IO.File]::GetAccessControl($sandboxFile)
$sections=[Security.AccessControl.AccessControlSections]::Access-bor[Security.AccessControl.AccessControlSections]::Owner-bor[Security.AccessControl.AccessControlSections]::Group
$originalSddl=$original.GetSecurityDescriptorSddlForm($sections)
$changed=[IO.File]::GetAccessControl($sandboxFile)
$rule=New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.WindowsIdentity]::GetCurrent().User,'Write','Allow')
[void]$changed.AddAccessRule($rule);[IO.File]::SetAccessControl($sandboxFile,$changed)
$during=Get-R15RuntimeSecurityDigest -Root $FixtureRoot -RelativePaths $paths
$restored=New-Object Security.AccessControl.FileSecurity;$restored.SetSecurityDescriptorSddlForm($originalSddl,$sections);[IO.File]::SetAccessControl($sandboxFile,$restored)
$after=Get-R15RuntimeSecurityDigest -Root $FixtureRoot -RelativePaths $paths
if($before.Sha256-ceq$during.Sha256){throw 'r15-runtime-security-drift-not-detected'}
if($before.Sha256-cne$after.Sha256){throw 'r15-runtime-security-restoration-not-exact'}
@{count=$before.Count;driftDetected=$true;restored=$true}|ConvertTo-Json -Compress`;
    await writeFile(scriptPath,script);
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',scriptPath,
      '-HelperPath',helperPath,'-FixtureRoot',f.root],{encoding:'utf8',timeout:20000,windowsHide:true});
    assert.equal(result.status,0,result.stderr||result.stdout);const output=JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
    assert.deepEqual(output,{restored:true,count:5,driftDetected:true});
  }finally{await f.close();}
});

test('R15 watcher quiescence deterministically catches delayed and post-disposal queued events', {skip:process.platform!=='win32'}, async()=>{
  const f=await fixture();try{
    const scriptPath=path.join(f.root,'delayed-watcher-regression.ps1');
    const helperPath=path.resolve(import.meta.dirname,'Wait-R15WatcherQuiescence.ps1');
    const script=String.raw`param([Parameter(Mandatory)][string]$HelperPath,[Parameter(Mandatory)][string]$FixtureRoot)
$ErrorActionPreference='Stop'
. $HelperPath
$watched1=Join-Path $FixtureRoot 'watched-delayed';$watched2=Join-Path $FixtureRoot 'watched-post-disposal';$control=Join-Path $FixtureRoot 'control'
[void](New-Item -ItemType Directory -Path $watched1);[void](New-Item -ItemType Directory -Path $watched2);[void](New-Item -ItemType Directory -Path $control)
$sourceIds1=@();$watcher1=[IO.FileSystemWatcher]::new($watched1);$watcher1.IncludeSubdirectories=$false
$events1=New-Object 'System.Collections.Generic.List[System.Management.Automation.PSEventArgs]'
foreach($eventName in @('Changed','Created','Deleted','Renamed','Error')){
  $sourceId='r15-delayed-regression-'+$eventName.ToLowerInvariant()
  Register-ObjectEvent -InputObject $watcher1 -EventName $eventName -SourceIdentifier $sourceId|Out-Null
  $sourceIds1+=$sourceId
}
$watcher1.EnableRaisingEvents=$true
$target1=Join-Path $watched1 'delayed.txt';$ready=Join-Path $control 'ready';$go=Join-Path $control 'go'
$targetEscaped=$target1.Replace("'","''");$readyEscaped=$ready.Replace("'","''");$goEscaped=$go.Replace("'","''")
$delayCommand=@'
[IO.File]::WriteAllText('__READY__','ready');$deadline=[DateTime]::UtcNow.AddSeconds(5);while(-not[IO.File]::Exists('__GO__')){if([DateTime]::UtcNow-ge$deadline){exit 2};[Threading.Thread]::Sleep(5)};Start-Sleep -Milliseconds 75;[IO.File]::WriteAllText('__TARGET__','delayed')
'@
$delayCommand=$delayCommand.Replace('__READY__',$readyEscaped).Replace('__GO__',$goEscaped).Replace('__TARGET__',$targetEscaped)
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($delayCommand))
$child=Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',$encoded) -WindowStyle Hidden -PassThru
$sourceIds2=@();$watcher2=$null
try{
  $readyDeadline=[DateTime]::UtcNow.AddSeconds(5);while(-not(Test-Path -LiteralPath $ready -PathType Leaf)){if([DateTime]::UtcNow-ge$readyDeadline){throw 'r15-delayed-regression-not-ready'};Start-Sleep -Milliseconds 10}
  [IO.File]::WriteAllText($go,'go')
  Wait-R15WatcherQuiescence -SourceIdentifier $sourceIds1 -Destination $events1 -QuietMilliseconds 1000 -MaximumMilliseconds 5000 -PollMilliseconds 25
  $watcher1.EnableRaisingEvents=$false;$watcher1.Dispose()
  Wait-R15WatcherQuiescence -SourceIdentifier $sourceIds1 -Destination $events1 -QuietMilliseconds 500 -MaximumMilliseconds 5000 -PollMilliseconds 25
  if(-not$child.WaitForExit(5000)-or$child.ExitCode-ne0){throw 'r15-delayed-regression-child'}
  if($events1.Count-eq0){throw 'r15-delayed-regression-event-missed'}

  $sourceIds2=@();$watcher2=[IO.FileSystemWatcher]::new($watched2);$watcher2.IncludeSubdirectories=$false
  $events2=New-Object 'System.Collections.Generic.List[System.Management.Automation.PSEventArgs]'
  foreach($eventName in @('Changed','Created','Deleted','Renamed','Error')){
    $sourceId='r15-post-disposal-regression-'+$eventName.ToLowerInvariant()
    Register-ObjectEvent -InputObject $watcher2 -EventName $eventName -SourceIdentifier $sourceId|Out-Null
    $sourceIds2+=$sourceId
  }
  $watcher2.EnableRaisingEvents=$true;$target2=Join-Path $watched2 'queued.txt';[IO.File]::WriteAllText($target2,'queued')
  $queueDeadline=[DateTime]::UtcNow.AddSeconds(5)
  while(@(Get-Event|Where-Object{$sourceIds2-contains$_.SourceIdentifier}).Count-eq0){if([DateTime]::UtcNow-ge$queueDeadline){throw 'r15-post-disposal-regression-not-queued'};Start-Sleep -Milliseconds 10}
  $watcher2.EnableRaisingEvents=$false;$watcher2.Dispose()
  Wait-R15WatcherQuiescence -SourceIdentifier $sourceIds2 -Destination $events2 -QuietMilliseconds 500 -MaximumMilliseconds 5000 -PollMilliseconds 25
  if($events2.Count-eq0){throw 'r15-post-disposal-regression-event-missed'}
  @{delayedObserved=$events1.Count;postDisposalObserved=$events2.Count;targetsExist=((Test-Path -LiteralPath $target1 -PathType Leaf)-and(Test-Path -LiteralPath $target2 -PathType Leaf))}|ConvertTo-Json -Compress
}finally{
  foreach($sourceId in @($sourceIds1)+@($sourceIds2)){Unregister-Event -SourceIdentifier $sourceId -ErrorAction SilentlyContinue;Remove-Event -SourceIdentifier $sourceId -ErrorAction SilentlyContinue}
  $watcher1.Dispose();if($null-ne$watcher2){$watcher2.Dispose()};if(-not$child.HasExited){$child.Kill();$child.WaitForExit()}
}`;
    await writeFile(scriptPath,script);
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',scriptPath,
      '-HelperPath',helperPath,'-FixtureRoot',f.root],{encoding:'utf8',timeout:15000,windowsHide:true});
    assert.equal(result.status,0,result.stderr||result.stdout);const output=JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
    assert.equal(output.targetsExist,true);assert.ok(output.delayedObserved>0);assert.ok(output.postDisposalObserved>0);
  }finally{await f.close();}
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
