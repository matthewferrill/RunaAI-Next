param([ValidateSet('Upload','Inventory','Run','PowerRun','Export')][string]$Mode,
 [string]$LocalFile, [string]$Candidate='qwen36', [string]$DiagnosticId='20260828-readiness-r3')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if ($DiagnosticId -notmatch '^20260828-readiness-r[1-9][0-9]*$') { throw 'readiness-id-invalid' }
if ($Candidate -notin @('qwen36','gemma','coder')) { throw 'readiness-candidate-invalid' }
$remoteRoot='C:\Users\codex-audit\AppData\Local\RunaM1Readiness\'+$DiagnosticId
$remote='$ErrorActionPreference=''Stop''; $ProgressPreference=''SilentlyContinue''; '
if ($Mode -eq 'Upload') {
 $remote += 'if(Test-Path -LiteralPath '''+$remoteRoot+'''){throw ''readiness-target-exists''}; [IO.Directory]::CreateDirectory('''+$remoteRoot+''')|Out-Null; $f=[IO.File]::Open('''+$remoteRoot+'\transfer.json'',[IO.FileMode]::CreateNew,[IO.FileAccess]::Write); try{[Console]::OpenStandardInput().CopyTo($f)}finally{$f.Dispose()}; '
 $unpack='const fs=require(''fs''),p=require(''path'');const root=process.argv[1];const packet=JSON.parse(fs.readFileSync(p.join(root,''transfer.json''),''utf8''));const names=[''runner.mjs'',''cases.mjs'',''manifest.mjs'',''gguf-metadata.mjs'',''runtime.json'',''seal.json'',''Run-HomePower.ps1''];if(Object.keys(packet).sort().join()!=names.sort().join())throw Error(''packet-files'');for(const name of names)fs.writeFileSync(p.join(root,name),Buffer.from(packet[name],''base64''),{flag:''wx''});console.log(''readiness-package-transferred'');'
 $unpack64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($unpack))
 $remote += '$program=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('''+$unpack64+''')); & node -e $program '''+$remoteRoot+''''
} elseif($Mode -eq 'Export') {
 $export='const fs=require(''fs''),p=require(''path'');const root=process.argv[1];const items={};for(const name of fs.readdirSync(root)){if(/^(capture-(qwen36|gemma|coder)\.jsonl|result-(qwen36|gemma|coder)\.json|inventory\.json|seal\.json|power-(before|applied|result)\.json)$/.test(name))items[name]=fs.readFileSync(p.join(root,name),''base64'');}process.stdout.write(JSON.stringify(items));'
 $export64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($export))
 $remote += '$program=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('''+$export64+''')); & node -e $program '''+$remoteRoot+''''
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
if($Mode -eq 'Export') {
 $out=[IO.File]::Open([IO.Path]::GetFullPath($LocalFile),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
 $copy=$process.StandardOutput.BaseStream.CopyToAsync($out)
} else {
 $stdout=$null
}
if($Mode -eq 'Upload') {
 $inputFile=[IO.File]::OpenRead([IO.Path]::GetFullPath($LocalFile))
 try{$inputFile.CopyTo($process.StandardInput.BaseStream)}finally{$inputFile.Dispose()}
}
$process.StandardInput.Close()
if($Mode -ne 'Export') { while(-not $process.StandardOutput.EndOfStream){ [Console]::Out.WriteLine($process.StandardOutput.ReadLine()) } }
$process.WaitForExit()
if($Mode -eq 'Export'){try{$copy.GetAwaiter().GetResult()}finally{$out.Dispose()}}
[Console]::Error.Write($stderr.GetAwaiter().GetResult())
exit $process.ExitCode
