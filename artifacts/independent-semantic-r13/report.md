# R13 independent semantic review

Source: `d0b8f23db1bcc149764e19936559a8a9df468205`
Runtime seal: `abf15d75fd33df9f4f7b9966e450075d93b6cd18dd275c89afabece76f3bca87`

The fresh candidate-blind reviewer decided 963 semantic checks across 360 attempts and covered 611 retained provider outputs.
60 semantic checks failed. The exact candidate identities were not available while those decisions were authored.

## Role scorecards

| Candidate | Chat | Research | Code | Agent | Review |
|---|---:|---:|---:|---:|---:|
| Gemma 4 26B A4B | 24/24 qualified | 23/24 qualified | 24/24 qualified | 24/24 qualified | 7/24 |
| Qwen3 Coder 30B-A3B | 23/24 qualified | 24/24 qualified | 24/24 qualified | 21/24 | 15/24 |
| Qwen3.6 27B MTP | 18/24 | 24/24 qualified | 24/24 qualified | 21/24 | 21/24 |

## Route disposition

- chat: recommended `gemma4-26b-a4b`; eligible `gemma4-26b-a4b`, `qwen3-coder-30b-a3b`.
- research: recommended `qwen3-coder-30b-a3b`; eligible `qwen3-coder-30b-a3b`, `qwen36-27b-mtp`, `gemma4-26b-a4b`.
- code: recommended `gemma4-26b-a4b`; eligible `gemma4-26b-a4b`, `qwen3-coder-30b-a3b`, `qwen36-27b-mtp`.
- agent: recommended `gemma4-26b-a4b`; eligible `gemma4-26b-a4b`.
- review: no qualifying candidate.

At least one function has no independently qualified route. Automated product qualification failed and the customer trial remains unavailable.

No production route changed and no protected data was read by this campaign.

