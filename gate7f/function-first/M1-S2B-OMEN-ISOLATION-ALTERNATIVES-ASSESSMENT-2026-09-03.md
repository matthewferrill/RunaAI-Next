# M1-S2B Omen isolation alternatives assessment

Date: 2026-09-03  
Status: read-only evidence; superseded as the primary-path recommendation by the steward decision below  
Roadmap revision/digest: `2026-08-28.1` / `0e87173ebabfd8759adee4dd66f65a1964430c102bb62311fe0d462f601c262c`  
Milestone/capability scope: M1-S2B; bounded C06/C07 local Git inspection supporting C15/C16

## Superseding product decision — 2026-09-03

The steward clarified that ordinary Code should clone a connected remote repository into a Runa-managed
server workspace. The end-user browser PC is not the default execution host. The Omen companion is now optional
local-folder transport only, and fully local execution is deferred. Therefore the sealed Omen transition is no
longer the next step or a prerequisite to the primary Code journey. It remains valid historical engineering
evidence and must not run without a new explicit decision and the existing informed-approval gate. The accepted
replacement is `M1-S2B-SERVER-MANAGED-WORKSPACE-ARCHITECTURE-2026-09-03.md`.

## Assessment decision before the product correction

Runa can be redesigned to avoid changing the `C:\` root DACL, but no evaluated alternative is a
ready, lower-risk, contract-equivalent replacement for the sealed Omen implementation. The current
`microsoft-mxc` / `appcontainer-dacl` transition remains the smallest implementation that can continue
M1-S2B on the present Omen build. It adds only the two documented, non-inheriting AppContainer root
metadata grants, records the exact prior security descriptor, and owns exact rollback.

This decision separates two meanings of "avoid modifying `C:\`":

- A dedicated worker or a newer BaseContainer backend can avoid changing the root directory DACL.
- No locally installed Windows isolation backend can promise zero operating-system changes on `C:`.
  Accounts, firewall/local-policy state, Windows optional features, worker binaries, profiles or a WSL
  virtual disk still create or change protected machine state unless deliberately placed elsewhere.

The sealed transition remains blocked on explicit informed approval. This assessment does not grant it,
launch UAC, change an ACL, create an account, enable a feature, install a WSL distribution, alter firmware,
run Git, open a browser journey or invoke a model.

## Actual Omen facts checked

- Windows 11 Home, x64, build 26200.
- Hardware virtualization support is present, but virtualization is disabled in firmware.
- WSL 2.7.10.0 is installed and defaults to WSL2; no Linux distribution is installed.
- The current MXC 0.8.0 support probe reports only `processcontainer` with isolation tier
  `appcontainer-dacl`. It reports that BaseContainer was not selected and AppContainer+BFS is not compiled
  into the binary.
- Two enabled Codex sandbox local users exist and the Windows Firewall service is running. This proves the
  machine can host the general dedicated-low-privilege-user pattern; it does not authorize Runa to reuse
  Codex-owned identities, credentials, broker or firewall policy.

## Alternatives

| Backend | Avoids `C:\` root DACL | Ready on this Omen | Equivalent to the frozen Runa boundary | Disposition |
|---|---:|---:|---:|---|
| Runa-owned dedicated low-privilege Windows worker | Yes | No | Potentially, after new design and actual qualification | Viable future backend; not a drop-in |
| Restricted-token worker under the signed-in user | Yes | Technically | No | Reject as sole production boundary |
| WSL2 worker with a D:-located distribution | Yes | No | No | Optional future Linux-project backend |
| MXC BaseContainer / `CreateProcessInSandbox` | Yes | No | Closest future equivalent | Preferred automatic upgrade path when supported |
| MXC AppContainer+BFS | Yes | No | Not currently supportable | Reject on current shipping MXC |
| Windows Sandbox / Hyper-V VM | Yes | No | Could be stronger but much heavier | Not viable on current Home/firmware state |
| Full third-party VM/container daemon | Yes | No | Requires a separate product/security contract | Defer |
| Current MXC AppContainer+DACL | No | Implementation complete; host prerequisite pending | Yes, under frozen contract | Proceed now if explicitly approved |

## Why the dedicated-worker design is not a switch

A Runa-owned version of the Codex elevated sandbox pattern would need all of the following before it could
replace the current backend:

1. Runa-owned non-interactive local identities and groups; random credential creation, protected custody,
   rotation, repair and uninstall behavior; and explicit logon-right handling.
2. A privileged broker with authenticated, bounded IPC. The model and ordinary web application must never
   receive the worker credential or gain a general process-launch interface.
3. Per-job grants for only the selected D: root and pinned runtime, plus removal and reconciliation after a
   crash. Existing broad user readability must not silently leak into the worker.
4. Default-deny outbound network enforcement, including firewall rule ownership, conflict detection,
   restoration and proof on Home edition.
5. Job-object containment, complete process-tree termination, resource/output/time limits, private desktop
   or equivalent UI isolation, and denial of clipboard, input injection and system-control surfaces.
6. The existing root-identity, reparse/hardlink, Git-binary/config, repository-mutation, UI, timeout,
   cleanup and truthful-receipt witnesses, adapted to the new trust boundary.
7. Installer, upgrade, rollback and deprovision evidence on Omen, Control and Home-relevant workflows,
   followed by independent review and bounded actual-system acceptance.

OpenAI documents the same broad tradeoff for Codex on Windows: its stronger elevated mode uses dedicated
lower-privilege sandbox users together with filesystem boundaries, firewall rules and local-policy changes;
the unelevated restricted-token fallback provides weaker network isolation. Runa cannot inherit either
implementation or its acceptance merely because Codex accounts exist on Omen.

## Why WSL2 is not the immediate answer

WSL2 cannot currently start on this machine without a firmware setting change, and no distribution exists.
Enabling the complete path may require an optional-feature change and restart. Even after setup, Runa would
need to requalify Windows/D: path mapping, Git identity/config and line-ending behavior, case/ownership
semantics, DPAPI device identity, selected-root escape prevention, Windows UI witnesses, cancellation and
cleanup. Mounting a host drive into WSL without a narrow broker can expose more of the machine than the
current selected-root contract. A distribution can be placed on D:, but WSL still changes Windows system
state; it does not satisfy a literal zero-`C:`-change requirement.

## Best future path

The closest no-root-DACL successor is MXC BaseContainer because it preserves the present policy abstraction.
Microsoft's current MXC support matrix requires Windows build 26600 or later plus the applicable OS feature;
Omen is build 26200 and the live MXC probe did not select that tier. When Omen reaches the supported build,
Runa should probe BaseContainer first, rerun the frozen boundary/adversarial/actual-system acceptance against
that tier, and prefer it without performing the DACL transition.

AppContainer+BFS is not a bridge for the present release. MXC documents the shipping tier as disabled because
the supporting `bfscfg.exe` path can deadlock the host on current Windows 11 25H2 builds.

## Recommended sequence

1. Keep commit `4388d0a` and its P0=0/P1=0, 61/61 reviewed transition as the present M1-S2B implementation.
2. Do not run the sealed transition on the primary path. It may be reconsidered only for a separately approved
   fully local/private execution mode.
3. Add BaseContainer preference as a future compatibility slice when Omen actually satisfies its OS gate.
4. Treat a Runa-owned dedicated worker as a separately designed backend for future multi-device/product use,
   not as an unreviewed substitution inside this acceptance run.
5. Do not use restricted-token-only or WSL2 execution to claim the current no-network/no-outside-root boundary.

## Public technical references

- OpenAI, Codex Windows sandbox: <https://learn.chatgpt.com/docs/windows/windows-sandbox>
- Microsoft MXC process-container OS support: <https://github.com/microsoft/mxc/blob/main/docs/process-container/os-version-support.md>
- Microsoft MXC host preparation: <https://github.com/microsoft/mxc/blob/main/docs/host-prep.md>
- Microsoft `CreateProcessInSandbox`: <https://learn.microsoft.com/en-us/windows/win32/secauthz/createprocessinsandbox>
- Microsoft Windows Sandbox requirements: <https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/>
