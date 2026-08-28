import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,lstat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const helper=fileURLToPath(new URL('./Publish-CampaignMetadata.ps1',import.meta.url));
const quote=value=>"'"+value.replaceAll("'","''")+"'";
async function execute(script,{observe=null}={}){
  const child=spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'}});
  let stdout='',stderr='',done=false,timedOut=false;
  child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  const end=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{done=true;resolve({code,signal});});});
  const timer=setTimeout(()=>{timedOut=true;child.kill();},30000);
  const observed=observe?await observe(()=>done):null;
  try{return{...await end,stdout,stderr,observed,timedOut};}finally{clearTimeout(timer);}
}
const prefix="$ErrorActionPreference='Stop'\n$ProgressPreference='SilentlyContinue'\n. "+quote(helper)+"\n";
async function makeRoot(){return mkdtemp(path.join(tmpdir(),'runa-mirror-publication-'));}
for(let repetition=1;repetition<=3;repetition++)test(`Windows publication keeps actual concurrent reads complete, repeat ${repetition}`,{skip:process.platform!=='win32'},async()=>{
  const root=await makeRoot(),target=path.join(root,'home-live.json');
  await writeFile(target,JSON.stringify({sequence:0,padding:'synthetic'}),{flag:'wx'});
  const script=prefix+"$target="+quote(target)+"\n$retries=0\nfor($i=1;$i-le200;$i++){ $raw=('{\"sequence\":'+$i+',\"padding\":\"synthetic\"}'); $r=Publish-CampaignMetadata -Target $target -Raw $raw; $retries+=$r.sharingRetries }\n[Console]::Out.Write(('{\"published\":200,\"sharingRetries\":'+$retries+'}'))";
  const result=await execute(script,{observe:async done=>{let reads=0,valid=0,last=0;const errors=[];while(!done()){reads++;try{const info=await lstat(target);assert.equal(info.isFile(),true);assert.equal(info.isSymbolicLink(),false);const value=JSON.parse(await readFile(target,'utf8'));assert.equal(value.padding,'synthetic');assert.ok(Number.isInteger(value.sequence)&&value.sequence>=last&&value.sequence<=200);last=value.sequence;valid++;}catch(e){errors.push({code:e.code??e.name,message:e.message});}}return{reads,valid,errors};}});
  const final=JSON.parse(await readFile(target,'utf8'));
  await writeFile(path.join(root,'result.json'),JSON.stringify({repetition,node:process.version,...result,final},null,2)+'\n',{flag:'wx'});
  assert.equal(result.code,0,result.stderr);assert.equal(result.timedOut,false);assert.equal(JSON.parse(result.stdout).published,200);
  assert.ok(result.observed.reads>0);assert.deepEqual(result.observed.errors,[]);assert.equal(final.sequence,200);
});
test('stale temporary file and wrong filename fail before altering either file',{skip:process.platform!=='win32'},async()=>{
  const root=await makeRoot(),target=path.join(root,'home-live.json'),temporary=target+'.new';
  await writeFile(target,'original',{flag:'wx'});await writeFile(temporary,'foreign staged',{flag:'wx'});
  const result=await execute(prefix+"Publish-CampaignMetadata -Target "+quote(target)+" -Raw 'replacement'");
  assert.notEqual(result.code,0);assert.match(result.stderr,/mirror-staged-write-exists/);assert.equal(await readFile(target,'utf8'),'original');assert.equal(await readFile(temporary,'utf8'),'foreign staged');
  const wrong=await execute(prefix+"Publish-CampaignMetadata -Target "+quote(path.join(root,'not-metadata.json'))+" -Raw 'replacement'");
  assert.notEqual(wrong.code,0);assert.match(wrong.stderr,/mirror-publication-target-invalid/);
});
test('a deterministic foreign byte change is retained and stops publication',{skip:process.platform!=='win32'},async()=>{
  const root=await makeRoot(),target=path.join(root,'home-live.json');await writeFile(target,'original',{flag:'wx'});
  const script=prefix+"Import-Module Microsoft.PowerShell.Utility -ErrorAction Stop\n$script:observedTarget="+quote(target)+"\n$script:targetReads=0\nfunction Get-FileHash { param([string]$LiteralPath,[string]$Algorithm) if($LiteralPath-eq$script:observedTarget){$script:targetReads++;if($script:targetReads-eq2){[IO.File]::WriteAllText($LiteralPath,'foreign change')}} Microsoft.PowerShell.Utility\\Get-FileHash -LiteralPath $LiteralPath -Algorithm $Algorithm }\nPublish-CampaignMetadata -Target "+quote(target)+" -Raw 'replacement'";
  const result=await execute(script);assert.notEqual(result.code,0);assert.match(result.stderr,/mirror-publication-drift/);
  assert.equal(await readFile(target,'utf8'),'foreign change');assert.equal(await readFile(target+'.new','utf8'),'replacement');
});
test('initial publication is create-only and retains exact UTF8 bytes',{skip:process.platform!=='win32'},async()=>{
  const root=await makeRoot(),target=path.join(root,'home-live.json');
  const result=await execute(prefix+"$r=Publish-CampaignMetadata -Target "+quote(target)+" -Raw '{\"sequence\":1}'; [Console]::Out.Write(($r|ConvertTo-Json -Compress))");
  assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(result.stdout).created,true);assert.equal(await readFile(target,'utf8'),'{"sequence":1}');
});
test('persistent sharing denial is bounded and retains old and staged bytes',{skip:process.platform!=='win32'},async()=>{
  const root=await makeRoot(),target=path.join(root,'home-live.json');await writeFile(target,'original',{flag:'wx'});
  const script=prefix+"$target="+quote(target)+"\n$held=[IO.File]::Open($target,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)\ntry{Publish-CampaignMetadata -Target $target -Raw 'replacement'}finally{$held.Dispose()}";
  const result=await execute(script);assert.notEqual(result.code,0);assert.equal(result.timedOut,false);assert.match(result.stderr,/mirror-publication-sharing-timeout/);
  assert.equal(await readFile(target,'utf8'),'original');assert.equal(await readFile(target+'.new','utf8'),'replacement');
});
