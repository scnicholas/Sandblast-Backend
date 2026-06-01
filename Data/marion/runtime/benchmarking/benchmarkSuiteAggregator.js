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
 *
 * Critical Phase 6 adjustment:
 * The controlled benchmark suite intentionally includes fallback scenarios
 * such as unknown-language fallback and ambiguous-request handling. Because
 * those fallbacks are expected behavior, Phase 6 allows a slightly higher
 * suite-level fallback threshold than the stricter default baseline.
 */

const { getRequiredBenchmarkPhases } = require('./benchmarkPhaseRegistry');
const { getControlledScenarios } = require('./benchmarkScenarios');
const { runControlledBenchmark } = require('./benchmarkHarness');
const { adaptRuntimeOutputToBenchmarkMetric } = require('./benchmarkRuntimeAdapter');
const { observeMarionRuntime } = require('./marionRuntimeObservationHook');

const PHASE6_CONTROLLED_BENCHMARK_THRESHOLDS = Object.freeze({
  maxResponseLatencyMs: 2500,
  minimumIntentConfidence: 0.70,
  minimumDomainConfidence: 0.65,
  minimumContinuityScore: 0.75,
  minimumClarityScore: 0.75,
  minimumAuthorityScore: 0.90,
  maximumFallbackRate: 0.30
});

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
  return (
    Array.isArray(moduleStatus) &&
    moduleStatus.length > 0 &&
    moduleStatus.every((item) => item && item.ok === true)
  );
}

function buildPhase6Thresholds(overrides = {}) {
  const safeOverrides =
    overrides && typeof overrides === 'object' && !Array.isArray(overrides)
      ? overrides
      : {};

  return {
    ...PHASE6_CONTROLLED_BENCHMARK_THRESHOLDS,
    ...safeOverrides
  };
}

function getFailedModuleLabels(moduleStatus = []) {
  if (!Array.isArray(moduleStatus)) {
    return [];
  }

  return moduleStatus
    .filter((item) => !item || item.ok !== true)
    .map((item) => (item && item.label ? item.label : 'unknownModule'));
}

function buildSuiteFailureReasons({
  moduleStatus = [],
  phases = [],
  scenarios = [],
  controlledBenchmark = {},
  adaptedMetric = {},
  observation = {}
} = {}) {
  const failures = [];

  if (!allModulesLoaded(moduleStatus)) {
    failures.push(`Benchmark module load failure: ${getFailedModuleLabels(moduleStatus).join(', ')}`);
  }

  if (!Array.isArray(phases) || phases.length < 7) {
    failures.push('Benchmark phase registry does not contain all seven required phases.');
  }

  if (!Array.isArray(scenarios) || scenarios.length < 8) {
    failures.push('Controlled scenario set is below the required minimum of 8 scenarios.');
  }

  if (!controlledBenchmark.summary || controlledBenchmark.summary.passed !== true) {
    const summary = controlledBenchmark.summary || {};
    const fallbackRate =
      typeof summary.fallbackRate === 'number'
        ? ` fallbackRate=${summary.fallbackRate}`
        : '';

    failures.push(`Controlled benchmark summary did not pass.${fallbackRate}`);
  }

  if (adaptedMetric.finalAuthority !== 'Marion') {
    failures.push('Runtime adapter did not preserve Marion final authority.');
  }

  if (observation.observed !== true) {
    failures.push('Observation hook did not observe successfully.');
  }

  if (observation.written !== false) {
    failures.push('Observation wrote telemetry during passive regression.');
  }

  if (!observation.metric || observation.metric.finalAuthority !== 'Marion') {
    failures.push('Observation metric did not preserve Marion final authority.');
  }

  return failures;
}

function runBenchmarkSuiteRegression(options = {}) {
  const moduleStatus = getBenchmarkModuleLoadStatus();
  const phases = getRequiredBenchmarkPhases();
  const scenarios = getControlledScenarios();
  const thresholds = buildPhase6Thresholds(options.thresholds);

  const controlledBenchmark = runControlledBenchmark({
    scenarios,
    thresholds
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

  const failures = buildSuiteFailureReasons({
    moduleStatus,
    phases,
    scenarios,
    controlledBenchmark,
    adaptedMetric,
    observation
  });

  return {
    phase: 'phase6',
    name: 'Benchmark Suite Regression Aggregator',
    passed: failures.length === 0,
    failures,
    moduleStatus,
    phases,
    scenarioCount: scenarios.length,
    thresholds,
    controlledBenchmarkSummary: controlledBenchmark.summary,
    adaptedMetric,
    observation
  };
}

module.exports = {
  PHASE6_CONTROLLED_BENCHMARK_THRESHOLDS,
  safeRequire,
  getBenchmarkModuleLoadStatus,
  allModulesLoaded,
  buildPhase6Thresholds,
  getFailedModuleLabels,
  buildSuiteFailureReasons,
  runBenchmarkSuiteRegression
};
