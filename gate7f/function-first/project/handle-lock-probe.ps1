param([Parameter(Mandatory=$true)][string]$Directory, [Parameter(Mandatory=$true)][string]$File)
# Test-only probe of the exact shipped native class. Never a product capability.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Invoke-ProjectFilesystem.ps1'))
$match = [regex]::Match($source, "(?s)Add-Type -TypeDefinition @'\r?\n(.*?)\r?\n'@")
if (-not $match.Success) { throw 'native-source-not-found' }
Add-Type -TypeDefinition $match.Groups[1].Value
$handles = New-Object RunaProjectHandles
try {
  $handles.DirectoryLock($Directory, $false)
  $null = $handles.Read($File)
  [Console]::Out.WriteLine('ready')
  [Console]::Out.Flush()
  $read = [Console]::In.ReadLineAsync()
  $null = $read.Wait(10000)
} finally { $handles.Dispose() }
