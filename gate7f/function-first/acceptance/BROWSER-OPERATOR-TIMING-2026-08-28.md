# Browser operator timing: retain gaps, shorten transport only

Source under test remains `9556ed01f9dbabe8c93eea309e482aad60bf809f`;
common runtime seal remains
`416102ff7129e5adb00de51b2f0fc3e5ca542c18a82941a32fdc4075b6a1c89f`.
This is operator evidence, not a change to the product, cases, deadline, or grades.

## Recorded gaps in the first replacement Coder batch

- Code08 repetition 1: the real browser showed restored current files and the
  actual initial passing/restored failing test receipts. Observation was recorded
  at 21:09:24.098Z. Its acknowledgement was published after the checkpoint expired
  while the operator context was being compacted. Retain the raw unobserved
  checkpoint and its inconclusive grade; a late acknowledgement cannot cure it.
- Agent05 repetition 1: preparation was accepted. Native execution was held at
  21:16:42.967Z and cancellation recorded at 21:16:42.976Z. The actual browser
  displayed cancellation with the honest still-draining notice at 21:16:50.369Z.
  Publication finished at 21:16:55.340Z, after the unchanged ten-second checkpoint
  bound. The raw result has `m1-browser-checkpoint-unobserved`; no qualifying
  in-flight UI check or subsequent observe-drain phase is inferred.

## Prospective operator correction

After real same-session preparation and its acknowledgement, a bounded read-only
observer waits on the exact owned campaign directory for a newly written
`in-flight` request naming that preparation checkpoint. It returns the complete
request directly, avoiding the five-second CLI output polling interval and a
second SSH fetch. It validates the same case, seal, origin, and principal/project/
task/session scope before refreshing the already-open real browser.

Only that browser's actual DOM observation can supply the acknowledgement. The
existing create-only, hash-checked atomic acknowledgement writer remains in use.
No model inference, native timeout, hold, freshness policy, application source,
synthetic identity, or evaluator assertion is altered. An unobserved, mismatched,
expired, or late checkpoint stays unqualified. There is no selective retry or
replacement of the two recorded attempts above.

The observer is limited to 45 seconds and regular bounded request files in the
already verified disposable campaign directory. It does not read production
sessions or protected content, create services, or change application state.
Operational success still requires an on-time consumed acknowledgement in later
unchanged cases; preparation or a visually correct message alone is not a pass.

## First observed correction result

The same Coder batch's Agent05 repetition 2 used the read-only direct request
observer. Actual browser observation: 21:28:09.560Z; publication completed:
21:28:15.607Z. The unchanged runner's retained `consumed.json` records
21:28:16.069Z, before its original expiry of 21:28:19.465Z. The runner completed
the attempt including the observe-drain phase. This qualifies that particular
browser timing observation, not the model's unresolved semantic grade. The first
repetition remains inconclusive. No deadline, hold, case or model setting changed.

Repetition 3 independently retained the same result: actual browser observation
at 21:39:18.131Z, publication at 21:39:24.833Z, and unchanged-runner consumption
at 21:39:25.191Z before the original 21:39:28.065Z expiry. Both later observations
stay distinct from the first repetition's missed deadline.
