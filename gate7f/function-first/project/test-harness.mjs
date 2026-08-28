import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { CodeExecutionReceiptSchema } from "../../../gate7e/contracts.mjs";
import { digest, failure, normalizeFiles, stableJson } from "./contracts.mjs";

const suiteId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const jsonValue = z.lazy(() => z.union([z.null(), z.boolean(), z.number().finite(), z.string(),
  z.array(jsonValue), z.record(z.string(), jsonValue)]));
const SuiteSchema = z.object({ suiteId,
  cases: z.array(z.object({ testId: suiteId, exportName: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/),
    args: z.array(jsonValue).max(8), expected: jsonValue }).strict()).min(1).max(16),
}).strict();
export function normalizeSuite(value) {
  const suite = SuiteSchema.parse(value);
  if (new Set(suite.cases.map(test => test.testId)).size !== suite.cases.length
    || Buffer.byteLength(stableJson(suite)) > 6_000) throw failure("project-test-suite-invalid");
  return suite;
}

export function buildTestBundle(files, suiteInput) {
  const suite = normalizeSuite(suiteInput);
  const nonce = randomBytes(24).toString("hex");
  const sources = normalizeFiles(files).map(file => file.content);
  // Only inputs enter the sandbox. The expected outputs stay in the trusted host comparator.
  const cases = suite.cases.map(test => ({ exportName: test.exportName, args: test.args }));
  const source = `(()=>{"use strict";
const emit=console.log,encode=JSON.stringify,compile=Function,apply=Reflect.apply,descriptor=Object.getOwnPropertyDescriptor;
const keys=Object.keys,isArray=Array.isArray,finite=Number.isFinite,proto=Object.getPrototypeOf,plain=Object.prototype,arrayProto=Array.prototype;
const exports=Object.create(null),cases=${JSON.stringify(cases)},sources=${JSON.stringify(sources)};
function serial(value,depth){
 if(depth>8)throw 0;
 if(value===null||typeof value==="string"||typeof value==="boolean")return encode(value);
 if(typeof value==="number"){if(!finite(value))throw 0;return encode(value);}
 if(typeof value!=="object")throw 0;
 const arr=isArray(value),p=proto(value);if(arr?p!==arrayProto:(p!==plain&&p!==null))throw 0;
 const names=keys(value);if(names.length>64)throw 0;
 let out=arr?"[":"{";
 if(arr&&names.length!==value.length)throw 0;
 for(let j=0;j<names.length;j++){
  const key=arr?""+j:names[j],d=descriptor(value,key);if(!d||!("value" in d))throw 0;
  if(j)out+=",";if(!arr)out+=encode(key)+":";out+=serial(d.value,depth+1);
 }
 return out+(arr?"]":"}");
}
let loadError=false;
try {for(let i=0;i<sources.length;i++) compile("exports",'"use strict";\\n'+sources[i])(exports);}catch(_){loadError=true;}
let body="[";
for(let i=0;i<cases.length;i++){
 let value="null",error="null";
 try{
  if(loadError)throw 0;
  const entry=descriptor(exports,cases[i].exportName);
  if(!entry||typeof entry.value!=="function")throw 0;
  value=serial(apply(entry.value,undefined,cases[i].args),0);
  if(typeof value!=="string")throw 0;
 }catch(_){value="null";error='"project-test-evaluation-failed"';}
 if(i)body+=",";body+='{"actual":'+value+',"errorCode":'+error+'}';
}
emit(${JSON.stringify(`RUNA2_PROJECT_TEST:${nonce}:`)}+body+"]");
})();`;
  if (Buffer.byteLength(source) > 8_000) throw failure("project-test-bundle-budget-exceeded");
  return { source, nonce, sourceSha256: digest(source), suite, suiteSha256: digest(stableJson(suite)) };
}

export function compareTestReceipt(rawReceipt, request, bundle) {
  const receipt = CodeExecutionReceiptSchema.parse(rawReceipt);
  if (receipt.requestId !== request.requestId || receipt.participantId !== request.participant.principalId
    || receipt.projectId !== request.project.projectId || receipt.threadId !== request.thread.threadId
    || receipt.sourceSha256 !== digest(request.source) || receipt.limits.sourceBytes !== Buffer.byteLength(request.source)) {
    throw failure("project-execution-receipt-mismatch");
  }
  const common = { suiteId: bundle.suite.suiteId, suiteSha256: bundle.suiteSha256, executionReceipt: receipt };
  if (receipt.status !== "executed") return { ...common, status: receipt.status === "unavailable" ? "unavailable" : "failed", passed: false, checks: [] };
  const prefix = `RUNA2_PROJECT_TEST:${bundle.nonce}:`;
  const matching = receipt.output.stdout.split(/\r?\n/).filter(line => line.startsWith(prefix));
  let actual;
  try { actual = JSON.parse(matching.length === 1 ? matching[0].slice(prefix.length) : ""); }
  catch { throw failure("project-test-result-invalid"); }
  if (!Array.isArray(actual) || actual.length !== bundle.suite.cases.length) throw failure("project-test-result-invalid");
  const checks = bundle.suite.cases.map((test, index) => {
    const item = z.object({ actual: jsonValue, errorCode: z.enum(["project-test-evaluation-failed"]).nullable() }).strict().parse(actual[index]);
    return { testId: test.testId, expected: test.expected, actual: item.actual, errorCode: item.errorCode,
      passed: item.errorCode === null && isDeepStrictEqual(item.actual, test.expected) };
  });
  const passed = checks.every(check => check.passed);
  return { ...common, status: passed ? "passed" : "failed", passed, checks };
}
