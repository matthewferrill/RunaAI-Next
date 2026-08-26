using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;

namespace RunaAI.Next.Gate7E
{
    public sealed class DaclState
    {
        public string DaclSha256 { get; internal set; }
        public string NonDaclSha256 { get; internal set; }
        public string OwnershipSha256 { get; internal set; }
        public bool DaclProtected { get; internal set; }
        public bool DaclDefaulted { get; internal set; }
        public int ControlFlagsValue { get; internal set; }
        public int AceCount { get; internal set; }
        public int AllApplicationPackagesExactCount { get; internal set; }
        public int AllRestrictedApplicationPackagesExactCount { get; internal set; }
        public int AllApplicationPackagesConflictCount { get; internal set; }
        public int AllRestrictedApplicationPackagesConflictCount { get; internal set; }
    }

    public sealed class DaclMutation
    {
        public bool Changed { get; internal set; }
        public int AddedCount { get; internal set; }
        public int RemovedCount { get; internal set; }
        public DaclState Before { get; internal set; }
        public DaclState After { get; internal set; }
    }

    public static class TargetOnlyAcl
    {
        public const int HostPreparationMask = 0x00120088;
        public const string AllApplicationPackagesSid = "S-1-15-2-1";
        public const string AllRestrictedApplicationPackagesSid = "S-1-15-2-2";

        private const uint OwnerSecurityInformation = 0x00000001;
        private const uint GroupSecurityInformation = 0x00000002;
        private const uint DaclSecurityInformation = 0x00000004;
        private const uint UnprotectedDaclSecurityInformation = 0x20000000;
        private const uint ProtectedDaclSecurityInformation = 0x80000000;
        private const int ErrorInsufficientBuffer = 122;

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetFileSecurityW(
            string fileName,
            uint requestedInformation,
            byte[] securityDescriptor,
            uint descriptorLength,
            out uint lengthNeeded);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetFileSecurityW(
            string fileName,
            uint securityInformation,
            byte[] securityDescriptor);

        public static byte[] ReadDaclBytes(string path)
        {
            RawSecurityDescriptor descriptor = ReadDescriptor(path);
            if (descriptor.DiscretionaryAcl == null)
            {
                throw new InvalidOperationException("target-dacl-null");
            }
            return SerializeAcl(descriptor.DiscretionaryAcl);
        }

        public static string HashDacl(string path)
        {
            return HashBytes(ReadDaclBytes(path));
        }

        public static DaclState Inspect(string path)
        {
            RawSecurityDescriptor descriptor = ReadDescriptor(path);
            RawAcl dacl = descriptor.DiscretionaryAcl;
            if (dacl == null)
            {
                throw new InvalidOperationException("target-dacl-null");
            }

            DaclState state = new DaclState();
            state.DaclSha256 = HashBytes(SerializeAcl(dacl));
            state.NonDaclSha256 = HashNonDacl(descriptor);
            state.OwnershipSha256 = HashOwnership(descriptor);
            state.DaclProtected = (descriptor.ControlFlags & ControlFlags.DiscretionaryAclProtected) != 0;
            state.DaclDefaulted = (descriptor.ControlFlags & ControlFlags.DiscretionaryAclDefaulted) != 0;
            state.ControlFlagsValue = (int)descriptor.ControlFlags;
            state.AceCount = dacl.Count;
            CountTargetAces(dacl, state);
            return state;
        }

        public static DaclMutation EnsureHostPreparation(string path, string expectedDaclSha256)
        {
            ValidateExpectedHash(expectedDaclSha256);
            byte[] beforeBytes = ReadDaclBytes(path);
            string beforeHash = HashBytes(beforeBytes);
            if (!String.Equals(beforeHash, expectedDaclSha256, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("target-dacl-hash-mismatch");
            }

            DaclState before = Inspect(path);
            ValidateNoConflictsOrDuplicates(before);
            int missing = (before.AllApplicationPackagesExactCount == 0 ? 1 : 0)
                + (before.AllRestrictedApplicationPackagesExactCount == 0 ? 1 : 0);
            if (missing == 0)
            {
                return new DaclMutation
                {
                    Changed = false,
                    AddedCount = 0,
                    RemovedCount = 0,
                    Before = before,
                    After = before
                };
            }

            RawAcl changed = CloneAcl(beforeBytes, missing);
            int insertionIndex = FirstInheritedIndex(changed);
            if (before.AllApplicationPackagesExactCount == 0)
            {
                changed.InsertAce(insertionIndex++, HostPreparationAce(AllApplicationPackagesSid));
            }
            if (before.AllRestrictedApplicationPackagesExactCount == 0)
            {
                changed.InsertAce(insertionIndex, HostPreparationAce(AllRestrictedApplicationPackagesSid));
            }

            try
            {
                WriteDacl(path, changed);
                DaclState after = Inspect(path);
                if (after.AllApplicationPackagesExactCount != 1
                    || after.AllRestrictedApplicationPackagesExactCount != 1
                    || after.AllApplicationPackagesConflictCount != 0
                    || after.AllRestrictedApplicationPackagesConflictCount != 0)
                {
                    throw new InvalidOperationException("target-dacl-tuple-postcondition-failed");
                }
                ValidateStableTargetMetadata(before, after);
                return new DaclMutation
                {
                    Changed = true,
                    AddedCount = missing,
                    RemovedCount = 0,
                    Before = before,
                    After = after
                };
            }
            catch (Exception mutationError)
            {
                RollBackOrThrow(path, beforeBytes, beforeHash, mutationError);
                throw;
            }
        }

        public static DaclMutation RecoverAndEnsureHostPreparation(
            string path,
            string expectedDaclSha256,
            string expectedCurrentNonDaclSha256,
            int targetControlFlags,
            string expectedTargetNonDaclSha256)
        {
            ValidateExpectedHash(expectedDaclSha256);
            ValidateExpectedHash(expectedCurrentNonDaclSha256);
            ValidateExpectedHash(expectedTargetNonDaclSha256);
            if (targetControlFlags < 0 || targetControlFlags > UInt16.MaxValue)
            {
                throw new ArgumentException("target-control-flags-invalid", "targetControlFlags");
            }
            string fullPath = ValidateDirectory(path);
            byte[] beforeBytes = ReadDaclBytes(fullPath);
            string beforeHash = HashBytes(beforeBytes);
            DaclState before = Inspect(fullPath);
            if (!String.Equals(beforeHash, expectedDaclSha256, StringComparison.OrdinalIgnoreCase)
                || !String.Equals(before.NonDaclSha256, expectedCurrentNonDaclSha256,
                    StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("target-recovery-starting-state-mismatch");
            }
            ValidateNoConflictsOrDuplicates(before);
            int missing = (before.AllApplicationPackagesExactCount == 0 ? 1 : 0)
                + (before.AllRestrictedApplicationPackagesExactCount == 0 ? 1 : 0);
            RawAcl changed = CloneAcl(beforeBytes, missing);
            int insertionIndex = FirstInheritedIndex(changed);
            if (before.AllApplicationPackagesExactCount == 0)
            {
                changed.InsertAce(insertionIndex++, HostPreparationAce(AllApplicationPackagesSid));
            }
            if (before.AllRestrictedApplicationPackagesExactCount == 0)
            {
                changed.InsertAce(insertionIndex, HostPreparationAce(AllRestrictedApplicationPackagesSid));
            }

            try
            {
                WriteDaclWithFlags(fullPath, changed, (ControlFlags)targetControlFlags, true);
                DaclState after = Inspect(fullPath);
                if (after.AllApplicationPackagesExactCount != 1
                    || after.AllRestrictedApplicationPackagesExactCount != 1
                    || after.AllApplicationPackagesConflictCount != 0
                    || after.AllRestrictedApplicationPackagesConflictCount != 0)
                {
                    throw new InvalidOperationException("target-dacl-tuple-postcondition-failed");
                }
                if (!String.Equals(after.OwnershipSha256, before.OwnershipSha256,
                    StringComparison.Ordinal)
                    || !String.Equals(after.NonDaclSha256, expectedTargetNonDaclSha256,
                        StringComparison.OrdinalIgnoreCase)
                    || after.ControlFlagsValue != targetControlFlags)
                {
                    throw new InvalidOperationException("target-recovery-metadata-postcondition-failed");
                }
                return new DaclMutation
                {
                    Changed = missing != 0 || before.ControlFlagsValue != targetControlFlags,
                    AddedCount = missing,
                    RemovedCount = 0,
                    Before = before,
                    After = after
                };
            }
            catch (Exception mutationError)
            {
                RollBackDaclAndFlagsOrThrow(fullPath, beforeBytes, beforeHash,
                    before.ControlFlagsValue, before.NonDaclSha256, mutationError);
                throw;
            }
        }

        public static DaclMutation RemoveExactHostPreparation(string path, string expectedDaclSha256)
        {
            ValidateExpectedHash(expectedDaclSha256);
            byte[] beforeBytes = ReadDaclBytes(path);
            string beforeHash = HashBytes(beforeBytes);
            if (!String.Equals(beforeHash, expectedDaclSha256, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("target-dacl-hash-mismatch");
            }

            DaclState before = Inspect(path);
            ValidateNoConflictsOrDuplicates(before);
            int removable = before.AllApplicationPackagesExactCount
                + before.AllRestrictedApplicationPackagesExactCount;
            if (removable == 0)
            {
                return new DaclMutation
                {
                    Changed = false,
                    AddedCount = 0,
                    RemovedCount = 0,
                    Before = before,
                    After = before
                };
            }

            RawAcl source = new RawAcl(beforeBytes, 0);
            RawAcl changed = new RawAcl(source.Revision, source.Count - removable);
            for (int index = 0; index < source.Count; index++)
            {
                QualifiedAce qualified = source[index] as QualifiedAce;
                if (qualified != null && IsTargetSid(qualified.SecurityIdentifier)
                    && IsExactHostPreparationAce(qualified))
                {
                    continue;
                }
                changed.InsertAce(changed.Count, source[index]);
            }

            try
            {
                WriteDacl(path, changed);
                DaclState after = Inspect(path);
                if (after.AllApplicationPackagesExactCount != 0
                    || after.AllRestrictedApplicationPackagesExactCount != 0
                    || after.AllApplicationPackagesConflictCount != 0
                    || after.AllRestrictedApplicationPackagesConflictCount != 0)
                {
                    throw new InvalidOperationException("target-dacl-tuple-postcondition-failed");
                }
                ValidateStableTargetMetadata(before, after);
                return new DaclMutation
                {
                    Changed = true,
                    AddedCount = 0,
                    RemovedCount = removable,
                    Before = before,
                    After = after
                };
            }
            catch (Exception mutationError)
            {
                RollBackOrThrow(path, beforeBytes, beforeHash, mutationError);
                throw;
            }
        }

        public static DaclMutation RestoreDacl(
            string path,
            string expectedCurrentDaclSha256,
            byte[] snapshotDacl)
        {
            ValidateExpectedHash(expectedCurrentDaclSha256);
            if (snapshotDacl == null || snapshotDacl.Length < 8)
            {
                throw new ArgumentException("snapshot-dacl-invalid", "snapshotDacl");
            }

            byte[] currentBytes = ReadDaclBytes(path);
            string currentHash = HashBytes(currentBytes);
            if (!String.Equals(currentHash, expectedCurrentDaclSha256, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("target-dacl-hash-mismatch");
            }

            RawAcl snapshot = new RawAcl(snapshotDacl, 0);
            string snapshotHash = HashBytes(snapshotDacl);
            DaclState before = Inspect(path);
            try
            {
                WriteDacl(path, snapshot);
                if (!String.Equals(HashDacl(path), snapshotHash, StringComparison.Ordinal))
                {
                    throw new InvalidOperationException("snapshot-restore-postcondition-failed");
                }
                DaclState after = Inspect(path);
                ValidateStableTargetMetadata(before, after);
                return new DaclMutation
                {
                    Changed = !String.Equals(currentHash, snapshotHash, StringComparison.Ordinal),
                    AddedCount = 0,
                    RemovedCount = 0,
                    Before = before,
                    After = after
                };
            }
            catch (Exception mutationError)
            {
                RollBackOrThrow(path, currentBytes, currentHash, mutationError);
                throw;
            }
        }

        public static DaclMutation RestoreDaclAndControlFlags(
            string path,
            string expectedCurrentDaclSha256,
            string expectedCurrentNonDaclSha256,
            byte[] snapshotDacl,
            int targetControlFlags,
            string expectedTargetNonDaclSha256)
        {
            ValidateExpectedHash(expectedCurrentDaclSha256);
            ValidateExpectedHash(expectedCurrentNonDaclSha256);
            ValidateExpectedHash(expectedTargetNonDaclSha256);
            if (snapshotDacl == null || snapshotDacl.Length < 8
                || targetControlFlags < 0 || targetControlFlags > UInt16.MaxValue)
            {
                throw new ArgumentException("snapshot-control-restore-invalid");
            }
            string fullPath = ValidateDirectory(path);
            byte[] currentBytes = ReadDaclBytes(fullPath);
            DaclState before = Inspect(fullPath);
            if (!String.Equals(before.DaclSha256, expectedCurrentDaclSha256,
                    StringComparison.OrdinalIgnoreCase)
                || !String.Equals(before.NonDaclSha256, expectedCurrentNonDaclSha256,
                    StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("target-control-restore-starting-state-mismatch");
            }
            string snapshotHash = HashBytes(snapshotDacl);
            try
            {
                WriteDaclWithFlags(fullPath, new RawAcl(snapshotDacl, 0),
                    (ControlFlags)targetControlFlags, true);
                DaclState after = Inspect(fullPath);
                if (!String.Equals(after.DaclSha256, snapshotHash, StringComparison.Ordinal)
                    || !String.Equals(after.NonDaclSha256, expectedTargetNonDaclSha256,
                        StringComparison.OrdinalIgnoreCase)
                    || after.ControlFlagsValue != targetControlFlags
                    || !String.Equals(after.OwnershipSha256, before.OwnershipSha256,
                        StringComparison.Ordinal))
                {
                    throw new InvalidOperationException("target-control-restore-postcondition-failed");
                }
                return new DaclMutation
                {
                    Changed = !String.Equals(before.DaclSha256, snapshotHash, StringComparison.Ordinal)
                        || before.ControlFlagsValue != targetControlFlags,
                    AddedCount = 0,
                    RemovedCount = 0,
                    Before = before,
                    After = after
                };
            }
            catch (Exception mutationError)
            {
                RollBackDaclAndFlagsOrThrow(fullPath, currentBytes, before.DaclSha256,
                    before.ControlFlagsValue, before.NonDaclSha256, mutationError);
                throw;
            }
        }

        public static DaclState ApplyExactAceForTestOnly(
            string path,
            string sid,
            int accessMask,
            AceFlags flags)
        {
            if (String.IsNullOrWhiteSpace(sid) || accessMask <= 0)
            {
                throw new ArgumentException("test-ace-invalid");
            }
            byte[] beforeBytes = ReadDaclBytes(path);
            string beforeHash = HashBytes(beforeBytes);
            RawAcl changed = CloneAcl(beforeBytes, 1);
            int insertionIndex = FirstInheritedIndex(changed);
            changed.InsertAce(insertionIndex,
                new CommonAce(flags, AceQualifier.AccessAllowed, accessMask,
                    new SecurityIdentifier(sid), false, null));
            try
            {
                WriteDacl(path, changed);
                return Inspect(path);
            }
            catch (Exception mutationError)
            {
                RollBackOrThrow(path, beforeBytes, beforeHash, mutationError);
                throw;
            }
        }

        public static DaclState ValidateDaclBytesForTestOnly(byte[] daclBytes)
        {
            if (daclBytes == null || daclBytes.Length < 8)
            {
                throw new ArgumentException("test-dacl-invalid", "daclBytes");
            }
            RawAcl dacl = new RawAcl(daclBytes, 0);
            DaclState state = new DaclState
            {
                DaclSha256 = HashBytes(SerializeAcl(dacl)),
                NonDaclSha256 = "test-only",
                OwnershipSha256 = "test-only",
                AceCount = dacl.Count
            };
            CountTargetAces(dacl, state);
            ValidateNoConflictsOrDuplicates(state);
            return state;
        }

        public static int InferControlFlagsForNonDaclHashForRecovery(
            string path,
            string expectedNonDaclSha256)
        {
            ValidateExpectedHash(expectedNonDaclSha256);
            RawSecurityDescriptor descriptor = ReadDescriptor(path);
            string owner = descriptor.Owner == null ? "" : descriptor.Owner.Value;
            string group = descriptor.Group == null ? "" : descriptor.Group.Value;
            for (int value = 0; value <= UInt16.MaxValue; value++)
            {
                string candidate = owner + "\0" + group + "\0" + value.ToString("x8");
                if (String.Equals(HashBytes(Encoding.UTF8.GetBytes(candidate)),
                    expectedNonDaclSha256, StringComparison.OrdinalIgnoreCase))
                {
                    return value;
                }
            }
            throw new InvalidOperationException("target-control-flags-not-inferred");
        }

        public static DaclState ApplyControlFlagsForTestOnly(string path, int targetControlFlags)
        {
            if (targetControlFlags < 0 || targetControlFlags > UInt16.MaxValue)
            {
                throw new ArgumentException("test-control-flags-invalid", "targetControlFlags");
            }
            string fullPath = ValidateDirectory(path);
            byte[] beforeDacl = ReadDaclBytes(fullPath);
            DaclState before = Inspect(fullPath);
            try
            {
                WriteDaclWithFlags(fullPath, new RawAcl(beforeDacl, 0),
                    (ControlFlags)targetControlFlags, true);
                DaclState after = Inspect(fullPath);
                if (!String.Equals(after.DaclSha256, before.DaclSha256, StringComparison.Ordinal)
                    || after.DaclProtected != (((ControlFlags)targetControlFlags
                        & ControlFlags.DiscretionaryAclProtected) != 0))
                {
                    throw new InvalidOperationException("test-control-flags-postcondition-failed");
                }
                return after;
            }
            catch (Exception mutationError)
            {
                RollBackDaclAndFlagsOrThrow(fullPath, beforeDacl, before.DaclSha256,
                    before.ControlFlagsValue, before.NonDaclSha256, mutationError);
                throw;
            }
        }

        private static RawSecurityDescriptor ReadDescriptor(string path)
        {
            string fullPath = ValidateDirectory(path);
            uint needed;
            uint information = OwnerSecurityInformation | GroupSecurityInformation | DaclSecurityInformation;
            GetFileSecurityW(fullPath, information, null, 0, out needed);
            int firstError = Marshal.GetLastWin32Error();
            if (needed == 0 || (firstError != 0 && firstError != ErrorInsufficientBuffer))
            {
                throw new Win32Exception(firstError, "target-security-read-size-failed");
            }

            byte[] buffer = new byte[needed];
            if (!GetFileSecurityW(fullPath, information, buffer, (uint)buffer.Length, out needed))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "target-security-read-failed");
            }
            return new RawSecurityDescriptor(buffer, 0);
        }

        private static void WriteDacl(string path, RawAcl dacl)
        {
            string fullPath = ValidateDirectory(path);
            RawSecurityDescriptor current = ReadDescriptor(fullPath);
            WriteDaclWithFlags(fullPath, dacl, current.ControlFlags, false);
        }

        private static void WriteDaclWithFlags(
            string fullPath,
            RawAcl dacl,
            ControlFlags requestedFlags,
            bool forceProtectionDirective)
        {
            ControlFlags descriptorFlags = ControlFlags.DiscretionaryAclPresent
                | (requestedFlags & (ControlFlags.DiscretionaryAclDefaulted
                    | ControlFlags.DiscretionaryAclAutoInheritRequired
                    | ControlFlags.DiscretionaryAclAutoInherited
                    | ControlFlags.DiscretionaryAclProtected));
            RawSecurityDescriptor descriptor = new RawSecurityDescriptor(
                descriptorFlags,
                null,
                null,
                null,
                dacl);
            byte[] binary = new byte[descriptor.BinaryLength];
            descriptor.GetBinaryForm(binary, 0);
            uint information = DaclSecurityInformation;
            bool protectedDacl = (descriptorFlags & ControlFlags.DiscretionaryAclProtected) != 0;
            if (protectedDacl)
            {
                information |= ProtectedDaclSecurityInformation;
            }
            else if (forceProtectionDirective)
            {
                information |= UnprotectedDaclSecurityInformation;
            }
            if (!SetFileSecurityW(fullPath, information, binary))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "target-only-dacl-write-failed");
            }
        }

        private static RawAcl CloneAcl(byte[] bytes, int additionalCapacity)
        {
            RawAcl source = new RawAcl(bytes, 0);
            RawAcl clone = new RawAcl(source.Revision, source.Count + additionalCapacity);
            for (int index = 0; index < source.Count; index++)
            {
                clone.InsertAce(clone.Count, source[index]);
            }
            return clone;
        }

        private static int FirstInheritedIndex(RawAcl acl)
        {
            for (int index = 0; index < acl.Count; index++)
            {
                if ((acl[index].AceFlags & AceFlags.Inherited) != 0)
                {
                    return index;
                }
            }
            return acl.Count;
        }

        private static CommonAce HostPreparationAce(string sid)
        {
            return new CommonAce(
                AceFlags.None,
                AceQualifier.AccessAllowed,
                HostPreparationMask,
                new SecurityIdentifier(sid),
                false,
                null);
        }

        private static bool IsTargetSid(SecurityIdentifier sid)
        {
            if (sid == null)
            {
                return false;
            }
            return String.Equals(sid.Value, AllApplicationPackagesSid, StringComparison.Ordinal)
                || String.Equals(sid.Value, AllRestrictedApplicationPackagesSid, StringComparison.Ordinal);
        }

        private static bool IsExactHostPreparationAce(QualifiedAce ace)
        {
            CommonAce common = ace as CommonAce;
            return common != null
                && common.AceQualifier == AceQualifier.AccessAllowed
                && common.AccessMask == HostPreparationMask
                && common.AceFlags == AceFlags.None;
        }

        private static void CountTargetAces(RawAcl dacl, DaclState state)
        {
            SecurityIdentifier first = new SecurityIdentifier(AllApplicationPackagesSid);
            SecurityIdentifier second = new SecurityIdentifier(AllRestrictedApplicationPackagesSid);
            for (int index = 0; index < dacl.Count; index++)
            {
                QualifiedAce qualified = dacl[index] as QualifiedAce;
                if (qualified == null || qualified.SecurityIdentifier == null)
                {
                    continue;
                }
                bool exact = IsExactHostPreparationAce(qualified);
                if (qualified.SecurityIdentifier.Equals(first))
                {
                    if (exact) state.AllApplicationPackagesExactCount++;
                    else state.AllApplicationPackagesConflictCount++;
                }
                else if (qualified.SecurityIdentifier.Equals(second))
                {
                    if (exact) state.AllRestrictedApplicationPackagesExactCount++;
                    else state.AllRestrictedApplicationPackagesConflictCount++;
                }
            }
        }

        private static void ValidateNoConflictsOrDuplicates(DaclState state)
        {
            if (state.AllApplicationPackagesConflictCount != 0
                || state.AllRestrictedApplicationPackagesConflictCount != 0)
            {
                throw new InvalidOperationException("target-sid-conflict");
            }
            if (state.AllApplicationPackagesExactCount > 1
                || state.AllRestrictedApplicationPackagesExactCount > 1)
            {
                throw new InvalidOperationException("target-sid-duplicate");
            }
        }

        private static void ValidateStableTargetMetadata(DaclState before, DaclState after)
        {
            if (!String.Equals(after.OwnershipSha256, before.OwnershipSha256, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("target-ownership-postcondition-failed");
            }
            if (after.DaclProtected != before.DaclProtected
                || after.DaclDefaulted != before.DaclDefaulted)
            {
                throw new InvalidOperationException("target-dacl-control-postcondition-failed");
            }
        }

        private static void ValidateExpectedHash(string value)
        {
            if (String.IsNullOrWhiteSpace(value) || value.Length != 64)
            {
                throw new ArgumentException("expected-dacl-hash-invalid");
            }
            for (int index = 0; index < value.Length; index++)
            {
                char character = value[index];
                if (!((character >= '0' && character <= '9')
                    || (character >= 'a' && character <= 'f')
                    || (character >= 'A' && character <= 'F')))
                {
                    throw new ArgumentException("expected-dacl-hash-invalid");
                }
            }
        }

        private static string ValidateDirectory(string path)
        {
            if (String.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentException("target-path-invalid", "path");
            }
            string fullPath = Path.GetFullPath(path);
            if (!Directory.Exists(fullPath))
            {
                throw new DirectoryNotFoundException("target-directory-missing");
            }
            return fullPath;
        }

        private static byte[] SerializeAcl(RawAcl acl)
        {
            byte[] bytes = new byte[acl.BinaryLength];
            acl.GetBinaryForm(bytes, 0);
            return bytes;
        }

        private static string HashBytes(byte[] bytes)
        {
            using (SHA256 algorithm = SHA256.Create())
            {
                byte[] digest = algorithm.ComputeHash(bytes);
                StringBuilder text = new StringBuilder(digest.Length * 2);
                for (int index = 0; index < digest.Length; index++)
                {
                    text.Append(digest[index].ToString("x2"));
                }
                return text.ToString();
            }
        }

        private static string HashNonDacl(RawSecurityDescriptor descriptor)
        {
            string owner = descriptor.Owner == null ? "" : descriptor.Owner.Value;
            string group = descriptor.Group == null ? "" : descriptor.Group.Value;
            string value = owner + "\0" + group + "\0" + ((int)descriptor.ControlFlags).ToString("x8");
            return HashBytes(Encoding.UTF8.GetBytes(value));
        }

        private static string HashOwnership(RawSecurityDescriptor descriptor)
        {
            string owner = descriptor.Owner == null ? "" : descriptor.Owner.Value;
            string group = descriptor.Group == null ? "" : descriptor.Group.Value;
            return HashBytes(Encoding.UTF8.GetBytes(owner + "\0" + group));
        }

        private static void RollBackOrThrow(
            string path,
            byte[] rollbackDacl,
            string expectedRollbackHash,
            Exception mutationError)
        {
            try
            {
                WriteDacl(path, new RawAcl(rollbackDacl, 0));
                if (!String.Equals(HashDacl(path), expectedRollbackHash, StringComparison.Ordinal))
                {
                    throw new InvalidOperationException("automatic-rollback-verification-failed");
                }
            }
            catch (Exception rollbackError)
            {
                throw new InvalidOperationException(
                    "target-only-mutation-and-rollback-failed",
                    new AggregateException(mutationError, rollbackError));
            }
        }


        private static void RollBackDaclAndFlagsOrThrow(
            string path,
            byte[] rollbackDacl,
            string expectedRollbackDaclHash,
            int rollbackControlFlags,
            string expectedRollbackNonDaclHash,
            Exception mutationError)
        {
            try
            {
                WriteDaclWithFlags(path, new RawAcl(rollbackDacl, 0),
                    (ControlFlags)rollbackControlFlags, true);
                DaclState restored = Inspect(path);
                if (!String.Equals(restored.DaclSha256, expectedRollbackDaclHash,
                        StringComparison.Ordinal)
                    || !String.Equals(restored.NonDaclSha256, expectedRollbackNonDaclHash,
                        StringComparison.Ordinal)
                    || restored.ControlFlagsValue != rollbackControlFlags)
                {
                    throw new InvalidOperationException("automatic-control-rollback-verification-failed");
                }
            }
            catch (Exception rollbackError)
            {
                throw new InvalidOperationException(
                    "target-only-control-mutation-and-rollback-failed",
                    new AggregateException(mutationError, rollbackError));
            }
        }
    }
}
