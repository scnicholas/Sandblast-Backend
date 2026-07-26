"use strict";

/**
 * Marion Nuance Phase B Envelope
 * Combined contract for Layers 21-26.
 */

const A = require("./marionNuanceEnvelope.js");

const VERSION = "nyx.marion.nuancePhaseBEnvelope/1.0";
const CONTRACT = "nyx.marion.nuance.phaseB/1.0";
const STATE_CONTRACT = "nyx.marion.nuanceState.phaseB/1.0";
const HARD_STOP_LAYER = 26;

function safeRecord(value) { return A.safeRecord(value); }
function cleanText(value, fallback = "") { return A.cleanText(value, fallback); }
function clamp01(value) { return A.clamp01(value); }

function createLayerState(layer, version) {
  return {
    layer,
    version: cleanText(version),
    status: "pending",
    available: true,
    degraded: false
  };
}

function createPhaseBEnvelope(input = {}, phaseA = {}, seed = {}) {
  const source = safeRecord(input);
  const base = safeRecord(seed);
  const phaseARecord = safeRecord(phaseA);
  const now = Number.isFinite(Number(base.createdAt)) ? Number(base.createdAt) : Date.now();
  const turnId = A.extractTurnId(source, phaseARecord.turnId || `nuance-b-${now}`);

  return {
    contract: CONTRACT,
    version: VERSION,
    stateContract: STATE_CONTRACT,
    phase: "B",
    hardStopLayer: HARD_STOP_LAYER,
    turnId,
    conversationId: A.extractConversationId(source, phaseARecord.conversationId || ""),
    inputChannel: A.extractInputChannel(source),
    scope: A.extractScope(source),
    partitionClass: A.extractScope(source) === "private_admin" ? "private_admin" : "public",
    createdAt: now,
    phaseA: phaseARecord,
    layer25: createLayerState(25, "nyx.marion.conversationalStanceResolver/1.0"),
    layer26: createLayerState(26, "nyx.marion.pragmaticIntentResolver/1.0"),
    subtextGate: {
      version: "nyx.marion.subtextConfidenceGate/1.0",
      status: "pending",
      literalIntentPreserved: true
    },
    responsePosture: {
      version: "nyx.marion.responsePosturePolicy/1.0",
      status: "pending",
      factualAuthorityUnchanged: true
    },
    carryPolicy: {
      version: STATE_CONTRACT,
      status: "pending",
      approvedStatePatch: {}
    },
    diagnostics: {
      available: true,
      degraded: false,
      failedStages: [],
      noUserFacingDiagnostics: true,
      noRawMarkerEvidenceInTransport: true,
      noCulturalIdentityInference: true,
      noAutonomousExecutionAuthority: true
    },
    ...base
  };
}

function validatePhaseBEnvelope(value = {}) {
  const source = safeRecord(value);
  const errors = [];
  if (source.contract !== CONTRACT) errors.push("contract_mismatch");
  if (source.phase !== "B") errors.push("phase_mismatch");
  if (Number(source.hardStopLayer) !== HARD_STOP_LAYER) errors.push("hard_stop_mismatch");
  if (!cleanText(source.turnId)) errors.push("turn_id_missing");
  if (!safeRecord(source.phaseA).contract) errors.push("phase_a_missing");
  if (!safeRecord(source.layer25).layer) errors.push("layer25_missing");
  if (!safeRecord(source.layer26).layer) errors.push("layer26_missing");
  if (!safeRecord(source.subtextGate).version) errors.push("subtext_gate_missing");
  if (!safeRecord(source.responsePosture).version) errors.push("response_posture_missing");
  return { ok: errors.length === 0, contract: CONTRACT, errors };
}

function projectInternalPhaseBSummary(value = {}) {
  const source = safeRecord(value);
  const stance = safeRecord(source.layer25);
  const pragmatic = safeRecord(source.layer26);
  const gate = safeRecord(source.subtextGate);
  const posture = safeRecord(source.responsePosture);
  return {
    contract: CONTRACT,
    version: VERSION,
    phase: "B",
    turnId: cleanText(source.turnId),
    interactionState: cleanText(safeRecord(source.phaseA.layer24).currentState, "exploration"),
    primaryStance: cleanText(stance.primaryStance, "informative"),
    secondaryStances: A.uniquePrimitiveStrings(stance.secondaryStances, 2, 80),
    modifiers: A.uniquePrimitiveStrings(stance.modifiers, 4, 80),
    stanceConfidence: clamp01(stance.confidence),
    literalIntent: cleanText(pragmatic.literalIntent, "unknown"),
    primaryPragmaticIntent: cleanText(pragmatic.primaryPragmaticIntent, "request_for_information"),
    secondaryPragmaticIntents: A.uniquePrimitiveStrings(pragmatic.secondaryPragmaticIntents, 2, 100),
    conversationControl: cleanText(safeRecord(pragmatic.conversationControl).category),
    figurativeFlags: A.uniquePrimitiveStrings(pragmatic.figurativeFlags, 2, 100),
    pragmaticConfidence: clamp01(pragmatic.confidence),
    subtextPolicy: cleanText(gate.subtextPolicy, "literal_only"),
    answerStructure: A.uniquePrimitiveStrings(posture.answerStructure, 6, 100),
    literalIntentPreserved: gate.literalIntentPreserved !== false,
    noUserFacingDiagnostics: true
  };
}

function buildPhaseBStatePatch(value = {}, previous = {}) {
  const source = safeRecord(value);
  const prior = safeRecord(previous);
  const stance = safeRecord(source.layer25);
  const pragmatic = safeRecord(source.layer26);
  const gate = safeRecord(source.subtextGate);
  const phaseAPatch = safeRecord(safeRecord(source.phaseA.carryPolicy).approvedStatePatch);
  const primaryPragmatic = cleanText(pragmatic.primaryPragmaticIntent);
  const pragmaticConfidence = clamp01(pragmatic.confidence);
  const carryPragmatic = pragmaticConfidence >= 0.4 && gate.subtextPolicy !== "literal_only";

  return {
    ...phaseAPatch,
    contract: STATE_CONTRACT,
    revision: Math.max(Number(prior.revision) || 0, Number(phaseAPatch.revision) || 0) + 1,
    lastUpdatedTurnId: cleanText(source.turnId),
    lastStance: cleanText(stance.primaryStance),
    stanceConfidence: clamp01(stance.confidence),
    stanceTtlTurns: cleanText(stance.primaryStance) ? 2 : 0,
    pragmaticIntent: carryPragmatic ? primaryPragmatic : "",
    pragmaticIntentConfidence: carryPragmatic ? pragmaticConfidence : 0,
    pragmaticIntentTtlTurns: carryPragmatic ? 1 : 0,
    policies: {
      ...safeRecord(phaseAPatch.policies),
      literalIntentPreserved: true,
      rawMarkerEvidenceCarryAllowed: false,
      sarcasmEvidenceCarryAllowed: false,
      unconfirmedApprovalCarryAllowed: false,
      unconfirmedGoalCarryAllowed: false,
      stanceMayChangeFacts: false,
      pragmaticIntentMayAuthorizeExecution: false,
      crossPartitionCarryAllowed: false
    }
  };
}

module.exports = {
  VERSION,
  CONTRACT,
  STATE_CONTRACT,
  HARD_STOP_LAYER,
  createPhaseBEnvelope,
  validatePhaseBEnvelope,
  projectInternalPhaseBSummary,
  buildPhaseBStatePatch,
  create: createPhaseBEnvelope,
  validate: validatePhaseBEnvelope,
  project: projectInternalPhaseBSummary
};
