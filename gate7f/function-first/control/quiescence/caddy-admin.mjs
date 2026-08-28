import {fail} from './coordinator.mjs';

// No arbitrary routes, redirects or remote admin endpoints. Credentials and raw
// bodies are never included in errors. Mutation failures are outcome-uncertain.
export class CaddyAdmin {
  constructor({baseUrl,fetchImpl=fetch,operationMs=5000,maximumBytes=1_048_576}){
    const url=new URL(baseUrl);
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/'||url.search||url.hash||url.username||url.password
      ||operationMs<1||operationMs>10000||maximumBytes<1||maximumBytes>4_194_304)throw fail('quiescence-admin-boundary-invalid');
    this.baseUrl=url.origin;this.fetchImpl=fetchImpl;this.operationMs=operationMs;this.maximumBytes=maximumBytes;
  }
  async request(method,route,body=null,headers={},maximumMs=this.operationMs){
    if(!['GET /config/','POST /config/','POST /adapt','GET /reverse_proxy/upstreams'].includes(method+' '+route))throw fail('quiescence-admin-route-denied');
    if(!Number.isSafeInteger(maximumMs)||maximumMs<1)throw fail('quiescence-admin-deadline-invalid');
    const signal=AbortSignal.timeout(Math.min(this.operationMs,maximumMs));let response;
    // Node fetch sends Sec-Fetch-Mode:cors. Supply the exact local admin origin
    // rather than disabling Caddy's origin enforcement to accommodate it.
    try{response=await this.fetchImpl(this.baseUrl+route,{method,body,headers:{...headers,origin:this.baseUrl},redirect:'error',signal});}
    catch{throw fail('quiescence-admin-request-uncertain');}
    if(!response.ok){await response.body?.cancel();throw fail(response.status===412?'quiescence-admin-etag-drift':'quiescence-admin-rejected');}
    const reader=response.body?.getReader(),chunks=[];let size=0;
    try{if(reader)while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;
      if(size>this.maximumBytes){await reader.cancel();throw fail('quiescence-admin-response-cap');}chunks.push(Buffer.from(value));}}
    catch(error){throw error.code?error:fail('quiescence-admin-read-uncertain');}
    finally{reader?.releaseLock();}
    const text=Buffer.concat(chunks).toString('utf8');let value=null;
    if(text.trim()){try{value=JSON.parse(text);}catch{throw fail('quiescence-admin-invalid-json');}}
    return {value,etag:response.headers.get('etag')};
  }
  async snapshot({maximumMs=this.operationMs}={}){const {value,etag}=await this.request('GET','/config/',null,{},maximumMs);
    if(!value||Array.isArray(value)||typeof value!=='object'||typeof etag!=='string'||!etag)throw fail('quiescence-admin-config-invalid');
    return {config:value,etag};}
  async adapt(bytes){const {value}=await this.request('POST','/adapt',bytes,{'content-type':'text/caddyfile'});
    const config=value?.result??value;if(!config||Array.isArray(config)||typeof config!=='object')throw fail('quiescence-admin-adapt-invalid');return config;}
  async upstreams({maximumMs=this.operationMs}={}){const {value}=await this.request('GET','/reverse_proxy/upstreams',null,{},maximumMs);return value;}
  async replace({config,etag}){if(typeof etag!=='string'||!etag||/[\r\n]/u.test(etag))throw fail('quiescence-admin-etag-invalid');
    await this.request('POST','/config/',JSON.stringify(config),{'content-type':'application/json','if-match':etag});}
}
