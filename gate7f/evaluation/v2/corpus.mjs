import { readFileSync } from "node:fs";
import { parseBurninCorpus } from "../contracts.mjs";
import { canonicalDigest } from "../../contracts.mjs";

// Answer values are local grading data. Only the presence of this format is exposed to the renderer.
export const FACT_RULES = Object.freeze({
  "chat-italy": { values: ["Rome"] },
  "chat-square-root-pi": { number: Math.sqrt(Math.PI), absoluteTolerance: 0.005 },
  "relevance-france-after-italy": { values: ["Paris"] },
  "relevance-new-arithmetic": { number: 30, absoluteTolerance: 0 },
  "relevance-latest-correction": { values: ["blue"] },
  "relevance-current-path": { values: ["src/new.js"] },
  "continuity-name": { values: ["Alice"] },
  "continuity-project-correction": { values: ["Aurora"] },
  "continuity-checkpoint": { values: ["step 3", "3"] },
  "continuity-explicit-cancel": { values: ["cancelled", "canceled"] },
});

export function loadCorpus() {
  const corpus = parseBurninCorpus(JSON.parse(readFileSync(new URL("../corpus.json", import.meta.url), "utf8")));
  // v1 silently graded an unstated function signature. Make that requirement part of the question.
  corpus.cases.find(item => item.caseId === "code-add-function").messages[0].content =
    "Propose src/add.js containing only the JavaScript function add(a,b) that returns a+b; no extra code.";
  for (const id of ["code-composite-function", "code-strict-equality"])
    corpus.cases.find(item => item.caseId === id).messages[0].content +=
      " Use a function declaration with the stated parameter names, not an arrow expression, and no extra code.";
  return corpus;
}
export const corpusDigest = corpus => canonicalDigest({ evaluationVersion: 2, corpus, factRules: FACT_RULES });
