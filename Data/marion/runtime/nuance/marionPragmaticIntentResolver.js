"use strict";

/** Layer 26 — Pragmatic Intent and Subtext Resolution. */

const A = require("./marionNuanceEnvelope.js");
const registry = require("./marionPragmaticMarkerRegistry.js");

const VERSION = "nyx.marion.pragmaticIntentResolver/1.0";
const CONTRACT = "nyx.marion.nuance.layer26/1.0";
const LAYER = 26;

function inferLiteralIntent(input = {}, text = "") {
  const source = A.safeRecord(input);
  const routing = A.safeRecord(source.routing);
  const explicit = A.cleanText(source.intent || source.canonicalIntent || routing.intent);
  if (explicit) return explicit;
  if (/^(?:what|who|where|when|which)\b/i.test(text)) return "information_question";
  if (/^why\b/i.test(text)) return "explanation_question";
  if (/^how\b/i.test(text)) return "procedure_or_explanation_question";
  if (/^(?:is|are|did|does|do|can|could|would|should|will|may)\b/i.test(text)) return "confirmation_question";
  if (/^(?:please\s+)?(?:create|make|fix|update|address|remove|add|resend|run|build)\b/i.test(text)) return "directive";
  return "statement_or_context";
}

function addOrRaise(map, match, boost = 0, reason = "") {
  const category = A.cleanText(match.category);
  if (!registry.ALL_CATEGORIES.includes(category)) return;
  const current = map.get(category) || { category, family: registry.familyFor(category), confidence: 0, evidence: [], figurative: match.figurative === true };
  current.confidence = Math.max(current.confidence, A.clamp01(Number(match.confidence || 0) + boost));
  current.evidence = A.uniquePrimitiveStrings([...current.evidence, ...A.safeArray(match.evidence), ...(reason ? [reason] : [])], 8, 100);
  current.figurative = current.figurative || match.figurative === true;
  map.set(category, current);
}

function resolvePragmaticIntent(input = {}, phaseA = {}, stance = {}, options = {}) {
  const text = A.extractCanonicalText(input);
  const matches = registry.matchPragmaticMarkers(text);
  const map = new Map();
  for (const match of matches) addOrRaise(map, match);

  const a = A.safeRecord(phaseA);
  const state = A.cleanText(A.safeRecord(a.layer24).currentState);
  const signals = A.safeRecord(a.layer21);
  const markers = A.safeRecord(signals.interactionMarkers);

  if (state === "correction") addOrRaise(map, { category: "direct_correction", confidence: .82, evidence: ["layer24_correction_state"] }, .08);
  if (state === "disagreement") addOrRaise(map, { category: "explicit_disagreement", confidence: .76, evidence: ["layer24_disagreement_state"] }, .06);
  if (state === "continuation") addOrRaise(map, { category: "implied_continuation", confidence: .68, evidence: ["layer24_continuation_state"] }, .06);
  if (state === "topic_pivot") addOrRaise(map, { category: "topic_pivot", confidence: .8, evidence: ["layer24_topic_pivot_state"] });
  if (state === "closure") addOrRaise(map, { category: "closure_request", confidence: .76, evidence: ["layer24_closure_state"] });
  if (markers.correctionMarker === true && !map.has("direct_correction")) addOrRaise(map, { category: "indirect_correction", confidence: .62, evidence: ["layer21_correction_marker"] });
  if (markers.continuationMarker === true) addOrRaise(map, { category: "implied_continuation", confidence: .64, evidence: ["layer21_continuation_marker"] });
  if (markers.validationMarker === true && /\?/.test(text)) addOrRaise(map, { category: "request_for_validation", confidence: .66, evidence: ["layer21_validation_marker"] });

  const ranked = [...map.values()].sort((left, right) => right.confidence - left.confidence || registry.ALL_CATEGORIES.indexOf(left.category) - registry.ALL_CATEGORIES.indexOf(right.category));
  const controls = ranked.filter((item) => item.family === "conversation_control");
  const figurative = ranked.filter((item) => item.family === "figurative_subtext");
  const substantive = ranked.filter((item) => !["conversation_control", "figurative_subtext"].includes(item.family));

  const literalIntent = inferLiteralIntent(input, text);
  const primary = substantive[0] || controls[0] || { category: literalIntent.includes("directive") ? "request_for_action" : "request_for_information", confidence: .42, evidence: ["literal_form_default"], family: literalIntent.includes("directive") ? "action_operational" : "knowledge_seeking" };
  const secondary = substantive.filter((item) => item.category !== primary.category).slice(0, 2);
  const conversationControl = controls[0] || null;
  const figurativeFlags = figurative.slice(0, 2).map((item) => item.category);

  const combinedConfidence = A.clamp01(primary.confidence + (state === "correction" && primary.category.includes("correction") ? .06 : 0));

  return {
    contract: CONTRACT,
    version: VERSION,
    layer: LAYER,
    status: "ready",
    available: true,
    degraded: false,
    turnId: A.extractTurnId(input, options.turnId),
    literalIntent,
    primaryPragmaticIntent: primary.category,
    primaryFamily: primary.family || registry.familyFor(primary.category),
    secondaryPragmaticIntents: secondary.map((item) => item.category),
    secondaryDetails: secondary.map((item) => ({ category: item.category, confidence: Number(A.clamp01(item.confidence).toFixed(3)) })),
    conversationControl: conversationControl ? { category: conversationControl.category, confidence: Number(A.clamp01(conversationControl.confidence).toFixed(3)) } : null,
    figurativeFlags,
    confidence: Number(combinedConfidence.toFixed(3)),
    ambiguity: ranked.length > 1 && Math.abs(ranked[0].confidence - ranked[1].confidence) < .1 ? "medium" : "low",
    literalIntentPreserved: true,
    evidence: A.uniquePrimitiveStrings(primary.evidence, 8, 100),
    allCandidateDetails: ranked.slice(0, 8).map((item) => ({
      category: item.category,
      family: item.family,
      confidence: Number(A.clamp01(item.confidence).toFixed(3)),
      figurative: item.figurative === true
    })),
    safeguards: {
      literalRequestMustBeAnswered: true,
      subtextMayChangeDomain: false,
      subtextMayCreateApproval: false,
      subtextMayCreateCommitment: false,
      subtextMayChangeGoverningGoal: false,
      subtextMayAuthorizeExecution: false,
      culturalIdentityInferencePerformed: false
    }
  };
}

module.exports = {
  VERSION,
  CONTRACT,
  LAYER,
  resolvePragmaticIntent,
  resolve: resolvePragmaticIntent,
  analyze: resolvePragmaticIntent,
  run: resolvePragmaticIntent
};
