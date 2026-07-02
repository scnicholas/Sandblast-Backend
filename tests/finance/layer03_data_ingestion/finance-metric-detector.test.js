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

describe('FinanceMetricDetector', () => {
  const mod = loadModule([
    '../../../FinanceMetricDetector.js',
    '../../../finance/FinanceMetricDetector.js',
    '../../../finance/layer03_data_ingestion/FinanceMetricDetector.js',
    '../../../Data/finance/layer03_data_ingestion/FinanceMetricDetector.js',
    '../../../Data/Domains/finance/layer03_data_ingestion/FinanceMetricDetector.js',
    '../../../Domains/finance/layer03_data_ingestion/FinanceMetricDetector.js',
  ]);

  const FinanceMetricDetector = pickExport(mod, [
    'FinanceMetricDetector',
    'MetricDetector',
  ]);

  test('constructs without throwing', () => {
    expect(() => new FinanceMetricDetector()).not.toThrow();
  });

  test('detects core income statement metrics', () => {
    const detector = new FinanceMetricDetector();

    const result = callFirst(
      detector,
      ['detect', 'detectMetrics', 'run', 'execute', 'process'],
      'Analyze revenue, gross profit, operating income, EBITDA, net income, and EPS.'
    );

    expect(result).toBeTruthy();

    const strings = flattenStrings(result).join(' ');

    expect(strings).toContain('revenue');
    expect(
      strings.includes('gross') ||
      strings.includes('gross_profit') ||
      strings.includes('gross profit')
    ).toBe(true);

    expect(
      strings.includes('net income') ||
      strings.includes('net_income') ||
      strings.includes('earnings')
    ).toBe(true);
  });

  test('detects cash-flow and balance-sheet metrics', () => {
    const detector = new FinanceMetricDetector();

    const result = callFirst(
      detector,
      ['detect', 'detectMetrics', 'run', 'execute', 'process'],
      'Review free cash flow, operating cash flow, capex, debt, cash, assets, liabilities, and equity.'
    );

    expect(result).toBeTruthy();

    const strings = flattenStrings(result).join(' ');

    expect(
      strings.includes('free cash flow') ||
      strings.includes('free_cash_flow') ||
      strings.includes('fcf')
    ).toBe(true);

    expect(
      strings.includes('debt') ||
      strings.includes('liabilities') ||
      strings.includes('balance')
    ).toBe(true);
  });

  test('normalizes common metric aliases', () => {
    const detector = new FinanceMetricDetector();

    const result = callFirst(
      detector,
      ['detect', 'detectMetrics', 'run', 'execute', 'process'],
      'Look at sales, earnings, FCF, op margin, and PE ratio.'
    );

    expect(result).toBeTruthy();

    const strings = flattenStrings(result).join(' ');

    expect(
      strings.includes('sales') ||
      strings.includes('revenue')
    ).toBe(true);

    expect(
      strings.includes('earnings') ||
      strings.includes('net income') ||
      strings.includes('net_income')
    ).toBe(true);

    expect(
      strings.includes('fcf') ||
      strings.includes('free cash flow') ||
      strings.includes('free_cash_flow')
    ).toBe(true);
  });

  test('returns low-confidence or empty metric state for non-finance text', () => {
    const detector = new FinanceMetricDetector();

    const result = callFirst(
      detector,
      ['detect', 'detectMetrics', 'run', 'execute', 'process'],
      'Write a short poem about clouds and morning coffee.'
    );

    expect(result).toBeTruthy();

    const strings = flattenStrings(result).join(' ');

    const incorrectlyDetectedStrongFinanceMetric =
      strings.includes('revenue') ||
      strings.includes('ebitda') ||
      strings.includes('free cash flow') ||
      strings.includes('net income');

    expect(incorrectlyDetectedStrongFinanceMetric).toBe(false);
  });
});
