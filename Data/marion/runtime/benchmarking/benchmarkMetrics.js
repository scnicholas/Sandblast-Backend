'use strict';

/**
 * Sandblast Benchmark Metrics
 * Phase 1 foundation file.
 *
 * This module normalizes raw runtime/test observations into stable benchmark metrics.
 * It is intentionally non-invasive and can be used by tests, telemetry, or manual harnesses.
 */

const DEFAULT_THRESHOLDS = Object.freeze({
  maxResponseLatencyMs: 2500,
  minimumIntentConfidence: 0.70,
  minimumDomainConfidence: 0.65,
  minimumContinuityScore: 0.75,
  minimumClarityScore: 0.75,
  minimumAuthorityScore: 0.90,
  maximumFallbackRate: 0.20
});

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, num));
}

function asBoolean(value) {
  return value === true || value === 'true' || value === 1;
}

function normalizeLatency(startTimeMs, endTimeMs) {
  const start = Number(startTimeMs);
  const end = Number(endTimeMs);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  return Math.round(end - start);
}

function createBenchmarkMetric(input = {}) {
  const latencyMs = Number.isFinite(Number(input.latencyMs))
    ? Math.max(0, Math.round(Number(input.latencyMs)))
    : normalizeLatency(input.startTimeMs, input.endTimeMs);

  return {
    scenarioId: String(input.scenarioId || 'unknown-scenario'),
    phase: String(input.phase || 'unknown-phase'),
    timestamp: input.timestamp || new Date().toISOString(),

    latencyMs,

    intentConfidence: clamp01(input.intentConfidence),
    domainConfidence: clamp01(input.domainConfidence),
    continuityScore: clamp01(input.continuityScore),
    clarityScore: clamp01(input.clarityScore),
    authorityScore: clamp01(input.authorityScore, input.finalAuthority === 'Marion' ? 1 : 0),

    fallbackTriggered: asBoolean(input.fallbackTriggered),
    languageDetected: input.languageDetected || 'unknown',
    translationRequired: asBoolean(input.translationRequired),
    finalAuthority: input.finalAuthority || 'Marion',

    notes: input.notes ? String(input.notes) : ''
  };
}

function evaluateMetric(metric, thresholds = DEFAULT_THRESHOLDS) {
  const failures = [];

  if (metric.latencyMs !== null && metric.latencyMs > thresholds.maxResponseLatencyMs) {
    failures.push(`latencyMs exceeded ${thresholds.maxResponseLatencyMs}`);
  }

  if (metric.intentConfidence < thresholds.minimumIntentConfidence) {
    failures.push(`intentConfidence below ${thresholds.minimumIntentConfidence}`);
  }

  if (metric.domainConfidence < thresholds.minimumDomainConfidence) {
    failures.push(`domainConfidence below ${thresholds.minimumDomainConfidence}`);
  }

  if (metric.continuityScore < thresholds.minimumContinuityScore) {
    failures.push(`continuityScore below ${thresholds.minimumContinuityScore}`);
  }

  if (metric.clarityScore < thresholds.minimumClarityScore) {
    failures.push(`clarityScore below ${thresholds.minimumClarityScore}`);
  }

  if (metric.authorityScore < thresholds.minimumAuthorityScore) {
    failures.push(`authorityScore below ${thresholds.minimumAuthorityScore}`);
  }

  return {
    scenarioId: metric.scenarioId,
    passed: failures.length === 0,
    failures
  };
}

function summarizeMetrics(metrics = [], thresholds = DEFAULT_THRESHOLDS) {
  const safeMetrics = Array.isArray(metrics) ? metrics : [];
  const evaluated = safeMetrics.map((metric) => evaluateMetric(metric, thresholds));

  const fallbackCount = safeMetrics.filter((metric) => metric.fallbackTriggered).length;
  const fallbackRate = safeMetrics.length ? fallbackCount / safeMetrics.length : 0;

  const latencyValues = safeMetrics
    .map((metric) => metric.latencyMs)
    .filter((value) => Number.isFinite(value));

  const averageLatencyMs = latencyValues.length
    ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)
    : null;

  const failedScenarios = evaluated.filter((item) => !item.passed);

  return {
    totalScenarios: safeMetrics.length,
    passedScenarios: evaluated.length - failedScenarios.length,
    failedScenarios: failedScenarios.length,
    averageLatencyMs,
    fallbackRate: Number(fallbackRate.toFixed(4)),
    fallbackRatePassed: fallbackRate <= thresholds.maximumFallbackRate,
    passed: failedScenarios.length === 0 && fallbackRate <= thresholds.maximumFallbackRate,
    details: evaluated
  };
}

module.exports = {
  DEFAULT_THRESHOLDS,
  clamp01,
  createBenchmarkMetric,
  evaluateMetric,
  summarizeMetrics
};
