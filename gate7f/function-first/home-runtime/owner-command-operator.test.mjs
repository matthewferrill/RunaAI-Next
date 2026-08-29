import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {prepareOwnerCommand,writeOwnerCommandPackage,loadOwnerCommandPackage} from './owner-command.mjs';import {ownerCommandRequest} from './owner-command-operator.mjs';
const engine={pid:14568,startedAt:'2026-08-23T14:19:15.3385098Z',executable:'C:\\Users\\Matthew\\AppData\\Local\\Programs\\LM Studio\\LM Studio.exe'};
function fixture(t,mode='status',bind=null){const base=mkdtempSync(path.join(tmpdir(),'runa-owner-command-')),dir=path.join(base,'package');
 t.after(()=>{assert.equal(path.dirname(base),path.resolve(tmpdir()));assert.match(path.basename(base),/^runa-owner-command-/);rmSync(base,{recursive:true,force:true});});
 const prepared=prepareOwnerCommand({commandId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',mode,bind,engine,descriptorSha256:'a'.repeat(64)});
 writeOwnerCommandPackage(dir,prepared);return {dir,prepared};}
test('package loading repeats exact deterministic bytes and rejects another seal',t=>{const f=fixture(t),loaded=loadOwnerCommandPackage(f.dir,f.prepared.packageSha256);
 assert.equal(loaded.packageSha256,f.prepared.packageSha256);assert.throws(()=>loadOwnerCommandPackage(f.dir,'b'.repeat(64)));});
test('all operator modes stay under the nested transport ceiling and parse in actual PowerShell 5',t=>{const f=fixture(t);
 for(const mode of ['Stage','Run','Inspect','Collect','Cleanup']){const request=ownerCommandRequest(f.dir,f.prepared.packageSha256,mode);
  assert.ok(request.maximumWrappedChars<=6500);const source=Buffer.from(request.input.toString().split('\n')[0],'base64').toString('utf8');
  assert.equal(source.includes('server stop'),false);assert.equal(source.includes('server start'),false);
  const parser="$s=[Console]::In.ReadToEnd();$t=$null;$e=$null;[void][Management.Automation.Language.Parser]::ParseInput($s,[ref]$t,[ref]$e);if($e.Count){$e|ForEach-Object{$_.Message+' at '+$_.Extent.Text};exit 1};'parsed'";
  try{assert.equal(execFileSync('powershell.exe',['-NoProfile','-Command',parser],{input:source,encoding:'utf8',timeout:10000}).trim(),'parsed');}
  catch(error){assert.fail(mode+': '+String(error.stdout)+' '+String(error.stderr));}
 }});
test('operator source allows only its exact task and preserves files after retirement',t=>{const f=fixture(t),source=Buffer.from(ownerCommandRequest(f.dir,f.prepared.packageSha256,'Cleanup').input.toString().split('\n')[0],'base64').toString();
 assert.match(source,/Unregister-ScheduledTask -TaskName \$task/);assert.doesNotMatch(source,/Remove-Item|Stop-Process|taskkill|Credential|Password/);
 assert.match(source,/executionStopped-ne\$true/);assert.match(source,/workerAlive/);});
