import {isDeepStrictEqual} from "node:util";
import {hash,requireValue,validateResponse,validateTelemetry} from "./runtime.mjs";
import {assertLoadEnvelope,digest} from "../evaluation/v2/capture-contract.mjs";
const check=(ok,code)=>requireValue(ok,"evidence-"+code);
const same=(actual,expected,code)=>check(isDeepStrictEqual(actual,expected),code);
const jsonHash=value=>hash(JSON.stringify(value,null,2)+"\n");

// Pure offline verifier; caller supplies the independently retained/sealed package and schedule.
// Evidence is an auditable operator record, not cryptographic hardware attestation.
export function verifyCapture({packageManifest,packageManifestSha256,bundle,events,result,expectedSchedule}){
  check(packageManifest?.schemaVersion==="runa2-qualification-package-manifest/v1","package-schema");
  check(jsonHash(packageManifest)===packageManifestSha256,"package-digest");
  check(bundle?.schemaVersion==="runa2-qualification-package/v1","bundle-schema");
  check(packageManifest.files["qualification/bundle.json"]===jsonHash(bundle),"bundle-digest");
  check(packageManifest.commit===bundle.source.commit && packageManifest.kind===bundle.source.kind,"package-source");
  for(const [file,sha] of Object.entries(bundle.source.files))check(packageManifest.files[file]===sha,"source-file");
  check(Array.isArray(events)&&events.length>0&&Array.isArray(expectedSchedule)&&expectedSchedule.length>0,"empty");
  const rows=type=>events.filter(row=>row.type===type);
  const one=type=>{const found=rows(type);check(found.length===1,"singular-"+type);return found[0];};
  const index=row=>events.indexOf(row);
  const source=one("source"),metadata=one("metadata"),identity=one("identity").identity;
  const candidate=bundle.candidates[result?.candidate];check(candidate,"candidate");
  same(source.source,bundle.source,"source");same(source.manifest,candidate,"artifact");same(source.runtime,bundle.runtime,"runtime");
  same(source.packageVerification,{manifest:packageManifest,sha256:packageManifestSha256},"package-event");
  check(source.phase===bundle.source.kind && result.phase===source.phase,"phase");
  check(Number.isInteger(source.armTimeoutMs)&&source.armTimeoutMs>0&&source.armTimeoutMs<=10800000,"arm-deadline");
  check(events[0]===source,"source-order");
  const verified=one("verified-files");
  same(verified.artifact,{path:candidate.artifactPath,bytes:candidate.artifactBytes,sha256:candidate.artifactSha256},"verified-artifact");
  same(verified.runtime,bundle.runtime.files,"verified-runtime");
  check(index(source)<index(verified)&&index(verified)<index(metadata),"hash-order");
  check(identity.key===candidate.modelKey && identity.size_bytes===candidate.artifactBytes
    &&identity.architecture===candidate.architecture&&identity.quantization?.name===candidate.quantization,"identity");
  check((identity.capabilities?.reasoning?.allowed_options?.includes("off")===true)===candidate.reasoningOff,"reasoning-capability");
  check((identity.loaded_instances??[]).length===0,"preexisting-instance");
  check(metadata.version===3 && metadata.selected?.["general.architecture"]===candidate.architecture,"gguf-identity");
  const template=metadata.selected?.["tokenizer.chat_template"];
  check(typeof template==="string" && hash(template)===candidate.chatTemplateSha256
    && metadata.chatTemplateSha256===candidate.chatTemplateSha256,"gguf-template");
  const load=one("load"),residentRow=one("resident"),resident=residentRow.resident;
  same(load.request,{model:candidate.modelKey,context_length:32768,flash_attention:true,offload_kv_cache_to_gpu:true,echo_load_config:true},"load-request");
  const instance=load.response?.instance_id;check(typeof instance==="string"&&instance.length>0,"instance");
  check(load.response.status==="loaded","load-incomplete");
  assertLoadEnvelope(load.response.load_config,candidate.chatTemplateSha256);
  check(resident.modelKey===candidate.modelKey &&resident.id===instance,"resident-identity");
  for(const key of ["context_length","flash_attention","offload_kv_cache_to_gpu","speculative_draft_mtp","speculative_draft_simple","speculative_draft_model"])
    same(resident.config?.[key],load.response.load_config[key],"resident-envelope");
  const configSha256=digest(resident.config);check(residentRow.configSha256===configSha256,"resident-digest");
  check(index(metadata)<index(one("identity"))&&index(one("identity"))<index(load)&&index(load)<index(residentRow),"load-order");
  const requests=rows("request"),responses=rows("response"),observations=rows("observation");
  check(requests.length===expectedSchedule.length&&responses.length===requests.length&&observations.length===requests.length,"denominator");
  const ids=expectedSchedule.map(item=>item.id);check(new Set(ids).size===ids.length,"schedule-duplicates");
  same([...requests.map(row=>row.id)].sort(),[...ids].sort(),"request-identities");
  const groups=[];
  for(const expected of expectedSchedule){const key=expected.concurrencyGroup??expected.id;
    if(groups.at(-1)?.key!==key){check(!groups.some(group=>group.key===key),"noncontiguous-group");groups.push({key,ids:[]});}
    groups.at(-1).ids.push(expected.id);}
  let priorGroupEnd=index(residentRow);
  for(const group of groups){
    check(group.ids.length<=2,"concurrency-cap");
    const starts=group.ids.map(id=>index(requests.find(row=>row.id===id))),ends=group.ids.map(id=>index(observations.find(row=>row.id===id)));
    check(starts.every(at=>at>priorGroupEnd)&&ends.every(at=>at>=0),"request-group-barrier");
    priorGroupEnd=Math.max(...ends);
  }
  check(new Set(responses.map(row=>row.id)).size===ids.length&&new Set(observations.map(row=>row.id)).size===ids.length,"reply-duplicates");
  for(const expected of expectedSchedule){
    const request=requests.find(row=>row.id===expected.id),response=responses.find(row=>row.id===expected.id),observation=observations.find(row=>row.id===expected.id);
    check(response&&observation,"reply-missing");
    check(request.endpoint===expected.endpoint&&response.endpoint===expected.endpoint&&observation.endpoint===expected.endpoint,"endpoint");
    same(request.request,{...expected.request,model:candidate.modelKey,temperature:0,stream:false,
      ...(candidate.reasoningOff?{reasoning_effort:"none"}:{})},"wire-request");
    check(index(residentRow)<index(request)&&index(request)<index(response)&&index(response)<index(observation),"reply-order");
    const normalized=validateResponse(response.response,candidate.modelKey,instance,bundle.runtime,expected.endpoint);
    same(observation.normalized,normalized,"normalized-reply");
    check(normalized.completionTokens<=expected.request.max_tokens,"response-budget");
    check(Number.isFinite(response.elapsedMs)&&response.elapsedMs>=0&&Number.isFinite(observation.elapsedMs)&&observation.elapsedMs>=response.elapsedMs,"elapsed");
    check(Math.abs(response.elapsedMs-(Date.parse(response.time)-Date.parse(request.time)))<=100
      &&Math.abs(observation.elapsedMs-(Date.parse(observation.time)-Date.parse(request.time)))<=100,"elapsed-clock");
  }
  const cleanup=one("cleanup");
  check(cleanup.ownedInstance===instance&&cleanup.unload?.instance_id===instance&&cleanup.cleanupVerified===true
    &&cleanup.unexpectedInstances===false&&Array.isArray(cleanup.remaining)&&cleanup.remaining.length===0,"cleanup");
  check(observations.every(row=>index(row)<index(cleanup)),"cleanup-order");
  check(!events.some(row=>["failure","request-failure","telemetry-failure","cleanup-failure","ownership-ambiguous"].includes(row.type)),"failure-row");
  const samples=rows("telemetry");check(samples.length>=3,"telemetry-missing");
  for(const sample of samples)validateTelemetry(sample);
  const beforeLoad=samples.find(row=>row.label==="before-load"),afterLoad=samples.find(row=>row.label==="after-load"),afterUnload=samples.find(row=>row.label==="after-unload");
  check(beforeLoad&&afterLoad&&afterUnload&&index(beforeLoad)<index(load)&&index(afterLoad)>index(load)
    &&index(afterUnload)>index(cleanup),"telemetry-phase");
  for(const request of requests){
    const before=samples.find(row=>row.label===request.id),after=samples.find(row=>row.label===request.id+":after");
    check(before&&after&&index(before)<index(request)&&index(after)>index(responses.find(row=>row.id===request.id)),"request-telemetry");
  }
  const start=Date.parse(result.startedAt),end=Date.parse(result.endedAt);
  check(Number.isFinite(start)&&Number.isFinite(end)&&end>=start&&end-start<=source.armTimeoutMs+180000,"duration");
  const sampleTimes=[start,...samples.map(row=>Date.parse(row.time)),end];
  check(sampleTimes.every((time,i)=>i===0||time-sampleTimes[i-1]<=30000),"telemetry-gap");
  let previous=start;
  for(const row of events){const time=Date.parse(row.time);check(Number.isFinite(time)&&time>=previous&&time<=end,"event-time");previous=time;}
  check(result.schemaVersion==="runa2-qualification-capture-result/v1"&&result.passed===true&&result.failure===null
    &&result.observed===expectedSchedule.length&&result.cleanupVerified===true&&result.ownershipAmbiguous===false,"result-status");
  check(result.modelKey===candidate.modelKey&&result.configSha256===configSha256,"result-identity");
  check(result.modelContentExecuted===false&&result.productionRoutingChanged===false&&result.protectedDataIncluded===false,"result-boundary");
  return {passed:true,validForComparison:true,requests:requests.length,candidate:result.candidate,
    packageManifestSha256,configSha256,artifactSha256:candidate.artifactSha256,cleanupVerified:true};
}
