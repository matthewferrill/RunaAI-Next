import {createServer} from 'node:https';
import {createHash,X509Certificate} from 'node:crypto';
import {validateLegacyCompatibilityBinding} from './legacy-contract.mjs';

const fail=code=>Object.assign(Error('m1-legacy-server-'+code),{code:'m1-legacy-server-'+code});
const need=(value,code)=>{if(!value)throw fail(code);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const address=value=>String(value??'').replace(/^::ffff:/u,'');

function certificatePin(value){try{return hash(new X509Certificate(value).raw);}catch{throw fail('certificate');}}
function status(error){const code=String(error?.code??'');
  if(code.includes('client-identity'))return 403;
  if(code.includes('admission-closed')||code.includes('not-closed'))return 503;
  if(code.includes('body-timeout'))return 408;
  if(error?.name==='AbortError'||code.includes('abort'))return 504;
  if(code.startsWith('m1-legacy-compat-')||code.startsWith('m1-legacy-server-'))return 400;
  return 502;
}
function send(res,code,body,headers={}){
  if(res.headersSent||res.destroyed)return false;const raw=Buffer.isBuffer(body)?body:Buffer.from(body);
  res.writeHead(code,{...headers,'content-length':String(raw.length),'connection':'close'});res.end(raw);return true;
}
async function bytes(req,maximum,signal,replyToBodyTimeout){
  need(!Object.hasOwn(req.headers,'content-encoding'),'content-encoding');
  const declared=req.headers['content-length'];if(declared!==undefined){need(/^\d+$/u.test(declared),'content-length');need(Number(declared)<=maximum,'body-bounds');}
  signal.throwIfAborted();let forceClose=null;
  const stop=()=>{if(signal.reason?.code==='m1-legacy-server-body-timeout'&&replyToBodyTimeout){
      try{if(replyToBodyTimeout()===true){forceClose=setTimeout(()=>req.destroy(signal.reason),100);return;}}catch{}}
    req.destroy(signal.reason);};
  signal.addEventListener('abort',stop,{once:true});
  try{const chunks=[];let total=0;for await(const chunk of req){signal.throwIfAborted();total+=chunk.length;need(total<=maximum,'body-bounds');chunks.push(chunk);}
    signal.throwIfAborted();return Buffer.concat(chunks,total);
  }finally{signal.removeEventListener('abort',stop);}
}

/** Actual mTLS HTTP boundary for the separate legacy adapter. It is returned
 * unstarted; its owner must bind only the descriptor's Home endpoint. */
export function createLegacyCompatibilityServer({binding:input,adapter,tls,event=()=>{}}){
  const binding=validateLegacyCompatibilityBinding(input);
  need(adapter&&typeof adapter.acquireIngress==='function'&&tls&&typeof tls==='object'&&Buffer.isBuffer(tls.key)
    &&Buffer.isBuffer(tls.cert)&&Buffer.isBuffer(tls.ca)&&typeof event==='function','constructor');
  need(certificatePin(tls.cert)===binding.home.serverCertificateSha256,'server-certificate-pin');
  const server=createServer({key:tls.key,cert:tls.cert,ca:tls.ca,requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.3'},async(req,res)=>{
    const controller=new AbortController(),abort=()=>controller.abort(fail('client-abort'));let ingress=null,bodyTimer=null;req.once('aborted',abort);
    try{
      const peer=req.socket.getPeerX509Certificate?.();need(req.socket.authorized&&peer?.raw
        &&hash(peer.raw)===binding.control.clientCertificateSha256,'client-identity');
      const sourceAddress=address(req.socket.remoteAddress);need(sourceAddress===binding.control.sourceAddress,'client-identity');
      const method=String(req.method??''),pathname=String(req.url??'');
      ingress=await adapter.acquireIngress({sourceAddress,clientCertificateSha256:hash(peer.raw)});
      bodyTimer=setTimeout(()=>controller.abort(fail('body-timeout')),binding.limits.bodyMs);
      const raw=await bytes(req,binding.limits.bodyBytes,controller.signal,()=>send(res,408,
        JSON.stringify({schemaVersion:'runaai-legacy-compatibility-error/v1',errorCode:'m1-legacy-server-body-timeout',privateValuesIncluded:false}),
        {'content-type':'application/json'}));
      clearTimeout(bodyTimer);bodyTimer=null;if(method==='GET')need(raw.length===0,'get-body');
      const result=await ingress.dispatch({sourceAddress,clientCertificateSha256:hash(peer.raw),pathname,method,raw,signal:controller.signal});
      event({kind:'legacy-wire-response',method,pathname,status:result.status,responseBytes:result.raw.length});
      send(res,result.status,result.raw,result.headers);
    }catch(error){event({kind:'legacy-wire-denial',code:error?.code??'unknown'});
      send(res,status(error),JSON.stringify({error:'legacy-compatibility-request-denied'}),{'content-type':'application/json'});
    }finally{clearTimeout(bodyTimer);try{await ingress?.release();}catch(error){event({kind:'legacy-wire-release-unconfirmed',code:error?.code??'unknown'});}
      req.off('aborted',abort);}
  });
  server.on('tlsClientError',error=>event({kind:'legacy-wire-tls-denial',code:error.code??'TLS_ERROR'}));
  server.requestTimeout=binding.limits.requestMs;server.headersTimeout=10000;server.maxHeadersCount=32;server.maxConnections=32;
  return server;
}
