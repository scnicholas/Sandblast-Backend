"use strict";

const Policy = require("./MarionLearningPolicy");
const Dataset = require("./MarionLearningDataset");
const VERSION = "marion.learningEvaluator/1.0";

function createEvaluator({ runVersion, auditStore, clock = () => new Date().toISOString() } = {}) {
  if (typeof runVersion !== "function") throw new TypeError("runVersion is required for offline evaluation");
  if (!auditStore || typeof auditStore.append !== "function") throw new TypeError("auditStore.append is required");

  async function evaluate(candidateInput, datasetInput) {
    const candidateResult = require("./MarionLearningCandidate").createCandidate(candidateInput);
    if (!candidateResult.ok) return candidateResult;
    const datasetResult = Dataset.validateEvaluationSet(datasetInput);
    if (!datasetResult.ok) return datasetResult;
    const candidate = candidateResult.candidate;
    const dataset = datasetResult.dataset;
    if (candidate.datasetId !== dataset.datasetId || candidate.datasetVersion !== dataset.version) return { ok: false, reason: "dataset_version_mismatch" };
    if (candidate.sampleCount < Policy.MINIMUM_EVALUATION_SAMPLES || candidate.sampleCount !== dataset.caseIds.length) {
      return { ok: false, reason: "insufficient_or_mismatched_samples", required: Policy.MINIMUM_EVALUATION_SAMPLES };
    }

    const [baseline, proposed] = await Promise.all([
      runVersion(candidate.baselineVersion, dataset.caseIds, { mode: "offline", scope: candidate.scope }),
      runVersion(candidate.candidateVersion, dataset.caseIds, { mode: "offline", scope: candidate.scope })
    ]);
    const baselineScore = Number(baseline && baseline.score);
    const candidateScore = Number(proposed && proposed.score);
    const regressions = Array.isArray(proposed && proposed.regressions) ? proposed.regressions : [];
    const criticalFailures = Array.isArray(proposed && proposed.criticalFailures) ? proposed.criticalFailures : [];
    const delta = candidateScore - baselineScore;
    const validated = baseline && proposed && baseline.completed === true && proposed.completed === true &&
      Number.isFinite(baselineScore) && Number.isFinite(candidateScore) &&
      delta >= Policy.MINIMUM_SCORE_LIFT && criticalFailures.length === 0 &&
      regressions.every(item => Number(item.delta) >= -Policy.MAXIMUM_REGRESSION);
    const report = Object.freeze({
      proposalId: candidate.proposalId, scope: candidate.scope,
      baselineVersion: candidate.baselineVersion, candidateVersion: candidate.candidateVersion,
      datasetId: dataset.datasetId, datasetVersion: dataset.version,
      sampleCount: candidate.sampleCount, baselineScore, candidateScore, delta,
      regressionCount: regressions.length, criticalFailureCount: criticalFailures.length,
      validated, state: validated ? "awaiting_owner_approval" : "rejected_by_validation",
      liveBehaviorChanged: false, evaluatedAt: clock()
    });
    await auditStore.append({ type: "learning_evaluation", ...report });
    return { ok: true, report };
  }
  return Object.freeze({ VERSION, evaluate });
}

module.exports = { VERSION, createEvaluator };
