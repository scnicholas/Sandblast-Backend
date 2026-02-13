"use strict";

/**
 * Utils/marionSO.js
 *
 * MarionSO — Separate Object (SO) mediator module for Nyx.
 * Pure, side-effect-free cognition mediator:
 *   mediate(norm, session, opts) -> cog object
 *
 * Goals:
 * - Keep chatEngine deterministic: Marion only classifies/mediates (mode/intent/budget/dominance)
 * - Keep it safe: no raw user text in traces; bounded outputs; fail-open behavior
 * - Keep it portable: no express, no fs, no index.js imports
 *
 * v1.1.0 (ENGLISH KNOWLEDGE WIRE++++ + CYBER/PSY FAIL-OPEN++++ + NO-RAW-TEXT DOCTRINE PRESERVED++++)
 * ✅ Adds: optional integration to Utils/englishKnowledge.js (mediator-safe query)
 * ✅ Adds: englishKnowledgeHints payload (bounded, non-PII, no raw user text) for chatEngine to consume
 * ✅ Keeps: psychologyKnowledge integration + cyberKnowledge integration + Law/Ethics/RiskBridge/Cyber/English/Fin/Strategy layers
 */

const MARION_VERSION = "marionSO v1.1.0";

// -------------------------
// Optional Knowledge modules (FAIL-OPEN)
// -------------------------
let PsychologyK = null;
try {
  // eslint-disable-next-line global-require
  PsychologyK = require("./psychologyKnowledge");
} catch (e) {
  PsychologyK = null;
}

let CyberK = null;
try {
  // eslint-disable-next-line global-require
  CyberK = require("./cyberKnowledge");
} catch (e) {
  CyberK = null;
}

let EnglishK = null;
try {
  // eslint-disable-next-line global-require
  EnglishK = require("./englishKnowledge");
} catch (e) {
  EnglishK = null;
}

// -------------------------
// helpers
// -------------------------
function nowMsDefault() {
  return Date.now();
}
function safeStr(x, max = 200) {
  if (x === null || x === undefined) return "";
  const s = String(x);
  return s.length > max ? s.slice(0, max) + "…" : s;
}
function isPlainObject(x) {
  return (
    !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype ||
      Object.getPrototypeOf(x) === null)
  );
}
function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
function truthy(v) {
  if (v === true) return true;
  const s = safeStr(v, 40).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}
function sha1Lite(str) {
  // small stable hash (NOT cryptographic) for traces
  const s = safeStr(str, 2000);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
function normYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t < 1900 || t > 2100) return null;
  return t;
}
function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  const t = Math.trunc(x);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}
function uniqBounded(arr, max = 8) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(arr) ? arr : []) {
    const v = safeStr(it, 80);
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}
function toUpperToken(x, max = 24) {
  return safeStr(x, max).trim().toUpperCase();
}
function toLowerToken(x, max = 24) {
  return safeStr(x, max).trim().toLowerCase();
}

// -------------------------
// enums + contracts
// -------------------------
const LATENT_DESIRE = Object.freeze({
  AUTHORITY: "authority",
  COMFORT: "comfort",
  CURIOSITY: "curiosity",
  VALIDATION: "validation",
  MASTERY: "mastery",
});

const MARION_TRACE_MAX = 160; // hard cap in chars

// PsychologyReasoningObject v1 (always-on, bounded, nonverbal)
const PSYCH = Object.freeze({
  LOAD: Object.freeze({
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
  }),
  REG: Object.freeze({
    REGULATED: "regulated",
    STRAINED: "strained",
    DYSREGULATED: "dysregulated",
  }),
  AGENCY: Object.freeze({
    GUIDED: "guided",
    AUTONOMOUS: "autonomous",
  }),
  PRESSURE: Object.freeze({
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
  }),
});

// Law Layer v1 (constitutional, ordered precedence)
const LAW = Object.freeze({
  TAGS: Object.freeze({
    CONTAINMENT: "law:containment",
    ACTION_SUPREMACY: "law:action_supremacy",
    NO_SPIN: "law:no_spin",
    BUDGET_CLAMP: "law:budget_clamp",
    COHERENCE: "law:coherence",
    VELVET_GUARD: "law:velvet_guard",
  }),
});

// Ethics Layer v1 (bounded, non-clinical, non-legal)
const ETHICS = Object.freeze({
  TAGS: Object.freeze({
    NON_DECEPTIVE: "ethics:non_deceptive",
    AGENCY_RESPECT: "ethics:agency_respect",
    HARM_AVOIDANCE: "ethics:harm_avoidance",
    PRIVACY_MIN: "ethics:privacy_min",
    SAFETY_REDIRECT: "ethics:safety_redirect",
  }),
  SIGNALS: Object.freeze({
    MINIMIZE_RISKY_DETAIL: "minimize_risky_detail",
    USE_NEUTRAL_TONE: "use_neutral_tone",
    OFFER_OPTIONS_NOT_ORDERS: "offer_options_not_ORDERS",
    ENCOURAGE_HELP_SEEKING: "encourage_help_seeking",
  }),
});

// RiskBridge v1 (cross-layer aggregation; Law is final)
const RISK = Object.freeze({
  TIERS: Object.freeze({
    NONE: "none",
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
  }),
  DOMAINS: Object.freeze({
    SELF_HARM: "risk:self_harm",
    VIOLENCE: "risk:violence",
    ILLEGAL: "risk:illegal",
    PRIVACY: "risk:privacy",
    SEXUAL: "risk:sexual",
    HATE: "risk:hate",
    MEDICAL: "risk:medical",
    LEGAL: "risk:legal",
    FINANCIAL: "risk:financial",
    CYBER: "risk:cyber",
  }),
});

// Cybersecurity Layer v1 (defensive-first, bounded, non-operational)
const CYBER = Object.freeze({
  TAGS: Object.freeze({
    DEFENSIVE_ONLY: "cyber:defensive_only",
    THREAT_AWARENESS: "cyber:threat_awareness",
    SOCIAL_ENGINEERING: "cyber:social_engineering",
    PRIVACY_HYGIENE: "cyber:privacy_hygiene",
    HARDENING: "cyber:hardening",
    REDTEAM_BLOCK: "cyber:redteam_block",
  }),
  SIGNALS: Object.freeze({
    SAFE_DEFAULTS: "cyber_safe_defaults",
    AVOID_STEP_BY_STEP: "cyber_avoid_step_by_step",
    SUGGEST_DEFENSIVE_ALTS: "cyber_suggest_defensive_alternatives",
    VERIFY_SOURCE: "cyber_verify_source",
    MINIMIZE_SENSITIVE_DATA: "cyber_minimize_sensitive_data",
  }),
});

// English / communication Layer v1 (clarity + structure)
const ENGLISH = Object.freeze({
  TAGS: Object.freeze({
    CLARITY: "en:clarity",
    STRUCTURE: "en:structure",
    AUDIENCE: "en:audience",
    TONE: "en:tone",
    DEFINITIONS: "en:defn",
  }),
  SIGNALS: Object.freeze({
    USE_PLAIN_LANGUAGE: "en_use_plain_language",
    DEFINE_JARGON: "en_define_jargon",
    ASK_AUDIENCE: "en_ask_audience",
    BULLET_STRUCTURE: "en_bullets",
    SHORT_SENTENCES: "en_short_sentences",
  }),
});

// Finance/Econ Layer v1 (non-advice posture + unit economics)
const FIN = Object.freeze({
  TAGS: Object.freeze({
    NON_ADVICE: "fin:non_advice",
    RISK_DISCLOSURE: "fin:risk_disclosure",
    BUDGETING: "fin:budgeting",
    UNIT_ECON: "fin:unit_econ",
    PRICING: "fin:pricing",
    COMPLIANCE: "fin:compliance",
  }),
  SIGNALS: Object.freeze({
    USE_SCENARIOS: "fin_use_scenarios",
    ASK_CONSTRAINTS: "fin_ask_constraints",
    ENCOURAGE_PRO: "fin_encourage_pro",
    CLARIFY_ASSUMPTIONS: "fin_clarify_assumptions",
  }),
});

// Strategy Layer v1 (systems thinking + decision-making cues)
const STRATEGY = Object.freeze({
  TAGS: Object.freeze({
    TRADEOFFS: "strat:tradeoffs",
    METRICS: "strat:metrics",
    SEQUENCING: "strat:sequencing",
    RISK: "strat:risk",
    OPTION_VALUE: "strat:option_value",
    EXECUTION: "strat:execution",
  }),
  SIGNALS: Object.freeze({
    DECISION_MATRIX: "strat_decision_matrix",
    DEFINE_GOAL: "strat_define_goal",
    IDENTIFY_CONSTRAINTS: "strat_identify_constraints",
    NEXT_ACTIONS: "strat_next_actions",
    TIME_HORIZON: "strat_time_horizon",
  }),
});

// Marion narration style contract (canonical policy hints)
const MARION_STYLE_CONTRACT = Object.freeze({
  maxSentences: 2,
  forbidTokens: [
    "sorry",
    "unfortunately",
    "i think",
    "maybe",
    "might",
    "i’m sorry",
    "im sorry",
  ],
  allowMetaphor: false,
  tone: "system",
  tags: Object.freeze({
    ok: "[marion:ok]",
    hold: "[marion:hold]",
    retry: "[marion:retry]",
    deny: "[marion:deny]",
  }),
  handoff: Object.freeze({
    marionEndsHard: true,
    nyxBeginsAfter: true,
    allowSameTurnSplit: true,
  }),
});

// -------------------------
// mac mode inference (lightweight)
// -------------------------
function normalizeMacModeRaw(v) {
  const s = safeStr(v, 60).trim().toLowerCase();
  if (!s) return "";
  if (s === "architect" || s === "builder" || s === "dev") return "architect";
  if (s === "user" || s === "viewer" || s === "consumer") return "user";
  if (s === "transitional" || s === "mixed" || s === "both") return "transitional";
  return "";
}

function detectMacModeImplicit(text) {
  // scan for inference but never store raw text
  const t = safeStr(text, 1400).trim();
  if (!t) return { mode: "", scoreA: 0, scoreU: 0, scoreT: 0, why: [] };

  const s = t.toLowerCase();
  let a = 0,
    u = 0,
    tr = 0;
  const why = [];

  // Architect signals
  if (/\b(let's|lets)\s+(define|design|lock|implement|encode|ship|wire)\b/.test(s)) {
    a += 3;
    why.push("architect:lets-define/design");
  }
  if (
    /\b(non[-\s]?negotiable|must|hard rule|lock this in|constitution|mediator|pipeline|governor|decision table)\b/.test(
      s
    )
  ) {
    a += 3;
    why.push("architect:constraints/architecture");
  }
  if (/\b(step\s*\d+|1\s*,\s*2\s*,\s*3|1\s*2\s*3)\b/.test(s) || /\b\d+\)\s/.test(s)) {
    a += 2;
    why.push("architect:enumeration");
  }
  if (
    /\b(index\.js|chatengine\.js|statespine\.js|render|cors|session|payload|json|endpoint|route|resolver|pack|tests?)\b/.test(
      s
    )
  ) {
    a += 2;
    why.push("architect:technical");
  }

  // User signals
  if (
    /\b(i('?m)?\s+not\s+sure|help\s+me\s+understand|does\s+this\s+make\s+sense|where\s+do i|get\s+the\s+url)\b/.test(
      s
    )
  ) {
    u += 3;
    why.push("user:uncertainty/how-to");
  }
  if (/\b(confused|stuck|frustrated|overwhelmed|worried)\b/.test(s)) {
    u += 2;
    why.push("user:emotion");
  }

  // Transitional signals
  if (a > 0 && u > 0) {
    tr += 3;
    why.push("transitional:mixed-signals");
  }

  let mode = "";
  if (tr >= 3) mode = "transitional";
  else if (a >= u + 2) mode = "architect";
  else if (u >= a + 2) mode = "user";

  return { mode, scoreA: a, scoreU: u, scoreT: tr, why };
}

function suggestModeHysteresisPatch(session, chosenMode, implicit) {
  // No mutation; merely suggests what caller *could* patch into session.
  const s = isPlainObject(session) ? session : {};
  const prevMode = normalizeMacModeRaw(s.macMode || s.mode || s.lastMode || "");
  const nextMode = normalizeMacModeRaw(chosenMode);

  if (!nextMode) return null;

  const confA = Number(implicit?.scoreA) || 0;
  const confU = Number(implicit?.scoreU) || 0;
  const confT = Number(implicit?.scoreT) || 0;

  // confidence heuristic (conservative)
  let conf = 0.55;
  if (nextMode === "transitional") conf = 0.65;
  else if (nextMode === "architect") conf = clamp01(0.5 + confA * 0.05);
  else if (nextMode === "user") conf = clamp01(0.5 + confU * 0.05);

  // Hysteresis: don’t thrash modes on weak signal.
  if (prevMode && prevMode !== nextMode && conf < 0.7) {
    return {
      sessionPatchSuggestion: {
        macMode: prevMode,
        macModeStability: "held",
        macModeConfidence: clamp01(conf),
        macModeCandidate: nextMode,
      },
      effectiveMode: prevMode,
    };
  }

  return {
    sessionPatchSuggestion: {
      macMode: nextMode,
      macModeStability: prevMode === nextMode ? "steady" : "switched",
      macModeConfidence: clamp01(conf),
      macModeCandidate: nextMode,
      macModeScores: { a: confA, u: confU, t: confT },
    },
    effectiveMode: nextMode,
  };
}

// -------------------------
// shared: safe token set
// -------------------------
function safeTokenSet(tokens, max = 10) {
  const out = [];
  const seen = new Set();
  for (const t of Array.isArray(tokens) ? tokens : []) {
    const v = safeStr(t, 32).trim().toLowerCase();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

// -------------------------
// PSYCHOLOGY KNOWLEDGE WIRE (bounded, non-PII)
// -------------------------
function buildPsychologyQuery(norm, session, cog) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(session) ? session : {};
  const c = isPlainObject(cog) ? cog : {};

  // STRICT: avoid passing norm.text entirely.
  const action = safeStr(n.action || "", 24).trim().toLowerCase();
  const lane = safeStr(n.lane || s.lane || "", 24).trim().toLowerCase();
  const intent = safeStr(c.intent || "", 12).trim().toUpperCase();
  const mode = safeStr(c.mode || "", 16).trim().toLowerCase();
  const desire = safeStr(c.latentDesire || "", 16).trim().toLowerCase();

  const reg = safeStr(c?.psychology?.regulationState || "", 16);
  const load = safeStr(c?.psychology?.cognitiveLoad || "", 12);
  const agency = safeStr(c?.psychology?.agencyPreference || "", 16);
  const pressure = safeStr(c?.psychology?.socialPressure || "", 12);

  const riskTier = safeStr(c.riskTier || "", 10).trim().toLowerCase();
  const riskDomains = safeTokenSet(c.riskDomains || [], 6);

  // coarse “needs” signals (safe)
  const needs = [];
  if (intent === "STABILIZE" || reg === PSYCH.REG.DYSREGULATED) needs.push("regulation");
  if (reg === PSYCH.REG.STRAINED) needs.push("reduce_load");
  if (load === PSYCH.LOAD.HIGH) needs.push("brevity");
  if (agency === PSYCH.AGENCY.AUTONOMOUS) needs.push("options");
  if (desire === "mastery") needs.push("framework");
  if (desire === "comfort") needs.push("validation");
  if (riskTier === "high" || riskDomains.includes("risk:self_harm")) needs.push("safety_redirect");

  const tokens = safeTokenSet(
    [
      lane || "",
      action || "",
      intent || "",
      mode || "",
      desire || "",
      reg || "",
      load || "",
      pressure || "",
      ...riskDomains,
      ...needs,
    ],
    12
  );

  const keyObj = {
    lane,
    action,
    intent,
    mode,
    desire,
    reg,
    load,
    agency,
    pressure,
    riskTier,
    riskDomains,
    tokens,
  };

  const queryKey = sha1Lite(JSON.stringify(keyObj)).slice(0, 14);

  return {
    enabled: true,
    queryKey,
    tokens,
    features: {
      lane,
      action,
      intent,
      mode,
      desire,
      regulationState: reg,
      cognitiveLoad: load,
      agencyPreference: agency,
      socialPressure: pressure,
      riskTier,
      riskDomains,
      needs: safeTokenSet(needs, 8),
    },
  };
}

function clampPsychHints(hints) {
  const h = isPlainObject(hints) ? hints : {};
  const out = {
    enabled: !!h.enabled,
    queryKey: safeStr(h.queryKey || "", 18),
    packs: isPlainObject(h.packs)
      ? {
          foundations: safeStr(h.packs.foundations || "", 32),
          clinicalSafety: safeStr(h.packs.clinicalSafety || "", 32),
          biases: safeStr(h.packs.biases || "", 32),
        }
      : {},
    focus: safeStr(h.focus || "", 32),
    stance: safeStr(h.stance || "", 32),
    principles: uniqBounded(h.principles || [], 8),
    frameworks: uniqBounded(h.frameworks || [], 6),
    guardrails: uniqBounded(h.guardrails || [], 6),
    exampleTypes: uniqBounded(h.exampleTypes || [], 6),
    responseCues: uniqBounded(h.responseCues || [], 8),
    hits: uniqBounded(h.hits || [], 10),
    confidence: clamp01(h.confidence),
    reason: safeStr(h.reason || "", 60),
  };
  return out;
}

function queryPsychologyKnowledge(norm, session, cog) {
  const q = buildPsychologyQuery(norm, session, cog);
  if (!q.enabled) return { enabled: false, reason: "disabled" };

  if (!PsychologyK || typeof PsychologyK !== "object") {
    return { enabled: false, reason: "module_missing" };
  }

  try {
    if (typeof PsychologyK.getMarionHints === "function") {
      const res = PsychologyK.getMarionHints(
        { features: q.features, tokens: q.tokens, queryKey: q.queryKey },
        { session: isPlainObject(session) ? session : {}, cog: isPlainObject(cog) ? cog : {} }
      );
      const h = clampPsychHints(res);
      return { ...h, enabled: true, queryKey: q.queryKey };
    }

    if (typeof PsychologyK.query === "function") {
      const res = PsychologyK.query({ features: q.features, tokens: q.tokens, queryKey: q.queryKey });
      const h = clampPsychHints(res);
      return { ...h, enabled: true, queryKey: q.queryKey };
    }

    if (typeof PsychologyK.mediatePsych === "function") {
      const res = PsychologyK.mediatePsych({ features: q.features, tokens: q.tokens, queryKey: q.queryKey });
      const h = clampPsychHints(res);
      return { ...h, enabled: true, queryKey: q.queryKey };
    }

    const packs = isPlainObject(PsychologyK.PACKS) ? PsychologyK.PACKS : null;
    if (packs) {
      return clampPsychHints({
        enabled: true,
        queryKey: q.queryKey,
        packs: {
          foundations: packs.foundations || "",
          clinicalSafety: packs.clinicalSafety || "",
          biases: packs.biases || "",
        },
        confidence: 0,
        reason: "packs_only",
      });
    }

    return { enabled: false, reason: "no_api" };
  } catch (e) {
    const code = safeStr(e && (e.code || e.name) ? e.code || e.name : "ERR", 40);
    return { enabled: false, reason: `psych_query_fail:${code}` };
  }
}

// -------------------------
// CYBER KNOWLEDGE WIRE (bounded, non-PII, NO RAW TEXT)
// -------------------------
function buildCyberQuery(norm, session, cog) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(session) ? session : {};
  const c = isPlainObject(cog) ? cog : {};

  // STRICT: do NOT pass n.text
  const action = safeStr(n.action || "", 24).trim().toLowerCase();
  const lane = safeStr(n.lane || s.lane || "", 24).trim().toLowerCase();
  const intent = safeStr(c.intent || "", 12).trim().toUpperCase();
  const mode = safeStr(c.mode || "", 16).trim().toLowerCase();

  const riskTier = safeStr(c.riskTier || "", 10).trim().toLowerCase();
  const riskDomains = safeTokenSet(c.riskDomains || [], 6);

  const cyberTags = safeTokenSet(c.cyberTags || [], 8);
  const cyberSignals = safeTokenSet(c.cyberSignals || [], 8);

  // “needs” tokens (safe)
  const needs = [];
  if (cyberTags.includes(CYBER.TAGS.REDTEAM_BLOCK)) needs.push("posture");
  if (riskDomains.includes(RISK.DOMAINS.CYBER)) needs.push("risk:cyber");
  if (riskTier === RISK.TIERS.HIGH) needs.push("contain");
  if (intent === "ADVANCE") needs.push("mitigation");
  if (intent === "CLARIFY") needs.push("triage");
  if (intent === "STABILIZE") needs.push("containment");

  const tokens = safeTokenSet(
    [
      "risk:cyber",
      lane || "",
      action || "",
      intent || "",
      mode || "",
      riskTier || "",
      ...riskDomains,
      ...cyberTags,
      ...cyberSignals,
      ...needs,
    ],
    14
  );

  const keyObj = { lane, action, intent, mode, riskTier, riskDomains, cyberTags, cyberSignals, tokens };
  const queryKey = sha1Lite(JSON.stringify(keyObj)).slice(0, 14);

  return {
    enabled: true,
    queryKey,
    tokens,
    features: {
      lane,
      action,
      intent,
      mode,
      riskTier,
      riskDomains,
      cyberTags,
      cyberSignals,
      needs: safeTokenSet(needs, 8),
    },
  };
}

function clampCyberHints(hints) {
  const h = isPlainObject(hints) ? hints : {};
  return {
    enabled: !!h.enabled,
    queryKey: safeStr(h.queryKey || "", 18),
    packs: isPlainObject(h.packs)
      ? {
          safetyPosture: safeStr(h.packs.safetyPosture || "", 48),
          topPacks: uniqBounded(h.packs.topPacks || [], 3),
          versions: isPlainObject(h.packs.versions) ? h.packs.versions : {},
        }
      : {},
    focus: safeStr(h.focus || "", 32),
    stance: safeStr(h.stance || "", 32),
    principles: uniqBounded(h.principles || [], 8),
    frameworks: uniqBounded(h.frameworks || [], 6),
    guardrails: uniqBounded(h.guardrails || [], 6),
    exampleTypes: uniqBounded(h.exampleTypes || [], 6),
    responseCues: uniqBounded(h.responseCues || [], 8),
    hits: uniqBounded(h.hits || [], 10),
    confidence: clamp01(h.confidence),
    reason: safeStr(h.reason || "", 60),
  };
}

function queryCyberKnowledge(norm, session, cog) {
  const q = buildCyberQuery(norm, session, cog);
  if (!q.enabled) return { enabled: false, reason: "disabled" };

  if (!CyberK || typeof CyberK !== "object") {
    return { enabled: false, reason: "module_missing" };
  }

  try {
    // Preferred: CyberK.getMarionHints({ features, tokens, queryKey }, ctx)
    if (typeof CyberK.getMarionHints === "function") {
      const res = CyberK.getMarionHints(
        { features: q.features, tokens: q.tokens, queryKey: q.queryKey },
        { session: isPlainObject(session) ? session : {}, cog: isPlainObject(cog) ? cog : {} }
      );
      const h = clampCyberHints(res);
      return { ...h, enabled: true, queryKey: q.queryKey };
    }

    // Alternate API names, tolerated
    if (typeof CyberK.query === "function") {
      const res = CyberK.query({ features: q.features, tokens: q.tokens, queryKey: q.queryKey });
      const h = clampCyberHints(res);
      return { ...h, enabled: true, queryKey: q.queryKey };
    }

    // If only versions/meta are exposed, still surface something bounded
    const packs = isPlainObject(CyberK.PACK_FILES) ? CyberK.PACK_FILES : null;
    if (packs) {
      return clampCyberHints({
        enabled: true,
        queryKey: q.queryKey,
        packs: {
          safetyPosture: packs.safetyPosture || "",
          topPacks: [],
          versions: packs,
        },
        confidence: 0,
        reason: "packs_only",
      });
    }

    return { enabled: false, reason: "no_api" };
  } catch (e) {
    const code = safeStr(e && (e.code || e.name) ? e.code || e.name : "ERR", 40);
    return { enabled: false, reason: `cyber_query_fail:${code}` };
  }
}

// -------------------------
// ENGLISH KNOWLEDGE WIRE (bounded, non-PII, NO RAW TEXT)
// -------------------------
function buildEnglishQuery(norm, session, cog) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(session) ? session : {};
  const c = isPlainObject(cog) ? cog : {};

  // STRICT: do NOT pass n.text
  const action = safeStr(n.action || "", 24).trim().toLowerCase();
  const lane = safeStr(n.lane || s.lane || "", 24).trim().toLowerCase();
  const intent = safeStr(c.intent || "", 12).trim().toUpperCase();
  const mode = safeStr(c.mode || "", 16).trim().toLowerCase();

  const riskTier = safeStr(c.riskTier || "", 10).trim().toLowerCase();
  const riskDomains = safeTokenSet(c.riskDomains || [], 6);

  const englishTags = safeTokenSet(c.englishTags || [], 8);
  const englishSignals = safeTokenSet(c.englishSignals || [], 8);

  // “needs” tokens (safe): derived from Marion’s own English layer & common academic tasks
  const needs = [];
  if (englishTags.includes(ENGLISH.TAGS.CLARITY)) needs.push("clarity");
  if (englishTags.includes(ENGLISH.TAGS.STRUCTURE)) needs.push("structure");
  if (englishTags.includes(ENGLISH.TAGS.AUDIENCE)) needs.push("audience");
  if (englishTags.includes(ENGLISH.TAGS.TONE)) needs.push("tone");
  if (englishTags.includes(ENGLISH.TAGS.DEFINITIONS)) needs.push("definitions");
  if (englishSignals.includes(ENGLISH.SIGNALS.DEFINE_JARGON)) needs.push("define_jargon");
  if (englishSignals.includes(ENGLISH.SIGNALS.USE_PLAIN_LANGUAGE)) needs.push("plain_language");

  // If user is high-risk, clamp to safer tutoring patterns; don’t surface “generate/submit” templates
  if (riskTier === RISK.TIERS.HIGH || riskDomains.includes(RISK.DOMAINS.SELF_HARM)) {
    needs.push("safety_redirect");
  }

  const tokens = safeTokenSet(
    [
      "english",
      lane || "",
      action || "",
      intent || "",
      mode || "",
      riskTier || "",
      ...riskDomains,
      ...englishTags,
      ...englishSignals,
      ...needs,
    ],
    14
  );

  const keyObj = { lane, action, intent, mode, riskTier, riskDomains, englishTags, englishSignals, tokens };
  const queryKey = sha1Lite(JSON.stringify(keyObj)).slice(0, 14);

  return {
    enabled: true,
    queryKey,
    tokens,
    features: {
      lane,
      action,
      intent,
      mode,
      riskTier,
      riskDomains,
      englishTags,
      englishSignals,
      needs: safeTokenSet(needs, 10),
    },
  };
}

function clampEnglishHints(hints) {
  const h = isPlainObject(hints) ? hints : {};
  return {
    enabled: !!h.enabled,
    queryKey: safeStr(h.queryKey || "", 18),
    packs: isPlainObject(h.packs)
      ? {
          curriculum: safeStr(h.packs.curriculum || "", 48),
          core: uniqBounded(h.packs.core || [], 6),
          faces: uniqBounded(h.packs.faces || [], 4),
          dialogue: uniqBounded(h.packs.dialogue || [], 4),
          versions: isPlainObject(h.packs.versions) ? h.packs.versions : {},
        }
      : {},
    focus: safeStr(h.focus || "", 32),
    stance: safeStr(h.stance || "", 32),
    principles: uniqBounded(h.principles || [], 8),
    frameworks: uniqBounded(h.frameworks || [], 6),
    guardrails: uniqBounded(h.guardrails || [], 6),
    exampleTypes: uniqBounded(h.exampleTypes || [], 6),
    responseCues: uniqBounded(h.responseCues || [], 8),
    hits: uniqBounded(h.hits || [], 10),
    confidence: clamp01(h.confidence),
    reason: safeStr(h.reason || "", 60),
  };
}

function queryEnglishKnowledge(norm, session, cog) {
  const q = buildEnglishQuery(norm, session, cog);
  if (!q.enabled) return { enabled: false, reason: "disabled" };

  if (!EnglishK || typeof EnglishK !== "object") {
    return { enabled: false, reason: "module_missing" };
  }

  try {
    // Preferred: EnglishK.getMarionHints({ features, tokens, queryKey }, ctx)
    if (typeof EnglishK.getMarionHints === "function") {
      const res = EnglishK.getMarionHints(
        { features: q.features, tokens: q.tokens, queryKey: q.queryKey },
        { session: isPlainObject(session) ? session : {}, cog: isPlainObject(cog) ? cog : {} }
      );
      const h = clampEnglishHints(res);
      return { ...h, enabled: true, queryKey: q.queryKey };
    }

    // Alternate API names, tolerated
    if (typeof EnglishK.query === "function") {
      const res = EnglishK.query({ features: q.features, tokens: q.tokens, queryKey: q.queryKey });
      const h = clampEnglishHints(res);
      return { ...h, enabled: true, queryKey: q.queryKey };
    }

    // Pack meta fallback (optional)
    const packs = isPlainObject(EnglishK.PACK_FILES) ? EnglishK.PACK_FILES : null;
    if (packs) {
      return clampEnglishHints({
        enabled: true,
        queryKey: q.queryKey,
        packs: { curriculum: packs.curriculum || "", core: [], faces: [], dialogue: [], versions: packs },
        confidence: 0,
        reason: "packs_only",
      });
    }

    return { enabled: false, reason: "no_api" };
  } catch (e) {
    const code = safeStr(e && (e.code || e.name) ? e.code || e.name : "ERR", 40);
    return { enabled: false, reason: `english_query_fail:${code}` };
  }
}

// -------------------------
// PSYCHOLOGY LAYER (always-on, deterministic, bounded)
// -------------------------
function estimateCognitiveLoad(norm, session, nowMs) {
  const text = safeStr(norm?.text || "", 1400);
  const s = text.toLowerCase();

  const len = text.length;
  const hasEnum =
    /\b(step\s*\d+|1\s*,\s*2\s*,\s*3|1\s*2\s*3)\b/.test(s) || /\b\d+\)\s/.test(s);
  const qMarks = (text.match(/\?/g) || []).length;
  const tech =
    /\b(index\.js|chatengine\.js|statespine\.js|cors|session|payload|endpoint|route|resolver|json|tests?)\b/.test(
      s
    );
  const urgent = /\b(asap|urgent|right now|immediately|quick|fast)\b/.test(s);

  let score = 0;
  if (len >= 900) score += 2;
  else if (len >= 450) score += 1;

  if (qMarks >= 3) score += 1;
  if (hasEnum) score += 1;
  if (tech) score += 1;
  if (urgent) score += 1;

  const lastAdvanceAt = Number(isPlainObject(session) ? session.lastAdvanceAt : 0) || 0;
  const now = Number(nowMs || 0) || 0;
  if (lastAdvanceAt && now && now - lastAdvanceAt > 90 * 1000) score += 1;

  if (score >= 4) return PSYCH.LOAD.HIGH;
  if (score >= 2) return PSYCH.LOAD.MEDIUM;
  return PSYCH.LOAD.LOW;
}

function estimateRegulationState(norm) {
  const text = safeStr(norm?.text || "", 1400).toLowerCase();

  if (
    /\b(panic|i can'?t breathe|i'?m freaking out|meltdown|spiral|breakdown|i can'?t do this)\b/.test(
      text
    )
  ) {
    return PSYCH.REG.DYSREGULATED;
  }

  if (
    /\b(overwhelmed|stuck|frustrated|anxious|stress(ed)?|worried|i'?m not sure|confused)\b/.test(
      text
    )
  ) {
    return PSYCH.REG.STRAINED;
  }

  return PSYCH.REG.REGULATED;
}

function estimateAgencyPreference(norm, session, mode) {
  const text = safeStr(norm?.text || "", 1400).toLowerCase();

  if (/\b(give me a plan|tell me what to do|decide for me|just pick|do it)\b/.test(text)) {
    return PSYCH.AGENCY.GUIDED;
  }

  if (/\b(options|ideas|what are my choices|pick from|menu)\b/.test(text)) {
    return PSYCH.AGENCY.AUTONOMOUS;
  }

  if (safeStr(mode || "").toLowerCase() === "architect") return PSYCH.AGENCY.GUIDED;
  if (safeStr(mode || "").toLowerCase() === "user") return PSYCH.AGENCY.AUTONOMOUS;

  const clicked = !!(norm?.turnSignals?.hasPayload && norm?.turnSignals?.payloadActionable);
  if (clicked) return PSYCH.AGENCY.GUIDED;

  return PSYCH.AGENCY.GUIDED;
}

function estimateSocialPressure(norm) {
  const text = safeStr(norm?.text || "", 1400).toLowerCase();
  if (/\b(demo|client|stakeholder|investor|sponsor|launch|press|deadline|meeting)\b/.test(text)) {
    return PSYCH.PRESSURE.HIGH;
  }
  if (/\b(team|we need|today|this week|timeline)\b/.test(text)) {
    return PSYCH.PRESSURE.MEDIUM;
  }
  return PSYCH.PRESSURE.LOW;
}

function computePsychologyReasoningObject(norm, session, medSeed, nowMs) {
  const mode = safeStr(medSeed?.mode || "", 20).toLowerCase();
  const load = estimateCognitiveLoad(norm, session, nowMs);
  const regulationState = estimateRegulationState(norm);
  const agencyPreference = estimateAgencyPreference(norm, session, mode);
  const socialPressure = estimateSocialPressure(norm);

  return {
    cognitiveLoad: load,
    regulationState,
    motivation: "",
    agencyPreference,
    socialPressure,
  };
}

// -------------------------
// move policy (StateSpine reconciliation hint)
// -------------------------
function normalizeMove(m) {
  const s = safeStr(m, 20).trim().toUpperCase();
  if (s === "ADVANCE" || s === "CLARIFY" || s === "STABILIZE") return s;
  return "CLARIFY";
}
function normalizeDominance(d) {
  const s = safeStr(d, 12).trim().toLowerCase();
  if (s === "firm" || s === "neutral" || s === "soft") return s;
  return "neutral";
}
function normalizeBudget(b) {
  const s = safeStr(b, 12).trim().toLowerCase();
  if (s === "short" || s === "medium") return s;
  return "short";
}

function deriveMovePolicy(cog) {
  const intent = safeStr(cog?.intent || "", 20).toUpperCase();
  const actionable = !!cog?.actionable;
  const reg = safeStr(cog?.psychology?.regulationState || "", 16);

  let preferredMove = normalizeMove(intent);
  let hardOverride = false;
  let reason = "intent";

  if (reg === PSYCH.REG.DYSREGULATED) {
    preferredMove = actionable ? "ADVANCE" : "STABILIZE";
    hardOverride = !actionable;
    reason = actionable ? "dysregulated_actionable" : "dysregulated_containment";
  } else if (reg === PSYCH.REG.STRAINED && !actionable) {
    preferredMove = "CLARIFY";
    hardOverride = false;
    reason = "strained_clarify";
  }

  return { preferredMove, hardOverride, reason };
}

// -------------------------
// ETHICS LAYER
// -------------------------
function computeEthicsLayer(norm, psych, seed) {
  const n = isPlainObject(norm) ? norm : {};
  const p = isPlainObject(psych) ? psych : {};
  const s = isPlainObject(seed) ? seed : {};

  const tags = [ETHICS.TAGS.NON_DECEPTIVE, ETHICS.TAGS.PRIVACY_MIN];
  const signals = [];

  const text = safeStr(n?.text || "", 1400).toLowerCase();
  const reg = safeStr(p.regulationState || "", 16);
  const agencyPref = safeStr(p.agencyPreference || "", 16);

  const selfHarm =
    /\b(suicid(e|al)|kill myself|end it all|self[-\s]?harm|cutting|i don't want to live)\b/.test(
      text
    );

  if (selfHarm) {
    tags.push(ETHICS.TAGS.HARM_AVOIDANCE, ETHICS.TAGS.SAFETY_REDIRECT);
    signals.push(ETHICS.SIGNALS.MINIMIZE_RISKY_DETAIL, ETHICS.SIGNALS.ENCOURAGE_HELP_SEEKING);
  } else if (reg === PSYCH.REG.DYSREGULATED) {
    tags.push(ETHICS.TAGS.HARM_AVOIDANCE);
    signals.push(ETHICS.SIGNALS.USE_NEUTRAL_TONE, ETHICS.SIGNALS.MINIMIZE_RISKY_DETAIL);
  }

  tags.push(ETHICS.TAGS.AGENCY_RESPECT);
  if (agencyPref === PSYCH.AGENCY.AUTONOMOUS && !s.actionable) {
    signals.push(ETHICS.SIGNALS.OFFER_OPTIONS_NOT_ORDERS);
  }

  return {
    ethicsTags: uniqBounded(tags.map((x) => safeStr(x, 32)), 8),
    ethicsSignals: uniqBounded(signals.map((x) => safeStr(x, 40)), 6),
  };
}

// -------------------------
// RISKBRIDGE v1
// -------------------------
function computeRiskBridge(norm, psych, ethics, lawSeed) {
  const n = isPlainObject(norm) ? norm : {};
  const p = isPlainObject(psych) ? psych : {};
  const e = isPlainObject(ethics) ? ethics : {};
  const seed = isPlainObject(lawSeed) ? lawSeed : {};

  const text = safeStr(n?.text || "", 1400).toLowerCase();

  const domains = [];
  const signals = [];
  let tier = RISK.TIERS.NONE;

  const reg = safeStr(p.regulationState || "", 16);
  const load = safeStr(p.cognitiveLoad || "", 12);
  const pressure = safeStr(p.socialPressure || "", 12);
  const actionable = !!seed.actionable;

  const selfHarm =
    /\b(suicid(e|al)|kill myself|end it all|self[-\s]?harm|cutting|i don't want to live)\b/.test(
      text
    );
  if (selfHarm) {
    domains.push(RISK.DOMAINS.SELF_HARM);
    tier = RISK.TIERS.HIGH;
    signals.push("containment_required");
  }

  const violence =
    /\b(kill|murder|shoot|stab|bomb|attack|hurt them|hurt him|hurt her|beat (them|him|her)|make a weapon)\b/.test(
      text
    );
  if (violence) {
    domains.push(RISK.DOMAINS.VIOLENCE);
    if (tier !== RISK.TIERS.HIGH) tier = RISK.TIERS.MEDIUM;
    signals.push("violence_related");
  }

  const illegal =
    /\b(how to (steal|fraud)|bypass (the )?law|evade (the )?law|counterfeit|forg(e|ery)|identity theft)\b/.test(
      text
    );
  if (illegal) {
    domains.push(RISK.DOMAINS.ILLEGAL);
    tier = RISK.TIERS.HIGH;
    signals.push("illegal_intent_detected");
  }

  const privacy =
    /\b(doxx|dox|ip address|track (a|an|the) (person|user)|stalk|find (their|his|her) address|social security|sin number|credit card number)\b/.test(
      text
    );
  if (privacy) {
    domains.push(RISK.DOMAINS.PRIVACY);
    if (tier !== RISK.TIERS.HIGH) tier = RISK.TIERS.MEDIUM;
    signals.push("privacy_sensitive");
  }

  const sexual =
    /\b(nudes?|porn|explicit|sexual|sex tape|onlyfans|hook up|fetish|bdsm)\b/.test(text);
  if (sexual) {
    domains.push(RISK.DOMAINS.SEXUAL);
    if (tier !== RISK.TIERS.HIGH) tier = RISK.TIERS.MEDIUM;
    signals.push("sexual_content");
  }

  const hate =
    /\b(nazi|white power|genocide|ethnic cleansing|kill (all|the) (jews|muslims|christians|blacks|whites)|racial superiority)\b/.test(
      text
    );
  if (hate) {
    domains.push(RISK.DOMAINS.HATE);
    if (tier !== RISK.TIERS.HIGH) tier = RISK.TIERS.MEDIUM;
    signals.push("hate_related");
  }

  if (/\b(diagnose|medical advice|prescription|dose)\b/.test(text)) {
    domains.push(RISK.DOMAINS.MEDICAL);
    if (tier !== RISK.TIERS.HIGH) tier = RISK.TIERS.MEDIUM;
  }
  if (/\b(legal advice|lawsuit|sue|liability|contract dispute)\b/.test(text)) {
    domains.push(RISK.DOMAINS.LEGAL);
    if (tier !== RISK.TIERS.HIGH) tier = RISK.TIERS.MEDIUM;
  }
  if (/\b(financial advice|invest|portfolio|trading|crypto|tax)\b/.test(text)) {
    domains.push(RISK.DOMAINS.FINANCIAL);
    if (tier !== RISK.TIERS.HIGH) tier = RISK.TIERS.MEDIUM;
  }
  if (/\b(cyber|security|infosec|phish|malware|exploit|breach|hack)\b/.test(text)) {
    domains.push(RISK.DOMAINS.CYBER);
    if (tier !== RISK.TIERS.HIGH) tier = RISK.TIERS.MEDIUM;
  }

  if (reg === PSYCH.REG.DYSREGULATED && tier !== RISK.TIERS.HIGH) {
    tier = RISK.TIERS.MEDIUM;
    signals.push("emotional_instability");
  }

  if (domains.length >= 2 && tier !== RISK.TIERS.HIGH) {
    tier = RISK.TIERS.MEDIUM;
    signals.push("multi_domain");
  }

  if (tier === RISK.TIERS.NONE && (load === PSYCH.LOAD.HIGH || pressure === PSYCH.PRESSURE.HIGH)) {
    tier = RISK.TIERS.LOW;
    signals.push("high_load_or_pressure");
  }

  const lawOverrides = {};

  if (!actionable) {
    if (tier === RISK.TIERS.HIGH) {
      lawOverrides.forceIntent = "STABILIZE";
      lawOverrides.budgetClamp = "short";
      lawOverrides.velvetBlock = true;
      lawOverrides.dominanceBias = "firm";
    } else if (tier === RISK.TIERS.MEDIUM) {
      lawOverrides.budgetClamp = "short";
      lawOverrides.velvetBlock = true;
    } else if (tier === RISK.TIERS.LOW) {
      lawOverrides.budgetClamp = "short";
    }
  } else {
    if (tier === RISK.TIERS.MEDIUM || tier === RISK.TIERS.HIGH) {
      lawOverrides.budgetClamp = "short";
      lawOverrides.velvetBlock = true;
    }
  }

  if (Array.isArray(e.ethicsTags) && e.ethicsTags.includes(ETHICS.TAGS.SAFETY_REDIRECT)) {
    signals.push("ethics_safety_redirect");
    if (!domains.includes(RISK.DOMAINS.SELF_HARM)) domains.push(RISK.DOMAINS.SELF_HARM);
    tier = RISK.TIERS.HIGH;
    if (!actionable) {
      lawOverrides.forceIntent = "STABILIZE";
      lawOverrides.budgetClamp = "short";
      lawOverrides.velvetBlock = true;
      lawOverrides.dominanceBias = "firm";
    }
  }

  return {
    riskTier: tier,
    riskDomains: uniqBounded(domains, 6),
    riskSignals: uniqBounded(signals, 6),
    lawOverrides: isPlainObject(lawOverrides) ? { ...lawOverrides } : {},
  };
}

function applyRiskOverridesToLawSeed(lawSeed, risk) {
  const seed = isPlainObject(lawSeed) ? { ...lawSeed } : {};
  const r = isPlainObject(risk) ? risk : {};
  const o = isPlainObject(r.lawOverrides) ? r.lawOverrides : {};

  if (!seed.actionable && o.forceIntent) {
    const fi = normalizeMove(o.forceIntent);
    seed.intent = fi;
  }

  if (o.budgetClamp === "short") seed.budget = "short";
  if (typeof o.velvetBlock === "boolean" && o.velvetBlock) seed.velvetAllowed = false;

  if (o.dominanceBias === "firm" || o.dominanceBias === "neutral") {
    if (safeStr(seed.mode || "", 20).toLowerCase() !== "user") seed.dominance = o.dominanceBias;
  }

  return seed;
}

// -------------------------
// LAW LAYER
// -------------------------
function applyLawLayer(seed, psych) {
  const out = isPlainObject(seed) ? { ...seed } : {};
  const tags = [];
  const reasons = [];

  const p = isPlainObject(psych) ? psych : {};
  const reg = safeStr(p.regulationState || "", 16);
  const load = safeStr(p.cognitiveLoad || "", 12);
  const pressure = safeStr(p.socialPressure || "", 12);

  const actionable = !!out.actionable;
  const stalled = !!out.stalled;

  if (reg === PSYCH.REG.DYSREGULATED) {
    out.intent = actionable ? "ADVANCE" : "STABILIZE";
    out.dominance = "firm";
    out.budget = "short";
    out.groundingMaxLines = clampInt(out.groundingMaxLines, 0, 2, 0);
    tags.push(LAW.TAGS.CONTAINMENT);
    reasons.push(actionable ? "containment_actionable" : "containment_hold");
  }

  if (actionable) {
    out.intent = "ADVANCE";
    if (safeStr(out.mode || "", 20).toLowerCase() !== "user") out.dominance = "firm";
    tags.push(LAW.TAGS.ACTION_SUPREMACY);
    reasons.push("action_supremacy");
  }

  if (stalled && !actionable) {
    out.intent = "CLARIFY";
    out.dominance = out.dominance === "firm" ? "firm" : "neutral";
    out.budget = "short";
    out.groundingMaxLines = clampInt(out.groundingMaxLines, 0, 1, 0);
    tags.push(LAW.TAGS.NO_SPIN);
    reasons.push("stall_clarify");
  }

  if (load === PSYCH.LOAD.HIGH || pressure === PSYCH.PRESSURE.HIGH) {
    out.budget = "short";
    tags.push(LAW.TAGS.BUDGET_CLAMP);
    reasons.push("budget_clamp");
  }

  const intent = safeStr(out.intent || "", 20).toUpperCase();
  if (intent === "STABILIZE") {
    out.velvetAllowed = false;
    tags.push(LAW.TAGS.VELVET_GUARD);
    reasons.push("velvet_off_stabilize");
  } else if (out.velvetAllowed === false) {
    tags.push(LAW.TAGS.VELVET_GUARD);
    reasons.push("velvet_guard");
  }

  tags.push(LAW.TAGS.COHERENCE);
  reasons.push("coherent");

  return {
    ...out,
    lawTags: tags.slice(0, 8).map((x) => safeStr(x, 32)),
    lawReasons: reasons.slice(0, 8).map((x) => safeStr(x, 40)),
  };
}

// -------------------------
// CYBER LAYER (defensive-only risk awareness)
// -------------------------
function computeCyberLayer(norm, psych) {
  const n = isPlainObject(norm) ? norm : {};
  const p = isPlainObject(psych) ? psych : {};

  const text = safeStr(n?.text || "", 1400).toLowerCase();

  const tags = [CYBER.TAGS.DEFENSIVE_ONLY];
  const signals = [CYBER.SIGNALS.SAFE_DEFAULTS];

  const mentionsSecurity =
    /\b(cyber|security|infosec|privacy|phish|phishing|malware|ransom|ddos|sql injection|xss|csrf|breach|exploit|hack)\b/.test(
      text
    );

  const socialEng =
    /\b(phish|phishing|social engineering|impersonat|spoof|fraud|scam|otp|2fa code|verification code)\b/.test(
      text
    );

  const suspiciousAsk =
    /\b(how to hack|hack into|steal password|bypass|crack|keylog|ddos (a|an)|make malware|write malware|exploit (a|an)|phish (a|an) (email|site)|credential stuffing)\b/.test(
      text
    );

  if (mentionsSecurity) {
    tags.push(CYBER.TAGS.THREAT_AWARENESS, CYBER.TAGS.HARDENING);
    signals.push(CYBER.SIGNALS.MINIMIZE_SENSITIVE_DATA);
  }

  if (socialEng) {
    tags.push(CYBER.TAGS.SOCIAL_ENGINEERING, CYBER.TAGS.PRIVACY_HYGIENE);
    signals.push(CYBER.SIGNALS.VERIFY_SOURCE);
  }

  const reg = safeStr(p.regulationState || "", 16);
  if (reg === PSYCH.REG.DYSREGULATED && mentionsSecurity) {
    signals.push(CYBER.SIGNALS.AVOID_STEP_BY_STEP);
  }

  if (suspiciousAsk) {
    tags.push(CYBER.TAGS.REDTEAM_BLOCK);
    signals.push(CYBER.SIGNALS.AVOID_STEP_BY_STEP, CYBER.SIGNALS.SUGGEST_DEFENSIVE_ALTS);
  }

  return {
    cyberTags: uniqBounded(tags, 8),
    cyberSignals: uniqBounded(signals, 6),
  };
}

// -------------------------
// ENGLISH LAYER
// -------------------------
function computeEnglishLayer(norm, seed) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(seed) ? seed : {};
  const text = safeStr(n?.text || "", 1400).toLowerCase();
  const action = safeStr(n?.action || "", 80).toLowerCase();

  const tags = [];
  const signals = [];

  const writingAsk =
    /\b(rewrite|revise|edit|proofread|grammar|spelling|tone|make this clearer|summarize|shorten|simplify|translate)\b/.test(
      text
    );

  const docOrComms =
    /\b(email|letter|proposal|pitch|script|press release|bio|about page|copy|caption)\b/.test(text);

  const technicalDensity =
    /\b(api|cors|endpoint|resolver|session|deterministic|contract|telemetry|governor|policy)\b/.test(
      text
    );

  if (writingAsk || docOrComms) {
    tags.push(ENGLISH.TAGS.CLARITY, ENGLISH.TAGS.STRUCTURE, ENGLISH.TAGS.TONE);
    signals.push(ENGLISH.SIGNALS.BULLET_STRUCTURE, ENGLISH.SIGNALS.SHORT_SENTENCES);
  }

  if (technicalDensity && (writingAsk || docOrComms)) {
    tags.push(ENGLISH.TAGS.DEFINITIONS, ENGLISH.TAGS.AUDIENCE);
    signals.push(ENGLISH.SIGNALS.DEFINE_JARGON, ENGLISH.SIGNALS.ASK_AUDIENCE);
  }

  const mode = safeStr(s.mode || "", 20).toLowerCase();
  const intent = safeStr(s.intent || "", 20).toUpperCase();
  if (mode === "user" && intent !== "ADVANCE") {
    if (!tags.length) tags.push(ENGLISH.TAGS.CLARITY);
    signals.push(ENGLISH.SIGNALS.USE_PLAIN_LANGUAGE);
  }

  if (action === "counsel_intro" && !tags.length) {
    tags.push(ENGLISH.TAGS.TONE);
    signals.push(ENGLISH.SIGNALS.SHORT_SENTENCES);
  }

  return {
    englishTags: uniqBounded(tags.map((x) => safeStr(x, 24)), 8),
    englishSignals: uniqBounded(signals.map((x) => safeStr(x, 40)), 6),
  };
}

// -------------------------
// FIN/ECO LAYER
// -------------------------
function computeFinanceLayer(norm) {
  const n = isPlainObject(norm) ? norm : {};
  const text = safeStr(n?.text || "", 1400).toLowerCase();

  const tags = [];
  const signals = [];

  const financeTopic =
    /\b(price|pricing|revenue|profit|margin|budget|cashflow|forecast|break[-\s]?even|roi|lifetime value|ltv|cac|unit economics|economics|tax|sred|grant|funding|invoice|subscription)\b/.test(
      text
    );

  const investingTopic =
    /\b(invest|portfolio|stocks?|crypto|options trading|day trade|forex)\b/.test(text);

  if (financeTopic || investingTopic) {
    tags.push(FIN.TAGS.NON_ADVICE);
    signals.push(FIN.SIGNALS.CLARIFY_ASSUMPTIONS, FIN.SIGNALS.ASK_CONSTRAINTS);

    if (/\bprice|pricing\b/.test(text)) tags.push(FIN.TAGS.PRICING);
    if (/\b(budget|cashflow|forecast)\b/.test(text)) tags.push(FIN.TAGS.BUDGETING);
    if (/\b(ltv|cac|unit economics|margin|break[-\s]?even)\b/.test(text))
      tags.push(FIN.TAGS.UNIT_ECON);

    if (/\b(tax|sred|grant|funding|compliance)\b/.test(text)) {
      tags.push(FIN.TAGS.COMPLIANCE, FIN.TAGS.RISK_DISCLOSURE);
      signals.push(FIN.SIGNALS.ENCOURAGE_PRO);
    } else if (investingTopic) {
      tags.push(FIN.TAGS.RISK_DISCLOSURE);
      signals.push(FIN.SIGNALS.USE_SCENARIOS);
    }
  }

  return {
    finTags: uniqBounded(tags.map((x) => safeStr(x, 28)), 8),
    finSignals: uniqBounded(signals.map((x) => safeStr(x, 40)), 6),
  };
}

// -------------------------
// STRATEGY LAYER
// -------------------------
function computeStrategyLayer(norm, seed, psych) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(seed) ? seed : {};
  const p = isPlainObject(psych) ? psych : {};
  const text = safeStr(n?.text || "", 1400).toLowerCase();

  const tags = [];
  const signals = [];

  const strategicLanguage =
    /\b(strategy|strategic|roadmap|milestone|priorit(y|ize)|trade[-\s]?off|risk|constraint|decision|plan|architecture|system|governance)\b/.test(
      text
    );

  const measurementLanguage =
    /\b(metric|kpi|measure|benchmark|baseline|success criteria|a\/b|experiment)\b/.test(text);

  const sequencingLanguage =
    /\b(first|next|then|after that|sequence|phase|layer|step\s*\d+)\b/.test(text);

  const seedMode = safeStr(s.mode || "", 20).toLowerCase();

  if (strategicLanguage || seedMode === "architect") {
    tags.push(STRATEGY.TAGS.TRADEOFFS, STRATEGY.TAGS.EXECUTION);
    signals.push(STRATEGY.SIGNALS.DEFINE_GOAL, STRATEGY.SIGNALS.IDENTIFY_CONSTRAINTS);

    if (measurementLanguage) {
      tags.push(STRATEGY.TAGS.METRICS);
      signals.push(STRATEGY.SIGNALS.NEXT_ACTIONS);
    }
    if (sequencingLanguage) {
      tags.push(STRATEGY.TAGS.SEQUENCING);
      signals.push(STRATEGY.SIGNALS.TIME_HORIZON);
    }
    if (/\b(option value|reversible|irreversible|one[-\s]?way door|two[-\s]?way door)\b/.test(text)) {
      tags.push(STRATEGY.TAGS.OPTION_VALUE);
      signals.push(STRATEGY.SIGNALS.DECISION_MATRIX);
    }
    if (/\b(risk|attack surface|failure mode|blast radius|rollback)\b/.test(text)) {
      tags.push(STRATEGY.TAGS.RISK);
      signals.push(STRATEGY.SIGNALS.DECISION_MATRIX);
    }
  }

  if (safeStr(p.cognitiveLoad || "", 12) === PSYCH.LOAD.HIGH && tags.length) {
    signals.push(STRATEGY.SIGNALS.NEXT_ACTIONS);
  }

  return {
    strategyTags: uniqBounded(tags.map((x) => safeStr(x, 28)), 8),
    strategySignals: uniqBounded(signals.map((x) => safeStr(x, 40)), 6),
  };
}

// -------------------------
// Apply PRO impacts to mediator outputs
// -------------------------
function applyPsychologyToMediator(cog, psych) {
  const out = isPlainObject(cog) ? { ...cog } : {};
  const p = isPlainObject(psych) ? psych : {};

  if (p.cognitiveLoad === PSYCH.LOAD.HIGH || p.socialPressure === PSYCH.PRESSURE.HIGH) {
    out.budget = "short";
  }

  if (p.regulationState === PSYCH.REG.DYSREGULATED) {
    out.intent = out.actionable ? "ADVANCE" : "STABILIZE";
    out.dominance = "firm";
    const cur = Number(out.groundingMaxLines);
    const curSafe = Number.isFinite(cur) ? cur : 0;
    out.groundingMaxLines = Math.max(0, Math.min(2, curSafe));
  }

  if (p.regulationState === PSYCH.REG.STRAINED && !out.actionable) {
    out.intent = "CLARIFY";
    if (out.dominance !== "firm") out.dominance = "neutral";
    const cur = Number(out.groundingMaxLines);
    const curSafe = Number.isFinite(cur) ? cur : 0;
    out.groundingMaxLines = Math.max(0, Math.min(1, curSafe));
  }

  if (p.agencyPreference === PSYCH.AGENCY.GUIDED) {
    if (out.intent === "ADVANCE")
      out.dominance = out.dominance === "soft" ? "neutral" : out.dominance;
  } else if (p.agencyPreference === PSYCH.AGENCY.AUTONOMOUS) {
    if (out.dominance === "firm" && out.intent !== "ADVANCE") out.dominance = "neutral";
  }

  out.psychology = {
    cognitiveLoad: safeStr(p.cognitiveLoad || "", 12),
    regulationState: safeStr(p.regulationState || "", 16),
    motivation: safeStr(p.motivation || "", 16),
    agencyPreference: safeStr(p.agencyPreference || "", 16),
    socialPressure: safeStr(p.socialPressure || "", 12),
  };

  out.movePolicy = deriveMovePolicy(out);
  return out;
}

// -------------------------
// intent classification
// -------------------------
function classifyTurnIntent(norm) {
  const text = safeStr(norm?.text || "", 1200).trim().toLowerCase();
  const action = safeStr(norm?.action || "", 80).trim();

  const hasPayload = !!norm?.turnSignals?.hasPayload;
  const textEmpty = !!norm?.turnSignals?.textEmpty;
  const payloadActionable = !!norm?.turnSignals?.payloadActionable;
  const payloadAction = safeStr(norm?.turnSignals?.payloadAction || "", 60).trim();
  const payloadYear = normYear(norm?.turnSignals?.payloadYear);

  const actionable =
    !!action ||
    (payloadActionable && hasPayload && (payloadAction || payloadYear !== null)) ||
    (payloadActionable && textEmpty && hasPayload);

  if (actionable) return "ADVANCE";

  if (
    /\b(i('?m)?\s+stuck|i('?m)?\s+worried|overwhelmed|frustrated|anxious|panic|stress(ed)?|reassure|calm)\b/.test(
      text
    )
  ) {
    return "STABILIZE";
  }

  if (/\b(explain|how do i|how to|what is|walk me through|where do i|get|why|help me)\b/.test(text)) {
    return "CLARIFY";
  }

  return "CLARIFY";
}

// -------------------------
// latent desire inference
// -------------------------
function inferLatentDesire(norm, session, med) {
  const t = safeStr(norm?.text || "", 1400).toLowerCase();
  const a = safeStr(norm?.action || "", 80).toLowerCase();
  const mode = safeStr(med?.mode || "", 20).toLowerCase();

  if (
    /\b(optimi[sz]e|systems?|framework|architecture|hard(en)?|constraints?|regression tests?|unit tests?|audit|refactor|contract|deterministic)\b/.test(
      t
    )
  ) {
    return LATENT_DESIRE.MASTERY;
  }

  if (/\b(am i right|do i make sense|how am i perceived|handsome|attractive|validation|do you think)\b/.test(t)) {
    return LATENT_DESIRE.VALIDATION;
  }

  if (/\b(why|meaning|connect|pattern|link|what connects|deeper|layer)\b/.test(t)) {
    return LATENT_DESIRE.CURIOSITY;
  }

  if (/\b(worried|overwhelmed|stuck|anxious|stress|reassure|calm)\b/.test(t)) {
    return LATENT_DESIRE.COMFORT;
  }

  if (a === "counsel_intro") return LATENT_DESIRE.COMFORT;

  if (a === "top10" || a === "yearend_hot100") return LATENT_DESIRE.AUTHORITY;
  if (a === "story_moment" || a === "micro_moment" || a === "custom_story") return LATENT_DESIRE.COMFORT;

  if (mode === "architect") {
    if (/\bdesign|implement|encode|ship|lock|wire|merge|pin|canonical\b/.test(t)) return LATENT_DESIRE.MASTERY;
    return LATENT_DESIRE.AUTHORITY;
  }

  if (truthy(session?.velvetMode)) return LATENT_DESIRE.COMFORT;

  return LATENT_DESIRE.CURIOSITY;
}

// -------------------------
// confidence inference
// -------------------------
function inferConfidence(norm, session, med) {
  const s = isPlainObject(session) ? session : {};
  const text = safeStr(norm?.text || "", 1400).trim();
  const action = safeStr(norm?.action || "", 80).trim();
  const hasPayload = !!norm?.turnSignals?.hasPayload;
  const textEmpty = !!norm?.turnSignals?.textEmpty;
  const actionablePayload = !!norm?.turnSignals?.payloadActionable;

  let user = 0.5;

  if (
    action ||
    (actionablePayload &&
      hasPayload &&
      (safeStr(norm?.turnSignals?.payloadAction || "", 60).trim() || normYear(norm?.turnSignals?.payloadYear) !== null))
  ) {
    user += 0.15;
  }

  if (textEmpty && hasPayload && actionablePayload) user += 0.05;

  if (/\b(i('?m)?\s+not\s+sure|confused|stuck|overwhelmed)\b/i.test(text)) user -= 0.25;
  if (/\b(are you sure|really\??)\b/i.test(text)) user -= 0.1;

  let nyx = 0.55;

  if (safeStr(med?.intent || "", 20).toUpperCase() === "ADVANCE") nyx += 0.15;
  if (safeStr(med?.intent || "", 20).toUpperCase() === "STABILIZE") nyx -= 0.25;

  const lastAction = safeStr(s.lastAction || "", 80).trim();
  const lastYear = normYear(s.lastYear);
  const yr = normYear(norm?.year);
  if (lastAction && lastAction === action && lastYear && yr && lastYear === yr) nyx += 0.1;

  const mode = safeStr(med?.mode || "", 20).toLowerCase();
  if (mode === "architect" || mode === "transitional") nyx += 0.05;
  if (mode === "user") nyx -= 0.05;

  return { user: clamp01(user), nyx: clamp01(nyx) };
}

// -------------------------
// velvet mode (music-first)
// -------------------------
function computeVelvet(norm, session, med, desire, now, velvetAllowed) {
  const s = isPlainObject(session) ? session : {};
  const action = safeStr(norm?.action || "", 80).trim();
  const lane = safeStr(norm?.lane || "", 40).trim() || (action ? "music" : "");
  const yr = normYear(norm?.year);
  const lastYear = normYear(s.lastYear);
  const lastLane = safeStr(s.lane || "", 40).trim();

  const already = truthy(s.velvetMode);

  const wantsDepth =
    action === "story_moment" ||
    action === "micro_moment" ||
    action === "custom_story" ||
    /\b(why|meaning|connect|deeper|layer)\b/i.test(safeStr(norm?.text || "", 1400));

  const repeatedTopic = !!(lastLane && lane && lastLane === lane && yr && lastYear && yr === lastYear);

  const acceptedChip = !!(
    norm?.turnSignals?.hasPayload &&
    norm?.turnSignals?.payloadActionable &&
    (safeStr(norm?.turnSignals?.payloadAction || "", 60).trim() || normYear(norm?.turnSignals?.payloadYear) !== null)
  );

  const musicFirstEligible = lane === "music" || !!action;

  if (!velvetAllowed) {
    return {
      velvet: false,
      velvetSince: Number(s.velvetSince || 0) || 0,
      reason: already ? "forced_exit" : "blocked",
    };
  }

  let signals = 0;
  if (wantsDepth) signals++;
  if (repeatedTopic) signals++;
  if (acceptedChip) signals++;
  if (clamp01(med?.confidence?.nyx) >= 0.6) signals++;
  if (desire === LATENT_DESIRE.COMFORT || desire === LATENT_DESIRE.CURIOSITY) signals++;

  if (!musicFirstEligible) {
    return { velvet: already, velvetSince: Number(s.velvetSince || 0) || 0, reason: already ? "carry" : "no" };
  }

  if (already) {
    if (safeStr(med?.intent || "", 20).toUpperCase() === "STABILIZE") {
      return { velvet: false, velvetSince: Number(s.velvetSince || 0) || 0, reason: "stabilize_exit" };
    }
    if (lastLane && lane && lastLane !== lane) {
      return { velvet: false, velvetSince: Number(s.velvetSince || 0) || 0, reason: "lane_shift_exit" };
    }
    return { velvet: true, velvetSince: Number(s.velvetSince || 0) || now, reason: "hold" };
  }

  if (signals >= 2) return { velvet: true, velvetSince: now, reason: "entry" };
  return { velvet: false, velvetSince: 0, reason: "no" };
}

// -------------------------
// bounded trace (no raw user text)
// -------------------------
function buildTrace(norm, session, med) {
  const y = normYear(norm?.year);
  const parts = [
    `m=${safeStr(med?.mode || "", 16)}`,
    `i=${safeStr(med?.intent || "", 10)}`,
    `d=${safeStr(med?.dominance || "", 8)}`,
    `b=${safeStr(med?.budget || "", 8)}`,
    `a=${safeStr(norm?.action || "", 18) || "-"}`,
    `y=${y !== null ? y : "-"}`,
    `p=${med?.actionable ? "1" : "0"}`,
    `e=${med?.textEmpty ? "1" : "0"}`,
    `st=${med?.stalled ? "1" : "0"}`,
    `rk=${safeStr(med?.riskTier || "", 6) || "-"}`,
    `ld=${safeStr(med?.latentDesire || "", 10)}`,
    `cn=${String(Math.round(clamp01(med?.confidence?.nyx) * 100))}`,
    `v=${med?.velvet ? "1" : "0"}`,
    `pl=${safeStr(med?.psychology?.cognitiveLoad || "", 6) || "-"}`,
    `pr=${safeStr(med?.psychology?.regulationState || "", 10) || "-"}`,
    `lw=${Array.isArray(med?.lawTags) && med.lawTags.length ? safeStr(med.lawTags[0], 12) : "-"}`,
    `et=${Array.isArray(med?.ethicsTags) && med.ethicsTags.length ? safeStr(med.ethicsTags[0], 12) : "-"}`,
    `cy=${Array.isArray(med?.cyberTags) && med.cyberTags.length ? safeStr(med.cyberTags[0], 12) : "-"}`,
    `mv=${safeStr(med?.movePolicy?.preferredMove || "", 8) || "-"}`,
    `pk=${med?.psychologyHints?.enabled ? "1" : "0"}`,
    `ck=${med?.cyberKnowledgeHints?.enabled ? "1" : "0"}`,
    `ek=${med?.englishKnowledgeHints?.enabled ? "1" : "0"}`,
  ];

  const base = parts.join("|");
  if (base.length <= MARION_TRACE_MAX) return base;
  return base.slice(0, MARION_TRACE_MAX - 3) + "...";
}
function hashTrace(trace) {
  return sha1Lite(safeStr(trace, 400)).slice(0, 10);
}

// -------------------------
// contract clamp + dev safety checks
// -------------------------
function tracePolicyCheck(cog, norm, opts) {
  const o = isPlainObject(opts) ? opts : {};
  if (!truthy(o.devTracePolicyCheck)) return null;

  const nText = safeStr(norm?.text || "", 2000).trim();
  if (!nText) return null;

  const out = [];
  const needles = [
    nText.slice(0, 18),
    nText.slice(0, 24),
    nText.slice(Math.max(0, nText.length - 18)),
  ].filter(Boolean);

  const fields = [
    "marionTrace",
    "macModeWhy",
    "lawReasons",
    "riskSignals",
    "ethicsSignals",
    "psychologyHints",
    "cyberKnowledgeHints",
    "englishKnowledgeHints",
  ];

  for (const f of fields) {
    const v = cog && cog[f];
    const s = Array.isArray(v) ? v.join("|") : safeStr(v, 1200);
    if (!s) continue;
    for (const needle of needles) {
      if (needle && needle.length >= 10 && s.includes(needle)) {
        out.push(`trace_policy_violation:${f}`);
        break;
      }
    }
  }
  return out.length ? uniqBounded(out, 6) : null;
}

function finalizeContract(cog, nowMs, extra) {
  const c = isPlainObject(cog) ? { ...cog } : {};
  const ex = isPlainObject(extra) ? extra : {};

  const mode = normalizeMacModeRaw(c.mode) || "architect";
  const intent = normalizeMove(c.intent);
  const dominance = normalizeDominance(c.dominance);
  const budget = normalizeBudget(c.budget);

  const riskTier = toLowerToken(c.riskTier, 10);
  const riskTierNorm =
    riskTier === RISK.TIERS.NONE ||
    riskTier === RISK.TIERS.LOW ||
    riskTier === RISK.TIERS.MEDIUM ||
    riskTier === RISK.TIERS.HIGH
      ? riskTier
      : RISK.TIERS.LOW;

  const velvetAllowed = c.velvetAllowed !== false;
  const velvet = !!c.velvet && velvetAllowed && intent !== "STABILIZE";
  const velvetSince = velvet
    ? clampInt(
        c.velvetSince,
        0,
        Number(nowMs || 0) || nowMsDefault(),
        Number(nowMs || 0) || nowMsDefault()
      )
    : 0;

  const out = {
    ...c,
    marionVersion: MARION_VERSION,

    mode,
    intent,
    dominance,
    budget,

    stalled: !!c.stalled,
    actionable: !!c.actionable,
    textEmpty: !!c.textEmpty,

    groundingMaxLines: clampInt(c.groundingMaxLines, 0, 3, 0),

    riskTier: riskTierNorm,
    riskDomains: uniqBounded(c.riskDomains || [], 6),
    riskSignals: uniqBounded(c.riskSignals || [], 6),

    lawTags: uniqBounded(c.lawTags || [], 8),
    lawReasons: uniqBounded(c.lawReasons || [], 8),

    ethicsTags: uniqBounded(c.ethicsTags || [], 8),
    ethicsSignals: uniqBounded(c.ethicsSignals || [], 6),

    cyberTags: uniqBounded(c.cyberTags || [], 8),
    cyberSignals: uniqBounded(c.cyberSignals || [], 6),

    englishTags: uniqBounded(c.englishTags || [], 8),
    englishSignals: uniqBounded(c.englishSignals || [], 6),

    finTags: uniqBounded(c.finTags || [], 8),
    finSignals: uniqBounded(c.finSignals || [], 6),

    strategyTags: uniqBounded(c.strategyTags || [], 8),
    strategySignals: uniqBounded(c.strategySignals || [], 6),

    latentDesire: safeStr(c.latentDesire || LATENT_DESIRE.CURIOSITY, 16),
    confidence: {
      user: clamp01(c?.confidence?.user),
      nyx: clamp01(c?.confidence?.nyx),
    },

    velvetAllowed: !!velvetAllowed,
    velvet,
    velvetSince,
    velvetReason: safeStr(c.velvetReason || "", 40),

    marionState: safeStr(c.marionState || "SEEK", 16).toUpperCase(),
    marionReason: safeStr(c.marionReason || "default", 40),

    marionStyle: MARION_STYLE_CONTRACT,
    handoff: isPlainObject(c.handoff)
      ? { ...c.handoff }
      : { marionEndsHard: true, nyxBeginsAfter: true, allowSameTurnSplit: true },

    macModeOverride: safeStr(c.macModeOverride || "", 60),
    macModeWhy: Array.isArray(c.macModeWhy)
      ? c.macModeWhy.slice(0, 6).map((x) => safeStr(x, 60))
      : [],

    psychologyHints: isPlainObject(c.psychologyHints)
      ? clampPsychHints(c.psychologyHints)
      : { enabled: false, reason: "none" },

    cyberKnowledgeHints: isPlainObject(c.cyberKnowledgeHints)
      ? clampCyberHints(c.cyberKnowledgeHints)
      : { enabled: false, reason: "none" },

    englishKnowledgeHints: isPlainObject(c.englishKnowledgeHints)
      ? clampEnglishHints(c.englishKnowledgeHints)
      : { enabled: false, reason: "none" },

    privacy: {
      noRawTextInTrace: true,
      boundedTrace: true,
      sideEffectFree: true,
    },

    movePolicy: isPlainObject(c.movePolicy)
      ? {
          preferredMove: normalizeMove(c.movePolicy.preferredMove),
          hardOverride: !!c.movePolicy.hardOverride,
          reason: safeStr(c.movePolicy.reason || "intent", 40),
        }
      : deriveMovePolicy({ ...c, intent, actionable: !!c.actionable, psychology: c.psychology }),
  };

  out.marionTrace = safeStr(out.marionTrace || "", MARION_TRACE_MAX + 8);
  out.marionTraceHash = safeStr(out.marionTraceHash || "", 16);

  if (Array.isArray(ex.tracePolicyIssues) && ex.tracePolicyIssues.length) {
    out.tracePolicyIssues = uniqBounded(ex.tracePolicyIssues, 6);
  }

  return out;
}

// -------------------------
// main: mediate
// -------------------------
function mediate(norm, session, opts = {}) {
  try {
    const s = isPlainObject(session) ? session : {};
    const n = isPlainObject(norm) ? norm : {};
    const o = isPlainObject(opts) ? opts : {};

    const clockNow = typeof o.nowMs === "function" ? o.nowMs : nowMsDefault;
    const now = Number(clockNow()) || nowMsDefault();

    const hasPayload = !!n?.turnSignals?.hasPayload;
    const textEmpty = !!n?.turnSignals?.textEmpty;
    const payloadActionable = !!n?.turnSignals?.payloadActionable;

    const macModeOverride =
      normalizeMacModeRaw(
        n?.turnSignals?.macModeOverride ||
          n?.macModeOverride ||
          n?.macMode ||
          n?.payload?.macMode ||
          n?.payload?.mode ||
          n?.body?.macMode ||
          n?.body?.mode ||
          ""
      ) || "";

    const implicit = detectMacModeImplicit(n.text || "");
    let modeCandidate = macModeOverride || implicit.mode || "";
    if (!modeCandidate) modeCandidate = "architect";
    if (modeCandidate !== "architect" && modeCandidate !== "user" && modeCandidate !== "transitional")
      modeCandidate = "architect";

    const hysteresis = suggestModeHysteresisPatch(s, modeCandidate, implicit);
    const mode = (hysteresis && hysteresis.effectiveMode) || modeCandidate;

    const lastAdvanceAt = Number(s.lastAdvanceAt || 0) || 0;
    const stalled = lastAdvanceAt ? now - lastAdvanceAt > 90 * 1000 : false;

    let intent = toUpperToken(n.turnIntent || "", 20);
    if (!intent || (intent !== "ADVANCE" && intent !== "CLARIFY" && intent !== "STABILIZE")) {
      intent = classifyTurnIntent(n);
    }

    const payloadAction = safeStr(n?.turnSignals?.payloadAction || "", 60).trim();
    const payloadYear = normYear(n?.turnSignals?.payloadYear);

    const actionable =
      !!safeStr(n.action || "", 80).trim() ||
      (payloadActionable && hasPayload && (payloadAction || payloadYear !== null)) ||
      (payloadActionable && textEmpty && hasPayload);

    if (actionable) intent = "ADVANCE";

    if (stalled && (mode === "architect" || mode === "transitional") && intent !== "ADVANCE") {
      intent = "CLARIFY";
    }

    let dominance = "neutral";
    let budget = "medium";

    if (mode === "architect" || mode === "transitional") {
      budget = "short";
      dominance = intent === "ADVANCE" ? "firm" : "neutral";
    } else {
      budget = "medium";
      dominance = intent === "ADVANCE" ? "neutral" : "soft";
    }

    const grounding = mode === "user" || mode === "transitional";
    let groundingMaxLines = intent === "STABILIZE" ? 3 : grounding ? 1 : 0;

    const psychSeed = computePsychologyReasoningObject(
      n,
      s,
      { mode, intent, dominance, budget, actionable, textEmpty, stalled },
      now
    );

    const latentDesire = inferLatentDesire(n, s, { mode, intent, dominance, budget });
    const confidence = inferConfidence(n, s, { mode, intent, dominance, budget });

    const psych0 = { ...psychSeed, motivation: safeStr(latentDesire || "", 16) };

    const lawSeed0 = {
      mode,
      intent,
      dominance,
      budget,
      groundingMaxLines,
      actionable,
      stalled,
      textEmpty: !!textEmpty,
      velvetAllowed: true,
    };

    const ethics0 = computeEthicsLayer(n, psych0, lawSeed0);

    const risk0 = computeRiskBridge(n, psych0, ethics0, lawSeed0);
    const lawSeed1 = applyRiskOverridesToLawSeed(lawSeed0, risk0);

    const lawApplied = applyLawLayer(lawSeed1, psych0);

    intent = normalizeMove(lawApplied.intent);
    dominance = normalizeDominance(lawApplied.dominance || dominance);
    budget = normalizeBudget(lawApplied.budget || budget);
    groundingMaxLines = clampInt(lawApplied.groundingMaxLines, 0, 3, groundingMaxLines);
    const velvetAllowed = lawApplied.velvetAllowed !== false;

    const velvet = computeVelvet(
      n,
      s,
      { mode, intent, dominance, budget, confidence },
      latentDesire,
      now,
      velvetAllowed
    );

    if (velvet.velvet && mode === "user" && intent !== "ADVANCE") dominance = "soft";
    if (
      latentDesire === LATENT_DESIRE.MASTERY &&
      (mode === "architect" || mode === "transitional") &&
      intent === "ADVANCE"
    ) {
      dominance = "firm";
    }

    let marionState = "SEEK";
    let marionReason = "default";
    const a = safeStr(n.action || "", 80).trim();

    if (intent === "STABILIZE") {
      marionState = "STABILIZE";
      marionReason = "intent_stabilize";
    } else if (intent === "ADVANCE") {
      marionState = "DELIVER";
      marionReason = actionable ? "actionable" : "advance";
    } else if (a === "switch_lane" || a === "ask_year") {
      marionState = "BRIDGE";
      marionReason = "routing";
    } else {
      marionState = "SEEK";
      marionReason = "clarify";
    }

    let cog = {
      marionVersion: MARION_VERSION,

      mode,
      intent,
      dominance,
      budget,

      stalled: !!stalled,
      actionable: !!actionable,
      textEmpty: !!textEmpty,
      groundingMaxLines,

      riskTier: safeStr(risk0?.riskTier || RISK.TIERS.NONE, 10),
      riskDomains: uniqBounded(risk0?.riskDomains || [], 6),
      riskSignals: uniqBounded(risk0?.riskSignals || [], 6),
      riskLawOverrides: isPlainObject(risk0?.lawOverrides) ? { ...risk0.lawOverrides } : {},

      lawTags: Array.isArray(lawApplied.lawTags) ? lawApplied.lawTags.slice(0, 8) : [],
      lawReasons: Array.isArray(lawApplied.lawReasons) ? lawApplied.lawReasons.slice(0, 8) : [],
      velvetAllowed: !!velvetAllowed,

      latentDesire,
      confidence: { user: clamp01(confidence.user), nyx: clamp01(confidence.nyx) },

      velvet: !!velvet.velvet,
      velvetSince: velvet.velvet ? Number(velvet.velvetSince || 0) || now : 0,
      velvetReason: safeStr(velvet.reason || "", 40),

      marionState,
      marionReason,

      marionStyle: MARION_STYLE_CONTRACT,
      handoff: {
        marionEndsHard: true,
        nyxBeginsAfter: true,
        allowSameTurnSplit: true,
        marionTagSuggested:
          intent === "ADVANCE"
            ? MARION_STYLE_CONTRACT.tags.ok
            : intent === "STABILIZE"
            ? MARION_STYLE_CONTRACT.tags.hold
            : MARION_STYLE_CONTRACT.tags.ok,
      },

      macModeOverride: macModeOverride || "",
      macModeWhy: Array.isArray(implicit.why) ? implicit.why.slice(0, 6).map((x) => safeStr(x, 60)) : [],

      ...(hysteresis && hysteresis.sessionPatchSuggestion ? { sessionPatchSuggestion: hysteresis.sessionPatchSuggestion } : {}),

      privacy: { noRawTextInTrace: true, boundedTrace: true, sideEffectFree: true },
    };

    cog = applyPsychologyToMediator(cog, psych0);

    const ethics = computeEthicsLayer(n, psych0, cog);
    cog.ethicsTags = ethics.ethicsTags;
    cog.ethicsSignals = ethics.ethicsSignals;

    const cyber = computeCyberLayer(n, psych0);
    cog.cyberTags = cyber.cyberTags;
    cog.cyberSignals = cyber.cyberSignals;

    const english = computeEnglishLayer(n, { mode: cog.mode, intent: cog.intent });
    cog.englishTags = english.englishTags;
    cog.englishSignals = english.englishSignals;

    const fin = computeFinanceLayer(n);
    cog.finTags = fin.finTags;
    cog.finSignals = fin.finSignals;

    const strat = computeStrategyLayer(n, { mode: cog.mode, intent: cog.intent }, psych0);
    cog.strategyTags = strat.strategyTags;
    cog.strategySignals = strat.strategySignals;

    // PsychologyKnowledge hints (mediator-safe)
    const psyHints = queryPsychologyKnowledge(n, s, cog);
    cog.psychologyHints = clampPsychHints(psyHints);

    // CyberKnowledge hints (mediator-safe, NO RAW TEXT)
    const cyHints = queryCyberKnowledge(n, s, cog);
    cog.cyberKnowledgeHints = clampCyberHints(cyHints);

    // EnglishKnowledge hints (mediator-safe, NO RAW TEXT)
    const enHints = queryEnglishKnowledge(n, s, cog);
    cog.englishKnowledgeHints = clampEnglishHints(enHints);

    const trace = buildTrace(n, s, {
      ...cog,
      confidence: cog.confidence,
      latentDesire: cog.latentDesire,
      velvet: cog.velvet,
      psychology: cog.psychology,
      movePolicy: cog.movePolicy,
      lawTags: cog.lawTags,
      ethicsTags: cog.ethicsTags,
      cyberTags: cog.cyberTags,
      psychologyHints: cog.psychologyHints,
      cyberKnowledgeHints: cog.cyberKnowledgeHints,
      englishKnowledgeHints: cog.englishKnowledgeHints,
    });

    cog.marionTrace = safeStr(trace, MARION_TRACE_MAX + 8);
    cog.marionTraceHash = hashTrace(trace);

    if (o && o.forceBudget && (o.forceBudget === "short" || o.forceBudget === "medium")) {
      cog.budget = o.forceBudget;
    }
    if (
      o &&
      o.forceDominance &&
      (o.forceDominance === "firm" || o.forceDominance === "neutral" || o.forceDominance === "soft")
    ) {
      cog.dominance = o.forceDominance;
    }
    if (
      o &&
      o.forceIntent &&
      (o.forceIntent === "ADVANCE" || o.forceIntent === "CLARIFY" || o.forceIntent === "STABILIZE")
    ) {
      cog.intent = o.forceIntent;
      cog.movePolicy = deriveMovePolicy(cog);
    }
    if (o && typeof o.forceVelvet === "boolean") {
      cog.velvet = o.forceVelvet;
      cog.velvetSince = o.forceVelvet ? now : 0;
      cog.velvetReason = o.forceVelvet ? "forced_on" : "forced_off";
      cog.movePolicy = deriveMovePolicy(cog);
    }

    const issues = tracePolicyCheck(cog, n, o);
    const final = finalizeContract(cog, now, { tracePolicyIssues: issues });

    return final;
  } catch (e) {
    const code = safeStr(e && (e.code || e.name) ? e.code || e.name : "ERR", 40);
    const now = nowMsDefault();
    const fail = {
      marionVersion: MARION_VERSION,
      mode: "architect",
      intent: "CLARIFY",
      dominance: "neutral",
      budget: "short",
      stalled: false,
      actionable: false,
      textEmpty: false,
      groundingMaxLines: 0,
      riskTier: RISK.TIERS.LOW,
      riskDomains: [],
      riskSignals: ["fail_open"],
      riskLawOverrides: {},
      lawTags: [LAW.TAGS.COHERENCE],
      lawReasons: ["fail_open"],
      velvetAllowed: false,
      latentDesire: LATENT_DESIRE.CURIOSITY,
      confidence: { user: 0.5, nyx: 0.55 },
      velvet: false,
      velvetSince: 0,
      velvetReason: "fail_open",
      marionState: "SEEK",
      marionReason: "fail_open",
      psychology: {
        cognitiveLoad: PSYCH.LOAD.MEDIUM,
        regulationState: PSYCH.REG.REGULATED,
        motivation: LATENT_DESIRE.CURIOSITY,
        agencyPreference: PSYCH.AGENCY.GUIDED,
        socialPressure: PSYCH.PRESSURE.LOW,
      },
      ethicsTags: [
        ETHICS.TAGS.NON_DECEPTIVE,
        ETHICS.TAGS.PRIVACY_MIN,
        ETHICS.TAGS.HARM_AVOIDANCE,
      ],
      ethicsSignals: [ETHICS.SIGNALS.USE_NEUTRAL_TONE],
      cyberTags: [CYBER.TAGS.DEFENSIVE_ONLY],
      cyberSignals: [CYBER.SIGNALS.SAFE_DEFAULTS],
      englishTags: [],
      englishSignals: [],
      finTags: [],
      finSignals: [],
      strategyTags: [],
      strategySignals: [],
      psychologyHints: { enabled: false, reason: "fail_open" },
      cyberKnowledgeHints: { enabled: false, reason: "fail_open" },
      englishKnowledgeHints: { enabled: false, reason: "fail_open" },
      movePolicy: { preferredMove: "CLARIFY", hardOverride: false, reason: "fail_open" },
      marionStyle: MARION_STYLE_CONTRACT,
      handoff: {
        marionEndsHard: true,
        nyxBeginsAfter: true,
        allowSameTurnSplit: true,
        marionTagSuggested: MARION_STYLE_CONTRACT.tags.retry,
      },
      marionTrace: "fail_open",
      marionTraceHash: sha1Lite("fail_open").slice(0, 10),
      macModeOverride: "",
      macModeWhy: [],
      privacy: { noRawTextInTrace: true, boundedTrace: true, sideEffectFree: true },
      errorCode: code,
    };
    return finalizeContract(fail, now, {});
  }
}

module.exports = {
  MARION_VERSION,
  LATENT_DESIRE,
  MARION_STYLE_CONTRACT,
  PSYCH,
  LAW,
  ETHICS,
  RISK,
  CYBER,
  ENGLISH,
  FIN,
  STRATEGY,
  mediate,

  // diagnostics
  buildTrace,
  hashTrace,

  // hardening exports (unit tests / integration)
  finalizeContract,
  tracePolicyCheck,
  suggestModeHysteresisPatch,

  // psych knowledge exports (integration tests)
  buildPsychologyQuery,
  queryPsychologyKnowledge,
  clampPsychHints,

  // cyber knowledge exports (integration tests)
  buildCyberQuery,
  queryCyberKnowledge,
  clampCyberHints,

  // english knowledge exports (integration tests)
  buildEnglishQuery,
  queryEnglishKnowledge,
  clampEnglishHints,

  // risk bridge exports (unit tests)
  computeRiskBridge,
  applyRiskOverridesToLawSeed,

  // law/ethics exports (unit tests)
  applyLawLayer,
  computeEthicsLayer,

  // cyber/english/finance/strategy exports (unit tests)
  computeCyberLayer,
  computeEnglishLayer,
  computeFinanceLayer,
  computeStrategyLayer,

  // psych exports (unit tests)
  computePsychologyReasoningObject,
  applyPsychologyToMediator,
};
