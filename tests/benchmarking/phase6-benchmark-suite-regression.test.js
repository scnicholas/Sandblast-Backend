'use strict';

/**
 * Phase 6 — Benchmark Suite Regression Aggregator
 *
 * Purpose:
 * Verify that Phases 1–5 can be treated as one coherent benchmark suite
 * before the final readiness gate.
 */

const {
  getBenchmarkModuleLoadStatus,
  allModulesLoaded,
  runBenchmarkSuiteRegression
} = require('../../Data/marion/runtime/benchmarking/benchmarkSuiteAggregator');

const {
  getBenchmarkPhases,
  getRequiredBenchmarkPhases,
  getBenchmarkPhaseById
} = require('../../Data/marion/runtime/benchmarking/benchmarkPhaseRegistry');

describe('Phase 6 — Benchmark Suite Regression Aggregator', () => {
  test('loads all benchmark runtime modules', () => {
    const moduleStatus = getBenchmarkModuleLoadStatus();

    expect(Array.isArray(moduleStatus)).toBe(true);
    expect(moduleStatus.length).toBeGreaterThanOrEqual(8);
    expect(allModulesLoaded(moduleStatus)).toBe(true);
  });

  test('registers all seven benchmark phases', () => {
    const phases = getBenchmarkPhases();
    const required = getRequiredBenchmarkPhases();

    expect(phases.length).toBeGreaterThanOrEqual(7);
    expect(required.length).toBeGreaterThanOrEqual(7);
    expect(getBenchmarkPhaseById('phase6').name).toBe('Benchmark Suite Regression Aggregator');
    expect(getBenchmarkPhaseById('phase7').name).toBe('Benchmark Readiness Gate');
  });

  test('runs the full passive benchmark suite regression', () => {
    const result = runBenchmarkSuiteRegression();

    expect(result.phase).toBe('phase6');
    expect(result.passed).toBe(true);
    expect(result.scenarioCount).toBeGreaterThanOrEqual(8);
    expect(result.controlledBenchmarkSummary.passed).toBe(true);
  });

  test('preserves Marion authority across adapter and observer checks', () => {
    const result = runBenchmarkSuiteRegression();

    expect(result.adaptedMetric.finalAuthority).toBe('Marion');
    expect(result.observation.metric.finalAuthority).toBe('Marion');
  });

  test('keeps observation passive and telemetry disabled by default', () => {
    const result = runBenchmarkSuiteRegression();

    expect(result.observation.observed).toBe(true);
    expect(result.observation.written).toBe(false);
  });
});
