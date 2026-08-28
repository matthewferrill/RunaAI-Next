import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha,demand} from './tls-primitives.mjs';
import {tlsTransportRequest} from './tls-enrollment-operator.mjs';
const sourceRoot=path.dirname(fileURLToPath(import.meta.url));
const ID=/^[a-f0-9]{32}$/,HASH=/^[a-f0-9]{64}$/;
const sources=['Run-HomeOwnerStatus.ps1','Runtime-Windows.ps1'];
const taskName=id=>'Runa-M1-OwnerStatus-'+id;
const rootName=id=>'C:\\Users\\codex-audit\\AppData\\Local\\RunaM1Readiness\\owner-status-'+id;
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export function prepareOwnerStatus(directory,id=randomBytes(16).toString('hex')){
 demand(path.isAbsolute(directory)&&!existsSync(directory)&&ID.test(id),'owner-status-prepare');
 const parent=lstatSync(path.dirname(directory));demand(parent.isDirectory()&&!parent.isSymbolicLink(),'owner-status-parent');
 const files=Object.fromEntries(sources.map(name=>[name,readFileSync(path.join(sourceRoot,name))]));
 const manifest={schemaVersion:'runaai-owner-status-package/v1',id,root:rootName(id),taskName:taskName(id),
  engine:{pid:14568,startedAt:'2026-08-23T14:19:15.3385098Z'},
  engineSha256:'428c46865482aef24712eb5bcbbc7b966e0d8173a946b0b2f307672e4c1529c1',
  cliSha256:'976d4389f97b2cf95b38a4eb673855d8a846f2db21a20eb4fe5e79f7179722f5',
  descriptorSha256:'0aeff4b66f35f258f6ec60fc661add55e4e2d38fbc1791278ab0c0c4713ec8c3',
  sourceFiles:Object.fromEntries(Object.entries(files).map(([name,raw])=>[name,sha(raw)]))};
 const raw=json(manifest),seal=sha(raw);mkdirSync(directory);
 for(const [name,bytes]of Object.entries({...files,'seal.json':raw}))writeFileSync(path.join(directory,name),bytes,{flag:'wx'});
 return {directory,seal,id,taskName:manifest.taskName,root:manifest.root,activated:false};
}
function load(directory,expected){
 demand(path.isAbsolute(directory)&&HASH.test(expected),'owner-status-package');
 const raw=readFileSync(path.join(directory,'seal.json'));demand(sha(raw)===expected,'owner-status-seal');
 const manifest=JSON.parse(raw);demand(manifest.schemaVersion==='runaai-owner-status-package/v1'&&ID.test(manifest.id)
  &&manifest.root===rootName(manifest.id)&&manifest.taskName===taskName(manifest.id)
  &&Object.keys(manifest.sourceFiles).sort().join()===sources.toSorted().join(),'owner-status-schema');
 const packet={'seal.json':raw.toString('base64')};
 for(const name of sources){const bytes=readFileSync(path.join(directory,name));demand(sha(bytes)===manifest.sourceFiles[name],'owner-status-code');packet[name]=bytes.toString('base64');}
 return {manifest,packet};
}
/** Finite owner-identity status probe only. No server lifecycle command is accepted. */
export function ownerStatusRequest(directory,expected,mode){
 demand(['Stage','Run','Inspect','Collect','Cleanup','CleanupFailed'].includes(mode),'owner-status-mode');
 const {manifest:m,packet}=load(directory,expected),root=m.root,name=m.taskName;
 const args='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+root+'\\code\\Run-HomeOwnerStatus.ps1" -ExpectedSeal '+expected;
 let script="$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';Set-StrictMode -Version Latest;"+
  "if($env:COMPUTERNAME-cne'RUNA-HOME'){throw 'owner-status-host'};"+
  `$root='${root}';$name='${name}';$expected='${expected}';`+
  "$sy=[Security.Principal.SecurityIdentifier]::new('S-1-5-18');$ba=[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544');"+
  "$owner=([Security.Principal.NTAccount]::new('RUNA-HOME','Matthew')).Translate([Security.Principal.SecurityIdentifier]);"+
  "function Plain([string]$p){for($i=$p;$i;$i=[IO.Path]::GetDirectoryName($i)){if((Test-Path -LiteralPath $i)-and((Get-Item -LiteralPath $i -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'owner-status-link'}}};"+
  "function Secure([string]$p,[string]$rights){$a=[Security.AccessControl.DirectorySecurity]::new();$a.SetAccessRuleProtection($true,$false);$a.SetOwner($ba);foreach($s in @($sy,$ba)){$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($owner,$rights,'ContainerInherit,ObjectInherit','None','Allow'));Set-Acl -LiteralPath $p -AclObject $a};"+
  "function Check([string]$p,[string]$rights){Plain $p;$a=Get-Acl -LiteralPath $p;if(-not$a.AreAccessRulesProtected-or$a.GetOwner([Security.Principal.SecurityIdentifier]).Value-cne$ba.Value){throw 'owner-status-acl'};$r=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));if($r.Count-ne3){throw 'owner-status-acl'};foreach($v in $r){$want=if($v.IdentityReference.Value-ceq$owner.Value){[Security.AccessControl.FileSystemRights]$rights}elseif($v.IdentityReference.Value-in@($sy.Value,$ba.Value)){[Security.AccessControl.FileSystemRights]::FullControl}else{throw 'owner-status-acl'};$want=$want-bor[Security.AccessControl.FileSystemRights]::Synchronize;if($v.IsInherited-or$v.AccessControlType-ne'Allow'-or$v.FileSystemRights-ne$want-or$v.InheritanceFlags-ne'ContainerInherit,ObjectInherit'-or$v.PropagationFlags-ne'None'){throw 'owner-status-acl'}}};"+
  "Plain $root;";
 let input;
 if(mode==='Stage'){
  input=json(packet);
  script+="if(Test-Path -LiteralPath $root){throw 'owner-status-exists'};if(-not(Test-Path -LiteralPath ([IO.Path]::GetDirectoryName($root)) -PathType Container)){throw 'owner-status-parent'};"+
   "[void](New-Item -ItemType Directory -Path $root);Secure $root 'ReadAndExecute';foreach($part in @('code','results')){[void](New-Item -ItemType Directory -Path ($root+'\\'+$part));Secure ($root+'\\'+$part) $(if($part-ceq'code'){'ReadAndExecute'}else{'Modify'})};"+
   "$packet=[Console]::In.ReadToEnd()|ConvertFrom-Json;if((($packet.PSObject.Properties.Name|Sort-Object)-join',')-cne'Run-HomeOwnerStatus.ps1,Runtime-Windows.ps1,seal.json'){throw 'owner-status-packet'};"+
   "foreach($p in $packet.PSObject.Properties){$file=if($p.Name-ceq'seal.json'){$root+'\\seal.json'}else{$root+'\\code\\'+$p.Name};$b=[Convert]::FromBase64String($p.Value);if($b.Length-gt131072){throw 'owner-status-cap'};$s=[IO.File]::Open($file,'CreateNew','Write','None');try{$s.Write($b,0,$b.Length);$s.Flush($true)}finally{$s.Dispose()}};";
 }
 script+="Check $root 'ReadAndExecute';Check ($root+'\\code') 'ReadAndExecute';Check ($root+'\\results') 'Modify';"+
  "if((Get-FileHash -LiteralPath ($root+'\\seal.json') -Algorithm SHA256).Hash.ToLowerInvariant()-cne$expected){throw 'owner-status-seal'};";
 for(const [file,pin]of Object.entries(m.sourceFiles))script+=`if((Get-FileHash -LiteralPath ($root+'\\code\\${file}') -Algorithm SHA256).Hash.ToLowerInvariant()-cne'${pin}'){throw 'owner-status-code'};`;
 const checkTask=`$t=Get-ScheduledTask -TaskName $name -ErrorAction Stop;$a=@($t.Actions);if($t.TaskPath-cne'\\'-or$a.Count-ne1-or$a[0].Execute-cne'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'-or$a[0].Arguments-cne'${args}'-or[string]$a[0].WorkingDirectory-cne''-or[string]$t.Principal.LogonType-cne'Interactive'-or[string]$t.Principal.RunLevel-cne'Limited'-or[Xml.XmlConvert]::ToTimeSpan($t.Settings.ExecutionTimeLimit)-ne(New-TimeSpan -Minutes 1)-or[string]$t.Settings.MultipleInstances-cne'IgnoreNew'-or@($t.Triggers|Where-Object{$null-ne$_}).Count-ne0){throw 'owner-status-task-drift'};$sid=[string]$t.Principal.UserId;if($sid-notmatch'^S-1-'){$sid=([Security.Principal.NTAccount]::new($sid)).Translate([Security.Principal.SecurityIdentifier]).Value};if($sid-cne$owner.Value){throw 'owner-status-task-owner'};`;
 if(mode==='Run')script+=
  "if((Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)-or(Test-Path -LiteralPath ($root+'\\results\\worker.json'))){throw 'owner-status-already-started'};"+
  `$a=New-ScheduledTaskAction -Execute 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' -Argument '${args}';`+
  "$p=New-ScheduledTaskPrincipal -UserId 'RUNA-HOME\\Matthew' -LogonType Interactive -RunLevel Limited;$s=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -Hidden;"+
  "$null=Register-ScheduledTask -TaskName $name -Action $a -Principal $p -Settings $s;"+checkTask+"Start-ScheduledTask -TaskName $name;";
 if(mode==='Collect'||mode==='Cleanup'){
  script+=checkTask+"if($t.State-eq'Running'){throw 'owner-status-task-running'};$file=$root+'\\results\\result.json';Plain $file;"+
   "$bytes=[IO.File]::ReadAllBytes($file);if($bytes.Length-gt8192){throw 'owner-status-result-cap'};$value=[Text.UTF8Encoding]::new($false,$true).GetString($bytes)|ConvertFrom-Json;if($value.schemaVersion-cne'runaai-owner-status-result/v1'-or$value.packageSha256-cne$expected){throw 'owner-status-result-binding'};";
  if(mode==='Cleanup')script+="if($value.executionStopped-ne$true){throw 'owner-status-unknown-retain-task'};$info=Get-ScheduledTaskInfo -TaskName $name -ErrorAction Stop;$exit=if($value.passed-eq$true){0}else{1};if($info.LastTaskResult-ne$exit){throw 'owner-status-task-terminal-unconfirmed'};$workerFile=$root+'\\results\\worker.json';Plain $workerFile;$worker=[IO.File]::ReadAllText($workerFile)|ConvertFrom-Json;$process=Get-Process -Id ([int]$worker.pid) -ErrorAction SilentlyContinue;if($null-ne$process){try{if($process.StartTime.ToUniversalTime().ToString('o')-ceq$worker.startedAt-and$process.Path-ceq$worker.executable){throw 'owner-status-worker-alive'}}finally{$process.Dispose()}};Unregister-ScheduledTask -TaskName $name -Confirm:$false;if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){throw 'owner-status-task-remains'};";
 }
 if(mode==='Inspect'||mode==='CleanupFailed'){
  script+=checkTask+"$info=Get-ScheduledTaskInfo -TaskName $name;$files=@(Get-ChildItem -LiteralPath ($root+'\\results') -Force|Select-Object Name,Length);$note=$null;$failureFile=$root+'\\results\\preflight-failure.json';if(Test-Path -LiteralPath $failureFile){Plain $failureFile;$b=[IO.File]::ReadAllBytes($failureFile);if($b.Length-gt8192){throw 'owner-status-result-cap'};$note=[Text.UTF8Encoding]::new($false,$true).GetString($b)|ConvertFrom-Json;if($note.schemaVersion-cne'runaai-owner-status-preflight-failure/v1'-or$note.packageSha256-cne$expected){throw 'owner-status-failure-binding'}};"+
   "$cliCount=@(Get-CimInstance Win32_Process -Filter \"Name='lms.exe'\" -OperationTimeoutSec 5).Count;$workerCount=@(Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" -OperationTimeoutSec 5|Where-Object{$_.CommandLine-and$_.CommandLine.Contains($root+'\\code\\Run-HomeOwnerStatus.ps1')}).Count;$observation=@{time=[DateTime]::UtcNow.ToString('o');state=[string]$t.State;lastTaskResult=$info.LastTaskResult;lastRun=$info.LastRunTime.ToUniversalTime().ToString('o');files=$files;preflightFailure=$note;cliCount=$cliCount;workerCount=$workerCount};";
  if(mode==='CleanupFailed')script+="if($t.State-cne'Ready'-or$info.LastTaskResult-ne1-or$cliCount-ne0-or$workerCount-ne0-or(Test-Path -LiteralPath ($root+'\\results\\result.json'))){throw 'owner-status-failure-unsettled'};Unregister-ScheduledTask -TaskName $name -Confirm:$false;if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){throw 'owner-status-task-remains'};";
 }
 script+=`@{schemaVersion='runaai-owner-status-operator/v1';mode='${mode}';packageSha256=$expected;taskName=$name;`+
  (mode==='Collect'?"resultBase64=[Convert]::ToBase64String($bytes);":"")+
  (mode==='Inspect'||mode==='CleanupFailed'?"observation=$observation;":"")+
  "privateValuesIncluded=$false;inferenceCalled=$false;settingsChanged=$false}|ConvertTo-Json -Compress";
 return tlsTransportRequest({host:'home',command:script,input});
}
export function runOwnerStatus(directory,expected,mode){
 const request=ownerStatusRequest(directory,expected,mode);
 const raw=execFileSync('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',request.nested],
  {input:request.input,windowsHide:true,timeout:30000,maxBuffer:16384});
 const result=JSON.parse(raw);demand(result.schemaVersion==='runaai-owner-status-operator/v1'&&result.mode===mode&&result.packageSha256===expected,'owner-status-return');
 const output=path.join(directory,mode+'-result.json');writeFileSync(output,raw,{flag:'wx'});
 return {output,sha256:sha(raw),...result};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,directory,pin,...extra]=process.argv.slice(2);demand(extra.length===0,'owner-status-arguments');
 if(mode==='Prepare'){demand(pin===undefined,'owner-status-arguments');console.log(JSON.stringify(prepareOwnerStatus(directory)));}
 else console.log(JSON.stringify(runOwnerStatus(directory,pin,mode)));
}
