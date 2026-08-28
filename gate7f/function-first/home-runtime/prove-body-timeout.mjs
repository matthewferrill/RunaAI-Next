import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

if(process.argv.length!==3)throw Error('usage: prove-body-timeout.mjs NEW_OUTPUT_DIRECTORY');
const output=path.resolve(process.argv[2]);mkdirSync(output);
const root=fileURLToPath(new URL('.',import.meta.url)),hash=value=>createHash('sha256').update(value).digest('hex');
const files=['proxy.mjs','body-timeout.test.mjs','runtime.test.mjs','tls-proxy.test.mjs'];
const pins=files.map(file=>{const bytes=readFileSync(path.join(root,file));return{file,bytes:bytes.length,sha256:hash(bytes)};});
const startedAt=new Date().toISOString();
const run=spawnSync(process.execPath,['--test',...files.filter(file=>file.endsWith('.test.mjs')).map(file=>path.join(root,file))],
  {cwd:root,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
for(const [filename,text] of [['tests.tap',run.stdout??''],['tests.stderr.txt',run.stderr??'']])writeFileSync(path.join(output,filename),text,{flag:'wx'});
const proof={schemaVersion:'runaai-body-timeout-local-proof/v1',startedAt,finishedAt:new Date().toISOString(),pins,
  nodeVersion:process.version,nodeSha256:hash(readFileSync(process.execPath)),exitCode:run.status,error:run.error?.code??null,
  tapSha256:hash(run.stdout??''),stderrSha256:hash(run.stderr??''),realModelsLoaded:0,homeContacted:false,controlContacted:false,
  productionChanged:false,passed:run.status===0&&!run.error};
writeFileSync(path.join(output,'proof.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(proof));process.exitCode=proof.passed?0:1;
