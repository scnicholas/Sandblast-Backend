"use strict";

const VERSION = "marionFinalEnvelope v2.0.0 SINGLE-CONTRACT-AUTHORITY";
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
function nowIso() { return new Date().toISOString(); }

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
  const intent = safeStr(input.intent || (input.marionIntent && input.marionIntent.intent) || routing.intent || "simple_chat") || "simple_chat";
  const domain = safeStr(input.domain || routing.domain || "general") || "general";
  return { intent, domain, mode: safeStr(routing.mode || input.mode || ""), depth: safeStr(routing.depth || input.depth || ""), endpoint: safeStr(routing.endpoint || input.endpoint || "marion://routeMarion.primary") };
}

function extractReply(input = {}) {
  const payload = safeObj(input.payload), synthesis = safeObj(input.synthesis), packet = safeObj(input.packet), packetSynthesis = safeObj(packet.synthesis);
  return safeStr(input.reply || input.text || input.answer || input.output || input.response || input.message || input.spokenText || payload.reply || payload.text || payload.message || synthesis.reply || synthesis.text || packetSynthesis.reply || packetSynthesis.text || "");
}

function createMarionFinalEnvelope(input = {}) {
  const src = safeObj(input);
  const reply = extractReply(src);
  const routing = normalizeRouting(src);
  const memoryPatch = safeObj(src.memoryPatch);
  const metaInput = safeObj(src.meta);
  const diagnostics = safeObj(src.diagnostics || metaInput.diagnostics);
  const replySignature = safeStr(src.replySignature || metaInput.replySignature || hashText(reply));
  const turnId = safeStr(src.turnId || metaInput.turnId || memoryPatch.turnId || "");
  const spokenText = safeStr((src.speech && src.speech.textSpeak) || src.spokenText || reply);
  const marionFinalSignature = buildFinalSignature({ reply, turnId, replySignature, bridgeVersion: metaInput.bridgeVersion || src.bridgeVersion, composerVersion: metaInput.composerVersion || src.composerVersion });

  return {
    ok: !!reply,
    final: true,
    marionFinal: true,
    handled: true,
    source: SOURCE,
    signature: FINAL_SIGNATURE,
    marionFinalSignature,
    finalSignature: marionFinalSignature,
    requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
    contractVersion: CONTRACT_VERSION,
    envelopeVersion: VERSION,
    envelopeId: makeId("marion_final"),
    createdAt: nowIso(),
    reply, text: reply, answer: reply, output: reply, response: reply, message: reply, spokenText,
    intent: routing.intent,
    domain: routing.domain,
    stateStage: safeStr(src.stateStage || memoryPatch.stateStage || memoryPatch.stage || "final") || "final",
    routing,
    memoryPatch,
    payload: { reply, text: reply, message: reply, spokenText, final: true, marionFinal: true, handled: true, contractVersion: CONTRACT_VERSION, signature: FINAL_SIGNATURE, marionFinalSignature, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE },
    packet: {
      final: true, marionFinal: true, handled: true, routing,
      synthesis: { reply, text: reply, answer: reply, output: reply, spokenText, final: true, marionFinal: true, signature: marionFinalSignature, marionFinalSignature, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE },
      memoryPatch,
      meta: { final: true, marionFinal: true, handled: true, contractVersion: CONTRACT_VERSION, envelopeVersion: VERSION, signature: marionFinalSignature, marionFinalSignature, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE, finalMarkers: FINAL_MARKERS.slice() }
    },
    speech: { enabled: !(src.speech && src.speech.enabled === false), silent: !!(src.speech && src.speech.silent), silentAudio: !!(src.speech && src.speech.silentAudio), textDisplay: reply, textSpeak: spokenText, presenceProfile: safeStr((src.speech && src.speech.presenceProfile) || src.presenceProfile || "receptive"), nyxStateHint: safeStr((src.speech && src.speech.nyxStateHint) || src.nyxStateHint || "receptive") },
    meta: { ...metaInput, freshMarionFinal: true, singleFinalAuthority: true, bridgeCompatible: true, widgetCompatible: true, ttsCompatible: true, contractVersion: CONTRACT_VERSION, envelopeVersion: VERSION, finalMarkers: FINAL_MARKERS.slice(), source: SOURCE, replySignature, turnId, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE, signature: marionFinalSignature, marionFinalSignature, finalEnvelopeAuthority: VERSION, diagnostics },
    diagnostics: { ...diagnostics, finalEnvelopeVersion: VERSION, contractVersion: CONTRACT_VERSION, freshMarionFinal: true, singleFinalAuthority: true, replyPresent: !!reply }
  };
}

function createMarionErrorEnvelope(input = {}) {
  const reply = safeStr(input.reply || input.message || "Marion could not produce a valid final response.");
  return createMarionFinalEnvelope({ ...safeObj(input), reply, stateStage: safeStr(input.stateStage || "error"), speech: { enabled: false, silent: true, silentAudio: true }, meta: { ...safeObj(input.meta), error: safeStr(input.code || input.error || "MARION_FINAL_ERROR"), detail: safeStr(input.detail || "") }, diagnostics: { ...safeObj(input.diagnostics), error: safeStr(input.code || input.error || "MARION_FINAL_ERROR"), detail: safeStr(input.detail || "") } });
}

function isMarionFinalEnvelope(value) {
  return !!(isObj(value) && value.final === true && value.marionFinal === true && value.handled === true && value.source === SOURCE && value.signature === FINAL_SIGNATURE && value.contractVersion === CONTRACT_VERSION && typeof value.reply === "string" && !!safeStr(value.reply));
}

function unwrapReply(value) { return isMarionFinalEnvelope(value) ? value.reply : extractReply(value); }

module.exports = { VERSION, CONTRACT_VERSION, FINAL_SIGNATURE, SOURCE, REQUIRED_CHAT_ENGINE_SIGNATURE, MARION_FINAL_SIGNATURE_PREFIX, STATE_SPINE_SCHEMA, STATE_SPINE_SCHEMA_COMPAT, FINAL_MARKERS, buildFinalSignature, createMarionFinalEnvelope, createMarionErrorEnvelope, isMarionFinalEnvelope, unwrapReply };
