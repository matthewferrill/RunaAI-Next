[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$OwnedRoot,
  [Parameter(Mandatory)][string]$ManifestPath,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedManifestSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedBootstrapSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedIdentitySha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedArchiveSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedSourceCommit
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$terminal=125
try{
  $fixedHostEnvironment=[ordered]@{SystemRoot='C:\Windows';WINDIR='C:\Windows';ComSpec='C:\Windows\System32\cmd.exe';
    PATH='C:\Windows\System32;C:\Windows;C:\Windows\System32\Wbem;C:\Windows\System32\WindowsPowerShell\v1.0;C:\Windows\System32\OpenSSH';
    PATHEXT='.COM;.EXE;.BAT;.CMD';PSModulePath='C:\Windows\System32\WindowsPowerShell\v1.0\Modules';SystemDrive='C:';OS='Windows_NT'}
  foreach($name in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$name,$null,'Process')}
  foreach($entry in $fixedHostEnvironment.GetEnumerator()){[Environment]::SetEnvironmentVariable([string]$entry.Key,[string]$entry.Value,'Process')}
  function Get-ExactSha256([string]$Path){$content=[IO.File]::ReadAllBytes($Path);$algorithm=[Security.Cryptography.SHA256]::Create()
    try{return([BitConverter]::ToString($algorithm.ComputeHash($content))).Replace('-','').ToLowerInvariant()}finally{$algorithm.Dispose()}}
  $fixedParent='C:\AI\RunaAI-Next-Candidate\staging'
  $fixedRelease='C:\AI\RunaAI-Next-Candidate\releases\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc'
  $fixedNodeSha='bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb'
  $root=[IO.Path]::GetFullPath($OwnedRoot)
  if([IO.Path]::GetDirectoryName($root)-cne$fixedParent-or[IO.Path]::GetFileName($root)-cnotmatch'^m1-task-native-[a-f0-9]{32}$'){throw'm1-control-dispatch-root'}
  if([Security.Principal.WindowsIdentity]::GetCurrent().Name-cne'RUNA-CONTROL\Matthew'){throw'm1-control-dispatch-owner'}
  $sourceDirectory=[IO.Path]::Combine($root,'gate7f','function-first','acceptance')
  $manifest=[IO.Path]::GetFullPath($ManifestPath);if($manifest-cne[IO.Path]::Combine($root,'CONTROL-REGRESSION-INPUT.json')){throw'm1-control-dispatch-manifest-path'}
  $bootstrap=[IO.Path]::Combine($sourceDirectory,'control-exact-regression-bootstrap.cjs');$identity=[IO.Path]::Combine($root,'SOURCE-IDENTITY.json');$archive=[IO.Path]::Combine($root,'source.tar')
  foreach($pair in @(@($manifest,$ExpectedManifestSha256),@($identity,$ExpectedIdentitySha256),@($archive,$ExpectedArchiveSha256))){
    if(-not[IO.File]::Exists($pair[0])-or(Get-ExactSha256 $pair[0])-cne$pair[1]){throw'm1-control-dispatch-input-pin'}
  }
  $bootstrapBytes=[IO.File]::ReadAllBytes($bootstrap);if($bootstrapBytes.Length-gt65536){throw'm1-control-dispatch-bootstrap-cap'}
  $hash=[Security.Cryptography.SHA256]::Create();try{$actualBootstrap=([BitConverter]::ToString($hash.ComputeHash($bootstrapBytes))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
  if($actualBootstrap-cne$ExpectedBootstrapSha256){throw'm1-control-dispatch-input-pin'}
  $node=[IO.Path]::Combine($fixedRelease,'runtime','node.exe');if((Get-ExactSha256 $node)-cne$fixedNodeSha){throw'm1-control-dispatch-node-pin'}
  $bootstrapBase64=[Convert]::ToBase64String($bootstrapBytes);if($bootstrapBase64-cnotmatch'^[A-Za-z0-9+/]+={0,2}$'){throw'm1-control-dispatch-bootstrap-encoding'}
  $loader="globalThis.__RUNA_CONTROL_BOOTSTRAP__=true;eval(Buffer.from(process.argv[1],'base64').toString('utf8'))"
  $watchdogSource=@'
const{spawn,spawnSync}=require('node:child_process');
const{createHash}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const maximumMs=1080000,maximumBytes=131072,bootstrap=process.argv[2],args=process.argv.slice(3),root=args[1];
if(!/^[A-Za-z0-9+/]+={0,2}$/.test(bootstrap)||args[0]!=='--owned-root'||!/^C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-[a-f0-9]{32}$/.test(root)){process.stdout.write('{"errorCode":"m1-control-bootstrap-watchdog-input","productionChanged":false}\n');process.exit(125);}
const loader="globalThis.__RUNA_CONTROL_BOOTSTRAP__=true;eval(Buffer.from(process.argv[1],'base64').toString('utf8'))";
const journal=fs.openSync(path.join(root,'CONTROL-BOOTSTRAP-WATCHDOG.jsonl'),'wx'),stdout=fs.openSync(path.join(root,'CONTROL-BOOTSTRAP-STDOUT.txt'),'wx'),stderr=fs.openSync(path.join(root,'CONTROL-BOOTSTRAP-STDERR.txt'),'wx');
let settled=false,timer=null,stdoutBytes=0,stderrBytes=0;
const write=value=>{try{fs.writeSync(journal,JSON.stringify(value)+'\n');fs.fsyncSync(journal);return true;}catch{return false;}};
const close=()=>{for(const handle of[journal,stdout,stderr]){try{fs.fsyncSync(handle);}catch{}try{fs.closeSync(handle);}catch{}}};
const authoritySha256=createHash('sha256').update(JSON.stringify([bootstrap,...args])).digest('hex');
if(!write({schemaVersion:'runaai-m1-control-bootstrap-watchdog-intent/v1',watchdogProcessId:process.pid,childProcessId:null,authoritySha256,productionChanged:false})){close();process.exit(125);}
let child;try{child=spawn(process.execPath,['-e',loader,bootstrap,...args],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe'],windowsHide:true});}
catch{write({schemaVersion:'runaai-m1-control-bootstrap-watchdog-terminal/v1',errorCode:'m1-control-bootstrap-watchdog-start',watchdogProcessId:process.pid,childProcessId:null,stopConfirmed:false,productionChanged:false});close();process.exit(125);}
const finish=(code,errorCode=null,stopConfirmed=null)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);write({schemaVersion:'runaai-m1-control-bootstrap-watchdog-terminal/v1',errorCode,watchdogProcessId:process.pid,childProcessId:child.pid,stopConfirmed,stdoutBytes,stderrBytes,productionChanged:false});close();
  try{child.stdout.destroy();}catch{}try{child.stderr.destroy();}catch{}try{child.unref();}catch{}process.exitCode=Number.isInteger(code)?code:1;};
const stop=errorCode=>{if(settled)return;const taskkill=path.join(process.env.SystemRoot,'System32','taskkill.exe'),stopped=spawnSync(taskkill,['/PID',String(child.pid),'/T','/F'],{windowsHide:true,encoding:'utf8',timeout:10000,maxBuffer:1048576});
  const confirmed=!stopped.error&&stopped.status===0;finish(confirmed?124:125,confirmed?errorCode:'m1-control-bootstrap-watchdog-stop-unconfirmed',confirmed);};
const initial={schemaVersion:'runaai-m1-control-bootstrap-watchdog/v1',watchdogProcessId:process.pid,childProcessId:child.pid,maximumMs,productionChanged:false};if(!write(initial))stop('m1-control-bootstrap-watchdog-evidence-failed');
process.stdout.on('error',()=>{});try{process.stdout.write(JSON.stringify(initial)+'\n');}catch{}
for(const[name,stream,handle]of[['stdout',child.stdout,stdout],['stderr',child.stderr,stderr]]){stream.on('error',()=>stop('m1-control-bootstrap-watchdog-evidence-failed'));stream.on('data',chunk=>{if(settled)return;const bytes=Buffer.from(chunk);if(name==='stdout')stdoutBytes+=bytes.length;else stderrBytes+=bytes.length;
  const total=name==='stdout'?stdoutBytes:stderrBytes,retained=Math.max(0,maximumBytes-(total-bytes.length));try{if(retained)fs.writeSync(handle,bytes.subarray(0,retained));}catch{return stop('m1-control-bootstrap-watchdog-evidence-failed');}if(total>maximumBytes)stop('m1-control-bootstrap-watchdog-output-cap');});}
child.once('error',()=>stop('m1-control-bootstrap-watchdog-start'));child.once('close',code=>finish(code,code===0?null:'m1-control-bootstrap-child-failed',null));
if(!settled)timer=setTimeout(()=>stop('m1-control-bootstrap-watchdog-timeout'),maximumMs);
'@
  $watchdogBase64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($watchdogSource));if($watchdogBase64-cnotmatch'^[A-Za-z0-9+/]+={0,2}$'){throw'm1-control-dispatch-watchdog-encoding'}
  $authorityArguments=@($watchdogBase64,$bootstrapBase64,'--owned-root',$root,'--manifest',$manifest,'--manifest-sha256',$ExpectedManifestSha256,'--source-identity-sha256',$ExpectedIdentitySha256,'--source-archive-sha256',$ExpectedArchiveSha256,'--source-commit',$ExpectedSourceCommit)
  if($authorityArguments.Where({$_-match'["\s&|<>^%!]'}).Count-ne0){throw'm1-control-dispatch-argument-character'}
  $arguments=@('-e',('"'+$loader+'"'))+$authorityArguments
  $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$node;$start.Arguments=($arguments-join' ');$start.WorkingDirectory=$root
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$false;$start.RedirectStandardError=$false
  $start.EnvironmentVariables.Clear()
  foreach($entry in $fixedHostEnvironment.GetEnumerator()){$start.EnvironmentVariables[$entry.Key]=$entry.Value}
  $child=[Diagnostics.Process]::new();$child.StartInfo=$start;$started=$false
  try{
    if(-not$child.Start()){throw'm1-control-dispatch-start'};$started=$true
    $child.StandardInput.Close()
    $escapedRoot=$root.Replace('\','\\').Replace('"','\"')
    [Console]::Out.Write('{"schemaVersion":"runaai-m1-control-regression-dispatch/v1","processId":'+[string]$child.Id+',"root":"'+$escapedRoot+'","manifestSha256":"'+$ExpectedManifestSha256+'","bootstrapSha256":"'+$ExpectedBootstrapSha256+'","sourceCommit":"'+$ExpectedSourceCommit+'","modelsInvoked":false,"protectedDataRead":false,"productionChanged":false}' + "`n")
    if(-not$child.WaitForExit(1095000)){throw'm1-control-dispatch-watchdog-timeout'}
    $terminal=$child.ExitCode
  }catch{
    if($started){
      $killStart=[Diagnostics.ProcessStartInfo]::new();$killStart.FileName='C:\Windows\System32\taskkill.exe';$killStart.Arguments="/PID $($child.Id) /T /F"
      $killStart.UseShellExecute=$false;$killStart.CreateNoWindow=$true;$killStart.RedirectStandardOutput=$false;$killStart.RedirectStandardError=$false
      $kill=[Diagnostics.Process]::new();$kill.StartInfo=$killStart
      if(-not$kill.Start()-or-not$kill.WaitForExit(10000)-or$kill.ExitCode-ne0){try{$kill.Kill()}catch{};throw'm1-control-dispatch-stop-unconfirmed'}
      $kill.Dispose()
    }
    throw
  }finally{try{$child.Dispose()}catch{}}
}catch{[Console]::Error.WriteLine('m1-control-regression-dispatch-failed');$terminal=125}
finally{[Environment]::Exit($terminal)}
