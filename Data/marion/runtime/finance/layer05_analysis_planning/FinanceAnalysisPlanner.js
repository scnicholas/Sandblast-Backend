"use strict";

/**
 * R18D Layer 05 — Finance Analysis Planner
 * Selects the finance analysis route from normalized metrics, claim targets,
 * query language, and handoff state.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableSlug(value) {
  const slug = normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "unknown";
}

function uniqueArray(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function metricNames(metrics = []) {
  return safeArray(metrics)
    .map((metric) => metric.canonicalMetric || metric.metric || metric.originalMetric)
    .filter(Boolean);
}

function hasAny(values = [], candidates = []) {
  const set = new Set(values);
  return candidates.some((candidate) => set.has(candidate));
}

function includesAny(text = "", terms = []) {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

class FinanceAnalysisPlanner {
  plan(input = {}) {
    const queryText = input.queryText || input.originalQuery || "";
    const claimTargets = safeArray(input.claimTargets);
    const normalizedMetrics = safeArray(input.normalizedMetrics);
    const missingInputs = safeArray(input.missingInputs);
    const assumptions = safeArray(input.assumptions);

    const metrics = metricNames(normalizedMetrics);
    const routes = [];

    this.addClaimTargetRoutes(routes, claimTargets);
    this.addQueryRoutes(routes, queryText);
    this.addMetricRoutes(routes, metrics);

    if (routes.length === 0 && normalizedMetrics.length > 0) {
      routes.push(this.makeRoute("general_financial_analysis", 0.62, "fallback_metric_based_route"));
    }

    if (routes.length === 0) {
      routes.push(this.makeRoute("insufficient_analysis_context", 0.35, "no_metric_or_route_detected"));
    }

    const dedupedRoutes = this.dedupeRoutes(routes).sort((a, b) => b.confidence - a.confidence);
    const primaryRoute = dedupedRoutes[0];

    const analysisSteps = this.buildAnalysisSteps(primaryRoute.routeType, metrics);
    const requiredInputs = this.requiredInputsForRoute(primaryRoute.routeType);
    const missingRequiredInputs = requiredInputs.filter((item) => {
      return missingInputs.some((missing) => missing.missingInput === item || missing.input === item);
    });

    return {
      analysisPlan: {
        planId: `fin_analysis_plan_${stableSlug(primaryRoute.routeType)}`,
        primaryRoute: primaryRoute.routeType,
        secondaryRoutes: dedupedRoutes.slice(1).map((route) => route.routeType),
        routeCandidates: dedupedRoutes,
        analysisSteps,
        requiredInputs,
        missingRequiredInputs,
        assumptionSensitivity:
          assumptions.length > 0 ? "assumption_sensitive" : "no_explicit_assumption_dependency",
        readinessStatus:
          primaryRoute.routeType === "insufficient_analysis_context" || missingRequiredInputs.length > 0
            ? "needs_clarification"
            : "analysis_planned",
        confidence: primaryRoute.confidence
      },
      diagnostics: {
        ok: primaryRoute.routeType !== "insufficient_analysis_context",
        warnings: primaryRoute.routeType === "insufficient_analysis_context" ? ["insufficient_analysis_context"] : [],
        errors: [],
        routeCount: dedupedRoutes.length
      }
    };
  }

  addClaimTargetRoutes(routes, claimTargets = []) {
    claimTargets.forEach((target) => {
      const type = target.targetType || "";

      if (type === "business_survival_under_revenue_shock") {
        routes.push(this.makeRoute("business_survival_scenario", 0.92, "claim_target"));
      }

      if (type === "funding_or_program_eligibility") {
        routes.push(this.makeRoute("funding_eligibility_analysis", 0.86, "claim_target"));
      }

      if (type === "pricing_model_assessment") {
        routes.push(this.makeRoute("pricing_model_analysis", 0.84, "claim_target"));
      }

      if (type === "unit_economics_assessment") {
        routes.push(this.makeRoute("unit_economics_analysis", 0.86, "claim_target"));
      }

      if (type === "credit_or_debt_capacity") {
        routes.push(this.makeRoute("debt_capacity_analysis", 0.86, "claim_target"));
      }

      if (type === "macro_or_market_context") {
        routes.push(this.makeRoute("macro_context_analysis", 0.78, "claim_target"));
      }

      if (type === "financial_statement_analysis") {
        routes.push(this.makeRoute("financial_statement_analysis", 0.82, "claim_target"));
      }
    });
  }

  addQueryRoutes(routes, queryText = "") {
    if (includesAny(queryText, ["compare", "versus", "vs", "peer", "against"])) {
      routes.push(this.makeRoute("peer_comparison", 0.82, "query_language"));
    }

    if (includesAny(queryText, ["trend", "from", "through", "over time", "year over year", "yoy"])) {
      routes.push(this.makeRoute("trend_comparison", 0.8, "query_language"));
    }

    if (includesAny(queryText, ["survive", "runway", "cash pressure", "revenue drop", "stress"])) {
      routes.push(this.makeRoute("business_survival_scenario", 0.88, "query_language"));
    }

    if (includesAny(queryText, ["healthy", "financial health", "profitability", "profitable"])) {
      routes.push(this.makeRoute("profitability_analysis", 0.78, "query_language"));
    }

    if (includesAny(queryText, ["valuation", "pe ratio", "p/e", "multiple"])) {
      routes.push(this.makeRoute("valuation_analysis", 0.82, "query_language"));
    }

    if (includesAny(queryText, ["loan", "debt", "credit", "repayment", "debt service"])) {
      routes.push(this.makeRoute("debt_capacity_analysis", 0.82, "query_language"));
    }

    if (includesAny(queryText, ["cash flow", "free cash flow", "fcf", "operating cash flow"])) {
      routes.push(this.makeRoute("cash_flow_analysis", 0.82, "query_language"));
    }
  }

  addMetricRoutes(routes, metrics = []) {
    if (hasAny(metrics, ["revenue", "gross_profit", "gross_margin", "operating_margin", "net_income", "profitability"])) {
      routes.push(this.makeRoute("profitability_analysis", 0.74, "metric_family"));
    }

    if (hasAny(metrics, ["free_cash_flow", "operating_cash_flow", "cash_and_equivalents"])) {
      routes.push(this.makeRoute("cash_flow_analysis", 0.78, "metric_family"));
    }

    if (hasAny(metrics, ["total_debt", "debt_service", "interest_rate"])) {
      routes.push(this.makeRoute("debt_capacity_analysis", 0.76, "metric_family"));
    }

    if (hasAny(metrics, ["price_earnings_ratio"])) {
      routes.push(this.makeRoute("valuation_analysis", 0.76, "metric_family"));
    }

    if (hasAny(metrics, ["total_assets", "total_liabilities", "shareholders_equity"])) {
      routes.push(this.makeRoute("balance_sheet_analysis", 0.72, "metric_family"));
    }
  }

  makeRoute(routeType, confidence, source) {
    return {
      routeId: `fin_route_${stableSlug(routeType)}`,
      routeType,
      confidence,
      source
    };
  }

  dedupeRoutes(routes = []) {
    const byType = new Map();

    routes.forEach((route) => {
      const existing = byType.get(route.routeType);
      if (!existing || route.confidence > existing.confidence) {
        byType.set(route.routeType, route);
      }
    });

    return Array.from(byType.values());
  }

  buildAnalysisSteps(routeType, metrics = []) {
    const base = ["confirm_normalized_inputs", "review_missing_inputs", "check_evidence_requirements"];

    const routeSteps = {
      profitability_analysis: ["map_income_statement_metrics", "assess_margin_and_profitability_drivers"],
      cash_flow_analysis: ["map_cash_flow_metrics", "assess_cash_generation_and_quality"],
      debt_capacity_analysis: ["map_debt_and_cash_metrics", "assess_repayment_capacity"],
      valuation_analysis: ["map_valuation_metrics", "flag_market_price_dependency"],
      trend_comparison: ["align_periods", "compare_metric_direction_and_magnitude"],
      peer_comparison: ["align_entities", "align_periods", "compare_normalized_metrics"],
      business_survival_scenario: ["frame_revenue_shock", "map_cash_runway_inputs", "flag_assumption_sensitivity"],
      funding_eligibility_analysis: ["map_program_requirements", "check_jurisdiction_and_current_source"],
      unit_economics_analysis: ["map_unit_economics_inputs", "check_cac_ltv_margin_dependencies"],
      pricing_model_analysis: ["map_price_cost_margin_inputs", "check_offer_structure_assumptions"],
      macro_context_analysis: ["map_macro_indicators", "require_current_official_sources"],
      financial_statement_analysis: ["map_statement_family", "prepare_statement_level_review"],
      balance_sheet_analysis: ["map_balance_sheet_metrics", "assess_leverage_and_capital_structure"],
      general_financial_analysis: ["prepare_general_finance_review"],
      insufficient_analysis_context: ["request_minimum_analysis_inputs"]
    };

    return uniqueArray([
      ...base,
      ...(routeSteps[routeType] || []),
      metrics.length > 0 ? "preserve_metric_lineage" : null
    ]);
  }

  requiredInputsForRoute(routeType) {
    const rules = {
      profitability_analysis: ["company", "period"],
      cash_flow_analysis: ["company", "period"],
      debt_capacity_analysis: ["company", "period"],
      valuation_analysis: ["company", "period", "market_price"],
      trend_comparison: ["company", "period"],
      peer_comparison: ["company", "comparison_entity", "period"],
      business_survival_scenario: ["cash_on_hand", "monthly_burn", "scenario_period"],
      funding_eligibility_analysis: ["program", "jurisdiction", "current_official_source"],
      unit_economics_analysis: ["price", "customer_count", "cost_basis"],
      pricing_model_analysis: ["price", "cost_basis"],
      macro_context_analysis: ["current_official_source"],
      balance_sheet_analysis: ["company", "period"],
      financial_statement_analysis: ["company", "period"]
    };

    return rules[routeType] || [];
  }

  process(input = {}) { return this.plan(input); }
  execute(input = {}) { return this.plan(input); }
  run(input = {}) { return this.plan(input); }

  static plan(input = {}, options = {}) {
    return new FinanceAnalysisPlanner(options).plan(input);
  }
}

module.exports = {
  FinanceAnalysisPlanner
};
