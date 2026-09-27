"use strict";

const VERSION = "marion.learningDataset/1.0";

function clean(value, limit = 120) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function validateEvaluationSet(input) {
  const src = input && typeof input === "object" ? input : {};
  const datasetId = clean(src.datasetId);
  const cases = Array.isArray(src.cases) ? src.cases : [];
  if (!datasetId || cases.length < 1) return { ok: false, reason: "invalid_evaluation_set" };
  const ids = [];
  for (const item of cases) {
    const caseId = clean(item && item.caseId);
    if (!caseId || (item && ("prompt" in item || "transcript" in item || "rawAudio" in item))) {
      return { ok: false, reason: "case_must_use_external_fixture_reference" };
    }
    ids.push(caseId);
  }
  if (new Set(ids).size !== ids.length) return { ok: false, reason: "duplicate_case_id" };
  return { ok: true, dataset: Object.freeze({ datasetId, caseIds: Object.freeze(ids), version: clean(src.version), fixtureStore: clean(src.fixtureStore) }) };
}

module.exports = { VERSION, validateEvaluationSet };
