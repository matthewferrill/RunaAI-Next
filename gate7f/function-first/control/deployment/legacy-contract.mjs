import {canonicalJson,sha256} from '../../../../gate4/canonical.mjs';

const HASH=/^[a-f0-9]{64}$/u,COMMIT=/^[a-f0-9]{40}$/u,ID=/^[a-f0-9]{32}$/u;
const fail=code=>Object.assign(Error('m1-legacy-compat-'+code),{code:'m1-legacy-compat-'+code});
const need=(value,code)=>{if(!value)throw fail(code);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===keys.split(',').sort().join();
const string=(value,maximum)=>typeof value==='string'&&value.length>0&&value.length<=maximum&&value.isWellFormed();
const clone=value=>structuredClone(value);

export function validateLegacyCompatibilityBinding(value){
  need(exact(value,'schemaVersion,transitionId,legacy,control,home,models,limits,privateValuesIncluded')
    &&value.schemaVersion==='runaai-legacy-compatibility-binding/v1'&&ID.test(value.transitionId)
    &&exact(value.legacy,'sourceCommit,configSha256,modelAlias,embeddingModel')&&COMMIT.test(value.legacy.sourceCommit)
    &&HASH.test(value.legacy.configSha256)&&string(value.legacy.modelAlias,200)&&string(value.legacy.embeddingModel,200)
    &&exact(value.control,'endpoint,sourceAddress,caddyBinarySha256,clientCertificateSha256')
    &&value.control.endpoint==='127.0.0.1:9771'&&string(value.control.sourceAddress,64)
    &&HASH.test(value.control.caddyBinarySha256)&&HASH.test(value.control.clientCertificateSha256)
    &&exact(value.home,'endpoint,serverName,serverCertificateSha256,nativeEndpoint')
    &&value.home.endpoint==='192.168.50.165:9777'&&value.home.serverName==='runa-home-legacy.internal'
    &&HASH.test(value.home.serverCertificateSha256)&&value.home.nativeEndpoint==='127.0.0.1:1234'
    &&exact(value.models,'mappedPrimaryId,mappedPrimaryFingerprint,embeddingId,embeddingFingerprint')
    &&string(value.models.mappedPrimaryId,200)&&HASH.test(value.models.mappedPrimaryFingerprint)
    &&value.models.embeddingId===value.legacy.embeddingModel&&HASH.test(value.models.embeddingFingerprint)
    &&exact(value.limits,'requestMs,bodyMs,bodyBytes,responseBytes,maximumOutputTokens,sampleMs')
    &&value.limits.requestMs===65000&&value.limits.bodyBytes===2*1024*1024&&value.limits.responseBytes===4*1024*1024
    &&Number.isSafeInteger(value.limits.bodyMs)&&value.limits.bodyMs>=100&&value.limits.bodyMs<=10000
    &&Number.isSafeInteger(value.limits.maximumOutputTokens)&&value.limits.maximumOutputTokens>=2000&&value.limits.maximumOutputTokens<=8192
    &&Number.isSafeInteger(value.limits.sampleMs)&&value.limits.sampleMs>=1&&value.limits.sampleMs<=5000
    &&value.privateValuesIncluded===false,'binding');
  return Object.freeze(clone(value));
}

function functionCall(value){
  need(exact(value,'name,arguments')&&string(value.name,128)&&typeof value.arguments==='string'
    &&Buffer.byteLength(value.arguments,'utf8')<=65536,'function-call');
}
function toolCall(value){
  need(exact(value,'id,type,function')&&string(value.id,200)&&value.type==='function','tool-call');functionCall(value.function);
}
function message(value){
  need(value&&typeof value==='object'&&!Array.isArray(value)&&['system','user','assistant','tool'].includes(value.role),'message');
  if(value.role==='assistant'&&Object.hasOwn(value,'tool_calls')){
    need(exact(value,'role,content,tool_calls')&&(typeof value.content==='string'||value.content===null)
      &&Array.isArray(value.tool_calls)&&value.tool_calls.length>=1&&value.tool_calls.length<=16,'assistant-tool-message');
    for(const call of value.tool_calls)toolCall(call);
  }else if(value.role==='tool')need(exact(value,'role,tool_call_id,content')&&string(value.tool_call_id,200)&&typeof value.content==='string','tool-message');
  else need(exact(value,'role,content')&&typeof value.content==='string','plain-message');
  if(typeof value.content==='string')need(value.content.isWellFormed()&&Buffer.byteLength(value.content,'utf8')<=262144,'message-content');
}
function tool(value){
  need(exact(value,'type,function')&&value.type==='function'
    &&value.function&&typeof value.function==='object'&&!Array.isArray(value.function),'tool');
  const keys=Object.keys(value.function).sort().join();need(['description,name,parameters','name,parameters'].includes(keys),'tool-function');
  need(string(value.function.name,128)&&(!Object.hasOwn(value.function,'description')||string(value.function.description,4000))
    &&value.function.parameters&&typeof value.function.parameters==='object'&&!Array.isArray(value.function.parameters)
    &&Buffer.byteLength(canonicalJson(value.function.parameters),'utf8')<=65536,'tool-function');
}
function json(raw,limit){
  need(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=limit,'body-bounds');
  try{return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));}catch{throw fail('body-json');}
}

/** Validate one legacy request and return the exact fixed upstream route plus
 * translated bytes. Only the configured chat model alias changes. */
export function prepareLegacyCompatibilityRequest(bindingInput,{sourceAddress,clientCertificateSha256,pathname,method,raw}){
  const binding=validateLegacyCompatibilityBinding(bindingInput);
  need(sourceAddress===binding.control.sourceAddress&&clientCertificateSha256===binding.control.clientCertificateSha256,'client-identity');
  need(typeof pathname==='string'&&!pathname.includes('?')&&['GET','POST'].includes(method)&&Buffer.isBuffer(raw),'request');
  if(method==='GET'){
    need(['/v1/models','/api/v1/models'].includes(pathname)&&raw.length===0,'route');
    return Object.freeze({pathname,method,raw:Buffer.alloc(0),kind:pathname==='/v1/models'?'models':'native-models',requestSha256:sha256(raw)});
  }
  need(['/v1/chat/completions','/v1/embeddings'].includes(pathname),'route');const body=json(raw,binding.limits.bodyBytes);
  if(pathname==='/v1/embeddings'){
    need(exact(body,'model,input')&&body.model===binding.legacy.embeddingModel&&Array.isArray(body.input)
      &&body.input.length>=1&&body.input.length<=32&&body.input.every(value=>typeof value==='string'&&value.isWellFormed()
        &&value.length<=6000&&Buffer.byteLength(value,'utf8')<=24000),'embedding');
    return Object.freeze({pathname,method,raw:Buffer.from(raw),kind:'embedding',inputCount:body.input.length,requestSha256:sha256(raw)});
  }
  const keys=Object.keys(body).sort().join();need(['max_tokens,messages,model,temperature','max_tokens,messages,model,temperature,tools'].includes(keys),'chat-fields');
  need(body.model===binding.legacy.modelAlias&&Array.isArray(body.messages)&&body.messages.length>=1&&body.messages.length<=256
    &&Number.isInteger(body.max_tokens)&&body.max_tokens>=1&&body.max_tokens<=binding.limits.maximumOutputTokens
    &&Number.isFinite(body.temperature)&&body.temperature>=0&&body.temperature<=1,'chat');
  for(const item of body.messages)message(item);
  if(Object.hasOwn(body,'tools')){need(Array.isArray(body.tools)&&body.tools.length>=1&&body.tools.length<=64,'tools');for(const item of body.tools)tool(item);}
  const translated={...body,model:binding.models.mappedPrimaryId},translatedRaw=Buffer.from(JSON.stringify(translated));
  need(translatedRaw.length<=binding.limits.bodyBytes,'translated-bounds');
  return Object.freeze({pathname,method,raw:translatedRaw,kind:'chat',requestSha256:sha256(raw),translatedSha256:sha256(translatedRaw),legacyModel:body.model});
}

function projectBody(kind,body,binding){
  if(kind==='chat')return body&&typeof body==='object'&&!Array.isArray(body)&&body.model===binding.models.mappedPrimaryId
    ?{...body,model:binding.legacy.modelAlias}:body;
  if(kind==='models')return {...body,data:Array.isArray(body?.data)?body.data.map(item=>item&&typeof item==='object'&&item.id===binding.models.mappedPrimaryId
    ?{...item,id:binding.legacy.modelAlias}:item):body?.data};
  return {...body,models:Array.isArray(body?.models)?body.models.map(item=>{
    if(!item||typeof item!=='object')return item;const copy={...item};if(copy.key===binding.models.mappedPrimaryId)copy.key=binding.legacy.modelAlias;
    if(Array.isArray(copy.loaded_instances))copy.loaded_instances=copy.loaded_instances.map(instance=>instance&&typeof instance==='object'
      &&instance.id===binding.models.mappedPrimaryId?{...instance,id:binding.legacy.modelAlias}:instance);return copy;
  }):body?.models};
}

export function projectLegacyCompatibilityResponse(bindingInput,{kind,status,headers={},raw,inputCount}){
  const binding=validateLegacyCompatibilityBinding(bindingInput);
  need(Number.isInteger(status)&&status>=100&&status<=599&&Buffer.isBuffer(raw)&&raw.length<=binding.limits.responseBytes,'response');
  need(headers&&typeof headers==='object'&&!Array.isArray(headers),'response-headers');
  const safeHeaders=Object.hasOwn(headers,'content-type')?{'content-type':String(headers['content-type']).slice(0,200)}:{};
  if(status<200||status>=300)return Object.freeze({status,headers:safeHeaders,raw:Buffer.from(raw)});
  need(['chat','embedding','models','native-models'].includes(kind),'response-kind');const body=json(raw,binding.limits.responseBytes);
  need(body&&typeof body==='object'&&!Array.isArray(body),'response-body');
  if(kind==='embedding'){
    need(Number.isSafeInteger(inputCount)&&inputCount>=1&&Array.isArray(body.data)&&body.data.length===inputCount
      &&body.data.every((item,index)=>item&&typeof item==='object'&&!Array.isArray(item)&&item.index===index&&Array.isArray(item.embedding)),'embedding-response');
    return Object.freeze({status,headers:safeHeaders,raw:Buffer.from(raw)});
  }
  if(kind==='chat')need(Array.isArray(body.choices),'chat-response');
  if(kind==='models')need(Array.isArray(body.data),'models-response');
  if(kind==='native-models')need(Array.isArray(body.models),'native-models-response');
  const projected=projectBody(kind,body,binding),bytes=Buffer.from(JSON.stringify(projected));need(bytes.length<=binding.limits.responseBytes,'response-bounds');
  return Object.freeze({status,headers:safeHeaders,raw:bytes});
}

export const legacyCompatibilityHash=value=>sha256(canonicalJson(value));
