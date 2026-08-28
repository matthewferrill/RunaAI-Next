# Native settings transition and exact rollback

Prospective continuation of the existing M1 operator slice, 2026-08-28. No live settings, listener,
firewall, route, model or power change is made by this plan or its pure byte-preparation module.
Fresh Home observation at19:43:22Z confirmed Node22.22.1, zero loaded instances and the existing
`0.0.0.0`/JIT/sensitive-log/verbose settings unchanged. Control's packaged Node pin is a different
binary; its version needs its own actual observation and must not be inferred from a digest or
substituted for Home's Node pin. The separate Control OS-proof system Node is not that packaged binary.

The installed CLI supports `server start --port 1234 --bind 127.0.0.1` and `server stop`. The official
[CLI start documentation](https://lmstudio.ai/docs/cli/serve/server-start) agrees, and the official
[stop documentation](https://lmstudio.ai/docs/cli/serve/server-stop) says active requests are terminated.
There is no JIT/logging setter in the installed CLI help. A maintainer describes manual configuration
file edits in [the CLI repository](https://github.com/lmstudio-ai/lms/issues/201), but this is not proof
that an in-memory setting has changed in the exact installed build. Reading a changed JSON file alone
is therefore insufficient qualification.

## Boundaries and sequence

1. Finish the finite candidate campaigns and verify their exact-owned cleanup. Do not overlap lifecycle
   operators. The root deployer must own a rollback-protected Control transaction and close/drain the
   current application admission before this procedure. Fresh native registry must be empty. An open
   predecessor route to Home1234 is not a quiescence proof; explicitly account for native LAN callers.
2. Enroll each private TLS key only on its owning host, with protected new directories. Transfer only
   public CSRs/certificates. Verify the selected profile, exact runtime/native source hashes, server and
   client public pins, and disabled prepared tasks. Neither a certificate nor package digest chooses
   or qualifies the model. Do not change BGE8412's existing listener or unrelated consumers.
3. Under the independent native ownership lock, retain the original raw server-config bytes privately,
   original listener/task identities and the exact rollback state. Check expected baseline bytes again.
   Stop only the bound existing HTTP server through the pinned supported CLI, after the coordinated
   quiescence. Do not stop the whole desktop process or invoke daemon up/down/default auto-launch.
4. Change only `networkInterface`, `justInTimeModelLoading`, `logSensitiveData` and `verbose`. Use a
   pre-compared atomic replacement with a private actual-preimage backup and preserve the original ACL.
   Leave port, CORS, auto-start and all other values untouched. Unexpected field/value/config changes
   fail closed. The candidate raw-byte digest is separate from semantic equivalence after vendor
   normalization; any difference in an unrelated setting is not an acceptable normalization.
5. Restart via the exact CLI/profile context and explicit loopback binding. Independently verify actual
   listener address, runtime process identity, settings and denied MCP policy. Prove JIT is disabled
   through an actual bounded negative test with an available exact-pinned nonresident model and a
   predeclared owned test intent, not a fake unknown model ID. Capture native instances before/after,
   retain any unexpected load as a failure, and reconcile only unambiguously test-owned instances.
   Keep the independent160W/thermal/headroom watchdog during this test; ambiguity never permits260W.
6. Run the assembled supervisor and worker under their real principals. Prove mTLS caller isolation,
   exact profile/load/response path, dependency loss, graceful drain, process crash, restart, long idle
   beyond the prior3600second JIT TTL, and exact cleanup. Root then switches the Control Caddy successor
   only after its own exact application/config/baseline checks. Preserve accepted request/reply bytes
   and application deadlines; no fallback route or JIT loading exists on failure.
7. A failure closes admission first, drains or independently stops exact owned workers, and reconciles
   exact owned residency. Restore the prior native settings byte-for-byte only if the current state is
   the exact owned candidate (or verified formatting-only normalization). If another actor changed an
   unrelated setting, retain both versions and stop: never overwrite that change. Restore the old
   listener/routing in the coordinator's documented order, then verify old behavior before reopening.

`native-settings.mjs` implements strict byte preparation and rollback eligibility, not this external
transaction. Its tests cannot prove CLI context discovery, settings reload, listener enforcement,
firewall behavior or the Control swap. Those remain actual-environment proof requirements. The current
desktop dependency on Matthew login is unchanged; startup-trigger registration alone is not boot
availability. No new runtime upgrade, public access, protected-data read, or mixed-model scheduler is
introduced here.

## Filesystem proof and concurrency limit

`Settings-FileTransaction.ps1` is a real Windows file primitive. Local tests exercise native atomic
replacement, preserved custom ACLs/CRLF bytes, before/after conflicts, late byte/ACL writers, hardlink
and junction refusal, and a child process exiting immediately after replacement followed by recovery
in a new process. JSON preparation rejects duplicate decoded keys, including same-value duplicates;
they are not formatting-only normalization. Omen's PowerShell7-to-Node test child explicitly selects
Windows PowerShell5 system modules; this does not change Home's environment.

Windows ReplaceFile retains the exact displaced file, but it is **not general compare-and-swap**.
Thus meaningful application/native-client quiescence and the exclusive operator lock remain entry
criteria. A late uncoordinated writer may have its version moved to the actual-preimage backup while
the candidate occupies the target. This is detected, every version is retained, and activation stays
closed. There is no blind compensating write: that could overwrite a still newer writer. Such a
conflict needs fresh reconciliation after renewed quiescence, not automatic rollback authority over
foreign bytes/ACLs. Normal crash recovery restores only the pinned original from the unchanged owned
candidate. A later unrelated edit is never knowingly replaced by that recovery.

The earlier CLI-help inspection's profile-pointer bookkeeping was checked separately: both Home
pointer files predate it (codex-audit2026-08-27, Matthew2026-08-08); no pointer was created by that probe.

Verification2026-08-28: native-settings plus Windows file-transaction tests14/14 passed, no skips;
roadmap15/15 passed. Initial duplicate-key and second-writer-compensation findings were independently
reported, reproduced, then corrected prospectively. These results do not assert a live Home transition.

## Native binding and finite coordinator

Read-only inspection of the exact pinned installed CLI found that `LMS_API_SERVER_INFO_PATH` selects
one existing internal API descriptor. That branch calls `tryFindLocalAPIServer`, not
`findOrStartLlmster`; an absent selected API fails closed. It also omits the default machine-specific
CLI key-file read, so authorization of actual server operations remains an explicit installed-runtime
proof requirement, not an assumption. No secret was copied and the CLI was not executed in this
inspection. Use this variable only in the child environment, never override HOME or user profiles.

Fresh read-only endpoint metadata20:15:02Z bound the existing internal41343/127.0.0.1 and public1234/
0.0.0.0 listeners to the same Matthew-owned LMStudio.exe PID14568, start2026-08-23T14:19:15.3385098Z.
`Observe-NativeServer.ps1` independently checks descriptor, executable, owner, process start and actual
listeners; `native-server-control.mjs` pins the CLI, Home Node, engine and all observer dependencies,
allows only literal server-stop or explicit1234/bind-start, and never retries an unknown mutation.
The transient registry check closes its own connection so it cannot masquerade as customer traffic.

`native-settings-transition.mjs` supplies the finite apply and explicit-restore coordinator, with
intent records before effects, independent ownership/quiescence/hardware callbacks, a real available
Nomic negative-probe contract and no admission/promotion/power-raise operation. Its12 combined local
coordinator/controller tests are control-flow tests, not installed proof. HTTP503 or a generic error
is not JIT-disabled evidence. The actual negative response must be classified from the pinned native
runtime and retained alongside before/after inventories and the independent hardware lease.

Assembly still needs the actual native ownership wrapper, live Control drain/caller isolation,
Windows file bridge and negative-probe adapter connected to these interfaces. No script in this
change is an activation command. Before a live transition, close the scoped Control routes, account
for direct nativeLAN callers, and prove their drain. Empty model inventory or TCP counts alone are
not an active-request counter, and neither governs unrelated trusted local desktop/CLI clients.

Independent root verification of the earlier integrated operator snapshot97c94ae passed81/81 with no
skips using OS access; the initially restricted run failed only the CIM-backed scheduled-task-settings
check and remains retained. Root log:
`artifacts/runs/home-runtime-root-97c94ae-1787948178122/tests.log`, SHA256
`b6685ae82a8efb80e2b0aef73bd32d41111526737ce601dd6815432606c8e480`.
That independently tested snapshot does not include the subsequently added transition coordinator.

Current local full operator regression including the prospective transition code passed93/93,
zero skips; roadmap15/15 passed. No installed transition/probe/promotion was executed by those tests.

## Native admission/drain investigation

Read-only static inspection at2026-08-28T20:58:27.941Z retained selected exact installed-code sections
in `evidence/20260828-native-drain-source.json`, SHA256
`f1dde2e18e5eecfcb803534ec827516a817b0166bba35e9b9acf667a3039fae9`.
The source matches the already-pinned24,258,428-byte LM Studio index.js; the collector parses its
literal string table but never imports or executes vendor code and never reads settings, credential
stores, or inference logs. Its `tryStopServer` implementation closes all connections and destroys the
tracked sockets. It is not a graceful request-drain primitive.

The official [CLI status reference](https://lmstudio.ai/docs/cli/serve/server-status) exposes running/
port status, not active request accounting. The public
[diagnostics namespace](https://github.com/lmstudio-ai/lmstudio-js/blob/main/packages/lms-client/src/diagnostics/DiagnosticsNamespace.ts)
exposes a raw log stream, not a safe aggregate drain counter. No log stream was opened for this work.
The initial selected-source search did not establish an externally accessible, native-wide admission/
drain API; this is a bounded search result, not a proof that none exists. A second bounded static
collector is prepared for the next between-model window, not run during measured campaign traffic.

The actual Control maintenance overlay independently preserves active upstream counters and allows
its existing requests to finish. That proves only the selected Caddy-proxied path. Direct Home LAN1234
and trusted local desktop/CLI/internal41343 callers still need a meaningful controlled maintenance
boundary before any native stop. A zero TCP or resident-model snapshot does not supply that boundary.
No native transition is authorized by an empty registry alone, and no active caller is knowingly
terminated merely to make the deployment test pass.

## Prospective direct-restore ownership hardening

Before wiring the file bridge, a local source review found that `Repair-InterruptedSettingsSwap`
checks the actual preimage against the original intent, but its directly exported
`Restore-SettingsActualPreimage` helper did not repeat that check. An explicit restore callback must
not be able to bypass preimage ownership merely by choosing the lower-level helper. Require the
actual backup bytes and ACL to match the retained original intent before creating a restore draft or
replacing the target. Test direct invocation after a late apply conflict and after backup tampering;
it must reject without changing the owned candidate or producing a displaced/restore artifact.
Normal direct restore and verified formatting-only current-candidate normalization remain supported.
These are local filesystem regressions only; no Home transition or model call is part of the fix.

Implemented after criteria `ed2fa70`: the direct-call late-preimage regression first reproduced the
unexpected success, then the helper gained its own exact original hash/ACL check. Focused native
settings, coordinator and actual Windows file tests passed23/23 with zero skips. Four direct-call
foreign-preimage variants reject before new files/writes; normalization restores the exact original.
The earlier unsafe result is retained in the task output, not relabeled as a pass. No live deployment
or campaign qualification follows from these local filesystem tests.

Complete operator regression at `410e3bc`:115/115 passed, zero skips, with Windows OS access; runtime
41.4seconds. Command: `node --test --test-reporter=spec gate7f/function-first/home-runtime/*.test.mjs
gate7f/function-first/home-runtime/windows-proof/*.test.mjs`. This includes the real local TLS,
bounded command transport, exact file replacement and process-crash fixtures, not a live Home service.

The second read-only static collection at2026-08-28T21:51:14.884Z, between completed Coder and new Qwen
leases, is `evidence/20260828-native-drain-details.json`, SHA256
`100b766f8dea308406fb77a17e1b99a950f0577263b0f50bc077c29d227b796c`.
Its exact installed diagnostics provider implements a log stream, not an aggregate drain counter;
no log stream was opened. REST server stop cancels tracked predictions, so it cannot be called a
graceful drain. Native model-loading source also exposes internal processing-stat signals; investigate
the supported busy/unload contract before concluding that maintenance requires a new external counter.
The available-model/JIT-disabled branch is now located: it returns an invalidModelIdentifier failure
whose message explicitly states JIT is disabled. The actual negative-probe status/body still must be
captured with the pinned available Nomic model after safe transition; static code is not the live proof.
