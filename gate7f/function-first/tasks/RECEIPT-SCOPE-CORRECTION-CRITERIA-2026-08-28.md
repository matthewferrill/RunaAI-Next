# Receipt-scope correction criteria

Status: frozen before implementation. This is a planner-input confidentiality and least-authority correction, not a new execution capability or model qualification.

A completed restore proposal records its affected files in `restorePaths`; its public arguments contain only a receipt identifier. When an unfinished conversational run is rebound from a wider grant to a narrower grant, prior restore receipts must be supplied to the planner only if every recorded restore path remains inside the replacement grant. The existing fresh service preflight continues to reject any guessed or out-of-scope restore before plan recording or dispatch.

Acceptance requires a real-PostgreSQL regression that:

1. creates and completes an apply followed by a restore under a grant covering two files;
2. leaves a conversational run unfinished, then replaces its session and authority with a grant covering only the other file;
3. proves the completed restore receipt is absent from the replacement planner input;
4. has the untrusted planner guess that omitted receipt anyway;
5. proves no new proposal, intent, receipt, adapter mutation, or plan is created.

The correction may not delete historical receipts, weaken fresh service preflight, alter the approved capability profiles, or relabel baseline model evidence.
