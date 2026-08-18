// Comprehensive fray map: every committed axis across every installed component, plus the config matrix
// that turns "it broke" into "it broke at X under config Y". Facts planted random, exact-match graded.
import { randomInt } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";

const NOUNS = ["kettle","harbor","lantern","walnut","compass","meadow","anchor","thimble","orchard","canyon","beacon","saddle","quarry","willow","ledger","chisel","falcon","tunnel","marble","cinder","bramble","cobalt","dahlia","ember","fjord","gable","hazel","ivory","juniper","kestrel"];
const NAMES = ["Ansel","Briony","Caldwell","Delphine","Ezra","Fenwick","Greta","Halloran","Imogen","Jasper","Kerensa","Lowell","Maren","Nikolai","Odette","Pruitt","Quill","Rosalind","Sutter","Tamsin"];
const pick = (l) => l[randomInt(l.length)];
const used = new Set();
const code = () => { let c; do { c = `${pick(NOUNS)}-${pick(NOUNS)}-${randomInt(100,999)}`; } while (used.has(c)); used.add(c); return c; };

const cases = [], labels = [], docs = [];
let id = 0;
const add = (probe, axis, tier, q, expect, note = "") => {
  id += 1; const caseId = `${probe}-${String(id).padStart(3,"0")}`;
  cases.push({ caseId, probe, axis, tier, ...q }); labels.push({ caseId, expect, note }); return caseId;
};

// ===== MEMORY: recall depth across the config matrix =====================================================
// Each depth is asked under four configs so the fray is characterized, not merely observed.
const MEM_CONFIGS = ["default", "window40", "semantic", "working"];
for (const depth of [2, 10, 25, 50, 100]) {
  for (const config of MEM_CONFIGS) {
    const fact = code();
    add("memory", `recall-depth`, depth,
      { config, teach: `My locker code is ${fact}. Please remember it exactly.`, fillerTurns: depth - 2, ask: "What is my locker code? Answer with just the code." },
      { mustContain: fact }, config);
  }
}
// contradiction, isolation, restart, ordering, growth — each once, default config
{ const a = code(), b = code(); add("memory","contradiction",1,{config:"default",teach:`My locker code is ${a}.`,revise:`Correction — it is actually ${b}.`,fillerTurns:6,ask:"What is my locker code?"},{mustContain:b,mustNotContain:a},"the revision wins"); }
{ const f = code(); add("memory","thread-isolation",1,{config:"default",teach:`The project password is ${f}.`,askInOtherThread:"What is the project password?"},{mustNotContain:f},"absence is the pass"); }
{ const f = code(); add("memory","resource-isolation",1,{config:"default",teach:`The vault pin is ${f}.`,askOtherResource:"What is the vault pin?"},{mustNotContain:f},"a different user must not see it"); }
{ const f = code(); add("memory","restart-survival",1,{config:"default",teach:`The cellar key code is ${f}.`,restartProcess:true,ask:"What code opens the cellar?"},{mustContain:f}); }
{ const a = code(), b = code(); add("memory","temporal-order",1,{config:"default",teach:`First code: ${a}.`,then:`Second code: ${b}.`,ask:"Which code did I give you FIRST? Answer with just that code."},{mustContain:a,mustNotContain:b},"recency masquerading as memory is the failure"); }
add("memory","growth-bound",1,{config:"default",observeGrowth:true,turns:40},{growthObserved:true},"does the store bound rows, or grow unbounded");

// ===== RETRIEVAL: distance ladder, scaling, staleness, topK, reranker ====================================
const mkDocs = (n) => { const out = []; for (let i=0;i<n;i++){ out.push({ docId:`d${n}-${String(i).padStart(4,"0")}`, text:`${pick(NAMES)} manages the ${pick(NOUNS)} inventory. The ${pick(NOUNS)} shipment arrives on time and ${pick(NAMES)} reviews the ${pick(NOUNS)} ledger.` }); } return out; };
const corpora = { 60: mkDocs(60), 300: mkDocs(300), 1000: mkDocs(1000) };
for (const [size, list] of Object.entries(corpora)) docs.push({ corpusSize: Number(size), docs: list });
const plantIn = (list, text) => { const doc = list[randomInt(list.length)]; doc.text += ` ${text}`; return doc.docId; };
// distance ladder in the 60-doc corpus
{ const f=code(); const d=plantIn(corpora[60],`The vault combination is ${f}.`); add("retrieval","verbatim",1,{corpusSize:60,query:"What is the vault combination?"},{mustContain:f,fromDoc:d}); }
{ const f=code(); const d=plantIn(corpora[60],`Emergency generator fuel is stored in bay ${f}.`); add("retrieval","paraphrase",2,{corpusSize:60,query:"If the power goes out, where do we get fuel for backup electricity?"},{mustContain:f,fromDoc:d}); }
{ const f=code(); const d=plantIn(corpora[60],`The visiting engineer parks in space ${f}.`); add("retrieval","conceptual",3,{corpusSize:60,query:"A contractor is coming tomorrow — where should their car go?"},{mustContain:f,fromDoc:d}); }
{ const f1=code(),f2=code(); const d1=plantIn(corpora[60],`Step one: open panel ${f1}.`); const d2=plantIn(corpora[60],`The panel opened in step one leads to conduit ${f2}.`); add("retrieval","multi-hop",3,{corpusSize:60,query:"Which conduit do you reach through the panel from step one?"},{mustContain:f2,fromDoc:d2},"answer is two docs deep"); }
{ const r=code(),w=code(); const dr=plantIn(corpora[60],`CURRENT this quarter: the loading dock keypad is ${r}.`); plantIn(corpora[60],`OUTDATED, kept for records: the keypad was ${w} before the change.`); add("retrieval","hard-negative",3,{corpusSize:60,query:"What is the loading dock keypad code?"},{mustContain:r,mustNotContain:w,fromDoc:dr}); }
// same needle, three corpus sizes — scaling
for (const size of [60,300,1000]) { const f=code(); const d=plantIn(corpora[size],`The rooftop hatch code is ${f}.`); add("retrieval","corpus-scaling",size,{corpusSize:size,query:"What is the rooftop hatch code?"},{mustContain:f,fromDoc:d},`needle in ${size} docs`); }
// topK sensitivity — is the needle reachable at topK 1 vs 3 vs 10
for (const k of [1,3,10]) { const f=code(); const d=plantIn(corpora[300],`The ${k===1?"north":k===3?"east":"west"} gate code is ${f}.`); add("retrieval","topk",k,{corpusSize:300,topK:k,query:`What is the ${k===1?"north":k===3?"east":"west"} gate code?`},{mustContain:f,fromDoc:d},`topK=${k}`); }
// staleness — indexed, then the source doc changes but the index does not
{ const stale=code(),fresh=code(); const d=plantIn(corpora[60],`The alarm passcode is ${stale}.`); add("retrieval","index-staleness",3,{corpusSize:60,query:"What is the alarm passcode?",updateAfterIndex:{docId:d,replace:stale,with:fresh}},{mustContain:stale,note:"stock index returns the indexed value; freshness is the framework's job to signal"},"characterizes whether stock signals staleness at all"); }
// reranker path vs plain
{ const f=code(); const d=plantIn(corpora[300],`The server room master key is ${f}.`); add("retrieval","reranked",2,{corpusSize:300,useReranker:true,query:"What is the server room master key?"},{mustContain:f,fromDoc:d},"rag reranker path"); }

// ===== TOOLS (MCP): chained, unavailable, mid-chain error, truncation, write-persist ====================
{ const f=code(); add("tools","chained-read",2,{setupFile:{name:"inner/deep/target.txt",content:`The retrieval token is ${f}.`},ask:"Find the file mentioning a retrieval token and tell me the token."},{mustContain:f}); }
add("tools","missing-file",2,{ask:"Read does-not-exist.txt and tell me its third line."},{mustSayUnavailable:true,mustNotInvent:true});
{ const f=code(); add("tools","write-then-read",2,{ask:`Create a file called memo.txt containing exactly "The gate code is ${f}", then read it back and tell me the code.`},{mustContain:f},"two chained mutating+reading calls"); }
{ const f=code(); add("tools","truncation",2,{bigFile:{name:"big.txt",lines:5000,needleLine:4900,needle:`The buried code is ${f}`},ask:"Read big.txt and tell me the buried code near the end."},{mustContain:f},"result truncation: is a late needle reachable"); }
add("tools","unavailable-server",2,{badServer:true,ask:"Use your database tool to look up record 5."},{mustSayUnavailable:true,mustNotInvent:true},"server that never starts");

// ===== MODEL: retention, saturation, structured, long-output ============================================
{ const w=pick(NOUNS); add("model","instruction-retention",2,{config:"window40",instruction:`End every reply with the word "${w}".`,fillerTurns:20,ask:"Summarize our chat in one sentence."},{mustEndWithWord:w},"needs window40 or the instruction ages out — separates retention from window"); }
{ const f=code(); add("model","context-saturation",3,{earlyFact:`Remember: the sole safe code is ${f}.`,fillerChars:40000,ask:"What is the sole safe code?"},{mustContain:f},"one big turn, not many — tests attention over length not window"); }
add("model","structured-validity",1,{ask:"List three colors as a JSON array of strings, nothing else.",trials:10},{mustParseAsJsonArray:true,trials:10});
add("model","long-output-integrity",2,{ask:"Count from 1 to 200, one number per line, nothing else.",expectLast:"200"},{mustContain:"200"},"does long output complete or truncate");

// ===== WORKFLOW/STATE: the full Decision 0076 set ======================================================
add("workflow","resume-no-reexecute",3,{scenario:"suspend, kill, resume fresh process"},{invariant:"step one executes exactly once; resume completes"});
add("workflow","tamper-valid-json",3,{scenario:"edit snapshot keeping valid JSON, then resume"},{invariant:"a store with no integrity check will act on tampered data — this maps whether stock detects it"});
add("workflow","single-use-approval",3,{scenario:"resume the same suspended run twice"},{invariant:"the effect must not execute twice; a reusable resume is the approved-bit-at-rest failure"});
add("workflow","crash-during-effect",3,{scenario:"kill the process while the effect step runs"},{invariant:"on resume the effect is not double-applied, or the framework reports it cannot guarantee that"});

// ===== EVALS: does the scoring surface work at all =====================================================
add("evals","metric-runs",1,{scoreThis:{query:"What is the capital of France?",response:"The capital of France is Paris.",context:"France is a country in Europe. Its capital is Paris."}},{scoreInRange:true},"install check for @mastra/evals: a relevancy metric returns a number in [0,1]");

mkdirSync("probes/corpus2", { recursive: true });
writeFileSync("probes/corpus2/questions.json", JSON.stringify({ schemaVersion:"runalab-probe-corpus/v2", generated:"2026-08-18", note:"Comprehensive sweep of every committed axis across every installed component, plus the memory config matrix. 'Every edge' is asymptotic; this covers the installed surface's committed axes.", cases, retrievalCorpora: docs }, null, 1));
writeFileSync("probes/corpus2/labels.json", JSON.stringify({ schemaVersion:"runalab-probe-labels/v2", generated:"2026-08-18", rule:"LOCKED like v1. Never widened. New findings -> new version.", labels }, null, 1));
console.log(`v2: ${cases.length} cases | memory ${cases.filter(c=>c.probe==='memory').length}, retrieval ${cases.filter(c=>c.probe==='retrieval').length}, tools ${cases.filter(c=>c.probe==='tools').length}, model ${cases.filter(c=>c.probe==='model').length}, workflow ${cases.filter(c=>c.probe==='workflow').length}, evals ${cases.filter(c=>c.probe==='evals').length}`);
