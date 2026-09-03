# M1-S2B server-managed workspace independent architecture review — 2026-09-03

Verdict: **GO for architecture publication only**  
Findings: P0=0, P1=0  
Implementation/actual-system status: not admitted

## Reviewed scope

- `M1-S2B-SERVER-MANAGED-WORKSPACE-ARCHITECTURE-2026-09-03.md`
- `M1-S2B-PROJECT-SOURCE-ADAPTER-REGISTER-2026-09-03.md`
- supersession and living-status changes in the product foundation, roadmap, Omen criteria and migration status
- relevant Gate 7E Control sandbox, agent foundation, disposable-project and Omen Git evidence

The review was read-only. It did not change a system, start a service, materialize a repository, invoke a model or
perform an actual browser operation.

## Findings closed before GO

1. Generic Git ingress initially lacked an explicit SSRF/redirect/DNS/private-network boundary. The final design
   requires an authority-owned repository id or administrator-approved endpoint, pins scheme/host/port, rejects
   cross-origin redirects, loopback/link-local/private/reserved/metadata targets and DNS rebinding, and requires
   pinned SSH host keys before SSH can be admitted.
2. The first capability wording could allow an old harmless-JavaScript grant to expand. The final design requires
   server-derived participant/project/environment binding and a newly versioned non-expanding source/workspace
   capability set.
3. Cross-workspace worker isolation was implicit. The final design requires one workspace to be unable to
   enumerate, read, signal, attach to, retain processes from or reuse handles from another workspace.
4. Historical living-status text still called the Omen transition the next step. It now states that the later
   server-managed decision superseded that sequence and prohibits the transition on the primary path.
5. Gate 7E reuse could be read as widening its accepted QuickJS envelope. The final design requires a side-by-side,
   newly versioned executor/profile and expressly forbids inheriting Gate 7E repository/native/project authority.
6. The adapter register initially described generic HTTPS/SSH/provider Git as primary M1 scope. The first proof is
   now narrowly allowlisted public HTTPS; private/provider/self-hosted/SSH transports require separate broker and
   endpoint acceptance.

## Reusable foundation, not inherited acceptance

- Gate 7E pinned MXC startup, QuickJS envelope, output/deadline controls and typed receipts.
- Disposable-project participant/project/environment binding, immutable revisions, no-follow protections and
  hash verification.
- PostgreSQL task/grant/proposal/intent/receipt/outbox authority, CAS publication, LangGraph recovery and
  no-blind-retry behavior.
- Exact-origin/session HTTP controls.
- Omen Git fixed argument arrays, executable/config pins, hostile metadata rejection, NUL parsing, mutation
  detection and cleanup patterns.

Omen DPAPI, local bridge, ACL transition and exact-host evidence do not qualify Control. Gate 7E does not qualify
repository access, native project commands, multi-file execution, packages, Git or multiple processes.

## Minimum acceptance before routing

1. Freeze strict workspace/materialization/operation/receipt schemas, server-derived bindings and the new
   capability-set version.
2. Prove HTTPS ingress SSRF, redirect, DNS-rebinding and private-network defenses plus absence of tokens from argv,
   environment, workspace, logs, receipts and model context.
3. Prove cross-workspace isolation and denial of Control credentials/releases, PostgreSQL, identity services and
   Home control.
4. Prove exact Git/runtime pins, hostile config/hooks/filters/attributes/submodule/symlink/reparse/hardlink denial,
   quotas, output limits and full process-tree cleanup.
5. Prove immutable base/workspace digests, CAS edits, cancellation, crash/restart reconciliation and unknown-outcome
   handling.
6. Run one actual disposable public-HTTPS Git journey and one non-Git snapshot journey on Control, followed by an
   ordinary-browser journey. Omen disconnection must not impair primary Code; Home unavailability must preserve
   inspection while truthfully disabling inference.
7. Verify rollback disables new materialization and preserves user work and every remote/local source.

## Reproduced checks

- `git diff --check`: passed; line-ending warnings only.
- `npm run verify:roadmap`: 15/15 passed; roadmap digest
  `e9f6d8a6b00fd1a56a0b3964e9d78b1297490783cd71131a5870215046ee9558` on the reviewed architecture bytes.
- Final publication assembly after adding this review/status reference: JSON parsed, `git diff --check` passed and
  roadmap 15/15 passed at digest `6a8380d9e9e2f3eb07b7e51c77cda174c5541c0abbb07875dd5537627560cfd1`.
