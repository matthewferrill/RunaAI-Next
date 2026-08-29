const {createHash}=require('node:crypto');
const {lstatSync,readFileSync,readdirSync,realpathSync,statSync}=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fail=code=>Object.assign(new Error(code),{code}),HASH=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const same=(left,right)=>left.toLowerCase()===right.toLowerCase();
function bytes(filename,maximum){const info=statSync(filename);if(!info.isFile()||info.size>maximum)throw fail('m1-control-bootstrap-file');return readFileSync(filename);}
const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>{if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number')return value;if(Array.isArray(value))return value.map(canonical);
  if(typeof value==='object'){const output={};for(const key of Object.keys(value).sort())output[key]=canonical(value[key]);return output;}throw fail('m1-control-bootstrap-artifact-manifest');};
function parse(raw){
  const names=['--owned-root','--manifest','--manifest-sha256','--source-identity-sha256','--source-archive-sha256','--source-commit'];
  if(raw.length!==12||raw.some(value=>typeof value!=='string'||/["\s&|<>^%!]/.test(value)))throw fail('m1-control-bootstrap-arguments');
  for(let index=0;index<names.length;index++)if(raw[index*2]!==names[index])throw fail('m1-control-bootstrap-arguments');
  const value={root:path.resolve(raw[1]),manifest:path.resolve(raw[3]),manifestSha256:raw[5],identitySha256:raw[7],archiveSha256:raw[9],sourceCommit:raw[11]};
  if(![value.manifestSha256,value.identitySha256,value.archiveSha256].every(item=>HASH.test(item))||!COMMIT.test(value.sourceCommit))throw fail('m1-control-bootstrap-arguments');
  return value;
}
function verifyArchive(root,filename,expectedSha256){
  const archive=bytes(filename,512*1024*1024);if(archive.length%512||sha(archive)!==expectedSha256)throw fail('m1-control-bootstrap-archive-pin');
  const seen=new Set();let offset=0,files=0,localPath=null;
  const field=value=>value.toString('utf8').replace(/\0.*$/s,'');
  while(offset+512<=archive.length){const header=archive.subarray(offset,offset+512);offset+=512;if(header.every(value=>value===0))break;
    const rawSize=field(header.subarray(124,136)).trim();if(!/^[0-7]+$/.test(rawSize))throw fail('m1-control-bootstrap-archive-format');
    const size=parseInt(rawSize,8),type=String.fromCharCode(header[156]||48);if(!Number.isSafeInteger(size)||size>64*1024*1024||offset+size>archive.length)throw fail('m1-control-bootstrap-archive-format');
    const body=archive.subarray(offset,offset+size);offset+=Math.ceil(size/512)*512;
    if(type==='g'||type==='x'){if(size>1048576)throw fail('m1-control-bootstrap-archive-format');for(const line of body.toString('utf8').split('\n').filter(Boolean)){
      const match=/^\d+ ([^=]+)=(.*)$/.exec(line);if(!match||!['comment','path','mtime','atime','ctime'].includes(match[1])||match[1]==='path'&&type!=='x')throw fail('m1-control-bootstrap-archive-pax');if(match[1]==='path')localPath=match[2];}continue;}
    const prefix=field(header.subarray(345,500)),entry=localPath??`${prefix?prefix+'/':''}${field(header.subarray(0,100))}`;localPath=null;
    if(!entry||/[\\:\x00-\x1f]/.test(entry)||entry.startsWith('/')||entry.split('/').some(part=>part==='..')||!['0','5'].includes(type))throw fail('m1-control-bootstrap-archive-entry');
    if(type==='5')continue;const key=entry.toLowerCase();if(seen.has(key))throw fail('m1-control-bootstrap-archive-duplicate');seen.add(key);
    const expected=path.resolve(root,entry),actual=realpathSync(expected),info=lstatSync(actual);if(!same(actual,expected)||!info.isFile()||info.isSymbolicLink()||info.size!==size||sha(bytes(actual,64*1024*1024))!==sha(body))throw fail('m1-control-bootstrap-source-drift');files++;
  }
  return files;
}
function verifyRelease(root,expectedDigest){
  root=realpathSync(root);const manifestPath=path.join(root,'artifact-files.json'),manifest=JSON.parse(bytes(manifestPath,128*1024*1024).toString('utf8'));
  if(!manifest||Object.keys(manifest).sort().join()!=='artifactDigest,entries,schemaVersion'||manifest.schemaVersion!=='runa2-gate6b-artifact/v1'||!HASH.test(manifest.artifactDigest)
    ||manifest.artifactDigest!==expectedDigest||!Array.isArray(manifest.entries))throw fail('m1-control-bootstrap-artifact-manifest');
  const base={schemaVersion:manifest.schemaVersion,entries:manifest.entries};if(sha(JSON.stringify(canonical(base)))!==manifest.artifactDigest)throw fail('m1-control-bootstrap-artifact-manifest');
  const retained=new Map();let previous='';for(const entry of manifest.entries){const segments=typeof entry?.path==='string'?entry.path.split('/'):[];
    if(!entry||Object.keys(entry).sort().join()!=='path,sha256,size'||!segments.length||segments.some(segment=>!segment||segment==='.'||segment==='..'||/[\x00-\x1f\x7f\\:]/.test(segment)||/[. ]$/.test(segment))
      ||entry.path==='artifact-files.json'||!Number.isSafeInteger(entry.size)||entry.size<0||!HASH.test(entry.sha256)||previous&&previous.localeCompare(entry.path)>=0)throw fail('m1-control-bootstrap-artifact-entry');
    previous=entry.path;const key=entry.path.toLowerCase();if(retained.has(key))throw fail('m1-control-bootstrap-artifact-entry');retained.set(key,entry);
  }
  let files=0;const visit=directory=>{for(const child of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const filename=path.join(directory,child.name),info=lstatSync(filename);
    if(info.isSymbolicLink())throw fail('m1-control-bootstrap-artifact-link');if(info.isDirectory()){visit(filename);continue;}if(!info.isFile())throw fail('m1-control-bootstrap-artifact-entry');
    const relative=path.relative(root,filename).split(path.sep).join('/');if(relative==='artifact-files.json')continue;const entry=retained.get(relative.toLowerCase());
    if(!entry||entry.path!==relative||entry.size!==info.size||entry.sha256!==sha(bytes(filename,512*1024*1024)))throw fail('m1-control-bootstrap-artifact-drift');retained.delete(relative.toLowerCase());files++;
  }};visit(root);if(retained.size)throw fail('m1-control-bootstrap-artifact-drift');return Object.freeze({artifactDigest:expectedDigest,fileCount:files,root});
}
async function main(){
  const parsed=parse(process.argv.slice(2)),root=realpathSync(parsed.root),fixedParent='C:\\AI\\RunaAI-Next-Candidate\\staging';
  if(!same(path.dirname(root),fixedParent)||!/^m1-task-native-[a-f0-9]{32}$/.test(path.basename(root)))throw fail('m1-control-bootstrap-root');
  const manifestPath=realpathSync(parsed.manifest),identityPath=realpathSync(path.join(root,'SOURCE-IDENTITY.json')),archivePath=realpathSync(path.join(root,'source.tar'));
  if(!same(manifestPath,path.join(root,'CONTROL-REGRESSION-INPUT.json')))throw fail('m1-control-bootstrap-manifest-path');
  const manifestRaw=bytes(manifestPath,1024*1024),identityRaw=bytes(identityPath,65536);if(sha(manifestRaw)!==parsed.manifestSha256||sha(identityRaw)!==parsed.identitySha256)throw fail('m1-control-bootstrap-input-pin');
  const manifest=JSON.parse(manifestRaw),identity=JSON.parse(identityRaw),identityKeys=Object.keys(identity).sort().join();
  if(identityKeys!=='caseBundleSha256,productionChanged,qdrantSha256,schemaVersion,sourceArchiveSha256,sourceCommit'||identity.schemaVersion!=='runaai-m1-source-identity/v1'||identity.sourceCommit!==parsed.sourceCommit||identity.sourceArchiveSha256!==parsed.archiveSha256||identity.productionChanged!==false)throw fail('m1-control-bootstrap-identity');
  if(manifest?.source?.commit!==parsed.sourceCommit||manifest.source.archiveSha256!==parsed.archiveSha256||manifest.source.extractedFiles!==verifyArchive(root,archivePath,parsed.archiveSha256))throw fail('m1-control-bootstrap-source');
  const fixedRelease='C:\\AI\\RunaAI-Next-Candidate\\releases\\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc',fixedArtifact='248aaee4f7855c83fe94a2855e156d2321dee3721c06535afbca87a3f3e86167',fixedNode='bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb';
  if(manifest?.dependencies?.releaseRoot!==fixedRelease||manifest.dependencies.artifactDigest!==fixedArtifact||manifest.dependencies.nodeVersion!=='v22.22.0'||manifest.dependencies.nodeSha256!==fixedNode)throw fail('m1-control-bootstrap-dependency-input');
  const release=verifyRelease(fixedRelease,fixedArtifact),modules=path.join(root,'node_modules'),modulesInfo=lstatSync(modules),expectedModules=realpathSync(path.join(release.root,'node_modules'));
  if(!modulesInfo.isSymbolicLink()||!same(realpathSync(modules),expectedModules)||!same(realpathSync(process.execPath),path.join(release.root,'runtime','node.exe'))||process.version!=='v22.22.0'||sha(bytes(process.execPath,128*1024*1024))!==fixedNode)throw fail('m1-control-bootstrap-dependency-binding');
  const allowed=['ComSpec','OS','PATH','PATHEXT','PSModulePath','SystemDrive','SystemRoot','WINDIR'];if(Object.keys(process.env).sort().join()!==allowed.sort().join())throw fail('m1-control-bootstrap-environment');
  const entry=path.join(root,'gate7f','function-first','acceptance','control-exact-regression-entry.mjs'),module=await import(pathToFileURL(entry).href);
  const result=await module.runOwnerEntry(['--owned-root',root,'--manifest',manifestPath,'--manifest-sha256',parsed.manifestSha256]);
  if(result.passed){if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);}else if(result.stdout&&result.errorCode==='m1-control-regression-run-failed')process.stdout.write(result.stdout);else process.stdout.write(JSON.stringify({errorCode:result.errorCode,
    childProcessId:result.childProcessId??null,stopAttempted:result.stopAttempted===true,stopProof:result.stopProof??null,postStopExceeded:result.postStopExceeded===true,
    modelsInvoked:false,protectedDataRead:false,productionChanged:false})+'\n');
  if(!result.passed)process.exitCode=1;
}
module.exports=Object.freeze({parse,verifyArchive,verifyRelease});
if(globalThis.__RUNA_CONTROL_BOOTSTRAP__===true)main().catch(error=>{process.stdout.write(JSON.stringify({errorCode:error.code??'m1-control-bootstrap-failed',modelsInvoked:false,protectedDataRead:false,productionChanged:false})+'\n');process.exitCode=1;});
