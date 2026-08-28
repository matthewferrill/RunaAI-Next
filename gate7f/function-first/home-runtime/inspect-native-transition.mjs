import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const execute=promisify(execFile);
// Read-only metadata and CLI help. Never invoke server start/stop, model or permission methods.
const source=String.raw`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($env:COMPUTERNAME-cne'RUNA-HOME'){throw 'inspection-host'}
$files=@('C:\Program Files\nodejs\node.exe','C:\Users\Matthew\AppData\Local\Programs\LM Studio\LM Studio.exe','C:\Users\Matthew\.lmstudio\bin\lms.exe','C:\Program Files\Git\usr\bin\openssl.exe')
$pins=@();foreach($file in $files){if(Test-Path -LiteralPath $file){$item=Get-Item -LiteralPath $file;$pins+=@{path=$file;bytes=$item.Length;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}}}
$settings=Get-Content -LiteralPath 'C:\Users\Matthew\.lmstudio\.internal\http-server-config.json' -Raw|ConvertFrom-Json
$selected=@{};foreach($name in @('autoStartOnLaunch','port','cors','logSensitiveData','logIncomingTokens','verbose','logLinesLimit','networkInterface','justInTimeModelLoading','fileLoggingMode')){$selected[$name]=$settings.$name}
$catalog=Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models' -TimeoutSec 5
$loaded=@();foreach($model in $catalog.models){foreach($instance in $model.loaded_instances){$loaded+=@{key=$model.key;id=$instance.id}}}
function Read-CliHelp([string]$Arguments){
  $info=New-Object Diagnostics.ProcessStartInfo;$info.FileName='C:\Users\Matthew\.lmstudio\bin\lms.exe';$info.Arguments=$Arguments
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle='Hidden';$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $child=New-Object Diagnostics.Process;$child.StartInfo=$info
  try{[void]$child.Start();[void]$child.Handle;$out=$child.StandardOutput.ReadToEndAsync();$err=$child.StandardError.ReadToEndAsync()
    if(-not$child.WaitForExit(5000)){throw 'inspection-help-timeout'}
    if(-not[Threading.Tasks.Task]::WaitAll(@($out,$err),1000)-or$child.ExitCode-ne0){throw 'inspection-help-result'}
    if($out.Result.Length-gt32768-or$err.Result.Length-gt32768){throw 'inspection-help-cap'};return $out.Result
  }finally{if(-not$child.HasExited){$child.Kill();[void]$child.WaitForExit(1000)};$child.Dispose()}
}
$nodeVersion=& 'C:\Program Files\nodejs\node.exe' --version
@{schemaVersion='runaai-home-transition-readonly/v1';time=[DateTime]::UtcNow.ToString('o');host=$env:COMPUTERNAME;identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name;pins=$pins;nodeVersion=$nodeVersion;
 cliHelp=(Read-CliHelp '--help');serverStartHelp=(Read-CliHelp 'server start --help');settings=$selected;loaded=$loaded;readOnly=$true;privateValuesIncluded=$false}|ConvertTo-Json -Depth 10 -Compress
`;
const encoded=Buffer.from(source,'utf16le').toString('base64');
const command='ssh -o ClearAllForwardings=yes runa-home-codex powershell.exe -NoProfile -NonInteractive -EncodedCommand '+encoded;
const result=await execute('ssh.exe',['-F','C:\\Users\\matth\\.ssh\\config','-o','ClearAllForwardings=yes','runa-control-wsl-codex',command],
  {encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:65536});
const parsed=JSON.parse(result.stdout);if(parsed.schemaVersion!=='runaai-home-transition-readonly/v1')throw Error('inspection-result');
const directory=resolve(dirname(fileURLToPath(import.meta.url)),'../../../artifacts/m1-readiness');mkdirSync(directory,{recursive:true});
const file=resolve(directory,'home-transition-'+parsed.time.replace(/[:.]/g,'-')+'.json');writeFileSync(file,result.stdout,{flag:'wx'});
console.log(JSON.stringify({file,...parsed}));
