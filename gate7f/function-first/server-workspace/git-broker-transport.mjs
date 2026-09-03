const fail = code => Object.assign(new Error(code), { code });
const MAX_REQUEST_BYTES = 2_097_152;
const allowedRequestHeaders = new Set(["accept", "content-length", "content-type", "git-protocol", "user-agent"]);

async function requestBytes(body) {
  if (!body) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for await (const chunk of body) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_REQUEST_BYTES) throw fail("git-broker-request-too-large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
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

export function createGitBrokerHttp({ broker, repositoryHttpsUrl, sourceId, requestId }) {
  if (!broker || typeof broker.request !== "function") throw fail("git-broker-required");
  const repository = new URL(repositoryHttpsUrl);
  if (repository.protocol !== "https:" || repository.port || repository.username || repository.password
      || repository.search || repository.hash || !repository.pathname.endsWith(".git") || repository.href.endsWith("/")) {
    throw fail("git-broker-repository-url-invalid");
  }
  let ordinal = 0;
  return Object.freeze({
    async request(input) {
      if (input.agent !== undefined || input.fetchOptions !== undefined) throw fail("git-broker-option-denied");
      const expected = expectedRequest(repository, ordinal);
      const headers = normalizedHeaders(input.headers);
      if ((input.method ?? "GET") !== expected.method || input.url !== expected.url
          || headers.accept !== expected.accept || (headers["content-type"] ?? null) !== expected.contentType) {
        throw fail("git-broker-request-shape-denied");
      }
      const body = await requestBytes(input.body);
      if ((ordinal === 0 && body.length !== 0) || (ordinal === 1 && body.length === 0)) {
        throw fail("git-broker-request-body-invalid");
      }
      const response = await broker.request(Object.freeze({
        schemaVersion: "runa-public-git-broker-request/v1",
        sourceId,
        requestId,
        requestOrdinal: ordinal,
        repositoryHttpsUrl: repository.href,
        method: expected.method,
        pathAndQuery: new URL(expected.url).pathname + new URL(expected.url).search,
        accept: expected.accept,
        contentType: expected.contentType,
        body,
      }));
      ordinal += 1;
      if (!response || response.statusCode !== 200 || response.url !== expected.url
          || response.headers?.["content-type"] !== expected.accept
          || typeof response.body?.[Symbol.asyncIterator] !== "function") {
        throw fail("git-broker-response-invalid");
      }
      return Object.freeze({
        url: response.url,
        method: expected.method,
        headers: Object.freeze({ "content-type": expected.accept }),
        body: response.body,
        statusCode: 200,
        statusMessage: "OK",
      });
    },
    requestCount() { return ordinal; },
  });
}
