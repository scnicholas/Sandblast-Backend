'use strict';

/**
 * Sandblast Benchmark Phase Registry
 *
 * Purpose:
 * Keep benchmark phase definitions centralized so the regression suite and
 * readiness gate can validate the same phase map.
 *
 * Architectural rule:
 * This file is data-only. It does not run Marion, write telemetry, or mutate runtime state.
 */

const BENCHMARK_PHASES = Object.freeze([
  Object.freeze({
    phase: 'phase1',
    name: 'Baseline Metrics',
    required: true,
    testFile: 'tests/benchmarking/phase1-baseline-smoke.test.js'
  }),
  Object.freeze({
    phase: 'phase2',
    name: 'Controlled Scenario Testing',
    required: true,
    testFile: 'tests/benchmarking/phase2-controlled-scenarios.test.js'
  }),
  Object.freeze({
    phase: 'phase3',
    name: 'Runtime Adapter + Telemetry Smoke',
    required: true,
    testFile: 'tests/benchmarking/phase3-live-runtime-smoke.test.js'
  }),
  Object.freeze({
    phase: 'phase4',
    name: 'Marion Runtime Observation Hook',
    required: true,
    testFile: 'tests/benchmarking/phase4-marion-runtime-observation-hook.test.js'
  }),
  Object.freeze({
    phase: 'phase5',
    name: 'Passive Observation Integration',
    required: true,
    testFile: 'tests/benchmarking/phase5-passive-observation-integration.test.js'
  }),
  Object.freeze({
    phase: 'phase6',
    name: 'Benchmark Suite Regression Aggregator',
    required: true,
    testFile: 'tests/benchmarking/phase6-benchmark-suite-regression.test.js'
  }),
  Object.freeze({
    phase: 'phase7',
    name: 'Benchmark Readiness Gate',
    required: true,
    testFile: 'tests/benchmarking/phase7-benchmark-readiness-gate.test.js'
  })
]);

function getBenchmarkPhases() {
  return BENCHMARK_PHASES.map((item) => ({ ...item }));
}

function getBenchmarkPhaseById(phase) {
  const key = String(phase || '').trim().toLowerCase();
  const found = BENCHMARK_PHASES.find((item) => item.phase === key);
  return found ? { ...found } : null;
}

function getRequiredBenchmarkPhases() {
  return getBenchmarkPhases().filter((item) => item.required);
}

module.exports = {
  BENCHMARK_PHASES,
  getBenchmarkPhases,
  getBenchmarkPhaseById,
  getRequiredBenchmarkPhases
};
