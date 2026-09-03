import {demand,sha} from '../home-runtime/tls-primitives.mjs';
import {DEVICE_INSTALL_MANIFEST,DEVICE_INSTALL_MANIFEST_SHA256,validateDeviceInstallManifest} from './manifest.mjs';

const HASH=/^[a-f0-9]{64}$/;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys;
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const MAX_OBSERVATION_AGE_MS=5*60*1000;
const MAX_FUTURE_CLOCK_SKEW_MS=30*1000;
const MIN_EXPIRY_SAFETY_MS=30*1000;

export function validateDeviceReadinessEvidence(value){
  demand(exact(value,'capabilities,componentObservations,enrollment,modeId,networkObservations,observedAt,privilege,rebootPending,schemaVersion,serverWorkspace')
    &&value.schemaVersion==='runaai-device-readiness-evidence/v1'&&typeof value.modeId==='string'&&iso(value.observedAt),'device-evidence-shape');
  demand(Array.isArray(value.capabilities)&&new Set(value.capabilities).size===value.capabilities.length
    &&value.capabilities.every(item=>typeof item==='string'&&item.length>0),'device-evidence-capabilities');
  demand(Array.isArray(value.componentObservations)&&new Set(value.componentObservations.map(item=>item?.id)).size===value.componentObservations.length,'device-evidence-components');
  for(const component of value.componentObservations)demand(exact(component,'id,present,sha256,signatureState,signerPublisher,version')
    &&typeof component.id==='string'&&typeof component.present==='boolean'
    &&(component.version===null||typeof component.version==='string'&&component.version.length>0)
    &&(component.sha256===null||HASH.test(component.sha256))
    &&(component.signerPublisher===null||typeof component.signerPublisher==='string'&&component.signerPublisher.length>0)
    &&(component.signatureState!=='trusted'||component.signerPublisher!==null)
    &&['not-applicable','trusted','untrusted','unknown'].includes(component.signatureState),'device-evidence-component');
  demand(Array.isArray(value.networkObservations)&&new Set(value.networkObservations.map(item=>item?.id)).size===value.networkObservations.length,'device-evidence-network');
  for(const network of value.networkObservations)demand(exact(network,'id,state')&&typeof network.id==='string'
    &&['verified','unavailable','unknown','not-required'].includes(network.state),'device-evidence-network');
  demand(exact(value.enrollment,'certificateSha256,expiresAt,kind,state')&&typeof value.enrollment.kind==='string'
    &&['not-required','enrolled','not-enrolled','expired','revoked','unknown'].includes(value.enrollment.state)
    &&(value.enrollment.certificateSha256===null||HASH.test(value.enrollment.certificateSha256))
    &&(value.enrollment.expiresAt===null||iso(value.enrollment.expiresAt)),'device-evidence-enrollment');
  demand(['none','current-user','administrator','system','unknown'].includes(value.privilege)&&typeof value.rebootPending==='boolean','device-evidence-installation');
  demand(exact(value.serverWorkspace,'state')&&['verified-ready','unavailable','unknown','not-required'].includes(value.serverWorkspace.state),'device-evidence-server-workspace');
  return value;
}

export function validateDeviceReadinessAuthority(value){
  demand(exact(value,'evaluatedAt,expectedEnrollmentCertificateSha256,manifestSha256,schemaVersion')
    &&value.schemaVersion==='runaai-device-readiness-authority/v1'&&iso(value.evaluatedAt)&&HASH.test(value.manifestSha256)
    &&(value.expectedEnrollmentCertificateSha256===null||HASH.test(value.expectedEnrollmentCertificateSha256)),
  'device-readiness-authority-shape');
  return value;
}

function reason(list,code,message,remediation){list.push({code,message,remediation});}

/**
 * Pure, deterministic assessment. It performs no probing, installation, enrollment, network,
 * registry, service, task, filesystem, or execution action and never grants authority.
 */
function evaluateAgainstManifest(evidence,authority,{manifest,expectedManifestSha256}){
  validateDeviceInstallManifest(manifest);validateDeviceReadinessEvidence(evidence);validateDeviceReadinessAuthority(authority);
  const manifestSha256=sha(JSON.stringify(manifest));
  demand(manifestSha256===expectedManifestSha256&&authority.manifestSha256===expectedManifestSha256,
    'device-manifest-digest-mismatch');
  const mode=manifest.modes.find(candidate=>candidate.id===evidence.modeId);demand(mode,'device-mode-unknown');
  const failures=[];
  if(mode.qualification.state!=='device-evaluable')reason(failures,'mode-not-qualified',mode.qualification.reason,
    'Use a currently qualified no-install path or wait for an independently accepted release and rollback procedure.');

  const observedComponents=new Map(evidence.componentObservations.map(item=>[item.id,item]));
  for(const required of mode.components){
    const observed=observedComponents.get(required.id);
    if(!observed?.present){reason(failures,'component-missing',`${required.id} is required but was not observed as present.`,`Install or enable only the exact qualified ${required.id} release, then collect fresh evidence.`);continue;}
    if(required.version.policy==='reported'&&observed.version===null)reason(failures,'component-version-unreported',`${required.id} did not report a version.`,`Collect the ${required.id} version before retrying readiness.`);
    if(required.version.policy==='exact'&&required.version.value===null)reason(failures,'component-version-unpinned',`${required.id} has no qualified exact version pin.`,'Do not install or activate it until the release manifest freezes an exact version.');
    else if(required.version.policy==='exact'&&observed.version!==required.version.value)reason(failures,'component-version-mismatch',`${required.id} version does not match the qualified release.`,`Install the exact ${required.version.value} release or select another mode.`);
    if(required.hash.policy==='exact'&&required.hash.value===null)reason(failures,'component-hash-unpinned',`${required.id} has no qualified artifact SHA-256 pin.`,'Do not install or activate it until an exact artifact hash is published.');
    else if(required.hash.policy==='exact'&&observed.sha256!==required.hash.value)reason(failures,'component-hash-mismatch',`${required.id} SHA-256 does not match the qualified artifact.`,'Stop and obtain the exact signed, pinned artifact; do not bypass integrity verification.');
    if(required.signature.policy==='trusted-publisher'&&required.signature.publisher===null)reason(failures,'component-publisher-unpinned',`${required.id} has no qualified publisher identity.`,'Wait for a signed release with an exact publisher identity and verification procedure.');
    else if(required.signature.policy==='trusted-publisher'&&observed.signatureState!=='trusted')reason(failures,'component-signature-untrusted',`${required.id} does not have a trusted publisher signature.`,'Do not run it; obtain and verify the signed qualified release.');
    else if(required.signature.policy==='trusted-publisher'&&observed.signerPublisher!==required.signature.publisher)reason(failures,'component-publisher-mismatch',`${required.id} signer identity does not match the qualified publisher.`,'Do not run it; obtain the exact artifact signed by the pinned publisher.');
  }

  for(const capability of mode.capabilities)if(!evidence.capabilities.includes(capability))reason(failures,'capability-unavailable',`${capability} is required for ${mode.userLabel}.`,`Enable or choose a device/browser that provides ${capability}, then collect fresh evidence.`);
  const observedNetwork=new Map(evidence.networkObservations.map(item=>[item.id,item.state]));
  for(const network of mode.network)if(observedNetwork.get(network.id)!=='verified')reason(failures,'network-unverified',`${network.id} was not verified for this observation.`,`Verify ${network.id} without weakening TLS or network policy, then collect fresh evidence.`);

  if(mode.enrollment.required){
    if(evidence.enrollment.kind!==mode.enrollment.kind||evidence.enrollment.state!=='enrolled')reason(failures,'enrollment-not-ready',`${mode.enrollment.kind} enrollment is required and was not verified as enrolled.`,`Complete the separately qualified ${mode.enrollment.kind} flow; do not reuse Control-to-Home TLS enrollment.`);
    else if(evidence.enrollment.certificateSha256===null)reason(failures,'enrollment-certificate-unpinned','The enrolled device certificate has no observed SHA-256 pin.','Collect and verify the public certificate hash without exporting private key material.');
    if(authority.expectedEnrollmentCertificateSha256===null)reason(failures,'enrollment-authority-unbound','Control supplied no authoritative expected device-certificate digest.','Bind the observation to the exact active Control enrollment record before retrying readiness.');
    else if(evidence.enrollment.certificateSha256!==authority.expectedEnrollmentCertificateSha256)reason(failures,'enrollment-certificate-mismatch','The observed certificate does not match the authoritative enrolled device certificate.','Stop and reconcile or re-enroll the device; do not accept an unbound certificate.');
    const observedTime=Date.parse(evidence.observedAt),evaluatedTime=Date.parse(authority.evaluatedAt);
    if(observedTime<evaluatedTime-MAX_OBSERVATION_AGE_MS||observedTime>evaluatedTime+MAX_FUTURE_CLOCK_SKEW_MS)reason(failures,'enrollment-observation-time-unbounded','Enrollment evidence falls outside the bounded authority-clock window.','Collect fresh enrollment evidence using the Control authority clock.');
    if(evidence.enrollment.expiresAt===null)reason(failures,'enrollment-expiry-missing','The enrolled certificate has no finite observed expiry.','Collect and verify the certificate expiry before retrying readiness.');
    else if(Date.parse(evidence.enrollment.expiresAt)<=evaluatedTime+MIN_EXPIRY_SAFETY_MS)reason(failures,'enrollment-expired','The device enrollment is expired or too close to expiry under the bounded authority clock.','Re-enroll through the qualified device flow and revoke stale credentials.');
  }else if(evidence.enrollment.kind!=='none'||evidence.enrollment.state!=='not-required')reason(failures,'unexpected-enrollment','This mode requires no device enrollment.','Use no-install browser evidence; do not treat unrelated TLS state as readiness.');
  else if(authority.expectedEnrollmentCertificateSha256!==null)reason(failures,'unexpected-enrollment-authority','This mode has no device enrollment but Control supplied an enrollment certificate binding.','Use an authority context for the selected no-enrollment mode.');

  if(mode.installation.privilege==='not-yet-qualified')reason(failures,'privilege-policy-unqualified','The required installation privilege has not been qualified.','Do not elevate or change system configuration for this mode.');
  else if(evidence.privilege!==mode.installation.privilege)reason(failures,'privilege-mismatch',`Observed privilege ${evidence.privilege} does not match required ${mode.installation.privilege}.`,`Use the ${mode.installation.privilege} context; do not elevate beyond the manifest.`);
  if(mode.installation.rebootPolicy==='not-yet-qualified')reason(failures,'reboot-policy-unqualified','Reboot behavior has not been qualified.','Do not initiate a reboot or install this mode.');
  else if(evidence.rebootPending)reason(failures,'reboot-pending','A pending reboot makes the device state indeterminate.','Complete or cancel the unrelated reboot safely, then collect fresh evidence.');

  if(mode.serverWorkspace.required&&evidence.serverWorkspace.state!=='verified-ready')reason(failures,'server-workspace-unverified','The Control-orchestrated server workspace was not verified ready.','Check Control and its isolated worker; the browser device is not the server or execution host.');
  if(!mode.serverWorkspace.required&&evidence.serverWorkspace.state!=='not-required')reason(failures,'unexpected-server-workspace-claim','This deferred local mode cannot inherit readiness from a server workspace observation.','Keep local and server execution acceptance separate.');
  if(!mode.rollback.available)reason(failures,'rollback-unqualified','An executable uninstall and rollback procedure is not yet qualified.','Do not install this mode until exact uninstall, reconciliation, and user-file preservation proof exists.');

  const deviceReady=failures.length===0;
  return Object.freeze({
    schemaVersion:'runaai-device-readiness-evaluation/v1',manifestSha256,modeId:mode.id,
    observedAt:evidence.observedAt,deviceReady,endToEndReady:deviceReady&&(!mode.serverWorkspace.required||evidence.serverWorkspace.state==='verified-ready'),
    failClosed:true,acceptanceClaim:false,executionAuthorized:false,executionHost:mode.execution.host,
    deviceCodeExecution:mode.execution.deviceCodeExecution,installationRequired:mode.installation.required,
    reasons:failures,rollback:structuredClone(mode.rollback),limitations:[
      'This deterministic evaluator does not probe or change the device.',
      'A ready result is not installation proof, actual-system acceptance, or execution authority.',
      'Omen remains the interactive browser seat; Control orchestrates server workspaces and Home performs model inference only.'
    ]
  });
}

export function evaluateDeviceReadiness(evidence,authority){
  demand(arguments.length===2,'device-production-manifest-override-denied');
  return evaluateAgainstManifest(evidence,authority,{manifest:DEVICE_INSTALL_MANIFEST,
    expectedManifestSha256:DEVICE_INSTALL_MANIFEST_SHA256});
}

export function createDeviceReadinessEvaluatorForTest(manifest){
  validateDeviceInstallManifest(manifest);
  const manifestSha256=sha(JSON.stringify(manifest));
  return Object.freeze({manifestSha256,evaluate:(evidence,authority)=>evaluateAgainstManifest(evidence,authority,
    {manifest,expectedManifestSha256:manifestSha256})});
}

export {DEVICE_INSTALL_MANIFEST_SHA256};
