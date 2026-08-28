import {sha,demand} from './contracts.mjs';
const fields=['autoStartOnLaunch','cors','fileLoggingMode','justInTimeModelLoading','logIncomingTokens','logLinesLimit','logSensitiveData','networkInterface','port','verbose'].sort();
const changes=Object.freeze({networkInterface:'127.0.0.1',justInTimeModelLoading:false,logSensitiveData:false,verbose:false});
function parse(bytes){
  demand(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=4096,'settings-bytes');let value,text;
  try{text=new TextDecoder('utf8',{fatal:true}).decode(bytes);value=JSON.parse(text);}catch{demand(false,'settings-json');}
  // JSON.parse silently keeps the last duplicate. Do not call that formatting-only: a vendor
  // could interpret an earlier value, and rollback must not erase ambiguous or foreign edits.
  // Tokenize every string (including values) before selecting keys, so quotes in values cannot
  // accidentally become key boundaries. The schema below permits one flat primitive object only.
  const keys=new Set();
  for(const token of text.matchAll(/"(?:\\[\s\S]|[^"\\])*"/g)){
    if(!/^\s*:/.test(text.slice(token.index+token[0].length)))continue;
    const key=JSON.parse(token[0]);demand(!keys.has(key),'settings-duplicate-key');keys.add(key);
  }
  demand(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===fields.join(),'settings-fields');
  for(const key of ['autoStartOnLaunch','cors','justInTimeModelLoading','logIncomingTokens','logSensitiveData','verbose'])demand(typeof value[key]==='boolean','settings-type');
  demand(value.port===1234&&value.cors===false&&value.logIncomingTokens===false,'settings-boundary');
  demand(['0.0.0.0','127.0.0.1'].includes(value.networkInterface)&&value.fileLoggingMode==='succinct'
    &&Number.isInteger(value.logLinesLimit)&&value.logLinesLimit>0&&value.logLinesLimit<=10000,'settings-version');return value;
}
const canonical=value=>JSON.stringify(Object.fromEntries(fields.map(field=>[field,value[field]])));
/** Pure private-byte preparation only: no file read/write, process, network, service or model call. */
export function prepareNativeSettings(rawOriginal,expectedOriginalSha256){
  demand(/^[a-f0-9]{64}$/.test(expectedOriginalSha256)&&sha(rawOriginal)===expectedOriginalSha256,'settings-baseline-drift');
  const original=parse(rawOriginal),candidate={...original,...changes};
  const rawCandidate=Buffer.from(JSON.stringify(candidate,null,2)+'\n');
  return {schemaVersion:'runaai-native-settings-preparation/v1',originalSha256:sha(rawOriginal),candidateSha256:sha(rawCandidate),
    rawOriginal:Buffer.from(rawOriginal),rawCandidate,changedFields:Object.keys(changes).filter(field=>original[field]!==candidate[field])};
}
export function validatePreparedSettings(prepared){
  demand(prepared?.schemaVersion==='runaai-native-settings-preparation/v1','settings-preparation');
  const recomputed=prepareNativeSettings(prepared.rawOriginal,prepared.originalSha256);
  demand(Buffer.isBuffer(prepared.rawCandidate)&&prepared.rawCandidate.equals(recomputed.rawCandidate)
    &&prepared.candidateSha256===recomputed.candidateSha256
    &&JSON.stringify(prepared.changedFields)===JSON.stringify(recomputed.changedFields),'settings-preparation-drift');return recomputed;
}
export function verifyAppliedNativeSettings(prepared,rawCurrent){
  const verified=validatePreparedSettings(prepared),current=parse(rawCurrent),candidate=parse(verified.rawCandidate);
  demand(canonical(current)===canonical(candidate),'settings-unowned-drift');
  return {currentSha256:sha(rawCurrent),formattingOnlyNormalization:!rawCurrent.equals(verified.rawCandidate),
    inMemoryEnforcementProved:false};
}
export function prepareNativeSettingsRollback(prepared,rawCurrent){
  const verified=validatePreparedSettings(prepared);
  if(rawCurrent.equals(verified.rawOriginal))return {alreadyOriginal:true,expectedCurrentSha256:verified.originalSha256,rawRestore:Buffer.from(verified.rawOriginal)};
  verifyAppliedNativeSettings(verified,rawCurrent);
  return {alreadyOriginal:false,expectedCurrentSha256:sha(rawCurrent),rawRestore:Buffer.from(verified.rawOriginal)};
}
