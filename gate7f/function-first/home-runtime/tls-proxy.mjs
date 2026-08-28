import {createServer} from 'node:https';
import {constants,X509Certificate,createHash,timingSafeEqual} from 'node:crypto';
import {createRuntimeProxy} from './proxy.mjs';
import {demand} from './contracts.mjs';

const hash=value=>createHash('sha256').update(value).digest();
const samePin=(bytes,pin)=>timingSafeEqual(hash(bytes),Buffer.from(pin,'hex'));
const currentlyValid=(certificate,now)=>now>=Date.parse(certificate.validFrom)&&now<Date.parse(certificate.validTo);
export function verifiedPeer(socket,clientCertificateSha256,now=Date.now()){
  if(socket?.encrypted!==true||socket.authorized!==true||socket.getProtocol?.()!=='TLSv1.3'||socket.isSessionReused?.()!==false)return false;
  const certificate=socket.getPeerX509Certificate?.();
  return certificate instanceof X509Certificate&&samePin(certificate.raw,clientCertificateSha256)&&currentlyValid(certificate,now);
}

/** Creates but never binds a TLS server. Key bytes come only from the independently protected
 * operator package; they are not copied into request headers, model traffic, logs or return values. */
export function createRuntimeTlsProxy({controller,upstream,rerankerUpstream,allowedClients,fetchImpl,event,tls}){
  demand(tls&&Object.keys(tls).sort().join()==='ca,caSha256,cert,clientCertificateSha256,key,serverCertificateSha256','tls-shape');
  for(const name of ['caSha256','clientCertificateSha256','serverCertificateSha256'])demand(/^[a-f0-9]{64}$/.test(tls[name]),'tls-pin');
  demand([tls.key,tls.cert,tls.ca].every(value=>(Buffer.isBuffer(value)||typeof value==='string')&&Buffer.byteLength(value)>0&&Buffer.byteLength(value)<=32768),'tls-material');
  const certificate=new X509Certificate(tls.cert),issuer=new X509Certificate(tls.ca);
  demand(samePin(certificate.raw,tls.serverCertificateSha256)&&samePin(issuer.raw,tls.caSha256),'tls-material-pin');
  demand(!certificate.ca&&issuer.ca&&currentlyValid(certificate,Date.now())&&currentlyValid(issuer,Date.now()),'tls-material-validity');
  demand(certificate.verify(issuer.publicKey)&&certificate.checkIssued(issuer),'tls-server-issuer');
  const clientPin=tls.clientCertificateSha256;
  return createRuntimeProxy({controller,upstream,rerankerUpstream,allowedClients,fetchImpl,event,
    authorizeClient:request=>currentlyValid(certificate,Date.now())&&currentlyValid(issuer,Date.now())&&verifiedPeer(request.socket,clientPin),
    serverFactory:handler=>createServer({key:tls.key,cert:tls.cert,ca:tls.ca,requestCert:true,rejectUnauthorized:true,
      minVersion:'TLSv1.3',maxVersion:'TLSv1.3',secureOptions:constants.SSL_OP_NO_TICKET,handshakeTimeout:10000,ALPNProtocols:['http/1.1']},handler)});
}
