import { mastra } from "./w3-flow.mjs";
if (process.env.W3_DELAY_MS) await new Promise((r) => setTimeout(r, Number(process.env.W3_DELAY_MS)));
const run = await mastra.getWorkflow("flow").createRun({ runId: process.argv[2] });
// W3_ABSENT means genuinely no resumeData — the INPUT/absent scenario. Defaulting to {approved:true}
// made "absent" send a valid approval, so it tested nothing; caught in the Wave 3 smoke.
// A malformed payload must reach resume() as malformed, not crash the harness before the call.
let payload;
if (process.env.W3_ABSENT) payload = undefined;
else if (process.env.W3_PAYLOAD) { try { payload = JSON.parse(process.env.W3_PAYLOAD); } catch { payload = process.env.W3_PAYLOAD; } }
else payload = { approved: true };
try {
  const r = await run.resume({ step: "effect", resumeData: payload });
  console.log("STATUS::" + r.status + "::RESULT::" + JSON.stringify(r.result ?? null));
} catch (e) { console.log("STATUS::error::MSG::" + String(e.message).slice(0, 160)); }
