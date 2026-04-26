"use strict";

/**
 * marionIntentRouter.js
 * Deterministic Marion intent router.
 *
 * Purpose:
 * - Classify incoming Nyx/Marion text into one authoritative intent.
 * - Attach routing metadata for Marion Bridge, State Spine, and ComposeMarionResponse.
 * - Prevent one-word emotional inputs from falling into dead-loop fallback handling.
 * - Keep this file routing-only. It does not compose final user replies.
 */

const VERSION = "marionIntentRouter v2.2.1 LOOP-RESCUE-INTENT-HARDENED";

const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.6";
const INTENT_CONTRACT_VERSION = "nyx.marion.intent/2.2";

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

const DOMAIN_MODE = Object.freeze({
  general: "conversation",
  technical: "debug",
  emotional: "support_then_advance",
  business: "strategy",
  music: "retrieval",
  news: "retrieval",
  roku: "platform",
  memory: "continuity",
  general_reasoning: "conversation"
});

const DOMAIN_DEPTH = Object.freeze({
  general: "normal",
  technical: "forensic",
  emotional: "deep_forward",
  business: "strategic",
  music: "normal",
  news: "normal",
  roku: "normal",
  memory: "continuity",
  general_reasoning: "normal"
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

function has(rx, text) {
  if (!text) return false;
  rx.lastIndex = 0;
  return rx.test(text);
}

function compactWhitespace(v) {
  return safeStr(v).replace(/\s+/g, " ").trim();
}

function normalizeIntentName(v) {
  const raw = lower(v).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  const aliases = Object.freeze({
    chat: "simple_chat",
    general: "simple_chat",
    simple: "simple_chat",
    simplechat: "simple_chat",
    simple_chat: "simple_chat",

    debug: "technical_debug",
    technical: "technical_debug",
    technical_debug: "technical_debug",
    autopsy: "technical_debug",
    audit: "technical_debug",
    code: "technical_debug",
    fix: "technical_debug",

    support: "emotional_support",
    emotional: "emotional_support",
    emotion: "emotional_support",
    emotional_support: "emotional_support",
    distress: "emotional_support",
    crisis: "emotional_support",

    business: "business_strategy",
    strategy: "business_strategy",
    business_strategy: "business_strategy",
    sales: "business_strategy",
    monetization: "business_strategy",

    music: "music_query",
    music_query: "music_query",
    radio: "music_query",

    news: "news_query",
    news_query: "news_query",
    newscanada: "news_query",

    roku: "roku_query",
    roku_query: "roku_query",

    memory: "identity_or_memory",
    identity: "identity_or_memory",
    identity_or_memory: "identity_or_memory",
    state: "identity_or_memory",
    state_spine: "identity_or_memory",
    statespine: "identity_or_memory",
    spine: "identity_or_memory",
    phrase_pack: "identity_or_memory",
    phrase_packs: "identity_or_memory",
    packet: "identity_or_memory",
    packets: "identity_or_memory",
    greeting: "identity_or_memory",
    greetings: "identity_or_memory",

    question: "domain_question",
    domain_question: "domain_question",
    reasoning: "domain_question"
  });

  return aliases[raw] || raw || "";
}

function extractText(packet = {}) {
  const p = packet && typeof packet === "object" ? packet : {};

  return compactWhitespace(
    p.text ||
    p.query ||
    p.userQuery ||
    p.message ||
    p.input ||
    p.prompt ||
    p.command ||
    p.body?.text ||
    p.body?.query ||
    p.body?.message ||
    p.body?.input ||
    p.payload?.text ||
    p.payload?.query ||
    p.payload?.message ||
    p.payload?.input ||
    p.turn?.text ||
    p.turn?.message ||
    ""
  );
}

function detectSafetyLevel(text) {
  const t = lower(text);

  if (!t) return "none";

  if (has(/\b(suicide|suicidal|self[- ]?harm|kill myself|end my life|don['’]?t want to live|want to die|crisis|panic attack)\b/i, t)) {
    return "crisis";
  }

  if (has(/\b(depressed|depression|sad|lonely|overwhelmed|anxious|anxiety|hurt|heartbroken|grief|crying|afraid|stressed|hopeless|numb|burned out|burnt out)\b/i, t)) {
    return "distress";
  }

  return "none";
}

function inferIntentFromText(text) {
  const t = lower(text);
  const safetyLevel = detectSafetyLevel(t);

  if (!t) {
    return {
      intent: "simple_chat",
      confidence: 0.35,
      reason: "empty_text",
      stateStageHint: "deliver",
      safetyLevel,
      recoveryRequired: false
    };
  }

  /*
   * Critical ordering:
   * Emotional/crisis language must be detected before generic Marion/bridge/router terms.
   * Otherwise phrases like "Marion, I am depressed" get misrouted as technical_debug.
   */
  if (safetyLevel === "crisis") {
    return {
      intent: "emotional_support",
      confidence: 0.97,
      reason: "crisis_distress_terms",
      stateStageHint: "recovery",
      safetyLevel,
      recoveryRequired: true
    };
  }

  if (safetyLevel === "distress") {
    return {
      intent: "emotional_support",
      confidence: 0.88,
      reason: "emotional_distress_terms",
      stateStageHint: "recovery",
      safetyLevel,
      recoveryRequired: true
    };
  }

  if (has(/\b(index\.js|marionbridge|marion bridge|intent router|manual intent router|normalizer|packet|packets|phrase pack|phrase packs|compose|composer|state spine|statespine|state-spine|autopsy|audit|gap refinement|line[- ]?by[- ]?line|syntax|debug|bug|loop|looping|route|endpoint|script|file|harden|critical fix|critical fixes|download|zip)\b/i, t)) {
    return {
      intent: "technical_debug",
      confidence: 0.91,
      reason: "technical_debug_terms",
      stateStageHint: "execution",
      safetyLevel,
      recoveryRequired: false
    };
  }

  if (has(/\b(top\s*10|song|songs|artist|album|chart|playlist|music|radio|billboard|year|decade|70s|80s|90s|2000s)\b/i, t)) {
    return {
      intent: "music_query",
      confidence: 0.83,
      reason: "music_terms",
      stateStageHint: "retrieve",
      safetyLevel,
      recoveryRequired: false
    };
  }

  if (has(/\b(news|headline|headlines|article|story|stories|rss|newscanada|for your life|feed)\b/i, t)) {
    return {
      intent: "news_query",
      confidence: 0.83,
      reason: "news_terms",
      stateStageHint: "retrieve",
      safetyLevel,
      recoveryRequired: false
    };
  }

  if (has(/\b(roku|tv app|linear tv|streaming|channel app|ott)\b/i, t)) {
    return {
      intent: "roku_query",
      confidence: 0.83,
      reason: "roku_terms",
      stateStageHint: "deliver",
      safetyLevel,
      recoveryRequired: false
    };
  }

  if (has(/\b(price|pricing|sponsor|sponsorship|media kit|monetize|monetization|pitch|funding|investor|sales|proposal|revenue|business|startup|advertising|ad template)\b/i, t)) {
    return {
      intent: "business_strategy",
      confidence: 0.83,
      reason: "business_terms",
      stateStageHint: "strategy",
      safetyLevel,
      recoveryRequired: false
    };
  }

  if (has(/\b(remember|last time|continue|memory|conversation state|turn state|continuity|identity|who are you|who am i)\b/i, t)) {
    return {
      intent: "identity_or_memory",
      confidence: 0.78,
      reason: "memory_identity_terms",
      stateStageHint: "continuity",
      safetyLevel,
      recoveryRequired: false
    };
  }

  if (has(/(^|\s)(how|what|why|where|when|can you|could you|should i|would it|is it|are we)\b|\?$/i, t)) {
    return {
      intent: "domain_question",
      confidence: t.length > 60 ? 0.68 : 0.58,
      reason: "general_question",
      stateStageHint: "reason",
      safetyLevel,
      recoveryRequired: false
    };
  }

  return {
    intent: "simple_chat",
    confidence: 0.72,
    reason: "plain_conversation",
    stateStageHint: "deliver",
    safetyLevel,
    recoveryRequired: false
  };
}

function normalizeIntent(rawInput = {}, fallbackText = "") {
  const src = rawInput && typeof rawInput === "object" ? rawInput : {};
  const inferred = inferIntentFromText(fallbackText);
  const explicit = normalizeIntentName(src.intent || src.type || src.name || "");

  let intent = explicit && explicit !== "simple_chat" ? explicit : inferred.intent;
  let confidence = clamp01(src.confidence, inferred.confidence);
  let reason = safeStr(src.reason || src.source || inferred.reason);
  let stateStageHint = safeStr(src.stateStageHint || src.stage || inferred.stateStageHint || "deliver");
  let safetyLevel = safeStr(src.safetyLevel || inferred.safetyLevel || "none");
  let recoveryRequired = Boolean(src.recoveryRequired || inferred.recoveryRequired);

  /*
   * Distress language wins over stale explicit/general intent.
   * Technical can only override emotional if the inferred text is clearly technical and not distress/crisis.
   */
  if (inferred.intent === "emotional_support") {
    intent = "emotional_support";
    confidence = Math.max(confidence, inferred.confidence);
    reason = inferred.reason;
    stateStageHint = "recovery";
    safetyLevel = inferred.safetyLevel;
    recoveryRequired = true;
  }

  if (intent === "emotional_support" && inferred.intent === "technical_debug" && inferred.safetyLevel === "none") {
    intent = "technical_debug";
    confidence = Math.max(confidence, 0.91);
    reason = "technical_override_support";
    stateStageHint = "execution";
    recoveryRequired = false;
  }

  if (!INTENT_TO_DOMAIN[intent]) {
    intent = "domain_question";
    confidence = Math.max(0.5, confidence);
    reason = reason || "unknown_intent_normalized";
    stateStageHint = stateStageHint || "reason";
  }

  return {
    activate: intent !== "simple_chat",
    intent,
    confidence,
    reason,
    stateStageHint,
    safetyLevel,
    recoveryRequired,
    loopSafe: true,
    allowGenericFallback: false,
    source: safeStr(src.source || "marionIntentRouter")
  };
}

function buildRouting(marionIntent) {
  const domain = INTENT_TO_DOMAIN[marionIntent.intent] || "general_reasoning";

  return {
    domain,
    intent: marionIntent.intent,
    endpoint: "marion://routeMarion.primary",
    contractVersion: INTENT_CONTRACT_VERSION,
    expectsComposer: "composeMarionResponse",
    stateSpineSchema: STATE_SPINE_SCHEMA,
    stateStageHint: marionIntent.stateStageHint,
    mode: DOMAIN_MODE[domain] || "conversation",
    depth: DOMAIN_DEPTH[domain] || "normal",
    useMemory: domain === "memory" || domain === "emotional",
    useDomainKnowledge: domain !== "general",
    requireFreshComposerEnvelope: true,
    blockRepeatedBridgeFallback: true,
    recoveryRequired: marionIntent.recoveryRequired,
    safetyLevel: marionIntent.safetyLevel,
    preferredStyle:
      domain === "technical" ? "direct_forensic" :
      domain === "emotional" ? "warm_deep_forward" :
      domain === "business" ? "strategic_direct" :
      "direct"
  };
}

function routeMarionIntent(packet = {}) {
  const text = extractText(packet);
  const src = packet && typeof packet === "object" ? packet : {};

  const marionIntent = normalizeIntent(
    src.marionIntent || src.intentPacket || src.session?.marionIntent || src.payload?.marionIntent || {},
    text
  );

  const routing = buildRouting(marionIntent);

  return {
    ok: true,
    final: false,
    routerVersion: VERSION,
    stateSpineSchema: STATE_SPINE_SCHEMA,
    intentContractVersion: INTENT_CONTRACT_VERSION,
    marionIntent,
    routing,
    meta: {
      routedAt: new Date().toISOString(),
      confidence: marionIntent.confidence,
      triggerSource: marionIntent.source,
      textPresent: Boolean(text),
      singleIntentAuthority: true,
      bridgeCompatible: true,
      composerCompatible: true,
      stateSpineCompatible: true,
      preventsFallbackDeadState: true
    }
  };
}

module.exports = {
  VERSION,
  STATE_SPINE_SCHEMA,
  INTENT_CONTRACT_VERSION,
  INTENT_TO_DOMAIN,
  normalizeIntentName,
  inferIntentFromText,
  normalizeIntent,
  routeMarionIntent
};
