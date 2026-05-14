"use strict";

/**
 * Utils/domainRouter.js
 *
 * Domain Router (pure, side-effect-free)
 * Chooses which knowledge domain(s) should be queried for a turn, based on:
 * - lane + action + turn intent
 * - lightweight keyword signals (NO raw text stored)
 * - risk posture (avoid risky domains when high risk)
 * - macMode (architect/user/transitional)
 *
 * Works with domainPackLoader + <domain>Knowledge modules:
 * - domainPackLoader loads packs into memory (fs-bound)
 * - domain knowledge modules expose getMarionHints / query functions (pure)
 *
 * Exports:
 * - routeDomain(norm, session, cog, opts) -> { primary, secondary[], reason, signals }
 * - scoreDomains(norm, session, cog, opts) -> { scores, signals }
 * - DOMAIN_ENUM, DEFAULT_DOMAIN_ORDER
 */

const ROUTER_VERSION = "domainRouter v1.5.2 SIX-DOMAIN-DEFINITION-ROUTING-LOCK + TECHNICAL-FOLLOWUP-INTENT-LOCK + CYBER-LEAST-PRIVILEGE-PRECISION + TOPLEVEL-CONFIDENCE + TECHNICAL-INFRA-PRECEDENCE-HARDENED";

// -------------------------
// helpers
// -------------------------
function safeStr(x, max = 240) {
  if (x === null || x === undefined) return "";
  const s = String(x);
  return s.length > max ? s.slice(0, max) + "…" : s;
}
function isPlainObject(x) {
  return (
    !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)
  );
}
function safeObj(x) {
  return isPlainObject(x) ? x : {};
}
function uniq(arr, max = 8) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(arr) ? arr : []) {
    const v = safeStr(it, 40).trim().toLowerCase();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}
function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
function normToken(s) {
  return safeStr(s, 80).trim().toLowerCase();
}

function normalizeInputSource(value) {
  const raw = normToken(value || "");
  if (/voice|speech|mic|audio|headset/.test(raw)) return "voice";
  if (/text|typed|keyboard|manual/.test(raw)) return "text";
  return raw || "text";
}

function normalizeVoiceTextParityText(value) {
  return safeStr(value, 1400)
    .replace(/\b(nick|nix|mix|mike)\b/gi, "Nyx")
    .replace(/\b(state\s+line|state\s+sign|state\s+spine|statespine)\b/gi, "State Spine")
    .replace(/\b(chad\s+engine|chat\s+engine)\b/gi, "ChatEngine")
    .replace(/\b(mary\s+bridge|marian\s+bridge|marion\s+bridge)\b/gi, "MarionBridge")
    .replace(/\b(compose\s+marion\s+response|composed\s+marion\s+response|compose\s+marian\s+response|composed\s+marian\s+response)\b/gi, "ComposeMarionResponse")
    .replace(/\b(mic\s*text|mic\s*tech|mike\s*text|mike\s*tech)\b/gi, "mic text")
    .replace(/\b(5\s*term|five\s*term|five\s*turn|5\s*turn)\b/gi, "5-turn")
    .replace(/\s+/g, " ")
    .trim();
}


function canonicalTechnicalTargetFromText(text = "") {
  const t = safeStr(text, 1400);
  const mk = (targetKey, targetName, targetFile, targetPath) => ({ version: "nyx.marion.technicalTargetLock/1.1", targetKey, targetName, targetFile, targetPath, explicit: true, source: "current_user_text", locked: true, technicalFollowUpLock: true, blockScheduleInterception: true });
  if (/\b(chat\s*engine|chatengine)\b/i.test(t)) return mk("chatEngine", "ChatEngine", "chatEngine.js", "Utils/chatEngine.js");
  if (/\b(marion\s*bridge|marionbridge)\b/i.test(t)) return mk("marionBridge", "MarionBridge", "marionBridge.js", "Data/marion/runtime/marionBridge.js");
  if (/\b(compose\s*marion\s*response|composemarionresponse|composer)\b/i.test(t)) return mk("composeMarionResponse", "ComposeMarionResponse", "composeMarionResponse.js", "Data/marion/runtime/composeMarionResponse.js");
  if (/\b(state\s*spine|statespine|state-spine)\b/i.test(t)) return mk("stateSpine", "StateSpine", "stateSpine.js", "Utils/stateSpine.js");
  if (/\b(marion\s*intent\s*router|intent\s*router|marionintentrouter)\b/i.test(t)) return mk("marionIntentRouter", "MarionIntentRouter", "marionIntentRouter.js", "Data/marion/runtime/marionIntentRouter.js");
  if (/\b(domain\s*router|domainrouter)\b/i.test(t)) return mk("domainRouter", "DomainRouter", "domainRouter.js", "Utils/domainRouter.js");
  if (/\b(index\.js|api\/chat|\/api\/chat)\b/i.test(t)) return mk("index", "index.js", "index.js", "index.js");
  return {};
}
function isTechnicalFollowUpIntent(text = "") {
  const target = canonicalTechnicalTargetFromText(text);
  return !!(target && target.targetPath && (/\b(now|next|then|also|again|after that|from there)\b/i.test(text) || /\b(full autopsy|autopsy|audit|line[-\s]?by[-\s]?line|check|inspect|review|patch|harden|run)\b/i.test(text)));
}

function isInfrastructureContinuityPrompt(text) {
  const t = normalizeVoiceTextParityText(text).toLowerCase();
  return /\b(bootstrap|guard|manifest|declared path|root path|domain isolation|domain route|domain routing|fail[-\s]?closed|silent fallback|cross[-\s]?domain bleed|domain bleed|domain path|final envelope|state spine|5-turn|five-turn|continuity regression|mic text parity|input source parity|same route|same state|same final|response consistency)\b/i.test(t) || /\b(broken|invalid|failed|missing)\b.*\b(psychology|english|finance|general|domain)\b.*\b(affect|fallback|bleed|load|route)\b/i.test(t) || /\b(should not|must not|cannot)\b.*\b(affect|fall back|fallback|bleed)\b.*\b(english|finance|general|psychology)\b/i.test(t);
}

function continuityHash(value) {
  const source = normalizeVoiceTextParityText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}


function isDefinitionQuery(text = "") {
  const t = normalizeVoiceTextParityText(text).toLowerCase();
  return !!t && (/\b(what\s+is|what\s+are|define|definition\s+of|meaning\s+of|explain|explain\s+the\s+term|explain\s+the\s+word|describe)\b/i.test(t) || /\?$/.test(t));
}

function definitionKnowledgeDomainFromText(text = "") {
  const t = normalizeVoiceTextParityText(text).toLowerCase();
  if (!isDefinitionQuery(t)) return "";
  if (canonicalTechnicalTargetFromText(t).targetPath) return "";
  if (/\b(full autopsy|line[-\s]?by[-\s]?line|audit|critical fix|critical fixes|patch|debug|backend|frontend|widget|script|file|api\/chat|render|deploy|syntax|node --check)\b/i.test(t)) return "";
  const domainTerms = [
    [DOMAIN_ENUM.LAW, /\b(contract consideration|legal consideration|consideration in contract|consideration|contract|contract law|statute|jurisdiction|legal information|legal advice|liability|negligence|fiduciary|tort|case law|compliance)\b/i],
    [DOMAIN_ENUM.FIN, /\b(cash[-\s]?flow|unit economics|runway|margin|gross margin|profit|revenue|ltv|cac|working capital|burn rate|capital markets|pricing tier|scenario analysis|financial resilience)\b/i],
    [DOMAIN_ENUM.PSY, /\b(cognitive distortion|emotional regulation|attachment|trauma|bias|cognition|cognitive|shutdown|emotional shutdown|anxiety|panic|behavior|behaviour)\b/i],
    [DOMAIN_ENUM.AI, /\b(tool routing|rag|retrieval augmented generation|llm|large language model|embedding|agent orchestration|ai agent|artificial intelligence|machine learning|model inference|prompt injection in ai)\b/i],
    [DOMAIN_ENUM.CYBER, /\b(least privilege|mfa|multi[-\s]?factor|iam|identity access|zero trust|incident response|threat model|input validation|secrets rotation|phishing|ransomware|endpoint security|cloud security|network security|data protection|privacy minimization)\b/i],
    [DOMAIN_ENUM.EN, /\b(sentence clarity|syntax|grammar|tone|wording|language flow|professional clarity|plain language|copyedit|proofread)\b/i]
  ];
  for (const [domain, rx] of domainTerms) if (rx.test(t)) return domain;
  return "";
}

function hasAny(text, reList) {
  const t = safeStr(text, 1400).toLowerCase();
  for (const re of reList) {
    if (re.test(t)) return true;
  }
  return false;
}

// -------------------------
// Domain enum + defaults
// -------------------------
const DOMAIN_ENUM = Object.freeze({
  CORE: "core", // generic fallback
  TECH: "technical", // backend/runtime diagnostics
  MUSIC: "music", // (if you use it)
  PSY: "psychology",
  CYBER: "cyber",
  EN: "english",
  LAW: "law",
  FIN: "finance",
  STRAT: "strategy",
  AI: "ai",
  MKT: "marketing", // optional if you add later
});

const DEFAULT_DOMAIN_ORDER = Object.freeze([
  DOMAIN_ENUM.TECH,
  DOMAIN_ENUM.AI,
  DOMAIN_ENUM.FIN,
  DOMAIN_ENUM.LAW,
  DOMAIN_ENUM.CYBER,
  DOMAIN_ENUM.PSY,
  DOMAIN_ENUM.STRAT,
  DOMAIN_ENUM.EN,
  DOMAIN_ENUM.CORE,
]);

// -------------------------
// keyword maps (lightweight)
// -------------------------
const KEYWORDS = Object.freeze({
  [DOMAIN_ENUM.TECH]: [
    /\b(full autopsy|line[-\s]?by[-\s]?line audit|critical fix|critical fixes|backend|frontend|widget|marion|nyx|state spine|statespine|chatengine|intent router|domain registry|domainrouter|composemarionresponse|final envelope|telemetry|pipeline|bootstrap guard|manifest|structural integrity)\b/,
  ],
  [DOMAIN_ENUM.AI]: [
    /\b(artificial intelligence|machine learning|deep learning|neural|transformer|llm|prompt|rag|embedding|vector|fine[-\s]?tune|agent(s)?|tool use|reasoning|inference|model eval|alignment|rlhf|policy)\b/,
    /\b(pytorch|tensorflow|keras|hugging ?face|onnx|openai|anthropic|gemini|llama|mistral)\b/,
  ],
  [DOMAIN_ENUM.FIN]: [
    /\b(finance|economics|pricing|revenue|profit|margin|cash[-\s]?flow|forecast|budget|breakeven|roi|npv|irr|capm|wacc|beta|discount rate)\b/,
    /\b(cash[-\s]?flow risk|cash[-\s]?flow impact|cash[-\s]?flow pressure|business decision|working capital|financial resilience|runway|burn rate|ltv|cac|unit economics|cohort|churn|arpu|mrr|arr|gross margin)\b/,
    /\b(bonds?|equities|stocks?|capital markets|yield curve|rates?|inflation|gdp|fiscal|monetary)\b/,
  ],
  [DOMAIN_ENUM.LAW]: [
    /\b(law|legal|contract|nda|terms|liability|compliance|copyright|trademark|privacy law|gdpr|pipeda|caselaw|jurisdiction)\b/,
    /\b(ethics|ethical|duty of care|fiduciary|negligence|damages)\b/,
  ],
  [DOMAIN_ENUM.CYBER]: [
    /\b(cyber|cybersecurity|security|infosec|phish|malware|ransom|breach|exploit|vulnerability|patch|zero[-\s]?day|ddos|xss|sql injection|auth|mfa|least privilege|identity access|iam|incident response|threat model|defensive security|endpoint security|cloud security|network security|web security|privacy minimization|data protection|hardening)\b/,
  ],
  [DOMAIN_ENUM.PSY]: [
    /\b(psychology|cognitive|behavior|bias(es)?|therapy|trauma|attachment|emotion regulation|mental health|clinical)\b/,
  ],
  [DOMAIN_ENUM.EN]: [
    /\b(rewrite|revise|edit|proofread|grammar|spelling|tone|summarize|simplify|translate|clarity|structure)\b/,
    /\b(email|letter|proposal|pitch|copy|caption|script)\b/,
  ],
  [DOMAIN_ENUM.STRAT]: [
    /\b(strategy|roadmap|milestone|priority|trade[-\s]?off|decision|constraint|kpi|metric|execution|risk management)\b/,
  ],
});

// If risk tier is high, we clamp to safer domains / neutral help
const RISK_TIER = Object.freeze({
  NONE: "none",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
});



const DOMAIN_ALIASES = Object.freeze({
  general: DOMAIN_ENUM.CORE,
  core: DOMAIN_ENUM.CORE,
  technical: DOMAIN_ENUM.TECH,
  diagnostics: DOMAIN_ENUM.TECH,
  backend: DOMAIN_ENUM.TECH,
  autopsy: DOMAIN_ENUM.TECH,
  audit: DOMAIN_ENUM.TECH,
  router: DOMAIN_ENUM.TECH,
  manifest: DOMAIN_ENUM.TECH,
  emotion: DOMAIN_ENUM.PSY,
  psychology: DOMAIN_ENUM.PSY,
  psych: DOMAIN_ENUM.PSY,
  finance: DOMAIN_ENUM.FIN,
  fin: DOMAIN_ENUM.FIN,
  legal: DOMAIN_ENUM.LAW,
  law: DOMAIN_ENUM.LAW,
  english: DOMAIN_ENUM.EN,
  writing: DOMAIN_ENUM.EN,
  cybersecurity: DOMAIN_ENUM.CYBER,
  cyber: DOMAIN_ENUM.CYBER,
  ai: DOMAIN_ENUM.AI,
  strategy: DOMAIN_ENUM.STRAT,
  marketing: DOMAIN_ENUM.MKT,
  music: DOMAIN_ENUM.MUSIC,
});

function canonicalizeDomain(value, fallback = DOMAIN_ENUM.CORE) {
  const key = normToken(value || '');
  return DOMAIN_ALIASES[key] || fallback;
}

// -------------------------
// scoring
// -------------------------
function baseScores() {
  const s = Object.create(null);
  for (const d of DEFAULT_DOMAIN_ORDER) s[d] = 0;
  // ensure all enums exist
  for (const k of Object.values(DOMAIN_ENUM)) if (typeof s[k] !== "number") s[k] = 0;
  return s;
}

function applyLaneActionHeuristics(scores, norm) {
  const n = isPlainObject(norm) ? norm : {};
  const lane = normToken(n.lane || "");
  const action = normToken(n.action || "");
  const inputSource = normalizeInputSource(n.inputSource || n.source || safeObj(n.session).inputSource || "text");
  const turnHash = continuityHash(n.text || n.query || n.message || "");

  if (lane === "technical" || lane === "debug" || lane === "diagnostics") scores[DOMAIN_ENUM.TECH] += 2.6;
  if (lane === "law") scores[DOMAIN_ENUM.LAW] += 2.2;
  if (lane === "finance" || lane === "fin") scores[DOMAIN_ENUM.FIN] += 2.2;
  if (lane === "cyber") scores[DOMAIN_ENUM.CYBER] += 2.2;
  if (lane === "psychology" || lane === "psy") scores[DOMAIN_ENUM.PSY] += 2.2;
  if (lane === "english" || lane === "writing") scores[DOMAIN_ENUM.EN] += 2.2;
  if (lane === "strategy") scores[DOMAIN_ENUM.STRAT] += 2.0;
  if (lane === "ai" || lane === "artificial_intelligence") scores[DOMAIN_ENUM.AI] += 2.4;

  // action routing (your ecosystem uses lots of actions; keep generic)
  if (/autopsy|audit|debug|diagnostic|router|manifest|bootstrap|runtime|pipeline|final|envelope|state/.test(action)) scores[DOMAIN_ENUM.TECH] += 1.8;
  if (/contract|nda|terms|policy/.test(action)) scores[DOMAIN_ENUM.LAW] += 1.4;
  if (/budget|pricing|unit|invoice|forecast|finance|cash|cashflow|cash_flow|runway|margin|risk/.test(action)) scores[DOMAIN_ENUM.FIN] += 1.4;
  if (/phish|breach|malware|security/.test(action)) scores[DOMAIN_ENUM.CYBER] += 1.4;
  if (/rewrite|edit|proof|summarize/.test(action)) scores[DOMAIN_ENUM.EN] += 1.2;
  if (/strategy|roadmap|milestone|kpi/.test(action)) scores[DOMAIN_ENUM.STRAT] += 1.1;
  if (/ai|agent|rag|llm|model|prompt/.test(action)) scores[DOMAIN_ENUM.AI] += 1.6;

  return scores;
}

function applyKeywordSignals(scores, norm) {
  const text = normalizeVoiceTextParityText(isPlainObject(norm) ? norm.text : "");
  const technicalTargetLock = canonicalTechnicalTargetFromText(text);
  if (technicalTargetLock && technicalTargetLock.targetPath) {
    scores[DOMAIN_ENUM.TECH] += 4.8;
    scores[DOMAIN_ENUM.CORE] -= 0.6;
    scores[DOMAIN_ENUM.EN] -= 0.4;
    scores[DOMAIN_ENUM.STRAT] -= 0.4;
  }

  for (const [domain, patterns] of Object.entries(KEYWORDS)) {
    if (hasAny(text, patterns)) {
      scores[domain] += 2.0;
    }
  }

  // Definition query lock: known six-domain terms outrank generic technical/debug scoring.
  const definitionDomain = definitionKnowledgeDomainFromText(text);
  if (definitionDomain) {
    scores[definitionDomain] += 5.8;
    scores[DOMAIN_ENUM.TECH] -= 2.4;
    scores[DOMAIN_ENUM.CORE] -= 1.2;
    scores[DOMAIN_ENUM.STRAT] -= 0.6;
  }

  // Extra boosts for cross-domain coupling phrases
  const t = text.toLowerCase();

  // Finance precision: cash-flow/risk language should outrank generic business/strategy wording.
  if (/\b(cash[-\s]?flow risk|cash[-\s]?flow impact|cash[-\s]?flow pressure|cash[-\s]?flow runway|working capital|business runway|financial resilience|runway|burn rate|unit economics|gross margin)\b/.test(t)) {
    scores[DOMAIN_ENUM.FIN] += 2.4;
    scores[DOMAIN_ENUM.STRAT] -= 0.35;
    scores[DOMAIN_ENUM.CORE] -= 0.15;
  }
  if (/\b(business decision|decision threshold|scenario analysis|cost pressure|demand pressure)\b/.test(t) && /\b(cash[-\s]?flow|runway|margin|unit economics|finance|financial)\b/.test(t)) {
    scores[DOMAIN_ENUM.FIN] += 1.5;
    scores[DOMAIN_ENUM.STRAT] -= 0.25;
  }
  if (/\b(ai and law|ai.*law|law.*ai)\b/.test(t)) {
    scores[DOMAIN_ENUM.AI] += 0.8;
    scores[DOMAIN_ENUM.LAW] += 0.8;
  }
  if (/\b(ai and cyber|ai.*cyber|cyber.*ai)\b/.test(t)) {
    scores[DOMAIN_ENUM.AI] += 0.8;
    scores[DOMAIN_ENUM.CYBER] += 0.8;
  }
  if (/\b(ai and psychology|ai.*psychology|psychology.*ai)\b/.test(t)) {
    scores[DOMAIN_ENUM.AI] += 0.8;
    scores[DOMAIN_ENUM.PSY] += 0.8;
  }
  if (/\b(ai and finance|ai.*finance|finance.*ai|ai and economics)\b/.test(t)) {
    scores[DOMAIN_ENUM.AI] += 0.8;
    scores[DOMAIN_ENUM.FIN] += 0.8;
  }

  return scores;
}

function applyIntentMode(scores, cog, session) {
  const c = isPlainObject(cog) ? cog : {};
  const s = isPlainObject(session) ? session : {};

  const intent = safeStr(c.intent || "", 12).toUpperCase();
  const mode = safeStr(c.mode || s.macMode || "", 16).toLowerCase();

  if (intent === "TECHNICAL_DEBUG" || intent === "DEBUG" || intent === "DIAGNOSTIC") {
    scores[DOMAIN_ENUM.TECH] += 2.2;
    scores[DOMAIN_ENUM.CORE] += 0.4;
  }

  // Stabilize -> bias to psychology + english + core
  if (intent === "STABILIZE") {
    scores[DOMAIN_ENUM.PSY] += 1.4;
    scores[DOMAIN_ENUM.EN] += 0.8;
    scores[DOMAIN_ENUM.CORE] += 0.6;
    scores[DOMAIN_ENUM.AI] -= 0.4;
    scores[DOMAIN_ENUM.CYBER] -= 0.4;
  }

  // Architect -> bias to strategy + domain requested
  if (mode === "architect" || mode === "transitional") {
    scores[DOMAIN_ENUM.STRAT] += 0.8;
  } else if (mode === "user") {
    scores[DOMAIN_ENUM.EN] += 0.6;
  }

  // If user is repeatedly in a lane, modest stickiness
  const lastLane = normToken(s.lane || "");
  const lane = normToken(isPlainObject(c) ? c.lane : "");
  if (lastLane && lane && lastLane === lane) {
    scores[DOMAIN_ENUM.STRAT] += 0.2;
  }

  return scores;
}

function applyRiskClamp(scores, cog) {
  const c = isPlainObject(cog) ? cog : {};
  const tier = safeStr(c.riskTier || "", 10).toLowerCase();

  if (tier === RISK_TIER.HIGH) {
    // keep response safer: prefer psychology/english/core, downweight others
    scores[DOMAIN_ENUM.PSY] += 1.2;
    scores[DOMAIN_ENUM.EN] += 0.8;
    scores[DOMAIN_ENUM.CORE] += 0.8;

    scores[DOMAIN_ENUM.CYBER] -= 1.2;
    scores[DOMAIN_ENUM.FIN] -= 0.8;
    scores[DOMAIN_ENUM.LAW] -= 0.8;
    scores[DOMAIN_ENUM.AI] -= 0.6;
  } else if (tier === RISK_TIER.MEDIUM) {
    scores[DOMAIN_ENUM.EN] += 0.3;
    scores[DOMAIN_ENUM.CORE] += 0.2;
    scores[DOMAIN_ENUM.CYBER] -= 0.4;
  }

  return scores;
}

function normalizeScores(scores) {
  const out = Object.create(null);
  let max = 0;
  for (const [k, v] of Object.entries(scores || {})) {
    const n = Number(v);
    const val = Number.isFinite(n) ? n : 0;
    out[k] = val;
    if (val > max) max = val;
  }
  // convert to 0..1 confidence-ish
  const conf = Object.create(null);
  const denom = max > 0 ? max : 1;
  for (const [k, v] of Object.entries(out)) {
    conf[k] = clamp01(v / denom);
  }
  return { scores: out, confidence: conf };
}


function domainConfidenceProfile(scores, text = "", opts = {}) {
  const entries = Object.entries(scores || {})
    .map(([domain, score]) => [canonicalizeDomain(domain), Number(score) || 0])
    .sort((a, b) => b[1] - a[1]);
  const primary = entries.length ? entries[0][0] : DOMAIN_ENUM.CORE;
  const secondary = entries.length > 1 ? entries[1][0] : "";
  const top = entries.length ? Math.max(0, entries[0][1]) : 0;
  const runnerUp = entries.length > 1 ? Math.max(0, entries[1][1]) : 0;
  const total = entries.reduce((sum, item) => sum + Math.max(0, item[1]), 0) || 1;
  const confidence = clamp01(top / total);
  const margin = clamp01((top - runnerUp) / (top || 1));
  const infrastructure = isInfrastructureContinuityPrompt(text);
  const minConfidence = Number.isFinite(Number(opts.minConfidence)) ? Number(opts.minConfidence) : 0.34;
  const minMargin = Number.isFinite(Number(opts.minMargin)) ? Number(opts.minMargin) : 0.14;
  const ambiguous = !infrastructure && (confidence < minConfidence || margin < minMargin);
  return {
    version: "nyx.domainConfidenceScoring/1.1",
    primary,
    secondary,
    confidence: Number(confidence.toFixed(4)),
    margin: Number(margin.toFixed(4)),
    ambiguous,
    routeLocked: infrastructure || (!ambiguous && confidence >= minConfidence),
    failClosed: !!ambiguous,
    primaryDomain: primary,
    fallbackDomain: ambiguous ? DOMAIN_ENUM.CORE : primary,
    top: entries.slice(0, 4).map(([domain, score]) => ({ domain, score: Number(score.toFixed ? score.toFixed(4) : score) })),
    reason: infrastructure ? "technical_infrastructure_precedence" : (ambiguous ? "low_margin_or_low_confidence" : "highest_weighted_domain")
  };
}

function pickTopDomains(scores, opts) {
  const o = isPlainObject(opts) ? opts : {};
  const maxSecondary = clamp01(o.maxSecondary) ? Math.trunc(o.maxSecondary) : 2;
  const minSecondaryScore = Number.isFinite(Number(o.minSecondaryScore)) ? Number(o.minSecondaryScore) : 1.6;

  const entries = Object.entries(scores || {}).sort((a, b) => (b[1] || 0) - (a[1] || 0));

  const primary = entries.length ? entries[0][0] : DOMAIN_ENUM.CORE;

  const secondary = [];
  for (let i = 1; i < entries.length && secondary.length < maxSecondary; i++) {
    const [d, sc] = entries[i];
    if ((sc || 0) >= minSecondaryScore && d !== primary) secondary.push(d);
  }

  return { primary, secondary };
}

// -------------------------
// Public functions
// -------------------------
function scoreDomains(norm, session, cog, opts = {}) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(session) ? session : {};
  const c = isPlainObject(cog) ? cog : {};
  const o = isPlainObject(opts) ? opts : {};

  const scores = baseScores();
  const signals = [];

  applyLaneActionHeuristics(scores, n);
  applyKeywordSignals(scores, n);
  const definitionDomain = definitionKnowledgeDomainFromText(n.text || n.query || n.message || "");
  if (definitionDomain) signals.push(`definition:${definitionDomain}`);
  applyIntentMode(scores, c, s);
  applyRiskClamp(scores, c);

  if (isInfrastructureContinuityPrompt(n.text || n.query || n.message || "")) {
    scores[DOMAIN_ENUM.TECH] += 3.6;
    scores[DOMAIN_ENUM.CORE] += 0.8;
    scores[DOMAIN_ENUM.STRAT] += 0.4;
    scores[DOMAIN_ENUM.AI] += 0.4;
    scores[DOMAIN_ENUM.FIN] -= 1.4;
    scores[DOMAIN_ENUM.PSY] -= 0.8;
    signals.push("precedence:technical_infrastructure");
  }

  // If nothing hit, keep core
  const sum = Object.values(scores).reduce((acc, v) => acc + (Number.isFinite(Number(v)) ? Number(v) : 0), 0);
  if (sum <= 0.001) {
    scores[DOMAIN_ENUM.CORE] = 1.0;
    signals.push("fallback:core");
  }

  // Signal summaries (no raw text)
  const lane = normToken(n.lane || "");
  const action = normToken(n.action || "");
  const inputSource = normalizeInputSource(n.inputSource || n.source || safeObj(n.session).inputSource || "text");
  const turnHash = continuityHash(n.text || n.query || n.message || "");
  const intent = safeStr(c.intent || "", 12).toUpperCase();
  const tier = safeStr(c.riskTier || "", 10).toLowerCase();

  if (lane) signals.push(`lane:${lane}`);
  if (action) signals.push(`action:${action.slice(0, 18)}`);
  if (intent) signals.push(`intent:${intent}`);
  if (tier) signals.push(`risk:${tier}`);
  if (inputSource) signals.push(`input:${inputSource}`);

  const normalized = normalizeScores(scores);
  const domainConfidence = domainConfidenceProfile(normalized.scores, n.text || n.query || n.message || "", o);

  return {
    ok: true,
    routerVersion: ROUTER_VERSION,
    scores: normalized.scores,
    confidence: normalized.confidence,
    domainConfidence,
    signals: uniq(signals, 10),
    stateSpinePatch: {
      source: "domainRouter",
      schema: "nyx.marion.stateSpine/1.7",
      shouldAdvanceState: false,
      domainScores: normalized.scores,
      confidence: normalized.confidence,
      domainConfidence,
      inputSource,
      turnHash,
      micTextParity: true,
      continuityRegressionReady: true
    }
  };
}

function routeDomain(norm, session, cog, opts = {}) {
  const n = isPlainObject(norm) ? norm : {};
  const scored = scoreDomains(n, session, cog, opts);
  const domainConfidence = scored.domainConfidence || domainConfidenceProfile(scored.scores, n.text || n.query || n.message || "", opts);
  const pick = domainConfidence.ambiguous ? { primary: domainConfidence.fallbackDomain, secondary: [] } : pickTopDomains(scored.scores, {
    maxSecondary: Number.isFinite(Number(opts.maxSecondary)) ? Number(opts.maxSecondary) : 2,
    minSecondaryScore: Number.isFinite(Number(opts.minSecondaryScore)) ? Number(opts.minSecondaryScore) : 1.6,
  });

  // reason (compact)
  const inputSource = normalizeInputSource(n.inputSource || n.source || safeObj(n.session).inputSource || "text");
  const turnHash = continuityHash(n.text || n.query || n.message || "");

  const reason = {
    primary: canonicalizeDomain(pick.primary),
    secondary: uniq((pick.secondary || []).map((d) => canonicalizeDomain(d)).filter(Boolean), 3),
    confidence: scored.confidence ? scored.confidence[pick.primary] : 0,
    signals: scored.signals,
    inputSource,
    turnHash,
    continuity: { fiveTurnReady: true, micTextParity: true },
    domainConfidence
  };

  return {
    ok: true,
    routerVersion: ROUTER_VERSION,
    primary: canonicalizeDomain(pick.primary),
    secondary: uniq((pick.secondary || []).map((d) => canonicalizeDomain(d)).filter(Boolean), 3),
    reason,
    domainConfidence,
    confidence: scored.confidence ? scored.confidence[pick.primary] : 0,
    signals: scored.signals,
    routing: {
      domain: canonicalizeDomain(pick.primary),
      technicalTargetLock: safeObj(n.technicalTargetLock || canonicalTechnicalTargetFromText(n.text || n.query || n.message || "")),
      technicalFollowUpLock: !!(n.technicalFollowUpLock || isTechnicalFollowUpIntent(n.text || n.query || n.message || "")),
      blockScheduleInterception: !!safeObj(n.technicalTargetLock || canonicalTechnicalTargetFromText(n.text || n.query || n.message || "")).targetPath,
      intent: safeStr((isPlainObject(cog) ? cog.intent : "") || "ADVANCE", 40) || "ADVANCE",
      endpoint: "marion://routeMarion.primary",
      bridgeCompatible: true,
      composerCompatible: true,
      stateSpineCompatible: true,
      bootstrapGuardCompatible: true,
      noCrossDomainBleed: true,
      inputSource,
      micTextParity: true,
      domainConfidence
    },
    stateSpinePatch: {
      source: "domainRouter",
      schema: "nyx.marion.stateSpine/1.7",
      shouldAdvanceState: false,
      domain: canonicalizeDomain(pick.primary),
      secondaryDomains: uniq((pick.secondary || []).map((d) => canonicalizeDomain(d)).filter(Boolean), 3),
      confidence: scored.confidence ? scored.confidence[pick.primary] : 0,
      domainConfidence,
      isolation: { noCrossDomainBleed: true, primaryLocked: true },
      inputSource,
      turnHash,
      continuityRegressionReady: true,
      micTextParity: true
    }
  };
}

module.exports = {
  ROUTER_VERSION,
  DOMAIN_ENUM,
  DEFAULT_DOMAIN_ORDER,
  canonicalizeDomain,
  scoreDomains,
  routeDomain,
  normalizeVoiceTextParityText,
  normalizeInputSource,
  canonicalTechnicalTargetFromText,
  isTechnicalFollowUpIntent,
  isInfrastructureContinuityPrompt,
  continuityHash,
  domainConfidenceProfile,
};
