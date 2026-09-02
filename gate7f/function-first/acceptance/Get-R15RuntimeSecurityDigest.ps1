Set-StrictMode -Version Latest

function Get-R15RuntimeSecurityDigest {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string[]]$RelativePaths
  )
  $fullRoot=[IO.Path]::GetFullPath($Root).TrimEnd('\')
  $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  $lines=New-Object 'System.Collections.Generic.List[string]'
  foreach($relative in @($RelativePaths|Sort-Object)){
    if($relative-notmatch'^(?:runtime|sandbox-runtime)(?:/[^/\\]+)*$'-or-not$seen.Add($relative)){
      throw 'r15-runtime-security-path-invalid'
    }
    $candidate=Join-Path $fullRoot ($relative.Replace('/','\'))
    $item=Get-Item -LiteralPath $candidate -Force
    if(($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'r15-runtime-security-reparse'}
    $acl=if($item.PSIsContainer){[IO.Directory]::GetAccessControl($candidate)}else{[IO.File]::GetAccessControl($candidate)}
    $descriptorBytes=[Text.UTF8Encoding]::new($false).GetBytes($acl.Sddl)
    $descriptorSha=[Security.Cryptography.SHA256]::Create()
    try{$descriptorDigest=([BitConverter]::ToString($descriptorSha.ComputeHash($descriptorBytes))).Replace('-','').ToLowerInvariant()}finally{$descriptorSha.Dispose()}
    $lines.Add(($relative+'|'+$descriptorDigest))
  }
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($lines-join"`n"))
  $sha=[Security.Cryptography.SHA256]::Create()
  try{$digest=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
  [pscustomobject]@{Count=$lines.Count;Sha256=$digest}
}
