'use strict';

const path = require('path');

function loadModule(candidates) {
  const errors = [];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (err) {
      errors.push(`${candidate}: ${err.message}`);
    }
  }

  throw new Error(
    `Unable to load module from candidates:\n${errors.join('\n')}`
  );
}

function pickExport(mod, names) {
  if (typeof mod === 'function') return mod;
  if (mod && typeof mod.default === 'function') return mod.default;

  for (const name of names) {
    if (mod && typeof mod[name] === 'function') {
      return mod[name];
    }
  }

  throw new Error(`Unable to resolve export. Available keys: ${Object.keys(mod || {}).join(', ')}`);
}

function callFirst(target, methodNames, ...args) {
  for (const methodName of methodNames) {
    if (target && typeof target[methodName] === 'function') {
      return target[methodName](...args);
    }
  }

  throw new Error(
    `None of the expected methods exist: ${methodNames.join(', ')}`
  );
}

function collectKeysDeep(value, keys = new Set()) {
  if (!value || typeof value !== 'object') return keys;

  for (const key of Object.keys(value)) {
    keys.add(key);
    collectKeysDeep(value[key], keys);
  }

  return keys;
}

function expectDeepKey(value, possibleKeys) {
  const keys = collectKeysDeep(value);

  const found = possibleKeys.some((key) => keys.has(key));
  expect(found).toBe(true);
}

describe('FinanceDataIngestionController', () => {
  const mod = loadModule([
    '../../../FinanceDataInestionController.js',
    '../../../FinanceDataIngestionController.js',
    '../../../finance/FinanceDataIngestionController.js',
    '../../../finance/layer03_data_ingestion/FinanceDataIngestionController.js',
    '../../../Data/finance/layer03_data_ingestion/FinanceDataIngestionController.js',
    '../../../Data/Domains/finance/layer03_data_ingestion/FinanceDataIngestionController.js',
    '../../../Domains/finance/layer03_data_ingestion/FinanceDataIngestionController.js',
  ]);

  const FinanceDataIngestionController = pickExport(mod, [
    'FinanceDataIngestionController',
    'DataIngestionController',
  ]);

  test('constructs without throwing', () => {
    expect(() => new FinanceDataIngestionController()).not.toThrow();
  });

  test('ingests a raw finance request into a structured envelope', async () => {
    const controller = new FinanceDataIngestionController();

    const result = await callFirst(
      controller,
      ['ingest', 'run', 'execute', 'process', 'processInput'],
      {
        userText:
          'Compare Apple and Microsoft revenue, net income, EBITDA margin, and free cash flow for FY2024. Flag any missing assumptions.',
        sourceType: 'user_prompt',
        domain: 'finance',
      }
    );

    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');

    expectDeepKey(result, [
      'requestId',
      'traceId',
      'schemaVersion',
      'version',
      'envelope',
    ]);

    expectDeepKey(result, [
      'input',
      'normalizedInput',
      'rawInput',
      'sourceType',
    ]);

    expectDeepKey(result, [
      'metrics',
      'detectedMetrics',
      'metricCandidates',
      'financialMetrics',
    ]);

    expectDeepKey(result, [
      'missingInputs',
      'missing',
      'requirements',
      'assumptions',
      'diagnostics',
    ]);
  });

  test('preserves ingestion diagnostics for ambiguous finance requests', async () => {
    const controller = new FinanceDataIngestionController();

    const result = await callFirst(
      controller,
      ['ingest', 'run', 'execute', 'process', 'processInput'],
      {
        userText: 'Is this company healthy financially?',
        sourceType: 'user_prompt',
        domain: 'finance',
      }
    );

    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');

    expectDeepKey(result, [
      'missingInputs',
      'missing',
      'assumptions',
      'warnings',
      'diagnostics',
      'needsClarification',
    ]);
  });

  test('does not silently accept empty input as complete ingestion', async () => {
    const controller = new FinanceDataIngestionController();

    const result = await callFirst(
      controller,
      ['ingest', 'run', 'execute', 'process', 'processInput'],
      {
        userText: '',
        sourceType: 'user_prompt',
        domain: 'finance',
      }
    );

    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');

    expectDeepKey(result, [
      'missingInputs',
      'missing',
      'errors',
      'warnings',
      'diagnostics',
      'valid',
      'ok',
    ]);
  });
});
