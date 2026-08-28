import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,realpathSync,rmSync,existsSync,linkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {sha} from './tls-primitives.mjs';
import {TLS_ENROLLMENT_SOURCE_FILES} from './tls-enrollment-cli.mjs';
import {createHomeTlsEnrollment,createControlTlsEnrollment,issueControlTlsCertificate,importControlTlsCertificate} from './tls-enrollment.mjs';
import {prepareTlsOperator,loadTlsOperator,tlsRemoteCommand,runTlsOperator,validateTlsPublicTransfer} from './tls-enrollment-operator.mjs';

const openssl=process.platform==='win32'?'C:\\Program Files\\Git\\usr\\bin\\openssl.exe':'/usr/bin/openssl';
const id=randomBytes(16).toString('hex'),packet=value=>Buffer.from(JSON.stringify(value)+'\n');
let base,prepared,offer,request,issued,imported;
before(async()=>{
 base=mkdtempSync(path.join(realpathSync(tmpdir()),'runa-tls-operator-'));
 prepared=prepareTlsOperator({outputDirectory:path.join(base,'packet'),enrollmentId:id});
 const options=host=>{const parent=path.join(base,host);mkdirSync(parent);return {root:path.join(parent,id),enrollmentId:id,openssl,
  opensslSha256:sha(readFileSync(openssl)),secureDirectory:async()=>{},verifyDirectory:async()=>{}};};
 const home=options('home'),control=options('control');offer=await createHomeTlsEnrollment(home);
 request=await createControlTlsEnrollment(control,{homeOffer:offer.publicPacket,expectedHomeOfferSha256:offer.sha256});
 issued=await issueControlTlsCertificate(home,{controlRequest:request.publicPacket,expectedControlRequestSha256:request.sha256});
 imported=await importControlTlsCertificate(control,{certificatePacket:issued.publicPacket,expectedCertificateSha256:issued.sha256});
});
after(()=>{if(base){assert.equal(path.dirname(base),realpathSync(tmpdir()));assert.ok(path.basename(base).startsWith('runa-tls-operator-'));rmSync(base,{recursive:true,force:true});}});
const context=()=>loadTlsOperator(prepared.descriptorFile,prepared.descriptorSha256);
const values={HomeOffer:()=>offer,ControlRequest:()=>request,HomeSign:()=>issued};
function response(action){
 const host=action.startsWith('Home')?'home':'control',value=values[action]?.(),publicName={HomeOffer:'public-offer.json',ControlRequest:'public-request.json',HomeSign:'public-certificate.json'}[action];
 const root=(host==='home'?'C:\\AI\\RunaAI-Next-HomeRuntime-Enrollment':'C:\\AI\\RunaAI-Next-Candidate\\m1-home-runtime-tls')+'\\'+id;
 return {receipt:{schemaVersion:'runaai-tls-enrollment-operation/v1',mode:action,enrollmentId:id,host:host==='home'?'RUNA-HOME':'RUNA-CONTROL',passed:true,
  publicFile:publicName?root+'\\'+publicName:null,publicFileSha256:value?.sha256??null,enrollment:action==='ControlImport'?imported:null,privateValuesIncluded:false,activated:false},
  publicPacketBase64:value?.publicPacket.toString('base64')??null};
}
test('offline package contains only the six raw source files and separate observed host runtime pins',()=>{
 const value=context();assert.deepEqual(Object.keys(value.descriptor.hosts).sort(),['control','home']);
 for(const host of ['home','control']){
  assert.deepEqual(readdirSync(path.join(value.local,host)).sort(),[...TLS_ENROLLMENT_SOURCE_FILES,'package.json'].sort());
  const manifest=value.packets[host].manifest;assert.equal(manifest.enrollmentId,id);
  assert.notEqual(value.packets.home.manifest.nodeSha256,value.packets.control.manifest.nodeSha256);
  assert.notEqual(value.packets.home.manifest.opensslSha256,value.packets.control.manifest.opensslSha256);
 }
 assert.equal(prepared.activated,false);assert.doesNotMatch(readFileSync(prepared.descriptorFile,'utf8'),/PRIVATE KEY/);
 assert.throws(()=>prepareTlsOperator({outputDirectory:value.local,enrollmentId:id}),/tls-prepare-output/);
});
test('descriptor, source bytes, and linked source paths fail before any SSH operation',()=>{
 assert.throws(()=>loadTlsOperator(prepared.descriptorFile,'f'.repeat(64)),/tls-descriptor-drift/);
 const other=prepareTlsOperator({outputDirectory:path.join(base,'bad-packet'),enrollmentId:'e'.repeat(32)});
 const file=path.join(base,'bad-packet','home','tls-primitives.mjs'),original=readFileSync(file);writeFileSync(file,Buffer.concat([original,Buffer.from('\n// drift')]));
 let dispatched=0;assert.throws(()=>runTlsOperator({descriptorFile:other.descriptorFile,expectedDescriptor:other.descriptorSha256,action:'UploadHome',execute:()=>{dispatched++;}}),/tls-source-drift/);assert.equal(dispatched,0);
 writeFileSync(file,original);linkSync(file,path.join(base,'alias'));assert.throws(()=>loadTlsOperator(other.descriptorFile,other.descriptorSha256),/tls-operator-file/);
});
test('strict public transfer refuses private material, unknown fields, duplicate keys and foreign identity',()=>{
 for(const[mode,value]of Object.entries({HomeOffer:offer,ControlRequest:request,HomeSign:issued})){
  assert.equal(validateTlsPublicTransfer(mode,value.publicPacket,value.sha256,id).enrollmentId,id);
  const extra=packet({...JSON.parse(value.publicPacket),privateKey:'-----BEGIN PRIVATE KEY-----'});
  assert.throws(()=>validateTlsPublicTransfer(mode,extra,sha(extra),id));
  const duplicate=Buffer.from(value.publicPacket.toString().replace('{','{"\\u0065nrollmentId":"'+id+'",'));
  assert.throws(()=>validateTlsPublicTransfer(mode,duplicate,sha(duplicate),id),/tls-public-duplicate-key/);
  assert.throws(()=>validateTlsPublicTransfer(mode,value.publicPacket,'0'.repeat(64),id),/tls-public-pin/);
  assert.throws(()=>validateTlsPublicTransfer(mode,value.publicPacket,value.sha256,'f'.repeat(32)),/tls-public-id/);
 }
 const privateCsr=packet({...JSON.parse(request.publicPacket),csrPem:'-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----\n'});
 assert.throws(()=>validateTlsPublicTransfer('ControlRequest',privateCsr,sha(privateCsr),id),/tls-public-request/);
});
test('all remote commands use fixed host context, create-only files and no lifecycle authority',()=>{
 const value=context();
 for(const mode of ['UploadHome','UploadControl']){
  const operation=tlsRemoteCommand(value,mode);assert.match(operation.command,/FileMode\]::CreateNew/);
  assert.match(operation.command,/SetAccessRuleProtection\(\$true,\$false\)/);assert.match(operation.command,/Get-FileHash/);
  assert.doesNotMatch(operation.command,/Register-ScheduledTask|Start-Process|server start|netsh|Remove-Item|PRIVATE KEY/i);
  assert.deepEqual(Object.keys(JSON.parse(operation.input)).sort(),[...TLS_ENROLLMENT_SOURCE_FILES,'package.json'].sort());
 }
 assert.throws(()=>tlsRemoteCommand(value,'UploadOther'),/tls-operator-action/);
});
test('transport driver retains exact public responses and follows all four steps without private key transport',()=>{
 for(const mode of ['HomeOffer','ControlRequest','HomeSign','ControlImport']){
  let calls=0;
  const result=runTlsOperator({descriptorFile:prepared.descriptorFile,expectedDescriptor:prepared.descriptorSha256,action:mode,
   execute:(exe,args,options)=>{
    calls++;assert.equal(exe,'ssh.exe');assert.equal(options.windowsHide,true);assert.equal(options.timeout,60000);
    assert.equal(args[4],mode.startsWith('Home')?'runa-control-wsl-codex':'runa-control');
    if(options.input){const input=Buffer.from(options.input.toString(),'base64');assert.doesNotMatch(input.toString(),/PRIVATE KEY/);assert.ok(input.length<=32768);}
    return packet(response(mode));
   }});
  assert.equal(calls,1);assert.equal(result.result.activated,false);assert.equal(result.rawSha256,sha(packet(response(mode))));
  assert.deepEqual(readFileSync(result.rawFile),packet(response(mode)));
  assert.throws(()=>runTlsOperator({descriptorFile:prepared.descriptorFile,expectedDescriptor:prepared.descriptorSha256,action:mode,execute:()=>assert.fail('must not repeat')}),/tls-operator-result-exists/);
 }
});
test('invalid remote envelope is never retained or silently retried',()=>{
 const other=prepareTlsOperator({outputDirectory:path.join(base,'invalid-envelope'),enrollmentId:id});let calls=0;
 assert.throws(()=>runTlsOperator({descriptorFile:other.descriptorFile,expectedDescriptor:other.descriptorSha256,action:'HomeOffer',
  execute:()=>{calls++;return packet({...response('HomeOffer'),privateKey:'refused'});}}),/tls-operation-envelope/);
 assert.equal(calls,1);assert.equal(existsSync(path.join(base,'invalid-envelope','HomeOffer-public.json')),false);
 assert.equal(existsSync(path.join(base,'invalid-envelope','HomeOffer-response.json')),false);
});
test('generated upload and enrollment commands parse in actual Windows PowerShell5 without executing them',{skip:process.platform!=='win32'},()=>{
 const lengths=[];
 for(const action of ['UploadHome','UploadControl','HomeOffer','ControlRequest','HomeSign','ControlImport']){
  const source=tlsRemoteCommand(context(),action).command;
  const encoded=Buffer.from(source,'utf16le').toString('base64'),remote='powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand '+encoded;
  lengths.push({action,rawScriptChars:source.length,encodedChars:encoded.length,remoteChars:remote.length,
   nestedHomeChars:action.includes('Home')||action==='HomeSign'?remote.length+'ssh -o ClearAllForwardings=yes runa-home-codex '.length:null});
  const script=`$ErrorActionPreference='Stop';$source=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(source).toString('base64')}'));$tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors);if($errors.Count-ne0){throw ($errors.Message-join';')};'passed'`;
  const result=execFileSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
   {encoding:'utf8',timeout:10000,windowsHide:true,maxBuffer:32768});assert.match(result,/passed/);
 }
 console.log('TLS direct-command length baseline '+JSON.stringify(lengths));
});
