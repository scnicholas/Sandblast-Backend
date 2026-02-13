"use strict";

/**
 * Utils/financeKnowledge.js
 *
 * Finance Knowledge Layer
 * - Pure mediator-safe hint engine
 * - NO raw user text storage
 * - NO side effects
 * - NO fs, express, or index imports
 *
 * Exposes:
 *   getMarionHints({ features, tokens, queryKey }, ctx)
 *   PACK_FILES (for fallback meta)
 *
 * v1.0.0
 */

const FINANCE_VERSION = "financeKnowledge v1.0.0";

// -------------------------
// Pack registry (must mirror manifest order)
// -------------------------
const PACK_FILES = Object.freeze({
  micro: "fin_micro_foundations_v1.json",
  macro: "fin_macro_principles_v1.json",
  unit: "fin_unit_economics_v1.json",
  pricing: "fin_pricing_models_v1.json",
  capital: "fin_capital_markets_v1.json",
  risk: "fin_risk_management_v1.json",
  policy: "fin_public_policy_links_v1.json",
  cases: "fin_case_studies_v1.json",
  faces: "fin_face_examples_v1.json",
  dialogue: "fin_dialogue_snippets_v1.json"
});

// -------------------------
// helpers
// -------------------------
function safeStr(x, max = 120) {
  if (!x) return "";
  const s = String(x);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function uniqBounded(arr, max = 8) {
  const out = [];
  const seen = new Set();
  for (const v of Array.isArray(arr) ? arr : []) {
    const s = safeStr(v, 80);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function tokenIncludes(tokens, word) {
  return Array.isArray(tokens) && tokens.includes(word);
}

// -------------------------
// Core routing logic
// -------------------------
function routePrimaryPack(tokens = []) {
  if (tokenIncludes(tokens, "pricing") ||
      tokenIncludes(tokens, "price") ||
      tokenIncludes(tokens, "discount") ||
      tokenIncludes(tokens, "tier")) {
    return PACK_FILES.pricing;
  }

  if (tokenIncludes(tokens, "ltv") ||
      tokenIncludes(tokens, "cac") ||
      tokenIncludes(tokens, "unit") ||
      tokenIncludes(tokens, "margin")) {
    return PACK_FILES.unit;
  }

  if (tokenIncludes(tokens, "interest") ||
      tokenIncludes(tokens, "inflation") ||
      tokenIncludes(tokens, "macro")) {
    return PACK_FILES.macro;
  }

  if (tokenIncludes(tokens, "debt") ||
      tokenIncludes(tokens, "equity") ||
      tokenIncludes(tokens, "valuation")) {
    return PACK_FILES.capital;
  }

  if (tokenIncludes(tokens, "risk") ||
      tokenIncludes(tokens, "liquidity") ||
      tokenIncludes(tokens, "hedge")) {
    return PACK_FILES.risk;
  }

  if (tokenIncludes(tokens, "policy") ||
      tokenIncludes(tokens, "regulation") ||
      tokenIncludes(tokens, "tax")) {
    return PACK_FILES.policy;
  }

  return PACK_FILES.micro;
}

// -------------------------
// Main mediator-safe API
// -------------------------
function getMarionHints(input = {}, ctx = {}) {
  try {
    const features = input.features || {};
    const tokens = input.tokens || [];
    const queryKey = safeStr(input.queryKey || "", 24);

    const primaryPack = routePrimaryPack(tokens);

    const stance = "analytical_finance";
    const focus = safeStr(primaryPack.replace(".json", ""), 40);

    const principles = [];
    const frameworks = [];
    const guardrails = [
      "clarify_assumptions",
      "avoid_specific_investment_recommendations",
      "use_scenario_analysis",
      "separate_cashflow_from_profit"
    ];

    if (primaryPack === PACK_FILES.unit) {
      principles.push("ltv_gt_cac", "positive_contribution_margin");
      frameworks.push("ltv_cac_ratio", "payback_analysis");
    }

    if (primaryPack === PACK_FILES.pricing) {
      principles.push("value_based_pricing", "elasticity_awareness");
      frameworks.push("tier_segmentation", "ab_price_test");
    }

    if (primaryPack === PACK_FILES.risk) {
      principles.push("liquidity_first", "stress_testing");
      frameworks.push("scenario_design", "risk_heatmap");
    }

    if (primaryPack === PACK_FILES.macro) {
      principles.push("rates_affect_demand", "credit_cycle_awareness");
      frameworks.push("macro_transmission_model");
    }

    return {
      enabled: true,
      version: FINANCE_VERSION,
      queryKey,
      packs: {
        primary: primaryPack,
        versions: PACK_FILES
      },
      focus,
      stance,
      principles: uniqBounded(principles, 6),
      frameworks: uniqBounded(frameworks, 6),
      guardrails: uniqBounded(guardrails, 6),
      exampleTypes: [
        "scenario_analysis",
        "stress_test",
        "unit_economics_evaluation",
        "pricing_tradeoff_discussion"
      ],
      responseCues: [
        "ask_constraints",
        "define_assumptions",
        "quantify_tradeoffs",
        "separate_short_term_and_long_term"
      ],
      confidence: 0.75,
      reason: "token_routed_finance_pack"
    };
  } catch (err) {
    return {
      enabled: false,
      reason: "finance_fail_open"
    };
  }
}

module.exports = {
  FINANCE_VERSION,
  PACK_FILES,
  getMarionHints
};
