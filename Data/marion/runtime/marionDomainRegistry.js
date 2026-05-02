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

const VERSION = "marionDomainRegistry v1.3.0 MANIFEST-PACK-WIRING-GUARD";

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
  financial: "finance"
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
    manifests: Object.freeze(["domains/psychology/manifest.json", "domains/psychology/psychology.manifest.json", "domains/psychology.json", "Data/psychology/manifest.json", "Data/psychology/psychology.manifest.json", "Data/marion/domains/psychology/manifest.json", "Data/marion/knowledge/psychology/manifest.json"]),
    roots: Object.freeze(["Data/psychology", "domains/psychology", "Data/marion/domains/psychology", "Data/marion/knowledge/psychology"]),
    packs: Object.freeze(["Data/psychology/psychology.json", "Data/psychology/knowledge.json", "Data/psychology/domain.json", "Data/psychology/pack.json", "domains/psychology/knowledge.json", "domains/psychology/domain.json", "Data/marion/knowledge/psychology.json"])
  }),
  english: Object.freeze({
    manifests: Object.freeze(["domains/english/manifest.json", "domains/english/english.manifest.json", "domains/english.json", "Data/english/manifest.json", "Data/marion/domains/english/manifest.json", "Data/marion/knowledge/english/manifest.json"]),
    roots: Object.freeze(["domains/english", "Data/english", "Data/marion/domains/english", "Data/marion/knowledge/english"]),
    packs: Object.freeze(["domains/english/knowledge.json", "domains/english/domain.json", "domains/english/pack.json", "Data/english/english.json", "Data/english/knowledge.json", "Data/marion/knowledge/english.json"])
  }),
  ai: Object.freeze({
    manifests: Object.freeze(["domains/ai/manifest.json", "domains/ai/ai.manifest.json", "Data/ai/manifest.json", "Data/marion/domains/ai/manifest.json", "Data/marion/knowledge/ai/manifest.json"]),
    roots: Object.freeze(["Data/ai", "domains/ai", "Data/marion/domains/ai", "Data/marion/knowledge/ai"]),
    packs: Object.freeze(["Data/ai/ai.json", "Data/ai/knowledge.json", "Data/ai/domain.json", "domains/ai/knowledge.json", "Data/marion/knowledge/ai.json"])
  }),
  cyber: Object.freeze({
    manifests: Object.freeze(["domains/cyber/manifest.json", "domains/cyber/cyber.manifest.json", "domains/cybersecurity/manifest.json", "Data/cyber/manifest.json", "Data/cybersecurity/manifest.json", "Data/marion/domains/cyber/manifest.json", "Data/marion/knowledge/cyber/manifest.json"]),
    roots: Object.freeze(["Data/cyber", "Data/cybersecurity", "domains/cyber", "domains/cybersecurity", "Data/marion/domains/cyber", "Data/marion/knowledge/cyber"]),
    packs: Object.freeze(["Data/cyber/cyber.json", "Data/cyber/knowledge.json", "Data/cyber/domain.json", "domains/cyber/knowledge.json", "Data/marion/knowledge/cyber.json"])
  }),
  law: Object.freeze({
    manifests: Object.freeze(["domains/law/manifest.json", "domains/legal/manifest.json", "Data/law/manifest.json", "Data/legal/manifest.json", "Data/marion/domains/law/manifest.json", "Data/marion/knowledge/law/manifest.json"]),
    roots: Object.freeze(["Data/law", "Data/legal", "domains/law", "domains/legal", "Data/marion/domains/law", "Data/marion/knowledge/law"]),
    packs: Object.freeze(["Data/law/law.json", "Data/law/knowledge.json", "Data/law/domain.json", "domains/law/knowledge.json", "Data/marion/knowledge/law.json"])
  }),
  finance: Object.freeze({
    manifests: Object.freeze(["domains/finance/manifest.json", "domains/finance/finance.manifest.json", "Data/finance/manifest.json", "Data/marion/domains/finance/manifest.json", "Data/marion/knowledge/finance/manifest.json"]),
    roots: Object.freeze(["Data/finance", "domains/finance", "Data/marion/domains/finance", "Data/marion/knowledge/finance"]),
    packs: Object.freeze(["Data/finance/finance.json", "Data/finance/knowledge.json", "Data/finance/domain.json", "domains/finance/knowledge.json", "Data/marion/knowledge/finance.json"])
  })
});

const FILE_CACHE = new Map();

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
  ]);
}

function toAbsolutePath(candidate) {
  const raw = safeStr(candidate);
  if (!raw) return "";
  if (path.isAbsolute(raw)) return path.normalize(raw);
  for (const root of repoRootCandidates()) {
    const full = path.normalize(path.join(root, raw));
    try { if (fs.existsSync(full)) return full; } catch (_) {}
  }
  return path.normalize(path.join(process.cwd(), raw));
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
    const maxBytes = Number.isFinite(Number(opts.maxBytes)) ? Number(opts.maxBytes) : 2 * 1024 * 1024;
    if (stat.size > maxBytes) return { ok: false, path: relPath(full), error: "json_file_too_large", size: stat.size };
    const cacheKey = `${full}:${stat.mtimeMs}:${stat.size}`;
    if (FILE_CACHE.has(cacheKey)) return FILE_CACHE.get(cacheKey);
    const raw = fs.readFileSync(full, "utf8");
    const json = JSON.parse(raw);
    const result = { ok: true, path: relPath(full), absolutePath: full, size: stat.size, mtimeMs: stat.mtimeMs, data: json };
    FILE_CACHE.set(cacheKey, result);
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
  const maxFiles = Number.isFinite(Number(opts.maxFiles)) ? Math.max(1, Math.min(200, Number(opts.maxFiles))) : 60;
  const maxDepth = Number.isFinite(Number(opts.maxDepth)) ? Math.max(0, Math.min(6, Number(opts.maxDepth))) : 4;
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
        if (/^(node_modules|\.git|dist|build|coverage)$/i.test(entry.name)) continue;
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
    manifests: uniqueList([config.manifestHint, ...safeArray(configured.manifests), ...generic.manifests]),
    roots: uniqueList([config.dataRootHint, ...safeArray(configured.roots), ...generic.roots]),
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
      noUnsupportedDomainLeak: true
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
    manifest: loaded.ok ? loaded.data : null,
    path: loaded.path || "",
    candidates: candidates.manifests,
    errors: safeArray(loaded.errors).concat(loaded.ok ? [] : (loaded.error ? [{ error: loaded.error }] : [])),
    registryVersion: VERSION
  };
}

function getDomainKnowledgePack(domain, options = {}) {
  const opts = safeObj(options);
  const key = resolveKnowledgeDomain(domain);
  if (!key) return { supported: false, knowledgeDomain: "", requestedDomain: safeStr(domain), ok: false, manifest: null, dataFiles: [], errors: [{ error: "unsupported_knowledge_domain" }], registryVersion: VERSION };
  const candidates = getDomainFileCandidates(key);
  const manifestResult = getDomainManifest(key, opts);
  const explicitPackFiles = candidates.packs.filter(fileExists).map((p) => toAbsolutePath(p));
  const directoryJsonFiles = listJsonFiles(candidates.roots, opts).filter((full) => !/manifest\.json$/i.test(full));
  const files = uniqueList([...explicitPackFiles, ...directoryJsonFiles]);
  const dataFiles = [];
  const errors = [];
  const maxFiles = Number.isFinite(Number(opts.maxFiles)) ? Math.max(1, Math.min(200, Number(opts.maxFiles))) : 60;
  for (const file of files.slice(0, maxFiles)) {
    const loaded = readJsonFile(file, opts);
    if (loaded.ok) dataFiles.push({ path: loaded.path, size: loaded.size, mtimeMs: loaded.mtimeMs, data: loaded.data });
    else errors.push({ path: loaded.path || relPath(file), error: loaded.error });
  }
  if (!manifestResult.ok && manifestResult.errors.length) errors.push(...manifestResult.errors.map((e) => ({ ...e, source: "manifest" })));
  return {
    supported: true,
    knowledgeDomain: key,
    requestedDomain: safeStr(domain),
    ok: manifestResult.ok || dataFiles.length > 0,
    manifest: manifestResult.manifest,
    manifestPath: manifestResult.path,
    dataFiles,
    fileCount: dataFiles.length,
    errors,
    candidates,
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
    knowledgeWiring,
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
  KNOWLEDGE_DOMAINS,
  KNOWLEDGE_DOMAIN_PRIORITY,
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
    toAbsolutePath,
    relPath
  }
};
