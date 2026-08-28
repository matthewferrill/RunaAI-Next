import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {verifyAcceptanceSeal} from '../../qualification/acceptance/seal.mjs';

const root=path.resolve(import.meta.dirname,'../../..');
const sealPath='gate7f/qualification/acceptance/SEAL.json';
const sealBytes=readFileSync(path.join(root,sealPath)),seal=JSON.parse(sealBytes);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const uncovered=['gate7f/GATE7F-QUALIFICATION-AUTHORIZATION-AND-CRITERIA-2026-08-27.md',
  'gate7f/contracts.mjs','gate7f/evaluation/contracts.mjs','package-lock.json'];

function fixture(action){
 const parent=realpathSync(tmpdir()),target=mkdtempSync(path.join(parent,'runa-frozen-bytes-'));
 try{
  for(const entry of seal.files){const dest=path.resolve(target,entry.path);assert.ok(dest.startsWith(target+path.sep));
   mkdirSync(path.dirname(dest),{recursive:true});writeFileSync(dest,readFileSync(path.join(root,entry.path)),{flag:'wx'});}
  writeFileSync(path.join(target,sealPath),sealBytes,{flag:'wx'});
  return action(target);
 }finally{
  const resolved=realpathSync(target);assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('runa-frozen-bytes-'));
  rmSync(resolved,{recursive:true,force:false});
 }
}

test('actual loaded fourteen historical files retain exact original raw pins, including lock and attributes',()=>{
 assert.equal(seal.files.length,14);assert.equal(seal.files.filter(entry=>entry.path.endsWith('.mjs')).length,9);
 for(const entry of seal.files){const bytes=readFileSync(path.join(root,entry.path));
  assert.equal(bytes.length,entry.bytes,entry.path);assert.equal(sha(bytes),entry.sha256,entry.path);}
 assert.equal(verifyAcceptanceSeal(root).passed,true);
 const attributes=readFileSync(path.join(root,'.gitattributes'),'utf8').split(/\r?\n/);
 for(const name of uncovered)assert.ok(attributes.includes(name+' -text'),name);
 assert.equal(readFileSync(path.join(root,'gate7f/qualification/acceptance/.gitattributes'),'utf8'),'* text eol=lf\n');
});

test('strict historical verification works on copied bytes without Git metadata',()=>fixture(target=>{
 assert.equal(existsSync(path.join(target,'.git')),false);
 assert.deepEqual(verifyAcceptanceSeal(target),verifyAcceptanceSeal(root));
 assert.deepEqual(readFileSync(path.join(target,sealPath)),sealBytes);
}));

for(const [name,filename,mutate] of [
 ['contract CRLF rewrite','gate7f/contracts.mjs',bytes=>Buffer.from(bytes.toString('utf8').replaceAll('\n','\r\n'))],
 ['criteria CRLF rewrite','gate7f/GATE7F-QUALIFICATION-AUTHORIZATION-AND-CRITERIA-2026-08-27.md',bytes=>Buffer.from(bytes.toString('utf8').replaceAll('\n','\r\n'))],
 ['lock LF rewrite','package-lock.json',bytes=>Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'))],
 ['module appended byte','gate7f/qualification/acceptance/inputs.mjs',bytes=>Buffer.concat([bytes,Buffer.from(' ')])],
])test(`${name} still fails the untouched historical seal`,()=>fixture(target=>{
 const filenameAbsolute=path.join(target,filename),before=readFileSync(filenameAbsolute),changed=mutate(before);
 assert.notDeepEqual(changed,before);writeFileSync(filenameAbsolute,changed);
 assert.equal(verifyAcceptanceSeal(target).passed,false);
 assert.deepEqual(readFileSync(path.join(target,sealPath)),sealBytes);
}));
