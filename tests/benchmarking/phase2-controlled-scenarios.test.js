'use strict';

const { getControlledScenarios, getScenarioById } = require('../../benchmarkScenarios');
const { runControlledBenchmark } = require('../../benchmarkHarness');

describe('Phase 2 — Controlled Scenario Testing', () => {
  test('loads controlled scenarios', () => {
    const scenarios = getControlledScenarios();

    expect(Array.isArray(scenarios)).toBe(true);
    expect(scenarios.length).toBeGreaterThanOrEqual(8);
    expect(scenarios.every((scenario) => scenario.id && scenario.prompt)).toBe(true);
  });

  test('finds a scenario by id', () => {
    const scenario = getScenarioById('business-strategy-baseline');

    expect(scenario).not.toBeNull();
    expect(scenario.category).toBe('business_strategy');
    expect(scenario.expectedSignals.finalAuthority).toBe('Marion');
  });

  test('runs the controlled benchmark harness', () => {
    const result = runControlledBenchmark();

    expect(result).toHaveProperty('metrics');
    expect(result).toHaveProperty('summary');
    expect(result.metrics.length).toBeGreaterThanOrEqual(8);
    expect(result.summary.totalScenarios).toBe(result.metrics.length);
  });

  test('keeps Marion as final authority in all controlled scenarios', () => {
    const result = runControlledBenchmark();

    expect(result.metrics.every((metric) => metric.finalAuthority === 'Marion')).toBe(true);
    expect(result.metrics.every((metric) => metric.authorityScore >= 0.90)).toBe(true);
  });
});
