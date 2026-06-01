'use strict';

/**
 * Phase 3 — Live Runtime Smoke Test
 *
 * This test belongs in:
 *
 * tests/benchmarking/
 *
 * Runtime logic belongs in:
 *
 * Data/marion/runtime/benchmarking/
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  adaptRuntimeOutputToBenchmarkMetric,
  resolveRuntimeSignals,
  resolveLatency
} = require('../../Data/marion/runtime/benchmarking/benchmarkRuntimeAdapter');

const {
  writeBenchmarkTelemetryRecord,
  writeBenchmarkTelemetryBatch,
  sanitizeObject
} = require('../../Data/marion/runtime/benchmarking/benchmarkTelemetryWriter');

describe('Phase 3 — Live Runtime Benchmark Wiring', () => {
  test('adapts live runtime-shaped output into a benchmark metric', () => {
    const runtimeOutput = {
      scenarioId: 'phase3-live-runtime-smoke',
      phase: 'phase3',
      latencyMs: 950,
      intentConfidence: 0.88,
      domainConfidence: 0.81,
      continuityScore: 0.83,
      clarityScore: 0.87,
      finalAuthority: 'Marion',
      authorityScore: 1,
      fallbackTriggered: false,
      languageDetected: 'en',
      translationRequired: false
    };

    const metric = adaptRuntimeOutputToBenchmarkMetric(runtimeOutput);

    expect(metric.scenarioId).toBe('phase3-live-runtime-smoke');
    expect(metric.phase).toBe('phase3');
    expect(metric.latencyMs).toBe(950);
    expect(metric.finalAuthority).toBe('Marion');
    expect(metric.authorityScore).toBe(1);
  });

  test('resolves latency from start and end timestamps', () => {
    const latency = resolveLatency({
      startTimeMs: 1000,
      endTimeMs: 1875
    });

    expect(latency).toBe(875);
  });

  test('safely resolves nested runtime telemetry signals', () => {
    const signals = resolveRuntimeSignals({
      requestId: 'nested-runtime-check',
      metadata: {
        phase: 'phase3',
        intentConfidence: 0.79,
        domainConfidence: 0.74
      },
      telemetry: {
        continuityScore: 0.82,
        clarityScore: 0.86,
        fallbackTriggered: false
      },
      language: {
        detected: 'fr',
        translationRequired: true
      },
      authorizedBy: 'Marion'
    });

    expect(signals.scenarioId).toBe('nested-runtime-check');
    expect(signals.phase).toBe('phase3');
    expect(signals.intentConfidence).toBe(0.79);
    expect(signals.domainConfidence).toBe(0.74);
    expect(signals.continuityScore).toBe(0.82);
    expect(signals.clarityScore).toBe(0.86);
    expect(signals.languageDetected).toBe('fr');
    expect(signals.translationRequired).toBe(true);
    expect(signals.finalAuthority).toBe('Marion');
  });

  test('redacts sensitive fields before telemetry writing', () => {
    const sanitized = sanitizeObject({
      scenarioId: 'security-check',
      token: 'should-not-leak',
      apiKey: 'should-not-leak',
      nested: {
        password: 'should-not-leak',
        safeValue: 'visible'
      }
    });

    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.apiKey).toBe('[REDACTED]');
    expect(sanitized.nested.password).toBe('[REDACTED]');
    expect(sanitized.nested.safeValue).toBe('visible');
  });

  test('writes a benchmark telemetry record to a safe test directory', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sandblast-benchmark-')
    );

    const result = writeBenchmarkTelemetryRecord(
      {
        scenarioId: 'phase3-telemetry-write',
        finalAuthority: 'Marion',
        token: 'must-be-redacted'
      },
      {
        telemetryDir: tempDir,
        telemetryFile: 'phase3-test-results.jsonl'
      }
    );

    expect(result.written).toBe(true);
    expect(fs.existsSync(result.telemetryFilePath)).toBe(true);

    const content = fs.readFileSync(result.telemetryFilePath, 'utf8');

    expect(content).toContain('phase3-telemetry-write');
    expect(content).toContain('[REDACTED]');
    expect(content).not.toContain('must-be-redacted');
  });

  test('writes a benchmark telemetry batch', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sandblast-benchmark-batch-')
    );

    const result = writeBenchmarkTelemetryBatch(
      [
        {
          scenarioId: 'batch-1',
          finalAuthority: 'Marion'
        },
        {
          scenarioId: 'batch-2',
          finalAuthority: 'Marion'
        }
      ],
      {
        telemetryDir: tempDir,
        telemetryFile: 'phase3-batch-results.jsonl'
      }
    );

    expect(result.written).toBe(2);

    const content = fs.readFileSync(result.telemetryFilePath, 'utf8');
    const lines = content.trim().split('\n');

    expect(lines.length).toBe(2);
    expect(content).toContain('batch-1');
    expect(content).toContain('batch-2');
  });
});
