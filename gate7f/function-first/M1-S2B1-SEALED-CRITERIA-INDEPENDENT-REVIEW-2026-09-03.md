# M1-S2B1 sealed-criteria independent review — 2026-09-03

Reviewed commit: `ec0b885148df8f5a1b6c338a0dc1d47c7e9f404c`

Verdict: **NO-GO — P0=0/P1=7**

The outage-cleared reviewer reproduced 6/6 contract checks and 15/15 roadmap checks, kept the worktree clean and
performed no network or actual operation. Additional adversarial probes proved five prohibited shapes were still
accepted. Implementation and actual Control work remained blocked.

## Findings

1. The one-frame, one-sequence IPC could not carry two Git smart-HTTP exchanges or the bounded 64 MiB workspace.
   Coordinator control and materializer/broker streaming channels were not distinguished.
2. Capability/binding/file-set/upload/frame digests, canonical raw JSON and real UTC instants were not fully admitted
   by executable functions; several values were shape-checked rather than recomputed or compared to frozen constants.
3. Ready manifest/receipt schemas admitted incomplete or indeterminate combinations, and source cleanup state
   contradicted the statement that revocation is terminal.
4. The URL schema normalized before rejecting IDN/percent aliases, while the CIDR oracle and numeric broker limits
   were prose rather than frozen policy artifacts.
5. Browser upload creation required a client-supplied server session id and did not close exclusion overlap,
   duplicate, chunk-count or manifest-digest authority. Secret/media/limit profiles were unnamed.
6. A shared coordinator identity retained parent-level sibling authority, so held-identity cross-workspace denial was
   not provable at the OS boundary.
7. The cancel operation was absent from the capability set; the timeout fixture expanded the endpoint scope; and the
   broker-loss method targeted a coordinator Job not defined by the topology.

## Required continuation

Correct exactly these seven categories prospectively, update the status record, run only deterministic contract and
roadmap checks, source-commit the corrected bytes and obtain a fresh independent P0/P1 review. Do not install the Git
library, implement the materializer, contact an endpoint, run actual Control acceptance or invoke a model before GO.
