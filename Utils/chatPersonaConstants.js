"use strict";

/**
 * utils/chatPersonaConstants.js
 *
 * chatPersonaConstants v1.0.0
 * ------------------------------------------------------------
 * PURPOSE
 * - Extract persona/tone constants out of chatEngine.js
 * - Keep runtime turn execution lean
 * - Preserve reusable identity/style constants in one place
 * - Provide a stable export surface for optional downstream use
 *
 * 15 PHASE COVERAGE
 * ------------------------------------------------------------
 * Phase 01: Constant isolation
 * Phase 02: Immutable export shaping
 * Phase 03: Latent desire taxonomy
 * Phase 04: Signature transition set
 * Phase 05: Safe string normalization
 * Phase 06: Read-only access helpers
 * Phase 07: Seeded pick helper
 * Phase 08: Optional lookup by key
 * Phase 09: Fail-open fallback values
 * Phase 10: Minimal diagnostics metadata
 * Phase 11: Structural stability
 * Phase 12: No runtime side effects
 * Phase 13: Lightweight reuse surface
 * Phase 14: Version tagging
 * Phase 15: Export hardening
 */

const CPC_VERSION = "chatPersonaConstants v1.0.0";

function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}

function oneLine(s) {
  return safeStr(s).replace(/\s+/g, " ").trim();
}

function sha1Lite(str) {
  const s = safeStr(str);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

const LATENT_DESIRE = Object.freeze({
  AUTHORITY: "authority",
  COMFORT: "comfort",
  CURIOSITY: "curiosity",
  VALIDATION: "validation",
  MASTERY: "mastery"
});

const SIGNATURE_TRANSITIONS = Object.freeze([
  "Now we widen the lens.",
  "This is where it starts to mean something.",
  "Let us slow this down for a second.",
  "Here is the connective tissue.",
  "This is not random—watch."
]);

function getLatentDesireKeys() {
  return Object.freeze(Object.keys(LATENT_DESIRE));
}

function getLatentDesireValues() {
  return Object.freeze(Object.values(LATENT_DESIRE));
}

function getSignatureTransitions() {
  return Object.freeze(SIGNATURE_TRANSITIONS.slice());
}

function getLatentDesireByKey(key) {
  const k = oneLine(key || "").toUpperCase();
  return LATENT_DESIRE[k] || null;
}

function pickSignatureTransition(seed) {
  const list = SIGNATURE_TRANSITIONS;
  if (!list.length) return "";
  const h = parseInt(sha1Lite(seed || "").slice(0, 8), 16);
  const idx = Number.isFinite(h) ? (h % list.length) : 0;
  return safeStr(list[idx] || "");
}

function getPersonaStatus() {
  return {
    ok: true,
    version: CPC_VERSION,
    latentDesireCount: Object.keys(LATENT_DESIRE).length,
    signatureTransitionCount: SIGNATURE_TRANSITIONS.length
  };
}

module.exports = {
  CPC_VERSION,
  LATENT_DESIRE,
  SIGNATURE_TRANSITIONS,
  getLatentDesireKeys,
  getLatentDesireValues,
  getLatentDesireByKey,
  getSignatureTransitions,
  pickSignatureTransition,
  getPersonaStatus
};
