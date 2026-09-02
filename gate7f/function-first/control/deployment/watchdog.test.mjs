import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,readdir,rm,rmdir,unlink,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {digest,argvDigest,POWERSHELL,prepareWatchdogRequest,launchWatchdog,inspectWatchdog} from './watchdog.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
const wrapperFile=path.join(root,'Invoke-ClosedCompanionWatchdog.ps1'),helperFile=path.join(root,'ClosedCompanionJob.cs'),hostFile=path.join(root,'Watchdog-Host.mjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ps=value=>value.replaceAll("'","''");
const privateHook=async()=>{}; // Wrapper itself verifies real ACL/owner on every record.
async function waitFor(file,ms=10000){const until=Date.now()+ms;while(Date.now()<until){try{return await readFile(file,'utf8');}catch(error){if(!['ENOENT','EBUSY','EPERM'].includes(error.code))throw error;}await sleep(20);}throw Error('test-observation-timeout');}
function isRunning(pid){try{process.kill(pid,0);return true;}catch{return false;}}
async function stopConfirmed(pid){for(let n=0;n<100;n++){if(!isRunning(pid))return true;await sleep(20);}return false;}
async function fixture(mode,{maximumMs=7000,maximumBytes=262144}={}){
  const base=await mkdtemp(path.join(tmpdir(),'m1-supervisor-')),directory=path.join(base,'journal');await mkdir(directory);
  const acl=`$ErrorActionPreference='Stop';$p='${ps(directory)}';$a=[Security.AccessControl.DirectorySecurity]::new();$a.SetAccessRuleProtection($true,$false);foreach($s in @('S-1-5-18','S-1-5-32-544',[Security.Principal.WindowsIdentity]::GetCurrent().User.Value)){$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($s),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};Set-Acl -LiteralPath $p -AclObject $a`;
  const init=spawnSync(POWERSHELL,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(acl,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',timeout:10000,
    env:{...process.env,PSModulePath:String.raw`C:\Windows\system32\WindowsPowerShell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules`}});
  assert.equal(init.status,0,init.stderr);
  const program=path.join(base,'synthetic.cjs'),side=path.join(base,'effect.json'),grand=path.join(base,'grandchild.json');
  await writeFile(program,`const fs=require('node:fs'),{spawn}=require('node:child_process');
const mode=process.argv[2],side=process.argv[3],grand=process.argv[4];
if(mode==='grandchild'){fs.writeFileSync(grand,JSON.stringify({pid:process.pid}));setInterval(()=>{},1000);}
else {fs.writeFileSync(side,JSON.stringify({pid:process.pid,argv:process.argv.slice(5)}));
 if(mode==='tree'){spawn(process.execPath,[__filename,'grandchild',side,grand],{windowsHide:true,stdio:'ignore'});setInterval(()=>{},1000);}
 else if(mode==='terminal-loss'){fs.mkdirSync(process.argv[5]);console.log(JSON.stringify({complete:true}));}
 else if(mode==='stdout'){process.stdout.write('x'.repeat(1000000));setInterval(()=>{},1000);}
 else if(mode==='stderr'){process.stderr.write('PRIVATE-NEVER-EXPORT'.repeat(100000));setInterval(()=>{},1000);}
 else {process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({complete:true,stdin:'eof'})));}}
`,{flag:'wx'});
  const args=[program,mode,side,grand,...(mode==='terminal-loss'?[path.join(directory,'terminal.json')]:['a b','quote"slash\\',"apostrophe'",'λ'])];
  const pins=await Promise.all([program,wrapperFile,helperFile,hostFile].map(async file=>({path:file,sha256:digest(await readFile(file))})));
  const prepared=await prepareWatchdogRequest({directory,transitionId:'b'.repeat(32),descriptorSha256:'c'.repeat(64),packageSha256:digest(JSON.stringify(pins)),
    executable:process.execPath,executableSha256:digest(await readFile(process.execPath)),supervisorExecutable:process.execPath,
    supervisorExecutableSha256:digest(await readFile(process.execPath)),arguments:args,pins,maximumMs,maximumBytes,assertOwnerPrivate:privateHook});
  const options={prepared,wrapperFile,helperFile,hostFile,hostSha256:digest(await readFile(hostFile)),wrapperSha256:digest(await readFile(wrapperFile)),helperSha256:digest(await readFile(helperFile)),
    powershellSha256:digest(await readFile(POWERSHELL)),assertOwnerPrivate:privateHook};
  const observation=()=>inspectWatchdog({directory,requestSha256:prepared.requestSha256,assertOwnerPrivate:privateHook});
  let launched;
  return {base,directory,side,grand,program,prepared,options,observation,
    async launch(){launched=await launchWatchdog(options);return launched;},
    async close(){if(launched&&isRunning(launched.child.pid)){launched.child.kill();await launched.completion;}
      for(const file of [side,grand])try{const value=JSON.parse(await readFile(file));if(isRunning(value.pid)){process.kill(value.pid);await stopConfirmed(value.pid);}}catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;}
      assert.ok(path.resolve(base).startsWith(path.resolve(tmpdir())+path.sep));
      await rm(base,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
  };
}

test('atomic job starts suspended, records identity, inherits only stdin EOF, returns exact complete output',async t=>{
  const f=await fixture('success');try{const run=await f.launch();const completed=await run.completion;assert.equal(completed.exitCode,0);
    const actual=await f.observation();t.diagnostic(JSON.stringify(actual));assert.equal(actual.status,'terminal');assert.equal(actual.result.ExitCode,0);
    assert.deepEqual(JSON.parse(actual.result.Stdout),{complete:true,stdin:'eof'});assert.equal(actual.result.ActiveProcesses,0);
    assert.deepEqual(JSON.parse(await readFile(f.side)).argv,['a b','quote"slash\\',"apostrophe'",'λ']);
    assert.ok(Date.parse(actual.records['intent.json'].recordedAt)<=Date.parse(actual.records['started.json'].recordedAt));
    assert.equal(actual.automaticRollbackPermitted,false);assert.equal(actual.automaticReplayPermitted,false);
  }finally{await f.close();}
});

test('finite deadline stops actual companion/grandchild, not an unrelated sentinel; replay forbidden',async t=>{
  const sentinel=spawn(process.execPath,['-e','setTimeout(()=>{},20000)'],{stdio:'ignore',windowsHide:true});
  const f=await fixture('tree',{maximumMs:4000});try{const run=await f.launch();
    await waitFor(path.join(f.directory,'started.json'),30000);
    const grand=JSON.parse(await waitFor(f.grand,6000));
    assert.equal((await run.completion).status,'needs-reconciliation');const actual=await f.observation();t.diagnostic(JSON.stringify(actual));
    assert.equal(actual.status,'needs-reconciliation');assert.equal(actual.result.TimedOut,true);assert.equal(actual.result.ActiveProcesses,0);
    assert.equal(await stopConfirmed(grand.pid),true);assert.equal(isRunning(sentinel.pid),true);
    await assert.rejects(prepareWatchdogRequest({...f.prepared.request,directory:f.directory,assertOwnerPrivate:privateHook}),/existing-operation/u);
    await assert.rejects(launchWatchdog(f.options),/expired/u);
    assert.equal((await f.observation()).records['started.json'].processId,actual.records['started.json'].processId);
  }finally{sentinel.kill();await f.close();}
});

for(const mode of ['stdout','stderr'])test('actual '+mode+' cap stays unknown, bounded and stopped',async t=>{
  const f=await fixture(mode,{maximumBytes:1024});try{const run=await f.launch();await run.completion;
    const actual=await f.observation();t.diagnostic(JSON.stringify(actual));assert.equal(actual.status,'needs-reconciliation');
    assert.equal(actual.result.OutputLimited,true);assert.equal(actual.result.Stdout,'');assert.equal(actual.result.ActiveProcesses,0);
    assert.ok(!JSON.stringify(actual).includes('PRIVATE-NEVER-EXPORT'));
  }finally{await f.close();}
});

test('actual watchdog crash closes its noninherited job and stops descendants, leaving no fabricated terminal',async t=>{
  const f=await fixture('tree');try{const run=await f.launch(),grand=JSON.parse(await waitFor(f.grand)),side=JSON.parse(await waitFor(f.side));
    run.child.kill();await run.completion;
    assert.equal(await stopConfirmed(grand.pid),true);assert.equal(await stopConfirmed(side.pid),true);
    const actual=await f.observation();t.diagnostic(JSON.stringify(actual));assert.equal(actual.status,'needs-reconciliation');assert.equal(actual.terminalRetained,false);
    assert.equal(await stopConfirmed(actual.records['supervisor.json'].processId),true);
  }finally{await f.close();}
});

test('actual effect followed by lost terminal cannot be accepted by fresh observer',async t=>{
  const f=await fixture('terminal-loss');try{const run=await f.launch();await run.completion;
    assert.ok(JSON.parse(await readFile(f.side)).pid>0);await assert.rejects(f.observation(),/file-boundary/u);
    await rmdir(path.join(f.directory,'terminal.json'));
    const actual=await f.observation();t.diagnostic(JSON.stringify(actual));assert.equal(actual.status,'needs-reconciliation');assert.equal(actual.terminalRetained,false);
    const child=spawnSync(process.execPath,['--input-type=module','-e',`import{inspectWatchdog}from${JSON.stringify(new URL('./watchdog.mjs',import.meta.url).href)};console.log(JSON.stringify(await inspectWatchdog({directory:${JSON.stringify(f.directory)},requestSha256:${JSON.stringify(f.prepared.requestSha256)},assertOwnerPrivate:async()=>{}})));`],{windowsHide:true,encoding:'utf8',timeout:10000});
    assert.equal(child.status,0,child.stderr);assert.equal(JSON.parse(child.stdout).status,'needs-reconciliation');
  }finally{await f.close();}
});

test('foreign terminal, package drift, malformed request and hardlink fail closed',async()=>{
  const f=await fixture('success');try{
    await assert.rejects(launchWatchdog({...f.options,wrapperSha256:'0'.repeat(64)}),/supervisor-drift/u);
    const run=await f.launch();await run.completion;const terminal=path.join(f.directory,'terminal.json'),raw=await readFile(terminal);
    const changed=JSON.parse(raw);changed.operationId='d'.repeat(32);await writeFile(terminal,JSON.stringify(changed));
    await assert.rejects(f.observation(),/terminal-binding/u);await writeFile(terminal,raw);
    for(const mutate of [v=>v.extra=true,v=>v.result.FinishedAt='2020-01-01T00:00:00Z',v=>v.result.StdoutBytes++,v=>v.result.OutputComplete='true']){
      const value=JSON.parse(raw);mutate(value);await writeFile(terminal,JSON.stringify(value));await assert.rejects(f.observation());
    }await writeFile(terminal,raw);
    await link(terminal,path.join(f.base,'linked.json'));await assert.rejects(f.observation(),/file-boundary/u);await unlink(path.join(f.base,'linked.json'));
    await writeFile(path.join(f.directory,'request.json'),'{}');await assert.rejects(f.observation(),/request-drift/u);
  }finally{await f.close();}
});

test('argument hash is unambiguous with quotes, unicode, empty and escaped separators',()=>{
  assert.notEqual(argvDigest(['ab','c']),argvDigest(['a','bc']));assert.notEqual(argvDigest(['']),argvDigest([]));
  assert.match(argvDigest(['λ',"a'b",'1:x']),/^[a-f0-9]{64}$/u);
});

test('durable terminal ordering ignores Windows process-time granularity but rejects record reversal',async()=>{
  const f=await fixture('success');try{
    const run=await f.launch();assert.equal((await run.completion).exitCode,0);
    const supervisor=JSON.parse(await readFile(path.join(f.directory,'supervisor.json'),'utf8'));
    const startedPath=path.join(f.directory,'started.json'),started=JSON.parse(await readFile(startedPath,'utf8'));
    started.processStartedAt=new Date(Date.parse(supervisor.recordedAt)-1).toISOString();
    assert(Date.parse(started.processStartedAt)>=Date.parse(f.prepared.request.createdAt));
    await writeFile(startedPath,JSON.stringify(started));
    const terminalPath=path.join(f.directory,'terminal.json'),terminal=JSON.parse(await readFile(terminalPath,'utf8'));
    terminal.startedSha256=digest(await readFile(startedPath));terminal.result.ProcessStartedAt=started.processStartedAt;
    await writeFile(terminalPath,JSON.stringify(terminal));
    assert.equal((await f.observation()).status,'terminal');
    started.processStartedAt=new Date(Date.parse(started.recordedAt)+1).toISOString();
    await writeFile(startedPath,JSON.stringify(started));
    terminal.startedSha256=digest(await readFile(startedPath));terminal.result.ProcessStartedAt=started.processStartedAt;
    await writeFile(terminalPath,JSON.stringify(terminal));
    assert.equal((await f.observation()).status,'terminal');
    started.recordedAt=new Date(Date.parse(supervisor.recordedAt)-1).toISOString();
    await writeFile(startedPath,JSON.stringify(started));
    await assert.rejects(f.observation(),/m1-watchdog-started-binding/u);
  }finally{await f.close();}
});

test('launching controller really exits; independent watchdog retains deadline and stops its tree',async t=>{
  const f=await fixture('tree',{maximumMs:5000});try{
    const driver=path.join(f.base,'controller.mjs'),options={...f.options};delete options.assertOwnerPrivate;
    await writeFile(driver,`import{launchWatchdog}from${JSON.stringify(new URL('./watchdog.mjs',import.meta.url).href)};
import{access}from'node:fs/promises';
const options=${JSON.stringify(options)};options.assertOwnerPrivate=async()=>{};
await launchWatchdog(options);
const until=Date.now()+4000;let observed=false;
while(Date.now()<until){try{await access(${JSON.stringify(f.grand)});observed=true;break;}catch{}await new Promise(r=>setTimeout(r,20));}
process.exit(observed?0:3);`,{flag:'wx'});
    const controller=spawn(process.execPath,[driver],{windowsHide:true,stdio:'ignore'});
    const controllerCode=await new Promise((resolve,reject)=>{controller.on('error',reject);controller.on('exit',resolve);});
    t.diagnostic(JSON.stringify(await f.observation()));assert.equal(controllerCode,0);
    const grand=JSON.parse(await waitFor(f.grand)),side=JSON.parse(await waitFor(f.side));
    const terminal=JSON.parse(await waitFor(path.join(f.directory,'terminal.json'),10000));
    const actual=await f.observation();t.diagnostic(JSON.stringify({controllerPid:controller.pid,controllerStopped:!isRunning(controller.pid),actual}));
    assert.equal(actual.status,'needs-reconciliation');assert.equal(terminal.result.TimedOut,true);
    assert.equal(await stopConfirmed(grand.pid),true);assert.equal(await stopConfirmed(side.pid),true);
    assert.equal(await stopConfirmed(actual.records['supervisor.json'].processId),true);
    assert.equal(await stopConfirmed(actual.records['host.json'].processId),true);
  }finally{await f.close();}
});

for(const mode of ['throw','stall'])test('actual suspended-start observer '+mode+' never executes companion',async t=>{
  const f=await fixture('success'),pidFile=path.join(f.base,'suspended-pid.json');
  try{
    const script=`$ErrorActionPreference='Stop';Add-Type -Path '${ps(helperFile)}'
$observer=[Action[object]]{param($value) [IO.File]::WriteAllText('${ps(pidFile)}',($value|ConvertTo-Json -Compress));${mode==='throw'?"throw 'synthetic-observer-failure'":'Start-Sleep -Seconds 30'}}
try{[RunaAI.Next.M1.ClosedCompanionJob]::Run('${ps(process.execPath)}',@('${ps(f.program)}','success','${ps(f.side)}','${ps(f.grand)}'),'${ps(f.directory)}',[DateTimeOffset]::UtcNow.AddMilliseconds(1000).ToUnixTimeMilliseconds(),262144,$observer)|Out-Null}catch{}
exit 0
`;
    const started=Date.now(),run=spawnSync(POWERSHELL,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
      {windowsHide:true,encoding:'utf8',timeout:12000,maxBuffer:16384,env:{...process.env,PSModulePath:String.raw`C:\Windows\system32\WindowsPowerShell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules`}});
    assert.equal(run.error,undefined);assert.equal(run.status,mode==='stall'?124:0,run.stderr);
    const actual=JSON.parse(await readFile(pidFile));assert.equal(actual.CreatedSuspended,true);assert.equal(actual.AtomicJobAssigned,true);
    assert.equal(await stopConfirmed(actual.ProcessId),true);await assert.rejects(readFile(f.side),{code:'ENOENT'});
    t.diagnostic(JSON.stringify({mode,elapsedMs:Date.now()-started,actual,stopped:true,effectObserved:false}));
  }finally{await f.close();}
});
