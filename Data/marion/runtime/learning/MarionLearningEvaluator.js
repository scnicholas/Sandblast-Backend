"use strict";

const Policy = require("./MarionLearningPolicy");
const Dataset = require("./MarionLearningDataset");
const VERSION = "marion.learningEvaluator/1.3-exact-run-report";

function validRunReport(run, expectedVersion, expectedScope, caseIds) {
  if (!run || typeof run !== "object" || Array.isArray(run) || run.completed !== true ||
      run.mode !== "offline" || run.version !== expectedVersion || run.scope !== expectedScope ||
      run.caseCount !== caseIds.length || typeof run.score !== "number" ||
      !Number.isFinite(run.score) || run.score < 0 || run.score > 1 ||
      !Array.isArray(run.regressions) || !Array.isArray(run.criticalFailures)) return false;
  const allowed = new Set(caseIds);
  const regressionIds = new Set();
  for (const item of run.regressions) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.caseId !== "string" || !allowed.has(item.caseId) || regressionIds.has(item.caseId) ||
        typeof item.delta !== "number" || !Number.isFinite(item.delta) || item.delta >= 0 || item.delta < -1) return false;
    regressionIds.add(item.caseId);
  }
  const failureIds = new Set();
  for (const item of run.criticalFailures) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.caseId !== "string" || !allowed.has(item.caseId) || failureIds.has(item.caseId)) return false;
    failureIds.add(item.caseId);
  }
  return true;
}

function createEvaluator({ runVersion, auditStore, clock = () => new Date().toISOString() } = {}) {
  if (typeof runVersion !== "function") throw new TypeError("runVersion is required for offline evaluation");
  if (!auditStore || typeof auditStore.append !== "function") throw new TypeError("auditStore.append is required");

  async function evaluate(candidateInput, datasetInput, registrationContext) {
    const candidateResult = require("./MarionLearningCandidate").createCandidate(candidateInput);
    if (!candidateResult.ok) return candidateResult;
    const datasetResult = Dataset.validateEvaluationSet(datasetInput);
    if (!datasetResult.ok) return datasetResult;
    const candidate = candidateResult.candidate;
    const dataset = datasetResult.dataset;
    if (!registrationContext || registrationContext.status !== "approved" ||
        registrationContext.datasetId !== dataset.datasetId || registrationContext.version !== dataset.version ||
        registrationContext.fixtureStore !== dataset.fixtureStore || registrationContext.scope !== candidate.scope ||
        !/^[a-f0-9]{64}$/.test(registrationContext.manifestHash || "") ||
        !/^[a-f0-9]{64}$/.test(registrationContext.fixtureSetHash || "") ||
        !Array.isArray(registrationContext.caseIds) || registrationContext.caseIds.length !== dataset.caseIds.length ||
        registrationContext.caseIds.some((id, i) => id !== dataset.caseIds[i])) {
      return { ok: false, reason: "approved_manifest_registration_required" };
    }
    if (candidate.datasetId !== dataset.datasetId || candidate.datasetVersion !== dataset.version) return { ok: false, reason: "dataset_version_mismatch" };
    if (candidate.sampleCount < Policy.MINIMUM_EVALUATION_SAMPLES || candidate.sampleCount !== dataset.caseIds.length) {
      return { ok: false, reason: "insufficient_or_mismatched_samples", required: Policy.MINIMUM_EVALUATION_SAMPLES };
    }

    // Bind every run to the exact manifest and fixture store that was validated.
    // The runner must pass this context to its loader and verify returned fixtures.
    const evaluationContext = Object.freeze({
      mode: "offline",
      scope: candidate.scope,
      datasetId: dataset.datasetId,
      datasetVersion: dataset.version,
      fixtureStore: dataset.fixtureStore,
      manifestHash: registrationContext.manifestHash,
      fixtureSetHash: registrationContext.fixtureSetHash,
      caseIds: dataset.caseIds
    });
    // Evaluate serially so two versions cannot interleave shared composer caches
    // or mutable runtime dependencies during one comparison.
    const baseline = await runVersion(candidate.baselineVersion, dataset.caseIds, evaluationContext);
    const proposed = await runVersion(candidate.candidateVersion, dataset.caseIds, evaluationContext);
    if (!validRunReport(baseline, candidate.baselineVersion, candidate.scope, dataset.caseIds) ||
        !validRunReport(proposed, candidate.candidateVersion, candidate.scope, dataset.caseIds)) {
      return { ok: false, reason: "offline_runner_report_invalid" };
    }
    const baselineScore = baseline.score;
    const candidateScore = proposed.score;
    const regressions = proposed.regressions;
    const criticalFailures = proposed.criticalFailures;
    const delta = candidateScore - baselineScore;
    const validated = delta >= Policy.MINIMUM_SCORE_LIFT && criticalFailures.length === 0 &&
      regressions.every(item => item.delta >= -Policy.MAXIMUM_REGRESSION);
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

module.exports = { VERSION, createEvaluator, validRunReport };
