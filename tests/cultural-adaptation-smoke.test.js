'use strict';

/**
 * Cultural Adaptation Smoke Test
 * ------------------------------------------------------------
 * Validates:
 * - Locale context resolves safely.
 * - Cultural adaptation metadata is generated.
 * - Locked terms are detected.
 * - Idiom risk detection works.
 * - Cultural adaptation never takes final authority.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveLocaleContext,
  normalizeLanguageCode,
  normalizeLocale,
  getLanguageFamily
} = require('../Data/marion/runtime/languagesphere/LocaleContextResolver');

const {
  createAdaptationPlan,
  adaptTextMetadataOnly,
  detectLockedTerms,
  detectIdiomRisks
} = require('../Data/marion/runtime/languagesphere/CulturalAdaptationEngine');

const {
  createLanguageSphereEnvelope
} = require('../Data/marion/runtime/languagesphere/LanguageSphereResultEnvelope');

const {
  attachCulturalAdaptationToEnvelope
} = require('../Data/marion/runtime/languagesphere/CulturalAdaptationEngine');

test('Locale resolver normalizes supported language codes', () => {
  assert.equal(normalizeLanguageCode('EN'), 'en');
  assert.equal(normalizeLanguageCode('es-MX'), 'es');
  assert.equal(normalizeLanguageCode('fr_CA'), 'fr');
  assert.equal(normalizeLanguageCode('unknown-language', 'en'), 'en');
});

test('Locale resolver normalizes locale with region', () => {
  const result = normalizeLocale('fr-CA');

  assert.equal(result.language, 'fr');
  assert.equal(result.region, 'CA');
  assert.equal(result.locale, 'fr-CA');
  assert.equal(result.explicitLocale, true);
});

test('Locale context resolves target profile safely', () => {
  const context = resolveLocaleContext({
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    locale: 'fr-CA'
  });

  assert.equal(context.sourceLanguage, 'en');
  assert.equal(context.targetLanguage, 'fr');
  assert.equal(context.region, 'CA');
  assert.equal(context.locale, 'fr-CA');
  assert.equal(context.toneProfileKey, 'fr-CA');
  assert.equal(context.authority.finalAuthorityOwner, 'Marion');
  assert.equal(context.authority.mayBypassMarion, false);
});

test('Language family detection works for supported languages', () => {
  assert.equal(getLanguageFamily('en'), 'germanic');
  assert.equal(getLanguageFamily('es'), 'romance');
  assert.equal(getLanguageFamily('fr'), 'romance');
});

test('Cultural adaptation detects locked Marion terms', () => {
  const terms = detectLockedTerms(
    'The final authority gate must protect Marion, Nyx, and StateSpine.'
  );

  assert.ok(terms.includes('final authority'));
  assert.ok(terms.includes('Marion'));
  assert.ok(terms.includes('Nyx'));
  assert.ok(terms.includes('StateSpine'));
});

test('Cultural adaptation detects English idiom risks', () => {
  const risks = detectIdiomRisks(
    'We need to hit the ground running and get everyone on the same page.',
    'en'
  );

  assert.ok(risks.includes('hit the ground running'));
  assert.ok(risks.includes('on the same page'));
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

  assert.equal(plan.module, 'CulturalAdaptationEngine');
  assert.equal(plan.status, 'ok');
  assert.equal(plan.localeContext.targetLanguage, 'es');
  assert.equal(plan.adaptationBias, 'warmth-and-respect');

  assert.ok(plan.actions.includes('preserve-user-intent'));
  assert.ok(plan.actions.includes('protect-locked-terminology'));
  assert.ok(plan.actions.includes('avoid-literal-idiom-transfer'));

  assert.equal(plan.authority.finalAuthority, false);
  assert.equal(plan.authority.finalAuthorityOwner, 'Marion');
  assert.equal(plan.authority.mayBypassMarion, false);
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

  assert.equal(plan.localeContext.targetLanguage, 'fr');
  assert.equal(plan.adaptationBias, 'polish-and-nuance');
  assert.ok(plan.actions.includes('protect-locked-terminology'));
  assert.equal(plan.authority.finalAuthorityOwner, 'Marion');
});

test('Metadata-only adaptation does not rewrite final text', () => {
  const result = adaptTextMetadataOnly(
    'Hello, protect Marion and the final envelope.',
    {
      sourceLanguage: 'en',
      targetLanguage: 'es'
    }
  );

  assert.equal(result.originalText, 'Hello, protect Marion and the final envelope.');
  assert.equal(result.adaptedText, 'Hello, protect Marion and the final envelope.');
  assert.equal(result.adaptationApplied, false);
  assert.equal(result.reason, 'metadata-only-phase');
  assert.equal(result.authority.finalAuthorityOwner, 'Marion');
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

  assert.equal(updated.module, 'LanguageSphere');
  assert.equal(updated.culturalAdaptation.module, 'CulturalAdaptationEngine');
  assert.equal(updated.culturalAdaptation.localeContext.targetLanguage, 'fr');
  assert.equal(updated.culturalAdaptation.authority.finalAuthorityOwner, 'Marion');
});
