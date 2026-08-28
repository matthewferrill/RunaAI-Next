import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source=name=>readFileSync(new URL(name,import.meta.url),'utf8');
test('synthetic proof has no model endpoints, listener creation or broad deletion',()=>{
  for(const name of ['Windows-Ownership.ps1','Invoke-ControlOsProof.ps1','Run-OsProofWorker.ps1','node-fixture.mjs']){
    assert.doesNotMatch(source(name),/Invoke-(?:RestMethod|WebRequest)|Remove-Item|Stop-Process|createServer|\/api\/v1|1234|8412/);
  }
  assert.match(source('Invoke-ControlOsProof.ps1'),/ExpectedPackageSha256/);
  assert.match(source('Invoke-ControlOsProof.ps1'),/New-TimeSpan -Minutes 2/);
});
test('proof uses no-overwrite JSON publication and exact native process identity',()=>{
  const ps=source('Windows-Ownership.ps1');
  assert.match(ps,/FileMode\]::CreateNew/);assert.match(ps,/\[IO.File\]::Move\(\$pending,\$Path\)/);
  assert.match(ps,/\$process\.Handle/);assert.match(ps,/startedAt/);assert.match(ps,/proof-process-reused/);
  assert.match(source('Run-OsProofWorker.ps1'),/FileShare\]::None/);
});
test('all PowerShell proof scripts parse in Windows PowerShell 5.1',()=>{
  const files=['Windows-Ownership.ps1','Invoke-ControlOsProof.ps1','Run-OsProofWorker.ps1'];
  for(const name of files){
    const path=fileURLToPath(new URL(name,import.meta.url));
    const command="$errors=$null;$tokens=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('"+path.replaceAll("'","''")+"',[ref]$tokens,[ref]$errors);if($errors.Count){throw 'proof-parser-error'};[Console]::Write($PSVersionTable.PSVersion.Major)";
    const result=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true});
    assert.equal(result.trim(),'5');
  }
});
