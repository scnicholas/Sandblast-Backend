"use strict";

const VERSION = "marionFinalEnvelope v2.1.2 FINAL-COMPLETION-AUTHORITY-GUARDED";
const CONTRACT_VERSION = "nyx.marion.final/1.0";
const FINAL_SIGNATURE = "MARION_FINAL_AUTHORITY";
const SOURCE = "marion";
const REQUIRED_CHAT_ENGINE_SIGNATURE = "CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24";
const MARION_FINAL_SIGNATURE_PREFIX = "MARION::FINAL::";
const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";

const FINAL_MARKERS = Object.freeze([
  REQUIRED_CHAT_ENGINE_SIGNATURE,
  VERSION,
  CONTRACT_VERSION,
  FINAL_SIGNATURE,
  STATE_SPINE_SCHEMA,
  STATE_SPINE_SCHEMA_COMPAT
]);

function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function isObj(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function safeObj(value) { return isObj(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function nowIso() { return new Date().toISOString(); }

function lower(value) { return safeStr(value).toLowerCase(); }

const SOFT_RECOVERY_REPLY_PATTERNS = Object.freeze([
  /\bstill here\b.*\brun that one more time\b/i,
  /\bthere was a break in the response\b/i,
  /\bresponse path was interrupted\b/i,
  /\bmarion completed the final reply\b/i,
  /\bkeeping the turn non-emotional\b/i,
  /\brouting it back through the final-envelope path\b/i,
  /\bi[’']?m here and tracking the turn\b/i,
  /\bgive me the next clear target\b/i,
  /\bnyx is live and tracking the turn\b/i
]);

function isSoftRecoveryReply(value) {
  const text = lower(value);
  return !!(text && SOFT_RECOVERY_REPLY_PATTERNS.some((rx) => rx.test(text)));
}

function isActionableFinalReply(value) {
  const text = safeStr(value);
  if (!text || text.length < 8) return false;
  if (isSoftRecoveryReply(text)) return false;
  if (/\b(final envelope missing|diagnostic packet|non-final|composer_invalid|compose_reply_missing|marion did not return)\b/i.test(text)) return false;
  return true;
}

function buildCompletionStatus({ reply, resolvedEmotion, memoryPatch, diagnostics }) {
  const hasEmotion = !!Object.keys(safeObj(resolvedEmotion)).length;
  const hasMemory = !!Object.keys(safeObj(memoryPatch)).length;
  const actionable = isActionableFinalReply(reply);
  const softRecovery = isSoftRecoveryReply(reply);
  const explicitFailure = !!(safeObj(diagnostics).error || safeObj(diagnostics).bridgeError || safeObj(diagnostics).composerRecoveredByBridge);
  const confidence = actionable ? (hasEmotion ? 0.99 : 0.96) : (softRecovery ? 0.18 : 0.35);
  return {
    complete: actionable && !explicitFailure,
    stabilized: actionable && !softRecovery,
    actionableReply: actionable,
    emotionallyCoherentFinal: actionable && hasEmotion,
    memoryPatchPresent: hasMemory,
    completionConfidence: confidence,
    requiresRetry: !actionable || explicitFailure,
    recoverySuggested: !actionable || explicitFailure,
    softRecoveryDetected: softRecovery,
    reason: actionable && !explicitFailure ? 'trusted_final_reply_complete' : (softRecovery ? 'soft_recovery_reply_not_final' : 'reply_not_actionable')
  };
}


function hashText(value) {
  const source = safeStr(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) { hash = ((hash << 5) - hash) + source.charCodeAt(i); hash |= 0; }
  return String(hash >>> 0);
}

function cleanToken(value, fallback) {
  const token = safeStr(value || fallback || "turn").replace(/::+/g, ":").replace(/\s+/g, "_").slice(0, 180);
  return token || safeStr(fallback || "turn");
}

function makeId(prefix = "marion_final") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildFinalSignature({ reply = "", turnId = "", replySignature = "", bridgeVersion = "", composerVersion = "" } = {}) {
  const seed = cleanToken(replySignature || hashText(reply || turnId || Date.now()), "reply");
  const turn = cleanToken(turnId || "turn", "turn");
  const bridge = cleanToken(bridgeVersion || "marionBridge", "marionBridge");
  const composer = cleanToken(composerVersion || "composeMarionResponse", "composeMarionResponse");
  return `${MARION_FINAL_SIGNATURE_PREFIX}${REQUIRED_CHAT_ENGINE_SIGNATURE}::${bridge}::${composer}::${VERSION}::${STATE_SPINE_SCHEMA}::${FINAL_SIGNATURE}::${turn}::${seed}`;
}

function normalizeRouting(input = {}) {
  const routing = safeObj(input.routing);
  const intent = safeStr(input.intent || safeObj(input.marionIntent).intent || routing.intent || "simple_chat") || "simple_chat";
  const domain = safeStr(input.domain || routing.domain || "general") || "general";
  return {
    intent,
    domain,
    mode: safeStr(routing.mode || input.mode || ""),
    depth: safeStr(routing.depth || input.depth || ""),
    endpoint: safeStr(routing.endpoint || input.endpoint || "marion://routeMarion.primary")
  };
}

function extractReply(input = {}) {
  const payload = safeObj(input.payload);
  const synthesis = safeObj(input.synthesis);
  const packet = safeObj(input.packet);
  const packetSynthesis = safeObj(packet.synthesis);
  const finalEnvelope = safeObj(input.finalEnvelope);
  return safeStr(
    finalEnvelope.reply || finalEnvelope.text || finalEnvelope.spokenText ||
    input.reply || input.text || input.answer || input.output || input.response || input.message || input.spokenText ||
    payload.reply || payload.text || payload.message ||
    synthesis.reply || synthesis.text ||
    packetSynthesis.reply || packetSynthesis.text || ""
  );
}

function extractResolvedEmotion(input = {}) {
  const memoryPatch = safeObj(input.memoryPatch);
  const sessionPatch = safeObj(input.sessionPatch);
  const packet = safeObj(input.packet);
  return safeObj(
    input.resolvedEmotion ||
    input.emotionState ||
    input.lastEmotionState ||
    input.emotionalState ||
    input.emotionRuntime && safeObj(input.emotionRuntime).state ||
    memoryPatch.resolvedEmotion ||
    memoryPatch.emotionState ||
    memoryPatch.lastEmotionState ||
    sessionPatch.resolvedEmotion ||
    sessionPatch.emotionState ||
    safeObj(packet.memoryPatch).resolvedEmotion ||
    {}
  );
}

function buildEnvelopeCore({ reply, spokenText, routing, turnId, replySignature, marionFinalSignature, envelopeId, createdAt, stateStage, completionStatus }) {
  const actionableFinal = !!(completionStatus && completionStatus.complete === true && completionStatus.actionableReply === true && completionStatus.requiresRetry !== true);
  return {
    ok: actionableFinal,
    final: actionableFinal,
    marionFinal: actionableFinal,
    handled: actionableFinal,
    source: SOURCE,
    signature: FINAL_SIGNATURE,
    marionFinalSignature,
    finalSignature: marionFinalSignature,
    requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
    contractVersion: CONTRACT_VERSION,
    envelopeVersion: VERSION,
    envelopeId,
    createdAt,
    reply,
    text: reply,
    answer: reply,
    output: reply,
    response: reply,
    message: reply,
    spokenText,
    intent: routing.intent,
    domain: routing.domain,
    stateStage,
    replySignature,
    requiresRetry: completionStatus ? completionStatus.requiresRetry : true,
    recoverySuggested: completionStatus ? completionStatus.recoverySuggested : true,
    completionStatus: completionStatus || { complete: false, actionableReply: false, requiresRetry: true, recoverySuggested: true, reason: "completion_status_missing" }
  };
}

function createMarionFinalEnvelope(input = {}) {
  const src = safeObj(input);
  const reply = extractReply(src);
  const routing = normalizeRouting(src);
  const memoryPatch = safeObj(src.memoryPatch);
  const sessionPatch = safeObj(src.sessionPatch || src.memoryPatch);
  const metaInput = safeObj(src.meta);
  const diagnostics = safeObj(src.diagnostics || metaInput.diagnostics);
  const resolvedEmotion = extractResolvedEmotion(src);
  const emotionSummary = safeObj(src.emotionSummary || safeObj(src.emotionRuntime).summary || {});
  const replySignature = safeStr(src.replySignature || metaInput.replySignature || memoryPatch.replySignature || hashText(reply));
  const turnId = safeStr(src.turnId || metaInput.turnId || memoryPatch.turnId || "");
  const spokenText = safeStr(safeObj(src.speech).textSpeak || src.spokenText || reply);
  const stateStage = safeStr(src.stateStage || memoryPatch.stateStage || memoryPatch.stage || "final") || "final";
  const envelopeId = makeId("marion_final");
  const createdAt = nowIso();
  const marionFinalSignature = buildFinalSignature({
    reply,
    turnId,
    replySignature,
    bridgeVersion: metaInput.bridgeVersion || src.bridgeVersion,
    composerVersion: metaInput.composerVersion || src.composerVersion
  });
  const completionStatus = buildCompletionStatus({ reply, resolvedEmotion, memoryPatch, diagnostics });
  const core = buildEnvelopeCore({ reply, spokenText, routing, turnId, replySignature, marionFinalSignature, envelopeId, createdAt, stateStage, completionStatus });

  const finalEnvelope = {
    ...core,
    memoryPatch,
    sessionPatch,
    resolvedEmotion,
    emotionSummary,
    completionStatus,
    completionConfidence: completionStatus.completionConfidence,
    requiresRetry: completionStatus.requiresRetry,
    recoverySuggested: completionStatus.recoverySuggested,
    stabilized: completionStatus.stabilized,
    meta: {
      freshMarionFinal: completionStatus.complete === true,
      singleFinalAuthority: completionStatus.complete === true,
      contractVersion: CONTRACT_VERSION,
      envelopeVersion: VERSION,
      source: SOURCE,
      signature: marionFinalSignature,
      marionFinalSignature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: FINAL_MARKERS.slice(),
      turnId,
      replySignature
    }
  };

  return {
    ...core,
    routing,
    memoryPatch,
    sessionPatch,
    resolvedEmotion,
    emotionSummary,
    finalEnvelope,
    completionStatus,
    completionConfidence: completionStatus.completionConfidence,
    requiresRetry: completionStatus.requiresRetry,
    recoverySuggested: completionStatus.recoverySuggested,
    stabilized: completionStatus.stabilized,
    payload: {
      reply,
      text: reply,
      message: reply,
      spokenText,
      final: completionStatus.complete === true,
      marionFinal: completionStatus.complete === true,
      handled: completionStatus.complete === true,
      contractVersion: CONTRACT_VERSION,
      signature: FINAL_SIGNATURE,
      marionFinalSignature,
      finalSignature: marionFinalSignature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalEnvelope,
      memoryPatch,
      sessionPatch,
      resolvedEmotion,
      emotionSummary,
      completionStatus,
      completionConfidence: completionStatus.completionConfidence,
      requiresRetry: completionStatus.requiresRetry,
      recoverySuggested: completionStatus.recoverySuggested,
      stabilized: completionStatus.stabilized
    },
    packet: {
      final: completionStatus.complete === true,
      marionFinal: completionStatus.complete === true,
      handled: completionStatus.complete === true,
      routing,
      synthesis: {
        reply,
        text: reply,
        answer: reply,
        output: reply,
        spokenText,
        final: completionStatus.complete === true,
        marionFinal: completionStatus.complete === true,
        signature: marionFinalSignature,
        marionFinalSignature,
        requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE
      },
      memoryPatch,
      sessionPatch,
      resolvedEmotion,
      emotionSummary,
      completionStatus,
      completionConfidence: completionStatus.completionConfidence,
      requiresRetry: completionStatus.requiresRetry,
      recoverySuggested: completionStatus.recoverySuggested,
      stabilized: completionStatus.stabilized,
      meta: {
        final: completionStatus.complete === true,
        marionFinal: completionStatus.complete === true,
        handled: completionStatus.complete === true,
        contractVersion: CONTRACT_VERSION,
        envelopeVersion: VERSION,
        signature: marionFinalSignature,
        marionFinalSignature,
        requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
        finalMarkers: FINAL_MARKERS.slice(),
        freshMarionFinal: completionStatus.complete === true,
        singleFinalAuthority: completionStatus.complete === true,
        replySignature,
        turnId,
        completionStatus,
        completionConfidence: completionStatus.completionConfidence,
        requiresRetry: completionStatus.requiresRetry,
        recoverySuggested: completionStatus.recoverySuggested,
        stabilized: completionStatus.stabilized
      }
    },
    speech: {
      enabled: !(src.speech && src.speech.enabled === false),
      silent: !!(src.speech && src.speech.silent),
      silentAudio: !!(src.speech && src.speech.silentAudio),
      textDisplay: reply,
      textSpeak: spokenText,
      presenceProfile: safeStr(safeObj(src.speech).presenceProfile || src.presenceProfile || "receptive"),
      nyxStateHint: safeStr(safeObj(src.speech).nyxStateHint || src.nyxStateHint || "receptive"),
      timingProfile: safeObj(safeObj(src.speech).timingProfile || safeObj(safeObj(resolvedEmotion).support).timing_profile)
    },
    meta: {
      ...metaInput,
      freshMarionFinal: completionStatus.complete === true,
      singleFinalAuthority: completionStatus.complete === true,
      bridgeCompatible: completionStatus.complete === true,
      widgetCompatible: true,
      ttsCompatible: true,
      stateSpineCompatible: true,
      contractVersion: CONTRACT_VERSION,
      envelopeVersion: VERSION,
      finalMarkers: FINAL_MARKERS.slice(),
      source: SOURCE,
      replySignature,
      turnId,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      signature: marionFinalSignature,
      marionFinalSignature,
      finalEnvelopeAuthority: VERSION,
      resolvedEmotionPresent: !!Object.keys(resolvedEmotion).length,
      completionStatus,
      completionConfidence: completionStatus.completionConfidence,
      requiresRetry: completionStatus.requiresRetry,
      recoverySuggested: completionStatus.recoverySuggested,
      stabilized: completionStatus.stabilized,
      diagnostics
    },
    diagnostics: {
      ...diagnostics,
      finalEnvelopeVersion: VERSION,
      contractVersion: CONTRACT_VERSION,
      freshMarionFinal: completionStatus.complete === true,
      singleFinalAuthority: completionStatus.complete === true,
      replyPresent: !!reply,
      nestedFinalEnvelopePresent: true,
      memoryPatchPresent: !!Object.keys(memoryPatch).length,
      sessionPatchPresent: !!Object.keys(sessionPatch).length,
      resolvedEmotionPresent: !!Object.keys(resolvedEmotion).length,
      completionStatus,
      completionConfidence: completionStatus.completionConfidence,
      requiresRetry: completionStatus.requiresRetry,
      recoverySuggested: completionStatus.recoverySuggested,
      stabilized: completionStatus.stabilized,
      softRecoveryDetected: completionStatus.softRecoveryDetected
    }
  };
}

function createMarionErrorEnvelope(input = {}) {
  const reply = safeStr(input.reply || input.message || "Marion could not produce a valid final response.");
  const errorCode = safeStr(input.code || input.error || "MARION_FINAL_ERROR");
  const envelope = createMarionFinalEnvelope({
    ...safeObj(input),
    reply,
    stateStage: safeStr(input.stateStage || "error"),
    speech: { enabled: false, silent: true, silentAudio: true },
    meta: { ...safeObj(input.meta), error: errorCode, detail: safeStr(input.detail || "") },
    diagnostics: { ...safeObj(input.diagnostics), error: errorCode, detail: safeStr(input.detail || "") }
  });

  envelope.ok = false;
  envelope.final = false;
  envelope.marionFinal = false;
  envelope.handled = false;
  envelope.requiresRetry = true;
  envelope.recoverySuggested = true;
  envelope.error = true;
  envelope.completionStatus = {
    ...safeObj(envelope.completionStatus),
    complete: false,
    actionableReply: false,
    requiresRetry: true,
    recoverySuggested: true,
    reason: errorCode
  };

  envelope.finalEnvelope = {
    ...safeObj(envelope.finalEnvelope),
    ok: false,
    final: false,
    marionFinal: false,
    handled: false,
    requiresRetry: true,
    recoverySuggested: true,
    error: true,
    completionStatus: envelope.completionStatus
  };

  envelope.payload = {
    ...safeObj(envelope.payload),
    final: false,
    marionFinal: false,
    handled: false,
    requiresRetry: true,
    recoverySuggested: true,
    error: true,
    completionStatus: envelope.completionStatus
  };

  envelope.packet = {
    ...safeObj(envelope.packet),
    final: false,
    marionFinal: false,
    handled: false,
    requiresRetry: true,
    recoverySuggested: true,
    error: true,
    completionStatus: envelope.completionStatus,
    meta: {
      ...safeObj(safeObj(envelope.packet).meta),
      final: false,
      marionFinal: false,
      handled: false,
      freshMarionFinal: false,
      singleFinalAuthority: false,
      requiresRetry: true,
      recoverySuggested: true
    }
  };

  envelope.meta = {
    ...safeObj(envelope.meta),
    freshMarionFinal: false,
    singleFinalAuthority: false,
    bridgeCompatible: false,
    error: errorCode,
    requiresRetry: true,
    recoverySuggested: true,
    completionStatus: envelope.completionStatus
  };

  envelope.diagnostics = {
    ...safeObj(envelope.diagnostics),
    error: errorCode,
    freshMarionFinal: false,
    singleFinalAuthority: false,
    requiresRetry: true,
    recoverySuggested: true,
    completionStatus: envelope.completionStatus
  };

  return envelope;
}

function isMarionFinalEnvelope(value) {
  const v = safeObj(value);
  const nested = safeObj(v.finalEnvelope);
  const target = Object.keys(nested).length ? nested : v;
  return !!(
    isObj(target) &&
    target.final === true &&
    target.marionFinal === true &&
    target.handled === true &&
    target.source === SOURCE &&
    target.signature === FINAL_SIGNATURE &&
    target.contractVersion === CONTRACT_VERSION &&
    typeof target.reply === "string" &&
    !!safeStr(target.reply) &&
    isActionableFinalReply(target.reply) &&
    safeObj(target).requiresRetry !== true &&
    safeObj(target).recoverySuggested !== true
  );
}

function unwrapReply(value) {
  const v = safeObj(value);
  if (isMarionFinalEnvelope(v)) return safeStr(safeObj(v.finalEnvelope).reply || v.reply);
  return extractReply(value);
}

module.exports = {
  VERSION,
  CONTRACT_VERSION,
  FINAL_SIGNATURE,
  SOURCE,
  REQUIRED_CHAT_ENGINE_SIGNATURE,
  MARION_FINAL_SIGNATURE_PREFIX,
  STATE_SPINE_SCHEMA,
  STATE_SPINE_SCHEMA_COMPAT,
  FINAL_MARKERS,
  buildFinalSignature,
  createMarionFinalEnvelope,
  createMarionErrorEnvelope,
  isMarionFinalEnvelope,
  unwrapReply,
  _internal: { extractReply, extractResolvedEmotion, normalizeRouting, hashText, safeObj, safeArray, isSoftRecoveryReply, isActionableFinalReply, buildCompletionStatus }
};
