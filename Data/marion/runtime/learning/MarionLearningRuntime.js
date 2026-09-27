"use strict";

const VERSION = "marion.learningRuntime/1.0";

function isVerifiedOwner(authContext) {
  return !!(authContext && authContext.authenticated === true && authContext.role === "owner" && authContext.verifiedBy === "server_middleware" && typeof authContext.actorId === "string" && authContext.actorId.trim());
}

function createMarionLearningRuntime({ signalAdapter, evaluator, approvalGate, healthProbe = async () => ({ ready: true }) } = {}) {
  if (!signalAdapter || typeof signalAdapter.record !== "function") throw new TypeError("signalAdapter.record is required");
  if (!evaluator || typeof evaluator.evaluate !== "function") throw new TypeError("evaluator.evaluate is required");
  if (!approvalGate || typeof approvalGate.submitEvaluation !== "function" || typeof approvalGate.decide !== "function") throw new TypeError("approvalGate methods are required");

  async function captureFinalOutcome(event) {
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

  async function evaluateCandidate(candidate, dataset, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    return evaluator.evaluate(candidate, dataset);
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
    try {
      dependencyStatus = await healthProbe();
    } catch (_) {
      dependencyStatus = { ready: false };
    }
    const ready = !!(dependencyStatus && dependencyStatus.ready === true);
    return {
      ok: true, status: ready ? 200 : 503,
      service: "marion-learning-runtime", version: VERSION,
      mode: "offline_candidate_evaluation_only",
      ready, liveActivationEnabled: false,
      transcriptStorageEnabled: false, audioStorageEnabled: false,
      dependencies: {
        signalCapture: true,
        offlineEvaluation: true,
        approvalGate: true,
        privateDurableStores: ready
      }
    };
  }

  return Object.freeze({ VERSION, captureFinalOutcome, evaluateCandidate, submitEvaluation, decideProposal, getPrivateHealth });
}

module.exports = { VERSION, createMarionLearningRuntime, isVerifiedOwner };
