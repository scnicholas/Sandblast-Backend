"use strict";

/**
 * marionFinalEnvelope.js
 * marionFinalEnvelope v2.2.0 FINAL-TRANSPORT-CONTRACT-STABILIZED
 * Single-source final envelope builder + validator + JSON-safe transport normalizer.
 */

const VERSION = "marionFinalEnvelope v2.2.0 FINAL-TRANSPORT-CONTRACT-STABILIZED";
const CONTRACT_VERSION = "nyx.marion.final/1.0";
const FINAL_SIGNATURE = "MARION_FINAL_AUTHORITY";
const SOURCE = "marion";
const REQUIRED_CHAT_ENGINE_SIGNATURE = "CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24";
const MARION_FINAL_SIGNATURE_PREFIX = "MARION::FINAL::";
const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";
const CANONICAL_ENDPOINT = "marion://routeMarion.primary";
const MAX_STRING_LENGTH = 12000;
const MAX_DEPTH = 7;
const MAX_ARRAY = 80;

const FINAL_MARKERS = Object.freeze([
  REQUIRED_CHAT_ENGINE_SIGNATURE,
  VERSION,
  CONTRACT_VERSION,
  FINAL_SIGNATURE,
  STATE_SPINE_SCHEMA,
  STATE_SPINE_SCHEMA_COMPAT
]);

function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function lower(value) { return safeStr(value).toLowerCase(); }
function isObj(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function safeObj(value) { return isObj(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function nowIso() { return new Date().toISOString(); }
function firstText() { for (let i = 0; i < arguments.length; i += 1) { const v = safeStr(arguments[i]); if (v) return v; } return ""; }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback; }

function jsonSafeClone(value, maxDepth = MAX_DEPTH) {
  function walk(item, depth, stack) {
    if (item == null) return item;
    const type = typeof item;
    if (type === "string") return item.length > MAX_STRING_LENGTH ? item.slice(0, MAX_STRING_LENGTH) : item;
    if (type === "number") return Number.isFinite(item) ? item : 0;
    if (type === "boolean") return item;
    if (type === "bigint") return String(item);
    if (type === "function" || type === "symbol" || type === "undefined") return undefined;
    if (item instanceof Date) return item.toISOString();
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(item)) return `[buffer:${item.length}]`;
    if (depth >= maxDepth) return "[truncated_depth]";
    if (stack.indexOf(item) !== -1) return "[circular]";
    const nextStack = stack.concat([item]);
    if (Array.isArray(item)) return item.slice(0, MAX_ARRAY).map((x) => walk(x, depth + 1, nextStack)).filter((x) => x !== undefined);
    if (isObj(item)) {
      const out = {};
      for (const key of Object.keys(item)) {
        if (/^(socket|req|res|request|response|stream|connection)$/i.test(key)) continue;
        const v = walk(item[key], depth + 1, nextStack);
        if (v !== undefined) out[key] = v;
      }
      return out;
    }
    return safeStr(item);
  }
  return walk(value, 0, []);
}

function compactObject(value, maxDepth = 4, keyLimit = 80) {
  const obj = safeObj(jsonSafeClone(value, maxDepth));
  const out = {};
  for (const key of Object.keys(obj).slice(0, keyLimit)) out[key] = obj[key];
  return out;
}

const SOFT_RECOVERY_REPLY_PATTERNS = Object.freeze([
  /\bstill here\b.*\brun that one more time\b/i,
  /\bthere was a break in the response\b/i,
  /\bresponse path was interrupted\b/i,
  /\bmarion completed the final reply\b/i,
  /\bkeeping the turn non-emotional\b/i,
  /\brouting it back through the final-envelope path\b/i,
  /\bi[’']?m here and tracking the turn\b/i,
  /\bi am here and tracking the turn\b/i,
  /\bgive me the next clear target\b/i,
  /\bnyx is live and tracking the turn\b/i,
  /\bthe final reply did not validate cleanly\b/i,
  /\bsend the same test once more\b/i,
  /\bgive me the exact target and i[’']?ll break it down\b/i,
  /\bi have the turn\.\s*send the next target\b/i,
  /\bready\.\s*send/i,
  /\bpress reset\b/i,
  /\bsend a specific command\b/i,
  /\bi blocked a repeated fallback\b/i
]);

const DIAGNOSTIC_REPLY_PATTERNS = Object.freeze([
  /\b(final envelope missing|diagnostic packet|non-final|composer_invalid|compose_reply_missing|marion did not return)\b/i,
  /\b(authoritative_reply_missing|packet_synthesis_reply_missing|contract_missing|packet_missing)\b/i,
  /\b(final_envelope_unavailable|bridge_error|packet_invalid|contract_invalid)\b/i
]);

function isSoftRecoveryReply(value) { const text = lower(value); return !!(text && SOFT_RECOVERY_REPLY_PATTERNS.some((rx) => rx.test(text))); }
function isDiagnosticReply(value) { const text = lower(value); return !!(text && DIAGNOSTIC_REPLY_PATTERNS.some((rx) => rx.test(text))); }
function isActionableFinalReply(value) { const text = safeStr(value); return !!(text && text.length >= 8 && !isSoftRecoveryReply(text) && !isDiagnosticReply(text)); }
function hasHardFailure(diagnostics = {}, meta = {}) {
  const d = safeObj(diagnostics), m = safeObj(meta);
  const code = lower(d.error || d.reason || d.code || m.error || m.reason || m.code || "");
  return !!(d.bridgeError === true || d.transportError === true || d.fatal === true || m.bridgeError === true || m.transportError === true || m.fatal === true || /fatal|transport_error|bridge_error|contract_invalid|packet_invalid/.test(code));
}

function validateFinalReply(reply, context = {}) {
  const text = safeStr(reply);
  const reasons = [];
  if (!text) reasons.push("reply_missing");
  if (text && text.length < 8) reasons.push("reply_too_short");
  if (isSoftRecoveryReply(text)) reasons.push("soft_recovery_reply_rejected");
  if (isDiagnosticReply(text)) reasons.push("diagnostic_reply_rejected");
  if (hasHardFailure(context.diagnostics, context.meta)) reasons.push("hard_failure_marker_present");
  return { ok: reasons.length === 0, reply: text, reasons, actionable: reasons.length === 0 };
}

function hashText(value) { const source = safeStr(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); let hash = 0; for (let i = 0; i < source.length; i += 1) { hash = ((hash << 5) - hash) + source.charCodeAt(i); hash |= 0; } return String(hash >>> 0); }
function cleanToken(value, fallback) { const token = safeStr(value || fallback || "turn").replace(/::+/g, ":").replace(/\s+/g, "_").slice(0, 180); return token || safeStr(fallback || "turn"); }
function makeId(prefix = "marion_final") { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`; }
function buildFinalSignature({ reply = "", turnId = "", replySignature = "", bridgeVersion = "", composerVersion = "" } = {}) { const seed = cleanToken(replySignature || hashText(reply || turnId || Date.now()), "reply"); const turn = cleanToken(turnId || "turn", "turn"); const bridge = cleanToken(bridgeVersion || "marionBridge", "marionBridge"); const composer = cleanToken(composerVersion || "composeMarionResponse", "composeMarionResponse"); return `${MARION_FINAL_SIGNATURE_PREFIX}${REQUIRED_CHAT_ENGINE_SIGNATURE}::${bridge}::${composer}::${VERSION}::${STATE_SPINE_SCHEMA}::${FINAL_SIGNATURE}::${turn}::${seed}`; }

function normalizeStateStage(value, fallback = "final") { const raw = lower(value || fallback || "final").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); if (!raw) return "final"; if (["recover", "recovery", "loop_recovery", "stabilize", "blocked", "fallback", "deliver", "advance", "complete", "completed", "composed"].includes(raw)) return "final"; if (["final", "compose", "routed", "classified", "intake", "open", "error"].includes(raw)) return raw; return fallback || "final"; }
function normalizeRouting(input = {}) { const routing = safeObj(input.routing); return { intent: firstText(input.intent, safeObj(input.marionIntent).intent, routing.intent, "simple_chat"), domain: firstText(input.domain, routing.domain, "general"), mode: safeStr(routing.mode || input.mode || ""), depth: safeStr(routing.depth || input.depth || ""), endpoint: safeStr(routing.endpoint || input.endpoint || CANONICAL_ENDPOINT) || CANONICAL_ENDPOINT }; }

function extractReply(input = {}) { const src = safeObj(input), payload = safeObj(src.payload), synthesis = safeObj(src.synthesis), packet = safeObj(src.packet), packetSynthesis = safeObj(packet.synthesis), packetPayload = safeObj(packet.payload), finalEnvelope = safeObj(src.finalEnvelope || payload.finalEnvelope || packet.finalEnvelope || packetPayload.finalEnvelope); return firstText(finalEnvelope.reply, finalEnvelope.text, finalEnvelope.answer, finalEnvelope.output, finalEnvelope.response, finalEnvelope.message, finalEnvelope.spokenText, src.reply, src.text, src.answer, src.output, src.response, src.message, src.spokenText, payload.reply, payload.text, payload.answer, payload.output, payload.response, payload.message, payload.spokenText, synthesis.reply, synthesis.text, synthesis.answer, synthesis.output, synthesis.spokenText, packetSynthesis.reply, packetSynthesis.text, packetSynthesis.answer, packetSynthesis.output, packetSynthesis.spokenText); }
function extractResolvedEmotion(input = {}) { const src = safeObj(input), memoryPatch = safeObj(src.memoryPatch), sessionPatch = safeObj(src.sessionPatch), packet = safeObj(src.packet); return safeObj(src.resolvedEmotion || src.emotionState || src.lastEmotionState || src.emotionalState || (src.emotionRuntime && safeObj(src.emotionRuntime).state) || memoryPatch.resolvedEmotion || memoryPatch.emotionState || memoryPatch.lastEmotionState || sessionPatch.resolvedEmotion || sessionPatch.emotionState || safeObj(packet.memoryPatch).resolvedEmotion || {}); }
function normalizePatch(value = {}) { return compactObject(value, 5, 100); }
function normalizeEmotionSummary(value = {}) { const s = safeObj(jsonSafeClone(value, 4)); return { ok: s.ok !== false, mode: safeStr(s.mode || "resolved_state_only"), primary: safeStr(s.primary || "neutral"), secondary: safeStr(s.secondary || "unclear"), confidence: clamp01(s.confidence, 0), intensity: clamp01(s.intensity, 0), action_mode: safeStr(s.action_mode || "supportive_monitoring"), care_mode: safeStr(s.care_mode || ""), source: safeStr(s.source || "marionFinalEnvelope") }; }

function buildCompletionStatus({ reply, resolvedEmotion, memoryPatch, diagnostics, meta }) { const validation = validateFinalReply(reply, { diagnostics, meta }); const hasEmotion = !!Object.keys(safeObj(resolvedEmotion)).length; const hasMemory = !!Object.keys(safeObj(memoryPatch)).length; const hardFailure = hasHardFailure(diagnostics, meta); const actionable = validation.ok; const softRecovery = isSoftRecoveryReply(reply); const confidence = actionable ? (hasEmotion ? 0.99 : 0.96) : (softRecovery ? 0.18 : 0.35); return { complete: actionable && !hardFailure, stabilized: actionable && !softRecovery && !hardFailure, actionableReply: actionable, emotionallyCoherentFinal: actionable && hasEmotion, memoryPatchPresent: hasMemory, completionConfidence: confidence, requiresRetry: !actionable || hardFailure, recoverySuggested: !actionable || hardFailure, softRecoveryDetected: softRecovery, validationReasons: validation.reasons, reason: actionable && !hardFailure ? "trusted_final_reply_complete" : (validation.reasons[0] || "reply_not_actionable") }; }

function buildEnvelopeCore({ reply, spokenText, routing, turnId, replySignature, marionFinalSignature, envelopeId, createdAt, stateStage }) { return { ok: !!reply, final: true, marionFinal: true, handled: true, source: SOURCE, signature: FINAL_SIGNATURE, marionFinalSignature, finalSignature: marionFinalSignature, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE, contractVersion: CONTRACT_VERSION, envelopeVersion: VERSION, envelopeId, createdAt, reply, text: reply, answer: reply, output: reply, response: reply, message: reply, spokenText, intent: routing.intent, domain: routing.domain, stateStage, replySignature }; }
function validateReplyContract(envelope = {}) { const e = safeObj(envelope), reasons = []; if (e.final !== true) reasons.push("final_flag_missing"); if (e.marionFinal !== true) reasons.push("marion_final_flag_missing"); if (e.handled !== true) reasons.push("handled_flag_missing"); if (e.source !== SOURCE) reasons.push("source_not_marion"); if (e.signature !== FINAL_SIGNATURE) reasons.push("signature_missing"); if (e.contractVersion !== CONTRACT_VERSION) reasons.push("contract_version_mismatch"); if (!safeStr(e.reply)) reasons.push("reply_missing"); if (!safeStr(e.replySignature)) reasons.push("reply_signature_missing"); if (!safeStr(e.marionFinalSignature || e.finalSignature)) reasons.push("marion_final_signature_missing"); if (e.requiresRetry === true || e.recoverySuggested === true) reasons.push("retry_marker_present"); if (!isActionableFinalReply(e.reply)) reasons.push("reply_not_actionable"); return { ok: reasons.length === 0, reasons }; }
function normalizeFinalTransport(envelope = {}) { const e = safeObj(envelope); const renderReady = e.final === true && e.marionFinal === true && isActionableFinalReply(e.reply) && e.requiresRetry !== true; return { transport: { jsonSafe: true, socketSafe: true, renderReady, emitOrder: "finalEnvelope:first,sessionPatch:afterFinal,diagnostics:last", reconnectSafe: true, shouldReconnect: false, deliveryTiming: "single_final_packet" }, ui: { renderReady, shouldReconnect: false, connectionState: "ready", awaitMore: false } }; }
function sanitizeFinalEnvelope(envelope = {}) { return jsonSafeClone(envelope, MAX_DEPTH); }

function createMarionFinalEnvelope(input = {}) {
  const src = safeObj(input);
  const metaInput = compactObject(src.meta, 4, 80);
  const diagnostics = compactObject(src.diagnostics || metaInput.diagnostics || {}, 4, 80);
  const reply = extractReply(src);
  const routing = normalizeRouting(src);
  const memoryPatch = normalizePatch(src.memoryPatch);
  const sessionPatch = normalizePatch(src.sessionPatch || src.memoryPatch);
  const resolvedEmotion = compactObject(extractResolvedEmotion(src), 5, 80);
  const emotionSummary = normalizeEmotionSummary(src.emotionSummary || safeObj(src.emotionRuntime).summary || {});
  const replySignature = safeStr(src.replySignature || metaInput.replySignature || memoryPatch.replySignature || hashText(reply));
  const turnId = safeStr(src.turnId || metaInput.turnId || memoryPatch.turnId || "");
  const spokenText = firstText(safeObj(src.speech).textSpeak, src.spokenText, reply);
  const stateStage = normalizeStateStage(src.stateStage || memoryPatch.stateStage || memoryPatch.stage || "final", "final");
  const envelopeId = makeId("marion_final");
  const createdAt = nowIso();
  const marionFinalSignature = buildFinalSignature({ reply, turnId, replySignature, bridgeVersion: metaInput.bridgeVersion || src.bridgeVersion, composerVersion: metaInput.composerVersion || src.composerVersion });
  const completionStatus = buildCompletionStatus({ reply, resolvedEmotion, memoryPatch, diagnostics, meta: metaInput });
  const core = buildEnvelopeCore({ reply, spokenText, routing, turnId, replySignature, marionFinalSignature, envelopeId, createdAt, stateStage });
  const completionConfidence = completionStatus.completionConfidence;
  const requiresRetry = completionStatus.requiresRetry;
  const recoverySuggested = completionStatus.recoverySuggested;
  const stabilized = completionStatus.stabilized;
  const transportMeta = normalizeFinalTransport({ ...core, requiresRetry, recoverySuggested });

  const finalEnvelope = { ...core, memoryPatch, sessionPatch, resolvedEmotion, emotionSummary, completionStatus, completionConfidence, requiresRetry, recoverySuggested, stabilized, validation: { finalReply: validateFinalReply(reply, { diagnostics, meta: metaInput }), replyContract: null }, meta: { freshMarionFinal: true, singleFinalAuthority: true, contractVersion: CONTRACT_VERSION, envelopeVersion: VERSION, source: SOURCE, signature: marionFinalSignature, marionFinalSignature, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE, finalMarkers: FINAL_MARKERS.slice(), turnId, replySignature, stateSpineSchema: STATE_SPINE_SCHEMA, stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT } };
  finalEnvelope.validation.replyContract = validateReplyContract(finalEnvelope);

  const finalEnvelopeCopy = jsonSafeClone(finalEnvelope, 6);
  const transportCopy = jsonSafeClone(transportMeta.transport, 3);
  const response = { ...core, routing, memoryPatch, sessionPatch, resolvedEmotion, emotionSummary, finalEnvelope: finalEnvelopeCopy, completionStatus, completionConfidence, requiresRetry, recoverySuggested, stabilized, payload: { reply, text: reply, message: reply, answer: reply, output: reply, response: reply, authoritativeReply: reply, spokenText, final: true, marionFinal: true, handled: true, contractVersion: CONTRACT_VERSION, signature: FINAL_SIGNATURE, marionFinalSignature, finalSignature: marionFinalSignature, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE, finalEnvelope: finalEnvelopeCopy, memoryPatch, sessionPatch, resolvedEmotion, emotionSummary, completionStatus, completionConfidence, requiresRetry, recoverySuggested, stabilized, transport: transportCopy }, packet: { final: true, marionFinal: true, handled: true, routing, synthesis: { reply, text: reply, answer: reply, output: reply, spokenText, final: true, marionFinal: true, signature: marionFinalSignature, marionFinalSignature, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE }, memoryPatch, sessionPatch, completionStatus, completionConfidence, requiresRetry, recoverySuggested, stabilized, meta: { final: true, marionFinal: true, handled: true, contractVersion: CONTRACT_VERSION, envelopeVersion: VERSION, signature: marionFinalSignature, marionFinalSignature, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE, finalMarkers: FINAL_MARKERS.slice(), freshMarionFinal: true, singleFinalAuthority: true, replySignature, turnId, completionStatus, completionConfidence, requiresRetry, recoverySuggested, stabilized, transport: transportCopy } }, speech: { enabled: !(src.speech && src.speech.enabled === false), silent: !!(src.speech && src.speech.silent), silentAudio: !!(src.speech && src.speech.silentAudio), textDisplay: reply, textSpeak: spokenText, presenceProfile: safeStr(safeObj(src.speech).presenceProfile || src.presenceProfile || "receptive"), nyxStateHint: safeStr(safeObj(src.speech).nyxStateHint || src.nyxStateHint || "receptive"), timingProfile: compactObject(safeObj(src.speech).timingProfile || safeObj(safeObj(resolvedEmotion).support).timing_profile || {}, 3, 20) }, ui: jsonSafeClone(transportMeta.ui, 3), transport: transportCopy, meta: { ...metaInput, freshMarionFinal: true, singleFinalAuthority: true, bridgeCompatible: true, widgetCompatible: true, ttsCompatible: true, stateSpineCompatible: true, contractVersion: CONTRACT_VERSION, envelopeVersion: VERSION, finalMarkers: FINAL_MARKERS.slice(), source: SOURCE, replySignature, turnId, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE, signature: marionFinalSignature, marionFinalSignature, finalEnvelopeAuthority: VERSION, resolvedEmotionPresent: !!Object.keys(resolvedEmotion).length, completionStatus, completionConfidence, requiresRetry, recoverySuggested, stabilized, diagnostics, transport: transportCopy }, diagnostics: { ...diagnostics, finalEnvelopeVersion: VERSION, contractVersion: CONTRACT_VERSION, freshMarionFinal: true, singleFinalAuthority: true, replyPresent: !!reply, nestedFinalEnvelopePresent: true, memoryPatchPresent: !!Object.keys(memoryPatch).length, sessionPatchPresent: !!Object.keys(sessionPatch).length, resolvedEmotionPresent: !!Object.keys(resolvedEmotion).length, completionStatus, completionConfidence, requiresRetry, recoverySuggested, stabilized, softRecoveryDetected: completionStatus.softRecoveryDetected, validation: finalEnvelope.validation.finalReply, replyContract: finalEnvelope.validation.replyContract, jsonSafe: true, transportSafe: true } };
  return sanitizeFinalEnvelope(response);
}

function createMarionErrorEnvelope(input = {}) { const reply = safeStr(input.reply || input.message || "Marion could not produce a valid final response."); return createMarionFinalEnvelope({ ...safeObj(input), reply, stateStage: "error", speech: { enabled: false, silent: true, silentAudio: true }, meta: { ...safeObj(input.meta), error: safeStr(input.code || input.error || "MARION_FINAL_ERROR"), detail: safeStr(input.detail || ""), fatal: true }, diagnostics: { ...safeObj(input.diagnostics), error: safeStr(input.code || input.error || "MARION_FINAL_ERROR"), detail: safeStr(input.detail || ""), fatal: true } }); }
function isMarionFinalEnvelope(value) { const v = safeObj(value); const target = Object.keys(safeObj(v.finalEnvelope)).length ? safeObj(v.finalEnvelope) : v; const validation = validateReplyContract(target); return !!(validation.ok && safeObj(target.completionStatus).complete !== false); }
function unwrapReply(value) { const v = safeObj(value); if (isMarionFinalEnvelope(v)) return safeStr(safeObj(v.finalEnvelope).reply || v.reply); return extractReply(value); }

module.exports = { VERSION, CONTRACT_VERSION, FINAL_SIGNATURE, SOURCE, REQUIRED_CHAT_ENGINE_SIGNATURE, MARION_FINAL_SIGNATURE_PREFIX, STATE_SPINE_SCHEMA, STATE_SPINE_SCHEMA_COMPAT, CANONICAL_ENDPOINT, FINAL_MARKERS, buildFinalSignature, createMarionFinalEnvelope, createMarionErrorEnvelope, isMarionFinalEnvelope, unwrapReply, validateFinalReply, validateReplyContract, normalizeFinalTransport, sanitizeFinalEnvelope, _internal: { extractReply, extractResolvedEmotion, normalizeRouting, hashText, safeObj, safeArray, jsonSafeClone, normalizePatch, isSoftRecoveryReply, isDiagnosticReply, isActionableFinalReply, buildCompletionStatus, hasHardFailure, normalizeStateStage } };
