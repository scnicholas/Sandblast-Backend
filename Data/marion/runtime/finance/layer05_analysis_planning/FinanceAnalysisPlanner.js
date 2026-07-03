"use strict";

/**
 * R18D Layer 05 — Finance Analysis Planner
 * Selects the finance analysis route from normalized metrics, claim targets,
 * query language, period/entity structure, and handoff state.
 *
 * Critical patch R18D-L05-PLANNER-R18C:
 * - Adds period-driven trend route detection.
 * - Adds entity-driven peer-comparison detection.
 * - Adds composite route refinement so peer + trend can coexist.
 * - Builds analysis steps and required-input coverage across primary + secondary routes.
 * - Preserves Layer 04 lineage and avoids re-extraction/re-normalization.
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
  const seen = new Set();
  const output = [];

  values.filter(Boolean).forEach((value) => {
    const marker = typeof value === "string" ? value : JSON.stringify(value);
    if (seen.has(marker)) return;
    seen.add(marker);
    output.push(value);
  });

  return output;
}

function metricNames(metrics = []) {
  return safeArray(metrics)
    .map((metric) => metric && (metric.canonicalMetric || metric.metric || metric.originalMetric))
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

function countNormalizedEntities(normalizedEntities = {}) {
  return {
    companies: safeArray(normalizedEntities.companies).length,
    businessNames: safeArray(normalizedEntities.businessNames).length,
    programs: safeArray(normalizedEntities.programs).length,
    jurisdictions: safeArray(normalizedEntities.jurisdictions).length,
    sources: safeArray(normalizedEntities.sources).length
  };
}

function periodLabels(periods = []) {
  return safeArray(periods)
    .map((period) => period && (period.canonicalPeriod || period.originalPeriod || period.period || period.rawValue))
    .filter(Boolean);
}

class FinanceAnalysisPlanner {
  plan(input = {}) {
    const queryText = input.queryText || input.originalQuery || "";
    const claimTargets = safeArray(input.claimTargets);
    const normalizedMetrics = safeArray(input.normalizedMetrics);
    const normalizedPeriods = safeArray(input.normalizedPeriods);
    const normalizedEntities = input.normalizedEntities || {};
    const missingInputs = safeArray(input.missingInputs);
    const assumptions = safeArray(input.assumptions);

    const metrics = metricNames(normalizedMetrics);
    const entities = countNormalizedEntities(normalizedEntities);
    const periods = periodLabels(normalizedPeriods);
    const routes = [];

    this.addClaimTargetRoutes(routes, claimTargets);
    this.addQueryRoutes(routes, queryText);
    this.addMetricRoutes(routes, metrics);
    this.addEntityDrivenRoutes(routes, normalizedEntities, queryText);
    this.addPeriodDrivenRoutes(routes, normalizedPeriods, { queryText, metrics, normalizedEntities });
    this.addCompositeGapRoutes(routes, {
      queryText,
      metrics,
      periods,
      entities,
      claimTargets
    });

    if (routes.length === 0 && normalizedMetrics.length > 0) {
      routes.push(this.makeRoute("general_financial_analysis", 0.62, "fallback_metric_based_route"));
    }

    if (routes.length === 0) {
      routes.push(this.makeRoute("insufficient_analysis_context", 0.35, "no_metric_or_route_detected"));
    }

    const dedupedRoutes = this.dedupeRoutes(routes).sort((a, b) => b.confidence - a.confidence);
    const primaryRoute = dedupedRoutes[0];
    const activeRouteTypes = dedupedRoutes.map((route) => route.routeType);

    const analysisSteps = this.buildAnalysisSteps(primaryRoute.routeType, metrics, activeRouteTypes);
    const requiredInputs = this.requiredInputsForRoutes(activeRouteTypes);
    const missingRequiredInputs = requiredInputs.filter((item) => {
      return missingInputs.some((missing) => missing.missingInput === item || missing.input === item || missing.key === item);
    });

    const gapRefinements = this.buildGapRefinements({
      queryText,
      metrics,
      periods,
      entities,
      activeRouteTypes,
      missingInputs,
      assumptions
    });

    const warnings = [];
    if (primaryRoute.routeType === "insufficient_analysis_context") warnings.push("insufficient_analysis_context");
    warnings.push(...gapRefinements.filter((item) => item.severity !== "info").map((item) => item.gapCode));

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
          primaryRoute.routeType === "insufficient_analysis_context" ||
          missingInputs.some((missing) => missing.blocksAnalysis === true) ||
          missingRequiredInputs.some((item) => this.isBlockingRouteInput(item))
            ? "needs_clarification"
            : "analysis_planned",
        routeCoverage: {
          metricCount: metrics.length,
          normalizedPeriodCount: periods.length,
          normalizedCompanyCount: entities.companies,
          hasPeerComparison: activeRouteTypes.includes("peer_comparison"),
          hasTrendComparison: activeRouteTypes.includes("trend_comparison"),
          hasScenarioAnalysis: activeRouteTypes.includes("business_survival_scenario")
        },
        gapRefinements,
        confidence: primaryRoute.confidence
      },
      diagnostics: {
        ok: primaryRoute.routeType !== "insufficient_analysis_context",
        warnings: uniqueArray(warnings),
        errors: [],
        routeCount: dedupedRoutes.length,
        gapCount: gapRefinements.length
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
    if (includesAny(queryText, ["compare", "comparison", "versus", "vs", "peer", "against"])) {
      routes.push(this.makeRoute("peer_comparison", 0.82, "query_language"));
    }

    if (includesAny(queryText, ["trend", "from", "through", "over time", "year over year", "yoy", "historical", "multi year", "multi-year"])) {
      routes.push(this.makeRoute("trend_comparison", 0.8, "query_language"));
    }

    if (includesAny(queryText, ["survive", "runway", "cash pressure", "revenue drop", "revenue shock", "stress"])) {
      routes.push(this.makeRoute("business_survival_scenario", 0.88, "query_language"));
    }

    if (includesAny(queryText, ["healthy", "financial health", "profitability", "profitable"])) {
      routes.push(this.makeRoute("profitability_analysis", 0.78, "query_language"));
    }

    if (includesAny(queryText, ["valuation", "pe ratio", "p/e", "multiple", "market cap"])) {
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

    if (hasAny(metrics, ["price_earnings_ratio", "eps"])) {
      routes.push(this.makeRoute("valuation_analysis", 0.76, "metric_family"));
    }

    if (hasAny(metrics, ["total_assets", "total_liabilities", "shareholders_equity"])) {
      routes.push(this.makeRoute("balance_sheet_analysis", 0.72, "metric_family"));
    }
  }

  addEntityDrivenRoutes(routes, normalizedEntities = {}, queryText = "") {
    const companyCount = safeArray(normalizedEntities.companies).length;
    const businessCount = safeArray(normalizedEntities.businessNames).length;
    const textAsksComparison = includesAny(queryText, ["compare", "comparison", "versus", "vs", "peer", "against"]);

    if (companyCount >= 2 || (businessCount >= 2 && textAsksComparison)) {
      routes.push(this.makeRoute("peer_comparison", 0.79, "multiple_normalized_entities"));
    }
  }

  addPeriodDrivenRoutes(routes, normalizedPeriods = [], context = {}) {
    const periods = periodLabels(normalizedPeriods);
    const queryText = context.queryText || "";
    const metrics = safeArray(context.metrics);
    const companyCount = safeArray(context.normalizedEntities && context.normalizedEntities.companies).length;
    const comparisonLanguage = includesAny(queryText, ["compare", "comparison", "versus", "vs", "peer", "against"]);
    const explicitPeriodLanguage = includesAny(queryText, ["fy", "fiscal", "quarter", "annual", "year", "period"]);

    if (periods.length >= 2) {
      routes.push(this.makeRoute("trend_comparison", 0.8, "multiple_normalized_periods"));
      return;
    }

    if (periods.length >= 1 && comparisonLanguage && (metrics.length >= 1 || companyCount >= 2)) {
      routes.push(this.makeRoute("trend_comparison", 0.74, "comparative_period_context"));
      return;
    }

    if (periods.length >= 1 && explicitPeriodLanguage && metrics.length >= 2) {
      routes.push(this.makeRoute("trend_comparison", 0.7, "period_metric_context"));
    }
  }

  addCompositeGapRoutes(routes, context = {}) {
    const metrics = safeArray(context.metrics);
    const claimTargets = safeArray(context.claimTargets);
    const entities = context.entities || {};
    const periods = safeArray(context.periods);
    const queryText = context.queryText || "";

    const hasStatementTarget = claimTargets.some((target) => target.targetType === "financial_statement_analysis");
    const hasStatementMetricBreadth = hasAny(metrics, ["revenue", "net_income", "free_cash_flow", "operating_cash_flow", "gross_margin", "operating_margin"]);

    if (hasStatementTarget && hasStatementMetricBreadth) {
      routes.push(this.makeRoute("financial_statement_analysis", 0.83, "claim_metric_composite"));
    }

    if (entities.companies >= 2 && periods.length >= 1 && hasStatementMetricBreadth) {
      routes.push(this.makeRoute("peer_comparison", 0.8, "entity_period_metric_composite"));
      routes.push(this.makeRoute("trend_comparison", 0.73, "entity_period_metric_composite"));
    }

    if (includesAny(queryText, ["compare"]) && hasStatementMetricBreadth && periods.length >= 1) {
      routes.push(this.makeRoute("trend_comparison", 0.72, "comparison_metric_period_composite"));
    }
  }

  makeRoute(routeType, confidence, source) {
    return {
      routeId: `fin_route_${stableSlug(routeType)}`,
      routeType,
      confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
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

  buildAnalysisSteps(routeType, metrics = [], activeRouteTypes = []) {
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

    const orderedRoutes = uniqueArray([routeType, ...safeArray(activeRouteTypes)]);
    const allRouteSteps = orderedRoutes.flatMap((route) => routeSteps[route] || []);

    return uniqueArray([
      ...base,
      ...allRouteSteps,
      metrics.length > 0 ? "preserve_metric_lineage" : null
    ]);
  }

  requiredInputsForRoutes(routeTypes = []) {
    return uniqueArray(safeArray(routeTypes).flatMap((routeType) => this.requiredInputsForRoute(routeType)));
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

  isBlockingRouteInput(inputName) {
    return [
      "company",
      "program",
      "jurisdiction",
      "current_official_source",
      "cash_on_hand",
      "monthly_burn",
      "market_price"
    ].includes(inputName);
  }

  buildGapRefinements(input = {}) {
    const gaps = [];
    const activeRouteTypes = safeArray(input.activeRouteTypes);
    const metrics = safeArray(input.metrics);
    const periods = safeArray(input.periods);
    const entities = input.entities || {};
    const missingNames = new Set(safeArray(input.missingInputs).map((item) => item.missingInput || item.input || item.key));
    const assumptions = safeArray(input.assumptions);

    if (activeRouteTypes.includes("peer_comparison") && entities.companies < 2 && missingNames.has("comparison_entity")) {
      gaps.push(this.makeGap("comparison_entity_needed", "medium", "Peer comparison needs a second company, ticker, benchmark, or index."));
    }

    if (activeRouteTypes.includes("trend_comparison") && periods.length < 2) {
      gaps.push(this.makeGap("trend_period_depth_limited", "low", "Trend comparison is implied, but only one normalized period is available."));
    }

    if (activeRouteTypes.includes("valuation_analysis") && !metrics.includes("price_earnings_ratio") && !missingNames.has("market_price")) {
      gaps.push(this.makeGap("valuation_market_price_dependency", "medium", "Valuation analysis should verify market price or valuation multiple inputs before execution."));
    }

    if (activeRouteTypes.includes("business_survival_scenario") && !metrics.includes("cash_and_equivalents")) {
      gaps.push(this.makeGap("scenario_cash_input_needed", "medium", "Survival/runway scenarios need cash-on-hand or equivalent liquidity input."));
    }

    if (assumptions.length > 0) {
      gaps.push(this.makeGap("assumption_dependency_present", "info", "Analysis plan contains explicit user assumptions and should preserve scenario labels."));
    }

    return gaps;
  }

  makeGap(gapCode, severity, recommendation) {
    return {
      gapId: `fin_gap_${stableSlug(gapCode)}`,
      gapCode,
      severity,
      recommendation
    };
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
