using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

public sealed class RunaContainedProcessResult
{
    public bool Started { get; set; }
    public bool Terminal { get; set; }
    public bool NoSurvivors { get; set; }
    public bool TimedOut { get; set; }
    public bool OutputOverflow { get; set; }
    public uint? ExitCode { get; set; }
    public int OutputBytes { get; set; }
    public string StandardOutput { get; set; }
    public string StandardError { get; set; }
}

public static class RunaContainedProcess
{
    private const uint CreateSuspended = 0x00000004;
    private const uint CreateNoWindow = 0x08000000;
    private const uint StartfUseStdHandles = 0x00000100;
    private const uint HandleFlagInherit = 0x00000001;
    private const uint JobObjectExtendedLimitInformation = 9;
    private const uint JobObjectBasicAccountingInformation = 1;
    private const uint JobObjectLimitKillOnJobClose = 0x00002000;
    private const uint GenericRead = 0x80000000;
    private const uint GenericWrite = 0x40000000;
    private const uint OpenExisting = 3;
    private const uint ShareAll = 7;
    private const uint Infinite = 0xffffffff;
    private const uint WaitObject0 = 0;
    private const uint WaitTimeout = 258;

    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes
    {
        public int Length;
        public IntPtr SecurityDescriptor;
        [MarshalAs(UnmanagedType.Bool)] public bool InheritHandle;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        public int Size;
        public string Reserved;
        public string Desktop;
        public string Title;
        public uint X;
        public uint Y;
        public uint XSize;
        public uint YSize;
        public uint XCountChars;
        public uint YCountChars;
        public uint FillAttribute;
        public uint Flags;
        public ushort ShowWindow;
        public ushort Reserved2;
        public IntPtr ReservedBytes;
        public IntPtr StandardInput;
        public IntPtr StandardOutput;
        public IntPtr StandardError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInformation
    {
        public IntPtr Process;
        public IntPtr Thread;
        public uint ProcessId;
        public uint ThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimitInformation
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimitInformation
    {
        public BasicLimitInformation BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BasicAccountingInformation
    {
        public long TotalUserTime;
        public long TotalKernelTime;
        public long ThisPeriodTotalUserTime;
        public long ThisPeriodTotalKernelTime;
        public uint TotalPageFaultCount;
        public uint TotalProcesses;
        public uint ActiveProcesses;
        public uint TotalTerminatedProcesses;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CreatePipe(out IntPtr readPipe, out IntPtr writePipe,
        ref SecurityAttributes attributes, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcessW(string applicationName, StringBuilder commandLine,
        IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint creationFlags,
        IntPtr environment, string currentDirectory, ref StartupInfo startupInfo, out ProcessInformation processInfo);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr job, uint informationClass, IntPtr information,
        uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateJobObject(IntPtr job, uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryInformationJobObject(IntPtr job, uint informationClass, IntPtr information,
        uint length, out uint returnedLength);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateFileW(string name, uint access, uint share, ref SecurityAttributes attributes,
        uint creation, uint flags, IntPtr template);

    private static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }

    private static Task Drain(IntPtr readHandle, Action<int> count, MemoryStream captured, int captureLimit)
    {
        SafeFileHandle safe = new SafeFileHandle(readHandle, true);
        FileStream stream = new FileStream(safe, FileAccess.Read, 4096, false);
        return Task.Run(() =>
        {
            byte[] buffer = new byte[1024];
            try
            {
                while (true)
                {
                    int read = stream.Read(buffer, 0, buffer.Length);
                    if (read == 0) break;
                    count(read);
                    lock (captured)
                    {
                        int keep = Math.Min(read, Math.Max(0, captureLimit - checked((int)captured.Length)));
                        if (keep > 0) captured.Write(buffer, 0, keep);
                    }
                }
            }
            finally { stream.Dispose(); }
        });
    }

    public static RunaContainedProcessResult Run(string executable, string[] arguments, int timeoutMs,
        int outputLimit)
    {
        if (timeoutMs <= 0 || outputLimit < 0) throw new ArgumentOutOfRangeException();
        RunaContainedProcessResult result = new RunaContainedProcessResult();
        SecurityAttributes inheritable = new SecurityAttributes { Length = Marshal.SizeOf(typeof(SecurityAttributes)),
            SecurityDescriptor = IntPtr.Zero, InheritHandle = true };
        IntPtr stdoutRead = IntPtr.Zero, stdoutWrite = IntPtr.Zero, stderrRead = IntPtr.Zero,
            stderrWrite = IntPtr.Zero, input = IntPtr.Zero, job = IntPtr.Zero;
        ProcessInformation process = new ProcessInformation();
        Task stdoutTask = null, stderrTask = null; int outputBytes = 0;
        MemoryStream stdoutCaptured = new MemoryStream(), stderrCaptured = new MemoryStream();
        try
        {
            if (!CreatePipe(out stdoutRead, out stdoutWrite, ref inheritable, 0)
                || !CreatePipe(out stderrRead, out stderrWrite, ref inheritable, 0))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            if (!SetHandleInformation(stdoutRead, HandleFlagInherit, 0)
                || !SetHandleInformation(stderrRead, HandleFlagInherit, 0))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            input = CreateFileW("NUL", GenericRead | GenericWrite, ShareAll, ref inheritable, OpenExisting, 0,
                IntPtr.Zero);
            if (input == new IntPtr(-1)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            job = CreateJobObjectW(IntPtr.Zero, null);
            if (job == IntPtr.Zero) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            ExtendedLimitInformation limits = new ExtendedLimitInformation();
            limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;
            int limitSize = Marshal.SizeOf(typeof(ExtendedLimitInformation));
            IntPtr limitPointer = Marshal.AllocHGlobal(limitSize);
            try
            {
                Marshal.StructureToPtr(limits, limitPointer, false);
                if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, limitPointer, (uint)limitSize))
                    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            }
            finally { Marshal.FreeHGlobal(limitPointer); }
            StartupInfo startup = new StartupInfo { Size = Marshal.SizeOf(typeof(StartupInfo)),
                Flags = StartfUseStdHandles, StandardInput = input, StandardOutput = stdoutWrite,
                StandardError = stderrWrite };
            StringBuilder command = new StringBuilder(Quote(executable));
            foreach (string argument in arguments) command.Append(" ").Append(Quote(argument));
            if (!CreateProcessW(executable, command, IntPtr.Zero, IntPtr.Zero, true,
                CreateSuspended | CreateNoWindow, IntPtr.Zero, null, ref startup, out process))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            result.Started = true;
            if (!AssignProcessToJobObject(job, process.Process))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            CloseHandle(stdoutWrite); stdoutWrite = IntPtr.Zero;
            CloseHandle(stderrWrite); stderrWrite = IntPtr.Zero;
            stdoutTask = Drain(stdoutRead, count => Interlocked.Add(ref outputBytes, count), stdoutCaptured,
                outputLimit + 1024); stdoutRead = IntPtr.Zero;
            stderrTask = Drain(stderrRead, count => Interlocked.Add(ref outputBytes, count), stderrCaptured,
                outputLimit + 1024); stderrRead = IntPtr.Zero;
            if (ResumeThread(process.Thread) == 0xffffffff)
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            int elapsed = 0; bool terminate = false;
            while (true)
            {
                uint wait = WaitForSingleObject(process.Process, 50);
                if (wait == WaitObject0) break;
                if (wait != WaitTimeout) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                elapsed += 50;
                if (Volatile.Read(ref outputBytes) > outputLimit) { result.OutputOverflow = true; terminate = true; break; }
                if (elapsed >= timeoutMs) { result.TimedOut = true; terminate = true; break; }
            }
            if (terminate)
            {
                if (!TerminateJobObject(job, 0xC000013Au))
                    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                if (WaitForSingleObject(process.Process, 5000) != WaitObject0) return result;
            }
            result.Terminal = true;
            uint exitCode;
            if (!GetExitCodeProcess(process.Process, out exitCode))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            result.ExitCode = exitCode;
            if (stdoutTask != null && !stdoutTask.Wait(5000)) return result;
            if (stderrTask != null && !stderrTask.Wait(5000)) return result;
            result.OutputBytes = Volatile.Read(ref outputBytes);
            if (result.OutputBytes > outputLimit) result.OutputOverflow = true;
            UTF8Encoding strictUtf8 = new UTF8Encoding(false, true);
            try
            {
                result.StandardOutput = strictUtf8.GetString(stdoutCaptured.ToArray());
                result.StandardError = strictUtf8.GetString(stderrCaptured.ToArray());
            }
            catch (DecoderFallbackException)
            {
                result.StandardOutput = null; result.StandardError = null; result.OutputOverflow = true;
            }
            BasicAccountingInformation accounting = new BasicAccountingInformation();
            int accountingSize = Marshal.SizeOf(typeof(BasicAccountingInformation));
            IntPtr accountingPointer = Marshal.AllocHGlobal(accountingSize);
            try
            {
                for (int attempt = 0; attempt <= 100; attempt++)
                {
                    uint returned;
                    if (!QueryInformationJobObject(job, JobObjectBasicAccountingInformation, accountingPointer,
                        (uint)accountingSize, out returned))
                        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                    accounting = (BasicAccountingInformation)Marshal.PtrToStructure(accountingPointer,
                        typeof(BasicAccountingInformation));
                    if (accounting.ActiveProcesses == 0) { result.NoSurvivors = true; break; }
                    if (attempt < 100) Thread.Sleep(50);
                }
            }
            finally { Marshal.FreeHGlobal(accountingPointer); }
            return result;
        }
        finally
        {
            if (process.Thread != IntPtr.Zero) CloseHandle(process.Thread);
            if (process.Process != IntPtr.Zero) CloseHandle(process.Process);
            if (job != IntPtr.Zero) CloseHandle(job);
            if (input != IntPtr.Zero && input != new IntPtr(-1)) CloseHandle(input);
            if (stdoutWrite != IntPtr.Zero) CloseHandle(stdoutWrite);
            if (stderrWrite != IntPtr.Zero) CloseHandle(stderrWrite);
            if (stdoutRead != IntPtr.Zero) CloseHandle(stdoutRead);
            if (stderrRead != IntPtr.Zero) CloseHandle(stderrRead);
            stdoutCaptured.Dispose(); stderrCaptured.Dispose();
        }
    }
}
