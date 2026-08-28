import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
// Read only metadata; no CLI, inference, settings write or credentials.
const source=String.raw`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($env:COMPUTERNAME-cne'RUNA-HOME'){throw 'inspection-host'}
$file='C:\Users\Matthew\.lmstudio\.internal\http-server.json';$raw=[IO.File]::ReadAllText($file);$info=$raw|ConvertFrom-Json
$ports=@([int]$info.port,1234)|Select-Object -Unique;$listeners=@()
foreach($port in $ports){foreach($item in @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)){
 $process=Get-Process -Id $item.OwningProcess;$native=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$item.OwningProcess) -OperationTimeoutSec 5
 $owner=Invoke-CimMethod -InputObject $native -MethodName GetOwner -OperationTimeoutSec 5
 $listeners+=@{port=$port;address=$item.LocalAddress;pid=$process.Id;startedAt=$process.StartTime.ToUniversalTime().ToString('o');executable=$process.Path;owner=($owner.Domain+'\'+$owner.User)}}}
@{schemaVersion='runaai-native-endpoint-inspection/v1';time=[DateTime]::UtcNow.ToString('o');descriptorPort=$info.port;listeners=$listeners;privateValuesIncluded=$false;changed=$false}|ConvertTo-Json -Depth 5 -Compress`;
const command='ssh -o ClearAllForwardings=yes runa-home-codex powershell.exe -NoProfile -NonInteractive -EncodedCommand '+Buffer.from(source,'utf16le').toString('base64');
const result=await promisify(execFile)('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',command],
 {encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:16384});
console.log(result.stdout.trim());
