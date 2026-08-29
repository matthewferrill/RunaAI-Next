import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const HASH=/^[a-f0-9]{64}$/u,COMMIT=/^[a-f0-9]{40}$/u,ROOT=/^C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-[a-f0-9]{32}$/u;
const fail=code=>Object.assign(new Error(code),{code});
const sha=value=>createHash('sha256').update(value).digest('hex');
const quote=value=>`'${value.replaceAll("'","''")}'`;

export function parseInvocationArguments(raw){
  const names=['--owned-root','--manifest-sha256','--dispatcher-sha256','--bootstrap-sha256','--identity-sha256','--archive-sha256','--source-commit'];
  if(raw.length!==names.length*2||raw.some(value=>typeof value!=='string'||/[\r\n\0]/u.test(value)))throw fail('m1-control-invocation-arguments');
  const value={};for(let index=0;index<names.length;index++){if(raw[index*2]!==names[index])throw fail('m1-control-invocation-arguments');value[names[index]]=raw[index*2+1];}
  if(!ROOT.test(value['--owned-root'])||![value['--manifest-sha256'],value['--dispatcher-sha256'],value['--bootstrap-sha256'],value['--identity-sha256'],value['--archive-sha256']].every(item=>HASH.test(item))||!COMMIT.test(value['--source-commit']))throw fail('m1-control-invocation-arguments');
  return Object.freeze({root:value['--owned-root'],manifestSha256:value['--manifest-sha256'],dispatcherSha256:value['--dispatcher-sha256'],bootstrapSha256:value['--bootstrap-sha256'],
    identitySha256:value['--identity-sha256'],archiveSha256:value['--archive-sha256'],sourceCommit:value['--source-commit']});
}

export function buildInvocation(parsed,{dispatcherPath=path.join(import.meta.dirname,'Invoke-ControlExactRegression.ps1')}={}){
  const dispatcherBytes=readFileSync(dispatcherPath);if(dispatcherBytes.length>65536||sha(dispatcherBytes)!==parsed.dispatcherSha256)throw fail('m1-control-invocation-dispatcher-pin');
  const dispatcher=path.join(parsed.root,'gate7f','function-first','acceptance','Invoke-ControlExactRegression.ps1'),manifest=path.join(parsed.root,'CONTROL-REGRESSION-INPUT.json');
  const source=`$ErrorActionPreference='Stop'\n$dispatcher=${quote(dispatcher)}\n$bytes=[IO.File]::ReadAllBytes($dispatcher)\n$hash=[Security.Cryptography.SHA256]::Create()\ntry{$actual=([BitConverter]::ToString($hash.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}\nif($actual-cne${quote(parsed.dispatcherSha256)}){throw 'm1-control-preloader-dispatcher-pin'}\n$utf8=[Text.UTF8Encoding]::new($false,$true)\n$body=$utf8.GetString($bytes)\n$verified=[ScriptBlock]::Create($body)\n& $verified -OwnedRoot ${quote(parsed.root)} -ManifestPath ${quote(manifest)} -ExpectedManifestSha256 ${quote(parsed.manifestSha256)} -ExpectedBootstrapSha256 ${quote(parsed.bootstrapSha256)} -ExpectedIdentitySha256 ${quote(parsed.identitySha256)} -ExpectedArchiveSha256 ${quote(parsed.archiveSha256)} -ExpectedSourceCommit ${quote(parsed.sourceCommit)}\n`;
  return Object.freeze({schemaVersion:'runaai-m1-control-regression-invocation/v1',dispatcherSha256:parsed.dispatcherSha256,encodedCommand:Buffer.from(source,'utf16le').toString('base64'),
    powershellArguments:['-NoProfile','-NonInteractive','-EncodedCommand'],modelsInvoked:false,protectedDataRead:false,productionChanged:false});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{process.stdout.write(JSON.stringify(buildInvocation(parseInvocationArguments(process.argv.slice(2))))+'\n');}
  catch(error){process.stdout.write(JSON.stringify({errorCode:error.code??'m1-control-invocation-failed',modelsInvoked:false,protectedDataRead:false,productionChanged:false})+'\n');process.exitCode=1;}}
