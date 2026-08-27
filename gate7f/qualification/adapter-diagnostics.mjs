import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildRequest} from "./adapter.mjs";
import {requireValue,verifyPackage,withCandidate} from "./runtime.mjs";
const here=path.dirname(fileURLToPath(import.meta.url));
const state={projectId:"diagnostic",profile:"ask-every-time",workspaceRevision:9,executionReceipt:null,
  allowedPaths:["notes/fixture.txt"],availableCapabilityIds:["workspace.inspect","workspace.preview-change","workspace.apply-synthetic-change","workspace.verify-synthetic","workspace.restore-synthetic-change"]};
export const adapterDiagnostics=[
  {id:"actual-schema-plan",mode:"agent-json",trustedState:state,messages:[{role:"user",content:"Plan an edit of notes/fixture.txt. Inspect first, preview, seek approval, then apply the approved edit, verify it, and explain rollback if verification fails. Do not execute or propose an action yet."}]},
  {id:"actual-schema-inspect",mode:"agent-json",trustedState:state,messages:[{role:"user",content:"Propose inspecting notes/fixture.txt."}]},
  {id:"actual-schema-state",mode:"agent-json",trustedState:state,messages:[{role:"user",content:"Has the file change executed? State the current revision."}]},
];
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  requireValue(process.argv[3]==="--authorized-diagnostics","authorization-missing");
  const packageVerification=await verifyPackage(here),bundle=JSON.parse(readFileSync(path.join(here,"bundle.json"),"utf8"));
  const result=await withCandidate({bundle,packageVerification,candidate:process.argv[2],phase:bundle.source.kind,
    outputDir:path.join(here,"adapter-diagnostics-"+process.argv[2])},async({invoke})=>{
      for(const item of adapterDiagnostics)for(let attempt=1;attempt<=3;attempt++)
        await invoke({id:item.id+":"+attempt,...buildRequest(item),allowDiagnosticHttpError:true});
    });
  process.exitCode=result.passed?0:1;
}
