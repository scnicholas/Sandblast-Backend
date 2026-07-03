"use strict";

/**
 * R18D Layer 06 — Finance Peer Comparator
 * Aligns normalized metrics across companies/entities and reports comparison readiness.
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

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const parsed = Number(String(value).replace(/,/g, "").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, decimals = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function metricName(metric = {}) {
  return metric.canonicalMetric || metric.metric || metric.originalMetric || null;
}

function metricEntity(metric = {}) {
  return metric.entityId || metric.companyId || metric.company || metric.entity || metric.entityName || null;
}

class FinancePeerComparator {
  compare(input = {}) {
    const normalizedMetrics = safeArray(input.normalizedMetrics);
    const companies = safeArray(input.normalizedEntities && input.normalizedEntities.companies);
    const peerRequired = this.peerRequired(input);

    const comparisonMatrix = this.buildMatrix(normalizedMetrics, companies);
    const metricComparisons = this.compareMetrics(comparisonMatrix);

    const executableComparisons = metricComparisons.filter((item) => item.executionStatus === "comparison_calculated");
    const partialComparisons = metricComparisons.filter((item) => item.executionStatus !== "comparison_calculated");

    return {
      peerComparison: {
        resultId: `fin_peer_comparison_${Date.now().toString(36)}`,
        peerRequired,
        companies,
        comparisonMatrix,
        metricComparisons,
        executableComparisons,
        partialComparisons,
        executionSummary: {
          companyCount: companies.length,
          metricComparisonCount: metricComparisons.length,
          calculatedCount: executableComparisons.length,
          partialCount: partialComparisons.length
        }
      },
      diagnostics: {
        ok: executableComparisons.length > 0 || !peerRequired,
        warnings:
          peerRequired && executableComparisons.length === 0
            ? ["peer_comparison_requested_but_no_numeric_peer_comparison_calculated"]
            : [],
        errors: [],
        companyCount: companies.length,
        comparisonCount: metricComparisons.length
      }
    };
  }

  peerRequired(input = {}) {
    const plan = input.analysisPlan || {};
    const secondary = safeArray(plan.secondaryRoutes);

    return plan.primaryRoute === "peer_comparison" ||
      secondary.includes("peer_comparison") ||
      safeArray(input.normalizedEntities && input.normalizedEntities.companies).length >= 2 ||
      /\bcompare|versus|vs\.?|peer|against\b/i.test(String(input.queryText || ""));
  }

  buildMatrix(metrics = [], companies = []) {
    const companyRows = safeArray(companies).map((company, index) => ({
      companyKey: company.entityId || company.ticker || company.canonicalName || `company_${index + 1}`,
      canonicalName: company.canonicalName || company.originalName || `Company ${index + 1}`,
      ticker: company.ticker || null,
      metrics: {}
    }));

    const fallbackCompany = companyRows.length === 1 ? companyRows[0] : null;

    safeArray(metrics).forEach((metric) => {
      const name = metricName(metric);
      if (!name) return;

      const entityKey = metricEntity(metric);
      let row = companyRows.find((company) => {
        return [company.companyKey, company.canonicalName, company.ticker]
          .filter(Boolean)
          .some((value) => normalizeText(value) === normalizeText(entityKey));
      });

      if (!row && fallbackCompany) row = fallbackCompany;
      if (!row) return;

      row.metrics[name] = {
        sourceMetricId: metric.normalizedMetricId || metric.metricId || null,
        value: toNumber(metric.value),
        unit: metric.unit || null,
        period: metric.period || null,
        confidence: metric.confidence ?? 0.6
      };
    });

    return companyRows;
  }

  compareMetrics(matrix = []) {
    const metricNames = new Set();

    safeArray(matrix).forEach((company) => {
      Object.keys(company.metrics || {}).forEach((name) => metricNames.add(name));
    });

    return Array.from(metricNames).map((name) => {
      const rows = safeArray(matrix)
        .map((company) => ({
          companyKey: company.companyKey,
          canonicalName: company.canonicalName,
          ticker: company.ticker,
          metric: company.metrics[name] || null
        }))
        .filter((row) => row.metric);

      const numericRows = rows.filter((row) => row.metric && row.metric.value !== null);

      if (numericRows.length < 2) {
        return {
          comparisonId: `fin_peer_metric_${stableSlug(name)}`,
          canonicalMetric: name,
          observations: rows,
          leader: null,
          laggard: null,
          spread: null,
          percentageSpread: null,
          executionStatus: "insufficient_peer_numeric_values",
          confidence: 0.45
        };
      }

      const sorted = numericRows.slice().sort((a, b) => b.metric.value - a.metric.value);
      const leader = sorted[0];
      const laggard = sorted[sorted.length - 1];
      const spread = leader.metric.value - laggard.metric.value;
      const percentageSpread = laggard.metric.value === 0 ? null : spread / Math.abs(laggard.metric.value) * 100;

      return {
        comparisonId: `fin_peer_metric_${stableSlug(name)}`,
        canonicalMetric: name,
        observations: rows,
        leader: {
          companyKey: leader.companyKey,
          canonicalName: leader.canonicalName,
          ticker: leader.ticker,
          value: leader.metric.value
        },
        laggard: {
          companyKey: laggard.companyKey,
          canonicalName: laggard.canonicalName,
          ticker: laggard.ticker,
          value: laggard.metric.value
        },
        spread: round(spread, 4),
        percentageSpread: round(percentageSpread, 4),
        executionStatus: "comparison_calculated",
        confidence: 0.8
      };
    });
  }

  comparePeers(input = {}) { return this.compare(input); }
  process(input = {}) { return this.compare(input); }
  execute(input = {}) { return this.compare(input); }
  run(input = {}) { return this.compare(input); }

  static compare(input = {}, options = {}) {
    return new FinancePeerComparator(options).compare(input);
  }
}

module.exports = {
  FinancePeerComparator
};
