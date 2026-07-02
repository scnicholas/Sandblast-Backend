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

function collectKeysDeep(value, keys = new Set()) {
  if (!value || typeof value !== 'object') return keys;

  for (const key of Object.keys(value)) {
    keys.add(key);
    collectKeysDeep(value[key], keys);
  }

  return keys;
}

function flattenStrings(value, output = []) {
  if (typeof value === 'string') {
    output.push(value.toLowerCase());
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => flattenStrings(item, output));
    return output;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => flattenStrings(item, output));
  }

  return output;
}

describe('FinanceMissingInputResolver', () => {
  const mod = loadModule([
    '../../../FinanceMissingInputResolver.js',
    '../../../finance/FinanceMissingInputResolver.js',
    '../../../finance/layer03_data_ingestion/FinanceMissingInputResolver.js',
    '../../../Data/finance/layer03_data_ingestion/FinanceMissingInputResolver.js',
    '../../../Data/Domains/finance/layer03_data_ingestion/FinanceMissingInputResolver.js',
    '../../../Domains/finance/layer03_data_ingestion/FinanceMissingInputResolver.js',
  ]);

  const FinanceMissingInputResolver = pickExport(mod, [
    'FinanceMissingInputResolver',
    'MissingInputResolver',
  ]);

  test('constructs without throwing', () => {
    expect(() => new FinanceMissingInputResolver()).not.toThrow();
  });

  test('flags missing company/entity when only metrics are provided', () => {
    const resolver = new FinanceMissingInputResolver();

    const result = callFirst(
      resolver,
      ['resolve', 'resolveMissing', 'run', 'execute', 'process'],
      {
        normalizedInput: {
          text: 'Analyze revenue growth and EBITDA margin.',
          sourceType: 'user_prompt',
        },
        detectedMetrics: ['revenue', 'ebitda_margin'],
        entities: [],
        periods: ['FY2024'],
      }
    );

    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');

    const strings = flattenStrings(result).join(' ');

    expect(
      strings.includes('company') ||
      strings.includes('entity') ||
      strings.includes('ticker') ||
      strings.includes('issuer') ||
      strings.includes('business')
    ).toBe(true);
  });

  test('flags missing period when finance comparison lacks a timeframe', () => {
    const resolver = new FinanceMissingInputResolver();

    const result = callFirst(
      resolver,
      ['resolve', 'resolveMissing', 'run', 'execute', 'process'],
      {
        normalizedInput: {
          text: 'Compare Apple and Microsoft revenue and free cash flow.',
          sourceType: 'user_prompt',
        },
        detectedMetrics: ['revenue', 'free_cash_flow'],
        entities: ['Apple', 'Microsoft'],
        periods: [],
      }
    );

    expect(result).toBeTruthy();

    const strings = flattenStrings(result).join(' ');

    expect(
      strings.includes('period') ||
      strings.includes('timeframe') ||
      strings.includes('date') ||
      strings.includes('fiscal') ||
      strings.includes('year') ||
      strings.includes('quarter')
    ).toBe(true);
  });

  test('does not over-flag complete basic finance input', () => {
    const resolver = new FinanceMissingInputResolver();

    const result = callFirst(
      resolver,
      ['resolve', 'resolveMissing', 'run', 'execute', 'process'],
      {
        normalizedInput: {
          text:
            'Compare Apple and Microsoft revenue and net income for FY2024 using annual filings.',
          sourceType: 'user_prompt',
        },
        detectedMetrics: ['revenue', 'net_income'],
        entities: ['Apple', 'Microsoft'],
        periods: ['FY2024'],
        sourcePreferences: ['annual_filings'],
      }
    );

    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');

    const keys = collectKeysDeep(result);

    const hasMissingState =
      keys.has('missing') ||
      keys.has('missingInputs') ||
      keys.has('requiredInputs') ||
      keys.has('complete') ||
      keys.has('isComplete') ||
      keys.has('valid') ||
      keys.has('ok');

    expect(hasMissingState).toBe(true);

    const strings = flattenStrings(result).join(' ');

    const hasCriticalMissingEntity =
      strings.includes('missing company') ||
      strings.includes('missing entity') ||
      strings.includes('missing ticker');

    expect(hasCriticalMissingEntity).toBe(false);
  });

  test('returns diagnostic structure for empty extracted state', () => {
    const resolver = new FinanceMissingInputResolver();

    const result = callFirst(
      resolver,
      ['resolve', 'resolveMissing', 'run', 'execute', 'process'],
      {}
    );

    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');

    const keys = collectKeysDeep(result);

    const hasDiagnosticSignal =
      keys.has('missing') ||
      keys.has('missingInputs') ||
      keys.has('errors') ||
      keys.has('warnings') ||
      keys.has('diagnostics') ||
      keys.has('valid') ||
      keys.has('ok');

    expect(hasDiagnosticSignal).toBe(true);
  });
});
