"use strict";

/**
 * marionFinalEnvelope.js
 * Standardizes Marion outbound responses.
 *
 * Purpose:
 * - Every valid Marion reply leaves with one consistent final envelope.
 * - Makes it easy for index.js, MarionBridge, and Nyx widget to verify:
 *   "This is a fresh Marion final."
 *
 * This file does NOT compose the reply.
 * This file does NOT route intent.
 * This file does NOT manage fallback.
 */

const VERSION = "marionFinalEnvelope v1.0.0 MARION-FINAL-SIGNATURE";

const CONTRACT_VERSION = "nyx.marion.final/1.0";
const FINAL_SIGNATURE = "MARION_FINAL_AUTHORITY";
const SOURCE = "marion";

function safeStr(value) {
  return value == null ? "" : String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "final") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeIntent(value) {
  return safeStr(value || "simple_chat");
}

function normalizeDomain(value) {
  return safeStr(value || "general");
}

function createMarionFinalEnvelope(input = {}) {
  const reply = safeStr(
    input.reply ||
    input.message ||
    input.text ||
    input.content ||
    ""
  );

  const intent = normalizeIntent(
    input.intent ||
    input.marionIntent?.intent ||
    input.routing?.intent
  );

  const domain = normalizeDomain(
    input.domain ||
    input.routing?.domain
  );

  const stateStage = safeStr(
    input.stateStage ||
    input.state?.stateStage ||
    "final"
  );

  const envelope = {
    ok: !!reply,
    final: true,
    source: SOURCE,
    signature: FINAL_SIGNATURE,

    contractVersion: CONTRACT_VERSION,
    envelopeVersion: VERSION,
    envelopeId: makeId("marion_final"),
    createdAt: nowIso(),

    reply,

    intent,
    domain,
    stateStage,

    routing: {
      intent,
      domain,
      mode: safeStr(input.routing?.mode || ""),
      depth: safeStr(input.routing?.depth || ""),
      endpoint: safeStr(input.routing?.endpoint || "")
    },

    state: {
      sessionId: safeStr(input.sessionId || input.state?.sessionId || ""),
      conversationDepth: Number.isFinite(Number(input.state?.conversationDepth))
        ? Number(input.state.conversationDepth)
        : 0,
      loopCount: Number.isFinite(Number(input.state?.loopCount))
        ? Number(input.state.loopCount)
        : 0,
      recoveryRequired: !!input.state?.recoveryRequired
    },

    meta: {
      freshMarionFinal: true,
      singleFinalAuthority: true,
      bridgeCompatible: true,
      widgetCompatible: true,
      ttsCompatible: true,

      normalizerVersion: safeStr(input.meta?.normalizerVersion || ""),
      routerVersion: safeStr(input.meta?.routerVersion || ""),
      bridgeVersion: safeStr(input.meta?.bridgeVersion || ""),
      composerVersion: safeStr(input.meta?.composerVersion || ""),
      stateSpineVersion: safeStr(input.meta?.stateSpineVersion || ""),
      loopGuardVersion: safeStr(input.meta?.loopGuardVersion || ""),

      reason: safeStr(input.meta?.reason || ""),
      diagnostics: input.meta?.diagnostics || {}
    }
  };

  return envelope;
}

function createMarionErrorEnvelope(input = {}) {
  const message = safeStr(
    input.reply ||
    input.message ||
    "Marion could not produce a valid final response."
  );

  return {
    ok: false,
    final: true,
    source: SOURCE,
    signature: FINAL_SIGNATURE,

    contractVersion: CONTRACT_VERSION,
    envelopeVersion: VERSION,
    envelopeId: makeId("marion_error"),
    createdAt: nowIso(),

    reply: message,

    intent: normalizeIntent(input.intent || "unknown"),
    domain: normalizeDomain(input.domain || "general"),
    stateStage: safeStr(input.stateStage || "error"),

    error: {
      code: safeStr(input.code || "MARION_FINAL_ERROR"),
      detail: safeStr(input.detail || input.error || "")
    },

    meta: {
      freshMarionFinal: true,
      singleFinalAuthority: true,
      bridgeCompatible: true,
      widgetCompatible: true,
      ttsCompatible: false,
      diagnostics: input.meta?.diagnostics || {}
    }
  };
}

function isMarionFinalEnvelope(value) {
  return !!(
    value &&
    typeof value === "object" &&
    value.final === true &&
    value.source === SOURCE &&
    value.signature === FINAL_SIGNATURE &&
    value.contractVersion === CONTRACT_VERSION &&
    typeof value.reply === "string"
  );
}

function unwrapReply(value) {
  if (isMarionFinalEnvelope(value)) return value.reply;
  return safeStr(value?.reply || value?.message || value?.text || "");
}

module.exports = {
  VERSION,
  CONTRACT_VERSION,
  FINAL_SIGNATURE,
  createMarionFinalEnvelope,
  createMarionErrorEnvelope,
  isMarionFinalEnvelope,
  unwrapReply
};
