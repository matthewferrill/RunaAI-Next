const coded = (code, message) => Object.assign(new Error(message), { code });
const clone = value => structuredClone(value);

export class MemoryCutoverStore {
  constructor(initialState) {
    this.state = clone(initialState);
    this.operations = new Map();
    this.queue = Promise.resolve();
  }

  async load() { return clone(this.state); }

  async findOperation(operationId, inputDigest) {
    const existing = this.operations.get(operationId);
    if (!existing) return null;
    if (existing.inputDigest !== inputDigest) throw coded("cutover-operation-conflict", "The operation id is already bound to different input.");
    return { state: clone(existing.state), result: clone(existing.result), replayed: true };
  }

  async commitOperation({ operationId, inputDigest, expectedRevision, nextState, result }) {
    const execute = async () => {
      const existing = this.operations.get(operationId);
      if (existing) {
        if (existing.inputDigest !== inputDigest) throw coded("cutover-operation-conflict", "The operation id is already bound to different input.");
        return { state: clone(existing.state), result: clone(existing.result), replayed: true };
      }
      if (this.state.revision !== expectedRevision) throw coded("cutover-revision-conflict", "The cutover state changed before this operation could commit.");
      this.state = clone(nextState);
      this.operations.set(operationId, { inputDigest, state: clone(nextState), result: clone(result) });
      return { state: clone(nextState), result: clone(result), replayed: false };
    };
    const pending = this.queue.then(execute, execute);
    this.queue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  audit() { return { revision: this.state.revision, phase: this.state.phase, operations: this.operations.size }; }
}
