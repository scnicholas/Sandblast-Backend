"use strict";

/**
 * composeMarionResponse.js
 * Clean single-emission Marion composer.
 * One purpose: convert routed intent + context into one final response packet.
 */

const VERSION = "composeMarionResponse v2.0.0 CLEAN-REBUILD-SINGLE-EMISSION";
const REQUIRED_CHAT_ENGINE_SIGNATURE = "CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24";
const MARION_BRIDGE_VERSION_MARKER = "marionBridge v6.0.0 CLEAN-REDUCED-FINAL-HANDOFF";
const MARION_FINAL_SIGNATURE_PREFIX = "MARION::FINAL::";
const MARION_FINAL_MARKERS = Object.freeze([
  REQUIRED_CHAT_ENGINE_SIGNATURE,
  MARION_BRIDGE_VERSION_MARKER,
  VERSION
]);

function buildMarionFinalSignature(replySignature, turnId) {
  const seed = safeStr(replySignature || hashText(turnId || Date.now()));
  return `${MARION_FINAL_SIGNATURE_PREFIX}${REQUIRED_CHAT_ENGINE_SIGNATURE}::${VERSION}::${seed}`;
}

function safeStr(v) {
  return v == null ? "" : String(v).trim();
}

function lower(v) {
  return safeStr(v).toLowerCase();
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function clamp01(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function hashText(v) {
  const s = lower(v).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return String(h >>> 0);
}

function detectDistress(text) {
  const t = lower(text);
  const crisis = /\b(suicide|self[- ]?harm|kill myself|don['’]?t want to live|end my life)\b/i.test(t);
  const high = crisis || /\b(panic|depressed|hopeless|overwhelmed|crying|heartbroken|grief)\b/i.test(t);
  const emotional = high || /\b(sad|lonely|hurt|anxious|afraid|stressed|upset)\b/i.test(t);
  return { crisis, high, emotional };
}

function simpleChatReply(text) {
  const t = lower(text);
  if (/^(hi|hello|hey|yo)\b/.test(t)) return "Hey. I’m here, clear and ready. What are we working on next?";
  if (/how are you/.test(t)) return "I’m steady, focused, and ready to move with you. What do you want to tackle first?";
  if (/thank/.test(t)) return "You’re welcome. Let’s keep it moving.";
  return "I’m with you. Give me the next piece and I’ll help you move it forward.";
}

function technicalReply(text) {
  if (/loop/i.test(text)) {
    return "The loop should be handled as a state-progression problem: confirm the router intent, confirm the composer emits once, then verify the bridge finalizes without reusing fallback state.";
  }
  return "I’ll treat this technically: isolate the failing layer, verify the packet path, check finalization, and remove any duplicate authority before we patch.";
}

function emotionalReply(text, previousMemory = {}) {
  const distress = detectDistress(text);
  const alreadySupported = !!previousMemory.supportUsedLastTurn || !!previousMemory.memoryPatch?.supportUsedLastTurn;

  if (distress.crisis) {
    return "I’m here with you. Your safety comes first. If you might hurt yourself or you’re in immediate danger, contact emergency services or a local crisis line now. Stay with me on the smallest next safe step.";
  }

  if (alreadySupported && !distress.high) {
    return "I hear the weight in that. Let’s move deeper instead of circling it: what is the real pressure underneath this right now?";
  }

  if (distress.high) {
    return "I hear how heavy this feels. Let’s keep this steady and honest: what part of it is pressing on you the hardest right now?";
  }

  return "I hear you. Let’s not flatten it into a generic answer. What is the part of this that actually matters most underneath the surface?";
}

function businessReply() {
  return "Let’s make this commercial and practical: clarify the offer, sharpen the buyer psychology, define the package, then move it into a clean execution path.";
}

function musicReply() {
  return "Music lane is ready. Give me the year, artist, chart, or story angle and I’ll route it cleanly.";
}

function newsReply() {
  return "News Canada lane is ready. Give me the story, headline, or feed issue and I’ll keep the source path clean.";
}

function rokuReply() {
  return "Roku lane is ready. Tell me whether we’re checking the app path, live TV lane, content feed, or deployment issue.";
}

function memoryReply() {
  return "I’m holding the thread. Tell me what continuity point you want carried forward, and I’ll anchor it cleanly.";
}

function domainReply() {
  return "I can work through that. Give me the exact target and I’ll break it down into a clean answer.";
}

function resolveIntent(routed = {}, input = {}) {
  return lower(
    routed.intent ||
    routed.marionIntent?.intent ||
    routed.routing?.intent ||
    input.intent ||
    input.marionIntent?.intent ||
    "simple_chat"
  ) || "simple_chat";
}

function resolveDomain(routed = {}, input = {}) {
  return lower(
    routed.primaryDomain ||
    routed.domain ||
    routed.routing?.domain ||
    input.domain ||
    input.requestedDomain ||
    "general"
  ) || "general";
}

function buildReply(intent, text, input = {}) {
  switch (intent) {
    case "technical_debug": return technicalReply(text);
    case "emotional_support": return emotionalReply(text, input.previousMemory || {});
    case "business_strategy": return businessReply(text);
    case "music_query": return musicReply(text);
    case "news_query": return newsReply(text);
    case "roku_query": return rokuReply(text);
    case "identity_or_memory": return memoryReply(text);
    case "domain_question": return domainReply(text);
    case "simple_chat":
    default: return simpleChatReply(text);
  }
}

function chooseNextMove(intent, text) {
  if (intent === "technical_debug") return "verify_packet_path";
  if (intent === "emotional_support") return "deepen_without_repeating";
  if (intent === "business_strategy") return "convert_to_execution";
  if (intent === "music_query") return "ask_music_target";
  if (intent === "news_query") return "ask_news_target";
  if (intent === "roku_query") return "ask_roku_target";
  return "continue_conversation";
}

function composeMarionResponse(routed = {}, input = {}) {
  const text = safeStr(input.userQuery || input.text || input.query || routed.text || "");
  const intent = resolveIntent(routed, input);
  const domain = resolveDomain(routed, input);
  const previousMemory = isObj(input.previousMemory) ? input.previousMemory : {};
  const previousSig = safeStr(previousMemory.replySignature || previousMemory.memoryPatch?.replySignature || "");

  let reply = buildReply(intent, text, input);
  let replySignature = hashText(reply);

  if (previousSig && previousSig === replySignature) {
    if (intent === "emotional_support") {
      reply = "Let’s go one layer deeper so we don’t repeat the same comfort: what is the part you have not said out loud yet?";
    } else if (intent === "simple_chat") {
      reply = "I’m here and tracking. Let’s move forward: what do you want to focus on next?";
    } else if (intent === "technical_debug") {
      reply = "We should advance the diagnosis now: check the router output, composer output, and bridge final flag for this exact turn.";
    } else {
      reply = "Let’s move this forward instead of repeating it. Give me the next target and I’ll act on that.";
    }
    replySignature = hashText(reply);
  }

  const turnId = safeStr(input.turnId || input.sourceTurnId || routed.turnId || "");
  const marionFinalSignature = buildMarionFinalSignature(replySignature, turnId);
  const distress = detectDistress(text);
  const nextMove = chooseNextMove(intent, text);

  const memoryPatch = {
    lastIntent: intent,
    lastDomain: domain,
    replySignature,
    lastReplySignature: replySignature,
    supportUsedLastTurn: intent === "emotional_support",
    composedOnce: true,
    marionFinal: true,
    final: true,
    marionFinalSignature,
    requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
    finalMarkers: MARION_FINAL_MARKERS.slice(),
    nextMove,
    updatedAt: Date.now()
  };

  return {
    ok: true,
    final: true,
    marionFinal: true,
    composedOnce: true,
    finalizedBy: "composeMarionResponse",
    version: VERSION,
    signature: marionFinalSignature,
    marionFinalSignature,
    requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
    finalMarkers: MARION_FINAL_MARKERS.slice(),

    domain,
    intent,
    reply,
    text: reply,
    answer: reply,
    output: reply,
    displayReply: reply,
    spokenText: reply.replace(/\n+/g, " ").trim(),

    followUps: [],
    followUpsStrings: [],

    supportMode: intent === "emotional_support" ? "support_then_deepen" : "none",
    routeBias: nextMove,
    riskLevel: distress.crisis ? "critical" : distress.high ? "high" : "low",
    supportFlags: {
      crisis: distress.crisis,
      highDistress: distress.high,
      emotional: distress.emotional
    },

    responsePlan: {
      semanticFrame: intent,
      deliveryTone: intent === "emotional_support" ? "warm_direct" : "clear_direct",
      expressionStyle: "single_emission",
      followupStyle: "none",
      responseLength: "short",
      pacing: "steady",
      transitionReadiness: "high",
      nextMove
    },

    nyxDirective: {
      expressiveRole: "express_resolved_state_only",
      allowNyxRewrite: false,
      allowReplySynthesis: false,
      singleSourceOfTruth: true,
      askAtMost: 0,
      shouldOfferNextStep: true
    },

    payload: {
      reply,
      text: reply,
      answer: reply,
      output: reply,
      response: reply,
      message: reply,
      spokenText: reply.replace(/\n+/g, " ").trim(),
      final: true,
      marionFinal: true,
      handled: true,
      signature: marionFinalSignature,
      marionFinalSignature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: MARION_FINAL_MARKERS.slice()
    },

    meta: {
      version: VERSION,
      composerVersion: VERSION,
      final: true,
      marionFinal: true,
      handled: true,
      finalizedBy: "composeMarionResponse",
      replySignature,
      signature: marionFinalSignature,
      marionFinalSignature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: MARION_FINAL_MARKERS.slice(),
      hardlockCompatible: true
    },

    memoryPatch,

    diagnostics: {
      composerVersion: VERSION,
      replySignature,
      signature: marionFinalSignature,
      marionFinalSignature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: MARION_FINAL_MARKERS.slice(),
      hardlockCompatible: true,
      previousReplySignature: previousSig,
      duplicateBroken: !!previousSig && previousSig === replySignature,
      singleEmission: true,
      finalAuthority: "composeMarionResponse"
    },

    synthesis: {
      reply,
      text: reply,
      answer: reply,
      output: reply,
      spokenText: reply.replace(/\n+/g, " ").trim(),
      followUps: [],
      followUpsStrings: [],
      memoryPatch,
      signature: marionFinalSignature,
      marionFinalSignature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: MARION_FINAL_MARKERS.slice()
    }
  };
}

module.exports = {
  VERSION,
  REQUIRED_CHAT_ENGINE_SIGNATURE,
  MARION_FINAL_SIGNATURE_PREFIX,
  MARION_FINAL_MARKERS,
  composeMarionResponse
};
