"use strict";

const VERSION = "marion.learningIntegration/1.0";
const SIGNAL_CLASSES = new Set(["task_success", "task_failure", "owner_correction", "owner_confirmation", "translation_quality", "ad_outcome"]);
const SCOPES = new Set(["retrieval", "routing", "response_style"]);
let activeRuntime = null;

function isAcceptedMarionFinal(value) {
  const result = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const envelope = result.finalEnvelope && typeof result.finalEnvelope === "object" ? result.finalEnvelope : {};
  const reply = [result.authoritativeReply, result.reply, result.finalReply, result.text, envelope.authoritativeReply, envelope.reply, envelope.finalReply, envelope.text]
    .find(item => typeof item === "string" && item.trim());
  return result.ok === true && result.final === true && result.marionFinal === true &&
    result.blocked !== true && result.awaitingMarion !== true &&
    Boolean(reply) && envelope.final === true && envelope.marionFinal === true;
}

function trustedLearningContext(context) {
  const ctx = context && typeof context === "object" && !Array.isArray(context) ? context : {};
  const signal = ctx.signal && typeof ctx.signal === "object" && !Array.isArray(ctx.signal) ? ctx.signal : {};
  return ctx.authenticated === true && ctx.ownerAuthenticated === true && ctx.role === "owner" &&
    ctx.verifiedBy === "server_middleware" && ctx.learningConsent === true &&
    typeof ctx.actorId === "string" && ctx.actorId.trim().length > 0 &&
    typeof signal.signalId === "string" && signal.signalId.trim().length > 0 &&
    SIGNAL_CLASSES.has(signal.signalClass) && SCOPES.has(signal.scope) &&
    typeof signal.sourceSubsystem === "string" && signal.sourceSubsystem.trim().length > 0 &&
    Number.isFinite(Number(signal.outcomeScore)) && Number(signal.outcomeScore) >= 0 && Number(signal.outcomeScore) <= 1;
}

function registerRuntime(runtime) {
  if (!runtime || typeof runtime.captureFinalOutcome !== "function") throw new TypeError("runtime.captureFinalOutcome is required");
  activeRuntime = runtime;
  return { ok: true, registered: true, version: VERSION };
}

function getRuntime() { return activeRuntime; }

async function captureAcceptedAdminFinal({ runtime = activeRuntime, result, options, gatewayAdminVerified, finalValidator = isAcceptedMarionFinal } = {}) {
  const context = options && typeof options === "object" ? options.marionLearningContext : null;
  if (!runtime || typeof runtime.captureFinalOutcome !== "function") return { ok: false, reason: "learning_runtime_not_registered" };
  if (gatewayAdminVerified !== true || !trustedLearningContext(context)) return { ok: false, reason: "trusted_owner_consent_required" };
  if (typeof finalValidator !== "function" || !finalValidator(result)) return { ok: false, reason: "accepted_marion_final_required" };
  const src = context.signal;
  // Rebuild a strict allowlist: no request body, prompt, transcript, or response text is passed through.
  return runtime.captureFinalOutcome({
    finalAccepted: true,
    learningConsent: true,
    signalId: src.signalId,
    signalClass: src.signalClass,
    scope: src.scope,
    sourceSubsystem: src.sourceSubsystem,
    outcomeScore: Number(src.outcomeScore),
    occurredAt: typeof src.occurredAt === "string" ? src.occurredAt : ""
  });
}

function status() {
  return Object.freeze({ version: VERSION, registered: !!activeRuntime, captureRequiresServerVerifiedOwner: true, explicitConsentRequired: true, finalResponseRequired: true, rawConversationStored: false });
}

module.exports = { VERSION, isAcceptedMarionFinal, trustedLearningContext, registerRuntime, getRuntime, captureAcceptedAdminFinal, status };
