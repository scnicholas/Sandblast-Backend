"use strict";

/**
 * marionLoopGuard.js
 * marionLoopGuard v1.2.0 LOOP-SIGNAL-SEPARATION-HARDLOCK
 * ------------------------------------------------------------
 * PURPOSE
 * - Detect true repetition, blocked fallback text, bridge echo contamination,
 *   telemetry/debug leakage, empty replies, and stuck recovery state.
 * - Preserve valid Marion final replies during multi-turn contextual/emotional
 *   deepening without mislabeling harmless similarity as a hard loop.
 * - Return recovery signals only; never generate a user-facing reply and never
 *   mutate durable memory.
 */

const VERSION = "marionLoopGuard v1.3.0 PRIORITY3-PROTECTIVE-STATE-LOOP-HARDENING + REFERENCEERROR-SUPPRESSION";
const PROTECTIVE_ESCALATION_LOOP_GUARD_VERSION = "sandblast.guardian.protectiveEscalationLoopGuard/1.0";
const FINAL_RENDER_TELEMETRY_VERSION = "nyx.marion.finalRenderTelemetry/1.0";
const finalRenderTelemetryMod = (() => { try { return require("./finalRenderTelemetry.js"); } catch (_) { return null; } })();

const DEFAULT_BLOCKED_PHRASES = Object.freeze([
  "i'm here with you",
  "i am here with you",
  "i blocked a repeated fallback from the bridge",
  "i blocked a repeated fallback",
  "i stopped a repeated fallback",
  "send a specific command",
  "press reset to clear this session",
  "i need one specific command to continue clearly",
  "nyx is live and tracking the turn",
  "give me the next clear target",
  "give me the specific target or outcome",
  "give me the target and i'll route it cleanly",
  "the final reply did not validate cleanly",
  "response path was interrupted before marion completed the final reply",
  "marion did not return",
  "bridge blocked an invalid public reply",
  "final envelope missing",
  "diagnostic packet",
  "non-final",
  "reply authority",
  "session patch",
  "route kind",
  "referenceerror",
  "typeerror",
  "syntaxerror"
]);

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

function safeStr(value) {
  return value == null ? "" : String(value).trim();
}

function safeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function oneLine(value) {
  return safeStr(value).replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return oneLine(value)
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function telemetryAuditText(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function telemetryAuditObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isTelemetryLeakText(value = "") {
  const text = telemetryAuditText(value);
  if (!text) return false;
  return /\b(routeKind\s*=|speechHints\s*=|presenceProfile\s*=|finalEnvelope\b|sessionPatch\b|marionFinal\b|transportSafe\b|replyAuthority\s*=|nyxStateHint\s*=|diagnostic packet|final envelope missing|non-final|ReferenceError|REFERENCEERROR|TypeError|SyntaxError|RangeError|stack trace|MARION::FINAL::|MARION_FINAL_AUTHORITY)\b/i.test(text);
}

function stripTelemetryLeakFromReply(value = "") {
  let text = telemetryAuditText(value);
  if (!text) return "";
  if (!isTelemetryLeakText(text)) return text;
  text = text
    .replace(/\b(routeKind|speechHints|presenceProfile|replyAuthority|nyxStateHint)\s*=\s*[^.;,\n]+[.;,]?\s*/gi, "")
    .replace(/\b(finalEnvelope|sessionPatch|marionFinal|transportSafe)\b\s*[:=]?\s*[^.;,\n]*[.;,]?\s*/gi, "")
    .replace(/\b(MARION::FINAL::|MARION_FINAL_AUTHORITY|diagnostic packet|final envelope missing|non-final|ReferenceError|REFERENCEERROR|TypeError|SyntaxError|RangeError)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function classifyFailureSignature(fields = {}) {
  const f = telemetryAuditObj(fields);
  const reasons = Array.isArray(f.reasons) ? f.reasons.join(" ") : "";
  const text = telemetryAuditText([f.error, f.reply, f.message, f.reason, f.stage, f.source, reasons].join(" ")).toLowerCase();
  const loop = telemetryAuditObj(f.loopGuardResult || f.loopGuard);
  const hardLoop = loop.forceRecovery === true || loop.allowReply === false || f.hardLoopDetected === true;

  if (isTelemetryLeakText(f.reply || "") || /debug_leak|telemetry_leak|routekind=|finalenvelope|sessionpatch|diagnostic packet|replyauthority=|speechhints=|presenceprofile=|nyxstatehint=/.test(text)) return "DEBUG_LEAK_BLOCKED";
  if (/empty_reply|composer empty|empty reply|compose_reply_missing|reply missing/.test(text) || f.emptyReply === true) return "COMPOSER_EMPTY_REPLY";
  if (hardLoop || /\breply held\b/.test(text)) return "LOOP_GUARD_SUPPRESSED";
  if (/\bschedule depends on where you are|city\/timezone|which city\b/.test(text)) return "SCHEDULE_PRE_ROUTER_INTERCEPT";
  if (/\bfinal envelope missing|final_envelope_missing|non-final|nonfinal|marion did not return\b/.test(text)) return "FINAL_ENVELOPE_MISSING";
  if (/\bweak final|weak_final|rejected final|not trusted|trusted final.*false\b/.test(text)) return "WEAK_FINAL_REJECTED";
  if (/\bbridge.*invalid|handoff invalid|bridge handoff|contract_invalid|packet_invalid\b/.test(text)) return "BRIDGE_HANDOFF_INVALID";
  if (/\bchat_engine_coordinator_fault|coordinator fault|runtimeTelemetry is not defined\b/.test(text)) return "CHATENGINE_COORDINATOR_FAULT";
  if (/\bdomain confidence low|low confidence|route ambiguous|ambiguous route\b/.test(text) || f.routeAmbiguous === true) return "DOMAIN_CONFIDENCE_LOW";
  if (/\bvoice.*parity.*drift|mic.*text.*drift|inputsource.*mismatch\b/.test(text) || f.voiceTextParityDrift === true) return "VOICE_TEXT_PARITY_DRIFT";
  if (/\bstale.*target|target.*stale|wrong target\b/.test(text)) return "TECHNICAL_TARGET_STALE_CARRY";
  if (/\bpacket hijack|pre-router intercept|packet.*intercept\b/.test(text)) return "PACKET_HIJACK_ATTEMPT";
  if (f.canEmit === false && f.finalEnvelopeTrusted === false) return "FINAL_ENVELOPE_MISSING";
  return "none";
}

function buildFailureSignatureAudit(fields = {}) {
  const f = telemetryAuditObj(fields);
  const signature = classifyFailureSignature(f);
  const primary = telemetryAuditText(f.primaryDomain || f.domain || f.knowledgeDomain || "");
  const secondary = Array.isArray(f.secondaryDomains) ? f.secondaryDomains.map(telemetryAuditText).filter(Boolean).slice(0, 4) : [];
  return {
    version: FAILURE_SIGNATURE_AUDIT_VERSION,
    telemetryVisibilityVersion: TELEMETRY_VISIBILITY_VERSION,
    failureSignature: signature,
    ok: signature === "none",
    severity: signature === "none" ? "none" : (signature === "DEBUG_LEAK_BLOCKED" || signature === "COMPOSER_EMPTY_REPLY" ? "high" : "medium"),
    userVisible: false,
    debugLeakBlocked: true,
    visibleReplyMustRemainClean: true,
    source: telemetryAuditText(f.source || ""),
    stage: telemetryAuditText(f.stage || ""),
    intent: telemetryAuditText(f.intent || ""),
    domain: primary,
    knowledgeDomain: telemetryAuditText(f.knowledgeDomain || ""),
    primaryDomain: primary,
    secondaryDomains: secondary,
    answerMode: telemetryAuditText(f.answerMode || ""),
    canEmit: f.canEmit !== false,
    finalEnvelopeTrusted: f.finalEnvelopeTrusted !== false && f.trustedFinalEnvelope !== false
  };
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
  const payload = safeObj(p.payload);
  const finalEnvelope = safeObj(p.finalEnvelope || payload.finalEnvelope);
  const memoryPatch = safeObj(p.memoryPatch || payload.memoryPatch);
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
  const bridgeMarkers = [
    "from the bridge",
    "bridge fallback",
    "specific command",
    "reset to clear",
    "blocked a repeated fallback",
    "response path was interrupted",
    "final reply did not validate cleanly",
    "bridge blocked an invalid public reply",
    "marion did not return",
    "final envelope missing"
  ];
  return bridgeMarkers.some((marker) => replyText.includes(marker));
}

function isDeepeningTurn(packet = {}) {
  const p = safeObj(packet);
  const text = normalizeText(p.text || p.userQuery || p.query || p.message || safeObj(p.input).text || "");
  const state = getState(p);
  const continuity = safeObj(state.emotionalContinuity || state.continuityThread || safeObj(state.memoryPatch).emotionalContinuity);
  return !!(
    /\b(given that|based on that|what happens if|what layer|continue|deeper|underneath|still|exhausting|mentally|that risk|that setup|next steps?|build on that|carry this)\b/i.test(text) ||
    continuity.active === true ||
    continuity.threadContinuation === true ||
    Number(continuity.depthLevel || continuity.carryDepth || 0) > 1
  );
}


function normalizeProtectiveEscalationCarry(value = {}) {
  const src = safeObj(value);
  const purpose = oneLine(src.purpose || src.protectivePurpose || src.justification || src.reason || "").slice(0, 600);
  const burst = Number(src.maxBurstSeconds ?? src.burstSeconds ?? src.maxBurstDurationSeconds ?? 0);
  const cooldown = Number(src.minCooldownSeconds ?? src.cooldownSeconds ?? 0);
  const active = !!(src.active || src.defensiveIntent || src.protectiveIntent || src.verifiedCommand || purpose);
  if (!active) return {};
  const boundedPolicy = !!(
    (!Number.isFinite(burst) || burst === 0 || burst <= 8) &&
    (!Number.isFinite(cooldown) || cooldown === 0 || cooldown >= 15) &&
    src.continuous !== true &&
    src.punitive !== true &&
    src.coercive !== true
  );
  const verifiedCommand = src.verifiedCommand === true || src.commandVerified === true || src.intentVerified === true;
  const humanApproval = src.humanApproval === true || src.approved === true || !!src.approvedBy;
  return {
    version: PROTECTIVE_ESCALATION_LOOP_GUARD_VERSION,
    active: true,
    defensiveIntent: !!(src.defensiveIntent || src.protectiveIntent || /defen|protect|safety|threat|emergency/i.test(purpose)),
    protectivePurpose: purpose,
    verifiedCommand,
    humanApproval,
    approvalRequired: src.approvalRequired !== false,
    boundedPolicy,
    maxBurstSeconds: Number.isFinite(burst) && burst > 0 ? Math.min(8, Math.max(1, burst)) : 0,
    minCooldownSeconds: Number.isFinite(cooldown) && cooldown > 0 ? Math.max(15, cooldown) : 0,
    allowed: !!(verifiedCommand && boundedPolicy && (humanApproval || src.approvalRequired === false)),
    finalAuthority: "marion",
    source: oneLine(src.source || "marionLoopGuard.protectiveEscalationCarry")
  };
}

function extractProtectiveEscalationCarry(packet = {}, options = {}) {
  const p = safeObj(packet);
  const state = getState(p);
  const meta = safeObj(p.meta);
  const routing = safeObj(p.routing);
  const payload = safeObj(p.payload);
  const memoryPatch = safeObj(p.memoryPatch || payload.memoryPatch || meta.memoryPatch);
  const candidates = [
    options.protectiveEscalation,
    options.defensiveIntentJustifier,
    p.protectiveEscalation,
    p.defensiveIntentJustifier,
    p.ethicalJustification,
    meta.protectiveEscalation,
    meta.defensiveIntentJustifier,
    routing.protectiveEscalation,
    memoryPatch.protectiveEscalation,
    safeObj(memoryPatch.stateBridge).protectiveEscalation,
    state.protectiveEscalation,
    safeObj(state.runtimeTelemetry).protectiveEscalation
  ];
  for (const item of candidates) {
    const normalized = normalizeProtectiveEscalationCarry(item);
    if (Object.keys(normalized).length) return normalized;
  }
  return {};
}

function protectiveEscalationPolicyViolation(carry = {}) {
  const c = safeObj(carry);
  if (!c.active) return false;
  return c.allowed !== true || c.boundedPolicy !== true || c.verifiedCommand !== true;
}

function buildFinalRenderTelemetrySafe(fields = {}) {
  if (!finalRenderTelemetryMod || typeof finalRenderTelemetryMod.buildFinalRenderTelemetry !== "function") return {};
  try {
    return safeObj(finalRenderTelemetryMod.buildFinalRenderTelemetry(fields));
  } catch (_) {
    return {};
  }
}

function evaluateLoop(packet = {}, candidateReply = "", options = {}) {
  const rawReply = safeStr(candidateReply);
  const sanitizedReply = stripTelemetryLeakFromReply(rawReply);
  const reply = rawReply;
  const lastReply = getLastAssistantReply(packet);
  const history = getHistory(packet);
  const loopCount = getLoopCount(packet);
  const stateStage = getStateStage(packet);
  const trustedFinal = options.trustedFinal === true || isTrustedFinalPacket(packet);
  const deepeningTurn = options.deepeningTurn === true || isDeepeningTurn(packet);
  const blockedPhrases = Array.isArray(options.blockedPhrases) ? options.blockedPhrases : DEFAULT_BLOCKED_PHRASES;
  const protectiveEscalation = extractProtectiveEscalationCarry(packet, options);
  const protectivePolicyViolation = protectiveEscalationPolicyViolation(protectiveEscalation);

  const emptyReply = !oneLine(rawReply);
  const telemetryLeak = isTelemetryLeakText(rawReply);
  const blockedPhrase = containsBlockedPhrase(rawReply, blockedPhrases);
  const bridgeEcho = detectBridgeEcho(packet, rawReply);
  const exactRepeat = !!rawReply && normalizeText(rawReply) === normalizeText(lastReply);
  const similarityToLastReply = similarity(rawReply, lastReply);
  const nearRepeatThreshold = deepeningTurn || trustedFinal ? 0.94 : 0.88;
  const nearRepeat = !!rawReply && !!lastReply && similarityToLastReply >= nearRepeatThreshold;

  const recentAssistantReplies = history
    .filter((item) => item && (item.role === "assistant" || item.role === "nyx" || item.role === "marion"))
    .map((item) => item.content || item.text || item.reply || item.message || "")
    .filter(Boolean)
    .slice(-5);

  const repeatedInHistory = !!rawReply && recentAssistantReplies.some((prev) => {
    const score = similarity(prev, rawReply);
    return normalizeText(prev) === normalizeText(rawReply) || score >= (deepeningTurn || trustedFinal ? 0.95 : 0.9);
  });

  const stuckState = !trustedFinal && (
    loopCount >= 3 ||
    (["fallback", "blocked", "unknown", "recover"].includes(normalizeText(stateStage)) && loopCount >= 2)
  );

  // Soft loop signals help telemetry, but should not automatically suppress a
  // trusted Marion final. Hard loop signals are the only signals allowed to force
  // recovery.
  const softLoopDetected = !!(nearRepeat || repeatedInHistory);
  const hardLoopDetected = !!(
    emptyReply ||
    telemetryLeak ||
    blockedPhrase ||
    bridgeEcho ||
    exactRepeat ||
    stuckState ||
    protectivePolicyViolation ||
    (!trustedFinal && softLoopDetected)
  );
  const loopDetected = hardLoopDetected || softLoopDetected;

  const reasons = [];
  if (emptyReply) reasons.push("empty_reply_detected");
  if (telemetryLeak) reasons.push("telemetry_leak_detected");
  if (exactRepeat) reasons.push("exact_reply_repeat");
  if (nearRepeat) reasons.push("near_reply_repeat");
  if (blockedPhrase) reasons.push("blocked_phrase_detected");
  if (bridgeEcho) reasons.push("bridge_echo_detected");
  if (repeatedInHistory) reasons.push("history_repeat_detected");
  if (stuckState) reasons.push("stuck_state_detected");
  if (protectivePolicyViolation) reasons.push("protective_escalation_policy_violation");

  const allowReply = !hardLoopDetected;
  const forceRecovery = !allowReply;
  const nextStateStage = forceRecovery ? "recover" : (trustedFinal ? "final" : (normalizeText(stateStage) || "compose"));
  const failureFields = {
    source: "marionLoopGuard",
    reply,
    canEmit: allowReply,
    stage: nextStateStage,
    loopGuardResult: { forceRecovery, loopDetected, hardLoopDetected, allowReply },
    hardLoopDetected,
    reasons,
    emptyReply,
    finalEnvelopeTrusted: trustedFinal,
    protectiveEscalation
  };
  const failureSignature = classifyFailureSignature(failureFields);
  const failureSignatureAudit = buildFailureSignatureAudit(failureFields);
  const finalRenderTelemetry = buildFinalRenderTelemetrySafe({
    source: "marionLoopGuard",
    stage: nextStateStage,
    reply: sanitizedReply,
    canEmit: allowReply,
    finalEnvelopeTrusted: trustedFinal,
    error: forceRecovery ? reasons.join(",") : "",
    loopGuard: { loopDetected, hardLoopDetected, forceRecovery, allowReply, reasons },
    protectiveEscalation
  });

  return {
    ok: true,
    loopDetected,
    hardLoopDetected,
    softLoopDetected,
    allowReply,
    forceRecovery,
    nextStateStage,
    reasons,
    sanitizedReply,
    loopGuardVersion: VERSION,
    telemetryVisibilityVersion: TELEMETRY_VISIBILITY_VERSION,
    failureSignature,
    failureSignatureAudit,
    finalRenderTelemetryVersion: FINAL_RENDER_TELEMETRY_VERSION,
    finalRenderTelemetry,
    protectiveEscalation,
    protectiveEscalationActive: !!protectiveEscalation.active,
    protectivePolicyViolation,
    diagnostics: {
      loopCount,
      stateStage,
      trustedFinal,
      deepeningTurn,
      emptyReply,
      telemetryLeak,
      exactRepeat,
      nearRepeat,
      blockedPhrase,
      bridgeEcho,
      repeatedInHistory,
      stuckState,
      similarityToLastReply,
      protectiveEscalationActive: !!protectiveEscalation.active,
      protectivePolicyViolation
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
      failureSignatureAudit: result.failureSignatureAudit,
      finalRenderTelemetryVersion: FINAL_RENDER_TELEMETRY_VERSION,
      finalRenderTelemetry: result.finalRenderTelemetry,
      protectiveEscalation: result.protectiveEscalation,
      protectiveEscalationActive: !!result.protectiveEscalationActive
    }
  };
}

module.exports = {
  VERSION,
  TELEMETRY_VISIBILITY_VERSION,
  FAILURE_SIGNATURE_AUDIT_VERSION,
  PROTECTIVE_ESCALATION_LOOP_GUARD_VERSION,
  KNOWN_FAILURE_SIGNATURES,
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
  stripTelemetryLeakFromReply,
  normalizeProtectiveEscalationCarry,
  extractProtectiveEscalationCarry,
  protectiveEscalationPolicyViolation,
  FINAL_RENDER_TELEMETRY_VERSION
};
