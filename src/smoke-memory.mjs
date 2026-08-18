// Does stock memory carry a fact across two turns of one thread?
import { referenceAgent } from "./agent-with-memory.mjs";
const opts = { memory: { thread: "smoke-thread-1", resource: "smoke-user" } };
await referenceAgent.generate("My dog's name is Biscuit. Remember that.", opts);
const second = await referenceAgent.generate("What is my dog's name?", opts);
console.log("recall:", String(second.text).slice(0, 120));
