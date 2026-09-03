import { createHash, createHmac } from "node:crypto";
import { canonicalStringify, gitStreamFrameSchema } from "./materialization-contracts.mjs";
import { GitFrameDecoder, GitStreamSession } from "./git-stream-session.mjs";
import { parseExactPublicGitUrl } from "./git-tls-connector.mjs";

const fail = code => Object.assign(new Error(code), { code });
const MAX_PAYLOAD = 1_048_576;
const MAX_DEADLINE = 120_000;
function exactObject(value, keys, code) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw fail(code);
  return value;
}
function validDeadline(deadlineAt) {
  const now = Date.now();
  if (!Number.isSafeInteger(deadlineAt) || deadlineAt <= now || deadlineAt - now > MAX_DEADLINE) throw fail("git-ipc-deadline-invalid");
}

export function signGitStreamRecord(input, key) {
  exactObject(input, ["channelId", "direction", "frameType", "nonce", "payload", "requestId", "requestOrdinal", "sequence"], "git-frame-encode-input-invalid");
  if (!Buffer.isBuffer(input.payload) || input.payload.length > MAX_PAYLOAD || !Buffer.isBuffer(key) || key.length !== 32) throw fail("git-frame-encode-input-invalid");
  const payload = Buffer.from(input.payload);
  const unsigned = { schemaVersion: "runa-materialization-pipe-frame/v2", channelId: input.channelId,
    sequence: input.sequence, requestId: input.requestId, nonce: input.nonce,
    payloadSha256: createHash("sha256").update(payload).digest("hex"), payloadBytes: payload.length,
    direction: input.direction, requestOrdinal: input.requestOrdinal, frameType: input.frameType };
  const hmacSha256 = createHmac("sha256", key).update(canonicalStringify(unsigned)).update(payload).digest("hex");
  const frame = gitStreamFrameSchema.parse({ ...unsigned, hmacSha256 });
  return Object.freeze({ rawHeader: Buffer.from(canonicalStringify(frame)), payload });
}
export function encodeGitStreamRecord(record) {
  exactObject(record, ["payload", "rawHeader"], "git-frame-record-invalid");
  if (!Buffer.isBuffer(record.rawHeader) || record.rawHeader.length < 2 || record.rawHeader.length > 16_384
      || !Buffer.isBuffer(record.payload) || record.payload.length > MAX_PAYLOAD) throw fail("git-frame-record-invalid");
  const prefix = Buffer.alloc(4); prefix.writeUInt32BE(record.rawHeader.length);
  return Buffer.concat([prefix, record.rawHeader, record.payload]);
}

function boundary(decoder) {
  if (decoder.header === null) return 4 - decoder.prefixOffset;
  if (decoder.headerOffset < decoder.header.length) return decoder.header.length - decoder.headerOffset;
  return decoder.payload.length - decoder.payloadOffset;
}
/** Feeds only through the next frame boundary, so a large upstream chunk never creates a record array. */
export async function* decodeGitStreamRecords(readable) {
  if (!readable || typeof readable[Symbol.asyncIterator] !== "function") throw fail("git-frame-reader-invalid");
  const decoder = new GitFrameDecoder();
  try {
    for await (const input of readable) {
      const chunk = Buffer.isBuffer(input) ? input : Buffer.from(input); let offset = 0;
      while (offset < chunk.length) {
        const take = Math.min(boundary(decoder), chunk.length - offset); let emitted = null;
        decoder.push(chunk.subarray(offset, offset + take), record => { emitted = record; }); offset += take;
        if (emitted !== null) yield emitted;
      }
    }
    decoder.finish();
  } catch (error) { decoder.destroy(); throw error; }
}

class AttemptDeadline {
  constructor(deadlineAt, close) {
    validDeadline(deadlineAt); this.deadlineAt = deadlineAt; this.closed = false;
    this.closedPromise = new Promise(resolve => { this.resolveClosed = resolve; });
    this.timer = setTimeout(() => close(fail("git-ipc-absolute-deadline")), Math.max(1, deadlineAt - Date.now())); this.timer.unref?.();
  }
  async race(promise) {
    if (this.closed) throw this.reason;
    const value = await Promise.race([Promise.resolve(promise).then(result => ({ result })), this.closedPromise]);
    if (Object.hasOwn(value, "error")) throw value.error; return value.result;
  }
  close(error) {
    if (this.closed) return false; this.closed = true; this.reason = error; clearTimeout(this.timer);
    this.resolveClosed({ error }); return true;
  }
  complete() { if (!this.closed) { this.closed = true; clearTimeout(this.timer); this.resolveClosed({ error: fail("git-ipc-complete") }); } }
}

export async function writeGitStreamRecord(writable, record, race = promise => promise) {
  if (!writable || typeof writable.write !== "function" || writable.destroyed) throw fail("git-frame-writer-invalid");
  if (!writable.write(encodeGitStreamRecord(record))) {
    await race(new Promise((resolve, reject) => {
      const cleanup = () => { writable.off("drain", drained); writable.off("error", errored); writable.off("close", closed); };
      const drained = () => { cleanup(); resolve(); }, errored = error => { cleanup(); reject(error); };
      const closed = () => { cleanup(); reject(fail("git-frame-writer-closed")); };
      writable.once("drain", drained); writable.once("error", errored); writable.once("close", closed);
    }));
  }
}
function requestInput(value, expected) {
  exactObject(value, ["accept", "body", "contentLength", "contentType", "deadlineAt", "method", "pathAndQuery", "repositoryHttpsUrl", "requestId", "requestOrdinal", "schemaVersion", "sourceId"], "git-framed-client-request-invalid");
  if (value.schemaVersion !== "runa-public-git-broker-request/v1" || value.sourceId !== expected.sourceId
      || value.requestId !== expected.requestId || value.repositoryHttpsUrl !== expected.repositoryHttpsUrl
      || value.requestOrdinal !== expected.ordinal || value.deadlineAt !== expected.deadlineAt
      || !Number.isSafeInteger(value.contentLength) || value.contentLength < (expected.ordinal === 0 ? 0 : 1)
      || value.contentLength > 2_097_152 || typeof value.body?.[Symbol.asyncIterator] !== "function") {
    throw fail("git-framed-client-request-invalid");
  }
  return value;
}

function cancelBodyIterator(iterator) {
  try { Promise.resolve(iterator?.return?.()).catch(() => {}); } catch { /* Attempt is already poisoned. */ }
}

export class FramedGitBrokerClient {
  #key; #records; #session; #sequence = 0; #ordinal = 0; #active = false; #closed = false; #deadline;
  constructor({ readable, writable, repositoryHttpsUrl, sourceId, channelId, requestId, nonce, key, deadlineAt }) {
    const repository = parseExactPublicGitUrl(repositoryHttpsUrl);
    validDeadline(deadlineAt);
    const id = /^[a-z0-9][a-z0-9_-]{7,127}$/u;
    if (!Buffer.isBuffer(key) || key.length !== 32 || !readable || typeof readable[Symbol.asyncIterator] !== "function"
        || !writable || typeof writable.write !== "function" || typeof writable.destroy !== "function"
        || !id.test(sourceId) || !id.test(channelId) || !id.test(requestId) || !/^[a-f0-9]{64}$/u.test(nonce)) {
      throw fail("git-framed-client-config-invalid");
    }
    this.#deadline = new AttemptDeadline(deadlineAt, error => this.close(error)); this.deadlineAt = deadlineAt;
    this.readable = readable; this.writable = writable; this.repositoryHttpsUrl = repository.href; this.sourceId = sourceId;
    this.requestId = requestId; this.channelId = channelId; this.nonce = nonce; this.#key = Buffer.from(key);
    this.#session = new GitStreamSession({ channelId, requestId, nonce, repositoryPath: repository.pathname, key: this.#key });
    this.#records = decodeGitStreamRecords(readable)[Symbol.asyncIterator]();
  }
  async #send(frameType, requestOrdinal, payload = Buffer.alloc(0)) {
    const record = signGitStreamRecord({ channelId: this.channelId, direction: "materializer-to-broker", frameType,
      nonce: this.nonce, payload, requestId: this.requestId, requestOrdinal, sequence: ++this.#sequence }, this.#key);
    this.#session.accept(record);
    await writeGitStreamRecord(this.writable, record, promise => this.#deadline.race(promise));
  }
  async #next() {
    const item = await this.#deadline.race(this.#records.next());
    if (item.done) throw fail("git-framed-client-premature-eof"); return this.#session.accept(item.value);
  }
  close(error = fail("git-framed-client-closed")) {
    if (this.#closed) return false; this.#closed = true; this.#deadline.close(error);
    try { this.#session.destroy(); } catch {} try { this.#key.fill(0); } catch {}
    try { if (!this.writable.destroyed) this.writable.destroy(); } catch {}
    try { if (!this.readable.destroyed) this.readable.destroy(); } catch {}
    return true;
  }
  #complete() {
    if (this.#closed) return; this.#closed = true; this.#deadline.complete(); this.#key.fill(0);
  }
  async request(value) {
    if (this.#closed || this.#active || this.#ordinal > 1) { const error = fail("git-framed-client-state-invalid"); this.close(error); throw error; }
    this.#active = true;
    try {
      const input = requestInput(value, { sourceId: this.sourceId, requestId: this.requestId,
        repositoryHttpsUrl: this.repositoryHttpsUrl, ordinal: this.#ordinal, deadlineAt: this.deadlineAt });
      const head = Buffer.from(canonicalStringify({ schemaVersion: "runa-public-git-http-request/v1",
        requestOrdinal: input.requestOrdinal, method: input.method, pathAndQuery: input.pathAndQuery,
        accept: input.accept, contentType: input.contentType, contentLength: input.contentLength }));
      await this.#send("open-request", this.#ordinal, head);
      const iterator = input.body[Symbol.asyncIterator]();
      let sent = 0, bodyComplete = false;
      try {
        while (true) {
          const item = await this.#deadline.race(iterator.next());
          if (!item || typeof item !== "object") throw fail("git-framed-client-request-body-invalid");
          if (item.done) break;
          if (!Buffer.isBuffer(item.value) && !(item.value instanceof Uint8Array)) throw fail("git-framed-client-request-body-invalid");
          const chunk = Buffer.from(item.value);
          if (chunk.length === 0 || sent + chunk.length > input.contentLength) throw fail("git-framed-client-request-body-invalid");
          sent += chunk.length;
          for (let offset = 0; offset < chunk.length; offset += MAX_PAYLOAD) {
            await this.#send("request-body", this.#ordinal, chunk.subarray(offset, offset + MAX_PAYLOAD));
          }
        }
        if (sent !== input.contentLength) throw fail("git-framed-client-request-body-invalid");
        bodyComplete = true;
      } finally { if (!bodyComplete) cancelBodyIterator(iterator); }
      await this.#send("end-request", this.#ordinal);
      if (this.#ordinal === 1) {
        await this.#deadline.race(new Promise((resolve, reject) => this.writable.end(resolve).once("error", reject)));
        this.#session.endDirection("materializer-to-broker");
      }
      const opened = await this.#next();
      if (opened.frame.frameType !== "open-response" || opened.frame.requestOrdinal !== this.#ordinal) throw fail("git-framed-client-response-invalid");
      const responseHead = JSON.parse(opened.payload.toString("utf8")), ordinal = this.#ordinal++, owner = this;
      let consumed = false;
      const body = Object.freeze({
        cancel() { if (!consumed) { consumed = true; owner.close(fail("git-framed-client-body-abandoned")); } },
        async *[Symbol.asyncIterator]() {
          if (consumed) {
            const error = fail("git-framed-client-body-reused"); owner.close(error); throw error;
          }
          consumed = true; let complete = false;
          try {
            while (true) {
              const accepted = await owner.#next();
              if (accepted.frame.requestOrdinal !== ordinal) throw fail("git-framed-client-response-invalid");
              if (accepted.frame.frameType === "response-body") { yield accepted.payload; continue; }
              if (accepted.frame.frameType !== "end-response") throw fail("git-framed-client-response-invalid"); break;
            }
            if (ordinal === 1) {
              const terminal = await owner.#next();
              if (terminal.frame.frameType !== "terminal" || terminal.frame.requestOrdinal !== 1) throw fail("git-framed-client-response-invalid");
              const eof = await owner.#deadline.race(owner.#records.next()); if (!eof.done) throw fail("git-framed-client-frame-after-terminal");
              owner.#session.endDirection("broker-to-materializer"); owner.#session.finish(); owner.#complete();
            }
            complete = true;
          } catch (error) { owner.close(error); throw error; }
          finally { if (!complete) owner.close(fail("git-framed-client-body-abandoned")); owner.#active = false; }
        },
      });
      return Object.freeze({ statusCode: responseHead.status,
        url: `${this.repositoryHttpsUrl}${input.pathAndQuery.slice(new URL(this.repositoryHttpsUrl).pathname.length)}`,
        headers: Object.freeze({ "content-type": responseHead.contentType }), body });
    } catch (error) { this.#active = false; this.close(error); throw error; }
  }
  keyDestroyed() { return this.#key.every(byte => byte === 0); }
}
