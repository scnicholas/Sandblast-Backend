"use strict";

/**
 * marionDomainRegistry.js
 *
 * marionDomainRegistry v1.1.0 DOMAIN-COHESION-CAPABILITY-MAP
 * ------------------------------------------------------------
 * PURPOSE
 * - Provide the single backend authority map for Marion/Nyx domain lanes.
 * - Keep user-facing capability labels out of the widget so the frontend remains light.
 * - Align with marionIntentRouter, marionBridge, composeMarionResponse, and ChatEngine.
 * - Prevent unsupported or malformed domains from leaking into user-facing routing.
 * - Preserve final-envelope and State Spine cohesion metadata for downstream runtime layers.
 */

const VERSION = "marionDomainRegistry v1.1.0 DOMAIN-COHESION-CAPABILITY-MAP";

const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";
const FINAL_ENVELOPE_CONTRACT = "nyx.marion.final/1.0";
const CANONICAL_ENDPOINT = "marion://routeMarion.primary";

const DOMAIN_ALIASES = Object.freeze({
  chat: "general",
  simple_chat: "general",
  general_chat: "general",
  conversation: "general",
  default: "general",

  reasoning: "general_reasoning",
  domain_question: "general_reasoning",
  baseline_cognition: "general_reasoning",

  debug: "technical",
  technical_debug: "technical",
  diagnostics: "technical",
  backend: "technical",
  frontend: "technical",
  widget: "technical",
  avatar: "technical",
  voice: "technical",
  tts: "technical",
  pipeline: "technical",
  autopsy: "technical",
  audit: "technical",

  emotion: "emotional",
  support: "emotional",
  emotional_support: "emotional",
  distress: "emotional",

  strategy: "business",
  business_strategy: "business",
  commercial: "business",
  sales: "business",
  monetization: "business",
  sponsorship: "business",
  advertising: "business",

  radio: "music",
  music_query: "music",
  playlist: "music",
  song: "music",

  news_query: "news",
  newscanada: "news",
  news_canada: "news",
  rss: "news",
  feed: "news",

  roku_query: "roku",
  ott: "roku",
  linear_tv: "roku",
  tv: "roku",
  streaming: "roku",

  identity: "identity",
  identity_query: "identity",
  who_are_you: "identity",
  marion_identity: "identity",
  nyx_identity: "identity",

  memory: "memory",
  identity_or_memory: "memory",
  continuity: "memory",
  state_spine: "memory",
  statespine: "memory",

  directive: "execution",
  directive_response: "execution",
  execution: "execution",
  action: "execution",

  contextual_directive: "execution_context",
  execution_context: "execution_context",
  context: "execution_context"
});

const INTENT_TO_DOMAIN = Object.freeze({
  simple_chat: "general",
  domain_question: "general_reasoning",
  technical_debug: "technical",
  emotional_support: "emotional",
  business_strategy: "business",
  music_query: "music",
  news_query: "news",
  roku_query: "roku",
  identity_query: "identity",
  identity_or_memory: "memory",
  directive_response: "execution",
  contextual_directive: "execution_context"
});

const MARION_DOMAINS = Object.freeze({
  general: Object.freeze({
    domain: "general",
    label: "Chat",
    userFacingLabel: "chat",
    capability: "General conversation, greetings, warm onboarding, and light user interaction.",
    examples: Object.freeze(["Hi Nyx.", "How are you today?", "What can you help with?"]),
    mode: "conversation",
    depth: "standard",
    preferredStyle: "warm_direct",
    useMemory: false,
    useDomainKnowledge: false,
    exposeToUser: true,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT
  }),

  general_reasoning: Object.freeze({
    domain: "general_reasoning",
    label: "Reasoning",
    userFacingLabel: "reasoning",
    capability: "Clear explanations, analysis, and baseline cognitive breakdowns.",
    examples: Object.freeze(["Explain this simply.", "Break this down.", "Why does this matter?"]),
    mode: "reasoning",
    depth: "balanced",
    preferredStyle: "reasoned_direct",
    useMemory: false,
    useDomainKnowledge: true,
    exposeToUser: true,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT
  }),

  technical: Object.freeze({
    domain: "technical",
    label: "Backend Diagnostics",
    userFacingLabel: "backend diagnostics",
    capability: "Autopsy, line-by-line audit, route checks, widget/backend cohesion, avatar controls, voice/TTS checks, and final-envelope debugging.",
    examples: Object.freeze(["Audit the bridge.", "Check the widget route.", "Test avatar or voice health."]),
    mode: "forensic_autopsy",
    depth: "forensic",
    preferredStyle: "autopsy_then_fix",
    useMemory: true,
    useDomainKnowledge: true,
    exposeToUser: true,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT
  }),

  emotional: Object.freeze({
    domain: "emotional",
    label: "Support",
    userFacingLabel: "support",
    capability: "Grounded emotional continuity, stabilization, pressure-point clarification, and safe escalation when needed.",
    examples: Object.freeze(["I feel overwhelmed.", "This is exhausting.", "I need help staying steady."]),
    mode: "supportive_reasoning",
    depth: "high",
    preferredStyle: "contain_then_clarify",
    useMemory: true,
    useDomainKnowledge: true,
    exposeToUser: false,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT
  }),

  business: Object.freeze({
    domain: "business",
    label: "Business Strategy",
    userFacingLabel: "business strategy",
    capability: "Commercial positioning, monetization, sponsorships, media kits, audience psychology, and campaign planning.",
    examples: Object.freeze(["Build a sponsorship package.", "Shape the offer.", "Target a new audience."]),
    mode: "commercial_strategy",
    depth: "strategic",
    preferredStyle: "strategic_direct",
    useMemory: true,
    useDomainKnowledge: true,
    exposeToUser: true,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT
  }),

  music: Object.freeze({
    domain: "music",
    label: "Media and Radio",
    userFacingLabel: "media and radio",
    capability: "Radio programming, adult contemporary positioning, playlists, music queries, audience fit, and broadcast content direction.",
    examples: Object.freeze(["Build a playlist angle.", "Check a music lane.", "Help with radio positioning."]),
    mode: "music_retrieval",
    depth: "medium",
    preferredStyle: "host_fluent",
    useMemory: false,
    useDomainKnowledge: true,
    exposeToUser: true,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT
  }),

  news: Object.freeze({
    domain: "news",
    label: "News Canada",
    userFacingLabel: "News Canada",
    capability: "News Canada feed checks, RSS/WP REST handling, editorial summaries, story routing, and source-clean presentation.",
    examples: Object.freeze(["Check the News Canada feed.", "Summarize this story.", "Audit the RSS route."]),
    mode: "news_retrieval",
    depth: "medium",
    preferredStyle: "clean_source_aware",
    useMemory: false,
    useDomainKnowledge: true,
    exposeToUser: true,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT
  }),

  roku: Object.freeze({
    domain: "roku",
    label: "Roku",
    userFacingLabel: "Roku",
    capability: "Roku app flow, linear TV feed handling, OTT publishing, ad server questions, and deployment checks.",
    examples: Object.freeze(["Check Roku publishing.", "Review the ad server call.", "Help with the linear TV feed."]),
    mode: "platform_routing",
    depth: "medium",
    preferredStyle: "platform_direct",
    useMemory: true,
    useDomainKnowledge: true,
    exposeToUser: true,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT
  }),

  identity: Object.freeze({
    domain: "identity",
    label: "Nyx Identity",
    userFacingLabel: "Nyx and Marion identity",
    capability: "Clear explanation of Nyx, Marion, their relationship, and how the reasoning layer supports the visible interface.",
    examples: Object.freeze(["What is Marion?", "Who are you?", "How do you work?"]),
    mode: "identity_explanation",
    depth: "balanced",
    preferredStyle: "branded_confident",
    useMemory: true,
    useDomainKnowledge: true,
    exposeToUser: false,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT
  }),

  memory: Object.freeze({
    domain: "memory",
    label: "Continuity",
    userFacingLabel: "continuity",
    capability: "Conversation continuity, state spine alignment, prior-thread recall, and context carry.",
    examples: Object.freeze(["Continue from the last test.", "Carry this forward.", "What were we working on?"]),
    mode: "continuity",
    depth: "high",
    preferredStyle: "thread_reconnect",
    useMemory: true,
    useDomainKnowledge: true,
    exposeToUser: false,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT
  }),

  execution: Object.freeze({
    domain: "execution",
    label: "Direct Execution",
    userFacingLabel: "direct execution",
    capability: "Short direct answers, next-step commands, and tightly scoped execution instructions.",
    examples: Object.freeze(["Give me the next step.", "Short direct answer.", "One precise action."]),
    mode: "direct_execution",
    depth: "direct",
    preferredStyle: "short_direct_action",
    useMemory: true,
    useDomainKnowledge: true,
    exposeToUser: false,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT
  }),

  execution_context: Object.freeze({
    domain: "execution_context",
    label: "Contextual Execution",
    userFacingLabel: "contextual execution",
    capability: "Context-aware follow-up directives that preserve prior architecture, risk, or implementation setup.",
    examples: Object.freeze(["Given that setup, what layer should we harden first?", "Based on that, what breaks?", "From there, what is the risk?"]),
    mode: "contextual_precision",
    depth: "contextual",
    preferredStyle: "contextual_precision",
    useMemory: true,
    useDomainKnowledge: true,
    exposeToUser: false,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT
  })
});

function safeStr(v) {
  return v == null ? "" : String(v).replace(/\s+/g, " ").trim();
}

function normalizeKey(value) {
  return safeStr(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function safeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneDomainConfig(config) {
  return JSON.parse(JSON.stringify(config || MARION_DOMAINS.general));
}

function resolveDomainKey(value, fallback = "general_reasoning") {
  const raw = normalizeKey(value);
  if (!raw) return normalizeKey(fallback) || "general_reasoning";
  if (MARION_DOMAINS[raw]) return raw;
  if (DOMAIN_ALIASES[raw] && MARION_DOMAINS[DOMAIN_ALIASES[raw]]) return DOMAIN_ALIASES[raw];
  return MARION_DOMAINS[fallback] ? fallback : "general_reasoning";
}

function getDomainConfig(domain, options = {}) {
  const opts = safeObj(options);
  const key = resolveDomainKey(domain, safeStr(opts.fallbackDomain || "general_reasoning"));
  const config = cloneDomainConfig(MARION_DOMAINS[key]);
  return {
    ...config,
    resolvedDomain: key,
    requestedDomain: safeStr(domain),
    registryVersion: VERSION,
    stateSpineSchema: STATE_SPINE_SCHEMA,
    stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    finalEnvelopeContract: FINAL_ENVELOPE_CONTRACT,
    supported: !!MARION_DOMAINS[key]
  };
}

function getDomainForIntent(intent) {
  const key = normalizeKey(intent);
  return INTENT_TO_DOMAIN[key] || DOMAIN_ALIASES[key] || "general_reasoning";
}

function getDomainConfigForIntent(intent, options = {}) {
  return getDomainConfig(getDomainForIntent(intent), options);
}

function isSupportedDomain(domain) {
  const key = normalizeKey(domain);
  return !!(key && (MARION_DOMAINS[key] || (DOMAIN_ALIASES[key] && MARION_DOMAINS[DOMAIN_ALIASES[key]])));
}

function listDomains(options = {}) {
  const opts = safeObj(options);
  const includeHidden = opts.includeHidden === true;
  return Object.keys(MARION_DOMAINS)
    .map((key) => cloneDomainConfig(MARION_DOMAINS[key]))
    .filter((cfg) => includeHidden || cfg.exposeToUser !== false);
}

function getCapabilityIntro() {
  const labels = listDomains()
    .map((cfg) => safeStr(cfg.userFacingLabel || cfg.label))
    .filter(Boolean);

  const preferredOrder = ["chat", "media and radio", "News Canada", "Roku", "backend diagnostics", "business strategy", "reasoning"];
  const ordered = preferredOrder.filter((label) => labels.includes(label));
  const extras = labels.filter((label) => !ordered.includes(label));
  const finalLabels = [...ordered, ...extras];

  return `I can help with ${finalLabels.join(", ")}. Tell me where you’d like to start.`;
}

function buildRoutingFromDomain(domain, intent = "domain_question", overrides = {}) {
  const config = getDomainConfig(domain);
  const o = safeObj(overrides);
  return {
    domain: config.resolvedDomain,
    intent: safeStr(intent || "domain_question"),
    endpoint: CANONICAL_ENDPOINT,
    mode: safeStr(o.mode || config.mode),
    depth: safeStr(o.depth || config.depth),
    preferredStyle: safeStr(o.preferredStyle || config.preferredStyle),
    useMemory: typeof o.useMemory === "boolean" ? o.useMemory : !!config.useMemory,
    useDomainKnowledge: typeof o.useDomainKnowledge === "boolean" ? o.useDomainKnowledge : !!config.useDomainKnowledge,
    requiresFinalEnvelope: true,
    expectedFinalEnvelopeContract: FINAL_ENVELOPE_CONTRACT,
    stateSpineSchema: STATE_SPINE_SCHEMA,
    stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    registryVersion: VERSION,
    capability: config.capability,
    userFacingLabel: config.userFacingLabel,
    exposeToUser: !!config.exposeToUser,
    cohesion: {
      registryCompatible: true,
      bridgeCompatible: true,
      composerCompatible: true,
      routerCompatible: true,
      finalEnvelopeRequired: true,
      noUnsupportedDomainLeak: true
    }
  };
}

function getHealth() {
  const keys = Object.keys(MARION_DOMAINS);
  const missing = [];
  for (const intent of Object.keys(INTENT_TO_DOMAIN)) {
    if (!MARION_DOMAINS[INTENT_TO_DOMAIN[intent]]) missing.push(intent);
  }
  return {
    ok: missing.length === 0,
    version: VERSION,
    domainCount: keys.length,
    domains: keys,
    intentCoverage: Object.keys(INTENT_TO_DOMAIN).length,
    missingIntentDomains: missing,
    endpoint: CANONICAL_ENDPOINT,
    stateSpineSchema: STATE_SPINE_SCHEMA,
    stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    finalEnvelopeContract: FINAL_ENVELOPE_CONTRACT
  };
}

module.exports = {
  VERSION,
  STATE_SPINE_SCHEMA,
  STATE_SPINE_SCHEMA_COMPAT,
  FINAL_ENVELOPE_CONTRACT,
  CANONICAL_ENDPOINT,
  MARION_DOMAINS,
  DOMAIN_ALIASES,
  INTENT_TO_DOMAIN,
  getDomainConfig,
  getDomainForIntent,
  getDomainConfigForIntent,
  isSupportedDomain,
  listDomains,
  getCapabilityIntro,
  buildRoutingFromDomain,
  getHealth,
  _internal: {
    safeStr,
    normalizeKey,
    resolveDomainKey,
    cloneDomainConfig
  }
};
