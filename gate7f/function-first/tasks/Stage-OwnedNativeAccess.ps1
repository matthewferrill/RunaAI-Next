[CmdletBinding()]
param([Parameter(Mandatory)][string]$OwnedRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$staging = 'C:\AI\RunaAI-Next-Candidate\staging'
$full = [IO.Path]::GetFullPath($OwnedRoot).TrimEnd('\')
if ([IO.Path]::GetDirectoryName($full) -ne $staging -or
    [IO.Path]::GetFileName($full) -notmatch '^m1-task-native-[a-f0-9]{32}$') { throw 'm1-native-root-invalid' }
if ([Security.Principal.WindowsIdentity]::GetCurrent().Name -ne 'RUNA-CONTROL\Matthew') { throw 'm1-native-identity-invalid' }
$source = Join-Path $full 'gate7e\control\TargetOnlyAcl.cs'
Add-Type -Path $source
$ancestors = @('C:\', 'C:\AI', 'C:\AI\RunaAI-Next-Candidate', $staging)
$prior = @{}
foreach ($path in $ancestors) { $prior[$path] = [RunaAI.Next.Gate7E.TargetOnlyAcl]::Inspect($path) }
$targets = @($full, (Join-Path $full 'runtime'), (Join-Path $full 'sandbox-runtime'), (Join-Path $full 'transient'))
$sample = Join-Path $full 'sandbox-runtime\node_modules'
$sampleHash = [RunaAI.Next.Gate7E.TargetOnlyAcl]::HashDacl($sample)
$changes = @()
foreach ($target in $targets) {
  $item = Get-Item -LiteralPath $target -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'm1-native-target-reparse' }
  $before = [RunaAI.Next.Gate7E.TargetOnlyAcl]::Inspect($target)
  $change = [RunaAI.Next.Gate7E.TargetOnlyAcl]::EnsureHostPreparation($target, $before.DaclSha256)
  $changes += [ordered]@{ role = [IO.Path]::GetFileName($target); changed = $change.Changed;
    beforeDacl = $before.DaclSha256; afterDacl = $change.After.DaclSha256;
    ownershipUnchanged = ($before.OwnershipSha256 -eq $change.After.OwnershipSha256) }
}
foreach ($path in $ancestors) {
  $after = [RunaAI.Next.Gate7E.TargetOnlyAcl]::Inspect($path)
  if ($after.DaclSha256 -ne $prior[$path].DaclSha256 -or $after.NonDaclSha256 -ne $prior[$path].NonDaclSha256) {
    throw 'm1-native-ancestor-mutated'
  }
}
if ([RunaAI.Next.Gate7E.TargetOnlyAcl]::HashDacl($sample) -ne $sampleHash) { throw 'm1-native-descendant-mutated' }
[ordered]@{schemaVersion='runa-m1-owned-native-access/v1';passed=$true;ancestorsUnchanged=$true;
  sampledDescendantUnchanged=$true;ownedTargets=$changes;productionAclChanged=$false} | ConvertTo-Json -Compress -Depth 6
