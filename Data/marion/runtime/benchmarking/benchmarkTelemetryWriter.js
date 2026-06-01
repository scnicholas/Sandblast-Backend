'use strict';

/**
 * Sandblast Benchmark Telemetry Writer
 *
 * Phase 3 purpose:
 * Safely write benchmark telemetry snapshots without interfering with live Marion runtime.
 *
 * Security/integrity rules:
 * - No arbitrary path writes.
 * - No shell execution.
 * - No secret capture.
 * - Writes only JSONL benchmark records.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_TELEMETRY_DIR = path.join(
  process.cwd(),
  'Data',
  'marion',
  'runtime',
  'benchmarking',
  'telemetry'
);

const DEFAULT_TELEMETRY_FILE = 'benchmark-results.jsonl';

const BLOCKED_KEYS = new Set([
  'token',
  'apiKey',
  'apikey',
  'api_key',
  'authorization',
  'password',
  'secret',
  'cookie',
  'session',
  'bearer'
]);

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === 'object') {
    return sanitizeObject(value);
  }

  return value;
}

function sanitizeObject(input = {}) {
  const output = {};

  Object.entries(input).forEach(([key, value]) => {
    const normalizedKey = String(key).toLowerCase();

    if (BLOCKED_KEYS.has(normalizedKey)) {
      output[key] = '[REDACTED]';
      return;
    }

    output[key] = sanitizeValue(value);
  });

  return output;
}

function resolveTelemetryFilePath(options = {}) {
  const telemetryDir = options.telemetryDir || DEFAULT_TELEMETRY_DIR;
  const telemetryFile = options.telemetryFile || DEFAULT_TELEMETRY_FILE;

  const resolvedDir = path.resolve(telemetryDir);
  const resolvedFile = path.resolve(resolvedDir, telemetryFile);

  if (!resolvedFile.startsWith(resolvedDir)) {
    throw new Error('Invalid telemetry file path: attempted path escape.');
  }

  return {
    telemetryDir: resolvedDir,
    telemetryFilePath: resolvedFile
  };
}

function writeBenchmarkTelemetryRecord(record = {}, options = {}) {
  const { telemetryDir, telemetryFilePath } = resolveTelemetryFilePath(options);

  ensureDirectory(telemetryDir);

  const safeRecord = sanitizeObject({
    timestamp: new Date().toISOString(),
    type: 'benchmark_metric',
    ...record
  });

  fs.appendFileSync(
    telemetryFilePath,
    `${JSON.stringify(safeRecord)}\n`,
    'utf8'
  );

  return {
    written: true,
    telemetryFilePath
  };
}

function writeBenchmarkTelemetryBatch(records = [], options = {}) {
  if (!Array.isArray(records)) {
    throw new TypeError('writeBenchmarkTelemetryBatch expected records to be an array.');
  }

  const results = records.map((record) =>
    writeBenchmarkTelemetryRecord(record, options)
  );

  return {
    written: results.length,
    telemetryFilePath: results[0] ? results[0].telemetryFilePath : null
  };
}

module.exports = {
  DEFAULT_TELEMETRY_DIR,
  DEFAULT_TELEMETRY_FILE,
  sanitizeObject,
  resolveTelemetryFilePath,
  writeBenchmarkTelemetryRecord,
  writeBenchmarkTelemetryBatch
};
