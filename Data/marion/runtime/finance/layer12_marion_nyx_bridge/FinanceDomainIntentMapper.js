"use strict";

/**
 * R18D Layer 12 — Finance Domain Intent Mapper
 * Determines whether a Marion/Nyx request should route into the finance domain.
 *
 * No external dependencies.
 */

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function uniqueArray(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

class FinanceDomainIntentMapper {
  constructor(options = {}) {
    this.minRouteConfidence = typeof options.minRouteConfidence === "number"
      ? options.minRouteConfidence
      : 0.42;
  }

  map(input = {}) {
    const queryContext = input.queryContext || {};

    const originalQuery = firstValue(
      input.originalQuery,
      input.query,
      input.userText,
      input.rawInput,
      input.message,
      input.text,
      queryContext.originalQuery,
      queryContext.normalizedQuery,
      ""
    );

    const normalizedQuery = input.normalizedQuery || normalizeText(originalQuery);

    const signals = this.detectSignals(normalizedQuery, input);
    const rejectedSignals = this.detectRejectedSignals(normalizedQuery, input);
    const intent = this.resolveIntent(signals, normalizedQuery);
    const confidence = this.calculateConfidence(signals, rejectedSignals, input);
    const shouldRouteToFinance =
      confidence >= this.minRouteConfidence &&
      signals.length > 0 &&
      rejectedSignals.length === 0;

    const routeReason = shouldRouteToFinance
      ? `finance_route:${intent}`
      : rejectedSignals.length > 0
        ? `finance_route_rejected:${rejectedSignals[0]}`
        : "finance_route_not_confident";

    return {
      decisionId: `fin_domain_decision_${Date.now().toString(36)}`,
      domain: "finance",
      runtimeLayer: "layer12_marion_nyx_bridge",
      originalQuery,
      normalizedQuery,
      intent,
      shouldRouteToFinance,
      confidence,
      matchedSignals: signals,
      rejectedSignals,
      routeReason,
      diagnostics: {
        ok: true,
        warnings: shouldRouteToFinance ? [] : ["finance_route_not_selected"],
        errors: [],
        signalCount: signals.length,
        rejectedSignalCount: rejectedSignals.length,
        threshold: this.minRouteConfidence
      }
    };
  }

  detectSignals(text = "", input = {}) {
    const signals = [];

    const patterns = [
      ["finance_keyword", /\b(finance|financial|financials|valuation|cash flow|cashflow|balance sheet|income statement|profit|loss|margin|revenue|expenses?|costs?|burn rate|runway)\b/],
      ["ratio_metric", /\b(gross margin|net margin|operating margin|ebitda|roi|roe|roa|current ratio|quick ratio|debt to equity|p\/e|price to earnings)\b/],
      ["market_metric", /\b(stock|share price|market cap|ticker|earnings|dividend|eps|enterprise value|ev\/ebitda)\b/],
      ["business_funding", /\b(grant|loan|funding|budget|capitalization|investment|investor|raise|runway|cash burn)\b/],
      ["calculation_request", /\b(calculate|compute|analyze|summarize|compare|forecast|scenario|model)\b/],
      ["money_value", /[$€£]\s?\d+|\b\d+(\.\d+)?\s?(cad|usd|dollars?|million|billion|k|m)\b/],
      ["period_signal", /\b(fy\d{4}|q[1-4]|quarter|year over year|yoy|monthly|annual|ttm)\b/]
    ];

    patterns.forEach(([code, pattern]) => {
      if (pattern.test(text)) signals.push(code);
    });

    if (input.domain === "finance" || input.requestedDomain === "finance") {
      signals.push("explicit_finance_domain");
    }

    if (input.finance === true || input.isFinance === true) {
      signals.push("explicit_finance_flag");
    }

    return uniqueArray(signals);
  }

  detectRejectedSignals(text = "", input = {}) {
    const rejected = [];

    const nonFinancePatterns = [
      ["medical_health_query", /\b(symptom|diagnosis|medicine|doctor|hospital|treatment|prescription)\b/],
      ["legal_primary_query", /\b(lawsuit|contract clause|court|statute|legal advice|lawyer)\b/],
      ["cyber_primary_query", /\b(malware|phishing|firewall|exploit|vulnerability|ransomware)\b/],
      ["creative_primary_query", /\b(write a poem|song lyrics|story|screenplay|character)\b/]
    ];

    nonFinancePatterns.forEach(([code, pattern]) => {
      if (pattern.test(text)) rejected.push(code);
    });

    if (input.domain && input.domain !== "finance") {
      rejected.push(`explicit_non_finance_domain:${input.domain}`);
    }

    return uniqueArray(rejected);
  }

  resolveIntent(signals = [], text = "") {
    if (signals.includes("market_metric")) return "finance_market_analysis";
    if (signals.includes("ratio_metric")) return "finance_ratio_analysis";
    if (signals.includes("business_funding")) return "finance_business_funding_analysis";
    if (signals.includes("money_value") && signals.includes("calculation_request")) return "finance_calculation";
    if (signals.includes("finance_keyword")) return "finance_general_analysis";

    return "unknown_or_non_finance";
  }

  calculateConfidence(signals = [], rejectedSignals = [], input = {}) {
    let score = 0;

    const weights = {
      explicit_finance_domain: 0.38,
      explicit_finance_flag: 0.32,
      finance_keyword: 0.2,
      ratio_metric: 0.24,
      market_metric: 0.22,
      business_funding: 0.22,
      calculation_request: 0.12,
      money_value: 0.14,
      period_signal: 0.08
    };

    signals.forEach((signal) => {
      score += weights[signal] || 0.05;
    });

    rejectedSignals.forEach(() => {
      score -= 0.3;
    });

    score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));

    return score;
  }

  detect(input = {}) { return this.map(input); }
  classify(input = {}) { return this.map(input); }
  route(input = {}) { return this.map(input); }
  process(input = {}) { return this.map(input); }
  run(input = {}) { return this.map(input); }

  static map(input = {}, options = {}) {
    return new FinanceDomainIntentMapper(options).map(input);
  }
}

module.exports = {
  FinanceDomainIntentMapper
};
