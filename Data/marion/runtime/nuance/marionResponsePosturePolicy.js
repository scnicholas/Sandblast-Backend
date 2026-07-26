"use strict";

/** Converts Layers 25-26 into bounded response-shaping metadata. */

const A = require("./marionNuanceEnvelope.js");

const VERSION = "nyx.marion.responsePosturePolicy/1.0";
const CONTRACT = "nyx.marion.responsePosture/1.0";

const STRUCTURES = Object.freeze({
  informative: ["direct_answer", "essential_context"],
  explanatory: ["direct_answer", "cause", "mechanism", "effect"],
  analytical: ["conclusion", "components", "relationships", "implications"],
  diagnostic: ["observed_failure", "likely_stage", "evidence", "next_discriminating_test"],
  exploratory: ["working_definition", "options", "tradeoffs", "open_question"],
  comparative: ["criteria", "option_comparison", "tradeoffs", "conditional_recommendation"],
  critical_assessment: ["direct_conclusion", "material_strengths", "critical_gaps", "required_controls"],
  synthesizing: ["shared_objective", "integrated_model", "conflicts_resolved", "resulting_framework"],
  planning: ["objective", "dependencies", "ordered_phases", "validation_gates"],
  procedural: ["prerequisites", "ordered_steps", "expected_result", "failure_checkpoint"],
  execution_focused: ["action_completed", "constraints_preserved", "validation_result"],
  coordinating: ["interfaces", "authority_boundaries", "dependency_order", "cohesion_check"],
  prioritizing: ["top_priority", "controlling_reason", "next_priorities"],
  corrective: ["acknowledge_distinction", "corrected_target", "repair", "continuation_point"],
  validating: ["criteria", "observed_result", "pass_fail_status", "remaining_gap"],
  decisive: ["recommendation", "controlling_reason", "material_caveat"],
  collaborative: ["shared_goal", "current_position", "joint_next_step"],
  supportive: ["acknowledgement", "manageable_next_step", "practical_support"],
  reassuring: ["evidence_based_reassurance", "contained_risk", "next_control"],
  grounding: ["current_objective", "immediate_step", "deferred_branches"],
  celebratory: ["verified_success", "what_changed", "next_stage"],
  restrained: ["direct_facts", "material_risk", "required_action"],
  protective: ["boundary_or_risk", "reason", "safer_path"],
  boundary_setting: ["clear_limit", "controlling_reason", "legitimate_alternative"]
});

function baseForStance(stance) {
  const direct = ["corrective", "decisive", "execution_focused", "boundary_setting", "prioritizing"].includes(stance);
  const warm = ["supportive", "reassuring", "collaborative", "celebratory"].includes(stance);
  const challenge = ["critical_assessment", "analytical", "diagnostic"].includes(stance);
  return {
    directness: direct ? .84 : .64,
    warmth: warm ? .7 : .42,
    challenge: challenge ? .62 : .18,
    reassurance: stance === "reassuring" ? .68 : .1,
    humour: stance === "celebratory" ? .16 : 0
  };
}

function applyModifier(posture, modifier) {
  const next = { ...posture };
  if (modifier === "warm") next.warmth += .12;
  if (modifier === "neutral") next.warmth -= .12;
  if (modifier === "firm") next.directness += .12;
  if (modifier === "gentle") { next.warmth += .1; next.challenge -= .08; }
  if (modifier === "urgent") next.directness += .08;
  if (modifier === "cautious") { next.challenge -= .04; next.reassurance -= .04; }
  if (modifier === "risk_forward") next.challenge += .08;
  return next;
}

function buildResponsePosture(stanceResult = {}, pragmatic = {}, gate = {}, phaseA = {}, options = {}) {
  const stance = A.safeRecord(stanceResult);
  const pragmaticResult = A.safeRecord(pragmatic);
  const gateResult = A.safeRecord(gate);
  const primary = A.cleanText(stance.primaryStance, "informative");
  let posture = baseForStance(primary);
  for (const modifier of A.safeArray(stance.modifiers)) posture = applyModifier(posture, modifier);

  const phaseAGate = A.safeRecord(A.safeRecord(phaseA).layer23);
  const figurativeFlags = A.safeArray(pragmaticResult.figurativeFlags);
  const humourAllowed = primary === "celebratory" && figurativeFlags.includes("humour_possible") && gateResult.figurativeInterpretationAllowed === true && phaseAGate.confidenceBand !== "low";
  const reassuranceRequested = pragmaticResult.primaryPragmaticIntent === "request_for_reassurance" || A.safeArray(pragmaticResult.secondaryPragmaticIntents).includes("request_for_reassurance");
  const riskWarningRequired = ["protective", "boundary_setting", "critical_assessment", "diagnostic"].includes(primary);

  posture = Object.fromEntries(Object.entries(posture).map(([key, value]) => [key, Number(A.clamp01(value).toFixed(3))]));
  if (!humourAllowed) posture.humour = 0;
  if (reassuranceRequested && riskWarningRequired) posture.reassurance = Math.min(posture.reassurance, .24);

  return {
    contract: CONTRACT,
    version: VERSION,
    status: "ready",
    stance: primary,
    pragmaticIntent: A.cleanText(pragmaticResult.primaryPragmaticIntent, "request_for_information"),
    directness: posture.directness,
    warmth: posture.warmth,
    challenge: posture.challenge,
    reassurance: posture.reassurance,
    humour: posture.humour,
    humourAllowed,
    answerStructure: A.uniquePrimitiveStrings(STRUCTURES[primary] || STRUCTURES.informative, 6, 100),
    explanationDepth: A.cleanText(A.safeRecord(stance.responsePostureSeed).explanationDepth, "focused"),
    requirements: {
      answerLiteralQuestion: true,
      addressImpliedPurpose: gateResult.addressImpliedPurpose === true,
      preserveCurrentTurnCorrection: gateResult.correctionOverride === true,
      preserveRiskWarning: riskWarningRequired,
      evidenceBasedReassuranceOnly: reassuranceRequested,
      noUserFacingMetadata: true
    },
    authorityBoundaries: {
      factualAuthorityUnchanged: true,
      semanticAuthorityUnchanged: true,
      routingAuthorityUnchanged: true,
      approvalAuthorityCreated: false,
      executionAuthorityCreated: false,
      commitmentAuthorityCreated: false,
      goalChangeAuthorityCreated: false
    }
  };
}

module.exports = {
  VERSION,
  CONTRACT,
  STRUCTURES,
  buildResponsePosture,
  build: buildResponsePosture,
  resolve: buildResponsePosture,
  run: buildResponsePosture
};
