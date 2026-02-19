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

const ROUTER_VERSION = "domainRouter v1.0.0";

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
  MUSIC: "music", // (if you use it)
  PSY: "psychology",
  CYBER: "cyber",
  EN: "english",
  LAW: "law",
  FIN: "fin",
  STRAT: "strategy",
  AI: "ai",
  MKT: "marketing", // optional if you add later
});

const DEFAULT_DOMAIN_ORDER = Object.freeze([
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
  [DOMAIN_ENUM.AI]: [
    /\b(artificial intelligence|machine learning|deep learning|neural|transformer|llm|prompt|rag|embedding|vector|fine[-\s]?tune|agent(s)?|tool use|reasoning|inference|model eval|alignment|rlhf|policy)\b/,
    /\b(pytorch|tensorflow|keras|hugging ?face|onnx|openai|anthropic|gemini|llama|mistral)\b/,
  ],
  [DOMAIN_ENUM.FIN]: [
    /\b(finance|economics|pricing|revenue|profit|margin|cash ?flow|forecast|budget|breakeven|roi|npv|irr|capm|wacc|beta|discount rate)\b/,
    /\b(ltv|cac|unit economics|cohort|churn|arpu|mrr|arr|gross margin)\b/,
    /\b(bonds?|equities|stocks?|capital markets|yield curve|rates?|inflation|gdp|fiscal|monetary)\b/,
  ],
  [DOMAIN_ENUM.LAW]: [
    /\b(law|legal|contract|nda|terms|liability|compliance|copyright|trademark|privacy law|gdpr|pipeda|caselaw|jurisdiction)\b/,
    /\b(ethics|ethical|duty of care|fiduciary|negligence|damages)\b/,
  ],
  [DOMAIN_ENUM.CYBER]: [
    /\b(cyber|security|infosec|phish|malware|ransom|breach|exploit|vulnerability|patch|zero[-\s]?day|ddos|xss|sql injection|auth|mfa)\b/,
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

  if (lane === "law") scores[DOMAIN_ENUM.LAW] += 2.2;
  if (lane === "finance" || lane === "fin") scores[DOMAIN_ENUM.FIN] += 2.2;
  if (lane === "cyber") scores[DOMAIN_ENUM.CYBER] += 2.2;
  if (lane === "psychology" || lane === "psy") scores[DOMAIN_ENUM.PSY] += 2.2;
  if (lane === "english" || lane === "writing") scores[DOMAIN_ENUM.EN] += 2.2;
  if (lane === "strategy") scores[DOMAIN_ENUM.STRAT] += 2.0;
  if (lane === "ai" || lane === "artificial_intelligence") scores[DOMAIN_ENUM.AI] += 2.4;

  // action routing (your ecosystem uses lots of actions; keep generic)
  if (/contract|nda|terms|policy/.test(action)) scores[DOMAIN_ENUM.LAW] += 1.4;
  if (/budget|pricing|unit|invoice|forecast|finance/.test(action)) scores[DOMAIN_ENUM.FIN] += 1.4;
  if (/phish|breach|malware|security/.test(action)) scores[DOMAIN_ENUM.CYBER] += 1.4;
  if (/rewrite|edit|proof|summarize/.test(action)) scores[DOMAIN_ENUM.EN] += 1.2;
  if (/strategy|roadmap|milestone|kpi/.test(action)) scores[DOMAIN_ENUM.STRAT] += 1.1;
  if (/ai|agent|rag|llm|model|prompt/.test(action)) scores[DOMAIN_ENUM.AI] += 1.6;

  return scores;
}

function applyKeywordSignals(scores, norm) {
  const text = safeStr(isPlainObject(norm) ? norm.text : "", 1400);

  for (const [domain, patterns] of Object.entries(KEYWORDS)) {
    if (hasAny(text, patterns)) {
      scores[domain] += 2.0;
    }
  }

  // Extra boosts for cross-domain coupling phrases
  const t = text.toLowerCase();
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
  applyIntentMode(scores, c, s);
  applyRiskClamp(scores, c);

  // If nothing hit, keep core
  const sum = Object.values(scores).reduce((acc, v) => acc + (Number.isFinite(Number(v)) ? Number(v) : 0), 0);
  if (sum <= 0.001) {
    scores[DOMAIN_ENUM.CORE] = 1.0;
    signals.push("fallback:core");
  }

  // Signal summaries (no raw text)
  const lane = normToken(n.lane || "");
  const action = normToken(n.action || "");
  const intent = safeStr(c.intent || "", 12).toUpperCase();
  const tier = safeStr(c.riskTier || "", 10).toLowerCase();

  if (lane) signals.push(`lane:${lane}`);
  if (action) signals.push(`action:${action.slice(0, 18)}`);
  if (intent) signals.push(`intent:${intent}`);
  if (tier) signals.push(`risk:${tier}`);

  const normalized = normalizeScores(scores);

  return {
    ok: true,
    routerVersion: ROUTER_VERSION,
    scores: normalized.scores,
    confidence: normalized.confidence,
    signals: uniq(signals, 10),
  };
}

function routeDomain(norm, session, cog, opts = {}) {
  const scored = scoreDomains(norm, session, cog, opts);
  const pick = pickTopDomains(scored.scores, {
    maxSecondary: Number.isFinite(Number(opts.maxSecondary)) ? Number(opts.maxSecondary) : 2,
    minSecondaryScore: Number.isFinite(Number(opts.minSecondaryScore)) ? Number(opts.minSecondaryScore) : 1.6,
  });

  // reason (compact)
  const reason = {
    primary: pick.primary,
    secondary: pick.secondary,
    confidence: scored.confidence ? scored.confidence[pick.primary] : 0,
    signals: scored.signals,
  };

  return {
    ok: true,
    routerVersion: ROUTER_VERSION,
    primary: pick.primary,
    secondary: pick.secondary,
    reason,
    signals: scored.signals,
  };
}

module.exports = {
  ROUTER_VERSION,
  DOMAIN_ENUM,
  DEFAULT_DOMAIN_ORDER,
  scoreDomains,
  routeDomain,
};
