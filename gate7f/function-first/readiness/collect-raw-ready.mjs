import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const [leaseId,expectedSeal]=process.argv.slice(2);
assert.match(leaseId,/^20260828-campaign-(gemma|coder|qwen36)-r[1-9][0-9]*$/);assert.match(expectedSeal,/^[a-f0-9]{64}$/);
const root='C:\\Users\\codex-audit\\AppData\\Local\\RunaM1Readiness\\'+leaseId;
const command=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';if((Get-FileHash -LiteralPath '${root}\\seal.json' -Algorithm SHA256).Hash.ToLowerInvariant()-cne'${expectedSeal}'){throw 'ready-seal-drift'};$bytes=[IO.File]::ReadAllBytes('${root}\\ready.json');if($bytes.Length-gt16384){throw 'ready-cap'};[Console]::Out.Write([Convert]::ToBase64String($bytes))`;
const encoded=Buffer.from(command,'utf16le').toString('base64');
const raw=execFileSync('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',
  'ssh -o ClearAllForwardings=yes runa-home-codex powershell.exe -NoProfile -EncodedCommand '+encoded],
  {encoding:'utf8',maxBuffer:65536,timeout:30000,windowsHide:true});
assert.match(raw,/^[A-Za-z0-9+/=]+$/);const bytes=Buffer.from(raw,'base64');assert.equal(bytes.toString('base64'),raw);
const value=JSON.parse(bytes);assert.equal(value.schemaVersion,'runa-m1-campaign-lease-ready/v1');
assert.equal(value.leaseId,leaseId);assert.equal(value.sealSha256,expectedSeal);assert.ok(Date.parse(value.expiresAt)>Date.now());
const file=resolve('artifacts/m1-readiness/'+leaseId+'-ready.json');writeFileSync(file,bytes,{flag:'wx'});
console.log(JSON.stringify({file,sha256:createHash('sha256').update(bytes).digest('hex'),ready:value}));
