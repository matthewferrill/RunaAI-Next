import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const quote=value=>"'"+value.replaceAll("'","''")+"'";
test('actual Windows closed-file publication refuses duplicates and ignores interrupted temporary files',{skip:process.platform!=='win32'},()=>{
  const root=mkdtempSync(path.join(realpathSync(tmpdir()),'runa-completion-'));
  const script=path.join(import.meta.dirname,'Write-HomeCampaignCompletion.ps1');
  const source=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';Set-StrictMode -Version Latest
. ${quote(script)} -LibraryOnly
$root=${quote(root)};[IO.File]::WriteAllText(($root+'\\complete.pending-interrupted.json'),'partial')
if(Test-Path -LiteralPath ($root+'\\complete.json')){throw 'fixture-visible-before-publish'}
$marker='{"schemaVersion":"runa-m1-campaign-completion/v1","leaseId":"20260828-campaign-coder-r5","sealSha256":"${'a'.repeat(64)}","reason":"abort"}'
$bytes=[Text.Encoding]::UTF8.GetBytes($marker)
$digest=Publish-ClosedCompletion $root $bytes
$raw=[IO.File]::ReadAllText(($root+'\\complete.json'));if($raw-cne$marker){throw 'fixture-marker-changed'}
$denied=$false;try{[void](Publish-ClosedCompletion $root ([Text.Encoding]::UTF8.GetBytes('replacement')))}catch{$denied=$true}
if(-not$denied-or[IO.File]::ReadAllText(($root+'\\complete.json'))-cne$marker){throw 'fixture-overwrite'}
@{passed=$true;existingRefused=$denied;interruptedRetained=(Test-Path -LiteralPath ($root+'\\complete.pending-interrupted.json'));markerSha256=$digest}|ConvertTo-Json -Compress`;
  try{const raw=execFileSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],
    {encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:16384});const result=JSON.parse(raw);
    assert.equal(result.passed,true);assert.equal(result.existingRefused,true);assert.equal(result.interruptedRetained,true);assert.match(result.markerSha256,/^[a-f0-9]{64}$/);
  }finally{assert.equal(path.dirname(root),realpathSync(tmpdir()));assert.ok(path.basename(root).startsWith('runa-completion-'));rmSync(root,{recursive:true,force:true});}
});
test('completion publication closes and flushes before no-overwrite move and never invokes lifecycle',()=>{
  const text=readFileSync(path.join(import.meta.dirname,'Write-HomeCampaignCompletion.ps1'),'utf8');
  assert.ok(text.indexOf('$stream.Flush($true)')<text.indexOf('[IO.File]::Move'));
  assert.ok(text.indexOf('$stream.Dispose()')<text.indexOf('[IO.File]::Move'));
  assert.doesNotMatch(text,/\[IO\.File\]::Replace|Stop-Process|Stop-ScheduledTask|Unload|nvidia-smi/);
  assert.match(text,/completion-task-owner/);assert.match(text,/completion-seal-drift/);
});
test('an actual concurrent Windows reader observes the complete closed marker',{skip:process.platform!=='win32'},()=>{
  const root=mkdtempSync(path.join(realpathSync(tmpdir()),'runa-completion-reader-'));
  const script=path.join(import.meta.dirname,'Write-HomeCampaignCompletion.ps1');
  const source=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';Set-StrictMode -Version Latest
. ${quote(script)} -LibraryOnly
$root=${quote(root)}
$job=Start-Job -ArgumentList $root -ScriptBlock {
 param($directory);$ErrorActionPreference='Stop';[IO.File]::WriteAllText(($directory+'\\reader-ready'),'ready')
 $until=[DateTime]::UtcNow.AddSeconds(5)
 while(-not(Test-Path -LiteralPath ($directory+'\\complete.json'))){if([DateTime]::UtcNow-gt$until){throw 'fixture-reader-timeout'};Start-Sleep -Milliseconds 1}
 $value=[IO.File]::ReadAllText(($directory+'\\complete.json'))|ConvertFrom-Json
 if($value.schemaVersion-cne'runa-m1-campaign-completion/v1'-or$value.reason-cne'abort'){throw 'fixture-partial-marker'}
 'reader-passed'
}
try{
 $until=[DateTime]::UtcNow.AddSeconds(5)
 while(-not(Test-Path -LiteralPath ($root+'\\reader-ready'))){if([DateTime]::UtcNow-gt$until){throw 'fixture-reader-not-ready'};Start-Sleep -Milliseconds 10}
 [void](Publish-ClosedCompletion $root ([Text.Encoding]::UTF8.GetBytes('{"schemaVersion":"runa-m1-campaign-completion/v1","reason":"abort"}')))
 [void](Wait-Job -Job $job -Timeout 5)
 if($job.State-ne'Completed'){throw 'fixture-reader-failed'}
 $value=Receive-Job -Job $job -ErrorAction Stop
 if($value-cne'reader-passed'){throw 'fixture-reader-value'}
 'passed'
}finally{if($job.State-eq'Running'){Stop-Job -Job $job};Remove-Job -Job $job}`;
  try{assert.match(execFileSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],
    {encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:16384}),/passed/);
  }finally{assert.equal(path.dirname(root),realpathSync(tmpdir()));assert.ok(path.basename(root).startsWith('runa-completion-reader-'));rmSync(root,{recursive:true,force:true});}
});
