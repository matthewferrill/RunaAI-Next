[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-'+$StageId
$node='C:\AI\RunaAI-Next-Candidate\releases\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc\runtime\node.exe'
$entry=Join-Path $root 'gate7f\function-first\acceptance\control-functional.mjs'
$remote="Set-StrictMode -Version Latest;`$ErrorActionPreference='Stop';& '$node' '$entry' --mode controls --owned-root '$root' --source-commit 2e81d94b3f362c6d8d2d04bbf6a486a091228af7 --browser-checkpoints true --runtime-seal runtime-seal.json;exit `$LASTEXITCODE"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remote))
& ssh.exe -F 'C:\Users\matth\.ssh\config' -o ClearAllForwardings=yes runa-control powershell.exe -NoProfile -NonInteractive -EncodedCommand $encoded
exit $LASTEXITCODE
