# Gate 7E target-only Control host repair plan

Date: 2026-08-26
Branch: `codex/gate7e-control-environment-fix`
Starting commit: `bad50a3476e655d18a5a64677c16d7970c772c31`

Status: completed on Control at `747aabc03b291badf4f8a16743a7bd019d384451`. The exact results,
including the automatically rolled-back first activation and corrected successor, are recorded in
`GATE7E-CONTROL-REPAIR-AND-ACTIVATION-RESULTS-2026-08-26.md`.

## Authorization and objective

The steward authorized design, implementation, testing, Control reconciliation, Gate 7E deployment, and
complete documentation. The objective is to replace the unsafe released MXC drive-root preparation path
with a repository-owned target-only operator, reconcile Control's partial root state, prove real sandbox
execution, and activate the already accepted harmless JavaScript Run capability only when every gate is
green.

This authorization does not broaden the Gate 7E capability. Network, package installation, repository or
project access, persistent execution files, terminal behavior, Git operations, multi-file execution, and
broader Code work remain deferred.

## Frozen Control starting state

- Active application release: `runaai-next-gate7d-current-turn-2026-08-25-e10e3db`.
- Active application commit: `e10e3db097d894d1f00b389921ceab0decaff24c`.
- Gate 7E is not active.
- `C:\` has exactly one matching package-group ACE:
  - `S-1-15-2-1` / `ALL APPLICATION PACKAGES`;
  - explicit allow;
  - access mask `0x00120088`;
  - no inheritance or propagation.
- `S-1-15-2-2` / `ALL RESTRICTED APPLICATION PACKAGES` does not have the matching ACE.
- No Gate 7E task, `wxc-host-prep`, `icacls`, or temporary operator remains.

The released `wxc-host-prep prepare-system-drive` and `unprepare-system-drive` commands are prohibited for
the rest of this repair because Microsoft MXC issue 648 shows that both can normalize descendant DACLs.

## Target-only operator design

The repository will retain reviewable C# source loaded by a bounded PowerShell operator. The native write
must use `SetFileSecurityW` with `DACL_SECURITY_INFORMATION`, matching the target-only direction in draft
MXC pull request 649. It must never call `SetNamedSecurityInfoW`, `Set-Acl`, `icacls`, or the released MXC
host-preparation binary.

The operator must:

1. read the target's DACL and preserve every non-target ACE and its order;
2. recognize trustees by exact SID rather than localized names;
3. add only standard explicit allow ACEs for `S-1-15-2-1` and `S-1-15-2-2`, mask `0x00120088`, with no
   ACE flags;
4. treat any different ACE for either target SID as a conflict and fail before writing;
5. be idempotent when the exact tuple already exists;
6. expose an exact raw-DACL snapshot and hash;
7. restore that exact snapshot through the same target-only native write;
8. verify the post-write raw DACL and expected tuple count before reporting success;
9. emit only bounded aggregate JSON without SDDL, account names beyond the two public package groups,
   paths outside the named test/control root, or private values; and
10. restrict the production entry point to the literal system-drive root while allowing arbitrary roots
    only through a separate test harness.

## Disposable validation

Before any Control root write, tests must prove on newly created disposable Windows directories:

- applying the first and second exact ACE changes only the named parent;
- an existing child's raw DACL bytes remain identical across apply, idempotent reapply, exact removal, and
  snapshot restore;
- an inheritance-inconsistent child remains byte-identical;
- apply is idempotent and never duplicates either tuple;
- a conflicting same-SID ACE fails closed and leaves parent and child DACL bytes unchanged;
- snapshot restore returns the parent's raw DACL bytes exactly to baseline;
- invalid paths, target hashes, masks, SIDs, modes, and non-elevated production use fail closed; and
- no temporary file, assembly, task, or directory remains after the test.

The Gate 7E Node tests must statically enforce the native API and prohibited-operation boundary. The full
repository suite must remain green.

## Control audit and rehearsal

Before reconciling `C:\`, the owner-context operator must verify:

- machine `RUNA-CONTROL`, owner `RUNA-CONTROL\Matthew`, exact source commit, clean checkout, and exact file
  hashes;
- the active application release and commit above;
- the exact one-ACE starting state and a bound raw-DACL hash for `C:\`;
- no retained Gate 7E helper process or task;
- accessibility and raw-DACL hashes for a bounded allowlist of critical application directories; and
- current application readiness.

The exact source is then staged under the existing Control candidate staging root. A one-use SYSTEM task
must first run the complete disposable-directory validation from that staged source. The task is always
unregistered and its temporary tree is always deleted.

## Control reconciliation transaction

The root transaction is one bounded SYSTEM operation:

1. recheck the exact precondition and root DACL hash;
2. retain the original raw DACL only inside the running transaction;
3. use the target-only operator to add the missing `S-1-15-2-2` tuple while preserving the existing exact
   `S-1-15-2-1` tuple;
4. verify exactly one copy of each tuple, unchanged owner/control state, and unchanged hashes for the
   allowlisted descendant paths;
5. on any failure, restore the original root DACL through `SetFileSecurityW`, verify the original hash and
   one-ACE state, and report failure; and
6. unregister the task and delete all one-use files in either outcome.

No attempt is made to guess or rewrite historical descendant ACLs for which no pre-incident snapshot
exists. The transaction proves that this repair causes no new descendant change.

## Real sandbox and release gates

Control's SYSTEM-context preflight established an additional host compatibility condition: MXC's Win32k
kill switch prevents the pinned Node runtime from initializing (`0xC0000142`). The production policy may
enable Win32k startup compatibility only if generated-policy tests prove all remaining MXC job UI limits
stay active and QuickJS continues to expose no GUI host object. The execution receipt must state that
restricted compatibility mode rather than claim that UI is wholly denied.

The SYSTEM task profile temp tree is not an accepted transient-source parent because the selected
AppContainer cannot traverse that profile ancestry. Production uses an application-owned transient root
beside `config`, outside every immutable release. Each request still gets one exclusively created private
subdirectory and exact source file; MXC and Node receive only a read grant to that file, and the request
subdirectory is removed before any receipt returns.

After successful reconciliation:

1. MXC's read-only support probe must no longer report `prepare-system-drive-required`.
2. A disposable compact Node/QuickJS/MXC preflight must return the exact typed
   `runa2-sandbox-ready` result. The prior blocker is not an acceptable outcome.
3. Arithmetic execution must return an executed receipt and exact output from the real Control sandbox.
4. Filesystem write/read escape, network, process, worker, environment, stdin, deadline, memory, and output
   adversarial cases must remain fail-closed.
5. The complete exact-Control repository suite must pass.
6. A clean immutable successor release must be built, hash-pinned, staged, and deployed through the
   existing application-and-Caddy rollback operator with UI contract `gate7e-harmless-javascript`.
7. Startup must refuse traffic unless the complete real sandbox preflight is green.
8. Application, readiness, owner route, ordinary-user route, Chat, Code drafting, Run presentation, and
   rollback evidence must pass. Protected product data and authority must remain unchanged.

If host reconciliation or the real sandbox gate fails, no successor is constructed. If application
activation fails after the independently verified host repair, the application and Caddy return to the
exact Gate 7D predecessor; the verified complete root tuple pair remains as the accepted host prerequisite.

## Completion criteria

The repair is complete only when:

- Control has exactly the two documented target-only root tuples;
- the repair introduced no observed descendant DACL change;
- the real sandbox and full suite are green on Control;
- the exact Gate 7E successor is active and rollback-protected;
- an ordinary-user Run result is truthfully labelled only after a typed execution receipt; and
- the branch is documented, clean, committed, pushed, reviewed, and merged with exact production evidence.

## Primary sources

- [Microsoft MXC issue 648](https://github.com/microsoft/mxc/issues/648)
- [Draft Microsoft MXC pull request 649](https://github.com/microsoft/mxc/pull/649)
- [Microsoft MXC host preparation](https://github.com/microsoft/mxc/blob/main/docs/host-prep.md)
- [Microsoft SetFileSecurity](https://learn.microsoft.com/windows/win32/api/winbase/nf-winbase-setfilesecurityw)
- [Microsoft SetNamedSecurityInfo](https://learn.microsoft.com/windows/win32/api/aclapi/nf-aclapi-setnamedsecurityinfow)
