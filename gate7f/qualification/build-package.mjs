import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, constants } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifySeal } from "../evaluation/v2/seal.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const kind=process.argv[2]??"diagnostics-v1";
if(!/^[a-z0-9-]+$/.test(kind))throw Error("invalid package name");
const target=path.join(root,"artifacts/runs/gate7f1/qualification-"+kind);
if(existsSync(target))throw Error("package already exists");
verifySeal();
const previous=JSON.parse(readFileSync(path.join(root,"artifacts/runs/gate7f1/home-capture-20260827-v2/bundle.json"),"utf8"));
const files=["qualification/runtime.mjs","qualification/diagnostics.mjs",
  "evaluation/v2/capture-contract.mjs","evaluation/v2/capture-policy.mjs","evaluation/v2/gguf-metadata.mjs"];
if(kind.startsWith("adapter-"))files.push("qualification/adapter.mjs","qualification/adapter-diagnostics.mjs");
let inputs,acceptanceSeal,policies;
if(["acceptance-v1","acceptance-power-v2"].includes(kind)){
  const {verifyAcceptanceSeal}=await import("./acceptance/seal.mjs");
  acceptanceSeal=verifyAcceptanceSeal(root);if(!acceptanceSeal.passed)throw Error("acceptance-seal-invalid");
  const {loadAcceptanceCorpus}=await import("./acceptance/corpus.mjs");
  const {renderAcceptanceInputs,countInferenceRequests}=await import("./acceptance/inputs.mjs");
  const corpus=loadAcceptanceCorpus();if(countInferenceRequests(corpus)!==117)throw Error("acceptance-count-invalid");
  inputs=renderAcceptanceInputs(corpus);
  const {ADAPTER_POLICY}=await import("./adapter.mjs"),{SOAK_POLICY}=await import("./runner.mjs");
  policies={adapter:ADAPTER_POLICY,soak:SOAK_POLICY,armTimeoutMs:7200000,telemetryIntervalMs:5000,maximumTelemetryGapMs:30000};
  if(kind==="acceptance-power-v2")policies.hardware={gpuPowerLimitWatts:160,maximumStartTemperatureC:50,
    gpuUuids:["GPU-15ea3e34-292b-3333-5e43-e5b133f9a30c","GPU-1f2f6459-b688-3466-5b49-a65c538be843"],
    originalPowerLimitWatts:260,temperatureCutoffC:85};
  files.push("qualification/adapter.mjs","qualification/runner.mjs","qualification/model-integration.mjs","qualification/authority.mjs",
    "contracts.mjs","core.mjs","policy.mjs","registry.mjs","adapters/memory.mjs","adapters/synthetic-executor.mjs","evaluation/contracts.mjs");
  const zod=JSON.parse(readFileSync(path.join(root,"node_modules/zod/package.json"),"utf8"));
  if(zod.version!=="4.4.3")throw Error("dependency-drift");
  const walk=relative=>{for(const entry of readdirSync(path.join(root,relative),{withFileTypes:true})){
    if(entry.isSymbolicLink())throw Error("dependency-link-denied");
    const child=relative+"/"+entry.name;if(entry.isDirectory())walk(child);else if(entry.isFile())files.push(child);
  }};walk("node_modules/zod");
}
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const sourcePath=file=>path.join(root,file.startsWith("node_modules/")?"":"gate7f",file);
const sourceHashes=Object.fromEntries(files.map(file=>[file,sha(readFileSync(sourcePath(file)))]));
const commit=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8",windowsHide:true}).trim();
const bundle={schemaVersion:"runa2-qualification-package/v1",source:{commit,kind,files:sourceHashes},
  runtime:previous.runtime,candidates:previous.candidates};
if(inputs)Object.assign(bundle,{inputs,acceptanceSeal,policies});
Object.assign(bundle.candidates.incumbent,{modelKey:"qwen3-coder-30b-a3b-instruct",reasoningOff:false,
  chatTemplateSha256:"672e747c77e990320152343b0a4951222e40de5645297905d89afba05586d827"});
Object.assign(bundle.candidates.gemma26,{modelKey:"gemma-4-26b-a4b-it-qat",reasoningOff:true,
  chatTemplateSha256:"ae53464bf3be25802b3a5b37def7fd89667067d7577049b3b2d74c4d8de4c6d4"});
mkdirSync(target,{recursive:true});
for(const file of files){const to=path.join(target,file);mkdirSync(path.dirname(to),{recursive:true});
  copyFileSync(sourcePath(file),to,constants.COPYFILE_EXCL);}
const body=JSON.stringify(bundle,null,2)+"\n";
writeFileSync(path.join(target,"qualification/bundle.json"),body,{flag:"wx"});
const manifest={schemaVersion:"runa2-qualification-package-manifest/v1",commit,kind,
  files:{...sourceHashes,"qualification/bundle.json":sha(body)}};
writeFileSync(path.join(target,"package-manifest.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({target,manifestSha256:sha(readFileSync(path.join(target,"package-manifest.json"))),fileCount:Object.keys(manifest.files).length,commit}));
