import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,existsSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes,createPrivateKey,X509Certificate} from 'node:crypto';
import {sha} from './contracts.mjs';
import {validateHomeTlsOffer,createHomeTlsEnrollment,createControlTlsEnrollment,issueControlTlsCertificate,importControlTlsCertificate} from './tls-enrollment.mjs';

const openssl=process.platform==='win32'?'C:\\Program Files\\Git\\usr\\bin\\openssl.exe':'/usr/bin/openssl';
const opensslSha256=sha(readFileSync(openssl));
let base,home,control,offer,request,issued,imported;
const enrollmentId=randomBytes(16).toString('hex'),aclEvents=[];
const packet=value=>Buffer.from(JSON.stringify(value)+'\n');
function options(host,id=enrollmentId){
  const parent=path.join(base,host);mkdirSync(parent);
  return {root:path.join(parent,id),enrollmentId:id,openssl,opensslSha256,
    // This fixture records sequencing only. Native SYSTEM/Admin ACL proof belongs to the
    // Windows host wrapper; a disposable local OpenSSL test cannot establish that claim.
    secureDirectory:async root=>{assert.deepEqual(readdirSync(root),[]);aclEvents.push(['secure',root]);},
    verifyDirectory:async root=>{assert.ok(aclEvents.some(([event,p])=>event==='secure'&&p===root));aclEvents.push(['verify',root]);}};
}
before(async()=>{
  base=mkdtempSync(path.join(realpathSync(tmpdir()),'runa-tls-enrollment-'));
  home=options('home');control=options('control');
  offer=await createHomeTlsEnrollment(home);
  request=await createControlTlsEnrollment(control,{homeOffer:offer.publicPacket,expectedHomeOfferSha256:offer.sha256});
  issued=await issueControlTlsCertificate(home,{controlRequest:request.publicPacket,expectedControlRequestSha256:request.sha256});
  imported=await importControlTlsCertificate(control,{certificatePacket:issued.publicPacket,expectedCertificateSha256:issued.sha256});
});
after(()=>{if(base){assert.ok(path.dirname(base)===realpathSync(tmpdir())&&path.basename(base).startsWith('runa-tls-enrollment-'));rmSync(base,{recursive:true,force:true});}});

test('real OpenSSL enrollment transfers only pinned public CSR/certificates across two owning directories',()=>{
  const parsed=validateHomeTlsOffer(offer.publicPacket,offer.sha256);
  assert.equal(imported.activated,false);assert.equal(imported.privateMaterialIncluded,false);
  assert.equal(imported.caSha256,parsed.offer.issuerSha256);
  for(const result of [offer,request,issued]){assert.equal(sha(result.publicPacket),result.sha256);assert.equal(result.privateMaterialIncluded,false);
    assert.doesNotMatch(result.publicPacket.toString(),/PRIVATE KEY/);}
  assert.ok(existsSync(path.join(home.root,'issuer-key.pem'))&&existsSync(path.join(home.root,'server-key.pem')));
  assert.equal(existsSync(path.join(home.root,'client-key.pem')),false);
  assert.ok(existsSync(path.join(control.root,'client-key.pem')));
  assert.equal(existsSync(path.join(control.root,'issuer-key.pem')),false);
  assert.equal(existsSync(path.join(control.root,'server-key.pem')),false);
  const client=new X509Certificate(readFileSync(path.join(control.root,'client.pem')));
  assert.ok(client.checkPrivateKey(createPrivateKey(readFileSync(path.join(control.root,'client-key.pem')))));
  assert.ok(parsed.server.checkPrivateKey(createPrivateKey(readFileSync(path.join(home.root,'server-key.pem')))));
  assert.equal(client.keyUsage[0],'1.3.6.1.5.5.7.3.2');assert.equal(parsed.server.keyUsage[0],'1.3.6.1.5.5.7.3.1');
});

test('wrong packet pins, extra fields and duplicate decoded keys are refused before creating a Control key',async()=>{
  assert.throws(()=>validateHomeTlsOffer(offer.publicPacket,'0'.repeat(64)),/enrollment-packet-pin/);
  const unknown=packet({...JSON.parse(offer.publicPacket),privateKey:'not-accepted'});
  assert.throws(()=>validateHomeTlsOffer(unknown,sha(unknown)),/enrollment-offer-shape/);
  const repeated=Buffer.from(offer.publicPacket.toString().replace('{','{"enrollmentId":"'+enrollmentId+'",'));
  assert.throws(()=>validateHomeTlsOffer(repeated,sha(repeated)),/enrollment-packet-duplicate-key/);
  const escaped=Buffer.from(offer.publicPacket.toString().replace('{','{"\\u0065nrollmentId":"'+enrollmentId+'",'));
  assert.throws(()=>validateHomeTlsOffer(escaped,sha(escaped)),/enrollment-packet-duplicate-key/);
  const candidate=options('bad-offer');
  await assert.rejects(createControlTlsEnrollment(candidate,{homeOffer:unknown,expectedHomeOfferSha256:sha(unknown)}),/enrollment-offer-shape/);
  assert.equal(existsSync(candidate.root),false);
});

test('generation and completed imports refuse existing roots and exact output files without overwriting',async()=>{
  const original=readFileSync(path.join(control.root,'client-key.pem'));
  await assert.rejects(createHomeTlsEnrollment(home),/enrollment-existing-root/);
  await assert.rejects(createControlTlsEnrollment(control,{homeOffer:offer.publicPacket,expectedHomeOfferSha256:offer.sha256}),/enrollment-existing-root/);
  await assert.rejects(importControlTlsCertificate(control,{certificatePacket:issued.publicPacket,expectedCertificateSha256:issued.sha256}),/EEXIST/);
  assert.deepEqual(readFileSync(path.join(control.root,'client-key.pem')),original);
});

test('ACL verification precedes private material and is rechecked for an existing enrollment',async()=>{
  const denied=options('denied');denied.verifyDirectory=async()=>{throw Error('fixture-acl-denied');};
  await assert.rejects(createHomeTlsEnrollment(denied),/fixture-acl-denied/);assert.deepEqual(readdirSync(denied.root),[]);
  await assert.rejects(issueControlTlsCertificate({...home,verifyDirectory:denied.verifyDirectory},
    {controlRequest:request.publicPacket,expectedControlRequestSha256:request.sha256}),/fixture-acl-denied/);
  await assert.rejects(createHomeTlsEnrollment({...options('missing-verifier'),verifyDirectory:undefined}),/enrollment-acl-verifier/);
});

test('a real valid CSR with the wrong subject is never signed',async()=>{
  const signer=options('wrong-subject-signer'),signerOffer=await createHomeTlsEnrollment(signer);
  const wrongCsr=execFileSync(openssl,['req','-new','-key',path.join(control.root,'client-key.pem'),'-sha256','-subj','/CN=not-the-Control-client'],{encoding:'buffer',windowsHide:true,timeout:15000,maxBuffer:32768});
  const wrong=packet({...JSON.parse(request.publicPacket),homeOfferSha256:signerOffer.sha256,csrPem:wrongCsr.toString(),csrSha256:sha(wrongCsr)});
  await assert.rejects(issueControlTlsCertificate(signer,{controlRequest:wrong,expectedControlRequestSha256:sha(wrong)}),/enrollment-csr-subject/);
  assert.equal(existsSync(path.join(signer.root,'client.pem')),false);
});

test('a correctly signed peer certificate cannot be imported against a different local Control key',async()=>{
  const other=options('other-control'),otherRequest=await createControlTlsEnrollment(other,{homeOffer:offer.publicPacket,expectedHomeOfferSha256:offer.sha256});
  const wrong=packet({...JSON.parse(issued.publicPacket),controlRequestSha256:otherRequest.sha256});
  await assert.rejects(importControlTlsCertificate(other,{certificatePacket:wrong,expectedCertificateSha256:sha(wrong)}),/enrollment-local-key-mismatch/);
  assert.equal(existsSync(path.join(other.root,'client.pem')),false);
});

test('wrong CSR digest and wrong certificate issuer are refused without a publication',async()=>{
  const wrongRequest=packet({...JSON.parse(request.publicPacket),csrSha256:'0'.repeat(64)});
  await assert.rejects(issueControlTlsCertificate(home,{controlRequest:wrongRequest,expectedControlRequestSha256:sha(wrongRequest)}),/enrollment-request-shape/);
  const foreign=options('foreign-issuer'),foreignOffer=await createHomeTlsEnrollment(foreign);
  const local=options('foreign-control'),localRequest=await createControlTlsEnrollment(local,{homeOffer:offer.publicPacket,expectedHomeOfferSha256:offer.sha256});
  const foreignRequest=packet({...JSON.parse(localRequest.publicPacket),homeOfferSha256:foreignOffer.sha256});
  const foreignIssued=await issueControlTlsCertificate(foreign,{controlRequest:foreignRequest,expectedControlRequestSha256:sha(foreignRequest)});
  const substituted=packet({...JSON.parse(foreignIssued.publicPacket),homeOfferSha256:offer.sha256,controlRequestSha256:localRequest.sha256});
  await assert.rejects(importControlTlsCertificate(local,{certificatePacket:substituted,expectedCertificateSha256:sha(substituted)}),/enrollment-issuer/);
  assert.equal(existsSync(path.join(local.root,'client.pem')),false);
});

test('pinned OpenSSL drift fails before any enrollment root is created',async()=>{
  const wrong=options('wrong-openssl');wrong.opensslSha256='0'.repeat(64);
  await assert.rejects(createHomeTlsEnrollment(wrong),/enrollment-openssl-pin/);assert.equal(existsSync(wrong.root),false);
});
