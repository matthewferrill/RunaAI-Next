# Isolated functional acceptance runner

This is M1-S2 test infrastructure, not a new milestone, deployment or passing qualification.
The frozen `cases.mjs` remains unchanged: 40 distinct tasks, three repetitions for each of three
candidates (360 planned attempts), plus 12 model-free controls. The independent grader owns passing
criteria. A completed HTTP journey is not automatically an acceptable model answer or product pass.

## Actual path

`functional-host.mjs` composes the shipped M1 services, SelectedCoreApplication and HTTP routes with
real PostgreSQL continuity/replay/source/task records, LangGraph checkpoints, an owned Qdrant collection,
the approved Nomic/windowed-BGE adapters, immutable disposable project files and retained MXC/QuickJS.
Trusted constructor fixtures provide only the frozen synthetic project bytes and fixed test suites;
expected test outputs are not inserted into model prompts. The model sees ordinary messages/objectives,
selected source/file observations, capability and suite IDs, and actual prior results.

The synthetic session issuer is a deliberate test seam. Ordinary cookie, current-session, ownership,
scope and effect checks are shipped code. This does **not** qualify production Keycloak, Windows Hello,
email enrollment, external access, or a real household account. Browser bootstrap consumes a one-use
nonce and sets the HttpOnly cookie in the server response; no browser cookie-read operation is needed.

Transparent owned loopback proxies retain actual provider/embedding/BGE/Qdrant request and response
evidence and forbid redirects. `controls` mode categorically denies large-model, embedding and reranker
inference before any upstream call. It does not return a fabricated successful model response. Actual
Qdrant collection creation and filesystem/native effects remain available to model-free controls.

## Entry points and boundaries

- `node gate7f/function-first/acceptance/control-functional.mjs` is an inventory only: no files,
  services, inference or network changes.
- `Prepare-ControlFunctionalStage.ps1 -SourceCommit <exact clean commit>` creates one new
  `C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-<32hex>` stage. It verifies owner identity,
  Control source HEAD/cleanliness, archive and existing Qdrant hashes, and joins only the immutable
  released dependency directory. It does not run a service or model.
- On that stage, `control-functional.mjs --mode controls --owned-root <exact stage> --source-commit
  <exact commit>` starts disposable loopback PostgreSQL/Qdrant and a compact isolated runtime,
  runs all twelve model-free control drivers, retains synthetic evidence and cleans up its
  data/runtime/processes under a fifteen-minute watchdog. No production store URL is accepted.
  The runtime/control seal is written before any control effects; independent grades remain
  separate from a driver completing. Control10 cannot pass its UI check without the actual
  browser checkpoint supplied through `runControlFunctional(args,{checkpoint})`.
- The CLI deliberately rejects `--mode scored` until runtime/readiness and all required drivers are
  sealed. `createFunctionalTestbed` and `FunctionalHttpJourney` are composition APIs for the final
  controlled campaign, not an authorization to run it. This commit performs no model inference.

The approved Qdrant artifact is 1.19.0, 84,184,576 bytes, SHA-256
`369c562eae3d89333a13abfdb522fa209e3f587c1217a1059d817e80814ea9d4`. A new owned short storage
directory is used; production Qdrant stores are not contacted. PostgreSQL binaries and released Node
dependencies are read-only inputs. Target-only ACL preparation is limited to four new owned paths;
the existing ancestor/descendant invariance checks are preserved. A bounded watchdog stops only the
owned database and verifies the exact unique Qdrant executable before stopping its PID.

`createAcceptanceWorkerHost(init, getLedger, {taskHooks,faults})` reopens the same owned database,
cipher and native paths for crash tests. `init` contains ephemeral synthetic keys and is **IPC only**:
never log, commit or include it in evidence. `taskHooks` is a trusted construction seam, not a browser,
model or release-config field. Restart must preserve unknown outcomes rather than blindly rerun them.

## Evidence and remaining implementation

Local helper tests cover inventory, scoped roots, sealed budgets/roster, exact receipt
retention, disabled inference, unchanged forwarding, wrong-model/settings denial, redirects, actual
index fault boundary, and one-use browser bootstrap. These are helper tests, not live Control proof.

Initial mechanical drivers cover 33/40 task action sequences. The seven incomplete sequences require
provider-response loss/retry, actual stale-vector mutation, native in-flight cancel, actual worker crash,
lost acknowledgement, and two actual browser reload journeys. Unsupported actions fail before inference;
they do not silently skip, pass, or reduce the denominator. Separate fault/browser modules are being
integrated. The initial complete model-free drivers are exact grants, native limits and exact undo;
the other nine now have dedicated real controls: CAS/history/foreign references, malicious selected-index
responses,307/308 across the actual adapters, encrypted PostgreSQL/replay/plan records and cross-record
envelope rejection, actual worker restart and lost native receipt, logout/replacement grants, Windows
native-handle/link containment, and release/resource configuration. Negative dependency fixtures are
explicitly labeled: fixed vectors/malicious HTTP responses do not qualify Nomic or retrieval quality.
The controls categorically deny upstream model inference. Source fixtures can be retained even when
their indexing attempt is deliberately denied. No such retained source is counted as indexed evidence.

`captureFinalProof` re-reads actual scoped PostgreSQL continuity/task/grant/intent/receipt state,
LangGraph checkpoint values, and retained immutable revision bytes. The independent reducer consumes
those probes; missing probes or browser evidence remain inconclusive. Runtime evidence from the first
three-control run lacked its prospective seal/check IDs and is diagnostic evidence only. Corrected
controls must be run afresh; prior evidence is not relabeled as a retrospective pass.

The candidate runtime seal fixes the existing answer cap of 512 tokens and planning cap of 1536, with
60-second answer route and 30-second planning deadlines (55-second active workflow budget). The harness
rejects a seal claiming different unenforced settings. Context-window values describe the separately
pinned model runtime and require the operator's effective-runtime evidence; the harness does not
pretend a JSON field changes the model's loaded context. API reasoning request values must match actual
captured requests, with separate evidence that the backend honors the setting. An accepted request
parameter alone is not sufficient.

Independent assertions require raw application/source/native/PG evidence and separate semantic review;
model-written success, predicted code outputs, missing controls or incomplete evidence cannot pass.
Actual browser experience, all remaining controls, matched three-candidate runs, independent adjudication,
steward testing and rollout/rollback verification remain required before M1 closes.
