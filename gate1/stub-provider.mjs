import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.env.STUB_PORT ?? 9579);
const dimension = Number(process.env.STUB_DIM ?? 768);
const modelId = process.env.STUB_MODEL ?? "stub-deterministic-v1";
const latencyMs = Number(process.env.STUB_LATENCY_MS ?? 0);
const logPath = process.env.STUB_LOG ?? "";
let rules = [];
try { rules = JSON.parse(process.env.STUB_RULES ?? "[]"); } catch {}

const hash = value => createHash("sha256").update(String(value)).digest();
const log = value => { if (logPath) appendFileSync(logPath, `${JSON.stringify(value)}\n`); };

function embed(text) {
  const output = new Array(dimension);
  let bytes = hash(text);
  let offset = 0;
  for (let index = 0; index < dimension; index += 1) {
    if (offset >= bytes.length - 1) { bytes = hash(Buffer.concat([bytes, Buffer.from([index & 0xff])])); offset = 0; }
    output[index] = (bytes.readUInt16BE(offset) / 65_535) * 2 - 1;
    offset += 2;
  }
  const norm = Math.sqrt(output.reduce((total, value) => total + value * value, 0)) || 1;
  return output.map(value => value / norm);
}

function lastUserText(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) return message.content.map(part => part?.text ?? "").join(" ");
  }
  return "";
}

function trustedRuleSubject(text) {
  try {
    const envelope = JSON.parse(text);
    if (typeof envelope?.request?.message === "string") return envelope.request.message;
  } catch {}
  return text;
}

function selectedRule(text) {
  const subject = trustedRuleSubject(text).toLowerCase();
  return rules.find(rule => rule.match && subject.includes(String(rule.match).toLowerCase())) ?? null;
}

const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let body = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
  const route = String(request.url).split("?")[0];
  if (latencyMs) await new Promise(resolve => setTimeout(resolve, latencyMs));
  const send = (payload, status = 200) => {
    log({ url: route, code: status, model: body.model ?? null, at: Date.now() });
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(payload));
  };
  if (route.endsWith("/models")) return send({ object: "list", data: [{ id: modelId, object: "model", owned_by: "gate1-stub" }] });
  if (route.endsWith("/embeddings")) {
    const input = Array.isArray(body.input) ? body.input : [body.input ?? ""];
    return send({ object: "list", model: body.model ?? "stub-embed-v1",
      data: input.map((text, index) => ({ object: "embedding", index, embedding: embed(String(text)) })) });
  }
  if (route.endsWith("/chat/completions")) {
    const text = lastUserText(body.messages);
    const rule = selectedRule(text);
    const content = rule?.reply ?? `STUB::${hash(trustedRuleSubject(text)).toString("hex").slice(0, 12)}`;
    return send({ id: "gate1-stub-completion", object: "chat.completion", created: 0,
      model: body.model ?? modelId, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: rule?.finish ?? "stop" }] });
  }
  return send({ error: `unhandled ${route}` }, 404);
});

server.on("error", error => { process.stderr.write(`gate1 stub provider failed: ${error.code}\n`); process.exit(9); });
server.listen(port, "127.0.0.1", () => process.stdout.write(`gate1 stub provider ready ${port}\n`));
