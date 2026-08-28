Set-StrictMode -Version Latest
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$script:RuntimeRoot='C:\AI\RunaAI-Next-HomeRuntime'
if(-not('RunaRuntimeFile' -as [type])){
  Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using Microsoft.Win32.SafeHandles;
using System.Diagnostics; using System.IO; using System.Text; using System.Threading.Tasks;
public static class RunaRuntimeFile {
 [StructLayout(LayoutKind.Sequential)] public struct Info {
  public uint attributes,creationLow,creationHigh,accessLow,accessHigh,writeLow,writeHigh,volume,sizeHigh,sizeLow,links,indexHigh,indexLow;
 }
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
}
public static class RunaRuntimeProbe {
 [DllImport("shell32.dll",SetLastError=true)] private static extern IntPtr CommandLineToArgvW([MarshalAs(UnmanagedType.LPWStr)] string command,out int count);
 [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr memory);
 public static string[] Arguments(string command) {
  int count;var pointer=CommandLineToArgvW(command,out count);if(pointer==IntPtr.Zero)throw new IOException("runtime-commandline");
  try { var values=new string[count];for(int i=0;i<count;i++)values[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(pointer,i*IntPtr.Size));return values; }
  finally { LocalFree(pointer); }
 }
 [StructLayout(LayoutKind.Sequential)] public class Memory {
  public uint length=(uint)Marshal.SizeOf(typeof(Memory)),load;
  public ulong totalPhysical,availablePhysical,totalPageFile,availablePageFile,totalVirtual,availableVirtual,availableExtendedVirtual;
 }
 [DllImport("kernel32.dll",SetLastError=true)] private static extern bool GlobalMemoryStatusEx([In,Out] Memory value);
 public static ulong FreeMemory() { var value=new Memory();if(!GlobalMemoryStatusEx(value))throw new IOException("runtime-memory-probe");return value.availablePhysical; }
 private static async Task<byte[]> ReadBounded(Stream input,int cap) {
  using(var output=new MemoryStream()) { var block=new byte[4096];int count;
   while((count=await input.ReadAsync(block,0,block.Length))>0) { if(output.Length+count>cap)throw new IOException("runtime-probe-cap");output.Write(block,0,count); }
   return output.ToArray();
  }
 }
 // The production call site supplies one fixed read-only NVIDIA command. A held Process handle,
 // finite deadline and bounded asynchronous readers also make its timeout independently testable.
 public static string RunBounded(string executable,string arguments,int timeoutMs,int cap) {
  if(timeoutMs<100||timeoutMs>5000||cap<1||cap>8192)throw new ArgumentException("runtime-probe-bounds");
  var start=new ProcessStartInfo(executable,arguments);start.UseShellExecute=false;start.CreateNoWindow=true;
  start.WindowStyle=ProcessWindowStyle.Hidden;start.RedirectStandardOutput=true;start.RedirectStandardError=true;
  using(var child=new Process()) { child.StartInfo=start;var clock=Stopwatch.StartNew();
   if(!child.Start())throw new IOException("runtime-probe-start");var held=child.Handle;
   var output=ReadBounded(child.StandardOutput.BaseStream,cap);var error=ReadBounded(child.StandardError.BaseStream,cap);
   try {
    while(!child.WaitForExit(25)) { if(clock.ElapsedMilliseconds>=timeoutMs)throw new TimeoutException("runtime-probe-timeout");
     if(output.IsFaulted||error.IsFaulted)throw new IOException("runtime-probe-cap"); }
    int remaining=timeoutMs-(int)clock.ElapsedMilliseconds;
    if(remaining<=0||!Task.WaitAll(new Task[]{output,error},remaining))throw new TimeoutException("runtime-probe-timeout");
    if(child.ExitCode!=0)throw new IOException("runtime-probe-exit");
    return new UTF8Encoding(false,true).GetString(output.Result);
   } finally {
    if(!child.HasExited) { child.Kill();if(!child.WaitForExit(1000))throw new IOException("runtime-probe-stop-unconfirmed"); }
    child.StandardOutput.Close();child.StandardError.Close();
    // Observe any asynchronous reader fault after closing the owned pipes.
    output.ContinueWith(t=>{var ignored=t.Exception;},TaskContinuationOptions.OnlyOnFaulted);
    error.ContinueWith(t=>{var ignored=t.Exception;},TaskContinuationOptions.OnlyOnFaulted);
   }
  }
 }
}
'@
}
function Assert-RuntimePath([string]$Path){
  if([IO.Path]::GetFullPath($Path)-cne$Path-or($Path-cne$script:RuntimeRoot-and-not$Path.StartsWith($script:RuntimeRoot+'\',[StringComparison]::Ordinal))){throw 'runtime-path'}
  for($current=$Path;$current;$current=[IO.Path]::GetDirectoryName($current)){
    if(Test-Path -LiteralPath $current){$item=Get-Item -LiteralPath $current -Force
      if(($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'runtime-path-link'}
    }
  }
}
function Read-RuntimeBytes([string]$Path,[long]$Maximum=65536){
  Assert-RuntimePath $Path
  $stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  try{
    $info=New-Object RunaRuntimeFile+Info
    if(-not[RunaRuntimeFile]::GetFileInformationByHandle($stream.SafeFileHandle,[ref]$info)-or$info.links-ne1-or$stream.Length-gt$Maximum){throw 'runtime-file-bounds'}
    $bytes=New-Object byte[] $stream.Length;$count=0
    while($count-lt$bytes.Length){$read=$stream.Read($bytes,$count,$bytes.Length-$count);if($read-le0){throw 'runtime-file-short'};$count+=$read}
    return ,$bytes
  }finally{$stream.Dispose()}
}
function Read-RuntimeJson([string]$Path){[Text.UTF8Encoding]::new($false,$true).GetString((Read-RuntimeBytes $Path))|ConvertFrom-Json}
function Write-RuntimeJson([string]$Path,$Value,[bool]$Replace=$false){
  Assert-RuntimePath $Path
  $pending=$Path+'.pending-'+[Guid]::NewGuid().ToString('N');Assert-RuntimePath $pending
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 30 -Compress)+"`n")
  if($bytes.Length-gt65536){throw 'runtime-output-cap'}
  $stream=[IO.File]::Open($pending,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  if($Replace-and(Test-Path -LiteralPath $Path)){
    [void](Read-RuntimeBytes $Path)
    [IO.File]::Replace($pending,$Path,[System.Management.Automation.Language.NullString]::Value)
  }else{[IO.File]::Move($pending,$Path)}
}
function Set-RuntimeDirectoryAcl([string]$Path,[ValidateSet('','ReadAndExecute','Modify')][string]$LocalServiceRights=''){
  Assert-RuntimePath $Path
  if(-not(Test-Path -LiteralPath $Path -PathType Container)){throw 'runtime-directory'}
  $acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false)
  $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
  foreach($sid in @('S-1-5-18','S-1-5-32-544')){
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
  }
  if($LocalServiceRights){$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-19')),$LocalServiceRights,'ContainerInherit,ObjectInherit','None','Allow')))}
  Set-Acl -LiteralPath $Path -AclObject $acl
  if(-not(Get-Acl -LiteralPath $Path).AreAccessRulesProtected){throw 'runtime-acl-unconfirmed'}
}
function Get-RuntimeIdentity([int]$ProcessId){
  $process=Get-Process -Id $ProcessId -ErrorAction SilentlyContinue;if($null-eq$process){return $null}
  try{[void]$process.Handle;[pscustomobject]@{pid=$process.Id;startedAt=$process.StartTime.ToUniversalTime().ToString('o');executable=$process.Path}}
  finally{$process.Dispose()}
}
function Test-RuntimeStopped($Identity){
  $current=Get-RuntimeIdentity ([int]$Identity.pid)
  return ($null-eq$current-or$current.startedAt-cne$Identity.startedAt-or$current.executable-cne$Identity.executable)
}
function Stop-RuntimeProcess($Identity){
  if($Identity.executable-cne'C:\Program Files\nodejs\node.exe'){throw 'runtime-stop-executable'}
  $process=Get-Process -Id ([int]$Identity.pid) -ErrorAction SilentlyContinue;if($null-eq$process){return}
  try{[void]$process.Handle
    if($process.StartTime.ToUniversalTime().ToString('o')-cne$Identity.startedAt-or$process.Path-cne$Identity.executable){throw 'runtime-stop-reused'}
    $process.Kill();if(-not$process.WaitForExit(5000)){throw 'runtime-stop-unconfirmed'}
  }finally{$process.Dispose()}
}
function Assert-RuntimeCodeName([string]$Name){
  if($Name.Contains('..')-or($Name-cne'evidence-output.mjs'-and$Name-notmatch'^(home-runtime|readiness)/[A-Za-z0-9/.-]+\.(mjs|ps1|json)$')){throw 'runtime-code-path'}
}
function Assert-RuntimeInstallation([string]$ExpectedSeal){
  if($env:COMPUTERNAME-cne'RUNA-HOME'-or$ExpectedSeal-notmatch'^[a-f0-9]{64}$'){throw 'runtime-host-seal'}
  $file=$script:RuntimeRoot+'\installation.json';$bytes=Read-RuntimeBytes $file
  $hash=[Security.Cryptography.SHA256]::Create();try{$digest=([BitConverter]::ToString($hash.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
  if($digest-cne$ExpectedSeal){throw 'runtime-installation-drift'}
  $installation=[Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json
  if($installation.schemaVersion-cne'runaai-qualified-home-installation/v1'){throw 'runtime-installation-schema'}
  foreach($file in $installation.codeFiles.PSObject.Properties){
    Assert-RuntimeCodeName $file.Name
    $path=$script:RuntimeRoot+'\code\'+$file.Name.Replace('/','\');[void](Read-RuntimeBytes $path 2097152)
    if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()-cne$file.Value){throw 'runtime-code-drift'}
  }
  if((Get-FileHash -LiteralPath 'C:\Program Files\nodejs\node.exe' -Algorithm SHA256).Hash.ToLowerInvariant()-cne$installation.operatorPins.nodeSha256){throw 'runtime-node-pin'}
  return $installation
}
function Runtime-SessionPaths([string]$SessionId){
  if($SessionId-notmatch'^[a-f0-9]{64}$'){throw 'runtime-session'}
  @{ipc=($script:RuntimeRoot+'\ipc\'+$SessionId);state=($script:RuntimeRoot+'\state\sessions\'+$SessionId);worker=($script:RuntimeRoot+'\ipc\'+$SessionId+'\worker')}
}
function Assert-RuntimeTask($Task,[ValidateSet('Supervisor','Worker')][string]$Role,[string]$ExpectedSeal){
  if($ExpectedSeal-notmatch'^[a-f0-9]{64}$'){throw 'runtime-task-seal'}
  $expectedName='RunaAI-Next-HomeRuntime-'+$Role
  $expectedArguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$script:RuntimeRoot+'\code\home-runtime\Run-HomeRuntime'+$Role+'.ps1" -ExpectedSeal '+$ExpectedSeal
  $actions=@($Task.Actions)
  if($Task.TaskName-cne$expectedName-or$Task.TaskPath-cne'\'-or$actions.Count-ne1-or
    $actions[0].Execute-cne'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'-or
    $actions[0].Arguments-cne$expectedArguments-or[string]$actions[0].WorkingDirectory-cne''){throw 'runtime-task-action-drift'}
  $expectedSid=if($Role-ceq'Supervisor'){'S-1-5-18'}else{'S-1-5-19'}
  $sid=[string]$Task.Principal.UserId
  if($sid-notmatch'^S-1-'){try{$sid=(New-Object Security.Principal.NTAccount($sid)).Translate([Security.Principal.SecurityIdentifier]).Value}catch{throw 'runtime-task-principal'}}
  if($sid-cne$expectedSid-or[string]$Task.Principal.LogonType-cne'ServiceAccount'-or[string]$Task.Principal.RunLevel-cne'Limited'){throw 'runtime-task-principal'}
}
