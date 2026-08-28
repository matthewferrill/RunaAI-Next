using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
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
      public bool CreatedSuspended,AtomicJobAssigned,Resumed,StopConfirmed,TimedOut,OutputLimited,OutputComplete;
      public string ProcessStartedAt,StartedAt,FinishedAt,Stdout="";
    }
    sealed class Sink { public int count,limited; public MemoryStream bytes=new MemoryStream(); }
    static Task Pump(Stream source,Sink sink,int limit,bool keep) {
      return Task.Run(()=>{var buffer=new byte[4096]; int count;
        while((count=source.Read(buffer,0,buffer.Length))!=0){
          sink.count+=count;
          if(sink.count>limit){Interlocked.Exchange(ref sink.limited,1);return;}
          if(keep)sink.bytes.Write(buffer,0,count);
        }
      });
    }
    public static string Quote(string value) {
      if(value==null||value.IndexOf('\0')>=0)throw new ArgumentException("m1-supervisor-argument");
      var result=new StringBuilder("\"");int slashes=0;
      foreach(char ch in value){if(ch=='\\'){slashes++;continue;}result.Append('\\',slashes*(ch=='"'?2:1)+(ch=='"'?1:0));slashes=0;result.Append(ch);}
      return result.Append('\\',slashes*2).Append('"').ToString();
    }
    public static Result Run(string executable,string[] arguments,string directory,long deadlineUnixMs,int maximumBytes,Action<object> recordStart) {
      long now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),remaining=deadlineUnixMs-now;
      if(!Path.IsPathRooted(executable)||!Path.IsPathRooted(directory)||remaining<1||remaining>600000
        ||maximumBytes<1||maximumBytes>262144||recordStart==null||arguments.Length>100)
        throw new ArgumentException("m1-supervisor-boundary");
      var quoted=new StringBuilder(Quote(executable));foreach(string arg in arguments)quoted.Append(' ').Append(Quote(arg));
      if(quoted.Length>30000)throw new ArgumentException("m1-supervisor-argument-cap");
      IntPtr job=IntPtr.Zero,readOut=IntPtr.Zero,writeOut=IntPtr.Zero,readErr=IntPtr.Zero,writeErr=IntPtr.Zero;
      IntPtr readIn=IntPtr.Zero,writeIn=IntPtr.Zero,list=IntPtr.Zero,handles=IntPtr.Zero,jobs=IntPtr.Zero;
      PI process=new PI();FileStream stdout=null,stderr=null;
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
        Need(CreatePipe(out readIn,out writeIn,ref sa,0));Close(ref writeIn); // stdin EOF, not a command channel.
        IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref size);
        list=Marshal.AllocHGlobal(size);Need(InitializeProcThreadAttributeList(list,2,0,ref size));
        handles=Marshal.AllocHGlobal(IntPtr.Size*3);Marshal.WriteIntPtr(handles,0,readIn);
        Marshal.WriteIntPtr(handles,IntPtr.Size,writeOut);Marshal.WriteIntPtr(handles,IntPtr.Size*2,writeErr);
        Need(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero));
        jobs=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobs,job);
        Need(UpdateProcThreadAttribute(list,0,new IntPtr(0x2000D),jobs,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
        var start=new SIX();start.start.cb=Marshal.SizeOf(typeof(SIX));start.start.flags=0x100;
        start.start.input=readIn;start.start.output=writeOut;start.start.error=writeErr;start.attributes=list;
        Need(CreateProcessW(executable,quoted,IntPtr.Zero,IntPtr.Zero,true,0x08080004,IntPtr.Zero,directory,ref start,out process));
        result.CreatedSuspended=true;result.AtomicJobAssigned=true;result.ProcessId=process.pid;
        using(var child=Process.GetProcessById(process.pid)) result.ProcessStartedAt=child.StartTime.ToUniversalTime().ToString("o");
        Close(ref writeOut);Close(ref writeErr);Close(ref readIn);
        stdout=new FileStream(new SafeFileHandle(readOut,true),FileAccess.Read);readOut=IntPtr.Zero;
        stderr=new FileStream(new SafeFileHandle(readErr,true),FileAccess.Read);readErr=IntPtr.Zero;
        var outTask=Pump(stdout,output,maximumBytes,true);var errTask=Pump(stderr,error,maximumBytes,false);
        recordStart(result); // fsynced before the first child instruction.
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
        result.StopConfirmed=result.ActiveProcesses==0&&WaitForSingleObject(process.process,2000)==0;
        uint exit;if(result.StopConfirmed && GetExitCodeProcess(process.process,out exit))result.ExitCode=(int)exit;
        try {result.OutputComplete=Task.WaitAll(new[]{outTask,errTask},2000);}catch{result.OutputComplete=false;}
        result.OutputLimited=result.OutputLimited||output.limited!=0||error.limited!=0;
        result.StdoutBytes=output.count;result.StderrBytes=error.count;
        if(result.OutputComplete&&!result.OutputLimited)result.Stdout=new UTF8Encoding(false,true).GetString(output.bytes.ToArray());
        return result;
      } finally {
        if(job!=IntPtr.Zero){TerminateJobObject(job,124);Close(ref job);}
        Close(ref process.thread);Close(ref process.process);
        if(stdout!=null)stdout.Dispose();if(stderr!=null)stderr.Dispose();
        Close(ref readOut);Close(ref writeOut);Close(ref readErr);Close(ref writeErr);Close(ref readIn);Close(ref writeIn);
        if(list!=IntPtr.Zero){DeleteProcThreadAttributeList(list);Marshal.FreeHGlobal(list);}
        if(handles!=IntPtr.Zero)Marshal.FreeHGlobal(handles);if(jobs!=IntPtr.Zero)Marshal.FreeHGlobal(jobs);
        // Keep the independent timer rooted until this one-shot watchdog exits,
        // including terminal journal I/O after Run returns. Never reuse this process.
        result.FinishedAt=DateTime.UtcNow.ToString("o");
      }
    }
  }
}
