// Explicit read-only transport proof: no package staging, enrollment, key/config read, model,
// listener, service or task operation. Home mode is reserved for a between-campaign window.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {tlsTransportRequest} from './tls-enrollment-operator.mjs';
import {demand,sha} from './tls-primitives.mjs';
const [host,...extra]=process.argv.slice(2);demand(['home','control'].includes(host)&&extra.length===0,'tls-transport-proof-arguments');
const output=path.join(import.meta.dirname,'evidence','20260828-tls-transport-'+host+'.json');demand(!existsSync(output),'tls-transport-proof-exists');
const expectedHost=host==='home'?'RUNA-HOME':'RUNA-CONTROL',body=Buffer.from('synthetic-public-transfer-\u03c0\nsecond-line');
const command=`if($env:COMPUTERNAME-cne'${expectedHost}'){throw 'tls-proof-host'};$body=[Console]::In.ReadToEnd();`+
 "[Console]::Out.Write((@{schemaVersion='runaai-tls-read-only-transport/v1';host=$env:COMPUTERNAME;body=$body;readOnly=$true;privateValuesIncluded=$false}|ConvertTo-Json -Compress))";
const transport=tlsTransportRequest({host,command,input:body});
const raw=execFileSync('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes',host==='home'?'runa-control-wsl-codex':'runa-control',transport.nested],
 {input:transport.input,timeout:15000,maxBuffer:8192,windowsHide:true});
const result=JSON.parse(raw);demand(result.schemaVersion==='runaai-tls-read-only-transport/v1'&&result.host===expectedHost&&result.body===body.toString()
 &&result.readOnly===true&&result.privateValuesIncluded===false,'tls-transport-proof-result');
const proof={schemaVersion:'runaai-tls-transport-proof/v1',observedAt:new Date().toISOString(),host:expectedHost,
 operatorSha256:sha(readFileSync(path.join(import.meta.dirname,'tls-enrollment-operator.mjs'))),scriptSha256:transport.scriptSha256,
 remoteCommandChars:transport.remote.length,nestedCommandChars:transport.nested.length,maximumWrappedChars:transport.maximumWrappedChars,
 inputSha256:sha(body),rawResponseBase64:raw.toString('base64'),rawResponseSha256:sha(raw),passed:true,readOnly:true,
 modelCalled:false,enrollmentPerformed:false,privateValuesIncluded:false};
const bytes=Buffer.from(JSON.stringify(proof,null,2)+'\n');writeFileSync(output,bytes,{flag:'wx'});
process.stdout.write(JSON.stringify({output,sha256:sha(bytes),proof})+'\n');
