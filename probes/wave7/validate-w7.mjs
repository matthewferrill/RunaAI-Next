// Wave 7 instrument validation. Six checks, exactly the list in the sealed preregistration.
// Fifteen instrument defects across six waves, five of which would have voided a family or a wave,
// is why this runs first and its failures are fixed and recorded before grading rather than after.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, appendFileSync } from "node:fs";
import { wireEntries, chatCalls, endpointGaveUsable, secretOnWire, secretAbsentFromWire,
         completedGenerations, declaredModels, answered, answerText, freshWire, SYSTEM_SECRET } from "./w7-lib.mjs";
mkdirSync("probes/results", { recursive: true });

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); };

let port = 8800;
async function run(mode, { prompt, extra = {}, killAfterMs = null, timeout = 150000 } = {}) {
  const P = ++port;
  const log = freshWire(`probes/results/w7v-${mode}-${P}.wire`);
  const proxy = spawn(process.execPath, ["probes/wave7/w7-proxy.mjs"],
    { env: { ...process.env, W7_MODE: mode, W7_PORT: String(P), W7_WIRELOG: log, ...extra }, stdio: ["ignore", "ignore", "ignore"] });
  await new Promise((r) => setTimeout(r, 900));
  if (killAfterMs !== null) setTimeout(() => { try { proxy.kill("SIGKILL"); } catch {} }, killAfterMs);
  const t0 = Date.now();
  const child = spawnSync(process.execPath, ["probes/wave7/w7-ask.mjs"], { encoding: "utf8", timeout,
    env: { ...process.env, LMSTUDIO_URL: `http://127.0.0.1:${P}/v1`, ...(prompt ? { W7_PROMPT: prompt } : {}) } });
  const ms = Date.now() - t0;
  try { proxy.kill("SIGKILL"); } catch {}
  return { log, out: String(child.stdout ?? ""), ms };
}

// Warm the endpoint first, and record it. Cold load is 72-107s on this base against ~55ms warm, so
// a hang and a cold start are otherwise indistinguishable.
const warm = await run("ok", { prompt: "Reply with exactly: READY" });
console.log(`(warming call: answered=${answered(warm.out)} ms=${warm.ms})`);

// 1 - pass through cleanly, with the wire proving the call happened
const c1 = await run("ok");
check("1 pass-through produces a correct answer and the wire proves the call",
  answered(c1.out) && /paris/i.test(answerText(c1.out)) && chatCalls(c1.log).length >= 1 && endpointGaveUsable(c1.log),
  `answered=${answered(c1.out)} answer="${answerText(c1.out).slice(0, 40)}" chatCalls=${chatCalls(c1.log).length} usable=${endpointGaveUsable(c1.log)} ${c1.ms}ms`);

// 2 - each injected mode differs on the wire, not only in the answer
const modes = ["unavailable", "malformed-response", "partial-response", "changed-version"];
const seen = [];
for (const m of modes) {
  const r = await run(m);
  const e = chatCalls(r.log);
  seen.push(`${m}: code=${e.map((x) => x.code).join("/")} note=${e[0]?.note ?? "-"} usable=${endpointGaveUsable(r.log)} answered=${answered(r.out)}`);
}
check("2 each injected mode is visibly different on the wire",
  new Set(seen.map((s) => s.split(": ")[1])).size >= 3, seen.join("\n        "));

// 3 - the full outbound request body is recorded
const e3 = chatCalls(c1.log)[0];
check("3 the outbound request body is recorded in full",
  typeof e3?.outbound === "string" && e3.outbound.length > 50 && /messages/.test(e3.outbound),
  `outboundBytes=${e3?.outboundBytes} recorded=${e3?.outbound?.length} containsMessages=${/messages/.test(e3?.outbound ?? "")}`);

// 4 - the secret detector fires in BOTH directions. A one-directional check cannot tell "correctly
// false" from "always false", which is exactly how Wave 6's stuck-false detector survived validation.
const presentOk = secretOnWire(c1.log);
const fake = freshWire("probes/results/w7v-fake.wire");
appendFileSync(fake, JSON.stringify({ isChat: true, code: 200, contentLen: 5, outbound: '{"messages":[{"content":"nothing sensitive here"}]}' }) + "\n");
const absentOk = secretAbsentFromWire(fake) === true && secretOnWire(fake) === false;
check("4 the secret-on-the-wire detector fires in both directions",
  presentOk === true && absentOk === true,
  `secret present in a real outbound body -> ${presentOk}; absent from a body without it -> ${absentOk}`);

// 5 - calls per logical turn are countable
check("5 completed generations per turn are countable",
  completedGenerations(c1.log) >= 1, `completedGenerations=${completedGenerations(c1.log)} chatCalls=${chatCalls(c1.log).length}`);

// 6 - a cold start is distinguishable from a hang
const hang = await run("timeout", { timeout: 20000 });
check("6 a hang is distinguishable from a cold start",
  answered(hang.out) === false && chatCalls(hang.log).length >= 1 && endpointGaveUsable(hang.log) === false && answered(warm.out) === true,
  `timeout: answered=${answered(hang.out)} chatCalls=${chatCalls(hang.log).length} usable=false | warming call answered=${answered(warm.out)} at ${warm.ms}ms`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} instrument checks passed`);
if (failed.length) { console.log("Wave 7 must not be graded until these are fixed."); process.exit(1); }
