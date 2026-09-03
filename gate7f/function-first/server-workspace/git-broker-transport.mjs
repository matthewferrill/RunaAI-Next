const fail = code => Object.assign(new Error(code), { code });
const MAX_REQUEST_BYTES = 2_097_152;
const allowedRequestHeaders = new Set(["accept", "content-length", "content-type", "git-protocol", "user-agent"]);

function validDeadline(deadlineAt) {
  const remaining = deadlineAt - Date.now();
  if (!Number.isSafeInteger(deadlineAt) || remaining <= 0 || remaining > 120_000) {
    throw fail("git-broker-deadline-invalid");
  }
}

function parseContentLength(value) {
  if (value === undefined) return null;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) throw fail("git-broker-request-body-invalid");
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result > MAX_REQUEST_BYTES) throw fail("git-broker-request-too-large");
  return result;
}

const asyncChunks = chunks => Object.freeze({ async *[Symbol.asyncIterator]() {
  for (const chunk of chunks) yield chunk;
} });

function bodySource(body, declaredLength, ordinal) {
  const supplied = body !== undefined && body !== null;
  let knownLength = null;
  if (!supplied) {
    body = asyncChunks([]);
    knownLength = 0;
  } else if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    const chunk = Buffer.from(body);
    knownLength = chunk.length;
    body = asyncChunks([chunk]);
  } else if (Array.isArray(body)) {
    const chunks = body.map(chunk => {
      if (!Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array)) throw fail("git-broker-request-body-invalid");
      return Buffer.from(chunk);
    });
    knownLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    body = asyncChunks(chunks);
  } else if (typeof body?.[Symbol.asyncIterator] !== "function") {
    throw fail("git-broker-request-body-invalid");
  }
  const contentLength = declaredLength ?? knownLength;
  if (contentLength === null || contentLength > MAX_REQUEST_BYTES || (knownLength !== null && contentLength !== knownLength)
      || (ordinal === 0 && contentLength !== 0) || (ordinal === 1 && contentLength < 1)) {
    throw fail(contentLength > MAX_REQUEST_BYTES ? "git-broker-request-too-large" : "git-broker-request-body-invalid");
  }
  return Object.freeze({ contentLength, body });
}

async function withinDeadline(promise, deadlineAt) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw fail("git-broker-request-deadline");
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(fail("git-broker-request-deadline")), remaining);
      timer.unref?.();
    })]);
  } finally { clearTimeout(timer); }
}

function normalizedHeaders(headers = {}) {
  const result = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (!allowedRequestHeaders.has(name) || typeof rawValue !== "string" || rawValue.length > 512) {
      throw fail("git-broker-request-header-denied");
    }
    result[name] = rawValue;
  }
  return Object.freeze(result);
}

function expectedRequest(repository, ordinal) {
  if (ordinal === 0) return {
    method: "GET",
    url: `${repository.href}/info/refs?service=git-upload-pack`,
    accept: "application/x-git-upload-pack-advertisement",
    contentType: null,
  };
  if (ordinal === 1) return {
    method: "POST",
    url: `${repository.href}/git-upload-pack`,
    accept: "application/x-git-upload-pack-result",
    contentType: "application/x-git-upload-pack-request",
  };
  throw fail("git-broker-request-count-exceeded");
}

export function createGitBrokerHttp({ broker, repositoryHttpsUrl, sourceId, requestId, deadlineAt }) {
  if (!broker || typeof broker.request !== "function") throw fail("git-broker-required");
  validDeadline(deadlineAt);
  const repository = new URL(repositoryHttpsUrl);
  if (repository.protocol !== "https:" || repository.port || repository.username || repository.password
      || repository.search || repository.hash || !repository.pathname.endsWith(".git") || repository.href.endsWith("/")) {
    throw fail("git-broker-repository-url-invalid");
  }
  let ordinal = 0, closed = false;
  const poison = error => {
    closed = true;
    try { broker.close?.(error); } catch { /* The original transport failure remains authoritative. */ }
  };
  return Object.freeze({
    async request(input) {
      if (closed) throw fail("git-broker-attempt-closed");
      try {
        if (!input || input.agent !== undefined || input.fetchOptions !== undefined) throw fail("git-broker-option-denied");
        const expected = expectedRequest(repository, ordinal);
        const headers = normalizedHeaders(input.headers);
        if ((input.method ?? "GET") !== expected.method || input.url !== expected.url
            || headers.accept !== expected.accept || (headers["content-type"] ?? null) !== expected.contentType) {
          throw fail("git-broker-request-shape-denied");
        }
        const source = bodySource(input.body, parseContentLength(headers["content-length"]), ordinal);
        const response = await withinDeadline(broker.request(Object.freeze({
          schemaVersion: "runa-public-git-broker-request/v1",
          sourceId,
          requestId,
          requestOrdinal: ordinal,
          repositoryHttpsUrl: repository.href,
          method: expected.method,
          pathAndQuery: new URL(expected.url).pathname + new URL(expected.url).search,
          accept: expected.accept,
          contentType: expected.contentType,
          contentLength: source.contentLength,
          deadlineAt,
          body: source.body,
        })), deadlineAt);
        ordinal += 1;
        if (!response || response.statusCode !== 200 || response.url !== expected.url
            || response.headers?.["content-type"] !== expected.accept
            || typeof response.body?.[Symbol.asyncIterator] !== "function") {
          throw fail("git-broker-response-invalid");
        }
        return Object.freeze({ url: response.url, method: expected.method,
          headers: Object.freeze({ "content-type": expected.accept }), body: response.body,
          statusCode: 200, statusMessage: "OK" });
      } catch (error) { poison(error); throw error; }
    },
    requestCount() { return ordinal; },
  });
}
