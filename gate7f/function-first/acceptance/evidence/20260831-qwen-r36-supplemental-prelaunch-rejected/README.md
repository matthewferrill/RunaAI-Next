# Qwen r36 supplemental prelaunch rejection evidence

Qwen remaining-13 arm r36 used source
`9ffa9d8a148b47abfb80f49491bfa63227ccc82c`, runtime seal
`0afb31fafe28032da3fb4cac4e6a0d13896d9205f03aaecf33a2de7da8dd97c6`,
12/12 fresh controls, Home lease `20260829-campaign-qwen36-r36`, and
Control stage `09cd800f5c7a4a8f9b3a3666c73ca9ab`.

The launch was rejected before model inference with
`m1-campaign-launch-window-insufficient`: the remaining lease margin no longer
satisfied the sealed launch reserve after the watcher transfer was corrected.
No campaign directory or model attempt was created. This is fail-closed
prelaunch evidence, not a model result.

`evidence-manifest.json` hashes all nine files retained in the drained Control
stage. Home accepted an abort marker whose SHA-256 is
`baadb392f8e0cd87e9b42a8ad8830ad2022dcebd1ed4788388903e88f4ab633a`.
The lease restored power and zero residency. A final audit found its expired
scheduled task still registered; the exact seal- and action-bound task alone
was retired at `2026-08-31T19:24:29.4425518Z`, after which all r35-r37 tasks
were absent and no model instances were loaded.
