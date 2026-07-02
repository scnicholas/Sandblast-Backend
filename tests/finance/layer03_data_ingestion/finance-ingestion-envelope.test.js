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

function callEnvelopeFactory(EnvelopeClass, payload) {
  if (typeof EnvelopeClass.create === 'function') {
    return EnvelopeClass.create(payload);
  }

  if (typeof EnvelopeClass.build === 'function') {
    return EnvelopeClass.build(payload);
  }

  const instance = new EnvelopeClass();

  for (const methodName of ['create', 'build', 'wrap', 'compose', 'toEnvelope']) {
    if (typeof instance[methodName] === 'function') {
      return instance[methodName](payload);
    }
  }

  return new EnvelopeClass(payload);
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

describe('FinanceIngestionEnvelope', () => {
  const mod = loadModule([
    '../../../FinanceIngestionEnvelope.js',
    '../../../finance/FinanceIngestionEnvelope.js',
    '../../../finance/layer03_data_ingestion/FinanceIngestionEnvelope.js',
    '../../../Data/finance/layer03_data_ingestion/FinanceIngestionEnvelope.js',
    '../../../Data/Domains/finance/layer03_data_ingestion/FinanceIngestionEnvelope.js',
    '../../../Domains/finance/layer03_data_ingestion/FinanceIngestionEnvelope.js',
  ]);

  const FinanceIngestionEnvelope = pickExport(mod, [
    'FinanceIngestionEnvelope',
    'IngestionEnvelope',
  ]);

  test('constructs or creates an envelope without throwing', () => {
    expect(() => {
      callEnvelopeFactory(FinanceIngestionEnvelope, {
        normalizedInput: {
          text: 'Analyze Apple revenue for FY2024.',
          sourceType: 'user_prompt',
        },
      });
    }).not.toThrow();
  });

  test('creates a stable envelope with traceable metadata', () => {
    const envelope = callEnvelopeFactory(FinanceIngestionEnvelope, {
      requestId: 'test-request-001',
      normalizedInput: {
        text: 'Analyze Apple revenue for FY2024.',
        sourceType: 'user_prompt',
      },
      detectedMetrics: ['revenue'],
      entities: ['Apple'],
      periods: ['FY2024'],
      missingInputs: [],
      assumptions: [],
      diagnostics: [],
    });

    expect(envelope).toBeTruthy();
    expect(typeof envelope).toBe('object');

    const keys = collectKeysDeep(envelope);

    const hasTraceMetadata =
      keys.has('requestId') ||
      keys.has('traceId') ||
      keys.has('id') ||
      keys.has('createdAt') ||
      keys.has('schemaVersion') ||
      keys.has('version');

    expect(hasTraceMetadata).toBe(true);
  });

  test('preserves normalized input, metrics, entities, and periods', () => {
    const envelope = callEnvelopeFactory(FinanceIngestionEnvelope, {
      requestId: 'test-request-002',
      normalizedInput: {
        text:
          'Compare Apple and Microsoft revenue, net income, and FCF from FY2022 to FY2024.',
        sourceType: 'user_prompt',
      },
      detectedMetrics: ['revenue', 'net_income', 'free_cash_flow'],
      entities: ['Apple', 'Microsoft'],
      periods: ['FY2022', 'FY2023', 'FY2024'],
      missingInputs: [],
      assumptions: [],
      diagnostics: [],
    });

    const strings = flattenStrings(envelope).join(' ');

    expect(strings).toContain('apple');
    expect(strings).toContain('microsoft');

    expect(
      strings.includes('revenue') ||
      strings.includes('sales')
    ).toBe(true);

    expect(
      strings.includes('net_income') ||
      strings.includes('net income') ||
      strings.includes('earnings')
    ).toBe(true);

    expect(
      strings.includes('fy2024') ||
      strings.includes('2024')
    ).toBe(true);
  });

  test('preserves missing input and assumption state', () => {
    const envelope = callEnvelopeFactory(FinanceIngestionEnvelope, {
      requestId: 'test-request-003',
      normalizedInput: {
        text: 'Analyze profitability.',
        sourceType: 'user_prompt',
      },
      detectedMetrics: ['profitability'],
      entities: [],
      periods: [],
      missingInputs: ['company', 'period'],
      assumptions: [
        {
          key: 'source_priority',
          value: 'prefer_filings_when_available',
        },
      ],
      diagnostics: [
        {
          level: 'warning',
          code: 'MISSING_ENTITY_AND_PERIOD',
        },
      ],
    });

    const strings = flattenStrings(envelope).join(' ');

    expect(
      strings.includes('company') ||
      strings.includes('entity') ||
      strings.includes('ticker')
    ).toBe(true);

    expect(
      strings.includes('period') ||
      strings.includes('timeframe') ||
      strings.includes('year')
    ).toBe(true);

    expect(
      strings.includes('assumption') ||
      strings.includes('source_priority') ||
      strings.includes('prefer_filings')
    ).toBe(true);
  });

  test('envelope output is JSON-serializable', () => {
    const envelope = callEnvelopeFactory(FinanceIngestionEnvelope, {
      requestId: 'test-request-004',
      normalizedInput: {
        text: 'Analyze cash flow for Shopify FY2024.',
        sourceType: 'user_prompt',
      },
      detectedMetrics: ['cash_flow'],
      entities: ['Shopify'],
      periods: ['FY2024'],
      missingInputs: [],
      assumptions: [],
      diagnostics: [],
    });

    expect(() => JSON.stringify(envelope)).not.toThrow();

    const parsed = JSON.parse(JSON.stringify(envelope));
    expect(parsed).toBeTruthy();
    expect(typeof parsed).toBe('object');
  });
});
