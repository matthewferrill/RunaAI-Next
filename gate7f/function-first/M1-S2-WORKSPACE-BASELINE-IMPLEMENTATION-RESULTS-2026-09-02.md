# M1-S2 workspace baseline implementation results — 2026-09-02

Status: implemented in the working branch and deterministically verified; actual-system customer acceptance
and production publication have not run.

## Accepted product direction

RunaAI now uses one primary work canvas. The permanent Chat/Code/Research row was removed. The ordinary
user enters the three currently implemented task types from **New**, recent work, or the compact composer
control. Review remains contextual to supplied sources and Agent remains contextual to governed disposable
Code work.

The shell keeps a collapsible project/history rail, a centered conversation surface, a compact composer,
and an optional contextual inspector. The real application does not advertise local folders, Git, web,
connectors, voice, terminal access, or other future capabilities before their application contracts exist.

## Implemented behavior

- `New` offers Conversation, Research from supplied sources, and Code draft or sandbox.
- The composer offers the same task selection without occupying permanent workspace navigation.
- The composer Add menu exposes only current application-backed operations: create a Runa project, use
  supplied source sections, and use the disposable Code project.
- The work bar shows the current record and project and owns the contextual-inspector toggle.
- Existing authority, exact-source selection, sandbox execution, approvals, receipts, cancellation, and
  undo boundaries are unchanged.

## Verification and failure accounting

The first complete tracked run reported 10 failures. None was attributed to a model and no model request
was made.

| Count | Root cause | Correction and disposition |
| ---: | --- | --- |
| 1 | The governed wire fixture still pinned the old `evidence-output.mjs` bytes after the approved Review-contract change. | Recomputed the exact non-normalized file SHA-256 and updated the single source pin. The focused wire suite passes. |
| 1 | The synthetic customer journey still invoked retired `guarded` and `workspace` lanes, then read success fields from their error responses. | Replaced those retired paths with the current Review and Code lanes and added the Review provider fixture. |
| 2 | Browser presentation tests searched the old inline Code copy and old four-rem rail widths/bordered textarea. | Bound assertions to the function catalog and the accepted single-canvas shell/composer contract. |
| 1 | A routing test still allowed Review through the Code experience after the canonical matrix made Review contextual to Chat sources. | Verified Chat Review succeeds and Code/Review cross-routing fails before a provider call. |
| 4 | Actual Windows ACL and process-tree tests were run inside the restricted command sandbox. The sandbox denied `SetAccessControl` and child-tree termination, masking expected timeout/output-cap outcomes. | Re-ran the exact file once outside the sandbox on the actual host; all 31 tests passed. These are environment false negatives, not product defects. |
| 1 | A whole-run timeout cleanup saw a temporary directory still busy during the same restricted parallel run. | The exact test passed in the isolated actual-host run; no application change was required. |

Focused results after correction:

- Gate 6B: 33/33 passed.
- Workspace navigation and contextual functions: 22/22 passed.
- Updated customer journey, shell, routing, and wire contract: 36/36 passed.
- Actual Windows Control regression outside the command sandbox: 31/31 passed.
- Roadmap verification: 15/15 passed.

## Boundary and next work

This result verifies implementation contracts, not visual customer acceptance, production deployment, or
new model qualification. The model campaign remains paused. The next product slice is real Settings and
honest Omen/Control/Home status, followed by authorized local-folder and local-Git read-only connections.
Only after those application paths exist should bounded actual-system customer journeys resume.
