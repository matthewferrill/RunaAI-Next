import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rename,link,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {NativeMutationJournal} from './native-mutation-journal.mjs';
import {createSettingsFileBridgeCore} from './native-settings-file-core.mjs';
import {prepareNativeSettings} from './native-settings.mjs';
import {sha} from './tls-primitives.mjs';

const execute=promisify(execFile),moduleUrl=pathToFileURL(fileURLToPath(new URL('./native-mutation-journal.mjs',import.meta.url))).href;
const binding=()=>({transitionId:'a'.repeat(32),originalSha256:'1'.repeat(64),candidateSha256:'2'.repeat(64),
  descriptorSha256:'3'.repeat(64),operatorSha256:'4'.repeat(64),engine:{pid:100,startedAt:'2026-08-28T01:00:00.000Z',executable:'C:\\synthetic\\engine.exe'}});
const id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
function settingsIntent(b,mode='Prepare',currentSha256=b.originalSha256){return {type:'native-settings-file-intent',
  transactionId:b.transitionId,mode,originalSha256:b.originalSha256,candidateSha256:b.candidateSha256,currentSha256};}
function settingsReturned(b,mode='Prepare',alreadyOriginal=false){return {type:'native-settings-file-returned',
  transactionId:b.transitionId,mode,confirmed:true,receipt:{schemaVersion:'runaai-native-settings-file/v1',mode,
    transactionId:b.transitionId,originalSha256:b.originalSha256,candidateSha256:b.candidateSha256,
    currentSha256:mode==='Swap'?b.candidateSha256:b.originalSha256,passed:true,targetBound:true,privateValuesIncluded:false,
    inMemoryEnforcementProved:false,admissionOpened:false,actualPreimageRetained:mode!=='Prepare',alreadyOriginal}};}
function serverIntent(b,mode='stop',commandId=id){return {type:'native-server-command-intent',commandId,mode,
  bind:mode==='stop'?null:'127.0.0.1',engine:b.engine,descriptorSha256:b.descriptorSha256,time:10000};}
function serverReturned(mode='stop',commandId=id){return {type:'native-server-command-returned',commandId,mode,
  failure:null,stdoutSha256:'5'.repeat(64),stderrSha256:'6'.repeat(64),time:11000};}
function serverConfirmed(b,mode='stop',commandId=id){return {type:'native-server-command-confirmed',commandId,mode,
  engine:b.engine,descriptorSha256:b.descriptorSha256,observedAt:12000,time:12010,settingsEnforced:false};}
async function fixture(t,b=binding()){
  const root=await mkdtemp(path.join(tmpdir(),'runa-native-journal-')),directory=path.join(root,'records');await mkdir(directory);
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(tmpdir()));assert.match(path.basename(root),/^runa-native-journal-/);
    await rm(root,{recursive:true,force:true});});
  let calls=0,deny=false;
  const options={directory,binding:b,assertOwnerPrivate:async value=>{assert.equal(value,directory);calls++;if(deny)throw Error('fixture ACL refused');}};
  return {root,directory,b,options,journal:new NativeMutationJournal(options),calls:()=>calls,deny:()=>{deny=true;}};
}
async function restartCheck(f){
  const script=`import {NativeMutationJournal} from ${JSON.stringify(moduleUrl)};
    const b=JSON.parse(process.argv[2]);const j=new NativeMutationJournal({directory:process.argv[1],binding:b,
      assertOwnerPrivate:async()=>{}});try{await j.assertMutationSettled();process.stdout.write('settled');}
    catch(e){process.stdout.write(e.code??'unexpected');}`;
  return (await execute(process.execPath,['--input-type=module','-e',script,f.directory,JSON.stringify(f.b)],
    {windowsHide:true,timeout:5000,maxBuffer:1024})).stdout;
}

test('construction is inert and mandatory owner boundary cannot be omitted',async t=>{
  const f=await fixture(t);assert.equal(f.calls(),0);assert.throws(()=>new NativeMutationJournal({...f.options,assertOwnerPrivate:undefined}),/boundary/);
  assert.throws(()=>new NativeMutationJournal({...f.options,directory:'relative'}),/boundary/);
  assert.throws(()=>new NativeMutationJournal({...f.options,binding:{...f.b,extra:'private'}}),/binding/);
  assert.equal((await f.journal.assertMutationSettled()).revision,0);assert.ok(f.calls()>=2);
  f.deny();await assert.rejects(()=>f.journal.record(settingsIntent(f.b)),/ACL refused/);assert.deepEqual(await readdir(f.directory),[]);
});

test('confirmed settings and server sequence survives reconstruction and hash chaining',async t=>{
  const f=await fixture(t),j=f.journal,b=f.b;
  await j.record(settingsIntent(b));await j.record(settingsReturned(b));
  await j.record(serverIntent(b));await j.record(serverReturned());
  await assert.rejects(()=>j.assertMutationSettled(),/unresolved-mutation/);
  await j.record(serverConfirmed(b));await j.record(settingsIntent(b,'Swap'));await j.record(settingsReturned(b,'Swap'));
  const startId='bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee';await j.record(serverIntent(b,'start',startId));
  await j.record(serverReturned('start',startId));await j.record(serverConfirmed(b,'start',startId));
  await j.record(settingsIntent(b,'Restore',b.candidateSha256));await j.record(settingsReturned(b,'Restore'));
  assert.equal((await j.assertMutationSettled()).revision,12);assert.equal(await restartCheck(f),'settled');
  const records=await Promise.all((await readdir(f.directory)).map(name=>readFile(path.join(f.directory,name))));
  for(let i=1;i<records.length;i++)assert.equal(JSON.parse(records[i]).previousSha256,sha(records[i-1]));
  await assert.rejects(()=>j.record(settingsIntent(b,'Swap')),/pending-or-reused/);
  await assert.rejects(()=>j.record(serverIntent(b)),/pending-or-reused/);
});

test('new actual Node process cannot clear intent-only crash or CLI-return-only uncertainty',async t=>{
  for(const phase of ['intent','returned']){
    const f=await fixture(t);await f.journal.record(serverIntent(f.b));if(phase==='returned')await f.journal.record(serverReturned());
    assert.equal(await restartCheck(f),'runtime-native-journal-unresolved-mutation');
    const reconstructed=new NativeMutationJournal(f.options);
    await assert.rejects(()=>reconstructed.record(settingsIntent(f.b,'Restore')),/pending-or-reused/);
    await assert.rejects(()=>reconstructed.record(serverIntent(f.b,'start','cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee')),/pending-or-reused/);
  }
});

test('unknown settings child remains pending even when stopped and new bridge is constructed',async t=>{
  const original=Buffer.from(JSON.stringify({autoStartOnLaunch:true,port:1234,cors:false,logSensitiveData:true,
    logIncomingTokens:false,verbose:true,logLinesLimit:500,networkInterface:'0.0.0.0',justInTimeModelLoading:true,fileLoggingMode:'succinct'}));
  const prepared=prepareNativeSettings(original,sha(original)),b={...binding(),originalSha256:prepared.originalSha256,candidateSha256:prepared.candidateSha256};
  const f=await fixture(t,b);let dispatches=0;
  const options={transactionId:b.transitionId,prepared,io:{verify:async()=>{},read:async()=>original,
    execute:async()=>{dispatches++;throw Object.assign(Error('synthetic lost reply'),{executionStopped:true});}},assertQuiescent:async()=>{},
    record:event=>f.journal.record(event),assertMutationSettled:()=>f.journal.assertMutationSettled()};
  let bridge=createSettingsFileBridgeCore(options);await bridge.verify();await assert.rejects(()=>bridge.swapFile(),/command-unconfirmed/);
  assert.equal(await restartCheck(f),'runtime-native-journal-unresolved-mutation');
  const reopened=new NativeMutationJournal(f.options);bridge=createSettingsFileBridgeCore({...options,
    record:event=>reopened.record(event),assertMutationSettled:()=>reopened.assertMutationSettled()});await bridge.verify();
  await assert.rejects(()=>bridge.restoreFile({expectedCurrentSha256:b.originalSha256,alreadyOriginal:true}),/unresolved-mutation/);
  await assert.rejects(()=>reopened.record(settingsReturned(b,'Swap')),/return-without-pending/);assert.equal(dispatches,1);
});

test('unknown native child cannot be confirmed from a later snapshot or stopped-child claim',async t=>{
  const f=await fixture(t);await f.journal.record(serverIntent(f.b));await f.journal.record({...serverReturned(),
    failure:{code:'runtime-native-server-child-unconfirmed',executionStopped:true},stdoutSha256:null,stderrSha256:null});
  assert.equal(await restartCheck(f),'runtime-native-journal-unresolved-mutation');
  await assert.rejects(()=>f.journal.record(serverConfirmed(f.b)),/confirmation-without-return/);
  assert.equal((await f.journal.load()).operations['server:'+id].status,'unknown');
});

test('mismatched, stale or fabricated confirmations never clear pending authority',async t=>{
  const f=await fixture(t);await f.journal.record(serverIntent(f.b));
  await assert.rejects(()=>f.journal.record(serverConfirmed(f.b)),/confirmation-without-return/);
  await assert.rejects(()=>f.journal.record({...serverReturned(),time:9000}),/return-without-pending/);
  await f.journal.record(serverReturned());
  for(const patch of [{commandId:'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee'},{mode:'start'},
    {observedAt:5000,time:5001},{observedAt:12000,time:18000},{descriptorSha256:'f'.repeat(64)},
    {engine:{...f.b.engine,pid:99}},{settingsEnforced:true},{privateOutput:'denied'}]){
    await assert.rejects(()=>f.journal.record({...serverConfirmed(f.b),...patch}));
    await assert.rejects(()=>f.journal.assertMutationSettled(),/unresolved-mutation/);
  }
  await f.journal.record(serverConfirmed(f.b));await f.journal.assertMutationSettled();
});

test('settings receipt must match the exact original intent including already-original restore',async t=>{
  const f=await fixture(t);await f.journal.record(settingsIntent(f.b,'Restore'));
  await assert.rejects(()=>f.journal.record(settingsReturned(f.b,'Restore',false)),/settings-receipt/);
  for(const patch of [{transactionId:'f'.repeat(32)},{currentSha256:f.b.candidateSha256},{privateValuesIncluded:true},
    {admissionOpened:true},{rawSettings:'private'}]){
    const value=settingsReturned(f.b,'Restore',true);Object.assign(value.receipt,patch);await assert.rejects(()=>f.journal.record(value),/settings-receipt/);
  }
  await f.journal.record(settingsReturned(f.b,'Restore',true));await f.journal.assertMutationSettled();
});

test('concurrent create-only publication allows one intent and never overwrites its competitor',async t=>{
  const f=await fixture(t),other=new NativeMutationJournal(f.options);
  const result=await Promise.allSettled([f.journal.record(settingsIntent(f.b)),other.record(serverIntent(f.b))]);
  assert.equal(result.filter(value=>value.status==='fulfilled').length,1);assert.equal(result.filter(value=>value.status==='rejected').length,1);
  assert.deepEqual(await readdir(f.directory),['000001.json']);await assert.rejects(()=>other.assertMutationSettled(),/unresolved-mutation/);
});

test('partial records, gaps, unknown files and modified earlier history fail closed without cleanup',async t=>{
  for(const kind of ['partial','gap','extra','tamper','chain','noncanonical','invalid-utf8']){
    const f=await fixture(t);await f.journal.record(settingsIntent(f.b));await f.journal.record(settingsReturned(f.b));
    const first=path.join(f.directory,'000001.json'),second=path.join(f.directory,'000002.json');
    if(kind==='partial')await writeFile(second,'{"partial":');
    if(kind==='gap')await rename(second,path.join(f.directory,'000003.json'));
    if(kind==='extra')await writeFile(path.join(f.directory,'notes.txt'),'not journal');
    if(kind==='tamper'){const bytes=await readFile(first,'utf8');await writeFile(first,bytes.replace('"mode":"Prepare"','"mode":"Restore"'));}
    if(kind==='chain'){const bytes=await readFile(second,'utf8');await writeFile(second,bytes.replace(/"previousSha256":"[a-f0-9]{64}"/,'"previousSha256":"'+'f'.repeat(64)+'"'));}
    if(kind==='noncanonical')await writeFile(second,(await readFile(second,'utf8'))+' ');
    if(kind==='invalid-utf8')await writeFile(second,Buffer.from([0xc3,0x28]));
    const before=await readdir(f.directory);await assert.rejects(()=>new NativeMutationJournal(f.options).assertMutationSettled());
    assert.deepEqual(await readdir(f.directory),before);
  }
});

test('binding is copied at construction and wrong transition or operator cannot reopen history',async t=>{
  const f=await fixture(t),saved=structuredClone(f.b);f.b.engine.pid=999;f.b.operatorSha256='e'.repeat(64);
  await f.journal.record(settingsIntent(saved));
  for(const patch of [{transitionId:'b'.repeat(32)},{operatorSha256:'b'.repeat(64)},
    {candidateSha256:'b'.repeat(64)},{engine:{...saved.engine,pid:99}}]){
    await assert.rejects(()=>new NativeMutationJournal({...f.options,binding:{...saved,...patch}}).load(),/record-integrity/);
  }
});

test('actual hardlink and directory junction are rejected without modifying their targets',async t=>{
  const f=await fixture(t);await f.journal.record(settingsIntent(f.b));const first=path.join(f.directory,'000001.json');
  const bytes=await readFile(first);await link(first,path.join(f.root,'hardlink.json'));
  await assert.rejects(()=>f.journal.load(),/path-kind/);assert.deepEqual(await readFile(first),bytes);
  const linked=path.join(f.root,'linked');await symlink(f.directory,linked,process.platform==='win32'?'junction':'dir');
  await assert.rejects(()=>new NativeMutationJournal({...f.options,directory:linked}).load(),/linked-path/);
  assert.deepEqual(await readFile(first),bytes);
});

test('diagnostic transition events, additional private fields and unsupported actions cannot grant authority',async t=>{
  const f=await fixture(t);
  for(const value of [{type:'transition-result',passed:true},{type:'reset'},{...settingsIntent(f.b),rawSettings:'private'},
    {...serverIntent(f.b),mode:'unload'},{...serverIntent(f.b),bind:'192.168.50.1'},
    {...settingsIntent(f.b),currentSha256:'other'},{type:'x',data:'x'.repeat(32768)}])await assert.rejects(()=>f.journal.record(value));
  assert.deepEqual(await readdir(f.directory),[]);
});
