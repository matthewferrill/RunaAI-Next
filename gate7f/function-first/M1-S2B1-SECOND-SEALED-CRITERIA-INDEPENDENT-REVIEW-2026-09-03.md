# M1-S2B1 second sealed criteria independent review - 2026-09-03

## Reviewed source

- Exact commit: `083c558d7bd2132457022843415ed40dfc17a5d8`
- Branch: `codex/m1-gemma-primary`
- Worktree was clean and the reviewed commit was exactly `HEAD`.
- Review was read-only: no edits, installs, network access, model calls or actual Control/browser operations.

## Verdict

**NO-GO - P0=0, P1=5.** Implementation and actual acceptance remained blocked.

The reviewer reproduced 10/10 focused contract checks and 15/15 roadmap checks, then used adversarial contract
probes that exposed invalid accepted states. Passing deterministic checks did not receive actual-system acceptance
credit.

## P1 findings

1. Git stream frames were not bound to one channel/request/nonce. Non-body frame payloads escaped aggregate
   accounting, and open payloads were not connected to the exact request/response head schemas.
2. Canonical-wire parsing accepted invalid UTF-8 through replacement decoding. The path oracle admitted Windows
   superscript device aliases and did not freeze a complete cross-platform case-identity rule.
3. Ready folder receipts admitted a 40-hex native version; disconnected sources admitted indeterminate cleanup;
   error codes and retryability were not closed by outcome.
4. The authoritative materialization policy omitted the cleanup deadline, materialization deadline and both
   concurrency limits that were present only in prose.
5. The timeout method expired an incomplete upload before a bound materialization existed, so it could not produce
   or reconcile the required workspace materialization receipt.

## Required continuation

Correct exactly these five categories prospectively, update the status record, run only deterministic contract and
roadmap checks, source-commit the corrected bytes and obtain a fresh independent P0/P1 review. Do not install the Git
library, implement the materializer, contact an endpoint, run actual Control acceptance or invoke a model before GO.
