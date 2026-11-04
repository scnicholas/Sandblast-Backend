"use strict";

const Policy = require("./MarionLearningPolicy");
const VERSION = "marion.learningDataset/1.3-strict-reference-only-manifest";
const MINIMUM_CASES = Policy.MINIMUM_EVALUATION_SAMPLES;
const MAXIMUM_CASES = 500;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const DATASET_KEYS = new Set(["datasetId", "version", "fixtureStore", "cases"]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every(key => {
    const descriptor = descriptors[key];
    return typeof key === "string" && descriptor.enumerable === true &&
      Object.prototype.hasOwnProperty.call(descriptor, "value");
  });
}

function isDenseDataArray(value) {
  if (!Array.isArray(value) || value.length > MAXIMUM_CASES) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) return false;
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || descriptor.enumerable !== true ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) return false;
  }
  return true;
}

function validId(value) {
  return typeof value === "string" && ID_RE.test(value);
}

function validateEvaluationSet(input) {
  try {
    if (!isPlainObject(input)) return { ok: false, reason: "invalid_evaluation_set" };
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Object.keys(descriptors);
    if (keys.length !== DATASET_KEYS.size || keys.some(key => !DATASET_KEYS.has(key))) {
      return { ok: false, reason: "dataset_must_contain_only_manifest_fields" };
    }
    const datasetId = descriptors.datasetId.value;
    const version = descriptors.version.value;
    const fixtureStore = descriptors.fixtureStore.value;
    const cases = descriptors.cases.value;
    if (!validId(datasetId) || !validId(version) || !validId(fixtureStore) || !Array.isArray(cases)) {
      return { ok: false, reason: "invalid_evaluation_manifest" };
    }
    if (cases.length > MAXIMUM_CASES) return { ok: false, reason: "too_many_evaluation_cases", maximum: MAXIMUM_CASES };
    if (!isDenseDataArray(cases)) return { ok: false, reason: "invalid_evaluation_manifest" };
    if (!Number.isSafeInteger(MINIMUM_CASES) || MINIMUM_CASES < 1 || MINIMUM_CASES > MAXIMUM_CASES) {
      return { ok: false, reason: "invalid_evaluation_manifest" };
    }
    if (cases.length < MINIMUM_CASES) return { ok: false, reason: "insufficient_evaluation_cases", required: MINIMUM_CASES };
    const ids = [];
    const seen = new Set();
    for (let index = 0; index < cases.length; index++) {
      const caseValue = Object.getOwnPropertyDescriptor(cases, String(index)).value;
      if (!isPlainObject(caseValue)) return { ok: false, reason: "case_must_use_external_fixture_reference" };
      const caseDescriptors = Object.getOwnPropertyDescriptors(caseValue);
      if (Object.keys(caseDescriptors).length !== 1 ||
          !Object.prototype.hasOwnProperty.call(caseDescriptors, "caseId") ||
          !validId(caseDescriptors.caseId.value)) {
        return { ok: false, reason: "case_must_use_external_fixture_reference" };
      }
      const caseId = caseDescriptors.caseId.value;
      if (seen.has(caseId)) return { ok: false, reason: "duplicate_case_id" };
      seen.add(caseId);
      ids.push(caseId);
    }
    return {
      ok: true,
      dataset: Object.freeze({ datasetId, version, fixtureStore, caseIds: Object.freeze(ids) })
    };
  } catch (_) {
    return { ok: false, reason: "invalid_evaluation_manifest" };
  }
}

module.exports = { VERSION, MINIMUM_CASES, MAXIMUM_CASES, validateEvaluationSet };
