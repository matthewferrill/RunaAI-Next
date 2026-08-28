import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,realpathSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {TLS_ENROLLMENT_SOURCE_FILES,validateTlsEnrollmentSeal} from './tls-enrollment-cli.mjs';
const literal=value=>"'"+value.replaceAll("'","''")+"'";
const directory=path.dirname(fileURLToPath(import.meta.url));
const powershell='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
function ps(source){const strict="$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';Set-StrictMode -Version Latest\n"+source;
  return execFileSync(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(strict,'utf16le').toString('base64')],
  {encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:32768,env:{...process.env,PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'}});}
test('TLS package binds the complete source set and separate host-specific executable pins',()=>{
  const seal={schemaVersion:'runaai-tls-enrollment-package/v1',enrollmentId:'a'.repeat(32),host:'RUNA-HOME',nodeSha256:'b'.repeat(64),opensslSha256:'c'.repeat(64),
    sourceFiles:Object.fromEntries(TLS_ENROLLMENT_SOURCE_FILES.map(name=>[name,'d'.repeat(64)]))};
  assert.equal(validateTlsEnrollmentSeal(seal),seal);
  assert.throws(()=>validateTlsEnrollmentSeal({...seal,sourceFiles:{...seal.sourceFiles,'unowned.mjs':'d'.repeat(64)}}),/tls-package-source-set/);
  assert.throws(()=>validateTlsEnrollmentSeal({...seal,host:'OTHER'}),/tls-package-schema/);
  assert.throws(()=>validateTlsEnrollmentSeal({...seal,nodeSha256:null}),/tls-package-schema/);
});
test('exact standalone enrollment package imports without model/lifecycle dependencies',()=>{
  const root=mkdtempSync(path.join(realpathSync(tmpdir()),'runa-tls-package-'));
  try{for(const name of TLS_ENROLLMENT_SOURCE_FILES)copyFileSync(path.join(directory,name),path.join(root,name));
    const script=`const module=await import(${JSON.stringify(pathToFileURL(path.join(root,'tls-enrollment-cli.mjs')).href)});if(module.TLS_ENROLLMENT_SOURCE_FILES.length!==6)throw Error('incomplete');console.log('passed');`;
    assert.match(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',windowsHide:true,timeout:10000}),/passed/);
  }finally{assert.equal(path.dirname(root),realpathSync(tmpdir()));assert.ok(path.basename(root).startsWith('runa-tls-package-'));rmSync(root,{recursive:true,force:true});}
});
// Actual SYSTEM/Admin ACL mutation is a separate installed-principal proof. Omen's ordinary
// process cannot set Administrators as owner; do not substitute a permissive fixture or count
// that limitation as a passing test. Invoke-ControlTlsAclProof.ps1 retains the real result.
test('actual Windows PowerShell5 parser accepts the sealed ACL entrypoints',{skip:process.platform!=='win32'},()=>{
  const paths=['Tls-Windows.ps1','Tls-Directory.ps1','Invoke-ControlTlsAclProof.ps1'].map(name=>path.join(directory,name));
  assert.match(ps(`$ErrorActionPreference='Stop'
foreach($file in @(${paths.map(literal).join(',')})){
 $tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
 if($errors.Count-ne0){throw 'fixture-parse-error'}
}
'passed'`),/passed/);
  const entry=readFileSync(path.join(directory,'Tls-Directory.ps1'),'utf8');
  assert.match(entry,/RunaAI-Next-Candidate\\m1-home-runtime-tls/);
  assert.doesNotMatch(entry,/Start-Process|Register-ScheduledTask|server start|netsh/i);
});
