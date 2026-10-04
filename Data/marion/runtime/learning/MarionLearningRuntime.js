"use strict";

const VERSION = "marion.learningRuntime/1.3-accurate-evaluation-health";

function isVerifiedOwner(authContext) {
  return !!(authContext && authContext.authenticated === true && authContext.role === "owner" && authContext.verifiedBy === "server_middleware" && typeof authContext.actorId === "string" && authContext.actorId.trim());
}

function createMarionLearningRuntime({ signalAdapter, evaluator, approvalGate, manifestRegistry,
  healthProbe = async () => ({ ready: true }), offlineEvaluationReady = async () => false,
  captureEnabled = false } = {}) {
  if (!signalAdapter || typeof signalAdapter.record !== "function") throw new TypeError("signalAdapter.record is required");
  if (!evaluator || typeof evaluator.evaluate !== "function") throw new TypeError("evaluator.evaluate is required");
  if (!approvalGate || typeof approvalGate.submitEvaluation !== "function" || typeof approvalGate.decide !== "function") throw new TypeError("approvalGate methods are required");
  if (!manifestRegistry || typeof manifestRegistry.listAvailable !== "function" ||
      typeof manifestRegistry.issueFixtureReview !== "function" || typeof manifestRegistry.approveManifest !== "function" || typeof manifestRegistry.revokeManifest !== "function" || typeof manifestRegistry.listApproved !== "function" ||
      typeof manifestRegistry.selectApprovedManifest !== "function") throw new TypeError("trusted manifestRegistry methods are required");

  async function captureFinalOutcome(event) {
    if (captureEnabled !== true) return { ok: false, accepted: false, reason: "learning_disabled" };
    const src = event && typeof event === "object" ? event : {};
    if (src.finalAccepted !== true) return { ok: false, accepted: false, reason: "final_response_not_accepted" };
    if (src.learningConsent !== true) return { ok: false, accepted: false, reason: "learning_consent_required" };
    // Whitelist scalar metadata; never forward the response, prompt, transcript, or request body.
    const signal = {
      signalId: src.signalId,
      signalClass: src.signalClass,
      scope: src.scope,
      sourceSubsystem: src.sourceSubsystem,
      outcomeScore: src.outcomeScore,
      occurredAt: src.occurredAt
    };
    return signalAdapter.record(signal);
  }

  async function listAvailableManifests(authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    return manifestRegistry.listAvailable(authContext);
  }

  async function approveManifest(selection, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    return manifestRegistry.approveManifest(selection, authContext);
  }

  async function issueFixtureReview(selection, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    return manifestRegistry.issueFixtureReview(selection, authContext);
  }

  async function revokeManifest(selection, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    return manifestRegistry.revokeManifest(selection, authContext);
  }

  async function listApprovedManifests(scope, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    return manifestRegistry.listApproved(scope, authContext);
  }

  async function evaluateCandidate(candidate, selection, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    const selected = await manifestRegistry.selectApprovedManifest(selection, authContext);
    if (!selected || selected.ok !== true) return selected || { ok: false, reason: "manifest_selection_failed" };
    return evaluator.evaluate(candidate, selected.manifest, selected.registration);
  }

  async function submitEvaluation(report, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    return approvalGate.submitEvaluation(report);
  }

  async function decideProposal(input, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    return approvalGate.decide({ ...(input || {}), authContext });
  }

  async function getPrivateHealth(authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, status: 403, reason: "owner_authentication_required" };
    let dependencyStatus;
    let offlineReady = false;
    try { dependencyStatus = await healthProbe(); }
    catch (_) { dependencyStatus = { ready: false }; }
    try { offlineReady = await offlineEvaluationReady() === true; }
    catch (_) { offlineReady = false; }
    const storageReady = !!(dependencyStatus && dependencyStatus.ready === true);
    const ready = storageReady && offlineReady;
    return {
      ok: true, status: ready ? 200 : 503,
      service: "marion-learning-runtime", version: VERSION,
      mode: "offline_candidate_evaluation_only",
      ready, liveActivationEnabled: false,
      reason: ready ? "ready" : !storageReady ? "durable_storage_not_ready" : "offline_handlers_not_registered",
      transcriptStorageEnabled: false, audioStorageEnabled: false,
      dependencies: {
        signalCapture: captureEnabled === true,
        offlineEvaluation: offlineReady,
        approvalGate: true,
        manifestRegistry: true,
        privateDurableStores: storageReady
      }
    };
  }

  return Object.freeze({ VERSION, captureFinalOutcome, listAvailableManifests, issueFixtureReview, approveManifest, revokeManifest, listApprovedManifests, evaluateCandidate, submitEvaluation, decideProposal, getPrivateHealth });
}

module.exports = { VERSION, createMarionLearningRuntime, isVerifiedOwner };
