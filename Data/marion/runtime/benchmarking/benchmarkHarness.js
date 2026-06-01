'use strict';

/**
 * Sandblast Benchmark Harness
 *
 * Phase 2 runtime-safe benchmark harness.
 *
 * This harness lets you run simulated benchmark passes immediately.
 * Later, replace simulateRuntimeResponse() with calls into Marion/Nyx runtime handlers.
 *
 * Critical integrity rules:
 * - Marion remains final authority.
 * - Scenario input is validated before metric creation.
 * - Missing expectedSignals cannot crash the benchmark.
 * - Runtime simulation remains deterministic for repeatable test results.
 */

const { createBenchmarkMetric, summarizeMetrics } = require('./benchmarkMetrics');
const { getControlledScenarios, normalizeScenario } = require('./benchmarkScenarios');

const DEFAULT_RUNTIME_SIGNALS = Object.freeze({
  finalAuthority: 'Marion',
  languageDetected: 'unknown',
  translationRequired: false,
  fallbackTriggered: false
});

function asBoolean(value) {
  return value === true || value === 'true' || value === 1;
}

function resolveExpectedSignals(scenario = {}) {
  const expectedSignals =
    scenario && typeof scenario.expectedSignals === 'object' && scenario.expectedSignals !== null
      ? scenario.expectedSignals
      : {};

  return {
    finalAuthority: expectedSignals.finalAuthority || DEFAULT_RUNTIME_SIGNALS.finalAuthority,
    languageDetected: expectedSignals.languageDetected || DEFAULT_RUNTIME_SIGNALS.languageDetected,
    translationRequired: asBoolean(expectedSignals.translationRequired),
    fallbackTriggered: asBoolean(expectedSignals.fallbackTriggered)
  };
}

function resolveScenarioCategory(scenario = {}) {
  return scenario && typeof scenario.category === 'string'
    ? scenario.category
    : 'unknown';
}

function simulateRuntimeResponse(inputScenario) {
  const scenario = normalizeScenario(inputScenario);
  const expectedSignals = resolveExpectedSignals(scenario);

  const isFallback = expectedSignals.fallbackTriggered;
  const isTranslation = expectedSignals.translationRequired;
  const category = resolveScenarioCategory(scenario);

  return {
    scenarioId: scenario.id,
    phase: scenario.phase,
    latencyMs: isTranslation ? 1400 : 850,
    intentConfidence: isFallback ? 0.72 : 0.86,
    domainConfidence: isFallback ? 0.68 : 0.82,
    continuityScore: category === 'continuity' ? 0.78 : 0.85,
    clarityScore: isFallback ? 0.76 : 0.88,
    authorityScore: expectedSignals.finalAuthority === 'Marion' ? 1 : 0,
    fallbackTriggered: isFallback,
    languageDetected: expectedSignals.languageDetected,
    translationRequired: isTranslation,
    finalAuthority: expectedSignals.finalAuthority,
    notes: 'Simulated benchmark output. Replace with live runtime measurement when integrating.'
  };
}

function normalizeScenarioList(scenarios) {
  if (!Array.isArray(scenarios)) {
    return getControlledScenarios();
  }

  return scenarios.map((scenario) => normalizeScenario(scenario));
}

function runControlledBenchmark(options = {}) {
  const scenarios = normalizeScenarioList(options.scenarios);

  const metrics = scenarios.map((scenario) => {
    const rawResult = simulateRuntimeResponse(scenario);
    return createBenchmarkMetric(rawResult);
  });

  return {
    metrics,
    summary: summarizeMetrics(metrics, options.thresholds)
  };
}

module.exports = {
  DEFAULT_RUNTIME_SIGNALS,
  resolveExpectedSignals,
  simulateRuntimeResponse,
  runControlledBenchmark
};
