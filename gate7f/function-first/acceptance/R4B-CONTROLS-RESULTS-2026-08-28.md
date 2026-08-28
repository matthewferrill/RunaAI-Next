# R4b functional controls

All twelve model-free functional controls passed the original raw-proof
`qualifiedControlSuite` verifier. Completion counts were not used as a substitute
for the recorded observations and exact grades.

- Application: `9556ed01f9dbabe8c93eea309e482aad60bf809f`.
- Campaign seal: `416102ff7129e5adb00de51b2f0fc3e5ca542c18a82941a32fdc4075b6a1c89f`.
- Raw report: `controls-1787948296893.json`, 2,440,499 bytes.
- SHA-256: `49da0297ce3af0c254dbc0b381eeed6202ca8436894fb3fd4a4964132b176d32`.
- Original retained at `acceptance-evidence/` in the isolated Control stage
  `m1-task-native-ed104b1f647343cca570352b63851a77`; byte-identical local copy at
  `artifacts/runs/m1-campaign-20260828-r4b/formal-controls.json`.

The actual ordinary-user browser at 20:17:37Z showed `project.run-tests — unknown`,
offered `Reconcile uncertain action`, and said no execution receipts had been
recorded. The acknowledgement retained those observed strings and the matching
frozen check identifier. No reconciliation action was clicked by the observer.

Operator findings retained separately from product results: the first tunnel
command disabled its own forwarding and was stopped; the corrected tunnel was
verified before browser observation. A browser helper retained a stale tab after
the initial refused connection; explicit tab binding corrected that operator
helper. The original unexpired checkpoint was observed in the real browser;
no assertion, deadline, application source or result was changed to obtain a pass.

The runner returned no execution or cleanup error. Models were not invoked,
protected data were not read, and production was not changed. This qualifies
the controls for the prospective three-model campaign, not the models themselves.
