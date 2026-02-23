"use strict";

/**
 * Utils/psycheBridge.js
 *
 * Psyche Bridge — Domain Aggregator for Nyx
 *
 * Purpose:
 *  - Keep MarionSO slim: Marion computes features/tokens and calls PsycheBridge.build()
 *  - PsycheBridge queries all enabled domain knowledge modules (Marion-safe APIs)
 *  - Produces ONE deterministic psyche object to hand to Nyx (atoms + control signals)
 *
 * Hard Rules:
 *  - NO RAW USER TEXT enters PsycheBridge. Ever.
 *  - Fail-open: if any domain module fails/missing, bridge still returns a valid psyche object.
 *  - Deterministic: stable merge ordering, bounded outputs, stable dedupe.
 *
 * Input:
 *  build({ features, tokens, queryKey, sessionKey, opts })
 *
 * Output:
 *  {
 *    version,
 *    queryKey,
 *    sessionKey,
 *    mode,
 *    intent,
 *    regulation,
 *    cognitiveLoad,
 *    stance,
 *    toneCues[],
 *    uiCues[],
 *    guardrails[],
 *    responseCues[],
 *    domains: { psychology, cyber, english, finance, law, ai },
 *    confidence,
 *    diag
 *  }
 */

// =========================
// OPTIONAL DOMAIN MODULES (FAIL-OPEN)
// =========================

function safeRequire(relPath) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(relPath);
  } catch (_e) {
    return null;
  }
}

// Adjust names if your repo uses different filenames.
const PsychologyK = safeRequire("./psychologyKnowledge");
const CyberK = safeRequire("./cyberKnowledge");
const EnglishK = safeRequire("./englishKnowledge");
const FinanceK = safeRequire("./financeKnowledge");
const LawK = safeRequire("./lawKnowledge");
const AIK = safeRequire("./aiKnowledge");

// =========================
// CONFIG
// =========================

const BRIDGE_VERSION = "1.0.2";

// deterministic caps
const LIMITS = Object.freeze({
  guardrails: 12,
  responseCues: 14,
  toneCues: 8,
  uiCues: 10,
  primer: 8,
  domainHits: 12,
  domainAtoms: 4,
});

// domain order matters for determinism + precedence
const DOMAIN_ORDER = Object.freeze([
  "psychology",
  "law",
  "cyber",
  "ai",
  "finance",
  "english",
]);

// defaults
const DEFAULTS = Object.freeze({
  mode: "normal",
  intent: "CLARIFY",
  regulation: "steady", // steady | strained | fragile | crisis
  cognitiveLoad: "medium",
  stance: "teach+verify",
});


// =========================
// FAIL-OPEN BASELINE
// =========================

function failOpenPsyche(err, input){
  const queryKey = safeStr(input?.queryKey || "", 32);
  const sessionKey = safeStr(input?.sessionKey || "", 64);
  const tokens = safeTokens(input?.tokens || [], 24);
  const features = isObject(input?.features) ? input.features : {};
  const msg = safeStr(err && (err.message || err.name || String(err)), 120) || "unknown_error";

  const empty = (name)=>({
    enabled: true,
    domain: name,
    queryKey: "",
    focus: "",
    stance: "",
    confidence: 0,
    primer: [],
    frameworks: [],
    guardrails: [],
    responseCues: [],
    snippets: [],
    examples: [],
    hits: [],
    reason: "fail_open",
    riskTier: "",
  });

  return {
    enabled: true,
    reason: "fail_open",
    version: BRIDGE_VERSION,
    queryKey,
    sessionKey,

    mode: "normal",
    intent: safeStr(features.intent || DEFAULTS.intent, 16).toUpperCase() || DEFAULTS.intent,
    regulation: "steady",
    cognitiveLoad: safeStr(features.cognitiveLoad || DEFAULTS.cognitiveLoad, 12).toLowerCase() || DEFAULTS.cognitiveLoad,
    stance: DEFAULTS.stance,

    toneCues: ["clear","supportive"],
    uiCues: [],

    guardrails: ["no_raw_user_text","fail_open_enabled"],
    responseCues: ["keep_short","ask_1_clarifier"],

    domains: {
      psychology: empty("psychology"),
      cyber: empty("cyber"),
      english: empty("english"),
      finance: empty("finance"),
      law: empty("law"),
      ai: empty("ai"),
    },

    confidence: 0,
    diag: {
      failOpen: true,
      error: msg,
      enabledDomains: { psychology:true, cyber:false, english:false, finance:false, law:false, ai:false },
      tokenCount: Array.isArray(tokens) ? tokens.length : 0,
    },
  };
}
// =========================
// HELPERS
// =========================

function isObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function safeStr(x, max = 80) {
  if (x === null || x === undefined) return "";
  const s = String(x);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function normalizeKey(x) {
  return safeStr(x, 120).trim().toLowerCase();
}

function uniqBounded(arr, max = 10, maxLen = 64) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(arr) ? arr : []) {
    const v = safeStr(it, maxLen).trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
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

function pickTop(arr, max) {
  return (Array.isArray(arr) ? arr : []).slice(0, max);
}

function safeTokens(tokens, max = 24) {
  const out = [];
  const seen = new Set();
  for (const t of Array.isArray(tokens) ? tokens : []) {
    const v = String(t || "").toLowerCase().trim().slice(0, 32);
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

// =========================
// DOMAIN CALL WRAPPERS (FAIL-OPEN)
// =========================

function callMarionHints(mod, input) {
  try {
    if (!mod || typeof mod.getMarionHints !== "function") return null;
    return mod.getMarionHints(input);
  } catch (_e) {
    return null;
  }
}

function callNyxProfile(mod, input) {
  try {
    if (!mod) return null;
    if (typeof mod.getNyxPsycheProfile === "function") return mod.getNyxPsycheProfile(input);
    // fallback: if only getMarionHints exists, we adapt it minimally
    if (typeof mod.getMarionHints === "function") return mod.getMarionHints(input);
    return null;
  } catch (_e) {
    return null;
  }
}

// =========================
// NORMALIZE DOMAIN SLICE
// =========================

function normalizeDomainSlice(domainName, raw) {
  const d = isObject(raw) ? raw : {};
  const out = {
    enabled: d.enabled !== false,
    domain: domainName,
    queryKey: safeStr(d.queryKey || "", 32),
    focus: safeStr(d.focus || "", 32),
    stance: safeStr(d.stance || "", 32),
    confidence: clamp01(d.confidence),

    // canonical atoms
    primer: uniqBounded(d.principles || d.primer || [], LIMITS.primer, 80),
    frameworks: uniqBounded(d.frameworks || [], 6, 48),
    guardrails: uniqBounded(d.guardrails || [], LIMITS.guardrails, 80),
    responseCues: uniqBounded(d.responseCues || [], LIMITS.responseCues, 48),

    // atoms only
    snippets: pickTop(d.snippets || [], LIMITS.domainAtoms),
    examples: pickTop(d.faceExamples || d.examples || [], LIMITS.domainAtoms),

    hits: uniqBounded(d.hits || [], LIMITS.domainHits, 120),
    reason: safeStr(d.reason || "", 32),
    riskTier: safeStr(d.riskTier || "", 12).toLowerCase(),
  };

  // If a module returned a "psyche profile" format, adapt:
  // (we keep it but map it into consistent fields)
  if (!out.focus && typeof d.focus === "string") out.focus = safeStr(d.focus, 32);

  return out;
}

// =========================
// GLOBAL PSYCHE RESOLUTION
// =========================

function resolveRegulation(features, psychSlice, tokens) {
  const f = isObject(features) ? features : {};
  const intent = safeStr(f.intent || DEFAULTS.intent, 16).toUpperCase();
  const reg = safeStr(f.regulationState || "", 18).toLowerCase();
  const load = safeStr(f.cognitiveLoad || DEFAULTS.cognitiveLoad, 12).toLowerCase();

  // psychology has precedence if it provides riskTier or focus/stance indicating stabilization
  const riskTier = safeStr(psychSlice?.riskTier || "", 12).toLowerCase();
  const tset = new Set(safeTokens(tokens, 24));

  if (riskTier === "high") return "crisis";
  if (intent === "STABILIZE" || reg === "dysregulated") return "fragile";
  if (load === "high") return "strained";

  // if upstream tokenization encoded high-risk canonical tokens (safe-derived), allow escalation
  if (tset.has("self_harm") || tset.has("suicide") || tset.has("harm")) return "crisis";

  return "steady";
}

function resolveStance(features, regulation, psychSlice) {
  const f = isObject(features) ? features : {};
  const intent = safeStr(f.intent || DEFAULTS.intent, 16).toUpperCase();
  const desire = safeStr(f.desire || "", 16).toLowerCase();

  if (regulation === "crisis" || regulation === "fragile") return "contain+options";
  if (intent === "ADVANCE" || intent === "EXECUTE") return "confirm+execute";
  if (desire === "mastery") return "teach+structure";

  // psych hint can override gently if present
  const ps = safeStr(psychSlice?.stance || "", 32);
  return ps || DEFAULTS.stance;
}

function resolveMode(regulation) {
  if (regulation === "crisis") return "safety";
  if (regulation === "fragile") return "stabilize";
  return "normal";
}

function mergeByPrecedence(domainSlices, field, max, maxLen) {
  // deterministic merge based on DOMAIN_ORDER precedence
  const merged = [];
  for (const name of DOMAIN_ORDER) {
    const slice = domainSlices[name];
    if (!slice || slice.enabled === false) continue;
    const arr = slice[field];
    for (const it of Array.isArray(arr) ? arr : []) merged.push(it);
  }
  return uniqBounded(merged, max, maxLen);
}

function computeOverallConfidence(domainSlices) {
  // simple stable blend: weighted mean with psychology bias
  const weights = {
    psychology: 1.6,
    law: 1.2,
    cyber: 1.2,
    ai: 1.1,
    finance: 1.0,
    english: 0.9,
  };

  let sum = 0;
  let wsum = 0;
  for (const name of Object.keys(domainSlices || {})) {
    const s = domainSlices[name];
    if (!s || s.enabled === false) continue;
    const w = weights[name] || 1.0;
    sum += clamp01(s.confidence) * w;
    wsum += w;
  }
  if (!wsum) return 0;
  return clamp01(sum / wsum);
}

// =========================
// ROUTING (bridge all knowledge, but avoid noise)
// =========================

function chooseEnabledDomains(features, tokens, opts) {
  // You asked “bridge all knowledge,” so default is all ON.
  // But we still allow optional downshifting via opts for performance.
  const o = isObject(opts) ? opts : {};
  const enableAll = o.enableAll !== false;

  const enabled = {
    psychology: true,
    cyber: enableAll,
    english: enableAll,
    finance: enableAll,
    law: enableAll,
    ai: enableAll,
  };

  // Optional: if you want a minimal mode on high load / safety, reduce non-critical domains.
  const f = isObject(features) ? features : {};
  const load = safeStr(f.cognitiveLoad || "", 12).toLowerCase();
  const intent = safeStr(f.intent || "", 16).toUpperCase();
  const reg = safeStr(f.regulationState || "", 18).toLowerCase();

  if (o.reduceOnStabilize && (intent === "STABILIZE" || reg === "dysregulated" || load === "high")) {
    enabled.law = !!o.keepLawOnStabilize;
    enabled.cyber = !!o.keepCyberOnStabilize;
    enabled.ai = !!o.keepAIOnStabilize;
    enabled.finance = false;
    enabled.english = false;
  }

  // explicit overrides
  if (isObject(o.domains)) {
    for (const k of Object.keys(o.domains)) enabled[k] = !!o.domains[k];
  }

  return enabled;
}

// =========================
// MAIN: BUILD PSYCHE
// =========================

function build(input) {
  try {
  const features0 = isObject(input?.features) ? input.features : {};
  const tokens = safeTokens(input?.tokens || [], 24);
  const queryKey = safeStr(input?.queryKey || "", 32);
  const sessionKey = safeStr(input?.sessionKey || "", 64);
  const opts = isObject(input?.opts) ? input.opts : {};

  // Allow the caller to force psych routing without introducing raw user text.
  const forcePsychBridge = !!(opts.forcePsychBridge || features0.forcePsychBridge || features0.forcePsych || features0.psychBridge);

  // Never mutate caller-provided features.
  const features = { ...features0 };
  if(forcePsychBridge){
    if(!features.intent) features.intent = "SUPPORT";
    if(!features.regulationState) features.regulationState = "dysregulated";
    if(!features.cognitiveLoad) features.cognitiveLoad = "high";
    features.__forcePsychBridge = true;
  }

  const enabled = chooseEnabledDomains(features, tokens, opts);

  const commonIn = { features, tokens, queryKey };

  // gather domain raw outputs (fail-open)
  const raw = {
    psychology: enabled.psychology ? callNyxProfile(PsychologyK, commonIn) : null,
    cyber: enabled.cyber ? callNyxProfile(CyberK, commonIn) : null,
    english: enabled.english ? callNyxProfile(EnglishK, commonIn) : null,
    finance: enabled.finance ? callNyxProfile(FinanceK, commonIn) : null,
    law: enabled.law ? callNyxProfile(LawK, commonIn) : null,
    ai: enabled.ai ? callNyxProfile(AIK, commonIn) : null,
  };

  // normalize slices
  const domains = {
    psychology: normalizeDomainSlice("psychology", raw.psychology),
    cyber: normalizeDomainSlice("cyber", raw.cyber),
    english: normalizeDomainSlice("english", raw.english),
    finance: normalizeDomainSlice("finance", raw.finance),
    law: normalizeDomainSlice("law", raw.law),
    ai: normalizeDomainSlice("ai", raw.ai),
  };

  // global resolution (psych precedence)
  const regulation = resolveRegulation(features, domains.psychology, tokens);
  const mode = resolveMode(regulation);

  const intent = safeStr(features.intent || DEFAULTS.intent, 16).toUpperCase();
  const cognitiveLoad = safeStr(features.cognitiveLoad || DEFAULTS.cognitiveLoad, 12).toLowerCase();
  const stance = resolveStance(features, regulation, domains.psychology);

  // global merges (deterministic, precedence)
  const guardrails = mergeByPrecedence(domains, "guardrails", LIMITS.guardrails, 80);
  const responseCues = mergeByPrecedence(domains, "responseCues", LIMITS.responseCues, 48);

  // Reinforcement hooks: safe, deterministic cues for both positive + negative reinforcement.
  if((features.__forcePsychBridge) || mode==="stabilize" || mode==="safety"){
    responseCues.unshift("validate_emotion","ask_feeling_context","offer_options");
    responseCues.unshift("avoid_shaming","avoid_minimizing");
  } else {
    responseCues.unshift("reinforce_progress","gentle_reframe");
  }

  // toneCues + uiCues: derived primarily from regulation + stance + some domain cues
  const toneCues = [];
  const uiCues = [];

  if (features.__forcePsychBridge){
    uiCues.push("hide_nav_prompts","compact_reply");
  }

  if (mode === "safety") {
    toneCues.push("calm", "direct", "safety_first");
    uiCues.push("minimize_choices", "show_help_options", "compact_reply");
  } else if (mode === "stabilize") {
    toneCues.push("warm", "grounded", "short_sentences");
    uiCues.push("minimize_choices", "show_grounding_chip", "compact_reply");
  } else {
    toneCues.push("clear", "supportive");
  }

  if (stance === "confirm+execute") uiCues.push("confirm_then_run");
  if (responseCues.includes("ask_1_clarifier")) uiCues.push("single_clarifier_prompt");
  if (responseCues.includes("keep_short")) uiCues.push("compact_reply");

  // include domain-provided “tone/ui” if you decide to add them later (safe)
  // (kept generic here)

  const mergedTone = uniqBounded(toneCues, LIMITS.toneCues, 24);
  const mergedUI = uniqBounded(uiCues, LIMITS.uiCues, 32);

  const confidence = computeOverallConfidence(domains);

  // diagnostics (safe)
  const diag = {
    enabledDomains: enabled,
    domainConfidence: {
      psychology: domains.psychology.confidence,
      law: domains.law.confidence,
      cyber: domains.cyber.confidence,
      ai: domains.ai.confidence,
      finance: domains.finance.confidence,
      english: domains.english.confidence,
    },
    regulation,
    mode,
    stance,
  };

  return {
    version: BRIDGE_VERSION,
    queryKey,
    sessionKey,

    mode,
    intent,
    regulation,
    cognitiveLoad,
    stance,

    toneCues: mergedTone,
    uiCues: mergedUI,

    guardrails,
    responseCues: uniqBounded(responseCues, LIMITS.responseCues, 48),

    domains,

    confidence,
    diag,
  };
  }
  catch(e){
    return failOpenPsyche(e, input);
  }
}

// For MarionSO convenience: a slimmer wrapper name.
function buildPsyche(input) {
  return build(input);
}

module.exports = {
  build,
  buildPsyche,

  // optional exports for testing
  _internal: {
    normalizeDomainSlice,
    resolveRegulation,
    resolveStance,
    mergeByPrecedence,
    chooseEnabledDomains,
  },
};
