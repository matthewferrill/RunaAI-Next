# Prospective privilege-separated runtime supervision

2026-08-28, before implementation. This is the remaining operator slice, not a change to the active
campaign or a production activation. Existing finite leases remain sole live lifecycle owners.

Keep the network-facing TLS/proxy worker at LocalService, not SYSTEM/admin. A non-network-facing
SYSTEM supervisor owns the existing native controller/adapter and its exact artifact/settings reads,
power160/260 operations, pinned model loads/unloads and5second hardware observation. Thus no ACL needs
to be added to Matthew's existing model/runtime files merely to let the network worker read them.
New code/profile/secrets/state/IPC paths stay inside the dedicated operator root, with explicit ACLs.

Reduce privileged IPC to `admit`, `release` and `status` only. The worker cannot request load/unload,
power changes, new profiles, paths, commands, arbitrary record writes or recovery. Bind each message
to the supervisor-created session, observed worker PID/start-time, sequence, fresh timestamp and MAC.
The worker and supervisor obtain their session key only from a protected new file; never send/log it.
No prompt, message body, source document or model reply crosses this privileged control channel.

The supervisor's controller owns native admissions and returns opaque generation-bound grants. Every
grant has a bounded deadline and is released only after the network worker finishes/cancels its request,
or after independent exact-PID/start-time proof that the worker has stopped. Expiry revokes a grant;
it must not pretend that an unacknowledged request is already stopped. Runtime fault closes/revokes
all grants. An unresponsive worker is stopped only by its exact observed process identity, never by
name, broad task pattern or port. No supervisor message can execute customer code.

The physical IPC layer must protect the request/response directories independently, reject links and
oversized/replayed/partial messages, and use bounded waits and create-only request/reply identities.
The broker's pure tests are not evidence of OS ACLs or interprocess isolation. Tests must cover wrong
MAC/session/worker, replay, extra fields, native-command attempts, concurrent grants, expiry versus
acknowledgment, runtime fault, worker death and no raw-content propagation.

An independent native supervisor/watchdog must survive a Node worker crash. Hold an exclusive native
file lock and retain fsync'd exact load-response/fingerprint ownership before admission. A crash/restart
may reconcile only that durable ownership against the unchanged engine epoch. Lost load responses,
changed engine, unknown instances or incomplete evidence stay closed at160W; never blindly reload or
restore260W while a delayed load could appear. Stop only owned processes and retain state/evidence.

Still required before deployment: actual Windows principals/ACLs/IPC proof, independent crash recovery,
certificate provisioning, existing-config retention, post-campaign JIT/logging/binding transition,
exact source/profile/evidence seal, Caddy route proof, long-idle proof, cold-start/login-dependency truth
and rollback. None is implied by a broker/core unit test. Mixed primary-role selection still requires
a separately tested swap scheduler; a single qualified primary remains the only supported profile.
