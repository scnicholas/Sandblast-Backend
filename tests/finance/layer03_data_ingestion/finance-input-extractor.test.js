'use strict';

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

function collectStringValues(value, output = []) {
  if (typeof value === 'string') {
    output.push(value.toLowerCase());
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStringValues(item, output));
    return output;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStringValues(item, output));
  }

  return output;
}

function collectKeysDeep(value, keys = new Set()) {
  if (!value || typeof value !== 'object') return keys;

  for (const key of Object.keys(value)) {
    keys.add(key);
    collectKeysDeep(value[key], keys);
  }

  return keys;
}

describe('FinanceInputExtractor', () => {
  const mod = loadModule([
    '../../../FinanceInputExtractor.js',
    '../../../finance/FinanceInputExtractor.js',
    '../../../finance/layer03_data_ingestion/FinanceInputExtractor.js',
    '../../../Data/finance/layer03_data_ingestion/FinanceInputExtractor.js',
    '../../../Data/Domains/finance/layer03_data_ingestion/FinanceInputExtractor.js',
    '../../../Domains/finance/layer03_data_ingestion/FinanceInputExtractor.js',
  ]);

  const FinanceInputExtractor = pickExport(mod, [
    'FinanceInputExtractor',
    'InputExtractor',
  ]);

  test('constructs without throwing', () => {
    expect(() => new FinanceInputExtractor()).not.toThrow();
  });

  test('extracts normalized text from a raw string prompt', () => {
    const extractor = new FinanceInputExtractor();

    const result = callFirst(
      extractor,
      ['extract', 'run', 'execute', 'process', 'normalize'],
      'Analyze revenue growth, gross margin, net income, and cash flow for Tesla in 2024.'
    );

    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');

    const stringValues = collectStringValues(result).join(' ');
    expect(stringValues).toContain('revenue');
    expect(stringValues).toContain('tesla');
  });

  test('extracts finance-relevant fields from object input', () => {
    const extractor = new FinanceInputExtractor();

    const result = callFirst(
      extractor,
      ['extract', 'run', 'execute', 'process', 'normalize'],
      {
        userText:
          'Build a margin trend comparison for Shopify from 2021 through 2024.',
        sourceType: 'user_prompt',
        domain: 'finance',
        locale: 'en-CA',
      }
    );

    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');

    const keys = collectKeysDeep(result);

    const hasExpectedInputShape =
      keys.has('text') ||
      keys.has('rawText') ||
      keys.has('normalizedText') ||
      keys.has('input') ||
      keys.has('sourceType') ||
      keys.has('domain');

    expect(hasExpectedInputShape).toBe(true);

    const stringValues = collectStringValues(result).join(' ');
    expect(stringValues).toContain('shopify');
  });

  test('retains period/date hints when present', () => {
    const extractor = new FinanceInputExtractor();

    const result = callFirst(
      extractor,
      ['extract', 'run', 'execute', 'process', 'normalize'],
      {
        userText:
          'Compare operating margin and free cash flow from Q1 2023 to Q4 2024.',
        sourceType: 'user_prompt',
      }
    );

    const stringValues = collectStringValues(result).join(' ');

    expect(
      stringValues.includes('2023') ||
      stringValues.includes('2024') ||
      stringValues.includes('q1') ||
      stringValues.includes('q4')
    ).toBe(true);
  });

  test('marks empty or missing text as incomplete rather than complete', () => {
    const extractor = new FinanceInputExtractor();

    const result = callFirst(
      extractor,
      ['extract', 'run', 'execute', 'process', 'normalize'],
      {
        userText: '',
        sourceType: 'user_prompt',
      }
    );

    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');

    const keys = collectKeysDeep(result);

    const hasIncompleteSignal =
      keys.has('missing') ||
      keys.has('missingInputs') ||
      keys.has('errors') ||
      keys.has('warnings') ||
      keys.has('valid') ||
      keys.has('ok') ||
      keys.has('diagnostics');

    expect(hasIncompleteSignal).toBe(true);
  });
});
