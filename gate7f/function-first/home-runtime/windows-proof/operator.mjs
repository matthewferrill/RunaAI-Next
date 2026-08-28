import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const source=dirname(fileURLToPath(import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=['Windows-Ownership.ps1','Invoke-ControlOsProof.ps1','Run-OsProofWorker.ps1','node-fixture.mjs'];
const [mode,argument]=process.argv.slice(2);
const write=(file,bytes)=>writeFileSync(file,bytes,{flag:'wx'});
if(mode==='prepare'){
  const id=randomUUID().replaceAll('-','');
  const output=resolve('artifacts/m1-readiness/windows-os-proof-'+id);mkdirSync(output);
  const root='C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-runtime-os-proof-'+id;
  const packageRoot='C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-runtime-os-package-'+id;
  const packet={},pins={};for(const name of files){const bytes=readFileSync(resolve(source,name));packet[name]=bytes.toString('base64');pins[name]=sha(bytes);}
  const manifest={schemaVersion:'runaai-windows-os-proof-package/v1',createdAt:new Date().toISOString(),root,packageRoot,
    nodePath:'C:\\Program Files\\nodejs\\node.exe',nodeVersion:'v24.19.0',
    nodeSha256:'3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237',files:pins};
  const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');packet['package.json']=bytes.toString('base64');
  const descriptor={id,root,packageRoot,packageSha256:sha(bytes),output};
  write(resolve(output,'package.json'),bytes);write(resolve(output,'transfer.json'),JSON.stringify(packet));
  write(resolve(output,'descriptor.json'),JSON.stringify(descriptor,null,2)+'\n');console.log(JSON.stringify(descriptor));
}else{
  assert.ok(['upload','run','collect'].includes(mode));
  const descriptor=JSON.parse(readFileSync(resolve(argument),'utf8'));
  assert.match(descriptor.id,/^[a-f0-9]{32}$/);assert.match(descriptor.packageSha256,/^[a-f0-9]{64}$/);
  const root='C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-runtime-os-proof-'+descriptor.id;
  const packageRoot='C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-runtime-os-package-'+descriptor.id;
  assert.equal(descriptor.root,root);assert.equal(descriptor.packageRoot,packageRoot);
  const output=resolve('artifacts/m1-readiness/windows-os-proof-'+descriptor.id);assert.equal(descriptor.output,output);
  let command="$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';";
  let input;
  if(mode==='upload'){
    input=readFileSync(resolve(output,'transfer.json'));assert.ok(input.length<256*1024);
    command+=`$root='${packageRoot}';if(Test-Path -LiteralPath $root){throw 'proof-package-exists'};`+
      `for($p=$root;$p;$p=[IO.Path]::GetDirectoryName($p)){if((Test-Path -LiteralPath $p)-and((Get-Item -LiteralPath $p -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'proof-reparse'}};`+
      `[void][IO.Directory]::CreateDirectory($root);$acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false);`+
      `$acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')));foreach($sid in @('S-1-5-18','S-1-5-32-544')){$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow')))};Set-Acl -LiteralPath $root -AclObject $acl;`+
      `$packet=[Console]::In.ReadToEnd()|ConvertFrom-Json;$allowed=@('Windows-Ownership.ps1','Invoke-ControlOsProof.ps1','Run-OsProofWorker.ps1','node-fixture.mjs','package.json');`+
      `if((($packet.PSObject.Properties.Name|Sort-Object)-join',')-cne(($allowed|Sort-Object)-join',')){throw 'proof-transfer-files'};`+
      `foreach($file in $packet.PSObject.Properties){$bytes=[Convert]::FromBase64String($file.Value);$stream=[IO.File]::Open((Join-Path $root $file.Name),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write);try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}};`+
      `if((Get-FileHash -LiteralPath (Join-Path $root 'package.json') -Algorithm SHA256).Hash.ToLowerInvariant()-cne'${descriptor.packageSha256}'){throw 'proof-manifest-pin'};`+
      `$manifest=Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw|ConvertFrom-Json;foreach($file in $manifest.files.PSObject.Properties){if((Get-FileHash -LiteralPath (Join-Path $root $file.Name) -Algorithm SHA256).Hash.ToLowerInvariant()-cne$file.Value){throw 'proof-file-pin'}};@{uploaded=$true;packageSha256='${descriptor.packageSha256}'}|ConvertTo-Json -Compress`;
  }else if(mode==='run'){
    command+=`if((Get-FileHash -LiteralPath '${packageRoot}\\package.json' -Algorithm SHA256).Hash.ToLowerInvariant()-cne'${descriptor.packageSha256}'){throw 'proof-manifest-pin'};`+
      `& '${packageRoot}\\Invoke-ControlOsProof.ps1' -Root '${root}' -ExpectedPackageSha256 '${descriptor.packageSha256}';exit $LASTEXITCODE`;
  }else{
    command+=`$root='${root}';$result=@{};foreach($name in @('result.json','config.json','public\\watchdog.json','public\\child.json','public\\supervisor-result.json','requests\\localservice-result.json','state\\synthetic-ownership.jsonl','state\\node-stdout.txt','state\\node-stderr.txt')){$path=Join-Path $root $name;if(Test-Path -LiteralPath $path){$bytes=[IO.File]::ReadAllBytes($path);if($bytes.Length-gt65536){throw 'proof-export-size'};$result[$name]=[Convert]::ToBase64String($bytes)}};`+
      `$acls=@{};foreach($name in @('','code','public','state','requests','replies')){$path=if($name){Join-Path $root $name}else{$root};$acl=Get-Acl -LiteralPath $path;$acls[$name]=@{owner=$acl.Owner;sddl=$acl.Sddl;protected=$acl.AreAccessRulesProtected}};`+
      `$tasks=@();foreach($name in @('Runa-M1-OsProof-${descriptor.id}-Supervisor','Runa-M1-OsProof-${descriptor.id}-LocalService')){$t=Get-ScheduledTask -TaskPath '\\' -TaskName $name -ErrorAction SilentlyContinue;if($t){$tasks+=@{name=$t.TaskName;state=[string]$t.State}}};`+
      `[Console]::Out.Write((@{schemaVersion='runaai-windows-os-proof-export/v1';time=[DateTime]::UtcNow.ToString('o');files=$result;acls=$acls;remainingOwnedTasks=$tasks;modelOperations=$false;productionChanges=$false}|ConvertTo-Json -Depth 20 -Compress))`;
  }
  const encoded=Buffer.from(command,'utf16le').toString('base64');
  try{
    const result=execFileSync('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control',
      'powershell.exe -NoProfile -NonInteractive -EncodedCommand '+encoded],{input,encoding:'utf8',timeout:180000,maxBuffer:512*1024,windowsHide:true});
    write(resolve(output,mode+'-result.json'),result);console.log(mode==='collect'?JSON.stringify({collected:true,file:resolve(output,mode+'-result.json'),sha256:sha(Buffer.from(result))}):result);
  }catch(error){if(error.stdout)write(resolve(output,mode+'-failed-result.txt'),error.stdout);throw error;}
}
