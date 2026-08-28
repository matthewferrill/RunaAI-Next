param([ValidateSet('Upload','Dispatch','Status','Complete','Export','Cleanup','Final')][string]$Mode,
 [string]$LeaseId,[string]$ExpectedSeal,[string]$LocalFile,[ValidateSet('completed','abort')][string]$Reason='completed')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($LeaseId-notmatch'^20260828-(smoke|campaign)-(gemma|coder|qwen36)-r[1-9][0-9]*$'){throw 'lease-id'}
if($ExpectedSeal-notmatch'^[a-f0-9]{64}$'){throw 'lease-seal'}
$campaign=$LeaseId-like'20260828-campaign-*'
$taskMinutes=if($campaign){74}else{30}
$completionSchema=if($campaign){'runa-m1-campaign-completion/v1'}else{'runa-m1-smoke-completion/v1'}
$finalSchema=if($campaign){'runa-m1-campaign-final-observation/v1'}else{'runa-m1-smoke-final-observation/v1'}
$extraFile=if($campaign){',''campaign-hardware-plan.json'''}else{''}
$root='C:\Users\codex-audit\AppData\Local\RunaM1Readiness\'+$LeaseId
$remote='$ErrorActionPreference=''Stop'';$ProgressPreference=''SilentlyContinue'';'
if($Mode-eq'Upload'){
 $remote+='if(Test-Path -LiteralPath '''+$root+'''){throw ''lease-root-exists''};[IO.Directory]::CreateDirectory('''+$root+''')|Out-Null;$s=[IO.File]::Open('''+$root+'\transfer.json'',[IO.FileMode]::CreateNew,[IO.FileAccess]::Write);try{[Console]::OpenStandardInput().CopyTo($s)}finally{$s.Dispose()};$packet=Get-Content -LiteralPath '''+$root+'\transfer.json'' -Raw|ConvertFrom-Json;$allowed=@(''home-smoke-lease.mjs'',''lease-contract.mjs'',''Run-HomeSmokeLease.ps1'',''gguf-metadata.mjs'',''runtime.json'',''lease-config.json'',''seal.json'''+$extraFile+');if((($packet.PSObject.Properties.Name|Sort-Object)-join'','')-ne(($allowed|Sort-Object)-join'','')){throw ''lease-package-files''};foreach($f in $packet.PSObject.Properties){$s=[IO.File]::Open((Join-Path '''+$root+''' $f.Name),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write);try{$b=[Convert]::FromBase64String($f.Value);$s.Write($b,0,$b.Length)}finally{$s.Dispose()}};'
}
$remote+='if((Get-FileHash -LiteralPath '''+$root+'\seal.json'' -Algorithm SHA256).Hash.ToLowerInvariant()-ne'''+$ExpectedSeal+'''){throw ''lease-seal-drift''};'
if($Mode-eq'Dispatch'){
 $remote+='$name=''Runa-M1-'+$LeaseId+''';if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){throw ''lease-task-exists''};$a=New-ScheduledTaskAction -Execute ''C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'' -Argument ''-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$root+'\Run-HomeSmokeLease.ps1"'';$p=New-ScheduledTaskPrincipal -UserId ''RUNA-HOME\codex-audit'' -LogonType S4U -RunLevel Highest;$s=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes '+$taskMinutes+') -MultipleInstances IgnoreNew -Hidden;$null=Register-ScheduledTask -TaskName $name -Action $a -Principal $p -Settings $s;Start-ScheduledTask -TaskName $name;@{dispatched=$true;leaseId='''+$LeaseId+''';sealSha256='''+$ExpectedSeal+'''}|ConvertTo-Json -Compress'
}elseif($Mode-eq'Complete'){
 $remote+='$v=@{schemaVersion='''+$completionSchema+''';leaseId='''+$LeaseId+''';sealSha256='''+$ExpectedSeal+''';reason='''+$Reason+'''};$s=[IO.File]::Open('''+$root+'\complete.json'',[IO.FileMode]::CreateNew,[IO.FileAccess]::Write);try{$b=[Text.UTF8Encoding]::new($false).GetBytes(($v|ConvertTo-Json -Compress));$s.Write($b,0,$b.Length)}finally{$s.Dispose()};$v|ConvertTo-Json -Compress'
}elseif($Mode-in@('Status','Cleanup')){
 $remote+='$name=''Runa-M1-'+$LeaseId+''';$task=Get-ScheduledTask -TaskName $name;$info=Get-ScheduledTaskInfo -TaskName $name;$ready=$null;$result=$null;$supervisor=$null;foreach($pair in @(@(''ready'',''ready.json''),@(''result'',''lease-result.json''),@(''supervisor'',''supervisor-result.json''))){$f=Join-Path '''+$root+''' $pair[1];if(Test-Path -LiteralPath $f){Set-Variable -Name $pair[0] -Value (Get-Content -LiteralPath $f -Raw|ConvertFrom-Json)}};'
 if($Mode-eq'Cleanup'){$remote+='if($task.State-eq''Running''-or$null-eq$supervisor-or-not$supervisor.zeroResidencyAndPowerRestored-or$task.Actions.Arguments-notlike''*'+$LeaseId+'\Run-HomeSmokeLease.ps1*''){throw ''lease-task-cleanup-boundary''};Unregister-ScheduledTask -TaskName $name -Confirm:$false;'}
 $remote+='$last=$null;$f=Join-Path '''+$root+''' ''events.jsonl'';if(Test-Path -LiteralPath $f){$line=Get-Content -LiteralPath $f -Tail 1;if($line){$last=$line|ConvertFrom-Json|Select-Object type,time,phase,code,gpus}};@{taskState=[string]$task.State;taskExit=$info.LastTaskResult;ready=$ready;result=$result;supervisor=$supervisor;lastEvent=$last}|ConvertTo-Json -Depth 20 -Compress'
}elseif($Mode-eq'Final'){
 $remote+='$registry=Invoke-RestMethod -Uri ''http://127.0.0.1:1234/api/v1/models'' -TimeoutSec 10;$models=@($registry.models|ForEach-Object{@{key=$_.key;loadedInstances=@($_.loaded_instances)}});$gpus=@(& nvidia-smi.exe --query-gpu=index,uuid,power.limit,temperature.gpu,memory.total,memory.used --format=csv,noheader,nounits);$tasks=@(Get-ScheduledTask|Where-Object{$_.TaskName-match''^Runa-M1-20260828-(smoke|campaign)-(gemma|coder|qwen36)-r[1-9][0-9]*$''}|Select-Object TaskName,State);$ports=@(Get-NetTCPConnection -State Listen|Where-Object{$_.LocalPort-in@(1234,8412)}|Select-Object LocalAddress,LocalPort);[Console]::Out.Write((@{schemaVersion='''+$finalSchema+''';time=[DateTime]::UtcNow.ToString(''o'');host=$env:COMPUTERNAME;models=$models;gpus=$gpus;ownedTaskRegistrations=$tasks;listeners=$ports;readOnly=$true;protectedDataIncluded=$false}|ConvertTo-Json -Depth 20))'
}elseif($Mode-eq'Export'){
 $remote+='$result=@{};foreach($f in Get-ChildItem -LiteralPath '''+$root+''' -File){if($f.Name-match''^(seal|lease-config|runtime|ready|complete|lease-result|worker|supervisor-result|campaign-hardware-plan)\.json$|^(events|supervisor)\.jsonl$|^worker-(stdout|stderr)\.txt$|^(home-smoke-lease|lease-contract|gguf-metadata)\.mjs$|^Run-HomeSmokeLease\.ps1$''){$result[$f.Name]=[Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName))}};[Console]::Out.Write(($result|ConvertTo-Json -Compress))'
}else{$remote+='@{uploaded=$true;sealSha256='''+$ExpectedSeal+'''}|ConvertTo-Json -Compress'}
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remote))
$info=New-Object Diagnostics.ProcessStartInfo
$info.FileName='ssh.exe';$info.Arguments='-F "C:\Users\matth\.ssh\config" -o ClearAllForwardings=yes runa-control-wsl-codex "ssh -o ClearAllForwardings=yes runa-home-codex powershell.exe -NoProfile -EncodedCommand '+$encoded+'"'
$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$p=[Diagnostics.Process]::Start($info);$err=$p.StandardError.ReadToEndAsync()
if($Mode-eq'Upload'){$s=[IO.File]::OpenRead([IO.Path]::GetFullPath($LocalFile));try{$s.CopyTo($p.StandardInput.BaseStream)}finally{$s.Dispose()}}
$p.StandardInput.Close()
if($Mode-in@('Export','Final')){$s=[IO.File]::Open([IO.Path]::GetFullPath($LocalFile),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write);try{$p.StandardOutput.BaseStream.CopyTo($s)}finally{$s.Dispose()}}else{while(-not$p.StandardOutput.EndOfStream){[Console]::Out.WriteLine($p.StandardOutput.ReadLine())}}
$p.WaitForExit();[Console]::Error.Write($err.GetAwaiter().GetResult());exit $p.ExitCode
