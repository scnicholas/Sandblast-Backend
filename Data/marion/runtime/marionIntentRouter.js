"use strict";

const {
  getDomainConfig
} = require("./marionDomainRegistry");

const VERSION = "marionIntentRouter v1.0.0 MARION-TRIGGER-ROUTING";

const INTENT_TO_DOMAIN = Object.freeze({
  simple_chat: "general",
  domain_question: "general_reasoning",
  technical_debug: "technical",
  emotional_support: "emotional",
  business_strategy: "business",
  music_query: "music",
  news_query: "news",
  roku_query: "roku",
  identity_or_memory: "memory"
});

function safeStr(v) {
  return v == null ? "" : String(v).trim();
}

function cleanKey(v) {
  return safeStr(v).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function clampConfidence(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeIntent(rawIntent) {
  const src = rawIntent && typeof rawIntent === "object" ? rawIntent : {};
  const intent = cleanKey(src.intent || src.type || "simple_chat") || "simple_chat";
  const activate = typeof src.activate === "boolean"
    ? src.activate
    : intent !== "simple_chat";

  return {
    activate,
    intent,
    confidence: clampConfidence(src.confidence || (activate ? 0.66 : 0.4)),
    reason: safeStr(src.reason || src.source || "intent_router")
  };
}

function routeMarionIntent(packet = {}) {
  const marionIntent = normalizeIntent(
    packet.marionIntent ||
    packet.intentPacket ||
    packet.session?.marionIntent ||
    {}
  );

  const mappedDomain = INTENT_TO_DOMAIN[marionIntent.intent] || "general_reasoning";
  const domainConfig = getDomainConfig(mappedDomain);

  return {
    ok: true,
    routerVersion: VERSION,
    marionIntent,
    routing: {
      domain: domainConfig.domain,
      intent: marionIntent.intent,
      mode: domainConfig.mode,
      depth: domainConfig.depth,
      endpoint: "marion://routeMarion.primary",
      useMemory: !!domainConfig.useMemory,
      useDomainKnowledge: !!domainConfig.useDomainKnowledge,
      preferredStyle: domainConfig.preferredStyle || "direct"
    },
    meta: {
      triggerSource: "nyx_widget",
      routedAt: new Date().toISOString(),
      confidence: marionIntent.confidence
    }
  };
}

module.exports = {
  VERSION,
  routeMarionIntent,
  normalizeIntent
};
