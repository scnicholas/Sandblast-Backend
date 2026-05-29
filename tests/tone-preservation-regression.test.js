'use strict';

/**
 * Tone Preservation Regression Test
 * ------------------------------------------------------------
 * Jest-owned regression harness.
 *
 * Validates:
 * - Tone signals are detected.
 * - Tone classification remains stable.
 * - Locale tone profiles are applied.
 * - Tone metadata never claims final authority.
 *
 * Run:
 *   npx jest tests/tone-preservation-regression.test.js --runInBand --verbose
 */

const path = require('path');

function runtimeRequire(relativePath) {
  return require(path.join(process.cwd(), relativePath));
}

const {
  detectToneSignals,
  classifyTone,
  getToneProfile,
  recommendTonePreservation,
  attachToneMetadataToEnvelope
} = runtimeRequire('Data/marion/runtime/languagesphere/TonePreservationEngine.js');

const {
  resolveLocaleContext
} = runtimeRequire('Data/marion/runtime/languagesphere/LocaleContextResolver.js');

const {
  createLanguageSphereEnvelope
} = runtimeRequire('Data/marion/runtime/languagesphere/LanguageSphereResultEnvelope.js');

describe('Tone preservation regression', () => {
  afterAll(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  test('Tone engine detects urgency', () => {
    const signals = detectToneSignals('This is urgent!! We need this fixed right now.');

    expect(signals.urgency).toBe(true);
  });

  test('Tone engine detects frustration', () => {
    const signals = detectToneSignals('The API is broken and the regression test failed.');

    expect(signals.frustration).toBe(true);
    expect(signals.technical).toBe(true);
  });

  test('Tone engine detects gratitude', () => {
    const signals = detectToneSignals('Thank you, I appreciate the help.');

    expect(signals.gratitude).toBe(true);
  });

  test('Tone engine classifies urgent-frustrated tone', () => {
    const toneResult = classifyTone('This is urgent!! The bridge failed and it is not working.');

    expect(toneResult.primaryTone).toBe('urgent-frustrated');
    expect(toneResult.signals.urgency).toBe(true);
    expect(toneResult.signals.frustration).toBe(true);
    expect(toneResult.confidence).toBeGreaterThanOrEqual(0.7);
  });

  test('Tone engine classifies technical tone', () => {
    const toneResult = classifyTone('The runtime provider returned invalid JSON in the payload.');

    expect(toneResult.primaryTone).toBe('technical');
    expect(toneResult.signals.technical).toBe(true);
  });

  test('Tone profile resolves Spanish profile', () => {
    const locale = resolveLocaleContext({
      sourceLanguage: 'en',
      targetLanguage: 'es',
      locale: 'es'
    });

    const profile = getToneProfile(locale);

    expect(profile.language).toBe('es');
    expect(profile.defaultFormality).toBe('neutral-warm');
    expect(profile.warmth).toBe('high');
  });

  test('Tone profile resolves Canadian French profile', () => {
    const locale = resolveLocaleContext({
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      locale: 'fr-CA'
    });

    const profile = getToneProfile(locale);

    expect(profile.language).toBe('fr');
    expect(profile.region).toBe('CA');
    expect(profile.label).toBe('Canadian French');
  });

  test('Tone preservation recommends Spanish warmth and technical precision', () => {
    const result = recommendTonePreservation(
      'The API bridge failed, but we need to preserve Marion and StateSpine.',
      {
        sourceLanguage: 'en',
        targetLanguage: 'es',
        locale: 'es'
      }
    );

    expect(result.module).toBe('TonePreservationEngine');
    expect(result.status).toBe('ok');
    expect(result.localeContext.targetLanguage).toBe('es');

    expect(result.preserve).toContain('technical specificity');
    expect(result.recommendations).toContain('preserve technical precision and locked terminology');
    expect(result.recommendations).toContain('preserve warmth and respectful phrasing');

    expect(result.authority.finalAuthority).toBe(false);
    expect(result.authority.finalAuthorityOwner).toBe('Marion');
    expect(result.authority.mayBypassMarion).toBe(false);
  });

  test('Tone preservation recommends French polished phrasing', () => {
    const result = recommendTonePreservation(
      'Please keep this business response professional and precise.',
      {
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        locale: 'fr'
      }
    );

    expect(result.localeContext.targetLanguage).toBe('fr');
    expect(result.recommendations).toContain('preserve polished phrasing and register');
    expect(result.authority.finalAuthorityOwner).toBe('Marion');
  });

  test('Tone preservation attaches safely to LanguageSphere envelope', () => {
    const envelope = createLanguageSphereEnvelope({
      sourceText: 'This is urgent!! The API bridge failed.',
      normalizedText: 'This is urgent!! The API bridge failed.',
      translatedText: 'This is urgent!! The API bridge failed.',
      sourceLanguage: 'en',
      targetLanguage: 'fr'
    });

    const updated = attachToneMetadataToEnvelope(envelope, {
      locale: 'fr'
    });

    expect(updated.module).toBe('LanguageSphere');
    expect(updated.tonePreservation.module).toBe('TonePreservationEngine');
    expect(updated.tonePreservation.tone.primaryTone).toBe('urgent-frustrated');
    expect(updated.tonePreservation.authority.finalAuthority).toBe(false);
    expect(updated.tonePreservation.authority.finalAuthorityOwner).toBe('Marion');
  });
});
