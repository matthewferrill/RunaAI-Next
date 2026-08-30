import {
  LEASE_POLICY,
  NOMICS,
  sha,
  assert,
  residentList,
  checkResidents,
  checkHardware,
  primaryLoad,
} from './lease-contract.mjs';

export {NOMICS,sha,assert,residentList,checkResidents,checkHardware,primaryLoad};

export const CAMPAIGN_V2_POLICY=Object.freeze({...LEASE_POLICY,
  readyLeaseMs:4200000,
  maximumBatchMs:3600000,
  minimumLaunchRemainingMs:3780000,
  dispatchStopMarginMs:240000,
  publicationMarginMs:180000,
  runnerFinalizationMs:60000,
  completionPublicationMs:120000,
  ownedCleanupMs:120000,
  workerDeadlineMs:4920000,
  independentRecoveryMs:240000,
  supervisorDeadlineMs:5160000,
  taskDeadlineMs:5160000});

// The extended profile is prospective and source-sealed. The original v2
// profile remains valid so retained 60-minute campaign evidence does not
// change meaning after the measured Qwen36 batch overran that ceiling.
export const CAMPAIGN_V2_EXTENDED_POLICY=Object.freeze({...LEASE_POLICY,
  readyLeaseMs:5100000,
  maximumBatchMs:4500000,
  minimumLaunchRemainingMs:4680000,
  dispatchStopMarginMs:240000,
  publicationMarginMs:180000,
  runnerFinalizationMs:60000,
  completionPublicationMs:120000,
  ownedCleanupMs:120000,
  workerDeadlineMs:5820000,
  independentRecoveryMs:240000,
  supervisorDeadlineMs:6060000,
  taskDeadlineMs:6060000});

function validateExactPolicy(policy, expected){
  const keys=Object.keys(expected).sort();
  assert(policy&&Object.keys(policy).sort().join()===keys.join()
    &&keys.every(key=>JSON.stringify(policy[key])===JSON.stringify(expected[key])),'v2-policy');
  assert(policy.maximumBatchMs+policy.publicationMarginMs===policy.minimumLaunchRemainingMs,'v2-launch-arithmetic');
  assert(policy.dispatchStopMarginMs>policy.publicationMarginMs,'v2-dispatch-margin');
  assert(policy.runnerFinalizationMs+policy.completionPublicationMs===policy.publicationMarginMs,'v2-publication-arithmetic');
  assert(policy.preparationMs+policy.readyLeaseMs+policy.ownedCleanupMs===policy.workerDeadlineMs,'v2-worker-arithmetic');
  assert(policy.workerDeadlineMs+policy.independentRecoveryMs===policy.supervisorDeadlineMs
    &&policy.supervisorDeadlineMs===policy.taskDeadlineMs,'v2-supervisor-arithmetic');
  return policy;
}

export const validateCampaignV2Policy=policy=>validateExactPolicy(policy,CAMPAIGN_V2_POLICY);
export const validateCampaignV2ExtendedPolicy=policy=>validateExactPolicy(policy,CAMPAIGN_V2_EXTENDED_POLICY);
export function campaignV2Policy(policy){
  try{return validateCampaignV2Policy(policy);}catch{return validateCampaignV2ExtendedPolicy(policy);}
}

export function campaignV2Profile(policy){
  const value=campaignV2Policy(policy);
  return value.maximumBatchMs===CAMPAIGN_V2_EXTENDED_POLICY.maximumBatchMs?'campaign-v2-extended':'campaign-v2';
}

export function policyForV2Lease(config){
  assert(/^20260829-campaign-(gemma|coder|qwen36)-r[1-9][0-9]*$/.test(config?.leaseId),'v2-profile-id');
  assert(config?.schemaVersion==='runa-m1-campaign-lease/v2'&&['campaign-v2','campaign-v2-extended'].includes(config?.profile),'v2-profile-schema');
  return config.profile==='campaign-v2'?validateCampaignV2Policy(config.policy):validateCampaignV2ExtendedPolicy(config.policy);
}

export function validV2Completion(value,seal,leaseId){
  assert(value&&Object.keys(value).sort().join()==='leaseId,reason,schemaVersion,sealSha256','v2-completion-shape');
  assert(value.schemaVersion==='runa-m1-campaign-completion/v2'&&value.sealSha256===seal&&value.leaseId===leaseId
    &&['completed','abort'].includes(value.reason),'v2-completion-binding');
  return value.reason;
}

export function validV2BatchResult(value,reason){
  assert(value&&value.productionChanged===false&&value.protectedDataRead===false
    &&/^[a-f0-9]{64}$/.test(value.runtimeSealSha256??''),'v2-batch-result');
  if(reason==='completed')assert(value.schemaVersion==='runaai-m1-candidate-batch-result/v2'
    &&value.plannedCandidateAttempts===120&&value.recordedAttempts===120&&Array.isArray(value.attempts)&&value.attempts.length===120
    &&Array.isArray(value.notExecuted)&&value.notExecuted.length===0&&value.stopCode===null,'v2-batch-not-complete');
  else assert(reason==='abort'&&['runaai-m1-candidate-batch-result/v2','runaai-m1-candidate-batch-error/v2'].includes(value.schemaVersion)
    &&value.plannedCandidateAttempts===120,'v2-batch-not-terminal');
  return value;
}

export function campaignV2Windows({readyAt,now=Date.now(),policy=CAMPAIGN_V2_POLICY}){
  campaignV2Policy(policy);
  const ready=typeof readyAt==='number'?readyAt:Date.parse(readyAt),expiresAt=ready+policy.readyLeaseMs;
  assert(Number.isFinite(ready)&&Number.isFinite(now),'v2-time');
  return Object.freeze({readyAt:ready,expiresAt,
    latestLaunchAt:expiresAt-policy.minimumLaunchRemainingMs,
    dispatchStopAt:expiresAt-policy.dispatchStopMarginMs,
    applicationHardStopAt:expiresAt-policy.publicationMarginMs});
}
