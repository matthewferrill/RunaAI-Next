import {canonicalJson,sha256} from '../../../../gate4/canonical.mjs';
import {assertM1SuccessorProjection,assertQualifiedM1Successor} from '../../deployment.mjs';
import {buildAdmissionOverlay} from '../quiescence/coordinator.mjs';
import {CONTRACT as QDRANT} from '../qdrant/contract.mjs';

export const APPLICATION=Object.freeze({sourceCommit:'9556ed01f9dbabe8c93eea309e482aad60bf809f',
  sourceArchiveSha256:'e10adce53387bcf31b639738e2d7ae26c2b5dd17e2914f1870ba0ef1949b31dc',
  runtimeSealSha256:'416102ff7129e5adb00de51b2f0fc3e5ca542c18a82941a32fdc4075b6a1c89f',
  deployerSourceSha256:'9834fb63f7c56428fa965f39ac2985ff6a3d132b06f4244e108ebb3cde6aa6f5',
  caddyBinarySha256:'5cb9ab71e5756ce72840b8234177a2f40c8b4ab47a806b8e841e2b784e9df62b'});
export const ROOT='C:\\AI\\RunaAI-Next-Candidate';
export const ROLES=Object.freeze(['chat','research','code','review','agent']);
export const HOME_CANDIDATE=Object.freeze({'gemma-4-26b-a4b-it-qat':'gemma',
  'qwen3-coder-30b-a3b-instruct':'coder','qwen3.6-27b-mtp':'qwen36'});
export const demand=(condition,code)=>{if(!condition)throw Object.assign(Error('m1-assembly-'+code),{code:'m1-assembly-'+code});};
export const hash=value=>sha256(canonicalJson(value));
const HASH=/^[a-f0-9]{64}$/u,ID=/^[a-f0-9]{32}$/u;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys;

export function validateEnrollment(enrollment,{now=Date.now()}={}){
  demand(exact(enrollment,'activated,caSha256,clientCertificateSha256,clientExpiresAt,enrollmentId,privateMaterialIncluded,schemaVersion,serverCertificateSha256,serverName')
    &&enrollment.schemaVersion==='runaai-control-tls-enrollment/v1'&&ID.test(enrollment.enrollmentId)
    &&enrollment.serverName==='runa-home-m1.internal'&&enrollment.activated===false&&enrollment.privateMaterialIncluded===false
    &&['caSha256','serverCertificateSha256','clientCertificateSha256'].every(key=>HASH.test(enrollment[key]))
    &&Number.isFinite(now)&&Date.parse(enrollment.clientExpiresAt)>now,'enrollment-invalid');
  return structuredClone(enrollment);
}
const oldProviderLines=['http://127.0.0.1:9770 {','  bind 127.0.0.1',
  '  reverse_proxy http://192.168.50.165:1234 {','    lb_retries 0','    transport http {',
  '      dial_timeout 10s','      response_header_timeout 65s','    }','  }','}'];
function tlsProxy(enrollment,eol,matcher=''){
  const directory=ROOT+'\\m1-home-runtime-tls\\'+enrollment.enrollmentId;
  return [`  reverse_proxy ${matcher?matcher+' ':''}https://192.168.50.165:9776 {`,
    '    lb_retries 0','    transport http {','      dial_timeout 10s','      response_header_timeout 65s',
    '      tls_timeout 10s','      tls_server_name runa-home-m1.internal',
    `      tls_client_auth ${directory}\\client.pem ${directory}\\client-key.pem`,
    `      tls_trust_pool file ${directory}\\ca.pem`,'      versions 1.1','    }','  }'].join(eol);
}
export const HEALTH_EXPRESSION='{http.request.method} == "GET" && {http.request.uri} in ["/v1/models", "/health"]'
  +' && {http.request.header.Transfer-Encoding} == "" && {http.request.header.Content-Encoding} == ""'
  +' && {http.request.header.Content-Length} in ["", "0"]';

/** Pure, byte-retaining provider replacement. No certificate/key reads or writes. */
export function buildCaddyProjection({originalBytes,enrollment,transitionId,now=Date.now()}){
  validateEnrollment(enrollment,{now});demand(Buffer.isBuffer(originalBytes)&&originalBytes.length<=1_048_576&&ID.test(transitionId),'caddy-input');
  const text=originalBytes.toString('utf8');demand(Buffer.from(text).equals(originalBytes),'caddy-utf8');
  const eol=text.includes('\r\n')?'\r\n':'\n';
  demand(eol==='\n'||!text.replaceAll('\r\n','').includes('\n'),'caddy-mixed-eol');
  const old=oldProviderLines.join(eol);demand(text.split(old).length===2&&text.split('http://127.0.0.1:9770').length===2,'provider-preimage');
  const provider=['http://127.0.0.1:9770 {','  bind 127.0.0.1',tlsProxy(enrollment,eol),'}'].join(eol);
  const finalBytes=Buffer.from(text.replace(old,provider));
  const scopes=[{siteAddress:'https://192.168.50.169:9761',mode:'api'},
    {siteAddress:'https://runa.bridgebuildersai.com',mode:'api'},{siteAddress:'http://127.0.0.1:9770',mode:'all'}];
  const initialClosedBytes=buildAdmissionOverlay({originalBytes,scopes,transitionId});
  const fullyClosedBytes=buildAdmissionOverlay({originalBytes:finalBytes,scopes,transitionId});
  const maintenance='runa_m1_maintenance_'+transitionId,health='runa_m1_health_'+transitionId;
  const before=`@${maintenance} path *${eol}  route {${eol}`;
  const replacement=`@${maintenance} path *${eol}  @${health} expression \`${HEALTH_EXPRESSION}\`${eol}  route {${eol}`
    +tlsProxy(enrollment,eol,'@'+health)+eol;
  const closed=fullyClosedBytes.toString();demand(closed.split(before).length===2,'closed-provider-binding');
  const candidateClosedBytes=Buffer.from(closed.replace(before,replacement));
  return {originalBytes:Buffer.from(originalBytes),initialClosedBytes,initialClosedSha256:sha256(initialClosedBytes),finalBytes,fullyClosedBytes,candidateClosedBytes,
    originalSha256:sha256(originalBytes),finalSha256:sha256(finalBytes),fullyClosedSha256:sha256(fullyClosedBytes),
    candidateClosedSha256:sha256(candidateClosedBytes),caddyConfigurationDigest:sha256(finalBytes.toString()+APPLICATION.caddyBinarySha256),
    enrollmentId:enrollment.enrollmentId,transitionId};
}

export function assertCaddyProjection(caddy,enrollment,{now=Date.now()}={}){
  demand(caddy&&typeof caddy==='object','caddy-binding');
  const expected=buildCaddyProjection({originalBytes:caddy.originalBytes,enrollment,transitionId:caddy.transitionId,now});
  for(const key of Object.keys(expected))demand(Buffer.isBuffer(expected[key])
    ?Buffer.isBuffer(caddy[key])&&expected[key].equals(caddy[key]):expected[key]===caddy[key],'caddy-binding');
  return expected;
}

/** Plan/config generation is not qualification. The combined verifier is separate
 * below, and must consume the complete real campaign before any activation. */
export function createConfigurationProjection({prior,provider,functionFirst,caddyConfigurationDigest,acceptanceGradesSha256}){
  demand(HASH.test(caddyConfigurationDigest)&&HASH.test(acceptanceGradesSha256),'projection-pin');
  demand(provider?.baseUrl==='http://127.0.0.1:9770/v1'&&prior?.provider?.baseUrl===provider.baseUrl,'provider-boundary');
  demand(Object.keys(provider.models??{}).sort().join()===ROLES.slice().sort().join()
    &&new Set(Object.values(provider.models)).size===1&&HOME_CANDIDATE[provider.models.chat],'single-primary-required');
  demand(functionFirst?.embedding?.baseUrl==='http://127.0.0.1:9770/v1'
    &&functionFirst?.reranker?.baseUrl==='http://127.0.0.1:9770'
    &&functionFirst?.qdrant?.endpoint===`http://${QDRANT.host}:${QDRANT.httpPort}`,'dependency-boundary');
  const successor=structuredClone(prior);successor.schemaVersion='runa2-gate6b-release-config/v2';
  successor.provider=structuredClone(provider);successor.functionFirst=structuredClone(functionFirst);
  successor.services.caddy.configurationDigest=caddyConfigurationDigest;
  const plan={schemaVersion:'runaai-m1-successor-plan/v1',priorConfigurationDigest:hash(prior),successorConfigurationDigest:hash(successor),
    provider:structuredClone(provider),functionFirst:structuredClone(functionFirst),caddyConfigurationDigest,
    acceptanceGradesSha256,runtimeSealSha256:APPLICATION.runtimeSealSha256};
  assertM1SuccessorProjection(prior,successor,plan);return {successor,plan,qualified:false};
}

export function qualifyAssemblyProjection({prior,successor,plan,gradesBytes,runtimeSealBytes,homeProfile,enrollment,caddy}){
  demand(plan.runtimeSealSha256===APPLICATION.runtimeSealSha256&&sha256(runtimeSealBytes)===APPLICATION.runtimeSealSha256,'runtime-seal');
  createConfigurationProjection({prior,provider:successor.provider,functionFirst:successor.functionFirst,
    caddyConfigurationDigest:plan.caddyConfigurationDigest,acceptanceGradesSha256:plan.acceptanceGradesSha256});
  validateEnrollment(enrollment);
  demand(exact(homeProfile,'appSourceCommit,candidateId,qualificationGradesSha256,runtimeSealSha256,schemaVersion')
    &&homeProfile.schemaVersion==='runaai-qualified-home-profile/v1'&&homeProfile.appSourceCommit===APPLICATION.sourceCommit
    &&homeProfile.runtimeSealSha256===APPLICATION.runtimeSealSha256&&homeProfile.qualificationGradesSha256===sha256(gradesBytes)
    &&homeProfile.candidateId===HOME_CANDIDATE[successor.provider.models.chat],'home-profile');
  assertCaddyProjection(caddy,enrollment);
  demand(caddy.caddyConfigurationDigest===plan.caddyConfigurationDigest,'caddy-binding');
  return assertQualifiedM1Successor({prior,successor,plan,gradesBytes,runtimeSealBytes,expectedSourceCommit:APPLICATION.sourceCommit});
}
