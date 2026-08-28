// Read only the immutable READY record. Full exports belong after the active log writers stop.
import {execFileSync} from 'node:child_process';
import {writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha} from './lease-contract.mjs';
const [leaseId,sealSha256,...extra]=process.argv.slice(2);assert.equal(extra.length,0);
assert.match(leaseId,/^20260828-campaign-(gemma|coder|qwen36)-r[1-9][0-9]*$/);assert.match(sealSha256,/^[a-f0-9]{64}$/);
const output=path.resolve(import.meta.dirname,'../../../artifacts/m1-readiness',leaseId+'-ready.json');assert.equal(existsSync(output),false);
const root='C:\\Users\\codex-audit\\AppData\\Local\\RunaM1Readiness\\'+leaseId;
const script=`import{readFileSync,lstatSync}from'node:fs';import{createHash}from'node:crypto';import path from'node:path';import assert from'node:assert/strict';
const root=${JSON.stringify(root)},hash=b=>createHash('sha256').update(b).digest('hex');
for(let p=root;p!==path.dirname(p);p=path.dirname(p))assert.equal(lstatSync(p).isSymbolicLink(),false);
const seal=readFileSync(path.join(root,'seal.json'));assert.equal(hash(seal),'${sealSha256}');
const file=path.join(root,'ready.json'),before=lstatSync(file);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.size<=65536);
const raw=readFileSync(file),after=lstatSync(file);assert.equal(before.ino,after.ino);assert.equal(before.mtimeMs,after.mtimeMs);assert.equal(raw.length,before.size);
const value=JSON.parse(raw);assert.equal(value.leaseId,'${leaseId}');assert.equal(value.sealSha256,'${sealSha256}');assert.ok(Date.parse(value.expiresAt)>Date.now());process.stdout.write(raw);`;
const raw=execFileSync('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',
  'ssh -o ClearAllForwardings=yes runa-home-codex node --input-type=module -'],
  {input:Buffer.from(script),timeout:15000,maxBuffer:65536,windowsHide:true});
const value=JSON.parse(raw);assert.equal(value.leaseId,leaseId);assert.equal(value.sealSha256,sealSha256);
writeFileSync(output,raw,{flag:'wx'});console.log(JSON.stringify({output,sha256:sha(raw),...value}));
