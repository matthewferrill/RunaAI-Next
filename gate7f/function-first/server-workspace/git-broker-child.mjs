import { canonicalStringify } from "./materialization-contracts.mjs";
import { GitStreamSession } from "./git-stream-session.mjs";
import { decodeGitStreamRecords, signGitStreamRecord, writeGitStreamRecord } from "./git-stream-codec.mjs";
import { GitTlsConnector, parseExactPublicGitUrl } from "./git-tls-connector.mjs";

const fail = code => Object.assign(new Error(code), { code });
const MAX_PAYLOAD = 1_048_576;
const TEST_FACTORY = Symbol("explicit-test-only-broker-child-factory");
function validateDeadline(deadlineAt) {
  const now = Date.now();
  if (!Number.isSafeInteger(deadlineAt) || deadlineAt <= now || deadlineAt - now > 120_000) throw fail("git-broker-child-deadline-invalid");
}

export class GitBrokerChild {
  #key; #session; #connector = null; #closed = false; #running = false; #completed = false; #timer; #closeReason;
  #closePromise; #resolveClose;
  constructor({ readable, writable, repositoryHttpsUrl, channelId, requestId, nonce, key, deadlineAt }, composition = null) {
    const repository = parseExactPublicGitUrl(repositoryHttpsUrl); validateDeadline(deadlineAt);
    if (!Buffer.isBuffer(key) || key.length !== 32 || !readable || !writable) throw fail("git-broker-child-config-invalid");
    if (composition !== null && composition.token !== TEST_FACTORY) throw fail("git-broker-child-factory-denied");
    this.factory = composition ? composition.connectorFactory : options => new GitTlsConnector(options);
    if (typeof this.factory !== "function") throw fail("git-broker-child-factory-invalid");
    this.readable = readable; this.writable = writable; this.repository = repository;
    this.channelId = channelId; this.requestId = requestId; this.nonce = nonce; this.deadlineAt = deadlineAt;
    this.#key = Buffer.from(key); this.#session = new GitStreamSession({ channelId, requestId, nonce,
      repositoryPath: repository.pathname, key: this.#key });
    this.#closePromise = new Promise(resolve => { this.#resolveClose = resolve; });
    this.#timer = setTimeout(() => this.close(fail("git-broker-child-absolute-deadline")), Math.max(1, deadlineAt - Date.now()));
    this.#timer.unref?.();
  }
  async #race(promise) {
    if (this.#closed) throw this.#closeReason;
    const value = await Promise.race([Promise.resolve(promise).then(result => ({ result })), this.#closePromise]);
    if (Object.hasOwn(value, "error")) throw value.error; return value.result;
  }
  close(error = fail("git-broker-child-closed")) {
    if (this.#closed) return false; this.#closed = true; this.#closeReason = error; clearTimeout(this.#timer);
    this.#resolveClose({ error });
    try { this.#connector?.close?.(); } catch {}
    try { this.#session.destroy(); } catch {}
    try { this.#key.fill(0); } catch {}
    try { if (!this.writable.destroyed) this.writable.destroy(); } catch {}
    try { if (!this.readable.destroyed) this.readable.destroy(); } catch {}
    return true;
  }
  #complete() { this.#completed = true; this.#closed = true; clearTimeout(this.#timer); this.#key.fill(0); this.#resolveClose({ error: fail("git-broker-child-complete") }); }
  async run() {
    if (this.#running || this.#closed) { const error = fail("git-broker-child-state-invalid"); this.close(error); throw error; }
    this.#running = true; let sequence = 0, transaction = null, ordinal = 0, outputEnded = false;
    try {
      try { this.#connector = this.factory({ repositoryHttpsUrl: this.repository.href, deadlineAt: this.deadlineAt }); }
      catch (error) { throw error; }
      if (!this.#connector || typeof this.#connector.openRequest !== "function" || typeof this.#connector.close !== "function"
          || typeof this.#connector.observation !== "function") throw fail("git-broker-child-connector-invalid");
      const send = async (frameType, requestOrdinal, payload = Buffer.alloc(0)) => {
        const record = signGitStreamRecord({ channelId: this.channelId, direction: "broker-to-materializer", frameType,
          nonce: this.nonce, payload, requestId: this.requestId, requestOrdinal, sequence: ++sequence }, this.#key);
        this.#session.accept(record);
        await writeGitStreamRecord(this.writable, record, promise => this.#race(promise));
      };
      const records = decodeGitStreamRecords(this.readable)[Symbol.asyncIterator]();
      while (true) {
        const item = await this.#race(records.next()); if (item.done) break;
        const accepted = this.#session.accept(item.value), frame = accepted.frame;
        if (frame.requestOrdinal !== ordinal) throw fail("git-broker-child-request-order-invalid");
        if (frame.frameType === "open-request") {
          if (transaction !== null) throw fail("git-broker-child-request-state-invalid");
          transaction = await this.#race(this.#connector.openRequest(JSON.parse(accepted.payload.toString("utf8"))));
        } else if (frame.frameType === "request-body") {
          if (transaction === null) throw fail("git-broker-child-request-state-invalid");
          await this.#race(transaction.writeBody(accepted.payload));
        } else if (frame.frameType === "end-request") {
          if (transaction === null) throw fail("git-broker-child-request-state-invalid");
          const response = await this.#race(transaction.finish()); transaction = null;
          await send("open-response", ordinal, Buffer.from(canonicalStringify(response.head)));
          const body = response.body[Symbol.asyncIterator]();
          while (true) {
            const bodyItem = await this.#race(body.next()); if (bodyItem.done) break;
            const chunk = Buffer.from(bodyItem.value);
            for (let offset = 0; offset < chunk.length; offset += MAX_PAYLOAD) await send("response-body", ordinal, chunk.subarray(offset, offset + MAX_PAYLOAD));
          }
          await send("end-response", ordinal);
          if (ordinal++ === 1) {
            await send("terminal", 1); this.#session.endDirection("broker-to-materializer");
            await this.#race(new Promise((resolve, reject) => this.writable.end(resolve).once("error", reject))); outputEnded = true;
          }
        } else throw fail("git-broker-child-request-frame-invalid");
      }
      if (!outputEnded || ordinal !== 2 || transaction !== null) throw fail("git-broker-child-premature-eof");
      this.#session.endDirection("materializer-to-broker"); const stream = this.#session.finish();
      const network = this.#connector.observation();
      let closeError = null; try { this.#connector.close(); } catch (error) { closeError = error; }
      try { this.#key.fill(0); } catch (error) { closeError ??= error; }
      if (closeError) throw closeError;
      this.#complete();
      return Object.freeze({ schemaVersion: "runa-public-git-broker-child-result/v1", stream, network });
    } catch (error) {
      const original = error;
      try { this.#connector?.close?.(); } catch {}
      try { this.#session.destroy(); } catch {}
      try { this.#key.fill(0); } catch {}
      try { if (!this.writable.destroyed) this.writable.destroy(); } catch {}
      try { if (!this.readable.destroyed) this.readable.destroy(); } catch {}
      this.close(original); throw original;
    }
  }
  keyDestroyed() { return this.#key.every(byte => byte === 0); }
  completed() { return this.#completed; }
}

/** Explicitly non-production child composition for deterministic connector faults and local TLS tests. */
export function createGitBrokerChildForTest(options, connectorFactory) {
  if (typeof connectorFactory !== "function") throw fail("git-broker-child-test-factory-invalid");
  return new GitBrokerChild(options, Object.freeze({ token: TEST_FACTORY, connectorFactory }));
}
