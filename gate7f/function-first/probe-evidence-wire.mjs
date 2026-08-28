import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MastraAnswerProvider} from '../../gate1/adapters/mastra-provider.mjs';

// Actual installed Mastra + compatible SDK over disposable local HTTP. Synthetic
// responses prove transport mechanics only. No model or private data is used.
export async function probeEvidenceWire(){
  const modelId='synthetic-evidence-model',wire=[];let mode='valid';
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    wire.push({mode,path:req.url,request:JSON.parse(Buffer.concat(chunks))});
    if(mode==='500'||mode==='429'){res.writeHead(Number(mode),{'content-type':'application/json'});
      res.end(JSON.stringify({error:{message:'synthetic upstream error',type:'synthetic'}}));return;}
    const content=JSON.stringify({answer:'The synthetic note says cobalt.',citations:[{sourceId:'fixture-note',sectionId:'one'}]});
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'synthetic-result',object:'chat.completion',
      created:1,model:modelId,choices:[{index:0,message:{role:'assistant',content},finish_reason:'stop'}],
      usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}));
  });server.listen(0,'127.0.0.1');await once(server,'listening');
  const provider=new MastraAnswerProvider({baseURL:`http://127.0.0.1:${server.address().port}/v1`,modelId,
    role:'review',maxOutputTokens:512,preventRedirects:true});
  const rows=[];
  try{
    for(mode of ['valid','500','429']){
      const before=wire.length,startedAt=Date.now();let value=null,errorCode=null;
      try{value=await provider.answer({request:{message:'What colour does the selected note specify?',lane:'workspace',history:[]},
        ground:'record-answers',advisory:null,evidence:[{sourceId:'fixture-note',sectionId:'one',content:'The note says cobalt.',contentSha256:'a'.repeat(64)}]},
      {deadlineMs:5000,maximumOutputBytes:16000});}catch(error){errorCode=error.code??'unclassified';}
      rows.push({mode,requestCount:wire.length-before,elapsedMs:Date.now()-startedAt,errorCode,value,wire:wire.slice(before)});
    }
  }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
  const sourceFiles=['../../gate1/adapters/mastra-provider.mjs','./provider-transport.mjs','./probe-evidence-wire.mjs',
    './evidence-output.mjs','./home-runtime/contracts.mjs','./home-runtime/runtime-installation.mjs',
    './home-runtime/Runtime-Windows.ps1','./home-runtime/Install-HomeRuntime.ps1'];
  const sourcePins=await Promise.all(sourceFiles.map(async file=>{const raw=await readFile(new URL(file,import.meta.url));
    return {file,bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')};}));
  return {schemaVersion:'runaai-evidence-wire-probe/v1',observedAt:new Date().toISOString(),sourcePins,nodeVersion:process.version,
    actualMastra:true,syntheticResponses:true,modelCalled:false,productionChanged:false,listenerClosed:!server.listening,rows};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,3,'one new artifact output path required');const output=path.resolve(process.argv[2]);
  assert.equal(path.dirname(output),path.resolve('artifacts/runs'));assert.match(path.basename(output),/^evidence-wire-[a-z0-9-]+\.json$/);
  const result=await probeEvidenceWire();await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output,listenerClosed:result.listenerClosed,rows:result.rows.map(({wire,value,...row})=>({...row,
    structuredFormat:wire[0]?.request.response_format??null,answerReturned:value!==null}))}));
}
