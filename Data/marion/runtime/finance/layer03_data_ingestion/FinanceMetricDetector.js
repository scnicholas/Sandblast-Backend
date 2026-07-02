"use strict";

/**
 * R18D Layer 03 — Finance Metric Detector
 * Maps raw extracted values and query-only metric language to candidate finance metrics.
 * Critical patch: supports string/object inputs, query-only metrics, stable metric IDs, and alias normalization.
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

const QUERY_METRIC_PATTERNS = [
  { metric: "free_cash_flow", aliases: ["free cash flow", "fcf"], confidence: 0.88 },
  { metric: "operating_cash_flow", aliases: ["operating cash flow", "cash from operations", "cfo"], confidence: 0.86 },
  { metric: "ebitda_margin", aliases: ["ebitda margin"], confidence: 0.87 },
  { metric: "EBITDA", aliases: ["ebitda"], confidence: 0.86 },
  { metric: "gross_margin", aliases: ["gross margin"], confidence: 0.86 },
  { metric: "gross_profit", aliases: ["gross profit"], confidence: 0.84 },
  { metric: "operating_margin", aliases: ["operating margin", "op margin"], confidence: 0.85 },
  { metric: "operating_income", aliases: ["operating income", "operating profit"], confidence: 0.84 },
  { metric: "net_income", aliases: ["net income", "earnings", "profit after tax"], confidence: 0.86 },
  { metric: "EPS", aliases: ["eps", "earnings per share"], confidence: 0.84 },
  { metric: "revenue", aliases: ["revenue", "sales", "top line"], confidence: 0.86 },
  { metric: "capex", aliases: ["capex", "capital expenditure", "capital expenditures"], confidence: 0.84 },
  { metric: "debt", aliases: ["debt", "borrowings", "liabilities owed"], confidence: 0.82 },
  { metric: "cash", aliases: ["cash", "cash equivalents", "cash balance"], confidence: 0.8 },
  { metric: "assets", aliases: ["assets", "total assets"], confidence: 0.8 },
  { metric: "liabilities", aliases: ["liabilities", "total liabilities"], confidence: 0.8 },
  { metric: "equity", aliases: ["equity", "shareholders equity", "shareholder equity"], confidence: 0.8 },
  { metric: "PE_ratio", aliases: ["pe ratio", "p/e ratio", "price earnings", "price-to-earnings"], confidence: 0.82 },
  { metric: "profitability", aliases: ["profitability", "financially healthy", "financial health"], confidence: 0.64 }
];

function safeReadJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    return { __loadError: true, filePath, message: error.message, fallback };
  }
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeMetric(value) {
  return String(value || "").trim();
}

function stableSlug(value) {
  const slug = normalize(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "unknown";
}

function uniqueArray(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function includesAny(text, terms = []) {
  const safe = normalize(text);
  return terms.some((term) => safe.includes(normalize(term)));
}

function phraseRegex(phrase) {
  const normalized = normalize(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${normalized}\\b`, "i");
}

function makeMetricInput(rawInput = {}, metric, options = {}) {
  const rawValue = rawInput.rawValue || options.rawValue || metric;
  const sourceInputId = rawInput.inputId || `query_${stableSlug(rawValue)}`;

  return {
    metricId: `fin_metric_${stableSlug(metric)}_${stableSlug(sourceInputId)}`,
    metric: normalizeMetric(metric),
    rawValue,
    value: rawInput.detectedValue ?? options.value ?? null,
    unit: rawInput.detectedUnit || options.unit || null,
    currency: rawInput.detectedCurrency || options.currency || null,
    period: options.period || null,
    sourceType: rawInput.sourceType || options.sourceType || "user_query",
    sourceLabel: rawInput.sourceLabel || options.sourceLabel || "user_query",
    confidence: options.confidence ?? rawInput.confidence ?? 0.6,
    assumptionStatus: options.assumptionStatus || "stated_fact",
    normalizationRequired: options.normalizationRequired ?? rawInput.requiresNormalization !== false,
    verificationRequired: Boolean(options.verificationRequired || rawInput.requiresVerification),
    sourceInputId,
    surroundingText: rawInput.surroundingText || options.surroundingText || "",
    aliases: uniqueArray(options.aliases || []),
    notes: uniqueArray(options.notes || [])
  };
}

class FinanceMetricDetector {
  constructor(options = {}) {
    this.packDir = options.packDir ? path.resolve(options.packDir) : DEFAULT_PACK_DIR;

    this.inputTypes = safeReadJson(
      path.join(this.packDir, "fin_financial_input_types_v1.json"),
      { inputTypes: {}, ambiguousInputRules: [] }
    );

    this.ingestionSchema = safeReadJson(
      path.join(this.packDir, "fin_data_ingestion_schema_v1.json"),
      { claimTargetTypes: {} }
    );
  }

  getLoadStatus() {
    return {
      packDir: this.packDir,
      inputTypesLoaded: !this.inputTypes.__loadError,
      ingestionSchemaLoaded: !this.ingestionSchema.__loadError,
      errors: [
        this.inputTypes.__loadError ? this.inputTypes : null,
        this.ingestionSchema.__loadError ? this.ingestionSchema : null
      ].filter(Boolean)
    };
  }

  detect(rawInputs = [], context = {}) {
    const normalized = this.normalizeDetectArguments(rawInputs, context);
    const queryText = normalized.queryText;
    const inputRows = normalized.rawInputs;
    const metricInputs = [];
    const usedInputIds = new Set();

    inputRows.forEach((rawInput) => {
      const metric = this.detectMetricForRawInput(rawInput, queryText, normalized.context);
      if (!metric || metric.metric === "unknown") return;

      metricInputs.push(makeMetricInput(rawInput, metric.metric, {
        confidence: metric.confidence,
        period: metric.period || null,
        verificationRequired: metric.verificationRequired,
        notes: metric.notes
      }));

      if (rawInput.inputId) usedInputIds.add(rawInput.inputId);
    });

    const queryMetrics = this.detectQueryMetricHints(queryText, normalized.context);
    queryMetrics.forEach((metric) => {
      if (metricInputs.some((item) => item.metric === metric.metric)) return;
      metricInputs.push(metric);
    });

    const claimTargets = this.detectClaimTargets({
      queryText,
      metricInputs,
      entityInputs: normalized.context.entityInputs || {}
    });

    return {
      metricInputs,
      detectedMetrics: uniqueArray(metricInputs.map((metric) => metric.metric)),
      metrics: uniqueArray(metricInputs.map((metric) => metric.metric)),
      financialMetrics: metricInputs,
      metricCandidates: metricInputs,
      claimTargets,
      untypedInputs: inputRows.filter((input) => !usedInputIds.has(input.inputId)),
      diagnostics: {
        ok: true,
        warnings: metricInputs.length === 0 && queryText ? ["no_finance_metrics_detected"] : [],
        errors: []
      }
    };
  }

  normalizeDetectArguments(rawInputs, context = {}) {
    if (typeof rawInputs === "string") {
      return {
        rawInputs: [],
        queryText: rawInputs,
        context: { ...context, queryText: rawInputs, originalQuery: rawInputs }
      };
    }

    if (!Array.isArray(rawInputs) && rawInputs && typeof rawInputs === "object") {
      const text = rawInputs.queryText || rawInputs.originalQuery || rawInputs.query || rawInputs.text || rawInputs.userText ||
        (rawInputs.normalizedInput && (rawInputs.normalizedInput.text || rawInputs.normalizedInput.normalizedText)) || "";

      return {
        rawInputs: Array.isArray(rawInputs.rawInputs) ? rawInputs.rawInputs : [],
        queryText: context.queryText || context.originalQuery || text,
        context: {
          ...context,
          ...rawInputs,
          entityInputs: context.entityInputs || rawInputs.entityInputs || {}
        }
      };
    }

    return {
      rawInputs: Array.isArray(rawInputs) ? rawInputs : [],
      queryText: context.queryText || context.originalQuery || context.text || context.userText || "",
      context
    };
  }

  detectQueryMetricHints(queryText = "", context = {}) {
    const text = normalize(queryText);
    if (!text) return [];

    const metrics = [];

    QUERY_METRIC_PATTERNS.forEach((entry) => {
      const matchedAlias = entry.aliases.find((alias) => phraseRegex(alias).test(text));
      if (!matchedAlias) return;

      metrics.push(makeMetricInput({}, entry.metric, {
        rawValue: matchedAlias,
        confidence: entry.confidence,
        surroundingText: queryText,
        sourceType: context.sourceType || "user_query",
        sourceLabel: context.sourceLabel || "user_query",
        aliases: entry.aliases,
        notes: ["query_metric_alias_detected"]
      }));
    });

    return metrics;
  }

  detectMetricForRawInput(rawInput = {}, queryText = "", context = {}) {
    const surrounding = normalize(rawInput.surroundingText || queryText);
    const combined = `${surrounding} ${normalize(rawInput.rawValue)}`;
    const type = rawInput.inputType;

    if (type === "percentage") {
      if (includesAny(combined, ["ad revenue", "revenue", "sales", "income"]) &&
        includesAny(combined, ["drop", "drops", "decline", "declines", "fall", "falls", "shortfall", "loss"])) {
        return { metric: "revenue_decline", confidence: 0.92, notes: ["percentage_mapped_to_revenue_decline"] };
      }

      if (includesAny(combined, ["gross margin", "gross profit"])) {
        return { metric: "gross_margin", confidence: 0.86, notes: ["percentage_mapped_to_gross_margin"] };
      }

      if (includesAny(combined, ["net margin", "profit margin"])) {
        return { metric: "net_margin", confidence: 0.84, notes: ["percentage_mapped_to_net_margin"] };
      }

      if (includesAny(combined, ["operating margin", "op margin"])) {
        return { metric: "operating_margin", confidence: 0.84, notes: ["percentage_mapped_to_operating_margin"] };
      }

      if (includesAny(combined, ["churn", "cancellation"])) {
        return { metric: "churn_rate", confidence: 0.86, notes: ["percentage_mapped_to_churn_rate"] };
      }

      if (includesAny(combined, ["interest", "apr", "loan rate", "policy rate", "bank of canada"])) {
        return {
          metric: "interest_rate",
          confidence: 0.84,
          verificationRequired: includesAny(combined, ["current", "today", "bank of canada", "policy rate"]),
          notes: ["percentage_mapped_to_interest_rate"]
        };
      }

      if (includesAny(combined, ["inflation", "cpi"])) {
        return { metric: "inflation_rate", confidence: 0.84, verificationRequired: true, notes: ["percentage_mapped_to_inflation_rate"] };
      }

      return { metric: "ambiguous_percentage", confidence: 0.42, notes: ["percentage_metric_ambiguous"] };
    }

    if (type === "currency_amount") {
      if (includesAny(combined, ["cash", "cash on hand", "available cash", "cash reserve", "bank balance"])) {
        return { metric: "cash_on_hand", confidence: 0.91, notes: ["currency_mapped_to_cash_on_hand"] };
      }

      if (includesAny(combined, ["monthly revenue", "monthly sales", "mrr", "per month", "monthly ad revenue"])) {
        return { metric: "monthly_revenue", confidence: 0.86, period: "month", notes: ["currency_mapped_to_monthly_revenue"] };
      }

      if (includesAny(combined, ["annual revenue", "yearly revenue", "arr", "per year", "annual sales"])) {
        return { metric: "annual_revenue", confidence: 0.86, period: "year", notes: ["currency_mapped_to_annual_revenue"] };
      }

      if (includesAny(combined, ["monthly burn", "burn rate", "cash burn", "spend per month", "net burn"])) {
        return { metric: "monthly_burn", confidence: 0.88, period: "month", notes: ["currency_mapped_to_monthly_burn"] };
      }

      if (includesAny(combined, ["fixed cost", "fixed costs", "overhead", "rent", "base cost", "base costs", "platform cost"])) {
        return { metric: "monthly_fixed_costs", confidence: 0.78, period: includesAny(combined, ["annual", "yearly"]) ? "year" : "month", notes: ["currency_mapped_to_fixed_costs"] };
      }

      if (includesAny(combined, ["variable cost", "variable costs", "cogs", "cost of sales", "usage cost", "processing fee"])) {
        return { metric: "monthly_variable_costs", confidence: 0.78, period: includesAny(combined, ["annual", "yearly"]) ? "year" : "month", notes: ["currency_mapped_to_variable_costs"] };
      }

      if (includesAny(combined, ["loan amount", "borrow", "principal", "debt amount", "financing amount"])) {
        return { metric: "loan_amount", confidence: 0.84, verificationRequired: includesAny(combined, ["offered", "lender", "current"]), notes: ["currency_mapped_to_loan_amount"] };
      }

      if (includesAny(combined, ["debt service", "loan payment", "monthly payment", "repayment"])) {
        return { metric: "debt_service", confidence: 0.84, period: includesAny(combined, ["annual", "yearly"]) ? "year" : "month", notes: ["currency_mapped_to_debt_service"] };
      }

      if (includesAny(combined, ["grant", "funding", "contribution", "award"])) {
        return { metric: "grant_amount", confidence: 0.82, verificationRequired: true, notes: ["currency_mapped_to_grant_amount"] };
      }

      if (includesAny(combined, ["price", "fee", "subscription", "charge", "per seat", "per user", "monthly fee", "annual fee"])) {
        return {
          metric: "price",
          confidence: 0.82,
          period: includesAny(combined, ["monthly", "per month"]) ? "month" : includesAny(combined, ["annual", "yearly", "per year"]) ? "year" : null,
          notes: ["currency_mapped_to_price"]
        };
      }

      if (includesAny(combined, ["cac", "customer acquisition"])) {
        return { metric: "CAC", confidence: 0.86, notes: ["currency_mapped_to_CAC"] };
      }

      if (includesAny(combined, ["ltv", "lifetime value", "clv"])) {
        return { metric: "LTV", confidence: 0.86, notes: ["currency_mapped_to_LTV"] };
      }

      return { metric: "ambiguous_currency_amount", confidence: 0.42, notes: ["currency_metric_ambiguous"] };
    }

    if (type === "duration") {
      if (includesAny(combined, ["survive", "survival", "stress", "revenue drop", "revenue drops", "ad revenue drops", "decline"])) {
        return { metric: "stress_period", confidence: 0.9, notes: ["duration_mapped_to_stress_period"] };
      }

      if (includesAny(combined, ["runway", "last", "months left", "cash runway"])) {
        return { metric: "runway", confidence: 0.82, notes: ["duration_mapped_to_runway"] };
      }

      return { metric: "claim_period", confidence: 0.62, notes: ["duration_mapped_to_claim_period"] };
    }

    if (type === "count") {
      if (includesAny(combined, ["customers", "subscribers", "users", "clients"])) {
        return { metric: "customer_count", confidence: 0.86, notes: ["count_mapped_to_customer_count"] };
      }

      if (includesAny(combined, ["employees", "staff"])) {
        return { metric: "employee_count", confidence: 0.84, notes: ["count_mapped_to_employee_count"] };
      }
    }

    if (type === "date") {
      if (includesAny(combined, ["deadline", "program closes", "applications close", "closing date", "intake"])) {
        return { metric: "program_deadline", confidence: 0.82, verificationRequired: true, notes: ["date_mapped_to_program_deadline"] };
      }

      return {
        metric: "claim_period",
        confidence: 0.6,
        verificationRequired: includesAny(combined, ["current", "still open", "latest"]),
        notes: ["date_mapped_to_claim_period"]
      };
    }

    return { metric: "unknown", confidence: 0.2, notes: ["metric_not_detected"] };
  }

  detectClaimTargets(input = {}) {
    const text = normalize(input.queryText);
    const metricInputs = Array.isArray(input.metricInputs) ? input.metricInputs : [];
    const targets = [];

    const addTarget = (targetType, description, confidence, commonMetrics = []) => {
      if (targets.some((target) => target.targetType === targetType)) return;

      const attachedMetrics = metricInputs
        .filter((metric) => commonMetrics.includes(metric.metric))
        .map((metric) => metric.metricId);

      targets.push({
        targetId: `fin_claim_${targetType}`,
        targetType,
        description,
        attachedMetrics: uniqueArray(attachedMetrics),
        confidence
      });
    };

    if (includesAny(text, ["compare", "comparison", "trend", "margin trend", "financial health", "financially healthy", "analyze"]) ||
      metricInputs.some((metric) => ["revenue", "net_income", "free_cash_flow", "EBITDA", "gross_margin", "operating_margin"].includes(metric.metric))) {
      addTarget("financial_statement_analysis", "Financial statement, profitability, cash-flow, or metric comparison analysis.", 0.82,
        ["revenue", "net_income", "free_cash_flow", "operating_cash_flow", "EBITDA", "gross_margin", "operating_margin", "debt", "cash", "assets", "liabilities", "equity"]);
    }

    if (includesAny(text, ["survive", "survival", "runway", "cash pressure", "revenue drops", "ad revenue drops", "revenue decline"]) ||
      metricInputs.some((metric) => ["cash_on_hand", "revenue_decline", "stress_period"].includes(metric.metric))) {
      addTarget("business_survival_under_revenue_shock", "Business survival or cash-flow resilience under a revenue shock.", 0.9,
        ["cash_on_hand", "revenue_decline", "stress_period", "monthly_revenue", "monthly_burn", "monthly_fixed_costs", "debt_service"]);
    }

    if (includesAny(text, ["eligible", "eligibility", "grant", "funding", "program", "still open", "deadline"])) {
      addTarget("funding_or_program_eligibility", "Funding, grant, loan-program, or eligibility assessment.", 0.82,
        ["grant_amount", "program_deadline", "employee_count", "annual_revenue"]);
    }

    if (includesAny(text, ["pricing", "subscription", "one-time", "tier", "bundle", "freemium", "seat-based", "usage-based"])) {
      addTarget("pricing_model_assessment", "Pricing model or offer-architecture assessment.", 0.82,
        ["price", "CAC", "LTV", "gross_margin", "churn_rate", "customer_count"]);
    }

    if (includesAny(text, ["unit economics", "cac", "ltv", "payback", "contribution margin", "customer acquisition"])) {
      addTarget("unit_economics_assessment", "Unit economics assessment.", 0.84,
        ["price", "CAC", "LTV", "gross_margin", "churn_rate", "customer_count"]);
    }

    if (includesAny(text, ["loan", "debt", "repayment", "interest rate", "credit", "line of credit"])) {
      addTarget("credit_or_debt_capacity", "Credit, debt-service, or repayment-capacity assessment.", 0.82,
        ["loan_amount", "interest_rate", "debt_service", "cash_on_hand", "monthly_revenue", "monthly_burn"]);
    }

    if (includesAny(text, ["inflation", "interest rates", "bank of canada", "macro", "recession", "credit conditions"])) {
      addTarget("macro_or_market_context", "Macro, market, rate, inflation, or credit-condition context.", 0.78,
        ["interest_rate", "inflation_rate", "claim_period"]);
    }

    return targets;
  }

  process(rawInputs = [], context = {}) { return this.detect(rawInputs, context); }
  execute(rawInputs = [], context = {}) { return this.detect(rawInputs, context); }
  run(rawInputs = [], context = {}) { return this.detect(rawInputs, context); }
  detectMetrics(rawInputs = [], context = {}) { return this.detect(rawInputs, context); }

  static detect(rawInputs = [], context = {}, options = {}) {
    return new FinanceMetricDetector(options).detect(rawInputs, context);
  }
}

module.exports = {
  FinanceMetricDetector
};
