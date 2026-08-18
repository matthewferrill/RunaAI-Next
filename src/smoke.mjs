// Does the stock stack answer at all? One question, one tool-free generation, against HOME.
import { referenceAgent } from "./agent.mjs";

const started = Date.now();
const result = await referenceAgent.generate("What is 17 multiplied by 4?");
console.log(`answer (${Date.now() - started}ms): ${String(result.text).slice(0, 200)}`);
