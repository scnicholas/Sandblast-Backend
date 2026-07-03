"use strict";

/**
 * R18D Layer 06 — Finance Trend Analyzer
 * Computes period-over-period direction when normalized metrics contain numeric values.
 *
 * R18C lineage patch:
 * - Groups trend lines by canonical metric + entity, not metric alone.
 * - Prevents peer values from contaminating trend deltas.
 * - Keeps canonicalMetric stable for existing consumers/tests.
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

function periodValue(metric = {}) {
  return metric.period || metric.canonicalPeriod || metric.periodId || null;
}

function sortPeriodKey(value) {
  const text = String(value || "").toUpperCase();

  const fy = text.match(/FY\s?((?:20|19)\d{2})/);
  if (fy) return Number(fy[1]) * 10;

  const q = text.match(/Q([1-4])\s?((?:20|19)\d{2})/);
  if (q) return Number(q[2]) * 10 + Number(q[1]);

  const year = text.match(/(?:20|19)\d{2}/);
  if (year) return Number(year[0]) * 10;

  if (text === "TTM") return 999999;

  return 0;
}

class FinanceTrendAnalyzer {
  analyze(input = {}) {
    const normalizedMetrics = safeArray(input.normalizedMetrics);
    const grouped = this.groupByMetricAndEntity(normalizedMetrics);

    const trendLines = Object.keys(grouped).map((groupKey) => {
      const group = grouped[groupKey];
      return this.analyzeMetricTrend(group.canonicalMetric, group.metrics, group.entityId);
    });

    const executableTrends = trendLines.filter((line) => line.executionStatus === "trend_calculated");
    const partialTrends = trendLines.filter((line) => line.executionStatus !== "trend_calculated");

    return {
      trendResults: {
        resultId: `fin_trend_results_${Date.now().toString(36)}`,
        trendRequired: this.trendRequired(input),
        trendLines,
        executableTrends,
        partialTrends,
        executionSummary: {
          trendLineCount: trendLines.length,
          calculatedCount: executableTrends.length,
          partialCount: partialTrends.length
        }
      },
      diagnostics: {
        ok: executableTrends.length > 0 || !this.trendRequired(input),
        warnings:
          this.trendRequired(input) && executableTrends.length === 0
            ? ["trend_requested_but_no_numeric_trend_calculated"]
            : [],
        errors: [],
        trendLineCount: trendLines.length
      }
    };
  }

  trendRequired(input = {}) {
    const route = input.analysisPlan && input.analysisPlan.primaryRoute;
    const secondary = safeArray(input.analysisPlan && input.analysisPlan.secondaryRoutes);

    return route === "trend_comparison" ||
      secondary.includes("trend_comparison") ||
      safeArray(input.normalizedPeriods).length >= 2 ||
      /\btrend|over time|year over year|yoy|from|through\b/i.test(String(input.queryText || ""));
  }

  groupByMetricAndEntity(metrics = []) {
    const grouped = {};

    safeArray(metrics).forEach((metric) => {
      const name = metricName(metric);
      if (!name) return;

      const entityId = metricEntity(metric) || "unscoped_entity";
      const groupKey = `${name}::${entityId}`;

      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          canonicalMetric: name,
          entityId,
          metrics: []
        };
      }

      grouped[groupKey].metrics.push(metric);
    });

    return grouped;
  }

  groupByMetric(metrics = []) {
    return this.groupByMetricAndEntity(metrics);
  }

  analyzeMetricTrend(canonicalMetric, metrics = [], entityId = null) {
    const rows = safeArray(metrics)
      .map((metric) => ({
        sourceMetricId: metric.normalizedMetricId || metric.metricId || null,
        entityId: metricEntity(metric) || entityId || null,
        period: periodValue(metric),
        periodSort: sortPeriodKey(periodValue(metric)),
        value: toNumber(metric.value),
        unit: metric.unit || null,
        confidence: metric.confidence ?? 0.6
      }))
      .sort((a, b) => a.periodSort - b.periodSort);

    const numericRows = rows.filter((row) => row.value !== null && row.period);
    const missingValueRows = rows.filter((row) => row.value === null || !row.period);

    if (numericRows.length < 2) {
      return {
        trendId: `fin_trend_${stableSlug(canonicalMetric)}_${stableSlug(entityId || "unscoped")}`,
        canonicalMetric,
        entityId: entityId === "unscoped_entity" ? null : entityId,
        observations: rows,
        startValue: numericRows[0] ? numericRows[0].value : null,
        endValue: null,
        absoluteChange: null,
        percentageChange: null,
        trendDirection: "not_enough_numeric_periods",
        executionStatus: "insufficient_numeric_periods",
        missingObservationCount: missingValueRows.length,
        confidence: 0.42
      };
    }

    const first = numericRows[0];
    const last = numericRows[numericRows.length - 1];
    const absoluteChange = last.value - first.value;
    const percentageChange = first.value === 0 ? null : absoluteChange / Math.abs(first.value) * 100;

    return {
      trendId: `fin_trend_${stableSlug(canonicalMetric)}_${stableSlug(entityId || "unscoped")}`,
      canonicalMetric,
      entityId: entityId === "unscoped_entity" ? null : entityId,
      observations: rows,
      startPeriod: first.period,
      endPeriod: last.period,
      startValue: first.value,
      endValue: last.value,
      absoluteChange: round(absoluteChange, 4),
      percentageChange: round(percentageChange, 4),
      trendDirection: this.direction(absoluteChange),
      executionStatus: "trend_calculated",
      missingObservationCount: missingValueRows.length,
      confidence: 0.82
    };
  }

  direction(delta) {
    if (delta > 0) return "increased";
    if (delta < 0) return "decreased";
    return "flat";
  }

  analyzeTrends(input = {}) { return this.analyze(input); }
  process(input = {}) { return this.analyze(input); }
  execute(input = {}) { return this.analyze(input); }
  run(input = {}) { return this.analyze(input); }

  static analyze(input = {}, options = {}) {
    return new FinanceTrendAnalyzer(options).analyze(input);
  }
}

module.exports = {
  FinanceTrendAnalyzer
};
