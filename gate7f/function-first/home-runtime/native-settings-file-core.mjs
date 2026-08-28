import {sha,demand} from './tls-primitives.mjs';
import {validatePreparedSettings,prepareNativeSettingsRollback} from './native-settings.mjs';

export const SETTINGS_FILE_TARGET='C:\\Users\\Matthew\\.lmstudio\\.internal\\http-server-config.json';
export const SETTINGS_TRANSACTION_PARENT='C:\\AI\\RunaAI-Next-HomeRuntime-Transactions';
const HASH=/^[a-f0-9]{64}$/;
const receiptKeys=['schemaVersion','mode','transactionId','originalSha256','candidateSha256','currentSha256',
  'passed','targetBound','privateValuesIncluded','inMemoryEnforcementProved','admissionOpened','actualPreimageRetained','alreadyOriginal'].sort();
export function settingsFileCommand({transactionId,prepared,mode,expectedCurrentSha256}){
  demand(/^[a-f0-9]{32}$/.test(transactionId)&&['Prepare','Swap','Restore'].includes(mode),'settings-file-command');
  const pin=validatePreparedSettings(prepared);
  demand(mode==='Restore'?HASH.test(expectedCurrentSha256):expectedCurrentSha256===undefined,'settings-file-current-pin');
  const args=['-Mode',mode,'-TransactionId',transactionId,'-ExpectedOriginalSha256',pin.originalSha256,
    '-ExpectedCandidateSha256',pin.candidateSha256];
  if(mode==='Restore')args.push('-ExpectedCurrentSha256',expectedCurrentSha256);
  // No raw setting appears in the command line or a public receipt. This pipe is host-local only.
  return {args,input:mode==='Prepare'?Buffer.from(pin.rawCandidate.toString('base64'),'ascii'):Buffer.alloc(0)};
}
function checkReceipt(value,{transactionId,pin,mode,alreadyOriginal}){
  const expectedCurrent=mode==='Swap'?pin.candidateSha256:pin.originalSha256;
  demand(value&&Object.keys(value).sort().join()===receiptKeys.join()
    &&value.schemaVersion==='runaai-native-settings-file/v1'&&value.mode===mode&&value.transactionId===transactionId
    &&value.originalSha256===pin.originalSha256&&value.candidateSha256===pin.candidateSha256&&value.currentSha256===expectedCurrent
    &&value.passed===true&&value.targetBound===true&&value.privateValuesIncluded===false
    &&value.inMemoryEnforcementProved===false&&value.admissionOpened===false
    &&typeof value.actualPreimageRetained==='boolean'&&value.alreadyOriginal===(mode==='Restore'?alreadyOriginal:false)
    &&(mode!=='Swap'||value.actualPreimageRetained===true),'settings-file-receipt');
  return structuredClone(value);
}
/** Pure orchestration seam for local fixtures. Production must use createNativeSettingsFileBridge,
 * which supplies fixed Home paths/runtime pins and host-local child execution. None of these
 * callbacks or input objects is a product/model tool or a transferable maintenance permission. */
export function createSettingsFileBridgeCore({transactionId,prepared,io,assertQuiescent,assertMutationSettled,record}){
  demand(/^[a-f0-9]{32}$/.test(transactionId)&&io&&['verify','read','execute'].every(key=>typeof io[key]==='function')
    &&typeof assertQuiescent==='function'&&typeof assertMutationSettled==='function'&&typeof record==='function','settings-file-bridge');
  const pin=validatePreparedSettings(prepared),dispatched=new Set();let verified=false,busy=false,uncertain=false;
  async function readSettings(){
    demand(verified,'settings-file-not-verified');await io.verify();const bytes=await io.read();
    demand(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=4096,'settings-file-read-bounds');return Buffer.from(bytes);
  }
  async function operation(mode,{expectedCurrentSha256,alreadyOriginal}={}){
    // Unknown is a barrier to every mutation, not just replay of the original verb. Even Restore
    // could race a still-live writer. This bridge has no reset/reconcile capability; later recovery
    // needs an independently durable terminal-operation and exact-child-stop proof first.
    demand(verified&&!busy&&!dispatched.has(mode)&&!uncertain,'settings-file-replay-or-busy');busy=true;
    try{
      await assertMutationSettled();
      await io.verify();const current=await readSettings();
      if(mode==='Restore'){
        const rollback=prepareNativeSettingsRollback(pin,current);
        demand(rollback.expectedCurrentSha256===expectedCurrentSha256&&rollback.alreadyOriginal===alreadyOriginal,'settings-file-stale-restore');
      }else demand(sha(current)===pin.originalSha256,'settings-file-baseline-drift');
      const command=settingsFileCommand({transactionId,prepared:pin,mode,expectedCurrentSha256});
      await assertQuiescent();await record({type:'native-settings-file-intent',transactionId,mode,
        originalSha256:pin.originalSha256,candidateSha256:pin.candidateSha256,currentSha256:sha(current)});
      // This final callback belongs to the independent ownership/drain coordinator. File reads or
      // this adapter's empty state cannot manufacture native-wide quiescence.
      await assertQuiescent();dispatched.add(mode);uncertain=true;
      let receipt;
      try{receipt=checkReceipt(await io.execute(command),{transactionId,pin,mode,alreadyOriginal});}
      catch(error){
        await record({type:'native-settings-file-returned',transactionId,mode,confirmed:false,unknownOutcome:true,
          executionStopped:error?.executionStopped===true,errorCode:'runtime-settings-file-command-unconfirmed'});
        // A timed-out/lost child may have committed. Do not retry, infer success from a snapshot,
        // compensate, or attach the child Error (which could contain private input/output).
        demand(false,'settings-file-command-unconfirmed');
      }
      const after=await readSettings();demand(sha(after)===receipt.currentSha256,'settings-file-post-command-drift');
      await record({type:'native-settings-file-returned',transactionId,mode,confirmed:true,receipt});uncertain=false;return receipt;
    }finally{busy=false;}
  }
  return {
    async verify(){await io.verify();verified=true;},readSettings,
    async prepareFileIntent(value){const incoming=validatePreparedSettings(value);
      demand(incoming.originalSha256===pin.originalSha256&&incoming.candidateSha256===pin.candidateSha256,'settings-file-preparation-drift');
      return operation('Prepare');},
    swapFile:()=>operation('Swap'),
    restoreFile:({expectedCurrentSha256,alreadyOriginal})=>operation('Restore',{expectedCurrentSha256,alreadyOriginal}),
  };
}
