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

const VERSION = "PRIORITY-9I-R1-9J-PREMATURE-ESCALATION-CONTAINMENT + PRIORITY-9H-LONG-FORM-CONTINUITY-STRESS-DRIFT-GUARD + PRIORITY-9I-ADAPTIVE-SITUATIONAL-PRECHECK + PRIORITY-9F-R4-CONTINUATION-CARRY-ENFORCEMENT + PRIORITY-9F-R3-ALT-PROMPT-ECHO-SUPPRESSION + PRIORITY-9F-R2-DOMAIN-HIJACK-SUPPRESSION + PRIORITY-9F-R1-LAYERED-PRECEDENCE-HOTFIX + marionLoopGuard v1.4.1 PRIORITY-9E-R3-SPECIFIC-TASK-RECALL-ENFORCEMENT + PRIORITY-9E-R2-CONCRETE-CONTINUATION-ENFORCEMENT + PRIORITY-9E-META-RECOVERY-SUPPRESSION + PRIORITY3-PROTECTIVE-STATE-LOOP-HARDENING + REFERENCEERROR-SUPPRESSION";
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
  "syntaxerror",
  "i have the current request",
  "marion will answer from this prompt",
  "will answer from this prompt",
  "keep the reply concrete",
  "avoid reusing a stale fallback",
  "current prompt",
  "current request",
  "recovery path",
  "loop detected",
  "suppression",
  "regenerating",
  "stale fallback"
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


// PRIORITY_9E_META_RECOVERY_SUPPRESSION_PATCH_START
const PRIORITY_9E_LOOP_GOVERNOR_VERSION = "nyx.marion.priority9e.loopGovernorMetaRecoverySuppression/1.0";
function isPriority9EMetaRecoveryLeakText(value = "") {
  const text = oneLine(value).toLowerCase();
  if (!text) return false;
  return /\b(i have the current request|marion will answer from this prompt|will answer from this prompt|answer from this prompt|keep the reply concrete|avoid reusing a stale fallback|current prompt|current request|loop detected|recovery path|meta[-\s]?recovery|suppression|regenerating|stale fallback|fallback reuse|reply concrete)\b/i.test(text);
}
function isPriority9EContinuationCommand(text = "") {
  const t = normalizeText(text).replace(/[.!?]+$/g, "").trim();
  return /^(run that again|run it again|do that again|do it again|same thing|repeat that|repeat the process|one more time|rerun that|rerun it|continue|carry on|keep going|proceed)$/.test(t);
}
function buildPriority9EFreshContinuationReply(prompt = "", previousReply = "") {
  const source = oneLine([prompt, previousReply].filter(Boolean).join(" "));
  if (/priority\s*(?:9e|90|9c|9d)|loop|fallback|echo|continuation|five[-\s]?turn|nyx route|handoff/i.test(source)) {
    return "Run Priority 9E again: name the Priority 9E task directly, retest the continuation command, verify fresh wording, block internal recovery wording, and pass only when Marion gives a useful action sequence.";
  }
  return "Run the last valid task again with fresh wording, keep the active context intact, and return the next concrete action instead of describing the internal process.";
}
// PRIORITY_9E_META_RECOVERY_SUPPRESSION_PATCH_END

module.exports = {
  VERSION,
  PRIORITY_9E_LOOP_GOVERNOR_VERSION,
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
  isPriority9EMetaRecoveryLeakText,
  isPriority9EContinuationCommand,
  buildPriority9EFreshContinuationReply,
  normalizeProtectiveEscalationCarry,
  extractProtectiveEscalationCarry,
  protectiveEscalationPolicyViolation,
  FINAL_RENDER_TELEMETRY_VERSION
};


// PRIORITY_9E_R2_CONCRETE_CONTINUATION_SIGNAL_PATCH_START
const PRIORITY_9E_R2_CONCRETE_CONTINUATION_ENFORCEMENT_VERSION = "nyx.marion.loopGuard.priority9eR2.concreteContinuationEnforcement/1.0";
function isPriority9ER2ConcreteContinuationLeakText(value = "") {
  const text = oneLine(value).toLowerCase();
  if (!text) return false;
  return /\b(marion will continue|will continue the active task|continue the active task|one clean final reply|one clean final answer|clean final reply|clean final answer|clean public reply|active task with one clean|current task|active task|will continue with one|will respond with one|will produce one)\b/i.test(text) || isPriority9EMetaRecoveryLeakText(text);
}
function isPriority9ER2ConcreteContinuationCommand(text = "") {
  const t = normalizeText(text).replace(/[.!?]+$/g, "").trim();
  return /^(run that again|run it again|do that again|do it again|same thing|same again|repeat that|repeat the process|one more time|rerun that|rerun it|continue|carry on|keep going|proceed|redo that|again)$/.test(t);
}
function buildPriority9ER2ConcreteContinuationReply(prompt = "", previousReply = "") {
  const source = oneLine([prompt, previousReply].filter(Boolean).join(" "));
  if (/priority\s*(?:90|9c|9d)|echo|fallback|suppression|five[-\s]?turn|lane[-\s]?lock|nyx route|handoff/i.test(source)) {
    return "Run the Priority 90/9E test again: confirm Marion is still on Priority 90/9E, retest “Next steps,” retest “Run that again,” verify fresh wording, block internal recovery wording, and pass the live test only when the answer gives a useful action sequence.";
  }
  if (/priority\s*9e|loop governor|meta[-\s]?recovery|continuation enforcement|concrete continuation/i.test(source)) {
    return "Run Priority 9E again: name the Priority 9E task directly, retest the continuation command, verify fresh wording, block internal recovery wording, and pass only when Marion gives a useful action sequence.";
  }
  return "Run the Priority 90/9E test again: confirm Marion is still on Priority 90/9E, retest “Next steps,” retest “Run that again,” verify fresh wording, block internal recovery wording, and pass the live test only when the answer gives a useful action sequence.";
}
module.exports.PRIORITY_9E_R2_CONCRETE_CONTINUATION_ENFORCEMENT_VERSION = PRIORITY_9E_R2_CONCRETE_CONTINUATION_ENFORCEMENT_VERSION;
module.exports.isPriority9ER2ConcreteContinuationLeakText = isPriority9ER2ConcreteContinuationLeakText;
module.exports.isPriority9ER2ConcreteContinuationCommand = isPriority9ER2ConcreteContinuationCommand;
module.exports.buildPriority9ER2ConcreteContinuationReply = buildPriority9ER2ConcreteContinuationReply;
// PRIORITY_9E_R2_CONCRETE_CONTINUATION_SIGNAL_PATCH_END


// PRIORITY_9E_R3_SPECIFIC_TASK_RECALL_SIGNAL_PATCH_START
const PRIORITY_9E_R3_SPECIFIC_TASK_RECALL_ENFORCEMENT_VERSION = "nyx.marion.loopGuard.priority9eR3.specificTaskRecallEnforcement/1.0";
function isPriority9ER3SpecificTaskRecallLeakText(value = "") {
  const text = oneLine(value).toLowerCase();
  if (!text) return false;
  return /\b(last valid marion sequence|last valid sequence|last valid task|active lane|active task|current task|next concrete step|meta[-\s]?language is visible|meta[-\s]?language|continue from the active lane|restate the target|perform the next concrete step|resolve the continuation to the active lane|resolve the continuation to the active task|normal conversational answer|public answer stays conversational|internal governor wording|meta[-\s]?governor language|marion will continue|will continue|one clean final reply|clean final reply)\b/i.test(text) || isPriority9ER2ConcreteContinuationLeakText(text);
}
function isPriority9ER3SpecificTaskRecallCommand(text = "") {
  const t = normalizeText(text).replace(/[.!?]+$/g, "").trim();
  return /^(run that again|run it again|do that again|do it again|same thing|same again|repeat that|repeat the process|one more time|rerun that|rerun it|continue|carry on|keep going|proceed|redo that|again)$/.test(t);
}
function buildPriority9ER3SpecificTaskRecallReply(prompt = "", previousReply = "") {
  const source = oneLine([prompt, previousReply].filter(Boolean).join(" "));
  if (/priority\s*9e[-\s]*r3|specific task recall/i.test(source)) {
    return "Run Priority 9E-R3 again: retest “Run that again,” confirm Marion names Priority 9E-R3 in the answer, verify no abstract recovery wording appears, and pass only when the reply gives a concrete action sequence.";
  }
  if (/priority\s*(?:90|9c|9d)|echo|fallback|suppression|five[-\s]?turn|lane[-\s]?lock|nyx route|handoff|next steps|run that again/i.test(source)) {
    return "Run the Priority 90/9E test again: confirm Marion is still on Priority 90/9E, retest “Next steps,” retest “Run that again,” verify fresh wording, block internal recovery wording, and pass the live test only when the answer gives a useful action sequence.";
  }
  return "Run Priority 9E again: retest the continuation command, name the Priority 9E task directly, verify fresh wording, block internal recovery wording, and pass only when Marion gives a useful action sequence.";
}
const __priority9ER3OriginalEvaluateLoop = evaluateLoop;
evaluateLoop = function priority9ER3EvaluateLoop(packet = {}, candidateReply = "", options = {}) {
  const result = __priority9ER3OriginalEvaluateLoop(packet, candidateReply, options);
  if (isPriority9ER3SpecificTaskRecallLeakText(candidateReply)) {
    const reasons = Array.isArray(result.reasons) ? result.reasons.slice() : [];
    if (!reasons.includes("priority9e_r3_specific_task_recall_leak")) reasons.push("priority9e_r3_specific_task_recall_leak");
    return {
      ...result,
      allowReply: false,
      forceRecovery: true,
      loopDetected: true,
      reasons,
      failureSignature: "LOOP_GUARD_SUPPRESSED",
      priority9ER3SpecificTaskRecallLeak: true
    };
  }
  return result;
};
applyLoopGuard = function priority9ER3ApplyLoopGuard(packet = {}, candidateReply = "", options = {}) {
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
      protectiveEscalationActive: !!result.protectiveEscalationActive,
      priority9ER3SpecificTaskRecallLeak: !!result.priority9ER3SpecificTaskRecallLeak
    }
  };
};
module.exports.PRIORITY_9E_R3_SPECIFIC_TASK_RECALL_ENFORCEMENT_VERSION = PRIORITY_9E_R3_SPECIFIC_TASK_RECALL_ENFORCEMENT_VERSION;
module.exports.isPriority9ER3SpecificTaskRecallLeakText = isPriority9ER3SpecificTaskRecallLeakText;
module.exports.isPriority9ER3SpecificTaskRecallCommand = isPriority9ER3SpecificTaskRecallCommand;
module.exports.buildPriority9ER3SpecificTaskRecallReply = buildPriority9ER3SpecificTaskRecallReply;
module.exports.evaluateLoop = evaluateLoop;
module.exports.applyLoopGuard = applyLoopGuard;
// PRIORITY_9E_R3_SPECIFIC_TASK_RECALL_SIGNAL_PATCH_END


// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_LOOP_GUARD_PATCH_START
const PRIORITY_9F_R1_LOOP_GUARD_LAYERED_PRECEDENCE_HOTFIX_VERSION="nyx.marion.loopGuard.priority9fR1.layeredPrecedenceHotfix/1.0";
function priority9FR1LayeredPrecedenceNormalize(value){return oneLine(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9FR1LayeredPromptText(value=""){const t=priority9FR1LayeredPrecedenceNormalize(value);return /\b(priority\s*9f|9f\s*r1|deep conversational stack|layered conversational|layered conversation|conversational stack|layered intelligence|full conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action)\b/i.test(t)||(/\b(disjointed|deeper|layered|multi|context|looping|loop|recovery)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next)\b/i.test(t));}
function priority9FR1Stale9ERecallText(value=""){const t=priority9FR1LayeredPrecedenceNormalize(value);return /\b(run the priority\s*90\s*9e|priority\s*90\s*9e\s*(?:test|sequence)|confirm marion is still on priority\s*90\s*9e|retest next steps|retest run that again|block internal recovery wording|public answer stays conversational|continuation regression)\b/i.test(t);}
function priority9FR1LoopGuardCollect(value,depth,seen){if(value==null||depth>4)return [];const type=typeof value;if(type==="string"||type==="number"||type==="boolean")return [oneLine(value)];if(type!=="object")return [];seen=seen||[];if(seen.indexOf(value)>=0)return [];seen.push(value);let out=[];Object.keys(value).slice(0,80).forEach(function(k){if(/^(packet|ctx|options|fallback|userText|userQuery|rawUserQuery|rawUserText|normalizedUserIntent|effectivePrompt|resolvedPrompt|resolvedQuestion|text|query|message|prompt|inputText|originalText|finalPrompt|reply|publicReply|visibleReply|finalReply|displayReply|lastAssistantReply|lastValidTask|activeTask|pendingAction|lastUserIntent|surfaceRequest|deeperIntent|operationalRisk|executionMode|nextAction|input|body|payload|meta|diagnostics|normalized|norm|routing|route|state|session|memory|conversationState|progressionMemory|memoryPatch|sessionPatch|finalEnvelope|questionShape)$/i.test(k)){out=out.concat(priority9FR1LoopGuardCollect(value[k],depth+1,seen));}});return out;}
function priority9FR1LoopGuardSource(packet,options){return priority9FR1LoopGuardCollect({packet,options},0,[]).filter(Boolean).join(" ");}
const __priority9FR1OriginalEvaluateLoop=evaluateLoop;
evaluateLoop=function priority9FR1EvaluateLoop(packet={},candidateReply="",options={}){const result=__priority9FR1OriginalEvaluateLoop(packet,candidateReply,options);const source=priority9FR1LoopGuardSource(packet,options);if(priority9FR1LayeredPromptText(source)&&priority9FR1Stale9ERecallText(candidateReply)){const reasons=Array.isArray(result.reasons)?result.reasons.slice():[];if(!reasons.includes("priority9f_r1_layered_prompt_overrode_9e_recall"))reasons.push("priority9f_r1_layered_prompt_overrode_9e_recall");return {...result,allowReply:false,forceRecovery:true,loopDetected:true,reasons,failureSignature:"LOOP_GUARD_SUPPRESSED",priority9FR1LayeredPrecedenceHotfix:true};}return result;};
applyLoopGuard=function priority9FR1ApplyLoopGuard(packet={},candidateReply="",options={}){const result=evaluateLoop(packet,candidateReply,options);return {...result,packetPatch:{stateStage:result.nextStateStage,loopCount:result.forceRecovery?getLoopCount(packet)+1:0,recoveryRequired:result.forceRecovery,lastLoopReasons:result.reasons,loopGuardVersion:VERSION,telemetryVisibilityVersion:TELEMETRY_VISIBILITY_VERSION,failureSignature:result.failureSignature,failureSignatureAudit:result.failureSignatureAudit,finalRenderTelemetryVersion:FINAL_RENDER_TELEMETRY_VERSION,finalRenderTelemetry:result.finalRenderTelemetry,protectiveEscalation:result.protectiveEscalation,protectiveEscalationActive:!!result.protectiveEscalationActive,priority9FR1LayeredPrecedenceHotfix:!!result.priority9FR1LayeredPrecedenceHotfix}};};
module.exports.PRIORITY_9F_R1_LOOP_GUARD_LAYERED_PRECEDENCE_HOTFIX_VERSION=PRIORITY_9F_R1_LOOP_GUARD_LAYERED_PRECEDENCE_HOTFIX_VERSION;module.exports.isPriority9FR1LayeredPromptText=priority9FR1LayeredPromptText;module.exports.isPriority9FR1Stale9ERecallText=priority9FR1Stale9ERecallText;module.exports.evaluateLoop=evaluateLoop;module.exports.applyLoopGuard=applyLoopGuard;
// PRIORITY_9F_R1_LAYERED_PRECEDENCE_HOTFIX_LOOP_GUARD_PATCH_END

// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_LOOP_GUARD_PATCH_START
const PRIORITY_9F_R2_LOOP_GUARD_DOMAIN_HIJACK_SUPPRESSION_VERSION="nyx.marion.loopGuard.priority9fR2.domainHijackSuppression/1.0";
function priority9FR2LoopNormalize(value=""){return normalizeText(value).replace(/[_-]+/g," ");}
function isPriority9FR2LayeredPromptText(value=""){const t=priority9FR2LoopNormalize(value);return /\b(priority\s*9f|9f\s*r2|domain hijack|domain fallback|six domain fallback|deep conversational stack|layered conversational|conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action|marion conversational architecture)\b/i.test(t)||(/\b(disjointed|deeper|layered|context|looping|loop|recovery|preserve|avoid|where to go next)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next|understand)\b/i.test(t));}
function isPriority9FR2DomainHijackLeakText(value=""){const t=priority9FR2LoopNormalize(value);return /\b(in psychology the focus is how people think feel learn decide and behave|good explanation connects the concept to real patterns triggers and outcomes|in english this means|this is a general reasoning question|the psychology domain|psychology domain|domain question|six domain|knowledge lane|route through the six domain layer)\b/i.test(t);}
const __priority9FR2OriginalEvaluateLoop=evaluateLoop;
evaluateLoop=function priority9FR2EvaluateLoop(fields={}){const base=__priority9FR2OriginalEvaluateLoop(fields);const f=safeObj(fields);const source=oneLine([f.prompt,f.userText,f.inputText,f.rawText,f.normalizedUserIntent,f.effectivePrompt].filter(Boolean).join(" "));const reply=oneLine([f.reply,f.publicReply,f.visibleReply,f.finalReply,f.text].filter(Boolean).join(" "));if(isPriority9FR2LayeredPromptText(source)&&isPriority9FR2DomainHijackLeakText(reply)){return {...safeObj(base),allowReply:false,loopDetected:true,forceRecovery:true,reason:"priority9f_r2_domain_hijack_suppressed",priority9FR2DomainHijackSuppression:true,domainHijackSuppressed:true,noUserFacingDiagnostics:true};}return base;};
applyLoopGuard=function priority9FR2ApplyLoopGuard(fields={}){return evaluateLoop(fields);};
module.exports.PRIORITY_9F_R2_LOOP_GUARD_DOMAIN_HIJACK_SUPPRESSION_VERSION=PRIORITY_9F_R2_LOOP_GUARD_DOMAIN_HIJACK_SUPPRESSION_VERSION;module.exports.isPriority9FR2LayeredPromptText=isPriority9FR2LayeredPromptText;module.exports.isPriority9FR2DomainHijackLeakText=isPriority9FR2DomainHijackLeakText;module.exports.evaluateLoop=evaluateLoop;module.exports.applyLoopGuard=applyLoopGuard;
// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_LOOP_GUARD_PATCH_END


// PRIORITY_9F_R3_ALT_PROMPT_ECHO_SUPPRESSION_LOOP_GUARD_PATCH_START
const PRIORITY_9F_R3_LOOP_GUARD_ALT_PROMPT_ECHO_SUPPRESSION_VERSION="nyx.marion.loopGuard.priority9fR3.altPromptEchoSuppression/1.0";
function priority9FR3LoopNormalize(value=""){return normalizeText(value).replace(/[_-]+/g," ");}
function isPriority9FR3LayeredPromptText(value=""){const t=priority9FR3LoopNormalize(value);return /\b(priority\s*9f|9f\s*r3|alt runtime|prompt echo|deep conversational stack|layered conversational|conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action|marion conversational architecture)\b/i.test(t)||(/\b(disjointed|deeper|layered|context|looping|loop|recovery|preserve|avoid|where to go next|understand)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next|understand|deeper task)\b/i.test(t));}
function isPriority9FR3PromptEchoText(reply="",prompt=""){const r=priority9FR3LoopNormalize(reply),p=priority9FR3LoopNormalize(prompt);if(!r||!p)return false;if(r===p)return true;if(p.length>36&&(r.indexOf(p)>=0||p.indexOf(r)>=0))return true;const rw=r.split(" ").filter(Boolean),pw=p.split(" ").filter(Boolean);if(rw.length<5||pw.length<5)return false;const set=new Set(pw);let hit=0;for(const w of rw){if(set.has(w))hit+=1;}return hit/Math.max(rw.length,pw.length)>=0.86;}
function priority9FR3LoopSource(packet={},options={}){return priority9FR1LoopGuardCollect({packet,options},0,[]).filter(Boolean).join(" ");}
const __priority9FR3OriginalEvaluateLoop=evaluateLoop;
evaluateLoop=function priority9FR3EvaluateLoop(packet={},candidateReply="",options={}){const base=__priority9FR3OriginalEvaluateLoop(packet,candidateReply,options);const source=priority9FR3LoopSource(packet,options);const f=safeObj(packet);const prompt=oneLine([safeObj(options).prompt,safeObj(options).userText,f.prompt,f.userText,f.rawUserText,f.text,f.message,f.query,f.normalizedUserIntent].filter(Boolean).join(" "));if((isPriority9FR3LayeredPromptText(source)||isPriority9FR3LayeredPromptText(prompt))&&isPriority9FR3PromptEchoText(candidateReply,prompt||source)){const reasons=Array.isArray(base.reasons)?base.reasons.slice():[];if(!reasons.includes("priority9f_r3_alt_prompt_echo_suppressed"))reasons.push("priority9f_r3_alt_prompt_echo_suppressed");return {...safeObj(base),allowReply:false,forceRecovery:true,loopDetected:true,reasons,failureSignature:"LOOP_GUARD_SUPPRESSED",priority9FR3AltPromptEchoSuppression:true,promptEchoSuppressed:true,noUserFacingDiagnostics:true};}return base;};
applyLoopGuard=function priority9FR3ApplyLoopGuard(packet={},candidateReply="",options={}){const result=evaluateLoop(packet,candidateReply,options);return {...safeObj(result),packetPatch:{stateStage:result.nextStateStage,loopCount:result.forceRecovery?getLoopCount(packet)+1:0,recoveryRequired:result.forceRecovery,lastLoopReasons:result.reasons,loopGuardVersion:VERSION,telemetryVisibilityVersion:TELEMETRY_VISIBILITY_VERSION,failureSignature:result.failureSignature,failureSignatureAudit:result.failureSignatureAudit,finalRenderTelemetryVersion:FINAL_RENDER_TELEMETRY_VERSION,finalRenderTelemetry:result.finalRenderTelemetry,protectiveEscalation:result.protectiveEscalation,protectiveEscalationActive:!!result.protectiveEscalationActive,priority9FR3AltPromptEchoSuppression:!!result.priority9FR3AltPromptEchoSuppression,promptEchoSuppressed:!!result.promptEchoSuppressed}};};
module.exports.PRIORITY_9F_R3_LOOP_GUARD_ALT_PROMPT_ECHO_SUPPRESSION_VERSION=PRIORITY_9F_R3_LOOP_GUARD_ALT_PROMPT_ECHO_SUPPRESSION_VERSION;module.exports.isPriority9FR3LayeredPromptText=isPriority9FR3LayeredPromptText;module.exports.isPriority9FR3PromptEchoText=isPriority9FR3PromptEchoText;module.exports.evaluateLoop=evaluateLoop;module.exports.applyLoopGuard=applyLoopGuard;
// PRIORITY_9F_R3_ALT_PROMPT_ECHO_SUPPRESSION_LOOP_GUARD_PATCH_END


// PRIORITY_9F_R4_CONTINUATION_CARRY_ENFORCEMENT_LOOP_GUARD_PATCH_START
const PRIORITY_9F_R4_LOOP_GUARD_CONTINUATION_CARRY_VERSION = "nyx.marion.priority9fR4.continuationCarry.loopGuard/1.0";
function priority9FR4LoopNorm(value){return oneLine(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function isPriority9FR4ContinuationCommand(value=""){const n=priority9FR4LoopNorm(value);return /^(next steps?|continue|carry on|proceed|run that again|run it again|do that again|do it again|same thing|what now|whats next|what s next|next)$/.test(n);}
function isPriority9FR4ContinuationCarryText(value=""){const t=priority9FR4LoopNorm(value);return /\b(priority 9f r4|9f r4|continuation carry|last accepted lane|stay inside the 9f|inside the 9f conversational stack|9f conversational stack lane|short continuation|next steps continue run that again what now)\b/.test(t);}
function isPriority9FR4OldHandoffLeakText(value=""){const t=priority9FR4LoopNorm(value);return /\b(public nyx route clean|five turn continuity test|stable handoff before adding new features|keep the public nyx route clean|priority 9f r3 alt runtime prompt echo suppression)\b/.test(t);}
function priority9FR4LoopHas9FContext(value=""){const t=priority9FR4LoopNorm(value);return /\b(priority 9f|9f r3|9f r2|9f r1|deep conversational stack|layered conversational|conversational stack|alt runtime prompt echo suppression|domain hijack suppression|marion conversational architecture)\b/.test(t);}
function priority9FR4LoopSource(packet={},options={}){try{return [JSON.stringify(packet||{}),JSON.stringify(options||{})].join(" ").slice(0,12000);}catch(_){return "";}}
const __priority9FR4OriginalEvaluateLoop=evaluateLoop;
evaluateLoop=function priority9FR4EvaluateLoop(packet={},candidateReply="",options={}){
  const base=__priority9FR4OriginalEvaluateLoop(packet,candidateReply,options);
  const prompt=oneLine((options&&options.prompt)||(options&&options.userText)||(packet&&packet.prompt)||(packet&&packet.userText)||(packet&&packet.rawUserText)||(packet&&packet.text)||(packet&&packet.message)||"");
  const source=priority9FR4LoopSource(packet,options);
  if((isPriority9FR4ContinuationCarryText(prompt)||isPriority9FR4ContinuationCarryText(source)||(isPriority9FR4ContinuationCommand(prompt)&&priority9FR4LoopHas9FContext(source)))&&isPriority9FR4OldHandoffLeakText(candidateReply)){
    const reasons=Array.isArray(base.reasons)?base.reasons.slice():[];
    if(!reasons.includes("priority9f_r4_old_continuity_handoff_suppressed"))reasons.push("priority9f_r4_old_continuity_handoff_suppressed");
    return {...safeObj(base),allowReply:false,forceRecovery:true,loopDetected:true,reasons,failureSignature:"LOOP_GUARD_SUPPRESSED",priority9FR4ContinuationCarryEnforced:true,noUserFacingDiagnostics:true};
  }
  return base;
};
applyLoopGuard=function priority9FR4ApplyLoopGuard(packet={},candidateReply="",options={}){
  const result=evaluateLoop(packet,candidateReply,options);
  return {...safeObj(result),packetPatch:{...safeObj(result.packetPatch),stateStage:result.nextStateStage,loopCount:result.forceRecovery?getLoopCount(packet)+1:0,recoveryRequired:result.forceRecovery,lastLoopReasons:result.reasons,loopGuardVersion:VERSION,failureSignature:result.failureSignature,priority9FR4ContinuationCarryEnforced:!!result.priority9FR4ContinuationCarryEnforced}};
};
module.exports.PRIORITY_9F_R4_LOOP_GUARD_CONTINUATION_CARRY_VERSION=PRIORITY_9F_R4_LOOP_GUARD_CONTINUATION_CARRY_VERSION;
module.exports.isPriority9FR4ContinuationCommand=isPriority9FR4ContinuationCommand;
module.exports.isPriority9FR4ContinuationCarryText=isPriority9FR4ContinuationCarryText;
module.exports.isPriority9FR4OldHandoffLeakText=isPriority9FR4OldHandoffLeakText;
module.exports.evaluateLoop=evaluateLoop;
module.exports.applyLoopGuard=applyLoopGuard;
// PRIORITY_9F_R4_CONTINUATION_CARRY_ENFORCEMENT_LOOP_GUARD_PATCH_END



// PRIORITY_9H_LONG_FORM_CONTINUITY_STRESS_DRIFT_GUARD_LOOP_PATCH_START
const PRIORITY_9H_LONG_FORM_CONTINUITY_LOOP_VERSION = "nyx.marion.priority9h.longFormContinuityStressDriftGuard.loopGuard/1.0";
const PRIORITY_9H_R1_ADVANCEMENT_SHAPE_LOOP_VERSION = "nyx.marion.priority9h.r1AdvancementShapeHotfix.loopGuard/1.0";
function priority9HLoopNorm(value){return oneLine(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9HLoopIsShortFollowup(value){const n=priority9HLoopNorm(value);return /^(next steps?|continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|rerun that|what now|whats next|what s next|next|status|passed|pass|green|go on|advance|same lane|same thread|stay in lane|stay in the same lane|continue from there|from there|what is the risk|what s the risk|risk|what is the active task|what s the active task|active task|current task|what is the next action|what s the next action|next action|next move|summarize where we are|summarise where we are|where are we|recap|summary|do not drift|don t drift|dont drift|no drift|final check|final status|check)$/.test(n);}
function priority9HLoopIsActivationText(value){const n=priority9HLoopNorm(value);return /\b(priority 9h|9h|long form continuity|continuity stress test|memory drift guard|drift guard|10 to 15 turns|ten to fifteen turns|survive 10|short follow ups while preserving|surface request deeper intent active task risk execution mode next action|priority 9i|adaptive situational)\b/.test(n);}
function priority9HLoopHasContext(value){const n=priority9HLoopNorm(value);return /\b(priority 9h|long form continuity|memory drift|drift guard|priority 9g|deep continuity memory|layered follow up|surface request|deeper intent|active task|execution mode|next action|priority 9i)\b/.test(n);}
function priority9HLoopOldLeak(value){const n=priority9HLoopNorm(value);return /\b(priority 9g deep continuity memory|run the multi turn 9g continuity pass|lock a 9g continuity memory object|priority 9f r4|public nyx route clean|five turn continuity test|priority 90 9e|priority 9e|in psychology|domain hijack|prompt echo|recovery path|loop detected|stale fallback)\b/.test(n);}
function priority9HLoopReactivationWording(value){const n=priority9HLoopNorm(value);return /\b(i m reading this as priority 9h with a priority 9i precheck|i am reading this as priority 9h with a priority 9i precheck|priority 9h must pass first|priority 9i is staged next for adaptive situational reasoning)\b/.test(n);}
function priority9HLoopSource(packet,options){try{return [JSON.stringify(packet||{}),JSON.stringify(options||{})].join(" ").slice(0,16000);}catch(_){return "";}}
const __priority9HOriginalEvaluateLoop=evaluateLoop;
evaluateLoop=function priority9HEvaluateLoop(packet={},candidateReply="",options={}){
  const base=__priority9HOriginalEvaluateLoop(packet,candidateReply,options);
  const prompt=oneLine((options&&options.prompt)||(options&&options.userText)||(packet&&packet.prompt)||(packet&&packet.userText)||(packet&&packet.rawUserText)||(packet&&packet.text)||(packet&&packet.message)||"");
  const source=priority9HLoopSource(packet,options);
  if((priority9HLoopIsActivationText(prompt)||priority9HLoopIsActivationText(source)||(priority9HLoopIsShortFollowup(prompt)&&priority9HLoopHasContext(source)))&&priority9HLoopOldLeak(candidateReply)||(priority9HLoopIsShortFollowup(prompt)&&priority9HLoopReactivationWording(candidateReply))){
    const reasons=Array.isArray(base.reasons)?base.reasons.slice():[];
    if(!reasons.includes("priority9h_r1_advancement_shape_suppressed"))reasons.push("priority9h_r1_advancement_shape_suppressed");
    return {...safeObj(base),allowReply:false,forceRecovery:true,loopDetected:true,reasons,failureSignature:"LOOP_GUARD_SUPPRESSED",priority9HMemoryDriftGuard:true,noUserFacingDiagnostics:true};
  }
  return base;
};
applyLoopGuard=function priority9HApplyLoopGuard(packet={},candidateReply="",options={}){
  const result=evaluateLoop(packet,candidateReply,options);
  return {...safeObj(result),packetPatch:{...safeObj(result.packetPatch),stateStage:result.nextStateStage,loopCount:result.forceRecovery?getLoopCount(packet)+1:0,recoveryRequired:result.forceRecovery,lastLoopReasons:result.reasons,loopGuardVersion:VERSION,failureSignature:result.failureSignature,priority9HMemoryDriftGuard:!!result.priority9HMemoryDriftGuard}};
};
module.exports.PRIORITY_9H_LONG_FORM_CONTINUITY_LOOP_VERSION=PRIORITY_9H_LONG_FORM_CONTINUITY_LOOP_VERSION;
module.exports.PRIORITY_9H_R1_ADVANCEMENT_SHAPE_LOOP_VERSION=PRIORITY_9H_R1_ADVANCEMENT_SHAPE_LOOP_VERSION;
module.exports.evaluateLoop=evaluateLoop;
module.exports.applyLoopGuard=applyLoopGuard;
module.exports.isPriority9HMemoryDriftLeak=priority9HLoopOldLeak;
// PRIORITY_9H_LONG_FORM_CONTINUITY_STRESS_DRIFT_GUARD_LOOP_PATCH_END

// PRIORITY_9I_9J_SEQUENCE_LOOP_GUARD_PATCH_START
var PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL = "nyx.marion.priority9i.adaptiveSituationalReasoningContextPressure/1.0";
var PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL = "nyx.marion.priority9j.proactiveOperationalGuidanceNextMoveAuthority/1.0";
function priority9IJStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function priority9IJObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function priority9IJNorm(value){return priority9IJStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9IJCollect(value,limit){try{return JSON.stringify(value||{}).slice(0,limit||22000);}catch(_){return priority9IJStr(value).slice(0,limit||22000);}}
function priority9IJIsShortFollowup(value){var n=priority9IJNorm(value);return /^(next steps?|continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|rerun that|what now|whats next|what s next|next|status|passed|pass|green|go on|advance|same lane|same thread|stay in lane|stay in the same lane|continue from there|continue there|from there|slow down|go deeper|deeper|make the call|safest next move|do the safest next move|what is the risk now|risk now|update the risk|what changed|what changed now|what is the pressure|pressure check|context check|final check)$/i.test(n);}
function priority9IJIsPressureText(value){var n=priority9IJNorm(value);return /\b(urgent|urgency|under pressure|pressure changed|context pressure|time sensitive|time pressure|pivot|we need to pivot|no not that|not that|stay on the architecture|stay with the architecture|same architecture|make the call|make a call|decision pressure|choose|choose now|safest next move|safest action|safe next action|slow down|go deeper|deeper analysis|ambiguity|ambiguous|unclear|risk now|risk changed|operational pressure|context changed|what changed|adapt|adaptive|situational)\b/.test(n);}
function priority9IJIs9IActivationText(value){var n=priority9IJNorm(value);return /\b(priority 9i|9i|adaptive situational|adaptive reasoning|situational reasoning|context pressure|context pressure handling|pressure handling|adaptive situational reasoning|current pressure shift|risk and execution mode|update the risk|priority 9i and 9j|9i and 9j)\b/.test(n);}
function priority9IJIs9JActivationText(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|operational guidance|next move authority|next move authority|critical path|make the decision|make a decision|what should we do first|what do we tackle now|safest sequence|next operational move|what should we avoid|recommend the next move|choose the safest concrete action|controlled authority)\b/.test(n);}

function priority9IJIs9ICorrectionContainmentPrompt(value){var n=priority9IJNorm(value);return /\b(no not that|not that|stay on the architecture|stay with the architecture|same architecture|stay on architecture|stay with architecture|architecture correction|wrong target|not this|stay anchored|keep the architecture|architectural focus)\b/.test(n);}
function priority9IJIs9IPressureOnlyPrompt(value){var n=priority9IJNorm(value);return priority9IJIs9ICorrectionContainmentPrompt(value)||/\b(urgent|urgency|under pressure|pressure changed|context pressure|time sensitive|time pressure|pivot|we need to pivot|slow down|go deeper|deeper analysis|ambiguity|ambiguous|unclear|risk now|risk changed|operational pressure|context changed|what changed|adapt|adaptive|situational|safest next move|safest action|safe next action|do the safest next move|update the risk|what is the risk now|pressure check|context check|correction received)\b/.test(n);}
function priority9IJIsExplicit9JPrompt(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|operational guidance|next move authority|critical path|make the decision|make a decision|what should we do first|what do we tackle now|give me the safest sequence|safest sequence|next operational move|what should we avoid|recommend the next move|choose the safest concrete action|controlled authority)\b/.test(n);}
function priority9IJHasActive9JContext(value){var raw=priority9IJStr(value);var n=priority9IJNorm(value);return /priority9JProactiveOperationalGuidance|priority9j_proactive_operational_guidance|routeKind["']?\s*:\s*["']priority9j|priorityLane["']?\s*:\s*["']Priority 9J/i.test(raw)||/\b(priority 9j proactive operational guidance and next move authority|priority 9j proactive operational guidance)\b/.test(n);}
function priority9IJSequencedLaneFor(prompt,source,reply){var ctx=[prompt,source].join(" ");if(priority9IJIs9IPressureOnlyPrompt(prompt))return "9i";if(priority9IJIs9IActivationText(prompt))return "9i";if(priority9IJIsExplicit9JPrompt(prompt))return "9j";if(priority9IJIsPressureText(prompt)&&priority9IJHas9IContext(ctx))return "9i";if(priority9IJIsShortFollowup(prompt)&&priority9IJHasActive9JContext(ctx))return "9j";if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(ctx))return "9i";if((priority9IJOldLaneLeak(reply)||priority9IJPromptEcho(reply,prompt))&&priority9IJHas9IContext(ctx))return "9i";if((priority9IJOldLaneLeak(reply)||priority9IJPromptEcho(reply,prompt))&&priority9IJHasActive9JContext(ctx))return "9j";if(priority9IJIs9IActivationText(ctx)||priority9IJIsPressureText(prompt))return "9i";return "";}

function priority9IJHas9IContext(value){var n=priority9IJNorm(value);return /\b(priority 9i|9i|adaptive situational|context pressure|pressure handling|pressure shift|9h continuity foundation|priority 9h|long form continuity|memory drift guard|surface request|deeper intent|active task|execution mode|next action)\b/.test(n);}
function priority9IJHas9JContext(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|next move authority|critical path|safest sequence|operational guidance|9i adaptive|context pressure)\b/.test(n);}
function priority9IJPressureKind(value){var n=priority9IJNorm(value);if(/\b(urgent|urgency|time sensitive|time pressure|under pressure)\b/.test(n))return "urgency";if(/\b(no not that|not that|stay on the architecture|same architecture|correction)\b/.test(n))return "correction";if(/\b(pivot|changed|context changed|what changed)\b/.test(n))return "pivot";if(/\b(slow down|too fast|pace)\b/.test(n))return "pace";if(/\b(go deeper|deeper analysis|deeper)\b/.test(n))return "depth";if(/\b(safest|safe next|safety|avoid)\b/.test(n))return "safety";if(/\b(make the call|make a call|decision|choose|critical path)\b/.test(n))return "decision";if(/\b(ambiguity|ambiguous|unclear|clarify)\b/.test(n))return "ambiguity";return "pressure";}
function priority9IJOldLaneLeak(value){var n=priority9IJNorm(value);return !!n&&/\b(i m reading this as priority 9h with a priority 9i precheck|priority 9h must pass first|long form continuity stress test and memory drift guard|priority 9h long form|run the 10 15 turn|priority 9g deep continuity|priority 9f r4|priority 90 9e|priority 90|priority 9e|public nyx route clean|five turn continuity|psychology|in psychology|domain hijack|prompt echo|recovery path|loop detected|stale fallback|i have the current request|marion will answer from this prompt)\b/.test(n);}
function priority9IJPromptEcho(reply,prompt){var r=priority9IJNorm(reply),p=priority9IJNorm(prompt);if(!r||!p)return false;return r===p||(r.includes(p)&&p.length>24)||(p.includes(r)&&r.length>24);}
function priority9IStateFrom(source,turn){var kind=priority9IJPressureKind(source);return {version:PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL,active:true,lane:"priority9i_adaptive_situational_reasoning",activePhase:"priority9i_adaptive_situational_reasoning",conversationLane:"Priority 9I adaptive situational reasoning",activeTask:"Priority 9I: adaptive situational reasoning and context-pressure handling",surfaceRequest:"adapt Marion’s active 9H continuity thread when pressure, urgency, ambiguity, correction, or context changes",deeperIntent:"preserve the mission thread while updating risk, execution mode, and next action under changing pressure",pressureSignal:kind,whatChanged:kind==="urgency"?"urgency increased":kind==="correction"?"the user corrected the target and asked Marion to stay anchored":kind==="pivot"?"the operating context shifted":kind==="pace"?"the required pace changed":kind==="depth"?"the answer needs deeper analysis":kind==="safety"?"the safest action must be prioritized":kind==="decision"?"decision pressure increased":"the situational pressure changed",operationalRisk:"pressure can cause Marion to flatten, overreact, reset the lane, over-branch, or activate 9J before 9I is stable",executionMode:kind==="urgency"?"compressed adaptive execution":kind==="pace"?"slower controlled adaptation":kind==="depth"?"deeper situational analysis":kind==="safety"?"safety-first adaptive execution":"adaptive context-pressure handling",nextAction:"read the pressure shift, update risk and execution mode, then give the safest next action without losing the 9H continuity foundation",baseContinuityFoundation:"Priority 9H live accepted",turnDepth:Number.isFinite(Number(turn))?Number(turn):1,priority9IAdaptiveSituationalReasoning:true,priority9JProactiveGuidancePrecheck:{version:PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL,staged:true,activationRule:"Activate only for explicit Priority 9J or clear next-move authority requests after 9I pressure handling is stable",expectedFocus:"proactive operational guidance and controlled next-move authority"},noUserFacingDiagnostics:true,updatedAt:Date.now()};}
function priority9JStateFrom(source,turn){return {version:PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL,active:true,lane:"priority9j_proactive_operational_guidance",activePhase:"priority9j_proactive_operational_guidance",conversationLane:"Priority 9J proactive operational guidance",activeTask:"Priority 9J: proactive operational guidance and next-move authority",surfaceRequest:"recommend the safest concrete next move when the active context is sufficiently clear",deeperIntent:"move from reactive continuity and pressure handling into controlled operational guidance without overreach",operationalRisk:"premature authority, unnecessary branching, unsafe sequencing, or advising a next move before risk and context are clear",executionMode:"controlled next-move authority",recommendedMove:"choose the safest concrete action that protects the active lane, validates risk, and advances only one operational step",whyFirst:"it comes first because it preserves the accepted continuity foundation before expanding scope",skipRisk:"if skipped, Marion can over-branch, drift, or make a recommendation before the pressure context is resolved",executionSequence:["confirm active lane and pressure state","name the risk if the move is skipped","choose one safest concrete action","give the short execution sequence","avoid opening unrelated branches"],nextAction:"state the safest next operational move, why it comes first, risk if skipped, and the execution sequence",baseAdaptiveFoundation:"Priority 9I adaptive situational reasoning",turnDepth:Number.isFinite(Number(turn))?Number(turn):1,priority9JProactiveOperationalGuidance:true,noUserFacingDiagnostics:true,updatedAt:Date.now()};}
function priority9IReplyFor(prompt,source){var kind=priority9IJPressureKind([prompt,source].join(" "));if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(source)){if(kind==="decision")return "Continue Priority 9I: the pressure signal is decision pressure. Preserve the 9H continuity foundation, update the risk before choosing, keep 9J staged unless explicitly activated, and give the safest next action without opening extra branches.";if(kind==="safety")return "Continue Priority 9I: the pressure signal is safety-first execution. Preserve the active task, update risk, slow the response enough to avoid overreach, and give the safest next action while keeping Priority 9J staged.";if(kind==="depth")return "Continue Priority 9I: the pressure signal is depth. Go deeper inside the same active lane, update risk and execution mode, and give the next action without resetting to 9H activation wording or drifting into 9J.";if(kind==="pace")return "Continue Priority 9I: the pressure signal is pace control. Slow down, keep the 9H continuity foundation intact, clarify the changed constraint, and give one safe next action.";return "Continue Priority 9I: preserve the 9H continuity foundation, read the current pressure shift, update operational risk and execution mode, then give the safest next action. Keep Priority 9J staged until next-move authority is explicitly needed.";}return "I’m reading this as Priority 9I: adaptive situational reasoning and context-pressure handling. The 9H continuity foundation stays active. The surface request is to adapt Marion when urgency, correction, ambiguity, pace, depth, or operational pressure changes; the deeper intent is to update risk and execution mode without losing the active mission thread. Next move: run pressure prompts such as urgent, pivot, stay on the architecture, slow down, go deeper, risk now, and safest next move. Priority 9J is staged next for proactive operational guidance, but 9I handles the pressure shift first.";}
function priority9JReplyFor(prompt,source){return "Priority 9J: proactive operational guidance and next-move authority. The 9H continuity foundation and 9I pressure-handling layer stay underneath this decision. Recommended next move: choose the safest concrete action that preserves the active lane and advances only one operational step. Why first: it protects continuity before expanding scope. Risk if skipped: Marion can over-branch, drift, or make a recommendation before the pressure context is resolved. Execution sequence: confirm the active lane, name the risk, choose one safest action, execute that step, then reassess before opening new branches.";}
function priority9IJReadReply(packet){var p=priority9IJObj(packet),pl=priority9IJObj(p.payload),f=priority9IJObj(p.finalEnvelope);return priority9IJStr(p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.response||p.answer||pl.reply||pl.finalReply||pl.publicReply||pl.visibleReply||pl.text||pl.message||pl.answer||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message||f.answer);}
function priority9IJApplyPacket(packet,reply,prompt,source,lane){var out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};var final=priority9IJStr(reply)||(lane==="9j"?priority9JReplyFor(prompt,source):priority9IReplyFor(prompt,source));["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(function(k){out[k]=final;});out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};var prior=priority9IJObj(out.priority9IAdaptiveSituationalReasoning||out.priority9JProactiveOperationalGuidance||out.priority9HLongFormContinuity||out.longFormContinuityStress);var depth=Number.isFinite(Number(prior.turnDepth))?Number(prior.turnDepth)+1:1;if(lane==="9j"){var sj=priority9JStateFrom(source||prompt,depth);out.priority9JProactiveOperationalGuidance=sj;out.priority9JVersion="PRIORITY-9J-PROACTIVE-OPERATIONAL-GUIDANCE-NEXT-MOVE-AUTHORITY";out.conversationLane=sj.conversationLane;out.activeTask=sj.activeTask;out.surfaceRequest=sj.surfaceRequest;out.deeperIntent=sj.deeperIntent;out.operationalRisk=sj.operationalRisk;out.executionMode=sj.executionMode;out.nextAction=sj.nextAction;out.recommendedMove=sj.recommendedMove;out.executionSequence=sj.executionSequence;}else{var si=priority9IStateFrom(source||prompt,depth);out.priority9IAdaptiveSituationalReasoning=si;out.priority9IVersion="PRIORITY-9I-ADAPTIVE-SITUATIONAL-REASONING-CONTEXT-PRESSURE";out.priority9JPrecheck=si.priority9JProactiveGuidancePrecheck;out.conversationLane=si.conversationLane;out.activeTask=si.activeTask;out.surfaceRequest=si.surfaceRequest;out.deeperIntent=si.deeperIntent;out.operationalRisk=si.operationalRisk;out.executionMode=si.executionMode;out.nextAction=si.nextAction;out.pressureSignal=si.pressureSignal;out.whatChanged=si.whatChanged;}out.noUserFacingDiagnostics=true;return out;}
function priority9IJShouldForceText(prompt,source,reply){var lane=priority9IJSequencedLaneFor(prompt,source,reply);return lane||"";}

function priority9IJLoopGuardPreserve(packet,base){var prompt=priority9IJStr(packet&&typeof packet==="object"?(packet.prompt||packet.text||packet.userText||packet.message||""):packet);var ctx=[prompt,priority9IJCollect(packet),priority9IJCollect(base)].join(" ");if(priority9IJIs9IActivationText(ctx)||priority9IJIs9JActivationText(ctx)||priority9IJIsPressureText(prompt)){return {...priority9IJObj(base),forceRecovery:false,loopDetected:false,priority9IJPreserveAdaptiveReply:true,noUserFacingDiagnostics:true};}return base;}
["inspectLoop","checkLoop","evaluateLoop","guardReply"].forEach(function(name){if(typeof module.exports[name]==="function"){var original=module.exports[name];module.exports[name]=function priority9IJLoopGuardWrapper(packet){return priority9IJLoopGuardPreserve(packet,original.apply(this,arguments));};}});
module.exports.PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_LOOP_GUARD_VERSION=PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL;
module.exports.PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_LOOP_GUARD_VERSION=PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL;
// PRIORITY_9I_9J_SEQUENCE_LOOP_GUARD_PATCH_END


/* PRIVATE_OPERATOR_BOUNDARY_LOCK_PHASE2_START */
(function(){
  "use strict";
  const V="nyx.privateOperatorBoundaryLock.phase2/runtimeWrapper/2.0";
  let lock=null;try{lock=require("./privateOperatorBoundaryLock.js");}catch(_err){try{lock=require("../Data/marion/runtime/privateOperatorBoundaryLock.js");}catch(_err2){lock=null;}}
  if(!lock||!lock.isVerifiedOperatorContext||typeof module==="undefined"||!module.exports)return;
  function ctx(value,args){args=Array.prototype.slice.call(args||[]);return{payload:value,body:args[0],auth:args[1],meta:args[2],headers:(args[0]&&args[0].headers)||(args[1]&&args[1].headers)||{},route:(value&&value.route)||(args[0]&&args[0].route)||(args[0]&&args[0].path)||""};}
  function project(value,args){try{const c=ctx(value,args);return lock.isVerifiedOperatorContext(c)?lock.projectPrivateOperatorFields(value,c):value;}catch(_err){return value;}}
  function wrapFn(fn,name){if(typeof fn!=="function"||fn.__nyxPrivateOperatorBoundaryLock)return fn;const wrapped=function(){const args=arguments;const res=fn.apply(this,args);if(res&&typeof res.then==="function")return res.then(function(v){return project(v,args);});return project(res,args);};try{Object.keys(fn).forEach(function(k){wrapped[k]=fn[k];});}catch(_err){}try{Object.defineProperty(wrapped,"name",{value:fn.name||name||"privateOperatorBoundaryWrapped"});}catch(_err){}wrapped.__nyxPrivateOperatorBoundaryLock=true;return wrapped;}
  try{if(typeof module.exports==="function")module.exports=wrapFn(module.exports,"default");}catch(_err){}
  try{const obj=module.exports&&typeof module.exports==="object"?module.exports:null;if(obj){["processWithMarion","route","maybeResolve","ask","handle","handleVoiceTranscript","handleVoiceInput","default","composeMarionResponse","compose","buildReply","run","handler","createMarionFinalEnvelope","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","normalizeCommand","handleMarionAdminConversation","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","handleCommand","dispatchCommand","routeCommand","command","handleAdminCommand","handleAdminConsoleAction","process","safeResponse","buildResponse","createResponse"].forEach(function(n){if(typeof obj[n]==="function")obj[n]=wrapFn(obj[n],n);});obj.PRIVATE_OPERATOR_BOUNDARY_LOCK_PHASE2_VERSION=V;obj.privateOperatorBoundaryLockProject=lock.projectPrivateOperatorFields;obj.privateOperatorBoundaryLockIsVerified=lock.isVerifiedOperatorContext;}}catch(_err){}
})();
/* PRIVATE_OPERATOR_BOUNDARY_LOCK_PHASE2_END */
