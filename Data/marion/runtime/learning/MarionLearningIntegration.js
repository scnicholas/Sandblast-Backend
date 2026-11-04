"use strict";

// Private metadata-only runtime registry; intentionally no gateway import.
const VERSION = "marion.learningIntegration/1.3-phase20-22-trust-boundary";
const SIGNAL_CLASSES = new Set(["task_success", "task_failure", "owner_correction", "owner_confirmation", "translation_quality", "ad_outcome"]);
const SCOPES = new Set(["retrieval", "routing", "response_style"]);
let activeRuntime = null;

// Read own data properties only: a caller must not be able to trigger getters,
// Proxy-backed side effects, or inherited authorization fields.
function record(value) {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value) &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
      Reflect.ownKeys(value).every(key => typeof key === "string" &&
        Object.getOwnPropertyDescriptor(value, key)?.enumerable === true &&
        Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), "value"));
  } catch (_) { return false; }
}
function own(value, key) {
  if (!record(value)) return undefined;
  try { const d = Object.getOwnPropertyDescriptor(value, key); return d &&
    Object.prototype.hasOwnProperty.call(d, "value") ? d.value : undefined; }
  catch (_) { return undefined; }
}
function text(value, max) {
  return typeof value === "string" && value.length <= max && value.trim().length > 0;
}
function isAcceptedMarionFinal(value) {
  if (!record(value)) return false;
  const env = own(value, "finalEnvelope");
  if (!record(env)) return false;
  const replyFields = ["authoritativeReply", "reply", "finalReply", "text"];
  const reply = replyFields.some(key => text(own(value, key), 50000) || text(own(env, key), 50000));
  return own(value, "ok") === true && own(value, "final") === true &&
    own(value, "marionFinal") === true && own(value, "blocked") !== true &&
    own(value, "awaitingMarion") !== true && own(value, "canEmit") !== false &&
    own(value, "degraded") !== true && own(value, "requiresRetry") !== true &&
    own(env, "final") === true && own(env, "marionFinal") === true &&
    own(env, "blocked") !== true && own(env, "awaitingMarion") !== true &&
    own(env, "canEmit") !== false && reply;
}
function trustedLearningContext(value) {
  const s = own(value, "signal");
  if (!record(value) || !record(s)) return false;
  const score = own(s, "outcomeScore");
  const occurredAt = own(s, "occurredAt");
  return own(value, "authenticated") === true && own(value, "ownerAuthenticated") === true &&
    own(value, "role") === "owner" && own(value, "verifiedBy") === "server_middleware" &&
    own(value, "learningConsent") === true && text(own(value, "actorId"), 256) &&
    text(own(s, "signalId"), 256) && text(own(s, "sourceSubsystem"), 128) &&
    SIGNAL_CLASSES.has(own(s, "signalClass")) && SCOPES.has(own(s, "scope")) &&
    typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 1 &&
    (occurredAt === undefined || (text(occurredAt, 64) &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(occurredAt) &&
      Number.isFinite(Date.parse(occurredAt))));
}
function registerRuntime(runtime) {
  if (!record(runtime) || typeof own(runtime, "captureFinalOutcome") !== "function") {
    throw new TypeError("learning_runtime_capture_contract_invalid");
  }
  if (activeRuntime && activeRuntime !== runtime) throw new Error("learning_runtime_already_registered");
  const alreadyRegistered = activeRuntime === runtime;
  activeRuntime = runtime;
  return Object.freeze({ ok: true, registered: true, version: VERSION, alreadyRegistered });
}
function getRuntime() { return activeRuntime; }
async function captureAcceptedAdminFinal({ runtime = activeRuntime, result, options, gatewayAdminVerified, finalValidator = isAcceptedMarionFinal } = {}) {
  if (!runtime || runtime !== activeRuntime || typeof own(runtime, "captureFinalOutcome") !== "function") {
    return { ok: false, reason: "learning_runtime_not_registered" };
  }
  const context = own(options, "marionLearningContext");
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
  const s = own(context, "signal");
  try {
    const captureResult = await runtime.captureFinalOutcome(Object.freeze({
      finalAccepted: true, learningConsent: true, signalId: own(s, "signalId").trim(),
      signalClass: own(s, "signalClass"), scope: own(s, "scope"), sourceSubsystem: own(s, "sourceSubsystem").trim(),
      outcomeScore: own(s, "outcomeScore"), occurredAt: own(s, "occurredAt") || ""
    }));
    // Do not return arbitrary runtime objects or invoke untrusted properties.
    if (!record(captureResult) || own(captureResult, "ok") !== true ||
        own(captureResult, "accepted") !== true) {
      return { ok: false, accepted: false, reason: "learning_capture_unconfirmed" };
    }
    return Object.freeze({ ok: true, accepted: true });
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
