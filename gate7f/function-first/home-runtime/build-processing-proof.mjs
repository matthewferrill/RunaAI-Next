import {existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';import path from 'node:path';
import {NOMIC,PROOF_POLICY,demand,sha} from './processing-proof-contract.mjs';
const here=import.meta.dirname,repository=realpathSync(path.resolve(here,'../../..'));
const target=path.resolve(process.argv[2]??''),preflightPath=path.resolve(process.argv[3]??''),proofId=process.argv[4]??'',identityPath=path.resolve(process.argv[5]??''),expectedIdentitySha256=process.argv[6]??'';
const expectedIdentityPath=path.join(repository,'SOURCE-IDENTITY.json'),samePath=(left,right)=>process.platform==='win32'?left.toLowerCase()===right.toLowerCase():left===right;
demand(process.argv.length===7&&path.isAbsolute(target)&&!existsSync(target)&&existsSync(preflightPath)&&existsSync(identityPath)
  &&samePath(identityPath,expectedIdentityPath)&&samePath(realpathSync(identityPath),expectedIdentityPath)
  &&/^[a-f0-9]{64}$/.test(expectedIdentitySha256)
  &&/^20260829-native-processing-nomic-r[1-9][0-9]*$/.test(proofId),'build-arguments');
const preflight=JSON.parse(readFileSync(preflightPath,'utf8'));demand(preflight.schemaVersion==='runaai-native-processing-proof-preflight/v1'
  &&preflight.residentCount===0&&preflight.node?.version==='v22.22.1','build-preflight');
const evidenceCommit='35e01bf557881ad4ff10f739c59e55c041ffcdaa',evidencePath='gate7f/function-first/readiness/evidence/20260828-actual-adapter-gemma/0017.json';
const request=readFileSync(path.join(repository,evidencePath));demand(sha(request)==='5a5297cc9a525777fd551c6ba28ba6cac4b8635a4762b6368e6a4dbb59de9b13','build-fixture-pin');
const parsed=JSON.parse(request);demand(parsed.type==='request'&&parsed.role==='embedding'&&parsed.input?.model===NOMIC.key,'build-fixture');
const identityBytes=readFileSync(identityPath);demand(sha(identityBytes)===expectedIdentitySha256,'build-source-identity-pin');const identity=JSON.parse(identityBytes);
demand(identity&&Object.keys(identity).sort().join()==='caseBundleSha256,productionChanged,qdrantSha256,schemaVersion,sourceArchiveSha256,sourceCommit'
  &&identity.schemaVersion==='runaai-m1-source-identity/v1'&&/^[a-f0-9]{40}$/.test(identity.sourceCommit)
  &&/^[a-f0-9]{64}$/.test(identity.sourceArchiveSha256)&&/^[a-f0-9]{64}$/.test(identity.caseBundleSha256)
  &&/^[a-f0-9]{64}$/.test(identity.qdrantSha256)&&identity.productionChanged===false,'build-source-identity');
const base='C:\\ProgramData\\RunaAI-Next-ProcessingProof-'+proofId.replaceAll('-','');
const config={schemaVersion:'runaai-native-processing-proof/v1',proofId,homeRoot:base+'\\code',outputRoot:base+'\\results',
  mainTask:'Runa-M1-ProcessingProof-'+proofId,samplerTask:'Runa-M1-ProcessingSampler-'+proofId,policy:PROOF_POLICY,model:NOMIC,preflight,
  frozenRequest:{commit:evidenceCommit,path:evidencePath,sha256:sha(request)},sourceIdentity:{sha256:sha(identityBytes),
    sourceCommit:identity.sourceCommit,sourceArchiveSha256:identity.sourceArchiveSha256},createdBeforeLoad:true,syntheticOnly:true,
  productionRoutingChanged:false,settingsChanged:false};
const names=['processing-proof-worker.mjs','processing-proof-contract.mjs','Run-HomeProcessingProof.ps1','Run-HomeProcessingSampler.ps1','Runtime-Windows.ps1'];
const files=Object.fromEntries(names.map(name=>[name,readFileSync(path.join(here,name))]));
files['request.json']=request;files['runtime.json']=readFileSync(path.join(repository,'gate7f/evaluation/home/HOME-RUNTIME-2026-08-27.json'));
files['config.json']=Buffer.from(JSON.stringify(config,null,2)+'\n');
const seal={schemaVersion:'runaai-native-processing-proof-seal/v1',proofId,createdAt:new Date().toISOString(),sourceCommit:identity.sourceCommit,
  sourceArchiveSha256:identity.sourceArchiveSha256,sourceIdentitySha256:sha(identityBytes),
  createdBeforeLoad:true,files:Object.fromEntries(Object.entries(files).map(([name,raw])=>[name,sha(raw)]))};
files['seal.json']=Buffer.from(JSON.stringify(seal,null,2)+'\n');mkdirSync(target,{recursive:true});
for(const[name,raw]of Object.entries(files))writeFileSync(path.join(target,name),raw,{flag:'wx'});
writeFileSync(path.join(target,'transfer.json'),JSON.stringify(Object.fromEntries(Object.entries(files).map(([name,raw])=>[name,raw.toString('base64')]))),{flag:'wx'});
process.stdout.write(JSON.stringify({target,sealSha256:sha(files['seal.json']),config,seal})+'\n');
