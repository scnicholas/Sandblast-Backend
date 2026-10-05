"use strict";

// Offline-only evaluator bridge. It runs allowlisted version handlers against
// synthetic fixtures bound to one validated dataset manifest and fixture store.
// Outputs and fixture contents are never persisted or included in the report.

const VERSION = "marion.learningOfflineRunner/1.5-sanitized-failure-diagnostics";
const DIAGNOSTICS_VERSION = "marion.learningDiagnostics/1.0";
const MAX_DIAGNOSTIC_CASES = 100;
const MAX_DIAGNOSTIC_CHECKS_PER_CASE = 32;
const SAFE_DIAGNOSTIC_CHECK_TYPES = new Set([
  "sentence_count_max", "sentence_words_max", "max_words", "contains_all",
  "contains_any", "phrase_absent", "phrase_present_any", "heading_present",
  "bullet_count_exact", "question_count_exact", "definition_of_term",
  "uncertainty_present", "correction_present", "exact_match"
]);
const ALLOWED_SCOPES = new Set(["retrieval", "routing", "response_style"]);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const FORBIDDEN_FIXTURE_KEYS = new Set([
  "rawaudio", "audio", "recording", "personaldata", "email", "phone", "address",
  "ownerid", "actorid", "sessionid", "userid", "cookie", "token", "credential",
  "transcript", "prompt", "authorization", "secret", "password"
]);
const MAX_FIXTURE_DEPTH = 16;
const MAX_FIXTURE_NODES = 10000;

function normalizedKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function validateFixtureData(value, seen = new Set(), state = { nodes: 0 }, depth = 0) {
  if (depth > MAX_FIXTURE_DEPTH || ++state.nodes > MAX_FIXTURE_NODES) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_FIXTURE_KEYS.has(normalizedKey(key)) || !validateFixtureData(nested, seen, state, depth + 1)) return false;
  }
  seen.delete(value);
  return true;
}

function finiteScore(value) {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 1 ? score : null;
}

function sanitizeFailedChecks(scored) {
  if (!scored || !Array.isArray(scored.failedChecks) || scored.failedChecks.length > MAX_FIXTURE_NODES) return null;
  const result = [];
  const seenIndexes = new Set();
  for (const item of scored.failedChecks) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== 3 || keys.some(key => typeof key !== "string" ||
        !["index", "type", "critical"].includes(key) || descriptors[key].enumerable !== true ||
        !Object.prototype.hasOwnProperty.call(descriptors[key], "value"))) return null;
    const index = descriptors.index.value;
    const type = descriptors.type.value;
    const critical = descriptors.critical.value;
    if (!Number.isInteger(index) || index < 0 || index >= MAX_FIXTURE_NODES || seenIndexes.has(index) ||
        typeof type !== "string" || !SAFE_DIAGNOSTIC_CHECK_TYPES.has(type) || typeof critical !== "boolean") return null;
    seenIndexes.add(index);
    result.push(Object.freeze({ index, type, critical }));
  }
  return result;
}

function countObject(counts) {
  return Object.freeze(Object.fromEntries(Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))));
}

function createMarionLearningOfflineRunner({ resolveVersion, loadFixture, scoreFixture, authorizeEvaluation, maxCases = 500 } = {}) {
  if (typeof resolveVersion !== "function" || typeof loadFixture !== "function" || typeof scoreFixture !== "function" || typeof authorizeEvaluation !== "function") {
    throw new TypeError("resolveVersion, loadFixture, scoreFixture, and registry authorizeEvaluation are required");
  }
  const caseLimit = Math.max(20, Math.min(500, Number(maxCases) || 500));

  async function runVersion(version, caseIds, options = {}) {
    const versionId = typeof version === "string" ? version.trim() : "";
    const { mode, scope, datasetId, datasetVersion, fixtureStore, manifestHash, fixtureSetHash } = options || {};
    if (mode !== "offline") throw new Error("offline_mode_required");
    if (!ID_RE.test(versionId) || !ALLOWED_SCOPES.has(scope) ||
        !ID_RE.test(datasetId || "") || !ID_RE.test(datasetVersion || "") || !ID_RE.test(fixtureStore || "") ||
        !/^[a-f0-9]{64}$/.test(manifestHash || "") || !/^[a-f0-9]{64}$/.test(fixtureSetHash || "")) {
      throw new Error("invalid_offline_evaluation_request");
    }
    if (!Array.isArray(caseIds) || caseIds.length < 20 || caseIds.length > caseLimit ||
        caseIds.some(id => typeof id !== "string" || !ID_RE.test(id)) || new Set(caseIds).size !== caseIds.length) {
      throw new Error("invalid_offline_fixture_set");
    }

    const requestedCaseIds = Object.freeze([...caseIds]);
    const runContext = Object.freeze({ mode: "offline", scope, datasetId, datasetVersion, fixtureStore,
      manifestHash, fixtureSetHash, caseIds: requestedCaseIds });
    let authorized = false;
    try { authorized = await authorizeEvaluation(runContext) === true; } catch (_) { authorized = false; }
    if (!authorized) throw new Error("manifest_not_registered_or_fixture_binding_invalid");
    const handler = await resolveVersion(versionId, runContext);
    const hasExactBinding = !!handler && Array.isArray(handler.bindings) && handler.bindings.some(binding =>
      binding && binding.datasetId === datasetId && binding.datasetVersion === datasetVersion && binding.scope === scope);
    if (!handler || handler.version !== versionId || handler.mode !== "offline" ||
        typeof handler.runOffline !== "function" || !hasExactBinding) {
      throw new Error("version_not_registered_for_offline_evaluation");
    }

    let total = 0;
    const regressions = [];
    const criticalFailures = [];
    const failedCheckCounts = new Map();
    const criticalCheckCounts = new Map();
    const failedCases = [];
    let failedCaseCount = 0;
    let criticalFailureCaseCount = 0;
    let failedCheckCount = 0;
    let criticalCheckCount = 0;
    let omittedCaseCount = 0;
    for (const caseId of caseIds) {
      const fixture = await loadFixture(caseId, Object.freeze({ ...runContext, caseId }));
      if (!fixture || fixture.caseId !== caseId || fixture.synthetic !== true ||
          fixture.datasetId !== datasetId || fixture.datasetVersion !== datasetVersion ||
          fixture.fixtureStore !== fixtureStore || fixture.scope !== scope ||
          fixture.fixtureSetHash !== fixtureSetHash || !fixture.input || typeof fixture.input !== "object" ||
          Array.isArray(fixture.input) || !validateFixtureData(fixture) || !validateFixtureData(fixture.input)) {
        throw new Error("fixture_not_approved_synthetic_data");
      }
      const output = await handler.runOffline(fixture.input, Object.freeze({
        ...runContext, version: versionId, caseId,
        sideEffectsAllowed: false, activationAllowed: false
      }));
      const scored = await scoreFixture(fixture, output, Object.freeze({ ...runContext, version: versionId, caseId }));
      const score = finiteScore(scored && scored.score);
      if (score === null || !scored || typeof scored.criticalFailure !== "boolean") throw new Error("fixture_score_invalid");
      const failedChecks = sanitizeFailedChecks(scored);
      if (!failedChecks) throw new Error("fixture_diagnostics_invalid");
      const hasCriticalCheckFailure = failedChecks.some(item => item.critical);
      if (hasCriticalCheckFailure !== scored.criticalFailure) throw new Error("fixture_diagnostics_inconsistent");
      total += score;
      const delta = Number(scored && scored.delta);
      if (Number.isFinite(delta) && delta < 0) regressions.push({ caseId, delta });
      if (scored && scored.criticalFailure === true) criticalFailures.push({ caseId });
      if (scored.criticalFailure) criticalFailureCaseCount++;
      if (failedChecks.length) {
        failedCaseCount++;
        failedCheckCount += failedChecks.length;
        for (const check of failedChecks) {
          failedCheckCounts.set(check.type, (failedCheckCounts.get(check.type) || 0) + 1);
          if (check.critical) {
            criticalCheckCount++;
            criticalCheckCounts.set(check.type, (criticalCheckCounts.get(check.type) || 0) + 1);
          }
        }
        if (failedCases.length < MAX_DIAGNOSTIC_CASES) {
          failedCases.push(Object.freeze({
            caseId,
            failedCheckCount: failedChecks.length,
            criticalFailure: scored.criticalFailure,
            failedChecks: Object.freeze(failedChecks.slice(0, MAX_DIAGNOSTIC_CHECKS_PER_CASE)),
            omittedCheckCount: Math.max(0, failedChecks.length - MAX_DIAGNOSTIC_CHECKS_PER_CASE)
          }));
        } else omittedCaseCount++;
      }
    }

    return Object.freeze({
      completed: true,
      mode: "offline",
      version: versionId,
      scope,
      caseCount: caseIds.length,
      score: total / caseIds.length,
      regressions: Object.freeze(regressions),
      criticalFailures: Object.freeze(criticalFailures),
      diagnostics: Object.freeze({
        version: DIAGNOSTICS_VERSION,
        complete: true,
        failedCaseCount,
        criticalFailureCaseCount,
        failedCheckCount,
        criticalCheckCount,
        failedCheckCounts: countObject(failedCheckCounts),
        criticalCheckCounts: countObject(criticalCheckCounts),
        failedCases: Object.freeze(failedCases),
        omittedCaseCount
      })
    });
  }

  return Object.freeze({ VERSION, runVersion });
}

module.exports = { VERSION, createMarionLearningOfflineRunner };
