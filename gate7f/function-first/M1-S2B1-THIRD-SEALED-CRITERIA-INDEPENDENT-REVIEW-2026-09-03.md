# M1-S2B1 third sealed criteria independent review - 2026-09-03

## Reviewed source

- Exact commit: `b24389bba649d4bcc145f168ac632b8f7da594ed`
- Branch: `codex/m1-gemma-primary`
- Worktree was clean and the reviewed commit was exactly `HEAD`.
- Review was read-only: no edits, installs, network/endpoints, model calls or actual Control/browser operations.

## Verdict

**NO-GO - P0=0, P1=3.** Implementation and actual acceptance remained blocked.

The reviewer reproduced 10/10 focused contract checks and 15/15 roadmap checks, then used adversarial contract and
topology probes. Passing deterministic checks did not receive actual-system acceptance credit.

## P1 findings

1. The printable-ASCII Windows path oracle still admitted `CONIN$` and `CONOUT$` console-device aliases.
2. Numeric times existed in the hashed policy but request/workspace/upload/receipt schemas did not require the exact
   policy durations; a 60-second materialization request and zero-duration pre-spawn timeout receipt passed.
3. The timeout method assigned Job termination and final receipt publication to the coordinator inside that Job even
   though it had no Job handle and could not terminate itself, observe zero processes and then publish truthfully.

## Closed from the prior review

- Git transcript payloads are authenticated and bound to one channel/request/nonce with exact head/body accounting.
- Strict UTF-8 byte round-trip admission is enforced.
- Snapshot native-version, cleanup-state, enumerated error and retryability rules are closed except for the timeout
  timing/state constraint above.
- All previously omitted numeric values are present in the hashed materialization policy.
- Timeout now begins after complete upload and a real bound materialization reaches durable staging.

## Required continuation

Correct exactly these three categories prospectively, update the status record, run only deterministic contract and
roadmap checks, source-commit the corrected bytes and obtain a fresh independent P0/P1 review. Do not install the Git
library, implement the materializer, contact an endpoint, run actual Control acceptance or invoke a model before GO.
