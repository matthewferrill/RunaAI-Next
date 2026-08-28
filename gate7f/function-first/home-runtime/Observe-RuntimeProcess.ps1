param([Parameter(Mandatory=$true)][int]$ProcessId,[Parameter(Mandatory=$true)][string]$StartedAt)
. (Join-Path $PSScriptRoot 'Runtime-Windows.ps1')
if($ProcessId-le0-or$StartedAt-notmatch'^\d{4}-\d{2}-\d{2}T'){throw 'runtime-process-arguments'}
$expected=@{pid=$ProcessId;startedAt=$StartedAt;executable='C:\Program Files\nodejs\node.exe'}
@{schemaVersion='runaai-runtime-process-observation/v1';stopped=(Test-RuntimeStopped $expected)}|ConvertTo-Json -Compress
