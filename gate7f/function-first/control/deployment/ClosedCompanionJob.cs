using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

namespace RunaAI.Next.M1 {
  // Trusted deployment only. The unnamed job handle is never inherited. Atomic
  // JOB_LIST assignment eliminates the suspended-but-not-yet-owned crash gap.
  public static class ClosedCompanionJob {
    static Timer safetyExit;
    [StructLayout(LayoutKind.Sequential)] struct SA { public int size; public IntPtr descriptor; public int inherit; }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct SI {
      public int cb; public string reserved,desktop,title; public int x,y,cx,cy,charsX,charsY,fill,flags;
      public short show,reserved2; public IntPtr reservedPtr,input,output,error;
    }
    [StructLayout(LayoutKind.Sequential)] struct SIX { public SI start; public IntPtr attributes; }
    [StructLayout(LayoutKind.Sequential)] struct PI { public IntPtr process,thread; public int pid,tid; }
    [StructLayout(LayoutKind.Sequential)] struct BASIC {
      public long processTime,jobTime; public uint flags; public UIntPtr min,max; public uint active;
      public UIntPtr affinity; public uint priority,scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IO { public ulong a,b,c,d,e,f; }
    [StructLayout(LayoutKind.Sequential)] struct EXT {
      public BASIC basic; public IO io; public UIntPtr processMemory,jobMemory,peakProcess,peakJob;
    }
    [StructLayout(LayoutKind.Sequential)] struct ACCOUNT {
      public long a,b,c,d; public uint faults,total,active,terminated;
    }
    [StructLayout(LayoutKind.Sequential)] struct FILEINFO {
      public uint attributes; public System.Runtime.InteropServices.ComTypes.FILETIME created,accessed,written;
      public uint volume,sizeHigh,sizeLow,links,indexHigh,indexLow;
    }
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObjectW(IntPtr sa,string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int type,ref EXT value,int size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int type,out ACCOUNT value,int size,IntPtr returned);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref SA sa,int size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr key,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcessW(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref SIX start,out PI process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle file,out FILEINFO info);
    static void Need(bool value) { if(!value) throw new Win32Exception(Marshal.GetLastWin32Error(),"m1-supervisor-native-failure"); }
    static void Close(ref IntPtr handle) { if(handle!=IntPtr.Zero){CloseHandle(handle);handle=IntPtr.Zero;} }
    public static FileStream LockPlainFile(string path) { return LockFile(path,1); }
    public static FileStream LockSystemPowerShell(string path) {
      if(path!=@"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe")throw new IOException("m1-supervisor-system-path");
      return LockFile(path,2);
    }
    static FileStream LockFile(string path,uint expectedLinks) {
      var file = new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read);
      try { FILEINFO info; Need(GetFileInformationByHandle(file.SafeFileHandle,out info));
        if(info.links!=expectedLinks || (info.attributes & 0x410)!=0) throw new IOException("m1-supervisor-linked-file");
        return file;
      } catch {file.Dispose();throw;}
    }
    public sealed class Result {
      public int ProcessId,ExitCode=-1,StdoutBytes,StderrBytes,ActiveProcesses=-1;
      public bool CreatedSuspended,AtomicJobAssigned,AdmissionWritten,Resumed,StopConfirmed,ProcessAbsent,TreeAbsent,
        ExitCodeObserved,TimedOut,OutputLimited,OutputComplete,OutputFaulted;
      public string ProcessStartedAt,StartedAt,FinishedAt,AdmissionSha256,Stdout="";
    }
    sealed class Sink { public long count; public int limited,faulted; public MemoryStream bytes=new MemoryStream(); }
    static Task Pump(Stream source,Sink sink,int limit,bool keep) {
      return Task.Run(()=>{try {var buffer=new byte[4096]; int count;
        while((count=source.Read(buffer,0,buffer.Length))!=0){
          // Continue draining after the cap so the child cannot deadlock on a
          // full pipe, but retain only the bounded fact that the cap was crossed.
          sink.count=Math.Min((long)limit+1,sink.count+count);
          if(sink.count>limit)Interlocked.Exchange(ref sink.limited,1);
          else if(keep)sink.bytes.Write(buffer,0,count);
        }
      } catch {Interlocked.Exchange(ref sink.faulted,1);}});
    }
    public static string Quote(string value) {
      if(value==null||value.IndexOf('\0')>=0)throw new ArgumentException("m1-supervisor-argument");
      var result=new StringBuilder("\"");int slashes=0;
      foreach(char ch in value){if(ch=='\\'){slashes++;continue;}result.Append('\\',slashes*(ch=='"'?2:1)+(ch=='"'?1:0));slashes=0;result.Append(ch);}
      return result.Append('\\',slashes*2).Append('"').ToString();
    }
    static bool Hex64(string value) {
      if(value==null||value.Length!=64)return false;
      foreach(char ch in value)if(!((ch>='0'&&ch<='9')||(ch>='a'&&ch<='f')))return false;
      return true;
    }
    static IntPtr EnvironmentBlock(string[] environment) {
      if(environment==null)return IntPtr.Zero;
      if(environment.Length<1||environment.Length>32)throw new ArgumentException("m1-supervisor-environment");
      var copy=(string[])environment.Clone();Array.Sort(copy,StringComparer.OrdinalIgnoreCase);
      var seen=new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
      var block=new StringBuilder();
      foreach(string item in copy){
        if(item==null||item.IndexOf('\0')>=0){throw new ArgumentException("m1-supervisor-environment");}
        int split=item.IndexOf('=');if(split<1||split>128||item.Length>4096)throw new ArgumentException("m1-supervisor-environment");
        string name=item.Substring(0,split);if(!seen.Add(name))throw new ArgumentException("m1-supervisor-environment");
        block.Append(item).Append('\0');
      }
      block.Append('\0');return Marshal.StringToHGlobalUni(block.ToString());
    }
    static void ValidateV2Environment(string[] environment,string phase,string envelopeSha256,string eligibilitySealSha256) {
      if(environment==null)throw new ArgumentException("m1-supervisor-environment");
      var values=new System.Collections.Generic.Dictionary<string,string>(StringComparer.Ordinal);
      foreach(string item in environment){int split=item==null?-1:item.IndexOf('=');if(split<1)throw new ArgumentException("m1-supervisor-environment");string name=item.Substring(0,split);if(values.ContainsKey(name))throw new ArgumentException("m1-supervisor-environment");values.Add(name,item.Substring(split+1));}
      var expected=new System.Collections.Generic.HashSet<string>(new[]{"ComSpec","LOCALAPPDATA","OS","PATHEXT","PROCESSOR_ARCHITECTURE","SystemDrive","SystemRoot","TEMP","TMP","WINDIR","RUNAAI_GATE3_RESOURCE_PROOF_METHOD","RUNAAI_GATE3_CONTROL_PHASE","RUNAAI_GATE3_CONTROL_LAUNCHER_PID","RUNAAI_GATE3_EXPECTED_ENVELOPE_SHA256","RUNAAI_GATE3_MANIFEST_SHA256","RUNAAI_GATE3_PACKAGE_SHA256"},StringComparer.Ordinal);
      if(phase=="resource-proof")expected.Add("RUNAAI_GATE3_EXPECTED_ELIGIBILITY_SEAL_SHA256");
      if(values.Count!=expected.Count||!expected.SetEquals(values.Keys)
        ||values["ComSpec"]!=@"C:\Windows\System32\cmd.exe"||values["OS"]!="Windows_NT"
        ||values["PATHEXT"]!=".COM;.EXE;.BAT;.CMD"||values["PROCESSOR_ARCHITECTURE"]!="AMD64"
        ||values["SystemDrive"]!="C:"||values["SystemRoot"]!=@"C:\Windows"||values["WINDIR"]!=@"C:\Windows"
        ||values["RUNAAI_GATE3_CONTROL_PHASE"]!=phase||values["RUNAAI_GATE3_EXPECTED_ENVELOPE_SHA256"]!=envelopeSha256
        ||!Hex64(values["RUNAAI_GATE3_MANIFEST_SHA256"])||!Hex64(values["RUNAAI_GATE3_PACKAGE_SHA256"])
        ||(phase=="resource-proof"&&values["RUNAAI_GATE3_EXPECTED_ELIGIBILITY_SEAL_SHA256"]!=eligibilitySealSha256)
        ||values["RUNAAI_GATE3_CONTROL_LAUNCHER_PID"]!=Process.GetCurrentProcess().Id.ToString()
        ||values["RUNAAI_GATE3_RESOURCE_PROOF_METHOD"].Length!=32)throw new ArgumentException("m1-supervisor-environment");
      foreach(char ch in values["RUNAAI_GATE3_RESOURCE_PROOF_METHOD"])if(!((ch>='0'&&ch<='9')||(ch>='a'&&ch<='f')))throw new ArgumentException("m1-supervisor-environment");
      string local=Path.GetFullPath(values["LOCALAPPDATA"]),temp=Path.GetFullPath(values["TEMP"]),tmp=Path.GetFullPath(values["TMP"]);
      if(local!=values["LOCALAPPDATA"]||temp!=values["TEMP"]||tmp!=values["TMP"]||temp!=tmp
        ||Path.GetFileName(local)!="localappdata"||Path.GetFileName(temp)!="temp"
        ||!String.Equals(Path.GetDirectoryName(local),Path.GetDirectoryName(temp),StringComparison.OrdinalIgnoreCase))throw new ArgumentException("m1-supervisor-environment");
    }
    static byte[] Admission(byte[] secret,string phase,string envelopeSha256,string eligibilitySealSha256,int supervisorPid,int childPid) {
      ValidateAdmission(secret,phase,envelopeSha256,eligibilitySealSha256);
      var binding=Encoding.ASCII.GetBytes("runaai-native-gate3-control-launch-capability/v1\0"+phase+"\0"+envelopeSha256+"\0"+
        eligibilitySealSha256+"\0"+supervisorPid.ToString()+"\0"+childPid.ToString());
      try {using(var hmac=new HMACSHA256(secret)){var mac=hmac.ComputeHash(binding);var wire=new byte[64];
        Buffer.BlockCopy(secret,0,wire,0,32);Buffer.BlockCopy(mac,0,wire,32,32);Array.Clear(mac,0,mac.Length);return wire;}
      } finally {Array.Clear(binding,0,binding.Length);}
    }
    static void ValidateAdmission(byte[] secret,string phase,string envelopeSha256,string eligibilitySealSha256) {
      if(secret==null||secret.Length!=32||!(phase=="eligibility"||phase=="resource-proof")||!Hex64(envelopeSha256)
        ||(phase=="eligibility"?eligibilitySealSha256!="-":!Hex64(eligibilitySealSha256)))
        throw new ArgumentException("m1-supervisor-admission");
    }
    public static Result Run(string executable,string[] arguments,string directory,long deadlineUnixMs,int maximumBytes,Action<object> recordStart) {
      return RunCore(executable,arguments,directory,null,deadlineUnixMs,maximumBytes,null,null,null,null,recordStart);
    }
    public static Result RunV2(string executable,string[] arguments,string directory,string[] environment,long deadlineUnixMs,int maximumBytes,
      byte[] admissionSecret,string phase,string envelopeSha256,string eligibilitySealSha256,Action<object> recordStart) {
      return RunCore(executable,arguments,directory,environment,deadlineUnixMs,maximumBytes,admissionSecret,phase,envelopeSha256,eligibilitySealSha256,recordStart);
    }
    static Result RunCore(string executable,string[] arguments,string directory,string[] environment,long deadlineUnixMs,int maximumBytes,
      byte[] admissionSecret,string phase,string envelopeSha256,string eligibilitySealSha256,Action<object> recordStart) {
      long now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),remaining=deadlineUnixMs-now;
      if(!Path.IsPathRooted(executable)||!Path.IsPathRooted(directory)||remaining<1||remaining>600000
        ||maximumBytes<1||maximumBytes>262144||recordStart==null||arguments==null||arguments.Length>100)
        throw new ArgumentException("m1-supervisor-boundary");
      bool v2=admissionSecret!=null;if(v2)ValidateAdmission(admissionSecret,phase,envelopeSha256,eligibilitySealSha256);
      if(v2)ValidateV2Environment(environment,phase,envelopeSha256,eligibilitySealSha256);
      var quoted=new StringBuilder(Quote(executable));foreach(string arg in arguments)quoted.Append(' ').Append(Quote(arg));
      if(quoted.Length>30000)throw new ArgumentException("m1-supervisor-argument-cap");
      IntPtr job=IntPtr.Zero,readOut=IntPtr.Zero,writeOut=IntPtr.Zero,readErr=IntPtr.Zero,writeErr=IntPtr.Zero;
      IntPtr readIn=IntPtr.Zero,writeIn=IntPtr.Zero,list=IntPtr.Zero,handles=IntPtr.Zero,jobs=IntPtr.Zero;
      PI process=new PI();FileStream stdout=null,stderr=null;IntPtr environmentBlock=IntPtr.Zero;
      var result=new Result {StartedAt=DateTime.UtcNow.ToString("o")};var output=new Sink();var error=new Sink();
      try {
        job=CreateJobObjectW(IntPtr.Zero,null);Need(job!=IntPtr.Zero);
        var limits=new EXT();limits.basic.flags=0x2000; // KILL_ON_JOB_CLOSE, no breakaway.
        Need(SetInformationJobObject(job,9,ref limits,Marshal.SizeOf(typeof(EXT))));
        // This is independent of the caller/runspace, including a blocked start
        // observer. Process exit closes the sole job handle. No success receipt.
        safetyExit=new Timer(_=>Environment.Exit(124),null,checked((int)Math.Max(1,deadlineUnixMs+5000-DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())),Timeout.Infinite);
        var sa=new SA {size=Marshal.SizeOf(typeof(SA)),inherit=1};
        Need(CreatePipe(out readOut,out writeOut,ref sa,0));Need(SetHandleInformation(readOut,1,0));
        Need(CreatePipe(out readErr,out writeErr,ref sa,0));Need(SetHandleInformation(readErr,1,0));
        Need(CreatePipe(out readIn,out writeIn,ref sa,0));if(!v2)Close(ref writeIn); // v1 stdin is fixed EOF.
        IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref size);
        list=Marshal.AllocHGlobal(size);Need(InitializeProcThreadAttributeList(list,2,0,ref size));
        handles=Marshal.AllocHGlobal(IntPtr.Size*3);Marshal.WriteIntPtr(handles,0,readIn);
        Marshal.WriteIntPtr(handles,IntPtr.Size,writeOut);Marshal.WriteIntPtr(handles,IntPtr.Size*2,writeErr);
        Need(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero));
        jobs=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobs,job);
        Need(UpdateProcThreadAttribute(list,0,new IntPtr(0x2000D),jobs,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
        var start=new SIX();start.start.cb=Marshal.SizeOf(typeof(SIX));start.start.flags=0x100;
        start.start.input=readIn;start.start.output=writeOut;start.start.error=writeErr;start.attributes=list;
        environmentBlock=EnvironmentBlock(environment);
        Need(CreateProcessW(executable,quoted,IntPtr.Zero,IntPtr.Zero,true,environment==null?0x08080004u:0x08080404u,
          environmentBlock,directory,ref start,out process));
        result.CreatedSuspended=true;result.AtomicJobAssigned=true;result.ProcessId=process.pid;
        using(var child=Process.GetProcessById(process.pid)) result.ProcessStartedAt=child.StartTime.ToUniversalTime().ToString("o");
        Close(ref writeOut);Close(ref writeErr);Close(ref readIn);
        stdout=new FileStream(new SafeFileHandle(readOut,true),FileAccess.Read);readOut=IntPtr.Zero;
        stderr=new FileStream(new SafeFileHandle(readErr,true),FileAccess.Read);readErr=IntPtr.Zero;
        var outTask=Pump(stdout,output,maximumBytes,true);var errTask=Pump(stderr,error,maximumBytes,false);
        recordStart(result); // fsynced before the first child instruction.
        if(v2){var wire=Admission(admissionSecret,phase,envelopeSha256,eligibilitySealSha256,Process.GetCurrentProcess().Id,process.pid);
          try {using(var sha=SHA256.Create())result.AdmissionSha256=BitConverter.ToString(sha.ComputeHash(wire)).Replace("-","").ToLowerInvariant();
            using(var input=new FileStream(new SafeFileHandle(writeIn,true),FileAccess.Write)){writeIn=IntPtr.Zero;
            input.Write(wire,0,wire.Length);input.Flush();}result.AdmissionWritten=true;}finally{Array.Clear(wire,0,wire.Length);Array.Clear(admissionSecret,0,admissionSecret.Length);}}
        if(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()>=deadlineUnixMs)result.TimedOut=true;
        else {Need(ResumeThread(process.thread)!=0xFFFFFFFF);result.Resumed=true;}
        while(result.Resumed && WaitForSingleObject(process.process,20)==0x102){
          result.TimedOut=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()>=deadlineUnixMs;
          result.OutputLimited=output.limited!=0||error.limited!=0;
          if(result.TimedOut||result.OutputLimited)break;
        }
        // Also kill residual descendants after a normally exited companion.
        Need(TerminateJobObject(job,124));
        var stopped=Stopwatch.StartNew();ACCOUNT account;
        do {Need(QueryInformationJobObject(job,1,out account,Marshal.SizeOf(typeof(ACCOUNT)),IntPtr.Zero));
          result.ActiveProcesses=(int)account.active;if(account.active==0)break;Thread.Sleep(10);
        }while(stopped.ElapsedMilliseconds<2000);
        result.ProcessAbsent=WaitForSingleObject(process.process,2000)==0;result.TreeAbsent=result.ActiveProcesses==0;
        result.StopConfirmed=result.TreeAbsent&&result.ProcessAbsent;
        uint exit;if(result.StopConfirmed&&GetExitCodeProcess(process.process,out exit)&&exit!=259){result.ExitCode=(int)exit;result.ExitCodeObserved=true;}
        try {result.OutputComplete=Task.WaitAll(new[]{outTask,errTask},2000);}catch{result.OutputComplete=false;}
        result.OutputFaulted=output.faulted!=0||error.faulted!=0;
        result.OutputLimited=result.OutputLimited||output.limited!=0||error.limited!=0;
        result.StdoutBytes=(int)output.count;result.StderrBytes=(int)error.count;
        if(result.OutputComplete&&!result.OutputLimited&&!result.OutputFaulted)result.Stdout=new UTF8Encoding(false,true).GetString(output.bytes.ToArray());
        return result;
      } finally {
        if(job!=IntPtr.Zero){TerminateJobObject(job,124);Close(ref job);}
        Close(ref process.thread);Close(ref process.process);
        if(stdout!=null)stdout.Dispose();if(stderr!=null)stderr.Dispose();
        Close(ref readOut);Close(ref writeOut);Close(ref readErr);Close(ref writeErr);Close(ref readIn);Close(ref writeIn);
        if(list!=IntPtr.Zero){DeleteProcThreadAttributeList(list);Marshal.FreeHGlobal(list);}
        if(handles!=IntPtr.Zero)Marshal.FreeHGlobal(handles);if(jobs!=IntPtr.Zero)Marshal.FreeHGlobal(jobs);
        if(environmentBlock!=IntPtr.Zero)Marshal.FreeHGlobal(environmentBlock);
        if(admissionSecret!=null)Array.Clear(admissionSecret,0,admissionSecret.Length);
        // Keep the independent timer rooted until this one-shot watchdog exits,
        // including terminal journal I/O after Run returns. Never reuse this process.
        result.FinishedAt=DateTime.UtcNow.ToString("o");
      }
    }
  }
}
