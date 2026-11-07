"use strict";

const Policy = require("./MarionLearningPolicy");

const VERSION = "marion.learningDataset/1.2-safe-json-manifest";
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
  if (!Array.isArray(value)) return false;
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
  return typeof value === "string" && value === value.trim() && ID_RE.test(value);
}

function validateEvaluationSet(input) {
  if (!isPlainObject(input)) return { ok: false, reason: "invalid_evaluation_set" };
  const src = input;
  if (Object.keys(src).some(key => !DATASET_KEYS.has(key))) {
    return { ok: false, reason: "dataset_must_contain_only_manifest_fields" };
  }
  const { datasetId, version, fixtureStore, cases } = src;
  if (!validId(datasetId) || !validId(version) || !validId(fixtureStore) || !isDenseDataArray(cases)) {
    return { ok: false, reason: "invalid_evaluation_manifest" };
  }
  if (cases.length > MAXIMUM_CASES) {
    return { ok: false, reason: "too_many_evaluation_cases", maximum: MAXIMUM_CASES };
  }

  const ids = [];
  for (const item of cases) {
    if (!isPlainObject(item)) return { ok: false, reason: "case_must_use_external_fixture_reference" };
    const keys = Object.keys(item);
    // Each case is only a reference. Prompts, transcripts, expected answers,
    // audio, labels, and other payload must live in the approved fixture store.
    if (keys.length !== 1 || keys[0] !== "caseId" || !validId(item.caseId)) {
      return { ok: false, reason: "case_must_use_external_fixture_reference" };
    }
    ids.push(item.caseId);
  }
  if (new Set(ids).size !== ids.length) return { ok: false, reason: "duplicate_case_id" };
  if (cases.length < MINIMUM_CASES) {
    return { ok: false, reason: "insufficient_evaluation_cases", required: MINIMUM_CASES };
  }

  return {
    ok: true,
    dataset: Object.freeze({
      datasetId,
      version,
      fixtureStore,
      caseIds: Object.freeze(ids)
    })
  };
}

module.exports = { VERSION, MINIMUM_CASES, MAXIMUM_CASES, validateEvaluationSet };
