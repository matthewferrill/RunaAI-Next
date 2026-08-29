param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# This fixed helper never evaluates supplied code. It only operates on bounded immutable artifacts.
# All ancestors are held open without FILE_SHARE_DELETE; source files also deny FILE_SHARE_WRITE.
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public sealed class RunaProjectHandles : IDisposable {
  [StructLayout(LayoutKind.Sequential)] public struct Info {
    public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation;
    public System.Runtime.InteropServices.ComTypes.FILETIME Access;
    public System.Runtime.InteropServices.ComTypes.FILETIME Write;
    public uint Volume; public uint SizeHigh; public uint SizeLow; public uint Links;
    public uint IndexHigh; public uint IndexLow;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool GetFileInformationByHandle(SafeFileHandle handle, out Info info);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool CreateDirectory(string path, IntPtr security);
  readonly List<IDisposable> held = new List<IDisposable>();
  readonly Dictionary<string,FileStream> written = new Dictionary<string,FileStream>(StringComparer.OrdinalIgnoreCase);
  readonly HashSet<string> directories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  public void DirectoryLock(string path, bool create) {
    path = Path.GetFullPath(path);
    if (directories.Contains(path)) return;
    string parent = Path.GetDirectoryName(path.TrimEnd('\\'));
    if (!String.IsNullOrEmpty(parent) && !String.Equals(parent,path,StringComparison.OrdinalIgnoreCase)) DirectoryLock(parent,false);
    if (create && !CreateDirectory(path,IntPtr.Zero) && Marshal.GetLastWin32Error()!=183) throw new IOException("project-directory-create-failed");
    SafeFileHandle h = CreateFile(path,0x80,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
    if(h.IsInvalid) { h.Dispose(); throw new IOException("project-directory-lock-failed"); }
    held.Add(h);
    Info info;
    if(!GetFileInformationByHandle(h,out info) || (info.Attributes & 0x400)!=0 || (info.Attributes & 0x10)==0) throw new IOException("project-reparse-or-directory-invalid");
    directories.Add(path);
  }
  public bool NewRevision(string path) {
    bool created = CreateDirectory(path,IntPtr.Zero);
    if(!created && Marshal.GetLastWin32Error()!=183) throw new IOException("project-revision-create-failed");
    DirectoryLock(path,false);
    return created;
  }
  FileStream Open(string path, bool create) {
    SafeFileHandle h = CreateFile(path, create ? 0xC0000000u : 0x80000000u, 1, IntPtr.Zero, create ? 1u : 3u, 0x00200000, IntPtr.Zero);
    if(h.IsInvalid) { h.Dispose(); throw new IOException("project-file-lock-failed"); }
    Info info;
    if(!GetFileInformationByHandle(h,out info) || (info.Attributes & 0x410)!=0 || info.Links!=1 || info.SizeHigh!=0 || info.SizeLow>4000) {
      h.Dispose(); throw new IOException("project-reparse-hardlink-or-file-invalid");
    }
    FileStream stream = new FileStream(h, create ? FileAccess.ReadWrite : FileAccess.Read);
    held.Add(stream); return stream;
  }
  public void WriteNew(string path, byte[] bytes) {
    if(bytes.Length>4000) throw new IOException("project-source-budget-exceeded");
    FileStream stream=Open(path,true); stream.Write(bytes,0,bytes.Length); stream.Flush(true); written.Add(path,stream);
  }
  public byte[] Read(string path) {
    FileStream stream;
    if(written.ContainsKey(path)) { stream=written[path]; stream.Position=0; } else { stream=Open(path,false); }
    if(stream.Length>4000) throw new IOException("project-source-budget-exceeded");
    byte[] result=new byte[stream.Length]; int offset=0;
    while(offset<result.Length) { int count=stream.Read(result,offset,result.Length-offset); if(count==0) throw new IOException("project-file-read-failed"); offset+=count; }
    Info final;
    if(!GetFileInformationByHandle(stream.SafeFileHandle,out final) || (final.Attributes & 0x410)!=0 || final.Links!=1 || final.SizeHigh!=0 || final.SizeLow!=result.Length) throw new IOException("project-file-changed");
    return result;
  }
  public void Dispose() { for(int i=held.Count-1;i>=0;i--) held[i].Dispose(); }
}
'@
$held = $null
try {
  $inputText = [Console]::In.ReadToEnd()
  if ($inputText.Length -gt 24000) { throw 'project-filesystem-input-invalid' }
  $request = $inputText | ConvertFrom-Json
  if ($request.operation -notin @('create','read','observe')) { throw 'project-filesystem-input-invalid' }
  $base = [IO.Path]::GetFullPath([string]$request.baseDirectory)
  if ($base -notmatch '^[A-Za-z]:\\' -or $base -match '[/:]$' -or $base.Substring(2).Contains(':') -or $base.Contains('..') -or $base -match '[. ]\\|[. ]$') { throw 'project-base-invalid' }
  if ($request.environmentDirectory -notmatch '^e-[a-f0-9]{64}$' -or $request.revisionId -notmatch '^r-[a-f0-9]{64}$') { throw 'project-filesystem-input-invalid' }
  $held = New-Object RunaProjectHandles
  $held.DirectoryLock($base, ($request.operation -eq 'create'))
  $environment = [IO.Path]::Combine($base, [string]$request.environmentDirectory)
  $held.DirectoryLock($environment, ($request.operation -eq 'create'))
  $revision = [IO.Path]::Combine($environment, [string]$request.revisionId)
  $created = $false
  if ($request.operation -eq 'observe' -and -not [IO.Directory]::Exists($revision)) {
    # A file/reparse point at this exact name is not absence.
    if ([IO.File]::Exists($revision) -or [IO.Directory]::GetFileSystemEntries($environment, [string]$request.revisionId).Length -ne 0) { throw 'project-revision-invalid' }
    @{status='absent'} | ConvertTo-Json -Compress
    exit 0
  }
  if ($request.operation -eq 'create') { $created = $held.NewRevision($revision) }
  else { $held.DirectoryLock($revision, $false) }
  if (@($request.files).Count -lt 1 -or @($request.files).Count -gt 4) { throw 'project-filesystem-input-invalid' }
  $total = 0
  $names = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  foreach ($file in $request.files) {
    if ($file.path -notmatch '^[a-z][a-z0-9_-]{0,47}\.js$' -or $file.path -match '^(con|prn|aux|nul|com[0-9]|lpt[0-9])\.' -or -not $names.Add([string]$file.path)) { throw 'project-file-path-invalid' }
    if ($created) {
      $bytes = [Convert]::FromBase64String([string]$file.base64)
      $total += $bytes.Length
      if ($total -gt 4000) { throw 'project-source-budget-exceeded' }
      $held.WriteNew([IO.Path]::Combine($revision,[string]$file.path), $bytes)
    }
  }
  $entries = @([IO.Directory]::GetFileSystemEntries($revision))
  if ($entries.Count -ne $names.Count) { throw 'project-revision-file-set-invalid' }
  foreach ($entry in $entries) { if (-not $names.Contains([IO.Path]::GetFileName($entry))) { throw 'project-revision-file-set-invalid' } }
  $files = @()
  foreach ($file in $request.files) {
    $bytes = $held.Read([IO.Path]::Combine($revision,[string]$file.path))
    $files += @{ path=[string]$file.path; base64=[Convert]::ToBase64String($bytes) }
  }
  @{status='present'; created=$created; files=$files} | ConvertTo-Json -Depth 5 -Compress
} catch {
  # Never return paths, source text, native error details, or environment values.
  $code = [string]$_.Exception.Message
  if ($code -notmatch '^project-[a-z-]+$') { $code = 'project-filesystem-operation-failed' }
  @{status='error'; errorCode=$code} | ConvertTo-Json -Compress
  exit 1
} finally { if ($null -ne $held) { $held.Dispose() } }
