$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security

$source=@'
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

namespace Runa.Omen {
  public sealed class SecuritySnapshot {
    public int Count { get; private set; }
    public string Digest { get; private set; }
    public SecuritySnapshot(int count, string digest) { Count=count; Digest=digest; }
  }

  public static class BoundedInput {
    public static Task<string> ReadLineAsync(TextReader reader, int maximum) {
      return Task.Run(() => ReadLine(reader, maximum));
    }
    public static string ReadLine(TextReader reader, int maximum) {
      var value=new StringBuilder();
      while (true) {
        int next=reader.Read();
        if (next < 0) return value.Length == 0 ? null : value.ToString();
        if (next == '\n') return value.ToString();
        if (next == '\r') continue;
        if (value.Length >= maximum) throw new InvalidDataException("witness-input-overflow");
        value.Append((char)next);
      }
    }
  }

  public sealed class RepositoryWitness : IDisposable {
    const int MaximumCount=1000000;
    const int MaximumEntries=100000;
    const uint READ_CONTROL=0x00020000, FILE_READ_ATTRIBUTES=0x0080;
    const uint FILE_SHARE_READ=1, FILE_SHARE_WRITE=2, FILE_SHARE_DELETE=4, OPEN_EXISTING=3;
    const uint FILE_FLAG_BACKUP_SEMANTICS=0x02000000, FILE_FLAG_OPEN_REPARSE_POINT=0x00200000;
    const uint OWNER_SECURITY_INFORMATION=1, GROUP_SECURITY_INFORMATION=2, DACL_SECURITY_INFORMATION=4;
    const int SE_FILE_OBJECT=1;
    [StructLayout(LayoutKind.Sequential)] struct FILETIME { public uint Low,High; }
    [StructLayout(LayoutKind.Sequential)] struct BY_HANDLE_FILE_INFORMATION {
      public uint Attributes; public FILETIME CreationTime,LastAccessTime,LastWriteTime;
      public uint VolumeSerialNumber,FileSizeHigh,FileSizeLow,NumberOfLinks,FileIndexHigh,FileIndexLow;
    }
    sealed class OpenedEntry : IDisposable {
      public SafeFileHandle Handle; public string FinalPath; public uint Attributes,Volume; public ulong FileId;
      public void Dispose() { if(Handle!=null) Handle.Dispose(); }
    }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    static extern SafeFileHandle CreateFile(string name,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle file,out BY_HANDLE_FILE_INFORMATION info);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandle(SafeFileHandle file,StringBuilder path,uint size,uint flags);
    [DllImport("advapi32.dll",SetLastError=true)] static extern uint GetSecurityInfo(IntPtr handle,int type,uint info,
      out IntPtr owner,out IntPtr group,out IntPtr dacl,out IntPtr sacl,out IntPtr descriptor);
    [DllImport("advapi32.dll")] static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);

    readonly string root;
    readonly uint expectedVolume;
    readonly ulong expectedFileId;
    readonly List<FileSystemWatcher> watchers=new List<FileSystemWatcher>();
    long name, content, metadata, security, errors, lastEventTicks;
    string abortCode;
    int stopped,disposed;

    public RepositoryWitness(string path,string volumeId,string fileId) {
      root=Path.GetFullPath(path); expectedVolume=Convert.ToUInt32(volumeId,16); expectedFileId=Convert.ToUInt64(fileId,16);
      using(var opened=OpenEntry(root)) {
        if((((FileAttributes)opened.Attributes)&FileAttributes.ReparsePoint)!=0
            ||opened.Volume!=expectedVolume||opened.FileId!=expectedFileId
            ||!String.Equals(opened.FinalPath,root,StringComparison.OrdinalIgnoreCase)) {
          throw new InvalidDataException("snapshot-root-identity-mismatch");
        }
      }
    }
    public long NameCount { get { return Interlocked.Read(ref name); } }
    public long ContentCount { get { return Interlocked.Read(ref content); } }
    public long MetadataCount { get { return Interlocked.Read(ref metadata); } }
    public long SecurityCount { get { return Interlocked.Read(ref security); } }
    public long ErrorCount { get { return Interlocked.Read(ref errors); } }
    public long LastEventTicks { get { return Interlocked.Read(ref lastEventTicks); } }
    public string AbortCode { get { return Volatile.Read(ref abortCode); } }

    void Latch(string code) { Interlocked.CompareExchange(ref abortCode, code, null); }
    void Count(ref long value, string prohibited) {
      Interlocked.Exchange(ref lastEventTicks, DateTime.UtcNow.Ticks);
      long next=Interlocked.Increment(ref value);
      if (next > MaximumCount) Latch("watcher-count-overflow");
      else if (prohibited != null) Latch(prohibited);
    }
    void OnName(object sender, FileSystemEventArgs args) { Count(ref name, "repository-name-event"); }
    void OnRename(object sender, RenamedEventArgs args) { Count(ref name, "repository-name-event"); }
    void OnContent(object sender, FileSystemEventArgs args) { Count(ref content, "repository-content-event"); }
    void OnMetadata(object sender, FileSystemEventArgs args) { Count(ref metadata, "repository-metadata-event"); }
    void OnSecurity(object sender, FileSystemEventArgs args) { Count(ref security, null); }
    void OnError(object sender, ErrorEventArgs args) { Count(ref errors, "watcher-error"); }

    FileSystemWatcher Make(NotifyFilters filters) {
      var watcher=new FileSystemWatcher(root);
      watcher.IncludeSubdirectories=true;
      watcher.InternalBufferSize=65536;
      watcher.NotifyFilter=filters;
      watcher.Error += OnError;
      watchers.Add(watcher);
      return watcher;
    }
    public void Start() {
      var names=Make(NotifyFilters.FileName|NotifyFilters.DirectoryName);
      names.Created+=OnName; names.Deleted+=OnName; names.Renamed+=OnRename;
      var contents=Make(NotifyFilters.LastWrite|NotifyFilters.Size);
      contents.Changed+=OnContent;
      var attributes=Make(NotifyFilters.Attributes|NotifyFilters.CreationTime);
      attributes.Changed+=OnMetadata;
      var access=Make(NotifyFilters.Security);
      access.Changed+=OnSecurity;
      foreach(var watcher in watchers) watcher.EnableRaisingEvents=true;
      Interlocked.Exchange(ref lastEventTicks, DateTime.UtcNow.Ticks);
    }

    static string NormalizeFinal(string value) {
      if(value.StartsWith("\\\\?\\UNC\\",StringComparison.OrdinalIgnoreCase)) value="\\\\"+value.Substring(8);
      else if(value.StartsWith("\\\\?\\",StringComparison.OrdinalIgnoreCase)) value=value.Substring(4);
      return Path.GetFullPath(value);
    }
    static OpenedEntry OpenEntry(string path) {
      var handle=CreateFile(path,READ_CONTROL|FILE_READ_ATTRIBUTES,
        FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,IntPtr.Zero,OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,IntPtr.Zero);
      if(handle==null||handle.IsInvalid) { if(handle!=null)handle.Dispose();throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
      try {
        BY_HANDLE_FILE_INFORMATION info;if(!GetFileInformationByHandle(handle,out info))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        var buffer=new StringBuilder(32768);uint length=GetFinalPathNameByHandle(handle,buffer,(uint)buffer.Capacity,0);
        if(length==0||length>=(uint)buffer.Capacity)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        return new OpenedEntry{Handle=handle,FinalPath=NormalizeFinal(buffer.ToString()),Attributes=info.Attributes,
          Volume=info.VolumeSerialNumber,FileId=((ulong)info.FileIndexHigh<<32)|info.FileIndexLow};
      } catch { handle.Dispose();throw; }
    }
    static string Relative(string rootPath, string full) {
      if (String.Equals(rootPath, full, StringComparison.OrdinalIgnoreCase)) return ".";
      string prefix=rootPath.EndsWith("\\", StringComparison.Ordinal) ? rootPath : rootPath+"\\";
      if (!full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("snapshot-path-invalid");
      return full.Substring(prefix.Length).Replace('\\','/');
    }
    static string Sddl(SafeFileHandle handle) {
      IntPtr owner,group,dacl,sacl,descriptor;
      uint status=GetSecurityInfo(handle.DangerousGetHandle(),SE_FILE_OBJECT,
        OWNER_SECURITY_INFORMATION|GROUP_SECURITY_INFORMATION|DACL_SECURITY_INFORMATION,
        out owner,out group,out dacl,out sacl,out descriptor);
      if(status!=0||descriptor==IntPtr.Zero)throw new System.ComponentModel.Win32Exception((int)status);
      try {
        uint length=GetSecurityDescriptorLength(descriptor);if(length==0||length>1048576)throw new InvalidDataException("snapshot-security-invalid");
        var bytes=new byte[(int)length];Marshal.Copy(descriptor,bytes,0,(int)length);
        var raw=new RawSecurityDescriptor(bytes,0);
        return raw.GetSddlForm(AccessControlSections.Owner|AccessControlSections.Group|AccessControlSections.Access);
      } finally { LocalFree(descriptor); }
    }
    public SecuritySnapshot Snapshot() {
      var entries=new List<Tuple<string,string,string>>();
      var pending=new Queue<string>();
      pending.Enqueue(root);
      while(pending.Count>0) {
        string current=pending.Dequeue();
        using(var opened=OpenEntry(current)) {
          string exact=Path.GetFullPath(current);
          if(!String.Equals(opened.FinalPath,exact,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("snapshot-entry-escaped");
          string relative=Relative(root,opened.FinalPath);
          bool reparse=(((FileAttributes)opened.Attributes)&FileAttributes.ReparsePoint)!=0;
          bool directory=(((FileAttributes)opened.Attributes)&FileAttributes.Directory)!=0;
          string kind=reparse?"r":(directory?"d":"f");
          entries.Add(Tuple.Create(relative,kind,Sddl(opened.Handle)));
          if(entries.Count>MaximumEntries) throw new InvalidDataException("snapshot-entry-overflow");
          if(directory&&!reparse) foreach(string child in Directory.EnumerateFileSystemEntries(exact)) pending.Enqueue(child);
        }
      }
      entries.Sort((left,right)=>StringComparer.Ordinal.Compare(left.Item1,right.Item1));
      using(var hash=SHA256.Create()) {
        var utf8=new UTF8Encoding(false,true);
        foreach(var entry in entries) {
          byte[] bytes=utf8.GetBytes(entry.Item2+"\0"+entry.Item1+"\0"+entry.Item3+"\n");
          hash.TransformBlock(bytes,0,bytes.Length,bytes,0);
        }
        hash.TransformFinalBlock(new byte[0],0,0);
        var hex=new StringBuilder(64);
        foreach(byte b in hash.Hash) hex.Append(b.ToString("x2"));
        return new SecuritySnapshot(entries.Count,hex.ToString());
      }
    }
    public void LatchExternal(string code) { Latch(code); }
    public void StopWatching() {
      if(Interlocked.Exchange(ref stopped,1)!=0)return;
      foreach(var watcher in watchers) { try { watcher.EnableRaisingEvents=false; } catch { Latch("watcher-error"); } }
      Interlocked.Exchange(ref lastEventTicks,DateTime.UtcNow.Ticks);
    }
    public void Dispose() {
      if(Interlocked.Exchange(ref disposed,1)!=0) return;
      StopWatching();
      foreach(var watcher in watchers) { try { watcher.Dispose(); } catch { Latch("watcher-error"); } }
    }
  }
}
'@
Add-Type -TypeDefinition $source -Language CSharp

function Read-BoundedLine([int]$Maximum){[Runa.Omen.BoundedInput]::ReadLine([Console]::In,$Maximum)}
function Get-Keys($Value){@($Value.PSObject.Properties.Name|Sort-Object)}
function Assert-Keys($Value,[string[]]$Expected){
  if($null-eq$Value-or((Get-Keys $Value)-join"`0")-cne(@($Expected|Sort-Object)-join"`0")){throw 'witness-protocol-invalid'}
}
function Decode-Frame([string]$Line){
  if([string]::IsNullOrEmpty($Line)-or$Line.Length-gt8192-or$Line-notmatch'^[A-Za-z0-9_-]+$'){throw 'witness-protocol-invalid'}
  $text=$Line.Replace('-','+').Replace('_','/');switch($text.Length%4){2{$text+='=='}3{$text+='='}1{throw 'witness-protocol-invalid'}}
  $bytes=[Convert]::FromBase64String($text);if($bytes.Length-gt6144){throw 'witness-protocol-invalid'}
  $utf8=New-Object Text.UTF8Encoding($false,$true);$json=$utf8.GetString($bytes)
  return $json|ConvertFrom-Json
}
function Write-Json($Value){[Console]::Out.WriteLine(($Value|ConvertTo-Json -Compress -Depth 5));[Console]::Out.Flush()}

$operationId=$null;$witness=$null;$abortWritten=$false;$exitCode=1
try{
  $start=Decode-Frame (Read-BoundedLine 8192);Assert-Keys $start @('schemaVersion','operationId','root')
  if($start.schemaVersion-cne'runa-omen-repository-witness-start/v1'-or
    [string]$start.operationId-cnotmatch'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'){throw 'witness-protocol-invalid'}
  $operationId=[string]$start.operationId;Assert-Keys $start.root @('rootFinalPath','gitFinalPath','volumeId','fileId')
  $root=[string]$start.root.rootFinalPath;$git=[string]$start.root.gitFinalPath
  if([string]$start.root.volumeId-cnotmatch'^[a-f0-9]{8}$'-or[string]$start.root.fileId-cnotmatch'^[a-f0-9]{16}$'-or
    $root.Length-lt3-or$root.Length-gt32767-or$git.Length-lt3-or$git.Length-gt32767-or
    $root-match'[\x00-\x1f\x7f]'-or$git-match'[\x00-\x1f\x7f]'-or-not[IO.Path]::IsPathRooted($root)-or-not[IO.Path]::IsPathRooted($git)-or
    [IO.Path]::GetFullPath($root)-cne$root-or[IO.Path]::GetFullPath($git)-cne$git){throw 'witness-protocol-invalid'}
  $prefix=$root.TrimEnd('\')+'\';if(-not$git.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'witness-protocol-invalid'}
  $before=$null;$armed=$null
  try{$witness=New-Object Runa.Omen.RepositoryWitness($root,[string]$start.root.volumeId,[string]$start.root.fileId);$before=$witness.Snapshot();$witness.Start();$armed=$witness.Snapshot()}
  catch{if($null-ne$witness){$witness.LatchExternal('security-snapshot-failed')}else{throw}}
  if($null-ne$before-and$null-ne$armed-and($before.Count-ne$armed.Count-or$before.Digest-cne$armed.Digest)){$witness.LatchExternal('security-baseline-changed')}
  if($null-eq$witness.AbortCode){Write-Json ([ordered]@{schemaVersion='runa-omen-repository-witness-ready/v1';operationId=$operationId})}
  else{Write-Json ([ordered]@{schemaVersion='runa-omen-repository-witness-abort/v1';operationId=$operationId;errorCode=$witness.AbortCode});$abortWritten=$true}
  $control=[Runa.Omen.BoundedInput]::ReadLineAsync([Console]::In,8192)
  while(-not$control.IsCompleted){
    if(-not$abortWritten-and$null-ne$witness.AbortCode){Write-Json ([ordered]@{schemaVersion='runa-omen-repository-witness-abort/v1';operationId=$operationId;errorCode=$witness.AbortCode});$abortWritten=$true}
    Start-Sleep -Milliseconds 10
  }
  $line=$control.GetAwaiter().GetResult();if($line-cne'complete'){$witness.LatchExternal('witness-protocol-invalid')}
  $drainStart=[DateTime]::UtcNow
  while(([DateTime]::UtcNow.Ticks-$witness.LastEventTicks)-lt2500000){
    if(([DateTime]::UtcNow-$drainStart).TotalMilliseconds-ge5000){$witness.LatchExternal('witness-drain-timeout');break}
    if(-not$abortWritten-and$null-ne$witness.AbortCode){Write-Json ([ordered]@{schemaVersion='runa-omen-repository-witness-abort/v1';operationId=$operationId;errorCode=$witness.AbortCode});$abortWritten=$true}
    Start-Sleep -Milliseconds 25
  }
  $afterA=$null;$afterB=$null;$afterC=$null
  try{$afterA=$witness.Snapshot()}catch{$witness.LatchExternal('security-snapshot-failed')}
  $drainStart=[DateTime]::UtcNow
  while(([DateTime]::UtcNow.Ticks-$witness.LastEventTicks)-lt2500000){if(([DateTime]::UtcNow-$drainStart).TotalMilliseconds-ge5000){$witness.LatchExternal('witness-drain-timeout');break};Start-Sleep -Milliseconds 25}
  try{$afterB=$witness.Snapshot()}catch{$witness.LatchExternal('security-snapshot-failed')}
  if($null-ne$afterA-and$null-ne$afterB-and($afterA.Count-ne$afterB.Count-or$afterA.Digest-cne$afterB.Digest)){$witness.LatchExternal('security-baseline-changed')}
  $witness.StopWatching();$drainStart=[DateTime]::UtcNow
  while(([DateTime]::UtcNow.Ticks-$witness.LastEventTicks)-lt2500000){if(([DateTime]::UtcNow-$drainStart).TotalMilliseconds-ge5000){$witness.LatchExternal('witness-drain-timeout');break};Start-Sleep -Milliseconds 25}
  try{$afterC=$witness.Snapshot()}catch{$witness.LatchExternal('security-snapshot-failed')}
  foreach($after in @($afterA,$afterB,$afterC)){if($null-ne$before-and$null-ne$after-and($before.Count-ne$after.Count-or$before.Digest-cne$after.Digest)){$witness.LatchExternal('security-baseline-changed')}}
  $witness.Dispose()
  if(-not$abortWritten-and$null-ne$witness.AbortCode){Write-Json ([ordered]@{schemaVersion='runa-omen-repository-witness-abort/v1';operationId=$operationId;errorCode=$witness.AbortCode});$abortWritten=$true}
  $securityEqual=$null-ne$before-and$null-ne$afterA-and$null-ne$afterB-and$null-ne$afterC-and
    $before.Count-eq$afterA.Count-and$before.Digest-ceq$afterA.Digest-and
    $before.Count-eq$afterB.Count-and$before.Digest-ceq$afterB.Digest-and
    $before.Count-eq$afterC.Count-and$before.Digest-ceq$afterC.Digest
  $securityEntries=if($null-ne$afterC){$afterC.Count}else{0}
  Write-Json ([ordered]@{schemaVersion='runa-omen-repository-witness-result/v1';operationId=$operationId;
    counts=[ordered]@{name=$witness.NameCount;content=$witness.ContentCount;metadata=$witness.MetadataCount;security=$witness.SecurityCount;errors=$witness.ErrorCount};
    securityEntries=$securityEntries;securityEqual=$securityEqual;privateValuesIncluded=$false})
  if($null-eq$witness.AbortCode){$exitCode=0}
}catch{
  if($null-ne$operationId-and-not$abortWritten){try{Write-Json ([ordered]@{schemaVersion='runa-omen-repository-witness-abort/v1';operationId=$operationId;errorCode='witness-protocol-invalid'})}catch{}}
}finally{if($null-ne$witness){try{$witness.Dispose()}catch{}}}
exit $exitCode
