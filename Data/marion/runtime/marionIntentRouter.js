"use strict";

/**
 * marionIntentRouter.js
 * Clean deterministic Marion intent router.
 * One purpose: classify intent and assign routing metadata.
 */

const VERSION = "marionIntentRouter v2.0.0 CLEAN-REBUILD-SINGLE-CLASSIFIER";

const INTENT_TO_DOMAIN = Object.freeze({
  simple_chat: "general",
  technical_debug: "technical",
  emotional_support: "emotional",
  business_strategy: "business",
  music_query: "music",
  news_query: "news",
  roku_query: "roku",
  identity_or_memory: "memory",
  domain_question: "general_reasoning"
});

function safeStr(v) {
  return v == null ? "" : String(v).trim();
}

function lower(v) {
  return safeStr(v).toLowerCase();
}

function clamp01(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function normalizeIntentName(v) {
  const raw = lower(v).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const aliases = {
    chat: "simple_chat",
    general: "simple_chat",
    simple: "simple_chat",
    debug: "technical_debug",
    technical: "technical_debug",
    autopsy: "technical_debug",
    audit: "technical_debug",
    support: "emotional_support",
    emotional: "emotional_support",
    business: "business_strategy",
    strategy: "business_strategy",
    music: "music_query",
    news: "news_query",
    newscanada: "news_query",
    roku: "roku_query",
    memory: "identity_or_memory",
    identity: "identity_or_memory"
  };
  return aliases[raw] || raw || "simple_chat";
}

function has(rx, text) {
  return rx.test(text);
}

function inferIntentFromText(text) {
  const t = lower(text);

  if (!t) return { intent: "simple_chat", confidence: 0.35, reason: "empty_text" };

  if (has(/\b(index\.js|marion|bridge|router|normalizer|packet|compose|autopsy|audit|gap refinement|line[- ]?by[- ]?line|syntax|debug|bug|loop|route|endpoint|script|file|harden|fix|download|zip)\b/i, t)) {
    return { intent: "technical_debug", confidence: 0.9, reason: "technical_debug_terms" };
  }

  if (has(/\b(suicide|self[- ]?harm|kill myself|don['’]?t want to live|crisis|panic attack)\b/i, t)) {
    return { intent: "emotional_support", confidence: 0.95, reason: "high_distress_terms" };
  }

  if (has(/\b(sad|depressed|lonely|overwhelmed|anxious|hurt|heartbroken|grief|crying|afraid|stressed)\b/i, t)) {
    return { intent: "emotional_support", confidence: 0.82, reason: "emotional_terms" };
  }

  if (has(/\b(top\s*10|song|artist|album|chart|playlist|music|radio|billboard|year)\b/i, t)) {
    return { intent: "music_query", confidence: 0.82, reason: "music_terms" };
  }

  if (has(/\b(news|headline|article|story|rss|newscanada|for your life)\b/i, t)) {
    return { intent: "news_query", confidence: 0.82, reason: "news_terms" };
  }

  if (has(/\b(roku|tv app|linear tv|streaming|channel app)\b/i, t)) {
    return { intent: "roku_query", confidence: 0.82, reason: "roku_terms" };
  }

  if (has(/\b(price|pricing|sponsor|media kit|monetize|pitch|funding|investor|sales|proposal|revenue|business)\b/i, t)) {
    return { intent: "business_strategy", confidence: 0.82, reason: "business_terms" };
  }

  if (has(/\b(remember|last time|continue|memory|state spine|identity)\b/i, t)) {
    return { intent: "identity_or_memory", confidence: 0.76, reason: "memory_terms" };
  }

  if (has(/\?$|how|what|why|where|when|can you|should i/i, t) && t.length > 60) {
    return { intent: "domain_question", confidence: 0.65, reason: "general_question" };
  }

  return { intent: "simple_chat", confidence: 0.72, reason: "plain_conversation" };
}

function normalizeIntent(rawInput = {}, fallbackText = "") {
  const src = rawInput && typeof rawInput === "object" ? rawInput : {};
  const explicit = normalizeIntentName(src.intent || src.type || "");
  const inferred = inferIntentFromText(fallbackText);

  let intent = explicit && explicit !== "simple_chat" ? explicit : inferred.intent;
  let confidence = clamp01(src.confidence, inferred.confidence);
  let reason = safeStr(src.reason || src.source || inferred.reason);

  if (intent === "emotional_support" && inferred.intent === "technical_debug") {
    intent = "technical_debug";
    confidence = 0.92;
    reason = "technical_override_support";
  }

  if (!INTENT_TO_DOMAIN[intent]) {
    intent = "domain_question";
    confidence = Math.max(0.5, confidence);
    reason = reason || "unknown_intent_normalized";
  }

  return {
    activate: intent !== "simple_chat",
    intent,
    confidence,
    reason,
    source: safeStr(src.source || "marionIntentRouter")
  };
}

function routeMarionIntent(packet = {}) {
  const text = safeStr(packet.text || packet.query || packet.userQuery || packet.message || "");
  const marionIntent = normalizeIntent(
    packet.marionIntent || packet.intentPacket || packet.session?.marionIntent || {},
    text
  );

  const domain = INTENT_TO_DOMAIN[marionIntent.intent] || "general_reasoning";

  const routing = {
    domain,
    intent: marionIntent.intent,
    endpoint: "marion://routeMarion.primary",
    mode:
      domain === "technical" ? "debug" :
      domain === "emotional" ? "support_then_advance" :
      domain === "business" ? "strategy" :
      domain === "music" || domain === "news" ? "retrieval" :
      domain === "roku" ? "platform" :
      domain === "memory" ? "continuity" :
      "conversation",
    depth:
      domain === "technical" ? "forensic" :
      domain === "emotional" ? "deep_forward" :
      domain === "business" ? "strategic" :
      "normal",
    useMemory: domain === "memory" || domain === "emotional",
    useDomainKnowledge: domain !== "general",
    preferredStyle:
      domain === "technical" ? "direct_forensic" :
      domain === "emotional" ? "warm_deep_forward" :
      "direct"
  };

  return {
    ok: true,
    final: false,
    routerVersion: VERSION,
    marionIntent,
    routing,
    meta: {
      routedAt: new Date().toISOString(),
      confidence: marionIntent.confidence,
      triggerSource: marionIntent.source,
      singleIntentAuthority: true
    }
  };
}

module.exports = {
  VERSION,
  normalizeIntent,
  routeMarionIntent
};
