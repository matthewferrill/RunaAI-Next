import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha,demand,validateProfile,validateRequest} from './contracts.mjs';

/** Retain only the known synthetic request/reply projections. Never access a live endpoint. */
export function retainWireShapes(sourceRepository){
  const records=[];const provenance=[];
  for(const [candidateId,suffix]of [['gemma','gemma'],['coder','coder'],['qwen36','qwen']]){
    const directory=`gate7f/function-first/readiness/evidence/20260828-actual-adapter-${suffix}`;
    const rawExport=readFileSync(path.join(sourceRepository,directory,'EXPORT.json')),index=JSON.parse(rawExport);
    demand(index.schemaVersion==='runaai-m1-operator-smoke-export/v1','wire-source');
    provenance.push({path:directory+'/EXPORT.json',sha256:sha(rawExport),sourceCommit:index.sourceCommit});
    for(const number of [2,5,8,11,14,17,19]){
      const names=[number,number+1].map(value=>String(value).padStart(4,'0')+'.json');
      const raw=names.map(name=>{const bytes=readFileSync(path.join(sourceRepository,directory,name));
        demand(bytes.length===index.files[name].bytes&&sha(bytes)===index.files[name].sha256,'wire-source-drift');return bytes;});
      const [request,response]=raw.map(bytes=>JSON.parse(bytes));
      demand(request.type==='request'&&response.type==='response'&&request.role===response.role&&request.url===response.url,'wire-pair');
      records.push({id:`smoke-${candidateId}-${request.role}`,candidateId,role:request.role,method:'POST',path:new URL(request.url).pathname,
        request:request.input,responseStatus:response.status,responseText:response.rawText,
        representation:{request:'JSON.stringify of retained actual adapter input',response:'retained rawText encoded as UTF8'},
        sources:names.map((name,i)=>({path:directory+'/'+name,sha256:sha(raw[i])}))});
    }
  }
  for(const [candidateId,file]of [
    ['coder','artifacts/runs/m1-campaign-20260828-r3/coder-r3-code07.json'],
    ['gemma','artifacts/runs/m1-task-native-444cae115f5341f7bfceeb6eedb7ee1d/gemma-code08-r2.json']]){
    const bytes=readFileSync(path.join(sourceRepository,file)),attempt=JSON.parse(bytes);
    demand(attempt.schemaVersion==='runaai-m1-functional-attempt/v1'&&attempt.protectedDataRead===false&&attempt.productionChanged===false,'wire-attempt');
    provenance.push({path:file,sha256:sha(bytes),sourceCommit:attempt.sourceCommit});
    for(const call of attempt.provider.calls){demand(call.kind==='provider'&&call.path==='/chat/completions','wire-call');
      records.push({id:`campaign-${candidateId}-${attempt.caseId}-${call.sequence}`,candidateId,role:call.role,method:'POST',path:'/v1/chat/completions',
        request:call.request,responseStatus:call.httpStatus,responseText:JSON.stringify(call.response),
        representation:{request:'JSON.stringify of retained parsed request',response:'JSON.stringify of retained parsed response'},
        sources:[{path:file,sha256:sha(bytes)}]});
    }
  }
  demand(records.length===23,'wire-fixture-count');
  for(const record of records){const profile=validateProfile({schemaVersion:'runaai-qualified-home-profile/v1',candidateId:record.candidateId,
    appSourceCommit:'a'.repeat(40),runtimeSealSha256:'b'.repeat(64),qualificationGradesSha256:'c'.repeat(64)});
    validateRequest(profile,record.path,record.method,Buffer.from(JSON.stringify(record.request)));
    demand(record.responseStatus===200&&typeof record.responseText==='string','wire-response');}
  return {schemaVersion:'runaai-home-runtime-wire-fixtures/v1',createdAt:new Date().toISOString(),syntheticOnly:true,
    purpose:'Guard compatibility and transparent local transport regression, not a new inference or functional grade.',
    productionChanged:false,modelsCalled:false,provenance,records};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  demand(process.argv.length===3,'wire-arguments');const fixtures=retainWireShapes(path.resolve(process.argv[2]));
  const destination=fileURLToPath(new URL('./evidence/20260828-actual-wire-shapes/',import.meta.url));mkdirSync(destination);
  const bytes=Buffer.from(JSON.stringify(fixtures,null,2)+'\n');writeFileSync(path.join(destination,'fixtures.json'),bytes,{flag:'wx'});
  console.log(JSON.stringify({destination,sha256:sha(bytes),records:fixtures.records.length,modelsCalled:false}));
}
