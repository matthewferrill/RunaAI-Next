// Synthetic operator-contract fixtures ONLY. No deployment or qualification proof.
import {readFileSync} from 'node:fs';
import {caddyfile,createControlLaunchers} from '../../../../gate7a/lan-release.mjs';
import {buildReleaseManifest} from '../../../../gate6/release.mjs';
import {ARTIFACT_SCHEMA} from '../../../../gate6b/artifact.mjs';
import {releaseModelIdentity} from '../../../../gate6b/model-role-providers.mjs';
import {qualifiedDeploymentFixture} from '../../deployment.fixtures.mjs';
import {APPLICATION,ROOT,hash,buildCaddyProjection,createConfigurationProjection} from './assembly.mjs';
import {createClosedPhaseCompanion} from './companion.mjs';
import {buildAssemblyDescriptor} from './descriptor.mjs';

export const bytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export const syntheticEnrollment=()=>({schemaVersion:'runaai-control-tls-enrollment/v1',enrollmentId:'a'.repeat(32),caSha256:'1'.repeat(64),
  serverCertificateSha256:'2'.repeat(64),clientCertificateSha256:'3'.repeat(64),serverName:'runa-home-m1.internal',
  clientExpiresAt:'2099-01-01T00:00:00.000Z',privateMaterialIncluded:false,activated:false});
export function syntheticAssembly(){
  const transitionId='b'.repeat(32),enrollment=syntheticEnrollment();
  const caddy=buildCaddyProjection({originalBytes:Buffer.from(caddyfile),enrollment,transitionId});
  const fixture=qualifiedDeploymentFixture();fixture.successor.functionFirst.qdrant.endpoint='http://127.0.0.1:9774';
  fixture.successor.functionFirst.reranker.baseUrl='http://127.0.0.1:9770';
  const {prior}=fixture;
  prior.gate7a={enabled:true,ordinaryClient:{clientId:'runaai-next-user',
    redirectUri:'https://runa.bridgebuildersai.com/session/user/callback',clientCredentialRef:'file:../secrets/keycloak-ordinary-client'}};
  const {successor,plan}=createConfigurationProjection({prior,provider:fixture.successor.provider,
    functionFirst:fixture.successor.functionFirst,caddyConfigurationDigest:caddy.caddyConfigurationDigest,acceptanceGradesSha256:'e'.repeat(64)});
  const base={schemaVersion:ARTIFACT_SCHEMA,entries:[{path:'synthetic-fixture.txt',size:1,sha256:'c'.repeat(64)}]};
  const artifact={...base,artifactDigest:hash(base)};
  const releaseId='runaai-next-gate7a-lan-synthetic-closed-m1',priorId='synthetic-prior';
  const manifest=(config,id,commit)=>buildReleaseManifest({releaseId:id,commit,artifactDigest:artifact.artifactDigest,
    configurationDigest:hash(config),applicationEntryPoint:'gate6b/server.mjs',model:releaseModelIdentity(config.provider),
    services:Object.entries(config.services).map(([name,value])=>({name,...value}))},
    {schemaVersion:config.schemaVersion==='runa2-gate6b-release-config/v1'?'runa2-gate6-release/v1':'runa2-gate6-release/v2'});
  const read=value=>readFileSync(new URL(value,import.meta.url));
  const companion=createClosedPhaseCompanion({sourceBytes:read('./fixtures/frozen-9556-deployer.ps1'),
    childBytes:read('./Bounded-DeploymentChild.cs'),functionsBytes:read('./Closed-Phase-Functions.ps1'),aclBytes:read('../../../../gate7e/control/TargetOnlyAcl.cs')});
  const homeProfile={schemaVersion:'runaai-qualified-home-profile/v1',appSourceCommit:APPLICATION.sourceCommit,
    runtimeSealSha256:APPLICATION.runtimeSealSha256,qualificationGradesSha256:plan.acceptanceGradesSha256,candidateId:'gemma'};
  const input={transitionId,caddy,companion,homeProfile,releaseArchiveSha256:'a'.repeat(64),
    tlsOperatorDescriptorSha256:'d'.repeat(64),homeInstallationSha256:'f'.repeat(64),
    files:{'prior-config.json':bytes(prior),'prior-manifest.json':bytes(manifest(prior,priorId,'1'.repeat(40))),
      'candidate.json':bytes(successor),'gate7a-release.json':bytes(manifest(successor,releaseId,APPLICATION.sourceCommit)),
      'artifact-files.json':bytes(artifact),'Run-Application.ps1':Buffer.from(createControlLaunchers(releaseId).application),
      'm1-successor-plan.json':bytes(plan),'enrollment.json':bytes(enrollment)}};
  return {...input,...buildAssemblyDescriptor(input),input};
}
