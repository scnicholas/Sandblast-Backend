'use strict';

/**
 * Phase 2 — Controlled Scenario Testing
 *
 * Runtime path integrity:
 * These imports intentionally point to the benchmarking runtime folder:
 *
 * Data/marion/runtime/benchmarking/
 *
 * Do not revert these imports back to ../../benchmarkScenarios or ../../benchmarkHarness
 * unless the runtime files are moved back to the backend project root.
 */

const {
  getControlledScenarios,
  getScenarioById
} = require('../../Data/marion/runtime/benchmarking/benchmarkScenarios');

const {
  runControlledBenchmark
} = require('../../Data/marion/runtime/benchmarking/benchmarkHarness');

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
    expect(Array.isArray(result.metrics)).toBe(true);
    expect(result.metrics.length).toBeGreaterThanOrEqual(8);
    expect(result.summary.totalScenarios).toBe(result.metrics.length);
  });

  test('keeps Marion as final authority in all controlled scenarios', () => {
    const result = runControlledBenchmark();

    expect(result.metrics.every((metric) => metric.finalAuthority === 'Marion')).toBe(true);
    expect(result.metrics.every((metric) => metric.authorityScore >= 0.90)).toBe(true);
  });

  test('protects controlled scenario source data from mutation', () => {
    const firstRead = getControlledScenarios();

    firstRead[0].id = 'tampered-id';
    firstRead[0].expectedSignals.finalAuthority = 'NotMarion';

    const secondRead = getControlledScenarios();

    expect(secondRead[0].id).toBe('general-chat-baseline');
    expect(secondRead[0].expectedSignals.finalAuthority).toBe('Marion');
  });

  test('supports malformed custom scenario input without crashing', () => {
    const result = runControlledBenchmark({
      scenarios: [
        null,
        {},
        {
          id: 'custom-safe-scenario',
          phase: 'phase2',
          category: 'custom',
          prompt: 'Safe custom benchmark check.',
          expectedSignals: {
            finalAuthority: 'Marion',
            languageDetected: 'en',
            translationRequired: false,
            fallbackTriggered: false
          }
        }
      ]
    });

    expect(result.metrics.length).toBe(3);
    expect(result.summary.totalScenarios).toBe(3);
    expect(result.metrics.every((metric) => metric.finalAuthority === 'Marion')).toBe(true);
  });
});
