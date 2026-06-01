'use strict';

/**
 * Marion Runtime Observation Hook
 *
 * Phase 4 purpose:
 * Passively observe Marion/Nyx runtime-shaped outputs and convert them into benchmark
 * telemetry without changing live response behavior.
 *
 * Architectural rule:
 * This file must never mutate Marion's response object, alter final authority,
 * block response delivery, call shell commands, or require production secrets.
 *
 * Integration pattern:
 *
 * const { observeMarionRuntime } = require('./benchmarking/marionRuntimeObservationHook');
 *
 * const response = composeMarionResponse(...);
 *
 * observeMarionRuntime({
 *   scenarioId: requestId,
 *   phase: 'phase4',
 *   runtimeOutput: response,
 *   telemetryEnabled: process.env.SB_BENCHMARK_OBSERVE === 'true'
 * });
 *
 * return response;
 */

const {
  adaptRuntimeOutputToBenchmarkMetric
} = require('./benchmarkRuntimeAdapter');

const {
  writeBenchmarkTelemetryRecord
} = require('./benchmarkTelemetryWriter');

const DEFAULT_OBSERVATION_OPTIONS = Object.freeze({
  phase: 'phase4',
  scenarioId: 'marion-runtime-observation',
  telemetryEnabled: false,
  throwOnError: false,
  telemetryOptions: undefined
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeObject(value) {
  return isPlainObject(value) ? value : {};
}

function asBoolean(value, fallback = false) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function cloneShallow(value) {
  return isPlainObject(value) ? { ...value } : {};
}

function buildObservationPayload(options = {}) {
  const safeOptions = safeObject(options);
  const runtimeOutput = safeObject(safeOptions.runtimeOutput);

  const scenarioId =
    safeOptions.scenarioId ||
    runtimeOutput.scenarioId ||
    runtimeOutput.requestId ||
    DEFAULT_OBSERVATION_OPTIONS.scenarioId;

  const phase =
    safeOptions.phase ||
    runtimeOutput.phase ||
    DEFAULT_OBSERVATION_OPTIONS.phase;

  return {
    ...cloneShallow(runtimeOutput),
    scenarioId,
    phase
  };
}

function createObservationResult({
  observed = false,
  written = false,
  metric = null,
  error = null,
  telemetryFilePath = null
} = {}) {
  return {
    observed,
    written,
    metric,
    error,
    telemetryFilePath
  };
}

function observeMarionRuntime(options = {}) {
  const safeOptions = safeObject(options);

  const telemetryEnabled = asBoolean(
    safeOptions.telemetryEnabled,
    DEFAULT_OBSERVATION_OPTIONS.telemetryEnabled
  );

  const throwOnError = asBoolean(
    safeOptions.throwOnError,
    DEFAULT_OBSERVATION_OPTIONS.throwOnError
  );

  try {
    const observationPayload = buildObservationPayload(safeOptions);
    const metric = adaptRuntimeOutputToBenchmarkMetric(observationPayload);

    if (!telemetryEnabled) {
      return createObservationResult({
        observed: true,
        written: false,
        metric
      });
    }

    const writeResult = writeBenchmarkTelemetryRecord(
      metric,
      safeOptions.telemetryOptions
    );

    return createObservationResult({
      observed: true,
      written: Boolean(writeResult && writeResult.written),
      metric,
      telemetryFilePath: writeResult ? writeResult.telemetryFilePath : null
    });
  } catch (error) {
    if (throwOnError) {
      throw error;
    }

    return createObservationResult({
      observed: false,
      written: false,
      metric: null,
      error: error && error.message ? error.message : String(error)
    });
  }
}

function observeAndReturnRuntimeOutput(runtimeOutput, options = {}) {
  observeMarionRuntime({
    ...safeObject(options),
    runtimeOutput
  });

  return runtimeOutput;
}

module.exports = {
  DEFAULT_OBSERVATION_OPTIONS,
  buildObservationPayload,
  observeMarionRuntime,
  observeAndReturnRuntimeOutput
};
