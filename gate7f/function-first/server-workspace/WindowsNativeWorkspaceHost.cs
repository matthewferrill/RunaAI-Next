using System;
using System.Collections.Generic;

namespace RunaAI.M1.ServerWorkspace;

// Gate-1 contract source only. The source/build/hash gate must replace every throwing method with reviewed
// Job/AppContainer/PROC_THREAD_ATTRIBUTE_HANDLE_LIST and watchdog ownership-channel implementations.
internal sealed record NativeResourceReference(string InternalResourceId);
internal sealed record NativeOwnershipReceipt(
    string OperationId,
    string BatchId,
    int BatchRevision,
    int ResourceCount,
    string BatchDigest,
    bool OwnershipCommitted,
    long LedgerRevision,
    string WatchdogProcessIdentitySha256,
    string ReceiptHmac);

internal sealed record NativeOwnedResourceProjection(
    string InternalResourceId,
    string NativeObjectType,
    string Role,
    string Child,
    string Direction,
    uint SourceProcessId);

internal sealed record NativePublicationInspectionBatch(
    string SchemaVersion,
    string OperationId,
    string Phase,
    IReadOnlyList<NativeOwnedResourceProjection> OwnedResources,
    string OwnedResourcesDigest,
    NativeOwnershipReceipt OwnershipReceipt);

internal sealed record NativePublicationInspectionResult(
    string SchemaVersion,
    string OperationId,
    object Result,
    IReadOnlyList<NativePublicationInspectionBatch> OwnershipBatches);

internal sealed record NativeSetupResult(
    string OperationId,
    NativeResourceReference Job,
    IReadOnlyList<NativeResourceReference> ChildProcesses,
    IReadOnlyList<NativeResourceReference> PrimaryThreads,
    IReadOnlyList<NativeResourceReference> InheritedResources,
    NativeOwnershipReceipt OwnershipReceipt);

internal sealed class WindowsNativeWorkspaceHost
{
    internal NativeSetupResult PreparePublicGitOperation(string operationId)
        => throw new PlatformNotSupportedException("native source/build/hash gate not completed");

    internal void ResumeAllChildren(string operationId, IReadOnlyList<string> primaryThreadResourceIds)
        => throw new PlatformNotSupportedException("native source/build/hash gate not completed");

    internal void TearDownOperation(string operationId)
        => throw new PlatformNotSupportedException("native source/build/hash gate not completed");
}
