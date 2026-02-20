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
 * v1.1.8 (LANE EXPERT ROUTER++++ + CROSS-LANE GUARD++++ + GENERAL=ALL LANES++++)
 * ✅ Adds lane expert routing contract: effectiveLane + lanesUsed + crossLaneAllowed + lanesAvailable
 * ✅ General lane becomes true router across ALL knowledge lanes (English always-on as governor)
 * ✅ Hard guards against lane bleed: music/roku/news-canada/schedule default crossLaneAllowed=false
 * ✅ Preserves existing widget structure + bridge contract + sessionPatch routing + FAIL-OPEN
 */

const MARION_VERSION = "marionSO v1.1.8";

// -------------------------
// Optional PsycheBridge (FAIL-OPEN)
// -------------------------
let PsycheBridge = null;
try {
  // eslint-disable-next-line global-require
  PsycheBridge = require("./psycheBridge");
} catch (e) {
  PsycheBridge = null;
}

// -------------------------
// Optional Knowledge modules (legacy fallback; FAIL-OPEN)
// -------------------------
function safeRequire(relPath) {
  try {
    // eslint-disable-next-line global-require
    return require(relPath);
  } catch (_e) {
    return null;
  }
}

let PsychologyK = safeRequire("./psychologyKnowledge");
let CyberK = safeRequire("./cyberKnowledge");
let EnglishK = safeRequire("./englishKnowledge");
let FinanceK = safeRequire("./FinanceKnowledge"); // FIX++++ (capital F) for Linux/Render
let AIK = safeRequire("./aiKnowledge");

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
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)
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
function safeSerialize(x, max = 1200) {
  try {
    if (x === null || x === undefined) return "";
    if (typeof x === "string") return safeStr(x, max);
    if (typeof x === "number" || typeof x === "boolean") return safeStr(String(x), max);
    if (Array.isArray(x) || typeof x === "object") {
      const s = JSON.stringify(x);
      return safeStr(s, max);
    }
    return safeStr(String(x), max);
  } catch (e) {
    return safeStr(String(x), max);
  }
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
    OFFER_OPTIONS_NOT_ORDERS: "offer_options_not_orders",
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

// AI Layer v1 (intro + agents + ethics + cross-domain couplings)
const AI = Object.freeze({
  TAGS: Object.freeze({
    INTRO: "ai:intro",
    ML_CORE: "ai:ml_core",
    LLM: "ai:llm",
    AGENTS: "ai:agents",
    EVAL: "ai:eval",
    SAFETY: "ai:safety",
    GOVERNANCE: "ai:governance",
    AI_LAW: "ai:law",
    AI_PSY: "ai:psychology",
    AI_CYBER: "ai:cyber",
    AI_MKT: "ai:marketing",
  }),
  SIGNALS: Object.freeze({
    DEFINE_TERMS: "ai_define_terms",
    USE_EXAMPLES: "ai_use_examples",
    MENTION_LIMITS: "ai_mention_limits",
    EVAL_FIRST: "ai_eval_first",
    ASK_CONSTRAINTS: "ai_ask_constraints",
    SAFETY_POSTURE: "ai_safety_posture",
  }),
});

// Marion narration style contract (canonical policy hints)
const MARION_STYLE_CONTRACT = Object.freeze({
  maxSentences: 2,
  forbidTokens: ["sorry", "unfortunately", "i think", "maybe", "might", "i’m sorry", "im sorry"],
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
// NEW: Lane Expert Router contract (Nyx gets ALL knowledge lanes via Marion)
// -------------------------
const LANE_EXPERTS = Object.freeze({
  // internal “knowledge lanes” (NOT UI chips)
  ENGLISH: "english",
  CYBER: "cyber",
  FINANCE: "finance",
  STRATEGY: "strategy",
  AI: "ai",
  PSYCHOLOGY: "psychology",
  ETHICS: "ethics",
  LAW: "law",
  // UI-chip-specific lanes (still treated as lanesUsed when locked)
  MUSIC: "music",
  ROKU: "roku",
  RADIO: "radio",
  SCHEDULE: "schedule",
  NEWS_CANADA: "news-canada",
  GENERAL: "general",
});

const LANES_AVAILABLE = Object.freeze([
  LANE_EXPERTS.ENGLISH,
  LANE_EXPERTS.CYBER,
  LANE_EXPERTS.FINANCE,
  LANE_EXPERTS.STRATEGY,
  LANE_EXPERTS.AI,
  LANE_EXPERTS.PSYCHOLOGY,
  LANE_EXPERTS.ETHICS,
  LANE_EXPERTS.LAW,
  // chip lanes
  LANE_EXPERTS.MUSIC,
  LANE_EXPERTS.ROKU,
  LANE_EXPERTS.RADIO,
  LANE_EXPERTS.SCHEDULE,
  LANE_EXPERTS.NEWS_CANADA,
  LANE_EXPERTS.GENERAL,
]);

function clampLaneExperts(list, max = 6) {
  return uniqBounded(
    (Array.isArray(list) ? list : []).map((x) => safeStr(x, 24).trim().toLowerCase()),
    max
  );
}

function laneCrossAllowedByDefault(effectiveLane) {
  const ln = safeStr(effectiveLane || "", 40).trim().toLowerCase();
  // HARD GUARD: chip lanes do NOT cross by default (stops music bleed)
  if (ln === "music" || ln === "roku" || ln === "schedule" || ln === "news-canada" || ln === "radio") return false;
  // general is the router across all lanes
  if (ln === "general") return true;
  // unknown lanes: conservative default
  return false;
}

// Decide which knowledge experts to use this turn (Marion decides; Nyx displays)
// - General: English always-on + choose up to 4 more based on tags/risk
// - Music/Roku/etc: locked lane (no cross), but we still return English as “render governor” only if cross is allowed (it isn’t), so we keep it out to avoid bleed.
// - Stabilize intent: include psychology/ethics/law even in general
function computeLaneExpertRouting(effectiveLane, cog) {
  const ln = safeStr(effectiveLane || "", 40).trim().toLowerCase() || "general";
  const c = isPlainObject(cog) ? cog : {};

  const crossLaneAllowed = laneCrossAllowedByDefault(ln);

  // Locked chip lanes: keep them pure
  if (!crossLaneAllowed && ln !== "general") {
    const locked = ln;
    return {
      effectiveLane: locked,
      crossLaneAllowed: false,
      lanesUsed: clampLaneExperts([locked], 3),
      lanesAvailable: LANES_AVAILABLE,
      reason: "lane_lock",
    };
  }

  // General router (ALL knowledge lanes available; English is governor)
  const lanes = [];
  lanes.push(LANE_EXPERTS.ENGLISH);

  // Safety & regulation: pull in these lanes
  const intent = safeStr(c.intent || "", 16).toUpperCase();
  const riskTier = safeStr(c.riskTier || "", 10).toLowerCase();
  const riskDomains = Array.isArray(c.riskDomains) ? c.riskDomains : [];

  if (intent === "STABILIZE" || riskTier === RISK.TIERS.HIGH || riskDomains.includes(RISK.DOMAINS.SELF_HARM)) {
    lanes.push(LANE_EXPERTS.PSYCHOLOGY, LANE_EXPERTS.ETHICS, LANE_EXPERTS.LAW);
  }

  // Topic-based adds (bounded)
  if (Array.isArray(c.cyberTags) && c.cyberTags.length) lanes.push(LANE_EXPERTS.CYBER);
  if (Array.isArray(c.finTags) && c.finTags.length) lanes.push(LANE_EXPERTS.FINANCE);
  if (Array.isArray(c.strategyTags) && c.strategyTags.length) lanes.push(LANE_EXPERTS.STRATEGY);
  if (Array.isArray(c.aiTags) && c.aiTags.length) lanes.push(LANE_EXPERTS.AI);

  // If risk domain flags exist, map them
  if (riskDomains.includes(RISK.DOMAINS.CYBER)) lanes.push(LANE_EXPERTS.CYBER);
  if (riskDomains.includes(RISK.DOMAINS.FINANCIAL)) lanes.push(LANE_EXPERTS.FINANCE);
  if (riskDomains.includes(RISK.DOMAINS.LEGAL)) lanes.push(LANE_EXPERTS.LAW);

  // Keep it crisp: English + up to 4 others
  const pruned = clampLaneExperts(lanes, 5);
  return {
    effectiveLane: "general",
    crossLaneAllowed: true,
    lanesUsed: pruned,
    lanesAvailable: LANES_AVAILABLE,
    reason: "general_router",
  };
}

// -------------------------
// NEW: lane canonicalization (CHIP BRIDGE LOCK)
// -------------------------
function normalizeLaneRaw(v) {
  const s = safeStr(v, 40).trim().toLowerCase();
  if (!s) return "";
  // whitelist known lanes used by Nyx chips & backend
  if (
    s === "general" ||
    s === "music" ||
    s === "roku" ||
    s === "radio" ||
    s === "schedule" ||
    s === "news-canada"
  )
    return s;
  // allow other lanes but clamp token shape
  if (/^[a-z0-9][a-z0-9_-]{0,30}$/.test(s)) return s;
  return "";
}

function readPayloadLane(norm) {
  const n = isPlainObject(norm) ? norm : {};
  const ts = isPlainObject(n.turnSignals) ? n.turnSignals : {};
  // common places your stack might stash lane
  const candidates = [ts.payloadLane, ts.lane, n.payload && n.payload.lane, n.body && n.body.lane, n.lane];
  for (const c of candidates) {
    const v = normalizeLaneRaw(c);
    if (v) return v;
  }
  return "";
}

function detectChipSelect(norm) {
  const n = isPlainObject(norm) ? norm : {};
  const ts = isPlainObject(n.turnSignals) ? n.turnSignals : {};
  const payloadAction = safeStr(ts.payloadAction || "", 40).trim().toLowerCase();
  const payloadIntent = safeStr(ts.payloadIntent || "", 40).trim().toLowerCase();
  const payloadLabel = safeStr(ts.payloadLabel || ts.payloadChip || "", 40).trim().toLowerCase();

  // Host sends:
  // payload.action="chip", payload.intent="select", label=<chip>, lane=<lane>
  if (payloadAction === "chip") return { isChip: true, why: "payload_action_chip", label: payloadLabel };
  if (payloadIntent === "select" && payloadLabel) return { isChip: true, why: "payload_intent_select", label: payloadLabel };
  return { isChip: false, why: "", label: "" };
}

// -------------------------
// NEW: canonical bridge contract (Marion ↔ Nyx)
// -------------------------
function normalizeBridgeKind(k) {
  const s = safeStr(k, 24).trim().toLowerCase();
  if (s === "chip_select") return "chip_select";
  if (s === "lane_switch") return "lane_switch";
  if (s === "route") return "route";
  return "";
}
function buildBridgeContract(args) {
  const a = isPlainObject(args) ? args : {};
  const kind = normalizeBridgeKind(a.kind) || "";
  const laneFrom = normalizeLaneRaw(a.laneFrom) || "";
  const laneTo = normalizeLaneRaw(a.laneTo) || "";
  const reason = safeStr(a.reason || "", 40);
  const chipLabel = safeStr(a.chipLabel || "", 24).trim().toLowerCase();
  const payloadAction = safeStr(a.payloadAction || "", 24).trim().toLowerCase();

  if (!kind || !laneTo) return null;

  return {
    enabled: true,
    kind,
    laneFrom: laneFrom || "",
    laneTo,
    reason: reason || kind,
    chipLabel: chipLabel || "",
    payloadAction: payloadAction || "",
  };
}

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
  const t = safeStr(text, 1400).trim();
  if (!t) return { mode: "", scoreA: 0, scoreU: 0, scoreT: 0, why: [] };

  const s = t.toLowerCase();
  let a = 0,
    u = 0,
    tr = 0;
  const why = [];

  if (/\b(let's|lets)\s+(define|design|lock|implement|encode|ship|wire)\b/.test(s)) {
    a += 3;
    why.push("architect:lets-define/design");
  }
  if (/\b(non[-\s]?negotiable|must|hard rule|lock this in|constitution|mediator|pipeline|governor|decision table)\b/.test(s)) {
    a += 3;
    why.push("architect:constraints/architecture");
  }
  if (/\b(step\s*\d+|1\s*,\s*2\s*,\s*3|1\s*2\s*3)\b/.test(s) || /\b\d+\)\s/.test(s)) {
    a += 2;
    why.push("architect:enumeration");
  }
  if (/\b(index\.js|chatengine\.js|statespine\.js|render|cors|session|payload|json|endpoint|route|resolver|pack|tests?)\b/.test(s)) {
    a += 2;
    why.push("architect:technical");
  }

  if (/\b(i('?m)?\s+not\s+sure|help\s+me\s+understand|does\s+this\s+make\s+sense|where\s+do i|get\s+the\s+url)\b/.test(s)) {
    u += 3;
    why.push("user:uncertainty/how-to");
  }
  if (/\b(confused|stuck|frustrated|overwhelmed|worried)\b/.test(s)) {
    u += 2;
    why.push("user:emotion");
  }

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
  const s = isPlainObject(session) ? session : {};
  const prevMode = normalizeMacModeRaw(s.macMode || s.mode || s.lastMode || "");
  const nextMode = normalizeMacModeRaw(chosenMode);

  if (!nextMode) return null;

  const confA = Number(implicit?.scoreA) || 0;
  const confU = Number(implicit?.scoreU) || 0;
  const confT = Number(implicit?.scoreT) || 0;

  let conf = 0.55;
  if (nextMode === "transitional") conf = 0.65;
  else if (nextMode === "architect") conf = clamp01(0.5 + confA * 0.05);
  else if (nextMode === "user") conf = clamp01(0.5 + confU * 0.05);

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

/* =========================
   LEGACY KNOWLEDGE WIRES
   (UNCHANGED from your file)
   ========================= */

function buildPsychologyQuery(norm, session, cog) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(session) ? session : {};
  const c = isPlainObject(cog) ? cog : {};

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

  const needs = [];
  if (intent === "STABILIZE" || reg === PSYCH.REG.DYSREGULATED) needs.push("regulation");
  if (reg === PSYCH.REG.STRAINED) needs.push("reduce_load");
  if (load === PSYCH.LOAD.HIGH) needs.push("brevity");
  if (agency === PSYCH.AGENCY.AUTONOMOUS) needs.push("options");
  if (desire === "mastery") needs.push("framework");
  if (desire === "comfort") needs.push("validation");
  if (riskTier === "high" || riskDomains.includes("risk:self_harm")) needs.push("safety_redirect");

  const tokens = safeTokenSet(
    [lane || "", action || "", intent || "", mode || "", desire || "", reg || "", load || "", pressure || "", ...riskDomains, ...needs],
    12
  );

  const keyObj = { lane, action, intent, mode, desire, reg, load, agency, pressure, riskTier, riskDomains, tokens };
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
  if (!PsychologyK || typeof PsychologyK !== "object") return { enabled: false, reason: "module_missing" };

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

/* =========================
   CYBER / ENGLISH / FIN / AI legacy wires
   (UNCHANGED from your file)
   ========================= */

function buildCyberQuery(norm, session, cog) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(session) ? session : {};
  const c = isPlainObject(cog) ? cog : {};

  const action = safeStr(n.action || "", 24).trim().toLowerCase();
  const lane = safeStr(n.lane || s.lane || "", 24).trim().toLowerCase();
  const intent = safeStr(c.intent || "", 12).trim().toUpperCase();
  const mode = safeStr(c.mode || "", 16).trim().toLowerCase();

  const riskTier = safeStr(c.riskTier || "", 10).trim().toLowerCase();
  const riskDomains = safeTokenSet(c.riskDomains || [], 6);

  const cyberTags = safeTokenSet(c.cyberTags || [], 8);
  const cyberSignals = safeTokenSet(c.cyberSignals || [], 8);

  const needs = [];
  if (cyberTags.includes(CYBER.TAGS.REDTEAM_BLOCK)) needs.push("posture");
  if (riskDomains.includes(RISK.DOMAINS.CYBER)) needs.push("risk:cyber");
  if (riskTier === RISK.TIERS.HIGH) needs.push("contain");
  if (intent === "ADVANCE") needs.push("mitigation");
  if (intent === "CLARIFY") needs.push("triage");
  if (intent === "STABILIZE") needs.push("containment");

  const tokens = safeTokenSet(
    ["risk:cyber", lane || "", action || "", intent || "", mode || "", riskTier || "", ...riskDomains, ...cyberTags, ...cyberSignals, ...needs],
    14
  );

  const keyObj = { lane, action, intent, mode, riskTier, riskDomains, cyberTags, cyberSignals, tokens };
  const queryKey = sha1Lite(JSON.stringify(keyObj)).slice(0, 14);

  return {
    enabled: true,
    queryKey,
    tokens,
    features: { lane, action, intent, mode, riskTier, riskDomains, cyberTags, cyberSignals, needs: safeTokenSet(needs, 8) },
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
  if (!CyberK || typeof CyberK !== "object") return { enabled: false, reason: "module_missing" };

  try {
    if (typeof CyberK.getMarionHints === "function") {
      const res = CyberK.getMarionHints(
        { features: q.features, tokens: q.tokens, queryKey: q.queryKey },
        { session: isPlainObject(session) ? session : {}, cog: isPlainObject(cog) ? cog : {} }
      );
      const h = clampCyberHints(res);
      return { ...h, enabled: true, queryKey: q.queryKey };
    }

    if (typeof CyberK.query === "function") {
      const res = CyberK.query({ features: q.features, tokens: q.tokens, queryKey: q.queryKey });
      const h = clampCyberHints(res);
      return { ...h, enabled: true, queryKey: q.queryKey };
    }

    const packs = isPlainObject(CyberK.PACK_FILES) ? CyberK.PACK_FILES : null;
    if (packs) {
      return clampCyberHints({
        enabled: true,
        queryKey: q.queryKey,
        packs: { safetyPosture: packs.safetyPosture || "", topPacks: [], versions: packs },
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

function buildEnglishQuery(norm, session, cog) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(session) ? session : {};
  const c = isPlainObject(cog) ? cog : {};

  const action = safeStr(n.action || "", 24).trim().toLowerCase();
  const lane = safeStr(n.lane || s.lane || "", 24).trim().toLowerCase();
  const intent = safeStr(c.intent || "", 12).trim().toUpperCase();
  const mode = safeStr(c.mode || "", 16).trim().toLowerCase();

  const riskTier = safeStr(c.riskTier || "", 10).trim().toLowerCase();
  const riskDomains = safeTokenSet(c.riskDomains || [], 6);

  const englishTags = safeTokenSet(c.englishTags || [], 8);
  const englishSignals = safeTokenSet(c.englishSignals || [], 8);

  const needs = [];
  if (englishTags.includes(ENGLISH.TAGS.CLARITY)) needs.push("clarity");
  if (englishTags.includes(ENGLISH.TAGS.STRUCTURE)) needs.push("structure");
  if (englishTags.includes(ENGLISH.TAGS.AUDIENCE)) needs.push("audience");
  if (englishTags.includes(ENGLISH.TAGS.TONE)) needs.push("tone");
  if (englishTags.includes(ENGLISH.TAGS.DEFINITIONS)) needs.push("definitions");
  if (englishSignals.includes(ENGLISH.SIGNALS.DEFINE_JARGON)) needs.push("define_jargon");
  if (englishSignals.includes(ENGLISH.SIGNALS.USE_PLAIN_LANGUAGE)) needs.push("plain_language");

  if (riskTier === RISK.TIERS.HIGH || riskDomains.includes(RISK.DOMAINS.SELF_HARM)) needs.push("safety_redirect");

  const tokens = safeTokenSet(
    ["english", lane || "", action || "", intent || "", mode || "", riskTier || "", ...riskDomains, ...englishTags, ...englishSignals, ...needs],
    14
  );

  const keyObj = { lane, action, intent, mode, riskTier, riskDomains, englishTags, englishSignals, tokens };
  const queryKey = sha1Lite(JSON.stringify(keyObj)).slice(0, 14);

  return {
    enabled: true,
    queryKey,
    tokens,
    features: { lane, action, intent, mode, riskTier, riskDomains, englishTags, englishSignals, needs: safeTokenSet(needs, 10) },
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
  if (!EnglishK || typeof EnglishK !== "object") return { enabled: false, reason: "module_missing" };

  try {
    if (typeof EnglishK.getMarionHints === "function") {
      const res = EnglishK.getMarionHints(
        { features: q.features, tokens: q.tokens, queryKey: q.queryKey },
        { session: isPlainObject(session) ? session : {}, cog: isPlainObject(cog) ? cog : {} }
      );
      const h = clampEnglishHints(res);
      return { ...h, enabled: true, queryKey: q.queryKey };
    }

    if (typeof EnglishK.query === "function") {
      const res = EnglishK.query({ features: q.features, tokens: q.tokens, queryKey: q.queryKey });
      const h = clampEnglishHints(res);
      return { ...h, enabled: true, queryKey: q.queryKey };
    }

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

function buildFinanceQuery(norm, session, cog) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(session) ? session : {};
  const c = isPlainObject(cog) ? cog : {};

  const action = safeStr(n.action || "", 24).trim().toLowerCase();
  const lane = safeStr(n.lane || s.lane || "", 24).trim().toLowerCase();
  const intent = safeStr(c.intent || "", 12).trim().toUpperCase();
  const mode = safeStr(c.mode || "", 16).trim().toLowerCase();

  const riskTier = safeStr(c.riskTier || "", 10).trim().toLowerCase();
  const riskDomains = safeTokenSet(c.riskDomains || [], 6);

  const finTags = safeTokenSet(c.finTags || [], 8);
  const finSignals = safeTokenSet(c.finSignals || [], 8);

  const needs = [];
  if (finTags.includes(FIN.TAGS.UNIT_ECON)) needs.push("unit_econ");
  if (finTags.includes(FIN.TAGS.PRICING)) needs.push("pricing");
  if (finTags.includes(FIN.TAGS.BUDGETING)) needs.push("budgeting");
  if (finTags.includes(FIN.TAGS.COMPLIANCE)) needs.push("compliance");
  if (finSignals.includes(FIN.SIGNALS.CLARIFY_ASSUMPTIONS)) needs.push("clarify_assumptions");
  if (finSignals.includes(FIN.SIGNALS.ASK_CONSTRAINTS)) needs.push("ask_constraints");
  if (finSignals.includes(FIN.SIGNALS.USE_SCENARIOS)) needs.push("scenarios");
  if (finSignals.includes(FIN.SIGNALS.ENCOURAGE_PRO)) needs.push("encourage_pro");
  if (riskTier === RISK.TIERS.HIGH || riskDomains.includes(RISK.DOMAINS.SELF_HARM)) needs.push("safety_redirect");

  const tokens = safeTokenSet(
    ["finance", lane || "", action || "", intent || "", mode || "", riskTier || "", ...riskDomains, ...finTags, ...finSignals, ...needs],
    14
  );

  const keyObj = { lane, action, intent, mode, riskTier, riskDomains, finTags, finSignals, tokens };
  const queryKey = sha1Lite(JSON.stringify(keyObj)).slice(0, 14);

  return {
    enabled: true,
    queryKey,
    tokens,
    features: { lane, action, intent, mode, riskTier, riskDomains, finTags, finSignals, needs: safeTokenSet(needs, 10) },
  };
}

function clampFinanceHints(hints) {
  const h = isPlainObject(hints) ? hints : {};
  return {
    enabled: !!h.enabled,
    queryKey: safeStr(h.queryKey || "", 18),
    packs: isPlainObject(h.packs) ? { primary: safeStr(h.packs.primary || "", 64), versions: isPlainObject(h.packs.versions) ? h.packs.versions : {} } : {},
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

function queryFinanceKnowledge(norm, session, cog) {
  const q = buildFinanceQuery(norm, session, cog);
  if (!q.enabled) return { enabled: false, reason: "disabled" };
  if (!FinanceK || typeof FinanceK !== "object") return { enabled: false, reason: "module_missing" };

  try {
    if (typeof FinanceK.getMarionHints === "function") {
      const res = FinanceK.getMarionHints(
        { features: q.features, tokens: q.tokens, queryKey: q.queryKey },
        { session: isPlainObject(session) ? session : {}, cog: isPlainObject(cog) ? cog : {} }
      );
      const h = clampFinanceHints(res);
      return { ...h, enabled: true, queryKey: q.queryKey };
    }

    if (typeof FinanceK.query === "function") {
      const res = FinanceK.query({ features: q.features, tokens: q.tokens, queryKey: q.queryKey });
      const h = clampFinanceHints(res);
      return { ...h, enabled: true, queryKey: q.queryKey };
    }

    const packs = isPlainObject(FinanceK.PACK_FILES) ? FinanceK.PACK_FILES : null;
    if (packs) {
      return clampFinanceHints({
        enabled: true,
        queryKey: q.queryKey,
        packs: { primary: "", versions: packs },
        confidence: 0,
        reason: "packs_only",
      });
    }

    return { enabled: false, reason: "no_api" };
  } catch (e) {
    const code = safeStr(e && (e.code || e.name) ? e.code || e.name : "ERR", 40);
    return { enabled: false, reason: `finance_query_fail:${code}` };
  }
}

function buildAIQuery(norm, session, cog) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(session) ? session : {};
  const c = isPlainObject(cog) ? cog : {};

  const action = safeStr(n.action || "", 24).trim().toLowerCase();
  const lane = safeStr(n.lane || s.lane || "", 24).trim().toLowerCase();
  const intent = safeStr(c.intent || "", 12).trim().toUpperCase();
  const mode = safeStr(c.mode || "", 16).trim().toLowerCase();

  const riskTier = safeStr(c.riskTier || "", 10).trim().toLowerCase();
  const riskDomains = safeTokenSet(c.riskDomains || [], 6);

  const aiTags = safeTokenSet(c.aiTags || [], 10);
  const aiSignals = safeTokenSet(c.aiSignals || [], 10);

  const needs = [];
  if (aiSignals.includes(AI.SIGNALS.DEFINE_TERMS)) needs.push("define_terms");
  if (aiSignals.includes(AI.SIGNALS.EVAL_FIRST)) needs.push("eval_first");
  if (aiSignals.includes(AI.SIGNALS.ASK_CONSTRAINTS)) needs.push("ask_constraints");
  if (aiSignals.includes(AI.SIGNALS.SAFETY_POSTURE)) needs.push("safety_posture");

  const tokens = safeTokenSet(
    ["ai", lane || "", action || "", intent || "", mode || "", riskTier || "", ...riskDomains, ...aiTags, ...aiSignals, ...needs],
    16
  );

  const keyObj = { lane, action, intent, mode, riskTier, riskDomains, aiTags, aiSignals, tokens };
  const queryKey = sha1Lite(JSON.stringify(keyObj)).slice(0, 14);

  return {
    enabled: true,
    queryKey,
    tokens,
    features: { lane, action, intent, mode, riskTier, riskDomains, aiTags, aiSignals, needs: safeTokenSet(needs, 10) },
  };
}

function clampAIHints(hints) {
  const h = isPlainObject(hints) ? hints : {};
  return {
    enabled: !!h.enabled,
    queryKey: safeStr(h.queryKey || "", 18),
    packs: isPlainObject(h.packs)
      ? {
          intro: safeStr(h.packs.intro || "", 64),
          ethicsLaw: safeStr(h.packs.ethicsLaw || "", 64),
          agents: safeStr(h.packs.agents || "", 64),
          cross: uniqBounded(h.packs.cross || [], 6),
          versions: isPlainObject(h.packs.versions) ? h.packs.versions : {},
        }
      : {},
    focus: safeStr(h.focus || "", 32),
    stance: safeStr(h.stance || "", 32),
    principles: uniqBounded(h.principles || [], 10),
    frameworks: uniqBounded(h.frameworks || [], 8),
    guardrails: uniqBounded(h.guardrails || [], 8),
    exampleTypes: uniqBounded(h.exampleTypes || [], 8),
    responseCues: uniqBounded(h.responseCues || [], 10),
    hits: uniqBounded(h.hits || [], 12),
    confidence: clamp01(h.confidence),
    reason: safeStr(h.reason || "", 60),
  };
}

function queryAIKnowledge(norm, session, cog) {
  const q = buildAIQuery(norm, session, cog);
  if (!q.enabled) return { enabled: false, reason: "disabled" };
  if (!AIK || typeof AIK !== "object") return { enabled: false, reason: "module_missing" };

  try {
    if (typeof AIK.getMarionHints === "function") {
      const res = AIK.getMarionHints(
        { features: q.features, tokens: q.tokens, queryKey: q.queryKey },
        { session: isPlainObject(session) ? session : {}, cog: isPlainObject(cog) ? cog : {} }
      );
      const h = clampAIHints(res);
      return { ...h, enabled: true, queryKey: q.queryKey };
    }

    if (typeof AIK.query === "function") {
      const res = AIK.query({ features: q.features, tokens: q.tokens, queryKey: q.queryKey });
      const h = clampAIHints(res);
      return { ...h, enabled: true, queryKey: q.queryKey };
    }

    const packs = isPlainObject(AIK.PACK_FILES) ? AIK.PACK_FILES : null;
    if (packs) {
      return clampAIHints({
        enabled: true,
        queryKey: q.queryKey,
        packs: { intro: packs.ai_intro || "", ethicsLaw: packs.ai_law_ethics || "", agents: packs.ai_agents || "", cross: [], versions: packs },
        confidence: 0,
        reason: "packs_only",
      });
    }

    return { enabled: false, reason: "no_api" };
  } catch (e) {
    const code = safeStr(e && (e.code || e.name) ? e.code || e.name : "ERR", 40);
    return { enabled: false, reason: `ai_query_fail:${code}` };
  }
}

// -------------------------
// PSYCHOLOGY LAYER (always-on, deterministic, bounded)
// -------------------------
function estimateCognitiveLoad(norm, session, nowMs) {
  const text = safeStr(norm?.text || "", 1400);
  const s = text.toLowerCase();

  const len = text.length;
  const hasEnum = /\b(step\s*\d+|1\s*,\s*2\s*,\s*3|1\s*2\s*3)\b/.test(s) || /\b\d+\)\s/.test(s);
  const qMarks = (text.match(/\?/g) || []).length;
  const tech =
    /\b(index\.js|chatengine\.js|statespine\.js|cors|session|payload|endpoint|route|resolver|deterministic|contract|telemetry|policy|json|tests?)\b/.test(
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

  if (/\b(panic|i can'?t breathe|i'?m freaking out|meltdown|spiral|breakdown|i can'?t do this)\b/.test(text)) {
    return PSYCH.REG.DYSREGULATED;
  }

  if (/\b(overwhelmed|stuck|frustrated|anxious|stress(ed)?|worried|i'?m not sure|confused)\b/.test(text)) {
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
  if (/\b(demo|client|stakeholder|investor|sponsor|launch|press|deadline|meeting)\b/.test(text)) return PSYCH.PRESSURE.HIGH;
  if (/\b(team|we need|today|this week|timeline)\b/.test(text)) return PSYCH.PRESSURE.MEDIUM;
  return PSYCH.PRESSURE.LOW;
}

function computePsychologyReasoningObject(norm, session, medSeed, nowMs) {
  const mode = safeStr(medSeed?.mode || "", 20).toLowerCase();
  const load = estimateCognitiveLoad(norm, session, nowMs);
  const regulationState = estimateRegulationState(norm);
  const agencyPreference = estimateAgencyPreference(norm, session, mode);
  const socialPressure = estimateSocialPressure(norm);
  return { cognitiveLoad: load, regulationState, motivation: "", agencyPreference, socialPressure };
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

  const selfHarm = /\b(suicid(e|al)|kill myself|end it all|self[-\s]?harm|cutting|i don't want to live)\b/.test(text);

  if (selfHarm) {
    tags.push(ETHICS.TAGS.HARM_AVOIDANCE, ETHICS.TAGS.SAFETY_REDIRECT);
    signals.push(ETHICS.SIGNALS.MINIMIZE_RISKY_DETAIL, ETHICS.SIGNALS.ENCOURAGE_HELP_SEEKING);
  } else if (reg === PSYCH.REG.DYSREGULATED) {
    tags.push(ETHICS.TAGS.HARM_AVOIDANCE);
    signals.push(ETHICS.SIGNALS.USE_NEUTRAL_TONE, ETHICS.SIGNALS.MINIMIZE_RISKY_DETAIL);
  }

  tags.push(ETHICS.TAGS.AGENCY_RESPECT);
  if (agencyPref === PSYCH.AGENCY.AUTONOMOUS && !s.actionable) signals.push(ETHICS.SIGNALS.OFFER_OPTIONS_NOT_ORDERS);

  return {
    ethicsTags: uniqBounded(tags.map((x) => safeStr(x, 32)), 8),
    ethicsSignals: uniqBounded(signals.map((x) => safeStr(x, 40)), 6),
  };
}

// -------------------------
// RISKBRIDGE v1
// -------------------------
// (UNCHANGED)
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

  const selfHarm = /\b(suicid(e|al)|kill myself|end it all|self[-\s]?harm|cutting|i don't want to live)\b/.test(text);
  if (selfHarm) {
    domains.push(RISK.DOMAINS.SELF_HARM);
    tier = RISK.TIERS.HIGH;
    signals.push("containment_required");
  }

  const violence = /\b(kill|murder|shoot|stab|bomb|attack|hurt them|hurt him|hurt her|beat (them|him|her)|make a weapon)\b/.test(text);
  if (violence) {
    domains.push(RISK.DOMAINS.VIOLENCE);
    if (tier !== RISK.TIERS.HIGH) tier = RISK.TIERS.MEDIUM;
    signals.push("violence_related");
  }

  const illegal = /\b(how to (steal|fraud)|bypass (the )?law|evade (the )?law|counterfeit|forg(e|ery)|identity theft)\b/.test(text);
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

  const sexual = /\b(nudes?|porn|explicit|sexual|sex tape|onlyfans|hook up|fetish|bdsm)\b/.test(text);
  if (sexual) {
    domains.push(RISK.DOMAINS.SEXUAL);
    if (tier !== RISK.TIERS.HIGH) tier = RISK.TIERS.MEDIUM;
    signals.push("sexual_content");
  }

  const hate =
    /\b(nazi|white power|genocide|ethnic cleansing|kill (all|the) (jews|muslims|christians|blacks|whites)|racial superiority)\b/.test(text);
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

  if (tier === RISK.TIERS.HIGH) {
    lawOverrides.budgetClamp = "short";
    lawOverrides.velvetBlock = true;
    lawOverrides.dominanceBias = "firm";
    if (!actionable) lawOverrides.forceIntent = "STABILIZE";
  } else if (tier === RISK.TIERS.MEDIUM) {
    lawOverrides.budgetClamp = "short";
    lawOverrides.velvetBlock = true;
  } else if (tier === RISK.TIERS.LOW && !actionable) {
    lawOverrides.budgetClamp = "short";
  }

  if (Array.isArray(e.ethicsTags) && e.ethicsTags.includes(ETHICS.TAGS.SAFETY_REDIRECT)) {
    signals.push("ethics_safety_redirect");
    if (!domains.includes(RISK.DOMAINS.SELF_HARM)) domains.push(RISK.DOMAINS.SELF_HARM);
    tier = RISK.TIERS.HIGH;
    lawOverrides.forceIntent = "STABILIZE";
    lawOverrides.budgetClamp = "short";
    lawOverrides.velvetBlock = true;
    lawOverrides.dominanceBias = "firm";
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

  // forceIntent must win even if actionable (safety precedence)
  if (o.forceIntent) {
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

  if (actionable && out.intent !== "STABILIZE") {
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

/* =========================
   CYBER / ENGLISH / FIN / STRATEGY / AI layers
   (UNCHANGED logic — same as your file)
   ========================= */

function computeCyberLayer(norm, psych) {
  const n = isPlainObject(norm) ? norm : {};
  const p = isPlainObject(psych) ? psych : {};

  const text = safeStr(n?.text || "", 1400).toLowerCase();

  const tags = [CYBER.TAGS.DEFENSIVE_ONLY];
  const signals = [CYBER.SIGNALS.SAFE_DEFAULTS];

  const mentionsSecurity =
    /\b(cyber|security|infosec|privacy|phish|phishing|malware|ransom|ddos|sql injection|xss|csrf|breach|exploit|hack)\b/.test(text);

  const socialEng = /\b(phish|phishing|social engineering|impersonat|spoof|fraud|scam|otp|2fa code|verification code)\b/.test(text);

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
  if (reg === PSYCH.REG.DYSREGULATED && mentionsSecurity) signals.push(CYBER.SIGNALS.AVOID_STEP_BY_STEP);

  if (suspiciousAsk) {
    tags.push(CYBER.TAGS.REDTEAM_BLOCK);
    signals.push(CYBER.SIGNALS.AVOID_STEP_BY_STEP, CYBER.SIGNALS.SUGGEST_DEFENSIVE_ALTS);
  }

  return { cyberTags: uniqBounded(tags, 8), cyberSignals: uniqBounded(signals, 6) };
}

function computeEnglishLayer(norm, seed) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(seed) ? seed : {};
  const text = safeStr(n?.text || "", 1400).toLowerCase();
  const action = safeStr(n?.action || "", 80).toLowerCase();

  const tags = [];
  const signals = [];

  const writingAsk = /\b(rewrite|revise|edit|proofread|grammar|spelling|tone|make this clearer|summarize|shorten|simplify|translate)\b/.test(text);

  const docOrComms = /\b(email|letter|proposal|pitch|script|press release|bio|about page|copy|caption)\b/.test(text);

  const technicalDensity = /\b(api|cors|endpoint|resolver|session|deterministic|contract|telemetry|governor|policy)\b/.test(text);

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

function computeFinanceLayer(norm) {
  const n = isPlainObject(norm) ? norm : {};
  const text = safeStr(n?.text || "", 1400).toLowerCase();

  const tags = [];
  const signals = [];

  const financeTopic =
    /\b(price|pricing|revenue|profit|margin|budget|cashflow|forecast|break[-\s]?even|roi|lifetime value|ltv|cac|unit economics|economics|tax|sred|grant|funding|invoice|subscription)\b/.test(
      text
    );

  const investingTopic = /\b(invest|portfolio|stocks?|crypto|options trading|day trade|forex)\b/.test(text);

  if (financeTopic || investingTopic) {
    tags.push(FIN.TAGS.NON_ADVICE);
    signals.push(FIN.SIGNALS.CLARIFY_ASSUMPTIONS, FIN.SIGNALS.ASK_CONSTRAINTS);

    if (/\bprice|pricing\b/.test(text)) tags.push(FIN.TAGS.PRICING);
    if (/\b(budget|cashflow|forecast)\b/.test(text)) tags.push(FIN.TAGS.BUDGETING);
    if (/\b(ltv|cac|unit economics|margin|break[-\s]?even)\b/.test(text)) tags.push(FIN.TAGS.UNIT_ECON);

    if (/\b(tax|sred|grant|funding|compliance)\b/.test(text)) {
      tags.push(FIN.TAGS.COMPLIANCE, FIN.TAGS.RISK_DISCLOSURE);
      signals.push(FIN.SIGNALS.ENCOURAGE_PRO);
    } else if (investingTopic) {
      tags.push(FIN.TAGS.RISK_DISCLOSURE);
      signals.push(FIN.SIGNALS.USE_SCENARIOS);
    }
  }

  return { finTags: uniqBounded(tags.map((x) => safeStr(x, 28)), 8), finSignals: uniqBounded(signals.map((x) => safeStr(x, 40)), 6) };
}

function computeStrategyLayer(norm, seed, psych) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(seed) ? seed : {};
  const p = isPlainObject(psych) ? psych : {};
  const text = safeStr(n?.text || "", 1400).toLowerCase();

  const tags = [];
  const signals = [];

  const strategicLanguage =
    /\b(strategy|strategic|roadmap|milestone|priorit(y|ize)|trade[-\s]?off|risk|constraint|decision|plan|architecture|system|governance)\b/.test(text);

  const measurementLanguage = /\b(metric|kpi|measure|benchmark|baseline|success criteria|a\/b|experiment)\b/.test(text);

  const sequencingLanguage = /\b(first|next|then|after that|sequence|phase|layer|step\s*\d+)\b/.test(text);

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

  if (safeStr(p.cognitiveLoad || "", 12) === PSYCH.LOAD.HIGH && tags.length) signals.push(STRATEGY.SIGNALS.NEXT_ACTIONS);

  return { strategyTags: uniqBounded(tags.map((x) => safeStr(x, 28)), 8), strategySignals: uniqBounded(signals.map((x) => safeStr(x, 40)), 6) };
}

function computeAILayer(norm) {
  const n = isPlainObject(norm) ? norm : {};
  const text = safeStr(n?.text || "", 1400).toLowerCase();

  const tags = [];
  const signals = [];

  const aiCore =
    /\b(artificial intelligence|ai\b|machine learning|ml\b|deep learning|neural network|supervised|unsupervised|reinforcement learning)\b/.test(text);
  const llm =
    /\b(llm|large language model|transformer|prompt|rag|retrieval[-\s]?augmented|embedding|vector database|fine[-\s]?tune|alignment|rlhf)\b/.test(text);
  const agents = /\b(agent(s)?|tool use|function calling|planner|orchestrator|workflow automation)\b/.test(text);
  const evals = /\b(eval|evaluation|benchmark|metrics|hallucination|grounding|confidence|tests?)\b/.test(text);
  const governance = /\b(governance|policy|compliance|audit|model risk|risk management)\b/.test(text);

  const aiLaw = /\b(ai.*law|law.*ai|legal|contract|liability|privacy law|gdpr|pipeda|copyright|trademark|case law)\b/.test(text);
  const aiPsy = /\b(ai.*psych|psych.*ai|cognitive|bias|therapy|mental health)\b/.test(text);
  const aiCyber = /\b(ai.*cyber|cyber.*ai|security|infosec|malware|phish|breach)\b/.test(text);
  const aiMkt = /\b(ai.*marketing|marketing.*ai|ads|seo|copywriting|campaign|conversion|funnel)\b/.test(text);

  if (aiCore) tags.push(AI.TAGS.INTRO, AI.TAGS.ML_CORE);
  if (llm) tags.push(AI.TAGS.LLM);
  if (agents) tags.push(AI.TAGS.AGENTS);
  if (evals) tags.push(AI.TAGS.EVAL);
  if (governance) tags.push(AI.TAGS.GOVERNANCE);

  if (aiLaw) tags.push(AI.TAGS.AI_LAW);
  if (aiPsy) tags.push(AI.TAGS.AI_PSY);
  if (aiCyber) tags.push(AI.TAGS.AI_CYBER);
  if (aiMkt) tags.push(AI.TAGS.AI_MKT);

  if (aiCore || llm || agents) signals.push(AI.SIGNALS.DEFINE_TERMS, AI.SIGNALS.USE_EXAMPLES, AI.SIGNALS.MENTION_LIMITS);
  if (evals) signals.push(AI.SIGNALS.EVAL_FIRST);
  if (agents) signals.push(AI.SIGNALS.ASK_CONSTRAINTS);
  if (governance || aiLaw) signals.push(AI.SIGNALS.SAFETY_POSTURE);

  return { aiTags: uniqBounded(tags, 10), aiSignals: uniqBounded(signals, 10) };
}

// -------------------------
// Apply PRO impacts to mediator outputs
// -------------------------
function applyPsychologyToMediator(cog, psych) {
  const out = isPlainObject(cog) ? { ...cog } : {};
  const p = isPlainObject(psych) ? psych : {};

  if (p.cognitiveLoad === PSYCH.LOAD.HIGH || p.socialPressure === PSYCH.PRESSURE.HIGH) out.budget = "short";

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
    if (out.intent === "ADVANCE") out.dominance = out.dominance === "soft" ? "neutral" : out.dominance;
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

  if (/\b(i('?m)?\s+stuck|i('?m)?\s+worried|overwhelmed|frustrated|anxious|panic|stress(ed)?|reassure|calm)\b/.test(text)) {
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

  if (/\b(optimi[sz]e|systems?|framework|architecture|hard(en)?|constraints?|regression tests?|unit tests?|audit|refactor|contract|deterministic)\b/.test(t)) {
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
    return { velvet: false, velvetSince: Number(s.velvetSince || 0) || 0, reason: already ? "forced_exit" : "blocked" };
  }

  let signals = 0;
  if (wantsDepth) signals++;
  if (repeatedTopic) signals++;
  if (acceptedChip) signals++;
  if (clamp01(med?.confidence?.nyx) >= 0.6) signals++;
  if (desire === LATENT_DESIRE.COMFORT || desire === LATENT_DESIRE.CURIOSITY) signals++;

  if (!musicFirstEligible) return { velvet: already, velvetSince: Number(s.velvetSince || 0) || 0, reason: already ? "carry" : "no" };

  if (already) {
    if (safeStr(med?.intent || "", 20).toUpperCase() === "STABILIZE") return { velvet: false, velvetSince: Number(s.velvetSince || 0) || 0, reason: "stabilize_exit" };
    if (lastLane && lane && lastLane !== lane) return { velvet: false, velvetSince: Number(s.velvetSince || 0) || 0, reason: "lane_shift_exit" };
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
  const bridgeKind = safeStr(med?.bridge?.kind || "", 16);
  const bridgeTo = safeStr(med?.bridge?.laneTo || "", 12);

  const parts = [
    `m=${safeStr(med?.mode || "", 16)}`,
    `i=${safeStr(med?.intent || "", 10)}`,
    `d=${safeStr(med?.dominance || "", 8)}`,
    `b=${safeStr(med?.budget || "", 8)}`,
    `ln=${safeStr(med?.lane || "", 12) || "-"}`,
    `la=${safeStr(med?.laneAction || "", 12) || "-"}`,
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
    `br=${bridgeKind || "-"}`,
    `bt=${bridgeTo || "-"}`,
    `lw=${Array.isArray(med?.lawTags) && med.lawTags.length ? safeStr(med.lawTags[0], 12) : "-"}`,
    `et=${Array.isArray(med?.ethicsTags) && med.ethicsTags.length ? safeStr(med.ethicsTags[0], 12) : "-"}`,
    `cy=${Array.isArray(med?.cyberTags) && med.cyberTags.length ? safeStr(med.cyberTags[0], 12) : "-"}`,
    `ai=${Array.isArray(med?.aiTags) && med.aiTags.length ? safeStr(med.aiTags[0], 12) : "-"}`,
    `mv=${safeStr(med?.movePolicy?.preferredMove || "", 8) || "-"}`,
    `pb=${med?.psyche?.enabled ? "1" : "0"}`,
    `pk=${med?.psychologyHints?.enabled ? "1" : "0"}`,
    `ck=${med?.cyberKnowledgeHints?.enabled ? "1" : "0"}`,
    `ek=${med?.englishKnowledgeHints?.enabled ? "1" : "0"}`,
    `fk=${med?.financeKnowledgeHints?.enabled ? "1" : "0"}`,
    `ak=${med?.aiKnowledgeHints?.enabled ? "1" : "0"}`,
    // NEW: expert router summary
    `xl=${Array.isArray(med?.lanesUsed) ? med.lanesUsed.join(",").slice(0, 24) : "-"}`,
    `xc=${med?.crossLaneAllowed ? "1" : "0"}`,
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
  const needles = [nText.slice(0, 18), nText.slice(0, 24), nText.slice(Math.max(0, nText.length - 18))].filter(Boolean);

  const fields = [
    "marionTrace",
    "macModeWhy",
    "lawReasons",
    "riskSignals",
    "ethicsSignals",
    "psyche",
    "psychologyHints",
    "cyberKnowledgeHints",
    "englishKnowledgeHints",
    "financeKnowledgeHints",
    "aiKnowledgeHints",
    "bridge",
    "handoff",
    "lanesUsed",
    "lanesAvailable",
  ];

  for (const f of fields) {
    const v = cog && cog[f];
    const s = safeSerialize(v, 1200);
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

  const lane = normalizeLaneRaw(c.lane) || "general";
  const laneAction = safeStr(c.laneAction || "", 24).trim().toLowerCase();
  const laneReason = safeStr(c.laneReason || "", 40);

  const riskTier = toLowerToken(c.riskTier, 10);
  const riskTierNorm =
    riskTier === RISK.TIERS.NONE || riskTier === RISK.TIERS.LOW || riskTier === RISK.TIERS.MEDIUM || riskTier === RISK.TIERS.HIGH
      ? riskTier
      : RISK.TIERS.LOW;

  const velvetAllowed = c.velvetAllowed !== false;
  const velvet = !!c.velvet && velvetAllowed && intent !== "STABILIZE";
  const velvetSince = velvet ? clampInt(c.velvetSince, 0, Number(nowMs || 0) || nowMsDefault(), Number(nowMs || 0) || nowMsDefault()) : 0;

  const bridge = isPlainObject(c.bridge) && c.bridge.enabled ? buildBridgeContract(c.bridge) || null : null;

  const out = {
    ...c,
    marionVersion: MARION_VERSION,

    mode,
    intent,
    dominance,
    budget,

    lane,
    laneAction: laneAction || "",
    laneReason: laneReason || "",

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

    aiTags: uniqBounded(c.aiTags || [], 10),
    aiSignals: uniqBounded(c.aiSignals || [], 10),

    latentDesire: safeStr(c.latentDesire || LATENT_DESIRE.CURIOSITY, 16),
    confidence: { user: clamp01(c?.confidence?.user), nyx: clamp01(c?.confidence?.nyx) },

    velvetAllowed: !!velvetAllowed,
    velvet,
    velvetSince,
    velvetReason: safeStr(c.velvetReason || "", 40),

    marionState: safeStr(c.marionState || "SEEK", 16).toUpperCase(),
    marionReason: safeStr(c.marionReason || "default", 40),

    // NEW: expert router contract (Nyx lane brain payload)
    effectiveLane: normalizeLaneRaw(c.effectiveLane) || lane,
    crossLaneAllowed: !!c.crossLaneAllowed,
    lanesUsed: clampLaneExperts(c.lanesUsed || [], 6),
    lanesAvailable: Array.isArray(c.lanesAvailable) ? clampLaneExperts(c.lanesAvailable, 24) : LANES_AVAILABLE,

    // NEW: canonical bridge output
    bridge: bridge || { enabled: false, reason: "none" },

    marionStyle: MARION_STYLE_CONTRACT,
    handoff: isPlainObject(c.handoff)
      ? { ...c.handoff }
      : { marionEndsHard: true, nyxBeginsAfter: true, allowSameTurnSplit: true },

    macModeOverride: safeStr(c.macModeOverride || "", 60),
    macModeWhy: Array.isArray(c.macModeWhy) ? c.macModeWhy.slice(0, 6).map((x) => safeStr(x, 60)) : [],

    psyche: isPlainObject(c.psyche)
      ? {
          enabled: !!c.psyche.enabled,
          version: safeStr(c.psyche.version || "", 24),
          queryKey: safeStr(c.psyche.queryKey || "", 24),
          mode: safeStr(c.psyche.mode || "", 24),
          regulation: safeStr(c.psyche.regulation || "", 24),
          stance: safeStr(c.psyche.stance || "", 32),
          toneCues: uniqBounded(c.psyche.toneCues || [], 10),
          uiCues: uniqBounded(c.psyche.uiCues || [], 10),
          responseCues: uniqBounded(c.psyche.responseCues || [], 12),
          guardrails: uniqBounded(c.psyche.guardrails || [], 10),
          confidence: clamp01(c.psyche.confidence),
          reason: safeStr(c.psyche.reason || "", 60),
          domains: isPlainObject(c.psyche.domains) ? c.psyche.domains : undefined,
        }
      : { enabled: false, reason: "none" },

    psychologyHints: isPlainObject(c.psychologyHints) ? clampPsychHints(c.psychologyHints) : { enabled: false, reason: "none" },
    cyberKnowledgeHints: isPlainObject(c.cyberKnowledgeHints) ? clampCyberHints(c.cyberKnowledgeHints) : { enabled: false, reason: "none" },
    englishKnowledgeHints: isPlainObject(c.englishKnowledgeHints) ? clampEnglishHints(c.englishKnowledgeHints) : { enabled: false, reason: "none" },
    financeKnowledgeHints: isPlainObject(c.financeKnowledgeHints) ? clampFinanceHints(c.financeKnowledgeHints) : { enabled: false, reason: "none" },
    aiKnowledgeHints: isPlainObject(c.aiKnowledgeHints) ? clampAIHints(c.aiKnowledgeHints) : { enabled: false, reason: "none" },

    privacy: { noRawTextInTrace: true, boundedTrace: true, sideEffectFree: true },

    movePolicy: isPlainObject(c.movePolicy)
      ? { preferredMove: normalizeMove(c.movePolicy.preferredMove), hardOverride: !!c.movePolicy.hardOverride, reason: safeStr(c.movePolicy.reason || "intent", 40) }
      : deriveMovePolicy({ ...c, intent, actionable: !!c.actionable, psychology: c.psychology }),
  };

  out.marionTrace = safeStr(out.marionTrace || "", MARION_TRACE_MAX + 8);
  out.marionTraceHash = safeStr(out.marionTraceHash || "", 16);

  if (Array.isArray(ex.tracePolicyIssues) && ex.tracePolicyIssues.length) out.tracePolicyIssues = uniqBounded(ex.tracePolicyIssues, 6);

  return out;
}

// -------------------------
// PsycheBridge integration (option 2)
// -------------------------
function buildPsycheBridgeInput(norm, session, cog) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(session) ? session : {};
  const c = isPlainObject(cog) ? cog : {};

  const tokens = safeTokenSet(
    []
      .concat(c.riskDomains || [])
      .concat(c.ethicsTags || [])
      .concat(c.cyberTags || [])
      .concat(c.englishTags || [])
      .concat(c.finTags || [])
      .concat(c.aiTags || [])
      .concat(c.strategyTags || []),
    24
  );

  const features = {
    lane: safeStr(n.lane || s.lane || "", 24).trim().toLowerCase(),
    action: safeStr(n.action || "", 24).trim().toLowerCase(),
    intent: safeStr(c.intent || "", 16).trim().toUpperCase(),
    mode: safeStr(c.mode || "", 16).trim().toLowerCase(),
    desire: safeStr(c.latentDesire || "", 16).trim().toLowerCase(),

    regulationState: safeStr(c?.psychology?.regulationState || "", 16),
    cognitiveLoad: safeStr(c?.psychology?.cognitiveLoad || "", 12),
    agencyPreference: safeStr(c?.psychology?.agencyPreference || "", 16),
    socialPressure: safeStr(c?.psychology?.socialPressure || "", 12),

    riskTier: safeStr(c.riskTier || "", 10).trim().toLowerCase(),
    riskDomains: safeTokenSet(c.riskDomains || [], 8),
  };

  const keyObj = { features, tokens, v: "psycheBridgeInput:v1" };
  const queryKey = sha1Lite(JSON.stringify(keyObj)).slice(0, 14);

  return { features, tokens, queryKey };
}

function callPsycheBridge(norm, session, cog) {
  if (!PsycheBridge || typeof PsycheBridge !== "object") return null;

  const input = buildPsycheBridgeInput(norm, session, cog);

  try {
    const payload = {
      features: input.features,
      tokens: input.tokens,
      queryKey: input.queryKey,
      session: isPlainObject(session) ? session : {},
      cog: isPlainObject(cog) ? cog : {},
      normMeta: {
        lane: safeStr(norm?.lane || "", 24),
        action: safeStr(norm?.action || "", 24),
        hasPayload: !!norm?.turnSignals?.hasPayload,
        payloadActionable: !!norm?.turnSignals?.payloadActionable,
        textEmpty: !!norm?.turnSignals?.textEmpty,
      },
    };

    let out = null;
    if (typeof PsycheBridge.build === "function") out = PsycheBridge.build(payload);
    else if (typeof PsycheBridge.buildPsyche === "function") out = PsycheBridge.buildPsyche(payload);
    else if (typeof PsycheBridge.query === "function") out = PsycheBridge.query(payload);

    if (!isPlainObject(out)) return null;

    return {
      enabled: !!out.enabled,
      version: safeStr(out.version || "", 24) || "psycheBridge",
      queryKey: safeStr(out.queryKey || input.queryKey, 24),
      mode: safeStr(out.mode || "", 24),
      regulation: safeStr(out.regulation || "", 24),
      stance: safeStr(out.stance || "", 32),
      toneCues: uniqBounded(out.toneCues || [], 10),
      uiCues: uniqBounded(out.uiCues || [], 10),
      responseCues: uniqBounded(out.responseCues || [], 12),
      guardrails: uniqBounded(out.guardrails || [], 10),
      confidence: clamp01(out.confidence),
      reason: safeStr(out.reason || "psyche_bridge", 60),
      domains: isPlainObject(out.domains) ? out.domains : undefined,
    };
  } catch (e) {
    return {
      enabled: false,
      version: "psycheBridge",
      queryKey: "",
      confidence: 0,
      reason: `psyche_bridge_fail:${safeStr(e && (e.code || e.name) ? e.code || e.name : "ERR", 40)}`,
    };
  }
}

// -------------------------
// main: mediate
// -------------------------
function mediate(norm, session, opts = {}) {
  try {
    const s = isPlainObject(session) ? session : {};
    const n0 = isPlainObject(norm) ? norm : {};
    const o = isPlainObject(opts) ? opts : {};

    const clockNow = typeof o.nowMs === "function" ? o.nowMs : nowMsDefault;
    const now = Number(clockNow()) || nowMsDefault();

    // CANON LANE FIRST (payload lane wins)
    const payloadLane = readPayloadLane(n0);
    const sessionLane = normalizeLaneRaw(s.lane) || "";
    const lane = payloadLane || sessionLane || "general";
    const laneReason = payloadLane ? "payload_lane" : sessionLane ? "session_lane" : "default";

    const chipMeta = detectChipSelect(n0);
    const isChip = !!chipMeta.isChip;

    // Build a shallow norm copy with canonical lane (no mutation of caller object)
    const n = { ...n0, lane };

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
    if (modeCandidate !== "architect" && modeCandidate !== "user" && modeCandidate !== "transitional") modeCandidate = "architect";

    const hysteresis = suggestModeHysteresisPatch(s, modeCandidate, implicit);
    const mode = (hysteresis && hysteresis.effectiveMode) || modeCandidate;

    const lastAdvanceAt = Number(s.lastAdvanceAt || 0) || 0;
    const stalled = lastAdvanceAt ? now - lastAdvanceAt > 90 * 1000 : false;

    let intent = toUpperToken(n.turnIntent || "", 20);
    if (!intent || (intent !== "ADVANCE" && intent !== "CLARIFY" && intent !== "STABILIZE")) intent = classifyTurnIntent(n);

    const payloadAction = safeStr(n?.turnSignals?.payloadAction || "", 60).trim();
    const payloadYear = normYear(n?.turnSignals?.payloadYear);

    const actionable =
      !!safeStr(n.action || "", 80).trim() ||
      (payloadActionable && hasPayload && (safeStr(payloadAction, 60).trim() || payloadYear !== null)) ||
      (payloadActionable && textEmpty && hasPayload);

    // Bridge triggers:
    // 1) chip select (explicit)
    // 2) payload lane differs from session lane (implicit lane switch)
    const laneChanged = !!(payloadLane && sessionLane && payloadLane !== sessionLane);

    // CHIP FAST-PATH: treat chip select as actionable bridge + lane switch signal
    const laneAction = isChip || laneChanged ? "switch_lane" : "";

    if (actionable) intent = "ADVANCE";
    if (isChip || laneChanged) intent = "ADVANCE";

    if (stalled && (mode === "architect" || mode === "transitional") && intent !== "ADVANCE") intent = "CLARIFY";

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
      lane,
      laneAction,
      laneReason,
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

    const velvet = computeVelvet(n, s, { mode, intent, dominance, budget, confidence }, latentDesire, now, velvetAllowed);

    if (velvet.velvet && mode === "user" && intent !== "ADVANCE") dominance = "soft";
    if (latentDesire === LATENT_DESIRE.MASTERY && (mode === "architect" || mode === "transitional") && intent === "ADVANCE") dominance = "firm";

    // ---------
    // BRIDGE CONTRACT (Marion → Nyx routing)
    // ---------
    let bridge = null;
    if (isChip) {
      bridge = buildBridgeContract({
        kind: "chip_select",
        laneFrom: sessionLane || "",
        laneTo: lane,
        reason: chipMeta.why || "chip_select",
        chipLabel: chipMeta.label || "",
        payloadAction: payloadAction || "chip",
      });
    } else if (laneChanged) {
      bridge = buildBridgeContract({
        kind: "lane_switch",
        laneFrom: sessionLane || "",
        laneTo: lane,
        reason: "payload_lane_change",
        chipLabel: "",
        payloadAction: payloadAction || "route",
      });
    }

    let marionState = "SEEK";
    let marionReason = "default";
    const a = safeStr(n.action || "", 80).trim();

    if (bridge && bridge.enabled) {
      marionState = "BRIDGE";
      marionReason = bridge.kind;
    } else if (intent === "STABILIZE") {
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

      lane,
      laneAction,
      laneReason,

      stalled: !!stalled,
      actionable: !!actionable || !!(bridge && bridge.enabled),
      textEmpty: !!textEmpty,
      groundingMaxLines,

      // bridge payload for Nyx
      bridge: bridge || { enabled: false, reason: "none" },

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

      // NEW: handoff cue for Nyx UI
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
        nyxCue: bridge && bridge.enabled ? "route" : intent === "STABILIZE" ? "hold" : "respond",
        bridge: bridge && bridge.enabled ? { kind: bridge.kind, laneTo: bridge.laneTo } : { kind: "", laneTo: "" },
      },

      macModeOverride: macModeOverride || "",
      macModeWhy: Array.isArray(implicit.why) ? implicit.why.slice(0, 6).map((x) => safeStr(x, 60)) : [],

      ...(hysteresis && hysteresis.sessionPatchSuggestion ? { sessionPatchSuggestion: hysteresis.sessionPatchSuggestion } : {}),

      privacy: { noRawTextInTrace: true, boundedTrace: true, sideEffectFree: true },
    };

    // Apply psych shaping to mediator outputs
    cog = applyPsychologyToMediator(cog, psych0);

    // Recompute ethics after psych is attached (single authoritative set)
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

    const ai = computeAILayer(n);
    cog.aiTags = ai.aiTags;
    cog.aiSignals = ai.aiSignals;

    // =========================
    // KNOWLEDGE: PsycheBridge first (option 2)
    // =========================
    const psyche = callPsycheBridge(n, s, cog);
    if (psyche && psyche.enabled) {
      cog.psyche = psyche;

      cog.psychologyHints = { enabled: false, reason: "psyche_bridge" };
      cog.cyberKnowledgeHints = { enabled: false, reason: "psyche_bridge" };
      cog.englishKnowledgeHints = { enabled: false, reason: "psyche_bridge" };
      cog.financeKnowledgeHints = { enabled: false, reason: "psyche_bridge" };
      cog.aiKnowledgeHints = { enabled: false, reason: "psyche_bridge" };
    } else {
      const psyHints = queryPsychologyKnowledge(n, s, cog);
      cog.psychologyHints = clampPsychHints(psyHints);

      const cyHints = queryCyberKnowledge(n, s, cog);
      cog.cyberKnowledgeHints = clampCyberHints(cyHints);

      const enHints = queryEnglishKnowledge(n, s, cog);
      cog.englishKnowledgeHints = clampEnglishHints(enHints);

      const fiHints = queryFinanceKnowledge(n, s, cog);
      cog.financeKnowledgeHints = clampFinanceHints(fiHints);

      const aiHints = queryAIKnowledge(n, s, cog);
      cog.aiKnowledgeHints = clampAIHints(aiHints);

      cog.psyche = { enabled: false, reason: psyche ? psyche.reason || "psyche_bridge_disabled" : "psyche_bridge_missing" };
    }

    // =========================
    // NEW: Lane Expert Router (Marion applies ALL knowledge lanes to Nyx)
    // =========================
    // IMPORTANT:
    // - This does not change the widget structure.
    // - It only adds deterministic routing metadata that chatEngine can consume.
    const routing = computeLaneExpertRouting(cog.lane, cog);
    cog.effectiveLane = routing.effectiveLane;
    cog.crossLaneAllowed = !!routing.crossLaneAllowed;
    cog.lanesUsed = Array.isArray(routing.lanesUsed) ? routing.lanesUsed : [];
    cog.lanesAvailable = Array.isArray(routing.lanesAvailable) ? routing.lanesAvailable : LANES_AVAILABLE;
    cog.laneExpertReason = safeStr(routing.reason || "", 24);

    // ---------
    // SESSION PATCH SUGGESTION (UPGRADED for bridge)
    // ---------
    const patch = isPlainObject(cog.sessionPatchSuggestion) ? { ...cog.sessionPatchSuggestion } : {};
    if (bridge && bridge.enabled) {
      patch.lane = bridge.laneTo;
      patch.lastLane = bridge.laneFrom || sessionLane || "";
      patch.bridgeKind = bridge.kind;
      patch.bridgeLaneTo = bridge.laneTo;
      patch.bridgeReason = bridge.reason || bridge.kind;
      patch.lastAdvanceAt = now; // actionable route should advance clocks
    } else if (payloadLane && payloadLane !== sessionLane) {
      // still safe to patch lane on canonical payload lane
      patch.lane = payloadLane;
      patch.lastLane = sessionLane || "";
    }
    if (Object.keys(patch).length) cog.sessionPatchSuggestion = patch;

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
      aiTags: cog.aiTags,
      psyche: cog.psyche,
      psychologyHints: cog.psychologyHints,
      cyberKnowledgeHints: cog.cyberKnowledgeHints,
      englishKnowledgeHints: cog.englishKnowledgeHints,
      financeKnowledgeHints: cog.financeKnowledgeHints,
      aiKnowledgeHints: cog.aiKnowledgeHints,
      lane: cog.lane,
      laneAction: cog.laneAction,
      bridge: cog.bridge,
      lanesUsed: cog.lanesUsed,
      crossLaneAllowed: cog.crossLaneAllowed,
    });

    cog.marionTrace = safeStr(trace, MARION_TRACE_MAX + 8);
    cog.marionTraceHash = hashTrace(trace);

    // External overrides (kept)
    if (o && o.forceBudget && (o.forceBudget === "short" || o.forceBudget === "medium")) cog.budget = o.forceBudget;
    if (o && o.forceDominance && (o.forceDominance === "firm" || o.forceDominance === "neutral" || o.forceDominance === "soft")) cog.dominance = o.forceDominance;
    if (o && o.forceIntent && (o.forceIntent === "ADVANCE" || o.forceIntent === "CLARIFY" || o.forceIntent === "STABILIZE")) {
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
      lane: "general",
      laneAction: "",
      laneReason: "fail_open",
      stalled: false,
      actionable: false,
      textEmpty: false,
      groundingMaxLines: 0,
      bridge: { enabled: false, reason: "fail_open" },
      // NEW router defaults
      effectiveLane: "general",
      crossLaneAllowed: true,
      lanesUsed: [LANE_EXPERTS.ENGLISH],
      lanesAvailable: LANES_AVAILABLE,
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
      ethicsTags: [ETHICS.TAGS.NON_DECEPTIVE, ETHICS.TAGS.PRIVACY_MIN, ETHICS.TAGS.HARM_AVOIDANCE],
      ethicsSignals: [ETHICS.SIGNALS.USE_NEUTRAL_TONE],
      cyberTags: [CYBER.TAGS.DEFENSIVE_ONLY],
      cyberSignals: [CYBER.SIGNALS.SAFE_DEFAULTS],
      englishTags: [],
      englishSignals: [],
      finTags: [],
      finSignals: [],
      strategyTags: [],
      strategySignals: [],
      aiTags: [],
      aiSignals: [],
      psyche: { enabled: false, reason: "fail_open" },
      psychologyHints: { enabled: false, reason: "fail_open" },
      cyberKnowledgeHints: { enabled: false, reason: "fail_open" },
      englishKnowledgeHints: { enabled: false, reason: "fail_open" },
      financeKnowledgeHints: { enabled: false, reason: "fail_open" },
      aiKnowledgeHints: { enabled: false, reason: "fail_open" },
      movePolicy: { preferredMove: "CLARIFY", hardOverride: false, reason: "fail_open" },
      marionStyle: MARION_STYLE_CONTRACT,
      handoff: {
        marionEndsHard: true,
        nyxBeginsAfter: true,
        allowSameTurnSplit: true,
        marionTagSuggested: MARION_STYLE_CONTRACT.tags.retry,
        nyxCue: "retry",
        bridge: { kind: "", laneTo: "" },
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
  AI,

  // NEW router exports
  LANE_EXPERTS,
  LANES_AVAILABLE,
  computeLaneExpertRouting,

  mediate,

  // diagnostics
  buildTrace,
  hashTrace,

  // hardening exports (unit tests / integration)
  finalizeContract,
  tracePolicyCheck,
  suggestModeHysteresisPatch,

  // bridge exports (unit tests)
  buildBridgeContract,
  normalizeBridgeKind,

  // psyche bridge exports
  buildPsycheBridgeInput,
  callPsycheBridge,

  // legacy psych knowledge exports (integration tests)
  buildPsychologyQuery,
  queryPsychologyKnowledge,
  clampPsychHints,

  // legacy cyber knowledge exports (integration tests)
  buildCyberQuery,
  queryCyberKnowledge,
  clampCyberHints,

  // legacy english knowledge exports (integration tests)
  buildEnglishQuery,
  queryEnglishKnowledge,
  clampEnglishHints,

  // legacy finance knowledge exports (integration tests)
  buildFinanceQuery,
  queryFinanceKnowledge,
  clampFinanceHints,

  // legacy ai knowledge exports (integration tests)
  buildAIQuery,
  queryAIKnowledge,
  clampAIHints,

  // risk bridge exports (unit tests)
  computeRiskBridge,
  applyRiskOverridesToLawSeed,

  // law/ethics exports (unit tests)
  applyLawLayer,
  computeEthicsLayer,

  // cyber/english/finance/strategy/ai exports (unit tests)
  computeCyberLayer,
  computeEnglishLayer,
  computeFinanceLayer,
  computeStrategyLayer,
  computeAILayer,

  // psych exports (unit tests)
  computePsychologyReasoningObject,
  applyPsychologyToMediator,
};
