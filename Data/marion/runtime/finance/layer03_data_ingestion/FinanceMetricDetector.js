"use strict";

/**
 * R18D Layer 03 — Finance Metric Detector
 * Maps raw extracted values to candidate finance metric types.
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
    return JSON.parse(raw);
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

function uniqueArray(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function includesAny(text, terms = []) {
  const safe = normalize(text);
  return terms.some((term) => safe.includes(normalize(term)));
}

function makeMetricInput(rawInput, metric, options = {}) {
  return {
    metricId: `fin_metric_${metric}_${rawInput.inputId || Math.random().toString(36).slice(2)}`,
    metric,
    rawValue: rawInput.rawValue,
    value: rawInput.detectedValue ?? null,
    unit: rawInput.detectedUnit || null,
    currency: rawInput.detectedCurrency || null,
    period: options.period || null,
    sourceType: rawInput.sourceType || "user_query",
    sourceLabel: rawInput.sourceLabel || "user_query",
    confidence: options.confidence ?? rawInput.confidence ?? 0.6,
    assumptionStatus: options.assumptionStatus || "stated_fact",
    normalizationRequired: rawInput.requiresNormalization !== false,
    verificationRequired: Boolean(options.verificationRequired || rawInput.requiresVerification),
    sourceInputId: rawInput.inputId,
    surroundingText: rawInput.surroundingText || "",
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
    const queryText = context.queryText || context.originalQuery || "";
    const metricInputs = [];
    const usedInputIds = new Set();

    rawInputs.forEach((rawInput) => {
      const metric = this.detectMetricForRawInput(rawInput, queryText, context);

      if (!metric || metric.metric === "unknown") return;

      metricInputs.push(makeMetricInput(rawInput, metric.metric, {
        confidence: metric.confidence,
        period: metric.period || null,
        verificationRequired: metric.verificationRequired,
        notes: metric.notes
      }));

      usedInputIds.add(rawInput.inputId);
    });

    const claimTargets = this.detectClaimTargets({
      queryText,
      metricInputs,
      entityInputs: context.entityInputs || {}
    });

    return {
      metricInputs,
      claimTargets,
      untypedInputs: rawInputs.filter((input) => !usedInputIds.has(input.inputId))
    };
  }

  detectMetricForRawInput(rawInput = {}, queryText = "", context = {}) {
    const surrounding = normalize(rawInput.surroundingText || queryText);
    const combined = `${surrounding} ${normalize(rawInput.rawValue)}`;
    const type = rawInput.inputType;

    if (type === "percentage") {
      if (
        includesAny(combined, ["ad revenue", "revenue", "sales", "income"]) &&
        includesAny(combined, ["drop", "drops", "decline", "declines", "fall", "falls", "shortfall", "loss"])
      ) {
        return {
          metric: "revenue_decline",
          confidence: 0.92,
          notes: ["percentage_mapped_to_revenue_decline"]
        };
      }

      if (includesAny(combined, ["gross margin", "gross profit"])) {
        return {
          metric: "gross_margin",
          confidence: 0.86,
          notes: ["percentage_mapped_to_gross_margin"]
        };
      }

      if (includesAny(combined, ["net margin", "profit margin"])) {
        return {
          metric: "net_margin",
          confidence: 0.84,
          notes: ["percentage_mapped_to_net_margin"]
        };
      }

      if (includesAny(combined, ["churn", "cancellation"])) {
        return {
          metric: "churn_rate",
          confidence: 0.86,
          notes: ["percentage_mapped_to_churn_rate"]
        };
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
        return {
          metric: "inflation_rate",
          confidence: 0.84,
          verificationRequired: true,
          notes: ["percentage_mapped_to_inflation_rate"]
        };
      }

      return {
        metric: "ambiguous_percentage",
        confidence: 0.42,
        notes: ["percentage_metric_ambiguous"]
      };
    }

    if (type === "currency_amount") {
      if (includesAny(combined, ["cash", "cash on hand", "available cash", "cash reserve", "bank balance"])) {
        return {
          metric: "cash_on_hand",
          confidence: 0.91,
          notes: ["currency_mapped_to_cash_on_hand"]
        };
      }

      if (includesAny(combined, ["monthly revenue", "monthly sales", "mrr", "per month", "monthly ad revenue"])) {
        return {
          metric: "monthly_revenue",
          confidence: 0.86,
          period: "month",
          notes: ["currency_mapped_to_monthly_revenue"]
        };
      }

      if (includesAny(combined, ["annual revenue", "yearly revenue", "arr", "per year", "annual sales"])) {
        return {
          metric: "annual_revenue",
          confidence: 0.86,
          period: "year",
          notes: ["currency_mapped_to_annual_revenue"]
        };
      }

      if (includesAny(combined, ["monthly burn", "burn rate", "cash burn", "spend per month", "net burn"])) {
        return {
          metric: "monthly_burn",
          confidence: 0.88,
          period: "month",
          notes: ["currency_mapped_to_monthly_burn"]
        };
      }

      if (includesAny(combined, ["fixed cost", "fixed costs", "overhead", "rent", "base cost", "base costs", "platform cost"])) {
        return {
          metric: "monthly_fixed_costs",
          confidence: 0.78,
          period: includesAny(combined, ["annual", "yearly"]) ? "year" : "month",
          notes: ["currency_mapped_to_fixed_costs"]
        };
      }

      if (includesAny(combined, ["variable cost", "variable costs", "cogs", "cost of sales", "usage cost", "processing fee"])) {
        return {
          metric: "monthly_variable_costs",
          confidence: 0.78,
          period: includesAny(combined, ["annual", "yearly"]) ? "year" : "month",
          notes: ["currency_mapped_to_variable_costs"]
        };
      }

      if (includesAny(combined, ["loan amount", "borrow", "principal", "debt amount", "financing amount"])) {
        return {
          metric: "loan_amount",
          confidence: 0.84,
          verificationRequired: includesAny(combined, ["offered", "lender", "current"]),
          notes: ["currency_mapped_to_loan_amount"]
        };
      }

      if (includesAny(combined, ["debt service", "loan payment", "monthly payment", "repayment"])) {
        return {
          metric: "debt_service",
          confidence: 0.84,
          period: includesAny(combined, ["annual", "yearly"]) ? "year" : "month",
          notes: ["currency_mapped_to_debt_service"]
        };
      }

      if (includesAny(combined, ["grant", "funding", "contribution", "award"])) {
        return {
          metric: "grant_amount",
          confidence: 0.82,
          verificationRequired: true,
          notes: ["currency_mapped_to_grant_amount"]
        };
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
        return {
          metric: "CAC",
          confidence: 0.86,
          notes: ["currency_mapped_to_CAC"]
        };
      }

      if (includesAny(combined, ["ltv", "lifetime value", "clv"])) {
        return {
          metric: "LTV",
          confidence: 0.86,
          notes: ["currency_mapped_to_LTV"]
        };
      }

      return {
        metric: "ambiguous_currency_amount",
        confidence: 0.42,
        notes: ["currency_metric_ambiguous"]
      };
    }

    if (type === "duration") {
      if (includesAny(combined, ["survive", "survival", "stress", "revenue drop", "revenue drops", "ad revenue drops", "decline"])) {
        return {
          metric: "stress_period",
          confidence: 0.9,
          notes: ["duration_mapped_to_stress_period"]
        };
      }

      if (includesAny(combined, ["runway", "last", "months left", "cash runway"])) {
        return {
          metric: "runway",
          confidence: 0.82,
          notes: ["duration_mapped_to_runway"]
        };
      }

      return {
        metric: "claim_period",
        confidence: 0.62,
        notes: ["duration_mapped_to_claim_period"]
      };
    }

    if (type === "count") {
      if (includesAny(combined, ["customers", "subscribers", "users", "clients"])) {
        return {
          metric: "customer_count",
          confidence: 0.86,
          notes: ["count_mapped_to_customer_count"]
        };
      }

      if (includesAny(combined, ["employees", "staff"])) {
        return {
          metric: "employee_count",
          confidence: 0.84,
          notes: ["count_mapped_to_employee_count"]
        };
      }
    }

    if (type === "date") {
      if (includesAny(combined, ["deadline", "program closes", "applications close", "closing date", "intake"])) {
        return {
          metric: "program_deadline",
          confidence: 0.82,
          verificationRequired: true,
          notes: ["date_mapped_to_program_deadline"]
        };
      }

      return {
        metric: "claim_period",
        confidence: 0.6,
        verificationRequired: includesAny(combined, ["current", "still open", "latest"]),
        notes: ["date_mapped_to_claim_period"]
      };
    }

    return {
      metric: "unknown",
      confidence: 0.2,
      notes: ["metric_not_detected"]
    };
  }

  detectClaimTargets(input = {}) {
    const text = normalize(input.queryText);
    const metricInputs = Array.isArray(input.metricInputs) ? input.metricInputs : [];
    const targets = [];

    const addTarget = (targetType, description, confidence, commonMetrics = []) => {
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

    if (
      includesAny(text, ["survive", "survival", "runway", "cash pressure", "revenue drops", "ad revenue drops", "revenue decline"]) ||
      metricInputs.some((metric) => ["cash_on_hand", "revenue_decline", "stress_period"].includes(metric.metric))
    ) {
      addTarget(
        "business_survival_under_revenue_shock",
        "Business survival or cash-flow resilience under a revenue shock.",
        0.9,
        ["cash_on_hand", "revenue_decline", "stress_period", "monthly_revenue", "monthly_burn", "monthly_fixed_costs", "debt_service"]
      );
    }

    if (includesAny(text, ["eligible", "eligibility", "grant", "funding", "program", "still open", "deadline"])) {
      addTarget(
        "funding_or_program_eligibility",
        "Funding, grant, loan-program, or eligibility assessment.",
        0.82,
        ["grant_amount", "program_deadline", "employee_count", "annual_revenue"]
      );
    }

    if (includesAny(text, ["pricing", "subscription", "one-time", "tier", "bundle", "freemium", "seat-based", "usage-based"])) {
      addTarget(
        "pricing_model_assessment",
        "Pricing model or offer-architecture assessment.",
        0.82,
        ["price", "CAC", "LTV", "gross_margin", "churn_rate", "customer_count"]
      );
    }

    if (includesAny(text, ["unit economics", "cac", "ltv", "payback", "contribution margin", "customer acquisition"])) {
      addTarget(
        "unit_economics_assessment",
        "Unit economics assessment.",
        0.84,
        ["price", "CAC", "LTV", "gross_margin", "churn_rate", "customer_count"]
      );
    }

    if (includesAny(text, ["loan", "debt", "repayment", "interest rate", "credit", "line of credit"])) {
      addTarget(
        "credit_or_debt_capacity",
        "Credit, debt-service, or repayment-capacity assessment.",
        0.82,
        ["loan_amount", "interest_rate", "debt_service", "cash_on_hand", "monthly_revenue", "monthly_burn"]
      );
    }

    if (includesAny(text, ["inflation", "interest rates", "bank of canada", "macro", "recession", "credit conditions"])) {
      addTarget(
        "macro_or_market_context",
        "Macro, market, rate, inflation, or credit-condition context.",
        0.78,
        ["interest_rate", "inflation_rate", "claim_period"]
      );
    }

    return targets;
  }

  static detect(rawInputs = [], context = {}, options = {}) {
    return new FinanceMetricDetector(options).detect(rawInputs, context);
  }
}

module.exports = {
  FinanceMetricDetector
};
