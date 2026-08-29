import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,mkdir,open,readFile,realpath} from 'node:fs/promises';
import {once} from 'node:events';
import net from 'node:net';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyReleaseArtifact} from '../../../gate6b/artifact.mjs';
import {CASE_BUNDLE_SHA256} from './cases.mjs';
import {createOwnedControlResources,fileSha256} from './owned-control-resources.mjs';
import {assertOwnedStage,fail,QDRANT_PIN} from './runner-contract.mjs';
import {verifyExtractedArchive} from './run-model-campaign.mjs';

const HASH=/^[a-f0-9]{64}$/u,COMMIT=/^[a-f0-9]{40}$/u,RUN=/^[a-f0-9]{32}$/u;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===keys.split(',').sort().join();
const demand=(value,code)=>{if(!value)throw fail('m1-control-regression-'+code);};
const lower=value=>path.win32.resolve(value).toLowerCase();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export const CONTROL_REGRESSION_FIXED=Object.freeze({
  releaseRoot:'C:\\AI\\RunaAI-Next-Candidate\\releases\\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc',
  dependencyArtifactDigest:'248aaee4f7855c83fe94a2855e156d2321dee3721c06535afbca87a3f3e86167',
  nodeVersion:'v22.22.0',nodeSha256:'bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb',
  postgresRoot:'C:\\AI\\RunaAI-Next-Candidate\\tools\\postgresql\\pgsql\\bin',postgresVersion:'18.6',
  maximumMs:900000,maximumLogBytes:64*1024*1024,
  testArguments:Object.freeze(['--test','--test-concurrency=1','--test-reporter=tap']),
});

export function validateControlRegressionManifest(value){
  demand(exact(value,'schemaVersion,runId,source,dependencies,postgresql,qdrant,execution')
    &&value.schemaVersion==='runaai-m1-control-regression-input/v1'&&RUN.test(value.runId)
    &&exact(value.source,'commit,archiveSha256,packageLockSha256,extractedFiles,caseBundleSha256')
    &&COMMIT.test(value.source.commit)&&HASH.test(value.source.archiveSha256)&&HASH.test(value.source.packageLockSha256)
    &&Number.isSafeInteger(value.source.extractedFiles)&&value.source.extractedFiles>0&&value.source.extractedFiles<=100000
    &&value.source.caseBundleSha256===CASE_BUNDLE_SHA256
    &&exact(value.dependencies,'releaseRoot,artifactDigest,nodeVersion,nodeSha256')
    &&value.dependencies.releaseRoot===CONTROL_REGRESSION_FIXED.releaseRoot
    &&value.dependencies.artifactDigest===CONTROL_REGRESSION_FIXED.dependencyArtifactDigest
    &&value.dependencies.nodeVersion===CONTROL_REGRESSION_FIXED.nodeVersion
    &&value.dependencies.nodeSha256===CONTROL_REGRESSION_FIXED.nodeSha256
    &&exact(value.postgresql,'toolRoot,version,binaries')&&value.postgresql.toolRoot===CONTROL_REGRESSION_FIXED.postgresRoot
    &&value.postgresql.version===CONTROL_REGRESSION_FIXED.postgresVersion
    &&exact(value.postgresql.binaries,'initdb.exe,pg_ctl.exe,postgres.exe')
    &&Object.values(value.postgresql.binaries).every(item=>HASH.test(item))
    &&exact(value.qdrant,'version,bytes,sha256')&&value.qdrant.version===QDRANT_PIN.version
    &&value.qdrant.bytes===QDRANT_PIN.bytes&&value.qdrant.sha256===QDRANT_PIN.sha256
    &&exact(value.execution,'maximumMs,allTests,serial,zeroSkips,modelsAllowed,protectedDataAllowed,productionChangesAllowed,createdBeforeExecution')
    &&value.execution.maximumMs===CONTROL_REGRESSION_FIXED.maximumMs&&value.execution.allTests===true&&value.execution.serial===true
    &&value.execution.zeroSkips===true&&value.execution.modelsAllowed===false&&value.execution.protectedDataAllowed===false
    &&value.execution.productionChangesAllowed===false&&value.execution.createdBeforeExecution===true,'manifest');
  return structuredClone(value);
}

async function regular(filename,maximum){
  const info=await lstat(filename);demand(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&info.size>0&&info.size<=maximum,'input-file');return info;
}
async function owned(root,relative,maximum){
  const filename=path.resolve(root,relative),part=path.relative(root,filename);demand(part&&!part.startsWith('..')&&!path.isAbsolute(part),'input-path');
  demand(path.relative(await realpath(root),await realpath(filename))===part,'input-reparse');await regular(filename,maximum);return filename;
}
async function readJson(filename,maximum){await regular(filename,maximum);try{return JSON.parse(await readFile(filename,'utf8'));}catch{throw fail('m1-control-regression-json');}}

export function parseTapSummary(text){
  const counts={};for(const key of ['tests','suites','pass','fail','cancelled','skipped','todo']){
    const matches=[...text.matchAll(new RegExp(`^# ${key} ([0-9]+)\\r?$`,'gmu'))];demand(matches.length===1,'tap-summary');counts[key]=Number(matches[0][1]);
  }
  demand(counts.tests>0&&counts.suites>=0&&Object.values(counts).every(Number.isSafeInteger),'tap-summary');return Object.freeze(counts);
}

export function controlRegressionEnvironment(source,resources,root){
  const safe={};for(const key of ['SystemRoot','WINDIR','ComSpec','PATH','PATHEXT','PSModulePath','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS'])
    if(typeof source[key]==='string'&&source[key])safe[key]=source[key];
  if(process.platform==='win32'){safe.SystemDrive='C:';safe.OS='Windows_NT';}
  const native=resources.workerResources.native,postgresPort=resources.workerResources.postgresPort;
  return Object.freeze({...safe,TEMP:resources.dataDirectory,TMP:resources.dataDirectory,LOCALAPPDATA:native.temporaryRoot,CI:'1',NO_COLOR:'1',
    M1_TASK_PG_URL:`postgresql://m1_synthetic@127.0.0.1:${postgresPort}/postgres`,
    M1_QDRANT_BINARY:path.join(root,'tools/qdrant/bin/qdrant.exe'),M1_EXECUTOR_RUNTIME_ROOT:native.runtimeRoot,
    M1_EXECUTOR_RUNNER_PATH:native.runnerPath,M1_EXECUTOR_NODE_PATH:native.nodeExecutable,M1_EXECUTOR_TEMP_ROOT:native.temporaryRoot});
}

export async function captureBoundedStream(stream,filename,maximum){
  const handle=await open(filename,'wx');let bytes=0;
  try{for await(const chunk of stream){bytes+=chunk.length;demand(bytes<=maximum,'log-cap');await handle.write(chunk);}await handle.sync();}
  finally{await handle.close();}return bytes;
}
async function terminate(child,closed){
  if(child.exitCode!==null||child.signalCode!==null)return;
  if(process.platform==='win32'&&Number.isSafeInteger(child.pid)&&child.pid>0)spawnSync(path.join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe'),
    ['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:10000});else child.kill();
  const observed=closed??once(child,'close');
  if(await Promise.race([observed.then(()=>true,()=>true),pause(5000).then(()=>false)]))return;
  child.kill('SIGKILL');
}
export async function executeAllTests({root,nodeExecutable,environment,outputDirectory,maximumMs=CONTROL_REGRESSION_FIXED.maximumMs}){
  const child=spawn(nodeExecutable,CONTROL_REGRESSION_FIXED.testArguments,{cwd:root,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const closed=once(child,'close').then(([exitCode,signal])=>({exitCode,signal}));
  const stdoutPath=path.join(outputDirectory,'tests.tap'),stderrPath=path.join(outputDirectory,'tests.stderr.txt');let captureError=null;
  const captures=[captureBoundedStream(child.stdout,stdoutPath,CONTROL_REGRESSION_FIXED.maximumLogBytes),
    captureBoundedStream(child.stderr,stderrPath,CONTROL_REGRESSION_FIXED.maximumLogBytes)];
  for(const promise of captures)promise.catch(error=>{captureError??=error;void terminate(child,closed);});
  let deadlineExpired=false,outcome,timer;
  try{
    const expired=await Promise.race([closed.then(()=>false),new Promise(resolve=>{timer=setTimeout(resolve,maximumMs,true);})]);
    if(expired){deadlineExpired=true;await terminate(child,closed);}outcome=await closed;
  }finally{clearTimeout(timer);}
  const settled=await Promise.allSettled(captures);captureError??=settled.find(item=>item.status==='rejected')?.reason??null;
  const tap=await readFile(stdoutPath,'utf8');let counts=null,summaryError=null;
  try{counts=parseTapSummary(tap);}catch(error){summaryError=error.code??'m1-control-regression-tap-summary';}
  const exactCounts=counts&&counts.pass===counts.tests&&counts.fail===0&&counts.cancelled===0&&counts.skipped===0&&counts.todo===0;
  const failureCode=deadlineExpired?'m1-control-regression-timeout':captureError?(captureError.code??'m1-control-regression-capture'):
    summaryError??(outcome.exitCode!==0||outcome.signal?'m1-control-regression-test-exit':!exactCounts?'m1-control-regression-test-counts':null);
  return Object.freeze({exitCode:outcome.exitCode,signal:outcome.signal??null,deadlineExpired,captureError:captureError?.code??null,summaryError,counts,
    failureCode,passed:failureCode===null,command:[path.basename(nodeExecutable),...CONTROL_REGRESSION_FIXED.testArguments]});
}

async function isClosed(port){return new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});const done=value=>{socket.destroy();resolve(value);};
  socket.setTimeout(750,()=>done(false));socket.once('connect',()=>done(false));socket.once('error',error=>done(error.code==='ECONNREFUSED'));});}
async function missing(filename){try{await lstat(filename);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}}
export async function verifyControlRegressionCleanup(root,ports={}){
  const directories=['disposable-postgres','runtime','sandbox-runtime','transient','q','data'];
  const directoryState=Object.fromEntries(await Promise.all(directories.map(async name=>[name,await missing(path.join(root,name))])));
  const portState={};for(const [name,port] of Object.entries(ports))portState[name]=Number.isInteger(port)&&await isClosed(port);
  const passed=Object.values(directoryState).every(Boolean)&&Object.values(portState).every(Boolean);
  return Object.freeze({schemaVersion:'runaai-m1-control-regression-cleanup/v1',directoriesAbsent:directoryState,portsClosed:portState,
    sourceAndEvidenceRetained:true,productionChanged:false,protectedDataRead:false,modelsInvoked:false,passed});
}

async function writeExclusive(filename,value){const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value,null,2)+'\n'),handle=await open(filename,'wx');
  try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}return {sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};}
async function retainedFile(filename){try{const info=await lstat(filename);if(!info.isFile()||info.isSymbolicLink()||info.size>CONTROL_REGRESSION_FIXED.maximumLogBytes)return null;
    return {sha256:await fileSha256(filename),bytes:info.size};}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function evidenceDirectory(root,runId){
  const parent=path.join(root,'acceptance-evidence');try{await mkdir(parent);}catch(error){if(error.code!=='EEXIST')throw error;}
  const info=await lstat(parent);demand(info.isDirectory()&&!info.isSymbolicLink()&&(await realpath(parent))===parent,'evidence-parent');
  const output=path.join(parent,`control-regression-${runId}`);await mkdir(output);return output;
}

export async function verifyControlRegressionInputs({root,manifestPath,manifestSha256}){
  demand(process.platform==='win32','platform');root=assertOwnedStage(root);demand((await realpath(root)).toLowerCase()===root.toLowerCase(),'stage-reparse');
  const exactManifest=path.join(root,'CONTROL-REGRESSION-INPUT.json');demand(path.resolve(manifestPath).toLowerCase()===exactManifest.toLowerCase(),'manifest-path');
  await regular(exactManifest,1024*1024);demand(HASH.test(manifestSha256)&&await fileSha256(exactManifest)===manifestSha256,'manifest-pin');
  const manifest=validateControlRegressionManifest(await readJson(exactManifest,1024*1024));
  const identity=await readJson(await owned(root,'SOURCE-IDENTITY.json',65536),65536);
  demand(exact(identity,'schemaVersion,sourceCommit,sourceArchiveSha256,caseBundleSha256,qdrantSha256,productionChanged')
    &&identity.schemaVersion==='runaai-m1-source-identity/v1'&&identity.sourceCommit===manifest.source.commit
    &&identity.sourceArchiveSha256===manifest.source.archiveSha256&&identity.caseBundleSha256===manifest.source.caseBundleSha256
    &&identity.qdrantSha256===manifest.qdrant.sha256&&identity.productionChanged===false,'source-identity');
  const archive=await owned(root,'source.tar',512*1024*1024),packageLock=await owned(root,'package-lock.json',16*1024*1024);
  demand(await fileSha256(packageLock)===manifest.source.packageLockSha256,'package-lock-pin');
  const archiveProof=await verifyExtractedArchive(root,archive,manifest.source.archiveSha256);demand(archiveProof.files===manifest.source.extractedFiles,'archive-count');
  const qdrant=await owned(root,'tools/qdrant/bin/qdrant.exe',manifest.qdrant.bytes);demand((await lstat(qdrant)).size===manifest.qdrant.bytes
    &&await fileSha256(qdrant)===manifest.qdrant.sha256,'qdrant-pin');
  const release=path.resolve(manifest.dependencies.releaseRoot);demand(lower(release)===lower(CONTROL_REGRESSION_FIXED.releaseRoot)
    &&(await realpath(release)).toLowerCase()===release.toLowerCase(),'release-root');
  const dependencyProof=await verifyReleaseArtifact(release,manifest.dependencies.artifactDigest);
  const modules=path.join(root,'node_modules'),modulesInfo=await lstat(modules);demand(modulesInfo.isSymbolicLink()
    &&(await realpath(modules)).toLowerCase()===(await realpath(path.join(release,'node_modules'))).toLowerCase(),'dependency-junction');
  const nodeExecutable=path.join(release,'runtime/node.exe');demand(await fileSha256(nodeExecutable)===manifest.dependencies.nodeSha256
    &&path.resolve(process.execPath).toLowerCase()===path.resolve(nodeExecutable).toLowerCase()&&process.version===manifest.dependencies.nodeVersion,'node-pin');
  const versions={};for(const [name,relative,expected] of [['quickjs','quickjs-emscripten/package.json','0.32.0'],['mxc','@microsoft/mxc-sdk/package.json','0.8.0']]){
    const value=await readJson(path.join(modules,relative),1024*1024);demand(value.version===expected,'dependency-version');versions[name]=expected;}
  const postgres={};for(const name of ['initdb.exe','pg_ctl.exe','postgres.exe']){
    const filename=path.join(manifest.postgresql.toolRoot,name);await regular(filename,128*1024*1024);
    const digest=await fileSha256(filename);demand(digest===manifest.postgresql.binaries[name],'postgres-pin');postgres[name]=digest;}
  return Object.freeze({root,manifest,manifestSha256,nodeExecutable,archiveProof,dependencyProof,versions,postgres});
}

export async function runVerifiedControlRegression({verified,createResources=createOwnedControlResources,executeTests=executeAllTests,probeCleanup=verifyControlRegressionCleanup}){
  const {root,manifest}=verified,outputDirectory=await evidenceDirectory(root,manifest.runId),startedAt=new Date().toISOString();
  const inputProof={schemaVersion:'runaai-m1-control-regression-input-proof/v1',manifestSha256:verified.manifestSha256,source:manifest.source,
    dependencyArtifactDigest:verified.dependencyProof.artifactDigest,dependencyFiles:verified.dependencyProof.fileCount,nodeSha256:manifest.dependencies.nodeSha256,
    qdrantSha256:manifest.qdrant.sha256,postgresSha256:verified.postgres,quickjsVersion:verified.versions.quickjs,mxcVersion:verified.versions.mxc,
    modelsInvoked:false,protectedDataRead:false,productionChanged:false};
  const inputReceipt=await writeExclusive(path.join(outputDirectory,'input-proof.json'),inputProof);let resources=null,resourceFailureReport=null,testOutcome=null,errorCode=null,closeReceipt=null;
  try{
    resources=await createResources({root,maximumMs:manifest.execution.maximumMs});
    demand(resources.report?.nativePreflight?.ready===true,'native-preflight');
    const environment=controlRegressionEnvironment(process.env,resources,root);
    testOutcome=await executeTests({root,nodeExecutable:verified.nodeExecutable,environment,outputDirectory,maximumMs:manifest.execution.maximumMs});
    if(!testOutcome.passed)errorCode=testOutcome.failureCode??'m1-control-regression-tests-failed';
  }catch(error){resourceFailureReport=error.resourceReport??null;errorCode=error.code??'m1-control-regression-run-failed';}
  try{closeReceipt=await resources?.close()??null;}catch(error){errorCode??=error.code??'m1-control-regression-cleanup-failed';}
  const ports=resources?.report?.ports??resourceFailureReport?.ports??{},cleanupPorts=Object.fromEntries(
    [['postgres',ports.postgres],['qdrantHttp',ports.qdrantHttp],['qdrantGrpc',ports.qdrantGrpc]].filter(([,port])=>Number.isInteger(port)));let cleanup;
  try{cleanup=await probeCleanup(root,cleanupPorts);}
  catch(error){errorCode??=error.code??'m1-control-regression-cleanup-probe-failed';cleanup={schemaVersion:'runaai-m1-control-regression-cleanup/v1',
    errorCode:error.code??'cleanup-probe-failed',sourceAndEvidenceRetained:true,productionChanged:false,protectedDataRead:false,modelsInvoked:false,passed:false};}
  const cleanupRecord={...cleanup,resourceCloseReceipt:closeReceipt,resourceReport:resources?.report??resourceFailureReport};
  const cleanupReceipt=await writeExclusive(path.join(outputDirectory,'cleanup.json'),cleanupRecord);
  const tapPath=path.join(outputDirectory,'tests.tap'),stderrPath=path.join(outputDirectory,'tests.stderr.txt');
  const logs={tap:await retainedFile(tapPath),stderr:await retainedFile(stderrPath)};
  const passed=!errorCode&&testOutcome?.passed===true&&cleanup.passed===true;
  const result={schemaVersion:'runaai-m1-control-regression-result/v1',runId:manifest.runId,startedAt,finishedAt:new Date().toISOString(),passed,
    errorCode:errorCode??null,sourceCommit:manifest.source.commit,sourceArchiveSha256:manifest.source.archiveSha256,packageLockSha256:manifest.source.packageLockSha256,
    manifestSha256:verified.manifestSha256,caseBundleSha256:manifest.source.caseBundleSha256,dependencyArtifactDigest:manifest.dependencies.artifactDigest,
    nodeVersion:manifest.dependencies.nodeVersion,nodeSha256:manifest.dependencies.nodeSha256,qdrant:manifest.qdrant,postgresSha256:verified.postgres,
    test:testOutcome,logs,inputProof:inputReceipt,cleanup:cleanupReceipt,allTestsIncluded:true,modelsInvoked:false,protectedDataRead:false,productionChanged:false};
  await writeExclusive(path.join(outputDirectory,'result.json'),result);
  return Object.freeze({...result,evidenceDirectory:path.relative(root,outputDirectory).split(path.sep).join('/')});
}

export async function runControlExactRegression(args){const verified=await verifyControlRegressionInputs(args);return runVerifiedControlRegression({verified});}

export function parseControlRegressionArguments(args){
  const value={};for(let index=0;index<args.length;index+=2){const key=args[index],next=args[index+1];
    demand(['--owned-root','--manifest','--manifest-sha256'].includes(key)&&next&&!Object.hasOwn(value,key),'arguments');value[key]=next;}
  demand(Object.keys(value).length===3,'arguments');return {root:value['--owned-root'],manifestPath:value['--manifest'],manifestSha256:value['--manifest-sha256']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{const result=await runControlExactRegression(parseControlRegressionArguments(process.argv.slice(2)));
    process.stdout.write(JSON.stringify({schemaVersion:result.schemaVersion,passed:result.passed,errorCode:result.errorCode,evidenceDirectory:result.evidenceDirectory,
      tests:result.test?.counts?.tests??0,skipped:result.test?.counts?.skipped??null,modelsInvoked:false,protectedDataRead:false,productionChanged:false})+'\n');
    if(!result.passed)process.exitCode=1;
  }catch(error){process.stdout.write(JSON.stringify({errorCode:error.code??'m1-control-regression-failed',modelsInvoked:false,protectedDataRead:false,productionChanged:false})+'\n');process.exitCode=1;}
}
