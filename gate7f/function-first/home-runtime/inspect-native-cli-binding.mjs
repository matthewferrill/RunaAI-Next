import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
// Static executable inspection only; this never executes lms.exe or reads its auth/permission store.
const source=String.raw`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($env:COMPUTERNAME-cne'RUNA-HOME'){throw 'inspection-host'}
$file='C:\Users\Matthew\.lmstudio\bin\lms.exe'
if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()-cne'976d4389f97b2cf95b38a4eb673855d8a846f2db21a20eb4fe5e79f7179722f5'){throw 'inspection-cli-pin'}
$bytes=[IO.File]::ReadAllBytes($file);$code=[Text.Encoding]::UTF8.GetString($bytes);$snippets=@()
foreach($needle in @('process.env.LMS_API_SERVER_INFO_PATH === undefined','async function handleServerStart','async function handleServerStatus')){
 $offset=0;for($count=0;$count-lt2;$count++){$found=$code.IndexOf($needle,$offset,[StringComparison]::Ordinal);if($found-lt0){break}
 $start=$found;$snippets+=@{needle=$needle;offset=$found;code=$code.Substring($start,[Math]::Min(1600,$code.Length-$start))};$offset=$found+$needle.Length}}
@{schemaVersion='runaai-native-cli-static-inspection/v1';time=[DateTime]::UtcNow.ToString('o');snippets=$snippets;executedCli=$false;privateValuesIncluded=$false}|ConvertTo-Json -Depth 5 -Compress`;
const command='ssh -o ClearAllForwardings=yes runa-home-codex powershell.exe -NoProfile -NonInteractive -EncodedCommand '+Buffer.from(source,'utf16le').toString('base64');
const result=await promisify(execFile)('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',command],
 {encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:32768});
console.log(result.stdout.trim());
