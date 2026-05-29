'use strict';

/**
 * Cultural Adaptation Smoke Test
 * ------------------------------------------------------------
 * Jest-owned regression harness.
 *
 * Validates:
 * - Locale context resolves safely.
 * - Cultural adaptation metadata is generated.
 * - Locked terms are detected.
 * - Idiom risk detection works.
 * - Cultural adaptation never takes final authority.
 *
 * Run:
 *   npx jest tests/cultural-adaptation-smoke.test.js --runInBand --verbose
 */

const path = require('path');

function runtimeRequire(relativePath) {
  return require(path.join(process.cwd(), relativePath));
}

const {
  resolveLocaleContext,
  normalizeLanguageCode,
  normalizeLocale,
  getLanguageFamily
} = runtimeRequire('Data/marion/runtime/languagesphere/LocaleContextResolver.js');

const {
  createAdaptationPlan,
  adaptTextMetadataOnly,
  detectLockedTerms,
  detectIdiomRisks,
  attachCulturalAdaptationToEnvelope
} = runtimeRequire('Data/marion/runtime/languagesphere/CulturalAdaptationEngine.js');

const {
  createLanguageSphereEnvelope
} = runtimeRequire('Data/marion/runtime/languagesphere/LanguageSphereResultEnvelope.js');

describe('Cultural adaptation smoke test', () => {
  afterAll(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  test('Locale resolver normalizes supported language codes', () => {
    expect(normalizeLanguageCode('EN')).toBe('en');
    expect(normalizeLanguageCode('es-MX')).toBe('es');
    expect(normalizeLanguageCode('fr_CA')).toBe('fr');
    expect(normalizeLanguageCode('unknown-language', 'en')).toBe('en');
  });

  test('Locale resolver normalizes locale with region', () => {
    const result = normalizeLocale('fr-CA');

    expect(result.language).toBe('fr');
    expect(result.region).toBe('CA');
    expect(result.locale).toBe('fr-CA');
    expect(result.explicitLocale).toBe(true);
  });

  test('Locale context resolves target profile safely', () => {
    const context = resolveLocaleContext({
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      locale: 'fr-CA'
    });

    expect(context.sourceLanguage).toBe('en');
    expect(context.targetLanguage).toBe('fr');
    expect(context.region).toBe('CA');
    expect(context.locale).toBe('fr-CA');
    expect(context.toneProfileKey).toBe('fr-CA');
    expect(context.authority.finalAuthorityOwner).toBe('Marion');
    expect(context.authority.mayBypassMarion).toBe(false);
  });

  test('Language family detection works for supported languages', () => {
    expect(getLanguageFamily('en')).toBe('germanic');
    expect(getLanguageFamily('es')).toBe('romance');
    expect(getLanguageFamily('fr')).toBe('romance');
  });

  test('Cultural adaptation detects locked Marion terms', () => {
    const terms = detectLockedTerms(
      'The final authority gate must protect Marion, Nyx, and StateSpine.'
    );

    expect(terms).toContain('final authority');
    expect(terms).toContain('Marion');
    expect(terms).toContain('Nyx');
    expect(terms).toContain('StateSpine');
  });

  test('Cultural adaptation detects English idiom risks', () => {
    const risks = detectIdiomRisks(
      'We need to hit the ground running and get everyone on the same page.',
      'en'
    );

    expect(risks).toContain('hit the ground running');
    expect(risks).toContain('on the same page');
  });

  test('Cultural adaptation creates Spanish adaptation plan safely', () => {
    const plan = createAdaptationPlan(
      'Hello, we need to protect the final authority gate and move the needle.',
      {
        sourceLanguage: 'en',
        targetLanguage: 'es',
        locale: 'es'
      }
    );

    expect(plan.module).toBe('CulturalAdaptationEngine');
    expect(plan.status).toBe('ok');
    expect(plan.localeContext.targetLanguage).toBe('es');
    expect(plan.adaptationBias).toBe('warmth-and-respect');

    expect(plan.actions).toContain('preserve-user-intent');
    expect(plan.actions).toContain('protect-locked-terminology');
    expect(plan.actions).toContain('avoid-literal-idiom-transfer');

    expect(plan.authority.finalAuthority).toBe(false);
    expect(plan.authority.finalAuthorityOwner).toBe('Marion');
    expect(plan.authority.mayBypassMarion).toBe(false);
  });

  test('Cultural adaptation creates French adaptation plan safely', () => {
    const plan = createAdaptationPlan(
      'Please preserve the MarionBridge technical terminology.',
      {
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        locale: 'fr'
      }
    );

    expect(plan.localeContext.targetLanguage).toBe('fr');
    expect(plan.adaptationBias).toBe('polish-and-nuance');
    expect(plan.actions).toContain('protect-locked-terminology');
    expect(plan.authority.finalAuthorityOwner).toBe('Marion');
  });

  test('Metadata-only adaptation does not rewrite final text', () => {
    const result = adaptTextMetadataOnly(
      'Hello, protect Marion and the final envelope.',
      {
        sourceLanguage: 'en',
        targetLanguage: 'es'
      }
    );

    expect(result.originalText).toBe('Hello, protect Marion and the final envelope.');
    expect(result.adaptedText).toBe('Hello, protect Marion and the final envelope.');
    expect(result.adaptationApplied).toBe(false);
    expect(result.reason).toBe('metadata-only-phase');
    expect(result.authority.finalAuthorityOwner).toBe('Marion');
  });

  test('Cultural adaptation can attach metadata to LanguageSphere envelope', () => {
    const envelope = createLanguageSphereEnvelope({
      sourceText: 'Hello, protect the final authority gate.',
      normalizedText: 'Hello, protect the final authority gate.',
      translatedText: 'Hello, protect the final authority gate.',
      sourceLanguage: 'en',
      targetLanguage: 'fr'
    });

    const updated = attachCulturalAdaptationToEnvelope(envelope, {
      locale: 'fr'
    });

    expect(updated.module).toBe('LanguageSphere');
    expect(updated.culturalAdaptation.module).toBe('CulturalAdaptationEngine');
    expect(updated.culturalAdaptation.localeContext.targetLanguage).toBe('fr');
    expect(updated.culturalAdaptation.authority.finalAuthorityOwner).toBe('Marion');
  });
});
