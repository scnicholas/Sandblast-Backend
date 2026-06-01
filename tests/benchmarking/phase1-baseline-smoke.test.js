'use strict';

const {
  createBenchmarkMetric,
  evaluateMetric,
  summarizeMetrics
} = require('../../benchmarkMetrics');

describe('Phase 1 — Baseline Metrics', () => {
  test('creates a normalized benchmark metric', () => {
    const metric = createBenchmarkMetric({
      scenarioId: 'phase1-smoke',
      phase: 'phase1',
      latencyMs: 900,
      intentConfidence: 0.84,
      domainConfidence: 0.78,
      continuityScore: 0.82,
      clarityScore: 0.86,
      authorityScore: 1,
      fallbackTriggered: false,
      languageDetected: 'en',
      translationRequired: false,
      finalAuthority: 'Marion'
    });

    expect(metric.scenarioId).toBe('phase1-smoke');
    expect(metric.phase).toBe('phase1');
    expect(metric.latencyMs).toBe(900);
    expect(metric.finalAuthority).toBe('Marion');
  });

  test('evaluates a passing metric against baseline thresholds', () => {
    const metric = createBenchmarkMetric({
      scenarioId: 'phase1-pass',
      phase: 'phase1',
      latencyMs: 1000,
      intentConfidence: 0.90,
      domainConfidence: 0.82,
      continuityScore: 0.80,
      clarityScore: 0.88,
      authorityScore: 1,
      fallbackTriggered: false
    });

    const result = evaluateMetric(metric);

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test('summarizes multiple baseline metrics', () => {
    const metrics = [
      createBenchmarkMetric({
        scenarioId: 'baseline-1',
        phase: 'phase1',
        latencyMs: 800,
        intentConfidence: 0.88,
        domainConfidence: 0.80,
        continuityScore: 0.80,
        clarityScore: 0.88,
        authorityScore: 1
      }),
      createBenchmarkMetric({
        scenarioId: 'baseline-2',
        phase: 'phase1',
        latencyMs: 1200,
        intentConfidence: 0.82,
        domainConfidence: 0.76,
        continuityScore: 0.79,
        clarityScore: 0.84,
        authorityScore: 1
      })
    ];

    const summary = summarizeMetrics(metrics);

    expect(summary.totalScenarios).toBe(2);
    expect(summary.passed).toBe(true);
    expect(summary.averageLatencyMs).toBe(1000);
  });
});
