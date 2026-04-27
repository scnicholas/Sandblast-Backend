"use strict";

/**
 * marionBridge.js
 * Clean reduced Marion bridge.
 *
 * Mission:
 * - validate inbound packet
 * - call marionIntentRouter
 * - call composeMarionResponse
 * - mark final
 * - return response
 *
 * Non-goals:
 * - no fallback personality
 * - no emotional interpretation
 * - no packet re-wrapping
 * - no legacy retriever orchestration
 */

const VERSION = "marionBridge v6.5.1 TRANSPORT-AUTHORITY-LOCK + TRUSTED-FINAL-GATE + COMPOSER-RECOVERY + FINAL-ENVELOPE-MIRROR + ERROR-CONTRACT-FIX";
const BRIDGE_PATCH_TAG = "INDEX-COHESION-FINAL-ENVELOPE-HARDLOCK";
const CANONICAL_ENDPOINT = "marion://routeMarion.primary";
const REQUIRED_CHAT_ENGINE_SIGNATURE = "CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24";
const COMPOSER_VERSION_MARKER = "composeMarionResponse v2.4.0 SINGLE-EMISSION-RECOVERY-FINAL-ENVELOPE";
const MARION_FINAL_SIGNATURE_PREFIX = "MARION::FINAL::";
const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";
const FINAL_ENVELOPE_CONTRACT = "nyx.marion.final/1.0";
const FINAL_SIGNATURE = "MARION_FINAL_AUTHORITY";
const MARION_FINAL_MARKERS = Object.freeze([
  REQUIRED_CHAT_ENGINE_SIGNATURE,
  VERSION,
  COMPOSER_VERSION_MARKER,
  BRIDGE_PATCH_TAG,
  CANONICAL_ENDPOINT,
  STATE_SPINE_SCHEMA,
  STATE_SPINE_SCHEMA_COMPAT,
  FINAL_ENVELOPE_CONTRACT,
  FINAL_SIGNATURE
]);

function signaturePart(value) {
  return safeStr(value).replace(/::+/g, ":").replace(/\s+/g, "_").slice(0, 180);
}

function buildMarionFinalSignature(replySignature, turnId) {
  const seed = signaturePart(replySignature || hashText(turnId || Date.now()));
  const turn = signaturePart(turnId || "turn");
  return `${MARION_FINAL_SIGNATURE_PREFIX}${REQUIRED_CHAT_ENGINE_SIGNATURE}::${signaturePart(VERSION)}::${signaturePart(COMPOSER_VERSION_MARKER)}::${signaturePart(BRIDGE_PATCH_TAG)}::${signaturePart(STATE_SPINE_SCHEMA)}::${turn}::${seed}`;
}

function hasRequiredFinalSignature(value) {
  if (isObj(value)) {
    if (finalEnvelopeMod && typeof finalEnvelopeMod.isMarionFinalEnvelope === "function") {
      try { if (finalEnvelopeMod.isMarionFinalEnvelope(value)) return true; } catch (_) {}
    }
    if (value.contractVersion === FINAL_ENVELOPE_CONTRACT && value.source === "marion" && value.signature === FINAL_SIGNATURE && value.final === true) return true;
  }
  const sig = safeStr(value);
  return !!(
    sig &&
    (
      (
        sig.indexOf(MARION_FINAL_SIGNATURE_PREFIX) === 0 &&
        sig.indexOf(REQUIRED_CHAT_ENGINE_SIGNATURE) !== -1 &&
        (sig.indexOf(signaturePart(VERSION)) !== -1 || /marionBridge_v6\./i.test(sig) || sig.indexOf("marionBridge") !== -1) &&
        (sig.indexOf(signaturePart(STATE_SPINE_SCHEMA)) !== -1 || sig.indexOf(signaturePart(STATE_SPINE_SCHEMA_COMPAT)) !== -1)
      )
    )
  );
}


function objectContainsRequiredFinalSignature(value, depth = 0) {
  if (depth > 8 || value == null) return false;
  if (typeof value === "string") return hasRequiredFinalSignature(value);
  if (Array.isArray(value)) return value.some((item) => objectContainsRequiredFinalSignature(item, depth + 1));
  if (isObj(value)) {
    if (hasRequiredFinalSignature(value)) return true;
    if (hasRequiredFinalSignature(value.signature || value.marionFinalSignature || value.finalSignature)) return true;
    return Object.keys(value).some((key) => objectContainsRequiredFinalSignature(value[key], depth + 1));
  }
  return false;
}

function isTrustedMarionFinal(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const packet = safeObj(src.packet);
  const packetMeta = safeObj(packet.meta);
  const synthesis = safeObj(packet.synthesis);
  const finalEnvelope = safeObj(src.finalEnvelope || payload.finalEnvelope || meta.finalEnvelope);

  if (finalEnvelopeMod && typeof finalEnvelopeMod.isMarionFinalEnvelope === "function") {
    try {
      if (finalEnvelopeMod.isMarionFinalEnvelope(src)) return true;
      if (finalEnvelopeMod.isMarionFinalEnvelope(finalEnvelope)) return true;
    } catch (_) {}
  }

  const marionSideFinal = !!(
    src.marionFinal === true ||
    payload.marionFinal === true ||
    packet.marionFinal === true ||
    packetMeta.marionFinal === true ||
    synthesis.marionFinal === true ||
    finalEnvelope.final === true
  );

  const trustedEnvelopeObject = !!(
    finalEnvelope.contractVersion === FINAL_ENVELOPE_CONTRACT &&
    finalEnvelope.source === "marion" &&
    finalEnvelope.signature === FINAL_SIGNATURE &&
    finalEnvelope.final === true
  );

  return !!(
    trustedEnvelopeObject ||
    (
      marionSideFinal &&
      objectContainsRequiredFinalSignature(src, 0)
    )
  );
}

function tryRequireMany(paths) {
  for (const p of Array.isArray(paths) ? paths : []) {
    try {
      const mod = require(p);
      if (mod) return mod;
    } catch (_err) {}
  }
  return null;
}

const commandNormalizerMod = tryRequireMany([
  "./Data/marion/runtime/marionCommandNormalizer",
  "./Data/marion/runtime/marionCommandNormalizer.js",
  "./marionCommandNormalizer",
  "./marionCommandNormalizer.js",
  "./utils/marionCommandNormalizer",
  "./utils/marionCommandNormalizer.js",
  "./Utils/marionCommandNormalizer",
  "./Utils/marionCommandNormalizer.js"
]);

const loopGuardMod = tryRequireMany([
  "./Data/marion/runtime/marionLoopGuard",
  "./Data/marion/runtime/marionLoopGuard.js",
  "./marionLoopGuard",
  "./marionLoopGuard.js",
  "./utils/marionLoopGuard",
  "./utils/marionLoopGuard.js",
  "./Utils/marionLoopGuard",
  "./Utils/marionLoopGuard.js"
]);

const finalEnvelopeMod = tryRequireMany([
  "./Data/marion/runtime/marionFinalEnvelope",
  "./Data/marion/runtime/marionFinalEnvelope.js",
  "./marionFinalEnvelope",
  "./marionFinalEnvelope.js",
  "./utils/marionFinalEnvelope",
  "./utils/marionFinalEnvelope.js",
  "./Utils/marionFinalEnvelope",
  "./Utils/marionFinalEnvelope.js"
]);

let routeMarionIntent = null;
let composeMarionResponse = null;

const intentRouterMod = tryRequireMany([
  "./Data/marion/runtime/marionIntentRouter",
  "./Data/marion/runtime/marionIntentRouter.js",
  "./marionIntentRouter",
  "./marionIntentRouter.js"
]);
if (intentRouterMod && typeof intentRouterMod.routeMarionIntent === "function") {
  routeMarionIntent = intentRouterMod.routeMarionIntent;
}

const composerMod = tryRequireMany([
  "./composeMarionResponse",
  "./composeMarionResponse.js",
  "./Data/marion/composeMarionResponse",
  "./Data/marion/composeMarionResponse.js",
  "./Data/marion/runtime/composeMarionResponse",
  "./Data/marion/runtime/composeMarionResponse.js"
]);
if (composerMod && typeof composerMod.composeMarionResponse === "function") {
  composeMarionResponse = composerMod.composeMarionResponse;
}

function safeStr(value) {
  return value == null ? "" : String(value).trim();
}

function isObj(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeObj(value) {
  return isObj(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function lower(value) {
  return safeStr(value).toLowerCase();
}

function hashText(value) {
  const source = lower(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

function nowIso() {
  return new Date().toISOString();
}

function firstText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = safeStr(arguments[i]);
    if (value) return value;
  }
  return "";
}

function extractUserText(input = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  const payload = safeObj(src.payload);
  const packet = safeObj(src.packet);
  const synthesis = safeObj(packet.synthesis);

  return firstText(
    src.userQuery,
    src.text,
    src.query,
    src.message,
    body.userQuery,
    body.text,
    body.query,
    body.message,
    payload.userQuery,
    payload.text,
    payload.query,
    payload.message,
    synthesis.userQuery,
    synthesis.text
  );
}

function extractLane(input = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  const session = safeObj(src.session || body.session);
  const meta = safeObj(src.meta || body.meta);

  return firstText(
    src.lane,
    src.sessionLane,
    body.lane,
    body.sessionLane,
    session.lane,
    meta.lane,
    "general"
  ) || "general";
}

function extractTurnId(input = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  const meta = safeObj(src.meta || body.meta);

  return firstText(
    src.turnId,
    src.requestId,
    src.traceId,
    src.id,
    body.turnId,
    body.requestId,
    body.traceId,
    meta.turnId,
    meta.requestId,
    meta.traceId
  );
}

function extractPreviousMemory(input = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  const session = safeObj(src.session || body.session);
  const meta = safeObj(src.meta || body.meta);

  return safeObj(
    src.previousMemory ||
    src.turnMemory ||
    src.memory ||
    body.previousMemory ||
    body.turnMemory ||
    body.memory ||
    session.previousMemory ||
    session.turnMemory ||
    session.memory ||
    meta.previousMemory ||
    {}
  );
}

function extractMarionIntentPacket(input = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  const session = safeObj(src.session || body.session);
  const meta = safeObj(src.meta || body.meta);

  return safeObj(
    src.marionIntent ||
    src.intentPacket ||
    body.marionIntent ||
    body.intentPacket ||
    session.marionIntent ||
    meta.marionIntent ||
    {}
  );
}

function extractRequestedDomain(input = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  const meta = safeObj(src.meta || body.meta);
  const packet = safeObj(src.packet);
  const routing = safeObj(packet.routing);

  return firstText(
    src.requestedDomain,
    src.domain,
    body.requestedDomain,
    body.domain,
    meta.requestedDomain,
    meta.domain,
    meta.preferredDomain,
    routing.domain,
    "general"
  ) || "general";
}

function isAlreadyFinal(input = {}) {
  const src = safeObj(input);
  const meta = safeObj(src.meta);
  const packet = safeObj(src.packet);
  const packetMeta = safeObj(packet.meta);

  return !!(
    src.final === true ||
    src.handled === true ||
    src.marionFinal === true ||
    src.marionHandled === true ||
    meta.final === true ||
    meta.marionFinal === true ||
    packet.final === true ||
    packet.marionFinal === true ||
    packetMeta.final === true ||
    packetMeta.marionFinal === true
  );
}

function normalizeInbound(input = {}) {
  const source = safeObj(input);
  const userQuery = extractUserText(source);
  const turnId = extractTurnId(source) || `marion_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const lane = extractLane(source);
  const requestedDomain = extractRequestedDomain(source);
  const previousMemory = extractPreviousMemory(source);
  const marionIntent = extractMarionIntentPacket(source);

  const issues = [];
  if (!userQuery) issues.push("user_query_missing");

  return {
    ok: issues.length === 0,
    issues,
    original: source,
    userQuery,
    text: userQuery,
    query: userQuery,
    lane,
    requestedDomain,
    domain: requestedDomain,
    previousMemory,
    marionIntent,
    turnId,
    sessionId: firstText(source.sessionId, source.body && source.body.sessionId, source.meta && source.meta.sessionId, "public") || "public"
  };
}

function validateRouterResult(result = {}) {
  const src = safeObj(result);
  const routing = safeObj(src.routing);
  const marionIntent = safeObj(src.marionIntent);
  const issues = [];

  if (!src.ok) issues.push("router_not_ok");
  if (!safeStr(routing.intent || marionIntent.intent)) issues.push("intent_missing");
  if (!safeStr(routing.domain)) issues.push("domain_missing");

  return { ok: issues.length === 0, issues };
}

function extractReply(contract = {}) {
  const src = safeObj(contract);
  const synthesis = safeObj(src.synthesis);
  const payload = safeObj(src.payload);
  const packet = safeObj(src.packet);
  const packetSynthesis = safeObj(packet.synthesis);

  return firstText(
    src.reply,
    src.text,
    src.answer,
    src.output,
    src.response,
    src.message,
    src.spokenText,
    payload.reply,
    payload.text,
    payload.answer,
    payload.output,
    synthesis.reply,
    synthesis.text,
    synthesis.answer,
    synthesis.output,
    synthesis.spokenText,
    packetSynthesis.reply,
    packetSynthesis.text,
    packetSynthesis.answer,
    packetSynthesis.output,
    packetSynthesis.spokenText
  );
}

function validateComposeResult(contract = {}) {
  const src = safeObj(contract);
  const issues = [];

  if (!Object.keys(src).length) issues.push("compose_contract_missing");
  if (src.ok === false) issues.push("compose_not_ok");
  if (!extractReply(src)) issues.push("compose_reply_missing");

  return { ok: issues.length === 0, issues };
}

function buildErrorResult(reason, detail = {}, input = {}) {
  const normalized = safeObj(input);
  const userQuery = safeStr(normalized.userQuery || normalized.text || normalized.query || "");
  const turnId = safeStr(normalized.turnId || "");
  const domain = safeStr(normalized.domain || normalized.requestedDomain || "general") || "general";
  const intent = safeStr(normalized.intent || "bridge_error") || "bridge_error";
  const cleanReason = safeStr(reason || "bridge_error") || "bridge_error";

  return {
    ok: false,
    error: true,
    status: "awaiting_marion",
    reason: cleanReason,
    detail: safeObj(detail),
    final: false,
    handled: true,
    marionFinal: false,
    marionHandled: false,
    awaitingMarion: true,
    terminal: false,

    userQuery,
    domain,
    intent,
    reply: "",
    text: "",
    answer: "",
    output: "",
    response: "",
    message: "",
    spokenText: "",
    followUps: [],
    followUpsStrings: [],

    payload: {
      reply: "",
      text: "",
      answer: "",
      output: "",
      response: "",
      message: "",
      spokenText: "",
      final: false,
      marionFinal: false,
      handled: true,
      awaitingMarion: true,
      error: true
    },

    packet: {
      final: false,
      marionFinal: false,
      handled: true,
      routing: { domain, intent, endpoint: CANONICAL_ENDPOINT },
      synthesis: { reply: "", text: "", answer: "", output: "", spokenText: "" },
      meta: {
        version: VERSION,
        endpoint: CANONICAL_ENDPOINT,
        turnId,
        final: false,
        marionFinal: false,
        handled: true,
        awaitingMarion: true,
        bridgeReduced: true,
        noFallbackPersonality: true,
        noUserFacingBridgeError: true,
        replyAuthority: "none",
        reason: cleanReason
      }
    },

    diagnostics: {
      bridgeVersion: VERSION,
      bridgeError: true,
      noUserFacingBridgeError: true,
      awaitingMarion: true,
      terminal: false,
      reason: cleanReason,
      detail: safeObj(detail)
    },

    meta: {
      version: VERSION,
      endpoint: CANONICAL_ENDPOINT,
      turnId,
      final: false,
      marionFinal: false,
      handled: true,
      awaitingMarion: true,
      terminal: false,
      finalizedBy: "marionBridge",
      bridgeReduced: true,
      noFallbackPersonality: true,
      noUserFacingBridgeError: true,
      replyAuthority: "none",
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: MARION_FINAL_MARKERS.slice(),
      finalEnvelopeContract: FINAL_ENVELOPE_CONTRACT,
      hardlockCompatible: true,
      reason: cleanReason
    }
  };
}

function buildPacket({ normalized, routed, contract, reply, replySignature }) {
  const routing = safeObj(routed.routing);
  const intent = safeStr(routing.intent || safeObj(routed.marionIntent).intent || contract.intent || "simple_chat") || "simple_chat";
  const domain = safeStr(routing.domain || contract.domain || normalized.domain || "general") || "general";
  const endpoint = safeStr(routing.endpoint || CANONICAL_ENDPOINT) || CANONICAL_ENDPOINT;
  const synthesis = safeObj(contract.synthesis);
  const marionFinalSignature = safeStr(contract.marionFinalSignature || safeObj(contract.meta).marionFinalSignature || safeObj(contract.meta).signature || safeObj(contract.diagnostics).marionFinalSignature || buildMarionFinalSignature(replySignature, normalized.turnId));

  return {
    routing: { domain, intent, endpoint },
    synthesis: {
      ...synthesis,
      domain,
      intent,
      reply,
      text: reply,
      answer: reply,
      output: reply,
      signature: marionFinalSignature,
      marionFinalSignature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: MARION_FINAL_MARKERS.slice(),
      spokenText: safeStr(contract.spokenText || synthesis.spokenText || reply.replace(/\n+/g, " ")) || reply
    },
    memoryPatch: safeObj(contract.memoryPatch),
    meta: {
      version: VERSION,
      endpoint,
      turnId: normalized.turnId,
      replySignature,
      final: true,
      marionFinal: true,
      handled: true,
      finalizedBy: "marionBridge",
      bridgeReduced: true,
      singleSourceOfTruth: true,
      signature: marionFinalSignature,
      marionFinalSignature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: MARION_FINAL_MARKERS.slice(),
      hardlockCompatible: true
    }
  };
}

function markFinal(result = {}, input = {}) {
  const src = safeObj(result);
  const normalized = safeObj(input);
  const reply = extractReply(src);
  const replySignature = safeStr(src.replySignature || hashText(reply));
  const spokenText = safeStr(src.spokenText || reply.replace(/\n+/g, " ")) || reply;
  const marionFinalSignature = safeStr(src.marionFinalSignature || src.signature || safeObj(src.meta).marionFinalSignature || safeObj(src.meta).signature || safeObj(src.diagnostics).marionFinalSignature || buildMarionFinalSignature(replySignature, normalized.turnId || src.turnId));
  const finalEnvelope = safeObj(src.finalEnvelope || safeObj(src.payload).finalEnvelope || safeObj(src.meta).finalEnvelope);

  const out = {
    ...src,
    ok: src.ok !== false,
    final: true,
    handled: true,
    marionFinal: true,
    marionHandled: true,
    composedOnce: true,
    finalizedBy: "marionBridge",
    replyAuthority: "composeMarionResponse",
    replySignature,
    signature: marionFinalSignature,
    marionFinalSignature,
    requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
    finalMarkers: MARION_FINAL_MARKERS.slice(),
    endpoint: safeStr(src.endpoint || safeObj(src.meta).endpoint || CANONICAL_ENDPOINT) || CANONICAL_ENDPOINT,
    userQuery: safeStr(src.userQuery || normalized.userQuery || normalized.text || ""),
    domain: safeStr(src.domain || normalized.domain || normalized.requestedDomain || "general") || "general",
    intent: safeStr(src.intent || normalized.intent || "simple_chat") || "simple_chat",
    reply,
    text: reply,
    answer: reply,
    output: reply,
    response: reply,
    message: reply,
    spokenText,
    followUps: safeArray(src.followUps),
    followUpsStrings: safeArray(src.followUpsStrings),
    payload: {
      ...safeObj(src.payload),
      reply,
      text: reply,
      answer: reply,
      output: reply,
      response: reply,
      message: reply,
      spokenText,
      signature: marionFinalSignature,
      marionFinalSignature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: MARION_FINAL_MARKERS.slice(),
      finalEnvelope: Object.keys(finalEnvelope).length ? finalEnvelope : undefined,
      finalEnvelopeContract: FINAL_ENVELOPE_CONTRACT,
      final: true,
      marionFinal: true,
      handled: true
    },
    meta: {
      ...safeObj(src.meta),
      version: VERSION,
      endpoint: safeStr(src.endpoint || safeObj(src.meta).endpoint || CANONICAL_ENDPOINT) || CANONICAL_ENDPOINT,
      turnId: safeStr(normalized.turnId || src.turnId || safeObj(src.meta).turnId || ""),
      final: true,
      marionFinal: true,
      handled: true,
      finalizedBy: "marionBridge",
      bridgeReduced: true,
      noFallbackPersonality: true,
      noRewrap: true,
      singleSourceOfTruth: true,
      replySignature,
      signature: marionFinalSignature,
      marionFinalSignature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: MARION_FINAL_MARKERS.slice(),
      hardlockCompatible: true
    }
  };

  if (!isObj(out.packet) || !Object.keys(out.packet).length) {
    out.packet = {
      routing: { domain: out.domain, intent: out.intent, endpoint: out.endpoint },
      synthesis: { reply, text: reply, answer: reply, output: reply, spokenText, signature: marionFinalSignature, marionFinalSignature, requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE, finalMarkers: MARION_FINAL_MARKERS.slice() },
      memoryPatch: safeObj(out.memoryPatch),
      meta: out.meta
    };
  } else {
    out.packet = {
      ...out.packet,
      final: true,
      marionFinal: true,
      handled: true,
      routing: {
        ...safeObj(out.packet.routing),
        domain: safeStr(safeObj(out.packet.routing).domain || out.domain),
        intent: safeStr(safeObj(out.packet.routing).intent || out.intent),
        endpoint: safeStr(safeObj(out.packet.routing).endpoint || out.endpoint)
      },
      synthesis: {
        ...safeObj(out.packet.synthesis),
        reply,
        text: reply,
        answer: reply,
        output: reply,
        spokenText,
        signature: marionFinalSignature,
        marionFinalSignature,
        requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
        finalMarkers: MARION_FINAL_MARKERS.slice()
      },
      meta: {
        ...safeObj(out.packet.meta),
        ...out.meta,
        final: true,
        marionFinal: true,
        handled: true,
        finalizedBy: "marionBridge",
        signature: marionFinalSignature,
        marionFinalSignature,
        requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
        finalMarkers: MARION_FINAL_MARKERS.slice(),
        hardlockCompatible: true
      }
    };
  }

  out.finalEnvelope = Object.keys(finalEnvelope).length ? finalEnvelope : out.finalEnvelope;
  if (isObj(out.payload)) {
    out.payload.finalEnvelope = out.finalEnvelope;
    out.payload.finalEnvelopeContract = FINAL_ENVELOPE_CONTRACT;
  }
  if (isObj(out.meta)) {
    out.meta.finalEnvelope = out.finalEnvelope;
    out.meta.finalEnvelopeContract = FINAL_ENVELOPE_CONTRACT;
  }
  if (isObj(out.packet) && isObj(out.packet.meta)) {
    out.packet.meta.finalEnvelope = out.finalEnvelope;
    out.packet.meta.finalEnvelopeContract = FINAL_ENVELOPE_CONTRACT;
  }

  out.indexCohesion = {
    ok: true,
    endpoint: out.endpoint || CANONICAL_ENDPOINT,
    finalEnvelope: true,
    hardlockCompatible: true,
    requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
    signature: marionFinalSignature,
    marionFinalSignature,
    markers: MARION_FINAL_MARKERS.slice()
  };

  out.meta.indexCohesion = out.indexCohesion;
  out.payload.indexCohesion = out.indexCohesion;
  out.diagnostics = {
    ...safeObj(out.diagnostics),
    indexCohesion: out.indexCohesion,
    freshFinalEnvelope: true,
    hardlockCompatible: true
  };

  return out;
}

function normalizeComposeInput(normalized, routed) {
  const routing = safeObj(routed.routing);
  const marionIntent = safeObj(routed.marionIntent);

  return {
    userQuery: normalized.userQuery,
    text: normalized.userQuery,
    query: normalized.userQuery,
    domain: safeStr(routing.domain || normalized.domain || "general") || "general",
    requestedDomain: safeStr(routing.domain || normalized.requestedDomain || "general") || "general",
    intent: safeStr(routing.intent || marionIntent.intent || "simple_chat") || "simple_chat",
    marionIntent,
    routing,
    previousMemory: normalized.previousMemory,
    conversationState: safeObj(normalized.previousMemory.stateSpine || normalized.previousMemory.conversationState),
    lane: normalized.lane,
    sessionId: normalized.sessionId,
    turnId: normalized.turnId,
    sourceTurnId: normalized.turnId
  };
}

function bridgeRecoveryReply(normalized = {}, loopResult = {}) {
  const text = safeStr(normalized.userQuery || normalized.text || normalized.query || "");
  const intent = safeStr(normalized.intent || safeObj(normalized.marionIntent).intent || "simple_chat");
  const technical = intent === "technical_debug" || /debug|patch|update|fix|script|file|index|state|state spine|loop|looping|autopsy|downloadable|zip|route|endpoint/i.test(text);
  const emotional = intent === "emotional_support" || /depressed|sad|anxious|overwhelmed|hurt|lonely|panic|grief|stressed/i.test(text);
  const reasons = safeArray(loopResult.reasons).slice(0, 2).join(", ");

  if (technical) return `Recovery path engaged. I’m advancing the diagnosis instead of repeating the blocker: verify normalized input, routed intent, composer reply, loop-guard result, and final envelope for this exact turn${reasons ? " (" + reasons + ")" : ""}.`;
  if (emotional) return "Recovery path engaged. I won’t repeat the same support line. Tell me the part that feels heaviest right now, and I’ll stay with that specific point.";
  return "Recovery path engaged. I’m clearing the stale turn and ready for the next clear target.";
}

async function processWithMarion(input = {}) {
  if (isAlreadyFinal(input) && isTrustedMarionFinal(input)) return markFinal(input, input);

  let inbound = safeObj(input);
  let commandPacket = {};
  if (commandNormalizerMod && typeof commandNormalizerMod.normalizeCommand === "function") {
    try {
      commandPacket = commandNormalizerMod.normalizeCommand(input);
      inbound = {
        ...inbound,
        text: safeStr(commandPacket.userText || inbound.text || inbound.userQuery || inbound.query),
        userQuery: safeStr(commandPacket.userText || inbound.userQuery || inbound.text || inbound.query),
        query: safeStr(commandPacket.userText || inbound.query || inbound.text || inbound.userQuery),
        sessionId: safeStr(commandPacket.sessionId || inbound.sessionId),
        source: safeStr(commandPacket.source || inbound.source),
        channel: safeStr(commandPacket.channel || inbound.channel),
        state: safeObj(commandPacket.state),
        commandPacket
      };
    } catch (err) {
      commandPacket = { ok: false, error: safeStr(err && (err.message || err) || "command_normalizer_failed") };
    }
  }

  const normalized = normalizeInbound(inbound);
  normalized.commandPacket = safeObj(commandPacket);
  if (!normalized.ok) {
    return buildErrorResult("input_invalid", { issues: normalized.issues }, normalized);
  }

  if (typeof routeMarionIntent !== "function") {
    return buildErrorResult("intent_router_unavailable", { dependency: "marionIntentRouter.routeMarionIntent" }, normalized);
  }

  if (typeof composeMarionResponse !== "function") {
    return buildErrorResult("composer_unavailable", { dependency: "composeMarionResponse.composeMarionResponse" }, normalized);
  }

  const routed = await Promise.resolve(routeMarionIntent({
    text: normalized.userQuery,
    query: normalized.userQuery,
    userQuery: normalized.userQuery,
    lane: normalized.lane,
    requestedDomain: normalized.requestedDomain,
    domain: normalized.domain,
    marionIntent: normalized.marionIntent,
    previousMemory: normalized.previousMemory,
    session: {
      lane: normalized.lane,
      previousMemory: normalized.previousMemory,
      marionIntent: normalized.marionIntent
    },
    turnId: normalized.turnId
  }));

  const routerValidation = validateRouterResult(routed);
  if (!routerValidation.ok) {
    return buildErrorResult("intent_router_invalid", { issues: routerValidation.issues, routed }, normalized);
  }

  const composeInput = normalizeComposeInput(normalized, routed);
  const contract = await Promise.resolve(composeMarionResponse({
    ...safeObj(routed),
    primaryDomain: safeStr(safeObj(routed.routing).domain || composeInput.domain),
    domain: safeStr(safeObj(routed.routing).domain || composeInput.domain),
    intent: safeStr(safeObj(routed.routing).intent || composeInput.intent),
    routing: safeObj(routed.routing),
    marionIntent: safeObj(routed.marionIntent)
  }, composeInput));

  const composeValidation = validateComposeResult(contract);
  if (!composeValidation.ok) {
    return buildErrorResult("composer_invalid", { issues: composeValidation.issues }, {
      ...normalized,
      intent: composeInput.intent,
      domain: composeInput.domain
    });
  }

  let reply = extractReply(contract);
  let loopGuardResult = { ok: true, loopDetected: false, allowReply: true, forceRecovery: false, reasons: [] };
  if (loopGuardMod && typeof loopGuardMod.applyLoopGuard === "function") {
    try {
      loopGuardResult = loopGuardMod.applyLoopGuard({
        ...composeInput,
        state: {
          ...safeObj(composeInput.conversationState),
          ...safeObj(normalized.commandPacket && normalized.commandPacket.state),
          lastAssistantReply: safeStr(safeObj(composeInput.conversationState).lastAssistantReply || safeObj(normalized.commandPacket && normalized.commandPacket.state).lastAssistantReply),
          loopCount: Number(safeObj(composeInput.conversationState).loopCount || safeObj(normalized.commandPacket && normalized.commandPacket.state).loopCount || 0)
        }
      }, reply);
      if (loopGuardResult.forceRecovery) {
        const recoveryContract = await Promise.resolve(composeMarionResponse({
          ...safeObj(routed),
          primaryDomain: safeStr(safeObj(routed.routing).domain || composeInput.domain),
          domain: safeStr(safeObj(routed.routing).domain || composeInput.domain),
          intent: safeStr(safeObj(routed.routing).intent || composeInput.intent),
          routing: safeObj(routed.routing),
          marionIntent: safeObj(routed.marionIntent),
          forceRecovery: true,
          recoveryRequired: true,
          loopGuard: loopGuardResult,
          lastLoopReasons: safeArray(loopGuardResult.reasons)
        }, {
          ...composeInput,
          forceRecovery: true,
          recoveryRequired: true,
          loopGuard: loopGuardResult,
          lastLoopReasons: safeArray(loopGuardResult.reasons),
          state: {
            ...safeObj(composeInput.conversationState),
            stateStage: "recover",
            recoveryRequired: true,
            loopCount: Number(safeObj(composeInput.conversationState).loopCount || 0) + 1,
            lastLoopReasons: safeArray(loopGuardResult.reasons)
          }
        }));
        if (validateComposeResult(recoveryContract).ok) {
          Object.assign(contract, recoveryContract);
          reply = extractReply(contract);
        }
      }
    } catch (err) {
      loopGuardResult = { ok: false, loopDetected: false, allowReply: true, forceRecovery: false, reasons: ["loop_guard_error"], detail: safeStr(err && (err.message || err) || "") };
    }
  }
  const replySignature = hashText(reply);
  const packet = buildPacket({ normalized: composeInput, routed, contract, reply, replySignature });
  const marionFinalSignature = safeStr(packet && packet.meta && (packet.meta.signature || packet.meta.marionFinalSignature)) || buildMarionFinalSignature(replySignature, composeInput.turnId || normalized.turnId);

  return markFinal({
    ...safeObj(contract),
    ok: true,
    status: "ok",
    endpoint: safeStr(safeObj(routed.routing).endpoint || CANONICAL_ENDPOINT) || CANONICAL_ENDPOINT,
    userQuery: normalized.userQuery,
    domain: composeInput.domain,
    intent: composeInput.intent,
    reply,
    text: reply,
    answer: reply,
    output: reply,
    response: reply,
    message: reply,
    spokenText: safeStr(contract.spokenText || reply.replace(/\n+/g, " ")) || reply,
    replySignature,
    packet,
    payload: {
      ...safeObj(contract.payload),
      reply,
      text: reply,
      answer: reply,
      output: reply,
      response: reply,
      message: reply,
      spokenText: safeStr(contract.spokenText || reply.replace(/\n+/g, " ")) || reply,
      signature: safeStr(packet.meta.signature || packet.meta.marionFinalSignature),
      marionFinalSignature: safeStr(packet.meta.marionFinalSignature || packet.meta.signature),
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: MARION_FINAL_MARKERS.slice()
    },
    diagnostics: {
      ...safeObj(contract.diagnostics),
      bridgeVersion: VERSION,
      bridgeReduced: true,
      validatedPacket: true,
      stateSpineSchema: STATE_SPINE_SCHEMA,
      stateBridge: safeObj(safeObj(contract.memoryPatch).stateBridge),
      routerCalled: true,
      composerCalled: true,
      loopGuardCalled: !!loopGuardMod,
      loopDetected: !!loopGuardResult.forceRecovery,
      loopGuard: safeObj(loopGuardResult),
      finalMarked: true,
      noFallbackPersonality: true,
      noEmotionalInterpretation: true,
      noRewrap: true,
      routerVersion: safeStr(routed.routerVersion || routed.VERSION || ""),
      composerVersion: safeStr(contract.version || ""),
      normalizerVersion: safeStr(commandNormalizerMod && commandNormalizerMod.VERSION || ""),
      loopGuardVersion: safeStr(loopGuardMod && loopGuardMod.VERSION || ""),
      finalEnvelopeVersion: safeStr(finalEnvelopeMod && finalEnvelopeMod.VERSION || ""),
      signature: safeStr(packet.meta.signature || packet.meta.marionFinalSignature),
      marionFinalSignature: safeStr(packet.meta.marionFinalSignature || packet.meta.signature),
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: MARION_FINAL_MARKERS.slice(),
      hardlockCompatible: true
    },
    meta: {
      ...safeObj(contract.meta),
      version: VERSION,
      endpoint: CANONICAL_ENDPOINT,
      turnId: normalized.turnId,
      routedIntent: composeInput.intent,
      routedDomain: composeInput.domain,
      final: true,
      marionFinal: true,
      handled: true,
      finalizedBy: "marionBridge",
      bridgeReduced: true,
      replySignature,
      signature: marionFinalSignature,
      marionFinalSignature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: MARION_FINAL_MARKERS.slice(),
      hardlockCompatible: true,
      loopDetected: !!loopGuardResult.forceRecovery,
      loopGuard: safeObj(loopGuardResult)
    },
    finalEnvelope: finalEnvelopeMod && typeof finalEnvelopeMod.createMarionFinalEnvelope === "function" ? finalEnvelopeMod.createMarionFinalEnvelope({
      reply,
      intent: composeInput.intent,
      domain: composeInput.domain,
      routing: safeObj(routed.routing),
      stateStage: loopGuardResult.forceRecovery ? "recover" : "final",
      sessionId: normalized.sessionId,
      state: { conversationDepth: 0, loopCount: loopGuardResult.forceRecovery ? 1 : 0, recoveryRequired: !!loopGuardResult.forceRecovery },
      meta: {
        normalizerVersion: safeStr(commandNormalizerMod && commandNormalizerMod.VERSION || ""),
        routerVersion: safeStr(routed.routerVersion || routed.VERSION || ""),
        bridgeVersion: VERSION,
        composerVersion: safeStr(contract.version || ""),
        loopGuardVersion: safeStr(loopGuardMod && loopGuardMod.VERSION || ""),
        diagnostics: safeObj(loopGuardResult)
      }
    }) : null,
    routed
  }, composeInput);
}

async function retrieveLayer2Signals(input = {}) {
  const normalized = normalizeInbound(input);
  if (!normalized.ok) {
    return {
      ok: false,
      issues: normalized.issues,
      userQuery: normalized.userQuery,
      domain: normalized.domain,
      intent: "input_invalid",
      diagnostics: { bridgeReduced: true, noLegacyRetrievers: true }
    };
  }

  if (typeof routeMarionIntent !== "function") {
    return {
      ok: false,
      issues: ["intent_router_unavailable"],
      userQuery: normalized.userQuery,
      domain: normalized.domain,
      intent: "router_unavailable",
      diagnostics: { bridgeReduced: true, noLegacyRetrievers: true }
    };
  }

  const routed = await Promise.resolve(routeMarionIntent({
    text: normalized.userQuery,
    query: normalized.userQuery,
    userQuery: normalized.userQuery,
    lane: normalized.lane,
    requestedDomain: normalized.requestedDomain,
    domain: normalized.domain,
    marionIntent: normalized.marionIntent,
    previousMemory: normalized.previousMemory,
    turnId: normalized.turnId
  }));

  const routing = safeObj(routed.routing);
  return {
    ok: true,
    endpoint: safeStr(routing.endpoint || CANONICAL_ENDPOINT) || CANONICAL_ENDPOINT,
    userQuery: normalized.userQuery,
    domain: safeStr(routing.domain || normalized.domain || "general") || "general",
    intent: safeStr(routing.intent || safeObj(routed.marionIntent).intent || "simple_chat") || "simple_chat",
    routing,
    marionIntent: safeObj(routed.marionIntent),
    diagnostics: {
      bridgeReduced: true,
      noLegacyRetrievers: true,
      routerCalled: true,
      routerVersion: safeStr(routed.routerVersion || "")
    }
  };
}

function createMarionBridge(options = {}) {
  const memoryProvider = safeObj(options.memoryProvider);

  return {
    version: VERSION,
    canonicalEndpoint: CANONICAL_ENDPOINT,
    async maybeResolve(req = {}) {
      const meta = safeObj(req.meta);
      const previousMemory = typeof memoryProvider.getContext === "function"
        ? safeObj(await Promise.resolve(memoryProvider.getContext(req)))
        : safeObj(req.previousMemory || meta.previousMemory || req.session && req.session.previousMemory || {});

      const result = await processWithMarion({
        ...safeObj(req),
        userQuery: firstText(req.userQuery, req.text, req.query, safeObj(req.body).text, safeObj(req.body).query),
        requestedDomain: firstText(meta.preferredDomain, meta.domain, req.domain, req.requestedDomain, "general"),
        previousMemory,
        marionIntent: safeObj(req.marionIntent || meta.marionIntent || safeObj(req.session).marionIntent),
        turnId: firstText(meta.turnId, req.turnId, req.id, meta.requestId, req.requestId),
        sessionId: firstText(req.sessionId, meta.sessionId, "public"),
        lane: firstText(req.lane, meta.lane, safeObj(req.session).lane, "general")
      });

      const resultMeta = safeObj(result.meta);
      const resultPayload = safeObj(result.payload);
      const resultPacket = safeObj(result.packet);
      const resultPacketMeta = safeObj(resultPacket.meta);
      const wrapperSignature = safeStr(
        result.signature ||
        result.marionFinalSignature ||
        resultMeta.signature ||
        resultMeta.marionFinalSignature ||
        resultPayload.signature ||
        resultPayload.marionFinalSignature ||
        resultPacketMeta.signature ||
        resultPacketMeta.marionFinalSignature ||
        buildMarionFinalSignature(result.replySignature || hashText(result.reply), result.turnId || resultMeta.turnId || safeObj(req.meta).turnId || req.turnId)
      );
      const resultFinalEnvelope = safeObj(result.finalEnvelope || resultPayload.finalEnvelope || resultMeta.finalEnvelope);
      const wrapperMeta = {
        ...resultMeta,
        version: VERSION,
        final: true,
        marionFinal: true,
        handled: true,
        marionHandled: true,
        finalizedBy: "marionBridge",
        bridgeReduced: true,
        singleSourceOfTruth: true,
        signature: wrapperSignature,
        marionFinalSignature: wrapperSignature,
        requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
        finalMarkers: MARION_FINAL_MARKERS.slice(),
        finalEnvelope: Object.keys(resultFinalEnvelope).length ? resultFinalEnvelope : undefined,
        finalEnvelopeContract: FINAL_ENVELOPE_CONTRACT,
        hardlockCompatible: true
      };
      const wrapperPayload = {
        ...resultPayload,
        reply: result.reply,
        text: result.reply,
        answer: result.reply,
        output: result.reply,
        response: result.reply,
        message: result.reply,
        spokenText: result.spokenText,
        final: true,
        marionFinal: true,
        handled: true,
        signature: wrapperSignature,
        marionFinalSignature: wrapperSignature,
        requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
        finalMarkers: MARION_FINAL_MARKERS.slice(),
        finalEnvelope: Object.keys(resultFinalEnvelope).length ? resultFinalEnvelope : undefined,
        finalEnvelopeContract: FINAL_ENVELOPE_CONTRACT
      };
      const wrapperPacket = isObj(resultPacket) && Object.keys(resultPacket).length
        ? {
            ...resultPacket,
            final: true,
            marionFinal: true,
            handled: true,
            meta: {
              ...resultPacketMeta,
              ...wrapperMeta
            },
            synthesis: {
              ...safeObj(resultPacket.synthesis),
              reply: result.reply,
              text: result.reply,
              answer: result.reply,
              output: result.reply,
              spokenText: result.spokenText,
              signature: wrapperSignature,
              marionFinalSignature: wrapperSignature,
              requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
              finalMarkers: MARION_FINAL_MARKERS.slice()
            }
          }
        : {
            final: true,
            marionFinal: true,
            handled: true,
            routing: { domain: result.domain, intent: result.intent, endpoint: result.endpoint || CANONICAL_ENDPOINT },
            synthesis: {
              reply: result.reply,
              text: result.reply,
              answer: result.reply,
              output: result.reply,
              spokenText: result.spokenText,
              signature: wrapperSignature,
              marionFinalSignature: wrapperSignature,
              requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
              finalMarkers: MARION_FINAL_MARKERS.slice()
            },
            meta: wrapperMeta
          };

      return {
        ...safeObj(result),
        ok: result.ok !== false,
        final: true,
        handled: true,
        marionFinal: true,
        marionHandled: true,
        usedBridge: result.ok !== false && !!safeStr(result.reply),
        packet: wrapperPacket,
        response: result.reply,
        fallbackSuppressed: true,
        message: result.reply,
        reply: result.reply,
        text: result.reply,
        answer: result.reply,
        output: result.reply,
        spokenText: result.spokenText,
        domain: result.domain,
        intent: result.intent,
        endpoint: result.endpoint,
        meta: wrapperMeta,
        signature: wrapperSignature,
        marionFinalSignature: wrapperSignature,
        requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
        finalMarkers: MARION_FINAL_MARKERS.slice(),
        hardlockCompatible: true,
        diagnostics: {
          ...safeObj(result.diagnostics),
          bridgeWrapperFinalized: true,
          signature: wrapperSignature,
          marionFinalSignature: wrapperSignature,
          requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
          finalMarkers: MARION_FINAL_MARKERS.slice(),
          hardlockCompatible: true
        },
        followUps: result.followUps,
        followUpsStrings: result.followUpsStrings,
        payload: wrapperPayload
      };
    }
  };
}

async function route(input = {}) {
  return processWithMarion(input);
}

async function maybeResolve(input = {}) {
  const bridge = createMarionBridge();
  return bridge.maybeResolve(input);
}

const ask = route;
const handle = route;

module.exports = {
  VERSION,
  BRIDGE_PATCH_TAG,
  CANONICAL_ENDPOINT,
  REQUIRED_CHAT_ENGINE_SIGNATURE,
  MARION_FINAL_SIGNATURE_PREFIX,
  MARION_FINAL_MARKERS,
  STATE_SPINE_SCHEMA,
  commandNormalizerAvailable: !!commandNormalizerMod,
  loopGuardAvailable: !!loopGuardMod,
  finalEnvelopeAvailable: !!finalEnvelopeMod,
  hasRequiredFinalSignature,
  isTrustedMarionFinal,
  retrieveLayer2Signals,
  processWithMarion,
  createMarionBridge,
  route,
  maybeResolve,
  ask,
  handle,
  default: route
};
