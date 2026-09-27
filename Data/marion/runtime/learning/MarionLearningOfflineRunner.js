"use strict";

// Offline-only evaluator bridge. It runs allowlisted version handlers against
// synthetic fixtures and returns scores only; outputs and fixture contents are
// never persisted or included in the learning report.

const VERSION = "marion.learningOfflineRunner/1.0";
const ALLOWED_SCOPES = new Set(["retrieval", "routing", "response_style"]);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const FORBIDDEN_FIXTURE_KEYS = new Set([
  "rawAudio", "audio", "recording", "personalData", "email", "phone", "address",
  "ownerId", "actorId", "sessionId", "userId", "cookie", "token", "credential"
]);

function hasForbiddenFixtureData(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 8) return false;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_FIXTURE_KEYS.has(key)) return true;
    if (hasForbiddenFixtureData(nested, depth + 1)) return true;
  }
  return false;
}

function finiteScore(value) {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 1 ? score : null;
}

function createMarionLearningOfflineRunner({ resolveVersion, loadFixture, scoreFixture, maxCases = 500 } = {}) {
  if (typeof resolveVersion !== "function" || typeof loadFixture !== "function" || typeof scoreFixture !== "function") {
    throw new TypeError("resolveVersion, loadFixture, and scoreFixture are required");
  }
  const caseLimit = Math.max(20, Math.min(500, Number(maxCases) || 500));

  async function runVersion(version, caseIds, options = {}) {
    const versionId = typeof version === "string" ? version.trim() : "";
    const mode = options && options.mode;
    const scope = options && options.scope;
    if (mode !== "offline") throw new Error("offline_mode_required");
    if (!ID_RE.test(versionId) || !ALLOWED_SCOPES.has(scope)) throw new Error("invalid_offline_evaluation_request");
    if (!Array.isArray(caseIds) || caseIds.length < 20 || caseIds.length > caseLimit ||
        caseIds.some(id => typeof id !== "string" || !ID_RE.test(id)) || new Set(caseIds).size !== caseIds.length) {
      throw new Error("invalid_offline_fixture_set");
    }

    const handler = await resolveVersion(versionId, { mode: "offline", scope });
    if (!handler || handler.mode !== "offline" || typeof handler.runOffline !== "function") {
      throw new Error("version_not_registered_for_offline_evaluation");
    }

    let total = 0;
    const regressions = [];
    const criticalFailures = [];
    for (const caseId of caseIds) {
      const fixture = await loadFixture(caseId, { mode: "offline", scope });
      if (!fixture || fixture.caseId !== caseId || fixture.synthetic !== true ||
          !fixture.input || typeof fixture.input !== "object" || hasForbiddenFixtureData(fixture)) {
        throw new Error("fixture_not_approved_synthetic_data");
      }
      const output = await handler.runOffline(fixture.input, Object.freeze({
        mode: "offline", scope, version: versionId, caseId,
        sideEffectsAllowed: false, activationAllowed: false
      }));
      const scored = await scoreFixture(fixture, output, { mode: "offline", scope, version: versionId });
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
