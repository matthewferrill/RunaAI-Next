import {readFileSync,writeFileSync,mkdirSync,lstatSync,existsSync} from 'node:fs';
import {randomBytes,X509Certificate} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {demand,sha} from './tls-primitives.mjs';
import {TLS_ENROLLMENT_SOURCE_FILES,validateTlsEnrollmentSeal} from './tls-enrollment-cli.mjs';
import {validateHomeTlsOffer} from './tls-enrollment.mjs';

const HASH=/^[a-f0-9]{64}$/,ID=/^[a-f0-9]{32}$/;
const directory=path.dirname(fileURLToPath(import.meta.url));
const HOSTS=Object.freeze({
 home:{host:'RUNA-HOME',node:'C:\\Program Files\\nodejs\\node.exe',
  nodeSha256:'923a41f268ab49ede2e3363fbdd9e790609e385c6f3ca880b4ee9a56a8133e5a',
  opensslSha256:'6c2e01defbbeb057ee5cd2f69396363c0e7a0ce90df900c95072139fec7ce757'},
 control:{host:'RUNA-CONTROL',node:'C:\\AI\\RunaAI-Next-Candidate\\releases\\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc\\runtime\\node.exe',
  nodeSha256:'bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb',
  opensslSha256:'78340fb01dea2df5caab73dcf28833b31329226a4c9e02f717f1d399592265b9'}
});
const MODES=Object.freeze({HomeOffer:{host:'home',previous:null,public:'public-offer.json'},
 ControlRequest:{host:'control',previous:'HomeOffer',public:'public-request.json'},
 HomeSign:{host:'home',previous:'ControlRequest',public:'public-certificate.json'},
 ControlImport:{host:'control',previous:'HomeSign',public:null}});
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const write=(file,raw)=>writeFileSync(file,raw,{flag:'wx'});
function plain(file,maximum){
 demand(path.resolve(file)===file,'tls-operator-path');
 for(let current=file;current!==path.dirname(current);current=path.dirname(current))demand(!lstatSync(current).isSymbolicLink(),'tls-operator-link');
 const stat=lstatSync(file);demand(stat.isFile()&&stat.nlink===1&&stat.size<=maximum,'tls-operator-file');return readFileSync(file);
}
function exact(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys;}
function flatPacket(raw,pin){
 demand(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=32768&&HASH.test(pin)&&sha(raw)===pin,'tls-public-pin');
 const text=new TextDecoder('utf8',{fatal:true}).decode(raw),value=JSON.parse(text),keys=new Set();
 for(const token of text.matchAll(/"(?:\\[\s\S]|[^"\\])*"/g)){
  if(!/^\s*:/.test(text.slice(token.index+token[0].length)))continue;
  const key=JSON.parse(token[0]);demand(!keys.has(key),'tls-public-duplicate-key');keys.add(key);
 }
 demand(value&&Object.values(value).every(item=>typeof item==='string'),'tls-public-flat');return value;
}
/** Only public CSR/certificate envelopes may cross hosts or be retained by this operator. */
export function validateTlsPublicTransfer(mode,raw,pin,enrollmentId){
 demand(MODES[mode]?.public&&ID.test(enrollmentId),'tls-public-mode');const value=flatPacket(raw,pin);
 demand(value.enrollmentId===enrollmentId,'tls-public-id');
 if(mode==='HomeOffer')validateHomeTlsOffer(raw,pin);
 if(mode==='ControlRequest')demand(exact(value,'csrPem,csrSha256,enrollmentId,homeOfferSha256,publicKeySha256,schemaVersion')
  &&value.schemaVersion==='runaai-control-tls-request/v1'&&HASH.test(value.homeOfferSha256)&&HASH.test(value.publicKeySha256)
  &&value.csrPem.length<=8192&&/^-----BEGIN CERTIFICATE REQUEST-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE REQUEST-----\r?\n?$/.test(value.csrPem)
  &&sha(value.csrPem)===value.csrSha256,'tls-public-request');
 if(mode==='HomeSign'){
  demand(exact(value,'clientPem,clientSha256,controlRequestSha256,enrollmentId,homeOfferSha256,schemaVersion')
   &&value.schemaVersion==='runaai-home-tls-certificate/v1'&&HASH.test(value.homeOfferSha256)&&HASH.test(value.controlRequestSha256)
   &&value.clientPem.length<=8192&&/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\r?\n?$/.test(value.clientPem),'tls-public-certificate');
  const cert=new X509Certificate(value.clientPem);demand(!cert.ca&&sha(cert.raw)===value.clientSha256,'tls-public-certificate-pin');
 }
 return value;
}
function remoteRoot(host,id,pin){return host==='home'?'C:\\Users\\codex-audit\\AppData\\Local\\RunaRuntimePackages\\'+pin:
 'C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-home-tls-'+id;}
function enrollmentRoot(host,id){return (host==='home'?'C:\\AI\\RunaAI-Next-HomeRuntime-Enrollment':'C:\\AI\\RunaAI-Next-Candidate\\m1-home-runtime-tls')+'\\'+id;}

/** Offline only. Raw code bytes are copied into two fixed, independently pinned host packets.
 * It creates no key, host directory, listener, task, trust-store entry or runtime setting. */
export function prepareTlsOperator({outputDirectory,enrollmentId=randomBytes(16).toString('hex'),sourceDirectory=directory}){
 demand(ID.test(enrollmentId)&&path.resolve(outputDirectory)===outputDirectory&&!existsSync(outputDirectory),'tls-prepare-output');
 for(let current=path.dirname(outputDirectory);current!==path.dirname(current);current=path.dirname(current))
  demand(lstatSync(current).isDirectory()&&!lstatSync(current).isSymbolicLink(),'tls-prepare-parent');
 const bytes=Object.fromEntries(TLS_ENROLLMENT_SOURCE_FILES.map(name=>[name,plain(path.join(sourceDirectory,name),2097152)]));
 const sourceFiles=Object.fromEntries(Object.entries(bytes).map(([name,raw])=>[name,sha(raw)]));
 mkdirSync(outputDirectory);const hosts={};
 for(const host of ['home','control']){
  const pin=HOSTS[host],manifest={schemaVersion:'runaai-tls-enrollment-package/v1',enrollmentId,host:pin.host,
   nodeSha256:pin.nodeSha256,opensslSha256:pin.opensslSha256,sourceFiles};validateTlsEnrollmentSeal(manifest);
  const raw=json(manifest),sealSha256=sha(raw),local=path.join(outputDirectory,host);mkdirSync(local);
  for(const [name,data]of Object.entries({...bytes,'package.json':raw}))write(path.join(local,name),data);
  hosts[host]={sealSha256,root:remoteRoot(host,enrollmentId,sealSha256)};
 }
 const descriptor={schemaVersion:'runaai-tls-operator/v1',enrollmentId,hosts,
  operatorSha256:sha(plain(fileURLToPath(import.meta.url),2097152))},raw=json(descriptor);
 const file=path.join(outputDirectory,'descriptor.json');write(file,raw);
 return {descriptorFile:file,descriptorSha256:sha(raw),enrollmentId,activated:false,privateValuesIncluded:false};
}
export function loadTlsOperator(descriptorFile,expectedDescriptor){
 demand(HASH.test(expectedDescriptor),'tls-descriptor-pin');const raw=plain(descriptorFile,8192);demand(sha(raw)===expectedDescriptor,'tls-descriptor-drift');
 const value=JSON.parse(raw);demand(exact(value,'enrollmentId,hosts,operatorSha256,schemaVersion')&&value.schemaVersion==='runaai-tls-operator/v1'
  &&ID.test(value.enrollmentId)&&exact(value.hosts,'control,home')&&HASH.test(value.operatorSha256),'tls-descriptor-schema');
 demand(sha(plain(fileURLToPath(import.meta.url),2097152))===value.operatorSha256,'tls-operator-source-drift');
 const local=path.dirname(descriptorFile),packets={};
 for(const host of ['home','control']){
  const entry=value.hosts[host];demand(exact(entry,'root,sealSha256')&&HASH.test(entry.sealSha256)
   &&entry.root===remoteRoot(host,value.enrollmentId,entry.sealSha256),'tls-descriptor-host');
  const manifestRaw=plain(path.join(local,host,'package.json'),8192);demand(sha(manifestRaw)===entry.sealSha256,'tls-seal-drift');
  const manifest=validateTlsEnrollmentSeal(JSON.parse(manifestRaw)),pins=HOSTS[host];
  demand(manifest.enrollmentId===value.enrollmentId&&manifest.host===pins.host&&manifest.nodeSha256===pins.nodeSha256
   &&manifest.opensslSha256===pins.opensslSha256,'tls-host-runtime-pin');
  const files={'package.json':manifestRaw.toString('base64')};
  for(const [name,pin]of Object.entries(manifest.sourceFiles)){
   const data=plain(path.join(local,host,name),2097152);demand(sha(data)===pin,'tls-source-drift');files[name]=data.toString('base64');
   demand(sha(plain(path.join(directory,name),2097152))===pin,'tls-operator-dependency-drift');
  }packets[host]={files,manifest};
 }return {descriptor:value,local,packets};
}

// The remote wrapper itself is fixed operator code. No user/model shell fragments are accepted.
// Package ACLs are protected before bytes are staged. Existing paths are always refused.
const psPrelude="$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';Set-StrictMode -Version Latest;"+
 "$sy=[Security.Principal.SecurityIdentifier]::new('S-1-5-18');$ba=[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544');"+
 "function Plain([string]$p){for($i=$p;$i;$i=[IO.Path]::GetDirectoryName($i)){if((Test-Path -LiteralPath $i)-and((Get-Item -LiteralPath $i -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'tls-link'}}};"+
 "function Secure([string]$p){$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($ba);foreach($sid in @($sy,$ba)){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};Set-Acl -LiteralPath $p -AclObject $acl};"+
 "function Check([string]$p){Plain $p;$acl=Get-Acl -LiteralPath $p;if(-not$acl.AreAccessRulesProtected-or$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value-notin@($sy.Value,$ba.Value)){throw 'tls-package-acl'};$rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));if($rules.Count-ne2-or(($rules.IdentityReference.Value|Sort-Object)-join',')-cne(($sy.Value,$ba.Value|Sort-Object)-join',')){throw 'tls-package-acl'};foreach($rule in $rules){if($rule.IsInherited-or$rule.AccessControlType-ne'Allow'-or$rule.FileSystemRights-ne'FullControl'-or$rule.InheritanceFlags-ne'ContainerInherit,ObjectInherit'-or$rule.PropagationFlags-ne'None'){throw 'tls-package-acl'}}};"+
 "function Put([string]$file,[byte[]]$bytes){if($bytes.Length-gt2097152){throw 'tls-transfer-cap'};$s=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$s.Write($bytes,0,$bytes.Length);$s.Flush($true)}finally{$s.Dispose()}};";
export function tlsRemoteCommand(context,action){
 const {descriptor}=context,host=action.startsWith('Upload')?action==='UploadHome'?'home':'control':MODES[action]?.host;
 demand(host&&(['UploadHome','UploadControl'].includes(action)||MODES[action]),'tls-operator-action');
 const entry=descriptor.hosts[host],pins=HOSTS[host],id=descriptor.enrollmentId,root=entry.root;
 let command=psPrelude+`if($env:COMPUTERNAME-cne'${pins.host}'){throw 'tls-host'};$root='${root}';Plain $root;`;
 let input;
 if(action.startsWith('Upload')){
  input=json(context.packets[host].files);
  command+=`if(Test-Path -LiteralPath $root){throw 'tls-package-exists'};[void](New-Item -ItemType Directory -Path $root);Secure $root;Check $root;`+
   `$code=$root+'\\code';[void](New-Item -ItemType Directory -Path $code);Secure $code;Check $code;`+
   `$raw=[Console]::In.ReadToEnd();if($raw.Length-gt4194304){throw 'tls-transfer-cap'};$packet=$raw|ConvertFrom-Json;`+
   `$allowed=@(${[...TLS_ENROLLMENT_SOURCE_FILES,'package.json'].map(name=>"'"+name+"'").join(',')});`+
   `if((($packet.PSObject.Properties.Name|Sort-Object)-join',')-cne(($allowed|Sort-Object)-join',')){throw 'tls-transfer-fields'};`+
   `foreach($item in $packet.PSObject.Properties){$target=if($item.Name-ceq'package.json'){$root+'\\package.json'}else{$code+'\\'+$item.Name};Put $target ([Convert]::FromBase64String($item.Value))};`;
 }else{
  command+='Check $root;Check ($root+\'\\code\');';
  if(MODES[action].previous){
   const previous=MODES[action].previous,receipt=JSON.parse(plain(path.join(context.local,previous+'-result.json'),32768));
   demand(receipt?.passed===true&&receipt.mode===previous&&receipt.enrollmentId===id&&HASH.test(receipt.publicFileSha256),'tls-previous-receipt');
   input=plain(path.join(context.local,previous+'-public.json'),32768);validateTlsPublicTransfer(previous,input,receipt.publicFileSha256,id);
   command+=`$encoded=[Console]::In.ReadToEnd();if($encoded.Length-gt65536){throw 'tls-public-cap'};$bytes=[Convert]::FromBase64String($encoded);`+
    `$inputFile=$root+'\\public-${action}.json';Put $inputFile $bytes;`;
   input=Buffer.from(input.toString('base64'));
   context.inputSha256=receipt.publicFileSha256;
  }
 }
 command+=`if((Get-FileHash -LiteralPath ($root+'\\package.json') -Algorithm SHA256).Hash.ToLowerInvariant()-cne'${entry.sealSha256}'){throw 'tls-package-drift'};`;
 for(const [name,pin]of Object.entries(context.packets[host].manifest.sourceFiles))command+=
  `if((Get-FileHash -LiteralPath ($root+'\\code\\${name}') -Algorithm SHA256).Hash.ToLowerInvariant()-cne'${pin}'){throw 'tls-source-drift'};`;
 command+=`if((Get-FileHash -LiteralPath '${pins.node}' -Algorithm SHA256).Hash.ToLowerInvariant()-cne'${pins.nodeSha256}'){throw 'tls-node-drift'};`;
 if(action.startsWith('Upload'))command+=`@{schemaVersion='runaai-tls-package-stage/v1';host='${pins.host}';enrollmentId='${id}';sealSha256='${entry.sealSha256}';passed=$true;activated=$false;privateValuesIncluded=$false}|ConvertTo-Json -Compress`;
 else{
  const args=MODES[action].previous?` ($root+'\\public-${action}.json') '${context.inputSha256}'`:'';
  command+=`$result=& '${pins.node}' ($root+'\\code\\tls-enrollment-cli.mjs') '${action}' ($root+'\\package.json') '${entry.sealSha256}'${args};`+
   `if($LASTEXITCODE-ne0){throw 'tls-enrollment-unconfirmed'};$receipt=$result|ConvertFrom-Json;$public=$null;`;
  if(MODES[action].public){
   const publicPath=enrollmentRoot(host,id)+'\\'+MODES[action].public;
   command+=`$file='${publicPath}';Plain $file;$bytes=[IO.File]::ReadAllBytes($file);if($bytes.Length-gt32768){throw 'tls-public-cap'};$public=[Convert]::ToBase64String($bytes);`;
  }
  command+='@{receipt=$receipt;publicPacketBase64=$public}|ConvertTo-Json -Depth 8 -Compress';
 }
 return {host,command,input};
}
/** Windows SSH executes a remote command through cmd.exe, whose8191-character limit is
 * smaller than CreateProcess. Only this short bootstrap goes in EncodedCommand. Its literal
 * SHA256 binds the exact trusted operator script carried over a bounded two-field stdin
 * envelope. No temporary remote script is needed and no private key enters this transport. */
export function tlsTransportRequest(request){
 demand(request&&['home','control'].includes(request.host)&&typeof request.command==='string'
  &&request.command.length>0&&request.command.length<=65536
  &&(request.input===undefined||Buffer.isBuffer(request.input)&&request.input.length<=2097152),'tls-transport-input');
 const script=Buffer.from(request.command,'utf8'),body=request.input??Buffer.alloc(0);
 const input=Buffer.from(script.toString('base64')+'\n'+body.toString('base64')+'\n');
 demand(input.length<=4194304,'tls-transport-cap');
 const bootstrap="$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';Set-StrictMode -Version Latest;[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);"+
  "$text=[Text.StringBuilder]::new();$block=New-Object char[] 4096;while(($count=[Console]::In.Read($block,0,$block.Length))-gt0){if($text.Length+$count-gt4194304){throw 'tls-bootstrap-cap'};[void]$text.Append($block,0,$count)};"+
  "$parts=$text.ToString().Split([char]10);if($parts.Count-ne3-or$parts[2]-cne''-or$parts[0]-cnotmatch'^[A-Za-z0-9+/=]+$'-or$parts[1]-cnotmatch'^[A-Za-z0-9+/=]*$'){throw 'tls-bootstrap-envelope'};"+
  "$code=[Convert]::FromBase64String($parts[0]);$data=[Convert]::FromBase64String($parts[1]);if($code.Length-gt65536-or$data.Length-gt2097152-or[Convert]::ToBase64String($code)-cne$parts[0]-or[Convert]::ToBase64String($data)-cne$parts[1]){throw 'tls-bootstrap-encoding'};"+
  "$hasher=[Security.Cryptography.SHA256]::Create();try{$digest=([BitConverter]::ToString($hasher.ComputeHash($code))).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()};"+
  `if($digest-cne'${sha(script)}'){throw 'tls-bootstrap-script-pin'};`+
  "$utf8=[Text.UTF8Encoding]::new($false,$true);$source=$utf8.GetString($code);$reader=[IO.StringReader]::new($utf8.GetString($data));[Console]::SetIn($reader);& ([scriptblock]::Create($source))";
 const encoded=Buffer.from(bootstrap,'utf16le').toString('base64');
 const remote='powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand '+encoded;
 const nested=request.host==='home'?'ssh -o ClearAllForwardings=yes runa-home-codex '+remote:remote;
 // Include both command-processor and the outer Omen invocation overhead conservatively.
 demand(nested.length+256<=6500,'tls-transport-command-length');
 return {bootstrap,encoded,remote,nested,input,scriptSha256:sha(script),maximumWrappedChars:nested.length+256};
}
export function runTlsOperator({descriptorFile,expectedDescriptor,action,execute=execFileSync}){
 const context=loadTlsOperator(descriptorFile,expectedDescriptor),request=tlsRemoteCommand(context,action);
 const output=path.join(context.local,action+'-result.json');demand(!existsSync(output),'tls-operator-result-exists');
 const transport=tlsTransportRequest(request);
 const args=['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes',request.host==='home'?'runa-control-wsl-codex':'runa-control',
  transport.nested];
 const raw=execute('ssh.exe',args,{input:transport.input,timeout:60000,maxBuffer:131072,windowsHide:true});
 const value=JSON.parse(raw),id=context.descriptor.enrollmentId;
 let receipt,publicRaw=null;
 if(action.startsWith('Upload')){
  receipt=value;demand(exact(receipt,'activated,enrollmentId,host,passed,privateValuesIncluded,schemaVersion,sealSha256')
   &&receipt.schemaVersion==='runaai-tls-package-stage/v1'&&receipt.sealSha256===context.descriptor.hosts[request.host].sealSha256,'tls-stage-receipt');
 }else{
  demand(exact(value,'publicPacketBase64,receipt'),'tls-operation-envelope');receipt=value.receipt;
  demand(exact(receipt,'activated,enrollment,enrollmentId,host,mode,passed,privateValuesIncluded,publicFile,publicFileSha256,schemaVersion')
   &&receipt.schemaVersion==='runaai-tls-enrollment-operation/v1'&&receipt.mode===action,'tls-operation-receipt');
  if(MODES[action].public){
   demand(receipt.enrollment===null&&typeof value.publicPacketBase64==='string'&&/^[A-Za-z0-9+/=]+$/.test(value.publicPacketBase64)
    &&receipt.publicFile===enrollmentRoot(request.host,id)+'\\'+MODES[action].public,'tls-operation-public');
   publicRaw=Buffer.from(value.publicPacketBase64,'base64');demand(publicRaw.toString('base64')===value.publicPacketBase64,'tls-public-encoding');
   validateTlsPublicTransfer(action,publicRaw,receipt.publicFileSha256,id);
  }else{
   demand(value.publicPacketBase64===null&&receipt.publicFile===null&&receipt.publicFileSha256===null
    &&exact(receipt.enrollment,'activated,caSha256,clientCertificateSha256,clientExpiresAt,enrollmentId,privateMaterialIncluded,schemaVersion,serverCertificateSha256,serverName')
    &&receipt.enrollment.schemaVersion==='runaai-control-tls-enrollment/v1'&&receipt.enrollment.enrollmentId===id
    &&receipt.enrollment.serverName==='runa-home-m1.internal'&&receipt.enrollment.activated===false
    &&receipt.enrollment.privateMaterialIncluded===false&&['caSha256','clientCertificateSha256','serverCertificateSha256'].every(key=>HASH.test(receipt.enrollment[key])),
    'tls-import-receipt');
  }
 }
 demand(receipt.enrollmentId===id&&receipt.host===HOSTS[request.host].host&&receipt.passed===true
  &&receipt.activated===false&&receipt.privateValuesIncluded===false,'tls-result-boundary');
 if(publicRaw)write(path.join(context.local,action+'-public.json'),publicRaw);
 const rawFile=path.join(context.local,action+'-response.json');write(rawFile,raw);
 write(output,json(receipt));return {file:output,sha256:sha(json(receipt)),rawFile,rawSha256:sha(raw),result:receipt};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [action,descriptorFile,expectedDescriptor,...extra]=process.argv.slice(2);
 try{
  demand(extra.length===0,'tls-operator-arguments');let result;
  if(action==='Prepare'){
   demand(descriptorFile===undefined&&expectedDescriptor===undefined,'tls-prepare-arguments');const id=randomBytes(16).toString('hex');
   const outputDirectory=path.resolve(directory,'../../../artifacts/m1-readiness','tls-enrollment-'+id);
   result=prepareTlsOperator({outputDirectory,enrollmentId:id});
  }else result=runTlsOperator({descriptorFile,expectedDescriptor,action});
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(error){process.stderr.write(JSON.stringify({schemaVersion:'runaai-tls-operator-error/v1',
  errorCode:typeof error.message==='string'&&/^runtime-[a-z0-9-]+$/.test(error.message)?error.message:'tls-operator-unconfirmed',
  activated:false,privateValuesIncluded:false})+'\n');process.exitCode=1;}
}
