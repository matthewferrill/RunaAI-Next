import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const [leaseId,expectedSeal,reason,...extra]=process.argv.slice(2);
assert.equal(extra.length,0);assert.match(leaseId,/^20260828-campaign-(?:gemma|coder|qwen36)-r[1-9][0-9]*$/);
assert.match(expectedSeal,/^[a-f0-9]{64}$/);assert.ok(['completed','abort'].includes(reason));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=readFileSync(path.join(import.meta.dirname,'Write-HomeCampaignCompletion.ps1')),writerSha256=sha(bytes);
const remoteRoot='C:\\Users\\codex-audit\\AppData\\Local\\RunaM1Completion\\'+writerSha256;
const command=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$root='${remoteRoot}';`+
  `for($p=$root;$p;$p=[IO.Path]::GetDirectoryName($p)){if((Test-Path -LiteralPath $p)-and((Get-Item -LiteralPath $p -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'completion-source-link'}};`+
  `if(-not(Test-Path -LiteralPath $root)){[void][IO.Directory]::CreateDirectory($root);$b=[Convert]::FromBase64String('${bytes.toString('base64')}');$s=[IO.File]::Open(($root+'\\Write-HomeCampaignCompletion.ps1'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$s.Write($b,0,$b.Length);$s.Flush($true)}finally{$s.Dispose()}};`+
  `$file=$root+'\\Write-HomeCampaignCompletion.ps1';if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()-cne'${writerSha256}'){throw 'completion-source-pin'};`+
  `& 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $file -LeaseId '${leaseId}' -ExpectedSeal '${expectedSeal}' -Reason '${reason}';exit $LASTEXITCODE`;
const encoded=Buffer.from(command,'utf16le').toString('base64');
// One call only: uncertain publication is inspected, never retried automatically.
const raw=execFileSync('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',
  `ssh -o ClearAllForwardings=yes runa-home-codex powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`],
  {encoding:'buffer',timeout:30000,maxBuffer:16384,windowsHide:true});
const result=JSON.parse(raw);assert.equal(result.published,true);assert.equal(result.leaseId,leaseId);assert.equal(result.sealSha256,expectedSeal);
const local=path.resolve(import.meta.dirname,'../../../artifacts/m1-readiness',leaseId+'-completion-publication.json');
writeFileSync(local,JSON.stringify({writerSha256,writerSource:bytes.toString('base64'),receiptRaw:raw.toString('base64'),receiptSha256:sha(raw)},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({result,writerSha256,retained:local}));
