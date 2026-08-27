// Public capability and native-tool contracts, not evaluation answer keys.
const path = { type: "string", minLength: 1, maxLength: 240 };
const content = { type: "string", maxLength: 32768 };
const object = properties => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

export const CAPABILITIES = Object.freeze([
  { id: "workspace.inspect", description: "Read the named file in the declared synthetic project; no other files are read.", argumentsSchema: object({ path }) },
  { id: "workspace.preview-change", description: "Preview replacing the named synthetic file with the exact content; does not apply it.", argumentsSchema: object({ path, content }) },
  { id: "workspace.apply-synthetic-change", description: "Request replacing the named in-memory synthetic file with the exact content. Application authorization and a later receipt are required; a proposal is not execution.", argumentsSchema: object({ path, content }) },
  { id: "workspace.restore-synthetic-change", description: "Request undoing the exact synthetic change identified by forwardReceiptId; cannot undo unrelated changes.", argumentsSchema: object({ forwardReceiptId: { type: "string", minLength: 1, maxLength: 160 } }) },
  { id: "workspace.verify-synthetic", description: "Check exact file digest assertions in the synthetic project; null means the file must be absent. This does not modify a file.", argumentsSchema: object({ assertions: { type: "array", minItems: 1, maxItems: 32, items: object({ path, sha256: { anyOf: [{ type: "string", pattern: "^[a-f0-9]{64}$" }, { type: "null" }] } }) } }) },
]);

export const NATIVE_TOOLS = Object.freeze([
  { type: "function", function: { name: "workspace_inspect", description: CAPABILITIES[0].description, parameters: CAPABILITIES[0].argumentsSchema } },
  { type: "function", function: { name: "workspace_apply_synthetic_change", description: CAPABILITIES[2].description, parameters: CAPABILITIES[2].argumentsSchema } },
]);

export const selectCapabilities = (...ids) => CAPABILITIES.filter(item => ids.includes(item.id)).map(item => structuredClone(item));
export const selectNativeTools = (...names) => NATIVE_TOOLS.filter(item => names.includes(item.function.name)).map(item => structuredClone(item));
