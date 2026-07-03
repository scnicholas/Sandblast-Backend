"use strict";

/**
 * R18D Layer 07 — Finance Result Evidence Binder
 * Binds Layer 06 execution outputs to normalized sources, metric lineage,
 * evidence requirements, assumptions, and source metric IDs.
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

function uniqueBy(items = [], keyFn) {
  const seen = new Set();
  const output = [];

  safeArray(items).filter(Boolean).forEach((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });

  return output;
}

function metricName(metric = {}) {
  return metric.canonicalMetric || metric.metric || metric.originalMetric || null;
}

class FinanceResultEvidenceBinder {
  bind(input = {}) {
    const normalizedMetrics = safeArray(input.normalizedMetrics);
    const normalizedSources = safeArray(input.normalizedSources);
    const sourceRequirementMap = safeArray(input.sourceRequirementMap);

    const executionResults = this.collectExecutionResults(input);
    const metricIndex = this.buildMetricIndex(normalizedMetrics);
    const sourceIndex = this.buildSourceIndex(normalizedSources);

    const evidenceBoundResults = executionResults.map((result) => {
      return this.bindOneResult({
        result,
        metricIndex,
        sourceIndex,
        normalizedSources,
        sourceRequirementMap,
        assumptions: input.assumptions
      });
    });

    return {
      boundEvidence: {
        bindingId: `fin_evidence_binding_${Date.now().toString(36)}`,
        evidenceBoundResults,
        byResultType: this.groupByResultType(evidenceBoundResults),
        executionResultCount: executionResults.length,
        boundResultCount: evidenceBoundResults.length
      },
      diagnostics: {
        ok: true,
        warnings:
          evidenceBoundResults.some((item) => item.bindingStatus === "unsupported")
            ? ["some_results_have_no_source_or_metric_lineage"]
            : [],
        errors: [],
        executionResultCount: executionResults.length,
        boundResultCount: evidenceBoundResults.length
      }
    };
  }

  collectExecutionResults(input = {}) {
    const output = [];

    safeArray(input.ratioResults && input.ratioResults.calculatedRatios).forEach((item) => {
      output.push(this.makeResult("ratio", item.ratioType, item, item.sourceMetricIds));
    });

    safeArray(input.ratioResults && input.ratioResults.directRatios).forEach((item) => {
      output.push(this.makeResult("direct_ratio", item.ratioType, item, [item.sourceMetricId]));
    });

    safeArray(input.trendResults && input.trendResults.trendLines).forEach((item) => {
      output.push(
        this.makeResult(
          "trend",
          item.canonicalMetric,
          item,
          safeArray(item.observations).map((row) => row.sourceMetricId)
        )
      );
    });

    safeArray(input.peerComparison && input.peerComparison.metricComparisons).forEach((item) => {
      output.push(
        this.makeResult(
          "peer_comparison",
          item.canonicalMetric,
          item,
          safeArray(item.observations)
            .map((row) => row.metric && row.metric.sourceMetricId)
            .filter(Boolean)
        )
      );
    });

    safeArray(input.scenarioResults && input.scenarioResults.scenarioOutputs).forEach((item) => {
      const sourceMetricIds = [
        item.sourceMetricId,
        item.sourceMetricIds,
        item.lineageContext && item.lineageContext.sourceMetricIds
      ].flat().filter(Boolean);

      output.push(this.makeResult("scenario", item.scenarioType, item, sourceMetricIds));
    });

    safeArray(input.valuationResults && input.valuationResults.valuationChecks).forEach((item) => {
      output.push(this.makeResult("valuation", item.valuationType, item, item.sourceMetricIds));
    });

    return output;
  }

  makeResult(resultType, resultName, payload = {}, sourceMetricIds = []) {
    return {
      resultId:
        payload.ratioExecutionId ||
        payload.trendId ||
        payload.comparisonId ||
        payload.scenarioId ||
        payload.valuationId ||
        `fin_result_${stableSlug(resultType)}_${stableSlug(resultName)}`,
      resultType,
      resultName: resultName || "unknown_result",
      executionStatus: payload.executionStatus || payload.calculationStatus || "unknown",
      value: payload.value ?? null,
      unit: payload.unit || null,
      payload,
      sourceMetricIds: uniqueArray(safeArray(sourceMetricIds).flat())
    };
  }

  buildMetricIndex(metrics = []) {
    const byId = new Map();
    const byMetric = new Map();

    safeArray(metrics).forEach((metric) => {
      const id = metric.normalizedMetricId || metric.metricId;
      if (id) byId.set(id, metric);

      const name = metricName(metric);
      if (name) {
        if (!byMetric.has(name)) byMetric.set(name, []);
        byMetric.get(name).push(metric);
      }
    });

    return { byId, byMetric };
  }

  buildSourceIndex(sources = []) {
    const byId = new Map();
    const byLabel = new Map();
    const byType = new Map();

    safeArray(sources).forEach((source) => {
      if (source.sourceId) byId.set(source.sourceId, source);

      const label = normalizeText(source.sourceLabel);
      if (label) byLabel.set(label, source);

      const type = normalizeText(source.sourceType);
      if (type) {
        if (!byType.has(type)) byType.set(type, []);
        byType.get(type).push(source);
      }
    });

    return { byId, byLabel, byType };
  }

  bindOneResult(options = {}) {
    const result = options.result || {};
    const metricIndex = options.metricIndex || {};
    const sourceIndex = options.sourceIndex || {};
    const normalizedSources = safeArray(options.normalizedSources);
    const sourceRequirementMap = safeArray(options.sourceRequirementMap);

    const sourceMetrics = safeArray(result.sourceMetricIds)
      .map((id) => metricIndex.byId && metricIndex.byId.get(id))
      .filter(Boolean);

    const fallbackMetrics = sourceMetrics.length > 0
      ? []
      : safeArray(metricIndex.byMetric && metricIndex.byMetric.get(result.resultName));

    const allLinkedMetrics = uniqueBy([...sourceMetrics, ...fallbackMetrics], (metric) => {
      return metric.normalizedMetricId || metric.metricId || JSON.stringify(metric);
    });

    const linkedSources = this.resolveSourcesForMetrics({
      metrics: allLinkedMetrics,
      normalizedSources,
      sourceIndex
    });

    const attachedRequirements = sourceRequirementMap.filter((row) => {
      return row.appliesToResultTypes.includes(result.resultType) ||
        row.appliesToResultNames.includes(result.resultName) ||
        row.appliesToResultIds.includes(result.resultId);
    });

    const bindingStatus = this.bindingStatus({
      result,
      linkedMetrics: allLinkedMetrics,
      linkedSources,
      attachedRequirements
    });

    return {
      boundResultId: `fin_bound_${stableSlug(result.resultType)}_${stableSlug(result.resultName)}_${stableSlug(result.resultId)}`,
      resultId: result.resultId,
      resultType: result.resultType,
      resultName: result.resultName,
      executionStatus: result.executionStatus,
      value: result.value,
      unit: result.unit,

      sourceMetricIds: result.sourceMetricIds,
      linkedMetricIds: uniqueArray(
        allLinkedMetrics.map((metric) => metric.normalizedMetricId || metric.metricId)
      ),
      linkedMetrics: allLinkedMetrics.map((metric) => ({
        normalizedMetricId: metric.normalizedMetricId || metric.metricId || null,
        canonicalMetric: metricName(metric),
        period: metric.period || metric.canonicalPeriod || null,
        entityId: metric.entityId || metric.companyId || null,
        sourceType: metric.sourceType || null,
        sourceLabel: metric.sourceLabel || null,
        sourceInputId: metric.sourceInputId || null,
        verificationRequired: Boolean(metric.verificationRequired)
      })),

      linkedSources: linkedSources.map((source) => ({
        sourceId: source.sourceId || null,
        sourceType: source.sourceType || null,
        sourceLabel: source.sourceLabel || null,
        authorityClass: source.authorityClass || "unknown",
        requiresVerification: Boolean(source.requiresVerification)
      })),

      attachedRequirements,
      bindingStatus,
      sourceLineageComplete: allLinkedMetrics.length > 0 && linkedSources.length > 0,
      requiresVerification:
        linkedSources.some((source) => source.requiresVerification === true) ||
        allLinkedMetrics.some((metric) => metric.verificationRequired === true) ||
        attachedRequirements.some((requirement) => requirement.priority === "required")
    };
  }

  resolveSourcesForMetrics(options = {}) {
    const metrics = safeArray(options.metrics);
    const normalizedSources = safeArray(options.normalizedSources);
    const sourceIndex = options.sourceIndex || {};

    const linked = [];

    metrics.forEach((metric) => {
      if (metric.sourceId && sourceIndex.byId && sourceIndex.byId.has(metric.sourceId)) {
        linked.push(sourceIndex.byId.get(metric.sourceId));
      }

      if (metric.sourceLabel && sourceIndex.byLabel) {
        const byLabel = sourceIndex.byLabel.get(normalizeText(metric.sourceLabel));
        if (byLabel) linked.push(byLabel);
      }

      if (metric.sourceType && sourceIndex.byType) {
        linked.push(...safeArray(sourceIndex.byType.get(normalizeText(metric.sourceType))));
      }
    });

    if (linked.length === 0 && normalizedSources.length === 1) {
      linked.push(normalizedSources[0]);
    }

    if (linked.length === 0) {
      linked.push(
        ...normalizedSources.filter((source) => {
          return source.authorityClass === "primary" ||
            source.authorityClass === "secondary" ||
            source.authorityClass === "user_supplied";
        })
      );
    }

    return uniqueBy(linked, (source) => source.sourceId || `${source.sourceType}:${source.sourceLabel}`);
  }

  bindingStatus(options = {}) {
    const linkedMetrics = safeArray(options.linkedMetrics);
    const linkedSources = safeArray(options.linkedSources);
    const attachedRequirements = safeArray(options.attachedRequirements);

    const blockingRequirements = attachedRequirements.filter((requirement) => {
      return requirement.priority === "required" && requirement.blockingWithoutEvidence === true;
    });

    if (blockingRequirements.length > 0 && linkedSources.length === 0) {
      return "blocked_pending_evidence";
    }

    if (linkedMetrics.length > 0 && linkedSources.length > 0) {
      return "bound";
    }

    if (linkedMetrics.length > 0 || linkedSources.length > 0) {
      return "partially_bound";
    }

    return "unsupported";
  }

  groupByResultType(boundResults = []) {
    return safeArray(boundResults).reduce((acc, item) => {
      if (!acc[item.resultType]) acc[item.resultType] = [];
      acc[item.resultType].push(item);
      return acc;
    }, {});
  }

  bindEvidence(input = {}) { return this.bind(input); }
  process(input = {}) { return this.bind(input); }
  execute(input = {}) { return this.bind(input); }
  run(input = {}) { return this.bind(input); }

  static bind(input = {}, options = {}) {
    return new FinanceResultEvidenceBinder(options).bind(input);
  }
}

module.exports = {
  FinanceResultEvidenceBinder
};
