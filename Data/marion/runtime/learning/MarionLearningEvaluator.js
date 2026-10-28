"use strict";

const Policy = require("./MarionLearningPolicy");
const Dataset = require("./MarionLearningDataset");
const VERSION = "marion.learningEvaluator/1.4-sanitized-failure-diagnostics";
const DIAGNOSTICS_VERSION = "marion.learningDiagnostics/1.0";
const MAX_DIAGNOSTIC_CASES = 100;
const MAX_DIAGNOSTIC_CHECKS_PER_CASE = 32;
const SAFE_DIAGNOSTIC_CHECK_TYPES = new Set([
  "sentence_count_max", "sentence_words_max", "max_words", "contains_all",
  "contains_any", "phrase_absent", "phrase_present_any", "heading_present",
  "bullet_count_exact", "question_count_exact", "definition_of_term",
  "uncertainty_present", "correction_present", "exact_match"
]);

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function dataObject(value) {
  if (!plainObject(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every(key => typeof key === "string" &&
    descriptors[key].enumerable === true && Object.prototype.hasOwnProperty.call(descriptors[key], "value"));
}

function hasExactKeys(value, expected) {
  if (!dataObject(value)) return false;
  const keys = Reflect.ownKeys(Object.getOwnPropertyDescriptors(value));
  return keys.length === expected.length && keys.every(key => typeof key === "string" && expected.includes(key));
}

function validCountMap(value, maximum) {
  if (!dataObject(value)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  let total = 0;
  for (const key of Object.keys(value)) {
    const count = descriptors[key].value;
    if (!SAFE_DIAGNOSTIC_CHECK_TYPES.has(key) || !Number.isSafeInteger(count) || count < 0 || count > maximum) return null;
    total += count;
  }
  return total <= maximum ? total : null;
}

function validDiagnostics(diagnostics, caseIds, criticalFailures) {
  if (!dataObject(diagnostics) || diagnostics.version !== DIAGNOSTICS_VERSION || diagnostics.complete !== true) return false;
  const maxCheckCount = caseIds.length * 10000;
  const failedCaseCount = diagnostics.failedCaseCount;
  const criticalFailureCaseCount = diagnostics.criticalFailureCaseCount;
  const failedCheckCount = diagnostics.failedCheckCount;
  const criticalCheckCount = diagnostics.criticalCheckCount;
  const omittedCaseCount = diagnostics.omittedCaseCount;
  if (!Number.isSafeInteger(failedCaseCount) || failedCaseCount < 0 || failedCaseCount > caseIds.length ||
      !Number.isSafeInteger(criticalFailureCaseCount) || criticalFailureCaseCount !== criticalFailures.length ||
      criticalFailureCaseCount > failedCaseCount || !Number.isSafeInteger(failedCheckCount) ||
      failedCheckCount < 0 || failedCheckCount > maxCheckCount || !Number.isSafeInteger(criticalCheckCount) ||
      criticalCheckCount < criticalFailureCaseCount || criticalCheckCount > failedCheckCount ||
      !Number.isSafeInteger(omittedCaseCount) || omittedCaseCount < 0 || omittedCaseCount > failedCaseCount ||
      !Array.isArray(diagnostics.failedCases) || diagnostics.failedCases.length > MAX_DIAGNOSTIC_CASES ||
      diagnostics.failedCases.length + omittedCaseCount !== failedCaseCount) return false;

  const totalByType = validCountMap(diagnostics.failedCheckCounts, maxCheckCount);
  const criticalByType = validCountMap(diagnostics.criticalCheckCounts, maxCheckCount);
  if (totalByType === null || criticalByType === null || totalByType !== failedCheckCount ||
      criticalByType !== criticalCheckCount) return false;
  for (const type of SAFE_DIAGNOSTIC_CHECK_TYPES) {
    const total = diagnostics.failedCheckCounts[type] || 0;
    const critical = diagnostics.criticalCheckCounts[type] || 0;
    if (critical > total) return false;
  }

  const allowed = new Set(caseIds);
  const criticalFailureIds = new Set(criticalFailures.map(item => item.caseId));
  const seenCases = new Set();
  for (const item of diagnostics.failedCases) {
    if (!hasExactKeys(item, ["caseId", "failedCheckCount", "criticalFailure", "failedChecks", "omittedCheckCount"]) ||
        typeof item.caseId !== "string" || !allowed.has(item.caseId) || seenCases.has(item.caseId) ||
        !Number.isSafeInteger(item.failedCheckCount) || item.failedCheckCount < 1 || item.failedCheckCount > 10000 ||
        typeof item.criticalFailure !== "boolean" || item.criticalFailure !== criticalFailureIds.has(item.caseId) ||
        !Array.isArray(item.failedChecks) || item.failedChecks.length < 1 ||
        item.failedChecks.length > MAX_DIAGNOSTIC_CHECKS_PER_CASE || !Number.isSafeInteger(item.omittedCheckCount) ||
        item.omittedCheckCount < 0 || item.failedChecks.length + item.omittedCheckCount !== item.failedCheckCount) return false;
    seenCases.add(item.caseId);
    const seenIndexes = new Set();
    for (const check of item.failedChecks) {
      if (!hasExactKeys(check, ["index", "type", "critical"]) || !Number.isSafeInteger(check.index) ||
          check.index < 0 || check.index >= 10000 || seenIndexes.has(check.index) ||
          typeof check.type !== "string" || !SAFE_DIAGNOSTIC_CHECK_TYPES.has(check.type) ||
          typeof check.critical !== "boolean") return false;
      seenIndexes.add(check.index);
    }
    if (item.omittedCheckCount === 0 && item.failedChecks.some(check => check.critical) !== item.criticalFailure) return false;
  }
  return true;
}

function responseDiagnostics(diagnostics) {
  return Object.freeze({
    failedCaseCount: diagnostics.failedCaseCount,
    criticalFailureCaseCount: diagnostics.criticalFailureCaseCount,
    failedCheckCount: diagnostics.failedCheckCount,
    criticalCheckCount: diagnostics.criticalCheckCount,
    failedCheckCounts: Object.freeze({ ...diagnostics.failedCheckCounts }),
    criticalCheckCounts: Object.freeze({ ...diagnostics.criticalCheckCounts }),
    failedCases: Object.freeze(diagnostics.failedCases.map(item => Object.freeze({
      caseId: item.caseId,
      failedCheckCount: item.failedCheckCount,
      criticalFailure: item.criticalFailure,
      failedChecks: Object.freeze(item.failedChecks.map(check => Object.freeze({
        index: check.index,
        type: check.type,
        critical: check.critical
      }))),
      omittedCheckCount: item.omittedCheckCount
    }))),
    omittedCaseCount: diagnostics.omittedCaseCount
  });
}

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
  return validDiagnostics(run.diagnostics, caseIds, run.criticalFailures);
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
    const diagnostics = Object.freeze({
      version: DIAGNOSTICS_VERSION,
      baseline: responseDiagnostics(baseline.diagnostics),
      candidate: responseDiagnostics(proposed.diagnostics)
    });
    // Keep per-case diagnostics in the authenticated response only. The durable
    // audit entry remains the existing aggregate report and never stores text.
    await auditStore.append({ type: "learning_evaluation", ...report });
    return { ok: true, report, diagnostics };
  }
  return Object.freeze({ VERSION, evaluate });
}

module.exports = { VERSION, createEvaluator, validRunReport };
