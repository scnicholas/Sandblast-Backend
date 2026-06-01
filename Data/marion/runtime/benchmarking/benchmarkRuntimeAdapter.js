'use strict';

/**
 * Sandblast Benchmark Runtime Adapter
 *
 * Phase 3 purpose:
 * Convert live Marion/Nyx-shaped runtime output into the normalized benchmark metric format.
 *
 * Architectural rule:
 * This file does not call Marion directly.
 * It only adapts runtime-shaped output into benchmark-safe metric input.
 */

const { createBenchmarkMetric } = require('./benchmarkMetrics');

const DEFAULT_RUNTIME_BENCHMARK_VALUES = Object.freeze({
  phase: 'phase3',
  finalAuthority: 'Marion',
  languageDetected: 'unknown',
  translationRequired: false,
  fallbackTriggered: false,
  intentConfidence: 0,
  domainConfidence: 0,
  continuityScore: 0,
  clarityScore: 0,
  authorityScore: 1,
  latencyMs: null
});

function asBoolean(value) {
  return value === true || value === 'true' || value === 1;
}

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function pickFirstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function resolveLatency(runtimeOutput = {}) {
  const directLatency = Number(runtimeOutput.latencyMs);

  if (Number.isFinite(directLatency) && directLatency >= 0) {
    return Math.round(directLatency);
  }

  const startTimeMs = Number(runtimeOutput.startTimeMs);
  const endTimeMs = Number(runtimeOutput.endTimeMs);

  if (
    Number.isFinite(startTimeMs) &&
    Number.isFinite(endTimeMs) &&
    endTimeMs >= startTimeMs
  ) {
    return Math.round(endTimeMs - startTimeMs);
  }

  return DEFAULT_RUNTIME_BENCHMARK_VALUES.latencyMs;
}

function resolveFinalAuthority(runtimeOutput = {}) {
  return pickFirstDefined(
    runtimeOutput.finalAuthority,
    runtimeOutput.authority,
    runtimeOutput.authorizedBy,
    DEFAULT_RUNTIME_BENCHMARK_VALUES.finalAuthority
  );
}

function resolveRuntimeSignals(runtimeOutput = {}) {
  const metadata =
    runtimeOutput.metadata && typeof runtimeOutput.metadata === 'object'
      ? runtimeOutput.metadata
      : {};

  const telemetry =
    runtimeOutput.telemetry && typeof runtimeOutput.telemetry === 'object'
      ? runtimeOutput.telemetry
      : {};

  const language =
    runtimeOutput.language && typeof runtimeOutput.language === 'object'
      ? runtimeOutput.language
      : {};

  return {
    scenarioId: String(
      pickFirstDefined(
        runtimeOutput.scenarioId,
        runtimeOutput.requestId,
        metadata.scenarioId,
        telemetry.scenarioId,
        'live-runtime-scenario'
      )
    ),

    phase: String(
      pickFirstDefined(
        runtimeOutput.phase,
        metadata.phase,
        telemetry.phase,
        DEFAULT_RUNTIME_BENCHMARK_VALUES.phase
      )
    ),

    latencyMs: resolveLatency(runtimeOutput),

    intentConfidence: asNumber(
      pickFirstDefined(
        runtimeOutput.intentConfidence,
        metadata.intentConfidence,
        telemetry.intentConfidence,
        DEFAULT_RUNTIME_BENCHMARK_VALUES.intentConfidence
      )
    ),

    domainConfidence: asNumber(
      pickFirstDefined(
        runtimeOutput.domainConfidence,
        metadata.domainConfidence,
        telemetry.domainConfidence,
        DEFAULT_RUNTIME_BENCHMARK_VALUES.domainConfidence
      )
    ),

    continuityScore: asNumber(
      pickFirstDefined(
        runtimeOutput.continuityScore,
        metadata.continuityScore,
        telemetry.continuityScore,
        DEFAULT_RUNTIME_BENCHMARK_VALUES.continuityScore
      )
    ),

    clarityScore: asNumber(
      pickFirstDefined(
        runtimeOutput.clarityScore,
        metadata.clarityScore,
        telemetry.clarityScore,
        DEFAULT_RUNTIME_BENCHMARK_VALUES.clarityScore
      )
    ),

    finalAuthority: resolveFinalAuthority(runtimeOutput),

    authorityScore: asNumber(
      pickFirstDefined(
        runtimeOutput.authorityScore,
        metadata.authorityScore,
        telemetry.authorityScore,
        resolveFinalAuthority(runtimeOutput) === 'Marion' ? 1 : 0
      )
    ),

    fallbackTriggered: asBoolean(
      pickFirstDefined(
        runtimeOutput.fallbackTriggered,
        runtimeOutput.didFallback,
        metadata.fallbackTriggered,
        telemetry.fallbackTriggered,
        DEFAULT_RUNTIME_BENCHMARK_VALUES.fallbackTriggered
      )
    ),

    languageDetected: String(
      pickFirstDefined(
        runtimeOutput.languageDetected,
        language.detected,
        language.languageDetected,
        metadata.languageDetected,
        telemetry.languageDetected,
        DEFAULT_RUNTIME_BENCHMARK_VALUES.languageDetected
      )
    ),

    translationRequired: asBoolean(
      pickFirstDefined(
        runtimeOutput.translationRequired,
        language.translationRequired,
        metadata.translationRequired,
        telemetry.translationRequired,
        DEFAULT_RUNTIME_BENCHMARK_VALUES.translationRequired
      )
    ),

    notes: runtimeOutput.notes ? String(runtimeOutput.notes) : ''
  };
}

function adaptRuntimeOutputToBenchmarkMetric(runtimeOutput = {}) {
  const normalizedSignals = resolveRuntimeSignals(runtimeOutput);
  return createBenchmarkMetric(normalizedSignals);
}

module.exports = {
  DEFAULT_RUNTIME_BENCHMARK_VALUES,
  resolveLatency,
  resolveRuntimeSignals,
  adaptRuntimeOutputToBenchmarkMetric
};
