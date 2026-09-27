"use strict";

const Policy = require("./MarionLearningPolicy");
const VERSION = "marion.learningCandidate/1.0";

function clean(value, limit = 120) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function createCandidate(input) {
  const src = input && typeof input === "object" ? input : {};
  const scope = clean(src.scope, 40);
  const candidate = {
    proposalId: clean(src.proposalId),
    scope,
    baselineVersion: clean(src.baselineVersion),
    candidateVersion: clean(src.candidateVersion),
    datasetId: clean(src.datasetId),
    datasetVersion: clean(src.datasetVersion),
    artifactRef: clean(src.artifactRef),
    sampleCount: Number(src.sampleCount)
  };
  if (!candidate.proposalId || !Policy.ALLOWED_SCOPES.includes(scope) || !candidate.baselineVersion || !candidate.candidateVersion || !candidate.datasetId || !candidate.datasetVersion || !candidate.artifactRef || !Number.isInteger(candidate.sampleCount)) {
    return { ok: false, reason: Policy.PROTECTED_SCOPES.includes(scope) ? "protected_scope" : "invalid_candidate" };
  }
  if (candidate.baselineVersion === candidate.candidateVersion) return { ok: false, reason: "candidate_must_be_versioned" };
  return { ok: true, candidate: Object.freeze({ ...candidate, state: "pending_evaluation", liveBehaviorChanged: false }) };
}

module.exports = { VERSION, createCandidate };
