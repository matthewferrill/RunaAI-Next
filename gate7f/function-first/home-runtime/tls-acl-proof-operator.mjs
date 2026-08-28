import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=['Runtime-Windows.ps1','Tls-Windows.ps1','Invoke-ControlTlsAclProof.ps1'];
const [mode,descriptorFile,...extra]=process.argv.slice(2);assert.equal(extra.length,0);
const write=(file,bytes)=>writeFileSync(file,bytes,{flag:'wx'});
if(mode==='prepare'){
  assert.equal(descriptorFile,undefined);const id=randomBytes(16).toString('hex');
  const local=path.resolve(import.meta.dirname,'../../../artifacts/m1-readiness','tls-acl-proof-'+id);mkdirSync(local);
  const root='C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-home-tls-acl-proof-'+id;
  const bytes=Object.fromEntries(files.map(name=>[name,readFileSync(path.join(import.meta.dirname,name))]));
  const manifest=Buffer.from(JSON.stringify({schemaVersion:'runaai-tls-acl-proof-package/v1',root,files:Object.fromEntries(Object.entries(bytes).map(([name,data])=>[name,sha(data)]))},null,2)+'\n');
  const descriptor={id,root,local,packageSha256:sha(manifest)};
  for(const[name,data]of Object.entries({...bytes,'package.json':manifest}))write(path.join(local,name),data);
  write(path.join(local,'descriptor.json'),JSON.stringify(descriptor,null,2)+'\n');console.log(JSON.stringify(descriptor));
}else{
  assert.ok(['run','collect'].includes(mode));const descriptor=JSON.parse(readFileSync(descriptorFile));
  assert.match(descriptor.id,/^[a-f0-9]{32}$/);assert.match(descriptor.packageSha256,/^[a-f0-9]{64}$/);
  const root='C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-home-tls-acl-proof-'+descriptor.id;
  assert.equal(descriptor.root,root);
  const local=path.resolve(import.meta.dirname,'../../../artifacts/m1-readiness','tls-acl-proof-'+descriptor.id);assert.equal(descriptor.local,local);
  let input,command="$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';Set-StrictMode -Version Latest;";
  if(mode==='run'){
    const packet=Object.fromEntries([...files,'package.json'].map(name=>[name,readFileSync(path.join(local,name)).toString('base64')]));input=Buffer.from(JSON.stringify(packet));
    command+=`$root='${root}';if(Test-Path -LiteralPath $root){throw 'tls-proof-existing-root'};`+
      `for($p=$root;$p;$p=[IO.Path]::GetDirectoryName($p)){if((Test-Path -LiteralPath $p)-and((Get-Item -LiteralPath $p -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'tls-proof-link'}};`+
      `[void](New-Item -ItemType Directory -Path $root);$packet=[Console]::In.ReadToEnd()|ConvertFrom-Json;`+
      `$allowed=@('Invoke-ControlTlsAclProof.ps1','Runtime-Windows.ps1','Tls-Windows.ps1','package.json');if((($packet.PSObject.Properties.Name|Sort-Object)-join',')-cne(($allowed|Sort-Object)-join',')){throw 'tls-proof-packet-fields'};`+
      `foreach($item in $packet.PSObject.Properties){$b=[Convert]::FromBase64String($item.Value);$s=[IO.File]::Open((Join-Path $root $item.Name),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$s.Write($b,0,$b.Length);$s.Flush($true)}finally{$s.Dispose()}};`+
      `& 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ($root+'\\Invoke-ControlTlsAclProof.ps1') -ExpectedPackageSha256 '${descriptor.packageSha256}';exit $LASTEXITCODE`;
  }else command+=`$root='${root}';$files=@{};foreach($name in @('result.json','package.json')){$b=[IO.File]::ReadAllBytes((Join-Path $root $name));if($b.Length-gt32768){throw 'tls-proof-cap'};$files[$name]=[Convert]::ToBase64String($b)};[Console]::Out.Write(($files|ConvertTo-Json -Compress))`;
  try{
    const raw=execFileSync('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control',
      'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand '+Buffer.from(command,'utf16le').toString('base64')],
      {input,encoding:'buffer',windowsHide:true,timeout:30000,maxBuffer:131072});
    write(path.join(local,mode+'-result.json'),raw);console.log(mode==='run'?raw.toString():JSON.stringify({file:path.join(local,mode+'-result.json'),sha256:sha(raw)}));
  }catch(error){if(error.stdout)write(path.join(local,mode+'-failed-result.txt'),error.stdout);throw error;}
}
