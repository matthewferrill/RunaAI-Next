# Independent Control metadata publication review

Reviewed operator companion `c48b20e57351071cd95e15b9be4f9f2e38113ec6`.
The scored application remains `9556ed01f9dbabe8c93eea309e482aad60bf809f`
and R4b runtime seal remains
`416102ff7129e5adb00de51b2f0fc3e5ca542c18a82941a32fdc4075b6a1c89f`.
No case, threshold, reader, freshness or model setting changed.

## Review and actual result

No blocking finding in the scoped writer, criteria, or mirror diff. The writer
flushes a create-only same-directory temporary file, never unlinks the readable
target, uses only replace-existing/write-through rename flags, and retains
staged/previous bytes on drift or bounded sharing failure. The mirror retains its
existing owned-root/lease/source/schema checks and reports sharing retries.
Neither the design nor this test claims general concurrent-writer CAS or universal
filesystem atomicity.

An independent new Control operator tree ran the exact final **seven tests** with
packaged **Node v22.22.0**, Windows PowerShell 5 and its explicit module path.
All **7/7 passed**, zero failures/skips/cancellations. Runtime was 24,616 ms;
supervision covered 2026-08-28T20:58:27.7642444Z–20:58:52.6311609Z.

| Stress repetition | Publications | Concurrent valid reads | Reader errors | Sharing retries |
| --- | ---: | ---: | ---: | ---: |
| 1 | 200 | 22,247 | 0 | 178 |
| 2 | 200 | 20,356 | 0 | 214 |
| 3 | 200 | 18,418 | 0 | 180 |
| Total | 600 | 61,021 | 0 | 572 |

Each final sequence was exactly 200. Other tests proved create-only initial
publication, stale temporary/wrong filename denial, actual injected foreign-byte
preservation, and persistent sharing-lock timeout with both old/staged bytes
retained. The 30s child timeout did not fire. All 17 tracked test processes were
gone afterward. No models, services, listener, production file or frozen source
were changed.

## Exact input and evidence identities

| Input | SHA256 |
| --- | --- |
| Publish-CampaignMetadata.ps1 (3,042 bytes) | `4ac32d92a302d619272995bf3e10217838bf06f66a535188b69e606ae97036b6` |
| metadata-publication.test.mjs (6,373 bytes) | `3905c6d4e25d45282420bb754a98d380e5156e2b0dd4a0a9eb490d58c87db63d` |
| CAMPAIGN-METADATA-PUBLICATION-CRITERIA.md (2,857 bytes) | `99ba44a1ca1fd3557fa77c8a5a66d543ca6d147c0c6208846cbe9c4a610e5d04` |
| Packaged Node executable | `bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb` |

Byte-identical retained [proof](evidence/20260828-metadata-control-proof/proof.json)
SHA256 `cd642af05a7accca87698c96f8c7381320897cb0cddfe6c05292ef0c7331cea1`;
[full TAP](evidence/20260828-metadata-control-proof/test-stdout.log) SHA256
`9e8424aafffe85e9c44353ecad3879b142cd73d4d10b56802d6d7065f0350ace`.
The retained stderr log is empty (SHA256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
The proof includes each raw stress result and original result-file hash.

Full inputs, supervisor, logs and synthetic temporary fixtures also remain at
`C:\AI\RunaAI-Next-Candidate\staging\m1-operator-proof-3ddb465faf57a89fd32c23384a274c39\metadata-publication-r3`
and the root task's
`artifacts/runs/metadata-publication-control-proof-3ddb465faf57a89fd32c23384a274c39/metadata-publication-r3/`.

## Operator setup failures were not successes

The initial oversized encoded supervisor was rejected before execution. A second
directory-creation command was misparsed by the remote default shell; its missing
temporary directory prevented test fixture initialization, and that supervisor
failed collecting results before retaining stdout. No publisher verdict is
claimed from that invalid setup, and the missing stdout is not reconstructed.
Both input folders remain. See the retained
[setup record](evidence/20260828-metadata-control-proof/operator-setup-findings.json).

The final run used a fresh folder, a small encoded directory preflight, a short
script-file invocation, explicit temporary-directory validation, and immediate
raw-log retention. It did not overwrite or regrade the aborted campaign or either
invalid setup. The earlier Coder Chat03 ENOENT filename was not retained; this
proof does not retrospectively identify that path.
