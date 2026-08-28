import {demand,sha,NOMICS} from './contracts.mjs';
import {validatePreparedSettings,verifyAppliedNativeSettings,prepareNativeSettingsRollback} from './native-settings.mjs';
import {validateNativeServerObservation,validateNativeServerBaseline} from './native-server-control.mjs';

const required=['withOwnership','assertQuiescent','readSettings','prepareFileIntent','swapFile','restoreFile',
  'observeServer','commandServer','assertHardwareLease','probeNonresidentNomic','record','closeAdmission'];
function validateAdapter(adapter){demand(adapter&&required.every(name=>typeof adapter[name]==='function'),'transition-adapter');}
function cleanServer(observation,baseline,stopped){
  validateNativeServerObservation(observation,{expectedEngine:baseline.engine,expectedDescriptorSha256:baseline.descriptorSha256});
  demand(observation.http.established===0,'transition-active-connections');
  if(stopped)demand(observation.http.addresses.length===0,'transition-server-not-stopped');
  return observation;
}
/** Finite, real-effect orchestration. It cannot open application admission, install a service, raise
 * power, load a primary, choose a winner or retry an unknown mutation. The privileged native wrapper
 * supplies the actual Windows owner lock, live coordinator drain, file primitive and native adapter.
 * Per-step fsync'd intent records precede effects. A failed/uncertain step stays closed and requires
 * separately validated restore/reconciliation; original and candidate bytes remain private. */
export async function applyNativeSettingsTransition({prepared,baseline,adapter,transactionId}){
  validateAdapter(adapter);const pin=validatePreparedSettings(prepared);
  demand(/^[a-f0-9]{32}$/.test(transactionId),'transition-id');validateNativeServerBaseline(baseline);
  let stage='entry';
  return adapter.withOwnership(async()=>{
    try{
      await adapter.closeAdmission();await adapter.assertQuiescent();await adapter.assertHardwareLease();
      cleanServer(await adapter.observeServer(),baseline,false);
      demand(sha(await adapter.readSettings())===pin.originalSha256,'transition-baseline-drift');
      await adapter.record({type:'transition-intent',transactionId,originalSha256:pin.originalSha256,candidateSha256:pin.candidateSha256,engine:baseline.engine});
      await adapter.prepareFileIntent(pin);stage='prepared';
      await adapter.assertQuiescent();await adapter.record({type:'transition-stop-intent',transactionId});
      await adapter.commandServer('stop',{baseline});stage='server-stopped';
      cleanServer(await adapter.observeServer(),baseline,true);await adapter.assertQuiescent();
      await adapter.record({type:'transition-swap-intent',transactionId});await adapter.swapFile();stage='file-applied';
      verifyAppliedNativeSettings(pin,await adapter.readSettings());
      await adapter.assertQuiescent();await adapter.assertHardwareLease();
      await adapter.record({type:'transition-start-intent',transactionId});
      await adapter.commandServer('start',{baseline,bind:'127.0.0.1'});stage='server-started';
      const current=cleanServer(await adapter.observeServer(),baseline,false);
      demand(current.http.addresses.length>0&&current.http.addresses.every(address=>['127.0.0.1','::1'].includes(address)),'transition-listener-bypass');
      verifyAppliedNativeSettings(pin,await adapter.readSettings());await adapter.assertQuiescent();await adapter.assertHardwareLease();
      // This is an available pinned nonresident embedding model, not a fabricated ID that would
      // be denied even with JIT enabled. The adapter's independent lease owns telemetry and abort.
      const probeIntent={type:'transition-jit-negative-intent',transactionId,modelKey:NOMICS.key,artifactSha256:NOMICS.sha256,
        body:{model:NOMICS.key,input:['search_query: sealed native JIT denial probe']},timeoutMs:10000};
      await adapter.record(probeIntent);stage='jit-probe-dispatched';
      const proof=await adapter.probeNonresidentNomic(probeIntent);
      demand(proof?.artifactSha256===NOMICS.sha256&&proof.modelKey===NOMICS.key&&proof.availableBefore===true
        &&Array.isArray(proof.beforeResidentIds)&&proof.beforeResidentIds.length===0&&Array.isArray(proof.afterResidentIds)&&proof.afterResidentIds.length===0
        &&[400,404,409,422].includes(proof.status)&&proof.denialReason==='model-not-loaded-jit-disabled'&&proof.inferenceResponsePresent===false
        &&proof.engineUnchanged===true&&proof.hardwareLeaseHealthy===true&&/^[a-f0-9]{64}$/.test(proof.rawResponseSha256),'transition-jit-not-proved');
      stage='jit-denial-proved';verifyAppliedNativeSettings(pin,await adapter.readSettings());await adapter.assertQuiescent();
      await adapter.assertHardwareLease();cleanServer(await adapter.observeServer(),baseline,false);
      const result={schemaVersion:'runaai-native-settings-transition/v1',transactionId,passed:true,stage,
        candidateSha256:pin.candidateSha256,jitProof:proof,admissionOpened:false,productionPromoted:false,powerRestored:false};
      await adapter.record({type:'transition-result',...result});return result;
    }catch(error){
      await adapter.closeAdmission();const result={schemaVersion:'runaai-native-settings-transition/v1',transactionId,passed:false,stage,
        errorCode:typeof error.code==='string'&&/^runtime-[a-z0-9-]+$/.test(error.code)?error.code:'runtime-transition-failed',
        recoveryRequired:true,admissionOpened:false,productionPromoted:false,powerRestored:false};
      await adapter.record({type:'transition-result',...result});return result;
    }
  });
}

/** Deliberate recovery after a returned failure or process restart, not replay of the apply command.
 * The adapter's file primitive rejects every retained foreign preimage/late conflict. Restoring old
 * JIT/listener settings is not permission to reopen Control or restore260W; those stay coordinator-
 * owned actions after current inventory and prior behavior have actually been verified. */
export async function restoreNativeSettingsTransition({prepared,baseline,adapter,transactionId}){
  validateAdapter(adapter);const pin=validatePreparedSettings(prepared);
  demand(/^[a-f0-9]{32}$/.test(transactionId),'transition-id');validateNativeServerBaseline(baseline);
  return adapter.withOwnership(async()=>{
    await adapter.closeAdmission();await adapter.assertQuiescent();await adapter.assertHardwareLease();
    const rollback=prepareNativeSettingsRollback(pin,await adapter.readSettings());
    const observed=cleanServer(await adapter.observeServer(),baseline,false);
    await adapter.record({type:'transition-restore-intent',transactionId,expectedCurrentSha256:rollback.expectedCurrentSha256,
      originalSha256:pin.originalSha256,engine:baseline.engine});
    if(observed.http.addresses.length>0)await adapter.commandServer('stop',{baseline});
    cleanServer(await adapter.observeServer(),baseline,true);await adapter.assertQuiescent();
    await adapter.restoreFile({expectedCurrentSha256:rollback.expectedCurrentSha256,alreadyOriginal:rollback.alreadyOriginal});
    demand(sha(await adapter.readSettings())===pin.originalSha256,'transition-restore-file-drift');
    await adapter.assertQuiescent();await adapter.assertHardwareLease();
    const original=JSON.parse(pin.rawOriginal);await adapter.commandServer('start',{baseline,bind:original.networkInterface});
    const after=cleanServer(await adapter.observeServer(),baseline,false);
    demand(after.http.addresses.length>0&&after.http.addresses.every(address=>address===original.networkInterface
      ||(original.networkInterface==='127.0.0.1'&&address==='::1')),'transition-restore-listener');
    // An old server may normalize whitespace on startup, but exact original settings bytes are
    // the rollback promise; a vendor rewrite is reported rather than silently reclassified.
    demand(sha(await adapter.readSettings())===pin.originalSha256,'transition-restore-byte-drift');
    const result={schemaVersion:'runaai-native-settings-restore/v1',transactionId,passed:true,originalSha256:pin.originalSha256,
      admissionOpened:false,powerRestored:false,productionPromoted:false};await adapter.record({type:'transition-restore-result',...result});return result;
  });
}
