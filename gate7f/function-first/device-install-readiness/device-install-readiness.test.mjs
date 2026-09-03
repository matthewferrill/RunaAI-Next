import test from 'node:test';
import assert from 'node:assert/strict';
import {DEVICE_INSTALL_MANIFEST,DEVICE_INSTALL_MANIFEST_SHA256,validateDeviceInstallManifest} from './manifest.mjs';
import {createDeviceReadinessEvaluatorForTest,evaluateDeviceReadiness,validateDeviceReadinessEvidence} from './evaluator.mjs';

const observedAt='2026-09-03T12:00:00.000Z';
function evidence(modeId,overrides={}){
  const base={
    schemaVersion:'runaai-device-readiness-evidence/v1',modeId,observedAt,
    componentObservations:[{id:'supported-browser',present:true,version:'fixture-browser-1',sha256:null,signatureState:'not-applicable',signerPublisher:null}],
    capabilities:['secure-browser-session','authenticated-session'],
    networkObservations:[{id:'control-https',state:'verified'}],
    enrollment:{kind:'none',state:'not-required',certificateSha256:null,expiresAt:null},
    privilege:'none',rebootPending:false,serverWorkspace:{state:'verified-ready'}
  };
  return {...base,...overrides};
}
function authority(overrides={}){return {schemaVersion:'runaai-device-readiness-authority/v1',manifestSha256:DEVICE_INSTALL_MANIFEST_SHA256,
  evaluatedAt:observedAt,expectedEnrollmentCertificateSha256:null,...overrides};}

test('manifest freezes four distinct paths and preserves the product host boundary',()=>{
  assert.equal(validateDeviceInstallManifest(DEVICE_INSTALL_MANIFEST),DEVICE_INSTALL_MANIFEST);
  assert.match(DEVICE_INSTALL_MANIFEST_SHA256,/^[a-f0-9]{64}$/);
  assert.deepEqual(DEVICE_INSTALL_MANIFEST.modes.map(mode=>mode.id),[
    'browser-only','one-time-local-snapshot','persistent-local-bridge','fully-local-execution']);
  const [browser,snapshot,bridge,local]=DEVICE_INSTALL_MANIFEST.modes;
  assert.equal(browser.installation.required,false);assert.equal(snapshot.installation.required,false);
  assert.equal(bridge.execution.deviceCodeExecution,false);assert.equal(local.execution.deviceCodeExecution,null);
  assert.equal(bridge.enrollment.reuseHomeRuntimeTls,false);assert.equal(local.enrollment.reuseHomeRuntimeTls,false);
  assert.equal(DEVICE_INSTALL_MANIFEST.productBoundary.omenRole,'interactive-browser-seat');
  assert.equal(DEVICE_INSTALL_MANIFEST.productBoundary.controlRole,'application-authority-and-server-workspace-orchestrator');
  assert.equal(DEVICE_INSTALL_MANIFEST.productBoundary.homeRole,'model-inference-only');
  assert.ok(DEVICE_INSTALL_MANIFEST.modes.every(mode=>mode.execution.addingFolderGrantsExecution===false));
});

test('a verified browser device can be device-ready without claiming install, acceptance, or authority',()=>{
  const result=evaluateDeviceReadiness(evidence('browser-only'),authority());
  assert.equal(result.deviceReady,true);assert.equal(result.endToEndReady,true);assert.deepEqual(result.reasons,[]);
  assert.equal(result.installationRequired,false);assert.equal(result.executionHost,'server-isolated-worker');
  assert.equal(result.deviceCodeExecution,false);assert.equal(result.acceptanceClaim,false);assert.equal(result.executionAuthorized,false);
  assert.equal(result.rollback.uninstallRequired,false);
});

test('browser-only use fails closed on missing session, network, server state, reboot and unrelated enrollment',()=>{
  const result=evaluateDeviceReadiness(evidence('browser-only',{
    capabilities:['secure-browser-session'],networkObservations:[{id:'control-https',state:'unknown'}],
    enrollment:{kind:'runaai-home-tls',state:'enrolled',certificateSha256:'a'.repeat(64),expiresAt:'2026-12-01T00:00:00.000Z'},
    privilege:'administrator',rebootPending:true,serverWorkspace:{state:'unknown'}
  }),authority());
  const codes=result.reasons.map(item=>item.code);
  for(const code of ['capability-unavailable','network-unverified','unexpected-enrollment','privilege-mismatch','reboot-pending','server-workspace-unverified'])assert.ok(codes.includes(code));
  assert.ok(result.reasons.every(item=>item.message.length>0&&item.remediation.length>0));
  assert.equal(result.deviceReady,false);assert.equal(result.endToEndReady,false);
});

test('one-time snapshot needs browser picker, explicit consent and bounded upload but no installed worker',()=>{
  const ready=evaluateDeviceReadiness(evidence('one-time-local-snapshot',{
    capabilities:['secure-browser-session','authenticated-session','directory-picker','explicit-snapshot-consent','bounded-snapshot-upload'],
    networkObservations:[{id:'control-https',state:'verified'},{id:'snapshot-upload',state:'verified'}]
  }),authority());
  assert.equal(ready.deviceReady,true);assert.equal(ready.installationRequired,false);assert.equal(ready.deviceCodeExecution,false);
  const denied=evaluateDeviceReadiness(evidence('one-time-local-snapshot'),authority());
  assert.ok(denied.reasons.some(item=>item.code==='capability-unavailable'));
  assert.ok(denied.reasons.some(item=>item.code==='network-unverified'));
});

test('persistent bridge remains unavailable despite optimistic observations because release, pins and rollback are unqualified',()=>{
  const result=evaluateDeviceReadiness(evidence('persistent-local-bridge',{
    componentObservations:[{id:'runa-local-folder-bridge',present:true,version:'unqualified-fixture',sha256:'b'.repeat(64),signatureState:'trusted',signerPublisher:'unqualified-publisher'}],
    capabilities:['selected-root-confirmation','hash-guarded-file-transport','bridge-no-code-execution'],
    networkObservations:[{id:'control-https',state:'verified'},{id:'device-control-mtls',state:'verified'}],
    enrollment:{kind:'device-bridge-mtls',state:'enrolled',certificateSha256:'c'.repeat(64),expiresAt:'2026-12-01T00:00:00.000Z'},
    privilege:'current-user'
  }),authority({expectedEnrollmentCertificateSha256:'c'.repeat(64)}));
  const codes=result.reasons.map(item=>item.code);
  for(const code of ['mode-not-qualified','component-version-unpinned','component-hash-unpinned','component-publisher-unpinned','rollback-unqualified'])assert.ok(codes.includes(code));
  assert.equal(result.deviceReady,false);assert.equal(result.deviceCodeExecution,false);assert.equal(result.executionAuthorized,false);
  assert.match(result.rollback.steps.join(' '),/Revoke the device enrollment/);
});

test('fully local execution cannot be enabled by a folder, Home TLS state, elevation or invented artifacts',()=>{
  const observations=['runa-local-execution-worker','local-isolation-provider','pinned-language-runtime'].map((id,index)=>({
    id,present:true,version:'invented-'+index,sha256:String(index+1).repeat(64),signatureState:'trusted',signerPublisher:'invented-publisher'}));
  const result=evaluateDeviceReadiness(evidence('fully-local-execution',{
    componentObservations:observations,capabilities:['explicit-local-execution-consent','isolated-local-execution'],networkObservations:[],
    enrollment:{kind:'runaai-home-tls',state:'enrolled',certificateSha256:'d'.repeat(64),expiresAt:'2026-12-01T00:00:00.000Z'},
    privilege:'administrator',serverWorkspace:{state:'not-required'}
  }),authority({expectedEnrollmentCertificateSha256:'d'.repeat(64)}));
  const codes=result.reasons.map(item=>item.code);
  for(const code of ['mode-not-qualified','component-version-unpinned','component-hash-unpinned','component-publisher-unpinned','enrollment-not-ready','privilege-policy-unqualified','reboot-policy-unqualified','rollback-unqualified'])assert.ok(codes.includes(code));
  assert.equal(result.deviceReady,false);assert.equal(result.deviceCodeExecution,null);
  assert.equal(DEVICE_INSTALL_MANIFEST.modes.find(mode=>mode.id==='fully-local-execution').execution.addingFolderGrantsExecution,false);
});

test('strict evidence and manifest shapes reject drift instead of ignoring it',()=>{
  const good=evidence('browser-only');assert.equal(validateDeviceReadinessEvidence(good),good);
  assert.throws(()=>validateDeviceReadinessEvidence({...good,extra:true}),/device-evidence-shape/);
  assert.throws(()=>validateDeviceReadinessEvidence({...good,componentObservations:[...good.componentObservations,{...good.componentObservations[0]}]}),/device-evidence-components/);
  assert.throws(()=>evaluateDeviceReadiness({...good,modeId:'folder-means-execution'},authority()),/device-mode-unknown/);
  const changed=structuredClone(DEVICE_INSTALL_MANIFEST);changed.productBoundary.omenRole='server';
  assert.throws(()=>validateDeviceInstallManifest(changed),/device-manifest-boundary/);
});

test('evaluation is deterministic and does not mutate caller evidence or manifest',()=>{
  const input=evidence('browser-only'),before=structuredClone(input);
  const first=evaluateDeviceReadiness(input,authority()),second=evaluateDeviceReadiness(input,authority());
  assert.deepEqual(first,second);assert.deepEqual(input,before);assert.equal(first.manifestSha256,DEVICE_INSTALL_MANIFEST_SHA256);
  assert.ok(Object.isFrozen(DEVICE_INSTALL_MANIFEST));assert.ok(Object.isFrozen(DEVICE_INSTALL_MANIFEST.modes[0]));
});

function qualifiedBridge(){
  const manifest=structuredClone(DEVICE_INSTALL_MANIFEST),mode=manifest.modes.find(item=>item.id==='persistent-local-bridge');
  mode.qualification={state:'device-evaluable',reason:null};mode.rollback.available=true;
  mode.components[0].version.value='1.0.0';mode.components[0].hash.value='a'.repeat(64);
  mode.components[0].signature.publisher='Runa Exact Publisher';
  const evaluator=createDeviceReadinessEvaluatorForTest(manifest),certificateSha256='b'.repeat(64);
  const input=evidence(mode.id,{componentObservations:[{id:mode.components[0].id,present:true,version:'1.0.0',
    sha256:'a'.repeat(64),signatureState:'trusted',signerPublisher:'Runa Exact Publisher'}],capabilities:[...mode.capabilities],
    networkObservations:mode.network.map(item=>({id:item.id,state:'verified'})),enrollment:{kind:mode.enrollment.kind,
      state:'enrolled',certificateSha256,expiresAt:'2026-09-03T13:00:00.000Z'},privilege:'current-user'});
  return {evaluator,input,certificateSha256};
}

test('production evaluation rejects manifest reclassification outside explicit test-only composition',()=>{
  const changed=structuredClone(DEVICE_INSTALL_MANIFEST);changed.modes.find(mode=>mode.id==='persistent-local-bridge').qualification.state='device-evaluable';
  assert.throws(()=>evaluateDeviceReadiness(evidence('browser-only'),authority(),{manifest:changed}),/device-production-manifest-override-denied/);
});

test('a trusted signature from the wrong publisher does not satisfy the exact signer pin',()=>{
  const {evaluator,input,certificateSha256}=qualifiedBridge();
  input.componentObservations[0].signerPublisher='Different Trusted Publisher';
  const result=evaluator.evaluate(input,authority({manifestSha256:evaluator.manifestSha256,expectedEnrollmentCertificateSha256:certificateSha256}));
  assert.equal(result.deviceReady,false);assert.ok(result.reasons.some(item=>item.code==='component-publisher-mismatch'));
});

test('required enrollment rejects an unbound authoritative certificate digest',()=>{
  const {evaluator,input,certificateSha256}=qualifiedBridge();
  const result=evaluator.evaluate(input,authority({manifestSha256:evaluator.manifestSha256}));
  assert.equal(result.deviceReady,false);assert.ok(result.reasons.some(item=>item.code==='enrollment-authority-unbound'));
  const mismatch=evaluator.evaluate(input,authority({manifestSha256:evaluator.manifestSha256,
    expectedEnrollmentCertificateSha256:'c'.repeat(64)}));
  assert.notEqual(certificateSha256,'c'.repeat(64));
  assert.ok(mismatch.reasons.some(item=>item.code==='enrollment-certificate-mismatch'));
});

test('required enrollment rejects null and expired certificate expiry',()=>{
  const missing=qualifiedBridge();missing.input.enrollment.expiresAt=null;
  const missingResult=missing.evaluator.evaluate(missing.input,authority({manifestSha256:missing.evaluator.manifestSha256,
    expectedEnrollmentCertificateSha256:missing.certificateSha256}));
  assert.ok(missingResult.reasons.some(item=>item.code==='enrollment-expiry-missing'));
  const expired=qualifiedBridge();expired.input.enrollment.expiresAt=observedAt;
  const expiredResult=expired.evaluator.evaluate(expired.input,authority({manifestSha256:expired.evaluator.manifestSha256,
    expectedEnrollmentCertificateSha256:expired.certificateSha256}));
  assert.ok(expiredResult.reasons.some(item=>item.code==='enrollment-expired'));
});
