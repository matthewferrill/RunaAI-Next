# M1-S2B project-source adapter register — 2026-09-03

Status: architecture input; only the named first implementation is active scope  
Decision-input roadmap revision/digest: `2026-08-28.1` / `0e87173ebabfd8759adee4dd66f65a1964430c102bb62311fe0d462f601c262c`

## Purpose

Runa must not equate every project source with Git. The server-managed worker consumes a normalized,
version-bound workspace manifest, while a source adapter owns provider-specific discovery, authorization,
materialization, refresh and writeback. This keeps the execution boundary stable without presenting false Git
concepts such as branches or commits for systems that use revisions, changelists, changesets, locks or plain files.

## Source families and disposition

| Family | Representative systems | Native source concepts | First disposition |
|---|---|---|---|
| Git protocol | GitHub, GitLab, Bitbucket, Azure Repos Git, self-hosted Git, bare HTTPS/SSH Git | commit, ref, branch, tag, remote | First M1 proof is exact allowlisted public HTTPS only; private/provider auth, self-hosted endpoints and SSH follow separate broker/endpoint acceptance |
| Centralized version control | Perforce Helix Core, Apache Subversion, Azure DevOps TFVC | depot/stream/changelist; repository/revision; workspace/changeset/shelveset | Preserve adapter slots; implement only from customer demand in M2/M3 |
| Other distributed VCS | Mercurial, Fossil | changeset/revision and named/bookmarked lines | Preserve adapter slots; defer |
| One-time file source | browser folder picker, individual upload, ZIP/TAR archive | immutable captured snapshot | Implement bounded file/folder snapshot after Git read-only |
| Persistent file source | optional local bridge, SMB/NFS share through a trusted worker, SSH/SFTP remote folder | path tree plus adapter-generated version manifest | Local bridge design only; other transports defer |
| Cloud content store | OneDrive/SharePoint, Google Drive, Dropbox, Box | provider file id, version/revision, export format | Read-only project/source snapshot in M2/M3; not a live execution mount |
| Object/data store | S3-compatible object storage, Azure Blob, R2, governed database export | object version/etag or query/export digest | Dataset/artifact input, not a code repository; later capability-specific adapters |
| Package/artifact registry | npm, PyPI, NuGet, Maven, container/artifact registries | immutable package/image/artifact digest | Dependency/artifact input after separate egress and supply-chain policy |
| Work-management context | Jira, Linear, Azure Boards, Trello, ClickUp, issue trackers | issue/work-item id and version | Task context only; never filesystem or execution authority |
| Remote development environment | SSH host, dev container, Codespace, VM, Kubernetes workload | environment/session identity | Execution-environment adapter, not a project-source adapter; defer |

Git hosting brands do not require separate execution-worker architectures. The common Git adapter owns safe
clone/fetch/status/diff semantics after each admitted transport passes its own boundary. Provider connectors add
OAuth/GitHub App or equivalent identity, repository selection, short-lived credential exchange and later provider
APIs such as pull requests or CI. Self-hosted and SSH endpoints are not inferred from public-HTTPS acceptance.

Non-Git version-control systems do require distinct semantics:

- Perforce materializes a client workspace at an exact depot revision/changelist and may use streams, exclusive
  locks and large/binary assets. Writeback is a submitted changelist or shelf, not a Git commit.
- Subversion materializes a working copy at an exact repository URL and revision. Branches are repository paths,
  and writeback creates a repository revision.
- TFVC binds server paths to an owned workspace and records pending changes, check-ins and shelvesets. Microsoft
  documents machine-bound workspaces and separate workspace permissions; Runa must not map them to Git branches.
- Mercurial and Fossil use their own changeset/ref and synchronization rules and need pinned native clients before
  they can be admitted.

## Normalized adapter boundary

Every source adapter implements the same product lifecycle without erasing native meaning:

1. `discover`: return user-visible source identity and capabilities without source content.
2. `authorize`: bind exact account/host/source and read/write scopes; read never implies write.
3. `resolve`: convert a user selection into an immutable native version, or state honestly that the source has no
   native immutable version.
4. `materialize`: create a new Runa-owned workspace from the resolved version using a bounded credential lease.
5. `manifest`: emit safe relative paths, sizes/content digests, native version and complete/excluded status.
6. `refresh`: compare a new native version with the materialized base; never silently replace dirty work.
7. `proposeWriteback`: express the exact native operation—push branch, submit changelist, commit SVN revision,
   check in TFVC changes, upload version or apply file patch.
8. `executeWriteback`: reauthorize and perform only the approved proposal through a fresh credential lease.
9. `reconcile`: prove outcome after timeout/crash before any retry.
10. `revoke`: block new leases, expire sessions and retain truthful pending cleanup state.

The normalized manifest records `sourceKind`, `sourceId`, `nativeVersionKind`, `nativeVersion`, `snapshotDigest`,
`complete`, `exclusions`, `adapterRelease`, `authorizationId`, `createdAt` and `expiresAt`. UI labels use each
adapter's native terminology; Runa does not call a generated snapshot a repository commit.

## Security invariants across adapters

- Provider credentials exist only inside the source-ingress or writeback broker. They never reach model context,
  the code execution process, workspace files, logs or general Control application state.
- Provider selection resolves an authority-owned repository id to an approved endpoint. Raw URLs are not network
  grants: adapters pin scheme/host/port, reject cross-origin redirects, private/loopback/link-local/reserved/metadata
  destinations and DNS rebinding, and require pinned SSH host keys where SSH is later supported.
- Source materialization and model-authored execution are separate phases. Network is closed before untrusted code
  runs unless a later operation has its own explicit egress contract.
- Hooks, user/global configuration, credential helpers, external filters, macros, archive traversal, symlinks,
  reparse points, submodules, LFS and provider-side automation are denied until specifically accepted.
- Every materialization has size/file/time limits, exact completion/exclusion reporting and an immutable source or
  snapshot digest. Partial retrieval cannot appear complete.
- Writeback is adapter-specific, separately approved and idempotently reconciled. Read access cannot create a
  branch, submit a changelist, check in a changeset, overwrite a cloud file or publish an artifact.
- Work-management, database and cloud-document connectors provide bounded context only. Their instructions and
  content cannot expand tool authority.
- Every adapter uses a new source/workspace capability-set version and server-derived participant/project/
  environment bindings. Existing chat, research or harmless-JavaScript grants do not gain source or writeback
  authority merely because an adapter is installed.

## Delivery order

1. Generic Git over HTTPS with public repositories and immutable commit resolution.
2. Git provider authorization and private read-only materialization, starting with the provider actually used by
   the steward; provider write/push remains a separate capability.
3. Bounded browser upload/folder/archive snapshot.
4. Optional non-executing local-folder bridge if customer workflow requires persistent sync or writeback.
5. Perforce, Subversion, TFVC, cloud-drive or SSH/SFTP adapters only when an actual customer/use case supplies
   native acceptance scenarios and infrastructure.

This ordering avoids implementing speculative connectors while preventing the M1 Git implementation from becoming
a hard-coded architecture that cannot accept other source types later.

## Current external references

- Perforce `p4 sync`: <https://help.perforce.com/helix-core/server-apps/cmdref/current/Content/CmdRef/p4_sync.html>
- Apache Subversion working-copy model: <https://svnbook.red-bean.com/>
- Microsoft TFVC workspaces: <https://learn.microsoft.com/en-us/azure/devops/repos/tfvc/create-work-workspaces>
- Google Drive download/export and revision behavior: <https://developers.google.com/workspace/drive/api/guides/manage-downloads>
