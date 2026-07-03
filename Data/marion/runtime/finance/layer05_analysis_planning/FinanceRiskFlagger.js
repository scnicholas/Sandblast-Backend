"use strict";

/**
 * R18D Layer 05 — Finance Risk Flagger
 * Flags analytical limitations, missing dependencies, source risk, assumption risk,
 * and downstream overconfidence hazards.
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

class FinanceRiskFlagger {
  flag(input = {}) {
    const risks = [];

    this.addMissingInputRisks(risks, input.missingInputs);
    this.addMetricRisks(risks, input.normalizedMetrics);
    this.addEntityRisks(risks, input.normalizedEntities);
    this.addPeriodRisks(risks, input.normalizedPeriods);
    this.addSourceRisks(risks, input.normalizedSources);
    this.addAssumptionRisks(risks, input.assumptions);
    this.addNormalizationQualityRisks(risks, input.normalizationQuality);
    this.addScenarioRisks(risks, input.scenarioFrame);
    this.addRatioRisks(risks, input.ratioMap);

    const riskFlags = uniqueBy(risks, (risk) => risk.riskCode)
      .sort((a, b) => this.severityWeight(b.severity) - this.severityWeight(a.severity));

    return {
      riskFlags,
      diagnostics: {
        ok: !riskFlags.some((risk) => risk.severity === "blocking"),
        warnings: riskFlags.map((risk) => risk.riskCode),
        errors: riskFlags.filter((risk) => risk.severity === "blocking").map((risk) => risk.riskCode),
        riskCount: riskFlags.length
      }
    };
  }

  makeRisk(riskCode, severity, reason, mitigation, source = "risk_flagger") {
    return {
      riskId: `fin_risk_${stableSlug(riskCode)}`,
      riskCode,
      severity,
      reason,
      mitigation,
      source
    };
  }

  addMissingInputRisks(risks, missingInputs = []) {
    safeArray(missingInputs).forEach((missing) => {
      const name = missing.missingInput || missing.input || missing.key || "unknown_missing_input";

      risks.push(this.makeRisk(
        `missing_input:${name}`,
        missing.blocksAnalysis ? "blocking" : missing.severity === "required" ? "high" : "medium",
        missing.reason || `Missing finance input: ${name}.`,
        missing.clarifyingQuestion || `Request ${name} before final analysis.`,
        "missing_inputs"
      ));
    });
  }

  addMetricRisks(risks, normalizedMetrics = []) {
    const metrics = safeArray(normalizedMetrics);

    if (metrics.length === 0) {
      risks.push(this.makeRisk(
        "no_normalized_metrics",
        "blocking",
        "No normalized finance metrics are available for analysis.",
        "Return to Layer 04 or ask for a specific finance metric.",
        "normalized_metrics"
      ));
    }

    metrics.forEach((metric) => {
      if (metric.normalizationStatus === "unknown_metric") {
        risks.push(this.makeRisk(
          `unknown_metric:${metric.originalMetric || metric.canonicalMetric}`,
          "medium",
          "A metric was retained without a canonical match.",
          "Treat this metric cautiously or add it to the finance metric canon.",
          "normalized_metrics"
        ));
      }

      if (metric.verificationRequired) {
        risks.push(this.makeRisk(
          `metric_requires_verification:${metric.canonicalMetric}`,
          "medium",
          "A normalized metric requires source verification.",
          "Verify the metric against an official or authoritative source before making a claim.",
          "normalized_metrics"
        ));
      }
    });
  }

  addEntityRisks(risks, normalizedEntities = {}) {
    const companies = safeArray(normalizedEntities.companies);

    if (companies.length === 0) {
      risks.push(this.makeRisk(
        "no_company_entity",
        "high",
        "No company, ticker, issuer, or business entity was normalized.",
        "Ask which company/business the finance analysis applies to.",
        "normalized_entities"
      ));
    }

    companies.forEach((company) => {
      if (!company.ticker && company.entityType === "company") {
        risks.push(this.makeRisk(
          `company_without_ticker:${company.canonicalName || company.originalName}`,
          "low",
          "A company/entity was normalized without a ticker.",
          "Use the retained name or request a ticker if public-market analysis is required.",
          "normalized_entities"
        ));
      }
    });
  }

  addPeriodRisks(risks, normalizedPeriods = []) {
    if (safeArray(normalizedPeriods).length === 0) {
      risks.push(this.makeRisk(
        "no_normalized_period",
        "medium",
        "No fiscal year, quarter, date range, or trailing period was normalized.",
        "Ask for the relevant fiscal period before comparing or calculating metrics.",
        "normalized_periods"
      ));
    }
  }

  addSourceRisks(risks, normalizedSources = []) {
    const sources = safeArray(normalizedSources);

    if (sources.length === 0) {
      risks.push(this.makeRisk(
        "no_normalized_sources",
        "medium",
        "No finance source was normalized.",
        "Use source-authority checks before making factual finance claims.",
        "normalized_sources"
      ));
    }

    sources.forEach((source) => {
      if (source.authorityClass === "unknown") {
        risks.push(this.makeRisk(
          `unknown_source_authority:${source.sourceLabel}`,
          "medium",
          "A source has unknown finance authority class.",
          "Classify source authority or require verification before downstream claims.",
          "normalized_sources"
        ));
      }

      if (source.requiresVerification) {
        risks.push(this.makeRisk(
          `source_requires_verification:${source.sourceLabel}`,
          "medium",
          "A source was marked as requiring verification.",
          "Verify source recency, authority, and relevance.",
          "normalized_sources"
        ));
      }
    });
  }

  addAssumptionRisks(risks, assumptions = []) {
    const items = safeArray(assumptions);

    if (items.length >= 3) {
      risks.push(this.makeRisk(
        "assumption_heavy_analysis",
        "medium",
        "The analysis depends on multiple user-supplied assumptions.",
        "Separate stated facts from assumptions and label scenario outputs clearly.",
        "assumptions"
      ));
    }

    items.forEach((assumption) => {
      if (assumption.requiresConfirmation) {
        risks.push(this.makeRisk(
          `assumption_requires_confirmation:${assumption.assumptionId || assumption.statement}`,
          "low",
          "An assumption should be confirmed before confident analysis.",
          "Ask the user to confirm the assumption or treat it as scenario-only.",
          "assumptions"
        ));
      }
    });
  }

  addNormalizationQualityRisks(risks, normalizationQuality = null) {
    if (!normalizationQuality) return;

    if (normalizationQuality.status === "insufficient") {
      risks.push(this.makeRisk(
        "normalization_insufficient",
        "blocking",
        "Layer 04 normalization quality is insufficient.",
        "Do not proceed to calculations until blocking normalization issues are resolved.",
        "normalization_quality"
      ));
    }

    if (normalizationQuality.status === "ambiguous") {
      risks.push(this.makeRisk(
        "normalization_ambiguous",
        "medium",
        "Layer 04 normalization quality is ambiguous.",
        "Proceed only with caveats or request clarification.",
        "normalization_quality"
      ));
    }
  }

  addScenarioRisks(risks, scenarioFrame = null) {
    if (!scenarioFrame || !scenarioFrame.scenarioRequired) return;

    if (scenarioFrame.readinessStatus === "needs_scenario_inputs") {
      risks.push(this.makeRisk(
        "scenario_inputs_missing",
        "high",
        "Scenario analysis was requested or implied, but required scenario inputs are missing.",
        "Ask for cash, burn, revenue baseline, stress period, or decline assumption as applicable.",
        "scenario_frame"
      ));
    }
  }

  addRatioRisks(risks, ratioMap = null) {
    if (!ratioMap) return;

    if (safeArray(ratioMap.calculableRatios).length === 0 && safeArray(ratioMap.directlyProvidedRatios).length === 0) {
      risks.push(this.makeRisk(
        "no_calculable_ratios",
        "low",
        "No complete ratio calculation path is currently available.",
        "Use qualitative analysis or request the missing ratio inputs.",
        "ratio_map"
      ));
    }
  }

  severityWeight(severity) {
    const weights = {
      blocking: 4,
      high: 3,
      medium: 2,
      low: 1
    };

    return weights[severity] || 0;
  }

  flagRisks(input = {}) { return this.flag(input); }
  process(input = {}) { return this.flag(input); }
  execute(input = {}) { return this.flag(input); }
  run(input = {}) { return this.flag(input); }

  static flag(input = {}, options = {}) {
    return new FinanceRiskFlagger(options).flag(input);
  }
}

module.exports = {
  FinanceRiskFlagger
};
