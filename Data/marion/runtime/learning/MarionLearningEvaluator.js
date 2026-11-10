"use strict";

const Policy = require("./MarionLearningPolicy");
const Dataset = require("./MarionLearningDataset");
const VERSION = "marion.learningEvaluator/1.8-bounded-fail-closed-validation";
const { randomBytes } = require("node:crypto");
const HASH_RE = /^[a-f0-9]{64}$/;
const DIAGNOSTICS_VERSION = "marion.learningDiagnostics/1.0";
const MAX_DIAGNOSTIC_CASES = 100;
const MAX_DIAGNOSTIC_CHECKS_PER_CASE = 32;
const MAX_CASES = 500;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
function canonicalTimestamp(clock) {
  try {
    const value = clock();
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
    return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value ? value : null;
  } catch (_) { return null; }
}
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

// Paired, bounded metadata only: no reply text, fixture content or raw output.
// Scores must cover the approved case IDs in manifest order exactly once.
function validCaseScores(run, caseIds, scope) {
  if (!Array.isArray(run.caseScores) || run.caseScores.length !== caseIds.length || caseIds.length === 0) return false;
  let sum = 0;
  const critical = new Set(run.criticalFailures.map(item => item.caseId));
  for (let index = 0; index < caseIds.length; index++) {
    const item = run.caseScores[index];
    if (!hasExactKeys(item, ["caseId", "score", "criticalFailure", "replyFingerprint"]) ||
        item.caseId !== caseIds[index] || typeof item.score !== "number" ||
        !Number.isFinite(item.score) || item.score < 0 || item.score > 1 ||
        typeof item.criticalFailure !== "boolean" ||
        item.criticalFailure !== critical.has(item.caseId) ||
        (scope === "response_style" ? !HASH_RE.test(item.replyFingerprint || "") : item.replyFingerprint !== null)) return false;
    sum += item.score;
  }
  return Math.abs(sum / caseIds.length - run.score) <= 1e-9;
}

function pairedRegressions(baseline, proposed) {
  const failures = [];
  let improvedCaseCount = 0;
  let unchangedCaseCount = 0;
  for (let index = 0; index < baseline.caseScores.length; index++) {
    const before = baseline.caseScores[index];
    const after = proposed.caseScores[index];
    const delta = after.score - before.score;
    if (delta < -1e-9) failures.push(Object.freeze({ caseId: before.caseId, delta }));
    else if (delta > 1e-9) improvedCaseCount++;
    else unchangedCaseCount++;
  }
  return Object.freeze({ regressions: Object.freeze(failures), improvedCaseCount, unchangedCaseCount });
}

// No fingerprints are returned. Only aggregate equality metadata leaves this
// evaluator; the keyed hashes and random key remain ephemeral process memory.
function compareReplies(baseline, candidate, scope) {
  if (scope !== "response_style") return null;
  let identicalReplyCount = 0;
  for (let index = 0; index < baseline.caseScores.length; index++) {
    if (baseline.caseScores[index].replyFingerprint === candidate.caseScores[index].replyFingerprint)
      identicalReplyCount++;
  }
  return Object.freeze({
    comparedCaseCount: baseline.caseScores.length,
    identicalReplyCount,
    differentReplyCount: baseline.caseScores.length - identicalReplyCount,
    normalization: "NFKC-whitespace-collapse",
    fingerprintsExposed: false
  });
}

function validRunReport(run, expectedVersion, expectedScope, caseIds) {
  if (!Array.isArray(caseIds) || caseIds.length < 1 || caseIds.length > MAX_CASES ||
      new Set(caseIds).size !== caseIds.length ||
      caseIds.some(id => typeof id !== "string" || !ID_RE.test(id))) return false;
  if (!dataObject(run) || run.completed !== true ||
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
  return validCaseScores(run, caseIds, expectedScope) &&
    validDiagnostics(run.diagnostics, caseIds, run.criticalFailures);
}

// Evaluation diagnostics contain bounded metadata only. Never include proposal IDs,
// candidate values, auth context, user text, fixture content, or raw errors.
const CANDIDATE_FIELDS = Object.freeze([
  "proposalId", "scope", "baselineVersion", "candidateVersion", "datasetId",
  "datasetVersion", "artifactRef", "sampleCount"
]);
const CANDIDATE_REJECTION_CODES = new Set([
  "invalid_candidate", "invalid_candidate_reference", "protected_scope",
  "candidate_must_be_versioned"
]);
function candidateTypeSummary(input) {
  const descriptors = plainObject(input) ? Object.getOwnPropertyDescriptors(input) : null;
  const fields = Object.create(null);
  for (const key of CANDIDATE_FIELDS) {
    const desc = descriptors && Object.prototype.hasOwnProperty.call(descriptors, key) ? descriptors[key] : null;
    const value = desc && Object.prototype.hasOwnProperty.call(desc, "value") ? desc.value : undefined;
    fields[key] = value === undefined ? "missing" :
      value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  }
  return Object.freeze(fields);
}
function candidateFailure(input, rejected) {
  const reason = rejected && dataObject(rejected) &&
    Object.getOwnPropertyDescriptor(rejected, "reason");
  const code = reason && Object.prototype.hasOwnProperty.call(reason, "value") &&
    CANDIDATE_REJECTION_CODES.has(reason.value) ? reason.value : "unclassified_candidate_rejection";
  const output = { ok: false, reason: "candidate_validation_failed" };
  // Default OFF. Only authenticated Owner evaluation calls reach this function.
  // This diagnostics flag never changes the evaluation decision or approval state.
  if (process.env.SB_MARION_LEARNING_EVAL_DIAGNOSTICS === "true") {
    output.diagnosticStage = "candidate_validation";
    output.diagnosticCode = code;
    output.candidateFieldTypes = candidateTypeSummary(input);
    output.candidateValidatorVersion = "candidate_validation_contract_v1";
  }
  return output;
}

function createEvaluator({ runVersion, auditStore, clock = () => new Date().toISOString() } = {}) {
  if (typeof runVersion !== "function") throw new TypeError("runVersion is required for offline evaluation");
  if (!auditStore || typeof auditStore.append !== "function") throw new TypeError("auditStore.append is required");
  if (typeof clock !== "function") throw new TypeError("clock must be a function");

  async function evaluate(candidateInput, datasetInput, registrationContext) {
    let candidateResult, datasetResult;
    try {
      candidateResult = require("./MarionLearningCandidate").createCandidate(candidateInput);
    } catch (_) {
      return candidateFailure(candidateInput, null);
    }
    if (!candidateResult || candidateResult.ok !== true) return candidateFailure(candidateInput, candidateResult);
    try {
      datasetResult = Dataset.validateEvaluationSet(datasetInput);
    } catch (_) { return { ok: false, reason: "evaluation_input_validation_failed" }; }
    if (!datasetResult || datasetResult.ok !== true) return { ok: false, reason: "dataset_validation_failed" };
    const candidate = candidateResult.candidate;
    const dataset = datasetResult.dataset;
    if (!dataObject(registrationContext) || registrationContext.status !== "approved" ||
        registrationContext.datasetId !== dataset.datasetId || registrationContext.version !== dataset.version ||
        registrationContext.fixtureStore !== dataset.fixtureStore || registrationContext.scope !== candidate.scope ||
        !/^[a-f0-9]{64}$/.test(registrationContext.manifestHash || "") ||
        !/^[a-f0-9]{64}$/.test(registrationContext.fixtureSetHash || "") ||
        !Array.isArray(dataset.caseIds) || dataset.caseIds.length < 1 || dataset.caseIds.length > MAX_CASES ||
        new Set(dataset.caseIds).size !== dataset.caseIds.length ||
        dataset.caseIds.some(id => typeof id !== "string" || !ID_RE.test(id)) ||
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
    // One cryptographically random key per comparison. It is not included in
    // the authorization/fixture/handler context by the companion runner.
    // Execute serially to avoid interleaving shared composer caches.
    let fingerprintKey, baseline, proposed;
    try {
      fingerprintKey = randomBytes(32);
      const pairedContext = Object.freeze({ ...evaluationContext, fingerprintKey });
      baseline = await runVersion(candidate.baselineVersion, dataset.caseIds, pairedContext);
      proposed = await runVersion(candidate.candidateVersion, dataset.caseIds, pairedContext);
    } catch (_) {
      return { ok: false, reason: "offline_runner_failed" };
    } finally {
      if (fingerprintKey) fingerprintKey.fill(0);
    }
    if (!validRunReport(baseline, candidate.baselineVersion, candidate.scope, dataset.caseIds) ||
        !validRunReport(proposed, candidate.candidateVersion, candidate.scope, dataset.caseIds)) {
      return { ok: false, reason: "offline_runner_report_invalid" };
    }
    const baselineScore = baseline.score;
    const candidateScore = proposed.score;
    const paired = pairedRegressions(baseline, proposed);
    const replyParity = compareReplies(baseline, proposed, candidate.scope);
    const regressions = paired.regressions;
    const criticalFailures = proposed.criticalFailures;
    const delta = candidateScore - baselineScore;
    const validated = delta >= Policy.MINIMUM_SCORE_LIFT && criticalFailures.length === 0 &&
      regressions.every(item => item.delta >= -Policy.MAXIMUM_REGRESSION);
    const evaluatedAt = canonicalTimestamp(clock);
    if (!evaluatedAt) return { ok: false, reason: "learning_evaluation_clock_invalid" };
    const report = Object.freeze({
      proposalId: candidate.proposalId, scope: candidate.scope,
      baselineVersion: candidate.baselineVersion, candidateVersion: candidate.candidateVersion,
      datasetId: dataset.datasetId, datasetVersion: dataset.version,
      sampleCount: candidate.sampleCount, baselineScore, candidateScore, delta,
      regressionCount: regressions.length, criticalFailureCount: criticalFailures.length,
      validated, state: validated ? "awaiting_owner_approval" : "rejected_by_validation",
      liveBehaviorChanged: false, evaluatedAt
    });
    const diagnostics = Object.freeze({
      version: DIAGNOSTICS_VERSION,
      baseline: responseDiagnostics(baseline.diagnostics),
      candidate: responseDiagnostics(proposed.diagnostics),
      replyParity,
      paired: Object.freeze({
        improvedCaseCount: paired.improvedCaseCount,
        unchangedCaseCount: paired.unchangedCaseCount,
        regressedCaseCount: regressions.length,
        // No raw text or outputs. Only approved case identifiers and numeric deltas.
        regressions: Object.freeze(regressions.map(item => Object.freeze({
          caseId: item.caseId, delta: item.delta
        })))
      })
    });
    // Keep per-case diagnostics in the authenticated response only. The durable
    // audit entry remains the existing aggregate report and never stores text.
    try {
      const auditAck = await auditStore.append({ type: "learning_evaluation", ...report });
      // Existing append contract may resolve void. A literal failure is rejected;
      // thrown persistence failures are never converted into a successful report.
      if (auditAck === false || (auditAck && typeof auditAck === "object" && auditAck.ok === false)) {
        return { ok: false, reason: "learning_evaluation_audit_unconfirmed" };
      }
    } catch (_) {
      return { ok: false, reason: "learning_evaluation_audit_failed" };
    }
    return { ok: true, report, diagnostics };
  }
  return Object.freeze({ VERSION, evaluate });
}

module.exports = { VERSION, createEvaluator, validRunReport };
