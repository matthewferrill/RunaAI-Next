import {createServer,request as httpRequest} from 'node:http';
import {RUNTIME_LIMITS,validateRequest,error,demand} from './contracts.mjs';

/** Creates, but does not listen on, a server. Installation, host binding, runtime ownership,
 * authentication/firewall and bypass removal belong to the separately qualified operator package. */
export function rawHttpRequest(url,{method,headers,body,signal}){return new Promise((resolve,reject)=>{
  const outgoing=httpRequest(url,{method,headers,signal},incoming=>resolve({status:incoming.statusCode,
    headers:{get:name=>incoming.headers[name]??null},body:incoming}));
  outgoing.once('error',reject);outgoing.end(body);
});}
export async function readRequestBody(req,{signal,limit=RUNTIME_LIMITS.requestBytes,replyToBodyTimeout}){
  signal.throwIfAborted();
  // AbortSignal alone does not interrupt IncomingMessage's async iterator. Destroy exactly this
  // incomplete request on timeout/disconnect so a slow body cannot retain a pending reader.
  let forceClose=null;
  const stop=()=>{
    // Destroying IncomingMessage also destroys the response socket. Give only
    // this timeout reply a finite opportunity to flush before closing it.
    if(signal.reason?.code==='runtime-request-body-timeout'&&replyToBodyTimeout){
      try{if(replyToBodyTimeout()===true){forceClose=setTimeout(()=>req.destroy(signal.reason),100);return;}}catch{}
    }
    req.destroy(signal.reason);
  };signal.addEventListener('abort',stop,{once:true});
  try{const chunks=[];let size=0;for await(const chunk of req){signal.throwIfAborted();size+=chunk.length;
      demand(size<=limit,'request-cap');chunks.push(chunk);}signal.throwIfAborted();return Buffer.concat(chunks);
  }finally{signal.removeEventListener('abort',stop);}
}
export function createRuntimeProxy({controller,upstream='http://127.0.0.1:1234',allowedClients=['192.168.50.169'],fetchImpl=rawHttpRequest,event=()=>{},
  rerankerUpstream='http://127.0.0.1:8412',serverFactory=createServer,authorizeClient=()=>true}){
  const base=new URL(upstream);demand(base.protocol==='http:'&&base.hostname==='127.0.0.1'&&!base.username&&!base.password
    &&base.pathname==='/'&&!base.search&&!base.hash,'upstream');
  const reranker=new URL(rerankerUpstream);demand(reranker.protocol==='http:'&&reranker.hostname==='127.0.0.1'&&!reranker.username&&!reranker.password
    &&reranker.pathname==='/'&&!reranker.search&&!reranker.hash,'reranker-upstream');
  const clients=new Set(allowedClients);demand(clients.size>0&&[...clients].every(v=>/^\d{1,3}(?:\.\d{1,3}){3}$/.test(v)),'clients');
  const server=serverFactory(async(req,res)=>{
    let ticket=null,bodyTimeout=null;const abort=new AbortController();const closed=()=>{if(!res.writableEnded)abort.abort(error('client-disconnected'));};
    req.once('aborted',closed);res.once('close',closed);
    const isReranker=['/rerank','/health'].includes(req.url);
    const timeout=setTimeout(()=>abort.abort(error('request-timeout')),isReranker?RUNTIME_LIMITS.rerankerMs:RUNTIME_LIMITS.requestMs);
    const reject=(status,code,close=false)=>{if(res.headersSent||res.destroyed)return false;
      const bytes=Buffer.from(JSON.stringify({schemaVersion:'runaai-home-runtime-error/v1',errorCode:code,privateValuesIncluded:false}));
      res.writeHead(status,{'content-type':'application/json','content-length':bytes.length,'cache-control':'no-store',...(close?{connection:'close'}:{})});
      res.end(bytes);return true;};
    try{
      const remote=(req.socket.remoteAddress??'').replace(/^::ffff:/,'');demand(clients.has(remote)&&authorizeClient(req),'client-denied');
      if(req.method==='GET'&&req.url==='/healthz'){
        const healthy=(await controller.poll()).phase==='ready';res.writeHead(healthy?200:503,{'content-type':'application/json','cache-control':'no-store'});
        res.end(JSON.stringify({ready:healthy}));return;
      }
      demand(req.url&&!req.url.includes('?')&&!req.url.includes('#'),'endpoint-denied');
      if(req.method==='POST')demand(/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''),'content-type');
      demand(!req.headers['content-encoding'],'content-encoding');
      // The privileged ticket is also the authoritative ingress count. Acquire it before
      // awaiting any body byte so drain cannot observe zero while an accepted request remains
      // capable of reaching validation and native dispatch.
      ticket=await controller.admit({signal:abort.signal});
      const requestSignal=AbortSignal.any([abort.signal,ticket.signal]);
      bodyTimeout=setTimeout(()=>abort.abort(error('request-body-timeout')),RUNTIME_LIMITS.bodyMs);
      const raw=await readRequestBody(req,{signal:requestSignal,replyToBodyTimeout:()=>reject(408,'runtime-request-body-timeout',true)});
      clearTimeout(bodyTimeout);bodyTimeout=null;
      validateRequest(controller.profile,req.url,req.method,raw);
      const response=await fetchImpl(new URL(req.url,isReranker?reranker:base),{method:req.method,redirect:'error',
        headers:{...(req.headers['content-type']?{'content-type':req.headers['content-type']}:{}),...(req.headers.accept?{accept:req.headers.accept}:{})},
        body:req.method==='POST'?raw:undefined,signal:requestSignal});
      demand(response.status<300||response.status>=400,'upstream-redirect');
      const replies=[];let responseBytes=0;
      for await(const chunk of response.body){responseBytes+=chunk.length;demand(responseBytes<=RUNTIME_LIMITS.responseBytes,'response-cap');replies.push(chunk);}
      abort.signal.throwIfAborted();ticket.signal.throwIfAborted();const body=Buffer.concat(replies);
      res.writeHead(response.status,{'content-type':response.headers.get('content-type')??'application/json','content-length':body.length,'cache-control':'no-store',
        ...(response.headers.get('content-encoding')?{'content-encoding':response.headers.get('content-encoding')}:{})});
      res.end(body);event({type:'forwarded',method:req.method,path:req.url,requestBytes:raw.length,responseBytes:body.length,status:response.status,generation:ticket.generation});
    }catch(e){const cause=abort.signal.reason?.code==='runtime-request-body-timeout'?abort.signal.reason:e;
      abort.abort(cause);const code=/^(runtime|lease)-[a-z0-9-]+$/.test(cause?.code??'')?cause.code:'runtime-request-unavailable';
      reject(code==='runtime-client-denied'?403:503,code);event({type:'denied',code});
    }finally{clearTimeout(timeout);clearTimeout(bodyTimeout);
      // IPC acknowledgement is asynchronous. Never drop its rejection or acknowledge a request
      // before its upstream iterator settles; a lost reply leaves the privileged grant unknown.
      try{await ticket?.release();}catch{event({type:'release-unconfirmed',code:'runtime-release-unconfirmed'});}
      req.removeListener('aborted',closed);res.removeListener('close',closed);}
  });
  server.requestTimeout=RUNTIME_LIMITS.requestMs;server.headersTimeout=10000;server.maxHeadersCount=32;server.maxConnections=32;
  return server;
}
