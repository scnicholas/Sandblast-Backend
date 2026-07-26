"use strict";

/** Phase B Subtext Confidence Gate. */

const A = require("./marionNuanceEnvelope.js");
const registry = require("./marionPragmaticMarkerRegistry.js");

const VERSION = "nyx.marion.subtextConfidenceGate/1.0";
const CONTRACT = "nyx.marion.subtextConfidence/1.0";
const THRESHOLDS = Object.freeze({ lowUpperExclusive: .4, mediumUpperExclusive: .7, figurativeMinimum: .8 });
const STRICT_FIGURATIVE = Object.freeze([
  "sarcasm_possible", "irony_possible", "reluctant_acceptance_possible", "face_saving_language_possible"
]);

function band(value) {
  const confidence = A.clamp01(value);
  if (confidence < THRESHOLDS.lowUpperExclusive) return "low";
  if (confidence < THRESHOLDS.mediumUpperExclusive) return "medium";
  return "high";
}

function gateSubtext(pragmatic = {}, options = {}) {
  const source = A.safeRecord(pragmatic);
  const confidence = A.clamp01(source.confidence);
  const confidenceBand = band(confidence);
  const figurativeFlags = A.uniquePrimitiveStrings(source.figurativeFlags, 4, 100);
  const strictPresent = figurativeFlags.some((item) => STRICT_FIGURATIVE.includes(item));
  const figurativeInterpretationAllowed = !strictPresent || confidence >= THRESHOLDS.figurativeMinimum;
  const ambiguity = A.cleanText(source.ambiguity, "low");

  let subtextPolicy = "literal_only";
  if (confidenceBand === "medium") subtextPolicy = "literal_plus_cautious_pragmatic_response";
  if (confidenceBand === "high") subtextPolicy = "pragmatic_refinement_allowed";
  if (strictPresent && !figurativeInterpretationAllowed) subtextPolicy = confidenceBand === "low" ? "literal_only" : "literal_plus_cautious_pragmatic_response";

  const correction = ["direct_correction", "indirect_correction", "explicit_disagreement", "polite_disagreement"].includes(A.cleanText(source.primaryPragmaticIntent));
  const clarificationRequired = ambiguity === "high" || (ambiguity === "medium" && confidence < .55) || (strictPresent && !figurativeInterpretationAllowed && options.allowClarification !== false);

  return {
    contract: CONTRACT,
    version: VERSION,
    status: "ready",
    confidence: Number(confidence.toFixed(3)),
    confidenceBand,
    ambiguity,
    subtextPolicy,
    literalIntentPreserved: true,
    addressImpliedPurpose: subtextPolicy !== "literal_only",
    clarificationRequired,
    figurativeInterpretationAllowed,
    correctionOverride: correction,
    allowedPragmaticIntents: subtextPolicy === "literal_only" ? [] : [A.cleanText(source.primaryPragmaticIntent), ...A.safeArray(source.secondaryPragmaticIntents)].filter((item) => registry.ALL_CATEGORIES.includes(item)).slice(0, 3),
    blockedFigurativeFlags: figurativeFlags.filter((item) => STRICT_FIGURATIVE.includes(item) && !figurativeInterpretationAllowed),
    prohibitedActions: [
      "replace_literal_intent",
      "change_domain_from_subtext_alone",
      "create_approval_from_subtext",
      "create_commitment_from_subtext",
      "change_governing_goal_from_subtext",
      "authorize_execution_from_subtext",
      "infer_cultural_identity",
      "assert_sarcasm_as_fact"
    ]
  };
}

module.exports = {
  VERSION,
  CONTRACT,
  THRESHOLDS,
  STRICT_FIGURATIVE,
  band,
  gateSubtext,
  gate: gateSubtext,
  evaluate: gateSubtext,
  run: gateSubtext
};
