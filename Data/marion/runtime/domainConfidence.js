"use strict";

/**
 * domainConfidence.js
 *
 * Domain Confidence Scoring hardlock.
 * Pure scoring/normalization layer for Marion/Nyx routing authority.
 *
 * Architectural rules:
 * - Does not compose final public replies.
 * - Does not mutate State Spine.
 * - Does not bypass MarionBridge, DomainConcierge, or final-envelope authority.
 * - Keeps telemetry/internal confidence fields private and transport-safe.
 */

const VERSION = "domainConfidence v1.0.0 DOMAIN-CONFIDENCE-SCORING-HARDLOCK + FINAL-RENDER-TELEMETRY-HARDLOCK";
const FINAL_RENDER_TELEMETRY_VERSION = "nyx.marion.finalRenderTelemetry/1.0";
const finalRenderTelemetryMod = (() => { try { return require("./finalRenderTelemetry.js"); } catch (_) { return null; } })();
const DOMAIN_CONFIDENCE_VERSION = "nyx.marion.domainConfidence/1.2";

const CONFIDENCE_THRESHOLDS = Object.freeze({
  high: 0.82,
  medium: 0.62,
  low: 0.48,
  weak: 0,
  clarifyBelow: 0.62,
  failClosedBelow: 0.38,
  minMargin: 0.08
});

const VALID_DOMAINS = Object.freeze([
  "general",
  "general_reasoning",
  "technical",
  "emotional",
  "business",
  "music",
  "news",
  "roku",
  "identity",
  "memory",
  "execution",
  "execution_context",
  "psychology",
  "english",
  "ai",
  "cyber",
  "law",
  "finance"
]);

const DOMAIN_ALIASES = Object.freeze({
  chat: "general",
  simple_chat: "general",
  conversation: "general",
  reasoning: "general_reasoning",
  domain_question: "general_reasoning",
  debug: "technical",
  technical_debug: "technical",
  backend: "technical",
  frontend: "technical",
  code: "technical",
  patch: "technical",
  audit: "technical",
  autopsy: "technical",
  state_spine: "memory",
  statespine: "memory",
  marion: "technical",
  nyx: "technical",
  emotional_support: "emotional",
  support: "emotional",
  strategy: "business",
  business_strategy: "business",
  commercial: "business",
  advertising: "business",
  sales: "business",
  radio: "music",
  music_query: "music",
  news_query: "news",
  roku_query: "roku",
  tv: "roku",
  ott: "roku",
  identity_query: "identity",
  identity_or_memory: "memory",
  directive_response: "execution",
  contextual_directive: "execution_context",
  cybersecurity: "cyber",
  security: "cyber",
  legal: "law",
  financial: "finance",
  pricing: "finance",
  language: "english",
  grammar: "english",
  writing: "english",
  artificial_intelligence: "ai",
  machine_learning: "ai",
  psych: "psychology"
});

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

function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function lower(value) { return safeStr(value).toLowerCase(); }
function safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}
function compactKey(value) {
  return lower(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function canonicalDomain(value, fallback = "general_reasoning") {
  const raw = compactKey(value);
  const mapped = DOMAIN_ALIASES[raw] || raw;
  return VALID_DOMAINS.includes(mapped) ? mapped : fallback;
}
function confidenceBand(score) {
  const c = clamp01(score, 0);
  if (c >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (c >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  if (c >= CONFIDENCE_THRESHOLDS.low) return "low";
  return "weak";
}
function answerModeFor({ confidence = 0, ambiguous = false, failClosed = false, highStakes = false } = {}) {
  const c = clamp01(confidence, 0);
  if (failClosed || c < CONFIDENCE_THRESHOLDS.failClosedBelow) return "fail_closed";
  if (ambiguous || c < CONFIDENCE_THRESHOLDS.clarifyBelow) return "clarify";
  if (highStakes || c < CONFIDENCE_THRESHOLDS.high) return "grounded";
  return "direct";
}
function addCandidate(map, domain, score, reason, knowledgeDomain) {
  const key = canonicalDomain(domain, "");
  if (!key) return;
  const prev = map.get(key) || { domain: key, confidence: 0, reasons: [], knowledgeDomain: "" };
  prev.confidence = Math.max(prev.confidence, clamp01(score, 0));
  if (reason) prev.reasons.push(safeStr(reason));
  if (knowledgeDomain) prev.knowledgeDomain = canonicalDomain(knowledgeDomain, knowledgeDomain);
  map.set(key, prev);
}
function detectCandidates(text = "", context = {}) {
  const t = lower(text);
  const ctx = safeObj(context);
  const map = new Map();
  const intent = compactKey(ctx.intent || safeObj(ctx.routing).intent || safeObj(ctx.marionIntent).intent || "");
  const explicitDomain = ctx.domain || ctx.requestedDomain || safeObj(ctx.routing).domain || safeObj(ctx.marionIntent).domain;
  const knowledgeDomain = ctx.knowledgeDomain || ctx.activeKnowledgeDomain || safeObj(ctx.routing).knowledgeDomain || safeObj(ctx.marionIntent).knowledgeDomain;
  if (intent && INTENT_TO_DOMAIN[intent]) addCandidate(map, INTENT_TO_DOMAIN[intent], 0.58, `intent:${intent}`);
  if (explicitDomain) addCandidate(map, explicitDomain, 0.72, "explicit_domain");
  if (knowledgeDomain) addCandidate(map, knowledgeDomain, 0.88, "knowledge_domain", knowledgeDomain);

  if (/\b(file|files|code|js|javascript|patch|fix|update|zip|downloadable|autopsy|audit|node --check|runtime|backend|frontend|bridge|composer|state spine|statespine|router|registry|domain concierge|api\/chat)\b/i.test(t)) addCandidate(map, "technical", 0.94, "technical_runtime_signal");
  if (/\b(cash flow|profit|pricing|price|revenue|cost|margin|forecast|investment|loan|grant|fund|buyer|moneti[sz]e)\b/i.test(t)) addCandidate(map, "finance", 0.90, "finance_signal");
  if (/\b(contract|legal|legally|law|jurisdiction|liability|rights|terms|policy|compliance|ip|trademark|copyright)\b/i.test(t)) addCandidate(map, "law", 0.88, "law_signal");
  if (/\b(least privilege|zero trust|security|cyber|threat|vulnerability|access control|encryption|defensive)\b/i.test(t)) addCandidate(map, "cyber", 0.91, "cyber_signal");
  if (/\b(cognitive distortion|trauma|stress|anxiety|emotion|psychology|behavior|therapy|distress|overwhelmed)\b/i.test(t)) addCandidate(map, "psychology", 0.89, "psychology_signal");
  if (/\b(grammar|sentence|writing|tone|rewrite|copy|caption|language|english|clarity|polish)\b/i.test(t)) addCandidate(map, "english", 0.84, "english_signal");
  if (/\b(ai|artificial intelligence|model|agent|llm|prompt|inference|automation|cognitive operating system|language sphere|languagesphere|lingolink)\b/i.test(t)) addCandidate(map, "ai", 0.86, "ai_signal");
  if (/\b(roku|ott|linear tv|streaming|movie|watch|tv feed)\b/i.test(t)) addCandidate(map, "roku", 0.86, "roku_signal");
  if (/\b(radio|music|playlist|song|listener|station|love letters)\b/i.test(t)) addCandidate(map, "music", 0.84, "music_radio_signal");
  if (/\b(news|synapse|feed|headline|rss|canada)\b/i.test(t)) addCandidate(map, "news", 0.82, "news_signal");
  if (/\b(business|strategy|market|sales|pitch|commercial|advertising|sponsor|buyer)\b/i.test(t)) addCandidate(map, "business", 0.82, "business_signal");
  if (!map.size) addCandidate(map, "general_reasoning", 0.46, "default_reasoning");

  return Array.from(map.values())
    .map((c) => ({ ...c, confidence: clamp01(c.confidence, 0), reasons: safeArray(c.reasons).filter(Boolean).slice(0, 5) }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6);
}
function normalizeCandidateList(candidates = []) {
  const map = new Map();
  for (const item of safeArray(candidates)) {
    const obj = safeObj(item);
    const domain = obj.domain || obj.primaryDomain || obj.selectedDomain || obj.name;
    addCandidate(map, domain, obj.confidence ?? obj.score ?? 0, safeArray(obj.reasons)[0] || obj.reason || "inherited_candidate", obj.knowledgeDomain);
  }
  return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 6);
}
function normalizeDomainConfidenceProfile(value = {}, fallback = {}) {
  const v = safeObj(value);
  const f = safeObj(fallback);
  const inheritedCandidates = normalizeCandidateList(v.candidates || f.candidates || []);
  const generatedCandidates = inheritedCandidates.length ? inheritedCandidates : detectCandidates(f.rawText || f.text || v.rawText || v.text || "", f);
  const top = generatedCandidates[0] || { domain: canonicalDomain(v.primaryDomain || f.primaryDomain || f.domain || "general_reasoning"), confidence: 0, reasons: ["empty_candidate_fallback"] };
  const second = generatedCandidates[1] || null;
  const explicitScore = v.confidence ?? v.confidenceScore ?? f.confidence ?? f.confidenceScore;
  const confidence = clamp01(explicitScore, clamp01(top.confidence, 0));
  const runnerUp = second ? clamp01(second.confidence, 0) : 0;
  const margin = clamp01(v.margin ?? f.margin, Math.max(0, confidence - runnerUp));
  const primaryDomain = canonicalDomain(v.primaryDomain || v.selectedDomain || v.domain || f.primaryDomain || f.domain || top.domain);
  const secondaryDomains = safeArray(v.secondaryDomains || f.secondaryDomains).length
    ? safeArray(v.secondaryDomains || f.secondaryDomains).map((d) => canonicalDomain(d, "")).filter(Boolean).slice(0, 4)
    : generatedCandidates.slice(1, 4).map((c) => canonicalDomain(c.domain, "")).filter(Boolean);
  const knowledgeDomain = canonicalDomain(v.knowledgeDomain || f.knowledgeDomain || top.knowledgeDomain || "", "");
  const routeLocked = !!(v.routeLocked || v.routeLock || f.routeLocked || f.routeLock || confidence >= CONFIDENCE_THRESHOLDS.high || (confidence >= 0.72 && margin >= 0.16));
  const ambiguous = !!(v.ambiguous || f.ambiguous || (!routeLocked && (confidence < CONFIDENCE_THRESHOLDS.clarifyBelow || (runnerUp > 0 && margin < CONFIDENCE_THRESHOLDS.minMargin))));
  const highStakes = ["law", "finance", "cyber", "psychology"].includes(primaryDomain) || ["law", "finance", "cyber", "psychology"].includes(knowledgeDomain);
  const failClosed = !!(v.failClosed || f.failClosed || (!routeLocked && confidence < CONFIDENCE_THRESHOLDS.failClosedBelow));
  const needsClarifier = !!(v.needsClarifier || f.needsClarifier || (ambiguous && !failClosed));
  const answerMode = safeStr(v.answerMode || f.answerMode || answerModeFor({ confidence, ambiguous, failClosed, highStakes }));
  return {
    version: safeStr(v.version || f.version || DOMAIN_CONFIDENCE_VERSION),
    domainConfidenceVersion: DOMAIN_CONFIDENCE_VERSION,
    active: true,
    confidence,
    confidenceScore: confidence,
    band: safeStr(v.band || f.band || confidenceBand(confidence)),
    confidenceBand: safeStr(v.confidenceBand || f.confidenceBand || v.band || f.band || confidenceBand(confidence)),
    margin,
    primaryDomain,
    selectedDomain: primaryDomain,
    secondaryDomains,
    knowledgeDomain,
    ambiguous,
    routeLocked,
    failClosed,
    needsClarifier,
    answerMode,
    fallbackReason: safeStr(v.fallbackReason || f.fallbackReason || (failClosed ? "confidence_below_fail_closed_threshold" : (ambiguous ? "domain_margin_or_score_too_low" : ""))),
    reason: safeStr(v.reason || f.reason || safeArray(top.reasons)[0] || "domain_confidence_scored"),
    candidates: generatedCandidates,
    highStakes,
    noCrossDomainBleed: true,
    noUserFacingDiagnostics: true,
    updatedAt: Date.now()
  };
}
function buildDomainConfidenceProfile({ text = "", intent = "", domain = "", knowledgeDomain = "", routing = {}, marionIntent = {}, candidates = [], confidence = undefined } = {}) {
  const rt = safeObj(routing);
  const mi = safeObj(marionIntent);
  return normalizeDomainConfidenceProfile(rt.domainConfidence || mi.domainConfidence || {}, {
    rawText: text || rt.rawTurnText || rt.normalizedUserIntent || mi.turnText || mi.normalizedUserIntent,
    intent: intent || rt.intent || mi.intent,
    domain: domain || rt.domain || mi.domain,
    knowledgeDomain: knowledgeDomain || rt.knowledgeDomain || mi.knowledgeDomain,
    candidates: candidates.length ? candidates : (rt.candidateDomains || mi.candidateDomains || []),
    confidence: confidence ?? rt.routeConfidence ?? mi.confidence
  });
}

module.exports = {
  VERSION,
  DOMAIN_CONFIDENCE_VERSION,
  CONFIDENCE_THRESHOLDS,
  VALID_DOMAINS,
  DOMAIN_ALIASES,
  INTENT_TO_DOMAIN,
  canonicalDomain,
  confidenceBand,
  answerModeFor,
  detectCandidates,
  normalizeCandidateList,
  normalizeDomainConfidenceProfile,
  buildDomainConfidenceProfile,
  default: buildDomainConfidenceProfile
,
  FINAL_RENDER_TELEMETRY_VERSION};
