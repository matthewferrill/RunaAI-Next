import path from 'node:path';
import {readdir} from 'node:fs/promises';
import {APPLICATION,ROOT,hash} from './assembly.mjs';
import {closedCompanionArguments} from './descriptor.mjs';
import {createClosedPhaseCompanion} from './companion.mjs';
import {POWERSHELL,digest,plainFile,prepareWatchdogRequest,launchWatchdog,inspectWatchdog} from './watchdog.mjs';

const HASH=/^[a-f0-9]{64}$/u,ID=/^[a-f0-9]{32}$/u;
const fail=code=>Object.assign(Error('m1-closed-adapter-'+code),{code:'m1-closed-adapter-'+code});
const need=(value,code)=>{if(!value)throw fail(code);};
const same=(a,b)=>hash(a)===hash(b);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys.split(',').sort().join();
const COMPANION='gate7a/control/Invoke-ClosedM1Successor.ps1';
const WRAPPER='watchdog/Invoke-ClosedCompanionWatchdog.ps1',HELPER='watchdog/ClosedCompanionJob.cs',HOST='watchdog/Watchdog-Host.mjs';
const childLimits=Object.freeze({'caddy-validate':20000,'archive-extract':120000,qualification:60000,'owner-rebind':60000});

/** Pure seven-file operator assembly. Does not write a package or activate it. */
export function buildSupervisedCompanion({sourceBytes,childBytes,functionsBytes,aclBytes,wrapperBytes,jobBytes,hostBytes}){
  const companion=createClosedPhaseCompanion({sourceBytes,childBytes,functionsBytes,aclBytes});
  for(const bytes of [wrapperBytes,jobBytes,hostBytes])need(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<65536,'supervisor-source');
  const files=[...companion.files,{path:WRAPPER,bytes:wrapperBytes,sha256:digest(wrapperBytes)},
    {path:HELPER,bytes:jobBytes,sha256:digest(jobBytes)},{path:HOST,bytes:hostBytes,sha256:digest(hostBytes)}];
  const manifest={schemaVersion:'runaai-m1-supervised-companion/v1',applicationSourceCommit:APPLICATION.sourceCommit,
    files:Object.fromEntries(files.map(file=>[file.path,file.sha256])),maximumMs:600000,cleanupMs:5000,
    maximumBytes:262144,admissionOpened:false};
  return {files,manifest,packageSha256:hash(manifest)};
}

function validatePackage(descriptor,expectedDescriptorSha256,manifest,expectedPackageSha256){
  need(descriptor?.schemaVersion==='runaai-m1-deployment-assembly/v1'&&hash(descriptor)===expectedDescriptorSha256
    &&HASH.test(expectedDescriptorSha256)&&ID.test(descriptor.transitionId)&&descriptor.application.sourceCommit===APPLICATION.sourceCommit
    &&descriptor.qualification.runtimeSealSha256===APPLICATION.runtimeSealSha256&&descriptor.activationPermitted===false,'descriptor');
  need(exact(manifest,'schemaVersion,applicationSourceCommit,files,maximumMs,cleanupMs,maximumBytes,admissionOpened')
    &&manifest.schemaVersion==='runaai-m1-supervised-companion/v1'&&hash(manifest)===expectedPackageSha256
    &&manifest.applicationSourceCommit===APPLICATION.sourceCommit&&manifest.maximumMs===600000&&manifest.cleanupMs===5000
    &&manifest.maximumBytes===262144&&manifest.admissionOpened===false,'package');
  need(manifest.files&&Object.keys(manifest.files).sort().join()===Object.keys(descriptor.operatorFiles).concat([WRAPPER,HELPER,HOST]).sort().join()
    &&Object.values(manifest.files).every(pin=>HASH.test(pin))
    &&Object.entries(descriptor.operatorFiles).every(([file,pin])=>manifest.files[file]===pin),'package-binding');
}

/** Validate actual raw child records independently of the stdout claim. No
 * caller-provided 'passed' flag can substitute for all four exact operations.
 * Argv hashes cross-bind records, not an independent argv reconstruction: the
 * strictly pinned companion is the authority for the four command definitions. */
export async function verifyClosedChildRecords({directory,transitionId,receipts,notBefore,notAfter,assertOwnerPrivate}){
  need(Number.isFinite(Date.parse(notBefore))&&Number.isFinite(Date.parse(notAfter))&&Date.parse(notBefore)<=Date.parse(notAfter),'child-lifetime');
  need(typeof assertOwnerPrivate==='function','private-verifier');await assertOwnerPrivate(directory);
  need(Array.isArray(receipts)&&receipts.length===12,'child-receipts');
  const entries=await readdir(directory);need(entries.length===12&&entries.every(name=>/^[a-f0-9]{32}-(intent|started|terminal)\.json$/u.test(name)),'child-file-set');
  const values={},rawHashes={};
  for(const name of entries){const bytes=await plainFile(path.join(directory,name),65536);
    try{values[name]=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));}catch{throw fail('child-json');}
    rawHashes[name]=digest(bytes);
    need(receipts.filter(receipt=>same(receipt,values[name])).length===1,'child-stdout-binding');
  }
  const operations=[];
  for(const name of entries.filter(value=>value.endsWith('-intent.json'))){
    const intent=values[name],id=intent.childId,start=values[id+'-started.json'],terminal=values[id+'-terminal.json'];
    need(intent.schemaVersion==='runaai-m1-deployment-child-intent/v1'&&intent.stage==='intent'&&intent.transitionId===transitionId
      &&ID.test(id)&&name===id+'-intent.json'&&Object.hasOwn(childLimits,intent.operation)&&intent.maximumMs===childLimits[intent.operation]
      &&HASH.test(intent.argumentsSha256)&&HASH.test(intent.executableSha256),'child-intent');
    need(start?.schemaVersion==='runaai-m1-deployment-child-started/v1'&&start.stage==='started'
      &&terminal?.schemaVersion==='runaai-m1-deployment-child/v1'&&terminal.stage==='terminal'
      &&['childId','transitionId','operation','maximumMs','argumentsSha256','executableSha256'].every(key=>start[key]===intent[key]&&terminal[key]===intent[key])
      &&start.intentSha256===rawHashes[name]&&terminal.intentSha256===rawHashes[name]
      &&terminal.startedRecordSha256===rawHashes[id+'-started.json']&&start.processId===terminal.processId
      &&start.processStartedAt===terminal.processStartedAt&&Number.isInteger(start.processId)&&start.processId>0,'child-binding');
    need(terminal.started===true&&terminal.stopConfirmed===true&&terminal.outputComplete===true&&terminal.timedOut===false
      &&terminal.outputLimited===false&&terminal.outcome==='terminal'&&terminal.exitCode===0
      &&Number.isInteger(terminal.stdoutBytes)&&terminal.stdoutBytes>=0&&terminal.stdoutBytes<=262144
      &&Number.isInteger(terminal.stderrBytes)&&terminal.stderrBytes>=0&&terminal.stderrBytes<=262144
      &&[intent,start,terminal].every(record=>record.privateValuesIncluded===false)
      &&Date.parse(notBefore)<=Date.parse(intent.preparedAt)&&Date.parse(intent.preparedAt)<=Date.parse(start.processStartedAt)
      &&Date.parse(start.processStartedAt)<=Date.parse(start.observedAt)&&Date.parse(start.observedAt)<=Date.parse(terminal.finishedAt)
      &&Date.parse(terminal.finishedAt)<=Date.parse(notAfter),'child-unconfirmed');
    operations.push(intent.operation);
  }
  need(operations.sort().join()===Object.keys(childLimits).sort().join(),'child-operation-set');
  await assertOwnerPrivate(directory);return {operations,recordCount:12};
}

export function validateClosedResult({observation,descriptor,held,prepared}){
  need(observation.status==='terminal'&&observation.terminalRetained===true&&observation.result?.ExitCode===0
    &&observation.transitionId===descriptor.transitionId&&observation.descriptorSha256===hash(descriptor)
    &&prepared?.request.operationId===observation.operationId&&prepared.requestSha256===observation.requestSha256
    &&prepared.request.descriptorSha256===observation.descriptorSha256&&prepared.request.packageSha256===observation.packageSha256
    &&Date.parse(prepared.request.createdAt)<=Date.parse(observation.result.ProcessStartedAt)
    &&Date.parse(observation.result.ProcessStartedAt)<=Date.parse(observation.result.FinishedAt)
    &&Date.parse(observation.result.FinishedAt)<=Date.parse(prepared.request.deadline)+5000,'watchdog-unconfirmed');
  let value;try{value=JSON.parse(observation.result.Stdout);}catch{throw fail('result-json');}
  need(exact(value,'schemaVersion,transitionId,passed,deployed,heldCaddySha256,heldCaddyETag,admissionOpened,caddyPublicationDeferred,childReceipts,releaseId,commit,artifactDigest,selectedCoreAuthorityUnchanged,ownerProofRebound,ownerRouteUnchanged,ordinaryPasswordRouteReady,applicationAndCaddyChangedTogether,applicationChangedWhileAdmissionClosed,rollbackRetained,legacyModified,protectedProductDataChanged,javascriptSandboxReady,m1FunctionsReady,privateValuesIncluded')
    &&value.schemaVersion==='runaai-m1-closed-deployment/v1'&&value.transitionId===descriptor.transitionId&&value.passed===true&&value.deployed===true
    &&value.releaseId===descriptor.application.releaseId&&value.commit===descriptor.application.sourceCommit&&value.artifactDigest===descriptor.application.artifactDigest
    &&value.heldCaddySha256===held.fileSha256&&value.heldCaddyETag===held.etag
    &&value.admissionOpened===false&&value.caddyPublicationDeferred===true&&value.applicationAndCaddyChangedTogether===false
    &&value.applicationChangedWhileAdmissionClosed===true&&value.legacyModified===false&&value.protectedProductDataChanged===false&&value.privateValuesIncluded===false
    &&['selectedCoreAuthorityUnchanged','ownerProofRebound','ownerRouteUnchanged','ordinaryPasswordRouteReady','rollbackRetained','javascriptSandboxReady','m1FunctionsReady'].every(key=>value[key]===true)
    &&Array.isArray(value.childReceipts),'result-binding');
  return value;
}

/** Concrete fixed-command adapter. Authority methods are trusted constructor
 * adapters, not JSON from a browser/model. They must inspect real fresh durable
 * state. Missing live Home/qualification/writer implementations fail at
 * construction. No fallback accepts ready:true or cached listener markers.
 * Package/journal locations are supplied by the owner staging operator; actual
 * companion still enforces RUNA-CONTROL\\Matthew and its fixed production root. */
export function createClosedCompanionAdapter({descriptor,expectedDescriptorSha256,manifest,expectedPackageSha256,
  packageDirectory,journalDirectory,powershellSha256,nodeExecutable,nodeExecutableSha256,authority}){
  validatePackage(descriptor,expectedDescriptorSha256,manifest,expectedPackageSha256);
  need(path.isAbsolute(packageDirectory)&&path.isAbsolute(journalDirectory)&&HASH.test(powershellSha256)
    &&typeof nodeExecutable==='string'&&path.isAbsolute(nodeExecutable)&&HASH.test(nodeExecutableSha256),'paths');
  const methods=['withExclusiveClosedPhase','assertOwnerPrivate','verifyQualification','assertFreshHomeReady','assertCurrentClosedPhase','recordDispatchIntent','recordDispatchResult'];
  need(authority&&methods.every(name=>typeof authority[name]==='function'),'authority-adapter-required');
  const frozen=structuredClone(descriptor),pins=structuredClone(manifest.files);
  const hooks=Object.fromEntries(methods.map(name=>[name,authority[name].bind(authority)]));
  async function heldPhase(){const held=await hooks.assertCurrentClosedPhase(frozen);
    need(exact(held,'transitionId,fileSha256,etag,pendingMutation')&&held.transitionId===frozen.transitionId
      &&held.fileSha256===frozen.caddy.candidateClosedSha256&&held.pendingMutation===false&&typeof held.etag==='string'
      &&held.etag.length>0&&held.etag.length<=256&&!/[\r\n]/u.test(held.etag),'closed-phase');return held;
  }
  return Object.freeze({
    async execute(){
      return hooks.withExclusiveClosedPhase(frozen,async()=>{
        await hooks.verifyQualification(frozen);await hooks.assertFreshHomeReady(frozen);const held=await heldPhase();
        await hooks.assertOwnerPrivate(packageDirectory);await hooks.assertOwnerPrivate(journalDirectory);
        const actualPins=[];for(const [file,pin]of Object.entries(pins)){
          const filename=path.join(packageDirectory,...file.split('/'));
          need(digest(await plainFile(filename))===pin,'package-file-drift');actualPins.push({path:filename,sha256:pin});
        }
        const argv=closedCompanionArguments({descriptor:frozen,expectedDescriptorSha256,heldCaddySha256:held.fileSha256,heldCaddyETag:held.etag});
        const prepared=await prepareWatchdogRequest({directory:journalDirectory,transitionId:frozen.transitionId,descriptorSha256:expectedDescriptorSha256,
          packageSha256:expectedPackageSha256,executable:POWERSHELL,executableSha256:powershellSha256,
          supervisorExecutable:nodeExecutable,supervisorExecutableSha256:nodeExecutableSha256,
          arguments:['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(packageDirectory,...COMPANION.split('/')),...argv.arguments],
          pins:actualPins,assertOwnerPrivate:hooks.assertOwnerPrivate});
        // Must persist in the outer transaction before launch. A new controller
        // may acquire a released OS writer, but must not ignore this pending ID.
        await hooks.recordDispatchIntent({transitionId:frozen.transitionId,operationId:prepared.request.operationId,requestSha256:prepared.requestSha256,
          descriptorSha256:expectedDescriptorSha256,packageSha256:expectedPackageSha256,deadline:prepared.request.deadline});
        let observation;
        try{
          await hooks.assertFreshHomeReady(frozen);need(same(await heldPhase(),held),'closed-phase-changed');
          const run=await launchWatchdog({prepared,wrapperFile:path.join(packageDirectory,...WRAPPER.split('/')),wrapperSha256:pins[WRAPPER],
            helperFile:path.join(packageDirectory,...HELPER.split('/')),helperSha256:pins[HELPER],
            hostFile:path.join(packageDirectory,...HOST.split('/')),hostSha256:pins[HOST],powershellSha256,assertOwnerPrivate:hooks.assertOwnerPrivate});
          await run.completion;
          observation=await inspectWatchdog({directory:journalDirectory,requestSha256:prepared.requestSha256,assertOwnerPrivate:hooks.assertOwnerPrivate});
          const value=validateClosedResult({observation,descriptor:frozen,held,prepared});
          await verifyClosedChildRecords({directory:path.win32.join(ROOT,'secrets','m1-deployment-'+frozen.transitionId),transitionId:frozen.transitionId,
            receipts:value.childReceipts,notBefore:observation.result.ProcessStartedAt,notAfter:observation.result.FinishedAt,assertOwnerPrivate:hooks.assertOwnerPrivate});
          await hooks.assertFreshHomeReady(frozen);need(same(await heldPhase(),held),'closed-phase-changed');
          const result={schemaVersion:'runaai-m1-closed-adapter-result/v1',status:'closed-deployment-complete',transitionId:frozen.transitionId,
            operationId:prepared.request.operationId,requestSha256:prepared.requestSha256,descriptorSha256:expectedDescriptorSha256,
            packageSha256:expectedPackageSha256,releaseId:value.releaseId,admissionOpened:false,productionPromoted:false,
            automaticRollbackPermitted:false,automaticReplayPermitted:false};
          await hooks.recordDispatchResult(result);return result;
        }catch{
          const result={schemaVersion:'runaai-m1-closed-adapter-result/v1',status:'needs-reconciliation',transitionId:frozen.transitionId,
            operationId:prepared.request.operationId,requestSha256:prepared.requestSha256,descriptorSha256:expectedDescriptorSha256,
            packageSha256:expectedPackageSha256,terminalRetained:observation?.terminalRetained===true,admissionOpened:false,productionPromoted:false,
            automaticRollbackPermitted:false,automaticReplayPermitted:false};
          // Losing this outer receipt still cannot clear the pending intent.
          try{await hooks.recordDispatchResult(result);}catch{}return result;
        }
      });
    },
    async observe(requestSha256){return inspectWatchdog({directory:journalDirectory,requestSha256,assertOwnerPrivate:hooks.assertOwnerPrivate});},
  });
}
