'use strict';

/**
 * LanguageSphere Runtime Smoke Test
 * ------------------------------------------------------------
 * Jest-owned regression/smoke coverage for the Phase 1 LanguageSphere spine.
 *
 * Validates:
 * - Runtime modules load from the backend project root.
 * - Core exported functions exist before behavior assertions run.
 * - Text normalization remains stable.
 * - Runtime envelopes remain Marion-safe.
 * - English passthrough remains non-translating.
 * - Spanish/French detection remains conservative but usable.
 * - Translation requirement logic remains stable.
 * - Injected providers are honored when translation is required.
 * - Empty input fails safely without granting LanguageSphere final authority.
 *
 * Why this file is Jest-owned:
 * The previous version used node:test. Jest can execute the file, but it does
 * not count node:test registrations as Jest tests, which can trigger:
 * "Your test suite must contain at least one test."
 */

const path = require('path');

function runtimeRequire(relativePath) {
  return require(path.join(process.cwd(), relativePath));
}

function loadRuntime() {
  return runtimeRequire('Data/marion/runtime/languagesphere/LanguageSphereRuntime.js');
}

function loadEnvelopeContract() {
  return runtimeRequire('Data/marion/runtime/languagesphere/LanguageSphereResultEnvelope.js');
}

function expectFunction(value, name) {
  expect(typeof value).toBe('function');
  return value;
}

function expectMarionSafeAuthority(envelope) {
  expect(envelope).toBeTruthy();
  expect(envelope.authority).toBeTruthy();
  expect(envelope.authority.finalAuthority).toBe(false);
  expect(envelope.authority.finalAuthorityOwner).toBe('Marion');
  expect(envelope.authority.mayBypassMarion).toBe(false);
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest.clearAllTimers();
});

describe('LanguageSphere runtime smoke test', () => {
  test('loads required runtime exports from the Marion runtime folder', () => {
    const runtime = loadRuntime();
    const envelopeContract = loadEnvelopeContract();

    expectFunction(runtime.runLanguageSphere, 'runLanguageSphere');
    expectFunction(runtime.normalizeText, 'normalizeText');
    expectFunction(runtime.localDetectLanguage, 'localDetectLanguage');
    expectFunction(runtime.shouldTranslate, 'shouldTranslate');
    expectFunction(envelopeContract.isLanguageSphereEnvelope, 'isLanguageSphereEnvelope');
  });

  test('normalizes smart quotes, repeated whitespace, and line breaks', () => {
    const { normalizeText } = loadRuntime();

    const result = normalizeText('  “Hello”   Mac,\n\nthis   is   clean.  ');

    expect(result).toBe('"Hello" Mac, this is clean.');
  });

  test('returns a Marion-safe envelope for English passthrough input', async () => {
    const { runLanguageSphere } = loadRuntime();
    const { isLanguageSphereEnvelope } = loadEnvelopeContract();

    const envelope = await runLanguageSphere({
      text: 'Hello Marion, can you help me test LanguageSphere?',
      targetLanguage: 'en'
    });

    expect(isLanguageSphereEnvelope(envelope)).toBe(true);
    expect(envelope.module).toBe('LanguageSphere');
    expectMarionSafeAuthority(envelope);

    expect(envelope.language.sourceLanguage).toBe('en');
    expect(envelope.language.targetLanguage).toBe('en');
    expect(envelope.language.translationRequired).toBe(false);
    expect(envelope.language.translationApplied).toBe(false);

    expect(envelope.text.marionInputText).toBe(
      'Hello Marion, can you help me test LanguageSphere?'
    );
  });

  test('detects Spanish marker input conservatively', () => {
    const { localDetectLanguage } = loadRuntime();

    const detection = localDetectLanguage('Hola, necesito una traducción para este idioma.');

    expect(detection).toBeTruthy();
    expect(detection.language).toBe('es');
    expect(detection.confidence).toBeGreaterThanOrEqual(0.55);
  });

  test('detects French marker input conservatively', () => {
    const { localDetectLanguage } = loadRuntime();

    const detection = localDetectLanguage('Bonjour, merci pour la traduction en français.');

    expect(detection).toBeTruthy();
    expect(detection.language).toBe('fr');
    expect(detection.confidence).toBeGreaterThanOrEqual(0.55);
  });

  test('determines translation requirement correctly', () => {
    const { shouldTranslate } = loadRuntime();

    expect(shouldTranslate('en', 'en')).toBe(false);
    expect(shouldTranslate('es', 'en')).toBe(true);
    expect(shouldTranslate('fr', 'en')).toBe(true);
    expect(shouldTranslate('unknown', 'en')).toBe(false);
  });

  test('uses injected provider when translation is required', async () => {
    const { runLanguageSphere } = loadRuntime();
    const { isLanguageSphereEnvelope } = loadEnvelopeContract();

    const fakeProvider = {
      async translate(text, context) {
        expect(context.sourceLanguage).toBe('es');
        expect(context.targetLanguage).toBe('en');

        return {
          text: `TRANSLATED: ${text}`,
          providerName: 'FakeProvider',
          providerMode: 'test',
          applied: true
        };
      }
    };

    const envelope = await runLanguageSphere(
      {
        text: 'Hola, necesito una traducción para este idioma.',
        targetLanguage: 'en'
      },
      {
        provider: fakeProvider
      }
    );

    expect(isLanguageSphereEnvelope(envelope)).toBe(true);
    expectMarionSafeAuthority(envelope);

    expect(envelope.language.sourceLanguage).toBe('es');
    expect(envelope.language.targetLanguage).toBe('en');
    expect(envelope.language.translationRequired).toBe(true);
    expect(envelope.language.translationApplied).toBe(true);

    expect(envelope.provider.name).toBe('FakeProvider');
    expect(envelope.provider.mode).toBe('test');
    expect(envelope.text.translatedText).toMatch(/^TRANSLATED:/);
  });

  test('fails safely on empty input without granting final authority', async () => {
    const { runLanguageSphere } = loadRuntime();
    const { isLanguageSphereEnvelope } = loadEnvelopeContract();

    const envelope = await runLanguageSphere({
      text: '      ',
      targetLanguage: 'en'
    });

    expect(isLanguageSphereEnvelope(envelope)).toBe(true);
    expect(envelope.status).toBe('empty');
    expect(envelope.language.fallbackApplied).toBe(true);
    expect(envelope.text.marionInputText).toBe('');
    expectMarionSafeAuthority(envelope);
  });
});
