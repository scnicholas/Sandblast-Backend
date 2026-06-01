'use strict';

/**
 * Benchmark Readiness Gate
 *
 * Phase 7 purpose:
 * Produce a final go/no-go readiness decision for the benchmark stack before
 * moving into the next development series.
 *
 * Architectural rule:
 * This file does not run live Marion traffic, does not write production telemetry,
 * and does not mutate final responses. It only evaluates readiness signals.
 */

const { runBenchmarkSuiteRegression } = require('./benchmarkSuiteAggregator');

const DEFAULT_READINESS_REQUIREMENTS = Object.freeze({
  minimumRequiredPhases: 7,
  minimumScenarioCount: 8,
  requireAllModulesLoaded: true,
  requireControlledBenchmarkPass: true,
  requireMarionFinalAuthority: true,
  requireObservationPassive: true,
  requireTelemetryOptInOnly: true
});

function isMarionAuthority(value) {
  return String(value || '').trim().toLowerCase() === 'marion';
}

function buildReadinessFailures(suiteResult = {}, requirements = DEFAULT_READINESS_REQUIREMENTS) {
  const failures = [];

  const moduleStatus = Array.isArray(suiteResult.moduleStatus) ? suiteResult.moduleStatus : [];
  const phases = Array.isArray(suiteResult.phases) ? suiteResult.phases : [];
  const scenarioCount = Number(suiteResult.scenarioCount) || 0;
  const summary = suiteResult.controlledBenchmarkSummary || {};
  const adaptedMetric = suiteResult.adaptedMetric || {};
  const observation = suiteResult.observation || {};

  if (requirements.requireAllModulesLoaded && !moduleStatus.every((item) => item && item.ok)) {
    failures.push('One or more benchmark modules failed to load.');
  }

  if (phases.length < requirements.minimumRequiredPhases) {
    failures.push(`Expected at least ${requirements.minimumRequiredPhases} benchmark phases.`);
  }

  if (scenarioCount < requirements.minimumScenarioCount) {
    failures.push(`Expected at least ${requirements.minimumScenarioCount} controlled scenarios.`);
  }

  if (requirements.requireControlledBenchmarkPass && summary.passed !== true) {
    failures.push('Controlled benchmark summary did not pass.');
  }

  if (
    requirements.requireMarionFinalAuthority &&
    (!isMarionAuthority(adaptedMetric.finalAuthority) ||
      !observation.metric ||
      !isMarionAuthority(observation.metric.finalAuthority))
  ) {
    failures.push('Marion final authority was not preserved across readiness checks.');
  }

  if (requirements.requireObservationPassive && observation.observed !== true) {
    failures.push('Observation hook did not observe successfully.');
  }

  if (requirements.requireTelemetryOptInOnly && observation.written !== false) {
    failures.push('Observation wrote telemetry when passive mode was expected.');
  }

  return failures;
}

function evaluateBenchmarkReadiness(options = {}) {
  const requirements = {
    ...DEFAULT_READINESS_REQUIREMENTS,
    ...(options.requirements || {})
  };

  const suiteResult = options.suiteResult || runBenchmarkSuiteRegression(options);
  const failures = buildReadinessFailures(suiteResult, requirements);

  return {
    phase: 'phase7',
    name: 'Benchmark Readiness Gate',
    ready: failures.length === 0,
    passed: failures.length === 0,
    failures,
    requirements,
    suiteResult
  };
}

function assertBenchmarkReady(options = {}) {
  const readiness = evaluateBenchmarkReadiness(options);

  if (!readiness.ready) {
    throw new Error(`Benchmark readiness failed: ${readiness.failures.join(' | ')}`);
  }

  return readiness;
}

module.exports = {
  DEFAULT_READINESS_REQUIREMENTS,
  isMarionAuthority,
  buildReadinessFailures,
  evaluateBenchmarkReadiness,
  assertBenchmarkReady
};
