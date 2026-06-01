'use strict';

/**
 * Phase 1 — Baseline Metrics Smoke Test
 *
 * Location:
 *   tests/benchmarking/phase1-baseline-smoke.test.js
 *
 * Runtime dependency location:
 *   Data/marion/runtime/benchmarking/benchmarkMetrics.js
 *
 * This test stays isolated inside /tests while importing the active benchmarking
 * runtime module from Marion's runtime benchmarking folder.
 */

const {
  createBenchmarkMetric,
  evaluateMetric,
  summarizeMetrics
} = require('../../Data/marion/runtime/benchmarking/benchmarkMetrics');

describe('Phase 1 — Baseline Metrics', () => {
  test('loads the benchmark metrics runtime module', () => {
    expect(typeof createBenchmarkMetric).toBe('function');
    expect(typeof evaluateMetric).toBe('function');
    expect(typeof summarizeMetrics).toBe('function');
  });

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
    expect(metric.intentConfidence).toBe(0.84);
    expect(metric.domainConfidence).toBe(0.78);
    expect(metric.continuityScore).toBe(0.82);
    expect(metric.clarityScore).toBe(0.86);
    expect(metric.authorityScore).toBe(1);
    expect(metric.fallbackTriggered).toBe(false);
    expect(metric.languageDetected).toBe('en');
    expect(metric.translationRequired).toBe(false);
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
      fallbackTriggered: false,
      languageDetected: 'en',
      translationRequired: false,
      finalAuthority: 'Marion'
    });

    const result = evaluateMetric(metric);

    expect(result.scenarioId).toBe('phase1-pass');
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test('flags metrics that fall below critical benchmark thresholds', () => {
    const metric = createBenchmarkMetric({
      scenarioId: 'phase1-threshold-fail',
      phase: 'phase1',
      latencyMs: 4000,
      intentConfidence: 0.40,
      domainConfidence: 0.40,
      continuityScore: 0.40,
      clarityScore: 0.40,
      authorityScore: 0.40,
      fallbackTriggered: true,
      languageDetected: 'en',
      translationRequired: false,
      finalAuthority: 'Marion'
    });

    const result = evaluateMetric(metric);

    expect(result.scenarioId).toBe('phase1-threshold-fail');
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
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
        authorityScore: 1,
        fallbackTriggered: false,
        languageDetected: 'en',
        translationRequired: false,
        finalAuthority: 'Marion'
      }),
      createBenchmarkMetric({
        scenarioId: 'baseline-2',
        phase: 'phase1',
        latencyMs: 1200,
        intentConfidence: 0.82,
        domainConfidence: 0.76,
        continuityScore: 0.79,
        clarityScore: 0.84,
        authorityScore: 1,
        fallbackTriggered: false,
        languageDetected: 'en',
        translationRequired: false,
        finalAuthority: 'Marion'
      })
    ];

    const summary = summarizeMetrics(metrics);

    expect(summary.totalScenarios).toBe(2);
    expect(summary.passedScenarios).toBe(2);
    expect(summary.failedScenarios).toBe(0);
    expect(summary.passed).toBe(true);
    expect(summary.averageLatencyMs).toBe(1000);
    expect(summary.fallbackRate).toBe(0);
  });
});
