# Native settings transition and exact rollback

Prospective continuation of the existing M1 operator slice, 2026-08-28. No live settings, listener,
firewall, route, model or power change is made by this plan or its pure byte-preparation module.
Fresh Home observation at19:43:22Z confirmed Node22.22.1, zero loaded instances and the existing
`0.0.0.0`/JIT/sensitive-log/verbose settings unchanged. Control's packaged Node24 pin is a different
binary; it must not be substituted for Home's Node pin.

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
   compared atomic replacement with a private original-byte backup and preserve the original ACL.
   Leave port, CORS, auto-start and all other values untouched. Unexpected field/value/config changes
   fail closed. The candidate raw-byte digest is separate from semantic equivalence after vendor
   normalization; any difference in an unrelated setting is not an acceptable normalization.
5. Restart via the exact CLI/profile context and explicit loopback binding. Independently verify actual
   listener address, runtime process identity, settings and denied MCP policy. Prove JIT is disabled
   through a bounded prospective negative test or a trustworthy native in-memory configuration
   observation, not merely a fake unknown model ID. Any unexpected residency remains a recorded failure;
   never infer ownership from its name or raise power while ambiguous.
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
