'use strict';

/**
 * Benchmark Suite Regression Aggregator
 *
 * Phase 6 purpose:
 * Validate that the benchmark stack can load and operate as one coherent suite.
 *
 * Architectural rule:
 * This file does not enable production telemetry, does not write files, and does not
 * alter Marion response behavior. It only performs passive checks.
 */

const { getRequiredBenchmarkPhases } = require('./benchmarkPhaseRegistry');
const { getControlledScenarios } = require('./benchmarkScenarios');
const { runControlledBenchmark } = require('./benchmarkHarness');
const { adaptRuntimeOutputToBenchmarkMetric } = require('./benchmarkRuntimeAdapter');
const { observeMarionRuntime } = require('./marionRuntimeObservationHook');

function safeRequire(label, loader) {
  try {
    const mod = loader();
    return {
      label,
      ok: Boolean(mod),
      error: ''
    };
  } catch (error) {
    return {
      label,
      ok: false,
      error: error && error.message ? error.message : String(error)
    };
  }
}

function getBenchmarkModuleLoadStatus() {
  return [
    safeRequire('benchmarkMetrics', () => require('./benchmarkMetrics')),
    safeRequire('benchmarkScenarios', () => require('./benchmarkScenarios')),
    safeRequire('benchmarkHarness', () => require('./benchmarkHarness')),
    safeRequire('benchmarkReporter', () => require('./benchmarkReporter')),
    safeRequire('benchmarkRuntimeAdapter', () => require('./benchmarkRuntimeAdapter')),
    safeRequire('benchmarkTelemetryWriter', () => require('./benchmarkTelemetryWriter')),
    safeRequire('marionRuntimeObservationHook', () => require('./marionRuntimeObservationHook')),
    safeRequire('benchmarkPhaseRegistry', () => require('./benchmarkPhaseRegistry'))
  ];
}

function allModulesLoaded(moduleStatus = []) {
  return Array.isArray(moduleStatus) && moduleStatus.length > 0 && moduleStatus.every((item) => item.ok);
}

function runBenchmarkSuiteRegression(options = {}) {
  const moduleStatus = getBenchmarkModuleLoadStatus();
  const phases = getRequiredBenchmarkPhases();
  const scenarios = getControlledScenarios();

  const controlledBenchmark = runControlledBenchmark({
    scenarios,
    thresholds: options.thresholds
  });

  const adaptedMetric = adaptRuntimeOutputToBenchmarkMetric({
    scenarioId: 'phase6-suite-adapter-check',
    phase: 'phase6',
    finalAuthority: 'Marion',
    latencyMs: 875,
    intentConfidence: 0.88,
    domainConfidence: 0.82,
    continuityScore: 0.84,
    clarityScore: 0.89,
    fallbackTriggered: false,
    languageDetected: 'en',
    translationRequired: false
  });

  const observation = observeMarionRuntime({
    scenarioId: 'phase6-suite-observation-check',
    phase: 'phase6',
    telemetryEnabled: false,
    runtimeOutput: {
      finalAuthority: 'Marion',
      latencyMs: 910,
      intentConfidence: 0.86,
      domainConfidence: 0.8,
      continuityScore: 0.82,
      clarityScore: 0.87,
      fallbackTriggered: false,
      languageDetected: 'en',
      translationRequired: false
    }
  });

  const passed =
    allModulesLoaded(moduleStatus) &&
    phases.length >= 7 &&
    scenarios.length >= 8 &&
    controlledBenchmark.summary &&
    controlledBenchmark.summary.passed === true &&
    adaptedMetric.finalAuthority === 'Marion' &&
    observation.observed === true &&
    observation.written === false &&
    observation.metric &&
    observation.metric.finalAuthority === 'Marion';

  return {
    phase: 'phase6',
    name: 'Benchmark Suite Regression Aggregator',
    passed,
    moduleStatus,
    phases,
    scenarioCount: scenarios.length,
    controlledBenchmarkSummary: controlledBenchmark.summary,
    adaptedMetric,
    observation
  };
}

module.exports = {
  safeRequire,
  getBenchmarkModuleLoadStatus,
  allModulesLoaded,
  runBenchmarkSuiteRegression
};
