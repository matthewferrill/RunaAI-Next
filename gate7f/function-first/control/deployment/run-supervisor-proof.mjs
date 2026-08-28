import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest,POWERSHELL} from './watchdog.mjs';

const directory=fileURLToPath(new URL('.',import.meta.url)),repo=path.resolve(directory,'../../../..');
const output=process.argv[2];
if(!output||!path.isAbsolute(output)||process.argv.length!==3)throw Error('absolute new proof directory required');
await mkdir(output); // Create-only: no old proof replacement.
const entries=(await readdir(directory)).filter(name=>/\.(mjs|cs|ps1)$/iu.test(name)).sort();
const tests=entries.filter(name=>name.endsWith('.test.mjs'));
const pins={};
for(const name of [...entries,'fixtures/frozen-9556-deployer.ps1'])pins[name]=digest(await readFile(path.join(directory,name)));
const startedAt=new Date().toISOString();
const git=spawnSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8',timeout:10000,windowsHide:true});
if(git.status!==0)throw Error('source identity unavailable');
const child=spawn(process.execPath,['--test','--test-concurrency=1',...tests.map(name=>path.join(directory,name))],{cwd:repo,windowsHide:true,stdio:['ignore','pipe','pipe']});
const stdout=[],stderr=[];let size=0,deadlineExpired=false;
const capture=parts=>chunk=>{size+=chunk.length;if(size>4194304){deadlineExpired=true;child.kill();}else parts.push(chunk);};
child.stdout.on('data',capture(stdout));child.stderr.on('data',capture(stderr));
const timer=setTimeout(()=>{deadlineExpired=true;child.kill();},180000);
const result=await new Promise(resolve=>{child.on('error',error=>resolve({exitCode:null,errorCode:error.code}));child.on('close',exitCode=>resolve({exitCode}));});
clearTimeout(timer);
const out=Buffer.concat(stdout),err=Buffer.concat(stderr);
await writeFile(path.join(output,'tests.tap'),out,{flag:'wx'});await writeFile(path.join(output,'tests.stderr.txt'),err,{flag:'wx'});
const counts={};for(const key of ['tests','pass','fail','cancelled','skipped'])counts[key]=Number(new RegExp('^# '+key+' (\\d+)$','m').exec(out.toString())?.[1]??NaN);
const proof={schemaVersion:'runaai-m1-supervisor-isolated-proof/v1',sourceCommit:git.stdout.trim(),startedAt,finishedAt:new Date().toISOString(),
  platform:process.platform,nodeVersion:process.version,nodeSha256:digest(await readFile(process.execPath)),powershellSha256:digest(await readFile(POWERSHELL)),
  sourcePins:pins,tests,result,counts,deadlineExpired,stdoutSha256:digest(out),stderrSha256:digest(err),
  passed:result.exitCode===0&&!deadlineExpired&&counts.fail===0&&counts.skipped===0&&counts.cancelled===0&&counts.pass===counts.tests,
  fixtureCleanupAssertedByTests:true,productionDeployment:false,homeContacted:false,modelsLoaded:false};
await writeFile(path.join(output,'proof.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,passed:proof.passed,counts,result,proofSha256:digest(await readFile(path.join(output,'proof.json')))}));
process.exitCode=proof.passed?0:1;
