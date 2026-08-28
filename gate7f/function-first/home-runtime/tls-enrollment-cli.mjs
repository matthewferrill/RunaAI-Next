import {readFileSync,lstatSync} from 'node:fs';
import {hostname} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {demand,sha} from './tls-primitives.mjs';
import {createHomeTlsEnrollment,createControlTlsEnrollment,issueControlTlsCertificate,importControlTlsCertificate} from './tls-enrollment.mjs';
const execute=promisify(execFile),HASH=/^[a-f0-9]{64}$/,ID=/^[a-f0-9]{32}$/;
export const TLS_ENROLLMENT_SOURCE_FILES=Object.freeze(['Runtime-Windows.ps1','Tls-Windows.ps1','Tls-Directory.ps1','tls-primitives.mjs','tls-enrollment.mjs','tls-enrollment-cli.mjs']);
const homeRoot='C:\\AI\\RunaAI-Next-HomeRuntime-Enrollment',controlRoot='C:\\AI\\RunaAI-Next-Candidate\\m1-home-runtime-tls';
const powershell='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const dir=path.dirname(fileURLToPath(import.meta.url));
function pinned(file,expected,maximum){
  demand(path.resolve(file)===file&&HASH.test(expected),'tls-package-path');
  for(let current=file;current!==path.dirname(current);current=path.dirname(current))demand(!lstatSync(current).isSymbolicLink(),'tls-package-link');
  const stat=lstatSync(file);demand(stat.isFile()&&stat.nlink===1&&stat.size<=maximum,'tls-package-file');
  const raw=readFileSync(file);demand(sha(raw)===expected,'tls-package-pin');return raw;
}
export function validateTlsEnrollmentSeal(value){
  demand(value&&Object.keys(value).sort().join()==='enrollmentId,host,nodeSha256,opensslSha256,schemaVersion,sourceFiles'
    &&value.schemaVersion==='runaai-tls-enrollment-package/v1'&&ID.test(value.enrollmentId)
    &&['RUNA-HOME','RUNA-CONTROL'].includes(value.host)&&HASH.test(value.nodeSha256)&&HASH.test(value.opensslSha256),'tls-package-schema');
  demand(value.sourceFiles&&Object.keys(value.sourceFiles).sort().join()===TLS_ENROLLMENT_SOURCE_FILES.toSorted().join()
    &&Object.values(value.sourceFiles).every(pin=>HASH.test(pin)),'tls-package-source-set');return value;
}
/** One explicit host operation. No import-time I/O, lifecycle, key generation or network. The
 * separate caller transfers public files only and supplies each full-byte pin independently. */
export async function enrollTls({mode,sealFile,expectedSeal,inputFile,inputSha256}){
  demand(process.platform==='win32'&&['HomeOffer','ControlRequest','HomeSign','ControlImport'].includes(mode),'tls-operation');
  const rawSeal=pinned(sealFile,expectedSeal,8192),seal=validateTlsEnrollmentSeal(JSON.parse(rawSeal));
  const host=hostname().toUpperCase();demand(host===seal.host&&mode.startsWith(host==='RUNA-HOME'?'Home':'Control'),'tls-operation-host');
  const packageRoot=path.dirname(sealFile),expectedRoot=host==='RUNA-HOME'?
    'C:\\Users\\codex-audit\\AppData\\Local\\RunaRuntimePackages\\'+expectedSeal:
    'C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-home-tls-'+seal.enrollmentId;
  demand(packageRoot===expectedRoot&&dir===path.join(packageRoot,'code'),'tls-package-location');
  for(const [name,pin] of Object.entries(seal.sourceFiles))pinned(path.join(dir,name),pin,2097152);
  pinned(process.execPath,seal.nodeSha256,150000000);
  const openssl='C:\\Program Files\\Git\\usr\\bin\\openssl.exe';pinned(openssl,seal.opensslSha256,4*1024*1024);
  let input=null;if(mode==='HomeOffer')demand(inputFile===undefined&&inputSha256===undefined,'tls-unexpected-input');
  else{demand(inputFile===path.join(packageRoot,'public-'+mode+'.json'),'tls-input-location');input=pinned(inputFile,inputSha256,32768);}
  const check=async action=>{
    const result=await execute(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(dir,'Tls-Directory.ps1'),
      '-Mode',action,'-EnrollmentId',seal.enrollmentId],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:8192,
        env:{...process.env,PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'}});
    const receipt=JSON.parse(result.stdout);demand(receipt.passed===true&&receipt.mode===action&&receipt.enrollmentId===seal.enrollmentId,'tls-directory-receipt');
  };
  await check('PrepareParent');
  const options={root:path.join(host==='RUNA-HOME'?homeRoot:controlRoot,seal.enrollmentId),enrollmentId:seal.enrollmentId,openssl,
    opensslSha256:seal.opensslSha256,secureDirectory:()=>check('SecureNew'),verifyDirectory:()=>check('Verify')};
  let result;
  if(mode==='HomeOffer')result=await createHomeTlsEnrollment(options);
  if(mode==='ControlRequest')result=await createControlTlsEnrollment(options,{homeOffer:input,expectedHomeOfferSha256:inputSha256});
  if(mode==='HomeSign')result=await issueControlTlsCertificate(options,{controlRequest:input,expectedControlRequestSha256:inputSha256});
  if(mode==='ControlImport')result=await importControlTlsCertificate(options,{certificatePacket:input,expectedCertificateSha256:inputSha256});
  await check('Verify');
  const publicFile=mode==='HomeOffer'?'public-offer.json':mode==='ControlRequest'?'public-request.json':mode==='HomeSign'?'public-certificate.json':null;
  return {schemaVersion:'runaai-tls-enrollment-operation/v1',mode,enrollmentId:seal.enrollmentId,host,passed:true,
    publicFile:publicFile?path.join(options.root,publicFile):null,publicFileSha256:result.sha256??null,
    enrollment:mode==='ControlImport'?result:null,privateValuesIncluded:false,activated:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [mode,sealFile,expectedSeal,inputFile,inputSha256,...extra]=process.argv.slice(2);
  try{demand(extra.length===0,'tls-arguments');process.stdout.write(JSON.stringify(await enrollTls({mode,sealFile,expectedSeal,inputFile,inputSha256}))+'\n');}
  catch(error){const known=typeof error.message==='string'&&/^runtime-[a-z0-9-]+$/.test(error.message)?error.message:'tls-enrollment-unconfirmed';
    process.stderr.write(JSON.stringify({schemaVersion:'runaai-tls-enrollment-error/v1',errorCode:known,privateValuesIncluded:false,activated:false})+'\n');process.exitCode=1;}
}
