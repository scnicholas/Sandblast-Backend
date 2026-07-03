"use strict";

/**
 * R18D Layer 06 — Finance Ratio Calculator
 * Executes ratio calculations only when required numeric inputs are available.
 *
 * R18C lineage patch:
 * - Aligns ratio numerator/denominator metrics by canonical metric + entity + period.
 * - Prevents cross-period/cross-entity leakage when multiple companies or fiscal years exist.
 * - Preserves legacy method aliases and JSON-safe output shape.
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

function uniqueArray(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
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

function metricPeriod(metric = {}) {
  return metric.period || metric.canonicalPeriod || metric.periodId || null;
}

function metricEntity(metric = {}) {
  return metric.entityId || metric.companyId || metric.company || metric.entity || metric.entityName || null;
}

function sameNormalized(left, right) {
  if (!left || !right) return false;
  return normalizeText(left) === normalizeText(right);
}

class FinanceRatioCalculator {
  calculate(input = {}) {
    const normalizedMetrics = safeArray(input.normalizedMetrics);
    const ratioMap = input.ratioMap || {};
    const candidates = safeArray(ratioMap.ratioCandidates);

    const calculatedRatios = candidates.map((candidate) => {
      return this.calculateCandidate(candidate, normalizedMetrics);
    });

    const directRatios = this.extractDirectRatios({
      directRatios: ratioMap.directlyProvidedRatios,
      normalizedMetrics
    });

    const executableRatios = calculatedRatios.filter((item) => item.executionStatus === "calculated");
    const partialRatios = calculatedRatios.filter((item) => item.executionStatus === "missing_values");

    return {
      ratioResults: {
        resultId: `fin_ratio_results_${Date.now().toString(36)}`,
        calculatedRatios,
        directRatios,
        executableRatios,
        partialRatios,
        unavailableRatios: calculatedRatios.filter((item) => item.executionStatus === "unavailable"),
        executionSummary: {
          calculatedCount: executableRatios.length,
          directRatioCount: directRatios.length,
          partialCount: partialRatios.length,
          unavailableCount: calculatedRatios.filter((item) => item.executionStatus === "unavailable").length
        }
      },
      diagnostics: {
        ok: executableRatios.length > 0 || directRatios.length > 0 || candidates.length === 0,
        warnings:
          candidates.length > 0 && executableRatios.length === 0 && directRatios.length === 0
            ? ["no_ratio_values_calculated"]
            : [],
        errors: [],
        candidateCount: candidates.length,
        calculatedCount: executableRatios.length
      }
    };
  }

  calculateCandidate(candidate = {}, normalizedMetrics = []) {
    const requiredMetrics = safeArray(candidate.requiredMetrics);
    const ratioType = candidate.ratioType || "unknown_ratio";
    const formulaUsed = candidate.formula || null;

    const alignedSet = this.findAlignedMetricSet({
      normalizedMetrics,
      requiredMetrics,
      ratioType
    });

    const matched = requiredMetrics.map((name) => alignedSet.metricsByName[name] || null);
    const missingMetricValues = [];
    const values = {};

    requiredMetrics.forEach((name, index) => {
      const metric = matched[index];
      const value = metric ? toNumber(metric.value) : null;

      if (value === null) missingMetricValues.push(name);
      values[name] = value;
    });

    let resultValue = null;
    let unit = "ratio";

    if (missingMetricValues.length === 0) {
      resultValue = this.compute(ratioType, values);
      if (["gross_margin", "operating_margin", "net_margin", "fcf_margin"].includes(ratioType)) {
        unit = "percent";
        resultValue = resultValue === null ? null : resultValue * 100;
      }
    }

    let executionStatus = "missing_values";
    if (requiredMetrics.length === 0) executionStatus = "unavailable";
    if (missingMetricValues.length === 0 && resultValue !== null) executionStatus = "calculated";

    return {
      ratioExecutionId: `fin_ratio_exec_${stableSlug(ratioType)}`,
      ratioType,
      formula: formulaUsed,
      requiredMetrics,
      sourceMetricIds: uniqueArray(matched.filter(Boolean).map((metric) => metric.normalizedMetricId || metric.metricId)),
      value: round(resultValue, 4),
      unit,
      missingMetricValues,
      executionStatus,
      alignmentContext: {
        entityId: alignedSet.entityId || null,
        period: alignedSet.period || null,
        alignmentStatus: alignedSet.alignmentStatus,
        anchorMetric: alignedSet.anchorMetric || null
      },
      confidence:
        executionStatus === "calculated"
          ? alignedSet.alignmentStatus === "entity_period_aligned" ? 0.9 : 0.82
          : executionStatus === "missing_values"
            ? 0.52
            : 0.35,
      notes: uniqueArray([
        executionStatus === "calculated" ? "ratio_calculated_from_normalized_metrics" : null,
        alignedSet.alignmentStatus === "entity_period_aligned" ? "ratio_inputs_entity_period_aligned" : null,
        alignedSet.alignmentStatus === "entity_aligned" ? "ratio_inputs_entity_aligned_period_partial" : null,
        alignedSet.alignmentStatus === "period_aligned" ? "ratio_inputs_period_aligned_entity_partial" : null,
        missingMetricValues.length > 0 ? "ratio_inputs_missing_values" : null
      ])
    };
  }

  findAlignedMetricSet(options = {}) {
    const normalizedMetrics = safeArray(options.normalizedMetrics);
    const requiredMetrics = safeArray(options.requiredMetrics);
    const ratioType = options.ratioType || "unknown_ratio";

    const matchesByRequired = {};
    requiredMetrics.forEach((name) => {
      matchesByRequired[name] = normalizedMetrics.filter((metric) => {
        return metricName(metric) === name;
      });
    });

    const anchorMetricName = this.anchorMetricForRatio(ratioType, requiredMetrics);
    const anchorCandidates = safeArray(matchesByRequired[anchorMetricName])
      .filter((metric) => toNumber(metric.value) !== null);

    const fallbackAnchors = requiredMetrics.flatMap((name) => {
      return safeArray(matchesByRequired[name]).filter((metric) => toNumber(metric.value) !== null);
    });

    const anchors = anchorCandidates.length > 0 ? anchorCandidates : fallbackAnchors;

    if (anchors.length === 0) {
      return {
        metricsByName: this.bestPartialMetricSet(matchesByRequired, requiredMetrics),
        entityId: null,
        period: null,
        alignmentStatus: "no_numeric_anchor",
        anchorMetric: null
      };
    }

    const scoredSets = anchors.map((anchor) => {
      const metricsByName = {};

      requiredMetrics.forEach((name) => {
        metricsByName[name] = this.findBestMetric(matchesByRequired[name], {
          preferredEntity: metricEntity(anchor),
          preferredPeriod: metricPeriod(anchor)
        });
      });

      const presentCount = requiredMetrics.filter((name) => {
        const metric = metricsByName[name];
        return metric && toNumber(metric.value) !== null;
      }).length;

      const entityAlignedCount = requiredMetrics.filter((name) => {
        const metric = metricsByName[name];
        const anchorEntity = metricEntity(anchor);
        return metric && anchorEntity && sameNormalized(metricEntity(metric), anchorEntity);
      }).length;

      const periodAlignedCount = requiredMetrics.filter((name) => {
        const metric = metricsByName[name];
        const anchorPeriod = metricPeriod(anchor);
        return metric && anchorPeriod && sameNormalized(metricPeriod(metric), anchorPeriod);
      }).length;

      const score =
        presentCount * 100 +
        entityAlignedCount * 12 +
        periodAlignedCount * 12 +
        (metricName(anchor) === anchorMetricName ? 8 : 0);

      return {
        metricsByName,
        anchor,
        score,
        presentCount,
        entityAlignedCount,
        periodAlignedCount
      };
    }).sort((a, b) => b.score - a.score);

    const best = scoredSets[0];
    const entityId = metricEntity(best.anchor) || null;
    const period = metricPeriod(best.anchor) || null;
    const fullyPresent = best.presentCount === requiredMetrics.length;
    const entityAligned = entityId && best.entityAlignedCount === requiredMetrics.length;
    const periodAligned = period && best.periodAlignedCount === requiredMetrics.length;

    return {
      metricsByName: best.metricsByName,
      entityId,
      period,
      alignmentStatus:
        fullyPresent && entityAligned && periodAligned
          ? "entity_period_aligned"
          : fullyPresent && entityAligned
            ? "entity_aligned"
            : fullyPresent && periodAligned
              ? "period_aligned"
              : "partial_alignment",
      anchorMetric: metricName(best.anchor)
    };
  }

  anchorMetricForRatio(ratioType, requiredMetrics = []) {
    const anchors = {
      gross_margin: "gross_profit",
      operating_margin: "operating_income",
      net_margin: "net_income",
      fcf_margin: "free_cash_flow",
      debt_to_equity: "total_debt",
      debt_to_assets: "total_debt",
      asset_liability_coverage: "total_assets",
      cash_to_debt: "cash_and_equivalents",
      valuation_pe_ratio: "market_price"
    };

    return anchors[ratioType] || requiredMetrics[0] || null;
  }

  bestPartialMetricSet(matchesByRequired = {}, requiredMetrics = []) {
    const output = {};

    requiredMetrics.forEach((name) => {
      output[name] = this.findBestMetric(matchesByRequired[name], {});
    });

    return output;
  }

  findBestMetric(metrics = [], preferences = {}) {
    const matches = safeArray(metrics);
    if (matches.length === 0) return null;

    const scored = matches.map((metric, index) => {
      let score = 0;
      if (toNumber(metric.value) !== null) score += 100;
      if (preferences.preferredEntity && sameNormalized(metricEntity(metric), preferences.preferredEntity)) score += 20;
      if (preferences.preferredPeriod && sameNormalized(metricPeriod(metric), preferences.preferredPeriod)) score += 20;
      score -= index * 0.001;

      return { metric, score };
    }).sort((a, b) => b.score - a.score);

    return scored[0].metric;
  }

  compute(ratioType, values = {}) {
    const safeDivide = (numerator, denominator) => {
      if (denominator === 0 || denominator === null || denominator === undefined) return null;
      if (numerator === null || numerator === undefined) return null;
      return numerator / denominator;
    };

    switch (ratioType) {
      case "gross_margin":
        return safeDivide(values.gross_profit, values.revenue);
      case "operating_margin":
        return safeDivide(values.operating_income, values.revenue);
      case "net_margin":
        return safeDivide(values.net_income, values.revenue);
      case "fcf_margin":
        return safeDivide(values.free_cash_flow, values.revenue);
      case "debt_to_equity":
        return safeDivide(values.total_debt, values.shareholders_equity);
      case "debt_to_assets":
        return safeDivide(values.total_debt, values.total_assets);
      case "asset_liability_coverage":
        return safeDivide(values.total_assets, values.total_liabilities);
      case "cash_to_debt":
        return safeDivide(values.cash_and_equivalents, values.total_debt);
      case "valuation_pe_ratio":
        return safeDivide(values.market_price, values.eps);
      default:
        return null;
    }
  }

  extractDirectRatios(input = {}) {
    const directRatioTypes = new Set([
      "gross_margin",
      "operating_margin",
      "ebitda_margin",
      "price_earnings_ratio"
    ]);

    const fromMap = safeArray(input.directRatios).map((item) => ({
      ratioExecutionId: `fin_ratio_direct_exec_${stableSlug(item.ratioType)}`,
      ratioType: item.ratioType,
      value: toNumber(item.value),
      unit: item.unit || null,
      sourceMetricId: item.sourceMetricId || null,
      executionStatus:
        toNumber(item.value) !== null ? "direct_ratio_value_available" : "direct_ratio_value_missing",
      confidence: item.confidence ?? 0.7
    }));

    const fromMetrics = safeArray(input.normalizedMetrics)
      .filter((metric) => directRatioTypes.has(metricName(metric)))
      .map((metric) => ({
        ratioExecutionId: `fin_ratio_direct_exec_${stableSlug(metricName(metric))}`,
        ratioType: metricName(metric),
        value: toNumber(metric.value),
        unit: metric.unit || null,
        sourceMetricId: metric.normalizedMetricId || metric.metricId || null,
        entityId: metricEntity(metric),
        period: metricPeriod(metric),
        executionStatus:
          toNumber(metric.value) !== null ? "direct_ratio_value_available" : "direct_ratio_value_missing",
        confidence: metric.confidence ?? 0.7
      }));

    return [...fromMap, ...fromMetrics];
  }

  calculateRatios(input = {}) { return this.calculate(input); }
  process(input = {}) { return this.calculate(input); }
  execute(input = {}) { return this.calculate(input); }
  run(input = {}) { return this.calculate(input); }

  static calculate(input = {}, options = {}) {
    return new FinanceRatioCalculator(options).calculate(input);
  }
}

module.exports = {
  FinanceRatioCalculator
};
