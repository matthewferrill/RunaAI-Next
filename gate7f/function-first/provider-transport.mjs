const fail = () => Object.assign(new Error("The selected provider request control is invalid."), { code: "provider-request-control-invalid" });

// This is an application/runtime setting, never a prompt instruction or model output.
// Null preserves historical transport bytes. "none" must first be qualified for the selected runtime/model.
export function controlledProviderFetch({ baseURL, modelId, reasoningEffort = null, preventRedirects = false, fetchImpl = fetch }) {
  if (reasoningEffort === null && !preventRedirects) return fetchImpl;
  if (reasoningEffort !== null && reasoningEffort !== "none") throw fail();
  const expected = `${baseURL.replace(/\/$/, "")}/chat/completions`;
  return async (input, init) => {
    if (String(input) !== expected || init?.method?.toUpperCase() !== "POST" || typeof init.body !== "string") throw fail();
    let body;
    try { body = JSON.parse(init.body); } catch { throw fail(); }
    if (!body || Array.isArray(body) || body.model !== modelId) throw fail();
    return fetchImpl(input, { ...init, ...(preventRedirects ? { redirect: "error" } : {}),
      body: reasoningEffort === null ? init.body : JSON.stringify({ ...body, reasoning_effort: reasoningEffort }) });
  };
}
