using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

public static class RunaMutexWait
{
    public static string Enter(Mutex value)
    {
        try { return value.WaitOne(0) ? "acquired" : "busy"; }
        catch (AbandonedMutexException)
        {
            value.ReleaseMutex();
            return "abandoned";
        }
    }
}

public sealed class RunaSystemDriveCoordinator
{
    private readonly string operation;
    private readonly List<string> phases = new List<string>();
    private bool probePassed;
    private bool journalRemoved;
    private int rootWrites;
    private int rollbackWrites;

    public RunaSystemDriveCoordinator(string operation)
    {
        if (operation != "prepare" && operation != "deprovision") throw new ArgumentException("operation-invalid");
        this.operation = operation;
    }

    private string PhaseSignature { get { return String.Join(",", phases.ToArray()); } }
    public int RootWrites { get { return rootWrites; } }
    public int RollbackWrites { get { return rollbackWrites; } }

    public void ProbePassed()
    {
        if (probePassed || phases.Count != 0 || rootWrites != 0 || rollbackWrites != 0)
            throw new InvalidOperationException("coordinator-order-invalid");
        probePassed = true;
    }

    public void JournalPhase(string phase)
    {
        string next = phases.Count == 0 ? phase : PhaseSignature + "," + phase;
        string[] allowed = operation == "prepare" ? new[] {
            "authorized", "authorized,prepare-started", "authorized,prepare-started,prepare-terminal",
            "authorized,prepare-started,prepare-terminal,prepared",
            "authorized,prepare-started,prepare-terminal,rollback-started",
            "authorized,prepare-started,prepare-terminal,rollback-started,rollback-terminal"
        } : new[] { "deprovision-started", "deprovision-started,deprovision-terminal" };
        if (!probePassed || !allowed.Contains(next)) throw new InvalidOperationException("coordinator-phase-invalid");
        if ((phase == "prepare-terminal" || phase == "deprovision-terminal") && rootWrites != 1)
            throw new InvalidOperationException("coordinator-write-missing");
        if (phase == "rollback-started" && rootWrites != 1)
            throw new InvalidOperationException("coordinator-write-missing");
        if (phase == "rollback-terminal" && rollbackWrites != 1)
            throw new InvalidOperationException("coordinator-write-missing");
        phases.Add(phase);
    }

    public void RootWrite(string kind)
    {
        if (!probePassed) throw new InvalidOperationException("coordinator-probe-missing");
        if (kind == "prepare" && operation == "prepare" && PhaseSignature == "authorized,prepare-started"
            && rootWrites == 0 && rollbackWrites == 0) { rootWrites = 1; return; }
        if (kind == "deprovision" && operation == "deprovision" && PhaseSignature == "deprovision-started"
            && rootWrites == 0 && rollbackWrites == 0) { rootWrites = 1; return; }
        if (kind == "rollback" && operation == "prepare"
            && PhaseSignature == "authorized,prepare-started,prepare-terminal,rollback-started"
            && rootWrites == 1 && rollbackWrites == 0) { rollbackWrites = 1; return; }
        throw new InvalidOperationException("coordinator-write-order-invalid");
    }

    public void JournalRemoved()
    {
        if (journalRemoved) throw new InvalidOperationException("coordinator-remove-invalid");
        journalRemoved = true;
    }

    private bool BaseMatches(string outcome, string stage, string code, string state, bool rollbackAttempted,
        bool rollbackVerified, string journalState, bool publicProbe)
    {
        if (publicProbe != probePassed || rollbackAttempted != (rollbackWrites == 1)
            || rollbackVerified && !rollbackAttempted || rootWrites > 1 || rollbackWrites > 1) return false;
        if (journalState == "removed" != journalRemoved || (journalRemoved && journalState != "removed")) return false;
        if (!probePassed && (rootWrites != 0 || rollbackWrites != 0 || phases.Count != 0)) return false;
        return true;
    }

    public bool ValidateCompletion(string outcome, string stage, string code, string state, bool rollbackAttempted,
        bool rollbackVerified, string journalState, bool publicProbe)
    {
        if (!BaseMatches(outcome, stage, code, state, rollbackAttempted, rollbackVerified, journalState, publicProbe))
            return false;
        string signature = PhaseSignature;
        switch (code)
        {
            case "pin-drift": case "precondition-failed": case "probe-failed": case "probe-cleanup-failed":
            case "journal-failed":
                return outcome == "error" && stage == "preflight" && rootWrites == 0 && rollbackWrites == 0
                    && signature == "";
            case "prepare-failed-no-change":
                return operation == "prepare" && outcome == "error" && stage == "prepare" && state == "unprepared"
                    && signature == "authorized,prepare-started,prepare-terminal" && rootWrites == 1 && rollbackWrites == 0;
            case "prepared":
                return operation == "prepare" && outcome == "prepared" && stage == "complete" && state == "prepared"
                    && journalState == "retained" && signature == "authorized,prepare-started,prepare-terminal,prepared"
                    && rootWrites == 1 && rollbackWrites == 0;
            case "prepare-failed-restored": case "post-state-mismatch-restored":
                return operation == "prepare" && outcome == "restored" && stage == "complete" && state == "unprepared"
                    && rollbackVerified && journalState == "removed"
                    && signature == "authorized,prepare-started,prepare-terminal,rollback-started,rollback-terminal"
                    && rootWrites == 1 && rollbackWrites == 1;
            case "rollback-failed":
                return operation == "prepare" && outcome == "error" && stage == "rollback" && state == "unknown"
                    && !rollbackVerified && journalState == "retained"
                    && signature == "authorized,prepare-started,prepare-terminal,rollback-started,rollback-terminal"
                    && rootWrites == 1 && rollbackWrites == 1;
            case "journal-removal-failed":
                if (operation == "prepare") return outcome == "error" && stage == "rollback" && state == "unprepared"
                    && rollbackVerified && journalState == "retained"
                    && signature == "authorized,prepare-started,prepare-terminal,rollback-started,rollback-terminal"
                    && rootWrites == 1 && rollbackWrites == 1;
                return outcome == "error" && stage == "deprovision" && state == "unprepared" && journalState == "retained"
                    && signature == "deprovision-started,deprovision-terminal" && rootWrites == 1;
            case "deprovision-failed-unprepared": case "deprovision-failed-prepared":
                return operation == "deprovision" && outcome == "error" && stage == "deprovision"
                    && journalState == "retained" && signature == "deprovision-started,deprovision-terminal"
                    && rootWrites == 1 && rollbackWrites == 0;
            case "deprovisioned":
                return operation == "deprovision" && outcome == "deprovisioned" && stage == "complete"
                    && state == "unprepared" && journalState == "removed"
                    && signature == "deprovision-started,deprovision-terminal" && rootWrites == 1 && rollbackWrites == 0;
            case "reconciliation-required":
                return outcome == "error" && stage == "complete" && state == "unknown" && journalState != "removed";
            case "result-invalid":
                return false;
            default: return false;
        }
    }
}

public sealed class RunaDirectoryIdentity : IDisposable
{
    private const uint ReadControl = 0x00020000;
    private const uint FileReadAttributes = 0x00000080;
    private const uint ShareReadWriteDelete = 0x00000007;
    private const uint OpenExisting = 3;
    private const uint BackupSemantics = 0x02000000;
    private const uint OpenReparsePoint = 0x00200000;
    private const uint FileAttributeReparsePoint = 0x00000400;

    [StructLayout(LayoutKind.Sequential)]
    private struct ByHandleFileInformation
    {
        public uint FileAttributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME CreationTime;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastAccessTime;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWriteTime;
        public uint VolumeSerialNumber;
        public uint FileSizeHigh;
        public uint FileSizeLow;
        public uint NumberOfLinks;
        public uint FileIndexHigh;
        public uint FileIndexLow;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(string fileName, uint desiredAccess, uint shareMode,
        IntPtr securityAttributes, uint creationDisposition, uint flagsAndAttributes, IntPtr templateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out ByHandleFileInformation info);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle, StringBuilder path, uint length,
        uint flags);

    private readonly SafeFileHandle handle;
    public uint VolumeSerial { get; private set; }
    public ulong FileId { get; private set; }
    public string FinalPath { get; private set; }
    public uint LinkCount { get; private set; }

    private RunaDirectoryIdentity(SafeFileHandle handle, ByHandleFileInformation info, string finalPath)
    {
        this.handle = handle;
        VolumeSerial = info.VolumeSerialNumber;
        FileId = ((ulong)info.FileIndexHigh << 32) | info.FileIndexLow;
        LinkCount = info.NumberOfLinks;
        FinalPath = finalPath;
    }

    public static RunaDirectoryIdentity Open(string path)
    {
        SafeFileHandle handle = CreateFileW(path, ReadControl | FileReadAttributes, ShareReadWriteDelete, IntPtr.Zero,
            OpenExisting, BackupSemantics | OpenReparsePoint, IntPtr.Zero);
        if (handle.IsInvalid) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        ByHandleFileInformation info;
        if (!GetFileInformationByHandle(handle, out info))
        {
            int error = Marshal.GetLastWin32Error(); handle.Dispose();
            throw new System.ComponentModel.Win32Exception(error);
        }
        if ((info.FileAttributes & FileAttributeReparsePoint) != 0)
        {
            handle.Dispose(); throw new InvalidOperationException("reparse-point-refused");
        }
        StringBuilder buffer = new StringBuilder(1024);
        uint length = GetFinalPathNameByHandleW(handle, buffer, (uint)buffer.Capacity, 0);
        if (length == 0 || length >= buffer.Capacity)
        {
            int error = Marshal.GetLastWin32Error(); handle.Dispose();
            throw new System.ComponentModel.Win32Exception(error == 0 ? 206 : error);
        }
        return new RunaDirectoryIdentity(handle, info, buffer.ToString());
    }

    public bool StillMatches()
    {
        ByHandleFileInformation info;
        if (!GetFileInformationByHandle(handle, out info)) return false;
        return info.VolumeSerialNumber == VolumeSerial
            && (((ulong)info.FileIndexHigh << 32) | info.FileIndexLow) == FileId
            && (info.FileAttributes & FileAttributeReparsePoint) == 0;
    }

    public bool PathStillMatches(string path, string expectedFinalPath)
    {
        if (!StillMatches()) return false;
        try
        {
            using (RunaDirectoryIdentity current = Open(path))
            {
                return current.StillMatches() && current.LinkCount == 1 && LinkCount == 1
                    && current.VolumeSerial == VolumeSerial && current.FileId == FileId
                    && String.Equals(current.FinalPath, FinalPath, StringComparison.OrdinalIgnoreCase)
                    && String.Equals(current.FinalPath, expectedFinalPath, StringComparison.OrdinalIgnoreCase);
            }
        }
        catch { return false; }
    }

    public void Dispose() { handle.Dispose(); }
}

public sealed class RunaAclSnapshot
{
    public byte[] SecurityDescriptor { get; set; }
    public byte[] CanonicalDescriptor { get; set; }
    public byte[] DaclBytes { get; set; }
    public string CanonicalSha256 { get; set; }
}

public sealed class RunaAclWriteResult
{
    public bool Success { get; set; }
    public uint Win32Error { get; set; }
}

public static class RunaOmenAclNative
{
    private const uint DaclSecurityInformation = 0x00000004;
    private const uint TargetMask = 0x00120088;
    private const int GrantAccess = 1;
    private static readonly byte[] DescriptorPrefix = Encoding.UTF8.GetBytes(
        "runa-omen-system-drive-descriptor/v3\0");
    private static readonly SecurityIdentifier AppPackages = new SecurityIdentifier("S-1-15-2-1");
    private static readonly SecurityIdentifier RestrictedPackages = new SecurityIdentifier("S-1-15-2-2");

    public static string BindingContract
    {
        get { return "Advapi32:SetFileSecurityW:DACL_SECURITY_INFORMATION:0x00000004;SetEntriesInAclW"; }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct TrusteeW
    {
        public IntPtr MultipleTrustee;
        public int MultipleTrusteeOperation;
        public int TrusteeForm;
        public int TrusteeType;
        public IntPtr Name;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ExplicitAccessW
    {
        public uint AccessPermissions;
        public int AccessMode;
        public uint Inheritance;
        public TrusteeW Trustee;
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode)]
    private static extern void BuildTrusteeWithSidW(ref TrusteeW trustee, IntPtr sid);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint SetEntriesInAclW(uint count, [In] ExplicitAccessW[] entries, IntPtr oldAcl,
        out IntPtr newAcl);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetFileSecurityW(string path, uint securityInformation, IntPtr securityDescriptor);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool MoveFileExW(string existingPath, string newPath, uint flags);

    public static void AtomicMove(string existingPath, string newPath, bool replace)
    {
        const uint MoveFileReplaceExisting = 0x00000001;
        const uint MoveFileWriteThrough = 0x00000008;
        uint flags = MoveFileWriteThrough | (replace ? MoveFileReplaceExisting : 0u);
        if (!MoveFileExW(existingPath, newPath, flags))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }

    public static bool TryRemoveTree(string path)
    {
        try
        {
            if (Directory.Exists(path)) Directory.Delete(path, true);
            return !Directory.Exists(path);
        }
        catch { return false; }
    }

    public static bool TryRemoveOwnedTree(RunaDirectoryIdentity identity, string path, string expectedFinalPath)
    {
        if (identity == null || !identity.PathStillMatches(path, expectedFinalPath)) return false;
        return TryRemoveTree(path);
    }

    private static byte[] SidBytes(SecurityIdentifier sid)
    {
        byte[] bytes = new byte[sid.BinaryLength]; sid.GetBinaryForm(bytes, 0); return bytes;
    }

    private static byte[] AclBytes(RawAcl acl)
    {
        if (acl == null) return new byte[0];
        byte[] bytes = new byte[acl.BinaryLength]; acl.GetBinaryForm(bytes, 0); return bytes;
    }

    private static byte[] AceBytes(GenericAce ace)
    {
        byte[] bytes = new byte[ace.BinaryLength]; ace.GetBinaryForm(bytes, 0); return bytes;
    }

    private static void WriteU32(BinaryWriter writer, uint value) { writer.Write(value); }
    private static void WriteBytes(BinaryWriter writer, byte[] bytes)
    {
        WriteU32(writer, checked((uint)bytes.Length)); writer.Write(bytes);
    }

    private static byte[] CanonicalBytes(RawSecurityDescriptor descriptor)
    {
        bool present = (descriptor.ControlFlags & ControlFlags.DiscretionaryAclPresent) != 0;
        bool isNull = present && descriptor.DiscretionaryAcl == null;
        if (!present || isNull || descriptor.Owner == null || descriptor.Group == null)
            throw new InvalidOperationException("acl-shape-invalid");
        using (MemoryStream stream = new MemoryStream())
        using (BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, true))
        {
            writer.Write(DescriptorPrefix);
            writer.Write((byte)1); writer.Write((byte)0);
            WriteU32(writer, (uint)descriptor.ControlFlags);
            WriteBytes(writer, SidBytes(descriptor.Owner)); WriteBytes(writer, SidBytes(descriptor.Group));
            WriteBytes(writer, AclBytes(descriptor.DiscretionaryAcl));
            writer.Flush();
            if (stream.Length > 131072) throw new InvalidOperationException("acl-shape-invalid");
            return stream.ToArray();
        }
    }

    private static RunaAclSnapshot Snapshot(RawSecurityDescriptor descriptor)
    {
        byte[] raw = new byte[descriptor.BinaryLength]; descriptor.GetBinaryForm(raw, 0);
        byte[] canonical = CanonicalBytes(descriptor);
        return new RunaAclSnapshot { SecurityDescriptor = raw, CanonicalDescriptor = canonical,
            DaclBytes = AclBytes(descriptor.DiscretionaryAcl), CanonicalSha256 = Sha256(canonical) };
    }

    public static RunaAclSnapshot Read(string path)
    {
        DirectorySecurity security = Directory.GetAccessControl(path,
            AccessControlSections.Owner | AccessControlSections.Group | AccessControlSections.Access);
        return Snapshot(new RawSecurityDescriptor(security.GetSecurityDescriptorBinaryForm(), 0));
    }

    private static bool IsExplicitTarget(GenericAce ace, SecurityIdentifier sid, bool exact)
    {
        CommonAce common = ace as CommonAce;
        if (common == null || common.SecurityIdentifier != sid || (common.AceFlags & AceFlags.Inherited) != 0)
            return false;
        if (!exact) return true;
        return common.AceQualifier == AceQualifier.AccessAllowed && common.AccessMask == unchecked((int)TargetMask)
            && common.AceFlags == AceFlags.None;
    }

    public static bool HasPreparedSystemDrive(string path)
    {
        RawSecurityDescriptor descriptor = new RawSecurityDescriptor(Read(path).SecurityDescriptor, 0);
        if (!ValidAclHeader(AclBytes(descriptor.DiscretionaryAcl)) || !IsCanonical(descriptor)) return false;
        byte[] appExpected = ExactTargetAce(AppPackages), restrictedExpected = ExactTargetAce(RestrictedPackages);
        int app = 0, restricted = 0; int firstInherited = descriptor.DiscretionaryAcl.Count;
        for (int index = 0; index < descriptor.DiscretionaryAcl.Count; index++)
            if ((descriptor.DiscretionaryAcl[index].AceFlags & AceFlags.Inherited) != 0) { firstInherited = index; break; }
        for (int index = 0; index < descriptor.DiscretionaryAcl.Count; index++)
        {
            GenericAce ace = descriptor.DiscretionaryAcl[index]; byte[] raw = AceBytes(ace);
            if (IsExplicitTarget(ace, AppPackages, false)) { if (!raw.SequenceEqual(appExpected) || index >= firstInherited) return false; app++; }
            if (IsExplicitTarget(ace, RestrictedPackages, false)) { if (!raw.SequenceEqual(restrictedExpected) || index >= firstInherited) return false; restricted++; }
        }
        return app == 1 && restricted == 1;
    }

    public static bool HasNoExplicitTargetAce(string path)
    {
        RawSecurityDescriptor descriptor = new RawSecurityDescriptor(Read(path).SecurityDescriptor, 0);
        foreach (GenericAce ace in descriptor.DiscretionaryAcl)
            if (IsExplicitTarget(ace, AppPackages, false) || IsExplicitTarget(ace, RestrictedPackages, false)) return false;
        return true;
    }

    public static RunaAclSnapshot BuildExpected(RunaAclSnapshot before)
    {
        RawSecurityDescriptor descriptor = new RawSecurityDescriptor(before.SecurityDescriptor, 0);
        foreach (GenericAce ace in descriptor.DiscretionaryAcl)
            if (IsExplicitTarget(ace, AppPackages, false) || IsExplicitTarget(ace, RestrictedPackages, false))
                throw new InvalidOperationException("acl-shape-invalid");
        byte[] oldAcl = AclBytes(descriptor.DiscretionaryAcl);
        IntPtr oldPointer = Marshal.AllocHGlobal(oldAcl.Length), newPointer = IntPtr.Zero;
        GCHandle appHandle = default(GCHandle), restrictedHandle = default(GCHandle);
        try
        {
            Marshal.Copy(oldAcl, 0, oldPointer, oldAcl.Length);
            byte[] appSid = SidBytes(AppPackages), restrictedSid = SidBytes(RestrictedPackages);
            appHandle = GCHandle.Alloc(appSid, GCHandleType.Pinned);
            restrictedHandle = GCHandle.Alloc(restrictedSid, GCHandleType.Pinned);
            TrusteeW appTrustee = new TrusteeW(), restrictedTrustee = new TrusteeW();
            BuildTrusteeWithSidW(ref appTrustee, appHandle.AddrOfPinnedObject());
            BuildTrusteeWithSidW(ref restrictedTrustee, restrictedHandle.AddrOfPinnedObject());
            ExplicitAccessW[] entries = new[] {
                new ExplicitAccessW { AccessPermissions = TargetMask, AccessMode = GrantAccess,
                    Inheritance = 0, Trustee = appTrustee },
                new ExplicitAccessW { AccessPermissions = TargetMask, AccessMode = GrantAccess,
                    Inheritance = 0, Trustee = restrictedTrustee }
            };
            uint result = SetEntriesInAclW(2, entries, oldPointer, out newPointer);
            if (result != 0 || newPointer == IntPtr.Zero) throw new System.ComponentModel.Win32Exception((int)result);
            ushort length = unchecked((ushort)Marshal.ReadInt16(newPointer, 2));
            byte[] merged = new byte[length]; Marshal.Copy(newPointer, merged, 0, length);
            RawAcl newAcl = new RawAcl(merged, 0);
            List<byte[]> remaining = new List<byte[]>(); int app = 0, restricted = 0;
            foreach (GenericAce ace in newAcl)
            {
                if (IsExplicitTarget(ace, AppPackages, true)) { app++; continue; }
                if (IsExplicitTarget(ace, RestrictedPackages, true)) { restricted++; continue; }
                remaining.Add(AceBytes(ace));
            }
            if (app != 1 || restricted != 1 || remaining.Count != descriptor.DiscretionaryAcl.Count)
                throw new InvalidOperationException("expected-delta-invalid");
            for (int index = 0; index < remaining.Count; index++)
                if (!remaining[index].SequenceEqual(AceBytes(descriptor.DiscretionaryAcl[index])))
                    throw new InvalidOperationException("expected-delta-invalid");
            RawSecurityDescriptor expected = new RawSecurityDescriptor(descriptor.ControlFlags, descriptor.Owner,
                descriptor.Group, descriptor.SystemAcl, newAcl);
            return Snapshot(expected);
        }
        finally
        {
            if (newPointer != IntPtr.Zero) LocalFree(newPointer);
            if (appHandle.IsAllocated) appHandle.Free();
            if (restrictedHandle.IsAllocated) restrictedHandle.Free();
            Marshal.FreeHGlobal(oldPointer);
        }
    }

    public static void ConfigureProbeParent(string path)
    {
        DirectorySecurity security = new DirectorySecurity();
        security.SetAccessRuleProtection(true, false);
        InheritanceFlags inheritance = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
        SecurityIdentifier system = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
        SecurityIdentifier administrators = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
        SecurityIdentifier current = WindowsIdentity.GetCurrent().User;
        SecurityIdentifier everyone = new SecurityIdentifier(WellKnownSidType.WorldSid, null);
        security.AddAccessRule(new FileSystemAccessRule(everyone, FileSystemRights.ReadExtendedAttributes,
            inheritance, PropagationFlags.None, AccessControlType.Deny));
        security.AddAccessRule(new FileSystemAccessRule(system, FileSystemRights.FullControl, inheritance,
            PropagationFlags.None, AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(administrators, FileSystemRights.FullControl, inheritance,
            PropagationFlags.None, AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(current, FileSystemRights.FullControl, inheritance,
            PropagationFlags.None, AccessControlType.Allow));
        Directory.SetAccessControl(path, security);
    }

    public static RunaAclSnapshot BuildProbeSetupExpected(RunaAclSnapshot before)
    {
        RawSecurityDescriptor descriptor = new RawSecurityDescriptor(before.SecurityDescriptor, 0);
        SecurityIdentifier current = WindowsIdentity.GetCurrent().User;
        RawAcl replacement = new RawAcl(descriptor.DiscretionaryAcl.Revision, descriptor.DiscretionaryAcl.Count);
        bool replaced = false;
        foreach (GenericAce ace in descriptor.DiscretionaryAcl)
        {
            CommonAce common = ace as CommonAce;
            if (!replaced && common != null && common.SecurityIdentifier == current
                && common.AceQualifier == AceQualifier.AccessAllowed
                && (common.AceFlags & (AceFlags.ContainerInherit | AceFlags.ObjectInherit))
                    == (AceFlags.ContainerInherit | AceFlags.ObjectInherit))
            {
                replacement.InsertAce(replacement.Count, new CommonAce(common.AceFlags, common.AceQualifier,
                    unchecked((int)0x00120080), current, false, null));
                replaced = true;
            }
            else replacement.InsertAce(replacement.Count, ace.Copy());
        }
        if (!replaced) throw new InvalidOperationException("probe-shape-invalid");
        RawSecurityDescriptor expected = new RawSecurityDescriptor(descriptor.ControlFlags, descriptor.Owner,
            descriptor.Group, descriptor.SystemAcl, replacement);
        return Snapshot(expected);
    }

    public static RunaAclWriteResult ApplyDacl(string path, byte[] securityDescriptor)
    {
        GCHandle handle = GCHandle.Alloc(securityDescriptor, GCHandleType.Pinned);
        try
        {
            bool success = SetFileSecurityW(path, DaclSecurityInformation, handle.AddrOfPinnedObject());
            return new RunaAclWriteResult { Success = success,
                Win32Error = success ? 0u : unchecked((uint)Marshal.GetLastWin32Error()) };
        }
        finally { handle.Free(); }
    }

    public static bool Equal(RunaAclSnapshot left, RunaAclSnapshot right)
    {
        return left != null && right != null && left.CanonicalDescriptor.SequenceEqual(right.CanonicalDescriptor);
    }

    public static bool ValidateCanonicalDescriptor(byte[] bytes)
    {
        if (bytes == null || bytes.Length < DescriptorPrefix.Length + 22 || bytes.Length > 131072) return false;
        for (int index = 0; index < DescriptorPrefix.Length; index++)
            if (bytes[index] != DescriptorPrefix[index]) return false;
        int offset = DescriptorPrefix.Length;
        Func<uint?> readU32 = () =>
        {
            if (offset + 4 > bytes.Length) return null;
            uint value = BitConverter.ToUInt32(bytes, offset); offset += 4; return value;
        };
        if (bytes[offset++] != 1 || bytes[offset++] != 0) return false;
        if (!readU32().HasValue) return false;
        uint? ownerLength = readU32();
        if (!ownerLength.HasValue || ownerLength.Value < 8 || ownerLength.Value > int.MaxValue
            || offset + (int)ownerLength.Value > bytes.Length) return false;
        offset += (int)ownerLength.Value;
        uint? groupLength = readU32();
        if (!groupLength.HasValue || groupLength.Value < 8 || groupLength.Value > int.MaxValue
            || offset + (int)groupLength.Value > bytes.Length) return false;
        offset += (int)groupLength.Value;
        uint? aclLength = readU32();
        if (!aclLength.HasValue || aclLength.Value < 8 || aclLength.Value > 65535
            || offset + (int)aclLength.Value != bytes.Length) return false;
        byte[] acl = new byte[aclLength.Value]; Buffer.BlockCopy(bytes, offset, acl, 0, (int)aclLength.Value);
        return ValidAclHeader(acl);
    }

    private static RawSecurityDescriptor DescriptorFromCanonical(byte[] bytes)
    {
        if (!ValidateCanonicalDescriptor(bytes)) throw new InvalidOperationException("descriptor-invalid");
        int offset = DescriptorPrefix.Length + 2;
        Func<uint> readU32 = () => { uint value = BitConverter.ToUInt32(bytes, offset); offset += 4; return value; };
        ControlFlags flags = (ControlFlags)readU32();
        uint ownerLength = readU32();
        byte[] ownerBytes = new byte[ownerLength]; Buffer.BlockCopy(bytes, offset, ownerBytes, 0, (int)ownerLength);
        offset += (int)ownerLength;
        uint groupLength = readU32();
        byte[] groupBytes = new byte[groupLength]; Buffer.BlockCopy(bytes, offset, groupBytes, 0, (int)groupLength);
        offset += (int)groupLength;
        uint aclLength = readU32();
        byte[] aclBytes = new byte[aclLength]; Buffer.BlockCopy(bytes, offset, aclBytes, 0, (int)aclLength);
        RawAcl dacl = new RawAcl(aclBytes, 0);
        RawSecurityDescriptor descriptor = new RawSecurityDescriptor(flags,
            new SecurityIdentifier(ownerBytes, 0), new SecurityIdentifier(groupBytes, 0), null, dacl);
        if (!CanonicalBytes(descriptor).SequenceEqual(bytes)) throw new InvalidOperationException("descriptor-invalid");
        return descriptor;
    }

    public static byte[] SecurityDescriptorFromCanonical(byte[] bytes)
    {
        RawSecurityDescriptor descriptor = DescriptorFromCanonical(bytes);
        byte[] raw = new byte[descriptor.BinaryLength]; descriptor.GetBinaryForm(raw, 0); return raw;
    }

    public static byte[] CanonicalizeSecurityDescriptor(byte[] securityDescriptor)
    {
        if (securityDescriptor == null) throw new InvalidOperationException("descriptor-invalid");
        RawSecurityDescriptor descriptor = new RawSecurityDescriptor(securityDescriptor, 0);
        if (!ValidAclHeader(AclBytes(descriptor.DiscretionaryAcl))) throw new InvalidOperationException("descriptor-invalid");
        return CanonicalBytes(descriptor);
    }

    private static bool ValidAclHeader(byte[] acl)
    {
        if (acl == null || acl.Length < 8 || acl.Length > 65535 || (acl[0] != 2 && acl[0] != 4)
            || acl[1] != 0 || acl[6] != 0 || acl[7] != 0 || BitConverter.ToUInt16(acl, 2) != acl.Length
            || BitConverter.ToUInt16(acl, 4) > 512) return false;
        int offset = 8; ushort count = BitConverter.ToUInt16(acl, 4);
        for (int index = 0; index < count; index++)
        {
            if (offset + 4 > acl.Length) return false;
            ushort length = BitConverter.ToUInt16(acl, offset + 2);
            if (length < 4 || offset + length > acl.Length) return false;
            offset += length;
        }
        return offset == acl.Length;
    }

    private static bool IsCanonical(RawSecurityDescriptor descriptor)
    {
        try { return new CommonSecurityDescriptor(true, false, descriptor).IsDiscretionaryAclCanonical; }
        catch { return false; }
    }

    private static byte[] ExactTargetAce(SecurityIdentifier sid)
    {
        return AceBytes(new CommonAce(AceFlags.None, AceQualifier.AccessAllowed,
            unchecked((int)TargetMask), sid, false, null));
    }

    private static bool DeltaRelation(byte[] beforeBytes, byte[] afterBytes, bool requireCanonicalPost)
    {
        RawSecurityDescriptor before, after;
        try { before = DescriptorFromCanonical(beforeBytes); after = DescriptorFromCanonical(afterBytes); }
        catch { return false; }
        byte[] beforeAcl = AclBytes(before.DiscretionaryAcl), afterAcl = AclBytes(after.DiscretionaryAcl);
        if (!ValidAclHeader(beforeAcl) || !ValidAclHeader(afterAcl) || beforeAcl[0] != afterAcl[0]
            || !before.Owner.Equals(after.Owner) || !before.Group.Equals(after.Group) || before.ControlFlags != after.ControlFlags
            || after.DiscretionaryAcl.Count != before.DiscretionaryAcl.Count + 2 || !IsCanonical(before)
            || (requireCanonicalPost && !IsCanonical(after))) return false;
        byte[] app = ExactTargetAce(AppPackages), restricted = ExactTargetAce(RestrictedPackages);
        List<byte[]> remaining = new List<byte[]>(); int appCount = 0, restrictedCount = 0;
        int firstInherited = after.DiscretionaryAcl.Count;
        for (int index = 0; index < after.DiscretionaryAcl.Count; index++)
            if ((after.DiscretionaryAcl[index].AceFlags & AceFlags.Inherited) != 0) { firstInherited = index; break; }
        for (int index = 0; index < after.DiscretionaryAcl.Count; index++)
        {
            GenericAce ace = after.DiscretionaryAcl[index]; byte[] raw = AceBytes(ace);
            if (raw.SequenceEqual(app)) { if (index >= firstInherited) return false; appCount++; continue; }
            if (raw.SequenceEqual(restricted)) { if (index >= firstInherited) return false; restrictedCount++; continue; }
            if (IsExplicitTarget(ace, AppPackages, false) || IsExplicitTarget(ace, RestrictedPackages, false)) return false;
            remaining.Add(raw);
        }
        if (appCount != 1 || restrictedCount != 1 || remaining.Count != before.DiscretionaryAcl.Count) return false;
        for (int index = 0; index < remaining.Count; index++)
            if (!remaining[index].SequenceEqual(AceBytes(before.DiscretionaryAcl[index]))) return false;
        return true;
    }

    public static bool ValidatePlannedDelta(byte[] before, byte[] planned)
    {
        return DeltaRelation(before, planned, false);
    }

    public static bool ValidatePreparedDelta(byte[] before, byte[] actual)
    {
        return DeltaRelation(before, actual, true);
    }

    public static bool ValidateProbeSetupResult(byte[] planned, byte[] actual)
    {
        RawSecurityDescriptor left, right;
        try { left = DescriptorFromCanonical(planned); right = DescriptorFromCanonical(actual); }
        catch { return false; }
        ControlFlags permittedNormalization = ControlFlags.DiscretionaryAclAutoInherited
            | ControlFlags.DiscretionaryAclAutoInheritRequired;
        return left.Owner.Equals(right.Owner) && left.Group.Equals(right.Group)
            && (left.ControlFlags & ~permittedNormalization) == (right.ControlFlags & ~permittedNormalization)
            && ValidAclHeader(AclBytes(left.DiscretionaryAcl)) && ValidAclHeader(AclBytes(right.DiscretionaryAcl))
            && AclBytes(left.DiscretionaryAcl).SequenceEqual(AclBytes(right.DiscretionaryAcl)) && IsCanonical(right);
    }

    public static string Sha256(byte[] bytes)
    {
        using (SHA256 sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
    }
}
