import {isDeepStrictEqual} from "node:util";
import {hash,requireValue,validateResponse} from "./runtime.mjs";
import {assertLoadEnvelope,assertTelemetry,digest} from "../evaluation/v2/capture-contract.mjs";
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
  assertLoadEnvelope(load.response.load_config,candidate.chatTemplateSha256);
  check(resident.modelKey===candidate.modelKey &&resident.id===instance,"resident-identity");
  for(const key of ["context_length","flash_attention","offload_kv_cache_to_gpu","speculative_draft_mtp","speculative_draft_simple","speculative_draft_model"])
    same(resident.config?.[key],load.response.load_config[key],"resident-envelope");
  const configSha256=digest(resident.config);check(residentRow.configSha256===configSha256,"resident-digest");
  check(index(metadata)<index(load)&&index(load)<index(residentRow),"load-order");
  const requests=rows("request"),responses=rows("response"),observations=rows("observation");
  check(requests.length===expectedSchedule.length&&responses.length===requests.length&&observations.length===requests.length,"denominator");
  const ids=expectedSchedule.map(item=>item.id);check(new Set(ids).size===ids.length,"schedule-duplicates");
  same(requests.map(row=>row.id),ids,"request-sequence");
  check(new Set(responses.map(row=>row.id)).size===ids.length&&new Set(observations.map(row=>row.id)).size===ids.length,"reply-duplicates");
  for(const [i,expected] of expectedSchedule.entries()){
    const request=requests[i],response=responses.find(row=>row.id===expected.id),observation=observations.find(row=>row.id===expected.id);
    check(response&&observation,"reply-missing");
    check(request.endpoint===expected.endpoint&&response.endpoint===expected.endpoint&&observation.endpoint===expected.endpoint,"endpoint");
    same(request.request,{...expected.request,model:candidate.modelKey,temperature:0,stream:false,
      ...(candidate.reasoningOff?{reasoning_effort:"none"}:{})},"wire-request");
    check(index(residentRow)<index(request)&&index(request)<index(response)&&index(response)<index(observation),"reply-order");
    const normalized=validateResponse(response.response,candidate.modelKey,instance,bundle.runtime,expected.endpoint);
    same(observation.normalized,normalized,"normalized-reply");
    check(Number.isFinite(response.elapsedMs)&&response.elapsedMs>=0&&Number.isFinite(observation.elapsedMs)&&observation.elapsedMs>=response.elapsedMs,"elapsed");
  }
  const cleanup=one("cleanup");
  check(cleanup.ownedInstance===instance&&cleanup.unload?.instance_id===instance&&cleanup.cleanupVerified===true
    &&cleanup.unexpectedInstances===false&&Array.isArray(cleanup.remaining)&&cleanup.remaining.length===0,"cleanup");
  check(observations.every(row=>index(row)<index(cleanup)),"cleanup-order");
  check(!events.some(row=>["failure","request-failure","telemetry-failure","cleanup-failure","ownership-ambiguous"].includes(row.type)),"failure-row");
  const samples=rows("telemetry");check(samples.length>=3,"telemetry-missing");
  for(const sample of samples)assertTelemetry(sample);
  for(const label of ["before-load","after-load","after-unload"])check(samples.some(row=>row.label===label),"telemetry-phase");
  const start=Date.parse(result.startedAt),end=Date.parse(result.endedAt);
  check(Number.isFinite(start)&&Number.isFinite(end)&&end>=start&&end-start<=source.armTimeoutMs+180000,"duration");
  let previous=start;
  for(const row of events){const time=Date.parse(row.time);check(Number.isFinite(time)&&time>=previous&&time<=end,"event-time");previous=time;}
  check(result.schemaVersion==="runa2-qualification-capture-result/v1"&&result.passed===true&&result.failure===null
    &&result.observed===expectedSchedule.length&&result.cleanupVerified===true&&result.ownershipAmbiguous===false,"result-status");
  check(result.modelKey===candidate.modelKey&&result.configSha256===configSha256,"result-identity");
  check(result.modelContentExecuted===false&&result.productionRoutingChanged===false&&result.protectedDataIncluded===false,"result-boundary");
  return {passed:true,validForComparison:true,requests:requests.length,candidate:result.candidate,
    packageManifestSha256,configSha256,artifactSha256:candidate.artifactSha256,cleanupVerified:true};
}
