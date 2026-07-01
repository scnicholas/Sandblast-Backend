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

const fs = require("fs");
const path = require("path");
const domainConfidenceMod = (() => { try { return require("./domainConfidence.js"); } catch (_) { return null; } })();

const VERSION = "marionDomainRegistry v1.7.0 PRIORITY2-DOMAIN-COHESION-HARDENING + TECHNICAL-AUDIT-ALIAS-REPAIR + TALON-ALIAS-COMPAT + SIX-DOMAIN-AUTHORITY-MAP + DOMAIN-CONFIDENCE-SCORING-HARDLOCK + DOMAIN-CONFIDENCE-AUTHORITY + PIPELINE-FORENSIC-NORMALIZATION + PATH-CACHE-STATE-CREATIVE-COMPAT-HARDENED";
const DOMAIN_CONFIDENCE_VERSION = "nyx.marion.domainConfidence/1.1";
const PIPELINE_FORENSIC_NORMALIZATION_VERSION = "pipeline.forensicNormalization/1.0";

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
  command_routing: "technical",
  command_router: "technical",
  command_normalizer: "technical",
  marion_command_normalizer: "technical",
  guardian_pipeline: "technical",
  guardian_pipeline_router: "technical",
  guardian_pipelinerouter: "technical",
  domain_concierge: "technical",
  domainconcierge: "technical",
  domain_retriever: "technical",
  domainretriever: "technical",
  marion_domain_registry: "technical",
  mariondomainregistry: "technical",
  ethical_gatekeeper: "technical",
  marion_ethical_gatekeeper: "technical",
  protective_escalation: "technical",
  defensive_boundary: "technical",
  intent_justifier: "technical",
  aster: "technical",
  talon: "technical",
  thalon: "technical",
  autopsy: "technical",
  surgical_autopsy: "technical",
  audit: "technical",
  compose_marion_response: "technical",
  composed_marion_response: "technical",
  compose_marian_response: "technical",
  composed_marian_response: "technical",
  compose_mailing_response: "technical",

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
  business_auditing: "business",
  business_audit: "business",
  digital_transformation: "business",
  organizational_intelligence: "business",

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
  context: "execution_context",

  psychology: "psychology",
  english: "english",
  ai: "ai",
  artificial_intelligence: "ai",
  cyber: "cyber",
  cybersecurity: "cyber",
  law: "law",
  legal: "law",
  finance: "finance",
  financial: "finance",
  cash_flow: "finance",
  cashflow: "finance",
  cognitive: "psychology",
  cognition: "psychology",
  machine_learning: "ai",
  ml: "ai",
  syntax: "english",
  phishing: "cyber",
  least_privilege: "cyber",
  consideration: "law",
  contract_law: "law"
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
    capability: "Autopsy, line-by-line audit, command routing checks, Guardian pipeline routing, Domain Concierge cohesion, domain registry/retriever alignment, widget/backend cohesion, avatar controls, voice/TTS checks, ethical-boundary policy routing, and final-envelope debugging.",
    examples: Object.freeze(["Audit the bridge.", "Check the widget route.", "Harden Priority-2 command routing.", "Validate Guardian pipeline boundaries.", "Test avatar or voice health."]),
    mode: "forensic_autopsy",
    depth: "forensic",
    preferredStyle: "autopsy_then_fix",
    priorityTwoRuntimeAuthority: true,
    protectionBoundaryRoutingAware: true,
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


const SIX_KNOWLEDGE_DOMAINS = Object.freeze(["psychology", "english", "ai", "cyber", "law", "finance"]);
const KNOWLEDGE_DOMAIN_PRIORITY = Object.freeze([
  "psychology",
  "english",
  "ai",
  "cyber",
  "law",
  "finance"
]);

const KNOWLEDGE_DOMAINS = Object.freeze({
  psychology: Object.freeze({
    domain: "psychology",
    operationalDomain: "emotional",
    label: "Psychology",
    userFacingLabel: "psychology",
    capability: "Affect interpretation, stabilization, attachment patterns, cognitive distortions, crisis flags, support strategies, and trauma-sensitive pacing.",
    mode: "safety_first_psychology",
    depth: "high",
    preferredStyle: "contain_then_clarify",
    safetyFirst: true,
    useDomainKnowledge: true,
    requiresFinalEnvelope: true,
    dataRootHint: "Data/psychology",
    manifestHint: "domains/psychology/manifest.json"
  }),
  english: Object.freeze({
    domain: "english",
    operationalDomain: "general_reasoning",
    label: "English",
    userFacingLabel: "English language",
    capability: "Grammar, syntax, register, clarity, tone, professional revision, language flow, and polished expression.",
    mode: "language_fluency",
    depth: "balanced",
    preferredStyle: "clear_polished",
    safetyFirst: false,
    useDomainKnowledge: true,
    requiresFinalEnvelope: true,
    dataRootHint: "Data/english",
    manifestHint: "domains/english/manifest.json"
  }),
  ai: Object.freeze({
    domain: "ai",
    operationalDomain: "general_reasoning",
    label: "Artificial Intelligence",
    userFacingLabel: "AI",
    capability: "AI systems, agents, orchestration, RAG, governance, applied AI, and AI architecture reasoning.",
    mode: "ai_architecture_reasoning",
    depth: "forensic",
    preferredStyle: "implementation_grade",
    safetyFirst: false,
    useDomainKnowledge: true,
    requiresFinalEnvelope: true,
    dataRootHint: "Data/ai",
    manifestHint: "domains/ai/manifest.json"
  }),
  cyber: Object.freeze({
    domain: "cyber",
    operationalDomain: "general_reasoning",
    label: "Cybersecurity",
    userFacingLabel: "cybersecurity",
    capability: "Defensive cybersecurity, hardening, incident response, identity access, privacy, cloud, network, and web security posture.",
    mode: "defensive_cybersecurity",
    depth: "forensic",
    preferredStyle: "defensive_only",
    safetyFirst: true,
    defensiveOnly: true,
    useDomainKnowledge: true,
    requiresFinalEnvelope: true,
    dataRootHint: "Data/cyber",
    manifestHint: "domains/cyber/manifest.json"
  }),
  law: Object.freeze({
    domain: "law",
    operationalDomain: "general_reasoning",
    label: "Law",
    userFacingLabel: "Canadian law information",
    capability: "Educational Canadian legal information, source ladders, research posture, and jurisdiction-aware explanation without legal advice.",
    mode: "educational_law_information",
    depth: "balanced",
    preferredStyle: "jurisdiction_aware",
    safetyFirst: true,
    noLegalAdvice: true,
    useDomainKnowledge: true,
    requiresFinalEnvelope: true,
    dataRootHint: "Data/law",
    manifestHint: "domains/law/manifest.json"
  }),
  finance: Object.freeze({
    domain: "finance",
    operationalDomain: "general_reasoning",
    label: "Finance",
    userFacingLabel: "finance",
    capability: "Scenario-based finance, pricing, unit economics, capital markets, risk, policy links, and assumption-disclosed business economics.",
    mode: "scenario_finance_reasoning",
    depth: "balanced",
    preferredStyle: "assumption_disclosed",
    safetyFirst: true,
    noInvestmentAdvice: true,
    useDomainKnowledge: true,
    requiresFinalEnvelope: true,
    dataRootHint: "Data/finance",
    manifestHint: "domains/finance/manifest.json"
  })
});

const DOMAIN_FILE_CANDIDATES = Object.freeze({
  psychology: Object.freeze({
    manifests: Object.freeze(["Data/Domains/psychology/manifest.json", "Data/Domains/Psychology/manifest.json", "domains/psychology/manifest.json", "domains/psychology/psychology.manifest.json", "domains/psychology.json", "Data/psychology/manifest.json", "Data/psychology/psychology.manifest.json", "Data/marion/domains/psychology/manifest.json", "Data/marion/knowledge/psychology/manifest.json"]),
    roots: Object.freeze(["Data/Domains/psychology", "Data/Domains/Psychology", "Data/psychology", "Data/Psychology", "Data/Emotion", "Data/Emotions", "domains/psychology", "Data/marion/domains/psychology", "Data/marion/knowledge/psychology"]),
    packs: Object.freeze(["Data/Domains/psychology/psychology.json", "Data/Domains/psychology/knowledge.json", "Data/Domains/psychology/domain.json", "Data/Domains/psychology/pack.json", "Data/psychology/psychology.json", "Data/psychology/knowledge.json", "Data/psychology/domain.json", "Data/psychology/pack.json", "domains/psychology/knowledge.json", "domains/psychology/domain.json", "Data/marion/knowledge/psychology.json"])
  }),
  english: Object.freeze({
    manifests: Object.freeze(["Data/Domains/english/manifest.json", "Data/Domains/English/manifest.json", "domains/english/manifest.json", "domains/english/english.manifest.json", "domains/english.json", "Data/english/manifest.json", "Data/English/manifest.json", "Data/marion/domains/english/manifest.json", "Data/marion/knowledge/english/manifest.json"]),
    roots: Object.freeze(["Data/Domains/english", "Data/Domains/English", "domains/english", "Data/english", "Data/English", "Data/marion/domains/english", "Data/marion/knowledge/english"]),
    packs: Object.freeze(["Data/Domains/english/english.json", "Data/Domains/english/knowledge.json", "Data/Domains/english/domain.json", "Data/Domains/english/pack.json", "domains/english/knowledge.json", "domains/english/domain.json", "domains/english/pack.json", "Data/english/english.json", "Data/english/knowledge.json", "Data/marion/knowledge/english.json"])
  }),
  ai: Object.freeze({
    manifests: Object.freeze(["Data/Domains/ai/manifest.json", "Data/Domains/AI/manifest.json", "domains/ai/manifest.json", "domains/AI/manifest.json", "domains/ai/ai.manifest.json", "Data/ai/manifest.json", "Data/AI/manifest.json", "Data/marion/domains/ai/manifest.json", "Data/marion/knowledge/ai/manifest.json"]),
    roots: Object.freeze(["Data/Domains/ai", "Data/Domains/AI", "Data/ai", "Data/AI", "domains/ai", "domains/AI", "Data/marion/domains/ai", "Data/marion/knowledge/ai"]),
    packs: Object.freeze(["Data/Domains/ai/ai.json", "Data/Domains/ai/knowledge.json", "Data/Domains/ai/domain.json", "Data/Domains/AI/ai.json", "Data/Domains/AI/knowledge.json", "Data/ai/ai.json", "Data/ai/knowledge.json", "Data/ai/domain.json", "domains/ai/knowledge.json", "Data/marion/knowledge/ai.json"])
  }),
  cyber: Object.freeze({
    manifests: Object.freeze(["Data/Domains/Cyber/manifest.json", "Data/Domains/cyber/manifest.json", "domains/Cyber/manifest.json", "domains/cyber/manifest.json", "domains/cyber/cyber.manifest.json", "domains/cybersecurity/manifest.json", "Data/Cyber/manifest.json", "Data/cyber/manifest.json", "Data/cybersecurity/manifest.json", "Data/marion/domains/cyber/manifest.json", "Data/marion/knowledge/cyber/manifest.json"]),
    roots: Object.freeze(["Data/Domains/Cyber", "Data/Domains/cyber", "Data/Cyber", "Data/cyber", "Data/cybersecurity", "domains/Cyber", "domains/cyber", "domains/cybersecurity", "Data/marion/domains/cyber", "Data/marion/knowledge/cyber"]),
    packs: Object.freeze(["Data/Domains/Cyber/cyber.json", "Data/Domains/Cyber/knowledge.json", "Data/Domains/Cyber/domain.json", "Data/Domains/cyber/cyber.json", "Data/Domains/cyber/knowledge.json", "Data/cyber/cyber.json", "Data/cyber/knowledge.json", "Data/cyber/domain.json", "domains/cyber/knowledge.json", "Data/marion/knowledge/cyber.json"])
  }),
  law: Object.freeze({
    manifests: Object.freeze(["Data/Domains/law/manifest.json", "Data/Domains/Law/manifest.json", "domains/law/manifest.json", "domains/legal/manifest.json", "Data/law/manifest.json", "Data/Law/manifest.json", "Data/legal/manifest.json", "Data/marion/domains/law/manifest.json", "Data/marion/knowledge/law/manifest.json"]),
    roots: Object.freeze(["Data/Domains/law", "Data/Domains/Law", "Data/law", "Data/Law", "Data/legal", "domains/law", "domains/legal", "Data/marion/domains/law", "Data/marion/knowledge/law"]),
    packs: Object.freeze(["Data/Domains/law/law.json", "Data/Domains/law/knowledge.json", "Data/Domains/law/domain.json", "Data/law/law.json", "Data/law/knowledge.json", "Data/law/domain.json", "domains/law/knowledge.json", "Data/marion/knowledge/law.json"])
  }),
  finance: Object.freeze({
    manifests: Object.freeze(["Data/Domains/finance/manifest.json", "Data/Domains/Finance/manifest.json", "domains/finance/manifest.json", "domains/finance/finance.manifest.json", "Data/finance/manifest.json", "Data/Finance/manifest.json", "Data/marion/domains/finance/manifest.json", "Data/marion/knowledge/finance/manifest.json"]),
    roots: Object.freeze(["Data/Domains/finance", "Data/Domains/Finance", "Data/finance", "Data/Finance", "domains/finance", "Data/marion/domains/finance", "Data/marion/knowledge/finance"]),
    packs: Object.freeze(["Data/Domains/finance/finance.json", "Data/Domains/finance/knowledge.json", "Data/Domains/finance/domain.json", "Data/finance/finance.json", "Data/finance/knowledge.json", "Data/finance/domain.json", "domains/finance/knowledge.json", "Data/marion/knowledge/finance.json"])
  })
});

const FILE_CACHE = new Map();
const MAX_FILE_CACHE_ENTRIES = 96;
const MAX_JSON_FILE_BYTES = 2 * 1024 * 1024;
const MAX_LIST_JSON_FILES = 200;
const MAX_LIST_JSON_DEPTH = 6;
const BLOCKED_PATH_SEGMENTS = Object.freeze(["node_modules", ".git", "dist", "build", "coverage"]);
const CREATIVE_COGNITIVE_COMPAT_VERSION = "nyx.marion.creativeCognitiveCarry/1.0";

function safeStr(v) {
  return v == null ? "" : String(v).replace(/\s+/g, " ").trim();
}

function normalizeKey(value) {
  return safeStr(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function safeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueList(values) {
  return Array.from(new Set(safeArray(values).map(safeStr).filter(Boolean)));
}

function repoRootCandidates() {
  return uniqueList([
    process.cwd(),
    path.resolve(__dirname, "../../.."),
    path.resolve(__dirname, "../../../.."),
    path.resolve(__dirname, ".."),
    path.resolve(__dirname)
  ]).map((root) => path.resolve(root));
}

function isRemotePath(value) {
  return /^(https?:|file:|data:|javascript:|\\\\)/i.test(safeStr(value));
}

function hasBlockedPathSegment(value) {
  const parts = safeStr(value).replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.some((part) => BLOCKED_PATH_SEGMENTS.includes(part));
}

function isInsideRoot(file, root) {
  try {
    const resolvedFile = path.resolve(file);
    const resolvedRoot = path.resolve(root);
    const rel = path.relative(resolvedRoot, resolvedFile);
    return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
  } catch (_) {
    return false;
  }
}

function isInsideAnyRepoRoot(file) {
  return repoRootCandidates().some((root) => isInsideRoot(file, root));
}

function pruneFileCache() {
  while (FILE_CACHE.size > MAX_FILE_CACHE_ENTRIES) {
    const firstKey = FILE_CACHE.keys().next().value;
    if (!firstKey) break;
    FILE_CACHE.delete(firstKey);
  }
}

function toAbsolutePath(candidate) {
  const raw = safeStr(candidate);
  if (!raw || raw.indexOf("\0") !== -1 || isRemotePath(raw) || hasBlockedPathSegment(raw)) return "";
  const roots = repoRootCandidates();
  if (path.isAbsolute(raw)) {
    const absolute = path.normalize(raw);
    return isInsideAnyRepoRoot(absolute) ? absolute : "";
  }
  for (const root of roots) {
    const full = path.normalize(path.resolve(root, raw));
    if (!isInsideRoot(full, root)) continue;
    try { if (fs.existsSync(full)) return full; } catch (_) {}
  }
  const fallback = path.normalize(path.resolve(process.cwd(), raw));
  return isInsideAnyRepoRoot(fallback) ? fallback : "";
}

function relPath(fullPath) {
  const file = safeStr(fullPath);
  if (!file) return "";
  try { return path.relative(process.cwd(), file).replace(/\\/g, "/") || file.replace(/\\/g, "/"); } catch (_) { return file.replace(/\\/g, "/"); }
}

function fileExists(candidate) {
  try {
    const full = toAbsolutePath(candidate);
    return !!(full && fs.existsSync(full) && fs.statSync(full).isFile());
  } catch (_) { return false; }
}

function dirExists(candidate) {
  try {
    const full = toAbsolutePath(candidate);
    return !!(full && fs.existsSync(full) && fs.statSync(full).isDirectory());
  } catch (_) { return false; }
}

function readJsonFile(candidate, options = {}) {
  const opts = safeObj(options);
  const full = toAbsolutePath(candidate);
  if (!full) return { ok: false, path: "", error: "empty_path" };
  try {
    const stat = fs.statSync(full);
    if (!stat.isFile()) return { ok: false, path: relPath(full), error: "not_file" };
    const maxBytes = Number.isFinite(Number(opts.maxBytes)) ? Math.max(1, Math.min(Number(opts.maxBytes), MAX_JSON_FILE_BYTES)) : MAX_JSON_FILE_BYTES;
    if (stat.size > maxBytes) return { ok: false, path: relPath(full), error: "json_file_too_large", size: stat.size };
    const cacheKey = `${full}:${stat.mtimeMs}:${stat.size}`;
    if (FILE_CACHE.has(cacheKey)) return FILE_CACHE.get(cacheKey);
    const raw = fs.readFileSync(full, "utf8");
    const json = JSON.parse(raw);
    const result = { ok: true, path: relPath(full), absolutePath: full, size: stat.size, mtimeMs: stat.mtimeMs, data: json };
    FILE_CACHE.set(cacheKey, result);
    pruneFileCache();
    return result;
  } catch (err) {
    return { ok: false, path: relPath(full), error: safeStr(err && err.message || err) };
  }
}

function findFirstJson(candidates, options = {}) {
  const errors = [];
  for (const candidate of uniqueList(candidates)) {
    if (!fileExists(candidate)) continue;
    const loaded = readJsonFile(candidate, options);
    if (loaded.ok) return { ...loaded, errors };
    errors.push({ path: loaded.path || candidate, error: loaded.error });
  }
  return { ok: false, path: "", data: null, errors, error: errors.length ? "candidate_json_invalid" : "candidate_not_found" };
}

function listJsonFiles(rootCandidates, options = {}) {
  const opts = safeObj(options);
  const maxFiles = Number.isFinite(Number(opts.maxFiles)) ? Math.max(1, Math.min(MAX_LIST_JSON_FILES, Number(opts.maxFiles))) : 60;
  const maxDepth = Number.isFinite(Number(opts.maxDepth)) ? Math.max(0, Math.min(MAX_LIST_JSON_DEPTH, Number(opts.maxDepth))) : 4;
  const seen = new Set();
  const out = [];

  function walk(dir, depth) {
    if (out.length >= maxFiles || depth > maxDepth) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      if (out.length >= maxFiles) return;
      if (!entry || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (BLOCKED_PATH_SEGMENTS.includes(entry.name)) continue;
        walk(full, depth + 1);
      } else if (entry.isFile() && /\.json$/i.test(entry.name)) {
        const key = path.normalize(full).toLowerCase();
        if (!seen.has(key)) { seen.add(key); out.push(full); }
      }
    }
  }

  for (const root of uniqueList(rootCandidates)) {
    if (!dirExists(root)) continue;
    walk(toAbsolutePath(root), 0);
  }
  return out;
}


function basenameNoExt(value) {
  return path.basename(safeStr(value)).replace(/\.json$/i, "");
}

function candidateNearManifest(manifestPath, relativeValue) {
  const base = safeStr(relativeValue);
  const manifest = safeStr(manifestPath);
  if (!base || base.indexOf("\0") !== -1 || isRemotePath(base) || hasBlockedPathSegment(base)) return "";
  if (path.isAbsolute(base)) return toAbsolutePath(base);
  if (!manifest) return toAbsolutePath(base);
  const fullManifest = path.isAbsolute(manifest) ? toAbsolutePath(manifest) : toAbsolutePath(manifest);
  if (!fullManifest) return toAbsolutePath(base);
  const candidate = path.normalize(path.resolve(path.dirname(fullManifest), base));
  return isInsideAnyRepoRoot(candidate) ? candidate : "";
}

function manifestDeclaredPackCandidates(manifestResult = {}) {
  const out = [];
  const manifest = safeObj(manifestResult.data || manifestResult.manifest);
  const manifestPath = manifestResult.absolutePath || manifestResult.path || "";
  const keys = [
    "pack", "packPath", "packFile", "knowledgePack", "knowledgePackPath", "knowledgeFile",
    "data", "dataPath", "dataFile", "files", "dataFiles", "jsonFiles", "sources", "resources"
  ];

  function collect(value) {
    if (!value) return;
    if (typeof value === "string") {
      if (/\.json$/i.test(value)) out.push(candidateNearManifest(manifestPath, value));
      return;
    }
    if (Array.isArray(value)) { for (const item of value) collect(item); return; }
    if (typeof value === "object") {
      const obj = safeObj(value);
      const direct = obj.path || obj.file || obj.href || obj.src || obj.url;
      if (direct) collect(direct);
      for (const key of keys) if (Object.prototype.hasOwnProperty.call(obj, key)) collect(obj[key]);
    }
  }

  for (const key of keys) collect(manifest[key]);
  return uniqueList(out);
}

function compactJsonPreview(data, limit = 12) {
  const obj = safeObj(data);
  const keys = Object.keys(obj).slice(0, limit);
  return { type: Array.isArray(data) ? "array" : (data && typeof data === "object" ? "object" : typeof data), keys, itemCount: Array.isArray(data) ? data.length : undefined };
}

function getDomainFileCandidates(domain) {
  const key = resolveKnowledgeDomain(domain) || resolveDomainKey(domain, "general_reasoning");
  const configured = safeObj(DOMAIN_FILE_CANDIDATES[key]);
  const config = KNOWLEDGE_DOMAINS[key] || MARION_DOMAINS[key] || {};
  const generic = key ? {
    manifests: [`domains/${key}/manifest.json`, `Data/${key}/manifest.json`, `Data/marion/domains/${key}/manifest.json`, `Data/marion/knowledge/${key}/manifest.json`],
    roots: [`Data/${key}`, `domains/${key}`, `Data/marion/domains/${key}`, `Data/marion/knowledge/${key}`],
    packs: [`Data/${key}/${key}.json`, `Data/${key}/knowledge.json`, `Data/${key}/domain.json`, `domains/${key}/knowledge.json`, `Data/marion/knowledge/${key}.json`]
  } : { manifests: [], roots: [], packs: [] };
  return {
    manifests: uniqueList([...safeArray(configured.manifests), config.manifestHint, ...generic.manifests]),
    roots: uniqueList([...safeArray(configured.roots), config.dataRootHint, ...generic.roots]),
    packs: uniqueList([...safeArray(configured.packs), ...generic.packs])
  };
}

function cloneDomainConfig(config) {
  return JSON.parse(JSON.stringify(config || MARION_DOMAINS.general));
}

function resolveDomainKey(value, fallback = "general_reasoning") {
  const raw = normalizeKey(value);
  if (!raw) return normalizeKey(fallback) || "general_reasoning";
  if (MARION_DOMAINS[raw] || KNOWLEDGE_DOMAINS[raw]) return raw;
  if (DOMAIN_ALIASES[raw] && (MARION_DOMAINS[DOMAIN_ALIASES[raw]] || KNOWLEDGE_DOMAINS[DOMAIN_ALIASES[raw]])) return DOMAIN_ALIASES[raw];
  return MARION_DOMAINS[fallback] ? fallback : "general_reasoning";
}

function getDomainConfig(domain, options = {}) {
  const opts = safeObj(options);
  const key = resolveDomainKey(domain, safeStr(opts.fallbackDomain || "general_reasoning"));
  const sourceConfig = MARION_DOMAINS[key] || KNOWLEDGE_DOMAINS[key] || MARION_DOMAINS.general_reasoning;
  const config = cloneDomainConfig(sourceConfig);
  return {
    ...config,
    resolvedDomain: key,
    requestedDomain: safeStr(domain),
    registryVersion: VERSION,
  PIPELINE_FORENSIC_NORMALIZATION_VERSION,
  DOMAIN_CONFIDENCE_VERSION,
  getPipelineForensicNormalizationStatus,
    stateSpineSchema: STATE_SPINE_SCHEMA,
    stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    finalEnvelopeContract: FINAL_ENVELOPE_CONTRACT,
    supported: !!(MARION_DOMAINS[key] || KNOWLEDGE_DOMAINS[key]),
    isKnowledgeDomain: !!KNOWLEDGE_DOMAINS[key],
    operationalDomain: safeStr(sourceConfig.operationalDomain || key)
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
  return !!(key && (MARION_DOMAINS[key] || KNOWLEDGE_DOMAINS[key] || (DOMAIN_ALIASES[key] && (MARION_DOMAINS[DOMAIN_ALIASES[key]] || KNOWLEDGE_DOMAINS[DOMAIN_ALIASES[key]]))));
}

function listDomains(options = {}) {
  const opts = safeObj(options);
  const includeHidden = opts.includeHidden === true;
  const includeKnowledge = opts.includeKnowledge === true;
  const runtimeDomains = Object.keys(MARION_DOMAINS)
    .map((key) => ({ ...cloneDomainConfig(MARION_DOMAINS[key]), resolvedDomain: key, supported: true, isKnowledgeDomain: false }))
    .filter((cfg) => includeHidden || cfg.exposeToUser !== false);
  if (!includeKnowledge) return runtimeDomains;
  const knowledge = listKnowledgeDomains().map((cfg) => ({ ...cfg, supported: true, isKnowledgeDomain: true, exposeToUser: true }));
  return [...runtimeDomains, ...knowledge];
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
      noUnsupportedDomainLeak: true,
      priorityTwoRuntimeCompatible: true,
      stateSpineCompatible: true,
      creativeCognitiveCompatible: true,
      creativeCognitiveCompatVersion: CREATIVE_COGNITIVE_COMPAT_VERSION
    },
    stateBridge: {
      schema: STATE_SPINE_SCHEMA,
      compatibleSchema: STATE_SPINE_SCHEMA_COMPAT,
      registryVersion: VERSION,
      domain,
      useMemory: typeof o.useMemory === "boolean" ? o.useMemory : !!config.useMemory,
      useDomainKnowledge: typeof o.useDomainKnowledge === "boolean" ? o.useDomainKnowledge : !!config.useDomainKnowledge
    },
    creativeCognitive: {
      compatible: true,
      version: CREATIVE_COGNITIVE_COMPAT_VERSION,
      domain,
      preferredStyle: safeStr(o.preferredStyle || config.preferredStyle),
      depth: safeStr(o.depth || config.depth),
      suppressWhenUnsupported: true
    }
  };
}


function resolveKnowledgeDomain(value, fallback = "") {
  const raw = normalizeKey(value);
  const fb = normalizeKey(fallback);
  const alias = DOMAIN_ALIASES[raw] || raw;
  const fbAlias = DOMAIN_ALIASES[fb] || fb;
  if (alias && KNOWLEDGE_DOMAINS[alias]) return alias;
  if (!alias && fbAlias && KNOWLEDGE_DOMAINS[fbAlias]) return fbAlias;
  return "";
}

function getKnowledgeDomainConfig(domain, options = {}) {
  const opts = safeObj(options);
  const key = resolveKnowledgeDomain(domain, safeStr(opts.fallbackDomain || ""));
  if (!key || !KNOWLEDGE_DOMAINS[key]) {
    return {
      supported: false,
      requestedDomain: safeStr(domain),
      resolvedDomain: "",
      registryVersion: VERSION
    };
  }
  const config = cloneDomainConfig(KNOWLEDGE_DOMAINS[key]);
  return {
    ...config,
    supported: true,
    resolvedDomain: key,
    requestedDomain: safeStr(domain),
    registryVersion: VERSION,
    stateSpineSchema: STATE_SPINE_SCHEMA,
    stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    finalEnvelopeContract: FINAL_ENVELOPE_CONTRACT
  };
}

function listKnowledgeDomains(options = {}) {
  const opts = safeObj(options);
  return KNOWLEDGE_DOMAIN_PRIORITY.map((key) => {
    const cfg = { ...cloneDomainConfig(KNOWLEDGE_DOMAINS[key]), supported: true, resolvedDomain: key, isKnowledgeDomain: true };
    if (opts.includeWiring === true) cfg.wiring = getDomainWiringStatus(key, { includePack: false });
    return cfg;
  }).filter(Boolean);
}

function getDomainManifest(domain, options = {}) {
  const key = resolveKnowledgeDomain(domain);
  if (!key) return { supported: false, knowledgeDomain: "", requestedDomain: safeStr(domain), ok: false, manifest: null, path: "", error: "unsupported_knowledge_domain" };
  const candidates = getDomainFileCandidates(key);
  const loaded = findFirstJson(candidates.manifests, options);
  return {
    supported: true,
    knowledgeDomain: key,
    requestedDomain: safeStr(domain),
    ok: !!loaded.ok,
    loaded: !!loaded.ok,
    manifest: loaded.ok ? loaded.data : null,
    data: loaded.ok ? loaded.data : null,
    path: loaded.path || "",
    absolutePath: loaded.absolutePath || "",
    candidates: candidates.manifests,
    errors: safeArray(loaded.errors).concat(loaded.ok ? [] : (loaded.error ? [{ error: loaded.error }] : [])),
    registryVersion: VERSION
  };
}

function getDomainKnowledgePack(domain, options = {}) {
  const opts = safeObj(options);
  const key = resolveKnowledgeDomain(domain);
  if (!key) return { supported: false, knowledgeDomain: "", requestedDomain: safeStr(domain), ok: false, loaded: false, manifest: null, dataFiles: [], files: [], errors: [{ error: "unsupported_knowledge_domain" }], registryVersion: VERSION };
  const candidates = getDomainFileCandidates(key);
  const manifestResult = getDomainManifest(key, opts);
  const manifestPackFiles = manifestResult.ok ? manifestDeclaredPackCandidates({ data: manifestResult.manifest, path: manifestResult.path, absolutePath: manifestResult.absolutePath }) : [];
  const explicitPackFiles = uniqueList([...candidates.packs, ...manifestPackFiles]).filter(fileExists).map((p) => toAbsolutePath(p));
  const directoryJsonFiles = listJsonFiles(candidates.roots, opts).filter((full) => !/manifest\.json$/i.test(full));
  const files = uniqueList([...explicitPackFiles, ...directoryJsonFiles]);
  const dataFiles = [];
  const errors = [];
  const maxFiles = Number.isFinite(Number(opts.maxFiles)) ? Math.max(1, Math.min(200, Number(opts.maxFiles))) : 60;
  for (const file of files.slice(0, maxFiles)) {
    const loaded = readJsonFile(file, opts);
    if (loaded.ok) dataFiles.push({ name: basenameNoExt(loaded.path), path: loaded.path, size: loaded.size, mtimeMs: loaded.mtimeMs, preview: compactJsonPreview(loaded.data), data: loaded.data });
    else errors.push({ path: loaded.path || relPath(file), error: loaded.error });
  }
  if (!manifestResult.ok && manifestResult.errors.length) errors.push(...manifestResult.errors.map((e) => ({ ...e, source: "manifest" })));
  const loaded = manifestResult.ok || dataFiles.length > 0;
  return {
    supported: true,
    knowledgeDomain: key,
    requestedDomain: safeStr(domain),
    ok: loaded,
    loaded,
    manifestLoaded: !!manifestResult.ok,
    packLoaded: dataFiles.length > 0,
    manifest: manifestResult.manifest,
    manifestPath: manifestResult.path,
    dataFiles,
    files: dataFiles,
    fileCount: dataFiles.length,
    errors,
    candidates: { ...candidates, manifestDeclaredPacks: manifestPackFiles },
    registryVersion: VERSION
  };
}

function getDomainWiringStatus(domain, options = {}) {
  const key = resolveKnowledgeDomain(domain);
  if (!key) return { supported: false, requestedDomain: safeStr(domain), knowledgeDomain: "", manifestFound: false, packFilesFound: 0, ready: false, errors: ["unsupported_knowledge_domain"] };
  const manifest = getDomainManifest(key, options);
  const pack = options.includePack === false ? null : getDomainKnowledgePack(key, options);
  const candidates = getDomainFileCandidates(key);
  const packCount = pack ? pack.fileCount : listJsonFiles(candidates.roots, { maxFiles: 200 }).filter((p) => !/manifest\.json$/i.test(p)).length + candidates.packs.filter(fileExists).length;
  const errors = [];
  if (!manifest.ok) errors.push("manifest_missing_or_invalid");
  if (packCount < 1) errors.push("knowledge_pack_missing");
  return {
    supported: true,
    knowledgeDomain: key,
    manifestFound: !!manifest.ok,
    manifestPath: manifest.path || "",
    packFilesFound: packCount,
    ready: !!(manifest.ok && packCount > 0),
    errors,
    candidates,
    registryVersion: VERSION
  };
}

function getKnowledgeWiringHealth(options = {}) {
  const statuses = {};
  for (const key of KNOWLEDGE_DOMAIN_PRIORITY) statuses[key] = getDomainWiringStatus(key, { ...safeObj(options), includePack: false });
  const missing = Object.keys(statuses).filter((key) => !statuses[key].ready);
  return { ok: missing.length === 0, missing, statuses, registryVersion: VERSION };
}

function isDomainEnabled(domain) {
  const key = resolveKnowledgeDomain(domain) || resolveDomainKey(domain, "general_reasoning");
  const cfg = MARION_DOMAINS[key] || KNOWLEDGE_DOMAINS[key];
  return !!(cfg && cfg.enabled !== false && (cfg.requiresFinalEnvelope !== false));
}

function buildKnowledgeRoute(domain, overrides = {}) {
  const config = getKnowledgeDomainConfig(domain);
  const o = safeObj(overrides);
  if (!config.supported) return { supported: false, knowledgeDomain: "" };
  return {
    supported: true,
    knowledgeDomain: config.resolvedDomain,
    operationalDomain: safeStr(o.operationalDomain || config.operationalDomain || "general_reasoning"),
    mode: safeStr(o.mode || config.mode),
    depth: safeStr(o.depth || config.depth),
    preferredStyle: safeStr(o.preferredStyle || config.preferredStyle),
    useDomainKnowledge: true,
    safetyFirst: !!config.safetyFirst,
    noLegalAdvice: !!config.noLegalAdvice,
    noInvestmentAdvice: !!config.noInvestmentAdvice,
    defensiveOnly: !!config.defensiveOnly,
    capability: config.capability,
    dataRootHint: config.dataRootHint,
    manifestHint: config.manifestHint,
    manifest: getDomainManifest(config.resolvedDomain, { maxBytes: 1024 * 1024 }),
    wiring: getDomainWiringStatus(config.resolvedDomain, { includePack: false }),
    stateBridge: {
      schema: STATE_SPINE_SCHEMA,
      compatibleSchema: STATE_SPINE_SCHEMA_COMPAT,
      registryVersion: VERSION,
      knowledgeDomain: config.resolvedDomain,
      operationalDomain: safeStr(o.operationalDomain || config.operationalDomain || "general_reasoning")
    },
    creativeCognitive: {
      compatible: true,
      version: CREATIVE_COGNITIVE_COMPAT_VERSION,
      knowledgeDomain: config.resolvedDomain,
      operationalDomain: safeStr(o.operationalDomain || config.operationalDomain || "general_reasoning"),
      suppressWhenUnsupported: true
    },
    registryVersion: VERSION
  };
}

function getHealth() {
  const keys = Object.keys(MARION_DOMAINS);
  const missing = [];
  for (const intent of Object.keys(INTENT_TO_DOMAIN)) {
    if (!MARION_DOMAINS[INTENT_TO_DOMAIN[intent]]) missing.push(intent);
  }
  const knowledgeWiring = getKnowledgeWiringHealth({ includePack: false });
  return {
    ok: missing.length === 0,
    version: VERSION,
    domainCount: keys.length,
    domains: keys,
    knowledgeDomains: KNOWLEDGE_DOMAIN_PRIORITY,
    sixKnowledgeDomains: SIX_KNOWLEDGE_DOMAINS,
    knowledgeWiring,
    intentCoverage: Object.keys(INTENT_TO_DOMAIN).length,
    missingIntentDomains: missing,
    endpoint: CANONICAL_ENDPOINT,
    stateSpineSchema: STATE_SPINE_SCHEMA,
    stateSpineSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    finalEnvelopeContract: FINAL_ENVELOPE_CONTRACT
  };
}



function confidenceBand(confidence) {
  const c = Math.max(0, Math.min(1, Number(confidence) || 0));
  if (c >= 0.92) return "high";
  if (c >= 0.72) return "medium";
  if (c >= 0.52) return "low";
  return "weak";
}

function normalizeDomainConfidenceProfile(value = {}, fallback = {}) {
  const v = safeObj(value), f = safeObj(fallback);
  const confidence = Math.max(0, Math.min(1, Number(v.confidence ?? f.confidence ?? 0) || 0));
  const margin = Math.max(0, Math.min(1, Number(v.margin ?? f.margin ?? 0) || 0));
  const primaryDomain = resolveDomainKey(v.primaryDomain || v.domain || f.primaryDomain || f.domain || "general_reasoning");
  const knowledgeDomain = resolveKnowledgeDomain(v.knowledgeDomain || f.knowledgeDomain || "");
  const routeLocked = !!(v.routeLocked || v.routeLock || f.routeLocked || confidence >= 0.82);
  const ambiguous = !!(v.ambiguous || (!routeLocked && (confidence < 0.62 || (margin > 0 && margin < 0.08))));
  return {
    version: DOMAIN_CONFIDENCE_VERSION,
    confidence,
    band: safeStr(v.band || confidenceBand(confidence)),
    margin,
    ambiguous,
    routeLocked,
    failClosed: !!(v.failClosed || (ambiguous && !routeLocked)),
    primaryDomain,
    operationalDomain: safeStr(v.operationalDomain || f.operationalDomain || (knowledgeDomain ? safeObj(KNOWLEDGE_DOMAINS[knowledgeDomain]).operationalDomain : primaryDomain)),
    knowledgeDomain,
    reason: safeStr(v.reason || f.reason || "registry_domain_confidence"),
    candidates: safeArray(v.candidates || f.candidates).slice(0, 6)
  };
}

function getDomainConfidenceDefaults(domain){
  const key = resolveDomainKey(domain);
  const cfg = getDomainConfig(key);
  const supported = !!(cfg && cfg.supported !== false);
  const minConfidence = key === "technical" ? 0.34 : (cfg.isKnowledgeDomain ? 0.5 : 0.42);
  const minMargin = key === "technical" ? 0.1 : 0.16;
  return normalizeDomainConfidenceProfile({
    version: DOMAIN_CONFIDENCE_VERSION,
    domain: key,
    primaryDomain: key,
    operationalDomain: safeStr(cfg.operationalDomain || key),
    supported,
    confidence: supported ? minConfidence : 0,
    margin: minMargin,
    ambiguous: !supported,
    routeLocked: false,
    failClosed: !supported,
    useDomainKnowledge: !!(cfg && cfg.useDomainKnowledge),
    requiresFinalEnvelope: !!(cfg && cfg.requiresFinalEnvelope !== false),
    reason: supported ? "registry_default_threshold" : "unsupported_domain"
  });
}

function getPipelineForensicNormalizationStatus(){
  return {
    version: PIPELINE_FORENSIC_NORMALIZATION_VERSION,
    registryVersion: VERSION,
    stateSchema: STATE_SPINE_SCHEMA,
    stateSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    finalEnvelopeContract: FINAL_ENVELOPE_CONTRACT,
    canonicalEndpoint: CANONICAL_ENDPOINT,
    authority: "domain-registry.canonical-domain-map",
    domainCount: Object.keys(MARION_DOMAINS).length,
    knowledgeDomainCount: Object.keys(KNOWLEDGE_DOMAINS).length,
    supportedKnowledgeDomains: KNOWLEDGE_DOMAIN_PRIORITY.slice()
  };
}


function buildDomainConfidenceProfile(input = {}, fallback = {}) {
  if (domainConfidenceMod && typeof domainConfidenceMod.buildDomainConfidenceProfile === "function") {
    try {
      return domainConfidenceMod.buildDomainConfidenceProfile({
        text: safeStr(input.text || input.rawText || fallback.text || fallback.rawText || ""),
        intent: safeStr(input.intent || fallback.intent || "domain_question"),
        domain: safeStr(input.domain || fallback.domain || ""),
        knowledgeDomain: safeStr(input.knowledgeDomain || fallback.knowledgeDomain || ""),
        routing: safeObj(input.routing || fallback.routing),
        marionIntent: safeObj(input.marionIntent || fallback.marionIntent),
        candidates: safeArray(input.candidates || fallback.candidates),
        confidence: input.confidence ?? fallback.confidence
      });
    } catch (_err) {}
  }
  return normalizeDomainConfidenceProfile(input, fallback);
}


module.exports = {
  VERSION,
  PIPELINE_FORENSIC_NORMALIZATION_VERSION,
  DOMAIN_CONFIDENCE_VERSION,
  getPipelineForensicNormalizationStatus,
  STATE_SPINE_SCHEMA,
  STATE_SPINE_SCHEMA_COMPAT,
  FINAL_ENVELOPE_CONTRACT,
  CANONICAL_ENDPOINT,
  CREATIVE_COGNITIVE_COMPAT_VERSION,
  MARION_DOMAINS,
  KNOWLEDGE_DOMAINS,
  KNOWLEDGE_DOMAIN_PRIORITY,
  SIX_KNOWLEDGE_DOMAINS,
  DOMAIN_ALIASES,
  INTENT_TO_DOMAIN,
  getDomainConfig,
  getDomainForIntent,
  getDomainConfigForIntent,
  isSupportedDomain,
  resolveKnowledgeDomain,
  getKnowledgeDomainConfig,
  listKnowledgeDomains,
  buildKnowledgeRoute,
  getDomainManifest,
  getDomainKnowledgePack,
  getDomainWiringStatus,
  getKnowledgeWiringHealth,
  isDomainEnabled,
  listDomains,
  getCapabilityIntro,
  buildRoutingFromDomain,
  getHealth,
  confidenceBand,
  normalizeDomainConfidenceProfile,
  getDomainConfidenceDefaults,
  buildDomainConfidenceProfile,
  _internal: {
    safeStr,
    normalizeKey,
    resolveDomainKey,
    resolveKnowledgeDomain,
    cloneDomainConfig,
    getDomainFileCandidates,
    readJsonFile,
    findFirstJson,
    listJsonFiles,
    manifestDeclaredPackCandidates,
    compactJsonPreview,
    toAbsolutePath,
    relPath,
    isRemotePath,
    isInsideRoot,
    isInsideAnyRepoRoot,
    pruneFileCache,
    getPipelineForensicNormalizationStatus
  }
};

// R18AB_AI_CYBER_DOMAIN_REGISTRY_HARDENING_START
const R18AB_DOMAIN_REGISTRY_VERSION = "nyx.marion.r18ab.domainRegistry.aiCyber/1.0";
const R18AB_DOMAIN_ORDER = Object.freeze(["ai", "cyber", "law", "english", "finance", "psychology"]);
const R18AB_AI_FRAME = Object.freeze(["goal", "context", "data", "risk", "next_move"]);
const R18AB_CYBER_PROTOCOL = Object.freeze({
  macScoped: true,
  leastPrivilege: true,
  secretsRedacted: true,
  explicitConfirmationRequired: true,
  noCovertMonitoring: true,
  noAutonomousEnforcement: true,
  noPunitiveAction: true,
  advisoryRiskFlaggingOnly: true
});
function r18abRegStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function r18abRegObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function r18abRegCompact(value){return r18abRegStr(value).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");}
function r18abRegDomain(value){
  const k=r18abRegCompact(value);
  if(/^(artificial_intelligence|machine_learning|model_reasoning|ai_assessment|ai_integration|adaptive_ai)$/.test(k))return"ai";
  if(/^(security|cybersecurity|protective_protocol|protective_boundary|identity_protection|access_control|least_privilege|secret_redaction)$/.test(k))return"cyber";
  return k||"general";
}
function buildR18ABDomainProtocol(input={}, context={}){
  const src=[r18abRegStr(input),r18abRegStr(context),JSON.stringify(r18abRegObj(input)).slice(0,1200),JSON.stringify(r18abRegObj(context)).slice(0,1200)].join(" ").toLowerCase();
  const domain=r18abRegDomain(r18abRegObj(context).domain||r18abRegObj(context).knowledgeDomain||r18abRegObj(input).domain||r18abRegObj(input).knowledgeDomain);
  const ai=domain==="ai"||/\b(ai|artificial intelligence|machine learning|model|llm|agent|inference|automation|adaptive intelligence|ai integration|real[-\s]?world ai)\b/i.test(src);
  const cyber=domain==="cyber"||/\b(cyber|cybersecurity|security|protective protocol|least privilege|access control|identity|verify identity|secret|token|credential|permission|threat|vulnerability|covert monitoring|autonomous enforcement)\b/i.test(src);
  return {
    version:R18AB_DOMAIN_REGISTRY_VERSION,
    active:ai||cyber,
    domain:ai?"ai":(cyber?"cyber":domain),
    aiDomainAdaptability:!!ai,
    cyberProtectiveProtocol:!!cyber,
    aiAssessmentFrame:ai?R18AB_AI_FRAME.slice():[],
    cyberProtocol:cyber?Object.assign({},R18AB_CYBER_PROTOCOL):{},
    sequence:R18AB_DOMAIN_ORDER.slice(),
    baselinePreserved:"r16m-r17c",
    noUserFacingDiagnostics:true
  };
}
function r18abEnhanceDomainConfig(config, key){
  const c=r18abRegObj(config);
  const domain=r18abRegDomain(key||c.domain||c.key);
  if(!c||!Object.keys(c).length)return config;
  if(domain!=="ai"&&domain!=="cyber")return config;
  const patch=buildR18ABDomainProtocol({domain}, {domain});
  return Object.assign({}, c, {
    r18abDomainExpansion:true,
    aiDomainAdaptability:domain==="ai"?patch.aiDomainAdaptability:!!c.aiDomainAdaptability,
    cyberProtectiveProtocol:domain==="cyber"?patch.cyberProtectiveProtocol:!!c.cyberProtectiveProtocol,
    aiAssessmentFrame:domain==="ai"?patch.aiAssessmentFrame:(Array.isArray(c.aiAssessmentFrame)?c.aiAssessmentFrame:[]),
    cyberProtocol:domain==="cyber"?patch.cyberProtocol:r18abRegObj(c.cyberProtocol),
    baselinePreserved:"r16m-r17c",
    noUserFacingDiagnostics:true
  });
}
(function r18abPatchDomainRegistryExports(){
  if(typeof module==="undefined"||!module.exports||typeof module.exports!=="object")return;
  const exp=module.exports;
  ["getDomainConfig","getKnowledgeDomainConfig"].forEach(function(name){
    const fn=typeof exp[name]==="function"?exp[name]:null;
    if(!fn||fn.__r18abDomainRegistryPatched)return;
    exp[name]=function r18abDomainRegistryConfigWrapped(){
      const res=fn.apply(this,arguments);
      return r18abEnhanceDomainConfig(res,arguments&&arguments[0]);
    };
    exp[name].__r18abDomainRegistryPatched=true;
  });
  if(typeof exp.buildKnowledgeRoute==="function"&&!exp.buildKnowledgeRoute.__r18abDomainRegistryPatched){
    const original=exp.buildKnowledgeRoute;
    exp.buildKnowledgeRoute=function r18abBuildKnowledgeRouteWrapped(){
      const res=original.apply(this,arguments);
      const protocol=buildR18ABDomainProtocol(res,{domain:arguments&&arguments[0]});
      if(res&&typeof res==="object"&&protocol.active)return Object.assign({},res,{r18abDomainProtocol:protocol,baselinePreserved:"r16m-r17c",noUserFacingDiagnostics:true});
      return res;
    };
    exp.buildKnowledgeRoute.__r18abDomainRegistryPatched=true;
  }
  exp.R18AB_DOMAIN_REGISTRY_VERSION=R18AB_DOMAIN_REGISTRY_VERSION;
  exp.R18AB_DOMAIN_ORDER=R18AB_DOMAIN_ORDER;
  exp.R18AB_AI_FRAME=R18AB_AI_FRAME;
  exp.R18AB_CYBER_PROTOCOL=R18AB_CYBER_PROTOCOL;
  exp.buildR18ABDomainProtocol=buildR18ABDomainProtocol;
  exp.r18abEnhanceDomainConfig=r18abEnhanceDomainConfig;
  exp.R18AB_DOMAIN_REGISTRY_PATCH=true;
})();
// R18AB_AI_CYBER_DOMAIN_REGISTRY_HARDENING_END

