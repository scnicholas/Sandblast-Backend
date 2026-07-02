"use strict";

/**
 * R18D Layer 03 — Finance Missing Input Resolver
 * Identifies missing finance inputs required before normalization or downstream analysis.
 *
 * No external dependencies.
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_PACK_DIR = path.resolve(__dirname, "../../../../Domains/finance/packs");

function safeReadJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !raw.trim()) return fallback;
    return fallback ? Object.assign({}, fallback, JSON.parse(raw)) : JSON.parse(raw);
  } catch (error) {
    return {
      __loadError: true,
      filePath,
      message: error.message,
      fallback
    };
  }
}

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function uniqueArrayObjects(items = [], key = "missingInput") {
  const seen = new Set();
  const output = [];

  items.forEach((item) => {
    const marker = item[key] || JSON.stringify(item);
    if (seen.has(marker)) return;
    seen.add(marker);
    output.push(item);
  });

  return output;
}

function metricSet(metricInputs = []) {
  return new Set(
    metricInputs
      .map((metric) => metric.metric)
      .filter(Boolean)
  );
}

function hasMetric(metrics, name) {
  return metrics.has(name);
}

function makeMissing(metric, rule = {}, severity = "recommended", blocksAnalysis = false) {
  return {
    missingInput: metric,
    reason: rule.reason || "Required for this finance analysis.",
    severity,
    blocksAnalysis,
    clarifyingQuestion: rule.clarifyingQuestion || `Please provide ${metric}.`
  };
}

class FinanceMissingInputResolver {
  constructor(options = {}) {
    this.packDir = options.packDir ? path.resolve(options.packDir) : DEFAULT_PACK_DIR;

    this.rules = safeReadJson(
      path.join(this.packDir, "fin_missing_input_rules_v1.json"),
      {
        analysisRequirementRules: {},
        generalMissingInputRules: [],
        severityLevels: {}
      }
    );
  }

  getLoadStatus() {
    return {
      packDir: this.packDir,
      missingInputRulesLoaded: !this.rules.__loadError,
      errors: [this.rules.__loadError ? this.rules : null].filter(Boolean)
    };
  }

  resolve(input = {}) {
    const queryText = input.queryText || input.originalQuery || "";
    const metricInputs = Array.isArray(input.metricInputs) ? input.metricInputs : [];
    const claimTargets = Array.isArray(input.claimTargets) ? input.claimTargets : [];
    const entityInputs = input.entityInputs || {};
    const intentContext = input.intentContext || {};

    const presentMetrics = metricSet(metricInputs);
    const missing = [];

    claimTargets.forEach((target) => {
      const targetRule = this.rules.analysisRequirementRules
        ? this.rules.analysisRequirementRules[target.targetType]
        : null;

      if (!targetRule) return;

      this.applyRequirementGroup({
        output: missing,
        presentMetrics,
        rules: targetRule.requiredInputs || [],
        severity: "required",
        blocksAnalysisDefault: true,
        minimumToProceed: targetRule.minimumToProceed || []
      });

      this.applyRequirementGroup({
        output: missing,
        presentMetrics,
        rules: targetRule.recommendedInputs || [],
        severity: "recommended",
        blocksAnalysisDefault: false,
        minimumToProceed: targetRule.minimumToProceed || []
      });

      this.applyRequirementGroup({
        output: missing,
        presentMetrics,
        rules: targetRule.optionalInputs || [],
        severity: "optional",
        blocksAnalysisDefault: false,
        minimumToProceed: targetRule.minimumToProceed || []
      });
    });

    this.applyGeneralRules({
      output: missing,
      queryText,
      presentMetrics,
      entityInputs,
      intentContext
    });

    return uniqueArrayObjects(missing, "missingInput");
  }

  applyRequirementGroup(options = {}) {
    const {
      output,
      presentMetrics,
      rules,
      severity,
      blocksAnalysisDefault,
      minimumToProceed
    } = options;

    rules.forEach((rule) => {
      const metric = rule.metric;
      if (!metric || hasMetric(presentMetrics, metric)) return;

      const isMinimum = Array.isArray(minimumToProceed) && minimumToProceed.includes(metric);
      const blocksAnalysis = severity === "required" ? isMinimum || blocksAnalysisDefault : false;

      output.push(makeMissing(metric, rule, severity, blocksAnalysis));
    });
  }

  applyGeneralRules(options = {}) {
    const {
      output,
      queryText,
      presentMetrics,
      entityInputs,
      intentContext
    } = options;

    const text = normalize(queryText);
    const jurisdictions = entityInputs.jurisdictions || intentContext.detectedJurisdictions || [];

    if (
      /\b(survive|survival|runway|cash pressure|last)\b/.test(text) &&
      !hasMetric(presentMetrics, "monthly_burn") &&
      !hasMetric(presentMetrics, "monthly_fixed_costs")
    ) {
      output.push({
        missingInput: "monthly_burn",
        reason: "Survival or runway analysis needs monthly burn or monthly costs.",
        severity: "recommended",
        blocksAnalysis: false,
        clarifyingQuestion: "What is the current monthly net cash burn or monthly cost base?"
      });
    }

    if (
      /\b(revenue drop|revenue drops|ad revenue drops|sales decline|income drop)\b/.test(text) &&
      !hasMetric(presentMetrics, "monthly_revenue")
    ) {
      output.push({
        missingInput: "monthly_revenue",
        reason: "A revenue-shock scenario is more precise with baseline monthly revenue.",
        severity: "recommended",
        blocksAnalysis: false,
        clarifyingQuestion: "What is the current average monthly revenue before the drop?"
      });
    }

    if (
      /\b(compliance|eligible|eligibility|grant|program|tax|securities)\b/.test(text) &&
      (!jurisdictions || jurisdictions.length === 0)
    ) {
      output.push({
        missingInput: "jurisdiction",
        reason: "Compliance and eligibility analysis requires jurisdiction.",
        severity: "required",
        blocksAnalysis: true,
        clarifyingQuestion: "Which jurisdiction applies?"
      });
    }

    if (
      /\b(current|currently|still open|right now|latest|today)\b/.test(text) &&
      !hasMetric(presentMetrics, "current_official_source")
    ) {
      output.push({
        missingInput: "current_official_source",
        reason: "Current finance, eligibility, or compliance claims require current source verification.",
        severity: "required",
        blocksAnalysis: intentContext.primaryIntent === "compliance",
        clarifyingQuestion: "Do we have the current official source page, or should this remain unverified?"
      });
    }

    if (
      /\b\d+(?:\.\d+)?\s?%/.test(text) &&
      !Array.from(presentMetrics).some((metric) => /decline|margin|rate|churn|inflation|interest/.test(metric))
    ) {
      output.push({
        missingInput: "metric_context",
        reason: "A percentage must be tied to a finance metric.",
        severity: "required",
        blocksAnalysis: true,
        clarifyingQuestion: "What does the percentage refer to: revenue decline, margin, churn, interest rate, inflation, or something else?"
      });
    }
  }

  static resolve(input = {}, options = {}) {
    return new FinanceMissingInputResolver(options).resolve(input);
  }
}

module.exports = {
  FinanceMissingInputResolver
};
