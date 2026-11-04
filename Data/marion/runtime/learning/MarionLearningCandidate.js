"use strict";

const Policy = require("./MarionLearningPolicy");
const VERSION = "marion.learningCandidate/1.1-strict-offline-contract";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const CANDIDATE_KEYS = Object.freeze([
  "proposalId", "scope", "baselineVersion", "candidateVersion",
  "datasetId", "datasetVersion", "artifactRef", "sampleCount"
]);
const MAXIMUM_SAMPLES = 500;

function isDataRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every(key =>
    typeof key === "string" && descriptors[key].enumerable === true &&
    Object.prototype.hasOwnProperty.call(descriptors[key], "value"));
}

function validId(value) {
  // No normalization: trimming or slicing an identifier changes its identity.
  return typeof value === "string" && ID_RE.test(value);
}

function createCandidate(input) {
  try {
    if (!isDataRecord(input)) return { ok: false, reason: "invalid_candidate" };
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Object.keys(descriptors);
    if (keys.length !== CANDIDATE_KEYS.length || keys.some(key => !CANDIDATE_KEYS.includes(key))) {
      return { ok: false, reason: "invalid_candidate" };
    }
    const src = Object.create(null);
    for (const key of CANDIDATE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(descriptors, key)) return { ok: false, reason: "invalid_candidate" };
      src[key] = descriptors[key].value;
    }
    const scope = src.scope;
    if (typeof scope !== "string" || !Array.isArray(Policy.ALLOWED_SCOPES) ||
        !Policy.ALLOWED_SCOPES.includes(scope) ||
        (Array.isArray(Policy.PROTECTED_SCOPES) && Policy.PROTECTED_SCOPES.includes(scope))) {
      return { ok: false, reason: Array.isArray(Policy.PROTECTED_SCOPES) &&
        Policy.PROTECTED_SCOPES.includes(scope) ? "protected_scope" : "invalid_candidate" };
    }
    for (const key of ["proposalId", "baselineVersion", "candidateVersion", "datasetId", "datasetVersion", "artifactRef"]) {
      if (!validId(src[key])) return { ok: false, reason: "invalid_candidate_reference" };
    }
    const minimum = Policy.MINIMUM_EVALUATION_SAMPLES;
    if (!Number.isSafeInteger(minimum) || minimum < 1 || minimum > MAXIMUM_SAMPLES ||
        !Number.isSafeInteger(src.sampleCount) || src.sampleCount < minimum ||
        src.sampleCount > MAXIMUM_SAMPLES) return { ok: false, reason: "invalid_candidate" };
    if (src.baselineVersion === src.candidateVersion) {
      return { ok: false, reason: "candidate_must_be_versioned" };
    }
    return {
      ok: true,
      candidate: Object.freeze({
        proposalId: src.proposalId, scope, baselineVersion: src.baselineVersion,
        candidateVersion: src.candidateVersion, datasetId: src.datasetId,
        datasetVersion: src.datasetVersion, artifactRef: src.artifactRef,
        sampleCount: src.sampleCount, state: "pending_evaluation", liveBehaviorChanged: false
      })
    };
  } catch (_) {
    // Malformed proxy objects and reflective traps must not fail open.
    return { ok: false, reason: "invalid_candidate" };
  }
}

module.exports = { VERSION, createCandidate };
