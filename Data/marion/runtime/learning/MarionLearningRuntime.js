"use strict";

const VERSION = "marion.learningRuntime/1.5-contract-validation-and-failclosed";

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isVerifiedOwner(authContext) {
  return !!(authContext && authContext.authenticated === true && authContext.role === "owner" && authContext.verifiedBy === "server_middleware" && typeof authContext.actorId === "string" && authContext.actorId.trim());
}

function createMarionLearningRuntime({ signalAdapter, evaluator, approvalGate, manifestRegistry,
  healthProbe = async () => ({ ready: false }), offlineEvaluationReady = async () => false,
  captureEnabled = false } = {}) {
  if (typeof healthProbe !== "function" || typeof offlineEvaluationReady !== "function") throw new TypeError("learning readiness probes must be functions");
  if (!signalAdapter || typeof signalAdapter.record !== "function") throw new TypeError("signalAdapter.record is required");
  if (!evaluator || typeof evaluator.evaluate !== "function") throw new TypeError("evaluator.evaluate is required");
  if (!approvalGate || typeof approvalGate.submitEvaluation !== "function" || typeof approvalGate.decide !== "function") throw new TypeError("approvalGate methods are required");
  if (!manifestRegistry || typeof manifestRegistry.listAvailable !== "function" ||
      typeof manifestRegistry.issueFixtureReview !== "function" || typeof manifestRegistry.approveManifest !== "function" || typeof manifestRegistry.revokeManifest !== "function" || typeof manifestRegistry.listApproved !== "function" ||
      typeof manifestRegistry.selectApprovedManifest !== "function") throw new TypeError("trusted manifestRegistry methods are required");

  async function captureFinalOutcome(event) {
    if (captureEnabled !== true) return { ok: false, accepted: false, reason: "learning_disabled" };
    const src = isPlainRecord(event) ? event : {};
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
    try {
      const result = await signalAdapter.record(signal);
      if (!result || result.ok !== true || result.accepted !== true) {
        return { ok: false, accepted: false, reason: result && typeof result.reason === "string" ? result.reason : "learning_signal_persistence_unconfirmed" };
      }
      return result;
    } catch (_) {
      return { ok: false, accepted: false, reason: "learning_signal_persistence_failed" };
    }
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

  async function evaluationReadiness() {
    let storageReady = false;
    let offlineReady = false;
    try {
      const dependencyStatus = await healthProbe();
      storageReady = !!(dependencyStatus && dependencyStatus.ready === true);
    } catch (_) { storageReady = false; }
    try { offlineReady = await offlineEvaluationReady() === true; }
    catch (_) { offlineReady = false; }
    return Object.freeze({
      ready: storageReady && offlineReady,
      storageReady,
      offlineReady,
      reason: !storageReady ? "durable_storage_not_ready" :
        !offlineReady ? "offline_evaluation_handlers_not_registered" : "ready"
    });
  }

  async function evaluateCandidate(candidate, selection, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    const readiness = await evaluationReadiness();
    if (!readiness.ready) return { ok: false, reason: readiness.reason };
    const selected = await manifestRegistry.selectApprovedManifest(selection, authContext);
    if (!selected || selected.ok !== true) return selected || { ok: false, reason: "manifest_selection_failed" };
    if (!isPlainRecord(selected.manifest) || !isPlainRecord(selected.registration)) {
      return { ok: false, reason: "approved_manifest_contract_invalid" };
    }
    return evaluator.evaluate(candidate, selected.manifest, selected.registration);
  }

  async function submitEvaluation(report, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    const readiness = await evaluationReadiness();
    if (!readiness.ready) return { ok: false, reason: readiness.reason };
    return approvalGate.submitEvaluation(report);
  }

  async function decideProposal(input, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    if (!isPlainRecord(input)) return { ok: false, reason: "invalid_proposal_decision" };
    // Server-verified auth must override any caller-provided authContext.
    return approvalGate.decide({ ...input, authContext });
  }

  async function getPrivateHealth(authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, status: 403, reason: "owner_authentication_required" };
    const readiness = await evaluationReadiness();
    return {
      ok: true, status: readiness.ready ? 200 : 503,
      service: "marion-learning-runtime", version: VERSION,
      mode: "offline_candidate_evaluation_only",
      ready: readiness.ready, liveActivationEnabled: false,
      reason: readiness.reason,
      transcriptStorageEnabled: false, audioStorageEnabled: false,
      dependencies: {
        signalCapture: captureEnabled === true,
        offlineEvaluation: readiness.offlineReady,
        approvalGate: true,
        manifestRegistry: true,
        privateDurableStores: readiness.storageReady
      }
    };
  }

  return Object.freeze({ VERSION, captureFinalOutcome, listAvailableManifests, issueFixtureReview, approveManifest, revokeManifest, listApprovedManifests, evaluateCandidate, submitEvaluation, decideProposal, getPrivateHealth });
}

module.exports = { VERSION, createMarionLearningRuntime, isVerifiedOwner };
