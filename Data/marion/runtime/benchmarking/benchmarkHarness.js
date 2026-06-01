'use strict';

/**
 * Sandblast Benchmark Harness
 *
 * This harness lets you run simulated benchmark passes immediately.
 * Later, replace simulateRuntimeResponse() with calls into Marion/Nyx runtime handlers.
 */

const { createBenchmarkMetric, summarizeMetrics } = require('./benchmarkMetrics');
const { getControlledScenarios } = require('./benchmarkScenarios');

function simulateRuntimeResponse(scenario) {
  const isFallback = Boolean(scenario.expectedSignals && scenario.expectedSignals.fallbackTriggered);
  const isTranslation = Boolean(scenario.expectedSignals && scenario.expectedSignals.translationRequired);

  return {
    scenarioId: scenario.id,
    phase: scenario.phase,
    latencyMs: isTranslation ? 1400 : 850,
    intentConfidence: isFallback ? 0.72 : 0.86,
    domainConfidence: isFallback ? 0.68 : 0.82,
    continuityScore: scenario.category === 'continuity' ? 0.78 : 0.85,
    clarityScore: isFallback ? 0.76 : 0.88,
    authorityScore: 1,
    fallbackTriggered: isFallback,
    languageDetected: scenario.expectedSignals.languageDetected,
    translationRequired: isTranslation,
    finalAuthority: scenario.expectedSignals.finalAuthority,
    notes: 'Simulated benchmark output. Replace with live runtime measurement when integrating.'
  };
}

function runControlledBenchmark(options = {}) {
  const scenarios = options.scenarios || getControlledScenarios();

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
  simulateRuntimeResponse,
  runControlledBenchmark
};
