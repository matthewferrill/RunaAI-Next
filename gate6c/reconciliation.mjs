import { canonicalJson, sha256 } from "../gate4/canonical.mjs";
import { assertBinding, assertExactDomainPair, bindingDigest, rejectPrivateFields } from "./contracts.mjs";
import { GATE6C_RECONCILIATION_VERSION, GATE6C_REQUIRED_DOMAINS } from "./formats.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });

export function reconcileGate6c({ binding, domains, approvedKnowledge, sourceStillFrozen,
  deferredStoresUntouched, oneDeedOneReceipt }) {
  const accepted = assertBinding(binding);
  const names = Object.keys(domains ?? {}).sort();
  if (canonicalJson(names) !== canonicalJson(GATE6C_REQUIRED_DOMAINS)) {
    throw coded("gate6c-domain-set-invalid", "Reconciliation must contain exactly the selected domains.");
  }
  const exact = Object.fromEntries(names.map(name => [name, assertExactDomainPair(domains[name], name)]));
  const scopeKeys = Object.keys(approvedKnowledge?.sourceScopeCounts ?? {}).sort();
  if (!Number.isInteger(approvedKnowledge?.sourceActive) || approvedKnowledge.sourceActive < 0
      || approvedKnowledge.sourceActive !== approvedKnowledge.targetActive
      || !/^[a-f0-9]{64}$/.test(String(approvedKnowledge.sourceDigest ?? ""))
      || approvedKnowledge.sourceDigest !== approvedKnowledge.targetDigest
      || canonicalJson(scopeKeys) !== canonicalJson(Object.keys(approvedKnowledge?.targetScopeCounts ?? {}).sort())
      || scopeKeys.some(key => !Number.isInteger(approvedKnowledge.sourceScopeCounts[key])
        || approvedKnowledge.sourceScopeCounts[key] < 0
        || approvedKnowledge.sourceScopeCounts[key] !== approvedKnowledge.targetScopeCounts[key])) {
    throw coded("gate6c-approved-knowledge-reconciliation-failed", "Approved knowledge did not reconcile exactly.");
  }
  if (sourceStillFrozen !== true || deferredStoresUntouched !== true || oneDeedOneReceipt !== true) {
    throw coded("gate6c-reconciliation-boundary-failed", "A freeze, deferred-store, or receipt boundary is not green.");
  }
  const base = { schemaVersion: GATE6C_RECONCILIATION_VERSION, bindingDigest: bindingDigest(accepted),
    domains: exact, approvedKnowledge: structuredClone(approvedKnowledge), sourceStillFrozen: true,
    deferredStoresUntouched: true, oneDeedOneReceipt: true, exact: true,
    privateValuesIncluded: false };
  rejectPrivateFields(base);
  return Object.freeze({ ...base, reconciliationDigest: sha256(canonicalJson(base)) });
}
