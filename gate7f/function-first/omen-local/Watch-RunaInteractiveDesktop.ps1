$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest

$source=@'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Runa.Omen.Ui {
  public static class BoundedInput {
    public static Task<string> ReadLineAsync(TextReader reader, int maximum) { return Task.Run(() => ReadLine(reader, maximum)); }
    public static string ReadLine(TextReader reader, int maximum) {
      var value=new StringBuilder();
      while(true) {
        int next=reader.Read();
        if(next<0) return value.Length==0?null:value.ToString();
        if(next=='\n') return value.ToString();
        if(next=='\r') continue;
        if(value.Length>=maximum) throw new InvalidDataException("ui-input-overflow");
        value.Append((char)next);
      }
    }
  }

  public sealed class InputDesktopWitness : IDisposable {
    const uint EVENT_OBJECT_CREATE=0x8000, EVENT_OBJECT_SHOW=0x8002;
    const int OBJID_WINDOW=0, CHILDID_SELF=0, WM_QUIT=0x0012;
    const uint WINEVENT_OUTOFCONTEXT=0, WINEVENT_SKIPOWNPROCESS=2;
    const uint DESKTOP_READOBJECTS=0x0001, DESKTOP_HOOKCONTROL=0x0008, DESKTOP_ENUMERATE=0x0040;
    const uint PROCESS_QUERY_LIMITED_INFORMATION=0x1000;
    const int MaximumEvents=10000;
    delegate void WinEventDelegate(IntPtr hook,uint evt,IntPtr hwnd,int objectId,int childId,uint thread,uint time);
    delegate bool EnumWindowsDelegate(IntPtr hwnd,IntPtr value);
    [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public UIntPtr wParam; public IntPtr lParam; public uint time; public int ptX,ptY; }
    sealed class WindowEvent { public IntPtr Hwnd; public uint Pid; public uint Event; }
    sealed class ImageQuery { public bool Exists; public string Image; public int Error; }

    [DllImport("user32.dll",SetLastError=true)] static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
    [DllImport("user32.dll",SetLastError=true)] static extern bool SetThreadDesktop(IntPtr desktop);
    [DllImport("user32.dll",SetLastError=true)] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetWinEventHook(uint min,uint max,IntPtr module,WinEventDelegate callback,uint process,uint thread,uint flags);
    [DllImport("user32.dll",SetLastError=true)] static extern bool UnhookWinEvent(IntPtr hook);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint process);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll",SetLastError=true)] static extern bool EnumDesktopWindows(IntPtr desktop,EnumWindowsDelegate callback,IntPtr value);
    [DllImport("user32.dll",SetLastError=true)] static extern int GetMessage(out MSG msg,IntPtr hwnd,uint min,uint max);
    [DllImport("user32.dll",SetLastError=true)] static extern bool TranslateMessage(ref MSG msg);
    [DllImport("user32.dll",SetLastError=true)] static extern IntPtr DispatchMessage(ref MSG msg);
    [DllImport("user32.dll",SetLastError=true)] static extern bool PostThreadMessage(uint thread,uint message,UIntPtr wparam,IntPtr lparam);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint process);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder image,ref uint size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);

    readonly string mxcImage,gitImage;
    readonly object sync=new object();
    readonly List<WindowEvent> buffered=new List<WindowEvent>();
    readonly HashSet<uint> attributablePids=new HashSet<uint>();
    readonly ManualResetEventSlim ready=new ManualResetEventSlim(false);
    Thread thread; IntPtr desktop,createHook,showHook; WinEventDelegate callback; EnumWindowsDelegate enumerator;
    uint threadId,wrapperPid; bool bound,disposed; long events,attributable,errors,lastEventTicks; string abortCode;

    public InputDesktopWitness(string mxc,string git) { mxcImage=mxc;gitImage=git;thread=new Thread(Run);thread.IsBackground=true;thread.SetApartmentState(ApartmentState.STA);thread.Start(); }
    public bool WaitReady(int milliseconds) { return ready.Wait(milliseconds); }
    public string AbortCode { get { lock(sync) return abortCode; } }
    public long EventCount { get { return Interlocked.Read(ref events); } }
    public long AttributableCount { get { return Interlocked.Read(ref attributable); } }
    public long ErrorCount { get { return Interlocked.Read(ref errors); } }
    public long LastEventTicks { get { return Interlocked.Read(ref lastEventTicks); } }
    void Latch(string code) { lock(sync) if(abortCode==null) abortCode=code; }
    void Fail(string code) { Interlocked.Increment(ref errors);Latch(code); }
    static ImageQuery Image(uint pid) {
      IntPtr process=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,false,pid);
      if(process==IntPtr.Zero) { int error=Marshal.GetLastWin32Error();return new ImageQuery{Exists=error!=87&&error!=1168,Error=error}; }
      var query=new ImageQuery{Exists=true};
      try {
        var result=new StringBuilder(32768);uint size=(uint)result.Capacity;
        if(!QueryFullProcessImageName(process,0,result,ref size)) { int error=Marshal.GetLastWin32Error();query.Exists=error!=87&&error!=1168;query.Error=error; }
        else query.Image=Path.GetFullPath(result.ToString());
      } catch { query.Error=-1; }
      finally { if(!CloseHandle(process)&&query.Error==0)query.Error=Marshal.GetLastWin32Error(); }
      return query;
    }
    void Classify(WindowEvent value) {
      if(!IsWindowVisible(value.Hwnd)&&value.Event!=EVENT_OBJECT_SHOW) return;
      ImageQuery query=Image(value.Pid);
      if(!query.Exists||query.Error!=0||query.Image==null){Fail("ui-owner-unresolved");return;}
      string image=query.Image;
      if(value.Pid==wrapperPid&&!String.Equals(image,mxcImage,StringComparison.OrdinalIgnoreCase)){Fail("ui-wrapper-identity-mismatch");return;}
      if(value.Pid==wrapperPid||String.Equals(image,gitImage,StringComparison.OrdinalIgnoreCase)){
        lock(sync) attributablePids.Add(value.Pid);
        Interlocked.Increment(ref attributable);Latch("interactive-window-observed");
      }
    }
    void OnEvent(IntPtr hook,uint evt,IntPtr hwnd,int objectId,int childId,uint eventThread,uint time) {
      try {
        if(hwnd==IntPtr.Zero||objectId!=OBJID_WINDOW||childId!=CHILDID_SELF) return;
        uint pid; if(GetWindowThreadProcessId(hwnd,out pid)==0||pid==0){Fail("ui-owner-unresolved");return;}
        long count=Interlocked.Increment(ref events);Interlocked.Exchange(ref lastEventTicks,DateTime.UtcNow.Ticks);
        if(count>MaximumEvents){Latch("ui-event-overflow");return;}
        var value=new WindowEvent{Hwnd=hwnd,Pid=pid,Event=evt};
        lock(sync){if(!bound){buffered.Add(value);return;}}
        Classify(value);
      } catch { Fail("ui-hook-error"); }
    }
    void Run() {
      try {
        threadId=GetCurrentThreadId();
        desktop=OpenInputDesktop(0,false,DESKTOP_READOBJECTS|DESKTOP_HOOKCONTROL|DESKTOP_ENUMERATE);
        if(desktop==IntPtr.Zero||!SetThreadDesktop(desktop)){Fail("ui-hook-error");ready.Set();return;}
        callback=OnEvent;
        createHook=SetWinEventHook(EVENT_OBJECT_CREATE,EVENT_OBJECT_CREATE,IntPtr.Zero,callback,0,0,WINEVENT_OUTOFCONTEXT|WINEVENT_SKIPOWNPROCESS);
        showHook=SetWinEventHook(EVENT_OBJECT_SHOW,EVENT_OBJECT_SHOW,IntPtr.Zero,callback,0,0,WINEVENT_OUTOFCONTEXT|WINEVENT_SKIPOWNPROCESS);
        if(createHook==IntPtr.Zero||showHook==IntPtr.Zero){Fail("ui-hook-error");ready.Set();return;}
        Interlocked.Exchange(ref lastEventTicks,DateTime.UtcNow.Ticks);ready.Set();
        MSG msg;while(true){int result=GetMessage(out msg,IntPtr.Zero,0,0);if(result==0)break;if(result<0){Fail("ui-hook-error");break;}TranslateMessage(ref msg);DispatchMessage(ref msg);}
      } catch { Fail("ui-hook-error");ready.Set(); }
      finally {
        if(createHook!=IntPtr.Zero&&!UnhookWinEvent(createHook))Fail("ui-hook-error");
        if(showHook!=IntPtr.Zero&&!UnhookWinEvent(showHook))Fail("ui-hook-error");
      }
    }
    void Enumerate() {
      enumerator=(hwnd,value)=>{if(!IsWindowVisible(hwnd))return true;uint pid;if(GetWindowThreadProcessId(hwnd,out pid)==0||pid==0){Fail("ui-owner-unresolved");return false;}long count=Interlocked.Increment(ref events);if(count>MaximumEvents){Latch("ui-event-overflow");return false;}Classify(new WindowEvent{Hwnd=hwnd,Pid=pid,Event=EVENT_OBJECT_SHOW});return AbortCode==null;};
      if(!EnumDesktopWindows(desktop,enumerator,IntPtr.Zero))Fail("ui-hook-error");
    }
    public void Bind(uint pid) {
      lock(sync){if(bound){Latch("ui-protocol-invalid");return;}wrapperPid=pid;bound=true;}
      Enumerate();WindowEvent[] pending;lock(sync){pending=buffered.ToArray();buffered.Clear();}foreach(var item in pending)Classify(item);
    }
    public bool SurvivorObserved() {
      var ids=new List<uint>();lock(sync){ids.Add(wrapperPid);ids.AddRange(attributablePids);}
      foreach(uint pid in ids){if(pid==0)continue;ImageQuery query=Image(pid);if(!query.Exists)continue;
        if(query.Error!=0||query.Image==null){Fail("ui-owner-unresolved");continue;}string image=query.Image;
        if(pid==wrapperPid&&!String.Equals(image,mxcImage,StringComparison.OrdinalIgnoreCase)){Latch("ui-wrapper-identity-mismatch");continue;}
        if(pid==wrapperPid||String.Equals(image,gitImage,StringComparison.OrdinalIgnoreCase))return true;}
      return false;
    }
    public void FinalEnumerate(){Enumerate();}
    public bool Stop(int milliseconds) {
      if(threadId!=0&&thread!=null&&thread.IsAlive&&!PostThreadMessage(threadId,WM_QUIT,UIntPtr.Zero,IntPtr.Zero))Fail("ui-hook-error");
      bool stopped=thread==null||thread.Join(milliseconds);if(!stopped)Fail("ui-hook-error");return stopped;
    }
    public void Dispose(){if(disposed)return;disposed=true;Stop(2000);if(desktop!=IntPtr.Zero){if(!CloseDesktop(desktop))Fail("ui-hook-error");desktop=IntPtr.Zero;}ready.Dispose();}
  }
}
'@
Add-Type -TypeDefinition $source -Language CSharp

function Read-BoundedLine([int]$Maximum){[Runa.Omen.Ui.BoundedInput]::ReadLine([Console]::In,$Maximum)}
function Get-Keys($Value){@($Value.PSObject.Properties.Name|Sort-Object)}
function Assert-Keys($Value,[string[]]$Expected){if($null-eq$Value-or((Get-Keys $Value)-join"`0")-cne(@($Expected|Sort-Object)-join"`0")){throw 'ui-protocol-invalid'}}
function Decode-Frame([string]$Line){
  if([string]::IsNullOrEmpty($Line)-or$Line.Length-gt8192-or$Line-notmatch'^[A-Za-z0-9_-]+$'){throw 'ui-protocol-invalid'}
  $text=$Line.Replace('-','+').Replace('_','/');switch($text.Length%4){2{$text+='=='}3{$text+='='}1{throw 'ui-protocol-invalid'}}
  $bytes=[Convert]::FromBase64String($text);if($bytes.Length-gt6144){throw 'ui-protocol-invalid'}
  $utf8=New-Object Text.UTF8Encoding($false,$true);return $utf8.GetString($bytes)|ConvertFrom-Json
}
function Write-Json($Value){[Console]::Out.WriteLine(($Value|ConvertTo-Json -Compress -Depth 4));[Console]::Out.Flush()}
function Valid-Image([string]$Value){$Value.Length-ge3-and$Value.Length-le32767-and$Value-notmatch'[\x00-\x1f\x7f]'-and[IO.Path]::IsPathRooted($Value)-and[IO.Path]::GetFullPath($Value)-ceq$Value}

$operationId=$null;$witness=$null;$abortWritten=$false;$exitCode=1
try{
  $start=Decode-Frame (Read-BoundedLine 8192);Assert-Keys $start @('schemaVersion','operationId','mxcImage','gitImage')
  if($start.schemaVersion-cne'runa-omen-ui-witness-start/v1'-or[string]$start.operationId-cnotmatch'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'){throw 'ui-protocol-invalid'}
  $operationId=[string]$start.operationId;$mxc=[string]$start.mxcImage;$git=[string]$start.gitImage
  if(-not(Valid-Image $mxc)-or-not(Valid-Image $git)){throw 'ui-protocol-invalid'}
  $witness=New-Object Runa.Omen.Ui.InputDesktopWitness($mxc,$git)
  if(-not$witness.WaitReady(10000)){throw 'ui-hook-error'}
  if($null-eq$witness.AbortCode){Write-Json ([ordered]@{schemaVersion='runa-omen-ui-witness-ready/v1';operationId=$operationId})}
  else{Write-Json ([ordered]@{schemaVersion='runa-omen-ui-witness-abort/v1';operationId=$operationId;errorCode=$witness.AbortCode});$abortWritten=$true}
  $bindLine=Read-BoundedLine 8192
  if($bindLine-ceq'cancel'){$witness.Dispose();if($null-eq$witness.AbortCode){exit 0}else{throw 'ui-hook-error'}}
  $bind=Decode-Frame $bindLine;Assert-Keys $bind @('schemaVersion','operationId','wrapperPid')
  if($bind.schemaVersion-cne'runa-omen-ui-witness-bind/v1'-or$bind.operationId-cne$operationId-or
    ($bind.wrapperPid-isnot[int]-and$bind.wrapperPid-isnot[long])-or$bind.wrapperPid-lt1-or
    [int64]$bind.wrapperPid-gt4294967295){throw 'ui-protocol-invalid'}
  $witness.Bind([uint32]$bind.wrapperPid)
  $control=[Runa.Omen.Ui.BoundedInput]::ReadLineAsync([Console]::In,8192)
  while(-not$control.IsCompleted){if(-not$abortWritten-and$null-ne$witness.AbortCode){Write-Json ([ordered]@{schemaVersion='runa-omen-ui-witness-abort/v1';operationId=$operationId;errorCode=$witness.AbortCode});$abortWritten=$true};Start-Sleep -Milliseconds 10}
  if($control.GetAwaiter().GetResult()-cne'complete'){throw 'ui-protocol-invalid'}
  $drainStart=[DateTime]::UtcNow
  while(([DateTime]::UtcNow.Ticks-$witness.LastEventTicks)-lt2500000){if(([DateTime]::UtcNow-$drainStart).TotalMilliseconds-ge5000){throw 'ui-hook-error'};Start-Sleep -Milliseconds 25}
  $witness.FinalEnumerate();$survivor=$witness.SurvivorObserved();$witness.Dispose()
  if(-not$abortWritten-and$null-ne$witness.AbortCode){Write-Json ([ordered]@{schemaVersion='runa-omen-ui-witness-abort/v1';operationId=$operationId;errorCode=$witness.AbortCode});$abortWritten=$true}
  Write-Json ([ordered]@{schemaVersion='runa-omen-ui-witness-result/v1';operationId=$operationId;inputDesktopEvents=$witness.EventCount;
    attributableWindowEvents=$witness.AttributableCount;errors=$witness.ErrorCount;overflow=($witness.EventCount-gt10000);
    survivorObserved=$survivor;privateValuesIncluded=$false})
  if($null-eq$witness.AbortCode-and-not$survivor){$exitCode=0}
}catch{
  if($null-ne$operationId-and-not$abortWritten){try{Write-Json ([ordered]@{schemaVersion='runa-omen-ui-witness-abort/v1';operationId=$operationId;errorCode='ui-protocol-invalid'})}catch{}}
}finally{if($null-ne$witness){try{$witness.Dispose()}catch{}}}
exit $exitCode
