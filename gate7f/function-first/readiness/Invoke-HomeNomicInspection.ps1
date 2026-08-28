param([string]$LocalFile)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$source=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'inspect-nomic.mjs'))
$remote='$ErrorActionPreference=''Stop'';$program=[Console]::In.ReadToEnd(); & node --input-type=module -e $program;exit $LASTEXITCODE'
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remote))
$info=New-Object Diagnostics.ProcessStartInfo
$info.FileName='ssh.exe';$info.Arguments='-F "C:\Users\matth\.ssh\config" -o ClearAllForwardings=yes runa-control-wsl-codex "ssh -o ClearAllForwardings=yes runa-home-codex powershell.exe -NoProfile -EncodedCommand '+$encoded+'"'
$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$p=[Diagnostics.Process]::Start($info);$err=$p.StandardError.ReadToEndAsync()
$p.StandardInput.BaseStream.Write($source,0,$source.Length);$p.StandardInput.Close()
$s=[IO.File]::Open([IO.Path]::GetFullPath($LocalFile),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
try{$p.StandardOutput.BaseStream.CopyTo($s)}finally{$s.Dispose()}
$p.WaitForExit();[Console]::Error.Write($err.GetAwaiter().GetResult());exit $p.ExitCode
