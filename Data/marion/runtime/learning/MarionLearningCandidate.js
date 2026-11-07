"use strict";

const Policy = require("./MarionLearningPolicy");
const VERSION = "marion.learningCandidate/1.1-lossless-exact-identity";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;

// Offline candidate identity is immutable and must not be silently rewritten.
// The evaluator, ApprovalGate and PostgreSQL adapter all use exact IDs.
function ownDataRecord(value) {
  try {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  return Reflect.ownKeys(value).every(key => {
    if (typeof key !== "string" || ["__proto__", "constructor", "prototype"].includes(key)) return false;
    const desc = Object.getOwnPropertyDescriptor(value, key);
    return !!desc && desc.enumerable === true && Object.prototype.hasOwnProperty.call(desc, "value");
  });
  } catch (_) { return false; }
}

function createCandidate(input) {
  if (!ownDataRecord(input)) return { ok: false, reason: "invalid_candidate" };
  const scope = input.scope;
  if (!Policy.ALLOWED_SCOPES.includes(scope)) {
    return { ok: false, reason: Policy.PROTECTED_SCOPES.includes(scope) ? "protected_scope" : "invalid_candidate" };
  }
  const ids = [input.proposalId, input.baselineVersion, input.candidateVersion,
    input.datasetId, input.datasetVersion, input.artifactRef];
  if (!ids.every(value => typeof value === "string" && ID_RE.test(value))) {
    return { ok: false, reason: "invalid_candidate_reference" };
  }
  if (typeof input.sampleCount !== "number" || !Number.isSafeInteger(input.sampleCount) ||
      input.sampleCount < Policy.MINIMUM_EVALUATION_SAMPLES || input.sampleCount > 500) {
    return { ok: false, reason: "invalid_candidate" };
  }
  if (input.baselineVersion === input.candidateVersion)
    return { ok: false, reason: "candidate_must_be_versioned" };
  return { ok: true, candidate: Object.freeze({
    proposalId: input.proposalId, scope, baselineVersion: input.baselineVersion,
    candidateVersion: input.candidateVersion, datasetId: input.datasetId,
    datasetVersion: input.datasetVersion, artifactRef: input.artifactRef,
    sampleCount: input.sampleCount, state: "pending_evaluation", liveBehaviorChanged: false
  }) };
}

module.exports = { VERSION, createCandidate };
