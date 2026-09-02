[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$StageId,
  [Parameter(Mandatory)][ValidatePattern('^campaign-(?:gemma4-26b-a4b|qwen3-coder-30b-a3b|qwen36-27b-mtp)-[a-f0-9]{16}$')][string]$CampaignDirectory
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-'+$StageId
$node='C:\AI\RunaAI-Next-Candidate\releases\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc\runtime\node.exe'
$entry=Join-Path $root 'gate7f\function-first\acceptance\run-r15-browser-publication-control.mjs'
$remote="Set-StrictMode -Version Latest;`$ErrorActionPreference='Stop';& '$node' '$entry' --owned-root '$root' --source-commit 2e81d94b3f362c6d8d2d04bbf6a486a091228af7 --runtime-seal runtime-seal.json --browser-checkpoints true --campaign-directory '$CampaignDirectory';exit `$LASTEXITCODE"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remote))
& ssh.exe -F 'C:\Users\matth\.ssh\config' -o ClearAllForwardings=yes runa-control powershell.exe -NoProfile -NonInteractive -EncodedCommand $encoded
exit $LASTEXITCODE
