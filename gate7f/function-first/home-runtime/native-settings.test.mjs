import test from 'node:test';
import assert from 'node:assert/strict';
import {sha} from './contracts.mjs';
import {prepareNativeSettings,verifyAppliedNativeSettings,prepareNativeSettingsRollback} from './native-settings.mjs';
const original=()=>Buffer.from(' {\r\n "autoStartOnLaunch":true,"port":1234,"cors":false,"logSensitiveData":true,"logIncomingTokens":false,\r\n "verbose":true,"logLinesLimit":500,"networkInterface":"0.0.0.0","justInTimeModelLoading":true,"fileLoggingMode":"succinct"\r\n }\r\n');
test('native settings preparation changes only four fields and retains original bytes exactly',()=>{
  const bytes=original(),prepared=prepareNativeSettings(bytes,sha(bytes)),before=JSON.parse(bytes),after=JSON.parse(prepared.rawCandidate);
  assert.deepEqual(prepared.changedFields,['networkInterface','justInTimeModelLoading','logSensitiveData','verbose']);
  for(const name of Object.keys(before).filter(name=>!prepared.changedFields.includes(name)))assert.deepEqual(after[name],before[name]);
  assert.equal(after.networkInterface,'127.0.0.1');assert.equal(after.justInTimeModelLoading,false);
  assert.equal(after.logSensitiveData,false);assert.equal(after.verbose,false);assert.deepEqual(prepared.rawOriginal,bytes);
});
test('baseline/schema/type/extra-setting drift rejects before any external action',()=>{
  const bytes=original();assert.throws(()=>prepareNativeSettings(bytes,'a'.repeat(64)),/baseline-drift/);
  for(const mutation of [v=>{v.port=1235;},v=>{v.cors=true;},v=>{v.logIncomingTokens=true;},v=>{v.newSetting=true;},
    v=>{delete v.verbose;},v=>{v.verbose='false';},v=>{v.fileLoggingMode='all';}]){
    const value=JSON.parse(bytes);mutation(value);const raw=Buffer.from(JSON.stringify(value));assert.throws(()=>prepareNativeSettings(raw,sha(raw)));}
});
test('applied file values and formatting normalization never claim native enforcement',()=>{
  const bytes=original(),prepared=prepareNativeSettings(bytes,sha(bytes));
  const normalized=Buffer.from(JSON.stringify(JSON.parse(prepared.rawCandidate)));
  assert.deepEqual(verifyAppliedNativeSettings(prepared,normalized),{currentSha256:sha(normalized),formattingOnlyNormalization:true,inMemoryEnforcementProved:false});
  assert.equal(verifyAppliedNativeSettings(prepared,prepared.rawCandidate).formattingOnlyNormalization,false);
});
test('rollback restores exact original CRLF bytes only from the owned candidate or an already-restored original',()=>{
  const bytes=original(),prepared=prepareNativeSettings(bytes,sha(bytes));
  const normalized=Buffer.from(JSON.stringify(JSON.parse(prepared.rawCandidate)));
  const rollback=prepareNativeSettingsRollback(prepared,normalized);assert.equal(rollback.expectedCurrentSha256,sha(normalized));
  assert.equal(rollback.alreadyOriginal,false);assert.deepEqual(rollback.rawRestore,bytes);
  assert.equal(prepareNativeSettingsRollback(prepared,bytes).alreadyOriginal,true);
  const foreign=JSON.parse(normalized);foreign.logLinesLimit=600;
  assert.throws(()=>prepareNativeSettingsRollback(prepared,Buffer.from(JSON.stringify(foreign))),/unowned-drift/);
});
test('tampered rollback material cannot authorize overwriting any current settings',()=>{
  const bytes=original(),prepared=prepareNativeSettings(bytes,sha(bytes));
  for(const changed of [{...prepared,rawOriginal:Buffer.from('{}')},{...prepared,candidateSha256:'a'.repeat(64)},
    {...prepared,rawCandidate:Buffer.from('{}')},{...prepared,changedFields:[]}]){
    assert.throws(()=>prepareNativeSettingsRollback(changed,prepared.rawCandidate));}
});
