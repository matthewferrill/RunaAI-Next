// Fixed trusted operator host, not a general process launcher. Run detached with
// no inherited pipes. Its ordinary PowerShell child stays in this Node host's
// libuv kill-on-close job; PowerShell owns the nested atomic companion job.
import {readFileSync,lstatSync,openSync,writeFileSync,fsyncSync,closeSync,readdirSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=value=>{if(!value)throw Error('unconfirmed');};
const powershell=String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`;
function plainDirectory(directory){check(path.isAbsolute(directory));for(let item=directory;item!==path.dirname(item);item=path.dirname(item))check(!lstatSync(item).isSymbolicLink());
  check(lstatSync(directory).isDirectory()&&path.resolve(realpathSync(directory)).toLowerCase()===path.resolve(directory).toLowerCase());}
const safeEnvironment=directory=>{const names=['ComSpec','LOCALAPPDATA','OS','PATHEXT','PROCESSOR_ARCHITECTURE','SystemDrive','SystemRoot','TEMP','TMP','WINDIR'];
  const entries=names.map(name=>[name,process.env[name]]);check(entries.every(([,value])=>typeof value==='string'&&value.length>0));const value=Object.fromEntries(entries);
  check(value.ComSpec.toLowerCase()===String.raw`c:\windows\system32\cmd.exe`&&value.OS==='Windows_NT'&&value.PROCESSOR_ARCHITECTURE==='AMD64'&&value.SystemDrive==='C:'
    &&value.SystemRoot.toLowerCase()===String.raw`c:\windows`&&value.WINDIR.toLowerCase()===String.raw`c:\windows`&&value.PATHEXT==='.COM;.EXE;.BAT;.CMD;.CPL'
    &&value.LOCALAPPDATA===path.join(directory,'host-localappdata')&&value.TEMP===path.join(directory,'host-temp')&&value.TMP===value.TEMP);
  plainDirectory(value.LOCALAPPDATA);plainDirectory(value.TEMP);return value;};
async function admissionBytes(){
  const chunks=[];let total=0;
  try{for await(const chunk of process.stdin){const bytes=Buffer.from(chunk);total+=bytes.length;if(total>32){bytes.fill(0);throw Error('unconfirmed');}chunks.push(bytes);}
    check(total===32);return Buffer.concat(chunks,total);
  }finally{for(const chunk of chunks)chunk.fill(0);}
}
// Even a failure before the request has been authenticated is finite. Once the
// PowerShell supervisor exists, terminating it closes its sole companion Job
// handle and therefore terminates the complete companion tree.
let supervisedChild=null,deadlineExpired=false;
const expire=()=>{deadlineExpired=true;if(supervisedChild){try{supervisedChild.kill();}catch{}}
  setTimeout(()=>process.exit(124),5000).unref();};
let deadlineTimer=setTimeout(expire,605000);
let admissionSecret=null;
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
  const v2=request.schemaVersion==='runaai-m1-watchdog-request/v2';
  check((v2||request.schemaVersion==='runaai-m1-watchdog-request/v1')&&request.supervisorExecutable===process.execPath
    &&/^[a-f0-9]{64}$/u.test(request.supervisorExecutableSha256)
    &&Number.isInteger(request.maximumMs)&&request.maximumMs>0&&request.maximumMs<=600000
    &&Date.parse(request.deadline)-Date.parse(request.createdAt)===request.maximumMs
    &&Date.now()>=Date.parse(request.createdAt)&&Date.now()<Date.parse(request.deadline));
  // The request deadline ends child work. The independently pinned cleanup
  // allowance remains available for job termination and durable evidence.
  clearTimeout(deadlineTimer);deadlineTimer=setTimeout(expire,Math.max(1,Date.parse(request.deadline)+5000-Date.now()));
  check(hash(bytes(process.execPath,104857600))===request.supervisorExecutableSha256);
  const wrapper=path.join(path.dirname(self),'Invoke-ClosedCompanionWatchdog.ps1'),helper=path.join(path.dirname(self),'ClosedCompanionJob.cs');
  for(const [file,pin]of [[self,hostSha256],[wrapper,wrapperSha256],[helper,helperSha256]]){
    check(hash(bytes(file,1048576))===pin&&request.pins.some(item=>item.path===file&&item.sha256===pin));
  }
  check(hash(bytes(powershell,104857600,2))===powershellSha256);
  check(readdirSync(directory).sort().join(',')===(v2?'host-localappdata,host-temp,request.json':'request.json'));
  admissionSecret=v2?await admissionBytes():null;
  const record={schemaVersion:v2?'runaai-m1-watchdog-host/v2':'runaai-m1-watchdog-host/v1',operationId:request.operationId,requestSha256,processId:process.pid,
    executableSha256:request.supervisorExecutableSha256,hostSha256,wrapperSha256,helperSha256,powershellSha256,recordedAt:new Date().toISOString()};
  const handle=openSync(path.join(directory,'host.json'),'wx');
  try{writeFileSync(handle,JSON.stringify(record));fsyncSync(handle);}finally{closeSync(handle);}
  const child=spawn(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',wrapper,
    '-RequestFile',requestFile,'-ExpectedRequestSha256',requestSha256,'-ExpectedHelperSha256',helperSha256],
    {windowsHide:true,detached:false,stdio:[v2?'pipe':'ignore','pipe','pipe'],env:v2?{...safeEnvironment(directory),
      PSModulePath:String.raw`C:\Windows\system32\WindowsPowerShell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules`}
      :{...process.env,NODE_OPTIONS:'',NODE_PATH:'',PSModulePath:String.raw`C:\Windows\system32\WindowsPowerShell\v1.0\Modules;C:\Program Files\WindowsPowerShell\Modules`}});
  supervisedChild=child;
  if(v2){await new Promise((resolve,reject)=>child.stdin.end(admissionSecret,error=>error?reject(error):resolve()));
    admissionSecret.fill(0);admissionSecret=null;}
  let outputBytes=0,outputLimited=false;
  const discard=chunk=>{outputBytes=Math.min(Number.MAX_SAFE_INTEGER,outputBytes+chunk.length);if(outputBytes>16384)outputLimited=true;};
  child.stdout.on('data',discard);child.stderr.on('data',discard);
  child.on('error',()=>process.exitCode=2);child.on('close',code=>{clearTimeout(deadlineTimer);process.exit(deadlineExpired?124:code===0&&!outputLimited?0:2);});
}catch{admissionSecret?.fill(0);process.exit(2);}
