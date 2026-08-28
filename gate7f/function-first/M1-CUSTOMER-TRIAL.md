# M1 customer trial — five functions, not full product parity

Prepared 2026-08-28. **Not ready to start yet.** The operator must first complete the matched
three-model qualification, verify the exact deployed application/runtime, and reconcile rollback.
This document is preparation, not a deployment or a request for another approval.

The customer uses the ordinary account at `https://runa.bridgebuildersai.com` from Omen or another
authorized LAN PC. Owner passkeys, protected records, personal documents and production projects are
not test material. Use fresh disposable projects and the synthetic text below. Do not send passwords,
session cookies, private keys, or complete authentication URLs with the results.

## Operator entry record

Before inviting the customer, record the actual release/commit/artifact/configuration digests, selected
five-role binding and qualification evidence, Home profile/operational proof, active Qdrant identity,
production baseline, successful signed-out/signed-in smoke and exact rollback predecessor. Record
unresolved limitations explicitly. None of these fields may be inferred from a successful build.

The operator handles technical verification. The customer tests whether the real sign-in, navigation,
conversation and action controls make sense. Ordinary password login must not require an admin passkey.

## Customer checks

1. **Chat and continuity.** Sign in fresh. In Chat, start a new test conversation and ask for a short
   picnic checklist for 12 people. Correct the number to eight and ask for a revised checklist. Open a
   different conversation, return, and check that the correction and replies remain together. Sign out
   and back in, reopen the same test conversation and ask how many people the plan now covers. Expect
   eight, not a response copied from the prior question or another conversation.

2. **Research from selected text.** Create a Chat project named `M1 customer research`. Expand the right
   panel, attach `Workshop note` with the text below, select it, and choose `Research selected text`.
   Ask: “When and where is the workshop, and how many people are registered? Cite the note.” Open the
   citations and check the actual source. Ask what the catering budget is: it must say no amount was
   approved, not invent one. This tests supplied sources, not live web search.

   ```text
   The Willow workshop is on 12 October at 14:30 in the Cedar room.
   Eighteen people are registered. The room capacity is eighteen.
   No catering budget has been approved.
   The packing list currently contains seventeen name badges.
   ```

3. **Deliberate review.** Keep that note selected and choose `Review selected text`. Ask: “Review the
   workshop preparation. Identify any mismatch and distinguish facts from suggestions.” Expect the
   seventeen badges versus eighteen registered people to be identified with supporting source text.
   A suggestion to add a badge must not be presented as an action Runa already performed.

4. **Real Code work.** Switch to Code and create a separate project named `M1 customer code`. Expand
   the right panel and choose `Prepare exercise`. Select `Code task` and `Auto-approve this harmless
   workspace`, then choose `Work in disposable Code project`. Ask: “Fix the calculator's addition
   function, preview and apply the change, and run its available tests.” Inspect the recorded actions
   and actual test receipt. A draft or an `Output:` comment alone is not execution. The exercise is
   isolated from personal files, repositories and the network. Chat projects must not appear as Code
   projects, or vice versa.

5. **Conversational workflow and control.** In a second disposable Code project, prepare the exercise,
   choose `Guided task` and `Ask before each action`, then request the same correction. Confirm the
   interface pauses with the exact proposed effect. Approve the displayed change and, separately, its
   test execution. Reopen the saved task and verify that receipts are retained. On an owned change,
   `Propose undo of this change` must describe the exact restoration; approving it must show restored
   current files without presenting an earlier successful test as proof of the restored state. Do not
   repeat an action blindly if its outcome is shown as unknown—report that state for operator review.

## What to report

For each check, “worked” or the short failing exchange/screenshot is enough. Include the selected
Chat/Code mode and function, whether a fresh login or reopen was involved, and the approximate time.
Distinguish an unhelpful answer, an application error, and confusing controls. Keep failure transcripts;
a retry succeeding does not erase the first failure.

Acceptance requires the customer journey to work without developer intervention, honest supported
answers and execution labels, retained same-scope history, and understandable approval/undo behavior.
The operator reconciles actual receipts and deployment health afterward. Any failure remains open;
do not mark M1 complete merely because the customer can reach the page.

## Boundaries and recovery

This is only M1: Chat/continuity, supplied-source research, bounded JavaScript Code work, governed
conversational tasks and deeper selected-source review. It does not claim unrestricted repositories,
packages/shells, live web, external connectors, phone support, background or parallel product agents,
multimodal capability, or all seventeen roadmap families.

If the candidate fails, stop new candidate work and use the recorded exact application/configuration
rollback. Do not replace a production database with an older copy or erase customer work. Retain
synthetic trial records and failure evidence; operational cleanup is owned by the operator.
