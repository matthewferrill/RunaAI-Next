param([ValidateSet('Upload','Inventory','Run','PowerRun','Export','Status','Recovery','Probe','ProbeStatus','ProbeCleanup','ProbeExport','Dispatch','TaskStatus','TaskCleanup')][string]$Mode,
 [string]$LocalFile, [string]$Candidate='qwen36', [string]$DiagnosticId='20260828-readiness-r4',[string]$ExpectedSeal)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if ($DiagnosticId -notmatch '^20260828-readiness-r[1-9][0-9]*$') { throw 'readiness-id-invalid' }
if ($Candidate -notin @('qwen36','gemma','coder')) { throw 'readiness-candidate-invalid' }
$remoteRoot='C:\Users\codex-audit\AppData\Local\RunaM1Readiness\'+$DiagnosticId
$remote='$ErrorActionPreference=''Stop''; $ProgressPreference=''SilentlyContinue''; '
if($Mode-eq'Dispatch') {
 if($DiagnosticId-ne'20260828-readiness-r4'-or$ExpectedSeal-notmatch'^[a-f0-9]{64}$'){throw 'readiness-task-seal'}
 $remote += '$name=''Runa-M1-Readiness-20260828-r4'';if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){throw ''readiness-task-exists''};if((Get-FileHash -LiteralPath '''+$remoteRoot+'\seal.json'' -Algorithm SHA256).Hash.ToLowerInvariant()-ne'''+$ExpectedSeal+'''){throw ''readiness-task-seal-drift''};$action=New-ScheduledTaskAction -Execute ''C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'' -Argument ''-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$remoteRoot+'\Run-HomePower.ps1"'';$principal=New-ScheduledTaskPrincipal -UserId ''RUNA-HOME\codex-audit'' -LogonType S4U -RunLevel Highest;$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 100) -MultipleInstances IgnoreNew -Hidden;$null=Register-ScheduledTask -TaskName $name -Action $action -Principal $principal -Settings $settings;Start-ScheduledTask -TaskName $name;@{dispatched=$true;name=$name;sealSha256='''+$ExpectedSeal+''';sshIndependent=$true}|ConvertTo-Json -Compress'
} elseif($Mode-in@('TaskStatus','TaskCleanup')) {
 if($DiagnosticId-ne'20260828-readiness-r4'){throw 'readiness-task-id'}
 $remote += '$name=''Runa-M1-Readiness-20260828-r4'';$task=Get-ScheduledTask -TaskName $name;$info=Get-ScheduledTaskInfo -TaskName $name;$result=$null;$file='''+$remoteRoot+'\power-result.json'';if(Test-Path -LiteralPath $file){$result=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json};'
 if($Mode-eq'TaskCleanup'){$remote += 'if($task.State-eq''Running''-or$null-eq$result-or-not$result.powerRestored-or$task.Actions.Arguments-notlike''*20260828-readiness-r4\Run-HomePower.ps1*''){throw ''readiness-task-cleanup-boundary''};Unregister-ScheduledTask -TaskName $name -Confirm:$false;'}
 $remote += '@{taskState=[string]$task.State;lastTaskResult=$info.LastTaskResult;result=$result}|ConvertTo-Json -Depth 25 -Compress'
} elseif($Mode-eq'ProbeExport') {
 $remote += '[Console]::Out.Write([IO.File]::ReadAllText(''C:\Users\codex-audit\AppData\Local\RunaM1Readiness\scheduler-probe-20260828-r1\probe.jsonl''))'
} elseif($Mode -eq 'Probe') {
 if([IO.Path]::GetFileName($LocalFile)-ne'Probe-HomeTask.ps1'){throw 'readiness-probe-source'}
 $probeRoot='C:\Users\codex-audit\AppData\Local\RunaM1Readiness\scheduler-probe-20260828-r1'
 $hash=(Get-FileHash -LiteralPath $LocalFile -Algorithm SHA256).Hash.ToLowerInvariant()
 $remote += '$name=''Runa-M1-Readiness-Probe-20260828-r1'';if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){throw ''readiness-probe-task-exists''};if(Test-Path -LiteralPath '''+$probeRoot+'''){throw ''readiness-probe-root-exists''};[IO.Directory]::CreateDirectory('''+$probeRoot+''')|Out-Null;$f=[IO.File]::Open('''+$probeRoot+'\Probe-HomeTask.ps1'',[IO.FileMode]::CreateNew,[IO.FileAccess]::Write);try{[Console]::OpenStandardInput().CopyTo($f)}finally{$f.Dispose()};if((Get-FileHash -LiteralPath '''+$probeRoot+'\Probe-HomeTask.ps1'' -Algorithm SHA256).Hash.ToLowerInvariant()-ne'''+$hash+'''){throw ''readiness-probe-hash''};$action=New-ScheduledTaskAction -Execute ''C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'' -Argument ''-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$probeRoot+'\Probe-HomeTask.ps1"'';$principal=New-ScheduledTaskPrincipal -UserId ''RUNA-HOME\codex-audit'' -LogonType S4U -RunLevel Highest;$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew -Hidden;$null=Register-ScheduledTask -TaskName $name -Action $action -Principal $principal -Settings $settings;Start-ScheduledTask -TaskName $name;@{probeDispatched=$true;name=$name;scriptSha256='''+$hash+''';modelCalled=$false}|ConvertTo-Json -Compress'
} elseif($Mode -in @('ProbeStatus','ProbeCleanup')) {
 $remote += '$name=''Runa-M1-Readiness-Probe-20260828-r1'';$task=Get-ScheduledTask -TaskName $name;$info=Get-ScheduledTaskInfo -TaskName $name;$file=''C:\Users\codex-audit\AppData\Local\RunaM1Readiness\scheduler-probe-20260828-r1\probe.jsonl'';$records=@();if(Test-Path -LiteralPath $file){$records=@(Get-Content -LiteralPath $file|ForEach-Object{$_|ConvertFrom-Json})};'
 if($Mode-eq'ProbeCleanup'){$remote += 'if($task.State-eq''Running''-or$records.Count-ne7-or-not$records[6].passed-or$task.Actions.Arguments-notlike''*scheduler-probe-20260828-r1\Probe-HomeTask.ps1*''){throw ''readiness-probe-cleanup-boundary''};Unregister-ScheduledTask -TaskName $name -Confirm:$false;'}
 $remote += '@{taskState=[string]$task.State;lastTaskResult=$info.LastTaskResult;records=$records}|ConvertTo-Json -Depth 8 -Compress'
} elseif ($Mode -eq 'Upload') {
 $remote += 'if(Test-Path -LiteralPath '''+$remoteRoot+'''){throw ''readiness-target-exists''}; [IO.Directory]::CreateDirectory('''+$remoteRoot+''')|Out-Null; $f=[IO.File]::Open('''+$remoteRoot+'\transfer.json'',[IO.FileMode]::CreateNew,[IO.FileAccess]::Write); try{[Console]::OpenStandardInput().CopyTo($f)}finally{$f.Dispose()}; '
 $unpack='const fs=require(''fs''),p=require(''path'');const root=process.argv[1];const packet=JSON.parse(fs.readFileSync(p.join(root,''transfer.json''),''utf8''));const names=[''runner.mjs'',''cases.mjs'',''manifest.mjs'',''gguf-metadata.mjs'',''runtime.json'',''seal.json'',''Run-HomePower.ps1''];if(Object.keys(packet).sort().join()!=names.sort().join())throw Error(''packet-files'');for(const name of names)fs.writeFileSync(p.join(root,name),Buffer.from(packet[name],''base64''),{flag:''wx''});console.log(''readiness-package-transferred'');'
 $unpack64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($unpack))
 $remote += '$program=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('''+$unpack64+''')); & node -e $program '''+$remoteRoot+''''
} elseif($Mode -eq 'Recovery') {
 if([IO.Path]::GetFileName($LocalFile)-ne'Recover-HomeReadiness.ps1'){throw 'readiness-recovery-source'}
 $recoveryRoot='C:\Users\codex-audit\AppData\Local\RunaM1Readiness\20260828-recovery-r3'
 $hash=(Get-FileHash -LiteralPath $LocalFile -Algorithm SHA256).Hash.ToLowerInvariant()
 $remote += 'if(Test-Path -LiteralPath '''+$recoveryRoot+'''){throw ''readiness-recovery-target-exists''};[IO.Directory]::CreateDirectory('''+$recoveryRoot+''')|Out-Null;$f=[IO.File]::Open('''+$recoveryRoot+'\Recover-HomeReadiness.ps1'',[IO.FileMode]::CreateNew,[IO.FileAccess]::Write);try{[Console]::OpenStandardInput().CopyTo($f)}finally{$f.Dispose()};if((Get-FileHash -LiteralPath '''+$recoveryRoot+'\Recover-HomeReadiness.ps1'' -Algorithm SHA256).Hash.ToLowerInvariant()-ne'''+$hash+'''){throw ''readiness-recovery-source-drift''};& '''+$recoveryRoot+'\Recover-HomeReadiness.ps1'';exit $LASTEXITCODE'
} elseif($Mode -eq 'Export') {
 $export='const fs=require(''fs''),p=require(''path'');const root=process.argv[1];const items={};for(const name of fs.readdirSync(root)){if(/^(capture-(qwen36|gemma|coder)\.jsonl|result-(qwen36|gemma|coder)\.json|inventory\.json|seal\.json|recovery\.json|power-(before|applied|result)\.json|watchdog\.jsonl|worker-(gemma|coder)(-(exit|recovery))?\.json|worker-(gemma|coder)-(stdout|stderr)\.txt)$/.test(name))items[name]=fs.readFileSync(p.join(root,name),''base64'');}process.stdout.write(JSON.stringify(items));'
 $export64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($export))
 $remote += '$program=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('''+$export64+''')); & node -e $program '''+$remoteRoot+''''
} elseif($Mode -eq 'Status') {
 $remote += '$inventory=Invoke-RestMethod -Uri ''http://127.0.0.1:1234/api/v1/models'' -TimeoutSec 15; $models=@($inventory.models|ForEach-Object{@{key=$_.key;loadedInstances=@($_.loaded_instances)}}); $gpus=@(& nvidia-smi.exe --query-gpu=index,uuid,name,power.limit,temperature.gpu,memory.used,utilization.gpu --format=csv,noheader,nounits); $ports=@(Get-NetTCPConnection -State Listen|Where-Object{$_.LocalPort-in@(1234,8412)}|Select-Object LocalAddress,LocalPort); $results=@(Get-ChildItem -LiteralPath '''+$remoteRoot+''' -Filter ''result-*.json''|ForEach-Object{Get-Content -LiteralPath $_.FullName -Raw|ConvertFrom-Json|Select-Object candidate,errorCode,cleanupVerified,endedAt}); @{host=$env:COMPUTERNAME;time=[DateTime]::UtcNow.ToString(''o'');models=$models;gpus=$gpus;listeners=$ports;results=$results}|ConvertTo-Json -Depth 15 -Compress'
} elseif($Mode -eq 'PowerRun') {
 $remote += '& '''+$remoteRoot+'\Run-HomePower.ps1''; exit $LASTEXITCODE'
} else {
 $argument=if($Mode -eq 'Inventory'){'--inventory'}else{$Candidate}
 $remote += '& node '''+$remoteRoot+'\runner.mjs'' '''+$argument+''''
}
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remote))
$info=New-Object Diagnostics.ProcessStartInfo
$info.FileName='ssh.exe'
$info.Arguments='-F "C:\Users\matth\.ssh\config" -o ClearAllForwardings=yes runa-control-wsl-codex "ssh -o ClearAllForwardings=yes runa-home-codex powershell.exe -NoProfile -EncodedCommand '+$encoded+'"'
$info.UseShellExecute=$false; $info.CreateNoWindow=$true
$info.RedirectStandardInput=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
$process=[Diagnostics.Process]::Start($info)
$stderr=$process.StandardError.ReadToEndAsync()
if($Mode -in @('Export','ProbeExport')) {
 $out=[IO.File]::Open([IO.Path]::GetFullPath($LocalFile),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
 $copy=$process.StandardOutput.BaseStream.CopyToAsync($out)
} else {
 $stdout=$null
}
if($Mode -in @('Upload','Recovery','Probe')) {
 $inputFile=[IO.File]::OpenRead([IO.Path]::GetFullPath($LocalFile))
 try{$inputFile.CopyTo($process.StandardInput.BaseStream)}finally{$inputFile.Dispose()}
}
$process.StandardInput.Close()
if($Mode -notin @('Export','ProbeExport')) { while(-not $process.StandardOutput.EndOfStream){ [Console]::Out.WriteLine($process.StandardOutput.ReadLine()) } }
$process.WaitForExit()
if($Mode -in @('Export','ProbeExport')){try{$null=$copy.GetAwaiter().GetResult()}finally{$out.Dispose()}}
[Console]::Error.Write($stderr.GetAwaiter().GetResult())
exit $process.ExitCode
