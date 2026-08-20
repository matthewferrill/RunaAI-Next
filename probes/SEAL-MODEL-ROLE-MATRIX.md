# Seal — model role matrix

Frozen before final scored execution on 2026-08-20. The initial runner seal was superseded before any
case produced a score because its native-v1 input objects used the OpenAI role discriminator rather
than LM Studio's native text/image discriminator. The second and third seals each produced one
incomplete 4B arm and were superseded when the near-context request still exceeded the Windows
command-line transport limit. The fourth seal proved standard-input transport but exposed one
remaining native-input discriminator in the context case; it also showed that the OpenAI tool
endpoint needed Qwen's documented `/no_think` runtime directive to satisfy the preregistered
reasoning-off condition. The fifth seal calibrated the repeated filler at 32,746 input tokens, leaving
only 22 tokens for a requested 96-token answer; that was not the preregistered at-least-20,000-token
exercise with room for a complete response. The final runner reduces only neutral filler to target
roughly 22,000 input tokens. That runner completed three models and every short Llama case; Llama's
five-minute context call then lost an otherwise healthy nested SSH connection. The final runner adds
SSH keepalives and explicitly accepts the immediately preceding runner hash for unchanged completed
cases, while the missing Llama context case is rerun. No repair changes a question, planted marker,
expected label, model response, or gate. Earlier protocol-debug hashes remain excluded. The completed
gpt-oss arm then exposed a native-v1 response-shape difference: its first output item is reasoning and
the answer is the later `message` item, so the prior parser graded the reasoning item as missing text.
The sealed repair selects the native message item, reruns only gpt-oss cases from that invalid arm,
and de-duplicates case keys in the summary. All earlier valid rows remain byte-for-byte unchanged.

- `MODEL-ROLE-MATRIX-PREREGISTRATION.md` SHA-256: `fd96514fa7a50d4f8acb0e53a5ef1d6446f901956263481b1f8393ca0524c67d`
- `probes/run-model-role-matrix.mjs` SHA-256: `aeb976663563e6cd62894cffb5e099cdd94a957d402c28c98fa4022bae32801f`

Any change to either sealed file creates a new arm and requires a new seal. Partial JSONL records are
not model-selection evidence until the complete-campaign condition in the preregistration is met.
