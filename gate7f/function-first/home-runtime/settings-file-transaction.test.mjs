import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,linkSync,symlinkSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {sha} from './contracts.mjs';
const source=fileURLToPath(new URL('./Settings-FileTransaction.ps1',import.meta.url));
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const original=Buffer.from('{"ordinarySetting":"preserve me"}\r\n'),candidate=Buffer.from('{"ordinarySetting":"candidate"}\n');
function fixture(t){
  const root=mkdtempSync(path.join(tmpdir(),'runa-native-settings-')),target=path.join(root,'vendor.json'),directory=path.join(root,'private');
  mkdirSync(directory);writeFileSync(target,original);
  t.after(()=>{assert.equal(path.dirname(root),path.resolve(tmpdir()));assert.ok(path.basename(root).startsWith('runa-native-settings-'));rmSync(root,{recursive:true,force:true});});
  return {root,target,directory};
}
function ps(fixture,body,{status=0}={}){
  const command=`. ${quote(source)}\n$target=${quote(fixture.target)};$directory=${quote(fixture.directory)}\n${body}`;
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],
    // Omen's parent shell is PowerShell7. Its native powershell.exe bridge adjusts this value;
    // a Node child does not, and can otherwise import incompatible PowerShell7 type data.
    {encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:128*1024,
      env:{...process.env,PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'}});
  assert.equal(result.error,undefined,result.error?.message);assert.equal(result.status,status,result.stderr||result.stdout);
  return result.stdout.trim()?JSON.parse(result.stdout.trim()):null;
}
const create=`$intent=New-SettingsFileIntent $target $directory '${sha(original)}' ([Convert]::FromBase64String('${candidate.toString('base64')}'))`;
const fail=body=>`try{${body};throw 'test-unexpected-success'}catch{if($_.Exception.Message-eq'test-unexpected-success'){throw};@{error=$_.Exception.Message}|ConvertTo-Json -Compress}`;

test('actual Windows atomic swap retains custom ACL and exact original bytes through rollback',{skip:process.platform!=='win32'},t=>{
  const f=fixture(t),result=ps(f,`
    $acl=Get-Acl -LiteralPath $target;$acl.SetAccessRuleProtection($true,$true);Set-Acl -LiteralPath $target -AclObject $acl
    $before=Settings-Acl $target;${create}
    $applied=Invoke-SettingsFileSwap $directory;$after=Settings-Acl $target
    $rollback=Repair-InterruptedSettingsSwap $directory
    @{before=$before;after=$after;restored=(Settings-Acl $target);applied=$applied;rollback=$rollback}|ConvertTo-Json -Depth 5 -Compress`);
  assert.equal(result.before,result.after);assert.equal(result.before,result.restored);assert.equal(result.applied.inMemoryEnforcementProved,false);
  assert.deepEqual(readFileSync(f.target),original);assert.deepEqual(readFileSync(path.join(f.directory,'actual-preimage.bin')),original);
});
test('atomic replacement does not reconstruct the target ACL on either staging file',{skip:process.platform!=='win32'},()=>{
  const sourceText=readFileSync(source,'utf8');
  assert.doesNotMatch(sourceText,/Set-SettingsAcl/u);
  assert.match(sourceText,/Settings-Acl \$target\)-cne\$intent\.aclSddl/u);
  assert.match(sourceText,/Settings-Acl \$backup\)-cne\$intent\.aclSddl/u);
  assert.match(sourceText,/Settings-Acl \$displaced\)-cne\$priorAcl/u);
});
test('foreign edit or ACL change before swap is never overwritten',{skip:process.platform!=='win32'},t=>{
  for(const kind of ['bytes','acl']){
    const f=fixture(t);ps(f,create);
    const mutate=kind==='bytes'?`[IO.File]::WriteAllText($target,'unrelated writer')`:
      `$acl=Get-Acl -LiteralPath $target;$acl.SetAccessRuleProtection($true,$true);Set-Acl -LiteralPath $target -AclObject $acl`;
    const result=ps(f,`${mutate}\n${fail('Invoke-SettingsFileSwap $directory')}`);
    assert.match(result.error,/preapply-unrelated-drift/);assert.equal(existsSync(path.join(f.directory,'actual-preimage.bin')),false);
    assert.equal(readFileSync(f.target,'utf8'),kind==='bytes'?'unrelated writer':original.toString());
  }
});
test('already-original unstarted recovery does not ignore an unrelated ACL change',{skip:process.platform!=='win32'},t=>{
  const f=fixture(t);ps(f,create);
  const result=ps(f,`$acl=Get-Acl -LiteralPath $target;$acl.SetAccessRuleProtection($true,$true);Set-Acl -LiteralPath $target -AclObject $acl
    ${fail('Repair-InterruptedSettingsSwap $directory')}`);
  assert.match(result.error,/unstarted-unrelated-drift/);assert.deepEqual(readFileSync(f.target),original);
  assert.equal(existsSync(path.join(f.directory,'actual-preimage.bin')),false);
});
test('actual atomic preimage retains a late conflict without a second blind compensation',{skip:process.platform!=='win32'},t=>{
  const f=fixture(t),result=ps(f,`${create}\n${fail("Invoke-SettingsFileSwap $directory -BeforeReplace {[IO.File]::WriteAllText($target,'late unrelated writer')}")}`);
  assert.match(result.error,/apply-conflict-retained/);assert.deepEqual(readFileSync(f.target),candidate);
  assert.equal(readFileSync(path.join(f.directory,'actual-preimage.bin'),'utf8'),'late unrelated writer');
  assert.equal(readdirSync(f.directory).some(name=>name.startsWith('rollback-')),false);
  assert.match(ps(f,fail('Repair-InterruptedSettingsSwap $directory')).error,/unowned-preimage-retained/);
});
test('a real child exit immediately after Replace is recoverable by a new process',{skip:process.platform!=='win32'},t=>{
  const f=fixture(t);ps(f,`${create}\nInvoke-SettingsFileSwap $directory -AfterReplace {[Environment]::Exit(77)}`,{status:77});
  assert.deepEqual(readFileSync(f.target),candidate);assert.equal(existsSync(path.join(f.directory,'applied.json')),false);
  const result=ps(f,'Repair-InterruptedSettingsSwap $directory|ConvertTo-Json -Compress');
  assert.equal(result.actualPreimageRetained,true);assert.deepEqual(readFileSync(f.target),original);
  assert.equal(ps(f,'Repair-InterruptedSettingsSwap $directory|ConvertTo-Json -Compress').alreadyRestored,true);
});
test('late ACL edits are retained and post-apply ACL drift denies rollback before any swap',{skip:process.platform!=='win32'},t=>{
  const changeAcl=`$acl=Get-Acl -LiteralPath $target;$acl.SetAccessRuleProtection($true,$true);Set-Acl -LiteralPath $target -AclObject $acl`;
  const late=fixture(t),result=ps(late,`${create}\n${fail(`Invoke-SettingsFileSwap $directory -BeforeReplace {${changeAcl}}`)}`);
  assert.match(result.error,/apply-conflict-retained/);assert.deepEqual(readFileSync(late.target),candidate);
  assert.equal(ps(late,'@{protected=(Get-Acl -LiteralPath $target).AreAccessRulesProtected}|ConvertTo-Json -Compress').protected,true);
  const after=fixture(t);ps(after,`${create}\n$null=Invoke-SettingsFileSwap $directory\n${changeAcl}`);
  assert.match(ps(after,fail('Repair-InterruptedSettingsSwap $directory')).error,/rollback-unrelated-drift/);
  assert.deepEqual(readFileSync(after.target),candidate);
});
test('a late rollback writer is retained without racing another blind compensation',{skip:process.platform!=='win32'},t=>{
  const f=fixture(t),result=ps(f,`${create}\n$null=Invoke-SettingsFileSwap $directory\n${fail(`Restore-SettingsActualPreimage $directory '${sha(candidate)}' -BeforeReplace {[IO.File]::WriteAllText($target,'rollback-racing-writer')}`)}`);
  assert.match(result.error,/rollback-conflict-retained/);assert.deepEqual(readFileSync(f.target),original);
  const displaced=readdirSync(f.directory).filter(name=>name.startsWith('displaced-'));assert.equal(displaced.length,1);
  assert.equal(readFileSync(path.join(f.directory,displaced[0]),'utf8'),'rollback-racing-writer');
  assert.equal(readdirSync(f.directory).some(name=>name.startsWith('compensated-')),false);
  assert.match(ps(f,fail('Repair-InterruptedSettingsSwap $directory')).error,/conflict-retained/);
});
test('rollback refuses post-apply unrelated bytes and preserves both versions',{skip:process.platform!=='win32'},t=>{
  const f=fixture(t);ps(f,`${create}\n$null=Invoke-SettingsFileSwap $directory`);writeFileSync(f.target,'new unrelated settings');
  const result=ps(f,fail('Repair-InterruptedSettingsSwap $directory'));
  assert.match(result.error,/rollback-unrelated-drift/);assert.equal(readFileSync(f.target,'utf8'),'new unrelated settings');
  assert.deepEqual(readFileSync(path.join(f.directory,'actual-preimage.bin')),original);
});
test('direct restore rejects every foreign actual preimage before creating or changing a file',{skip:process.platform!=='win32'},t=>{
  for(const kind of ['late-bytes','late-acl','tampered-bytes','tampered-acl']){
    const f=fixture(t);
    const changeAcl=target=>`$acl=Get-Acl -LiteralPath ${target};$acl.SetAccessRuleProtection($true,$true);Set-Acl -LiteralPath ${target} -AclObject $acl`;
    if(kind.startsWith('late')){
      const race=kind==='late-bytes'?"[IO.File]::WriteAllText($target,'late-foreign-preimage')":changeAcl('$target');
      const failed=ps(f,`${create}\n${fail(`Invoke-SettingsFileSwap $directory -BeforeReplace {${race}}`)}`);
      assert.match(failed.error,/apply-conflict-retained/);
    }else{
      ps(f,`${create}\n$null=Invoke-SettingsFileSwap $directory`);
      if(kind==='tampered-bytes')writeFileSync(path.join(f.directory,'actual-preimage.bin'),'tampered-foreign-preimage');
      else ps(f,changeAcl("($directory+'\\actual-preimage.bin')"));
    }
    const names=readdirSync(f.directory).sort(),current=readFileSync(f.target);
    const denied=ps(f,fail(`Restore-SettingsActualPreimage $directory '${sha(current)}'`));
    assert.match(denied.error,/unowned-preimage-retained/);
    assert.deepEqual(readFileSync(f.target),current);
    assert.deepEqual(readdirSync(f.directory).sort(),names);
  }
});

test('direct restore accepts a verified current-byte normalization but restores exact owned original',{skip:process.platform!=='win32'},t=>{
  const f=fixture(t);ps(f,`${create}\n$null=Invoke-SettingsFileSwap $directory`);
  const normalized=Buffer.from(JSON.stringify(JSON.parse(candidate),null,2)+'\r\n');writeFileSync(f.target,normalized);
  const restored=ps(f,`Restore-SettingsActualPreimage $directory '${sha(normalized)}'|ConvertTo-Json -Compress`);
  assert.equal(restored.restoredSha256,sha(original));assert.deepEqual(readFileSync(f.target),original);
});

test('hardlinked settings, reparse ancestors and tampered candidate fail before replacement',{skip:process.platform!=='win32'},t=>{
  const hard=fixture(t);linkSync(hard.target,path.join(hard.root,'alias.json'));
  assert.match(ps(hard,fail(create)).error,/file-bounds/);assert.deepEqual(readFileSync(hard.target),original);
  const linked=fixture(t),real=linked.directory,junction=path.join(linked.root,'redirect');symlinkSync(real,junction,'junction');
  assert.match(ps({...linked,directory:junction},fail(create)).error,/path-link/);
  const tampered=fixture(t);ps(tampered,create);writeFileSync(path.join(tampered.directory,'candidate.bin'),'different');
  assert.match(ps(tampered,fail('Invoke-SettingsFileSwap $directory')).error,/candidate-drift/);assert.deepEqual(readFileSync(tampered.target),original);
});
