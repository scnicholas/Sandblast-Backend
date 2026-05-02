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

const VERSION = "marionDomainRegistry v1.2.0 KNOWLEDGE-DOMAIN-RUNTIME-SPLIT-GATE";

const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";
const FINAL_ENVELOPE_CONTRACT = "nyx.marion.final/1.0";
const CANONICAL_ENDPOINT = "marion://routeMarion.primary";

const fs = require("fs");
const path = require("path");

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


const KNOWLEDGE_DOMAIN_ORDER = Object.freeze(["psychology", "english", "ai", "cyber", "law", "finance"]);

const KNOWLEDGE_DOMAIN_DEFS = Object.freeze({
  psychology: Object.freeze({
    domain: "psychology",
    label: "Psychology",
    userFacingLabel: "psychology",
    capability: "Psychology-aware affect interpretation, cognitive patterns, attachment signals, crisis flags, support strategies, and trauma-sensitive response shaping.",
    examples: Object.freeze(["I feel overwhelmed.", "Help me understand this emotional pattern.", "What support mode fits this state?"]),
    mode: "psychology_safety_first",
    depth: "high",
    preferredStyle: "stabilize_then_clarify",
    useMemory: true,
    useDomainKnowledge: true,
    exposeToUser: true,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT,
    safetyGate: "clinical_safety_first",
    manifestFolder: "psychology",
    dataFolder: "psychology",
    utilFile: "psychologyKnowledge.js"
  }),
  english: Object.freeze({
    domain: "english",
    label: "English",
    userFacingLabel: "English language",
    capability: "Language fluency, grammar, register, clarity, academic writing, phonology, morphology, semantics, and pragmatic response shaping.",
    examples: Object.freeze(["Make this sound polished.", "Improve the tone.", "Explain the grammar." ]),
    mode: "language_fluency",
    depth: "balanced",
    preferredStyle: "clear_fluent",
    useMemory: false,
    useDomainKnowledge: true,
    exposeToUser: true,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT,
    safetyGate: "none",
    manifestFolder: "english",
    dataFolder: "english",
    utilFile: "englishKnowledge.js"
  }),
  ai: Object.freeze({
    domain: "ai",
    label: "Artificial Intelligence",
    userFacingLabel: "AI",
    capability: "AI foundations, agents, orchestration, RAG, governance, AI security, human factors, marketing applications, and case-study reasoning.",
    examples: Object.freeze(["Design an AI agent.", "Explain RAG.", "Audit the AI routing layer." ]),
    mode: "ai_architecture_reasoning",
    depth: "technical",
    preferredStyle: "implementation_grade",
    useMemory: true,
    useDomainKnowledge: true,
    exposeToUser: true,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT,
    safetyGate: "non_advice_defensive_privacy",
    manifestFolder: "ai",
    dataFolder: "ai",
    utilFile: "aiKnowledge.js"
  }),
  cyber: Object.freeze({
    domain: "cyber",
    label: "Cybersecurity",
    userFacingLabel: "cybersecurity",
    capability: "Defensive-only cybersecurity posture, source ladder routing, identity/access, endpoint/cloud, network/web, privacy, incident response, and culture guidance.",
    examples: Object.freeze(["Harden this system.", "Check incident response posture.", "Review access-control risk." ]),
    mode: "defensive_cybersecurity",
    depth: "risk_aware",
    preferredStyle: "defensive_precise",
    useMemory: false,
    useDomainKnowledge: true,
    exposeToUser: true,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT,
    safetyGate: "defensive_only",
    manifestFolder: "cyber",
    dataFolder: "cyber",
    utilFile: "cyberKnowledge.js"
  }),
  law: Object.freeze({
    domain: "law",
    label: "Law",
    userFacingLabel: "law",
    capability: "Canada-first legal education, source-ladder routing, research methods, foundations, contracts, torts, criminal law, and constitutional/Charter concepts.",
    examples: Object.freeze(["Explain the legal framework.", "How should I research this law issue?", "What source level should I use?" ]),
    mode: "educational_legal_research",
    depth: "source_ladder",
    preferredStyle: "jurisdiction_clear",
    useMemory: false,
    useDomainKnowledge: true,
    exposeToUser: true,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT,
    safetyGate: "educational_no_legal_advice",
    manifestFolder: "law",
    dataFolder: "law",
    utilFile: "lawKnowledge.js"
  }),
  finance: Object.freeze({
    domain: "finance",
    label: "Finance",
    userFacingLabel: "finance",
    capability: "Finance education, micro/macro principles, unit economics, pricing models, capital markets, risk management, policy links, and scenario-based reasoning.",
    examples: Object.freeze(["Analyze unit economics.", "Explain pricing tradeoffs.", "Build a scenario model." ]),
    mode: "scenario_finance_reasoning",
    depth: "analytical",
    preferredStyle: "assumption_disclosed",
    useMemory: false,
    useDomainKnowledge: true,
    exposeToUser: true,
    requiresFinalEnvelope: true,
    endpoint: CANONICAL_ENDPOINT,
    safetyGate: "educational_no_investment_advice",
    manifestFolder: "finance",
    dataFolder: "finance",
    utilFile: "financeKnowledge.js"
  })
});

const KNOWLEDGE_DOMAIN_ALIASES = Object.freeze({
  artificial_intelligence: "ai", machine_learning: "ai", ml: "ai", llm: "ai", rag: "ai", agent: "ai", agents: "ai",
  cybersecurity: "cyber", security: "cyber", infosec: "cyber", defensive_security: "cyber",
  legal: "law", canada_law: "law", canadian_law: "law",
  economics: "finance", financial: "finance", pricing: "finance", capital_markets: "finance",
  grammar: "english", language: "english", writing: "english", linguistics: "english",
  emotional: "psychology", psychology_support: "psychology", mental_model: "psychology"
});

const PROJECT_ROOT_CANDIDATES = Object.freeze([
  process.env.NYX_BACKEND_ROOT,
  process.cwd(),
  path.resolve(__dirname),
  path.resolve(__dirname, "..")
].filter(Boolean));

function pathExists(filePath) {
  try { return !!(filePath && fs.existsSync(filePath)); } catch (_err) { return false; }
}

function dirExists(filePath) {
  try { return !!(filePath && fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()); } catch (_err) { return false; }
}

function fileExists(filePath) {
  try { return !!(filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()); } catch (_err) { return false; }
}

function firstExisting(paths, fallback = "") {
  for (const p of Array.isArray(paths) ? paths : []) if (pathExists(p)) return p;
  return fallback || (Array.isArray(paths) && paths[0]) || "";
}

function resolveRuntimeRoots() {
  const roots = PROJECT_ROOT_CANDIDATES;
  const domainRootCandidates = [process.env.NYX_DOMAIN_ROOT];
  const dataRootCandidates = [process.env.NYX_DATA_ROOT];
  const utilsRootCandidates = [process.env.NYX_UTILS_ROOT];
  for (const root of roots) {
    domainRootCandidates.push(path.resolve(root, "domains"));
    dataRootCandidates.push(path.resolve(root, "Data"));
    dataRootCandidates.push(path.resolve(root, "data"));
    utilsRootCandidates.push(path.resolve(root, "Utils"));
    utilsRootCandidates.push(path.resolve(root, "utils"));
  }
  return {
    domainRoot: firstExisting(domainRootCandidates.filter(Boolean), path.resolve(process.cwd(), "domains")),
    dataRoot: firstExisting(dataRootCandidates.filter(Boolean), path.resolve(process.cwd(), "Data")),
    utilsRoot: firstExisting(utilsRootCandidates.filter(Boolean), path.resolve(process.cwd(), "Utils"))
  };
}

function resolveDomainPaths(domain) {
  const key = resolveKnowledgeDomainKey(domain);
  const def = KNOWLEDGE_DOMAIN_DEFS[key];
  const roots = resolveRuntimeRoots();
  const manifestPath = def ? path.join(roots.domainRoot, def.manifestFolder, "manifest.json") : "";
  const manifestNormalizedPath = def ? path.join(roots.domainRoot, def.manifestFolder, "manifest.normalized.json") : "";
  const dataPath = def ? path.join(roots.dataRoot, def.dataFolder) : "";
  const utilPath = def ? path.join(roots.utilsRoot, def.utilFile) : "";
  return {
    domain: key,
    domainRoot: roots.domainRoot,
    dataRoot: roots.dataRoot,
    utilsRoot: roots.utilsRoot,
    priorityManifestPath: path.join(roots.domainRoot, "domain_runtime_priority_manifest.normalized.json"),
    manifestPath: fileExists(manifestPath) ? manifestPath : manifestPath,
    manifestNormalizedPath,
    activeManifestPath: fileExists(manifestPath) ? manifestPath : (fileExists(manifestNormalizedPath) ? manifestNormalizedPath : manifestPath),
    dataPath,
    utilPath,
    exists: {
      priorityManifest: fileExists(path.join(roots.domainRoot, "domain_runtime_priority_manifest.normalized.json")),
      manifest: fileExists(manifestPath) || fileExists(manifestNormalizedPath),
      data: dirExists(dataPath),
      util: fileExists(utilPath)
    }
  };
}

function resolveKnowledgeDomainKey(value) {
  const raw = normalizeKey(value);
  if (!raw) return "";
  if (KNOWLEDGE_DOMAIN_DEFS[raw]) return raw;
  if (KNOWLEDGE_DOMAIN_ALIASES[raw] && KNOWLEDGE_DOMAIN_DEFS[KNOWLEDGE_DOMAIN_ALIASES[raw]]) return KNOWLEDGE_DOMAIN_ALIASES[raw];
  return "";
}

function getKnowledgeDomainConfig(domain) {
  const key = resolveKnowledgeDomainKey(domain);
  if (!key) return null;
  const config = cloneDomainConfig(KNOWLEDGE_DOMAIN_DEFS[key]);
  const paths = resolveDomainPaths(key);
  return {
    ...config,
    resolvedDomain: key,
    requestedDomain: safeStr(domain),
    registryVersion: VERSION,
    stateSpineSchema: STATE_SPINE_SCHEMA,
    stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    finalEnvelopeContract: FINAL_ENVELOPE_CONTRACT,
    supported: true,
    runtimeSplit: {
      manifestsInDomains: true,
      payloadsInData: true,
      utilsInUtils: true,
      domainRoot: paths.domainRoot,
      dataRoot: paths.dataRoot,
      utilsRoot: paths.utilsRoot,
      priorityManifestPath: paths.priorityManifestPath,
      manifestPath: paths.activeManifestPath,
      dataPath: paths.dataPath,
      utilPath: paths.utilPath,
      exists: paths.exists
    }
  };
}

function getDomainRuntimeHealth(domain) {
  const key = resolveKnowledgeDomainKey(domain);
  if (!key) return { ok: false, domain: safeStr(domain), reason: "unsupported_knowledge_domain" };
  const cfg = getKnowledgeDomainConfig(key);
  const exists = cfg.runtimeSplit.exists;
  return {
    ok: !!(exists.manifest && exists.data && exists.util),
    domain: key,
    safetyGate: cfg.safetyGate,
    manifestFound: !!exists.manifest,
    payloadFolderFound: !!exists.data,
    utilBridgeFound: !!exists.util,
    priorityManifestFound: !!exists.priorityManifest,
    paths: {
      manifest: cfg.runtimeSplit.manifestPath,
      data: cfg.runtimeSplit.dataPath,
      util: cfg.runtimeSplit.utilPath,
      priorityManifest: cfg.runtimeSplit.priorityManifestPath
    }
  };
}

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
  const knowledgeKey = resolveKnowledgeDomainKey(raw);
  if (knowledgeKey) return knowledgeKey;
  return MARION_DOMAINS[fallback] || KNOWLEDGE_DOMAIN_DEFS[fallback] ? fallback : "general_reasoning";
}

function getDomainConfig(domain, options = {}) {
  const opts = safeObj(options);
  const key = resolveDomainKey(domain, safeStr(opts.fallbackDomain || "general_reasoning"));
  const knowledgeConfig = getKnowledgeDomainConfig(key);
  if (knowledgeConfig) return knowledgeConfig;
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
  const knowledgeKey = resolveKnowledgeDomainKey(key);
  if (knowledgeKey) return knowledgeKey;
  return INTENT_TO_DOMAIN[key] || DOMAIN_ALIASES[key] || "general_reasoning";
}

function getDomainConfigForIntent(intent, options = {}) {
  return getDomainConfig(getDomainForIntent(intent), options);
}

function isSupportedDomain(domain) {
  const key = normalizeKey(domain);
  return !!(key && (MARION_DOMAINS[key] || (DOMAIN_ALIASES[key] && MARION_DOMAINS[DOMAIN_ALIASES[key]]) || resolveKnowledgeDomainKey(key)));
}

function listDomains(options = {}) {
  const opts = safeObj(options);
  const includeHidden = opts.includeHidden === true;
  const staticDomains = Object.keys(MARION_DOMAINS).map((key) => cloneDomainConfig(MARION_DOMAINS[key]));
  const knowledgeDomains = KNOWLEDGE_DOMAIN_ORDER.map((key) => getKnowledgeDomainConfig(key)).filter(Boolean);
  return [...staticDomains, ...knowledgeDomains]
    .filter((cfg) => includeHidden || cfg.exposeToUser !== false);
}

function getCapabilityIntro() {
  const labels = listDomains()
    .map((cfg) => safeStr(cfg.userFacingLabel || cfg.label))
    .filter(Boolean);

  const preferredOrder = ["chat", "psychology", "English language", "AI", "cybersecurity", "law", "finance", "media and radio", "News Canada", "Roku", "backend diagnostics", "business strategy", "reasoning"];
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
    safetyGate: safeStr(config.safetyGate || "none"),
    runtimeSplit: safeObj(config.runtimeSplit),
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
  const knowledgeHealth = KNOWLEDGE_DOMAIN_ORDER.map((domain) => getDomainRuntimeHealth(domain));
  return {
    ok: missing.length === 0,
    version: VERSION,
    domainCount: keys.length + KNOWLEDGE_DOMAIN_ORDER.length,
    domains: [...keys, ...KNOWLEDGE_DOMAIN_ORDER],
    knowledgeDomainOrder: KNOWLEDGE_DOMAIN_ORDER,
    knowledgeDomains: knowledgeHealth,
    splitArchitecture: {
      manifestsRoot: resolveRuntimeRoots().domainRoot,
      dataRoot: resolveRuntimeRoots().dataRoot,
      utilsRoot: resolveRuntimeRoots().utilsRoot,
      manifestsInDomains: true,
      payloadsInData: true,
      utilsInUtils: true
    },
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
  KNOWLEDGE_DOMAIN_ORDER,
  KNOWLEDGE_DOMAIN_DEFS,
  resolveRuntimeRoots,
  resolveDomainPaths,
  getDomainRuntimeHealth,
  getKnowledgeDomainConfig,
  _internal: {
    safeStr,
    normalizeKey,
    resolveDomainKey,
    resolveKnowledgeDomainKey,
    cloneDomainConfig
  }
};
