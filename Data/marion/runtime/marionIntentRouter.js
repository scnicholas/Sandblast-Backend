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

const VERSION = "marionIntentRouter v2.6.0 KNOWLEDGE-DOMAIN-LANE-GATE";

const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";
const INTENT_CONTRACT_VERSION = "nyx.marion.intent/2.6";
const CANONICAL_ENDPOINT = "marion://routeMarion.primary";

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
  general_reasoning: "reasoning"
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
  general_reasoning: "baseline_cognition"
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
  general_reasoning: "reasoned_direct"
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

  return compactWhitespace(
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
  );
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
  if (intent === "news_query") return "news_retrieval";
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


const KNOWLEDGE_DOMAIN_PRIORITY = Object.freeze(["psychology", "english", "ai", "cyber", "law", "finance"]);

const KNOWLEDGE_DOMAIN_PATTERNS = Object.freeze({
  psychology: /\b(psychology|cognitive distortion|cognitive distortions|attachment|trauma|trauma[- ]?sensitive|affect|overwhelm|spiraling|panic|shame|shutdown|support strategy|crisis flag|emotional pattern|mental model)\b/i,
  english: /\b(grammar|syntax|semantics|pragmatics|phonology|phonetics|morphology|english|writing clarity|academic writing|register|make this sound|polish this|language flow|word formation)\b/i,
  ai: /\b(artificial intelligence|\bai\b|machine learning|\bml\b|llm|rag|embedding|agent|agents|multi[- ]?agent|orchestration|prompt|model training|inference|alignment|ai governance)\b/i,
  cyber: /\b(cyber|cybersecurity|infosec|security posture|defensive security|incident response|breach|ransomware|phishing|mfa|iam|endpoint|cloud security|network security|prompt injection|data poisoning)\b/i,
  law: /\b(law|legal|statute|regulation|case law|precedent|contract|contracts|tort|torts|criminal law|charter|constitutional|jurisdiction|legal research|legal memo)\b/i,
  finance: /\b(finance|financial|economics|microeconomics|macroeconomics|pricing|unit economics|ltv|cac|payback|capital markets|runway|valuation|risk management|liquidity|interest rates|inflation)\b/i
});

function detectKnowledgeDomain(text) {
  const t = lower(text);
  if (!t) return "";
  const scores = [];
  for (const domain of KNOWLEDGE_DOMAIN_PRIORITY) {
    const rx = KNOWLEDGE_DOMAIN_PATTERNS[domain];
    rx.lastIndex = 0;
    const hit = rx.test(t);
    if (!hit) continue;
    let score = 1;
    if (domain === "psychology" && detectSafetyLevel(t) !== "none") score += 10;
    if (domain === "english" && /\b(make this sound|polish|rewrite|grammar|tone|clarity)\b/i.test(t)) score += 3;
    if (domain === "cyber" && /\b(defensive|incident|breach|phishing|ransomware|mfa|iam)\b/i.test(t)) score += 3;
    if (domain === "law" && /\b(jurisdiction|case law|statute|legal research|legal advice)\b/i.test(t)) score += 3;
    if (domain === "finance" && /\b(unit economics|ltv|cac|pricing|valuation|runway)\b/i.test(t)) score += 3;
    if (domain === "ai" && /\b(agent|rag|llm|embedding|orchestration|prompt)\b/i.test(t)) score += 3;
    scores.push({ domain, score });
  }
  scores.sort((a, b) => b.score - a.score || KNOWLEDGE_DOMAIN_PRIORITY.indexOf(a.domain) - KNOWLEDGE_DOMAIN_PRIORITY.indexOf(b.domain));
  return scores[0] ? scores[0].domain : "";
}

function intentForKnowledgeDomain(domain, text, safetyLevel = "none") {
  if (domain === "psychology" && safetyLevel !== "none") return "emotional_support";
  return domain ? "domain_question" : "";
}

function knowledgeDomainSubIntent(domain, text) {
  const t = lower(text);
  if (domain === "psychology") {
    if (detectSafetyLevel(t) === "crisis") return "psychology_crisis_safety";
    if (/\b(overwhelm|spiral|panic|shutdown|shame|attachment|trauma)\b/i.test(t)) return "psychology_support_routing";
    return "psychology_knowledge";
  }
  if (domain === "english") return /\b(make this sound|polish|rewrite|clarity|tone)\b/i.test(t) ? "english_fluency_shaping" : "english_knowledge";
  if (domain === "cyber") return "cyber_defensive_only";
  if (domain === "law") return "law_educational_research";
  if (domain === "finance") return "finance_scenario_reasoning";
  if (domain === "ai") return "ai_architecture_reasoning";
  return "knowledge_domain";
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

  /* Safety must outrank all other classes. */
  if (safetyLevel === "crisis") {
    return {
      intent: "emotional_support",
      confidence: 0.98,
      reason: "crisis_distress_terms",
      stateStageHint: "recovery",
      safetyLevel,
      recoveryRequired: true
    };
  }

  if (safetyLevel === "distress") {
    return {
      intent: "emotional_support",
      confidence: 0.89,
      reason: "emotional_distress_terms",
      stateStageHint: "recovery",
      safetyLevel,
      recoveryRequired: true
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
      recoveryRequired: false
    };
  }

  if (detectContextualDirectiveIntent(t)) {
    return {
      intent: "contextual_directive",
      confidence: 0.93,
      reason: "contextual_directive_terms",
      stateStageHint: "execute_context",
      safetyLevel,
      recoveryRequired: false
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
      recoveryRequired: false
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
      recoveryRequired: false
    };
  }

  if (has(/\b(remember|last time|continue|memory|conversation state|turn state|continuity|state spine|statespine|who am i)\b/i, t)) {
    return {
      intent: "identity_or_memory",
      confidence: 0.82,
      reason: "memory_continuity_terms",
      stateStageHint: "continuity",
      safetyLevel,
      recoveryRequired: false
    };
  }

  if (detectContextualDirectiveIntent(t)) {
    return {
      intent: "contextual_directive",
      confidence: 0.93,
      reason: "contextual_directive_terms",
      stateStageHint: "execute_context",
      safetyLevel,
      recoveryRequired: false
    };
  }

  const knowledgeDomain = detectKnowledgeDomain(t);
  if (knowledgeDomain) {
    const knowledgeIntent = intentForKnowledgeDomain(knowledgeDomain, t, safetyLevel);
    return {
      intent: knowledgeIntent,
      confidence: knowledgeDomain === "psychology" ? 0.94 : 0.88,
      reason: `${knowledgeDomain}_knowledge_domain_terms`,
      stateStageHint: knowledgeIntent === "emotional_support" ? "recovery" : "reason",
      safetyLevel,
      recoveryRequired: knowledgeIntent === "emotional_support",
      knowledgeDomain
    };
  }

  if (has(/\b(index\.js|marionbridge|marion bridge|intent router|manual intent router|normalizer|packet|packets|phrase pack|phrase packs|compose|composer|composemarionresponse|state spine|statespine|state-spine|autopsy|audit|gap refinement|line[- ]?by[- ]?line|syntax|debug|bug|loop|looping|route|endpoint|api\/chat|backend diagnostics|diagnostics route|health check|final envelope|contract|authority gate|script|file|harden|critical fix|critical fixes|download|zip|integration|cohesion|cohesive|90%|ninety percent|baseline cognition)\b/i, t)) {
    return {
      intent: "technical_debug",
      confidence: 0.92,
      reason: "technical_debug_or_cohesion_terms",
      stateStageHint: "execution",
      safetyLevel,
      recoveryRequired: false
    };
  }

  if (has(/\b(avatar|tts|speech|voice route|voice ready|avatar controls|micro[- ]?expression|head and shoulders)\b/i, t)) {
    return {
      intent: "technical_debug",
      confidence: 0.82,
      reason: "avatar_voice_technical_terms",
      stateStageHint: "execution",
      safetyLevel,
      recoveryRequired: false
    };
  }

  if (has(/\b(top\s*10|song|songs|artist|album|chart|playlist|music|radio|billboard|year|decade|70s|80s|90s|2000s|adult contemporary)\b/i, t)) {
    return {
      intent: "music_query",
      confidence: 0.84,
      reason: "music_terms",
      stateStageHint: "retrieve",
      safetyLevel,
      recoveryRequired: false
    };
  }

  if (has(/\b(news|headline|headlines|article|story|stories|rss|newscanada|for your life|feed)\b/i, t)) {
    return {
      intent: "news_query",
      confidence: 0.84,
      reason: "news_terms",
      stateStageHint: "retrieve",
      safetyLevel,
      recoveryRequired: false
    };
  }

  if (has(/\b(roku|tv app|linear tv|streaming|channel app|ott)\b/i, t)) {
    return {
      intent: "roku_query",
      confidence: 0.84,
      reason: "roku_terms",
      stateStageHint: "deliver",
      safetyLevel,
      recoveryRequired: false
    };
  }

  if (has(/\b(price|pricing|sponsor|sponsorship|media kit|monetize|monetization|pitch|funding|investor|sales|proposal|revenue|business|startup|advertising|ad template|audience|brand awareness|commercial positioning)\b/i, t)) {
    return {
      intent: "business_strategy",
      confidence: 0.84,
      reason: "business_terms",
      stateStageHint: "strategy",
      safetyLevel,
      recoveryRequired: false
    };
  }

  if (has(/(^|\s)(how|what|why|where|when|can you|could you|should i|would it|is it|are we|explain|analyze|break down)\b|\?$/i, t)) {
    return {
      intent: "domain_question",
      confidence: t.length > 60 ? 0.7 : 0.6,
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
  const src = safeObj(rawInput);
  const inferred = inferIntentFromText(fallbackText);
  const explicit = normalizeIntentName(src.intent || src.type || src.name || "");

  let intent = explicit && explicit !== "simple_chat" ? explicit : inferred.intent;
  let confidence = clamp01(src.confidence, inferred.confidence);
  let reason = safeStr(src.reason || src.source || inferred.reason);
  let stateStageHint = safeStr(src.stateStageHint || src.stage || inferred.stateStageHint || "deliver");
  let safetyLevel = safeStr(src.safetyLevel || inferred.safetyLevel || "none");
  let recoveryRequired = Boolean(src.recoveryRequired || inferred.recoveryRequired);
  let knowledgeDomain = safeStr(src.knowledgeDomain || src.domainLane || src.primaryDomain || inferred.knowledgeDomain || detectKnowledgeDomain(fallbackText));

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

  const subIntent = safeStr(src.subIntent || src.subintent || (knowledgeDomain ? knowledgeDomainSubIntent(knowledgeDomain, fallbackText) : detectSubIntent(fallbackText, intent)));

  return {
    activate: intent !== "simple_chat",
    intent,
    subIntent,
    confidence,
    reason,
    stateStageHint,
    safetyLevel,
    knowledgeDomain,
    primaryDomain: knowledgeDomain || (INTENT_TO_DOMAIN[intent] || "general_reasoning"),
    recoveryRequired,
    loopSafe: true,
    allowGenericFallback: false,
    requiresFinalEnvelope: true,
    requiresComposer: true,
    identityAnchorRequired: subIntent === "identity_baseline",
    baselineCognitionRequired: intent === "domain_question" || intent === "directive_response" || !!knowledgeDomain || subIntent === "baseline_reasoning" || subIntent === "cohesion_upgrade" || subIntent === "identity_baseline",
    directiveExecutionRequired: intent === "directive_response",
    source: safeStr(src.source || "marionIntentRouter")
  };
}

function buildRouting(marionIntent) {
  const domain = marionIntent.knowledgeDomain || marionIntent.primaryDomain || INTENT_TO_DOMAIN[marionIntent.intent] || "general_reasoning";
  const style = PREFERRED_STYLE[domain] || (marionIntent.knowledgeDomain ? "knowledge_grounded" : "direct");

  return {
    domain,
    knowledgeDomain: marionIntent.knowledgeDomain || "",
    primaryDomain: marionIntent.primaryDomain || domain,
    intent: marionIntent.intent,
    subIntent: marionIntent.subIntent,
    endpoint: CANONICAL_ENDPOINT,
    contractVersion: INTENT_CONTRACT_VERSION,
    expectsComposer: "composeMarionResponse",
    expectedComposerContract: "finalEnvelope.reply.required",
    stateSpineSchema: STATE_SPINE_SCHEMA,
    stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    stateStageHint: marionIntent.stateStageHint,
    mode: DOMAIN_MODE[domain] || "conversation",
    depth: DOMAIN_DEPTH[domain] || "normal",
    cognitiveMode: marionIntent.directiveExecutionRequired ? "directive_execution" : (marionIntent.baselineCognitionRequired ? "baseline_cognition" : DOMAIN_MODE[domain] || "conversation"),
    useMemory: domain === "memory" || domain === "identity" || domain === "emotional" || domain === "psychology" || marionIntent.subIntent === "identity_baseline",
    useDomainKnowledge: domain !== "general" || !!marionIntent.knowledgeDomain,
    requireFreshComposerEnvelope: true,
    requiresFinalEnvelope: true,
    requiresHotFallback: false,
    directiveExecutionRequired: !!marionIntent.directiveExecutionRequired,
    blockRepeatedBridgeFallback: true,
    recoveryRequired: marionIntent.recoveryRequired,
    safetyLevel: marionIntent.safetyLevel,
    safetyGate: domain === "cyber" ? "defensive_only" : domain === "law" ? "educational_no_legal_advice" : domain === "finance" ? "educational_no_investment_advice" : domain === "psychology" ? "clinical_safety_first" : "none",
    identityAnchorRequired: !!marionIntent.identityAnchorRequired,
    baselineCognitionRequired: !!marionIntent.baselineCognitionRequired,
    preferredStyle: style,
    cohesion: {
      targetPercent: 90,
      bridgeCompatible: true,
      composerCompatible: true,
      stateSpineCompatible: true,
      finalEnvelopeRequired: true,
      directiveExecutionRequired: !!marionIntent.directiveExecutionRequired,
      noDiagnosticUserSurface: true
    }
  };
}

function routeMarionIntent(packet = {}) {
  const text = extractText(packet);
  const src = safeObj(packet);
  const existingIntent = extractExistingIntent(src);

  const marionIntent = normalizeIntent(existingIntent, text);
  const routing = buildRouting(marionIntent);

  return {
    ok: true,
    final: false,
    routerVersion: VERSION,
    stateSpineSchema: STATE_SPINE_SCHEMA,
    stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    intentContractVersion: INTENT_CONTRACT_VERSION,
    marionIntent,
    routing,
    meta: {
      routedAt: new Date().toISOString(),
      confidence: marionIntent.confidence,
      knowledgeDomain: marionIntent.knowledgeDomain || "",
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
      directiveExecutionRequired: !!marionIntent.directiveExecutionRequired,
      noUserFacingDiagnostics: true
    }
  };
}

module.exports = {
  VERSION,
  STATE_SPINE_SCHEMA,
  STATE_SPINE_SCHEMA_COMPAT,
  INTENT_CONTRACT_VERSION,
  CANONICAL_ENDPOINT,
  VALID_INTENTS,
  INTENT_TO_DOMAIN,
  normalizeIntentName,
  inferIntentFromText,
  detectDirectiveIntent,
  normalizeIntent,
  routeMarionIntent,
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
    knowledgeDomainSubIntent,
    intentForKnowledgeDomain,
    buildRouting
  }
};
