// Wave 5 writer child. Runs in its own process so the parent can SIGKILL it mid-write; a caught
// exception inside the runner would exercise a path a real crash does not (carried from Wave 3).
//
// W5_PATH selects the write path, and the three are NOT equivalent on this base -- which is itself
// the subject of E05:
//   agent   -- a real agent turn; the only path observed to write embeddings
//   api-v1  -- memory.saveMessages with string content; returns success, writes no embedding
//   api-v2  -- memory.saveMessages with v2 parts; throws, having already written the message
import { agentFor, memoryFor } from "../stack2.mjs";

const DB = process.env.W5_DB;
const PATH_ = process.env.W5_PATH || "agent";
const THREAD = process.env.W5_THREAD || "t1";
const RES = process.env.W5_RESOURCE || "r1";
const TEXT = process.env.W5_TEXT || "canary";
const MSGID = process.env.W5_MSGID || `m-${process.pid}`;
const DELAY = Number(process.env.W5_DELAY_MS || 0);
const url = `file:${DB}`;

if (DELAY) await new Promise((r) => setTimeout(r, DELAY));

try {
  if (PATH_ === "agent") {
    const a = agentFor("semantic", url);
    const r = await a.generate(`Remember this exactly: ${TEXT}`, { memory: { thread: THREAD, resource: RES } });
    process.stdout.write(`ACK::ok\nTEXT::${String(r.text).slice(0, 200).replace(/\n/g, " ")}\n`);
  } else {
    const mem = memoryFor("semantic", url);
    await mem.createThread({ threadId: THREAD, resourceId: RES, title: "t" }).catch(() => {});
    if (PATH_ === "api-v1") {
      await mem.saveMessages({ messages: [{ id: MSGID, threadId: THREAD, resourceId: RES, role: "user", content: TEXT, createdAt: new Date() }] });
    } else {
      await mem.saveMessages({ messages: [{ id: MSGID, threadId: THREAD, resourceId: RES, role: "user",
        content: { format: 2, parts: [{ type: "text", text: TEXT }] }, createdAt: new Date() }], format: "v2" });
    }
    process.stdout.write("ACK::ok\n");
  }
} catch (e) {
  process.stdout.write(`ACK::fail\nERR::${String(e.message).slice(0, 160).replace(/\n/g, " ")}\n`);
  process.exit(3);
}
process.exit(0);
