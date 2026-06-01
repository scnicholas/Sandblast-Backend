'use strict';

/**
 * Phase 7 — Benchmark Readiness Gate
 *
 * Purpose:
 * Final go/no-go test for closing this benchmark series.
 */

const {
  evaluateBenchmarkReadiness,
  assertBenchmarkReady,
  buildReadinessFailures
} = require('../../Data/marion/runtime/benchmarking/benchmarkReadinessGate');

describe('Phase 7 — Benchmark Readiness Gate', () => {
  test('evaluates benchmark stack as ready when Phase 6 regression passes', () => {
    const readiness = evaluateBenchmarkReadiness();

    expect(readiness.phase).toBe('phase7');
    expect(readiness.ready).toBe(true);
    expect(readiness.passed).toBe(true);
    expect(readiness.failures).toEqual([]);
    expect(readiness.suiteResult.passed).toBe(true);
  });

  test('assertBenchmarkReady returns readiness object when ready', () => {
    const readiness = assertBenchmarkReady();

    expect(readiness.ready).toBe(true);
    expect(readiness.suiteResult.adaptedMetric.finalAuthority).toBe('Marion');
  });

  test('detects module-load readiness failures', () => {
    const failures = buildReadinessFailures({
      moduleStatus: [{ label: 'badModule', ok: false }],
      phases: Array.from({ length: 7 }, (_, index) => ({ phase: `phase${index + 1}` })),
      scenarioCount: 8,
      controlledBenchmarkSummary: { passed: true },
      adaptedMetric: { finalAuthority: 'Marion' },
      observation: {
        observed: true,
        written: false,
        metric: { finalAuthority: 'Marion' }
      }
    });

    expect(failures.some((item) => item.includes('failed to load'))).toBe(true);
  });

  test('detects Marion authority regression', () => {
    const failures = buildReadinessFailures({
      moduleStatus: [{ label: 'okModule', ok: true }],
      phases: Array.from({ length: 7 }, (_, index) => ({ phase: `phase${index + 1}` })),
      scenarioCount: 8,
      controlledBenchmarkSummary: { passed: true },
      adaptedMetric: { finalAuthority: 'Benchmark' },
      observation: {
        observed: true,
        written: false,
        metric: { finalAuthority: 'Benchmark' }
      }
    });

    expect(failures.some((item) => item.includes('Marion final authority'))).toBe(true);
  });

  test('detects telemetry being written during passive readiness', () => {
    const failures = buildReadinessFailures({
      moduleStatus: [{ label: 'okModule', ok: true }],
      phases: Array.from({ length: 7 }, (_, index) => ({ phase: `phase${index + 1}` })),
      scenarioCount: 8,
      controlledBenchmarkSummary: { passed: true },
      adaptedMetric: { finalAuthority: 'Marion' },
      observation: {
        observed: true,
        written: true,
        metric: { finalAuthority: 'Marion' }
      }
    });

    expect(failures.some((item) => item.includes('wrote telemetry'))).toBe(true);
  });
});
