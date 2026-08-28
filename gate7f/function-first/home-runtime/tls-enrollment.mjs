import {readFileSync,openSync,closeSync,writeSync,fsyncSync,fstatSync,lstatSync,mkdirSync,existsSync} from 'node:fs';
import {createPrivateKey,createPublicKey,randomBytes,X509Certificate} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {demand,sha} from './tls-primitives.mjs';
const execute=promisify(execFile),HASH=/^[a-f0-9]{64}$/,ID=/^[a-f0-9]{32}$/;
const ISSUER='RunaAI-Next-private-issuer-M1',SERVER='runa-home-m1.internal',CLIENT='RunaAI-Next-Control-M1';
const eku={server:'1.3.6.1.5.5.7.3.1',client:'1.3.6.1.5.5.7.3.2'};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys;
function plain(file,{directory=false}={}){
  demand(path.resolve(file)===file,'enrollment-path');
  for(let item=file;item!==path.dirname(item);item=path.dirname(item))demand(!lstatSync(item).isSymbolicLink(),'enrollment-link');
  const stat=lstatSync(file);demand(directory?stat.isDirectory():stat.isFile()&&stat.nlink===1,'enrollment-file');
  return stat;
}
function read(file,maximum=32768){const stat=plain(file);demand(stat.size<=maximum,'enrollment-file-cap');
  const fd=openSync(file,'r');try{const held=fstatSync(fd);demand(held.isFile()&&held.nlink===1&&held.dev===stat.dev&&held.ino===stat.ino&&held.size===stat.size,'enrollment-read-race');
    const bytes=readFileSync(fd),after=fstatSync(fd);demand(bytes.length===stat.size&&after.size===held.size&&after.mtimeMs===held.mtimeMs,'enrollment-read-race');return bytes;
  }finally{closeSync(fd);}}
function write(file,bytes){demand(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=32768,'enrollment-output-cap');plain(path.dirname(file),{directory:true});
  const fd=openSync(file,'wx',0o600);try{writeSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const spki=key=>sha(key.export({type:'spki',format:'der'}));
function rsa(key){demand(key.asymmetricKeyType==='rsa'&&key.asymmetricKeyDetails?.modulusLength===3072,'enrollment-key-strength');return key;}
function certificate(pem){
  demand(typeof pem==='string'&&pem.length<=8192&&/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\r?\n?$/.test(pem),'enrollment-certificate');
  const cert=new X509Certificate(pem);rsa(cert.publicKey);demand(Date.now()>=Date.parse(cert.validFrom)&&Date.now()<Date.parse(cert.validTo),'enrollment-validity');return cert;
}
function checkLeaf(cert,issuer,kind){demand(!cert.ca&&cert.verify(issuer.publicKey)&&cert.checkIssued(issuer),'enrollment-issuer');
  demand(cert.keyUsage?.length===1&&cert.keyUsage[0]===eku[kind],'enrollment-usage');
  demand(cert.subject===`CN=${kind==='server'?SERVER:CLIENT}`,'enrollment-subject');
  if(kind==='server')demand(cert.checkHost(SERVER)===SERVER&&cert.subjectAltName===`DNS:${SERVER}`,'enrollment-server-name');
  else demand(cert.subjectAltName===undefined,'enrollment-client-alias');
  demand(Date.parse(cert.validTo)-Date.parse(cert.validFrom)<=91*86400000,'enrollment-leaf-duration');
}
function parsePacket(raw,expectedSha256){demand(Buffer.isBuffer(raw)&&raw.length<=32768&&HASH.test(expectedSha256)&&sha(raw)===expectedSha256,'enrollment-packet-pin');
  // The complete raw packet is independently pinned before parsing; no reserialization is trusted.
  let value,text;try{text=new TextDecoder('utf8',{fatal:true}).decode(raw);value=JSON.parse(text);}catch{demand(false,'enrollment-packet-json');}
  // Packets are flat primitive objects. Refuse duplicate decoded keys, even when the supplied
  // complete-byte pin matches: a packet with ambiguous semantics is not an exact allowlist.
  const keys=new Set();for(const token of text.matchAll(/"(?:\\[\s\S]|[^"\\])*"/g)){
    if(!/^\s*:/.test(text.slice(token.index+token[0].length)))continue;
    const key=JSON.parse(token[0]);demand(!keys.has(key),'enrollment-packet-duplicate-key');keys.add(key);
  }return value;}
export function validateHomeTlsOffer(raw,expectedSha256){
  const offer=parsePacket(raw,expectedSha256);
  demand(exact(offer,'enrollmentId,issuerPem,issuerSha256,schemaVersion,serverPem,serverSha256')
    &&offer.schemaVersion==='runaai-home-tls-offer/v1'&&ID.test(offer.enrollmentId),'enrollment-offer-shape');
  const issuer=certificate(offer.issuerPem),server=certificate(offer.serverPem);
  demand(issuer.ca&&issuer.subject===`CN=${ISSUER}`&&issuer.verify(issuer.publicKey),'enrollment-ca');
  demand(sha(issuer.raw)===offer.issuerSha256&&sha(server.raw)===offer.serverSha256,'enrollment-offer-cert-pin');checkLeaf(server,issuer,'server');
  return {offer,issuer,server,offerSha256:expectedSha256};
}
async function environment({root,enrollmentId,openssl,opensslSha256,secureDirectory,verifyDirectory},create){
  demand(ID.test(enrollmentId)&&path.basename(root)===enrollmentId&&path.resolve(root)===root,'enrollment-root');
  demand(path.resolve(openssl)===openssl&&HASH.test(opensslSha256)&&sha(read(openssl,4*1024*1024))===opensslSha256,'enrollment-openssl-pin');
  demand(typeof verifyDirectory==='function','enrollment-acl-verifier');
  if(create){demand(typeof secureDirectory==='function'&&!existsSync(root),'enrollment-existing-root');plain(path.dirname(root),{directory:true});
    mkdirSync(root,{mode:0o700});await secureDirectory(root);}
  plain(root,{directory:true});await verifyDirectory(root);
  const run=async args=>{await verifyDirectory(root);demand(sha(read(openssl,4*1024*1024))===opensslSha256,'enrollment-openssl-drift');
    try{const result=await execute(openssl,args,{cwd:root,encoding:'buffer',windowsHide:true,timeout:15000,maxBuffer:32768});return Buffer.from(result.stdout);}
    catch{demand(false,'enrollment-openssl-command');}};
  return {root,run,file:name=>path.join(root,name)};
}
async function newKey(e,name){const bytes=await e.run(['genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:3072']);
  rsa(createPublicKey(createPrivateKey(bytes)));write(e.file(name),bytes);}
const serial=()=>`0x${randomBytes(16).toString('hex')}`;
async function csr(e,keyName,csrName,subject){const bytes=await e.run(['req','-new','-key',e.file(keyName),'-sha256','-subj','/CN='+subject]);write(e.file(csrName),bytes);return bytes;}
async function sign(e,csrName,certName,kind){
  const ext=`basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=${kind==='server'?'serverAuth':'clientAuth'}\n`+
    (kind==='server'?`subjectAltName=DNS:${SERVER}\n`:'');write(e.file(kind+'.ext'),Buffer.from(ext));
  const bytes=await e.run(['x509','-req','-in',e.file(csrName),'-CA',e.file('issuer.pem'),'-CAkey',e.file('issuer-key.pem'),
    '-set_serial',serial(),'-days','90','-sha256','-extfile',e.file(kind+'.ext')]);write(e.file(certName),bytes);return bytes;
}
/** Caller is the sealed host wrapper. Its secureDirectory callback must establish SYSTEM/Admin
 * access before this library creates any private material. No function logs or returns private keys. */
export async function createHomeTlsEnrollment(options){
  const e=await environment(options,true);await newKey(e,'issuer-key.pem');await newKey(e,'server-key.pem');
  const issuerPem=await e.run(['req','-x509','-new','-key',e.file('issuer-key.pem'),'-sha256','-days','730','-set_serial',serial(),
    '-subj','/CN='+ISSUER,'-addext','basicConstraints=critical,CA:TRUE,pathlen:0','-addext','keyUsage=critical,keyCertSign,cRLSign']);
  write(e.file('issuer.pem'),issuerPem);await csr(e,'server-key.pem','server.csr',SERVER);const serverPem=await sign(e,'server.csr','server.pem','server');
  const offer={schemaVersion:'runaai-home-tls-offer/v1',enrollmentId:options.enrollmentId,issuerPem:issuerPem.toString(),serverPem:serverPem.toString(),
    issuerSha256:sha(new X509Certificate(issuerPem).raw),serverSha256:sha(new X509Certificate(serverPem).raw)};
  const raw=json(offer);validateHomeTlsOffer(raw,sha(raw));write(e.file('public-offer.json'),raw);
  return {publicPacket:raw,sha256:sha(raw),privateMaterialIncluded:false};
}
export async function createControlTlsEnrollment(options,{homeOffer,expectedHomeOfferSha256}){
  const {offer}=validateHomeTlsOffer(homeOffer,expectedHomeOfferSha256);demand(offer.enrollmentId===options.enrollmentId,'enrollment-id');
  const e=await environment(options,true);await newKey(e,'client-key.pem');const request=await csr(e,'client-key.pem','client.csr',CLIENT);
  const packet={schemaVersion:'runaai-control-tls-request/v1',enrollmentId:options.enrollmentId,homeOfferSha256:expectedHomeOfferSha256,
    csrPem:request.toString(),csrSha256:sha(request),publicKeySha256:spki(createPublicKey(createPrivateKey(read(e.file('client-key.pem')))))};
  const raw=json(packet);write(e.file('public-offer.json'),homeOffer);write(e.file('public-request.json'),raw);
  return {publicPacket:raw,sha256:sha(raw),privateMaterialIncluded:false};
}
export async function issueControlTlsCertificate(options,{controlRequest,expectedControlRequestSha256}){
  const request=parsePacket(controlRequest,expectedControlRequestSha256);
  demand(exact(request,'csrPem,csrSha256,enrollmentId,homeOfferSha256,publicKeySha256,schemaVersion')
    &&request.schemaVersion==='runaai-control-tls-request/v1'&&request.enrollmentId===options.enrollmentId
    &&typeof request.csrPem==='string'&&request.csrPem.length<=8192&&/^-----BEGIN CERTIFICATE REQUEST-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE REQUEST-----\r?\n?$/.test(request.csrPem)
    &&sha(request.csrPem)===request.csrSha256&&HASH.test(request.publicKeySha256),'enrollment-request-shape');
  const e=await environment(options,false),homeOffer=read(e.file('public-offer.json'));
  const {offer,issuer}=validateHomeTlsOffer(homeOffer,request.homeOfferSha256);demand(offer.enrollmentId===request.enrollmentId,'enrollment-id');
  write(e.file('control-request.csr'),Buffer.from(request.csrPem));await e.run(['req','-verify','-in',e.file('control-request.csr'),'-noout']);
  const subject=(await e.run(['req','-in',e.file('control-request.csr'),'-noout','-subject','-nameopt','RFC2253'])).toString().trim();
  demand(subject===`subject=CN=${CLIENT}`,'enrollment-csr-subject');
  const key=rsa(createPublicKey(await e.run(['req','-in',e.file('control-request.csr'),'-noout','-pubkey'])));
  demand(spki(key)===request.publicKeySha256,'enrollment-csr-key');
  const clientPem=await sign(e,'control-request.csr','client.pem','client'),client=certificate(clientPem.toString());checkLeaf(client,issuer,'client');
  demand(spki(client.publicKey)===request.publicKeySha256,'enrollment-issued-key');
  const raw=json({schemaVersion:'runaai-home-tls-certificate/v1',enrollmentId:options.enrollmentId,homeOfferSha256:request.homeOfferSha256,
    controlRequestSha256:expectedControlRequestSha256,clientPem:clientPem.toString(),clientSha256:sha(client.raw)});
  write(e.file('public-certificate.json'),raw);return {publicPacket:raw,sha256:sha(raw),privateMaterialIncluded:false};
}
export async function importControlTlsCertificate(options,{certificatePacket,expectedCertificateSha256}){
  const packet=parsePacket(certificatePacket,expectedCertificateSha256);
  demand(exact(packet,'clientPem,clientSha256,controlRequestSha256,enrollmentId,homeOfferSha256,schemaVersion')
    &&packet.schemaVersion==='runaai-home-tls-certificate/v1'&&packet.enrollmentId===options.enrollmentId,'enrollment-certificate-shape');
  const e=await environment(options,false),offerRaw=read(e.file('public-offer.json'));
  const {issuer,offer}=validateHomeTlsOffer(offerRaw,packet.homeOfferSha256);
  demand(sha(read(e.file('public-request.json')))===packet.controlRequestSha256,'enrollment-local-request-pin');
  const client=certificate(packet.clientPem);checkLeaf(client,issuer,'client');demand(sha(client.raw)===packet.clientSha256,'enrollment-client-pin');
  demand(client.checkPrivateKey(createPrivateKey(read(e.file('client-key.pem')))),'enrollment-local-key-mismatch');
  // Validate everything before publishing any imported certificate. Partial I/O remains closed
  // and recoverable; no key/cert/output is overwritten and no route is activated by enrollment.
  write(e.file('client.pem'),Buffer.from(packet.clientPem));write(e.file('ca.pem'),Buffer.from(offer.issuerPem));
  const result={schemaVersion:'runaai-control-tls-enrollment/v1',enrollmentId:options.enrollmentId,caSha256:offer.issuerSha256,
    serverCertificateSha256:offer.serverSha256,clientCertificateSha256:packet.clientSha256,serverName:SERVER,
    clientExpiresAt:client.validTo,privateMaterialIncluded:false,activated:false};write(e.file('enrollment.json'),json(result));return result;
}
