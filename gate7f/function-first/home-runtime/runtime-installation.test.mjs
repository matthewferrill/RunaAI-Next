import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateInstallation,OPERATOR_FILES,sessionPaths,validateProcessIdentity,writeRuntimeJson,readInstallation} from './runtime-installation.mjs';
import {runRuntimeMain} from './runtime-main.mjs';
import {buildRuntimePackage} from './build-runtime-package.mjs';
const profile={schemaVersion:'runaai-qualified-home-profile/v1',candidateId:'gemma',appSourceCommit:'a'.repeat(40),runtimeSealSha256:'b'.repeat(64),qualificationGradesSha256:'c'.repeat(64)};
const fixture=()=>({schemaVersion:'runaai-qualified-home-installation/v1',installationId:'d'.repeat(64),profile,
  operatorPins:{nodeSha256:'e'.repeat(64),engineExecutableSha256:'f'.repeat(64),observationScriptSha256:'1'.repeat(64)},
  tlsPins:{caSha256:'2'.repeat(64),clientCertificateSha256:'3'.repeat(64),serverCertificateSha256:'4'.repeat(64)},
  codeFiles:Object.fromEntries(OPERATOR_FILES.map(file=>[file,'1'.repeat(64)]))});
test('installation binds a single exact profile, native runtime, TLS identities and complete fixed code file set',()=>{
  const input=fixture();assert.equal(validateInstallation(input).profile.candidate.id,'gemma');
  for(const changed of [{...input,port:1234},{...input,codeFiles:{...input.codeFiles,'../other.mjs':'1'.repeat(64)}},
    {...input,operatorPins:{...input.operatorPins,observationScriptSha256:'2'.repeat(64)}}])assert.throws(()=>validateInstallation(changed));
});
test('native session/process/output paths cannot be supplied as arbitrary models or filesystem targets',()=>{
  assert.equal(sessionPaths('a'.repeat(64)).ipc,'C:\\AI\\RunaAI-Next-HomeRuntime\\ipc\\'+'a'.repeat(64));
  assert.throws(()=>sessionPaths('../elsewhere'));assert.throws(()=>writeRuntimeJson('C:\\Users\\test.json',{}));
  const identity={pid:123,startedAt:new Date().toISOString(),executable:'C:\\Program Files\\nodejs\\node.exe'};
  assert.deepEqual(validateProcessIdentity(identity),identity);
  assert.throws(()=>validateProcessIdentity({...identity,executable:'cmd.exe'}));assert.throws(()=>validateProcessIdentity({...identity,extra:true}));
});
test('importing actual runtime entrypoints has no installation/start side effect and off-Home entry is denied',async()=>{
  assert.equal(typeof runRuntimeMain,'function');assert.throws(()=>readInstallation('a'.repeat(64)),/host-runtime/);
  await assert.rejects(runRuntimeMain('unload-anything','a'.repeat(64),'b'.repeat(64)),/runtime-mode/);
});
test('operator package copies only the fixed pinned sources and refuses overwriting an existing package',()=>{
  const root=mkdtempSync(join(tmpdir(),'runa-runtime-package-test-'));
  try{
    for(const file of OPERATOR_FILES){const path=join(root,'gate7f/function-first',file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,'synthetic test source '+file);}
    const {profile,operatorPins,tlsPins}=fixture();const input={profile,operatorPins,tlsPins};
    const result=buildRuntimePackage(input,{repository:root});assert.equal(result.activated,false);assert.equal(result.privateMaterialIncluded,false);
    const installed=JSON.parse(readFileSync(join(result.output,'installation.json')));assert.equal(validateInstallation(installed).profile.candidate.id,'gemma');
    assert.throws(()=>buildRuntimePackage(input,{repository:root}),/EEXIST/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('all native runtime scripts parse in PS5 and its handle-based hardlink metadata helper executes',()=>{
  const files=OPERATOR_FILES.filter(file=>file.startsWith('home-runtime/')&&file.endsWith('.ps1')).map(file=>fileURLToPath(new URL('./'+file.slice('home-runtime/'.length),import.meta.url)));
  const source=fileURLToPath(new URL('./Runtime-Windows.ps1',import.meta.url));
  const literals=files.map(file=>"'"+file.replaceAll("'","''")+"'").join(',');
  const command=`$ErrorActionPreference='Stop';foreach($file in @(${literals})){$errors=$null;$tokens=$null;[void][Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'parse-failed'}};. '${source.replaceAll("'","''")}';`+
    `$stream=[IO.File]::OpenRead('${source.replaceAll("'","''")}');try{$info=New-Object RunaRuntimeFile+Info;if(-not[RunaRuntimeFile]::GetFileInformationByHandle($stream.SafeFileHandle,[ref]$info)-or$info.links-ne1){throw 'native-file-info'}}finally{$stream.Dispose()};`+
    `[Console]::Write('PS'+$PSVersionTable.PSVersion.Major+'-native-helper-pass')`;
  const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true});
  assert.equal(output.trim(),'PS5-native-helper-pass');
});

test('installer deterministically disables both scheduled tasks before registration',()=>{
  const installer=readFileSync(fileURLToPath(new URL('./Install-HomeRuntime.ps1',import.meta.url)),'utf8');
  assert.match(installer,/New-ScheduledTaskSettingsSet[^\r\n]+/u);
  assert.match(installer,/for\(\$index=0;\$index-lt2;\$index\+\+\)/u);
  assert.equal((installer.match(/\$settings\.Enabled=\$false/gu)||[]).length,1);
  assert.equal((installer.match(/Register-ScheduledTask/gu)||[]).length,2);
  assert.ok(installer.indexOf('$settings.Enabled=$false')<installer.indexOf('Register-ScheduledTask'));
});

test('native watchdog child probe has a real finite deadline and bounded output, independent of CIM',()=>{
  const source=fileURLToPath(new URL('./Runtime-Windows.ps1',import.meta.url));
  const command=`$ErrorActionPreference='Stop';. '${source.replaceAll("'","''")}';`+
    `$clock=[Diagnostics.Stopwatch]::StartNew();try{[void][RunaRuntimeProbe]::RunBounded(($PSHOME+'\\powershell.exe'),'-NoProfile -NonInteractive -Command Start-Sleep -Seconds 5',250,8192);throw 'timeout-missing'}`+
    `catch{if($_.Exception.InnerException.Message-notmatch'runtime-probe-timeout'){throw}};if($clock.ElapsedMilliseconds-gt4000){throw 'deadline-unbounded'};`+
    `try{[void][RunaRuntimeProbe]::RunBounded(($PSHOME+'\\powershell.exe'),'-NoProfile -NonInteractive -Command Write-Output (''x'' * 9000)',5000,8192);throw 'cap-missing'}`+
    `catch{if($_.Exception.ToString()-notmatch'runtime-probe-cap'){throw}};`+
    `if([RunaRuntimeProbe]::FreeMemory()-le0){throw 'memory-probe'};[Console]::Write('bounded-native-probe-pass')`;
  const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],
    {encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(output.trim(),'bounded-native-probe-pass');
});

test('native task descriptor and worker argv reject executable, extra-action and principal drift',()=>{
  const source=fileURLToPath(new URL('./Runtime-Windows.ps1',import.meta.url));
  const command=`$ErrorActionPreference='Stop';. '${source.replaceAll("'","''")}';$seal='${'a'.repeat(64)}';`+
    `$action=[pscustomobject]@{Execute='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';Arguments=('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\\AI\\RunaAI-Next-HomeRuntime\\code\\home-runtime\\Run-HomeRuntimeWorker.ps1" -ExpectedSeal '+$seal);WorkingDirectory=''};`+
    `$task=[pscustomobject]@{TaskName='RunaAI-Next-HomeRuntime-Worker';TaskPath='\\';Actions=@($action);Principal=[pscustomobject]@{UserId='S-1-5-19';LogonType='ServiceAccount';RunLevel='Limited'}};`+
    `Assert-RuntimeTask $task 'Worker' $seal;$original=$action.Execute;$action.Execute='cmd.exe';`+
    `try{Assert-RuntimeTask $task 'Worker' $seal;throw 'drift-accepted'}catch{if($_.Exception.Message-ne'runtime-task-action-drift'){throw}};$action.Execute=$original;`+
    `$task.Actions=@($action,$action);try{Assert-RuntimeTask $task 'Worker' $seal;throw 'extra-accepted'}catch{if($_.Exception.Message-ne'runtime-task-action-drift'){throw}};$task.Actions=@($action);`+
    `$task.Principal.UserId='S-1-5-18';try{Assert-RuntimeTask $task 'Worker' $seal;throw 'principal-accepted'}catch{if($_.Exception.Message-ne'runtime-task-principal'){throw}};`+
    `$arguments=[RunaRuntimeProbe]::Arguments('"C:\\Program Files\\nodejs\\node.exe" "C:\\AI\\RunaAI-Next-HomeRuntime\\code\\home-runtime\\runtime-main.mjs" worker '+$seal+' ${'b'.repeat(64)}');`+
    `if($arguments.Count-ne5-or$arguments[0]-cne'C:\\Program Files\\nodejs\\node.exe'-or$arguments[1]-cne'C:\\AI\\RunaAI-Next-HomeRuntime\\code\\home-runtime\\runtime-main.mjs'){throw 'argv'};[Console]::Write('exact-native-descriptor-pass')`;
  const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],
    {encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(output.trim(),'exact-native-descriptor-pass');
});
