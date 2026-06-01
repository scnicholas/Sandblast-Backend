'use strict';

/**
 * Phase 4 — Marion Runtime Observation Hook Smoke Test
 *
 * Test location:
 * tests/benchmarking/
 *
 * Runtime hook location:
 * Data/marion/runtime/benchmarking/
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildObservationPayload,
  observeMarionRuntime,
  observeAndReturnRuntimeOutput
} = require('../../Data/marion/runtime/benchmarking/marionRuntimeObservationHook');

describe('Phase 4 — Marion Runtime Observation Hook', () => {
  test('builds a safe observation payload without requiring live Marion calls', () => {
    const payload = buildObservationPayload({
      scenarioId: 'phase4-observation-smoke',
      phase: 'phase4',
      runtimeOutput: {
        finalAuthority: 'Marion',
        latencyMs: 700,
        intentConfidence: 0.82,
        domainConfidence: 0.76,
        continuityScore: 0.8,
        clarityScore: 0.84,
        languageDetected: 'en'
      }
    });

    expect(payload.scenarioId).toBe('phase4-observation-smoke');
    expect(payload.phase).toBe('phase4');
    expect(payload.finalAuthority).toBe('Marion');
  });

  test('observes runtime output without writing telemetry when disabled', () => {
    const result = observeMarionRuntime({
      scenarioId: 'phase4-observe-no-write',
      phase: 'phase4',
      telemetryEnabled: false,
      runtimeOutput: {
        finalAuthority: 'Marion',
        latencyMs: 800,
        intentConfidence: 0.9,
        domainConfidence: 0.8,
        continuityScore: 0.82,
        clarityScore: 0.86,
        fallbackTriggered: false,
        languageDetected: 'en',
        translationRequired: false
      }
    });

    expect(result.observed).toBe(true);
    expect(result.written).toBe(false);
    expect(result.metric.scenarioId).toBe('phase4-observe-no-write');
    expect(result.metric.finalAuthority).toBe('Marion');
  });

  test('writes telemetry only when explicitly enabled', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sandblast-phase4-observation-')
    );

    const result = observeMarionRuntime({
      scenarioId: 'phase4-observe-write',
      phase: 'phase4',
      telemetryEnabled: true,
      telemetryOptions: {
        telemetryDir: tempDir,
        telemetryFile: 'phase4-observation.jsonl'
      },
      runtimeOutput: {
        finalAuthority: 'Marion',
        latencyMs: 900,
        intentConfidence: 0.88,
        domainConfidence: 0.81,
        continuityScore: 0.83,
        clarityScore: 0.87,
        fallbackTriggered: false,
        languageDetected: 'en',
        translationRequired: false
      }
    });

    expect(result.observed).toBe(true);
    expect(result.written).toBe(true);
    expect(fs.existsSync(result.telemetryFilePath)).toBe(true);

    const content = fs.readFileSync(result.telemetryFilePath, 'utf8');

    expect(content).toContain('phase4-observe-write');
    expect(content).toContain('Marion');
  });

  test('does not mutate the runtime output object', () => {
    const runtimeOutput = {
      finalAuthority: 'Marion',
      latencyMs: 750,
      intentConfidence: 0.8,
      domainConfidence: 0.78,
      continuityScore: 0.79,
      clarityScore: 0.83,
      languageDetected: 'en'
    };

    const before = JSON.stringify(runtimeOutput);

    observeMarionRuntime({
      scenarioId: 'phase4-no-mutation',
      phase: 'phase4',
      telemetryEnabled: false,
      runtimeOutput
    });

    expect(JSON.stringify(runtimeOutput)).toBe(before);
  });

  test('returns original runtime output when used as a passive wrapper', () => {
    const runtimeOutput = {
      text: 'Marion response payload',
      finalAuthority: 'Marion'
    };

    const returned = observeAndReturnRuntimeOutput(runtimeOutput, {
      scenarioId: 'phase4-wrapper-check',
      telemetryEnabled: false
    });

    expect(returned).toBe(runtimeOutput);
  });

  test('fails closed without throwing by default', () => {
    const circular = {};
    circular.self = circular;

    const result = observeMarionRuntime({
      scenarioId: 'phase4-fail-closed',
      telemetryEnabled: true,
      telemetryOptions: {
        telemetryDir: '/invalid\0path',
        telemetryFile: 'bad.jsonl'
      },
      runtimeOutput: circular
    });

    expect(result.observed).toBe(false);
    expect(result.written).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});
