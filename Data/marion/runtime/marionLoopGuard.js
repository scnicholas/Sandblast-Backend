"use strict";

/**
 * marionLoopGuard.js
 * marionLoopGuard v1.1.0 DEEPENING-LOOP-STABILIZED
 * ------------------------------------------------------------
 * PURPOSE
 * - Detect true repetition, blocked fallback text, bridge echo contamination, and stuck recovery state.
 * - Preserve valid Marion final replies during multi-turn contextual/emotional deepening.
 * - Return recovery signals only; never generate a user-facing reply and never mutate durable memory.
 */

const VERSION = "marionLoopGuard v1.1.0 DEEPENING-LOOP-STABILIZED + TELEMETRY-VISIBILITY-FAILURE-SIGNATURE-AUDIT + FINAL-RENDER-TELEMETRY-HARDLOCK";
const FINAL_RENDER_TELEMETRY_VERSION = "nyx.marion.finalRenderTelemetry/1.0";
const finalRenderTelemetryMod = (() => { try { return require("./finalRenderTelemetry.js"); } catch (_) { return null; } })();

const DEFAULT_BLOCKED_PHRASES = Object.freeze([
  "i'm here with you",
  "i am here with you",
  "i blocked a repeated fallback from the bridge",
  "send a specific command",
  "press reset to clear this session",
  "i need one specific command to continue clearly",
  "nyx is live and tracking the turn",
  "give me the next clear target",
  "the final reply did not validate cleanly",
  "response path was interrupted before marion completed the final reply",
  "marion did not return",
  "final envelope missing",
  "diagnostic packet",
  "non-final"
]);

function safeStr(value) {
  return value == null ? "" : String(value).trim();
}

function safeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return safeStr(value)
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

const TELEMETRY_VISIBILITY_VERSION = "nyx.marion.telemetryVisibility/1.0";
const FAILURE_SIGNATURE_AUDIT_VERSION = "nyx.marion.failureSignatureAudit/1.0";
const KNOWN_FAILURE_SIGNATURES = Object.freeze([
  "none",
  "ROUTE_DOMAIN_MISMATCH",
  "FINAL_ENVELOPE_MISSING",
  "WEAK_FINAL_REJECTED",
  "LOOP_GUARD_SUPPRESSED",
  "PACKET_HIJACK_ATTEMPT",
  "SCHEDULE_PRE_ROUTER_INTERCEPT",
  "TECHNICAL_TARGET_STALE_CARRY",
  "DOMAIN_CONFIDENCE_LOW",
  "VOICE_TEXT_PARITY_DRIFT",
  "COMPOSER_EMPTY_REPLY",
  "BRIDGE_HANDOFF_INVALID",
  "CHATENGINE_COORDINATOR_FAULT",
  "DEBUG_LEAK_BLOCKED"
]);
function telemetryAuditText(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function telemetryAuditObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function classifyFailureSignature(fields={}){
  const f=telemetryAuditObj(fields);
  const text=telemetryAuditText([f.error,f.reply,f.message,f.reason,f.stage,f.source,Array.isArray(f.reasons)?f.reasons.join(" "):""].join(" ")).toLowerCase();
  const loop=telemetryAuditObj(f.loopGuardResult||f.loopGuard);
  if(loop.forceRecovery===true||loop.loopDetected===true||loop.allowReply===false)return"LOOP_GUARD_SUPPRESSED";
  if(/\breply held\b/.test(text))return"LOOP_GUARD_SUPPRESSED";
  if(/\bschedule depends on where you are|city\/timezone|which city\b/.test(text))return"SCHEDULE_PRE_ROUTER_INTERCEPT";
  if(/\bfinal envelope missing|final_envelope_missing|non-final|nonfinal|marion did not return\b/.test(text))return"FINAL_ENVELOPE_MISSING";
  if(/\bweak final|weak_final|rejected final|not trusted|trusted final.*false\b/.test(text))return"WEAK_FINAL_REJECTED";
  if(/\bcomposer.*empty|empty reply|compose_reply_missing|reply missing\b/.test(text))return"COMPOSER_EMPTY_REPLY";
  if(/\bbridge.*invalid|handoff invalid|bridge handoff|contract_invalid|packet_invalid\b/.test(text))return"BRIDGE_HANDOFF_INVALID";
  if(/\bchat_engine_coordinator_fault|coordinator fault|runtimeTelemetry is not defined\b/.test(text))return"CHATENGINE_COORDINATOR_FAULT";
  if(/\bdomain confidence low|low confidence|route ambiguous|ambiguous route\b/.test(text)||f.routeAmbiguous===true)return"DOMAIN_CONFIDENCE_LOW";
  if(/\bvoice.*parity.*drift|mic.*text.*drift|inputsource.*mismatch\b/.test(text)||f.voiceTextParityDrift===true)return"VOICE_TEXT_PARITY_DRIFT";
  if(/\bstale.*target|target.*stale|wrong target\b/.test(text))return"TECHNICAL_TARGET_STALE_CARRY";
  if(/\bpacket hijack|pre-router intercept|packet.*intercept\b/.test(text))return"PACKET_HIJACK_ATTEMPT";
  if(/\broutekind=|finalenvelope|sessionpatch|diagnostic packet|replyauthority=|speechhints=|presenceprofile=|nyxstatehint=\b/i.test(telemetryAuditText(f.reply||"")))return"DEBUG_LEAK_BLOCKED";
  if(f.canEmit===false&&f.finalEnvelopeTrusted===false)return"FINAL_ENVELOPE_MISSING";
  return"none";
}
function buildFailureSignatureAudit(fields={}){
  const f=telemetryAuditObj(fields);
  const signature=classifyFailureSignature(f);
  const primary=telemetryAuditText(f.primaryDomain||f.domain||f.knowledgeDomain||"");
  const secondary=Array.isArray(f.secondaryDomains)?f.secondaryDomains.map(telemetryAuditText).filter(Boolean).slice(0,4):[];
  return {
    version: FAILURE_SIGNATURE_AUDIT_VERSION,
    telemetryVisibilityVersion: TELEMETRY_VISIBILITY_VERSION,
    failureSignature: signature,
    ok: signature==="none",
    severity: signature==="none"?"none":(signature==="DEBUG_LEAK_BLOCKED"?"high":"medium"),
    userVisible: false,
    debugLeakBlocked: true,
    visibleReplyMustRemainClean: true,
    source: telemetryAuditText(f.source||""),
    stage: telemetryAuditText(f.stage||""),
    intent: telemetryAuditText(f.intent||""),
    domain: primary,
    knowledgeDomain: telemetryAuditText(f.knowledgeDomain||""),
    primaryDomain: primary,
    secondaryDomains: secondary,
    answerMode: telemetryAuditText(f.answerMode||""),
    canEmit: f.canEmit!==false,
    finalEnvelopeTrusted: f.finalEnvelopeTrusted!==false && f.trustedFinalEnvelope!==false
  };
}
function isTelemetryLeakText(value=""){
  return /\b(routeKind=|speechHints=|presenceProfile=|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority=|nyxStateHint=|diagnostic packet|final envelope missing|non-final)\b/i.test(telemetryAuditText(value));
}
function stripTelemetryLeakFromReply(value=""){
  const text=telemetryAuditText(value);
  if(!text)return"";
  if(isTelemetryLeakText(text))return text.replace(/\b(routeKind|speechHints|presenceProfile|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority|nyxStateHint)\s*=\s*[^.;,\n]+[.;,]?\s*/gi,"").replace(/\bdiagnostic packet\b/ig,"").replace(/\bfinal envelope missing\b/ig,"").replace(/\bnon-final\b/ig,"").replace(/\s+/g," ").trim();
  return text;
}



function tokenize(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function similarity(a, b) {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ax = new Set(tokenize(x));
  const by = new Set(tokenize(y));
  if (!ax.size || !by.size) return 0;
  let overlap = 0;
  for (const word of ax) if (by.has(word)) overlap += 1;
  return overlap / Math.max(ax.size, by.size);
}

function containsBlockedPhrase(reply, blockedPhrases = DEFAULT_BLOCKED_PHRASES) {
  const r = normalizeText(reply);
  if (!r) return false;
  return safeArray(blockedPhrases).some((phrase) => {
    const p = normalizeText(phrase);
    return p && r.includes(p);
  });
}

function getState(packet = {}) {
  const p = safeObj(packet);
  return safeObj(p.state || p.sessionState || p.conversationState || p.previousMemory || {});
}

function getHistory(packet = {}) {
  const p = safeObj(packet);
  const state = getState(p);
  const history = p.history || state.history || state.turns || [];
  return Array.isArray(history) ? history : [];
}

function getLastAssistantReply(packet = {}) {
  const p = safeObj(packet);
  const state = getState(p);
  return safeStr(
    p.lastAssistantReply ||
    p.previousReply ||
    state.lastAssistantReply ||
    state.lastReply ||
    state.assistantReply ||
    safeObj(state.memoryPatch).lastAssistantReply ||
    ""
  );
}

function getLoopCount(packet = {}) {
  const p = safeObj(packet);
  const state = getState(p);
  const repetition = safeObj(state.repetition);
  const value = state.loopCount ?? p.loopCount ?? repetition.noProgressCount ?? 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function getStateStage(packet = {}) {
  const p = safeObj(packet);
  const state = getState(p);
  return safeStr(state.stateStage || state.stage || p.stateStage || "compose");
}

function isTrustedFinalPacket(packet = {}) {
  const p = safeObj(packet);
  const meta = safeObj(p.meta);
  const finalEnvelope = safeObj(p.finalEnvelope || safeObj(p.payload).finalEnvelope);
  const memoryPatch = safeObj(p.memoryPatch || safeObj(p.payload).memoryPatch);
  return !!(
    p.final === true ||
    p.marionFinal === true ||
    finalEnvelope.final === true ||
    finalEnvelope.marionFinal === true ||
    meta.freshMarionFinal === true ||
    meta.singleFinalAuthority === true ||
    memoryPatch.composedOnce === true ||
    safeObj(memoryPatch.stateBridge).shouldAdvanceState === true ||
    /MARION::FINAL::/i.test(safeStr(p.marionFinalSignature || p.finalSignature || meta.marionFinalSignature || meta.signature || finalEnvelope.marionFinalSignature))
  );
}

function detectBridgeEcho(packet = {}, reply = "") {
  const replyText = normalizeText(reply);
  if (!replyText) return false;
  // A packet coming from marionBridge is not automatically a bridge echo. Only
  // bridge diagnostic/recovery wording should be blocked.
  const bridgeMarkers = [
    "from the bridge",
    "bridge fallback",
    "specific command",
    "reset to clear",
    "blocked a repeated fallback",
    "response path was interrupted",
    "final reply did not validate cleanly"
  ];
  return bridgeMarkers.some((marker) => replyText.includes(marker));
}

function isDeepeningTurn(packet = {}) {
  const p = safeObj(packet);
  const text = normalizeText(p.text || p.userQuery || p.query || p.message || safeObj(p.input).text || "");
  const state = getState(p);
  const continuity = safeObj(state.emotionalContinuity || state.continuityThread || safeObj(state.memoryPatch).emotionalContinuity);
  return !!(
    /\b(given that|based on that|what happens if|what layer|continue|deeper|underneath|still|exhausting|mentally|that risk|that setup)\b/i.test(text) ||
    continuity.active === true ||
    continuity.threadContinuation === true ||
    Number(continuity.depthLevel || continuity.carryDepth || 0) > 1
  );
}

function evaluateLoop(packet = {}, candidateReply = "", options = {}) {
  const reply = safeStr(candidateReply);
  const lastReply = getLastAssistantReply(packet);
  const history = getHistory(packet);
  const loopCount = getLoopCount(packet);
  const stateStage = getStateStage(packet);
  const trustedFinal = options.trustedFinal === true || isTrustedFinalPacket(packet);
  const deepeningTurn = options.deepeningTurn === true || isDeepeningTurn(packet);

  const blockedPhrases = Array.isArray(options.blockedPhrases) ? options.blockedPhrases : DEFAULT_BLOCKED_PHRASES;

  const exactRepeat = !!reply && normalizeText(reply) === normalizeText(lastReply);
  const similarityToLastReply = similarity(reply, lastReply);
  const nearRepeatThreshold = deepeningTurn || trustedFinal ? 0.94 : 0.88;
  const nearRepeat = !!reply && !!lastReply && similarityToLastReply >= nearRepeatThreshold;
  const blockedPhrase = containsBlockedPhrase(reply, blockedPhrases);
  const bridgeEcho = detectBridgeEcho(packet, reply);

  const recentAssistantReplies = history
    .filter((item) => item && (item.role === "assistant" || item.role === "nyx" || item.role === "marion"))
    .map((item) => item.content || item.text || item.reply || item.message || "")
    .filter(Boolean)
    .slice(-5);

  const repeatedInHistory = !!reply && recentAssistantReplies.some((prev) => {
    const score = similarity(prev, reply);
    return normalizeText(prev) === normalizeText(reply) || score >= (deepeningTurn || trustedFinal ? 0.95 : 0.9);
  });

  const stuckState = !trustedFinal && (
    loopCount >= 3 ||
    (["fallback", "blocked", "unknown", "recover"].includes(normalizeText(stateStage)) && loopCount >= 2)
  );

  const loopDetected = !!(
    blockedPhrase ||
    bridgeEcho ||
    exactRepeat ||
    nearRepeat ||
    repeatedInHistory ||
    stuckState
  );

  const reasons = [];
  if (exactRepeat) reasons.push("exact_reply_repeat");
  if (nearRepeat) reasons.push("near_reply_repeat");
  if (blockedPhrase) reasons.push("blocked_phrase_detected");
  if (bridgeEcho) reasons.push("bridge_echo_detected");
  if (repeatedInHistory) reasons.push("history_repeat_detected");
  if (stuckState) reasons.push("stuck_state_detected");

  const allowReply = !loopDetected || (trustedFinal && !blockedPhrase && !bridgeEcho && !exactRepeat);
  const forceRecovery = !allowReply;
  const nextStateStage = forceRecovery ? "recover" : (trustedFinal ? "final" : (normalizeText(stateStage) || "compose"));

  return {
    ok: true,
    loopDetected,
    allowReply,
    forceRecovery,
    nextStateStage,
    reasons,
    loopGuardVersion: VERSION,
    telemetryVisibilityVersion: TELEMETRY_VISIBILITY_VERSION,
    failureSignature: classifyFailureSignature({source:"marionLoopGuard",reply,canEmit:allowReply,stage:nextStateStage,loopGuardResult:{forceRecovery,loopDetected,allowReply},reasons}),
    failureSignatureAudit: buildFailureSignatureAudit({source:"marionLoopGuard",reply,canEmit:allowReply,stage:nextStateStage,loopGuardResult:{forceRecovery,loopDetected,allowReply},reasons,finalEnvelopeTrusted:trustedFinal}),
    diagnostics: {
      loopCount,
      stateStage,
      trustedFinal,
      deepeningTurn,
      exactRepeat,
      nearRepeat,
      blockedPhrase,
      bridgeEcho,
      repeatedInHistory,
      stuckState,
      similarityToLastReply
    }
  };
}

function applyLoopGuard(packet = {}, candidateReply = "", options = {}) {
  const result = evaluateLoop(packet, candidateReply, options);
  return {
    ...result,
    packetPatch: {
      stateStage: result.nextStateStage,
      loopCount: result.forceRecovery ? getLoopCount(packet) + 1 : 0,
      recoveryRequired: result.forceRecovery,
      lastLoopReasons: result.reasons,
      loopGuardVersion: VERSION,
      telemetryVisibilityVersion: TELEMETRY_VISIBILITY_VERSION,
      failureSignature: result.failureSignature,
      failureSignatureAudit: result.failureSignatureAudit
    }
  };
}

module.exports = {
  VERSION,
  TELEMETRY_VISIBILITY_VERSION,
  FAILURE_SIGNATURE_AUDIT_VERSION,
  DEFAULT_BLOCKED_PHRASES,
  normalizeText,
  similarity,
  containsBlockedPhrase,
  evaluateLoop,
  applyLoopGuard,
  isTrustedFinalPacket,
  isDeepeningTurn,
  detectBridgeEcho,
  classifyFailureSignature,
  buildFailureSignatureAudit,
  isTelemetryLeakText,
  stripTelemetryLeakFromReply
,
  FINAL_RENDER_TELEMETRY_VERSION};
