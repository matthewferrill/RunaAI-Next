import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Create-only retention of this exact synthetic local experiment; no general
// import path, private record, model API or overwrite mode is accepted.
assert.equal(process.argv.length,2,'no arguments accepted');
const names=['evidence-wire-before-20260828.json','evidence-wire-after-20260828.json',
  'evidence-wire-final-20260828.json','evidence-wire-regression-20260828.tap',
  'evidence-wire-regression-final-20260828.tap','evidence-wire-native-regression-20260828.tap'];
const output=path.resolve('gate7f/function-first/acceptance/evidence/evidence-wire-20260828');
const files=[];for(const name of names){const bytes=await readFile(path.resolve('artifacts/runs',name));
  assert.ok(bytes.length<1024*1024);files.push({name,bytes,sha256:createHash('sha256').update(bytes).digest('hex')});}
const final=JSON.parse(files.find(f=>f.name==='evidence-wire-final-20260828.json').bytes);
assert.equal(final.modelCalled,false);assert.equal(final.productionChanged,false);assert.equal(final.listenerClosed,true);
assert.deepEqual(final.rows.map(r=>[r.mode,r.requestCount]),[['valid',1],['500',1],['429',1]]);
assert.match(files[4].bytes.toString(),/# tests 79\n# suites 0\n# pass 79\n# fail 0/);
assert.match(files[5].bytes.toString(),/# tests 162\n# suites 0\n# pass 162\n# fail 0/);
await mkdir(output);for(const f of files)await writeFile(path.join(output,f.name),f.bytes,{flag:'wx'});
const manifest={schemaVersion:'runaai-evidence-wire-retention/v1',observedAt:new Date().toISOString(),
  actualModelsTested:false,actualMastraAndLocalHttp:true,productionChanged:false,nodeVersion:process.version,
  files:files.map(({bytes,...f})=>({...f,bytes:bytes.length})),finalSourcePins:final.sourcePins};
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(manifest));
