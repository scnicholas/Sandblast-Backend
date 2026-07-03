"use strict";

/**
 * R18D Layer 03 — Finance Missing Input Resolver
 * Identifies missing finance inputs required before normalization or downstream analysis.
 * Critical patch: supports legacy test shapes, decorates array results with status keys, and adds entity/period gates.
 *
 * No external dependencies.
 */

const fs = require("fs");
const path = require("path");

function firstExistingDir(candidates = []) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      const resolved = path.resolve(candidate);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) return resolved;
    } catch (_error) {
      // Ignore bad candidate.
    }
  }
  return path.resolve(__dirname, "../../../../Domains/finance/packs");
}

const DEFAULT_PACK_DIR = firstExistingDir([
  process.env.FINANCE_PACK_DIR,
  path.resolve(__dirname, "../packs"),
  path.resolve(__dirname, "../../packs"),
  path.resolve(__dirname, "../../../../Domains/finance/packs"),
  path.resolve(__dirname, "../../../../Data/Domains/finance/packs"),
  path.resolve(process.cwd(), "Data/marion/runtime/finance/packs"),
  path.resolve(process.cwd(), "Domains/finance/packs")
]);

function safeReadJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !raw.trim()) return fallback;
    return Object.assign({}, fallback, JSON.parse(raw));
  } catch (error) {
    return { __loadError: true, filePath, message: error.message, fallback };
  }
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function uniqueArray(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
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
  return new Set(metricInputs.map((metric) => metric.metric || metric).filter(Boolean));
}

function hasMetric(metrics, name) {
  return metrics.has(name);
}

function hasAnyMetric(metrics, names = []) {
  return names.some((name) => metrics.has(name));
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

function cloneMissingInput(item = {}) {
  return {
    missingInput: item.missingInput,
    reason: item.reason,
    severity: item.severity,
    blocksAnalysis: Boolean(item.blocksAnalysis),
    clarifyingQuestion: item.clarifyingQuestion
  };
}

function decorateResult(missing = []) {
  const output = uniqueArrayObjects(missing, "missingInput");
  const snapshot = output.map(cloneMissingInput);

  output.missing = snapshot;
  output.missingInputs = snapshot;
  output.requiredInputs = snapshot.filter((item) => item.severity === "required");
  output.complete = output.length === 0;
  output.isComplete = output.length === 0;
  output.valid = !output.some((item) => item.blocksAnalysis === true);
  output.ok = output.valid;
  output.diagnostics = {
    missingCount: output.length,
    blockingCount: output.filter((item) => item.blocksAnalysis === true).length,
    warnings: output.map((item) => `missing:${item.missingInput}`),
    errors: output
      .filter((item) => item.blocksAnalysis === true)
      .map((item) => `blocking_missing:${item.missingInput}`),
    circularReferencesRemoved: true
  };

  return output;
}

class FinanceMissingInputResolver {
  constructor(options = {}) {
    this.packDir = options.packDir ? path.resolve(options.packDir) : DEFAULT_PACK_DIR;

    this.rules = safeReadJson(
      path.join(this.packDir, "fin_missing_input_rules_v1.json"),
      { analysisRequirementRules: {}, generalMissingInputRules: [], severityLevels: {} }
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
    const normalizedInput = input.normalizedInput || {};
    const queryText = input.queryText || input.originalQuery || input.text || input.userText || normalizedInput.text || normalizedInput.normalizedText || "";
    const metricInputs = this.normalizeMetricInputs(input.metricInputs || input.detectedMetrics || input.metrics || []);
    const claimTargets = Array.isArray(input.claimTargets) ? input.claimTargets : [];
    const entityInputs = this.normalizeEntityInputs(input.entityInputs || {}, input.entities || [], input.periods || []);
    const intentContext = input.intentContext || {};

    const presentMetrics = metricSet(metricInputs);
    const missing = [];

    claimTargets.forEach((target) => {
      const targetRule = this.rules.analysisRequirementRules ? this.rules.analysisRequirementRules[target.targetType] : null;
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

    this.applyGeneralRules({ output: missing, queryText, presentMetrics, entityInputs, intentContext });
    this.applyStructuralRules({ output: missing, queryText, presentMetrics, entityInputs, metricInputs });

    return decorateResult(missing);
  }

  normalizeMetricInputs(metricInputs = []) {
    if (!Array.isArray(metricInputs)) return [];

    return metricInputs.map((metric) => {
      if (typeof metric === "string") return { metric };
      if (metric && typeof metric === "object") return metric;
      return null;
    }).filter(Boolean);
  }

  normalizeEntityInputs(entityInputs = {}, entities = [], periods = []) {
    const existingDates = entityInputs.dates || [];
    const existingCompanies = entityInputs.companyNames || [];

    return {
      ...entityInputs,
      businessNames: uniqueArray(entityInputs.businessNames || []),
      programNames: uniqueArray(entityInputs.programNames || []),
      companyNames: uniqueArray([...existingCompanies, ...entities]),
      sourceNames: uniqueArray(entityInputs.sourceNames || []),
      jurisdictions: uniqueArray(entityInputs.jurisdictions || []),
      dates: uniqueArray([...existingDates, ...periods])
    };
  }

  applyRequirementGroup(options = {}) {
    const { output, presentMetrics, rules, severity, blocksAnalysisDefault, minimumToProceed } = options;

    (rules || []).forEach((rule) => {
      const metric = rule.metric;
      if (!metric || hasMetric(presentMetrics, metric)) return;

      const isMinimum = Array.isArray(minimumToProceed) && minimumToProceed.includes(metric);
      const blocksAnalysis = severity === "required" ? isMinimum || blocksAnalysisDefault : false;
      output.push(makeMissing(metric, rule, severity, blocksAnalysis));
    });
  }

  applyStructuralRules(options = {}) {
    const { output, queryText, presentMetrics, entityInputs, metricInputs } = options;
    const text = normalize(queryText);
    const hasFinanceMetric = metricInputs.length > 0;
    const hasEntity = Boolean(
      (entityInputs.companyNames || []).length ||
      (entityInputs.businessNames || []).length ||
      (entityInputs.programNames || []).length
    );
    const hasPeriod = Boolean((entityInputs.dates || []).length || hasMetric(presentMetrics, "claim_period"));
    const looksLikeAnalysis = /\b(analyze|compare|review|trend|margin|revenue|income|cash flow|financial|profitability|healthy|health)\b/.test(text);

    if (!text && !hasFinanceMetric) {
      output.push({
        missingInput: "query_text",
        reason: "No finance query or source text was supplied.",
        severity: "required",
        blocksAnalysis: true,
        clarifyingQuestion: "What finance question should be analyzed?"
      });
      return;
    }

    if (looksLikeAnalysis && !hasFinanceMetric) {
      output.push({
        missingInput: "financial_metric",
        reason: "The request needs at least one specific finance metric or analysis target.",
        severity: "recommended",
        blocksAnalysis: false,
        clarifyingQuestion: "Which metrics should be analyzed: revenue, margin, net income, cash flow, debt, valuation, or something else?"
      });
    }

    if (hasFinanceMetric && !hasEntity) {
      output.push({
        missingInput: "company",
        reason: "Metric analysis requires a company, ticker, issuer, business, or program target.",
        severity: "required",
        blocksAnalysis: true,
        clarifyingQuestion: "Which company, ticker, issuer, or business should the metrics apply to?"
      });
    }

    if ((hasFinanceMetric || /\b(compare|trend|fy|fiscal|quarter|annual|year)\b/.test(text)) && !hasPeriod) {
      output.push({
        missingInput: "period",
        reason: "Finance metrics need a fiscal year, quarter, date range, or trailing period for reliable comparison.",
        severity: "recommended",
        blocksAnalysis: false,
        clarifyingQuestion: "What fiscal year, quarter, or date range should be used?"
      });
    }

    if (/\b(compare|versus|vs\.?|against)\b/.test(text) && hasEntity && (entityInputs.companyNames || []).length < 2) {
      output.push({
        missingInput: "comparison_entity",
        reason: "A comparison request needs at least two companies, tickers, or benchmarks.",
        severity: "recommended",
        blocksAnalysis: false,
        clarifyingQuestion: "What company, peer, index, or benchmark should this be compared against?"
      });
    }
  }

  applyGeneralRules(options = {}) {
    const { output, queryText, presentMetrics, entityInputs, intentContext } = options;
    const text = normalize(queryText);
    const jurisdictions = entityInputs.jurisdictions || intentContext.detectedJurisdictions || [];

    if (/\b(survive|survival|runway|cash pressure|last)\b/.test(text) &&
      !hasMetric(presentMetrics, "monthly_burn") && !hasMetric(presentMetrics, "monthly_fixed_costs")) {
      output.push({
        missingInput: "monthly_burn",
        reason: "Survival or runway analysis needs monthly burn or monthly costs.",
        severity: "recommended",
        blocksAnalysis: false,
        clarifyingQuestion: "What is the current monthly net cash burn or monthly cost base?"
      });
    }

    if (/\b(revenue drop|revenue drops|ad revenue drops|sales decline|income drop)\b/.test(text) &&
      !hasMetric(presentMetrics, "monthly_revenue")) {
      output.push({
        missingInput: "monthly_revenue",
        reason: "A revenue-shock scenario is more precise with baseline monthly revenue.",
        severity: "recommended",
        blocksAnalysis: false,
        clarifyingQuestion: "What is the current average monthly revenue before the drop?"
      });
    }

    if (/\b(compliance|eligible|eligibility|grant|program|tax|securities)\b/.test(text) &&
      (!jurisdictions || jurisdictions.length === 0)) {
      output.push({
        missingInput: "jurisdiction",
        reason: "Compliance and eligibility analysis requires jurisdiction.",
        severity: "required",
        blocksAnalysis: true,
        clarifyingQuestion: "Which jurisdiction applies?"
      });
    }

    if (/\b(current|currently|still open|right now|latest|today)\b/.test(text) &&
      !hasMetric(presentMetrics, "current_official_source")) {
      output.push({
        missingInput: "current_official_source",
        reason: "Current finance, eligibility, or compliance claims require current source verification.",
        severity: "required",
        blocksAnalysis: intentContext.primaryIntent === "compliance",
        clarifyingQuestion: "Do we have the current official source page, or should this remain unverified?"
      });
    }

    if (/\b\d+(?:\.\d+)?\s?%/.test(text) &&
      !Array.from(presentMetrics).some((metric) => /decline|margin|rate|churn|inflation|interest/.test(metric))) {
      output.push({
        missingInput: "metric_context",
        reason: "A percentage must be tied to a finance metric.",
        severity: "required",
        blocksAnalysis: true,
        clarifyingQuestion: "What does the percentage refer to: revenue decline, margin, churn, interest rate, inflation, or something else?"
      });
    }

    if (hasAnyMetric(presentMetrics, ["debt", "loan_amount", "debt_service"]) && !hasMetric(presentMetrics, "interest_rate") && /\bloan|debt|credit|repayment\b/.test(text)) {
      output.push({
        missingInput: "interest_rate",
        reason: "Debt-capacity analysis is stronger with interest-rate or repayment terms.",
        severity: "recommended",
        blocksAnalysis: false,
        clarifyingQuestion: "What interest rate and repayment term should be used?"
      });
    }
  }

  process(input = {}) { return this.resolve(input); }
  execute(input = {}) { return this.resolve(input); }
  run(input = {}) { return this.resolve(input); }
  resolveMissing(input = {}) { return this.resolve(input); }

  static resolve(input = {}, options = {}) {
    return new FinanceMissingInputResolver(options).resolve(input);
  }
}

module.exports = {
  FinanceMissingInputResolver
};
