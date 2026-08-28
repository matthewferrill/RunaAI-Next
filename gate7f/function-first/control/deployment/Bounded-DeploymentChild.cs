using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace RunaAI.Next.M1 {
  // Trusted deployment children only. No shell, stdin, inherited visible window,
  // unbounded output or unbounded process wait. This does not make a timed-out
  // operation atomic: callers must retain outcome-unknown and reconcile it.
  public static class DeploymentChild {
    public sealed class Result {
      public bool Started, StopConfirmed, TimedOut, OutputLimited, OutputComplete;
      public int ProcessId, ExitCode, StdoutBytes, StderrBytes;
      public string StartedAt, ProcessStartedAt, FinishedAt, Stdout;
    }
    sealed class Sink {
      public int Count, Limited;
      public MemoryStream Bytes = new MemoryStream();
    }
    public static string Quote(string value) {
      if (value == null || value.IndexOf('\0') >= 0) throw new ArgumentException("m1-child-argument-invalid");
      var result = new StringBuilder("\""); int slashes = 0;
      foreach (char character in value) {
        if (character == '\\') { slashes++; continue; }
        if (character == '"') result.Append('\\', slashes * 2 + 1);
        else result.Append('\\', slashes);
        slashes = 0; result.Append(character);
      }
      return result.Append('\\', slashes * 2).Append('"').ToString();
    }
    static async Task Pump(Stream source, Sink sink, bool keep, int maximumBytes) {
      byte[] bytes = new byte[4096]; int count;
      while ((count = await source.ReadAsync(bytes, 0, bytes.Length).ConfigureAwait(false)) != 0) {
        sink.Count += count;
        if (sink.Count > maximumBytes) { Interlocked.Exchange(ref sink.Limited, 1); return; }
        if (keep) sink.Bytes.Write(bytes, 0, count);
      }
    }
    public static Result Run(string executable, string[] arguments, int maximumMs, int maximumBytes) {
      return Execute(executable, arguments, maximumMs, maximumBytes, null);
    }
    public static Result RunObserved(string executable, string[] arguments, int maximumMs, int maximumBytes, Action<object> observeStarted) {
      if (observeStarted == null) throw new ArgumentException("m1-child-observer-required");
      return Execute(executable, arguments, maximumMs, maximumBytes, observeStarted);
    }
    static Result Execute(string executable, string[] arguments, int maximumMs, int maximumBytes, Action<object> observeStarted) {
      if (!Path.IsPathRooted(executable) || maximumMs < 1 || maximumMs > 120000 || maximumBytes < 1 || maximumBytes > 262144)
        throw new ArgumentException("m1-child-boundary-invalid");
      var quoted = new string[arguments.Length];
      for (int index = 0; index < arguments.Length; index++) quoted[index] = Quote(arguments[index]);
      var start = new ProcessStartInfo(executable, string.Join(" ", quoted));
      start.UseShellExecute = false; start.CreateNoWindow = true;
      start.RedirectStandardInput = true; start.RedirectStandardOutput = true; start.RedirectStandardError = true;
      var result = new Result { ExitCode = -1, StartedAt = DateTime.UtcNow.ToString("o"), Stdout = "" };
      var stdout = new Sink(); var stderr = new Sink();
      using (var process = new Process { StartInfo = start }) {
        try {
          var clock = Stopwatch.StartNew();
          result.Started = process.Start();
          if (!result.Started) return result;
          result.ProcessId = process.Id; result.ProcessStartedAt = process.StartTime.ToUniversalTime().ToString("o");
          if (observeStarted != null) observeStarted(result);
          process.StandardInput.Close();
          var output = Pump(process.StandardOutput.BaseStream, stdout, true, maximumBytes);
          var error = Pump(process.StandardError.BaseStream, stderr, false, maximumBytes);
          while (!process.WaitForExit(20)) {
            if (clock.ElapsedMilliseconds >= maximumMs || stdout.Limited != 0 || stderr.Limited != 0) {
              result.TimedOut = clock.ElapsedMilliseconds >= maximumMs;
              result.OutputLimited = stdout.Limited != 0 || stderr.Limited != 0;
              try { process.Kill(); } catch { }
              break;
            }
          }
          result.StopConfirmed = process.WaitForExit(2000);
          if (result.StopConfirmed) result.ExitCode = process.ExitCode;
          try { result.OutputComplete = Task.WaitAll(new[] { output, error }, 2000); } catch { result.OutputComplete = false; }
          result.OutputLimited = result.OutputLimited || stdout.Limited != 0 || stderr.Limited != 0;
          result.StdoutBytes = stdout.Count; result.StderrBytes = stderr.Count;
          if (result.OutputComplete && !result.OutputLimited) result.Stdout = Encoding.UTF8.GetString(stdout.Bytes.ToArray());
          return result;
        } finally {
          // An exception after Start must not orphan the process. This targets
          // this exact child only; it is not a general process-tree executor.
          if (result.Started && !result.StopConfirmed) {
            try { if (!process.HasExited) process.Kill(); result.StopConfirmed = process.WaitForExit(2000); } catch { }
          }
          result.FinishedAt = DateTime.UtcNow.ToString("o");
        }
      }
    }
  }
}
