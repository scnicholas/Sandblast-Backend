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
 *
 * Critical safety rules:
 * - Accepts malformed/null runtime payloads without crashing.
 * - Preserves Marion as the default final authority.
 * - Avoids path access, shell execution, eval, and secret handling.
 * - Keeps benchmark output deterministic and compatible with benchmarkMetrics.js.
 */

const { createBenchmarkMetric } = require('./benchmarkMetrics');

const DEFAULT_RUNTIME_BENCHMARK_VALUES = Object.freeze({
  scenarioId: 'live-runtime-scenario',
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
  latencyMs: 0,
  notes: ''
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeObject(value) {
  return isPlainObject(value) ? value : {};
}

function asBoolean(value, fallback = false) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function asNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;

  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp01(value, fallback = 0) {
  const num = asNumber(value, fallback);
  return Math.max(0, Math.min(1, num));
}

function asSafeString(value, fallback = '') {
  if (value === null || value === undefined) return fallback;

  const text = String(value);
  return text.length ? text : fallback;
}

function pickFirstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function resolveLatency(runtimeOutput = {}) {
  const safeRuntimeOutput = safeObject(runtimeOutput);

  const directLatencyValue = pickFirstDefined(
    safeRuntimeOutput.latencyMs,
    safeRuntimeOutput.responseLatencyMs,
    safeRuntimeOutput.durationMs
  );

  const directLatency = Number(directLatencyValue);

  if (Number.isFinite(directLatency) && directLatency >= 0) {
    return Math.round(directLatency);
  }

  const startTimeMs = Number(
    pickFirstDefined(
      safeRuntimeOutput.startTimeMs,
      safeRuntimeOutput.startedAtMs,
      safeRuntimeOutput.requestStartTimeMs
    )
  );

  const endTimeMs = Number(
    pickFirstDefined(
      safeRuntimeOutput.endTimeMs,
      safeRuntimeOutput.endedAtMs,
      safeRuntimeOutput.responseEndTimeMs
    )
  );

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
  const safeRuntimeOutput = safeObject(runtimeOutput);
  const metadata = safeObject(safeRuntimeOutput.metadata);
  const telemetry = safeObject(safeRuntimeOutput.telemetry);

  const authority = pickFirstDefined(
    safeRuntimeOutput.finalAuthority,
    safeRuntimeOutput.authority,
    safeRuntimeOutput.authorizedBy,
    metadata.finalAuthority,
    metadata.authority,
    metadata.authorizedBy,
    telemetry.finalAuthority,
    telemetry.authority,
    telemetry.authorizedBy,
    DEFAULT_RUNTIME_BENCHMARK_VALUES.finalAuthority
  );

  return asSafeString(authority, DEFAULT_RUNTIME_BENCHMARK_VALUES.finalAuthority);
}

function resolveNestedRuntimeObjects(runtimeOutput = {}) {
  const safeRuntimeOutput = safeObject(runtimeOutput);

  return {
    runtimeOutput: safeRuntimeOutput,
    metadata: safeObject(safeRuntimeOutput.metadata),
    telemetry: safeObject(safeRuntimeOutput.telemetry),
    language: safeObject(safeRuntimeOutput.language),
    translation: safeObject(safeRuntimeOutput.translation),
    domain: safeObject(safeRuntimeOutput.domain),
    intent: safeObject(safeRuntimeOutput.intent),
    continuity: safeObject(safeRuntimeOutput.continuity)
  };
}

function resolveScenarioId(parts) {
  const { runtimeOutput, metadata, telemetry } = parts;

  return asSafeString(
    pickFirstDefined(
      runtimeOutput.scenarioId,
      runtimeOutput.requestId,
      runtimeOutput.id,
      metadata.scenarioId,
      metadata.requestId,
      telemetry.scenarioId,
      telemetry.requestId,
      DEFAULT_RUNTIME_BENCHMARK_VALUES.scenarioId
    ),
    DEFAULT_RUNTIME_BENCHMARK_VALUES.scenarioId
  );
}

function resolvePhase(parts) {
  const { runtimeOutput, metadata, telemetry } = parts;

  return asSafeString(
    pickFirstDefined(
      runtimeOutput.phase,
      metadata.phase,
      telemetry.phase,
      DEFAULT_RUNTIME_BENCHMARK_VALUES.phase
    ),
    DEFAULT_RUNTIME_BENCHMARK_VALUES.phase
  );
}

function resolveRuntimeSignals(runtimeOutput = {}) {
  const parts = resolveNestedRuntimeObjects(runtimeOutput);
  const {
    runtimeOutput: safeRuntimeOutput,
    metadata,
    telemetry,
    language,
    translation,
    domain,
    intent,
    continuity
  } = parts;

  const finalAuthority = resolveFinalAuthority(safeRuntimeOutput);

  const fallbackTriggered = asBoolean(
    pickFirstDefined(
      safeRuntimeOutput.fallbackTriggered,
      safeRuntimeOutput.didFallback,
      safeRuntimeOutput.fallback,
      metadata.fallbackTriggered,
      telemetry.fallbackTriggered,
      DEFAULT_RUNTIME_BENCHMARK_VALUES.fallbackTriggered
    ),
    DEFAULT_RUNTIME_BENCHMARK_VALUES.fallbackTriggered
  );

  const translationRequired = asBoolean(
    pickFirstDefined(
      safeRuntimeOutput.translationRequired,
      language.translationRequired,
      translation.required,
      translation.translationRequired,
      metadata.translationRequired,
      telemetry.translationRequired,
      DEFAULT_RUNTIME_BENCHMARK_VALUES.translationRequired
    ),
    DEFAULT_RUNTIME_BENCHMARK_VALUES.translationRequired
  );

  return {
    scenarioId: resolveScenarioId(parts),
    phase: resolvePhase(parts),

    latencyMs: resolveLatency(safeRuntimeOutput),

    intentConfidence: clamp01(
      pickFirstDefined(
        safeRuntimeOutput.intentConfidence,
        intent.confidence,
        intent.intentConfidence,
        metadata.intentConfidence,
        telemetry.intentConfidence,
        DEFAULT_RUNTIME_BENCHMARK_VALUES.intentConfidence
      ),
      DEFAULT_RUNTIME_BENCHMARK_VALUES.intentConfidence
    ),

    domainConfidence: clamp01(
      pickFirstDefined(
        safeRuntimeOutput.domainConfidence,
        domain.confidence,
        domain.domainConfidence,
        metadata.domainConfidence,
        telemetry.domainConfidence,
        DEFAULT_RUNTIME_BENCHMARK_VALUES.domainConfidence
      ),
      DEFAULT_RUNTIME_BENCHMARK_VALUES.domainConfidence
    ),

    continuityScore: clamp01(
      pickFirstDefined(
        safeRuntimeOutput.continuityScore,
        continuity.score,
        continuity.continuityScore,
        metadata.continuityScore,
        telemetry.continuityScore,
        DEFAULT_RUNTIME_BENCHMARK_VALUES.continuityScore
      ),
      DEFAULT_RUNTIME_BENCHMARK_VALUES.continuityScore
    ),

    clarityScore: clamp01(
      pickFirstDefined(
        safeRuntimeOutput.clarityScore,
        metadata.clarityScore,
        telemetry.clarityScore,
        DEFAULT_RUNTIME_BENCHMARK_VALUES.clarityScore
      ),
      DEFAULT_RUNTIME_BENCHMARK_VALUES.clarityScore
    ),

    finalAuthority,

    authorityScore: clamp01(
      pickFirstDefined(
        safeRuntimeOutput.authorityScore,
        metadata.authorityScore,
        telemetry.authorityScore,
        finalAuthority === 'Marion' ? 1 : 0
      ),
      finalAuthority === 'Marion' ? 1 : 0
    ),

    fallbackTriggered,

    languageDetected: asSafeString(
      pickFirstDefined(
        safeRuntimeOutput.languageDetected,
        language.detected,
        language.languageDetected,
        language.source,
        translation.sourceLanguage,
        metadata.languageDetected,
        telemetry.languageDetected,
        DEFAULT_RUNTIME_BENCHMARK_VALUES.languageDetected
      ),
      DEFAULT_RUNTIME_BENCHMARK_VALUES.languageDetected
    ),

    translationRequired,

    notes: asSafeString(
      pickFirstDefined(
        safeRuntimeOutput.notes,
        metadata.notes,
        telemetry.notes,
        DEFAULT_RUNTIME_BENCHMARK_VALUES.notes
      ),
      DEFAULT_RUNTIME_BENCHMARK_VALUES.notes
    )
  };
}

function adaptRuntimeOutputToBenchmarkMetric(runtimeOutput = {}) {
  const normalizedSignals = resolveRuntimeSignals(runtimeOutput);
  return createBenchmarkMetric(normalizedSignals);
}

module.exports = {
  DEFAULT_RUNTIME_BENCHMARK_VALUES,
  isPlainObject,
  safeObject,
  asBoolean,
  asNumber,
  clamp01,
  pickFirstDefined,
  resolveLatency,
  resolveFinalAuthority,
  resolveRuntimeSignals,
  adaptRuntimeOutputToBenchmarkMetric
};
