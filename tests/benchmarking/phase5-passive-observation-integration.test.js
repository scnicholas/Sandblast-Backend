'use strict';

/**
 * Phase 5 — Passive Observation Integration Test
 *
 * Purpose:
 * Confirm composeMarionResponse.js and marionBridge.js can coexist with the
 * benchmark observation layer without changing Marion behavior.
 *
 * Architectural boundary:
 * - Runtime files stay in Data/marion/runtime/
 * - Benchmark runtime helpers stay in Data/marion/runtime/benchmarking/
 * - Tests stay in tests/benchmarking/
 * - Observation remains opt-in
 * - Marion final authority is not replaced by benchmarking
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  observeMarionRuntime,
  observeAndReturnRuntimeOutput
} = require('../../Data/marion/runtime/benchmarking/marionRuntimeObservationHook');

describe('Phase 5 — Passive Observation Integration', () => {
  const originalBenchmarkObserve = process.env.SB_BENCHMARK_OBSERVE;

  afterEach(() => {
    if (originalBenchmarkObserve === undefined) {
      delete process.env.SB_BENCHMARK_OBSERVE;
    } else {
      process.env.SB_BENCHMARK_OBSERVE = originalBenchmarkObserve;
    }
  });

  test('loads composeMarionResponse without requiring observation to be enabled', () => {
    const composer = require('../../Data/marion/runtime/composeMarionResponse');

    expect(composer).toBeTruthy();

    const hasCallableExport =
      typeof composer === 'function' ||
      typeof composer.composeMarionResponse === 'function' ||
      typeof composer.run === 'function' ||
      typeof composer.default === 'function';

    expect(hasCallableExport).toBe(true);
  });

  test('loads marionBridge without requiring observation to be enabled', () => {
    const bridge = require('../../Data/marion/runtime/marionBridge');

    expect(bridge).toBeTruthy();

    const hasCallableExport =
      typeof bridge === 'function' ||
      typeof bridge.routeMarion === 'function' ||
      typeof bridge.processWithMarion === 'function' ||
      typeof bridge.processWithMarionUnsafe === 'function' ||
      typeof bridge.default === 'function';

    expect(hasCallableExport).toBe(true);
  });

  test('keeps benchmark observation opt-in when environment flag is not enabled', () => {
    delete process.env.SB_BENCHMARK_OBSERVE;

    const runtimeOutput = {
      scenarioId: 'phase5-opt-in-disabled',
      phase: 'phase5',
      finalAuthority: 'Marion',
      latencyMs: 850,
      intentConfidence: 0.86,
      domainConfidence: 0.8,
      continuityScore: 0.82,
      clarityScore: 0.87,
      fallbackTriggered: false,
      languageDetected: 'en',
      translationRequired: false
    };

    const result = observeMarionRuntime({
      scenarioId: 'phase5-opt-in-disabled',
      phase: 'phase5',
      telemetryEnabled: process.env.SB_BENCHMARK_OBSERVE === 'true',
      runtimeOutput
    });

    expect(result.observed).toBe(true);
    expect(result.written).toBe(false);
    expect(result.metric.finalAuthority).toBe('Marion');
  });

  test('writes telemetry only when SB_BENCHMARK_OBSERVE is explicitly true', () => {
    process.env.SB_BENCHMARK_OBSERVE = 'true';

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sandblast-phase5-observation-')
    );

    const result = observeMarionRuntime({
      scenarioId: 'phase5-opt-in-enabled',
      phase: 'phase5',
      telemetryEnabled: process.env.SB_BENCHMARK_OBSERVE === 'true',
      telemetryOptions: {
        telemetryDir: tempDir,
        telemetryFile: 'phase5-passive-observation.jsonl'
      },
      runtimeOutput: {
        finalAuthority: 'Marion',
        latencyMs: 910,
        intentConfidence: 0.88,
        domainConfidence: 0.82,
        continuityScore: 0.84,
        clarityScore: 0.89,
        fallbackTriggered: false,
        languageDetected: 'en',
        translationRequired: false
      }
    });

    expect(result.observed).toBe(true);
    expect(result.written).toBe(true);
    expect(fs.existsSync(result.telemetryFilePath)).toBe(true);

    const content = fs.readFileSync(result.telemetryFilePath, 'utf8');

    expect(content).toContain('phase5-opt-in-enabled');
    expect(content).toContain('Marion');
  });

  test('returns the original runtime output unchanged through passive wrapper', () => {
    const runtimeOutput = {
      reply: 'This is the final Marion-facing reply.',
      finalAuthority: 'Marion',
      finalEnvelopeTrusted: true,
      metadata: {
        source: 'phase5-passive-wrapper'
      }
    };

    const returned = observeAndReturnRuntimeOutput(runtimeOutput, {
      scenarioId: 'phase5-original-output-preserved',
      phase: 'phase5',
      telemetryEnabled: false
    });

    expect(returned).toBe(runtimeOutput);
    expect(returned.reply).toBe('This is the final Marion-facing reply.');
    expect(returned.finalAuthority).toBe('Marion');
    expect(returned.finalEnvelopeTrusted).toBe(true);
  });

  test('does not replace Marion authority with benchmark authority', () => {
    const result = observeMarionRuntime({
      scenarioId: 'phase5-authority-preservation',
      phase: 'phase5',
      telemetryEnabled: false,
      runtimeOutput: {
        reply: 'Final answer controlled by Marion.',
        finalAuthority: 'Marion',
        authorityScore: 1,
        finalEnvelopeTrusted: true,
        latencyMs: 780,
        intentConfidence: 0.9,
        domainConfidence: 0.84,
        continuityScore: 0.86,
        clarityScore: 0.9,
        languageDetected: 'en'
      }
    });

    expect(result.observed).toBe(true);
    expect(result.metric.finalAuthority).toBe('Marion');
    expect(result.metric.authorityScore).toBeGreaterThanOrEqual(0.9);
  });

  test('keeps public reply surface clean from benchmark diagnostics', () => {
    const runtimeOutput = {
      reply: 'Marion keeps the answer clean and user-facing.',
      finalAuthority: 'Marion',
      finalEnvelopeTrusted: true,
      latencyMs: 700,
      intentConfidence: 0.88,
      domainConfidence: 0.8,
      continuityScore: 0.82,
      clarityScore: 0.9,
      languageDetected: 'en'
    };

    const returned = observeAndReturnRuntimeOutput(runtimeOutput, {
      scenarioId: 'phase5-public-surface-clean',
      phase: 'phase5',
      telemetryEnabled: false
    });

    expect(returned.reply).not.toMatch(/benchmark/i);
    expect(returned.reply).not.toMatch(/telemetry/i);
    expect(returned.reply).not.toMatch(/diagnostic/i);
    expect(returned.reply).toBe('Marion keeps the answer clean and user-facing.');
  });

  test('fails closed if telemetry writing fails during passive integration', () => {
    const result = observeMarionRuntime({
      scenarioId: 'phase5-fail-closed',
      phase: 'phase5',
      telemetryEnabled: true,
      telemetryOptions: {
        telemetryDir: '/invalid\0phase5-path',
        telemetryFile: 'bad.jsonl'
      },
      runtimeOutput: {
        finalAuthority: 'Marion',
        latencyMs: 800
      }
    });

    expect(result.observed).toBe(false);
    expect(result.written).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});
