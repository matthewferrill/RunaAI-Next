// Deliberate allow-list: evaluator expectations/rubrics must never enter the provider request.
export function renderAcceptanceInput(item) {
  const fields = ["id", "roles", "mode", "messages", "trustedState", "capabilities", "tools", "turns"];
  return structuredClone(Object.fromEntries(fields.filter(key => Object.hasOwn(item, key)).map(key => [key, item[key]])));
}

export function renderAcceptanceInputs(corpus) {
  return {
    schemaVersion: "runa2-gate7f-qualification-inputs/v1",
    attemptsPerCase: corpus.attemptsPerCase,
    cases: corpus.cases.map(renderAcceptanceInput),
  };
}

export function countInferenceRequests(corpus) {
  return corpus.cases.reduce((sum, item) => sum + 1 + (item.turns?.length ?? 0), 0) * corpus.attemptsPerCase;
}
