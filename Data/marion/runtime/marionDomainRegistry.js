"use strict";

const VERSION = "marionDomainRegistry v1.0.0 DOMAIN-AUTHORITY-MAP";

const MARION_DOMAINS = Object.freeze({
  general: {
    domain: "general",
    mode: "balanced",
    depth: "standard",
    useMemory: false,
    useDomainKnowledge: false
  },

  general_reasoning: {
    domain: "general_reasoning",
    mode: "reasoning",
    depth: "balanced",
    useMemory: false,
    useDomainKnowledge: true
  },

  technical: {
    domain: "technical",
    mode: "forensic_autopsy",
    depth: "forensic",
    useMemory: true,
    useDomainKnowledge: true,
    preferredStyle: "autopsy_then_fix"
  },

  emotional: {
    domain: "emotional",
    mode: "supportive_reasoning",
    depth: "high",
    useMemory: true,
    useDomainKnowledge: true,
    preferredStyle: "contain_then_clarify"
  },

  business: {
    domain: "business",
    mode: "commercial_strategy",
    depth: "strategic",
    useMemory: true,
    useDomainKnowledge: true,
    preferredStyle: "direct_plan"
  },

  music: {
    domain: "music",
    mode: "music_retrieval",
    depth: "medium",
    useMemory: false,
    useDomainKnowledge: true
  },

  news: {
    domain: "news",
    mode: "news_retrieval",
    depth: "medium",
    useMemory: false,
    useDomainKnowledge: true
  },

  roku: {
    domain: "roku",
    mode: "platform_routing",
    depth: "medium",
    useMemory: true,
    useDomainKnowledge: true
  },

  memory: {
    domain: "memory",
    mode: "continuity",
    depth: "high",
    useMemory: true,
    useDomainKnowledge: true,
    preferredStyle: "thread_reconnect"
  }
});

function safeStr(v) {
  return v == null ? "" : String(v).trim();
}

function getDomainConfig(domain) {
  const key = safeStr(domain).toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  return MARION_DOMAINS[key] || MARION_DOMAINS.general_reasoning;
}

module.exports = {
  VERSION,
  MARION_DOMAINS,
  getDomainConfig
};
