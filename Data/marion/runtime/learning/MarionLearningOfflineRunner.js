"use strict";

// Offline-only evaluator bridge. It runs allowlisted version handlers against
// synthetic fixtures bound to one validated dataset manifest and fixture store.
// Outputs and fixture contents are never persisted or included in the report.

const VERSION = "marion.learningOfflineRunner/1.4-handler-binding-hardlock";
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
      if (score === null) throw new Error("fixture_score_invalid");
      total += score;
      const delta = Number(scored && scored.delta);
      if (Number.isFinite(delta) && delta < 0) regressions.push({ caseId, delta });
      if (scored && scored.criticalFailure === true) criticalFailures.push({ caseId });
    }

    return Object.freeze({
      completed: true,
      mode: "offline",
      version: versionId,
      scope,
      caseCount: caseIds.length,
      score: total / caseIds.length,
      regressions: Object.freeze(regressions),
      criticalFailures: Object.freeze(criticalFailures)
    });
  }

  return Object.freeze({ VERSION, runVersion });
}

module.exports = { VERSION, createMarionLearningOfflineRunner };
