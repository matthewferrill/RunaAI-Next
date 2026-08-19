// Wave 4 controllable MCP server. Real filesystem writes into a sandbox root are the ground truth;
// every call is logged to disk so "did the operation happen" is answerable without asking the model.
// Misbehaviours are selected by env, one per scenario, on the SDK pinned in the lockfile.
import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { writeFileSync, appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const ROOT = resolve(process.env.W4_ROOT ?? "sandbox4");
const CALLLOG = process.env.W4_CALLLOG ?? "probes/results/w4-calls.log";
const MODE = process.env.W4_MODE ?? "ok";
const DELAY = Number(process.env.W4_DELAY_MS ?? 0);
mkdirSync(ROOT, { recursive: true });
mkdirSync(dirname(CALLLOG), { recursive: true });
let calls = 0;

// The sandbox check is the server's own: a path resolving outside ROOT is refused. This is the
// property E14/INPUT is measuring, so it is implemented plainly and its refusals are logged.
const inRoot = (p) => { const r = resolve(ROOT, p); return r === ROOT || r.startsWith(ROOT + "/") ? r : null; };

const TOOLS = [
  { name: "write_note", description: "Write text to a file inside the notes area.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, text: { type: "string" } }, required: ["path", "text"] } },
  { name: "read_note", description: "Read a file from the notes area.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
];
// changed-version / schema-or-roster-changed: the second listing differs from the first.
let listings = 0;
const toolsNow = () => {
  listings++;
  if (MODE === "schema-changed" && listings > 1) {
    return [{ ...TOOLS[0], inputSchema: { type: "object", properties: { destination: { type: "string" }, body: { type: "string" } }, required: ["destination", "body"] } }, TOOLS[1]];
  }
  if (MODE === "tool-removed" && listings > 1) return [TOOLS[1]];
  return TOOLS;
};

const server = new Server({ name: "wave4", version: process.env.W4_VERSION ?? "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolsNow() }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  calls++;
  const { name, arguments: args = {} } = req.params ?? {};
  appendFileSync(CALLLOG, JSON.stringify({ call: calls, name, args, at: Date.now() }) + "\n");

  if (MODE === "die-after-first" && calls > 1) { appendFileSync(CALLLOG, JSON.stringify({ event: "die" }) + "\n"); process.exit(1); }
  if (MODE === "hang") await new Promise(() => {});
  if (MODE === "slow" && DELAY) await new Promise((r) => setTimeout(r, DELAY));
  if (MODE === "malformed-response") return { notContent: "this violates the result shape" };
  if (MODE === "partial-response") return { content: [{ type: "text" }] };  // text field missing

  if (name === "write_note") {
    const target = inRoot(String(args.path ?? ""));
    if (!target) { appendFileSync(CALLLOG, JSON.stringify({ event: "refused-outside-root", path: args.path }) + "\n");
      return { content: [{ type: "text", text: "Refused: path resolves outside the notes area." }], isError: true }; }
    const body = String(args.text ?? "");
    if (MODE === "partial-write") { writeFileSync(target, body.slice(0, Math.max(1, Math.floor(body.length / 2)))); appendFileSync(CALLLOG, JSON.stringify({ event: "partial-write" }) + "\n"); process.exit(1); }
    if (MODE === "die-before-write") { appendFileSync(CALLLOG, JSON.stringify({ event: "die-before-write" }) + "\n"); process.exit(1); }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
    if (MODE === "die-after-write") { appendFileSync(CALLLOG, JSON.stringify({ event: "die-after-write" }) + "\n"); process.exit(1); }
    return { content: [{ type: "text", text: `Wrote ${body.length} characters to ${args.path}.` }] };
  }
  if (name === "read_note") {
    const target = inRoot(String(args.path ?? ""));
    if (!target) { appendFileSync(CALLLOG, JSON.stringify({ event: "refused-outside-root", path: args.path }) + "\n");
      return { content: [{ type: "text", text: "Refused: path resolves outside the notes area." }], isError: true }; }
    if (!existsSync(target)) return { content: [{ type: "text", text: "No such note." }], isError: true };
    return { content: [{ type: "text", text: readFileSync(target, "utf8").slice(0, 4000) }] };
  }
  return { content: [{ type: "text", text: "unknown tool" }], isError: true };
});
await server.connect(new StdioServerTransport());
process.stderr.write(`w4-server: mode=${MODE} root=${ROOT}\n`);
