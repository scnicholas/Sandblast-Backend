"use strict";

/**
 * Utils/lawKnowledge.js
 *
 * Law Knowledge Retrieval Layer (Canada-first)
 *
 * Responsibilities:
 *  - Load domain packs from /Data/Domains/law/packs
 *  - Cache packs (mtime-based)
 *  - Provide deterministic retrieval functions
 *  - Build a retrieval plan (primary/secondary/tertiary) using weighted scoring
 *  - Detect basic “legal advice / high-stakes” escalation cues (non-binding; Marion/Law layer decides)
 *
 * NOT responsible for:
 *  - Tone
 *  - Reply composition
 *  - Session mutation
 *  - Express/server logic
 *  - Performing live web lookups
 *
 * MarionSO queries this module.
 */

const fs = require("fs");
const path = require("path");

// =========================
// CONFIG
// =========================

const DOMAIN_DIR_CANDIDATES = [
  process.env.NYX_LAW_PACK_DIR,
  path.resolve(__dirname, "..", "Data", "law"),
  path.resolve(__dirname, "..", "Data", "Domains", "law", "packs"),
  path.resolve(process.cwd(), "Data", "law"),
  path.resolve(process.cwd(), "Data", "Domains", "law", "packs")
].filter(Boolean);

function resolveDomainDir() {
  for (const candidate of DOMAIN_DIR_CANDIDATES) {
    try {
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    } catch (_e) {}
  }
  return DOMAIN_DIR_CANDIDATES[0];
}

const DOMAIN_DIR = resolveDomainDir();
const LAW_K_VERSION = "lawKnowledge v1.1.0-hardened";
const PACK_FILES = Object.freeze({
  safetyPosture: "law_safety_and_posture_v1.json",
  foundations: "law_foundations_v1.json",
  researchMethods: "law_research_methods_v1.json",
  constitutionalCharter: "law_constitutional_charter_v1.json",
  contracts: "law_contracts_v1.json",
  torts: "law_torts_v1.json",
  criminal: "law_criminal_v1.json",
  sourceLadder: "law_source_ladder_v1.json",
  contractsSourcesIndex: "law_contracts_sources_index_v1.json"
});

// Default pack name (you can add more later)
const DEFAULT_SOURCE_LADDER_PACK = "law_source_ladder_v1.json";

// Scoring knobs (deterministic)
const SCORE = Object.freeze({
  // intent weights
  NEED_EXACT_LANGUAGE: 14,
  NEED_CURRENT_RULE: 10,
  NEED_PRECEDENT: 10,
  NEED_EXPLANATION: 8,
  NEED_HOW_TO_RESEARCH: 7,

  // tier priors (baseline)
  PRIOR_PRIMARY: 9,
  PRIOR_SECONDARY: 6,
  PRIOR_TERTIARY: 4,

  // boosts
  BOOST_OFFICIAL: 6,
  BOOST_CASELAW: 4,
  BOOST_STATUTES: 4,
  BOOST_TOOL_GUIDE: 3,

  // penalties
  PENALIZE_NONFREE_IF_USER_WANTS_FREE: 3,
  PENALIZE_IF_LIMIT_MISMATCH: 2
});

// =========================
// INTERNAL CACHE
// =========================

let _packCache = {
  mtimeMap: {},
  packs: {}
};

// =========================
// HELPERS
// =========================

function isObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function stripGitConflictBlocks(text) {
  const lines = String(text || "").split(/\r?\n/);
  const out = [];
  let inConflict = false;
  let keepHead = false;
  for (const line of lines) {
    if (line.startsWith("<<<<<<<")) { inConflict = true; keepHead = true; continue; }
    if (inConflict && line.startsWith("=======")) { keepHead = false; continue; }
    if (inConflict && line.startsWith(">>>>>>>")) { inConflict = false; keepHead = false; continue; }
    if (!inConflict || keepHead) out.push(line);
  }
  return out.join("\n");
}

function safeReadJSON(file) {
  try {
    const txt = fs.readFileSync(file, "utf8");
    const noBom = txt.charCodeAt(0) === 0xfeff ? txt.slice(1) : txt;
    const clean = stripGitConflictBlocks(noBom);
    return JSON.parse(clean);
  } catch (_e) {
    return null;
  }
}

function safeStat(file) {
  try {
    return fs.statSync(file);
  } catch (_e) {
    return null;
  }
}

function safeStr(x, max = 200) {
  if (x === null || x === undefined) return "";
  const s = String(x);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(input, terms) {
  const s = normalizeText(input);
  for (const t of Array.isArray(terms) ? terms : []) {
    const k = normalizeText(t);
    if (!k) continue;
    if (s.includes(k)) return true;
  }
  return false;
}

function uniqBounded(arr, max = 10) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(arr) ? arr : []) {
    const v = safeStr(it, 140);
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

// =========================
// PACK LOADER
// =========================

function loadPack(fileName) {
  const fullPath = path.join(DOMAIN_DIR, fileName);
  const stat = safeStat(fullPath);
  if (!stat || !stat.isFile()) return null;

  const mtime = Number(stat.mtimeMs || 0);

  if (_packCache.packs[fileName] && _packCache.mtimeMap[fileName] === mtime) {
    return _packCache.packs[fileName];
  }

  const data = safeReadJSON(fullPath);
  if (!data) return null;

  _packCache.packs[fileName] = data;
  _packCache.mtimeMap[fileName] = mtime;

  return data;
}

function loadAllPacks() {
  let files = [];
  try {
    files = fs.readdirSync(DOMAIN_DIR);
  } catch (_e) {
    return [];
  }

  const packs = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const pack = loadPack(file);
    if (pack) packs.push(pack);
  }
  return packs;
}

// =========================
// SIGNAL DETECTION (non-binding)
// =========================

function detectLawSignals(text) {
  const input = normalizeText(text);

  // “Exact language” signals
  const wantsExact =
    /\b(exact wording|verbatim|quote|text of the law|what does the act say|section|s\.\s*\d+|regulation number)\b/.test(
      input
    );

  // “Current rule” signals
  const wantsCurrent =
    /\b(current law|as of now|latest law|amended|in force|coming into force|effective date)\b/.test(
      input
    );

  // “Precedent” signals
  const wantsCases =
    /\b(case law|precedent|leading case|test for|standard of review|ratio|obiter|judgment|decision)\b/.test(
      input
    );

  // “Explanation / doctrine” signals
  const wantsExplanation =
    /\b(explain|overview|doctrine|elements of|how does|framework|principle|test|factors)\b/.test(
      input
    );

  // “How to research / how to write” signals
  const wantsResearchHelp =
    /\b(how to research|find cases|how do i cite|citation|legal memo|factum|case brief|irac)\b/.test(
      input
    );

  // High-stakes “advice” signals (we don’t refuse; we just flag for posture/guardrails)
  const adviceAsk =
    /\b(legal advice|should i sue|can i sue|am i liable|will i win|chances of winning|what should i do legally|represent me)\b/.test(
      input
    );

  const urgentRisk =
    /\b(eviction|arrest|charge(d)?|restraining order|domestic|immigration removal|deport|child custody emergency|deadline tomorrow)\b/.test(
      input
    );

  return {
    wantsExactLanguage: !!wantsExact,
    wantsCurrentLaw: !!wantsCurrent,
    wantsPrecedent: !!wantsCases,
    wantsExplanation: !!wantsExplanation,
    wantsResearchHelp: !!wantsResearchHelp,
    adviceAsk: !!adviceAsk,
    urgentRisk: !!urgentRisk
  };
}

// =========================
// SOURCE LADDER RETRIEVAL
// =========================

function flattenSourcesFromLadderPack(pack) {
  const ladder = isObject(pack?.sourceLadder) ? pack.sourceLadder : null;
  if (!ladder) return [];

  const out = [];
  const tiers = ["primary", "secondary", "tertiary"];

  for (const tier of tiers) {
    const items = Array.isArray(ladder[tier]) ? ladder[tier] : [];
    for (const src of items) {
      if (!isObject(src)) continue;
      out.push({
        tier,
        id: safeStr(src.id || "", 80),
        name: safeStr(src.name || "", 200),
        type: safeStr(src.type || "", 80),
        authority: safeStr(src.authority || "", 80),
        access: isObject(src.access) ? { ...src.access } : {},
        useWhen: Array.isArray(src.useWhen) ? src.useWhen.map((x) => safeStr(x, 120)) : [],
        trustWeight: typeof src.trustWeight === "number" ? src.trustWeight : null,
        limits: Array.isArray(src.limits) ? src.limits.map((x) => safeStr(x, 160)) : [],
        packId: safeStr(pack.packId || "", 120)
      });
    }
  }

  return out;
}

function tierPrior(tier) {
  if (tier === "primary") return SCORE.PRIOR_PRIMARY;
  if (tier === "secondary") return SCORE.PRIOR_SECONDARY;
  return SCORE.PRIOR_TERTIARY;
}

function scoreSource(src, text, signals) {
  const input = normalizeText(text);
  const sig = isObject(signals) ? signals : {};
  let score = tierPrior(src.tier);

  // Match “useWhen” hints lightly
  if (includesAny(input, src.useWhen)) score += 4;

  // Intent-based weighting
  if (sig.wantsExactLanguage) {
    if (src.tier === "primary") score += SCORE.NEED_EXACT_LANGUAGE;
    else score -= 2;
  }
  if (sig.wantsCurrentLaw) {
    if (src.tier === "primary") score += SCORE.NEED_CURRENT_RULE;
    else score -= 1;
  }
  if (sig.wantsPrecedent) {
    if (src.type.includes("case")) score += SCORE.NEED_PRECEDENT;
    else if (src.tier === "primary") score += 2;
  }
  if (sig.wantsExplanation) {
    if (src.tier === "secondary") score += SCORE.NEED_EXPLANATION;
    if (src.tier === "tertiary") score += 1;
  }
  if (sig.wantsResearchHelp) {
    if (src.tier === "tertiary") score += SCORE.NEED_HOW_TO_RESEARCH;
    if (src.type.includes("tool") || src.type.includes("guide")) score += 2;
  }

  // Authority boosts
  const auth = normalizeText(src.authority);
  if (auth.includes("official")) score += SCORE.BOOST_OFFICIAL;

  // Type boosts
  const type = normalizeText(src.type);
  if (type.includes("statute") || type.includes("regulation")) score += SCORE.BOOST_STATUTES;
  if (type.includes("case")) score += SCORE.BOOST_CASELAW;
  if (type.includes("guide") || type.includes("tool")) score += SCORE.BOOST_TOOL_GUIDE;

  // Access preference: if user asks for public/free/library
  const wantsFree =
    /\b(free|public|online|no paywall|library)\b/.test(input) ||
    /\bavailable in libraries\b/.test(input);

  if (wantsFree) {
    const free = src.access && (src.access.free === true || src.access.public === true);
    const libraryLikely = src.access && src.access.public === "library_likely";
    if (!free && !libraryLikely) score -= SCORE.PENALIZE_NONFREE_IF_USER_WANTS_FREE;
  }

  // If limits mention mismatch (light penalty)
  if (includesAny(input, src.limits)) score -= SCORE.PENALIZE_IF_LIMIT_MISMATCH;

  // Trust weight nudge (bounded)
  if (typeof src.trustWeight === "number" && Number.isFinite(src.trustWeight)) {
    // map 0.60..1.00 -> +0..+4
    const tw = Math.max(0.6, Math.min(1.0, src.trustWeight));
    score += Math.round((tw - 0.6) * 10); // 0..4
  }

  return score;
}

function getSourceLadderPack() {
  // Prefer default, fall back to “any ladder-like” pack
  const p = loadPack(DEFAULT_SOURCE_LADDER_PACK);
  if (p) return p;

  const packs = loadAllPacks();
  for (const pack of packs) {
    if (isObject(pack?.sourceLadder)) return pack;
  }
  return null;
}

function retrieveBestSources(text) {
  const pack = getSourceLadderPack();
  if (!pack) {
    return {
      ok: false,
      packId: "",
      sources: { primary: [], secondary: [], tertiary: [] },
      ranked: [],
      reason: "no_packs_found"
    };
  }

  const signals = detectLawSignals(text);
  const all = flattenSourcesFromLadderPack(pack);

  const ranked = all
    .map((src) => {
      const score = scoreSource(src, text, signals);
      return { src, score };
    })
    .sort((a, b) => b.score - a.score);

  // pick top per tier (deterministic)
  const byTier = { primary: [], secondary: [], tertiary: [] };
  for (const r of ranked) {
    const t = r.src.tier;
    if (!byTier[t]) continue;
    if (byTier[t].length >= 3) continue;
    byTier[t].push({
      id: r.src.id,
      name: r.src.name,
      type: r.src.type,
      authority: r.src.authority,
      access: r.src.access,
      useWhen: r.src.useWhen,
      trustWeight: r.src.trustWeight,
      limits: r.src.limits,
      packId: r.src.packId,
      score: r.score
    });
    if (byTier.primary.length >= 3 && byTier.secondary.length >= 3 && byTier.tertiary.length >= 3) break;
  }

  return {
    ok: true,
    packId: safeStr(pack.packId || DEFAULT_SOURCE_LADDER_PACK, 120),
    sources: byTier,
    ranked: ranked.slice(0, 12).map((r) => ({
      tier: r.src.tier,
      id: r.src.id,
      name: r.src.name,
      score: r.score
    })),
    signals
  };
}

// =========================
// RETRIEVAL PLAN (what Marion should “prefer”)
// =========================

function buildRetrievalPlan(text, result) {
  const sig = isObject(result?.signals) ? result.signals : detectLawSignals(text);

  // Simple deterministic plan:
  // - Exact/current rule -> primary-first
  // - Precedent -> primary (case law), then secondary
  // - Explanation -> secondary-first
  // - Research help -> tertiary-first
  let preferredTier = "primary";
  let rationale = "default_primary";

  if (sig.wantsResearchHelp) {
    preferredTier = "tertiary";
    rationale = "research_help";
  } else if (sig.wantsExplanation && !sig.wantsExactLanguage && !sig.wantsCurrentLaw) {
    preferredTier = "secondary";
    rationale = "doctrinal_explanation";
  } else if (sig.wantsPrecedent && !sig.wantsExactLanguage) {
    preferredTier = "primary";
    rationale = "precedent_primary";
  } else if (sig.wantsExactLanguage || sig.wantsCurrentLaw) {
    preferredTier = "primary";
    rationale = sig.wantsExactLanguage ? "exact_language" : "current_rule";
  }

  // Guardrails posture hints (non-binding)
  const posture = [];
  if (sig.adviceAsk) posture.push("non_advice_posture");
  if (sig.urgentRisk) posture.push("suggest_time_sensitive_professional_help");
  if (preferredTier === "primary") posture.push("cite_and_quote_minimally");
  if (preferredTier === "secondary") posture.push("summarize_doctrine_then_anchor_to_primary");
  if (preferredTier === "tertiary") posture.push("give_research_steps_not_substantive_opinion");

  return {
    preferredTier,
    rationale,
    posture: uniqBounded(posture, 6)
  };
}

// =========================
// PUBLIC API
// =========================

/**
 * queryLaw(text)
 *
 * Returns:
 * {
 *   ok,
 *   signals: { wantsExactLanguage, wantsCurrentLaw, wantsPrecedent, wantsExplanation, wantsResearchHelp, adviceAsk, urgentRisk },
 *   sources: { primary:[...], secondary:[...], tertiary:[...] },
 *   retrievalPlan: { preferredTier, rationale, posture[] },
 *   ranked: [{tier,id,name,score}...],
 *   packId
 * }
 */

function getMarionHints(input = {}, _ctx = {}) {
  try {
    const features = isObject(input.features) ? input.features : {};
    const rawTokens = Array.isArray(input.tokens) ? input.tokens : [];
    const tokens = uniqBounded(rawTokens.map((t) => normalizeText(t)).filter(Boolean), 24);
    const queryKey = safeStr(input.queryKey || "", 24);
    const syntheticText = tokens.join(" ");
    const signals = detectLawSignals(syntheticText);
    if (safeStr(features.riskTier || "", 16).toLowerCase() === "high") signals.urgentRisk = true;
    const plan = buildRetrievalPlan(syntheticText, { signals });
    const focus = plan.preferredTier === "tertiary" ? "legal_research_method" : (signals.wantsPrecedent ? "case_law_orientation" : "canadian_law_education");
    return {
      enabled: true,
      version: LAW_K_VERSION,
      queryKey,
      jurisdiction: "Canada",
      packs: { primary: PACK_FILES.sourceLadder, versions: PACK_FILES },
      focus,
      stance: "educational_non_advice",
      principles: uniqBounded(["jurisdiction_first", "source_ladder", "facts_matter", "no_legal_advice"], 6),
      frameworks: uniqBounded([plan.rationale, plan.preferredTier + "_first"], 6),
      guardrails: uniqBounded(["do_not_predict_outcome", "recommend_professional_help_for_high_stakes", "cite_primary_sources_when_needed"].concat(plan.posture || []), 8),
      exampleTypes: uniqBounded(["issue_spotting", "source_ladder", "research_plan"], 6),
      responseCues: uniqBounded(["state_not_legal_advice", "ask_jurisdiction_or_facts_if_missing", "separate_general_rule_from_application"], 8),
      confidence: tokens.length ? 0.74 : 0.48,
      reason: "marion_safe_law_hints"
    };
  } catch (_e) {
    return { enabled: false, version: LAW_K_VERSION, reason: "law_fail_open" };
  }
}

function query(input, ctx) {
  return getMarionHints(input, ctx);
}

function queryLaw(text) {
  const res = retrieveBestSources(text);
  const plan = buildRetrievalPlan(text, res);

  return {
    ok: !!res.ok,
    packId: safeStr(res.packId || "", 140),
    signals: isObject(res.signals) ? res.signals : detectLawSignals(text),
    sources: isObject(res.sources)
      ? res.sources
      : { primary: [], secondary: [], tertiary: [] },
    retrievalPlan: plan,
    ranked: Array.isArray(res.ranked) ? res.ranked : []
  };
}

module.exports = {
  LAW_K_VERSION,
  PACK_FILES,
  DOMAIN_DIR,
  getMarionHints,
  query,
  queryLaw,

  // exposed for unit tests / integration
  detectLawSignals,
  buildRetrievalPlan,
  retrieveBestSources,
  loadPack,
  loadAllPacks
};
