// Fixed trusted operator host, not a general process launcher. Run detached with
// no inherited pipes. Its ordinary PowerShell child stays in this Node host's
// libuv kill-on-close job; PowerShell owns the nested atomic companion job.
import {readFileSync,lstatSync,openSync,writeFileSync,fsyncSync,closeSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=value=>{if(!value)throw Error('unconfirmed');};
const powershell=String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`;
// Even a failure before the request has been authenticated is finite.
let deadlineTimer=setTimeout(()=>process.exit(124),605000);
function bytes(file,maximum,links=1){
  check(path.isAbsolute(file));
  for(let item=file;item!==path.dirname(item);item=path.dirname(item))check(!lstatSync(item).isSymbolicLink());
  const before=lstatSync(file);check(before.isFile()&&before.nlink===links&&before.size>0&&before.size<=maximum);
  const raw=readFileSync(file),after=lstatSync(file);
  check(raw.length===before.size&&before.ino===after.ino&&before.mtimeMs===after.mtimeMs&&after.nlink===links);return raw;
}
try{
  const [requestFile,requestSha256,wrapperSha256,helperSha256,hostSha256,powershellSha256]=process.argv.slice(2);
  check(process.argv.length===8&&[requestSha256,wrapperSha256,helperSha256,hostSha256,powershellSha256].every(pin=>/^[a-f0-9]{64}$/u.test(pin)));
  const self=fileURLToPath(import.meta.url),directory=path.dirname(requestFile);
  check(path.basename(self)==='Watchdog-Host.mjs'&&path.basename(requestFile)==='request.json');
  const raw=bytes(requestFile,65536);check(hash(raw)===requestSha256);const request=JSON.parse(raw);
  check(request.schemaVersion==='runaai-m1-watchdog-request/v1'&&request.supervisorExecutable===process.execPath
    &&/^[a-f0-9]{64}$/u.test(request.supervisorExecutableSha256)
    &&Number.isInteger(request.maximumMs)&&request.maximumMs>0&&request.maximumMs<=600000
    &&Date.parse(request.deadline)-Date.parse(request.createdAt)===request.maximumMs
    &&Date.now()>=Date.parse(request.createdAt)&&Date.now()<Date.parse(request.deadline));
  clearTimeout(deadlineTimer);deadlineTimer=setTimeout(()=>process.exit(124),Math.max(1,Date.parse(request.deadline)+5000-Date.now()));
  check(hash(bytes(process.execPath,104857600))===request.supervisorExecutableSha256);
  const wrapper=path.join(path.dirname(self),'Invoke-ClosedCompanionWatchdog.ps1'),helper=path.join(path.dirname(self),'ClosedCompanionJob.cs');
  for(const [file,pin]of [[self,hostSha256],[wrapper,wrapperSha256],[helper,helperSha256]]){
    check(hash(bytes(file,1048576))===pin&&request.pins.some(item=>item.path===file&&item.sha256===pin));
  }
  check(hash(bytes(powershell,104857600,2))===powershellSha256);
  check(readdirSync(directory).length===1);
  const record={schemaVersion:'runaai-m1-watchdog-host/v1',operationId:request.operationId,requestSha256,processId:process.pid,
    executableSha256:request.supervisorExecutableSha256,hostSha256,wrapperSha256,helperSha256,powershellSha256,recordedAt:new Date().toISOString()};
  const handle=openSync(path.join(directory,'host.json'),'wx');
  try{writeFileSync(handle,JSON.stringify(record));fsyncSync(handle);}finally{closeSync(handle);}
  const child=spawn(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',wrapper,
    '-RequestFile',requestFile,'-ExpectedRequestSha256',requestSha256,'-ExpectedHelperSha256',helperSha256],
    {windowsHide:true,detached:false,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_OPTIONS:'',NODE_PATH:'',
      PSModulePath:String.raw`C:\Windows\system32\WindowsPowerShell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules`}});
  let outputBytes=0;
  const discard=chunk=>{outputBytes+=chunk.length;if(outputBytes>16384)process.exit(2);};
  child.stdout.on('data',discard);child.stderr.on('data',discard);
  child.on('error',()=>process.exit(2));child.on('close',code=>process.exit(code===0?0:2));
}catch{process.exit(2);}
