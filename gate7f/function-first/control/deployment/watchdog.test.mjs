import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,readdir,rm,rmdir,unlink,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {digest,argvDigest,packageDigest,POWERSHELL,prepareWatchdogRequest,launchWatchdog,inspectWatchdog} from './watchdog.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
const wrapperFile=path.join(root,'Invoke-ClosedCompanionWatchdog.ps1'),helperFile=path.join(root,'ClosedCompanionJob.cs'),hostFile=path.join(root,'Watchdog-Host.mjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ps=value=>value.replaceAll("'","''");
assert.equal(process.version,'v22.22.0','pinned supervisor Node runtime drift');
const compilerPreflight=spawnSync(POWERSHELL,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',
  `$ErrorActionPreference='Stop';if($PSVersionTable.PSVersion.Major-ne5-or$PSVersionTable.PSVersion.Minor-ne1){throw 'm1-supervisor-powershell-version'};`
  +`$raw=[IO.File]::ReadAllBytes('${ps(helperFile)}');Add-Type -TypeDefinition ([Text.UTF8Encoding]::new($false,$true).GetString($raw))`],
  {windowsHide:true,encoding:'utf8',timeout:10000,env:{...process.env,PSModulePath:String.raw`C:\Windows\system32\WindowsPowerShell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules`}});
assert.equal(compilerPreflight.status,0,'pinned Windows PowerShell 5.1 Add-Type preflight failed: '+compilerPreflight.stderr);
const privateHook=async()=>{}; // Wrapper itself verifies real ACL/owner on every record.
const compactObservation=value=>({status:value.status,terminalRetained:value.terminalRetained,
  failureStage:value.records?.['failure.json']?.stage??null,failureCode:value.records?.['failure.json']?.errorCode??null,
  outcome:value.records?.['terminal.json']?.outcome??null,processId:value.result?.ProcessId??null,exitCode:value.result?.ExitCode??null,
  timedOut:value.result?.TimedOut??null,outputLimited:value.result?.OutputLimited??null,activeProcesses:value.result?.ActiveProcesses??null});
async function waitFor(file,ms=10000){const until=Date.now()+ms;while(Date.now()<until){try{return await readFile(file,'utf8');}catch(error){if(!['ENOENT','EBUSY','EPERM'].includes(error.code))throw error;}await sleep(20);}throw Error('test-observation-timeout');}
function isRunning(pid){try{process.kill(pid,0);return true;}catch{return false;}}
async function stopConfirmed(pid){for(let n=0;n<100;n++){if(!isRunning(pid))return true;await sleep(20);}return false;}
async function fixture(mode,{maximumMs=7000,maximumBytes=262144,v2=false,largeManifest=false,bootstrapMode='ack',phase='eligibility'}={}){
  const base=await mkdtemp(path.join(tmpdir(),'m1-supervisor-')),directory=path.join(base,'journal'),localappdata=path.join(base,'localappdata'),temp=path.join(base,'temp');
  await mkdir(directory);await mkdir(localappdata);await mkdir(temp);
  const acl=`$ErrorActionPreference='Stop';foreach($p in @('${ps(base)}','${ps(directory)}','${ps(localappdata)}','${ps(temp)}')){$a=[Security.AccessControl.DirectorySecurity]::new();$a.SetAccessRuleProtection($true,$false);foreach($s in @('S-1-5-18','S-1-5-32-544',[Security.Principal.WindowsIdentity]::GetCurrent().User.Value)){$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($s),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};Set-Acl -LiteralPath $p -AclObject $a}`;
  const init=spawnSync(POWERSHELL,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(acl,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',timeout:10000,
    env:{...process.env,PSModulePath:String.raw`C:\Windows\system32\WindowsPowerShell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules`}});
  assert.equal(init.status,0,init.stderr);
  const program=path.join(base,'synthetic.cjs'),bootstrap=path.join(base,'native-gate3-control-node-bootstrap.mjs'),side=path.join(base,'effect.json'),grand=path.join(base,'grandchild.json');
  await writeFile(program,`const fs=require('node:fs'),{spawn}=require('node:child_process'),{createHash,createHmac,timingSafeEqual}=require('node:crypto');
const mode=process.argv[2],side=process.argv[3],grand=process.argv[4];
if(process.env.RUNAAI_GATE3_CONTROL_PHASE){const chunks=[];process.stdin.on('data',chunk=>chunks.push(chunk));process.stdin.on('end',()=>{const wire=Buffer.concat(chunks),secret=wire.subarray(0,32),mac=wire.subarray(32),binding=Buffer.from(['runaai-native-gate3-control-launch-capability/v1',process.env.RUNAAI_GATE3_CONTROL_PHASE,process.env.RUNAAI_GATE3_EXPECTED_ENVELOPE_SHA256,'-',String(process.ppid),String(process.pid)].join('\\0'),'ascii'),expected=createHmac('sha256',secret).update(binding).digest(),authenticated=mac.length===32&&timingSafeEqual(mac,expected)&&!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&!process.env.OPENSSL_CONF;console.log(JSON.stringify({schemaVersion:'runaai-m1-supervisor-child-ack/v1',phase:process.env.RUNAAI_GATE3_CONTROL_PHASE,envelopeSha256:process.env.RUNAAI_GATE3_EXPECTED_ENVELOPE_SHA256,eligibilitySealSha256:null,supervisorProcessId:Number(process.env.RUNAAI_GATE3_CONTROL_LAUNCHER_PID),childProcessId:process.pid,capabilitySha256:createHash('sha256').update(wire).digest('hex'),manifestSha256:process.env.RUNAAI_GATE3_MANIFEST_SHA256,packageSha256:process.env.RUNAAI_GATE3_PACKAGE_SHA256,nodeVersion:process.version,consumed:authenticated,eofObserved:true,privateValuesIncluded:false}));wire.fill(0);expected.fill(0);});}
else if(mode==='grandchild'){fs.writeFileSync(grand,JSON.stringify({pid:process.pid}));setInterval(()=>{},1000);}
else {fs.writeFileSync(side,JSON.stringify({pid:process.pid,argv:process.argv.slice(5)}));
 if(mode==='tree'){spawn(process.execPath,[__filename,'grandchild',side,grand],{windowsHide:true,stdio:'ignore'});setInterval(()=>{},1000);}
 else if(mode==='terminal-loss'){fs.mkdirSync(process.argv[5]);console.log(JSON.stringify({complete:true}));}
 else if(mode==='stdout'){process.stdout.write('x'.repeat(1000000));setInterval(()=>{},1000);}
 else if(mode==='stderr'){process.stderr.write('PRIVATE-NEVER-EXPORT'.repeat(100000));setInterval(()=>{},1000);}
 else {process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({complete:true,stdin:'eof'})));}}
`,{flag:'wx'});
  await writeFile(bootstrap,`import{createHash,createHmac,timingSafeEqual}from'node:crypto';const mode=${JSON.stringify(bootstrapMode)};
if(mode==='ignore')process.exit(0);
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);const wire=Buffer.concat(chunks),secret=wire.subarray(0,32),mac=wire.subarray(32);
const eligibility=process.env.RUNAAI_GATE3_EXPECTED_ELIGIBILITY_SEAL_SHA256??null;
const binding=Buffer.from(['runaai-native-gate3-control-launch-capability/v1',process.env.RUNAAI_GATE3_CONTROL_PHASE,process.env.RUNAAI_GATE3_EXPECTED_ENVELOPE_SHA256,eligibility??'-',String(process.ppid),String(process.pid)].join('\\0'),'ascii');
const expected=createHmac('sha256',secret).update(binding).digest(),consumed=mode!=='truncate'&&wire.length===64&&timingSafeEqual(mac,expected)&&!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&!process.env.OPENSSL_CONF;
const ack=JSON.stringify({schemaVersion:'runaai-m1-supervisor-child-ack/v1',phase:process.env.RUNAAI_GATE3_CONTROL_PHASE,envelopeSha256:process.env.RUNAAI_GATE3_EXPECTED_ENVELOPE_SHA256,eligibilitySealSha256:eligibility,supervisorProcessId:Number(process.env.RUNAAI_GATE3_CONTROL_LAUNCHER_PID),childProcessId:process.pid,capabilitySha256:createHash('sha256').update(wire).digest('hex'),manifestSha256:process.env.RUNAAI_GATE3_MANIFEST_SHA256,packageSha256:process.env.RUNAAI_GATE3_PACKAGE_SHA256,nodeVersion:process.version,consumed,eofObserved:true,privateValuesIncluded:false});
process.stdout.write((mode==='exfiltrate'?wire.toString('hex')+'\\n':'')+ack+'\\n');if(mode==='stderr')process.stderr.write('reviewed-direct-stderr\\n');wire.fill(0);expected.fill(0);binding.fill(0);
`,{flag:'wx'});
  const entrypoint=v2?bootstrap:program,args=v2?['--no-warnings',entrypoint]:[program,mode,side,grand,...(mode==='terminal-loss'?[path.join(directory,'terminal.json')]:['a b','quote"slash\\',"apostrophe'",'λ'])];
  const roleFor=file=>file===process.execPath?'node-runtime':file===entrypoint?'control-bootstrap':file===hostFile?'supervisor-host':file===wrapperFile?'supervisor-wrapper':'supervisor-helper';
  const memberFiles=v2?[process.execPath,entrypoint,hostFile,wrapperFile,helperFile]:[program,wrapperFile,helperFile,hostFile];
  const memberPins=await Promise.all(memberFiles.map(async file=>({path:file,sha256:digest(await readFile(file))})));
  const manifest=path.join(base,'complete-manifest.json');await writeFile(manifest,JSON.stringify({schemaVersion:'runaai-native-gate3-supervisor-package/v1',
    members:v2?memberPins.map(pin=>({role:roleFor(pin.path),...pin})):[],privateValuesIncluded:false})+(largeManifest?' '.repeat(1100000):''));
  let pins=v2?[...memberPins,{path:manifest,sha256:digest(await readFile(manifest))}]:memberPins;
  if(v2)pins=pins.sort((left,right)=>left.path.toLowerCase()<right.path.toLowerCase()?-1:1);
  const environment={ComSpec:String.raw`C:\Windows\System32\cmd.exe`,LOCALAPPDATA:localappdata,OS:'Windows_NT',PATHEXT:'.COM;.EXE;.BAT;.CMD',
    PROCESSOR_ARCHITECTURE:'AMD64',SystemDrive:'C:',SystemRoot:String.raw`C:\Windows`,TEMP:temp,TMP:temp,WINDIR:String.raw`C:\Windows`,RUNAAI_GATE3_RESOURCE_PROOF_METHOD:'d'.repeat(32)};
  const prepared=await prepareWatchdogRequest({directory,transitionId:'b'.repeat(32),descriptorSha256:'c'.repeat(64),packageSha256:v2?packageDigest(pins):digest(JSON.stringify(pins)),
    executable:process.execPath,executableSha256:digest(await readFile(process.execPath)),supervisorExecutable:process.execPath,
    supervisorExecutableSha256:digest(await readFile(process.execPath)),arguments:args,pins,maximumMs,maximumBytes,assertOwnerPrivate:privateHook,
    ...(v2?{admission:{phase,envelopeSha256:'e'.repeat(64),eligibilitySealSha256:phase==='resource-proof'?'f'.repeat(64):null},environment,
      entrypoint:{path:entrypoint,sha256:pins.find(pin=>pin.path===entrypoint).sha256},
      manifest:{path:manifest,sha256:pins.find(pin=>pin.path===manifest).sha256}}:{})});
  const options={prepared,wrapperFile,helperFile,hostFile,hostSha256:digest(await readFile(hostFile)),wrapperSha256:digest(await readFile(wrapperFile)),helperSha256:digest(await readFile(helperFile)),
    powershellSha256:digest(await readFile(POWERSHELL)),assertOwnerPrivate:privateHook,
    ...(v2?{createOwnerPrivate:mkdir}:{})};
  const observation=()=>inspectWatchdog({directory,requestSha256:prepared.requestSha256,assertOwnerPrivate:privateHook});
  let launched;
  return {base,directory,side,grand,program,entrypoint,prepared,options,observation,
    async launch(){launched=await launchWatchdog(options);return launched;},
    async close({preserve=false}={}){if(launched&&isRunning(launched.child.pid)){launched.child.kill();await launched.completion;}
      for(const file of [side,grand])try{const value=JSON.parse(await readFile(file));if(isRunning(value.pid)){process.kill(value.pid);await stopConfirmed(value.pid);}}catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;}
      if(preserve)return;
      assert.ok(path.resolve(base).startsWith(path.resolve(tmpdir())+path.sep));
      await rm(base,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
  };
}

test('atomic job starts suspended, records identity, inherits only stdin EOF, returns exact complete output',async t=>{
  const f=await fixture('success');try{const run=await f.launch();const completed=await run.completion;assert.equal(completed.exitCode,0);
    const actual=await f.observation();t.diagnostic(JSON.stringify(compactObservation(actual)));assert.equal(actual.status,'terminal');assert.equal(actual.result.ExitCode,0);
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
    assert.equal((await run.completion).status,'needs-reconciliation');const actual=await f.observation();t.diagnostic(JSON.stringify(compactObservation(actual)));
    assert.equal(actual.status,'needs-reconciliation');assert.equal(actual.result.TimedOut,true);assert.equal(actual.result.ActiveProcesses,0);
    assert.equal(await stopConfirmed(grand.pid),true);assert.equal(isRunning(sentinel.pid),true);
    await assert.rejects(prepareWatchdogRequest({...f.prepared.request,directory:f.directory,assertOwnerPrivate:privateHook}),/existing-operation/u);
    await assert.rejects(launchWatchdog(f.options),/expired/u);
    assert.equal((await f.observation()).records['started.json'].processId,actual.records['started.json'].processId);
  }finally{sentinel.kill();await f.close();}
});

for(const mode of ['stdout','stderr'])test('actual '+mode+' cap stays unknown, bounded and stopped',async t=>{
  const f=await fixture(mode,{maximumBytes:1024});try{const run=await f.launch();await run.completion;
    const actual=await f.observation();t.diagnostic(JSON.stringify(compactObservation(actual)));assert.equal(actual.status,'needs-reconciliation');
    assert.equal(actual.result.OutputLimited,true);assert.equal(actual.result.Stdout,'');assert.equal(actual.result.ActiveProcesses,0);
    assert.ok(!JSON.stringify(actual).includes('PRIVATE-NEVER-EXPORT'));
  }finally{await f.close();}
});

test('actual watchdog crash closes its noninherited job and stops descendants, leaving no fabricated terminal',async t=>{
  const f=await fixture('tree');try{const run=await f.launch(),grand=JSON.parse(await waitFor(f.grand)),side=JSON.parse(await waitFor(f.side));
    run.child.kill();await run.completion;
    assert.equal(await stopConfirmed(grand.pid),true);assert.equal(await stopConfirmed(side.pid),true);
    const actual=await f.observation();t.diagnostic(JSON.stringify(compactObservation(actual)));assert.equal(actual.status,'needs-reconciliation');assert.equal(actual.terminalRetained,false);
    assert.equal(await stopConfirmed(actual.records['supervisor.json'].processId),true);
  }finally{await f.close();}
});

test('actual effect followed by lost terminal cannot be accepted by fresh observer',async t=>{
  const f=await fixture('terminal-loss');try{const run=await f.launch();await run.completion;
    assert.ok(JSON.parse(await readFile(f.side)).pid>0);await assert.rejects(f.observation(),/file-boundary/u);
    await rmdir(path.join(f.directory,'terminal.json'));
    const actual=await f.observation();t.diagnostic(JSON.stringify(compactObservation(actual)));assert.equal(actual.status,'needs-reconciliation');assert.equal(actual.terminalRetained,false);
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

test('v2 launch rejects a missing private provisioner before creating host support directories',async()=>{
  const f=await fixture('success',{v2:true});try{const options={...f.options};delete options.createOwnerPrivate;
    await assert.rejects(launchWatchdog(options),/private-provisioner/u);
    assert.deepEqual(await readdir(f.directory),['request.json']);
  }finally{await f.close();}
});

test('v2 writes one 64-byte bound admission before resume and uses only the replacement environment',async t=>{
  const f=await fixture('v2',{v2:true});let passed=false;try{const run=await f.launch(),completed=await run.completion;
    const actual=await f.observation();t.diagnostic(JSON.stringify(compactObservation(actual)));assert.equal(completed.exitCode,0);
    assert.equal(f.prepared.request.schemaVersion,'runaai-m1-watchdog-request/v3');
    const output=actual.result.Acknowledgement;
    assert.equal(actual.status,'terminal');assert.equal(actual.result.AdmissionWritten,true);assert.equal(actual.result.ProcessAbsent,true);
    assert.equal(actual.result.TreeAbsent,true);assert.equal(actual.result.ExitCodeObserved,true);
    assert.equal(actual.result.StderrBytes,0);assert.equal(actual.result.StderrClassification,'none');assert.match(actual.result.StderrSha256,/^[a-f0-9]{64}$/u);
    assert.equal(actual.result.AcknowledgementCandidateValid,true);assert.equal(actual.result.AcknowledgementCandidateSha256,actual.result.StdoutSha256);
    assert.equal(output.consumed,true);assert.equal(output.phase,'eligibility');assert.equal(output.envelopeSha256,'e'.repeat(64));
    assert.ok(Number.isInteger(output.supervisorProcessId)&&output.supervisorProcessId>0);passed=true;
  }finally{await f.close({preserve:!passed});if(!passed)t.diagnostic('preserved failure journal: '+f.base);}
});

test('legacy v2 request is read-only and cannot be newly launched',async()=>{
  const f=await fixture('v2',{v2:true});try{
    const request={...f.prepared.request,schemaVersion:'runaai-m1-watchdog-request/v2',arguments:[f.entrypoint],argumentsSha256:argvDigest([f.entrypoint])};
    const raw=Buffer.from(JSON.stringify(request));await writeFile(f.prepared.requestFile,raw);
    const prepared={...f.prepared,request,requestSha256:digest(raw)};
    await assert.rejects(launchWatchdog({...f.options,prepared}),/legacy-request-read-only/u);
    assert.deepEqual(await readdir(f.directory),['request.json']);
  }finally{await f.close();}
});

test('direct host and wrapper entrypoints reject a legacy v2 request before execution',async()=>{
  for(const boundary of ['host','wrapper']){const f=await fixture('v2',{v2:true});try{
    const request={...f.prepared.request,schemaVersion:'runaai-m1-watchdog-request/v2',arguments:[f.entrypoint],argumentsSha256:argvDigest([f.entrypoint])};
    const raw=Buffer.from(JSON.stringify(request));await writeFile(f.prepared.requestFile,raw);const requestSha256=digest(raw);
    const completed=boundary==='host'
      ?spawnSync(process.execPath,[hostFile,f.prepared.requestFile,requestSha256,f.options.wrapperSha256,f.options.helperSha256,
        f.options.hostSha256,f.options.powershellSha256],{windowsHide:true,encoding:'utf8',timeout:10000})
      :spawnSync(POWERSHELL,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',wrapperFile,'-RequestFile',f.prepared.requestFile,
        '-ExpectedRequestSha256',requestSha256,'-ExpectedHelperSha256',f.options.helperSha256],{windowsHide:true,encoding:'utf8',timeout:10000,
        env:{...process.env,PSModulePath:String.raw`C:\Windows\system32\WindowsPowerShell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules`}});
    assert.equal(completed.status,2,boundary+' accepted a legacy v2 request');
    assert.ok(!completed.error,boundary+' did not terminate cleanly');
  }finally{await f.close();}}
});

test('historical v2 request and terminal remain read-only inspectable',async()=>{
  const f=await fixture('v2',{v2:true});try{const run=await f.launch();assert.equal((await run.completion).exitCode,0);
    const request={...f.prepared.request,schemaVersion:'runaai-m1-watchdog-request/v2',arguments:[f.entrypoint],argumentsSha256:argvDigest([f.entrypoint])};
    const requestRaw=Buffer.from(JSON.stringify(request));await writeFile(f.prepared.requestFile,requestRaw);const requestSha256=digest(requestRaw);
    const hostFilePath=path.join(f.directory,'host.json'),host=JSON.parse(await readFile(hostFilePath));host.requestSha256=requestSha256;
    await writeFile(hostFilePath,JSON.stringify(host));const hostSha256=digest(await readFile(hostFilePath));
    const intentFile=path.join(f.directory,'intent.json'),intent=JSON.parse(await readFile(intentFile));intent.requestSha256=requestSha256;intent.argumentsSha256=request.argumentsSha256;
    await writeFile(intentFile,JSON.stringify(intent));const intentSha256=digest(await readFile(intentFile));
    const supervisorFile=path.join(f.directory,'supervisor.json'),supervisor=JSON.parse(await readFile(supervisorFile));supervisor.hostSha256=hostSha256;supervisor.intentSha256=intentSha256;
    await writeFile(supervisorFile,JSON.stringify(supervisor));const supervisorSha256=digest(await readFile(supervisorFile));
    const startedFile=path.join(f.directory,'started.json'),started=JSON.parse(await readFile(startedFile));started.intentSha256=intentSha256;started.supervisorSha256=supervisorSha256;
    await writeFile(startedFile,JSON.stringify(started));const startedSha256=digest(await readFile(startedFile));
    const terminalFile=path.join(f.directory,'terminal.json'),terminal=JSON.parse(await readFile(terminalFile));terminal.schemaVersion='runaai-m1-watchdog-terminal/v2';
    terminal.intentSha256=intentSha256;terminal.supervisorSha256=supervisorSha256;terminal.startedSha256=startedSha256;
    for(const key of ['StdoutSha256','StderrSha256','StderrClassification','AcknowledgementCandidateValid','AcknowledgementCandidateSha256'])delete terminal.result[key];
    await writeFile(terminalFile,JSON.stringify(terminal));
    const observed=await inspectWatchdog({directory:f.directory,requestSha256,assertOwnerPrivate:privateHook});
    assert.equal(observed.status,'terminal');assert.equal(observed.records['terminal.json'].schemaVersion,'runaai-m1-watchdog-terminal/v2');
  }finally{await f.close();}
});

test('v2 rejects incomplete admission, environment, and manifest bindings before launch',async()=>{
  const f=await fixture('v2',{v2:true});try{
    const badDirectory=path.join(f.base,'bad-journal');await mkdir(badDirectory);
    const bad={...f.prepared.request,environment:{...f.prepared.request.environment,NODE_OPTIONS:'--require bad'}};
    await assert.rejects(prepareWatchdogRequest({...bad,directory:badDirectory,assertOwnerPrivate:privateHook}),/environment/u);
    const wrongDirectory=path.join(f.base,'wrong-journal');await mkdir(wrongDirectory);
    await assert.rejects(prepareWatchdogRequest({...f.prepared.request,directory:wrongDirectory,
      environment:{...f.prepared.request.environment,ComSpec:String.raw`C:\untrusted\cmd.exe`},assertOwnerPrivate:privateHook}),/environment-values/u);
    const extraDirectory=path.join(f.base,'extra-journal');await mkdir(extraDirectory);
    const extraPins=[...f.prepared.request.pins,{path:f.program,sha256:digest(await readFile(f.program))}]
      .sort((left,right)=>left.path.toLowerCase()<right.path.toLowerCase()?-1:1);
    await assert.rejects(prepareWatchdogRequest({...f.prepared.request,directory:extraDirectory,pins:extraPins,
      packageSha256:packageDigest(extraPins),assertOwnerPrivate:privateHook}),/package-membership/u);
    const duplicateDirectory=path.join(f.base,'duplicate-journal'),decoyDirectory=path.join(f.base,'decoy'),decoyHost=path.join(decoyDirectory,'Watchdog-Host.mjs');
    await mkdir(duplicateDirectory);await mkdir(decoyDirectory);await writeFile(decoyHost,await readFile(hostFile));
    const duplicatePins=[...f.prepared.request.pins.filter(pin=>pin.path!==helperFile),{path:decoyHost,sha256:digest(await readFile(decoyHost))}]
      .sort((left,right)=>left.path.toLowerCase()<right.path.toLowerCase()?-1:1);
    await assert.rejects(prepareWatchdogRequest({...f.prepared.request,directory:duplicateDirectory,pins:duplicatePins,
      packageSha256:packageDigest(duplicatePins),assertOwnerPrivate:privateHook}),/manifest-role-pin/u);
    const missingDirectory=path.join(f.base,'missing-journal');await mkdir(missingDirectory);
    await assert.rejects(prepareWatchdogRequest({...f.prepared.request,directory:missingDirectory,
      manifest:{path:f.program,sha256:'0'.repeat(64)},assertOwnerPrivate:privateHook}),/manifest-binding/u);
    for(const [index,args]of [[0,[f.entrypoint]],[1,[f.entrypoint,'--no-warnings']],[2,['--trace-warnings',f.entrypoint]]]){
      const flagDirectory=path.join(f.base,'flag-journal-'+index);await mkdir(flagDirectory);
      await assert.rejects(prepareWatchdogRequest({...f.prepared.request,directory:flagDirectory,arguments:args,
        argumentsSha256:argvDigest(args),assertOwnerPrivate:privateHook}),/entrypoint/u);
    }
  }finally{await f.close();}
});

test('v2 direct native entrypoint cannot restore ambient environment inheritance',()=>{
  const script=`$ErrorActionPreference='Stop';Add-Type -Path '${ps(helperFile)}';$secret=New-Object byte[] 32;$observer=[Action[object]]{param($value)}
try{[RunaAI.Next.M1.ClosedCompanionJob]::RunV2('${ps(process.execPath)}',@(),[IO.Path]::GetTempPath(),$null,[DateTimeOffset]::UtcNow.AddSeconds(5).ToUnixTimeMilliseconds(),1024,$secret,'eligibility','${'e'.repeat(64)}','-',$observer)|Out-Null;exit 3}catch{if($_.Exception.InnerException.Message-ceq'm1-supervisor-environment'-or$_.Exception.Message-ceq'm1-supervisor-environment'){exit 0};Write-Error $_.Exception.Message;exit 4}`;
  const result=spawnSync(POWERSHELL,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
    {windowsHide:true,encoding:'utf8',timeout:10000,env:{...process.env,PSModulePath:String.raw`C:\Windows\system32\WindowsPowerShell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules`}});
  assert.equal(result.status,0,result.stderr);
});

test('v2 host launch rejects an occupied derived scratch path before spawning',async()=>{
  const f=await fixture('v2',{v2:true});try{await writeFile(path.join(f.directory,'host-temp'),'occupied');
    await assert.rejects(f.launch(),/existing-operation/u);
  }finally{await f.close();}
});

test('v2 resource-proof acknowledgement binds the eligibility seal',async()=>{
  const f=await fixture('v2',{v2:true,phase:'resource-proof'});try{const run=await f.launch(),completed=await run.completion;
    const actual=await f.observation();assert.equal(completed.exitCode,0);assert.equal(actual.status,'terminal');assert.equal(actual.result.Acknowledgement.phase,'resource-proof');
    assert.equal(actual.result.Acknowledgement.eligibilitySealSha256,'f'.repeat(64));
  }finally{await f.close();}
});

test('v2 authenticates a manifest larger than the former one MiB pin ceiling',async()=>{
  const f=await fixture('v2',{v2:true,largeManifest:true});try{const run=await f.launch(),completed=await run.completion;
    const actual=await f.observation();assert.equal(completed.exitCode,0);assert.equal(actual.status,'terminal');
  }finally{await f.close();}
});

for(const bootstrapMode of ['ignore','truncate','exfiltrate','stderr'])test('v2 child '+bootstrapMode+' cannot authorize or durably publish raw output',async()=>{
  const f=await fixture('v2',{v2:true,bootstrapMode});try{const run=await f.launch();await run.completion;
    const actual=await f.observation();assert.equal(actual.status,'needs-reconciliation');assert.equal(actual.result.AdmissionAcknowledged,false);
    assert.equal(Object.hasOwn(actual.result,'Stdout'),false);assert.equal(actual.result.Acknowledgement,null);
    if(bootstrapMode==='stderr'){assert.equal(actual.result.AcknowledgementCandidateValid,true);assert.ok(actual.result.StderrBytes>0);
      assert.match(actual.result.StderrSha256,/^[a-f0-9]{64}$/u);assert.equal(actual.result.StderrClassification,'unclassified');
      const retained=await Promise.all((await readdir(f.directory)).filter(name=>name.endsWith('.json')).map(name=>readFile(path.join(f.directory,name),'utf8')));
      assert.ok(!JSON.stringify(actual).includes('reviewed-direct-stderr'));assert.ok(!retained.join('\n').includes('reviewed-direct-stderr'));}
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
    t.diagnostic(JSON.stringify(compactObservation(await f.observation())));assert.equal(controllerCode,0);
    const grand=JSON.parse(await waitFor(f.grand)),side=JSON.parse(await waitFor(f.side));
    const terminal=JSON.parse(await waitFor(path.join(f.directory,'terminal.json'),10000));
    const actual=await f.observation();t.diagnostic(JSON.stringify({controllerPid:controller.pid,controllerStopped:!isRunning(controller.pid),actual:compactObservation(actual)}));
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
    t.diagnostic(JSON.stringify({mode,elapsedMs:Date.now()-started,actual:compactObservation(actual),stopped:true,effectObserved:false}));
  }finally{await f.close();}
});
