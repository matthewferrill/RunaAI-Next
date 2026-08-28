import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,mkdirSync,linkSync,symlinkSync,rmSync,realpathSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {CONTRACT,SOURCE_FILES,configuration,sha,validatePackage} from './contract.mjs';
const here=import.meta.dirname;
const read=name=>readFileSync(path.join(here,name),'utf8');
function powershell(program){
  return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from("$ProgressPreference='SilentlyContinue';"+program,'utf16le').toString('base64')],{encoding:'utf8',timeout:30000,windowsHide:true});
}
test('fixed service configuration and version preserve selected-stack boundary',()=>{
  assert.equal(CONTRACT.root,'C:\\AI\\RunaAI-Next-Candidate\\m1-qdrant');
  assert.equal(CONTRACT.httpPort,9774);assert.equal(CONTRACT.grpcPort,9775);
  assert.match(configuration(),/host: 127\.0\.0\.1/);
  for(const setting of ['telemetry_disabled: true','enable_cors: false','enable_snapshot_url_recovery: false','enabled: false'])assert.ok(configuration().includes(setting));
  assert.doesNotMatch(configuration(),/https?:|0\.0\.0\.0|6333|6334|s3_config/);
});
test('PowerShell sources parse and native/server configurations are byte-equivalent',()=>{
  const base=here.replaceAll("'","''");
  const result=powershell(`$ErrorActionPreference='Stop';foreach($f in Get-ChildItem -LiteralPath '${base}' -Filter '*.ps1'){$t=$null;$e=$null;[void][Management.Automation.Language.Parser]::ParseFile($f.FullName,[ref]$t,[ref]$e);if($e.Count){throw ($e|Out-String)}};. '${base}\\Common-M1Qdrant.ps1';[Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-M1QdrantConfiguration))))`);
  assert.equal(Buffer.from(result.trim(),'base64').toString(),configuration());
});
test('install is disabled/create-only and permissions never repair ancestors',()=>{
  const install=read('Install-ControlM1Qdrant.ps1');
  assert.match(install,/New-ScheduledTaskSettingsSet[^\r\n]+-Disable/);
  assert.doesNotMatch(install,/Start-ScheduledTask|Start-Service|New-NetFirewallRule|Remove-Item|icacls|Set-Acl[^\r\n]+\$parent/);
  assert.equal([...install.matchAll(/Set-Acl -LiteralPath/g)].length,3);
  assert.match(install,/Copy\(\$source,\$destination,\$false\)/);
  assert.match(install,/Assert-M1QdrantPortsFree/);
  assert.match(install,/Get-M1QdrantInstallation \$ExpectedPackageSha256/);
});
test('runner clears inherited overrides and retains bounded output/ownership proof',()=>{
  const run=read('Run-M1Qdrant.ps1'),common=read('Common-M1Qdrant.ps1');
  assert.match(run,/EnvironmentVariables\.Clear\(\)/);assert.match(run,/CreateNoWindow=\$true/);
  assert.match(run,/StandardInput\.Close\(\)/);assert.match(run,/Assert-M1QdrantChild/);
  assert.match(common,/value\.Length>32768/);assert.match(run,/\$null=\$child.Handle/);
  assert.doesNotMatch(run,/Start-Process|Get-Credential|ConvertTo-SecureString|QDRANT__.*\$env/);
});
test('rollback is exact-task/child only and leaves data recoverable',()=>{
  const rollback=read('Rollback-ControlM1Qdrant.ps1');
  assert.doesNotMatch(rollback,/Remove-Item|Remove-Service|Stop-Service|Remove-NetFirewallRule|Stop-Process -Name|taskkill|rmdir|rd /);
  assert.match(rollback,/Disable-ScheduledTask -TaskPath \$script:M1QdrantTaskPath -TaskName \$script:M1QdrantTaskName/);
  assert.match(rollback,/Assert-M1QdrantChild \$proof \$live/);
  assert.match(rollback,/Unregister-ScheduledTask -TaskPath \$script:M1QdrantTaskPath -TaskName \$script:M1QdrantTaskName/);
  assert.match(rollback,/dataRetained=\$true/);
});
test('real pinned package and native link/config/task guards execute without a service',()=>{
  const tempParent=realpathSync(os.tmpdir()),root=mkdtempSync(path.join(tempParent,'runa-m1-qdrant-contract-'));
  try{
    const output=JSON.parse(execFileSync(process.execPath,[path.join(here,'build-package.mjs'),path.join(root,'package')],{encoding:'utf8',windowsHide:true}));
    assert.equal(output.servicesStarted,false);
    const manifest=JSON.parse(readFileSync(path.join(root,'package/package.json')));
    const files=Object.fromEntries(manifest.files.map(f=>[f.name,readFileSync(path.join(root,'package',f.name))]));
    validatePackage(manifest,files);
    for(const mutation of [m=>m.root='C:\\outside',m=>m.httpPort=80,m=>m.serviceSid='S-1-5-18',m=>m.extra=true]){
      const copy=structuredClone(manifest);mutation(copy);assert.throws(()=>validatePackage(copy,files));
    }
    const changed={...files,'qdrant.yaml':Buffer.from(configuration().replace('host: 127.0.0.1','host: 0.0.0.0'))};
    const changedManifest=structuredClone(manifest),entry=changedManifest.files.find(f=>f.name==='qdrant.yaml');
    entry.bytes=changed['qdrant.yaml'].length;entry.sha256=sha(changed['qdrant.yaml']);
    assert.throws(()=>validatePackage(changedManifest,changed),/configuration|config-drift/);
    writeFileSync(path.join(root,'ordinary.txt'),'ordinary');
    writeFileSync(path.join(root,'hardlink-a.txt'),'link fixture');linkSync(path.join(root,'hardlink-a.txt'),path.join(root,'hardlink-b.txt'));
    mkdirSync(path.join(root,'linked'));mkdirSync(path.join(root,'target'));
    symlinkSync(path.join(root,'target'),path.join(root,'linked/junction'),'junction');
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(here,'Test-M1QdrantContract.ps1'),'-FixtureRoot',root,'-PackageSha256',output.packageSha256],{encoding:'utf8',timeout:30000,windowsHide:true});
    assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
    const evidence=JSON.parse(result.stdout.trim());assert.equal(evidence.servicesStarted,false);assert.equal(evidence.tests.length,15);
    assert.ok(evidence.tests.every(t=>t.passed));
  }finally{
    const resolved=realpathSync(root);assert.equal(path.dirname(resolved),tempParent);assert.ok(path.basename(resolved).startsWith('runa-m1-qdrant-contract-'));
    rmSync(resolved,{recursive:true,force:false});
  }
});
