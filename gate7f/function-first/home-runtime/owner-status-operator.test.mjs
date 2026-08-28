import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {prepareOwnerStatus,ownerStatusRequest} from './owner-status-operator.mjs';
function fixture(t){const parent=mkdtempSync(path.join(tmpdir(),'runa-owner-status-'));
 t.after(()=>{assert.equal(path.dirname(parent),path.resolve(tmpdir()));assert.match(path.basename(parent),/^runa-owner-status-/);rmSync(parent,{recursive:true,force:true});});
 return prepareOwnerStatus(path.join(parent,'package'),'a'.repeat(32));}
function script(request){return Buffer.from(request.input.toString('utf8').split('\n')[0],'base64').toString('utf8');}
test('owner status preparation is offline, create-only and source-bound',t=>{
 const prepared=fixture(t);assert.equal(prepared.activated,false);assert.match(prepared.root,/^C:\\ProgramData\\RunaAI-Next-OwnerStatus-a{32}$/);
 assert.throws(()=>prepareOwnerStatus(prepared.directory),/prepare/);
 const request=ownerStatusRequest(prepared.directory,prepared.seal,'Stage');assert.ok(request.maximumWrappedChars<=6500);
 assert.match(script(request),/RUNA-HOME/);assert.match(script(request),/owner-status-exists/);
 writeFileSync(path.join(prepared.directory,'Run-HomeOwnerStatus.ps1'),'tampered');
 assert.throws(()=>ownerStatusRequest(prepared.directory,prepared.seal,'Run'),/owner-status-code/);
});
test('owner status command cannot request lifecycle, arbitrary identity or default discovery',t=>{
 const prepared=fixture(t);assert.throws(()=>ownerStatusRequest(prepared.directory,prepared.seal,'Stop'),/mode/);
 const source=readFileSync(path.join(prepared.directory,'Run-HomeOwnerStatus.ps1'),'utf8');
 assert.match(source,/RunBounded\(\$cli,'ps --json',5000,8192\)/);assert.match(source,/LMS_API_SERVER_INFO_PATH=\$descriptor/);
 assert.doesNotMatch(source,/Get-Credential|lms-key|clientPasskey|server','(?:start|stop)|USERPROFILE=/);
 const run=script(ownerStatusRequest(prepared.directory,prepared.seal,'Run'));
 assert.match(run,/-LogonType Interactive -RunLevel Limited/);assert.match(run,/-WindowStyle Hidden/);
 assert.match(run,/-ExecutionTimeLimit \(New-TimeSpan -Minutes 1\)/);assert.match(run,/owner-status-already-started/);
 assert.match(run,/task-start-intent.json/);assert.ok(run.indexOf("$stream.Flush($true)")<run.indexOf('Start-ScheduledTask -TaskName'));
 assert.match(run,/Actions/);assert.match(run,/Principal.LogonType/);assert.match(run,/WorkingDirectory/);
 assert.doesNotMatch(run,/Remove-Item|Stop-Process|server stop|server start/);
});
test('owner status cleanup only unregisters its exact finished task and preserves evidence',t=>{
 const prepared=fixture(t),code=script(ownerStatusRequest(prepared.directory,prepared.seal,'Cleanup'));
 assert.match(code,/if\(\$t.State-eq'Running'\)/);assert.match(code,/executionStopped-ne\$true/);
 assert.match(code,/LastTaskResult-ne\$exit/);assert.match(code,/owner-status-worker-alive/);assert.match(code,/MultipleInstances-cne'IgnoreNew'/);
 assert.match(code,/Unregister-ScheduledTask -TaskName \$name/);assert.doesNotMatch(code,/Remove-Item|Stop-ScheduledTask|Stop-Process/);
});
test('generated commands and actual worker parse in Windows PowerShell 5 without execution',t=>{
 const prepared=fixture(t),ps='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
 for(const code of [...['Stage','Run','Inspect','Collect','Cleanup','CleanupFailed'].map(mode=>script(ownerStatusRequest(prepared.directory,prepared.seal,mode))),
  readFileSync(path.join(prepared.directory,'Run-HomeOwnerStatus.ps1'),'utf8')]){
  const check="$ErrorActionPreference='Stop';$tokens=$null;$errors=$null;$null=[Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(),[ref]$tokens,[ref]$errors);if($errors.Count-ne0){throw 'syntax-errors'};'parsed'";
  assert.equal(execFileSync(ps,['-NoProfile','-NonInteractive','-Command',check],{input:code,encoding:'utf8',windowsHide:true,timeout:5000}).trim(),'parsed');
 }
});
test('preflight diagnostics are bounded and failed-task retirement does not claim CLI success',t=>{
 const prepared=fixture(t),source=readFileSync(path.join(prepared.directory,'Run-HomeOwnerStatus.ps1'),'utf8');
 assert.match(source,/trap \{/);assert.match(source,/probePhase='helper'/);assert.match(source,/preflight-failure.json/);
 const code=script(ownerStatusRequest(prepared.directory,prepared.seal,'CleanupFailed'));
 assert.match(code,/LastTaskResult-ne1/);assert.match(code,/cliCount-ne0/);assert.match(code,/workerCount-ne0/);
 assert.doesNotMatch(code,/Stop-Process|Stop-ScheduledTask|Remove-Item/);
});
