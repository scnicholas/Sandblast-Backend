"use strict";

// Private metadata-only runtime registry; intentionally no gateway import.
const VERSION = "marion.learningIntegration/1.2-registration-capture-guard";
const SIGNAL_CLASSES = new Set(["task_success", "task_failure", "owner_correction", "owner_confirmation", "translation_quality", "ad_outcome"]);
const SCOPES = new Set(["retrieval", "routing", "response_style"]);
let activeRuntime = null;

function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function text(value, max) { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max; }
function isAcceptedMarionFinal(value) {
  if (!record(value)) return false;
  const env = record(value.finalEnvelope) ? value.finalEnvelope : {};
  const reply = [value.authoritativeReply, value.reply, value.finalReply, value.text, env.authoritativeReply, env.reply, env.finalReply, env.text]
    .find(item => text(item, 50000));
  return value.ok === true && value.final === true && value.marionFinal === true &&
    value.blocked !== true && value.awaitingMarion !== true && value.canEmit !== false &&
    value.degraded !== true && value.requiresRetry !== true &&
    env.final === true && env.marionFinal === true && env.blocked !== true &&
    env.awaitingMarion !== true && env.canEmit !== false && Boolean(reply);
}
function trustedLearningContext(value) {
  if (!record(value) || !record(value.signal)) return false;
  const s = value.signal;
  return value.authenticated === true && value.ownerAuthenticated === true && value.role === "owner" &&
    value.verifiedBy === "server_middleware" && value.learningConsent === true &&
    text(value.actorId, 256) && text(s.signalId, 256) && text(s.sourceSubsystem, 128) &&
    SIGNAL_CLASSES.has(s.signalClass) && SCOPES.has(s.scope) &&
    typeof s.outcomeScore === "number" && Number.isFinite(s.outcomeScore) && s.outcomeScore >= 0 && s.outcomeScore <= 1 &&
    (s.occurredAt === undefined || (text(s.occurredAt, 64) && !Number.isNaN(Date.parse(s.occurredAt))));
}
function registerRuntime(runtime) {
  if (!record(runtime) || typeof runtime.captureFinalOutcome !== "function") {
    throw new TypeError("learning_runtime_capture_contract_invalid");
  }
  if (activeRuntime && activeRuntime !== runtime) throw new Error("learning_runtime_already_registered");
  const alreadyRegistered = activeRuntime === runtime;
  activeRuntime = runtime;
  return Object.freeze({ ok: true, registered: true, version: VERSION, alreadyRegistered });
}
function getRuntime() { return activeRuntime; }
async function captureAcceptedAdminFinal({ runtime = activeRuntime, result, options, gatewayAdminVerified, finalValidator = isAcceptedMarionFinal } = {}) {
  if (!runtime || runtime !== activeRuntime || typeof runtime.captureFinalOutcome !== "function") {
    return { ok: false, reason: "learning_runtime_not_registered" };
  }
  const context = record(options) ? options.marionLearningContext : null;
  if (gatewayAdminVerified !== true || !trustedLearningContext(context)) {
    return { ok: false, reason: "trusted_owner_consent_required" };
  }
  // A supplied validator can only tighten the standard final-envelope contract.
  try {
    if (!isAcceptedMarionFinal(result) || typeof finalValidator !== "function" ||
        (await finalValidator(result)) !== true) {
      return { ok: false, reason: "accepted_marion_final_required" };
    }
  } catch (_) {
    return { ok: false, reason: "accepted_marion_final_required" };
  }
  const s = context.signal;
  try {
    const captureResult = await runtime.captureFinalOutcome(Object.freeze({
      finalAccepted: true, learningConsent: true, signalId: s.signalId.trim(),
      signalClass: s.signalClass, scope: s.scope, sourceSubsystem: s.sourceSubsystem.trim(),
      outcomeScore: s.outcomeScore, occurredAt: s.occurredAt || ""
    }));
    return record(captureResult) ? captureResult : { ok: false, reason: "learning_capture_result_invalid" };
  } catch (_) {
    return { ok: false, reason: "learning_capture_failed" };
  }
}
function status() {
  return Object.freeze({ version: VERSION, ready: !!activeRuntime, registered: !!activeRuntime,
    captureRequiresServerVerifiedOwner: true, explicitConsentRequired: true,
    finalResponseRequired: true, rawConversationStored: false });
}
module.exports = { VERSION, isAcceptedMarionFinal, trustedLearningContext, registerRuntime,
  getRuntime, captureAcceptedAdminFinal, status };
