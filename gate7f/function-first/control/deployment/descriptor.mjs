import {assertReleaseManifest} from '../../../../gate6/release.mjs';
import {assertArtifactManifest} from '../../../../gate6b/artifact.mjs';
import {createControlLaunchers} from '../../../../gate7a/lan-release.mjs';
import {releaseModelIdentity} from '../../../../gate6b/model-role-providers.mjs';
import {sha256,canonicalJson} from '../../../../gate4/canonical.mjs';
import {assertM1SuccessorProjection} from '../../deployment.mjs';
import {FOCUSED_REVIEW_EVIDENCE,validateFocusedGemmaReviewEvidence} from '../../gemma-primary-qualification.mjs';
import {APPLICATION,ROOT,HOME_CANDIDATE,assertCaddyProjection,createConfigurationProjection,demand,hash,validateEnrollment} from './assembly.mjs';

const HASH=/^[a-f0-9]{64}$/u,ID=/^[a-f0-9]{32}$/u;
const json=(raw,limit=1048576)=>{
  demand(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=limit,'descriptor-file-bounds');
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{demand(false,'descriptor-json');}
};
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
export const UNIMPLEMENTED_BOUNDARIES=Object.freeze([
  'native-wide-and-local-caller-closure',
  'fresh-home-task-process-native-mtls-readiness',
  'two-host-activation-and-rollback-executor',
]);

/** Operator plan only. Byte pins bind inputs but do not prove file provenance,
 * installed Home readiness or qualification. The real combined app verifier and
 * Home installation validator must run at their respective effect boundaries. */
export function buildAssemblyDescriptor({transitionId,files,releaseArchiveSha256,caddy,companion,
  tlsOperatorDescriptorSha256,homeInstallationSha256,homeProfile,now=Date.now()}){
  demand(ID.test(transitionId)&&[releaseArchiveSha256,tlsOperatorDescriptorSha256,homeInstallationSha256].every(value=>HASH.test(value)),'descriptor-pins');
  const expected=['prior-config.json','prior-manifest.json','candidate.json','gate7a-release.json','artifact-files.json',
    'Run-Application.ps1','m1-successor-plan.json','enrollment.json','focused-review-grade.json',
    'focused-review-answer.json','focused-review-checker.json'];
  demand(files&&Object.keys(files).sort().join()===expected.sort().join(),'descriptor-files');
  const prior=json(files['prior-config.json']),successor=json(files['candidate.json']),plan=json(files['m1-successor-plan.json']);
  const priorManifest=assertReleaseManifest(json(files['prior-manifest.json']));
  const manifest=assertReleaseManifest(json(files['gate7a-release.json']));
  const artifact=assertArtifactManifest(json(files['artifact-files.json'],16*1048576));
  const enrollment=validateEnrollment(json(files['enrollment.json']),{now});assertCaddyProjection(caddy,enrollment,{now});
  demand(caddy.transitionId===transitionId&&plan.caddyConfigurationDigest===caddy.caddyConfigurationDigest,'descriptor-caddy');
  createConfigurationProjection({prior,provider:successor.provider,functionFirst:successor.functionFirst,
    caddyConfigurationDigest:plan.caddyConfigurationDigest,acceptanceGradesSha256:plan.acceptanceGradesSha256});
  assertM1SuccessorProjection(prior,successor,plan);
  validateFocusedGemmaReviewEvidence({gradeBytes:files['focused-review-grade.json'],
    answerBytes:files['focused-review-answer.json'],checkerBytes:files['focused-review-checker.json']});
  demand(successor.gate7a?.enabled===true&&successor.gate7a.ordinaryClient?.clientId==='runaai-next-user'
    &&successor.gate7a.ordinaryClient.redirectUri==='https://runa.bridgebuildersai.com/session/user/callback'
    &&successor.gate7a.ordinaryClient.clientCredentialRef==='file:../secrets/keycloak-ordinary-client','descriptor-ordinary-identity');
  demand(plan.runtimeSealSha256===APPLICATION.runtimeSealSha256,'descriptor-runtime-seal');
  demand(priorManifest.configurationDigest===hash(prior)&&manifest.configurationDigest===hash(successor)
    &&manifest.commit===APPLICATION.sourceCommit&&manifest.applicationEntryPoint==='gate6b/server.mjs'
    &&manifest.artifactDigest===artifact.artifactDigest&&manifest.releaseId!==priorManifest.releaseId,'descriptor-manifest');
  demand(same(manifest.model,releaseModelIdentity(successor.provider))
    &&same(manifest.services,Object.entries(successor.services).map(([name,value])=>({name,...value})).sort((a,b)=>a.name.localeCompare(b.name))),
  'descriptor-manifest-configuration');
  demand(homeProfile?.schemaVersion==='runaai-qualified-home-profile/v1'&&homeProfile.appSourceCommit===APPLICATION.sourceCommit
    &&homeProfile.runtimeSealSha256===APPLICATION.runtimeSealSha256&&homeProfile.qualificationGradesSha256===plan.acceptanceGradesSha256
    &&homeProfile.candidateId===HOME_CANDIDATE[successor.provider.models.chat]
    &&Object.keys(homeProfile).length===5,'descriptor-home-profile');
  const launcher=files['Run-Application.ps1'];demand(Buffer.isBuffer(launcher)&&launcher.length>0&&launcher.length<65536,'descriptor-launcher');
  const releaseRoot=ROOT+'\\releases\\'+manifest.releaseId,text=launcher.toString('utf8');
  demand(text.includes(releaseRoot+'\\runtime\\node.exe')&&text.includes(releaseRoot+'\\gate6b\\server.mjs')
    &&!text.includes(priorManifest.releaseId)&&launcher.equals(Buffer.from(createControlLaunchers(manifest.releaseId).application)),
  'descriptor-launcher-binding');
  demand(companion?.schemaVersion==='runaai-m1-closed-companion/v1'&&companion.applicationSourceCommit===APPLICATION.sourceCommit
    &&companion.sourceSha256===APPLICATION.deployerSourceSha256&&companion.activated===false&&companion.applicationArtifactChanged===false
    &&Array.isArray(companion.files)&&companion.files.length===4,'descriptor-companion');
  const operatorFiles={};
  for(const file of companion.files){
    demand(typeof file.path==='string'&&/^(gate7a\/control\/(Invoke-ClosedM1Successor\.ps1|Bounded-DeploymentChild\.cs|Closed-Phase-Functions\.ps1)|gate7e\/control\/TargetOnlyAcl\.cs)$/u.test(file.path)
      &&Buffer.isBuffer(file.bytes)&&file.sha256===sha256(file.bytes)&&!Object.hasOwn(operatorFiles,file.path),'descriptor-companion-files');
    operatorFiles[file.path]=file.sha256;
  }
  demand(operatorFiles['gate7a/control/Invoke-ClosedM1Successor.ps1']===companion.sha256&&sha256(companion.bytes)===companion.sha256,'descriptor-companion-binding');
  const filePins=Object.fromEntries(Object.entries(files).map(([name,raw])=>[name,sha256(raw)]));
  const descriptor={schemaVersion:'runaai-m1-deployment-assembly/v1',transitionId,
    application:{sourceCommit:APPLICATION.sourceCommit,sourceArchiveSha256:APPLICATION.sourceArchiveSha256,
      releaseId:manifest.releaseId,artifactDigest:artifact.artifactDigest,artifactFileCount:artifact.entries.length,
      releaseArchiveSha256,manifestDigest:manifest.manifestDigest},
    predecessor:{releaseId:priorManifest.releaseId,commit:priorManifest.commit,artifactDigest:priorManifest.artifactDigest,
      manifestDigest:priorManifest.manifestDigest},
    filePins,qualification:{runtimeSealSha256:APPLICATION.runtimeSealSha256,acceptanceGradesSha256:plan.acceptanceGradesSha256,
      focusedReviewGradeSha256:FOCUSED_REVIEW_EVIDENCE.gradeSha256,
      focusedReviewAnswerSha256:FOCUSED_REVIEW_EVIDENCE.answerSha256,
      focusedReviewCheckerSha256:FOCUSED_REVIEW_EVIDENCE.checkerSha256,verified:false},operatorFiles,
    caddy:{originalSha256:caddy.originalSha256,initialClosedSha256:caddy.initialClosedSha256,fullyClosedSha256:caddy.fullyClosedSha256,
      candidateClosedSha256:caddy.candidateClosedSha256,finalSha256:caddy.finalSha256,
      configurationDigest:caddy.caddyConfigurationDigest,binarySha256:APPLICATION.caddyBinarySha256},
    home:{enrollmentId:enrollment.enrollmentId,tlsOperatorDescriptorSha256,installationSha256:homeInstallationSha256,
      profile:structuredClone(homeProfile),profileSha256:sha256(JSON.stringify(homeProfile)),
      installationValidated:false,activated:false},
    blockers:[...UNIMPLEMENTED_BOUNDARIES],activationPermitted:false,privateValuesIncluded:false};
  return {descriptor,descriptorSha256:hash(descriptor)};
}

/** Exact arguments for the later closed app phase; no shell string, no launch.
 * The caller must authenticate the entire descriptor and independently satisfy
 * all live boundaries. This merely avoids retyping already-bound values. */
export function closedCompanionArguments({descriptor,expectedDescriptorSha256,heldCaddySha256,heldCaddyETag}){
  demand(expectedDescriptorSha256===hash(descriptor)&&HASH.test(expectedDescriptorSha256)
    &&descriptor.schemaVersion==='runaai-m1-deployment-assembly/v1'
    &&descriptor.application.sourceCommit===APPLICATION.sourceCommit,'descriptor-drift');
  demand(heldCaddySha256===descriptor.caddy.candidateClosedSha256&&typeof heldCaddyETag==='string'
    &&heldCaddyETag.length>0&&heldCaddyETag.length<=256&&!/[\r\n]/u.test(heldCaddyETag),'descriptor-held-caddy');
  const values={TransitionId:descriptor.transitionId,HeldCaddySha256:heldCaddySha256,HeldCaddyETag:heldCaddyETag,
    ReleaseId:descriptor.application.releaseId,ExpectedCommit:APPLICATION.sourceCommit,
    ExpectedArtifactDigest:descriptor.application.artifactDigest,ExpectedArtifactFileCount:String(descriptor.application.artifactFileCount),
    PriorReleaseId:descriptor.predecessor.releaseId,PriorCommit:descriptor.predecessor.commit,PriorArtifactDigest:descriptor.predecessor.artifactDigest,
    ArchiveSha256:descriptor.application.releaseArchiveSha256,ConfigSha256:descriptor.filePins['candidate.json'],
    ManifestSha256:descriptor.filePins['gate7a-release.json'],LauncherSha256:descriptor.filePins['Run-Application.ps1'],
    CaddyfileSha256:descriptor.caddy.finalSha256,ExpectedUiContract:'gate7f-m1-function-first',
    M1PlanSha256:descriptor.filePins['m1-successor-plan.json'],M1GradesSha256:descriptor.qualification.acceptanceGradesSha256,
    M1RuntimeSealSha256:APPLICATION.runtimeSealSha256,
    M1FocusedReviewGradeSha256:descriptor.qualification.focusedReviewGradeSha256,
    M1FocusedReviewAnswerSha256:descriptor.qualification.focusedReviewAnswerSha256,
    M1FocusedReviewCheckerSha256:descriptor.qualification.focusedReviewCheckerSha256,Root:ROOT};
  return {arguments:Object.entries(values).flatMap(([key,value])=>['-'+key,value]),executionAuthorized:false,
    blockers:[...UNIMPLEMENTED_BOUNDARIES]};
}
