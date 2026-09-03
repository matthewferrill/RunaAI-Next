param(
  [Parameter(Mandatory = $true)][ValidateSet('protect','unprotect','inspect-root','inspect-git','hold-git','inspect-file','short-path','safe-read')][string]$Action,
  [switch]$Diagnostic
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-RunaJson([hashtable]$Value) {
  [Console]::Out.WriteLine(($Value | ConvertTo-Json -Compress -Depth 8))
}

function Read-RunaInput {
  $raw = [Console]::In.ReadToEnd()
  if ([string]::IsNullOrWhiteSpace($raw) -or [Text.Encoding]::UTF8.GetByteCount($raw) -gt 65536) {
    throw 'native-input-invalid'
  }
  return $raw | ConvertFrom-Json
}

function Ensure-RunaNativeType {
  if ('RunaAI.OmenLocal.NativeFile' -as [type]) { return }
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace RunaAI.OmenLocal {
  public static class NativeFile {
    const uint GENERIC_READ = 0x80000000;
    const uint SHARE_ALL = 0x00000007;
    const uint OPEN_EXISTING = 3;
    const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
    const uint FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;
    const uint FILE_FLAG_SEQUENTIAL_SCAN = 0x08000000;
    const uint FILE_ATTRIBUTE_REPARSE_POINT = 0x00000400;

    [StructLayout(LayoutKind.Sequential)]
    struct FILETIME { public uint low; public uint high; }
    [StructLayout(LayoutKind.Sequential)]
    struct BY_HANDLE_FILE_INFORMATION {
      public uint attributes; public FILETIME created; public FILETIME accessed; public FILETIME written;
      public uint volumeSerial; public uint sizeHigh; public uint sizeLow; public uint links;
      public uint fileIndexHigh; public uint fileIndexLow;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct FILE_ATTRIBUTE_TAG_INFO { public uint attributes; public uint reparseTag; }

    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security,
      uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool GetFileInformationByHandle(SafeFileHandle handle, out BY_HANDLE_FILE_INFORMATION info);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int infoClass,
      out FILE_ATTRIBUTE_TAG_INFO info, uint size);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle, char[] path, uint size, uint flags);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern uint GetShortPathNameW(string longPath, char[] shortPath, uint size);

    static Exception Failure(string code) { return new InvalidOperationException(code); }
    static SafeFileHandle Open(string path, bool directory, bool shareDelete = true) {
      uint flags = FILE_FLAG_OPEN_REPARSE_POINT | (directory ? FILE_FLAG_BACKUP_SEMANTICS : FILE_FLAG_SEQUENTIAL_SCAN);
      uint share = shareDelete ? SHARE_ALL : 0x00000003;
      SafeFileHandle handle = CreateFileW(path, directory ? 0u : GENERIC_READ, share, IntPtr.Zero,
        OPEN_EXISTING, flags, IntPtr.Zero);
      if (handle.IsInvalid) { handle.Dispose(); throw Failure("native-open-denied"); }
      return handle;
    }
    static void RequireOrdinary(SafeFileHandle handle) {
      FILE_ATTRIBUTE_TAG_INFO tag;
      if (!GetFileInformationByHandleEx(handle, 9, out tag, (uint)Marshal.SizeOf(typeof(FILE_ATTRIBUTE_TAG_INFO))))
        throw Failure("native-handle-metadata-denied");
      if ((tag.attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) throw Failure("native-reparse-denied");
    }
    static BY_HANDLE_FILE_INFORMATION Info(SafeFileHandle handle) {
      BY_HANDLE_FILE_INFORMATION info;
      if (!GetFileInformationByHandle(handle, out info)) throw Failure("native-handle-metadata-denied");
      return info;
    }
    static string FinalPath(SafeFileHandle handle) {
      char[] buffer = new char[32768];
      uint length = GetFinalPathNameByHandleW(handle, buffer, (uint)buffer.Length, 0);
      if (length == 0 || length >= buffer.Length) throw Failure("native-final-path-denied");
      string value = new string(buffer, 0, (int)length);
      return value.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase) ? @"\\" + value.Substring(8)
        : value.StartsWith(@"\\?\", StringComparison.OrdinalIgnoreCase) ? value.Substring(4) : value;
    }
    static bool Beneath(string root, string file) {
      string prefix = root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
      return file.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
    }
    public static string InspectRoot(string root) {
      using (SafeFileHandle handle = Open(root, true)) {
        RequireOrdinary(handle); var info = Info(handle); string finalPath = FinalPath(handle);
        return String.Join("|", finalPath, info.volumeSerial.ToString("x8"),
          (((ulong)info.fileIndexHigh << 32) | info.fileIndexLow).ToString("x16"));
      }
    }
    static void RequireIdentity(BY_HANDLE_FILE_INFORMATION info, string expectedVolumeId, string expectedFileId) {
      string volume = info.volumeSerial.ToString("x8");
      string file = (((ulong)info.fileIndexHigh << 32) | info.fileIndexLow).ToString("x16");
      if (!String.Equals(volume, expectedVolumeId, StringComparison.OrdinalIgnoreCase)
          || !String.Equals(file, expectedFileId, StringComparison.OrdinalIgnoreCase))
        throw Failure("native-root-identity-changed");
    }
    public sealed class GitGuard : IDisposable {
      SafeFileHandle rootHandle;
      SafeFileHandle gitHandle;
      public readonly string RootFinalPath;
      public readonly string GitFinalPath;
      internal GitGuard(string root, string expectedVolumeId, string expectedFileId) {
        string rootFull = Path.GetFullPath(root);
        rootHandle = Open(rootFull, true, false);
        try {
          RequireOrdinary(rootHandle); var rootInfo = Info(rootHandle);
          RequireIdentity(rootInfo, expectedVolumeId, expectedFileId);
          RootFinalPath = FinalPath(rootHandle);
          gitHandle = Open(Path.Combine(RootFinalPath, ".git"), true, false);
          RequireOrdinary(gitHandle); GitFinalPath = FinalPath(gitHandle);
          if (!Beneath(RootFinalPath, GitFinalPath)) throw Failure("native-path-escape-denied");
        } catch { Dispose(); throw; }
      }
      public void Dispose() {
        if (gitHandle != null) { gitHandle.Dispose(); gitHandle = null; }
        if (rootHandle != null) { rootHandle.Dispose(); rootHandle = null; }
      }
    }
    public static GitGuard HoldGit(string root, string expectedVolumeId, string expectedFileId) {
      return new GitGuard(root, expectedVolumeId, expectedFileId);
    }
    public static string ShortPath(string path) {
      char[] buffer = new char[32768];
      uint length = GetShortPathNameW(Path.GetFullPath(path), buffer, (uint)buffer.Length);
      if (length == 0 || length >= buffer.Length) throw Failure("native-short-path-unavailable");
      return new string(buffer, 0, (int)length);
    }
    static void RejectExecutableAttributes(string rootFull, string finalRoot, string finalGit) {
      string infoAttributes = Path.Combine(finalGit, "info", "attributes");
      if (File.Exists(infoAttributes) || Directory.Exists(infoAttributes)) throw Failure("native-git-attributes-denied");
      int visited = 0;
      var pending = new System.Collections.Generic.Stack<string>(); pending.Push(finalRoot);
      while (pending.Count > 0) {
        string directory = pending.Pop();
        foreach (string entry in Directory.EnumerateFileSystemEntries(directory)) {
          if (++visited > 100000) throw Failure("native-git-inspection-limit");
          string name = Path.GetFileName(entry);
          if (String.Equals(name, ".git", StringComparison.OrdinalIgnoreCase)) continue;
          FileAttributes attributes = File.GetAttributes(entry);
          if ((attributes & FileAttributes.ReparsePoint) != 0) throw Failure("native-reparse-denied");
          if ((attributes & FileAttributes.Directory) != 0) pending.Push(entry);
          else if (String.Equals(name, ".gitattributes", StringComparison.OrdinalIgnoreCase))
            throw Failure("native-git-attributes-denied");
        }
      }
    }
    public static string InspectGit(string root, string expectedVolumeId, string expectedFileId) {
      string rootFull = Path.GetFullPath(root);
      using (SafeFileHandle rootHandle = Open(rootFull, true)) {
        RequireOrdinary(rootHandle); var rootInfo = Info(rootHandle);
        RequireIdentity(rootInfo, expectedVolumeId, expectedFileId);
        string finalRoot = FinalPath(rootHandle);
        using (SafeFileHandle gitHandle = Open(Path.Combine(rootFull, ".git"), true)) {
          RequireOrdinary(gitHandle); string finalGit = FinalPath(gitHandle);
          if (!Beneath(finalRoot, finalGit)) throw Failure("native-path-escape-denied");
          RejectExecutableAttributes(rootFull, finalRoot, finalGit);
          string replace = Path.Combine(rootFull, ".git", "refs", "replace");
          int replacementEntries = 0;
          if (Directory.Exists(replace) || File.Exists(replace)) {
            using (SafeFileHandle replaceHandle = Open(replace, true)) {
              RequireOrdinary(replaceHandle); string finalReplace = FinalPath(replaceHandle);
              if (!Beneath(finalGit, finalReplace)) throw Failure("native-path-escape-denied");
            }
            if (Directory.Exists(replace)) {
              foreach (string ignored in Directory.EnumerateFileSystemEntries(replace)) {
                replacementEntries++; break;
              }
            } else replacementEntries = 1;
          }
          foreach (string hostile in new [] { Path.Combine("objects", "info", "alternates"),
              Path.Combine("objects", "info", "http-alternates"), Path.Combine("info", "grafts"), "commondir" }) {
            string candidate = Path.Combine(rootFull, ".git", hostile);
            if (File.Exists(candidate) || Directory.Exists(candidate)) throw Failure("native-git-metadata-denied");
          }
          return String.Join("|", finalGit, replacementEntries.ToString());
        }
      }
    }
    public static string InspectFile(string root, string relative, int maximumBytes, string expectedVolumeId, string expectedFileId) {
      string rootFull = Path.GetFullPath(root);
      using (SafeFileHandle rootHandle = Open(rootFull, true)) {
        RequireOrdinary(rootHandle); var rootInfo = Info(rootHandle);
        RequireIdentity(rootInfo, expectedVolumeId, expectedFileId);
        string finalRoot = FinalPath(rootHandle);
        string candidate = Path.GetFullPath(Path.Combine(finalRoot, relative));
        using (SafeFileHandle fileHandle = Open(candidate, false)) {
          RequireOrdinary(fileHandle); var info = Info(fileHandle);
          if (info.links != 1) throw Failure("native-hardlink-denied");
          ulong length = ((ulong)info.sizeHigh << 32) | info.sizeLow;
          if (length > (ulong)maximumBytes) throw Failure("native-file-oversize");
          string finalFile = FinalPath(fileHandle);
          if (!Beneath(finalRoot, finalFile)) throw Failure("native-path-escape-denied");
          if (!String.Equals(candidate, finalFile, StringComparison.Ordinal)) throw Failure("native-path-alias-denied");
          return String.Join("|", finalFile, info.volumeSerial.ToString("x8"),
            (((ulong)info.fileIndexHigh << 32) | info.fileIndexLow).ToString("x16"), length.ToString());
        }
      }
    }
    public static string Read(string root, string relative, int maximumBytes, string expectedVolumeId,
        string expectedFileId, string expectedSourceVolumeId, string expectedSourceFileId) {
      string rootFull = Path.GetFullPath(root);
      using (SafeFileHandle rootHandle = Open(rootFull, true)) {
        RequireOrdinary(rootHandle); var rootInfo = Info(rootHandle);
        RequireIdentity(rootInfo, expectedVolumeId, expectedFileId);
        string finalRoot = FinalPath(rootHandle);
        string candidate = Path.GetFullPath(Path.Combine(finalRoot, relative));
        using (SafeFileHandle fileHandle = Open(candidate, false)) {
          RequireOrdinary(fileHandle); var info = Info(fileHandle);
          string sourceVolume = info.volumeSerial.ToString("x8");
          string sourceFile = (((ulong)info.fileIndexHigh << 32) | info.fileIndexLow).ToString("x16");
          if (!String.Equals(sourceVolume, expectedSourceVolumeId, StringComparison.OrdinalIgnoreCase)
              || !String.Equals(sourceFile, expectedSourceFileId, StringComparison.OrdinalIgnoreCase))
            throw Failure("native-source-identity-changed");
          if (info.links != 1) throw Failure("native-hardlink-denied");
          ulong length = ((ulong)info.sizeHigh << 32) | info.sizeLow;
          if (length > (ulong)maximumBytes) throw Failure("native-file-oversize");
          string finalFile = FinalPath(fileHandle);
          if (!Beneath(finalRoot, finalFile)) throw Failure("native-path-escape-denied");
          if (!String.Equals(candidate, finalFile, StringComparison.Ordinal)) throw Failure("native-path-alias-denied");
          using (var stream = new FileStream(fileHandle, FileAccess.Read, 4096, false)) {
            byte[] bytes = new byte[(int)length]; int offset = 0;
            while (offset < bytes.Length) { int read = stream.Read(bytes, offset, bytes.Length - offset); if (read == 0) break; offset += read; }
            if (offset != bytes.Length) throw Failure("native-short-read");
            return Convert.ToBase64String(bytes);
          }
        }
      }
    }
  }
}
'@
}

try {
  if ($Action -eq 'hold-git') {
    $line = [Console]::In.ReadLine()
    if ([string]::IsNullOrWhiteSpace($line) -or [Text.Encoding]::UTF8.GetByteCount($line) -gt 65536) {
      throw 'native-input-invalid'
    }
    $inputValue = $line | ConvertFrom-Json
  } else {
    $inputValue = Read-RunaInput
  }
  $entropy = [Text.Encoding]::UTF8.GetBytes('RunaAI-Omen-Local-v1')
  switch ($Action) {
    'protect' {
      $path = [IO.Path]::GetFullPath([string]$inputValue.path)
      $plain = [Convert]::FromBase64String([string]$inputValue.dataBase64)
      $sealed = [Security.Cryptography.ProtectedData]::Protect($plain, $entropy,
        [Security.Cryptography.DataProtectionScope]::CurrentUser)
      $parent = [IO.Path]::GetDirectoryName($path)
      [IO.Directory]::CreateDirectory($parent) | Out-Null
      $temporary = $path + '.new'
      [IO.File]::WriteAllBytes($temporary, $sealed)
      [IO.File]::Move($temporary, $path, $true)
      Write-RunaJson @{ schemaVersion='runa-omen-native-result/v1'; protected=$true; bytes=$sealed.Length }
    }
    'unprotect' {
      $path = [IO.Path]::GetFullPath([string]$inputValue.path)
      if (-not [IO.File]::Exists($path)) { throw 'native-state-missing' }
      $sealed = [IO.File]::ReadAllBytes($path)
      $plain = [Security.Cryptography.ProtectedData]::Unprotect($sealed, $entropy,
        [Security.Cryptography.DataProtectionScope]::CurrentUser)
      Write-RunaJson @{ schemaVersion='runa-omen-native-result/v1'; dataBase64=[Convert]::ToBase64String($plain) }
    }
    'inspect-root' {
      Ensure-RunaNativeType
      $root = [IO.Path]::GetFullPath([string]$inputValue.root)
      $parts = [RunaAI.OmenLocal.NativeFile]::InspectRoot($root).Split('|')
      $git = [IO.Path]::Combine($parts[0], '.git')
      $gitDetected = [IO.Directory]::Exists($git) -and -not (([IO.File]::GetAttributes($git) -band
        [IO.FileAttributes]::ReparsePoint) -eq [IO.FileAttributes]::ReparsePoint)
      Write-RunaJson @{ schemaVersion='runa-omen-native-result/v1'; finalPath=$parts[0];
        volumeId=$parts[1]; fileId=$parts[2]; repositoryDetected=$gitDetected }
    }
    'inspect-git' {
      Ensure-RunaNativeType
      $parts = [RunaAI.OmenLocal.NativeFile]::InspectGit([string]$inputValue.root,
        [string]$inputValue.expectedVolumeId, [string]$inputValue.expectedFileId).Split('|')
      if ([int]$parts[1] -gt 0) { throw 'native-git-replacement-denied' }
      Write-RunaJson @{ schemaVersion='runa-omen-native-result/v1'; gitFinalPath=$parts[0]; replacementEntries=[int]$parts[1] }
    }
    'hold-git' {
      Ensure-RunaNativeType
      $guard = [RunaAI.OmenLocal.NativeFile]::HoldGit([string]$inputValue.root,
        [string]$inputValue.expectedVolumeId, [string]$inputValue.expectedFileId)
      try {
        Write-RunaJson @{ schemaVersion='runa-omen-native-result/v1'; held=$true;
          rootFinalPath=$guard.RootFinalPath; gitFinalPath=$guard.GitFinalPath }
        [Console]::Out.Flush()
        [Console]::In.ReadLine() | Out-Null
      } finally {
        $guard.Dispose()
      }
    }
    'short-path' {
      Ensure-RunaNativeType
      Write-RunaJson @{ schemaVersion='runa-omen-native-result/v1';
        shortPath=[RunaAI.OmenLocal.NativeFile]::ShortPath([string]$inputValue.path) }
    }
    'inspect-file' {
      Ensure-RunaNativeType
      $relative = [string]$inputValue.relativePath
      if ([IO.Path]::IsPathRooted($relative) -or $relative.Contains(':') -or $relative.Contains([char]0)) {
        throw 'native-relative-path-invalid'
      }
      $segments = @($relative.Replace('\','/').Split('/'))
      $invalidSegments = @($segments | Where-Object { $_ -in @('','.', '..') -or $_.EndsWith('.') -or $_.EndsWith(' ') })
      if ($segments.Count -eq 0 -or $invalidSegments.Count -gt 0) { throw 'native-relative-path-invalid' }
      $parts = [RunaAI.OmenLocal.NativeFile]::InspectFile([string]$inputValue.root, $relative, 262144,
        [string]$inputValue.expectedVolumeId, [string]$inputValue.expectedFileId).Split('|')
      Write-RunaJson @{ schemaVersion='runa-omen-native-result/v1'; finalPath=$parts[0];
        volumeId=$parts[1]; fileId=$parts[2]; bytes=[int64]$parts[3] }
    }
    'safe-read' {
      Ensure-RunaNativeType
      $relative = [string]$inputValue.relativePath
      if ([IO.Path]::IsPathRooted($relative) -or $relative.Contains(':') -or $relative.Contains([char]0)) {
        throw 'native-relative-path-invalid'
      }
      $segments = @($relative.Replace('\','/').Split('/'))
      $invalidSegments = @($segments | Where-Object { $_ -in @('','.', '..') -or $_.EndsWith('.') -or $_.EndsWith(' ') })
      if ($segments.Count -eq 0 -or $invalidSegments.Count -gt 0) {
        throw 'native-relative-path-invalid'
      }
      $encoded = [RunaAI.OmenLocal.NativeFile]::Read([string]$inputValue.root, $relative, 262144,
        [string]$inputValue.expectedVolumeId, [string]$inputValue.expectedFileId,
        [string]$inputValue.expectedSourceVolumeId, [string]$inputValue.expectedSourceFileId)
      Write-RunaJson @{ schemaVersion='runa-omen-native-result/v1'; dataBase64=$encoded }
    }
  }
} catch {
  $matched = [regex]::Match($_.Exception.ToString(), 'native-[a-z0-9-]{1,80}')
  $code = if ($matched.Success) { $matched.Value } else { 'native-operation-failed' }
  [Console]::Error.WriteLine($code)
  if ($Diagnostic) { [Console]::Error.WriteLine($_.Exception.ToString()) }
  exit 1
}
