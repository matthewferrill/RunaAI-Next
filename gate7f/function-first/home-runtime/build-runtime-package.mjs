import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {OPERATOR_FILES,validateInstallation} from './runtime-installation.mjs';
import {sha,demand} from './contracts.mjs';

/** Build source and non-secret pins only. The caller independently grades the full functional
 * campaign/controls and supplies its selected single profile; this builder never chooses a winner.
 * TLS private keys are enrolled separately on their owning hosts, never bundled or printed. */
export function buildRuntimePackage(input,{repository=resolve(dirname(fileURLToPath(import.meta.url)),'../../..')}={}){
  demand(input&&Object.keys(input).sort().join()==='operatorPins,profile,tlsPins','package-input');
  const base=resolve(repository,'gate7f/function-first');const codeFiles={};
  const material=new Map(OPERATOR_FILES.map(file=>[file,readFileSync(resolve(base,file))]));
  for(const[file,bytes]of material)codeFiles[file]=sha(bytes);
  const config={schemaVersion:'runaai-qualified-home-installation/v1',installationId:sha(JSON.stringify({input,codeFiles})),profile:input.profile,
    operatorPins:{...input.operatorPins,observationScriptSha256:codeFiles['home-runtime/Observe-HomeRuntime.ps1']},tlsPins:input.tlsPins,codeFiles};
  validateInstallation(config);const bytes=Buffer.from(JSON.stringify(config,null,2)+'\n');
  const output=resolve(repository,'artifacts/m1-home-runtime',config.installationId);mkdirSync(output,{recursive:true});
  // Create-only leaves a previous package intact and never silently reseals it.
  writeFileSync(resolve(output,'installation.json'),bytes,{flag:'wx'});
  for(const[file,bytes]of material){const destination=resolve(output,'code',file);mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,bytes,{flag:'wx'});}
  return {output,installationId:config.installationId,installationSha256:sha(bytes),privateMaterialIncluded:false,activated:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(buildRuntimePackage(JSON.parse(readFileSync(resolve(process.argv[2]))))));
