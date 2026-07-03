"use strict";

/**
 * R18D Layer 05 — Finance Evidence Requirement Checker
 * Determines source/evidence requirements for downstream finance claims.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function stableSlug(value) {
  const slug = normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "unknown";
}

function includesAny(text = "", terms = []) {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

function uniqueBy(items = [], keyFn) {
  const seen = new Set();
  const output = [];

  items.filter(Boolean).forEach((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });

  return output;
}

class FinanceEvidenceRequirementChecker {
  check(input = {}) {
    const requirements = [];

    this.addRouteRequirements(requirements, input.analysisPlan);
    this.addMetricRequirements(requirements, input.normalizedMetrics);
    this.addSourceRequirements(requirements, input.normalizedSources);
    this.addQueryRequirements(requirements, input.queryText);
    this.addRiskRequirements(requirements, input.riskFlags);
    this.addScenarioRequirements(requirements, input.scenarioFrame);
    this.addAssumptionRequirements(requirements, input.assumptions);

    const evidenceRequirements = uniqueBy(requirements, (item) => item.requirementCode)
      .sort((a, b) => this.priorityWeight(b.priority) - this.priorityWeight(a.priority));

    return {
      evidenceRequirements,
      diagnostics: {
        ok: true,
        warnings:
          evidenceRequirements.some((item) => item.priority === "required")
            ? ["required_evidence_present"]
            : [],
        errors: [],
        requirementCount: evidenceRequirements.length
      }
    };
  }

  makeRequirement(requirementCode, priority, reason, acceptableSources = [], blockingWithoutEvidence = false) {
    return {
      requirementId: `fin_evidence_${stableSlug(requirementCode)}`,
      requirementCode,
      priority,
      reason,
      acceptableSources,
      blockingWithoutEvidence,
      status: "required_for_downstream_claim"
    };
  }

  addRouteRequirements(requirements, analysisPlan = null) {
    const route = analysisPlan && analysisPlan.primaryRoute;

    if (!route) return;

    if ([
      "profitability_analysis",
      "cash_flow_analysis",
      "balance_sheet_analysis",
      "financial_statement_analysis",
      "peer_comparison",
      "trend_comparison",
      "valuation_analysis"
    ].includes(route)) {
      requirements.push(this.makeRequirement(
        "official_financial_statement_source",
        "required",
        "Financial statement analysis should be grounded in issuer filings or official financial reports.",
        ["SEC EDGAR", "SEDAR+", "annual report", "quarterly report", "audited financial statements"],
        false
      ));
    }

    if (route === "valuation_analysis") {
      requirements.push(this.makeRequirement(
        "current_market_price_source",
        "required",
        "Valuation analysis requires current or clearly dated market-price evidence.",
        ["exchange data", "market data provider", "broker quote", "financial terminal"],
        true
      ));
    }

    if (route === "funding_eligibility_analysis") {
      requirements.push(this.makeRequirement(
        "current_program_official_source",
        "required",
        "Funding and eligibility claims require the current official program source.",
        ["official government program page", "program guide", "application portal"],
        true
      ));
    }

    if (route === "macro_context_analysis") {
      requirements.push(this.makeRequirement(
        "current_macro_official_source",
        "required",
        "Macro/rate/inflation claims require current official macroeconomic sources.",
        ["central bank", "official statistics agency", "IMF", "OECD", "World Bank"],
        false
      ));
    }

    if (route === "business_survival_scenario") {
      requirements.push(this.makeRequirement(
        "user_supplied_operating_assumptions",
        "recommended",
        "Scenario/runway analysis requires clear user-supplied assumptions for burn, cash, revenue, and stress period.",
        ["user supplied operating data", "management estimates", "internal budget"],
        false
      ));
    }
  }

  addMetricRequirements(requirements, normalizedMetrics = []) {
    safeArray(normalizedMetrics).forEach((metric) => {
      const canonical = metric.canonicalMetric;

      if (metric.verificationRequired) {
        requirements.push(this.makeRequirement(
          `verify_metric:${canonical}`,
          "required",
          `Metric ${canonical} was marked as requiring verification.`,
          ["official source", "issuer filing", "authoritative data provider"],
          false
        ));
      }

      if (["revenue", "net_income", "operating_income", "gross_profit", "free_cash_flow", "operating_cash_flow"].includes(canonical)) {
        requirements.push(this.makeRequirement(
          `statement_line_source:${canonical}`,
          "recommended",
          `Metric ${canonical} should be tied to a financial statement line item.`,
          ["issuer filing", "annual report", "quarterly report"],
          false
        ));
      }

      if (["price_earnings_ratio", "eps"].includes(canonical)) {
        requirements.push(this.makeRequirement(
          `market_or_eps_source:${canonical}`,
          "recommended",
          `Metric ${canonical} needs EPS and/or market data context.`,
          ["issuer filing", "market data provider"],
          false
        ));
      }
    });
  }

  addSourceRequirements(requirements, normalizedSources = []) {
    const sources = safeArray(normalizedSources);

    if (sources.length === 0) {
      requirements.push(this.makeRequirement(
        "source_required",
        "recommended",
        "No normalized source is available for finance evidence grounding.",
        ["issuer filing", "official source", "trusted financial data provider"],
        false
      ));
    }

    sources.forEach((source) => {
      if (source.authorityClass === "unknown") {
        requirements.push(this.makeRequirement(
          `classify_source:${source.sourceLabel}`,
          "recommended",
          "A source has unknown authority class.",
          ["source authority resolver", "manual source classification"],
          false
        ));
      }

      if (source.requiresVerification) {
        requirements.push(this.makeRequirement(
          `verify_source:${source.sourceLabel}`,
          "required",
          "A normalized source was marked as requiring verification.",
          ["fresh source check", "authority check", "document validation"],
          false
        ));
      }
    });
  }

  addQueryRequirements(requirements, queryText = "") {
    if (includesAny(queryText, ["current", "currently", "today", "latest", "still open", "right now"])) {
      requirements.push(this.makeRequirement(
        "current_source_required",
        "required",
        "The query asks for current information.",
        ["official current source", "fresh authoritative source"],
        true
      ));
    }

    if (includesAny(queryText, ["compare", "versus", "peer", "against"])) {
      requirements.push(this.makeRequirement(
        "comparison_basis_required",
        "recommended",
        "Comparison analysis requires aligned periods, metrics, and source basis.",
        ["same reporting period", "same accounting basis", "same currency"],
        false
      ));
    }
  }

  addRiskRequirements(requirements, riskFlags = []) {
    safeArray(riskFlags).forEach((risk) => {
      if (risk.severity === "blocking") {
        requirements.push(this.makeRequirement(
          `resolve_blocking_risk:${risk.riskCode}`,
          "required",
          "A blocking analysis risk must be resolved before final claims.",
          ["user clarification", "source verification", "missing input resolution"],
          true
        ));
      }
    });
  }

  addScenarioRequirements(requirements, scenarioFrame = null) {
    if (!scenarioFrame || !scenarioFrame.scenarioRequired) return;

    requirements.push(this.makeRequirement(
      "scenario_assumption_disclosure",
      "required",
      "Scenario analysis requires assumption disclosure.",
      ["user assumption confirmation", "scenario table", "sensitivity range"],
      false
    ));
  }

  addAssumptionRequirements(requirements, assumptions = []) {
    if (safeArray(assumptions).some((assumption) => assumption.requiresConfirmation)) {
      requirements.push(this.makeRequirement(
        "assumption_confirmation_required",
        "recommended",
        "At least one assumption requires confirmation.",
        ["user confirmation", "management estimate", "scenario label"],
        false
      ));
    }
  }

  priorityWeight(priority) {
    const weights = {
      required: 3,
      recommended: 2,
      optional: 1
    };

    return weights[priority] || 0;
  }

  checkEvidence(input = {}) { return this.check(input); }
  process(input = {}) { return this.check(input); }
  execute(input = {}) { return this.check(input); }
  run(input = {}) { return this.check(input); }

  static check(input = {}, options = {}) {
    return new FinanceEvidenceRequirementChecker(options).check(input);
  }
}

module.exports = {
  FinanceEvidenceRequirementChecker
};
