# Read-only Control legacy caller inventory

Observed through the established Matthew owner SSH profile, no mutation or Home
request. Final connection snapshot: **2026-08-28T23:46:26.0631289Z**.

The actual task `\RunaAI-Restart` is Ready (a launcher, not proof of an absent
application). Its working directory is `C:\AI\Projects\RunaAI` and `-File`
points at `scripts\runa-restart.ps1`. Actual checkout HEAD is
`b4db04090d8f0df87234fab573b396e7824c5354`, superseding the older71ce985 inventory.

The current `src/runa/config.mjs` was read: `runa.config.json` plus optional
`runa.config.local.json`, shallow top-level override, resolved from the working
directory. Only sanitized endpoint fields were emitted, never full config,
credentials, headers or model-private data:

| Function | Effective destination |
| --- | --- |
| Primary chat/code provider | `http://192.168.50.165:1234/v1` |
| Embedding | same base, derived `/v1/embeddings` |
| Reranking | `http://192.168.50.165:8412/` |

The actual embedding source `src/runa/lmstudio-embeddings.mjs` derives its URL
from `config.baseUrl` and uses a20-second request timeout. The embedding endpoint
is a source-derived result, not a live request or health claim.

An actual legacy process tree is running: `cmd.exe`8608 → Node10160 → Node8576
and Node8600. These Node processes use `C:\Program Files\nodejs\node.exe`.
At the final snapshot Node8576 listens on127.0.0.1:3787 and Node8600 on
127.0.0.1:3786. Their observed connection list contained only these listeners.
That instant is **not** a durable native-wide drain or prevention of a next call.
The separate Next tasks remain running; installed `M1-Qdrant` remains Disabled.
No task, listener or process was stopped or changed.

Next Caddy file SHA256 was
`fcb9dd788fb48af32c61d74705175629e01ec03911c3089127f7d3037ed44da5`.
The designed Next maintenance closure covers selected Next Caddy routes and its
provider9770. The legacy local UI and direct Home1234/8412 outbound paths do not
traverse that provider route. Therefore Next closure alone cannot govern these
callers. Before any native loopback change, account for the preserved legacy
application and its rollback needs through explicit scoped caller admission and
fresh actual drain evidence; do not silently disable it or treat Ready task
state/zero instantaneous connections as sufficient proof.
