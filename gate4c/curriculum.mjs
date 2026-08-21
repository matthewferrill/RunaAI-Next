import { GATE4C_CURRICULUM_CATALOG_VERSION } from "./formats.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
export function validateCurriculumCatalog(raw) {
  if (!raw || raw.schemaVersion !== GATE4C_CURRICULUM_CATALOG_VERSION || typeof raw.catalogId !== "string" || !Array.isArray(raw.lessons)) throw coded("curriculum-catalog-invalid", "The curriculum catalog is invalid.");
  const ids = new Set(); const lessons = raw.lessons.map(item => { const sources = item?.sources ?? []; if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.text !== "string" || !item.text.trim() || !["global", "personal", "project", "capability"].includes(item.scope) || (item.scope !== "global" && (typeof item.scopeId !== "string" || !item.scopeId.trim())) || !Array.isArray(sources) || sources.some(value => typeof value !== "string" || !value.trim())) throw coded("curriculum-catalog-invalid", "A curriculum candidate template is invalid."); ids.add(item.id); return Object.freeze({ id: item.id, text: item.text.trim(), scope: item.scope, scopeId: item.scopeId ?? null, sources: Object.freeze([...sources]) }); });
  return Object.freeze({ schemaVersion: GATE4C_CURRICULUM_CATALOG_VERSION, catalogId: raw.catalogId,
    lessons: Object.freeze(lessons), candidateTemplatesOnly: true, imported: false, approved: false,
    activated: false, modelUseChanged: false, mutationInterfaceAvailable: false });
}
