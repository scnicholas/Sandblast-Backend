"use strict";

/** Marion Nuance Phase B Coordinator — Layers 21-26. */

const A = require("./marionNuanceEnvelope.js");
const B = require("./marionNuancePhaseBEnvelope.js");

const VERSION = "nyx.marion.nuancePhaseBCoordinator/1.0";
const CONTRACT = B.CONTRACT;
const HARD_STOP_LAYER = 26;

function normalizePhaseBInput(input = {}) {
  const original = A.safeRecord(input);
  const source = { ...original };
  if (A.extractCanonicalText(source)) return source;
  const body = A.safeRecord(source.body);
  const payload = A.safeRecord(source.payload);
  const voice = A.firstRecord(source.voice, source.voiceEnvelope, payload.voice, payload.voiceEnvelope);
  const transcript = A.firstText(
    source.transcript, source.spokenText, source.voiceTranscript,
    body.transcript, body.spokenText, body.voiceTranscript,
    payload.transcript, payload.spokenText, payload.voiceTranscript,
    voice.transcript, voice.text, voice.spokenText
  ).slice(0, 12000);
  if (transcript) {
    source.rawUserText = transcript;
    source.userText = transcript;
    source.message = transcript;
  }
  return source;
}

function load(path, names) {
  try {
    const mod = require(path);
    const handlerName = names.find((name) => typeof mod[name] === "function");
    if (!handlerName) throw new Error(`missing_expected_export:${names.join("|")}`);
    return { ok: true, mod, handler: mod[handlerName], handlerName, version: A.cleanText(mod.VERSION) };
  } catch (error) {
    return { ok: false, mod: null, handler: null, handlerName: "", version: "", error };
  }
}

const modules = Object.freeze({
  phaseA: load("./marionNuancePhaseACoordinator.js", ["analyzeMarionNuancePhaseA", "safeAnalyzeMarionNuancePhaseA", "run", "analyze"]),
  layer25: load("./marionConversationalStanceResolver.js", ["resolveConversationalStance", "resolve", "analyze", "run"]),
  layer26: load("./marionPragmaticIntentResolver.js", ["resolvePragmaticIntent", "resolve", "analyze", "run"]),
  gate: load("./marionSubtextConfidenceGate.js", ["gateSubtext", "gate", "evaluate", "run"]),
  posture: load("./marionResponsePosturePolicy.js", ["buildResponsePosture", "build", "resolve", "run"])
});

function moduleHealth() {
  const status = {};
  let ok = true;
  for (const [name, item] of Object.entries(modules)) {
    status[name] = { available: item.ok, version: item.version, handler: item.handlerName };
    if (!item.ok) ok = false;
  }
  return {
    ok,
    version: VERSION,
    contract: CONTRACT,
    phase: "B",
    hardStopLayer: HARD_STOP_LAYER,
    phaseAHardStopLayer: 24,
    modules: status,
    phaseACalledOnce: true,
    failOpenToPhaseA: true,
    noUserFacingDiagnostics: true
  };
}

function recordFailure(target, stage, error) {
  const diagnostics = A.safeRecord(target.diagnostics);
  const failed = A.safeArray(diagnostics.failedStages);
  failed.push(A.safeErrorDescriptor(error, stage));
  target.diagnostics = {
    ...diagnostics,
    available: false,
    degraded: true,
    failedStages: failed.slice(0, 12),
    noUserFacingDiagnostics: true,
    noRawMarkerEvidenceInTransport: true
  };
}

function runStage(target, name, loaded, fallback, invoke) {
  if (!loaded.ok || typeof loaded.handler !== "function") {
    recordFailure(target, name, loaded.error || new Error("module_unavailable"));
    return { ...fallback, status: "unavailable", available: false, degraded: true };
  }
  try {
    const result = invoke(loaded.handler);
    if (!A.isRecord(result)) throw new TypeError("phase_b_stage_invalid_result");
    return result;
  } catch (error) {
    recordFailure(target, name, error);
    return { ...fallback, status: "degraded", available: true, degraded: true };
  }
}

function reusable(value, turnId) {
  const source = A.safeRecord(value);
  return source.contract === CONTRACT && source.phase === "B" && (!turnId || source.turnId === turnId) && B.validatePhaseBEnvelope(source).ok;
}

function existingPhaseA(input = {}, options = {}) {
  const source = A.safeRecord(input);
  const candidates = [source.phaseA, source.phaseANuance, source.nuanceContext, A.safeRecord(source.payload).nuanceContext, options.phaseA];
  for (const candidate of candidates) {
    const item = A.safeRecord(candidate);
    if (item.contract === A.CONTRACT && item.phase === "A") return item;
    if (item.contract === CONTRACT && A.safeRecord(item.phaseA).contract === A.CONTRACT) return item.phaseA;
  }
  return {};
}

function analyzeMarionNuancePhaseB(input = {}, options = {}) {
  const source = normalizePhaseBInput(input);
  const turnId = A.extractTurnId(source, options.turnId);
  const existing = A.firstRecord(source.phaseBNuance, source.nuanceContext, A.safeRecord(source.payload).nuanceContext, options.nuanceContext);
  if (options.force !== true && reusable(existing, turnId)) return existing;

  let phaseA = existingPhaseA(source, options);
  if (!phaseA.contract) {
    if (!modules.phaseA.ok) {
      const fallbackA = A.createMarionNuanceEnvelope(source, { turnId: turnId || undefined });
      phaseA = fallbackA;
    } else {
      phaseA = modules.phaseA.handler(source, {
        turnId,
        previousNuanceState: options.previousNuanceState || options.previousState
      });
    }
  }

  const output = B.createPhaseBEnvelope(source, phaseA, { turnId: turnId || phaseA.turnId || undefined, coordinatorVersion: VERSION });

  output.layer25 = runStage(output, "layer25_stance_resolution", modules.layer25, output.layer25, (handler) => handler(source, phaseA, { turnId: output.turnId }));
  output.layer26 = runStage(output, "layer26_pragmatic_intent", modules.layer26, output.layer26, (handler) => handler(source, phaseA, output.layer25, { turnId: output.turnId }));
  output.subtextGate = runStage(output, "subtext_confidence_gate", modules.gate, output.subtextGate, (handler) => handler(output.layer26, { allowClarification: options.allowClarification !== false }));
  output.responsePosture = runStage(output, "response_posture_policy", modules.posture, output.responsePosture, (handler) => handler(output.layer25, output.layer26, output.subtextGate, phaseA, options));

  output.carryPolicy = {
    version: B.STATE_CONTRACT,
    status: "ready",
    approvedStatePatch: B.buildPhaseBStatePatch(output, options.previousNuanceState || options.previousState)
  };
  output.validation = B.validatePhaseBEnvelope(output);
  output.health = moduleHealth();
  output.internalSummary = B.projectInternalPhaseBSummary(output);
  output.diagnostics = {
    ...A.safeRecord(output.diagnostics),
    available: output.validation.ok && output.diagnostics.degraded !== true,
    degraded: !output.validation.ok || output.diagnostics.degraded === true,
    validationErrors: A.uniquePrimitiveStrings(output.validation.errors, 16, 100),
    noUserFacingDiagnostics: true,
    noRawMarkerEvidenceInTransport: true,
    noCulturalIdentityInference: true,
    noAutonomousExecutionAuthority: true
  };
  return output;
}

function safeAnalyzeMarionNuancePhaseB(input = {}, options = {}) {
  try {
    return analyzeMarionNuancePhaseB(input, options);
  } catch (error) {
    const source = normalizePhaseBInput(input);
    const phaseA = existingPhaseA(source, options) || {};
    const output = B.createPhaseBEnvelope(source, phaseA);
    recordFailure(output, "phase_b_coordinator", error);
    output.validation = B.validatePhaseBEnvelope(output);
    output.health = moduleHealth();
    output.internalSummary = B.projectInternalPhaseBSummary(output);
    return output;
  }
}

function attachNuanceContext(input = {}, options = {}) {
  const source = normalizePhaseBInput(input);
  const nuanceContext = analyzeMarionNuancePhaseB(source, options);
  return {
    ...source,
    nuanceContext,
    phaseBNuance: nuanceContext,
    nuanceStatePatch: A.safeRecord(A.safeRecord(nuanceContext.carryPolicy).approvedStatePatch)
  };
}

module.exports = {
  VERSION,
  CONTRACT,
  HARD_STOP_LAYER,
  moduleHealth,
  analyzeMarionNuancePhaseB,
  safeAnalyzeMarionNuancePhaseB,
  attachNuanceContext,
  analyze: analyzeMarionNuancePhaseB,
  coordinate: analyzeMarionNuancePhaseB,
  run: analyzeMarionNuancePhaseB,
  handle: analyzeMarionNuancePhaseB
};
