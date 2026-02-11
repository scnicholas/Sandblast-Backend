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
 * - Keep it portable: no express, no fs, no index.js imports, no knowledge access
 *
 * v1.0.5 (RISK BRIDGE++++ + ETHICS EXPAND++++ + CYBER/EN/FIN/STRAT++++ + LAW/PSYCH BOND++++ + MOVE POLICY++++ + PURE NO-MUTATION++++)
 * ✅ Keeps: LawLayer precedence (containment, action supremacy, stall/no-spin, budget clamps, coherence, velvet guard).
 * ✅ Upgrades: Law↔Psych bond via RiskBridge (riskTier + domains + overrides) feeding Law + movePolicy.
 * ✅ Expands: EthicsLayer beyond self-harm (violence, illegal, privacy/doxx, sexual safety, hate/harassment, medical/legal/financial high-stakes posture).
 * ✅ Keeps: CyberLayer (defensive-only risk awareness + social engineering flags); cyberTags + cyberSignals.
 * ✅ Keeps: EnglishLayer (clarity/structure/audience); englishTags + englishSignals.
 * ✅ Keeps: Finance/EconLayer (non-advice posture + unit-econ/budgeting/compliance cues); finTags + finSignals.
 * ✅ Keeps: StrategyLayer (systems thinking + decision-making cues: tradeoffs, metrics, sequencing); strategyTags + strategySignals.
 * ✅ Keeps: movePolicy hints for StateSpine reconciliation.
 * ✅ Keeps: PsychologyReasoningObject (PRO) always-on (no persistence, no raw text stored).
 * ✅ Keeps: MarionStyleContract, deterministic clock hook, stricter privacy, tighter intent/stall logic, handoff hints.
 */

const MARION_VERSION = "marionSO v1.0.5";

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
function stableHashLite(str) {
  // small stable hash (NOT cryptographic) for traces
  const s = safeStr(str, 2000);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
// backwards compat name (do not treat as SHA-1)
const sha1Lite = stableHashLite;

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

// Risk Bridge (Law↔Psych coupling, bounded, non-content)
const RISK = Object.freeze({
  TIER: Object.freeze({
    NONE: "none",
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
  }),
  DOMAINS: Object.freeze({
    SELF_HARM: "self_harm",
    VIOLENCE: "violence",
    ILLEGAL: "illegal",
    PRIVACY: "privacy",
    SEXUAL_SAFETY: "sexual_safety",
    HATE: "hate",
    MEDICAL: "medical",
    LEGAL: "legal",
    FINANCE: "finance",
    CYBER: "cyber",
  }),
  SIGNALS: Object.freeze({
    MINIMIZE_RISKY_DETAIL: "minimize_risky_detail",
    AVOID_INSTRUCTIONS: "avoid_instructions",
    OFFER_SAFE_ALTS: "offer_safe_alternatives",
    ENCOURAGE_HELP: "encourage_help_seeking",
    PROTECT_PRIVACY: "protect_privacy",
    PROFESSIONAL_DISCLAIMER: "professional_disclaimer",
    VERIFY_SOURCE: "verify_source",
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
    RISK_CLAMP: "law:risk_clamp",
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
    VIOLENCE_AVOID: "ethics:violence_avoid",
    ILLEGAL_AVOID: "ethics:illegal_avoid",
    PRIVACY_PROTECT: "ethics:privacy_protect",
    SEXUAL_SAFETY: "ethics:sexual_safety",
    HATE_AVOID: "ethics:hate_avoid",
    HS_MEDICAL: "ethics:medical_highstakes",
    HS_LEGAL: "ethics:legal_highstakes",
    HS_FINANCE: "ethics:finance_highstakes",
  }),
  SIGNALS: Object.freeze({
    MINIMIZE_RISKY_DETAIL: "minimize_risky_detail",
    USE_NEUTRAL_TONE: "use_neutral_tone",
    OFFER_OPTIONS_NOT_ORDERS: "offer_options_not_orders",
    ENCOURAGE_HELP_SEEKING: "encourage_help_seeking",
    REFUSE_ILLEGAL_ASSISTANCE: "refuse_illegal_assistance",
    REFUSE_VIOLENCE_ASSISTANCE: "refuse_violence_assistance",
    PROTECT_PRIVACY: "protect_privacy",
    PROFESSIONAL_DISCLAIMER: "professional_disclaimer",
    AVOID_STEP_BY_STEP: "avoid_step_by_step",
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

// Marion narration style contract
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

  if (
    /\b(i('?m)?\s+not\s+sure|help\s+me\s+understand|does\s+this\s+make\s+sense|where\s+do\s+i|get\s+the\s+url)\b/.test(
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

  if (a > 0 && u > 0) {
    tr += 3;
    why.push("transitional:mixed-signals");
  }

  let mode = "";
  if (tr >= 3) mode = "transitional";
  else if (a >= u + 2) mode = "architect";
  else if (u >= a + 2) mode = "user";
  else mode = "";

  return { mode, scoreA: a, scoreU: u, scoreT: tr, why };
}

// -------------------------
// PSYCHOLOGY LAYER
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
    motivation: "", // filled after latent desire inference
    agencyPreference,
    socialPressure,
  };
}

// -------------------------
// Risk Bridge (bond Law↔Psych)
// -------------------------
function computeRiskBridge(norm, psych, seed) {
  const n = isPlainObject(norm) ? norm : {};
  const p = isPlainObject(psych) ? psych : {};
  const s = isPlainObject(seed) ? seed : {};

  const text = safeStr(n?.text || "", 1400).toLowerCase();
  const actionable = !!s.actionable;

  // domain detectors (lightweight; no storage)
  const selfHarm =
    /\b(suicid(e|al)|kill myself|end it all|self[-\s]?harm|cutting|i don't want to live)\b/.test(
      text
    );

  const violence =
    /\b(kill (him|her|them)|hurt (him|her|them)|shoot|stab|bomb|murder|assassinat|poison|make a weapon|violent)\b/.test(
      text
    );

  const illegal =
    /\b(forge|counterfeit|launder|money laundering|bribe|extortion|blackmail|steal|fraud|evade|bypass (law|police)|break into)\b/.test(
      text
    );

  const privacy =
    /\b(doxx|doxxing|address|phone number|social security|sin\b|credit card|password|otp|2fa code|verification code|leak|exfiltrat)\b/.test(
      text
    );

  const sexualSafety =
    /\b(minor|underage|child sexual|cp|non[-\s]?consensual|rape|coerc(e|ion))\b/.test(text);

  const hate =
    /\b(hate (them|him|her)|exterminate|genocide|racial slur|ethnic cleansing)\b/.test(text);

  const medical =
    /\b(diagnos|symptom|medication|dose|treatment|doctor|hospital|suicide prevention)\b/.test(text);

  const legalTopic =
    /\b(law|legal|lawsuit|contract|sue|court|defamation|criminal charge)\b/.test(text);

  const financeTopic =
    /\b(price|pricing|revenue|profit|margin|budget|cashflow|forecast|break[-\s]?even|roi|ltv|cac|unit economics|tax|sred|grant)\b/.test(
      text
    );

  const cyberTopic =
    /\b(cyber|security|infosec|phish|phishing|malware|ransom|ddos|sql injection|xss|csrf|breach|exploit|hack)\b/.test(
      text
    );

  // intent-unsafe / operational asks (cross-domain)
  const howToBad =
    /\b(how to (hack|break in|steal|bypass)|make (a|an) (bomb|weapon|malware)|write (a|an) malware|ddos (a|an)|phish (a|an)|credential stuffing)\b/.test(
      text
    );

  const domains = [];
  if (selfHarm) domains.push(RISK.DOMAINS.SELF_HARM);
  if (violence) domains.push(RISK.DOMAINS.VIOLENCE);
  if (illegal) domains.push(RISK.DOMAINS.ILLEGAL);
  if (privacy) domains.push(RISK.DOMAINS.PRIVACY);
  if (sexualSafety) domains.push(RISK.DOMAINS.SEXUAL_SAFETY);
  if (hate) domains.push(RISK.DOMAINS.HATE);
  if (medical) domains.push(RISK.DOMAINS.MEDICAL);
  if (legalTopic) domains.push(RISK.DOMAINS.LEGAL);
  if (financeTopic) domains.push(RISK.DOMAINS.FINANCE);
  if (cyberTopic) domains.push(RISK.DOMAINS.CYBER);

  let tier = RISK.TIER.NONE;

  // Tiering rules (bounded + deterministic)
  if (sexualSafety || selfHarm) tier = RISK.TIER.HIGH;
  else if (howToBad || violence) tier = RISK.TIER.HIGH;
  else if (illegal || (cyberTopic && howToBad) || privacy) tier = RISK.TIER.MEDIUM;
  else if (cyberTopic || medical || legalTopic || financeTopic || hate) tier = RISK.TIER.LOW;

  // Psych amplification: dysregulated raises tier one step (max HIGH)
  const reg = safeStr(p.regulationState || "", 16);
  if (reg === PSYCH.REG.DYSREGULATED) {
    if (tier === RISK.TIER.NONE) tier = RISK.TIER.LOW;
    else if (tier === RISK.TIER.LOW) tier = RISK.TIER.MEDIUM;
    else if (tier === RISK.TIER.MEDIUM) tier = RISK.TIER.HIGH;
  }

  const signals = [];
  if (tier === RISK.TIER.HIGH || tier === RISK.TIER.MEDIUM) {
    signals.push(RISK.SIGNALS.MINIMIZE_RISKY_DETAIL, RISK.SIGNALS.AVOID_INSTRUCTIONS, RISK.SIGNALS.OFFER_SAFE_ALTS);
  }
  if (selfHarm) signals.push(RISK.SIGNALS.ENCOURAGE_HELP);
  if (privacy) signals.push(RISK.SIGNALS.PROTECT_PRIVACY);
  if (medical || legalTopic || financeTopic) signals.push(RISK.SIGNALS.PROFESSIONAL_DISCLAIMER);
  if (cyberTopic) signals.push(RISK.SIGNALS.VERIFY_SOURCE);

  // Law override hints (not content)
  const overrides = {
    budgetClamp: tier === RISK.TIER.HIGH || tier === RISK.TIER.MEDIUM,
    velvetBlock: tier === RISK.TIER.HIGH || (tier === RISK.TIER.MEDIUM && domains.includes(RISK.DOMAINS.CYBER)),
    // if risky and not actionable, bias toward clarify or stabilize depending on distress domain
    intentBias:
      tier === RISK.TIER.HIGH && !actionable
        ? (domains.includes(RISK.DOMAINS.SELF_HARM) ? "STABILIZE" : "CLARIFY")
        : "",
    // avoid “firm dominance” unless executing a safe action; keeps tone controlled
    dominanceBias: tier === RISK.TIER.HIGH && !actionable ? "neutral" : "",
  };

  return {
    riskTier: tier,
    riskDomains: uniqBounded(domains, 8),
    riskSignals: uniqBounded(signals, 8),
    lawOverrides: overrides,
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

function deriveMovePolicy(cog) {
  const actionable = !!cog?.actionable;
  const reg = safeStr(cog?.psychology?.regulationState || "", 16);
  const tier = safeStr(cog?.riskTier || "", 12);

  let preferredMove = normalizeMove(cog?.intent || "CLARIFY");
  let hardOverride = false;
  let reason = "intent";

  // Psych containment
  if (reg === PSYCH.REG.DYSREGULATED) {
    preferredMove = actionable ? "ADVANCE" : "STABILIZE";
    hardOverride = !actionable;
    reason = actionable ? "dysregulated_actionable" : "dysregulated_containment";
  } else if (reg === PSYCH.REG.STRAINED && !actionable) {
    preferredMove = "CLARIFY";
    hardOverride = false;
    reason = "strained_clarify";
  }

  // Risk bridge: HIGH risk biases away from wandering
  if ((tier === RISK.TIER.HIGH || tier === RISK.TIER.MEDIUM) && !actionable) {
    preferredMove = preferredMove === "ADVANCE" ? "CLARIFY" : preferredMove;
    if (tier === RISK.TIER.HIGH) {
      hardOverride = hardOverride || false;
      reason = reason === "intent" ? "risk_bridge" : reason;
    }
  }

  return { preferredMove, hardOverride, reason };
}

// -------------------------
// LAW LAYER (constitutional precedence)
// -------------------------
function applyLawLayer(seed, psych, risk) {
  const out = isPlainObject(seed) ? { ...seed } : {};
  const tags = [];
  const reasons = [];

  const p = isPlainObject(psych) ? psych : {};
  const r = isPlainObject(risk) ? risk : {};

  const reg = safeStr(p.regulationState || "", 16);
  const load = safeStr(p.cognitiveLoad || "", 12);
  const pressure = safeStr(p.socialPressure || "", 12);

  const actionable = !!out.actionable;
  const stalled = !!out.stalled;

  // Rule 0: Risk bridge clamps (bond)
  const tier = safeStr(r.riskTier || "", 12);
  if (tier === RISK.TIER.HIGH || tier === RISK.TIER.MEDIUM) {
    // Budget clamp + velvet block for risky contexts
    out.budget = "short";
    if (r?.lawOverrides?.velvetBlock) out.velvetAllowed = false;

    // Intent bias if provided and not actionable
    const bias = normalizeMove(r?.lawOverrides?.intentBias || "");
    if (!actionable && (bias === "CLARIFY" || bias === "STABILIZE")) out.intent = bias;

    // Dominance bias (avoid oversteer on risky non-actionable turns)
    const domBias = safeStr(r?.lawOverrides?.dominanceBias || "", 10);
    if (!actionable && (domBias === "neutral" || domBias === "soft")) out.dominance = domBias;

    tags.push(LAW.TAGS.RISK_CLAMP, LAW.TAGS.BUDGET_CLAMP);
    reasons.push("risk_bridge");
  }

  // Rule 1: Containment precedence
  if (reg === PSYCH.REG.DYSREGULATED) {
    out.intent = actionable ? "ADVANCE" : "STABILIZE";
    out.dominance = "firm";
    out.budget = "short";
    out.groundingMaxLines = clampInt(out.groundingMaxLines, 0, 2, 0);
    tags.push(LAW.TAGS.CONTAINMENT);
    reasons.push(actionable ? "containment_actionable" : "containment_hold");
  }

  // Rule 2: Action supremacy
  if (actionable) {
    out.intent = "ADVANCE";
    if (safeStr(out.mode || "", 20).toLowerCase() !== "user") out.dominance = "firm";
    tags.push(LAW.TAGS.ACTION_SUPREMACY);
    reasons.push("action_supremacy");
  }

  // Rule 3: No-spin / stall guard
  if (stalled && !actionable) {
    out.intent = "CLARIFY";
    out.dominance = out.dominance === "firm" ? "firm" : "neutral";
    out.budget = "short";
    out.groundingMaxLines = clampInt(out.groundingMaxLines, 0, 1, 0);
    tags.push(LAW.TAGS.NO_SPIN);
    reasons.push("stall_clarify");
  }

  // Rule 4: Budget clamp under high load/pressure
  if (load === PSYCH.LOAD.HIGH || pressure === PSYCH.PRESSURE.HIGH) {
    out.budget = "short";
    tags.push(LAW.TAGS.BUDGET_CLAMP);
    reasons.push("budget_clamp");
  }

  // Rule 5: Velvet guard
  const intent = safeStr(out.intent || "", 20).toUpperCase();
  if (intent === "STABILIZE") {
    out.velvetAllowed = false;
    tags.push(LAW.TAGS.VELVET_GUARD);
    reasons.push("velvet_off_stabilize");
  } else if (out.velvetAllowed === false) {
    tags.push(LAW.TAGS.VELVET_GUARD);
    reasons.push("velvet_guard");
  }

  // Rule 6: Coherence placeholder
  tags.push(LAW.TAGS.COHERENCE);
  reasons.push("coherent");

  return {
    ...out,
    lawTags: tags.slice(0, 8).map((x) => safeStr(x, 32)),
    lawReasons: reasons.slice(0, 8).map((x) => safeStr(x, 40)),
  };
}

// -------------------------
// ETHICS LAYER (expanded; bounded posture signals only)
// -------------------------
function computeEthicsLayer(norm, psych, seed, risk) {
  const n = isPlainObject(norm) ? norm : {};
  const p = isPlainObject(psych) ? psych : {};
  const s = isPlainObject(seed) ? seed : {};
  const r = isPlainObject(risk) ? risk : {};

  const tags = [ETHICS.TAGS.NON_DECEPTIVE, ETHICS.TAGS.PRIVACY_MIN];
  const signals = [];

  const text = safeStr(n?.text || "", 1400).toLowerCase();
  const reg = safeStr(p.regulationState || "", 16);
  const agencyPref = safeStr(p.agencyPreference || "", 16);

  // Pull from RiskBridge when present (no double-thinking)
  const domains = new Set(Array.isArray(r.riskDomains) ? r.riskDomains : []);
  const tier = safeStr(r.riskTier || "", 12);

  // Domain-specific posture
  if (domains.has(RISK.DOMAINS.SELF_HARM)) {
    tags.push(ETHICS.TAGS.HARM_AVOIDANCE, ETHICS.TAGS.SAFETY_REDIRECT);
    signals.push(ETHICS.SIGNALS.MINIMIZE_RISKY_DETAIL, ETHICS.SIGNALS.ENCOURAGE_HELP_SEEKING);
  } else if (reg === PSYCH.REG.DYSREGULATED) {
    tags.push(ETHICS.TAGS.HARM_AVOIDANCE);
    signals.push(ETHICS.SIGNALS.USE_NEUTRAL_TONE, ETHICS.SIGNALS.MINIMIZE_RISKY_DETAIL);
  }

  if (domains.has(RISK.DOMAINS.VIOLENCE)) {
    tags.push(ETHICS.TAGS.VIOLENCE_AVOID, ETHICS.TAGS.SAFETY_REDIRECT);
    signals.push(ETHICS.SIGNALS.REFUSE_VIOLENCE_ASSISTANCE, ETHICS.SIGNALS.AVOID_STEP_BY_STEP);
  }

  if (domains.has(RISK.DOMAINS.ILLEGAL)) {
    tags.push(ETHICS.TAGS.ILLEGAL_AVOID);
    signals.push(ETHICS.SIGNALS.REFUSE_ILLEGAL_ASSISTANCE, ETHICS.SIGNALS.AVOID_STEP_BY_STEP);
  }

  if (domains.has(RISK.DOMAINS.PRIVACY)) {
    tags.push(ETHICS.TAGS.PRIVACY_PROTECT);
    signals.push(ETHICS.SIGNALS.PROTECT_PRIVACY, ETHICS.SIGNALS.MINIMIZE_RISKY_DETAIL);
  }

  if (domains.has(RISK.DOMAINS.SEXUAL_SAFETY)) {
    tags.push(ETHICS.TAGS.SEXUAL_SAFETY, ETHICS.TAGS.SAFETY_REDIRECT);
    signals.push(ETHICS.SIGNALS.MINIMIZE_RISKY_DETAIL, ETHICS.SIGNALS.AVOID_STEP_BY_STEP);
  }

  if (domains.has(RISK.DOMAINS.HATE)) {
    tags.push(ETHICS.TAGS.HATE_AVOID);
    signals.push(ETHICS.SIGNALS.USE_NEUTRAL_TONE, ETHICS.SIGNALS.MINIMIZE_RISKY_DETAIL);
  }

  // High-stakes posture (non-advice signals)
  if (domains.has(RISK.DOMAINS.MEDICAL)) {
    tags.push(ETHICS.TAGS.HS_MEDICAL);
    signals.push(ETHICS.SIGNALS.PROFESSIONAL_DISCLAIMER);
  }
  if (domains.has(RISK.DOMAINS.LEGAL)) {
    tags.push(ETHICS.TAGS.HS_LEGAL);
    signals.push(ETHICS.SIGNALS.PROFESSIONAL_DISCLAIMER);
  }
  if (domains.has(RISK.DOMAINS.FINANCE)) {
    tags.push(ETHICS.TAGS.HS_FINANCE);
    signals.push(ETHICS.SIGNALS.PROFESSIONAL_DISCLAIMER);
  }

  // Generic risk posture
  if (tier === RISK.TIER.HIGH || tier === RISK.TIER.MEDIUM) {
    signals.push(ETHICS.SIGNALS.MINIMIZE_RISKY_DETAIL);
  }

  // Agency respect
  tags.push(ETHICS.TAGS.AGENCY_RESPECT);
  if (agencyPref === PSYCH.AGENCY.AUTONOMOUS && !s.actionable) {
    signals.push(ETHICS.SIGNALS.OFFER_OPTIONS_NOT_ORDERS);
  }

  return {
    ethicsTags: uniqBounded(tags.map((x) => safeStr(x, 40)), 8),
    ethicsSignals: uniqBounded(signals.map((x) => safeStr(x, 48)), 8),
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
    cyberSignals: uniqBounded(signals, 8),
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
    /\b(email|letter|proposal|pitch|script|press release|bio|about page|copy|caption)\b/.test(
      text
    );

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

  if (safeStr(s.mode || "", 20).toLowerCase() === "user" && safeStr(s.intent || "", 20) !== "ADVANCE") {
    if (!tags.length) tags.push(ENGLISH.TAGS.CLARITY);
    signals.push(ENGLISH.SIGNALS.USE_PLAIN_LANGUAGE);
  }

  if (action === "counsel_intro" && !tags.length) {
    tags.push(ENGLISH.TAGS.TONE);
    signals.push(ENGLISH.SIGNALS.SHORT_SENTENCES);
  }

  return {
    englishTags: uniqBounded(tags.map((x) => safeStr(x, 24)), 8),
    englishSignals: uniqBounded(signals.map((x) => safeStr(x, 40)), 8),
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
    if (/\bbudget|cashflow|forecast\b/.test(text)) tags.push(FIN.TAGS.BUDGETING);
    if (/\b(ltv|cac|unit economics|margin|break[-\s]?even)\b/.test(text)) tags.push(FIN.TAGS.UNIT_ECON);

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
    finSignals: uniqBounded(signals.map((x) => safeStr(x, 40)), 8),
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

  if (strategicLanguage || safeStr(s.mode || "", 20) === "architect") {
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
    strategySignals: uniqBounded(signals.map((x) => safeStr(x, 40)), 8),
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
    if (/\bdesign|implement|encode|ship|lock|wire|merge|pin|canonical\b/.test(t))
      return LATENT_DESIRE.MASTERY;
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
      (safeStr(norm?.turnSignals?.payloadAction || "", 60).trim() ||
        normYear(norm?.turnSignals?.payloadYear) !== null))
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

  const repeatedTopic =
    !!(lastLane && lane && lastLane === lane && yr && lastYear && yr === lastYear);

  const acceptedChip = !!(
    norm?.turnSignals?.hasPayload &&
    norm?.turnSignals?.payloadActionable &&
    (safeStr(norm?.turnSignals?.payloadAction || "", 60).trim() ||
      normYear(norm?.turnSignals?.payloadYear) !== null)
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
    return {
      velvet: already,
      velvetSince: Number(s.velvetSince || 0) || 0,
      reason: already ? "carry" : "no",
    };
  }

  if (already) {
    if (safeStr(med?.intent || "", 20).toUpperCase() === "STABILIZE") {
      return {
        velvet: false,
        velvetSince: Number(s.velvetSince || 0) || 0,
        reason: "stabilize_exit",
      };
    }
    if (lastLane && lane && lastLane !== lane) {
      return {
        velvet: false,
        velvetSince: Number(s.velvetSince || 0) || 0,
        reason: "lane_shift_exit",
      };
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
    `m=${safeStr(med?.mode || "", 20)}`,
    `i=${safeStr(med?.intent || "", 20)}`,
    `d=${safeStr(med?.dominance || "", 20)}`,
    `b=${safeStr(med?.budget || "", 20)}`,
    `a=${safeStr(norm?.action || "", 60) || "-"}`,
    `y=${y !== null ? y : "-"}`,
    `p=${med?.actionable ? "1" : "0"}`,
    `e=${med?.textEmpty ? "1" : "0"}`,
    `st=${med?.stalled ? "1" : "0"}`,
    `ld=${safeStr(med?.latentDesire || "", 20)}`,
    `cu=${String(Math.round(clamp01(med?.confidence?.user) * 100))}`,
    `cn=${String(Math.round(clamp01(med?.confidence?.nyx) * 100))}`,
    `v=${med?.velvet ? "1" : "0"}`,
    `vr=${safeStr(med?.velvetReason || "", 30) || "-"}`,
    // psych (bounded)
    `pl=${safeStr(med?.psychology?.cognitiveLoad || "", 8) || "-"}`,
    `pr=${safeStr(med?.psychology?.regulationState || "", 12) || "-"}`,
    `pa=${safeStr(med?.psychology?.agencyPreference || "", 10) || "-"}`,
    `ps=${safeStr(med?.psychology?.socialPressure || "", 8) || "-"}`,
    // risk (first domain)
    `rk=${safeStr(med?.riskTier || "", 8) || "-"}`,
    `rd=${Array.isArray(med?.riskDomains) && med.riskDomains.length ? safeStr(med.riskDomains[0], 12) : "-"}`,
    // law/ethics/cyber/edu/strategy (first tags only)
    `lw=${Array.isArray(med?.lawTags) && med.lawTags.length ? safeStr(med.lawTags[0], 14) : "-"}`,
    `et=${Array.isArray(med?.ethicsTags) && med.ethicsTags.length ? safeStr(med.ethicsTags[0], 14) : "-"}`,
    `cy=${Array.isArray(med?.cyberTags) && med.cyberTags.length ? safeStr(med.cyberTags[0], 14) : "-"}`,
    `en=${Array.isArray(med?.englishTags) && med.englishTags.length ? safeStr(med.englishTags[0], 10) : "-"}`,
    `fi=${Array.isArray(med?.finTags) && med.finTags.length ? safeStr(med.finTags[0], 10) : "-"}`,
    `stg=${Array.isArray(med?.strategyTags) && med.strategyTags.length ? safeStr(med.strategyTags[0], 12) : "-"}`,
    // move hint (bounded)
    `mv=${safeStr(med?.movePolicy?.preferredMove || "", 10) || "-"}`,
  ];

  const base = parts.join("|");
  if (base.length <= MARION_TRACE_MAX) return base;
  return base.slice(0, MARION_TRACE_MAX - 3) + "...";
}
function hashTrace(trace) {
  return stableHashLite(safeStr(trace, 400)).slice(0, 10);
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
    let mode = macModeOverride || implicit.mode || "";
    if (!mode) mode = "architect";
    if (mode !== "architect" && mode !== "user" && mode !== "transitional") mode = "architect";

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

    let dominance = "neutral"; // firm | neutral | soft
    let budget = "medium"; // short | medium

    if (mode === "architect" || mode === "transitional") {
      budget = "short";
      dominance = intent === "ADVANCE" ? "firm" : "neutral";
    } else {
      budget = "medium";
      dominance = intent === "ADVANCE" ? "neutral" : "soft";
    }

    const grounding = mode === "user" || mode === "transitional";
    let groundingMaxLines = intent === "STABILIZE" ? 3 : grounding ? 1 : 0;

    // --- PSYCH LAYER ---
    const psych0 = computePsychologyReasoningObject(
      n,
      s,
      { mode, intent, dominance, budget, actionable, textEmpty, stalled },
      now
    );

    const latentDesire = inferLatentDesire(n, s, { mode, intent, dominance, budget });
    const confidence = inferConfidence(n, s, { mode, intent, dominance, budget });
    psych0.motivation = safeStr(latentDesire || "", 16);

    // --- RISK BRIDGE (bond) ---
    const risk = computeRiskBridge(n, psych0, { mode, intent, actionable });

    // --- LAW LAYER ---
    const lawSeed = {
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

    const lawApplied = applyLawLayer(lawSeed, psych0, risk);

    intent = normalizeMove(lawApplied.intent);
    dominance = safeStr(lawApplied.dominance || dominance, 10) || dominance;
    budget = safeStr(lawApplied.budget || budget, 10) || budget;
    groundingMaxLines = clampInt(lawApplied.groundingMaxLines, 0, 3, groundingMaxLines);
    const velvetAllowed = lawApplied.velvetAllowed !== false;

    // --- Velvet binding (music-first) ---
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

    let marionState = "SEEK"; // SEEK | DELIVER | STABILIZE | BRIDGE
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

    // Build base cog
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

      // risk bridge outputs
      riskTier: safeStr(risk.riskTier || "", 12),
      riskDomains: Array.isArray(risk.riskDomains) ? risk.riskDomains.slice(0, 8) : [],
      riskSignals: Array.isArray(risk.riskSignals) ? risk.riskSignals.slice(0, 8) : [],

      // law outputs
      lawTags: Array.isArray(lawApplied.lawTags) ? lawApplied.lawTags.slice(0, 8) : [],
      lawReasons: Array.isArray(lawApplied.lawReasons) ? lawApplied.lawReasons.slice(0, 8) : [],
      velvetAllowed: !!velvetAllowed,

      latentDesire,
      confidence: {
        user: clamp01(confidence.user),
        nyx: clamp01(confidence.nyx),
      },

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
      macModeWhy: Array.isArray(implicit.why)
        ? implicit.why.slice(0, 6).map((x) => safeStr(x, 60))
        : [],

      privacy: {
        noRawTextInTrace: true,
        boundedTrace: true,
        sideEffectFree: true,
      },
    };

    // Apply psychology impacts (post-law)
    cog = applyPsychologyToMediator(cog, psych0);

    // --- ETHICS LAYER (expanded) ---
    const ethics = computeEthicsLayer(n, psych0, cog, risk);
    cog.ethicsTags = ethics.ethicsTags;
    cog.ethicsSignals = ethics.ethicsSignals;

    // --- CYBER LAYER (defensive-only) ---
    const cyber = computeCyberLayer(n, psych0);
    cog.cyberTags = cyber.cyberTags;
    cog.cyberSignals = cyber.cyberSignals;

    // --- ENGLISH LAYER ---
    const english = computeEnglishLayer(n, { mode: cog.mode, intent: cog.intent });
    cog.englishTags = english.englishTags;
    cog.englishSignals = english.englishSignals;

    // --- FIN/ECO LAYER ---
    const fin = computeFinanceLayer(n);
    cog.finTags = fin.finTags;
    cog.finSignals = fin.finSignals;

    // --- STRATEGY LAYER ---
    const strat = computeStrategyLayer(n, { mode: cog.mode, intent: cog.intent }, psych0);
    cog.strategyTags = strat.strategyTags;
    cog.strategySignals = strat.strategySignals;

    // trace (no raw text)
    const trace = buildTrace(n, s, {
      ...cog,
      confidence: cog.confidence,
      latentDesire: cog.latentDesire,
      velvet: cog.velvet,
      velvetReason: cog.velvetReason,
      stalled: cog.stalled,
      actionable: cog.actionable,
      textEmpty: cog.textEmpty,
      psychology: cog.psychology,
      movePolicy: cog.movePolicy,
      riskTier: cog.riskTier,
      riskDomains: cog.riskDomains,
      lawTags: cog.lawTags,
      ethicsTags: cog.ethicsTags,
      cyberTags: cog.cyberTags,
      englishTags: cog.englishTags,
      finTags: cog.finTags,
      strategyTags: cog.strategyTags,
    });

    cog.marionTrace = safeStr(trace, MARION_TRACE_MAX + 8);
    cog.marionTraceHash = hashTrace(trace);

    // Optional policy hooks (future-safe)
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

    return cog;
  } catch (e) {
    const code = safeStr(e && (e.code || e.name) ? e.code || e.name : "ERR", 40);
    return {
      marionVersion: MARION_VERSION,
      mode: "architect",
      intent: "CLARIFY",
      dominance: "neutral",
      budget: "short",
      stalled: false,
      actionable: false,
      textEmpty: false,
      groundingMaxLines: 0,

      riskTier: RISK.TIER.LOW,
      riskDomains: [],
      riskSignals: [RISK.SIGNALS.MINIMIZE_RISKY_DETAIL],

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
      movePolicy: { preferredMove: "CLARIFY", hardOverride: false, reason: "fail_open" },
      marionStyle: MARION_STYLE_CONTRACT,
      handoff: {
        marionEndsHard: true,
        nyxBeginsAfter: true,
        allowSameTurnSplit: true,
        marionTagSuggested: MARION_STYLE_CONTRACT.tags.retry,
      },
      marionTrace: "fail_open",
      marionTraceHash: stableHashLite("fail_open").slice(0, 10),
      macModeOverride: "",
      macModeWhy: [],
      privacy: { noRawTextInTrace: true, boundedTrace: true, sideEffectFree: true },
      errorCode: code,
    };
  }
}

module.exports = {
  MARION_VERSION,
  LATENT_DESIRE,
  MARION_STYLE_CONTRACT,
  PSYCH,
  RISK,
  LAW,
  ETHICS,
  CYBER,
  ENGLISH,
  FIN,
  STRATEGY,
  mediate,

  // optional exports for diagnostics
  buildTrace,
  hashTrace,

  // bridge/law/ethics exports for deterministic unit tests
  computeRiskBridge,
  applyLawLayer,
  computeEthicsLayer,

  // cyber/edu/strategy exports for deterministic unit tests
  computeCyberLayer,
  computeEnglishLayer,
  computeFinanceLayer,
  computeStrategyLayer,

  // psych exports for deterministic unit tests
  computePsychologyReasoningObject,
  applyPsychologyToMediator,
};
