"use strict";

/**
 * marionIntentRouter.js
 * Deterministic Marion intent router.
 *
 * Purpose:
 * - Classify incoming Nyx/Marion text into one authoritative canonical intent.
 * - Attach routing metadata for MarionBridge, State Spine, and ComposeMarionResponse.
 * - Preserve cohesion with ComposeMarionResponse and MarionBridge by using the shared intent set.
 * - Add identity + reasoning + baseline cognition routing without composing final user replies.
 * - Prevent emotional, identity, and recovery turns from falling into dead-loop fallback handling.
 */

const VERSION = "marionIntentRouter v3.4.1 TECHNICAL-FOLLOWUP-INTENT-LOCK + CYBER-LEAST-PRIVILEGE-PRECISION + DOMAIN-CONFIDENCE-TOPLEVEL + REGISTRY-COHESION-HARDENED";
const DOMAIN_CONFIDENCE_VERSION = "nyx.marion.domainConfidence/1.1";

const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";
const INTENT_CONTRACT_VERSION = "nyx.marion.intent/2.5";
const CANONICAL_ENDPOINT = "marion://routeMarion.primary";
const PIPELINE_FORENSIC_NORMALIZATION_VERSION = "pipeline.forensicNormalization/1.0";

const DOMAIN_REGISTRY_REQUIRE_CANDIDATES = Object.freeze([
  "./marionDomainRegistry.js",
  "./marionDomainRegistry",
  "./Data/marion/runtime/marionDomainRegistry.js",
  "./Data/marion/runtime/marionDomainRegistry",
  "../runtime/marionDomainRegistry.js",
  "../runtime/marionDomainRegistry"
]);

function tryRequireOptional(paths) {
  for (const p of Array.isArray(paths) ? paths : []) {
    try {
      const mod = require(p);
      if (mod) return mod;
    } catch (_) {}
  }
  return null;
}

const domainRegistryMod = tryRequireOptional(DOMAIN_REGISTRY_REQUIRE_CANDIDATES);

const VALID_INTENTS = Object.freeze([
  "simple_chat",
  "technical_debug",
  "emotional_support",
  "business_strategy",
  "music_query",
  "news_query",
  "roku_query",
  "identity_query",
  "identity_or_memory",
  "directive_response",
  "contextual_directive",
  "domain_question"
]);

const INTENT_TO_DOMAIN = Object.freeze({
  simple_chat: "general",
  technical_debug: "technical",
  emotional_support: "emotional",
  business_strategy: "business",
  music_query: "music",
  news_query: "news",
  roku_query: "roku",
  identity_query: "identity",
  identity_or_memory: "memory",
  directive_response: "execution",
  contextual_directive: "execution_context",
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
  identity: "identity",
  execution: "execution",
  execution_context: "contextual_execution",
  general_reasoning: "reasoning",
  english: "language_fluency",
  psychology: "support_then_advance",
  ai: "ai_architecture_reasoning",
  cyber: "defensive_cybersecurity",
  law: "educational_law_information",
  finance: "scenario_finance_reasoning"
});

const DOMAIN_DEPTH = Object.freeze({
  general: "normal",
  technical: "forensic",
  emotional: "deep_forward",
  business: "strategic",
  music: "normal",
  news: "normal",
  roku: "normal",
  memory: "continuity_deep",
  identity: "identity_baseline",
  execution: "direct_execution",
  execution_context: "contextual_precision",
  general_reasoning: "baseline_cognition",
  english: "polished_language",
  psychology: "deep_forward",
  ai: "forensic",
  cyber: "forensic",
  law: "balanced",
  finance: "balanced"
});

const PREFERRED_STYLE = Object.freeze({
  general: "direct_warm",
  technical: "direct_forensic",
  emotional: "warm_deep_forward",
  business: "strategic_direct",
  music: "clear_retrieval",
  news: "clean_source_aware",
  roku: "platform_direct",
  memory: "identity_continuity",
  identity: "identity_clear",
  execution: "short_direct_action",
  execution_context: "contextual_directive",
  general_reasoning: "reasoned_direct",
  english: "clear_polished",
  psychology: "contain_then_clarify",
  ai: "implementation_grade",
  cyber: "defensive_only",
  law: "jurisdiction_aware",
  finance: "assumption_disclosed"
});

const VALID_KNOWLEDGE_DOMAINS = Object.freeze([
  "psychology",
  "english",
  "ai",
  "cyber",
  "law",
  "finance"
]);

const KNOWLEDGE_OPERATIONAL_DOMAIN = Object.freeze({
  psychology: "emotional",
  english: "english",
  ai: "ai",
  cyber: "cyber",
  law: "law",
  finance: "finance"
});

const KNOWLEDGE_DOMAIN_MODE = Object.freeze({
  psychology: "support_then_advance",
  english: "language_fluency",
  ai: "ai_architecture_reasoning",
  cyber: "defensive_cybersecurity",
  law: "educational_law_information",
  finance: "scenario_finance_reasoning"
});

const KNOWLEDGE_DOMAIN_DEPTH = Object.freeze({
  psychology: "deep_forward",
  english: "polished_language",
  ai: "forensic",
  cyber: "forensic",
  law: "balanced",
  finance: "balanced"
});

function safeStr(v) {
  return v == null ? "" : String(v).replace(/\s+/g, " ").trim();
}

function lower(v) {
  return safeStr(v).toLowerCase();
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeObj(v) {
  return isObj(v) ? v : {};
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
  return safeStr(v);
}


function normalizeRouterVoiceTextParity(text="") {
  return safeStr(text)
    .replace(/\b(nick|nix|mix|mike)\b/gi, "Nyx")
    .replace(/\b(state\s+line|state\s+sign|statespine|state\s+spine)\b/gi, "State Spine")
    .replace(/\b(chad\s+engine|chat\s+engine)\b/gi, "ChatEngine")
    .replace(/\b(mary\s+bridge|marian\s+bridge|marion\s+bridge)\b/gi, "MarionBridge")
    .replace(/\b(compose\s+marion\s+response|composed\s+marion\s+response|compose\s+marian\s+response|composed\s+marian\s+response|compose\s+mailing\s+response|composed\s+mailing\s+response)\b/gi, "ComposeMarionResponse")
    .replace(/\b(nyx|nix|nick)\s+steps\s+for\s+(publishing|submission|submitting)\b/gi, "Next steps for $2")
    .replace(/\b(nex\s+steps|neck\s+steps)\b/gi, "Next steps")
    .replace(/\b(mic\s*tech|mike\s*tech|mike\s*text|mic\s*text)\b/gi, "mic text")
    .replace(/\b(5\s*term|five\s*term|five\s*turn|5\s*turn)\b/gi, "5-turn")
    .replace(/\s+/g, " ")
    .trim();
}


function normalizeInputSource(value) {
  const raw = lower(value);
  if (/voice|speech|mic|audio|headset/.test(raw)) return "voice";
  if (/text|typed|keyboard|manual/.test(raw)) return "text";
  return raw || "text";
}


function canonicalTechnicalTargetFromText(text = "") {
  const t = safeStr(text || "");
  const mk = (targetKey, targetName, targetFile, targetPath, layer = "runtime") => ({ version: "nyx.marion.technicalTargetLock/1.1", targetKey, targetName, targetFile, targetPath, layer, explicit: true, source: "current_user_text", locked: true, technicalFollowUpLock: true, blockScheduleInterception: true });
  if (/\b(chat\s*engine|chatengine)\b/i.test(t)) return mk("chatEngine", "ChatEngine", "chatEngine.js", "Utils/chatEngine.js", "transport");
  if (/\b(marion\s*bridge|marionbridge)\b/i.test(t)) return mk("marionBridge", "MarionBridge", "marionBridge.js", "Data/marion/runtime/marionBridge.js", "bridge");
  if (/\b(compose\s*marion\s*response|composemarionresponse|composer)\b/i.test(t)) return mk("composeMarionResponse", "ComposeMarionResponse", "composeMarionResponse.js", "Data/marion/runtime/composeMarionResponse.js", "composer");
  if (/\b(state\s*spine|statespine|state-spine)\b/i.test(t)) return mk("stateSpine", "StateSpine", "stateSpine.js", "Utils/stateSpine.js", "state");
  if (/\b(marion\s*intent\s*router|intent\s*router|marionintentrouter)\b/i.test(t)) return mk("marionIntentRouter", "MarionIntentRouter", "marionIntentRouter.js", "Data/marion/runtime/marionIntentRouter.js", "router");
  if (/\b(domain\s*router|domainrouter)\b/i.test(t)) return mk("domainRouter", "DomainRouter", "domainRouter.js", "Utils/domainRouter.js", "router");
  if (/\b(domain\s*registry|marion\s*domain\s*registry|mariondomainregistry)\b/i.test(t)) return mk("marionDomainRegistry", "MarionDomainRegistry", "marionDomainRegistry.js", "Data/marion/runtime/marionDomainRegistry.js", "registry");
  if (/\b(index\.js|api\/chat|\/api\/chat)\b/i.test(t)) return mk("index", "index.js", "index.js", "index.js", "outer_transport");
  return {};
}
function isTechnicalFollowUpIntent(text = "") {
  const t = safeStr(text || "");
  const target = canonicalTechnicalTargetFromText(t);
  if (!target || !target.targetPath) return false;
  return /\b(now|next|then|also|again|from there|after that|one more)\b/i.test(t) || /\b(full autopsy|autopsy|audit|line[-\s]?by[-\s]?line|critical fix|critical fixes|check|inspect|review|patch|harden|run)\b/i.test(t);
}

function isInfrastructureContinuityPrompt(text) {
  const t = lower(normalizeRouterVoiceTextParity(text));
  return /\b(bootstrap|guard|manifest|declared path|root path|domain isolation|domain route|domain routing|fail[-\s]?closed|silent fallback|cross[-\s]?domain bleed|domain bleed|domain path|final envelope|state spine|5-turn|five-turn|continuity regression|mic text parity|input source parity|same route|same state|same final|response consistency)\b/i.test(t) || /\b(broken|invalid|failed|missing)\b.*\b(psychology|english|finance|general|domain)\b.*\b(affect|fallback|bleed|load|route)\b/i.test(t) || /\b(should not|must not|cannot)\b.*\b(affect|fall back|fallback|bleed)\b.*\b(english|finance|general|psychology)\b/i.test(t);
}

function isContinuationCompressionInstruction(text) {
  const t = lower(normalizeRouterVoiceTextParity(text));
  if (!t) return false;
  return /\bcontinue from (?:the )?(?:last|previous) answer\b/i.test(t) && /\b(compress|one sentence|single sentence|final rule|without repeating|previous wording|same idea|shorten)\b/i.test(t);
}

function isRokuPublishingRequest(text = "") {
  const t = lower(normalizeRouterVoiceTextParity(text));
  if (!t) return false;
  return /\b(roku|ott|channel app|roku app|tv app|streaming app)\b/i.test(t) && /\b(publish|publishing|submit|submission|developer|package|pkg|channel|feed|stream|playback|deeplink|deep link|certification|screenshots|artwork|manifest|sideload|beta|private channel|public channel|app path|before submission|checked before submission|next steps|nyx steps)\b/i.test(t);
}

function isNewsMediaPositioningRequest(text = "") {
  const t = lower(normalizeRouterVoiceTextParity(text));
  if (!t) return false;
  if (/\b(rewrite|revise|edit|proofread|polish|copyedit|grammar|tone|professional(?:ly)?|make this .*sound|wording|language flow)\b/i.test(t)) return false;
  const brandHit = /\b(news canada|newscanada|sandblast media|sandblast channel|media page|news page)\b/i.test(t);
  const positioningHit = /\b(positioning|position|shape|trust|reliable|credib(?:le|ility)|current|fresh|freshness|useful|usefulness|story hierarchy|headline hierarchy|source path|update cadence|older stories|editorial|content trust|visitor trust|page feels|feels reliable)\b/i.test(t);
  const retrievalOnly = /\b(feed issue|rss error|rss route|wp rest|story url|headline url|fetch|parse|diagnostics|route result)\b/i.test(t) && !/\b(positioning|trust|reliable|credible|useful|current|fresh)\b/i.test(t);
  return brandHit && positioningHit && !retrievalOnly;
}

function turnContinuityHash(value) {
  const source = lower(normalizeRouterVoiceTextParity(value)).replace(/[^a-z0-9]+/g, " ").trim();
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
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
    script: "technical_debug",
    endpoint: "technical_debug",
    bridge: "technical_debug",
    packet: "technical_debug",
    contract: "technical_debug",

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
    identity: "identity_query",
    identity_query: "identity_query",
    identity_or_memory: "identity_or_memory",
    continuity: "identity_or_memory",
    state: "identity_or_memory",
    state_spine: "identity_or_memory",
    statespine: "identity_or_memory",
    spine: "identity_or_memory",
    greeting: "simple_chat",
    greetings: "simple_chat",
    social: "simple_chat",

    directive: "directive_response",
    directive_response: "directive_response",
    contextual_directive: "contextual_directive",
    context_directive: "contextual_directive",
    question: "domain_question",
    domain_question: "domain_question",
    reasoning: "domain_question",
    baseline_cognition: "domain_question"
  });

  const normalized = aliases[raw] || raw || "";
  return VALID_INTENTS.includes(normalized) ? normalized : "";
}

function extractText(packet = {}) {
  const p = safeObj(packet);
  const body = safeObj(p.body);
  const payload = safeObj(p.payload);
  const session = safeObj(p.session || body.session);
  const turn = safeObj(p.turn || body.turn);
  const message = safeObj(p.message && typeof p.message === "object" ? p.message : {});

  return normalizeRouterVoiceTextParity(compactWhitespace(
    p.text ||
    p.query ||
    p.userQuery ||
    (typeof p.message === "string" ? p.message : "") ||
    p.input ||
    p.prompt ||
    p.command ||
    body.text ||
    body.query ||
    (typeof body.message === "string" ? body.message : "") ||
    body.input ||
    payload.text ||
    payload.query ||
    (typeof payload.message === "string" ? payload.message : "") ||
    payload.input ||
    turn.text ||
    turn.message ||
    message.text ||
    session.lastUserText ||
    ""
  ));
}

function extractExistingIntent(packet = {}) {
  const p = safeObj(packet);
  const body = safeObj(p.body);
  const payload = safeObj(p.payload);
  const session = safeObj(p.session || body.session);
  return safeObj(p.marionIntent || p.intentPacket || body.marionIntent || body.intentPacket || payload.marionIntent || session.marionIntent || {});
}

function detectSafetyLevel(text) {
  const t = lower(text);
  if (!t) return "none";

  if (has(/\b(suicide|suicidal|self[- ]?harm|kill myself|end my life|don['’]?t want to live|dont want to live|want to die|crisis|panic attack)\b/i, t)) {
    return "crisis";
  }

  if (has(/\b(depressed|depression|sad|lonely|overwhelmed|anxious|anxiety|hurt|heartbroken|grief|crying|afraid|stressed|hopeless|numb|burned out|burnt out|frustrated|exhausted)\b/i, t)) {
    return "distress";
  }

  return "none";
}

function detectSocialIntent(text) {
  const t = lower(text).replace(/[.!?]+$/g, "").trim();
  if (!t) return "";
  if (/^(hi|hello|hey|yo|hiya|good morning|good afternoon|good evening)(\s+(nyx|nix|vera|mac))?$/.test(t)) return "greeting";
  if (/\b(how are you|how are you today|how's it going|how is it going|you doing okay|are you there)\b/i.test(t)) return "wellbeing_check";
  if (/\b(what can you help with|what do you help with|what can you do|what are your areas|where can we start|help me start)\b/i.test(t)) return "capabilities_intro";
  if (/\b(thank you|thanks|appreciate it|perfect|beautiful|good job)\b/i.test(t) && t.length < 120) return "courtesy";
  return "";
}

function detectContextualDirectiveIntent(text) {
  const t = lower(text);
  if (!t) return false;
  return !!(
    has(/\b(given that setup|given this setup|based on that|based on this|that setup|that architecture|that context|from there|in this case)\b/i, t) ||
    has(/\b(final envelope|finalenvelope|session patch|sessionpatch|contract)\b.*\b(breaks|fails|lost|survives|risk|harden|first)\b/i, t) ||
    has(/\b(what layer|which layer|harden first|biggest risk|desynchronization risk)\b/i, t)
  );
}

function detectDomainIntroIntent(text) {
  const t = lower(text);
  if (!t) return "";
  if (/\b(avatar|voice|tts|speech|nyx voice|avatar controls|micro[- ]?expression|head and shoulders)\b/i.test(t)) return "avatar_voice";
  if (/\b(backend diagnostics|diagnostics|health check|route health|api status|server status)\b/i.test(t)) return "backend_diagnostics";
  if (/\b(media|radio|linear tv|sandblast channel|campaign|audience|listeners)\b/i.test(t)) return "media_radio";
  return "";
}

function detectBackendTechnicalContext(text) {
  const t = lower(text);
  if (!t) return false;
  const backendAnchor = /\b(nyx|marion|backend|chatengine|chat engine|marionbridge|marion bridge|intent router|marion intent router|composemarionresponse|compose marion response|state spine|statespine|state-spine|final envelope|finalenvelope|session patch|sessionpatch|reply authority|transport|coordinator|composer|bridge|router|runtime|utils|api\/chat|endpoint|contract|packet|script|file|code-level|code level)\b/i.test(t);
  const technicalAction = /\b(autopsy|audit|line[- ]?by[- ]?line|critical fix|critical fixes|fix|patch|harden|hardening|stabilize|refine|regression|smoke test|compatibility|cohesion|routing|handoff|continuity|carry-forward|carry forward|final-authority|authority preservation|structural integrity)\b/i.test(t);
  return !!(backendAnchor && technicalAction);
}

function detectCreativeCognitiveCarryContext(text) {
  const t = lower(text);
  if (!t) return false;
  return /\b(creative cognitive|cognitive carry|creative carry|creative suggestion|cognitive intelligence|intelligence layer|reflective prompt|suggestion module)\b/i.test(t);
}

function detectSubIntent(text, intent) {
  const t = lower(text);
  if (!t) return "empty_input";

  if (intent === "simple_chat") {
    const social = detectSocialIntent(text);
    if (social) return social;
    const domainIntro = detectDomainIntroIntent(text);
    if (domainIntro) return domainIntro;
    return "plain_conversation";
  }

  if (intent === "identity_query") {
    return "identity_baseline";
  }

  if (intent === "identity_or_memory") {
    if (has(/\b(who are you|what are you|what is marion|who is marion|what is nyx|tell me who you are|how (do|does) (you|marion) (think|help)|marion helps you think|nyx.*marion|marion.*nyx|your brain|your consciousness|your identity)\b/i, t)) return "identity_baseline";
    if (has(/\b(remember|last time|continue|carry forward|continuity|state spine|conversation state|turn state)\b/i, t)) return "memory_continuity";
    return "identity_or_memory";
  }

  if (intent === "technical_debug") {
    if (has(/\b(final envelope|final reply|reply envelope|contract|authority gate|diagnostic|packet|bridge|composer|compose|endpoint|api\/chat|loop|looping)\b/i, t)) return "contract_or_bridge_diagnosis";
    if (has(/\b(autopsy|audit|gap refinement|critical fix|critical fixes|line[- ]?by[- ]?line)\b/i, t)) return "forensic_audit";
    if (has(/\b(integration|cohesion|cohesive|90%|ninety percent|baseline cognition|reasoning)\b/i, t)) return "cohesion_upgrade";
    return "technical_execution";
  }

  if (intent === "contextual_directive") {
    return "contextual_precision";
  }

  if (intent === "directive_response") {
    if (has(/\b(next best step|best next step|what should (i|we) do next)\b/i, t)) return "next_best_step";
    if (has(/\b(short|direct|concise|brief)\b/i, t)) return "short_direct_answer";
    return "directive_execution";
  }

  if (intent === "domain_question") {
    if (has(/\b(reason|reasoning|analyze|analysis|break down|step by step|why|how)\b/i, t)) return "baseline_reasoning";
    return "general_question";
  }

  if (intent === "emotional_support") return "emotional_containment";
  if (intent === "business_strategy") return "commercial_strategy";
  if (intent === "music_query") return "music_retrieval";
  if (intent === "news_query") return isNewsMediaPositioningRequest(text) ? "media_positioning" : "news_retrieval";
  if (intent === "roku_query") return "roku_platform";
  return "plain_conversation";
}

function detectDirectiveIntent(text) {
  const t = lower(text);
  if (!t) return false;
  return !!(
    has(/\b(short[, ]+direct answer|short direct answer|direct answer|short answer|concise answer|brief answer)\b/i, t) ||
    has(/\b(next best step|best next step|single next step|one next step|what is the next best step|what should (i|we) do next)\b/i, t) ||
    has(/\b(give me|tell me)\b.*\b(short|direct|concise|brief)\b.*\b(answer|step|move)\b/i, t) ||
    has(/\b(one|single)\b.*\b(action|fix|move|step)\b/i, t)
  );
}


function normalizeKnowledgeDomainName(value) {
  const raw = lower(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const aliases = Object.freeze({
    psychology: "psychology",
    psych: "psychology",
    emotional: "psychology",
    emotion: "psychology",
    support: "psychology",
    english: "english",
    language: "english",
    grammar: "english",
    writing: "english",
    syntax: "english",
    ai: "ai",
    artificial_intelligence: "ai",
    machine_learning: "ai",
    ml: "ai",
    cyber: "cyber",
    cybersecurity: "cyber",
    security: "cyber",
    infosec: "cyber",
    law: "law",
    legal: "law",
    canada_law: "law",
    finance: "finance",
    financial: "finance",
    economics: "finance",
    pricing: "finance"
  });
  return aliases[raw] || (VALID_KNOWLEDGE_DOMAINS.includes(raw) ? raw : "");
}

function registryKnowledgeRoute(domain) {
  const key = normalizeKnowledgeDomainName(domain);
  if (!key || !domainRegistryMod) return null;
  try {
    if (typeof domainRegistryMod.buildKnowledgeRoute === "function") {
      const route = domainRegistryMod.buildKnowledgeRoute(key);
      if (route && route.supported !== false) return route;
    }
  } catch (_) {}
  return null;
}

function registryKnowledgeWiring(domain) {
  const key = normalizeKnowledgeDomainName(domain);
  if (!key || !domainRegistryMod) return null;
  try {
    if (typeof domainRegistryMod.getDomainWiringStatus === "function") {
      const status = domainRegistryMod.getDomainWiringStatus(key, { includePack: false });
      if (status && status.supported !== false) return status;
    }
  } catch (_) {}
  return null;
}

function registryKnowledgeConfig(domain) {
  const key = normalizeKnowledgeDomainName(domain);
  if (!key || !domainRegistryMod) return null;
  try {
    if (typeof domainRegistryMod.getKnowledgeDomainConfig === "function") {
      const cfg = domainRegistryMod.getKnowledgeDomainConfig(key);
      if (cfg && cfg.supported !== false) return cfg;
    }
    if (typeof domainRegistryMod.getDomainConfig === "function") {
      const cfg = domainRegistryMod.getDomainConfig(key);
      if (cfg && cfg.supported !== false) return cfg;
    }
  } catch (_) {}
  return null;
}

function isKnowledgeDomainActivationRequest(text) {
  return /\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(english language|english|psychology|psych|emotion|emotional|ai|artificial intelligence|cybersecurity|cyber|law|legal|finance|financial)\s+(domain|lane|knowledge|pack|setup)\b/i.test(lower(text));
}

function domainTestPhrase(text) {
  const t = lower(text);
  const pairs = [
    ["psychology", /\b(psychology|psych|emotion|emotional)\s+(domain|lane)\s+test(\s+only)?\b/i],
    ["english", /\b(english|language|grammar|writing)\s+(domain|lane)\s+test(\s+only)?\b/i],
    ["ai", /\b(ai|artificial intelligence)\s+(domain|lane)\s+test(\s+only)?\b/i],
    ["cyber", /\b(cyber|cybersecurity|security)\s+(domain|lane)\s+test(\s+only)?\b/i],
    ["law", /\b(law|legal)\s+(domain|lane)\s+test(\s+only)?\b/i],
    ["finance", /\b(finance|financial|economics)\s+(domain|lane)\s+test(\s+only)?\b/i]
  ];
  for (const [key, rx] of pairs) if (rx.test(t)) return key;
  return "";
}

function detectKnowledgeDomain(text) {
  const t = lower(text);
  if (!t) return { knowledgeDomain: "", explicit: false, reason: "none" };
  if (isInfrastructureContinuityPrompt(t)) return { knowledgeDomain: "", explicit: false, reason: "technical_infrastructure_precedence" };
  if (isContinuationCompressionInstruction(t)) return { knowledgeDomain: "", explicit: false, reason: "continuation_compression_precedence" };

  const domainTest = domainTestPhrase(t);
  if (domainTest) return { knowledgeDomain: domainTest, explicit: true, reason: "domain_test_phrase" };

  const explicit = [
    { k: "psychology", rx: /\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(psychology|psych|emotional support)\s+(domain|lane|knowledge|pack)\b/i },
    { k: "english", rx: /\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(english|english language|language|grammar|writing)\s+(domain|lane|knowledge|pack|setup)\b/i },
    { k: "ai", rx: /\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(ai|artificial intelligence)\s+(domain|lane|knowledge|pack)\b/i },
    { k: "cyber", rx: /\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(cyber|cybersecurity|security)\s+(domain|lane|knowledge|pack)\b/i },
    { k: "law", rx: /\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(law|legal|canadian law)\s+(domain|lane|knowledge|pack)\b/i },
    { k: "finance", rx: /\b(use|route|activate|load|switch to|run|engage)\s+(the\s+)?(finance|financial|economics|pricing)\s+(domain|lane|knowledge|pack)\b/i }
  ];
  for (const item of explicit) {
    if (has(item.rx, t)) return { knowledgeDomain: item.k, explicit: true, reason: "explicit_domain_phrase" };
  }

  if (!isContinuationCompressionInstruction(t) && /\b(rewrite|polish|grammar|syntax|tone|professional clarity|business english|make this paragraph|make this sentence|language flow|wording|copyedit|proofread)\b/i.test(t)) {
    return { knowledgeDomain: "english", explicit: false, reason: "english_language_terms" };
  }
  if (/\b(overwhelmed|spiraling|panic|numb|shutdown|attachment|shame|trauma|stabilize first|cognitive distortion|support strategy)\b/i.test(t)) {
    return { knowledgeDomain: "psychology", explicit: false, reason: "psychology_support_terms" };
  }
  if (/\b(ai agent|artificial intelligence|llm|rag|embedding|tool routing|agent orchestration|machine learning|prompt injection defense for ai)\b/i.test(t)) {
    return { knowledgeDomain: "ai", explicit: false, reason: "ai_terms" };
  }
  if (/\b(cyber|cybersecurity|prompt injection|phishing|malware|ransomware|mfa|least privilege|identity access|iam|incident response|threat model|defensive security|endpoint security|cloud security|network security|web security|privacy minimization|data protection|hardening)\b/i.test(t)) {
    return { knowledgeDomain: "cyber", explicit: false, reason: "cyber_terms" };
  }
  if (/\bhardening\b/i.test(t) && !detectBackendTechnicalContext(t)) {
    return { knowledgeDomain: "cyber", explicit: false, reason: "cyber_hardening_terms" };
  }
  if (/\b(legal advice|legal information|law in canada|canadian law|contract law|tort|criminal law|charter|case law|statute|jurisdiction)\b/i.test(t)) {
    return { knowledgeDomain: "law", explicit: false, reason: "law_terms" };
  }
  if (/\b(cash[-\s]?flow risk|cash[-\s]?flow impact|cash[-\s]?flow pressure|cash[-\s]?flow runway|business runway|financial resilience|working capital|burn rate|unit economics|ltv|cac|pricing tiers|capital markets|cash[-\s]?flow|runway|margin|gross margin|finance|financial|investment advice|scenario analysis)\b/i.test(t)) {
    return { knowledgeDomain: "finance", explicit: false, reason: "finance_confidence_terms" };
  }
  return { knowledgeDomain: "", explicit: false, reason: "none" };
}

function operationalDomainForKnowledge(knowledgeDomain, fallbackIntent = "domain_question") {
  const k = normalizeKnowledgeDomainName(knowledgeDomain);
  if (!k) return INTENT_TO_DOMAIN[fallbackIntent] || "general_reasoning";
  return KNOWLEDGE_OPERATIONAL_DOMAIN[k] || "general_reasoning";
}

function inferIntentFromText(text) {
  const t = lower(text);
  const safetyLevel = detectSafetyLevel(t);
  const knowledge = detectKnowledgeDomain(t);
  const technicalTargetLock = canonicalTechnicalTargetFromText(text);
  const technicalFollowUpLock = isTechnicalFollowUpIntent(text);

  if (!t) {
    return {
      intent: "simple_chat",
      confidence: 0.35,
      reason: "empty_text",
      stateStageHint: "deliver",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  /* Safety must outrank all other classes. */
  if (safetyLevel === "crisis") {
    return {
      intent: "emotional_support",
      confidence: 0.98,
      reason: "crisis_distress_terms",
      stateStageHint: "recovery",
      safetyLevel,
      recoveryRequired: true,
      knowledgeDomain: knowledge.knowledgeDomain || (safetyLevel === "crisis" || safetyLevel === "distress" ? "psychology" : ""),
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason || "safety_psychology"
    };
  }

  if (safetyLevel === "distress") {
    return {
      intent: "emotional_support",
      confidence: 0.89,
      reason: "emotional_distress_terms",
      stateStageHint: "recovery",
      safetyLevel,
      recoveryRequired: true,
      knowledgeDomain: knowledge.knowledgeDomain || (safetyLevel === "crisis" || safetyLevel === "distress" ? "psychology" : ""),
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason || "safety_psychology"
    };
  }

  if (technicalTargetLock && technicalTargetLock.targetPath && safetyLevel === "none") {
    return {
      intent: "technical_debug",
      confidence: 0.99,
      reason: technicalFollowUpLock ? "technical_followup_target_lock" : "technical_target_lock",
      stateStageHint: "execution",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: "",
      knowledgeDomainExplicit: false,
      knowledgeDomainReason: "technical_target_overrides_location_schedule_and_stale_memory",
      routeLock: true,
      technicalTargetLock,
      technicalFollowUpLock: !!technicalFollowUpLock,
      blockScheduleInterception: true
    };
  }

  if (isInfrastructureContinuityPrompt(t) && safetyLevel === "none") {
    return {
      intent: "technical_debug",
      confidence: 0.98,
      reason: "infrastructure_continuity_precedence",
      stateStageHint: "execution",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: "",
      knowledgeDomainExplicit: false,
      knowledgeDomainReason: "technical_infrastructure_overrides_domain_keywords",
      routeLock: true
    };
  }

  if (detectBackendTechnicalContext(t) && safetyLevel === "none") {
    return {
      intent: "technical_debug",
      confidence: detectCreativeCognitiveCarryContext(t) ? 0.96 : 0.94,
      reason: detectCreativeCognitiveCarryContext(t) ? "backend_technical_creative_cognitive_context" : "backend_technical_hardening_context",
      stateStageHint: "execution",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: "",
      knowledgeDomainExplicit: false,
      knowledgeDomainReason: "technical_context_overrides_broad_knowledge_domain"
    };
  }

  if (knowledge.knowledgeDomain && safetyLevel === "none") {
    return {
      intent: "domain_question",
      confidence: knowledge.explicit ? 0.97 : 0.86,
      reason: knowledge.reason || "knowledge_domain_terms",
      stateStageHint: "reason",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  const socialIntent = detectSocialIntent(t);
  if (socialIntent) {
    return {
      intent: "simple_chat",
      confidence: socialIntent === "greeting" ? 0.96 : 0.9,
      reason: `social_${socialIntent}`,
      stateStageHint: "deliver",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (detectContextualDirectiveIntent(t)) {
    return {
      intent: "contextual_directive",
      confidence: 0.93,
      reason: "contextual_directive_terms",
      stateStageHint: "execute_context",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (isNewsMediaPositioningRequest(t)) {
    return {
      intent: "news_query",
      confidence: 0.95,
      reason: "news_media_positioning_terms",
      stateStageHint: "strategy",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: "",
      knowledgeDomainExplicit: false,
      knowledgeDomainReason: ""
    };
  }

  /* Directive execution must outrank generic question and broad technical terms. */
  if (detectDirectiveIntent(t)) {
    return {
      intent: "directive_response",
      confidence: 0.94,
      reason: "directive_execution_terms",
      stateStageHint: "execute",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  /* Identity baseline must outrank generic question and broad technical terms. */
  if (has(/\b(who are you|what are you|what is marion|who is marion|what is nyx|tell me who you are|how (do|does) (you|marion) (think|help)|marion helps you think|nyx.*marion|marion.*nyx|your brain|your consciousness|your identity|identity anchor)\b/i, t)) {
    return {
      intent: "identity_query",
      confidence: 0.93,
      reason: "identity_baseline_terms",
      stateStageHint: "continuity",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (has(/\b(remember|last time|continue|memory|conversation state|turn state|continuity|state spine|statespine|who am i)\b/i, t)) {
    return {
      intent: "identity_or_memory",
      confidence: 0.82,
      reason: "memory_continuity_terms",
      stateStageHint: "continuity",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (detectContextualDirectiveIntent(t)) {
    return {
      intent: "contextual_directive",
      confidence: 0.93,
      reason: "contextual_directive_terms",
      stateStageHint: "execute_context",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (isRokuPublishingRequest(t)) {
    return {
      intent: "roku_query",
      confidence: 0.96,
      reason: "roku_publishing_submission_terms",
      stateStageHint: "deliver",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: "",
      knowledgeDomainExplicit: false,
      knowledgeDomainReason: ""
    };
  }

  if (has(/\b(index\.js|marionbridge|marion bridge|intent router|manual intent router|normalizer|packet|packets|phrase pack|phrase packs|compose|composer|composemarionresponse|state spine|statespine|state-spine|autopsy|audit|gap refinement|line[- ]?by[- ]?line|syntax|debug|bug|loop|looping|route|endpoint|api\/chat|backend diagnostics|diagnostics route|health check|final envelope|contract|authority gate|script|file|harden|critical fix|critical fixes|download|zip|integration|cohesion|cohesive|90%|ninety percent|baseline cognition)\b/i, t)) {
    return {
      intent: "technical_debug",
      confidence: 0.92,
      reason: "technical_debug_or_cohesion_terms",
      stateStageHint: "execution",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (has(/\b(avatar|tts|speech|voice route|voice ready|avatar controls|micro[- ]?expression|head and shoulders)\b/i, t)) {
    return {
      intent: "technical_debug",
      confidence: 0.82,
      reason: "avatar_voice_technical_terms",
      stateStageHint: "execution",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (has(/\b(top\s*10|song|songs|artist|album|chart|playlist|music|radio|billboard|year|decade|70s|80s|90s|2000s|adult contemporary)\b/i, t)) {
    return {
      intent: "music_query",
      confidence: 0.84,
      reason: "music_terms",
      stateStageHint: "retrieve",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (isNewsMediaPositioningRequest(t)) {
    return {
      intent: "news_query",
      confidence: 0.95,
      reason: "news_media_positioning_terms",
      stateStageHint: "strategy",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: "",
      knowledgeDomainExplicit: false,
      knowledgeDomainReason: ""
    };
  }

  if (has(/\b(news|headline|headlines|article|story|stories|rss|newscanada|for your life|feed)\b/i, t)) {
    return {
      intent: "news_query",
      confidence: 0.84,
      reason: "news_terms",
      stateStageHint: "retrieve",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (has(/\b(roku|tv app|linear tv|streaming|channel app|ott)\b/i, t)) {
    return {
      intent: "roku_query",
      confidence: isRokuPublishingRequest(t) ? 0.96 : 0.86,
      reason: isRokuPublishingRequest(t) ? "roku_publishing_submission_terms" : "roku_terms",
      stateStageHint: "deliver",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (has(/\b(price|pricing|sponsor|sponsorship|media kit|monetize|monetization|pitch|funding|investor|sales|proposal|revenue|business|startup|advertising|ad template|audience|brand awareness|commercial positioning)\b/i, t)) {
    return {
      intent: "business_strategy",
      confidence: 0.84,
      reason: "business_terms",
      stateStageHint: "strategy",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
    };
  }

  if (has(/(^|\s)(how|what|why|where|when|can you|could you|should i|would it|is it|are we|explain|analyze|break down)\b|\?$/i, t)) {
    return {
      intent: "domain_question",
      confidence: t.length > 60 ? 0.7 : 0.6,
      reason: "general_question",
      stateStageHint: "reason",
      safetyLevel,
      recoveryRequired: false,
      knowledgeDomain: knowledge.knowledgeDomain,
      knowledgeDomainExplicit: !!knowledge.explicit,
      knowledgeDomainReason: knowledge.reason
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
  const src = safeObj(rawInput);
  const inferred = inferIntentFromText(fallbackText);
  const explicit = normalizeIntentName(src.intent || src.type || src.name || "");
  const detectedKnowledge = detectKnowledgeDomain(fallbackText);
  const technicalTargetLock = safeObj(src.technicalTargetLock || canonicalTechnicalTargetFromText(fallbackText));
  const technicalFollowUpLock = !!(src.technicalFollowUpLock || isTechnicalFollowUpIntent(fallbackText));
  const explicitKnowledge = normalizeKnowledgeDomainName(src.knowledgeDomain || src.domainKnowledge || src.primaryKnowledgeDomain || safeObj(src.routing).knowledgeDomain || "");
  let knowledgeDomain = explicitKnowledge || inferred.knowledgeDomain || detectedKnowledge.knowledgeDomain || "";

  let intent = explicit && explicit !== "simple_chat" ? explicit : inferred.intent;
  let confidence = clamp01(src.confidence, inferred.confidence);
  let reason = safeStr(src.reason || src.source || inferred.reason);
  let stateStageHint = safeStr(src.stateStageHint || src.stage || inferred.stateStageHint || "deliver");
  let safetyLevel = safeStr(src.safetyLevel || inferred.safetyLevel || "none");
  let recoveryRequired = Boolean(src.recoveryRequired || inferred.recoveryRequired);

  if (technicalTargetLock && technicalTargetLock.targetPath && inferred.intent !== "emotional_support") {
    intent = "technical_debug";
    confidence = Math.max(confidence, 0.99);
    reason = technicalFollowUpLock ? "technical_followup_target_lock" : "technical_target_lock";
    stateStageHint = "execution";
    recoveryRequired = false;
    knowledgeDomain = "";
  }

  if (isInfrastructureContinuityPrompt(fallbackText) && inferred.intent !== "emotional_support") {
    intent = "technical_debug";
    confidence = Math.max(confidence, 0.98);
    reason = "infrastructure_continuity_precedence";
    stateStageHint = "execution";
    recoveryRequired = false;
    knowledgeDomain = "";
  }

  if (detectBackendTechnicalContext(fallbackText) && inferred.intent !== "emotional_support") {
    intent = "technical_debug";
    confidence = Math.max(confidence, detectCreativeCognitiveCarryContext(fallbackText) ? 0.96 : 0.94);
    reason = detectCreativeCognitiveCarryContext(fallbackText) ? "backend_technical_creative_cognitive_context" : "backend_technical_hardening_context";
    stateStageHint = "execution";
    recoveryRequired = false;
    knowledgeDomain = "";
  }

  if (knowledgeDomain && inferred.intent !== "emotional_support" && intent === "simple_chat") {
    intent = "domain_question";
    confidence = Math.max(confidence, detectedKnowledge.explicit || inferred.knowledgeDomainExplicit ? 0.97 : 0.86);
    reason = detectedKnowledge.reason || inferred.knowledgeDomainReason || "knowledge_domain_promoted";
    stateStageHint = "reason";
    recoveryRequired = false;
  }

  /* Distress language wins over stale explicit/general intent. */
  if (inferred.intent === "emotional_support") {
    intent = "emotional_support";
    confidence = Math.max(confidence, inferred.confidence);
    reason = inferred.reason;
    stateStageHint = "recovery";
    safetyLevel = inferred.safetyLevel;
    recoveryRequired = true;
  }

  /* Social interaction wins over stale identity/greeting hints so greetings stay warm, not diagnostic. */
  if (inferred.intent === "simple_chat" && /^social_/.test(inferred.reason) && intent !== "emotional_support") {
    intent = "simple_chat";
    confidence = Math.max(confidence, inferred.confidence);
    reason = inferred.reason;
    stateStageHint = "deliver";
    recoveryRequired = false;
  }

  /* Contextual directive wins over stale simple/domain/technical intent. */
  if (inferred.intent === "contextual_directive" && intent !== "emotional_support") {
    intent = "contextual_directive";
    confidence = Math.max(confidence, inferred.confidence);
    reason = inferred.reason;
    stateStageHint = "execute_context";
    recoveryRequired = false;
  }

  /* Directive execution wins over stale simple/domain/technical intent and must not be treated as clarification. */
  if (inferred.intent === "directive_response" && intent !== "emotional_support") {
    intent = "directive_response";
    confidence = Math.max(confidence, inferred.confidence);
    reason = inferred.reason;
    stateStageHint = "execute";
    recoveryRequired = false;
  }

  /* Identity baseline wins over stale simple/domain intent and must not be treated as generic Q&A. */
  if ((inferred.intent === "identity_query" || inferred.intent === "identity_or_memory") && intent !== "emotional_support") {
    intent = inferred.intent;
    confidence = Math.max(confidence, inferred.confidence);
    reason = inferred.reason;
    stateStageHint = "continuity";
    recoveryRequired = false;
  }

  /* Technical can override support only when there is no distress language. */
  if (intent === "emotional_support" && inferred.intent === "technical_debug" && inferred.safetyLevel === "none") {
    intent = "technical_debug";
    confidence = Math.max(confidence, 0.92);
    reason = "technical_override_support";
    stateStageHint = "execution";
    recoveryRequired = false;
  }

  if (!VALID_INTENTS.includes(intent)) {
    intent = "domain_question";
    confidence = Math.max(0.5, confidence);
    reason = reason || "unknown_intent_normalized";
    stateStageHint = stateStageHint || "reason";
  }

  const subIntent = safeStr(src.subIntent || src.subintent || detectSubIntent(fallbackText, intent));

  return {
    activate: intent !== "simple_chat",
    intent,
    subIntent,
    confidence,
    reason,
    stateStageHint,
    safetyLevel,
    recoveryRequired,
    loopSafe: true,
    allowGenericFallback: false,
    requiresFinalEnvelope: true,
    requiresComposer: true,
    identityAnchorRequired: subIntent === "identity_baseline",
    baselineCognitionRequired: intent === "domain_question" || intent === "directive_response" || subIntent === "baseline_reasoning" || subIntent === "cohesion_upgrade" || subIntent === "identity_baseline" || detectCreativeCognitiveCarryContext(fallbackText),
    creativeCognitiveCarryRequired: detectCreativeCognitiveCarryContext(fallbackText),
    directiveExecutionRequired: intent === "directive_response",
    knowledgeDomain,
    knowledgeDomainExplicit: !!(explicitKnowledge || inferred.knowledgeDomainExplicit || detectedKnowledge.explicit),
    knowledgeDomainReason: inferred.knowledgeDomainReason || detectedKnowledge.reason || "",
    technicalTargetLock,
    technicalFollowUpLock: !!technicalFollowUpLock,
    blockScheduleInterception: !!(technicalTargetLock && technicalTargetLock.targetPath),
    knowledgeDomainActivationRequest: isKnowledgeDomainActivationRequest(fallbackText),
    source: safeStr(src.source || "marionIntentRouter"),
    inputSource: normalizeInputSource(src.inputSource || src.source || "text"),
    routeLock: !!(src.routeLock || inferred.routeLock || isInfrastructureContinuityPrompt(fallbackText)),
    turnHash: turnContinuityHash(fallbackText),
    turnText: fallbackText,
    micTextParity: true,
    continuityRegressionReady: true,
    domainConfidence: intentConfidenceProfile({ ...src, confidence, intent, knowledgeDomain, reason, routeLock: !!(src.routeLock || inferred.routeLock || isInfrastructureContinuityPrompt(fallbackText)) }, fallbackText)
  };
}


function confidenceBand(confidence) {
  const c = clamp01(confidence, 0);
  if (c >= 0.92) return "high";
  if (c >= 0.72) return "medium";
  if (c >= 0.52) return "low";
  return "weak";
}

function addDomainCandidate(map, domain, score, reason, knowledgeDomain = "") {
  const key = knowledgeDomain ? normalizeKnowledgeDomainName(knowledgeDomain) : safeStr(domain || "").replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
  const normalized = key;
  if (!normalized) return;
  const current = map.get(normalized) || { domain: normalized, confidence: 0, reasons: [], knowledgeDomain: "" };
  current.confidence = Math.max(current.confidence, clamp01(score, 0));
  if (reason) current.reasons.push(safeStr(reason));
  if (knowledgeDomain) current.knowledgeDomain = normalizeKnowledgeDomainName(knowledgeDomain);
  map.set(normalized, current);
}

function domainSignalCandidates(text = "", intentPacket = {}) {
  const t = lower(text), p = safeObj(intentPacket), map = new Map();
  const intent = normalizeIntentName(p.intent || "") || "domain_question";
  const baseDomain = INTENT_TO_DOMAIN[intent] || "general_reasoning";
  const knowledgeDomain = normalizeKnowledgeDomainName(p.knowledgeDomain || "");
  addDomainCandidate(map, baseDomain, knowledgeDomain ? Math.max(0.45, clamp01(p.confidence, 0.48) - 0.06) : clamp01(p.confidence, 0.48), `intent:${intent}`);
  if (knowledgeDomain) addDomainCandidate(map, knowledgeDomain, p.knowledgeDomainExplicit ? 0.99 : Math.max(clamp01(p.confidence, 0.72), 0.84), p.knowledgeDomainReason || "knowledge_domain", knowledgeDomain);
  if (/\b(full autopsy|line[- ]?by[- ]?line audit|critical fix|backend|widget|marion|nyx|state spine|chatengine|intent router|domain registry|composemarionresponse|final envelope|telemetry|pipeline|routing)\b/i.test(t) && !(knowledgeDomain && !detectBackendTechnicalContext(t))) addDomainCandidate(map, "technical", 0.96, "technical_terms");
  if (/\b(overwhelmed|panic|spiral|emotional shutdown|cognitive distortion|trauma|attachment|distress|support strategy)\b/i.test(t)) addDomainCandidate(map, "psychology", 0.9, "psychology_terms", "psychology");
  if (isContinuationCompressionInstruction(t)) addDomainCandidate(map, "memory", 0.91, "continuation_compression_terms");
  else if (/\b(rewrite|proofread|polish|grammar|syntax|tone|copyedit|wording|business english|language flow)\b/i.test(t)) addDomainCandidate(map, "english", 0.9, "english_terms", "english");
  if (/\b(ai agent|llm|rag|embedding|tool routing|agent orchestration|machine learning|artificial intelligence|confidence scoring)\b/i.test(t)) addDomainCandidate(map, "ai", 0.94, "ai_terms", "ai");
  if (/\b(cyber|cybersecurity|phishing|ransomware|mfa|least privilege|identity access|iam|incident response|threat model|defensive security|endpoint security|cloud security|network security|web security|privacy minimization|data protection|hardening)\b/i.test(t)) addDomainCandidate(map, "cyber", 0.92, "cyber_terms", "cyber");
  if (/\b(legal advice|legal information|canadian law|contract law|case law|statute|jurisdiction|tort)\b/i.test(t)) addDomainCandidate(map, "law", 0.86, "law_terms", "law");
  if (/\b(finance|financial|cash[-\s]?flow|runway|margin|unit economics|ltv|cac|pricing tiers|capital markets|investment|scenario analysis)\b/i.test(t)) addDomainCandidate(map, "finance", 0.88, "finance_terms", "finance");
  if (/\b(sponsor|sponsorship|media kit|monetize|monetization|sales|revenue|business strategy|advertising|brand awareness|audience)\b/i.test(t)) addDomainCandidate(map, "business", 0.84, "business_terms");
  if (isNewsMediaPositioningRequest(t)) addDomainCandidate(map, "news", 0.95, "news_media_positioning_signal");
  if (/\b(news canada|rss|feed|story|headline|wp rest|editorial)\b/i.test(t)) addDomainCandidate(map, "news", isNewsMediaPositioningRequest(t) ? 0.95 : 0.84, isNewsMediaPositioningRequest(t) ? "news_media_positioning_terms" : "news_terms");
  if (/\b(roku|ott|linear tv|streaming app|channel app)\b/i.test(t)) addDomainCandidate(map, "roku", 0.84, "roku_terms");
  if (isRokuPublishingRequest(t)) addDomainCandidate(map, "roku", 0.96, "roku_publishing_submission_terms");
  return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 6).map((c) => ({...c, confidence: clamp01(c.confidence, 0), reasons: Array.from(new Set(c.reasons)).slice(0, 4)}));
}

function intentConfidenceProfile(intentPacket = {}, text = "") {
  const p = safeObj(intentPacket);
  const candidates = domainSignalCandidates(text, p);
  const top = candidates[0] || { domain: INTENT_TO_DOMAIN[p.intent] || "general_reasoning", confidence: clamp01(p.confidence, 0), reasons: ["intent_confidence"] };
  const second = candidates[1] || null;
  const c = Math.max(clamp01(p.confidence, 0), clamp01(top.confidence, 0));
  const margin = second ? Math.max(0, c - clamp01(second.confidence, 0)) : c;
  const routeLocked = !!(p.routeLock || isInfrastructureContinuityPrompt(text) || isNewsMediaPositioningRequest(text) || c >= 0.82 || (c >= 0.72 && margin >= 0.16));
  const ambiguous = !routeLocked && (c < 0.62 || (second && margin < 0.08));
  const knowledgeDomain = normalizeKnowledgeDomainName(p.knowledgeDomain || top.knowledgeDomain || "");
  return {
    version: DOMAIN_CONFIDENCE_VERSION,
    confidence: c,
    band: confidenceBand(c),
    margin,
    ambiguous,
    routeLocked,
    reason: safeStr(p.reason || (top.reasons && top.reasons[0]) || "intent_domain_confidence"),
    primaryIntent: safeStr(p.intent || "simple_chat"),
    primaryDomain: safeStr(top.domain || INTENT_TO_DOMAIN[p.intent] || "general_reasoning"),
    selectedDomain: safeStr(top.domain || INTENT_TO_DOMAIN[p.intent] || "general_reasoning"),
    knowledgeDomain,
    candidates,
    failClosed: ambiguous && !routeLocked
  };
}

function buildRouting(marionIntent) {
  const knowledgeDomain = normalizeKnowledgeDomainName(marionIntent.knowledgeDomain || "");
  const confidenceProfile = intentConfidenceProfile(marionIntent, marionIntent.turnText || "");
  const registryRoute = registryKnowledgeRoute(knowledgeDomain);
  const registryWiring = registryKnowledgeWiring(knowledgeDomain);
  const registryConfig = registryKnowledgeConfig(knowledgeDomain);
  const baseDomain = INTENT_TO_DOMAIN[marionIntent.intent] || "general_reasoning";
  const domain = knowledgeDomain ? safeStr((registryRoute && registryRoute.operationalDomain) || operationalDomainForKnowledge(knowledgeDomain, marionIntent.intent)) : baseDomain;
  const mode = (registryRoute && registryRoute.mode) || (knowledgeDomain && KNOWLEDGE_DOMAIN_MODE[knowledgeDomain]) || DOMAIN_MODE[domain] || "conversation";
  const depth = (registryRoute && registryRoute.depth) || (knowledgeDomain && KNOWLEDGE_DOMAIN_DEPTH[knowledgeDomain]) || DOMAIN_DEPTH[domain] || "normal";
  const preferredStyle = (registryRoute && registryRoute.preferredStyle) || (registryConfig && registryConfig.preferredStyle) || (knowledgeDomain && PREFERRED_STYLE[knowledgeDomain]) || PREFERRED_STYLE[domain] || "direct";
  const domainRoute = knowledgeDomain ? {
    knowledgeDomain,
    operationalDomain: domain,
    reason: safeStr(marionIntent.knowledgeDomainReason || "knowledge_domain_handoff"),
    explicit: !!marionIntent.knowledgeDomainExplicit,
    activationRequest: !!marionIntent.knowledgeDomainActivationRequest,
    registryVersion: safeStr((registryRoute && registryRoute.registryVersion) || (registryConfig && registryConfig.registryVersion) || ""),
    manifestFound: !!(registryWiring && registryWiring.manifestFound),
    manifestPath: safeStr(registryWiring && registryWiring.manifestPath),
    packFilesFound: Number(registryWiring && registryWiring.packFilesFound) || 0,
    wiringReady: !!(registryWiring && registryWiring.ready)
  } : null;

  return {
    domain,
    intent: marionIntent.intent,
    subIntent: marionIntent.subIntent,
    endpoint: CANONICAL_ENDPOINT,
    contractVersion: INTENT_CONTRACT_VERSION,
  PIPELINE_FORENSIC_NORMALIZATION_VERSION,
  DOMAIN_CONFIDENCE_VERSION,
  routerForensicNormalizationStatus,
    expectsComposer: "composeMarionResponse",
    expectedComposerContract: "finalEnvelope.reply.required",
    stateSpineSchema: STATE_SPINE_SCHEMA,
    stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    stateStageHint: marionIntent.stateStageHint,
    mode,
    depth,
    cognitiveMode: marionIntent.directiveExecutionRequired ? "directive_execution" : (marionIntent.baselineCognitionRequired ? "baseline_cognition" : mode),
    useMemory: domain === "memory" || domain === "identity" || domain === "emotional" || domain === "psychology" || marionIntent.subIntent === "identity_baseline",
    useDomainKnowledge: domain !== "general" || !!knowledgeDomain,
    knowledgeDomain,
    knowledgeDomainExplicit: !!marionIntent.knowledgeDomainExplicit,
    knowledgeDomainReason: safeStr(marionIntent.knowledgeDomainReason || ""),
    knowledgeDomainActivationRequest: !!marionIntent.knowledgeDomainActivationRequest,
    technicalTargetLock: safeObj(marionIntent.technicalTargetLock),
    technicalFollowUpLock: !!marionIntent.technicalFollowUpLock,
    blockScheduleInterception: !!marionIntent.blockScheduleInterception,
    domainConfidence: confidenceProfile,
    routeConfidence: confidenceProfile.confidence,
    routeConfidenceBand: confidenceProfile.band,
    routeAmbiguous: confidenceProfile.ambiguous,
    routeLock: !!(marionIntent.routeLock || confidenceProfile.routeLocked),
    routeFailClosed: !!confidenceProfile.failClosed,
    candidateDomains: confidenceProfile.candidates || [],
    noCrossDomainBleed: true,
    inputSource: normalizeInputSource(marionIntent.inputSource || "text"),
    turnHash: safeStr(marionIntent.turnHash || ""),
    micTextParity: true,
    continuityRegressionReady: true,
    domainRoute,
    requireFreshComposerEnvelope: true,
    requiresFinalEnvelope: true,
    requiresHotFallback: false,
    directiveExecutionRequired: !!marionIntent.directiveExecutionRequired,
    blockRepeatedBridgeFallback: true,
    recoveryRequired: marionIntent.recoveryRequired,
    safetyLevel: marionIntent.safetyLevel,
    identityAnchorRequired: !!marionIntent.identityAnchorRequired,
    baselineCognitionRequired: !!marionIntent.baselineCognitionRequired,
    creativeCognitiveCompatible: true,
    creativeCognitiveCarryRequired: !!marionIntent.creativeCognitiveCarryRequired,
    preferredStyle,
    registryKnowledgeAvailable: !!(registryWiring && (registryWiring.ready || registryWiring.manifestFound || registryWiring.packFilesFound > 0)),
    cohesion: {
      targetPercent: 90,
      bridgeCompatible: true,
      composerCompatible: true,
      stateSpineCompatible: true,
      creativeCognitiveCompatible: true,
      registryCompatible: true,
      finalEnvelopeRequired: true,
      directiveExecutionRequired: !!marionIntent.directiveExecutionRequired,
      noDiagnosticUserSurface: true,
      noUnsupportedDomainLeak: true
    }
  };
}
function routeMarionIntent(packet = {}) {
  const text = extractText(packet);
  const src = safeObj(packet);
  const existingIntent = extractExistingIntent(src);

  const marionIntent = normalizeIntent(existingIntent, text);
  const routing = buildRouting(marionIntent);
  const inputSource = normalizeInputSource(src.inputSource || safeObj(src.session).inputSource || marionIntent.inputSource || "text");
  const turnHash = turnContinuityHash(text);

  return {
    ok: true,
    final: false,
    routerVersion: VERSION,
    stateSpineSchema: STATE_SPINE_SCHEMA,
    stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    intentContractVersion: INTENT_CONTRACT_VERSION,
    marionIntent,
    routing,
    domainConfidence: routing.domainConfidence || intentConfidenceProfile(marionIntent, text),
    stateSpinePatch: {
      source: "marionIntentRouter",
      schema: STATE_SPINE_SCHEMA,
      shouldAdvanceState: true,
      stateStage: marionIntent.stateStageHint || "classified",
      intent: marionIntent.intent,
      subIntent: marionIntent.subIntent,
      inputSource,
      turnHash,
      micTextParity: true,
      continuityRegressionReady: true,
      routeLock: !!(marionIntent.routeLock || safeObj(routing.domainConfidence).routeLocked),
      routeFailClosed: !!safeObj(routing.domainConfidence).failClosed,
      domainConfidence: routing.domainConfidence || intentConfidenceProfile(marionIntent, text)
    },
    meta: {
      routedAt: new Date().toISOString(),
      confidence: marionIntent.confidence,
      domainConfidence: routing.domainConfidence || intentConfidenceProfile(marionIntent, text),
      triggerSource: marionIntent.source,
      textPresent: Boolean(text),
      singleIntentAuthority: true,
      bridgeCompatible: true,
      composerCompatible: true,
      stateSpineCompatible: true,
      preventsFallbackDeadState: true,
      finalEnvelopeRequired: true,
      directiveExecutionRequired: !!marionIntent.directiveExecutionRequired,
      identityAnchorRequired: !!marionIntent.identityAnchorRequired,
      baselineCognitionRequired: !!marionIntent.baselineCognitionRequired,
      creativeCognitiveCarryRequired: !!marionIntent.creativeCognitiveCarryRequired,
      knowledgeDomain: marionIntent.knowledgeDomain || "",
      knowledgeDomainExplicit: !!marionIntent.knowledgeDomainExplicit,
      registryKnowledgeAvailable: !!routing.registryKnowledgeAvailable,
      noUserFacingDiagnostics: true,
      inputSource,
      turnHash,
      micTextParity: true,
      continuityRegressionReady: true,
      routeLock: !!(marionIntent.routeLock || safeObj(routing.domainConfidence).routeLocked),
      routeFailClosed: !!safeObj(routing.domainConfidence).failClosed
    }
  };
}


function routerForensicNormalizationStatus(){
  return {
    version: PIPELINE_FORENSIC_NORMALIZATION_VERSION,
    routerVersion: VERSION,
    intentContractVersion: INTENT_CONTRACT_VERSION,
    canonicalEndpoint: CANONICAL_ENDPOINT,
    validIntentCount: VALID_INTENTS.length,
    knowledgeDomainCount: VALID_KNOWLEDGE_DOMAINS.length,
    authority: "router.single-canonical-intent",
    stateSchema: STATE_SPINE_SCHEMA,
    stateSchemaCompat: STATE_SPINE_SCHEMA_COMPAT
  };
}

module.exports = {
  VERSION,
  PIPELINE_FORENSIC_NORMALIZATION_VERSION,
  DOMAIN_CONFIDENCE_VERSION,
  routerForensicNormalizationStatus,
  STATE_SPINE_SCHEMA,
  STATE_SPINE_SCHEMA_COMPAT,
  INTENT_CONTRACT_VERSION,
  CANONICAL_ENDPOINT,
  VALID_INTENTS,
  INTENT_TO_DOMAIN,
  normalizeIntentName,
  inferIntentFromText,
  detectDirectiveIntent,
  detectKnowledgeDomain,
  detectBackendTechnicalContext,
  detectCreativeCognitiveCarryContext,
  normalizeKnowledgeDomainName,
  normalizeIntent,
  routeMarionIntent,
  isContinuationCompressionInstruction,
  isNewsMediaPositioningRequest,
  normalizeInputSource,
  canonicalTechnicalTargetFromText,
  isTechnicalFollowUpIntent,
  isInfrastructureContinuityPrompt,
  turnContinuityHash,
  confidenceBand,
  domainSignalCandidates,
  intentConfidenceProfile,
  _internal: {
    extractText,
    extractExistingIntent,
    detectSafetyLevel,
    detectSocialIntent,
    detectContextualDirectiveIntent,
    detectDomainIntroIntent,
    detectSubIntent,
    detectDirectiveIntent,
    detectKnowledgeDomain,
    confidenceBand,
    domainSignalCandidates,
    detectBackendTechnicalContext,
    detectCreativeCognitiveCarryContext,
    normalizeKnowledgeDomainName,
    operationalDomainForKnowledge,
    registryKnowledgeRoute,
    registryKnowledgeWiring,
    registryKnowledgeConfig,
    isKnowledgeDomainActivationRequest,
    domainTestPhrase,
    buildRouting,
    normalizeRouterVoiceTextParity,
    normalizeInputSource,
    canonicalTechnicalTargetFromText,
    isTechnicalFollowUpIntent,
    isInfrastructureContinuityPrompt,
    turnContinuityHash,
    routerForensicNormalizationStatus
  }
};
